package com.lh.eap.delivery;
import com.lh.eap.error.CodeErrors;

import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Bounded static ES module graph for explicitly selected Vue/TS/JS component files. */
public final class ComponentGraph {
    public record Source(String path,String baseHash,String content) {}
    public record Baseline(String path,String baseHash) {}
    public record Edge(String from,String to) {}
    private static final Pattern IMPORT=Pattern.compile("\\b(?:import\\s+(?:[^;\n]*?\\s+from\\s*)?|export\\s+[^;\n]*?\\s+from\\s*)['\"]([^'\"]+)['\"]");
    private static final Pattern DYNAMIC=Pattern.compile("\\b(?:import|require)\\s*\\(");
    private static final Pattern IMPORT_WORD=Pattern.compile("\\bimport\\b");
    private static final Pattern REEXPORT=Pattern.compile("\\bexport\\s+(?:type\\s+)?(?:\\*[^;]*?|\\{[^}]*\\})\\s*from\\b");
    private static final Set<String> SHARED=Set.of("vue","vue-i18n","@eap/ui","@eap/runtime-client");
    private ComponentGraph(){}
    public static List<Edge> validate(String entry,List<CodeChangeService.Change> files) {
        if(files.size()==1)return List.of(); // A leaf has no selected companion edges.
        var selected=new LinkedHashMap<String,String>();
        for(var file:files) {
            if(!file.path().matches("frontend/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.(vue|ts|js)"))throw denied(CodeErrors.CODE_GRAPH_PATH_DENIED.code());
            selected.put(file.path(),file.content());
        }
        var edges=new ArrayList<Edge>();
        for(var file:files) {
            // Reject constructs outside this deliberately static, auditable subset.
            String text=file.content().replaceAll("(?s)/\\*.*?\\*/","").replaceAll("(?m)^\\s*//.*$","");
            if(DYNAMIC.matcher(text).find()||text.contains("import.meta.glob")||text.matches("(?s).*<script[^>]*\\bsrc\\s*=.*"))throw denied(CodeErrors.CODE_GRAPH_DYNAMIC_IMPORT_DENIED.code());
            var imports=IMPORT.matcher(text);var recognized=new HashSet<Integer>();
            while(imports.find()) {
                recognized.add(imports.start());
                String spec=imports.group(1);
                if(SHARED.contains(spec))continue;
                if(!spec.startsWith("./")&&!spec.startsWith("../"))throw denied(CodeErrors.CODE_GRAPH_IMPORT_DENIED.code());
                String resolved=Path.of(file.path()).getParent().resolve(spec).normalize().toString().replace('\\','/');
                var candidates=new ArrayList<String>();
                for(var value:List.of(resolved,resolved+".vue",resolved+".ts",resolved+".js",resolved+"/index.ts"))if(selected.containsKey(value))candidates.add(value);
                if(candidates.size()!=1)throw denied(CodeErrors.CODE_GRAPH_UNDECLARED_IMPORT.code());
                var edge=new Edge(file.path(),candidates.getFirst());if(!edges.contains(edge))edges.add(edge);
            }
            var words=IMPORT_WORD.matcher(text);
            while(words.find())if(!recognized.contains(words.start()))throw denied(CodeErrors.CODE_GRAPH_IMPORT_SYNTAX_DENIED.code());
            var reexports=REEXPORT.matcher(text);
            while(reexports.find())if(!recognized.contains(reexports.start()))throw denied(CodeErrors.CODE_GRAPH_IMPORT_SYNTAX_DENIED.code());
        }
        var reached=new HashSet<String>();visit(entry,edges,new HashSet<>(),reached);
        if(!reached.equals(selected.keySet()))throw denied(CodeErrors.CODE_GRAPH_DISCONNECTED.code());
        return List.copyOf(edges);
    }
    private static void visit(String path,List<Edge> edges,Set<String> active,Set<String> reached) {
        if(!active.add(path))throw denied(CodeErrors.CODE_GRAPH_CYCLE.code());
        if(reached.add(path))for(var edge:edges)if(edge.from().equals(path))visit(edge.to(),edges,active,reached);
        active.remove(path);
    }
    private static ResponseStatusException denied(String reason){return new ResponseStatusException(HttpStatus.BAD_REQUEST,reason);}
}
