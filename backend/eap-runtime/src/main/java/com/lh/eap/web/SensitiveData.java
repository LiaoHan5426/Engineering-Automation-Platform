package com.lh.eap.web;

import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

public final class SensitiveData {
    private static final Pattern ASSIGNMENT=Pattern.compile("(?i)((?:\"|')?(?:password|passwd|token|secret|api[_-]?key)(?:\"|')?\\s*[:=]\\s*)('[^']*'|\"[^\"]*\"|[^\\s,;}]+)");
    private static final Pattern JDBC=Pattern.compile("(?i)jdbc:[^\\s'\"]+");
    private SensitiveData(){}
    public static String redact(String text){
        if(text==null)return "";
        return JDBC.matcher(ASSIGNMENT.matcher(text).replaceAll(match->{
            var quote=match.group(2).startsWith("\"")?"\"":"'";
            return Matcher.quoteReplacement(match.group(1)+quote+"[REDACTED]"+quote);
        })).replaceAll("[REDACTED CONNECTION]");
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
