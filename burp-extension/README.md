# Aegis Burp Bridge — Burp Suite extension

Streams in-scope Burp traffic (Proxy, Repeater, Intruder, Scanner) into the
**Aegis** pentest tool's Burp Bridge. Each captured request/response pair is
deduped server-side, auto-flagged for anomalies, scanned for secrets, added to
the endpoint inventory, and shown live in the project's **Burp** tab.
Repeater/Intruder activity automatically marks matching checklist items as
tested.

Built on the **Montoya API** (Burp Suite 2023.5+ / 2024.x).

## Build

```bash
cd burp-extension
mvn package            # → target/aegis-burp-bridge.jar
```

(No runtime dependencies — the jar is a few KB; Burp provides the Montoya API.)

## Install

1. Burp Suite → **Extensions** tab → **Add**
2. Extension type: **Java** → select `target/aegis-burp-bridge.jar` → Next
3. A new **Aegis Bridge** suite tab appears.

## Configure

In the **Aegis Bridge** tab:

| Field | Meaning |
|---|---|
| Aegis server URL | `http://<host>:3000` (same machine or LAN — where Aegis runs) |
| Engagement key | Generate in Aegis → project → **Burp** tab → **Settings** → *Generate key* (shown once) |
| Capture traffic | Master on/off |
| Use Burp project scope | Only forward traffic matching the project scope defined in Burp |
| Host allowlist | Used when project scope is off: one host per line, `*.example.com` wildcards OK. Empty = capture all |
| Skip static assets | Drops images/fonts/css/archives (JS is **kept** — it's secret-scanned + AI-analysed) |
| Flush interval / Batch size | How often / how many events per POST (defaults 2 s / 50) |
| Replay poll (s) | How often to check Aegis for queued replays (default 10 s) |

Buttons:
- **Save & reload** — persist settings (survive Burp restarts) and re-read config
- **Test connection** — pings Aegis with your key (`pong` = all good)
- **Send test event** — pushes a synthetic pair; watch it appear in Aegis → Burp tab

## One-click setup (pairing)

In Aegis → project → **Burp** tab → Settings → **Generate pairing code**, paste the
8-character code into the extension tab's **Pairing code** field and hit **Pair** —
the extension fetches the server URL + engagement key automatically. Single-use,
expires in 10 minutes.

## Right-click → "Send to Aegis"

Select request(s) anywhere in Burp (Proxy history, Repeater, Intruder results…),
right-click → **Send to Aegis (Burp Bridge)** — the pairs stream into the
project's Traffic tab with tool tag `manual`, ready to drag onto the Interesting
rail or turn into a finding.

## Replay pool (fire from Burp)

When Aegis's server can't reach the target (e.g. it only resolves from your
machine), the "Replay request" button queues the request instead. The extension
polls `/api/burp/replay-pool` every N seconds, and for each queued task:
1. Opens the exact request (raw headers + cookies) in a **Repeater tab** named "Aegis replay",
2. Auto-sends it through Burp from your machine,
3. Posts the response back to Aegis — the traffic detail panel shows it as **VIA BURP**.

## Raw headers — no redaction

Cookies, `Authorization` and API keys are captured and stored **raw** so replay
and session flows work end-to-end. This is an internal, authorized pentest
tool — treat stored traffic as sensitive as your Burp project itself.

## How it works

```
Burp HTTP handler (response-driven)
   → scope filter (Burp scope / allowlist)
   → noise filter (static assets, own Aegis calls)
   → raw headers kept (cookies/Auth intact for replay + flows)
   → async queue (batch 50 / every 2s, retry on failure, drop on 401)
   → POST {host}/api/burp/traffic  (x-engagement-key)
        → Aegis: dedup (sha256) · anomaly flags · regex secret scan ·
          JS → AI deep-read (secrets/endpoints/internal URLs) · endpoint upsert
        → SSE broadcast to the project's Burp tab (live)
```

Tool tags flow through: `proxy`, `repeater`, `intruder`, `scanner` — the
latter two auto-mark matching checklist items **tested** in Aegis.

## Scope guard (server-side, second layer)

Even if the extension is misconfigured, Aegis rejects traffic whose host is
not in the project's declared **Burp scope** (Settings → Scope guard) and
records the rejected attempts.

## Payload format (for other clients)

```json
POST /api/burp/traffic
x-engagement-key: aeg-…
{
  "events": [{
    "method": "POST",
    "url": "https://api.example.com/api/login",
    "statusCode": 200,
    "contentType": "application/json",
    "requestHeaders": {"Host": "api.example.com", "User-Agent": "x"},
    "requestBody": "{\"user\":\"admin\"}",
    "responseHeaders": {"Content-Type": "application/json"},
    "responseBody": "{\"token\":\"…\"}",
    "tool": "proxy",
    "timestamp": 1787700000000
  }]
}
```

`ping: true` (with empty `events`) returns `{"ok":true,"pong":true}` after
authenticating the key — a zero-storage connectivity check.
