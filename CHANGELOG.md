# Changelog

All notable changes to Aegis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
aims for practical, tester-focused releases.

## [v3.0] — Burp Bridge — 2026-08-26

### Added — Burp Bridge v1–v6
- **Live traffic capture** from the Burp extension (Proxy / Repeater / Intruder / Scanner) via a key-authenticated ingest endpoint: dedup, size caps, scope guard, per-project capture rules (drop hosts / only tools / drop static), retention (90d default, auto-purge on project completion).
- **Auto-anomaly flags** on ingest (SQL errors, stack traces, JWT leaks, CORS+credentials, admin paths, debug markers, directory listings, command-error hints, …).
- **Secret scanner** — regex on every asset (JS scanned hardest) plus **backend AI deep-read** of every captured JS bundle (secrets, endpoints, internal URLs, credentials), queued automatically and processed lazily; dedicated Secrets tab with dedup, masked values, occurrence counts and one-click finding creation.
- **Endpoint inventory** — normalized paths (`/api/users/:id`), hit counts, statuses, JS-asset marks, anomaly aggregation.
- **Evidence-based AI checklist** — context-aware only (no generic sweeps): techniques gated by the traffic actually observed (params, methods, content types, auth/upload/GraphQL/JS surfaces), phrased as "we observed X — suggested check Y". Missing-security-header and insecure-cookie items are auto-confirmed (`succeeded`) straight from captured responses.
- **Payload runner (mini-Intruder)** — replays checklist payloads against captured requests with auto-detection (reflection / error patterns / timing), flips items to `succeeded`/`tested` with evidence; auto-bypass runs on failed attempts.
- **Session-aware replay** — mark an exchange as the session anchor; server-side replay and the runner inject its cookies/tokens. Replay pool: when the server can't reach a target, the request is queued and the Burp extension pulls it, opens it in Repeater and auto-fires it from the tester's machine, reporting the result back (`VIA BURP`).
- **Session/flow reconstruction** — chains requests by raw cookie/token values; raw headers (cookies, Authorization) are stored intact for replay.
- **Interesting rail** — drag traffic rows or checklist items to pin; promote straight into a finding draft (severity + CWE mapped from the category).
- **Finding ↔ traffic linkage** — link/unlink captured pairs, auto-suggested matches on the finding page, anomaly-flag → finding drafts, secrets → finding drafts.
- **Living bypass playbook** — every failed attempt's AI bypass that later succeeds is surfaced on future checklists across engagements.
- **Coverage report** — endpoint coverage %, per-category checklist progress, untouched endpoints, carry-over finding awareness.
- **Checklist export** (Markdown + PDF) for client test-plan approval.
- **WebSocket capture** — messages stored and browsable per project.
- **Extension ergonomics** — one-time pairing-code provisioning (server URL + key auto-config), right-click "Send to Aegis" context menu, offline disk spooling with replay, local callback for "Show in Burp", configurable scope/noise/batching.
- **Performance at scale** — pg_trgm search indexes, multi-row ingest, debounced live stats, chunked rendering; 10k captures stay sub-40ms on read paths.

### Fixed
- Traffic-list search no longer scans every body by default (opt-in "search bodies").
- Live SSE rows respect the active filters (no filtered-view pollution).
- Replay queues instead of failing when the target is only reachable from the tester's machine.

## [Earlier releases]

### v2.3 — Report content & review workflow
- Executive summary, methodology, attack narrative (AI-generated, live co-editing).
- Key strengths / areas for improvement / immediate actions / short-term / long-term sections.
- Report version history, approval flow, rejection comments.

### v2.2 — SLA & notifications
- Internal vs external engagement SLA matrix.
- @mention, watch, and notification system (SSE live).
- Findings drag-to-reorder with persistence.

### v2.1 — AI everywhere
- Findings, summaries, report sections, notes→findings batch generation.
- Per-finding AI chat + full security chat page (streaming, private per user, $ cost tracking).
- Evidence-aware AI context (screenshots, captured Burp traffic).

### v2.0 — CVSS environmental adjustment
- Data classification (C1–C4) and asset criticality (Diamond/Silver/Bronze) drive CVSS impact letters automatically; per-finding lock to bypass.

### v1.x — Core
- Multi-engagement (target codes, yearly re-engagements, carry-over findings, retest scope generator).
- Real-time Google-Docs-style live collab (SSE, cursors, presence, caret-preserving merges).
- PDF report generation with TOC, bookmarks, and pagination-aware layout.
- Evidence uploads (base64 inline), scope manager, templates.
