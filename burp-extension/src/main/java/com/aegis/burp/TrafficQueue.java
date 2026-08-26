package com.aegis.burp;

import burp.api.montoya.logging.Logging;

import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Async event batcher + sender. Events are enqueued from the Burp HTTP/WS
 * handler threads (fast), flushed on an interval or when the batch fills,
 * and POSTed to the Aegis ingest endpoint with the engagement key.
 *
 * When the server is unreachable, batches are spooled to disk so no captured
 * traffic is lost to a restart or queue overflow; they are replayed oldest-
 * first once the server is reachable again.
 */
public class TrafficQueue {

    private final Config config;
    private final Logging logging;
    private final String ingestUrl;
    private final List<String> queue = new ArrayList<>();

    private ScheduledExecutorService executor;
    private volatile boolean running;
    private long lastErrorAt;
    private long spoolSeq;
    private boolean spoolNotified;
    /** Status surface for the UI tab. */
    public volatile long lastFlushAt;
    public volatile String lastErrorMsg = "";
    public volatile long sentTotal;
    public volatile long droppedTotal;

    public TrafficQueue(Config config, Logging logging) {
        this(config, logging, config.ingestUrl());
    }

    public TrafficQueue(Config config, Logging logging, String ingestUrl) {
        this.config = config;
        this.logging = logging;
        this.ingestUrl = ingestUrl;
    }

