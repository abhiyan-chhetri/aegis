package com.aegis.burp;

import burp.api.montoya.http.message.HttpHeader;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;
import burp.api.montoya.logging.Logging;
import burp.api.montoya.ui.contextmenu.ContextMenuEvent;
import burp.api.montoya.ui.contextmenu.ContextMenuItemsProvider;

import javax.swing.JMenuItem;
import java.awt.Component;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Right-click → "Send to Aegis (Burp Bridge)" context menu provider. Sends the
 * selected request/response pairs straight to the Aegis ingest API so a tester
 * can hand-pick interesting exchanges without enabling full capture.
 */
public class ContextSend implements ContextMenuItemsProvider {

    private static final int MAX_PAIRS = 20;
    private static final int MAX_BODY = 100_000;

    private final Config config;
    private final Logging logging;
    private boolean authRejectedLogged;

    public ContextSend(Config config, Logging logging) {
        this.config = config;
        this.logging = logging;
    }

    @Override
    public List<Component> provideMenuItems(ContextMenuEvent event) {
        JMenuItem item = new JMenuItem("Send to Aegis (Burp Bridge)");
        item.addActionListener(e -> send(event));
        List<Component> items = new ArrayList<>(1);
        items.add(item);
        return items;
    }

    private void send(ContextMenuEvent event) {
        if (config.engagementKey == null || config.engagementKey.isEmpty()) {
            logging.raiseInfoEvent("[Aegis Bridge] set an engagement key first");
            return;
        }
        List<HttpRequestResponse> selected = event.selectedRequestResponses();
        if (selected == null || selected.isEmpty()) return;

        List<String> events = new ArrayList<>();
        int n = 0;
        for (HttpRequestResponse hrr : selected) {
            if (n >= MAX_PAIRS) break;
            if (hrr == null) continue;
            try {
                events.add(toEvent(hrr));
                n++;
            } catch (Throwable t) {
                logging.logToError("[Aegis Bridge] context send failed to serialize a pair: " + t);
            }
        }
        if (n == 0) return;

        post(payload(events), n);
    }

    private void post(String payload, int count) {
        HttpURLConnection conn = null;
        try {
            String endpoint = config.serverUrl.replaceAll("/+$", "") + "/api/burp/context";
            URL u = new URL(endpoint);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-engagement-key", config.engagementKey);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code == 200) {
                logging.logToOutput("[Aegis Bridge] sent " + count + " pair(s) to Aegis — see the project's Traffic tab");
            } else if (code == 401) {
                if (!authRejectedLogged) {
                    authRejectedLogged = true;
                    logging.logToError("[Aegis Bridge] context send rejected (401) — check your engagement key");
                }
            } else {
                logging.logToError("[Aegis Bridge] context send failed: server responded " + code);
            }
        } catch (Exception e) {
            logging.logToError("[Aegis Bridge] context send failed: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ── Event building helpers (mirrors TrafficRecorder) ──────────────────────

    private static String toEvent(HttpRequestResponse hrr) {
        HttpRequest req = hrr.request();
        HttpResponse res = hrr.response();

        Map<String, String> reqHeaders = headersToMap(req == null ? null : req.headers());
        Map<String, String> resHeaders = headersToMap(res == null ? null : res.headers());

        String contentType = "";
        if (res != null) {
            contentType = res.headerValue("Content-Type");
            if (contentType == null) contentType = "";
            int semi = contentType.indexOf(';');
            if (semi >= 0) contentType = contentType.substring(0, semi).trim();
        }

        int statusCode = res == null ? 0 : (int) res.statusCode();
        String requestBody = cap(req == null ? null : req.bodyToString());
        String responseBody = cap(res == null ? null : res.bodyToString());

        StringBuilder sb = new StringBuilder(512);
        sb.append('{');
        field(sb, "method", req == null ? "" : req.method(), false);
        field(sb, "url", req == null ? "" : req.url(), false);
        field(sb, "statusCode", String.valueOf(statusCode), true);
        field(sb, "contentType", contentType, false);
        field(sb, "requestHeaders", JsonWriter.object(reqHeaders), true);
        field(sb, "requestBody", requestBody, false);
        field(sb, "responseHeaders", JsonWriter.object(resHeaders), true);
        field(sb, "responseBody", responseBody, false);
        field(sb, "tool", "manual", false);
        field(sb, "timestamp", String.valueOf(System.currentTimeMillis()), true);
        sb.setLength(sb.length() - 1); // strip trailing comma
        sb.append('}');
        return sb.toString();
    }

    private static void field(StringBuilder sb, String name, String value, boolean isJson) {
        sb.append(JsonWriter.quote(name)).append(':');
        if (isJson) sb.append(value);
        else sb.append(JsonWriter.quote(value));
        sb.append(',');
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

    private static String cap(String s) {
        if (s == null) return "";
        return s.length() <= MAX_BODY ? s : s.substring(0, MAX_BODY);
    }

    private static String payload(List<String> events) {
        StringBuilder body = new StringBuilder("{\"events\":[");
        for (int i = 0; i < events.size(); i++) {
            if (i > 0) body.append(',');
            body.append(events.get(i));
        }
        body.append("]}");
        return body.toString();
    }
}
