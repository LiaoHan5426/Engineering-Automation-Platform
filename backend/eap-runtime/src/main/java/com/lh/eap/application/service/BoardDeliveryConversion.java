package com.lh.eap.application.service;

import java.util.*;
import java.util.function.BiFunction;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

/** Safe subset of Git's clean-side EOL conversion. Never execute a configured helper.
 * Raw source/evidence hashes are deliberately not canonicalized. Index EOL is only the
 * auto-conversion CRLF guard, never a substitute for reading/hash-checking current bytes.
 */
final class BoardDeliveryConversion {
    private static final List<String> ATTRIBUTES = List.of("text", "eol", "crlf", "filter", "ident", "working-tree-encoding");
    record Rules(String autocrlf, Map<String, Map<String, String>> attributes, Map<String, String> indexEol) {
        byte[] canonical(String path, byte[] raw) {
            var attrs = attributes.get(path);
            for (String name : List.of("crlf", "filter", "ident", "working-tree-encoding")) {
                if (!Set.of("unspecified", "unset").contains(attrs.get(name))) throw unsupported();
            }
            // Legacy -crlf has semantics of its own: do not guess its precedence with text/eol.
            if (!"unspecified".equals(attrs.get("crlf"))) throw unsupported();
            String text = attrs.get("text"), eol = attrs.get("eol");
            if (!Set.of("unspecified", "unset", "set", "auto").contains(text)
                    || !Set.of("unspecified", "unset", "lf", "crlf").contains(eol)) throw unsupported();
            if ("unset".equals(text)) return raw;
            boolean auto = "auto".equals(text) || ("unspecified".equals(text) && !Set.of("lf", "crlf").contains(eol));
            if (auto && "unspecified".equals(text) && "false".equals(autocrlf)) return raw;
            if (auto) {
                // Git does not normalize auto text when the index already contains CRLF.
                if (Set.of("crlf", "mixed").contains(indexEol.getOrDefault(path, "none"))) return raw;
                // NUL and lone CR are definitely binary to Git. For other control-byte
                // heuristics fail closed rather than pretending to implement all of convert.c.
                boolean controls = false;
                for (int i = 0; i < raw.length; i++) {
                    int b = raw[i] & 255;
                    if (b == 0 || (b == '\r' && (i + 1 == raw.length || raw[i + 1] != '\n'))) return raw;
                    if ((b < 32 && b != '\r' && b != '\n' && b != '\t') || b == 127) controls = true;
                }
                if (controls) throw unsupported();
            }
            byte[] converted = new byte[raw.length]; int count = 0;
            for (int i = 0; i < raw.length; i++) {
                if (raw[i] == '\r' && i + 1 < raw.length && raw[i + 1] == '\n') continue;
                converted[count++] = raw[i];
            }
            return count == raw.length ? raw : Arrays.copyOf(converted, count);
        }
    }
    static Rules inspect(List<String> paths, BiFunction<String, List<String>, String> invoke) {
        String autocrlf = invoke.apply("autocrlf", List.of()).strip().toLowerCase(Locale.ROOT);
        // Untyped Git output conflates explicit empty (false) with valueless (true).
        // Only ask for a boolean when blank, since the valid "input" mode is not a boolean.
        if (autocrlf.isEmpty()) {
            autocrlf = invoke.apply("autocrlf-bool", List.of()).strip();
            if (!Set.of("true", "false").contains(autocrlf)) throw unsupported();
        }
        autocrlf = switch (autocrlf) { case "yes", "on", "1" -> "true"; case "no", "off", "0" -> "false"; default -> autocrlf; };
        if (!Set.of("true", "false", "input").contains(autocrlf)) throw unsupported();
        var index = new HashMap<String, String>();
        var all = new HashMap<String, Map<String, String>>();
        for (int start = 0; start < paths.size();) {
            int end = start, chars = 0;
            while (end < paths.size() && end - start < 64 && chars + paths.get(end).length() < 16000) chars += paths.get(end++).length();
            if (end == start) throw unsupported();
            var batch = paths.subList(start, end);
            for (String line : invoke.apply("index-eol", batch).split("\0")) {
                if (line.isEmpty()) continue;
                int tab = line.indexOf('\t');
                if (tab < 0 || !line.startsWith("i/")) throw unsupported();
                String eol = line.substring(2, tab).strip().split("\\s+")[0], path = line.substring(tab + 1);
                if (!batch.contains(path) || !Set.of("none", "lf", "crlf", "mixed", "-text").contains(eol)
                        || index.put(path, eol) != null) throw unsupported();
            }
            String[] fields = invoke.apply("attributes", batch).split("\0", -1);
            if (fields.length != batch.size() * ATTRIBUTES.size() * 3 + 1 || !fields[fields.length - 1].isEmpty()) throw unsupported();
            int offset = 0;
            for (String path : batch) {
                var values = new HashMap<String, String>();
                for (String name : ATTRIBUTES) {
                    if (!path.equals(fields[offset++]) || !name.equals(fields[offset++])) throw unsupported();
                    values.put(name, fields[offset++]);
                }
                all.put(path, Map.copyOf(values));
            }
            start = end;
        }
        return new Rules(autocrlf, Map.copyOf(all), Map.copyOf(index));
    }
    private static org.springframework.web.server.ResponseStatusException unsupported() { return denied("BOARD_DELIVERY_CONVERSION_UNSUPPORTED"); }
}
