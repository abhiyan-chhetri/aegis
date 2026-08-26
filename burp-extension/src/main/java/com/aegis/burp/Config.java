package com.aegis.burp;

import burp.api.montoya.persistence.Preferences;

/**
 * Extension configuration, persisted in Burp's preference store so it
 * survives restarts.
 */
public class Config {

    public String serverUrl = "http://localhost:3000";
    public String engagementKey = "";
    public boolean enabled = true;
    public boolean useProjectScope = true;
    public String hostAllowlist = "";
    public boolean skipStatic = true;
    public int flushIntervalSec = 2;
    public int batchSize = 50;
    public int maxQueued = 500;
    public String spoolDir = System.getProperty("java.io.tmpdir") + "/aegis-bridge-spool";
    public int maxSpoolFiles = 50;
    public boolean wsEnabled = true;
    public int revealPort = 8787;
    public int replayPollSec = 10;

    private static final String P_SERVER = "aegis.serverUrl";
    private static final String P_KEY = "aegis.engagementKey";
    private static final String P_ENABLED = "aegis.enabled";
    private static final String P_SCOPE = "aegis.useProjectScope";
    private static final String P_HOSTS = "aegis.hostAllowlist";
    private static final String P_STATIC = "aegis.skipStatic";
    private static final String P_FLUSH = "aegis.flushIntervalSec";
    private static final String P_BATCH = "aegis.batchSize";
    private static final String P_MAX = "aegis.maxQueued";
    private static final String P_SPOOL_DIR = "aegis.spoolDir";
    private static final String P_MAX_SPOOL = "aegis.maxSpoolFiles";
    private static final String P_WS = "aegis.wsEnabled";
    private static final String P_REVEAL = "aegis.revealPort";
    private static final String P_REPLAY_POLL = "aegis.replayPollSec";

    private Config() {}

    public static Config load(Preferences prefs) {
        Config c = new Config();
        c.serverUrl = str(prefs.getString(P_SERVER), c.serverUrl);
        c.engagementKey = str(prefs.getString(P_KEY), "");
        c.enabled = prefs.getBoolean(P_ENABLED) == null || prefs.getBoolean(P_ENABLED);
        c.useProjectScope = prefs.getBoolean(P_SCOPE) == null || prefs.getBoolean(P_SCOPE);
        c.hostAllowlist = str(prefs.getString(P_HOSTS), "");
        c.skipStatic = prefs.getBoolean(P_STATIC) == null || prefs.getBoolean(P_STATIC);
        c.flushIntervalSec = intOr(prefs.getString(P_FLUSH), 2);
        c.batchSize = intOr(prefs.getString(P_BATCH), 50);
        c.maxQueued = intOr(prefs.getString(P_MAX), 500);
        c.spoolDir = str(prefs.getString(P_SPOOL_DIR), c.spoolDir);
        c.maxSpoolFiles = intOr(prefs.getString(P_MAX_SPOOL), 50);
        c.wsEnabled = prefs.getBoolean(P_WS) == null || prefs.getBoolean(P_WS);
        c.revealPort = intAllowZero(prefs.getString(P_REVEAL), 8787);
        c.replayPollSec = intOr(prefs.getString(P_REPLAY_POLL), 10);
        return c;
    }

    public void save(Preferences prefs) {
        prefs.setString(P_SERVER, serverUrl);
        prefs.setString(P_KEY, engagementKey);
        prefs.setBoolean(P_ENABLED, enabled);
        prefs.setBoolean(P_SCOPE, useProjectScope);
        prefs.setString(P_HOSTS, hostAllowlist);
        prefs.setBoolean(P_STATIC, skipStatic);
        prefs.setString(P_FLUSH, String.valueOf(flushIntervalSec));
        prefs.setString(P_BATCH, String.valueOf(batchSize));
        prefs.setString(P_MAX, String.valueOf(maxQueued));
        prefs.setString(P_SPOOL_DIR, spoolDir);
        prefs.setString(P_MAX_SPOOL, String.valueOf(maxSpoolFiles));
        prefs.setBoolean(P_WS, wsEnabled);
        prefs.setString(P_REVEAL, String.valueOf(revealPort));
        prefs.setString(P_REPLAY_POLL, String.valueOf(replayPollSec));
    }

    /** Ingest endpoint the extension posts events to. */
    public String ingestUrl() {
        return serverUrl.replaceAll("/+$", "") + "/api/burp/traffic";
    }

    /** Ingest endpoint the extension posts websocket events to. */
    public String wsUrl() {
        return serverUrl.replaceAll("/+$", "") + "/api/burp/websocket";
    }

    /** Host:port of the configured server — used to avoid capturing our own calls. */
    public String serverHostPort() {
        try {
            java.net.URL u = new java.net.URL(serverUrl.replaceAll("/+$", ""));
            return (u.getHost() + ":" + (u.getPort() > 0 ? u.getPort() : (u.getDefaultPort() > 0 ? u.getDefaultPort() : 80))).toLowerCase();
        } catch (Exception e) {
            return "";
        }
    }

    private static String str(String v, String fallback) {
        return v == null || v.isEmpty() ? fallback : v;
    }

    private static int intOr(String v, int fallback) {
        if (v == null || v.isEmpty()) return fallback;
        try {
            int n = Integer.parseInt(v.trim());
            return n > 0 ? n : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** Like intOr but 0 is a valid value (used for "disabled" ports). */
    private static int intAllowZero(String v, int fallback) {
        if (v == null || v.isEmpty()) return fallback;
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
