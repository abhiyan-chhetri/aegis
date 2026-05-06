import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { encryptValue, decryptValue, isSensitiveKey, maskSensitiveValue } from '@/lib/crypto';
import { v4 as uuidv4 } from 'uuid';

// Read all settings from AppSetting table (key-value store)
// Sensitive values are masked for security
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings: Record<string, { value: string; isSecret: boolean; isMasked: boolean }> = {};

    try {
      const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
        `SELECT key, value FROM "AppSetting"`
      );

      for (const row of rows) {
        let displayValue = row.value;
        let isMasked = false;
        const sensitive = isSensitiveKey(row.key);

        // If it's a sensitive key, decrypt and mask it
        if (sensitive) {
          try {
            if (row.value.includes(':')) {
              displayValue = decryptValue(row.value);
            }
          } catch (e) {
            displayValue = row.value;
          }
          displayValue = maskSensitiveValue(displayValue);
          isMasked = true;
        }

        settings[row.key] = {
          value: displayValue,
          isSecret: sensitive,
          isMasked
        };
      }
    } catch (queryErr) {
      console.warn('[query settings failed]', queryErr);
      // Return empty if table doesn't exist yet
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[GET /api/settings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Update one or more settings keys
// Sensitive values are encrypted before storage and logged to audit trail
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      try {
        const isSensitive = isSensitiveKey(key);

        let valueToStore = String(value);

        // Encrypt sensitive values
        if (isSensitive) {
          try {
            valueToStore = encryptValue(value);
          } catch (encErr) {
            console.error('[encryption failed]', encErr);
            return NextResponse.json({ error: 'Encryption failed', details: String(encErr) }, { status: 500 });
          }
        }

        // Update or insert setting
        try {
          const id = uuidv4();
          // Use DELETE + INSERT pattern to avoid conflicts
          await db.$executeRawUnsafe(
            `DELETE FROM "AppSetting" WHERE key = $1`,
            key
          );
          await db.$executeRawUnsafe(
            `INSERT INTO "AppSetting" (id, key, value, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
            id,
            key,
            valueToStore
          );
        } catch (dbErr) {
          console.error('[database insert failed]', dbErr);
          return NextResponse.json({ error: 'Database error', details: String(dbErr) }, { status: 500 });
        }

        // Log to audit trail (non-blocking)
        (async () => {
          try {
            await db.auditLog.create({
              data: {
                userId: session.id,
                action: 'update_config',
                entityType: 'AppSetting',
                entityId: key,
                changes: JSON.stringify(
                  isSensitive
                    ? { setting: key, type: 'sensitive_config_updated', timestamp: new Date().toISOString() }
                    : { setting: key, value: value, timestamp: new Date().toISOString() }
                ),
              },
            });
          } catch (logErr) {
            console.warn('[audit log skipped]', logErr);
            // Don't fail the request if audit logging fails
          }
        })();
      } catch (itemErr) {
        console.error('[processing item failed]', key, itemErr);
        // Continue processing other items
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/settings]', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
