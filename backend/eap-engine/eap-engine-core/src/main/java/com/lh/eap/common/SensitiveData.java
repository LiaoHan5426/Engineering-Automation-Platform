package com.lh.eap.common;

import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

public final class SensitiveData {
    private static final Pattern ASSIGNMENT=Pattern.compile("(?i)((?:\"|')?(?:password|passwd|token|secret|api[_-]?key)(?:\"|')?\\s*[:=]\\s*)('[^']*'|\"[^\"]*\"|[^\\s,;}]+)");
    private static final Pattern JDBC=Pattern.compile("(?i)jdbc:[^\\s'\"]+");
    // Shared by source admission and answer redaction, including credentials in method arguments.
    private static final Pattern API_CREDENTIAL=Pattern.compile("(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]+");
    private static final Pattern BEARER=Pattern.compile("(?i)(\\b(?:proxy-)?authorization[\"']?\\s*[:=]\\s*[\"']?bearer[\\t ]+)[A-Za-z0-9._~+/-]+=*");
    // Redact the whole envelope, not just its marker; truncated CLI/model output is sensitive too.
    private static final Pattern PRIVATE_KEY=Pattern.compile("(?is)-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY)-----.*?(?:-----END \\1-----|\\z)");
    // Source-only exceptions: these values are JS identifier references, never credential literals.
    // Keep the conservative text/log redactor unchanged. Ambiguous bare assignments still fail closed.
    private static final Pattern SOURCE_REFERENCE = Pattern.compile(
            "\\b(?:const|let|var)\\s+token\\s*=(?!=)\\s*[A-Za-z_$][A-Za-z0-9_$]*\\s*(?=[;,)\\r\\n]|$)"
            + "|\\btoken\\s*(?:===|!==|==|!=)\\s*[A-Za-z_$][A-Za-z0-9_$]*\\s*(?=[;,)\\r\\n]|$)");
    private SensitiveData(){}

    /** Checks decoded source without rewriting it; uncertain assignments remain sensitive. */
    public static boolean containsSecretInSource(String source) {
        if (source == null) return false;
        if (API_CREDENTIAL.matcher(source).find() || JDBC.matcher(source).find()
                || PRIVATE_KEY.matcher(source).find() || BEARER.matcher(source).find()) return true;
        return containsSecret(SOURCE_REFERENCE.matcher(source).replaceAll(""));
    }
    public static String redact(String text){
        if(text==null)return "";
        text=PRIVATE_KEY.matcher(text).replaceAll("[REDACTED PRIVATE KEY]");
        text=BEARER.matcher(text).replaceAll("$1[REDACTED]");
        return API_CREDENTIAL.matcher(JDBC.matcher(ASSIGNMENT.matcher(text).replaceAll(match->{
            var quote=match.group(2).startsWith("\"")?"\"":"'";
            return Matcher.quoteReplacement(match.group(1)+quote+"[REDACTED]"+quote);
        })).replaceAll("[REDACTED CONNECTION]")).replaceAll("[REDACTED]");
    }
    public static boolean containsSecret(Object value){
        if(value instanceof Map<?,?> map){
            for(var entry:map.entrySet()){
                if(String.valueOf(entry.getKey()).toLowerCase(Locale.ROOT).matches(".*(password|passwd|token|secret|credential|jdbc|connectionstring|api[_-]?key).*"))return true;
                if(entry.getValue() instanceof String text && containsSecret(entry.getKey()+": "+text))return true;
                if(containsSecret(entry.getValue()))return true;
            }
        }else if(value instanceof Iterable<?> list){for(var item:list)if(containsSecret(item))return true;}
        else if(value instanceof String text)return !redact(text).equals(text);
        return false;
    }
}
