package com.lh.eap.delivery;
import com.lh.eap.error.CodeErrors;

import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Bounded graph of explicitly selected page modules and their local text resources. */
public final class ComponentGraph {
    public record Source(String path,String baseHash,String content) {}
    public record Baseline(String path,String baseHash) {}
    public record Edge(String from,String to,SourceDependencyKind kind) {}
    private static final Pattern PATH=Pattern.compile("frontend/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.(?:vue|ts|js|css|json)");
    private static final Pattern SPECIFIER=Pattern.compile("(?:\\.{1,2}/)+(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*");
    private static final Pattern STYLE_BLOCK=Pattern.compile("(?is)<style\\b([^>]*)>(.*?)</style\\s*>");
    private static final Pattern SCRIPT_BLOCK=Pattern.compile("(?is)<script\\b[^>]*>(.*?)</script\\s*>");
    private static final Pattern CSS_IMPORT=Pattern.compile("(?im)^\\s*(@import)\\s+(['\"])([^'\"]+)\\2\\s*;");
    private static final Pattern CSS_IMPORT_WORD=Pattern.compile("(?i)@import\\b");
    private static final Pattern CSS_EXTERNAL=Pattern.compile("(?i)\\b(?:url|(?:-webkit-)?image-set|image|src)\\s*\\(");
    private static final Pattern EXTERNAL_SFC=Pattern.compile("(?is)<(?:script|style|template)\\b[^>]*\\bsrc\\s*=|<(?:style|template)\\b[^>]*\\blang\\s*=");
    private static final Pattern SFC_ASSET=Pattern.compile("(?is)<(?:img|image|source|video|audio|track|use|object|embed|iframe)\\b[^>]*\\s(?:v-bind:|:)?(?:src|srcset|poster|href|xlink:href|data)\\s*=");
    private static final JsonMapper JSON=JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final Pattern IMPORT=Pattern.compile("\\b(?:import\\s+(?:[^;\n]*?\\s+from\\s*)?|export\\s+[^;\n]*?\\s+from\\s*)['\"]([^'\"]+)['\"]");
    private static final Pattern DYNAMIC=Pattern.compile("\\b(?:import|require)\\s*\\(");
    private static final Pattern GLOB=Pattern.compile("\\bimport\\s*\\.\\s*meta\\s*\\.\\s*glob\\b");
    private static final Pattern LAZY_IMPORT=Pattern.compile("\\bimport\\s*\\(\\s*(['\"])([^'\"\\\\\\r\\n]+)\\1\\s*\\)");
    private static final Pattern IMPORT_WORD=Pattern.compile("\\bimport\\b");
    private static final Pattern REEXPORT=Pattern.compile("\\bexport\\s+(?:type\\s+)?(?:\\*[^;]*?|\\{[^}]*\\})\\s*from\\b");
    private static final Set<String> SHARED=Set.of("vue","vue-i18n","@eap/ui","@eap/runtime-client");
    private ComponentGraph(){}

    public static boolean deliveryPath(String path) {
        return path != null && path.length() <= 240 && PATH.matcher(path).matches()
                && (!path.endsWith(".json") || dataResource(path));
    }

