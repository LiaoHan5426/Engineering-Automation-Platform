package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import com.openai.core.Timeout;
import com.openai.errors.OpenAIIoException;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.http.okhttp.SpringAiOpenAiHttpClient;

/** Offline characterization of the exact SDK/OkHttp deadline path; no provider access. */
class ResponsesDeadlineDiagnosticTest {
    private static final Duration DEADLINE = Duration.ofMillis(750);
    private static final String DELTA = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"local\",\"item_id\":\"msg_1\",\"output_index\":0,\"content_index\":0,\"sequence_number\":1}\n\n";

    @Test
    void finiteRequestDeadlineAbortsAnOpenSseBodyAndExposesTheCurrentClassificationGap() throws Exception {
        var headersSent = new CountDownLatch(1);
        var releaseBody = new CountDownLatch(1);
        var handlerExited = new CountDownLatch(1);
        var calls = new AtomicInteger();
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        server.createContext("/v1/responses", exchange -> {
            calls.incrementAndGet();
            try (exchange) {
                exchange.getRequestBody().readAllBytes();
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, 0);
                try (var out = exchange.getResponseBody()) {
                    out.write(DELTA.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    headersSent.countDown();
                    // No completed event or EOF until the test explicitly releases the body.
                    releaseBody.await(5, TimeUnit.SECONDS);
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } catch (IOException expectedOnClientClose) {
                // The deadline may close the peer before the local handler closes its body.
            } finally {
                handlerExited.countDown();
            }
        });
        server.start();
        var timeout = Timeout.builder().request(DEADLINE)
                .connect(Duration.ofSeconds(2)).read(Duration.ofSeconds(5))
                .write(Duration.ofSeconds(2)).build();
        var transport = SpringAiOpenAiHttpClient.builder().timeout(timeout).build();
        var client = new OpenAIClientImpl(ClientOptions.builder()
                .apiKey("local-diagnostic-key")
                .baseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1")
                .httpClient(transport).timeout(timeout).maxRetries(0).build());
        try {
            var model = new OpenAiResponsesChatModel(client, "local-diagnostic-model");
            RuntimeException failure = null;
            long started = System.nanoTime();
            try {
                model.call(new Prompt("local deadline diagnostic"));
            } catch (RuntimeException observed) {
                failure = observed;
            }
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            var causes = causes(failure);
            // Intentionally never print exception messages, URLs, headers, prompts or bodies.
            System.out.println("ResponsesDeadlineDiagnostic classes="
                    + causes.stream().map(cause -> cause.getClass().getName()).toList()
                    + " elapsedMillis=" + elapsedMillis);
            assertNotNull(failure, "The incomplete SSE body must fail rather than succeed");
            assertEquals(0L, headersSent.getCount(), "The server must flush a real SSE response before the deadline");
            assertEquals(1, calls.get(), "The SDK must not retry");
            assertEquals(1L, releaseBody.getCount(), "The server must still be holding the response body open");
            assertTrue(causes.stream().anyMatch(OpenAIIoException.class::isInstance));
            assertTrue(causes.stream().anyMatch(cause -> cause.getClass() == InterruptedIOException.class),
                    "OkHttp call deadline must expose InterruptedIOException itself");
            assertFalse(causes.stream().anyMatch(SocketTimeoutException.class::isInstance),
                    "The longer read timeout must not masquerade as the request deadline");
            assertFalse(Thread.currentThread().isInterrupted(), "This case did not interrupt the calling thread");
            assertEquals("AI_PROVIDER_ERROR", AiErrors.classify(failure),
                    "Characterize the current missing deadline classification, not a provider diagnosis");
            assertTrue(elapsedMillis < Duration.ofSeconds(5).toMillis(), "The short deadline must bound the call");
        } finally {
            releaseBody.countDown();
            client.close();
            server.stop(0);
            executor.shutdownNow();
            assertTrue(handlerExited.await(2, TimeUnit.SECONDS), "The local SSE handler must be released");
            assertTrue(executor.awaitTermination(2, TimeUnit.SECONDS), "The local handler executor must terminate");
        }
    }

    @Test
    void explicitCancellationAndGenericIoRemainDistinctFromDeadlineEvidence() {
        assertEquals("AI_CANCELLED", AiErrors.classify(new CancellationException()));
        assertEquals("AI_CANCELLED", AiErrors.classify(new OpenAIIoException("fixture", new InterruptedException())));
        assertEquals("AI_PROVIDER_ERROR", AiErrors.classify(new OpenAIIoException("fixture", new IOException())));
    }

    @Test
    void activeSseStillHitsTheWholeRequestDeadline() throws Exception {
        try (var local = new LocalSse(true, false)) {
            var client = local.client(Duration.ofMillis(1500), Duration.ofSeconds(4));
            try (AutoCloseable closeClient = client::close) {
            var received = new AtomicInteger();
            var lastDelta = new java.util.concurrent.atomic.AtomicLong();
            var failure = assertThrows(RuntimeException.class, () -> new OpenAiResponsesChatModel(client, "local")
                    .stream(new Prompt("local")).doOnNext(ignored -> {
                        received.incrementAndGet(); lastDelta.set(System.nanoTime());
                    }).blockLast(Duration.ofSeconds(8)));
            assertTrue(received.get() >= 3, "Real SSE activity must precede the whole-call deadline");
            assertTrue(System.nanoTime() - lastDelta.get() < Duration.ofSeconds(4).toNanos());
            assertTrue(causes(failure).stream().anyMatch(java.net.http.HttpTimeoutException.class::isInstance));
            assertFalse(causes(failure).stream().anyMatch(SocketTimeoutException.class::isInstance));
            assertEquals("AI_TIMED_OUT", AiErrors.classify(failure));
            assertEquals(1, local.calls.get());
            assertTrue(local.exited.await(2, TimeUnit.SECONDS), "Deadline must close the active transport");
            }
        }
    }

    @Test
    void idleReadTimeoutRemainsDistinctFromTheWholeRequestDeadline() throws Exception {
        try (var local = new LocalSse(false, false)) {
            var client = local.client(Duration.ofSeconds(4), Duration.ofMillis(250));
            try (AutoCloseable closeClient = client::close) {
            var failure = assertThrows(RuntimeException.class,
                    () -> new OpenAiResponsesChatModel(client, "local").call(new Prompt("local")));
            assertTrue(causes(failure).stream().anyMatch(SocketTimeoutException.class::isInstance));
            assertFalse(causes(failure).stream().anyMatch(java.net.http.HttpTimeoutException.class::isInstance));
            assertEquals("AI_TIMED_OUT", AiErrors.classify(failure));
            }
        }
    }

    @Test
    void completedSseAndSubscriberCancellationCloseBeforeTheDeadline() throws Exception {
        try (var local = new LocalSse(false, true)) {
            var client = local.client(Duration.ofSeconds(2), Duration.ofSeconds(4));
            try (AutoCloseable closeClient = client::close) {
            assertEquals("local", new OpenAiResponsesChatModel(client, "local").call(new Prompt("local"))
                    .getResult().getOutput().getText());
            }
        }
        try (var local = new LocalSse(true, false)) {
            var client = local.client(Duration.ofSeconds(2), Duration.ofSeconds(4));
            try (AutoCloseable closeClient = client::close) {
            var errors = new java.util.concurrent.atomic.AtomicReference<Throwable>();
            var response = new OpenAiResponsesChatModel(client, "local").stream(new Prompt("local"))
                    .doOnError(errors::set).take(1).blockLast(Duration.ofSeconds(5));
            assertNotNull(response);
            assertNull(errors.get(), "Subscriber cancel must not become a deadline error");
            assertTrue(local.exited.await(2, TimeUnit.SECONDS), "Cancel must close the active transport");
            }
        }
    }

    @Test
    void guardPreservesOrdinaryInterruptedIoAndStopsOnExplicitClose() throws Exception {
        var request = new okhttp3.Request.Builder().url("http://fixture.invalid/").build();
        var chain = org.mockito.Mockito.mock(okhttp3.Interceptor.Chain.class);
        var call = org.mockito.Mockito.mock(okhttp3.Call.class);
        org.mockito.Mockito.when(chain.call()).thenReturn(call);
        org.mockito.Mockito.when(chain.request()).thenReturn(request);
        var original = new InterruptedIOException("timeout token=do-not-leak https://fixture.invalid/");
        org.mockito.Mockito.when(chain.proceed(request)).thenThrow(original);
        var guard = new ResponsesDeadlineInterceptor(Duration.ofMillis(200));
        assertSame(original, assertThrows(InterruptedIOException.class, () -> guard.intercept(chain)));
        assertEquals("AI_PROVIDER_ERROR", AiErrors.classify(new OpenAIIoException("fixture", original)));
        // A finished or explicitly closed request must not be canceled by a stale watchdog.
        org.mockito.Mockito.reset(chain);
        org.mockito.Mockito.when(chain.call()).thenReturn(call);
        org.mockito.Mockito.when(chain.request()).thenReturn(request);
        var closes = new AtomicInteger();
        var source = new okio.ForwardingSource(new okio.Buffer().writeUtf8("local")) {
            @Override public void close() throws IOException { closes.incrementAndGet(); super.close(); }
        };
        var buffered = okio.Okio.buffer(source);
        var body = new okhttp3.ResponseBody() {
            @Override public okhttp3.MediaType contentType() { return null; }
            @Override public long contentLength() { return -1; }
            @Override public okio.BufferedSource source() { return buffered; }
        };
        org.mockito.Mockito.when(chain.proceed(request)).thenReturn(new okhttp3.Response.Builder().request(request)
                .protocol(okhttp3.Protocol.HTTP_1_1).code(200).message("OK").body(body).build());
        var response = guard.intercept(chain);
        response.close(); response.close();
        assertEquals(1, closes.get());
        org.mockito.Mockito.verify(call, org.mockito.Mockito.after(400).never()).cancel();
    }

    @Test
    void deadlineBeforeHeadersAndExpiredCloseKeepTypedEvidence() throws Exception {
        var request = new okhttp3.Request.Builder().url("http://fixture.invalid/").build();
        var chain = org.mockito.Mockito.mock(okhttp3.Interceptor.Chain.class);
        var call = org.mockito.Mockito.mock(okhttp3.Call.class);
        var cancelled = new CountDownLatch(1);
        org.mockito.Mockito.doAnswer(ignored -> { cancelled.countDown(); return null; }).when(call).cancel();
        org.mockito.Mockito.when(chain.call()).thenReturn(call);
        org.mockito.Mockito.when(chain.request()).thenReturn(request);
        org.mockito.Mockito.when(chain.proceed(request)).thenAnswer(ignored -> {
            assertTrue(cancelled.await(2, TimeUnit.SECONDS));
            throw new IOException("token=do-not-leak");
        });
        var guard = new ResponsesDeadlineInterceptor(Duration.ofMillis(150));
        var failure = assertThrows(java.net.http.HttpTimeoutException.class, () -> guard.intercept(chain));
        assertEquals("AI_TIMED_OUT", AiErrors.classify(failure));
        org.mockito.Mockito.verify(call, org.mockito.Mockito.times(1)).cancel();

        var closed = new CountDownLatch(1);
        var nextCall = org.mockito.Mockito.mock(okhttp3.Call.class);
        org.mockito.Mockito.doAnswer(ignored -> { closed.countDown(); return null; }).when(nextCall).cancel();
        org.mockito.Mockito.when(chain.call()).thenReturn(nextCall);
        org.mockito.Mockito.doReturn(new okhttp3.Response.Builder().request(request)
                .protocol(okhttp3.Protocol.HTTP_1_1).code(200).message("OK")
                .body(okhttp3.ResponseBody.create(null, "buffered but not consumed")).build()).when(chain).proceed(request);
        var response = guard.intercept(chain);
        assertTrue(closed.await(2, TimeUnit.SECONDS));
        var closeFailure = assertThrows(RuntimeException.class, response::close);
        assertTrue(causes(closeFailure).stream().anyMatch(java.net.http.HttpTimeoutException.class::isInstance));
        assertEquals("AI_TIMED_OUT", AiErrors.classify(closeFailure), "Close must not swallow deadline evidence");
    }

    private static final class LocalSse implements AutoCloseable {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch exited = new CountDownLatch(1);
        final java.util.concurrent.ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        final HttpServer server;
        LocalSse(boolean active, boolean complete) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/v1/responses", exchange -> {
                calls.incrementAndGet();
                try (exchange) {
                    exchange.getRequestBody().readAllBytes();
                    exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                    exchange.sendResponseHeaders(200, 0);
                    var out = exchange.getResponseBody();
                    out.write(DELTA.getBytes(StandardCharsets.UTF_8)); out.flush();
                    if (complete) {
                        out.write(OpenAiResponsesProtocolTest.COMPLETED.getBytes(StandardCharsets.UTF_8)); out.flush();
                    }
                    long until = System.nanoTime() + Duration.ofSeconds(7).toNanos();
                    while (!release.await(40, TimeUnit.MILLISECONDS) && System.nanoTime() < until) {
                        if (active) { out.write(DELTA.getBytes(StandardCharsets.UTF_8)); out.flush(); }
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                } catch (IOException closedByClient) {
                    // Expected when the client cancels or its bounded request deadline fires.
                } finally { exited.countDown(); }
            });
            server.start();
        }
        com.openai.client.OpenAIClient client(Duration budget, Duration idle) {
            return ResponsesDeadlineInterceptor.client("local-key", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1",
                    budget, Duration.ofSeconds(2), idle, Duration.ofSeconds(2));
        }
        @Override public void close() throws Exception {
            release.countDown(); server.stop(0); executor.shutdownNow();
            assertTrue(exited.await(2, TimeUnit.SECONDS));
            assertTrue(executor.awaitTermination(2, TimeUnit.SECONDS));
        }
    }

    private static List<Throwable> causes(Throwable failure) {
        var seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        var result = new ArrayList<Throwable>();
        for (var cause = failure; cause != null && seen.add(cause); cause = cause.getCause()) result.add(cause);
        return List.copyOf(result);
    }
}
