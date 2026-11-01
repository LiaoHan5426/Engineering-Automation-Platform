package com.lh.eap.common;

import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

public final class SensitiveData {
    private static final Pattern ASSIGNMENT=Pattern.compile("(?i)((?:\"|')?(?:password|passwd|token|secret|api[_-]?key)(?:\"|')?\\s*[:=]\\s*)('[^']*'|\"[^\"]*\"|[^\\s,;}]+)");
    private static final Pattern JDBC=Pattern.compile("(?i)jdbc:[^\\s'\"]+");
    // Shared by source admission and answer redaction, including credentials in method arguments.
    private static final Pattern API_CREDENTIAL=Pattern.compile("(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]+");
    private SensitiveData(){}
    public static String redact(String text){
        if(text==null)return "";
        return API_CREDENTIAL.matcher(JDBC.matcher(ASSIGNMENT.matcher(text).replaceAll(match->{
            var quote=match.group(2).startsWith("\"")?"\"":"'";
            return Matcher.quoteReplacement(match.group(1)+quote+"[REDACTED]"+quote);
        })).replaceAll("[REDACTED CONNECTION]")).replaceAll("[REDACTED]");
    }
    public static boolean containsSecret(Object value){
        if(value instanceof Map<?,?> map){
            for(var entry:map.entrySet()){
                if(String.valueOf(entry.getKey()).toLowerCase(Locale.ROOT).matches(".*(password|passwd|token|secret|credential|jdbc|connectionstring|api[_-]?key).*"))return true;
                if(containsSecret(entry.getValue()))return true;
            }
        }else if(value instanceof Iterable<?> list){for(var item:list)if(containsSecret(item))return true;}
        else if(value instanceof String text)return !redact(text).equals(text);
        return false;
    }
}