    public static boolean dataResource(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1).toLowerCase(Locale.ROOT);
        return name.endsWith(".json") && !name.matches("package(?:-lock)?\\.json|[jt]sconfig(?:\\.[^.]+)*\\.json");
    }

    public static boolean resource(String path) {
        return path.endsWith(".css") || path.endsWith(".json");
    }

    public static List<Edge> validate(String entry,List<CodeChangeService.Change> files) {
        if(files.size()==1)return List.of(); // A leaf has no selected companion edges.
        if (resource(entry)) throw denied(CodeErrors.CODE_GRAPH_PATH_DENIED.code());
        var selected=new LinkedHashSet<String>();
        for(var file:files) {
            if(!deliveryPath(file.path()) || !selected.add(file.path())) throw denied(CodeErrors.CODE_GRAPH_PATH_DENIED.code());
        }
        var edges=edges(files,selected);
        var reached=new HashSet<String>();visit(entry,edges,new HashSet<>(),reached);
        if(!reached.equals(selected))throw denied(CodeErrors.CODE_GRAPH_DISCONNECTED.code());
        return List.copyOf(edges);
    }

    /** Resolve direct dependencies through the same bounded syntax as proposal validation. */
    public static List<Edge> dependencies(CodeChangeService.Change file, java.util.function.Predicate<String> exists) {
        Set<String> selected = new AbstractSet<>() {
            @Override public boolean contains(Object path) {
                return path instanceof String value && deliveryPath(value) && exists.test(value);
            }
            @Override public Iterator<String> iterator() { return Collections.emptyIterator(); }
            @Override public int size() { return 0; }
        };
        return List.copyOf(edges(List.of(file), selected));
    }

    private static List<Edge> edges(List<CodeChangeService.Change> files, Set<String> selected) {
        var edges=new ArrayList<Edge>();
        for(var file:files) {
            if (file.path().endsWith(".json")) {
                try {
                    var data = JSON.readTree(file.content());
                    if (!data.isObject() && !data.isArray()) throw denied(CodeErrors.CODE_GRAPH_RESOURCE_DENIED.code());
                } catch (RuntimeException invalid) { throw denied(CodeErrors.CODE_GRAPH_RESOURCE_DENIED.code()); }
                continue;
            }
            if (file.path().endsWith(".css")) {
                style(file.path(), file.content(), selected, edges);
                continue;
            }
            // Reject constructs outside this deliberately static, auditable subset.
            String text=file.content();
            if (file.path().endsWith(".vue")) {
                if (EXTERNAL_SFC.matcher(text).find() || SFC_ASSET.matcher(text).find())
                    throw denied(CodeErrors.CODE_GRAPH_RESOURCE_DENIED.code());
                var styles = STYLE_BLOCK.matcher(text);
                while (styles.find()) style(file.path(), styles.group(2), selected, edges);
                // Template text and quoted HTML attributes cannot create module edges.
                var scripts = SCRIPT_BLOCK.matcher(styles.replaceAll(""));
                var source = new StringBuilder();
                while (scripts.find()) source.append(scripts.group(1)).append('\n');
                text = source.toString();
            }
            var syntax=syntax(text);
            text=syntax.text();
            if(GLOB.matcher(text).results().anyMatch(word->syntax.code().get(word.start())))
                throw denied(CodeErrors.CODE_GRAPH_DYNAMIC_IMPORT_DENIED.code());
            // Only complete string literals receive an edge. Keep offsets stable while
            // excluding recognized lazy calls from static import syntax checks.
            var lazy=LAZY_IMPORT.matcher(text);
            var lazyOffsets=new HashSet<Integer>();
            var eagerText=new StringBuilder(text);
            while(lazy.find()) {
                if(!syntax.code().get(lazy.start()))continue;
                String spec=lazy.group(2);
                if(!spec.matches(".*\\.(vue|ts|js)"))throw denied(CodeErrors.CODE_GRAPH_DYNAMIC_IMPORT_DENIED.code());
                lazyOffsets.add(lazy.start());
                link(file.path(),spec,selected,edges,SourceDependencyKind.LAZY_MODULE);
                for(int i=lazy.start();i<lazy.end();i++)eagerText.setCharAt(i,' ');
            }
            if(DYNAMIC.matcher(text).results().anyMatch(call->syntax.code().get(call.start())&&!lazyOffsets.contains(call.start())))
                throw denied(CodeErrors.CODE_GRAPH_DYNAMIC_IMPORT_DENIED.code());
            text=eagerText.toString();
            var imports=IMPORT.matcher(text);var recognized=new HashSet<Integer>();
            while(imports.find()) {
                if(!syntax.code().get(imports.start()))continue;
                recognized.add(imports.start());
                String spec=imports.group(1);
                if(SHARED.contains(spec))continue;
                link(file.path(),spec,selected,edges,SourceDependencyKind.MODULE);
            }
            var words=IMPORT_WORD.matcher(text);
            while(words.find())if(syntax.code().get(words.start())&&!recognized.contains(words.start()))throw denied(CodeErrors.CODE_GRAPH_IMPORT_SYNTAX_DENIED.code());
            var reexports=REEXPORT.matcher(text);
            while(reexports.find())if(syntax.code().get(reexports.start())&&!recognized.contains(reexports.start()))throw denied(CodeErrors.CODE_GRAPH_IMPORT_SYNTAX_DENIED.code());
        }
        return edges;
    }

    private record Syntax(String text, BitSet code) {}

    /** Preserve string contents and offsets; only executable keywords can create edges. */
    private static Syntax syntax(String source) {
        var text=new StringBuilder(source);
        var code=new BitSet(source.length());
        for(int i=0;i<source.length();) {
            char ch=source.charAt(i);
            if(ch=='/' && i+1<source.length() && (source.charAt(i+1)=='/'||source.charAt(i+1)=='*')) {
                boolean line=source.charAt(i+1)=='/';
                int end=line?source.indexOf('\n',i+2):source.indexOf("*/",i+2);
                if(end<0) {
                    if(!line)throw denied(CodeErrors.CODE_GRAPH_IMPORT_SYNTAX_DENIED.code());
                    end=source.length();
                } else if(!line)end+=2;
                while(i<end) {
                    if(text.charAt(i)!='\n'&&text.charAt(i)!='\r')text.setCharAt(i,' ');
                    i++;
                }
            } else if(ch=='\''||ch=='"'||ch==(char)96) {
                int start=i++;
                while(i<source.length()) {
                    char next=source.charAt(i++);
                    if(next=='\\')i=Math.min(i+1,source.length());
                    else if(next==ch)break;
                }
                // Template interpolation is outside this bounded syntax.
                String literal=source.substring(start,i);
                if(ch==(char)96 && literal.contains("$"+"{")
                        && (DYNAMIC.matcher(literal).find()||GLOB.matcher(literal).find()))
                    throw denied(CodeErrors.CODE_GRAPH_DYNAMIC_IMPORT_DENIED.code());
            } else {
                code.set(i++);
            }
        }
        return new Syntax(text.toString(),code);
    }

    private static void style(String from,String content,Set<String> selected,List<Edge> edges) {
        String css = content.replaceAll("(?s)/\\*.*?\\*/", " ");
        if (css.indexOf('\\') >= 0 || CSS_EXTERNAL.matcher(css).find())
            throw denied(CodeErrors.CODE_GRAPH_RESOURCE_DENIED.code());
        var imports = CSS_IMPORT.matcher(css);
        var recognized = new HashSet<Integer>();
        while (imports.find()) {
            recognized.add(imports.start(1));
            link(from,imports.group(3),selected,edges,SourceDependencyKind.STYLESHEET);
        }
        if (CSS_IMPORT_WORD.matcher(css).results().anyMatch(match -> !recognized.contains(match.start())))
            throw denied(CodeErrors.CODE_GRAPH_RESOURCE_DENIED.code());
    }

    private static void link(String from,String spec,Set<String> selected,List<Edge> edges,SourceDependencyKind kind) {
        boolean stylesheet=kind==SourceDependencyKind.STYLESHEET;
        if (!SPECIFIER.matcher(spec).matches() || (stylesheet && !spec.endsWith(".css")))
            throw denied((stylesheet ? CodeErrors.CODE_GRAPH_RESOURCE_DENIED : CodeErrors.CODE_GRAPH_IMPORT_DENIED).code());
        String resolved=Path.of(from).getParent().resolve(spec).normalize().toString().replace('\\','/');
        var candidates=(stylesheet || resource(spec) || kind==SourceDependencyKind.LAZY_MODULE ? List.of(resolved)
                : List.of(resolved,resolved+".vue",resolved+".ts",resolved+".js",resolved+"/index.ts"))
                .stream().filter(selected::contains).toList();
        if(candidates.size()!=1)throw denied(CodeErrors.CODE_GRAPH_UNDECLARED_IMPORT.code());
        var edge=new Edge(from,candidates.getFirst(),kind);
        if(!edges.contains(edge))edges.add(edge);
    }
    private static void visit(String path,List<Edge> edges,Set<String> active,Set<String> reached) {
        if(!active.add(path))throw denied(CodeErrors.CODE_GRAPH_CYCLE.code());
        if(reached.add(path))for(var edge:edges)if(edge.from().equals(path))visit(edge.to(),edges,active,reached);
        active.remove(path);
    }
    private static ResponseStatusException denied(String reason){return new ResponseStatusException(HttpStatus.BAD_REQUEST,reason);}
}
