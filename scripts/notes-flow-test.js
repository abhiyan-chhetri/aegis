/* Verify: "Notes → findings" now uses the Notes tab content directly —
 * no paste step. Clicking the trigger should auto-generate proposals. */
const puppeteer = require('puppeteer');
const BASE = 'http://localhost:3000';
const PID = 'cmt9bp10a0006v9pypufseopk';
(async () => {
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.type('input[type="email"]', 'admin@aegis.local');
    await page.type('input[type="password"]', 'admin123456');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));

    // Click "Notes → findings" — should auto-generate (no notes textarea).
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Notes → findings'));
      if (b) b.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const noTextarea = await page.evaluate(() =>
      !Array.from(document.querySelectorAll('textarea')).some(t => (t.placeholder || '').includes('rough notes'))
    );
    console.log('no paste textarea in modal:', noTextarea);

    // Wait for generation (demo delay ~1800ms) + review render.
    await new Promise(r => setTimeout(r, 4500));
    const review = await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      const createBtn = Array.from(document.querySelectorAll('button')).find(x => /Create \d+ finding/.test(x.textContent.trim()));
      const viewNotes = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('View notes'));
      return {
        proposals: checkboxes.length,
        createBtn: !!createBtn,
        viewNotesBtn: !!viewNotes,
      };
    });
    console.log('review phase:', JSON.stringify(review));

    // "View notes" should show the Notes tab content.
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('View notes'));
      if (b) b.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const notesPreview = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => (d.textContent || '').includes('login form has no rate limiting'));
      return !!el;
    });
    console.log('notes preview shows Notes-tab content:', notesPreview);
  } finally { await browser.close(); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
