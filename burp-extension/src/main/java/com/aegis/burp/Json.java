package com.aegis.burp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON parser + string escape helpers — no external dependencies.
 * The parser produces {@code Map<String,Object>}, {@code List<Object>},
 * {@code String}, {@code Double}, {@code Boolean} or {@code null}, which is
 * all the Aegis replay pool needs.
 */
final class Json {

    private Json() {}

    // ── Parsing ───────────────────────────────────────────────────────────────

    public static Object parse(String json) {
        if (json == null) return null;
        return new Parser(json).parseValue();
    }

    private static final class Parser {
        private final String src;
        private int i;

        Parser(String src) {
            this.src = src;
        }

        Object parseValue() {
            skipWs();
            if (i >= src.length()) throw new IllegalArgumentException("unexpected end of JSON");
            char c = src.charAt(i);
            switch (c) {
                case '{': return parseObject();
                case '[': return parseArray();
                case '"': return parseString();
                case 't': expect("true"); return Boolean.TRUE;
                case 'f': expect("false"); return Boolean.FALSE;
                case 'n': expect("null"); return null;
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) return parseNumber();
                    throw new IllegalArgumentException("unexpected character: " + c);
            }
        }

        private void skipWs() {
            while (i < src.length()) {
                char c = src.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        private Map<String, Object> parseObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            i++; // '{'
            skipWs();
            if (i < src.length() && src.charAt(i) == '}') { i++; return map; }
            while (true) {
                skipWs();
                String key = parseString();
                skipWs();
                if (i >= src.length() || src.charAt(i) != ':') throw new IllegalArgumentException("expected ':'");
                i++;
                map.put(key, parseValue());
                skipWs();
                if (i < src.length() && src.charAt(i) == ',') { i++; continue; }
                if (i < src.length() && src.charAt(i) == '}') { i++; return map; }
                throw new IllegalArgumentException("expected ',' or '}'");
            }
        }

        private List<Object> parseArray() {
            List<Object> list = new ArrayList<>();
            i++; // '['
            skipWs();
            if (i < src.length() && src.charAt(i) == ']') { i++; return list; }
            while (true) {
                list.add(parseValue());
                skipWs();
                if (i < src.length() && src.charAt(i) == ',') { i++; continue; }
                if (i < src.length() && src.charAt(i) == ']') { i++; return list; }
                throw new IllegalArgumentException("expected ',' or ']'");
            }
        }

        private String parseString() {
            i++; // opening '"'
            StringBuilder sb = new StringBuilder();
            while (i < src.length()) {
                char c = src.charAt(i);
                if (c == '"') { i++; return sb.toString(); }
                if (c == '\\') {
                    i++;
                    if (i >= src.length()) break;
                    char e = src.charAt(i);
                    switch (e) {
                        case '"': sb.append('"'); break;
                        case '\\': sb.append('\\'); break;
                        case '/': sb.append('/'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'u':
                            if (i + 4 >= src.length()) throw new IllegalArgumentException("bad \\u escape");
                            sb.append((char) Integer.parseInt(src.substring(i + 1, i + 5), 16));
                            i += 4;
                            break;
                        default: throw new IllegalArgumentException("bad escape: \\" + e);
                    }
                    i++;
                } else {
                    sb.append(c);
                    i++;
                }
            }
            throw new IllegalArgumentException("unterminated string");
        }

        private Double parseNumber() {
            int start = i;
            while (i < src.length()) {
                char c = src.charAt(i);
                if (c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E' || (c >= '0' && c <= '9')) i++;
                else break;
            }
            return Double.parseDouble(src.substring(start, i));
        }

        private void expect(String word) {
            if (src.startsWith(word, i)) { i += word.length(); return; }
            throw new IllegalArgumentException("expected " + word);
        }
    }

    // ── Serialization helpers ─────────────────────────────────────────────────

    /** Escape a string for embedding inside a JSON string literal (no surrounding quotes). */
    public static String escape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Escape and wrap a string as a full JSON string literal. */
    public static String quote(String s) {
        return "\"" + escape(s) + "\"";
    }
}
