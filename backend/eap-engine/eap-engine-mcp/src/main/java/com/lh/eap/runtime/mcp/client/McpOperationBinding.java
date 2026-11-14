package com.lh.eap.runtime.mcp.client;

import com.lh.eap.error.McpErrors;
import java.util.*;

/** Typed operator configuration attached to the existing registered server; never a grant. */
public sealed interface McpOperationBinding permits McpOperationBinding.Web, McpOperationBinding.Speech {
    enum Operation { SEARCH, READ, ASR, TTS }
    Operation operation();
    String tool();
    String expertId();
    boolean approved();
    Map<String,Object> inputSchema();
    Map<String,Object> wire();
    record Web(Operation operation, String tool, String expertId, boolean approved, Map<String,Object> inputSchema,
               String inputArgument, String resultsField, String titleField, String urlField, String textField,
               String ownerPolicyArgument) implements McpOperationBinding {
        public Web { inputSchema = immutable(inputSchema); }
        public Map<String,Object> wire() {
            var map = common(this); map.putAll(Map.of("inputArgument",inputArgument,"resultsField",resultsField,
                    "titleField",titleField,"urlField",urlField,"textField",textField));
            if(operation==Operation.READ) map.put("ownerPolicyArgument",ownerPolicyArgument);
            return Map.copyOf(map);
        }
    }
    record Speech(Operation operation, String tool, String expertId, boolean approved, Map<String,Object> inputSchema,
                  String audioArgument, String mimeArgument, String textArgument, String textField,
                  String audioField, String mimeField, String resultFormat) implements McpOperationBinding {
        public Speech { inputSchema = immutable(inputSchema); }
        public Map<String,Object> wire() {
            var map=common(this); map.put("resultFormat",resultFormat);
            if(operation==Operation.ASR)map.putAll(Map.of("audioArgument",audioArgument,"mimeArgument",mimeArgument,"textField",textField));
            else map.putAll(Map.of("textArgument",textArgument,"audioField",audioField,"mimeField",mimeField));
            return Map.copyOf(map);
        }
    }
    private static LinkedHashMap<String,Object> common(McpOperationBinding b) {
        var map=new LinkedHashMap<String,Object>();
        map.put("operation",b.operation().name());map.put("tool",b.tool());map.put("expertId",b.expertId());
        map.put("approved",b.approved());map.put("inputSchema",b.inputSchema());return map;
    }
    @SuppressWarnings("unchecked")
    static McpOperationBinding parse(Object raw) {
        if(!(raw instanceof Map<?,?> map))throw invalid();
        Operation operation;
        try { operation=Operation.valueOf(text(map,"operation",16)); }catch(RuntimeException bad){throw invalid();}
        var keys=new HashSet<>(Set.of("operation","tool","expertId","approved","inputSchema"));
        if(operation==Operation.SEARCH || operation==Operation.READ){
            keys.addAll(Set.of("inputArgument","resultsField","titleField","urlField","textField"));
            if(operation==Operation.READ)keys.add("ownerPolicyArgument");
        } else {
            keys.add("resultFormat");
            keys.addAll(operation==Operation.ASR?Set.of("audioArgument","mimeArgument","textField"):Set.of("textArgument","audioField","mimeField"));
        }
        if(!map.keySet().equals(keys)||!(map.get("approved") instanceof Boolean approved)
                ||!(map.get("inputSchema") instanceof Map<?,?> schema)||!"object".equals(schema.get("type")))throw invalid();
        var tool=text(map,"tool",61);var expert=text(map,"expertId",120);
        if(!tool.matches("[a-z0-9][a-z0-9_-]{0,60}") || expert.isBlank())throw invalid();
        Map<String,Object> input=immutable((Map<String,Object>)schema);
        if(operation==Operation.SEARCH||operation==Operation.READ){
            var binding=new Web(operation,tool,expert,approved,input,text(map,"inputArgument",80),optionalText(map,"resultsField"),
                    text(map,"titleField",80),text(map,"urlField",80),text(map,"textField",80),operation==Operation.READ?text(map,"ownerPolicyArgument",80):"");
            new McpWebBinding("validation","validation","http",McpWebBinding.Operation.valueOf(operation.name()),tool,approved,input,
                    binding.inputArgument(),binding.ownerPolicyArgument(),binding.resultsField(),binding.titleField(),binding.urlField(),binding.textField());
            return binding;
        }
        var format=text(map,"resultFormat",8);
        if(!(operation==Operation.ASR?Set.of("JSON","TEXT"):Set.of("JSON","AUDIO")).contains(format))throw invalid();
        var b=new Speech(operation,tool,expert,approved,input,operation==Operation.ASR?text(map,"audioArgument",80):"",
                operation==Operation.ASR?text(map,"mimeArgument",80):"",operation==Operation.TTS?text(map,"textArgument",80):"",
                operation==Operation.ASR?text(map,"textField",80):"",operation==Operation.TTS?text(map,"audioField",80):"",
                operation==Operation.TTS?text(map,"mimeField",80):"",format);
        var supplied=operation==Operation.ASR?Set.of(b.audioArgument(),b.mimeArgument()):Set.of(b.textArgument());
        if(!(input.get("properties") instanceof Map<?,?> props))throw invalid();
        for(var field:supplied)if(!(props.get(field) instanceof Map<?,?> p)||!"string".equals(p.get("type")))throw invalid();
        if(input.get("required") instanceof List<?> required)for(var field:required)if(!supplied.contains(field))throw invalid();
        if(operation==Operation.ASR) {
            try { McpSpeechService.inputMimes(b); } catch(RuntimeException malformed){throw invalid();}
        }
        return b;
    }
    static List<McpOperationBinding> parseList(Object raw) {
        if(!(raw instanceof List<?> entries)||entries.size()>4)throw invalid();
        var result=new ArrayList<McpOperationBinding>();var seen=EnumSet.noneOf(Operation.class);
        for(var entry:entries){var binding=parse(entry);if(!seen.add(binding.operation()))throw invalid();result.add(binding);}
        return List.copyOf(result);
    }
    private static Map<String,Object> immutable(Map<String,Object> value){
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        if(mapper.writeValueAsString(value).length()>65536)throw invalid();
        return Collections.unmodifiableMap(mapper.readValue(mapper.writeValueAsString(value),Map.class));
    }
    private static String text(Map<?,?> map,String key,int limit){
        if(!(map.get(key) instanceof String value)||value.isBlank()||value.length()>limit)throw invalid();return value;
    }
    private static String optionalText(Map<?,?>map,String key){if(!(map.get(key) instanceof String value)||value.length()>80)throw invalid();return value;}
    static IllegalArgumentException invalid(){return new IllegalArgumentException(McpErrors.MCP_SERVER_INPUT_INVALID.code());}
}
