package com.lh.eap.application.service;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
public final class SemanticPrototypeFixture {
    public static String body(String text) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("format","eap-prototype-v1","schema",Map.of(
                "version",1,"title",text,"grapesProject",Map.of(),"unknownMappings",List.of(),
                "root",Map.of("id","root","kind","page","props",Map.of(),"children",List.of(
                        Map.of("id","text","kind","text","props",Map.of("text",text),"children",List.of()))))));
    }
}
