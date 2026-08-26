/**
 * POST /api/chat/:id/messages
 *   { content: "..." }
 *
 * Saves the user message, streams the assistant reply back as SSE, then
 * persists the assistant message (with token usage + cost). The chat owner's
 * request must abort for the stream to stop — the AI call is wired to the
 * request signal.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getAIConfig } from '@/lib/ai-config';
import { streamChat, securityChatSystemPrompt, estimateCost, type ChatTurn } from '@/lib/ai';
import { loadTrafficForAI, buildTrafficPromptBlock } from '@/lib/burp';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const chatRows = await db.$queryRawUnsafe<any[]>(
    `SELECT id, "userId", "findingId", kind, title FROM "Chat" WHERE id = $1 AND "userId" = $2`,
    id, session.id,
  ).catch(() => []);
  if (chatRows.length === 0) return new Response('Not found', { status: 404 });
  const chat = chatRows[0];

  const body = await request.json().catch(() => ({}));
  const content = (body.content || '').toString().trim();
  if (!content) return new Response(JSON.stringify({ error: 'content required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  // ── Optional Burp traffic attach ("matching requests" flow in chat) ───────
  // Load the chosen request/response pairs and feed them to the model as
  // factual context. Finding chats resolve the project from the finding;
  // general chats pass projectId explicitly. The stored user message stays
  // as typed.
  let trafficBlock = '';
  const trafficIds = Array.isArray(body.trafficIds) ? (body.trafficIds as string[]).slice(0, 10) : [];
  if (trafficIds.length > 0) {
    try {
      let projectId: string | null = null;
      if (chat.kind === 'finding' && chat.findingId) {
        const proj = await db.$queryRawUnsafe<{ "projectId": string }[]>(
          `SELECT "projectId" FROM "Finding" WHERE id = $1`, chat.findingId,
        );
        projectId = proj[0]?.projectId ?? null;
      } else if (body.projectId) {
        projectId = String(body.projectId);
      }
      if (projectId) {
        const traffic = await loadTrafficForAI(projectId, trafficIds);
        if (traffic.length > 0) trafficBlock = buildTrafficPromptBlock(traffic, 24000);
      }
    } catch (e) { console.error('[chat] traffic attach failed:', e); }
  }

  // Persist the user message.
  await db.$executeRawUnsafe(
    `INSERT INTO "ChatMessage" (id, "chatId", role, content, "inputTokens", "outputTokens", cost, "createdAt")
     VALUES ($1, $2, 'user', $3, 0, 0, 0, NOW())`,
    uuidv4(), id, content,
  );
  // First user message → derive the chat title from it.
  const msgCount = await db.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*)::bigint AS c FROM "ChatMessage" WHERE "chatId" = $1`, id,
  );
  const isFirst = Number(msgCount[0]?.c ?? 0) === 1;
  if (isFirst) {
    const title = content.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
    await db.$executeRawUnsafe(`UPDATE "Chat" SET title = $1 WHERE id = $2`, title, id);
  }

  // Finding context for finding-scoped chats.
  let systemPrompt = securityChatSystemPrompt(chat.kind === 'finding' ? 'finding' : 'general');
  if (chat.kind === 'finding' && chat.findingId) {
    const f = await db.finding.findUnique({
      where: { id: chat.findingId },
      select: { code: true, title: true, severity: true, cwe: true, owasp: true, description: true, impact: true, remediation: true, reproduction: true, references: true },
    });
    if (f) {
      systemPrompt += `\n\nFINDING CONTEXT (you are helping with this specific finding):\n` +
        `Code: ${f.code}\nTitle: ${f.title}\nSeverity: ${f.severity}${f.cwe ? `\nCWE: ${f.cwe}` : ''}${f.owasp ? `\nOWASP: ${f.owasp}` : ''}\n` +
        `Description:\n${(f.description || '').slice(0, 2000)}\n` +
        `Impact:\n${(f.impact || '').slice(0, 1000)}\n` +
        `Remediation:\n${(f.remediation || '').slice(0, 1000)}\n` +
        `Reproduction:\n${(f.reproduction || '').slice(0, 1000)}`;
    }
  }

  // Prior turns (last 20) for context.
  const priorAll = await db.$queryRawUnsafe<any[]>(
    `SELECT role, content FROM "ChatMessage" WHERE "chatId" = $1 ORDER BY "createdAt" ASC`,
    id,
  ).catch(() => []);
  const history: ChatTurn[] = (priorAll || []).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));

  // Final user turn — traffic block (if any) goes to the model only.
  const modelUserContent = trafficBlock
    ? `CAPTURED BURP TRAFFIC (tester-attached request/response pairs — ground truth; quote exact methods, paths, status codes and bodies):\n${trafficBlock}\n\nQUESTION:\n${content}`
    : content;

  const config = await getAIConfig();
  config.usageUserId = session.id;
  config.usageFeature = 'chat';

  const encoder = new TextEncoder();
  let assistantText = '';
  let inputTokens = 0, outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
        catch { /* client gone */ }
      };
      try {
        for await (const ev of streamChat(config, systemPrompt, [...history, { role: 'user', content: modelUserContent }], request.signal)) {
          if (ev.delta) {
            assistantText += ev.delta;
            send({ delta: ev.delta });
          }
          if (ev.done) {
            inputTokens = ev.inputTokens ?? 0;
            outputTokens = ev.outputTokens ?? 0;
            const cost = estimateCost(config.model || '', inputTokens, outputTokens);
            // Persist the assistant message.
            try {
              await db.$executeRawUnsafe(
                `INSERT INTO "ChatMessage" (id, "chatId", role, content, "inputTokens", "outputTokens", cost, "createdAt")
                 VALUES ($1, $2, 'assistant', $3, $4, $5, $6, NOW())`,
                uuidv4(), id, assistantText, inputTokens, outputTokens, cost,
              );
              await db.$executeRawUnsafe(`UPDATE "Chat" SET "updatedAt" = NOW() WHERE id = $1`, id);
            } catch { /* persistence is best-effort */ }
            send({ done: true, inputTokens, outputTokens, cost });
          }
        }
        if (!assistantText) {
          send({ done: true, error: 'No response from the AI provider.' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Chat failed';
        console.error('[chat messages]', msg);
        send({ done: true, error: msg });
      } finally {
        try { controller.close(); } catch { /* ignore */ }
      }
    },
    cancel() { /* client left — abort handled via request.signal */ },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
