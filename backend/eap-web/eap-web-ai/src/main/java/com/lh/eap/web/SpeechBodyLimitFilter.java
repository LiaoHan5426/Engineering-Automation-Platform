package com.lh.eap.web;

import com.lh.eap.ai.SpeechErrors;
import com.lh.eap.web.i18n.ProblemResponses;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.RequestPath;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounds wire bytes before a JSON converter allocates strings; never creates multipart/temp files. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+1)
public final class SpeechBodyLimitFilter extends OncePerRequestFilter {
    public static final int MAX_WIRE_BYTES=6*1024*1024;
    private final ProblemResponses problems;
    public SpeechBodyLimitFilter(ProblemResponses problems){this.problems=problems;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request){
        var parts=RequestPath.parse(request.getRequestURI(),request.getContextPath()).pathWithinApplication().elements().stream()
            .filter(PathContainer.PathSegment.class::isInstance).map(PathContainer.PathSegment.class::cast).map(PathContainer.PathSegment::valueToMatch).toList();
        return parts.size()<3||!parts.subList(0,3).equals(java.util.List.of("api","ai","speech"));
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        if(request.getContentLengthLong()>MAX_WIRE_BYTES){reject(request,response);return;}
        byte[] bounded=request.getInputStream().readNBytes(MAX_WIRE_BYTES+1);
        try {
            if(bounded.length>MAX_WIRE_BYTES){reject(request,response);return;}
            var input=new ByteArrayInputStream(bounded);
            chain.doFilter(new HttpServletRequestWrapper(request){
                @Override public ServletInputStream getInputStream(){return new ServletInputStream(){
                    @Override public int read(){return input.read();}
                    @Override public int read(byte[] target,int offset,int length){return input.read(target,offset,length);}
                    @Override public boolean isFinished(){return input.available()==0;}
                    @Override public boolean isReady(){return true;}
                    @Override public void setReadListener(ReadListener listener){throw new UnsupportedOperationException("Blocking JSON request stream");}
                };}
                @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
            },response);
        } finally {Arrays.fill(bounded,(byte)0);}
    }
    private void reject(HttpServletRequest request,HttpServletResponse response)throws IOException {
        problems.write(413,SpeechErrors.SPEECH_PAYLOAD_TOO_LARGE.code(),request,response);
    }
}
