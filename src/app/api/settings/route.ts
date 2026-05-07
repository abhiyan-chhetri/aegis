import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isSensitiveKey, maskSensitiveValue } from '@/lib/crypto';
import { v4 as uuidv4 } from 'uuid';

// Read all settings from AppSetting table (key-value store)
// Sensitive values are masked in the response but stored as plain text
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings: Record<string, string> = {};

    try {
      const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
        `SELECT key, value FROM "AppSetting"`
      );

      for (const row of rows) {
        const sensitive = isSensitiveKey(row.key);
        // Sensitive keys are masked in the response — never send actual secrets to frontend
        settings[row.key] = sensitive ? maskSensitiveValue(row.value) : row.value;
      }
    } catch (queryErr) {
      console.warn('[query settings failed]', queryErr);
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[GET /api/settings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Update one or more settings keys — values stored as plain text
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      try {
        const id = uuidv4();
        await db.$executeRawUnsafe(`DELETE FROM "AppSetting" WHERE key = $1`, key);
        await db.$executeRawUnsafe(
          `INSERT INTO "AppSetting" (id, key, value, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
          id, key, String(value)
        );

        // Audit log (non-blocking)
        db.auditLog.create({
          data: {
            userId: session.id,
            action: 'update_config',
            entityType: 'AppSetting',
            entityId: key,
            changes: JSON.stringify(
              isSensitiveKey(key)
                ? { setting: key, type: 'sensitive_config_updated', timestamp: new Date().toISOString() }
                : { setting: key, value, timestamp: new Date().toISOString() }
            ),
          },
        }).catch(e => console.warn('[audit log skipped]', e));
      } catch (itemErr) {
        console.error('[settings update failed]', key, itemErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/settings]', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
