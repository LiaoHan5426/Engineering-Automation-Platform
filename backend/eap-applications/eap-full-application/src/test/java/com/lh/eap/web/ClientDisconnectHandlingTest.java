package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.web.controller.ApiErrorHandler;
import com.lh.eap.web.i18n.ProblemResponses;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ClientDisconnectHandlingTest {
    @Test void doesNotAttemptASecondErrorBodyAfterTheClientDisconnects() {
        var problems = mock(ProblemResponses.class);
        var response = new MockHttpServletResponse();
        response.setCommitted(true);
        var failure = new HttpMessageNotWritableException("write failed", new IOException("Broken pipe"));
        assertNull(new ApiErrorHandler(problems).unexpected(failure, new MockHttpServletRequest(), response));
        verifyNoInteractions(problems);
    }
    @Test void retainsThePlatform500ForActualSerializationFailures() {
        var problems = mock(ProblemResponses.class);
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        var problem = ProblemDetail.forStatus(500);
        problem.setProperty("requestId", "test"); problem.setProperty("code", "UNEXPECTED_ERROR");
        when(problems.create(500, "UNEXPECTED_ERROR", request, response)).thenReturn(problem);
        assertSame(problem, new ApiErrorHandler(problems).unexpected(new HttpMessageNotWritableException("serializer failed"), request, response));
        verify(problems).create(500, "UNEXPECTED_ERROR", request, response);
    }
}
