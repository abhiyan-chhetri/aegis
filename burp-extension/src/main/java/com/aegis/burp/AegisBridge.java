package com.aegis.burp;

import burp.api.montoya.BurpExtension;
import burp.api.montoya.MontoyaApi;

/**
 * Aegis Burp Bridge — streams in-scope Burp traffic (proxy / repeater /
 * intruder / scanner) into the Aegis pentest tool's Burp Bridge ingest API.
 *
 * Load: Extensions → Add → select target/aegis-burp-bridge.jar
 * Configure: the "Aegis Bridge" suite tab (server URL + engagement key).
 */
public class AegisBridge implements BurpExtension {

    private Config config;
    private TrafficQueue queue;
    private TrafficQueue wsQueue;
    private RevealServer revealServer;
    private ReplayPoller replayPoller;

    @Override
    public void initialize(MontoyaApi api) {
        api.extension().setName("Aegis Burp Bridge");

        config = Config.load(api.persistence().preferences());
        queue = new TrafficQueue(config, api.logging());
        wsQueue = new TrafficQueue(config, api.logging(), config.wsUrl());
        ScopeFilter scopeFilter = new ScopeFilter(config, api.scope());
        revealServer = new RevealServer(api, config);
        replayPoller = new ReplayPoller(config, api);
        TrafficRecorder recorder = new TrafficRecorder(config, queue, scopeFilter, revealServer, api.logging());
        WsRecorder wsRecorder = new WsRecorder(config, scopeFilter, wsQueue, api.logging());

        api.http().registerHttpHandler(recorder);
        api.websockets().registerWebSocketCreatedHandler(wsRecorder);
        queue.start();
        wsQueue.start();
        revealServer.start();
        replayPoller.start();

        api.userInterface().registerSuiteTab("Aegis Bridge", new ConfigTab(api, config, queue).build());
        api.userInterface().registerContextMenuItemsProvider(new ContextSend(config, api.logging()));

        api.logging().logToOutput(
                "[Aegis Bridge] loaded — streaming "
                        + (config.useProjectScope ? "project-scope" : "allowlisted")
                        + " traffic to " + config.serverUrl);
        if (config.engagementKey.isEmpty()) {
            api.logging().raiseInfoEvent("[Aegis Bridge] No engagement key set — open the Aegis Bridge tab to configure it.");
        }

        api.extension().registerUnloadingHandler(() -> {
            queue.stop();
            wsQueue.stop();
            revealServer.stop();
            replayPoller.stop();
        });
    }
}
