package com.lh.eap.web.i18n;
import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** One platform error envelope for advice, local handlers and pre-MVC filters. */
@Component
public final class ProblemResponses {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String REQUEST_ID = ProblemResponses.class.getName() + ".requestId";
    private final MessageSource messages;

    public ProblemResponses(MessageSource messages) { this.messages = messages; }

    public ProblemDetail create(int status, String code, HttpServletRequest request, HttpServletResponse response) {
        return create(status, code, request, response, new Object[0]);
    }

    public ProblemDetail create(int status, String code, HttpServletRequest request, HttpServletResponse response, Object... arguments) {
        Locale locale = RequestLanguage.resolve(request.getHeader("Accept-Language"));
        response.setHeader("Content-Language", locale.toLanguageTag());
        var result = localized(status, code, locale, arguments);
        var requestId = request.getAttribute(REQUEST_ID);
        if (!(requestId instanceof String)) {
            requestId = UUID.randomUUID().toString();
            request.setAttribute(REQUEST_ID, requestId);
        }
        result.setProperty("requestId", requestId);
        return result;
    }

    public ProblemDetail localized(int status, String code, Locale locale) {
        return localized(status, code, locale, new Object[0]);
    }

    public ProblemDetail localized(int status, String code, Locale locale, Object... arguments) {
        String safe = code != null && code.matches("[A-Z][A-Z0-9_]{1,119}") ? code : "UNEXPECTED_ERROR";
        String detail = messages.getMessage("errors." + safe, arguments, null, locale);
        if (detail == null || detail.matches("(?s).*\\{\\d+(?:,[^}]+)?}.*"))
            detail = messages.getMessage("errors.UNEXPECTED_ERROR", null, locale);
        var result = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail);
        result.setType(URI.create("about:blank"));
        result.setTitle(messages.getMessage("http." + status, null,
                messages.getMessage("http.error", null, locale), locale));
        result.setProperty("code", safe);
        return result;
    }

    /** Exception text is only a code when declared in a product catalog. */
    public String declaredCode(String candidate, String fallback) {
        return candidate != null && candidate.matches("[A-Z][A-Z0-9_]{1,119}")
                && messages.getMessage("errors." + candidate, null, null, RequestLanguage.CHINESE) != null
                ? candidate : fallback;
    }

    public void write(int status, String code, HttpServletRequest request, HttpServletResponse response) throws IOException {
        var problem = create(status, code, request, response);
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");
        var body = new LinkedHashMap<String, Object>();
        body.put("type", problem.getType().toString());
        body.put("title", problem.getTitle());
        body.put("status", status);
        body.put("detail", problem.getDetail());
        body.putAll(problem.getProperties());
        response.getWriter().write(JSON.writeValueAsString(body));
    }
}
