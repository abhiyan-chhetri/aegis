package com.aegis.burp;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.logging.Logging;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Local "Show in Burp" callback server. Keeps a bounded buffer of the most
 * recent captured HTTP exchanges and, on request, sends the matching request
 * back into Burp Repeater.
 */
public class RevealServer {

    private static final int CAPACITY = 3000;

    public static final class RecentExchange {
        public final String method;
        public final String url;
        public final HttpRequest request;
        public final long ts;

        public RecentExchange(String method, String url, HttpRequest request, long ts) {
            this.method = method;
            this.url = url;
            this.request = request;
            this.ts = ts;
        }
    }

    private final ArrayDeque<RecentExchange> buffer = new ArrayDeque<>();
    private final MontoyaApi api;
    private final Config config;
    private final Logging logging;
    private volatile HttpServer server;

    public RevealServer(MontoyaApi api, Config config) {
        this.api = api;
        this.config = config;
        this.logging = api.logging();
    }

    /** Remember a captured exchange. Called from the HTTP handler threads. */
    public synchronized void record(String method, String url, HttpRequest request, long ts) {
        buffer.addLast(new RecentExchange(method, url, request, ts));
        while (buffer.size() > CAPACITY) {
            buffer.removeFirst();
        }
    }

    public void start() {
        int port = config.revealPort;
        if (port <= 0) return;
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
            s.createContext("/", this::handle);
            s.setExecutor(Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(r, "aegis-reveal");
                t.setDaemon(true);
                return t;
            }));
            s.start();
            server = s;
            logging.logToOutput("[Aegis Bridge] reveal server listening on http://127.0.0.1:" + port + "/reveal");
        } catch (Exception e) {
            logging.logToError("[Aegis Bridge] reveal server failed to start on port " + port + ": " + e.getMessage());
        }
    }

    public void stop() {
        HttpServer s = server;
        if (s != null) {
            s.stop(0);
            server = null;
        }
    }

    private void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            if ("/ping".equals(path)) {
                respond(ex, 200, "pong");
                return;
            }
            if ("/reveal".equals(path)) {
                Map<String, String> params = parseQuery(ex.getRequestURI().getRawQuery());
                String method = params.getOrDefault("method", "");
                String url = params.getOrDefault("url", "");
                long at = 0;
                try {
                    at = Long.parseLong(params.getOrDefault("at", "0"));
                } catch (NumberFormatException ignored) {
                    // at defaults to 0 → any match is fine
                }
                RecentExchange match = find(method, url, at);
                if (match != null) {
                    api.repeater().sendToRepeater(match.request, "Aegis");
                    respond(ex, 200, "opened");
                } else {
                    respond(ex, 200, "not found");
                }
                return;
            }
            respond(ex, 404, "not found");
        } catch (Throwable t) {
            logging.logToError("[Aegis Bridge] reveal request failed: " + t);
            try {
                respond(ex, 500, "error");
            } catch (IOException ignored) {
                // connection already gone
            }
        }
    }

    private synchronized RecentExchange find(String method, String url, long at) {
        RecentExchange best = null;
        long bestDiff = Long.MAX_VALUE;
        for (RecentExchange e : buffer) {
            if (!e.method.equals(method) || !e.url.equals(url)) continue;
            if (at == 0) return e; // any match is fine
            long diff = Math.abs(e.ts - at);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = e;
            }
        }
        return best;
    }

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null) return map;
        for (String pair : query.split("&")) {
            int i = pair.indexOf('=');
            if (i < 0) {
                map.put(decode(pair), "");
            } else {
                map.put(decode(pair.substring(0, i)), decode(pair.substring(i + 1)));
            }
        }
        return map;
    }

    private static String decode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }

    private static void respond(HttpExchange ex, int code, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
