import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, entityType, entityId, changes } = await request.json();
    if (!action || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.$executeRawUnsafe(
      `INSERT INTO AuditLog (id, userId, action, entityType, entityId, changes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, session.id, action, entityType, entityId,
      JSON.stringify(changes || {}), now
    );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('[POST /api/audit-log]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityId   = searchParams.get('entityId');
    const limit      = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    let query = `SELECT al.id, al.action, al.entityType, al.entityId, al.changes, al.createdAt,
                        u.id as userId, u.name as userName
                 FROM AuditLog al JOIN User u ON u.id = al.userId`;
    const args: any[] = [];
    const where: string[] = [];
    if (entityType) { where.push('al.entityType = ?'); args.push(entityType); }
    if (entityId)   { where.push('al.entityId = ?');   args.push(entityId); }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY al.createdAt DESC LIMIT ?';
    args.push(limit);

    const rows = await db.$queryRawUnsafe<any[]>(query, ...args);

    const auditLogs = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      changes: r.changes,
      createdAt: r.createdAt,
      user: { id: r.userId, name: r.userName },
    }));

    return NextResponse.json({ auditLogs });
  } catch (error) {
    console.error('[GET /api/audit-log]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
