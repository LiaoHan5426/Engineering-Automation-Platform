package com.lh.eap.web;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
class ApiBoundaryTest {
 @Test void allDomainsAndMethodsRejectForeignHostAndUnlistedOrigin() throws Exception {
  for(String method:new String[]{"GET","POST","PUT","PATCH","DELETE","OPTIONS"})for(String path:new String[]{"/api/cli-executions","/api/mcp-servers","/api/board/tasks","/api/capabilities"}){
   var request=new MockHttpServletRequest(method,path);request.setServerName("evil.example");request.addHeader("Host","evil.example");var response=new MockHttpServletResponse();var chain=new MockFilterChain();new AiBrowserRequestGuard().doFilter(request,response,chain);assertEquals(403,response.getStatus());assertNull(chain.getRequest());
   request=new MockHttpServletRequest(method,path);request.addHeader("Origin","http://localhost:12345");response=new MockHttpServletResponse();chain=new MockFilterChain();new AiBrowserRequestGuard().doFilter(request,response,chain);assertEquals(403,response.getStatus());assertNull(chain.getRequest());
  }
 }
 @Test void trustedBodylessRequestsRemainSupported() throws Exception {
  for(String method:new String[]{"GET","POST","DELETE","OPTIONS"}){var request=new MockHttpServletRequest(method,"/api/cli-executions");request.addHeader("Origin","http://localhost:5173");var chain=new MockFilterChain();new AiBrowserRequestGuard().doFilter(request,new MockHttpServletResponse(),chain);assertNotNull(chain.getRequest());}
 }
}