    public synchronized void start() {
        if (running) return;
        running = true;
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "aegis-bridge-flush");
            t.setDaemon(true);
            return t;
        });
        int interval = Math.max(1, config.flushIntervalSec);
        executor.scheduleWithFixedDelay(this::flush, interval, interval, TimeUnit.SECONDS);
    }

    public synchronized void stop() {
        running = false;
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
    }

    /** Add one serialized event (a JSON object). Called from any thread. */
    public synchronized void enqueue(String eventJson) {
        if (!running || !config.enabled) return;
        if (queue.size() >= config.maxQueued) {
            queue.remove(0); // drop oldest — keep the feed fresh
        }
        queue.add(eventJson);
        if (queue.size() >= config.batchSize) {
            flush();
        }
    }

    public synchronized int queuedCount() {
        return queue.size();
    }

    public String statusLine() {
        return (config.enabled ? "running" : "paused")
                + " · queued " + queue.size()
                + " · sent " + sentTotal
                + (droppedTotal > 0 ? " · dropped " + droppedTotal : "")
                + (lastErrorMsg.isEmpty() ? "" : " · ⚠ " + lastErrorMsg);
    }

    private synchronized void flush() {
        if (!running) return;

        // 1. Replay persisted spool files (oldest first) before sending new data.
        //    Abort this flush entirely if a replay fails with RETRY (server down).
        if (!replaySpool()) return;

        // 2. Send a fresh batch from the in-memory queue.
        if (queue.isEmpty()) return;
        List<String> batch = new ArrayList<>(queue.subList(0, Math.min(Math.max(1, config.batchSize), queue.size())));
        String payload = payload(batch);

        SendResult r = send(payload);
        if (r == SendResult.OK) {
            queue.removeAll(batch);
            sentTotal += batch.size();
            lastFlushAt = System.currentTimeMillis();
            lastErrorMsg = "";
        } else if (r == SendResult.DROP) {
            // Auth failure — retrying is pointless; drop and tell the user once.
            queue.removeAll(batch);
            droppedTotal += batch.size();
            lastErrorMsg = "rejected by server (bad key?)";
            if (System.currentTimeMillis() - lastErrorAt > 30_000) {
                lastErrorAt = System.currentTimeMillis();
                logging.raiseErrorEvent("[Aegis Bridge] Events rejected by " + config.serverUrl
                        + " (bad engagement key?) — " + batch.size() + " event(s) dropped. Check the Aegis Bridge tab.");
            }
        } else {
            // RETRY: persist the batch to disk so it survives a restart / queue
            // overflow, then free the in-memory queue. If the disk write fails,
            // keep the events in memory and retry on the next tick.
            lastErrorMsg = "offline — spooling to " + config.spoolDir;
            if (spool(payload)) {
                queue.removeAll(batch);
                if (!spoolNotified) {
                    spoolNotified = true;
                    logging.logToOutput("[Aegis Bridge] offline — spooling to " + config.spoolDir);
                }
            }
        }
    }

    /** Replay up to 5 oldest spool files. Returns false (abort flush) if a
     *  replay hits RETRY — the server is still down. */
    private boolean replaySpool() {
        File dir = new File(config.spoolDir);
        File[] files;
        try {
            if (!dir.isDirectory()) return true;
            files = dir.listFiles((d, n) -> n.startsWith("spool-") && n.endsWith(".json"));
        } catch (Exception e) {
            return true; // spool dir unreadable — nothing to replay
        }
        if (files == null || files.length == 0) return true;
        try {
            Arrays.sort(files, Comparator.comparing(File::getName));
            int replayed = 0;
            for (File f : files) {
                if (replayed >= 5) break;
                String payload = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                SendResult r = send(payload);
                if (r == SendResult.OK || r == SendResult.DROP) {
                    deleteQuietly(f); // delivered, or auth is dead — unrecoverable either way
                    replayed++;
                } else {
                    return false; // server down — stop replaying, abort flush
                }
            }
        } catch (Exception e) {
            // Never let spool replay break capture.
            logging.logToError("[Aegis Bridge] spool replay failed: " + e.getMessage());
        }
        return true;
    }

    /** Write a batch payload to a spool file. Returns true on success. */
    private boolean spool(String payload) {
        try {
            File dir = new File(config.spoolDir);
            if (!dir.exists() && !dir.mkdirs() && !dir.isDirectory()) {
                return false;
            }
            String name = "spool-" + System.currentTimeMillis() + "-" + (++spoolSeq) + ".json";
            Files.write(new File(dir, name).toPath(), payload.getBytes(StandardCharsets.UTF_8));
            pruneSpool(dir);
            return true;
        } catch (Exception e) {
            logging.logToError("[Aegis Bridge] spool write failed: " + e.getMessage());
            return false;
        }
    }

    /** Drop oldest spool files once the count exceeds maxSpoolFiles. */
    private void pruneSpool(File dir) {
        try {
            File[] files = dir.listFiles((d, n) -> n.startsWith("spool-") && n.endsWith(".json"));
            if (files == null || files.length <= config.maxSpoolFiles) return;
            Arrays.sort(files, Comparator.comparing(File::getName));
            int excess = files.length - config.maxSpoolFiles;
            for (int i = 0; i < excess; i++) {
                deleteQuietly(files[i]);
            }
        } catch (Exception e) {
            // best-effort only
        }
    }

    private static void deleteQuietly(File f) {
        try {
            f.delete();
        } catch (Exception ignored) {
        }
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

    /** Lightweight connectivity check — POSTs an empty ping; the server replies
     *  pong after authenticating the key. Returns a human-readable result. */
    public String ping() {
        try {
            URL u = new URL(config.ingestUrl());
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-engagement-key", config.engagementKey);
            try (OutputStream os = conn.getOutputStream()) {
                os.write("{\"events\":[],\"ping\":true}".getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            String body = readBody(conn);
            if (code == 200 && body.contains("\"pong\"")) return "✓ connected — server reachable and engagement key accepted";
            if (code == 401) return "✗ engagement key rejected (401) — generate a key in Aegis → Burp Bridge → Settings";
            if (code == 200) return "✓ server reachable (unexpected body: " + truncate(body, 80) + ")";
            return "✗ server responded " + code + ": " + truncate(body, 120);
        } catch (Exception e) {
            return "✗ cannot reach " + config.serverUrl + " — " + e.getMessage();
        }
    }

    /** Enqueue a synthetic request/response so the user can verify the loop
     *  end-to-end (appears in Aegis → Burp tab as a "manual" event). */
    public void enqueueSample() {
        java.util.Map<String, String> reqH = new java.util.LinkedHashMap<>();
        reqH.put("Host", "api.example.test");
        reqH.put("User-Agent", "Aegis-Bridge-Test/1.0");
        java.util.Map<String, String> resH = new java.util.LinkedHashMap<>();
        resH.put("Content-Type", "application/json");
        resH.put("Server", "aegis-bridge-test");
        String ev = "{"
                + "\"method\":\"GET\","
                + "\"url\":\"" + "https://api.example.test/api/bridge-test?via=burp-extension" + "\","
                + "\"statusCode\":200,"
                + "\"contentType\":\"application/json\","
                + "\"requestHeaders\":" + JsonWriter.object(reqH) + ","
                + "\"requestBody\":\"\","
                + "\"responseHeaders\":" + JsonWriter.object(resH) + ","
                + "\"responseBody\":" + JsonWriter.quote("{\\\"ok\\\":true,\\\"note\\\":\\\"aegis burp bridge test event\\\"}") + ","
                + "\"tool\":\"manual\","
                + "\"timestamp\":" + System.currentTimeMillis()
                + "}";
        enqueue(ev);
        logging.logToOutput("[Aegis Bridge] test event queued — check the Aegis Burp tab within " + config.flushIntervalSec + "s.");
    }

    private enum SendResult { OK, DROP, RETRY }

    private SendResult send(String payload) {
        try {
            URL u = new URL(ingestUrl);
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
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
            if (code == 200) return SendResult.OK;
            if (code == 401 || code == 403) return SendResult.DROP;
            String err = readBody(conn);
            if (code >= 500) {
                logging.logToError("[Aegis Bridge] server error " + code + ": " + truncate(err, 300));
                return SendResult.RETRY;
            }
            logging.logToError("[Aegis Bridge] unexpected response " + code + ": " + truncate(err, 300));
            return SendResult.RETRY;
        } catch (Exception e) {
            // Network down / server not running — keep queued, retry next tick.
            logging.logToError("[Aegis Bridge] send failed: " + e.getMessage());
            return SendResult.RETRY;
        }
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

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }
}
