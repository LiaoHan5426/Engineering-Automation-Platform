package com.lh.eap.ai;

import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import com.openai.core.Timeout;
import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Interceptor;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.AsyncTimeout;
import okio.Buffer;
import okio.BufferedSource;
import okio.ForwardingSource;
import okio.Okio;
import org.springframework.ai.openai.http.okhttp.SpringAiOpenAiHttpClient;

/** One finite deadline for the existing Responses HTTP path, including streaming body reads. */
final class ResponsesDeadlineInterceptor implements Interceptor {
    private final long budgetNanos;

    ResponsesDeadlineInterceptor(Duration budget) {
        if (budget == null || budget.isZero() || budget.isNegative()) throw new IllegalArgumentException("Positive request budget required");
        budgetNanos = budget.toNanos();
    }

    static OpenAIClient client(String secret, String baseUrl, Duration budget, Duration connect, Duration read, Duration write) {
        var deadline = new ResponsesDeadlineInterceptor(budget);
        for (var phase : new Duration[] {connect, read, write}) {
            if (phase == null || phase.isZero() || phase.isNegative()) throw new IllegalArgumentException("Positive phase budget required");
        }
        // ZERO disables only the indistinguishable native request timer. The guard is mandatory here.
        var timeout = Timeout.builder().request(Duration.ZERO).connect(connect).read(read).write(write).build();
        var transport = SpringAiOpenAiHttpClient.builder().timeout(timeout).interceptor(deadline).build();
        return new OpenAIClientImpl(ClientOptions.builder().apiKey(secret).baseUrl(baseUrl)
                .httpClient(transport).timeout(timeout).maxRetries(0).build());
    }

    @Override public Response intercept(Chain chain) throws IOException {
        var deadline = new Deadline(chain.call(), budgetNanos);
        deadline.enter();
        try {
            var response = chain.proceed(chain.request());
            var body = response.body();
            if (body == null) {
                if (deadline.finish()) throw deadlineFailure(null);
                return response;
            }
            var source = Okio.buffer(new ForwardingSource(body.source()) {
                @Override public long read(Buffer sink, long byteCount) throws IOException {
                    final long count;
                    try {
                        count = super.read(sink, byteCount);
                    } catch (IOException failure) {
                        if (deadline.finish()) throw deadlineFailure(failure);
                        throw failure;
                    } catch (RuntimeException failure) {
                        if (deadline.finish()) throw new CompletionException(deadlineFailure(failure));
                        throw failure;
                    }
                    if (count == -1 ? deadline.finish() : deadline.expired()) throw deadlineFailure(null);
                    return count;
                }
                @Override public void close() throws IOException {
                    // Stop before closing: explicit caller cleanup must not acquire a later deadline.
                    boolean expired = deadline.finish();
                    try {
                        super.close();
                    } catch (IOException | RuntimeException failure) {
                        if (expired) throw new CompletionException(deadlineFailure(failure));
                        throw failure;
                    }
                    // ResponseBody.close swallows checked IOExceptions, so keep the typed cause in a runtime wrapper.
                    if (expired) throw new CompletionException(deadlineFailure(null));
                }
            });
            return response.newBuilder().body(new ResponseBody() {
                @Override public okhttp3.MediaType contentType() { return body.contentType(); }
                @Override public long contentLength() { return body.contentLength(); }
                @Override public BufferedSource source() { return source; }
            }).build();
        } catch (IOException failure) {
            if (deadline.finish()) throw deadlineFailure(failure);
            throw failure;
        } catch (RuntimeException | Error failure) {
            if (deadline.finish()) throw new CompletionException(deadlineFailure(failure));
            throw failure;
        }
    }

    private static HttpTimeoutException deadlineFailure(Throwable cause) {
        var failure = new HttpTimeoutException("Responses request deadline exceeded");
        if (cause != null) failure.initCause(cause);
        return failure;
    }

    private static final class Deadline extends AsyncTimeout {
        private final Call call;
        private boolean stopped;
        private boolean expired;
        Deadline(Call call, long budgetNanos) {
            this.call = call;
            timeout(budgetNanos, TimeUnit.NANOSECONDS);
        }
        @Override protected void timedOut() {
            synchronized (this) {
                if (stopped) return;
                expired = true;
            }
            call.cancel();
        }
        synchronized boolean expired() { return expired; }
        synchronized boolean finish() {
            if (!stopped) {
                stopped = true;
                // exit also detects expiry dequeued by the watchdog before its asynchronous callback.
                expired |= exit();
            }
            return expired;
        }
    }
}
