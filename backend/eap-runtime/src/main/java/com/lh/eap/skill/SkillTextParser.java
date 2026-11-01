package com.lh.eap.skill;

import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.io.*;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.yaml.snakeyaml.events.*;
import com.lh.eap.common.SensitiveData;

/** Parses only submitted text; never resolves links or filesystem paths. */
@Component
public class SkillTextParser {
    public record Resource(String path, String mediaType, String content) {}
    public record Parsed(String id, String version, String description, String sourceLabel, String rawSkillMd,
                         String instructions, List<Resource> resources, List<String> requiredCapabilities, String scope, String digest) {}
    public Parsed parse(Object value, String scope) {
        var input = fields(value, Set.of("rawSkillMd", "version", "sourceLabel", "resources", "requiredCapabilities"), "INVALID_SKILL_INPUT");
        String raw = text(input.get("rawSkillMd"), 16000, false, "INVALID_SKILL_INPUT");
        String version = text(input.get("version"), 32, false, "INVALID_SKILL_VERSION");
        if (!validVersion(version)) throw invalid("INVALID_SKILL_VERSION");
        String source = text(input.get("sourceLabel"), 200, false, "INVALID_SKILL_INPUT");
        var front = java.util.regex.Pattern.compile("\\A---\\r?\\n(.*?)^---\\r?\\n", java.util.regex.Pattern.DOTALL | java.util.regex.Pattern.MULTILINE).matcher(raw);
        if (!front.find()) throw invalid("INVALID_SKILL_FRONTMATTER");
        String instructions = raw.substring(front.end());
        if (instructions.isBlank()) throw invalid("INVALID_SKILL_BODY");
        var metadata = metadata(front.group(1));
        String name = text(metadata.get("name"), 64, false, "INVALID_SKILL_FRONTMATTER");
        if (!validId(name)) throw invalid("INVALID_SKILL_FRONTMATTER");
        String description = text(metadata.get("description"), 1024, false, "INVALID_SKILL_FRONTMATTER");
        if (metadata.containsKey("license")) text(metadata.get("license"), 200, false, "INVALID_SKILL_FRONTMATTER");
        if (metadata.containsKey("compatibility")) text(metadata.get("compatibility"), 500, false, "INVALID_SKILL_FRONTMATTER");
        if (metadata.containsKey("metadata")) {
            if (!(metadata.get("metadata") instanceof Map<?,?> extensions) || extensions.size() > 16) throw invalid("INVALID_SKILL_FRONTMATTER");
            extensions.forEach((k,v) -> { text(k, 64, false, "INVALID_SKILL_FRONTMATTER"); text(v, 500, true, "INVALID_SKILL_FRONTMATTER"); });
        }
        if (!(input.get("resources") instanceof List<?> entries) || entries.size() > 4) throw invalid("INVALID_SKILL_RESOURCE");
        var resources = new ArrayList<Resource>(); var seen = new HashSet<String>(); int total = raw.length();
        for (var entry : entries) {
            var fields = fields(entry, Set.of("path", "mediaType", "content"), "INVALID_SKILL_RESOURCE");
            String path = resourcePath(fields.get("path"));
            if (!seen.add(path.toLowerCase(Locale.ROOT))) throw invalid("INVALID_SKILL_RESOURCE");
            String media = text(fields.get("mediaType"), 40, false, "INVALID_SKILL_RESOURCE");
            if (!media.equals(path.toLowerCase(Locale.ROOT).endsWith(".md") ? "text/markdown" : "text/plain")) throw invalid("INVALID_SKILL_RESOURCE");
            String content = text(fields.get("content"), 16000, true, "INVALID_SKILL_RESOURCE");
            total += content.length();
            if (total > 24000) throw invalid("INVALID_SKILL_SIZE");
            resources.add(new Resource(path, media, content));
        }
        if (!(input.get("requiredCapabilities") instanceof List<?> entries2) || entries2.size() > 16) throw invalid("INVALID_SKILL_DEPENDENCIES");
        var dependencies = new ArrayList<String>();
        for (var entry : entries2) {
            String id = text(entry, 120, false, "INVALID_SKILL_DEPENDENCIES");
            if (!id.matches("[A-Za-z0-9][A-Za-z0-9._:-]*") || dependencies.contains(id)) throw invalid("INVALID_SKILL_DEPENDENCIES");
            dependencies.add(id);
        }
        // Detect rather than redact: content and its digest must never silently change.
        if (SensitiveData.containsSecret(raw) || SensitiveData.containsSecret(source)
                || resources.stream().anyMatch(r -> SensitiveData.containsSecret(r.path()) || SensitiveData.containsSecret(r.content()))
                || SensitiveData.containsSecret(dependencies)) throw invalid("INVALID_SKILL_SECRET");
        resources.sort(Comparator.comparing(Resource::path)); dependencies.sort(String::compareTo);
        var digestFields = new ArrayList<>(List.of("skill-text-v1", scope, name, version, source, raw, Integer.toString(resources.size())));
        for (var r : resources) digestFields.addAll(List.of(r.path(), r.mediaType(), r.content()));
        digestFields.add(Integer.toString(dependencies.size())); digestFields.addAll(dependencies);
        return new Parsed(name, version, description, source, raw, instructions, List.copyOf(resources), List.copyOf(dependencies), scope, digest(digestFields));
    }
    private Map<?,?> metadata(String text) {
        try {
            var options = new LoaderOptions(); options.setAllowDuplicateKeys(false); options.setMaxAliasesForCollections(0);
            options.setNestingDepthLimit(5); options.setCodePointLimit(16000);
            var yaml = new Yaml(new SafeConstructor(options)); int count = 0, documents = 0;
            for (var event : yaml.parse(new StringReader(text))) {
                if (++count > 160 || event instanceof AliasEvent || event instanceof NodeEvent node && node.getAnchor() != null
                        || event instanceof ScalarEvent scalar && scalar.getTag() != null
                        || event instanceof CollectionStartEvent collection && collection.getTag() != null) throw invalid("INVALID_SKILL_FRONTMATTER");
                if (event instanceof DocumentEndEvent end && end.getExplicit()) throw invalid("INVALID_SKILL_FRONTMATTER");
                if (event instanceof DocumentStartEvent && ++documents > 1) throw invalid("INVALID_SKILL_FRONTMATTER");
                if (event instanceof ScalarEvent scalar && scalar.getValue().equals("<<")) throw invalid("INVALID_SKILL_FRONTMATTER");
            }
            Object loaded = yaml.load(text);
            if (!(loaded instanceof Map<?,?> map) || !map.keySet().containsAll(Set.of("name", "description"))
                    || map.keySet().stream().anyMatch(k -> !Set.of("name", "description", "license", "compatibility", "metadata").contains(k))) throw invalid("INVALID_SKILL_FRONTMATTER");
            return map;
        } catch (ResponseStatusException rejected) { throw rejected; }
        catch (RuntimeException rejected) { throw invalid("INVALID_SKILL_FRONTMATTER"); }
    }
    public static boolean validId(String value) { return value != null && value.length() <= 64 && value.matches("[a-z0-9]+(?:-[a-z0-9]+)*"); }
    public static boolean validVersion(String value) { return value != null && value.length() <= 32 && value.matches("(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)"); }
    public static String resourcePath(Object value) {
        String path = text(value, 240, false, "INVALID_SKILL_RESOURCE");
        if (!path.matches("[A-Za-z0-9_-][A-Za-z0-9._-]*(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)*")
                || !path.toLowerCase(Locale.ROOT).matches(".*\\.(md|txt)") || path.contains("..")
                || Arrays.stream(path.split("/")).anyMatch(segment -> segment.equalsIgnoreCase("scripts"))) throw invalid("INVALID_SKILL_RESOURCE");
        return path;
    }
    static Map<?,?> fields(Object value, Set<String> keys, String code) {
        if (!(value instanceof Map<?,?> map) || !map.keySet().equals(keys)) throw invalid(code);
        return map;
    }
    static String text(Object value, int max, boolean blank, String code) {
        if (!(value instanceof String text) || text.length() > max || !blank && text.isBlank() || text.indexOf(0) >= 0
                || !StandardCharsets.UTF_8.newEncoder().canEncode(text)) throw invalid(code);
        return text;
    }
    public static ResponseStatusException invalid(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }
    static String digest(List<String> fields) {
        try {
            var bytes = new ByteArrayOutputStream();
            var output = new DataOutputStream(bytes);
            for (String field : fields) {
                byte[] value = field.getBytes(StandardCharsets.UTF_8);
                output.writeInt(value.length); output.write(value);
            }
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        } catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
}
