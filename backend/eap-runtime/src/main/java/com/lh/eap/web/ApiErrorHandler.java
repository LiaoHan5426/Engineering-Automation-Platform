package com.lh.eap.web;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiErrorHandler {
    private static final Logger log=LoggerFactory.getLogger(ApiErrorHandler.class);
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ProblemDetail expected(org.springframework.web.server.ResponseStatusException error){
        var result=ProblemDetail.forStatusAndDetail(error.getStatusCode(),SensitiveData.redact(error.getReason()));
        return result;
    }
    @ExceptionHandler({IllegalArgumentException.class,HttpMessageNotReadableException.class})
    public ProblemDetail invalid(Exception error){
        return problem(HttpStatus.BAD_REQUEST,error instanceof IllegalArgumentException?SensitiveData.redact(error.getMessage()):"请求 JSON 无效或字段类型不正确",error);
    }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail database(DataAccessException error){return problem(HttpStatus.SERVICE_UNAVAILABLE,"数据服务暂不可用，请检查数据库、迁移和后端日志",error);}
    private ProblemDetail problem(HttpStatus status,String message,Exception error){
        var id=UUID.randomUUID().toString();
        log.warn("API request {} failed: type={}, status={}",id,error.getClass().getSimpleName(),status.value());
        var result=ProblemDetail.forStatusAndDetail(status,message);result.setProperty("requestId",id);return result;
    }
}
