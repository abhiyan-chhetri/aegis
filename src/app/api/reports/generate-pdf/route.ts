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

    // ── Upsert Report DB record (1 report per project) ────────────────────────
    if (action === 'save' && session) {
      // Check if a report already exists for this project
      const existing = await db.report.findFirst({ where: { projectId } });

      if (existing) {
        // Update the existing record (keep status/reviewerId as-is, just update pages/size)
        await db.report.update({
          where: { id: existing.id },
          data: {
            pages: 0, // we don't count pages here, left at 0
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
            version: 'v1',
            status: 'draft',
            authorId: session.id,
            pages: 0,
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
