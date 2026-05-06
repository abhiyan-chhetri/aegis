/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWebhook } from '@/lib/webhook';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, reviewerId, comment } = body as {
      action: 'submit' | 'approve' | 'reject';
      reviewerId?: string;
      comment?: string;
    };

    if (!['submit', 'approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Fetch the report with related data for webhook messages
    const report = await db.report.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    let updatedReport: any;
    let webhookText = '';

    if (action === 'submit') {
      if (!reviewerId) {
        return NextResponse.json({ error: 'reviewerId is required for submit' }, { status: 400 });
      }

      // Get reviewer name for webhook
      const reviewer = await db.user.findUnique({ where: { id: reviewerId }, select: { name: true } });

      // Update status via Prisma (status is a Prisma field)
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'in-review' },
      });

      // Update reviewerId via raw SQL (raw column)
      await db.$executeRawUnsafe(`UPDATE Report SET reviewerId = ? WHERE id = ?`, reviewerId, id);

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO AuditLog (id, userId, action, entityType, entityId, changes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(), session.id, 'submit', 'Report', id,
        JSON.stringify({ status: 'in-review', assignedTo: reviewer?.name || reviewerId }), new Date().toISOString()
      );

      webhookText = `📋 Report for <strong>${report.project.name}</strong> has been submitted for review by <strong>${report.author.name}</strong> and assigned to <strong>${reviewer?.name || reviewerId}</strong>`;

    } else if (action === 'approve') {
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'approved' },
      });

      // Update reviewedAt and clear reviewComment via raw SQL
      await db.$executeRawUnsafe(
        `UPDATE Report SET reviewComment = ?, reviewedAt = ? WHERE id = ?`,
        comment || '',
        new Date().toISOString(),
        id
      );

      // Get reviewer name first (used in both audit log and webhook)
      const rawRows = await db.$queryRawUnsafe<{ reviewerId: string }[]>(
        `SELECT reviewerId FROM Report WHERE id = ?`, id
      );
      let reviewerName = 'reviewer';
      if (rawRows[0]?.reviewerId) {
        const reviewer = await db.user.findUnique({ where: { id: rawRows[0].reviewerId }, select: { name: true } });
        if (reviewer) reviewerName = reviewer.name;
      }

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO AuditLog (id, userId, action, entityType, entityId, changes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(), session.id, 'approve', 'Report', id,
        JSON.stringify({ status: 'approved', reviewedBy: reviewerName, comment: comment || '' }), new Date().toISOString()
      );

      webhookText = `✅ Report for <strong>${report.project.name}</strong> has been <strong>approved</strong> by <strong>${reviewerName}</strong>`;

    } else if (action === 'reject') {
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'rejected' },
      });

      await db.$executeRawUnsafe(
        `UPDATE Report SET reviewComment = ?, reviewedAt = ? WHERE id = ?`,
        comment || '',
        new Date().toISOString(),
        id
      );

      // Get reviewer name first (used in both audit log and webhook)
      const rejectRawRows = await db.$queryRawUnsafe<{ reviewerId: string }[]>(
        `SELECT reviewerId FROM Report WHERE id = ?`, id
      );
      let rejectReviewerName = 'reviewer';
      if (rejectRawRows[0]?.reviewerId) {
        const rev = await db.user.findUnique({ where: { id: rejectRawRows[0].reviewerId }, select: { name: true } });
        if (rev) rejectReviewerName = rev.name;
      }

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO AuditLog (id, userId, action, entityType, entityId, changes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(), session.id, 'reject', 'Report', id,
        JSON.stringify({ status: 'rejected', reviewedBy: rejectReviewerName, comment: comment || '' }), new Date().toISOString()
      );

      const commentText = comment ? ` — <em>${comment}</em>` : '';
      webhookText = `❌ Report for <strong>${report.project.name}</strong> has been <strong>rejected</strong> by <strong>${rejectReviewerName}</strong>${commentText}`;
    }

    // Record report version snapshot
    if (action !== 'submit') {
      const [latestVer] = await db.$queryRawUnsafe<{ versionNumber: number }[]>(
        `SELECT versionNumber FROM ReportVersion WHERE reportId = ? ORDER BY versionNumber DESC LIMIT 1`, id
      );
      const nextVer = (latestVer?.versionNumber || 0) + 1;
      await db.$executeRawUnsafe(
        `INSERT INTO ReportVersion (id, reportId, versionNumber, status, approvedBy, rejectionReason, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(), id, nextVer,
        action === 'approve' ? 'approved' : 'rejected',
        action === 'approve' ? session.id : null,
        comment || '',
        new Date().toISOString()
      );
    }

    // Fire webhook (fire and forget)
    if (webhookText) {
      sendWebhook(webhookText);
    }

    return NextResponse.json({ report: updatedReport, action });
  } catch (error) {
    console.error('[POST /api/reports/[id]/review]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
