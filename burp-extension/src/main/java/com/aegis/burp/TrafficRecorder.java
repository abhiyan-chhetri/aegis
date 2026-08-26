package com.aegis.burp;

import burp.api.montoya.http.handler.HttpHandler;
import burp.api.montoya.http.handler.HttpRequestToBeSent;
import burp.api.montoya.http.handler.HttpResponseReceived;
import burp.api.montoya.http.handler.RequestToBeSentAction;
import burp.api.montoya.http.handler.ResponseReceivedAction;
import burp.api.montoya.http.message.HttpHeader;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.logging.Logging;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Captures in-scope traffic as full request/response pairs and enqueues them
 * for upload. Response-driven: a complete pair is built from the response
 * plus its initiating request, so each event is one HTTP exchange.
 *
 * Filters (all configurable in the tab):
 *  - scope: Burp project scope, a host allowlist, or everything
 *  - noise: static assets (images/fonts/css/archives…), own Aegis calls
 */
public class TrafficRecorder implements HttpHandler {

    private static final Set<String> STATIC_EXT = Set.of(
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif",
            ".css", ".woff", ".woff2", ".ttf", ".otf", ".eot",
            ".mp4", ".webm", ".mp3", ".wav", ".ogg",
            ".pdf", ".zip", ".gz", ".tar", ".7z", ".exe", ".dmg", ".bin");

    private final Config config;
    private final TrafficQueue queue;
    private final ScopeFilter scopeFilter;
    private final RevealServer revealServer;
    private final Logging logging;

    public TrafficRecorder(Config config, TrafficQueue queue, ScopeFilter scopeFilter, RevealServer revealServer, Logging logging) {
        this.config = config;
        this.queue = queue;
        this.scopeFilter = scopeFilter;
        this.revealServer = revealServer;
        this.logging = logging;
    }

    @Override
    public RequestToBeSentAction handleHttpRequestToBeSent(HttpRequestToBeSent request) {
        // Response-driven capture — nothing to do for outgoing requests.
        return RequestToBeSentAction.continueWith(request);
    }

    @Override
    public ResponseReceivedAction handleHttpResponseReceived(HttpResponseReceived response) {
        try {
            if (!config.enabled) return ResponseReceivedAction.continueWith(response);
            HttpRequest req = response.initiatingRequest();
            if (req == null || req.url() == null || req.url().isEmpty()) {
                return ResponseReceivedAction.continueWith(response);
            }
            URL url = new URL(req.url());

            if (scopeFilter.isAegisServer(url)) return ResponseReceivedAction.continueWith(response);
            if (!scopeFilter.inScope(url)) return ResponseReceivedAction.continueWith(response);
            if (config.skipStatic && isStatic(url, response)) return ResponseReceivedAction.continueWith(response);

            revealServer.record(req.method(), url.toString(), req, System.currentTimeMillis());

            Map<String, String> reqHeaders = headersToMap(req.headers());
            Map<String, String> resHeaders = headersToMap(response.headers());
            String contentType = response.headerValue("Content-Type");
            if (contentType == null) contentType = "";
            int semi = contentType.indexOf(';');
            if (semi >= 0) contentType = contentType.substring(0, semi).trim();

            String tool = ScopeFilter.mapTool(response.toolSource());

            StringBuilder sb = new StringBuilder(512);
            sb.append('{');
            field(sb, "method", req.method(), false);
            field(sb, "url", url.toString(), false);
            field(sb, "statusCode", String.valueOf(response.statusCode()), true);
            field(sb, "contentType", contentType, false);
            field(sb, "requestHeaders", JsonWriter.object(reqHeaders), true);
            field(sb, "requestBody", bodyString(req.body().getBytes()), false);
            field(sb, "responseHeaders", JsonWriter.object(resHeaders), true);
            field(sb, "responseBody", bodyString(response.body().getBytes()), false);
            field(sb, "tool", tool, false);
            field(sb, "timestamp", String.valueOf(System.currentTimeMillis()), true);
            sb.setLength(sb.length() - 1); // strip trailing comma
            sb.append('}');

            queue.enqueue(sb.toString());
        } catch (Throwable t) {
            logging.logToError("[Aegis Bridge] record failed: " + t);
        }
        return ResponseReceivedAction.continueWith(response);
    }

    // ── Event building helpers ────────────────────────────────────────────────

    private static void field(StringBuilder sb, String name, String value, boolean isJson) {
        sb.append(JsonWriter.quote(name)).append(':');
        if (isJson) sb.append(value);
        else sb.append(JsonWriter.quote(value));
        sb.append(',');
    }

    private static String bodyString(byte[] body) {
        if (body == null) return "";
        int len = Math.min(body.length, 100_000);
        return new String(body, 0, len, StandardCharsets.UTF_8);
    }

    private static Map<String, String> headersToMap(List<HttpHeader> headers) {
        Map<String, String> map = new LinkedHashMap<>();
        if (headers == null) return map;
        for (HttpHeader h : headers) {
            if (h == null) continue;
            String name = h.name();
            String value = h.value();
            if (value.length() > 2000) value = value.substring(0, 2000);
            map.put(name, value);
        }
        return map;
    }

    private boolean isStatic(URL url, HttpResponseReceived response) {
        String p = url.getPath().toLowerCase();
        for (String ext : STATIC_EXT) {
            if (p.endsWith(ext)) return true;
        }
        String ct = response.headerValue("Content-Type");
        if (ct == null) return false;
        ct = ct.toLowerCase();
        return ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/")
                || ct.startsWith("font/") || ct.startsWith("application/x-font")
                || ct.startsWith("application/octet-stream");
    }

}
