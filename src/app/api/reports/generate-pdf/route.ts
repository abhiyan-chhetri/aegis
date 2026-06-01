import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureReportsDir } from '@/lib/ensure-reports-dir';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

function bumpVersion(prev: string | null | undefined): string {
  if (!prev) return '1.0';
  const m1 = prev.match(/^(\d+)\.(\d+)$/);
  if (m1) return `${m1[1]}.${parseInt(m1[2], 10) + 1}`;
  const m2 = prev.match(/^v(\d+)$/i);
  if (m2) return `v${parseInt(m2[1], 10) + 1}`;
  const m3 = prev.match(/^(\d+)$/);
  if (m3) return String(parseInt(m3[1], 10) + 1);
  return `${prev}.1`;
}

function countPages(pdfBuffer: Buffer): number {
  try {
    const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
    return matches && matches.length > 0 ? matches.length : 1;
  } catch {
    return 1;
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let browser;
  try {
    const session = await getSession();
    const { projectId, html, filename, action } = await request.json();

    if (!html || !projectId) {
      return NextResponse.json(
        { error: 'Missing html or projectId' },
        { status: 400 },
      );
    }

    // ── Only approved reports can be exported ──────────────────────────────
    if (action === 'export') {
      const report = await db.report.findFirst({ where: { projectId } });
      if (!report || report.status !== 'approved') {
        return NextResponse.json(
          { error: 'Only approved reports can be downloaded.' },
          { status: 403 },
        );
      }
    }

    // ── Launch headless browser ────────────────────────────────────────────
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });

    // 10-minute ceiling for the whole operation.
    const TEN_MINUTES = 600_000;
    page.setDefaultNavigationTimeout(TEN_MINUTES);
    page.setDefaultTimeout(TEN_MINUTES);

    // Abort non-essential requests so a slow CDN doesn't hang the job.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (
        url.startsWith('data:') ||
        url.includes('fonts.googleapis.com') ||
        url.includes('fonts.gstatic.com') ||
        url.endsWith('.woff2') || url.endsWith('.woff') ||
        url.endsWith('.ttf') || url.endsWith('.otf')
      ) {
        req.continue();
      } else {
        req.abort();
      }
    });

    // 'load' fires when all resources load (or fail) — unlike 'networkidle2'
    // it won't hang forever on a slow / stuck connection.
    await page.setContent(html, { waitUntil: 'load', timeout: TEN_MINUTES });

    // Wait for web fonts, but don't block the whole job if they're slow.
    try {
      await page.evaluate(
        () => (document as any).fonts?.ready ?? Promise.resolve(),
        { timeout: 30_000 },
      );
    } catch { /* proceed with fallback fonts */ }

    // ── Generate PDF ───────────────────────────────────────────────────────
    if (action === 'export') {
      // Export: return PDF as a blob directly — no file written to disk.
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        printBackground: true,
      });

      const pdfBytes = Buffer.from(pdfBuffer);
      const downloadFilename = filename || `report-${projectId}.pdf`;

      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${downloadFilename}"`,
          'Content-Length': String(pdfBytes.length),
        },
      });
    }

    // ── Save: persist to disk + DB ─────────────────────────────────────────
    const reportsDir = await ensureReportsDir();
    const reportFilename = filename || `${projectId}.pdf`;
    const filePath = path.join(reportsDir, reportFilename);

    await page.pdf({
      path: filePath,
      format: 'A4',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
    });

    const stats = await fs.stat(filePath);
    const sizeKB = Math.round(stats.size / 1024);
    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

    const pdfBytesForCount = await fs.readFile(filePath);
    const pageCount = countPages(pdfBytesForCount);

    // Upsert the DB record
    if (session) {
      const existing = await db.report.findFirst({ where: { projectId } });

      if (existing) {
        const nextVersion = bumpVersion(existing.version);
        await db.report.update({
          where: { id: existing.id },
          data: {
            version: nextVersion,
            pages: pageCount,
            size: sizeStr,
            updatedAt: new Date(),
          },
        });
      } else {
        const count = await db.report.count();
        const code = `R-${String(count + 1).padStart(4, '0')}`;
        await db.report.create({
          data: {
            code,
            projectId,
            templateName: 'Technical Report',
            version: '1.0',
            status: 'draft',
            authorId: session.id,
            pages: pageCount,
            size: sizeStr,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      filename: reportFilename,
      projectId,
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
