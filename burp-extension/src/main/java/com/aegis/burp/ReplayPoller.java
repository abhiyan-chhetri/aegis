package com.aegis.burp;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.HttpService;
import burp.api.montoya.http.message.HttpHeader;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Pulls queued replay tasks from Aegis and fires them from the tester's
 * machine via Burp. Aegis queues these tasks when its own server can't reach
 * a target (e.g. an internal host); the poller re-issues each request locally,
 * opens it in Repeater for the user, and reports the live response back.
 */
public class ReplayPoller {

    private static final int MAX_TASKS = 20;
    private static final int MAX_BODY = 50_000;

    private final Config config;
    private final MontoyaApi api;
    private ScheduledExecutorService executor;
    private boolean authRejectedLogged;

    public ReplayPoller(Config config, MontoyaApi api) {
        this.config = config;
        this.api = api;
    }

    public synchronized void start() {
        if (executor != null) return;
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "aegis-replay-poller");
            t.setDaemon(true);
            return t;
        });
        int interval = Math.max(1, config.replayPollSec);
        executor.scheduleWithFixedDelay(this::run, interval, interval, TimeUnit.SECONDS);
    }

    public synchronized void stop() {
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
    }

    private void run() {
        String poolUrl = config.ingestUrl().replace("/api/burp/traffic", "/api/burp/replay-pool");
        HttpURLConnection conn = null;
        try {
            URL u = new URL(poolUrl);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10_000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-engagement-key", config.engagementKey);

            int code = conn.getResponseCode();
            if (code == 401) {
                if (!authRejectedLogged) {
                    authRejectedLogged = true;
                    api.logging().logToError("[Aegis Bridge] replay pool auth rejected");
                }
                return;
            }
            if (code != 200) return;
            String body = readBody(conn);
            if (body == null || body.isEmpty()) return;
            processPool(body);
        } catch (Exception e) {
            // Network error / server down — retry next tick.
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @SuppressWarnings("unchecked")
    private void processPool(String body) {
        Object parsed;
        try {
            parsed = Json.parse(body);
        } catch (Exception e) {
            api.logging().logToError("[Aegis Bridge] replay pool parse failed: " + e.getMessage());
            return;
        }
        if (!(parsed instanceof Map)) return;
        Object tasksObj = ((Map<String, Object>) parsed).get("tasks");
        if (!(tasksObj instanceof List)) return;

        int count = 0;
        for (Object t : (List<Object>) tasksObj) {
            if (count >= MAX_TASKS) break;
            if (!(t instanceof Map)) continue;
            try {
                processTask((Map<String, Object>) t);
                count++;
            } catch (Throwable e) {
                // One bad task must never stop the loop.
                api.logging().logToError("[Aegis Bridge] replay task failed: " + e);
            }
        }
    }

    private void processTask(Map<String, Object> task) throws Exception {
        String id = str(task.get("id"));
        String method = str(task.get("method"));
        String urlStr = str(task.get("url"));
        String requestBody = str(task.get("requestBody"));
        Map<String, String> requestHeaders = headerMap(task.get("requestHeaders"));

        URL url = new URL(urlStr);
        String host = url.getHost();
        int port = url.getPort() > 0 ? url.getPort() : (url.getDefaultPort() > 0 ? url.getDefaultPort() : 80);
        boolean secure = "https".equalsIgnoreCase(url.getProtocol());

        String pathAndQuery = url.getPath() + (url.getQuery() != null ? "?" + url.getQuery() : "");
        if (pathAndQuery.isEmpty()) pathAndQuery = "/";

        // Build the raw HTTP/1.1 request text.
        StringBuilder raw = new StringBuilder(512);
        raw.append(method).append(' ').append(pathAndQuery).append(" HTTP/1.1\n");
        boolean hasHost = false;
        for (Map.Entry<String, String> e : requestHeaders.entrySet()) {
            String name = e.getKey();
            if (name == null || name.isEmpty()) continue;
            if ("host".equalsIgnoreCase(name)) hasHost = true;
            raw.append(name).append(": ").append(e.getValue() == null ? "" : e.getValue()).append('\n');
        }
        if (!hasHost) raw.append("Host: ").append(hostWithPort(url)).append('\n');
        raw.append('\n');
        if (requestBody != null && !requestBody.isEmpty()) raw.append(requestBody);

        HttpService svc = HttpService.httpService(host, port, secure);
        HttpRequest request = HttpRequest.httpRequest(svc, raw.toString());

        // Open it for the user regardless of whether the send succeeds.
        api.repeater().sendToRepeater(request, "Aegis replay");

        long t0 = System.currentTimeMillis();
        try {
            HttpRequestResponse hrr = api.http().sendRequest(request);
            long durationMs = System.currentTimeMillis() - t0;
            HttpResponse response = hrr.response();
            if (response == null) {
                postError(id, "no response");
                return;
            }
            int statusCode = response.statusCode();
            Map<String, String> headers = new LinkedHashMap<>();
            List<HttpHeader> respHeaders = response.headers();
            if (respHeaders != null) {
                for (HttpHeader h : respHeaders) {
                    if (h == null) continue;
                    headers.put(h.name(), h.value());
                }
            }
            String body = response.bodyToString();
            if (body == null) body = "";
            if (body.length() > MAX_BODY) body = body.substring(0, MAX_BODY);
            postSuccess(id, statusCode, headers, body, durationMs);
        } catch (Throwable e) {
            long durationMs = System.currentTimeMillis() - t0;
            postError(id, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    private void postSuccess(String taskId, int statusCode, Map<String, String> headers, String body, long durationMs) {
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"taskId\":").append(Json.quote(taskId));
        sb.append(",\"statusCode\":").append(statusCode);
        sb.append(",\"headers\":{");
        boolean first = true;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append(Json.quote(e.getKey())).append(':').append(Json.quote(e.getValue()));
        }
        sb.append("},\"body\":").append(Json.quote(body));
        sb.append(",\"durationMs\":").append(durationMs).append('}');
        post(sb.toString());
    }

    private void postError(String taskId, String error) {
        post("{\"taskId\":" + Json.quote(taskId) + ",\"error\":" + Json.quote(error) + "}");
    }

    private void post(String payload) {
        String resultUrl = config.ingestUrl().replace("/api/burp/traffic", "/api/burp/replay-result");
        HttpURLConnection conn = null;
        try {
            URL u = new URL(resultUrl);
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
            conn.getResponseCode();
        } catch (Exception e) {
            // Result delivery is best-effort — never let it break the loop.
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String hostWithPort(URL url) {
        int port = url.getPort();
        if (port > 0 && port != url.getDefaultPort()) return url.getHost() + ":" + port;
        return url.getHost();
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> headerMap(Object o) {
        Map<String, String> map = new LinkedHashMap<>();
        if (o instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) {
                map.put(String.valueOf(e.getKey()), str(e.getValue()));
            }
        }
        return map;
    }

    private static String readBody(HttpURLConnection conn) {
        try {
            java.io.InputStream in = conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream();
            if (in == null) return "";
            byte[] buf = in.readAllBytes();
            return new String(buf, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
