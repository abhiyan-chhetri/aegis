package com.aegis.burp;

import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.logging.Logging;
import burp.api.montoya.websocket.BinaryMessage;
import burp.api.montoya.websocket.BinaryMessageAction;
import burp.api.montoya.websocket.Direction;
import burp.api.montoya.websocket.MessageHandler;
import burp.api.montoya.websocket.TextMessage;
import burp.api.montoya.websocket.TextMessageAction;
import burp.api.montoya.websocket.WebSocketCreated;
import burp.api.montoya.websocket.WebSocketCreatedHandler;

import java.net.URL;
import java.util.Base64;

/**
 * Captures in-scope WebSocket traffic as message events and enqueues them for
 * upload to the dedicated websocket ingest endpoint.
 */
public class WsRecorder implements WebSocketCreatedHandler {

    private final Config config;
    private final ScopeFilter scopeFilter;
    private final TrafficQueue queue;
    private final Logging logging;

    public WsRecorder(Config config, ScopeFilter scopeFilter, TrafficQueue queue, Logging logging) {
        this.config = config;
        this.scopeFilter = scopeFilter;
        this.queue = queue;
        this.logging = logging;
    }

    @Override
    public void handleWebSocketCreated(WebSocketCreated created) {
        try {
            if (!config.wsEnabled) return;
            HttpRequest upgrade = created.upgradeRequest();
            if (upgrade == null || upgrade.url() == null || upgrade.url().isEmpty()) return;
            URL url = new URL(upgrade.url());

            if (scopeFilter.isAegisServer(url)) return;
            if (!scopeFilter.inScope(url)) return;

            String host = url.getHost();
            String urlStr = url.toString();
            String tool = ScopeFilter.mapTool(created.toolSource());

            created.webSocket().registerMessageHandler(new MessageHandler() {
                @Override
                public TextMessageAction handleTextMessage(TextMessage m) {
                    try {
                        String direction = m.direction() == Direction.CLIENT_TO_SERVER ? "sent" : "received";
                        enqueue(host, urlStr, direction, m.payload(), tool);
                    } catch (Throwable t) {
                        logging.logToError("[Aegis Bridge] websocket text record failed: " + t);
                    }
                    return TextMessageAction.continueWith(m.payload());
                }

                @Override
                public BinaryMessageAction handleBinaryMessage(BinaryMessage m) {
                    try {
                        String direction = m.direction() == Direction.CLIENT_TO_SERVER ? "sent" : "received";
                        String b64 = Base64.getEncoder().encodeToString(m.payload().getBytes());
                        enqueue(host, urlStr, direction, b64, tool);
                    } catch (Throwable t) {
                        logging.logToError("[Aegis Bridge] websocket binary record failed: " + t);
                    }
                    return BinaryMessageAction.continueWith(m.payload());
                }

                @Override
                public void onClose() {
                    // no-op
                }
            });
        } catch (Throwable t) {
            logging.logToError("[Aegis Bridge] websocket hook failed: " + t);
        }
    }

    private void enqueue(String host, String url, String direction, String content, String tool) {
        StringBuilder sb = new StringBuilder(256);
        sb.append('{');
        field(sb, "host", host, false);
        field(sb, "url", url, false);
        field(sb, "direction", direction, false);
        field(sb, "content", content, false);
        field(sb, "tool", tool, false);
        field(sb, "timestamp", String.valueOf(System.currentTimeMillis()), true);
        sb.setLength(sb.length() - 1); // strip trailing comma
        sb.append('}');
        queue.enqueue(sb.toString());
    }

    private static void field(StringBuilder sb, String name, String value, boolean isJson) {
        sb.append(JsonWriter.quote(name)).append(':');
        if (isJson) sb.append(value);
        else sb.append(JsonWriter.quote(value));
        sb.append(',');
    }
}
