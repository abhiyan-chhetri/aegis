package com.aegis.burp;

import burp.api.montoya.core.ToolSource;
import burp.api.montoya.core.ToolType;
import burp.api.montoya.scope.Scope;

import java.net.URL;

/**
 * Shared scope / noise filtering + tool mapping, used by both the HTTP
 * recorder and the WebSocket recorder so the two paths apply identical rules.
 */
public class ScopeFilter {

    private final Config config;
    private final Scope scope;

    public ScopeFilter(Config config, Scope scope) {
        this.config = config;
        this.scope = scope;
    }

    /** True if the URL falls within the configured capture scope. */
    public boolean inScope(URL url) {
        if (!config.useProjectScope) {
            String allow = config.hostAllowlist == null ? "" : config.hostAllowlist.trim();
            if (allow.isEmpty()) return true; // capture all
            String host = url.getHost().toLowerCase();
            for (String line : allow.split("\\R")) {
                String h = line.trim().toLowerCase();
                if (h.isEmpty()) continue;
                if (h.startsWith("*.")) {
                    String base = h.substring(2);
                    if (host.equals(base) || host.endsWith("." + base)) return true;
                } else if (h.equals(host)) {
                    return true;
                }
            }
            return false;
        }
        try {
            return scope != null && scope.isInScope(url.toString());
        } catch (Throwable e) {
            return true; // scope API unavailable — don't silently drop traffic
        }
    }

    /** True if the URL points at the Aegis server itself (avoid self-capture). */
    public boolean isAegisServer(URL url) {
        String serverHost = config.serverHostPort();
        if (serverHost.isEmpty()) return false;
        String host = url.getHost().toLowerCase();
        int port = url.getPort() > 0 ? url.getPort() : (url.getDefaultPort() > 0 ? url.getDefaultPort() : 80);
        return serverHost.equals(host + ":" + port);
    }

    /** Map a Burp tool source to the short tool name used in event payloads. */
    public static String mapTool(ToolSource toolSource) {
        try {
            if (toolSource == null || toolSource.toolType() == null) return "proxy";
            ToolType t = toolSource.toolType();
            if (t == ToolType.REPEATER) return "repeater";
            if (t == ToolType.INTRUDER) return "intruder";
            if (t == ToolType.SCANNER) return "scanner";
            if (t == ToolType.PROXY) return "proxy";
            return "other";
        } catch (Throwable e) {
            return "proxy";
        }
    }
}
