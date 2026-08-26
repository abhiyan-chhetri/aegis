import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const KEY = 'burpCallbackUrl';
const DEFAULT = 'http://127.0.0.1:8787';

/** GET /api/burp/callback — the Burp extension's local "Show in Burp" URL. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "AppSetting" WHERE key = $1`, KEY,
    );
    return NextResponse.json({ callbackUrl: rows[0]?.value || DEFAULT });
  } catch {
    return NextResponse.json({ callbackUrl: DEFAULT });
  }
}

/** POST /api/burp/callback — { callbackUrl } */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const callbackUrl = String(body.callbackUrl || '').trim().slice(0, 500);
    if (!/^https?:\/\//.test(callbackUrl)) {
      return NextResponse.json({ error: 'callbackUrl must start with http(s)://' }, { status: 400 });
    }

    await db.$executeRawUnsafe(
      `INSERT INTO "AppSetting" (id, key, value, "isSecret", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP`,
      uuidv4(), KEY, callbackUrl,
    );

    return NextResponse.json({ success: true, callbackUrl });
  } catch (error) {
    console.error('[POST /api/burp/callback]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
