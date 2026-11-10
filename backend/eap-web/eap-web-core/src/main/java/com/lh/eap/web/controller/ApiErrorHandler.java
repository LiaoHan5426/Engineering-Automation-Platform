package com.lh.eap.web.controller;
import com.lh.eap.error.LocalizedFailure;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.error.CommonErrors;

import com.lh.eap.web.i18n.ProblemResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiErrorHandler {
    private static final Logger log=LoggerFactory.getLogger(ApiErrorHandler.class);
    private final ProblemResponses problems;
    public ApiErrorHandler(ProblemResponses problems) { this.problems = problems; }
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail expected(ResponseStatusException error, HttpServletRequest request, HttpServletResponse response){
        var result=problems.create(error.getStatusCode().value(),error.getReason(),request,response);
        var properties = error.getBody().getProperties();
        if (properties != null && properties.get("knowledgeMemoryCleared") instanceof Boolean cleared)
            result.setProperty("knowledgeMemoryCleared", cleared);
        if (properties != null && properties.get("contextMemoryCleared") instanceof Boolean cleared)
            result.setProperty("contextMemoryCleared", cleared);
        return result;
    }
    @ExceptionHandler(LocalizedFailure.class)
    public ProblemDetail domain(LocalizedFailure error, HttpServletRequest request, HttpServletResponse response) {
        int status = switch(error.kind()) { case INVALID -> 400; case FORBIDDEN -> 403; case NOT_FOUND -> 404; case CONFLICT -> 409; case UNAVAILABLE -> 503; };
        return problems.create(status,error.code(),request,response,error.messageArguments());
    }
    @ExceptionHandler({IllegalArgumentException.class,HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalid(Exception error, HttpServletRequest request, HttpServletResponse response){
        String code=error instanceof HttpMessageNotReadableException?CommonErrors.INVALID_JSON.code():problems.declaredCode(error.getMessage(),CommonErrors.INVALID_REQUEST.code());
        return problem(HttpStatus.BAD_REQUEST,code,error,request,response);
    }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail database(DataAccessException error, HttpServletRequest request, HttpServletResponse response){return problem(HttpStatus.SERVICE_UNAVAILABLE,CommonErrors.DATA_SERVICE_UNAVAILABLE.code(),error,request,response);}
    @ExceptionHandler(Exception.class)
    public ProblemDetail unexpected(Exception error, HttpServletRequest request, HttpServletResponse response){
        int status=error instanceof ErrorResponse declared?declared.getStatusCode().value():500;
        var result=problems.create(status,status<500?CommonErrors.INVALID_REQUEST.code():CommonErrors.UNEXPECTED_ERROR.code(),request,response);
        log.warn("API request {} failed: code={}, type={}, status={}",result.getProperties().get("requestId"),result.getProperties().get("code"),error.getClass().getSimpleName(),status);
        return result;
    }
    private ProblemDetail problem(HttpStatus status,String code,Exception error,HttpServletRequest request,HttpServletResponse response){
        var result=problems.create(status.value(),code,request,response);
        log.warn("API request {} failed: code={}, type={}, status={}",result.getProperties().get("requestId"),code,error.getClass().getSimpleName(),status.value());
        return result;
    }
}
