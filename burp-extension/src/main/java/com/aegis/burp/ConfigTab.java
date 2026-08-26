package com.aegis.burp;

import burp.api.montoya.MontoyaApi;

import javax.swing.*;
import java.awt.*;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * "Aegis Bridge" suite tab — server URL, engagement key, scope/noise filters,
 * batching, and live status. All settings persist across restarts.
 */
public class ConfigTab {

    private final MontoyaApi api;
    private final Config config;
    private final TrafficQueue queue;

    private JTextField serverField;
    private JTextField keyField;
    private JTextField pairCodeField;
    private JCheckBox enabledCheck;
    private JCheckBox scopeCheck;
    private JTextArea hostsArea;
    private JCheckBox staticCheck;
    private JTextField intervalField;
    private JTextField replayPollField;
    private JTextField batchField;
    private JCheckBox wsCheck;
    private JTextField spoolField;
    private JTextField revealPortField;
    private JLabel callbackLabel;
    private JLabel statusLabel;

    public ConfigTab(MontoyaApi api, Config config, TrafficQueue queue) {
        this.api = api;
        this.config = config;
        this.queue = queue;
    }

    public JPanel build() {
        JPanel root = new JPanel(new BorderLayout(8, 8));
        root.setBorder(BorderFactory.createEmptyBorder(12, 12, 12, 12));

        // ── Top: settings grid ────────────────────────────────────────────────
        JPanel form = new JPanel(new GridBagLayout());
        GridBagConstraints g = new GridBagConstraints();
        g.insets = new Insets(4, 4, 4, 4);
        g.fill = GridBagConstraints.HORIZONTAL;
        g.weightx = 1;

        int row = 0;
        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Aegis server URL"), g);
        g.gridx = 1; g.weightx = 1;
        serverField = new JTextField(config.serverUrl);
        form.add(serverField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Engagement key"), g);
        g.gridx = 1; g.weightx = 1;
        keyField = new JTextField(config.engagementKey);
        form.add(keyField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Pairing code"), g);
        g.gridx = 1; g.weightx = 1;
        JPanel pairPanel = new JPanel(new BorderLayout(4, 0));
        pairCodeField = new JTextField();
        pairCodeField.setToolTipText("Paste the one-time pairing code from Aegis → Burp Bridge → Settings; fills in the server URL and engagement key automatically.");
        JButton pairBtn = new JButton("Pair");
        pairBtn.addActionListener(e -> pair());
        pairPanel.add(pairCodeField, BorderLayout.CENTER);
        pairPanel.add(pairBtn, BorderLayout.EAST);
        form.add(pairPanel, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        enabledCheck = new JCheckBox("Capture traffic", config.enabled);
        g.gridx = 1; g.weightx = 1;
        form.add(enabledCheck, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        scopeCheck = new JCheckBox("Use Burp project scope", config.useProjectScope);
        g.gridx = 1; g.weightx = 1;
        form.add(scopeCheck, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Host allowlist"), g);
        g.gridx = 1; g.weightx = 1;
        hostsArea = new JTextArea(config.hostAllowlist, 4, 40);
        hostsArea.setToolTipText("One host per line, wildcards ok (*.example.com). Used when 'Burp project scope' is off. Empty = capture all.");
        form.add(new JScrollPane(hostsArea), g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        staticCheck = new JCheckBox("Skip static assets (images/fonts/css…)", config.skipStatic);
        g.gridx = 1; g.weightx = 1;
        form.add(staticCheck, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Flush interval (s)"), g);
        g.gridx = 1; g.weightx = 0;
        intervalField = new JTextField(String.valueOf(config.flushIntervalSec), 6);
        form.add(intervalField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Replay poll (s)"), g);
        g.gridx = 1; g.weightx = 0;
        replayPollField = new JTextField(String.valueOf(config.replayPollSec), 6);
        replayPollField.setToolTipText("How often (seconds) to pull queued replay tasks from Aegis and fire them from Burp.");
        form.add(replayPollField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Batch size"), g);
        g.gridx = 1; g.weightx = 0;
        batchField = new JTextField(String.valueOf(config.batchSize), 6);
        form.add(batchField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        wsCheck = new JCheckBox("WebSocket capture", config.wsEnabled);
        g.gridx = 1; g.weightx = 1;
        form.add(wsCheck, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Spool dir"), g);
        g.gridx = 1; g.weightx = 1;
        spoolField = new JTextField(config.spoolDir);
        spoolField.setToolTipText("Where offline batches are written when the server is unreachable.");
        form.add(spoolField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Reveal port"), g);
        g.gridx = 1; g.weightx = 0;
        revealPortField = new JTextField(String.valueOf(config.revealPort), 6);
        revealPortField.setToolTipText("Local 'Show in Burp' callback server port (0 = disabled).");
        form.add(revealPortField, g);

        g.gridy = row++;
        g.gridx = 0; g.weightx = 0;
        form.add(new JLabel("Callback URL"), g);
        g.gridx = 1; g.weightx = 1;
        callbackLabel = new JLabel(callbackUrl());
        callbackLabel.setFont(callbackLabel.getFont().deriveFont(Font.PLAIN, 11f));
        form.add(callbackLabel, g);

        // ── Buttons ───────────────────────────────────────────────────────────
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 4));
        JButton saveBtn = new JButton("Save & reload");
        saveBtn.addActionListener(e -> save());
        JButton testBtn = new JButton("Test connection");
        testBtn.addActionListener(e -> {
            save();
            String result = queue.ping();
            statusLabel.setText(result);
        });
        JButton sampleBtn = new JButton("Send test event");
        sampleBtn.addActionListener(e -> {
            save();
            queue.enqueueSample();
            statusLabel.setText("Test event queued — watch the Aegis Burp tab.");
        });
        buttons.add(saveBtn);
        buttons.add(testBtn);
        buttons.add(sampleBtn);

        // ── Status line ───────────────────────────────────────────────────────
        statusLabel = new JLabel(" ");
        statusLabel.setBorder(BorderFactory.createEmptyBorder(6, 4, 0, 4));
        statusLabel.setFont(statusLabel.getFont().deriveFont(Font.PLAIN, 11f));

        // Live status refresh (queue counts / errors).
        Timer timer = new Timer(1000, e -> SwingUtilities.invokeLater(() -> {
            if (!statusLabel.getText().startsWith("✓") && !statusLabel.getText().startsWith("✗")
                    && !statusLabel.getText().startsWith("Test event")) {
                statusLabel.setText(queue.statusLine());
            }
        }));
        timer.start();

        JPanel top = new JPanel(new BorderLayout());
        top.add(form, BorderLayout.CENTER);
        top.add(buttons, BorderLayout.SOUTH);

        JPanel bottom = new JPanel(new BorderLayout());
        bottom.add(statusLabel, BorderLayout.NORTH);

        JTextArea help = new JTextArea(
                "How this works\n" +
                "1. In Aegis, open the project's Burp tab → Settings → Generate key, copy it here.\n" +
                "2. Set the server URL (http://host:3000 — same machine or LAN).\n" +
                "3. Save & reload. In-scope traffic now streams to Aegis: deduped, anomaly-flagged, secret-scanned.\n" +
                "4. Repeater/Intruder activity auto-marks matching checklist items as tested.\n" +
                "Raw credentials (Authorization, Cookie, X-Api-Key…) are captured for replay and session flows.");
        help.setEditable(false);
        help.setOpaque(false);
        help.setLineWrap(true);
        help.setWrapStyleWord(true);
        help.setFont(help.getFont().deriveFont(Font.PLAIN, 11f));
        bottom.add(help, BorderLayout.SOUTH);

        root.add(top, BorderLayout.NORTH);
        root.add(bottom, BorderLayout.CENTER);
        return root;
    }

    private void save() {
        try {
            config.serverUrl = serverField.getText().trim();
            config.engagementKey = keyField.getText().trim();
            config.enabled = enabledCheck.isSelected();
            config.useProjectScope = scopeCheck.isSelected();
            config.hostAllowlist = hostsArea.getText();
            config.skipStatic = staticCheck.isSelected();
            config.flushIntervalSec = Integer.parseInt(intervalField.getText().trim());
            config.replayPollSec = Integer.parseInt(replayPollField.getText().trim());
            config.batchSize = Integer.parseInt(batchField.getText().trim());
            config.wsEnabled = wsCheck.isSelected();
            String spool = spoolField.getText().trim();
            config.spoolDir = spool.isEmpty()
                    ? (System.getProperty("java.io.tmpdir") + "/aegis-bridge-spool")
                    : spool;
            int revealPort = Integer.parseInt(revealPortField.getText().trim());
            if (revealPort < 0 || revealPort > 65535) throw new NumberFormatException();
            config.revealPort = revealPort;
            config.save(api.persistence().preferences());
            callbackLabel.setText(callbackUrl());
            statusLabel.setText("Saved. " + queue.statusLine());
        } catch (NumberFormatException ex) {
            statusLabel.setText("✗ Flush interval / replay poll / batch size / reveal port must be whole numbers.");
        }
    }

    private void pair() {
        String code = pairCodeField.getText().trim();
        if (code.isEmpty()) {
            statusLabel.setText("✗ Enter a pairing code first.");
            return;
        }
        HttpURLConnection conn = null;
        try {
            String endpoint = config.serverUrl.replaceAll("/+$", "") + "/api/burp/provision";
            URL u = new URL(endpoint);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            String payload = "{\"code\":" + Json.quote(code) + "}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            int status = conn.getResponseCode();
            String body = readBody(conn);
            if (status != 200) {
                statusLabel.setText("✗ " + errorMessage(body, status));
                return;
            }

            Object parsed = Json.parse(body);
            if (!(parsed instanceof Map)) {
                statusLabel.setText("✗ Unexpected provisioning response.");
                return;
            }
            Map<String, Object> map = (Map<String, Object>) parsed;
            if (!Boolean.TRUE.equals(map.get("ok"))) {
                statusLabel.setText("✗ " + errorMessage(body, status));
                return;
            }

            String serverUrl = str(map.get("serverUrl"));
            String engagementKey = str(map.get("engagementKey"));
            String project = str(map.get("project"));
            if (serverUrl.isEmpty() || engagementKey.isEmpty()) {
                statusLabel.setText("✗ Provisioning response missing serverUrl/engagementKey.");
                return;
            }

            config.serverUrl = serverUrl;
            config.engagementKey = engagementKey;
            config.save(api.persistence().preferences());
            serverField.setText(serverUrl);
            keyField.setText(engagementKey);
            statusLabel.setText("✓ Paired with Aegis project '" + project + "' — configured automatically");
        } catch (Exception e) {
            statusLabel.setText("✗ " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String errorMessage(String body, int status) {
        if (body != null && !body.isEmpty()) {
            try {
                Object parsed = Json.parse(body);
                if (parsed instanceof Map) {
                    Map<String, Object> map = (Map<String, Object>) parsed;
                    String error = str(map.get("error"));
                    if (!error.isEmpty()) return error;
                    String message = str(map.get("message"));
                    if (!message.isEmpty()) return message;
                }
            } catch (Exception ignored) {
                // non-JSON body — fall through to the generic message
            }
        }
        return "server responded " + status + (body == null || body.isEmpty() ? "" : ": " + truncate(body, 120));
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

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }

    private String callbackUrl() {
        return config.revealPort > 0
                ? "http://127.0.0.1:" + config.revealPort + "/reveal"
                : "disabled (port 0)";
    }
}
