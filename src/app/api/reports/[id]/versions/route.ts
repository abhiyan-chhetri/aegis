import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT rv.id, rv."versionNumber", rv.status, rv."rejectionReason", rv."createdAt",
              u.id as "approverId", u.name as "approverName"
       FROM "ReportVersion" rv
       LEFT JOIN "User" u ON u.id = rv."approvedBy"
       WHERE rv."reportId" = $1
       ORDER BY rv."versionNumber" DESC`,
      reportId
    );

    const versions = rows.map((r) => ({
      id: r.id,
      versionNumber: r.versionNumber,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      approver: r.approverId ? { id: r.approverId, name: r.approverName } : null,
    }));


    return NextResponse.json({ versions });
  } catch (error) {
    console.error('[GET /api/reports/[id]/versions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { status, rejectionReason } = await request.json();

    // Get latest version number
    const [latest] = await db.$queryRawUnsafe<{ versionNumber: number }[]>(
      `SELECT "versionNumber" FROM "ReportVersion" WHERE "reportId" = $1 ORDER BY "versionNumber" DESC LIMIT 1`,
      reportId
    );
    const nextNumber = (latest?.versionNumber || 0) + 1;

    const id = uuidv4();
    const now = new Date().toISOString();
    const approvedBy = status === 'approved' ? session.id : null;

    await db.$executeRawUnsafe(
      `INSERT INTO "ReportVersion" (id, "reportId", "versionNumber", status, "approvedBy", "rejectionReason", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      id, reportId, nextNumber, status || 'draft', approvedBy,
      rejectionReason || '', now
    );

    return NextResponse.json({ version: { id, reportId, versionNumber: nextNumber, status, createdAt: now } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/reports/[id]/versions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
