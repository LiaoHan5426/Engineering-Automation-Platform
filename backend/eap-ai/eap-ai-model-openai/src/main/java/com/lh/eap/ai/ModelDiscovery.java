package com.lh.eap.ai;

import java.io.Serial;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Metadata-only request to the configured endpoint. No redirects or model completions. */
@Component
public class ModelDiscovery {
    private static final int MAX_BYTES = 262144;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    public List<String> fetch(ModelConnectionSnapshot connection) {
        try {
            var base = URI.create(connection.baseUrl);
            if (!com.lh.eap.llm.EndpointPolicy.permits(connection.baseUrl, true) || base.getHost() == null
                    || base.getRawQuery() != null || base.getFragment() != null) throw new IllegalStateException();
            String path = base.getPath() == null ? "" : base.getPath().replaceAll("/+$", "");
            // Root endpoints follow the existing OpenAI-compatible client's /v1 convention.
            if (path.isEmpty()) path = "/v1";
            var uri = new URI(base.getScheme(), null, base.getHost(), base.getPort(), path + "/models", null, null);
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(12))
                    .header("Authorization", "Bearer " + connection.secret).header("Accept", "application/json").GET().build();
            var response = http.send(request, ignored -> new LimitedBody());
            if (response.statusCode() != 200) throw new DiscoveryFailure("MODEL_DISCOVERY_HTTP_" + response.statusCode());
            boolean plan = ModelConnections.CHATGPT_KIND.equals(connection.kind);
            var data = JsonMapper.builder().build().readTree(response.body()).path(plan ? "models" : "data");
            if (!data.isArray() || data.size() > 1024) throw new DiscoveryFailure("MODEL_DISCOVERY_INVALID_RESPONSE");
            var result = new java.util.TreeSet<String>();
            for (var item : data) {
                if (plan && !item.path("visibility").asString().equals("list")) continue;
                var id = item.path(plan ? "slug" : "id").asString("");
                if (!id.isBlank() && id.length() <= 120 && id.chars().noneMatch(Character::isISOControl)) result.add(id);
            }
            return List.copyOf(result);
        } catch (DiscoveryFailure failure) {
            throw failure;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new DiscoveryFailure("MODEL_DISCOVERY_INTERRUPTED");
        } catch (Exception failure) {
            // Never expose endpoint response bodies, Authorization headers or client exception details.
            throw new DiscoveryFailure("MODEL_DISCOVERY_UNAVAILABLE");
        }
    }

    public static final class DiscoveryFailure extends RuntimeException {
        @Serial
        private static final long serialVersionUID = -134732160771253670L;

        public DiscoveryFailure(String code) { super(code); }
    }

    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long bytes;
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        public void onSubscribe(Flow.Subscription value) { subscription = value; delegate.onSubscribe(value); }
        public void onNext(List<ByteBuffer> buffers) {
            for (var buffer : buffers) bytes += buffer.remaining();
            if (bytes > MAX_BYTES) {
                subscription.cancel();
                delegate.onError(new IllegalStateException("MODEL_DISCOVERY_TOO_LARGE"));
            } else delegate.onNext(buffers);
        }
        public void onError(Throwable error) { delegate.onError(error); }
        public void onComplete() { delegate.onComplete(); }
    }
}
