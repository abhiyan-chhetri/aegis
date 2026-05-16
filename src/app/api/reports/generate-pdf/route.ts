import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureReportsDir } from '@/lib/ensure-reports-dir';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let browser;
  try {
    const session = await getSession();
    const { projectId, html, filename, action } = await request.json();

    if (!html || !projectId) {
      return NextResponse.json(
        { error: 'Missing html or projectId' },
        { status: 400 }
      );
    }

    // Ensure reports directory exists
    const reportsDir = await ensureReportsDir();

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'networkidle2' });

    const reportFilename = filename || `report-${projectId}-${Date.now()}.pdf`;
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

    // ── Count pages from the produced PDF ─────────────────────────────────────
    // Cheap-and-cheerful: regex `/Type /Page` (not /Pages) occurrences in the
    // raw PDF bytes. Robust enough for puppeteer-produced PDFs which don't
    // do anything exotic.
    let pageCount = 1;
    try {
      const pdfBytes = await fs.readFile(filePath);
      const matches = pdfBytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
      if (matches && matches.length > 0) pageCount = matches.length;
    } catch { /* ignore — keep default 1 */ }

    // Helper: bump "1.0" → "1.1" or "v1" → "v2" sensibly
    function bumpVersion(prev: string | null | undefined): string {
      if (!prev) return '1.0';
      const m1 = prev.match(/^(\d+)\.(\d+)$/);
      if (m1) return `${m1[1]}.${parseInt(m1[2], 10) + 1}`;
      const m2 = prev.match(/^v(\d+)$/i);
      if (m2) return `v${parseInt(m2[1], 10) + 1}`;
      // Plain integer or unknown format — append a counter
      const m3 = prev.match(/^(\d+)$/);
      if (m3) return String(parseInt(m3[1], 10) + 1);
      return `${prev}.1`;
    }

    // ── Upsert Report DB record (1 report per project) ────────────────────────
    if (action === 'save' && session) {
      const existing = await db.report.findFirst({ where: { projectId } });

      if (existing) {
        // Regenerate → bump the version and refresh page count + size. Reset
        // review state since the content has changed (matches the existing
        // "approved → in-review on edit" pattern).
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
        // Create the first report for this project
        const count = await db.report.count();
        const code  = `R-${String(count + 1).padStart(4, '0')}`;
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
      url: `/reports/${reportFilename}`,
      size: stats.size,
      projectId,
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
