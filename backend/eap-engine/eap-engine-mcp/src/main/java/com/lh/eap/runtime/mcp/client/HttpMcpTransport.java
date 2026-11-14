package com.lh.eap.runtime.mcp.client;
import com.lh.eap.error.McpErrors;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;

/**
 * MCP JSON-RPC over a single HTTP POST endpoint (request/response).
 * Legacy SSE uses {@link SseMcpTransport}; Streamable-HTTP uses {@link StreamableHttpMcpTransport}.
 */
public final class HttpMcpTransport implements McpTransport {
    private final URI endpoint;
    private final HttpClient http;
    private volatile boolean closed;
    private volatile java.util.concurrent.CompletableFuture<?> pending;
    private volatile java.io.InputStream activeBody;
    static final int MAX_FRAME_BYTES=6*1024*1024;

    HttpMcpTransport(URI endpoint, HttpClient http) {
        this.endpoint = Objects.requireNonNull(endpoint, "endpoint");
        this.http = Objects.requireNonNull(http, "http");
    }

    public static HttpMcpTransport connect(String endpoint) {
        var uri = HttpMcpEndpoint.parse(endpoint);
        var client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        return new HttpMcpTransport(uri, client);
    }

    public URI endpoint() {
        return endpoint;
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed) throw new IOException("传输已关闭");
        Objects.requireNonNull(requestJson, "requestJson");
        var deadline = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(5)
                : timeout;
        if(requestJson.getBytes(StandardCharsets.UTF_8).length>MAX_FRAME_BYTES)throw new IOException(McpErrors.MCP_FRAME_LIMIT.code());
        var request = HttpRequest.newBuilder(endpoint)
                .timeout(deadline)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8))
                .build();
        try {
            long end=System.nanoTime()+deadline.toNanos();
            var responseFuture=http.sendAsync(request,HttpResponse.BodyHandlers.ofInputStream());
            pending=responseFuture;
            if(closed){responseFuture.cancel(true);throw new IOException(McpErrors.MCP_HTTP_INTERRUPTED.code());}
            var response=responseFuture.get(deadline.toMillis(),java.util.concurrent.TimeUnit.MILLISECONDS);
            activeBody=response.body();
            var bodyFuture=java.util.concurrent.CompletableFuture.supplyAsync(()->{
                try(var body=response.body()){
                    var bytes=body.readNBytes(MAX_FRAME_BYTES+1);
                    if(bytes.length>MAX_FRAME_BYTES)throw new IOException(McpErrors.MCP_FRAME_LIMIT.code());
                    return new String(bytes,StandardCharsets.UTF_8);
                }catch(IOException failed){throw new java.util.concurrent.CompletionException(failed);}
            },command->Thread.ofVirtual().start(command));
            pending=bodyFuture;
            if(closed)throw new IOException(McpErrors.MCP_HTTP_INTERRUPTED.code());
            var body=bodyFuture.get(Math.max(1,end-System.nanoTime()),java.util.concurrent.TimeUnit.NANOSECONDS);
            int status=response.statusCode();
            if(status==204||status==202)return "";
            if(status<200||status>=300)throw new IOException("MCP_HTTP_"+status);
            return body;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException(McpErrors.MCP_HTTP_INTERRUPTED.code(), interrupted);
        }catch(java.util.concurrent.TimeoutException timeoutFailure){
            throw new IOException(McpErrors.MCP_TIMEOUT.code(),timeoutFailure);
        }catch(java.util.concurrent.ExecutionException|java.util.concurrent.CancellationException failure){
            var cause=failure.getCause();
            if(cause instanceof IOException io)throw io;
            throw new IOException(McpErrors.MCP_IO.code(),failure);
        }finally{
            var inFlight=pending;if(inFlight!=null)inFlight.cancel(true);pending=null;
            var body=activeBody;activeBody=null;if(body!=null)try{body.close();}catch(IOException ignored){}
        }
    }

    @Override
    public void close() {
        closed = true;
        var inFlight=pending;if(inFlight!=null)inFlight.cancel(true);
        var body=activeBody;if(body!=null)try{body.close();}catch(IOException ignored){}
    }
}
