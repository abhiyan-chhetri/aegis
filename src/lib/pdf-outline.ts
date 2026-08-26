/**
 * addPdfOutline — injects a real PDF bookmark tree (/Outlines) into an existing
 * PDF. Chrome's page.pdf() does not generate outlines, so we post-process:
 * build the outline dicts with pdf-lib's low-level object model, link them with
 * Parent/Prev/Next/First/Last/Count, point each destination at its page, and
 * attach the root to the document catalog.
 *
 * pages are 1-based (matching the report's printed page numbers).
 */
import {
  PDFDocument, PDFName, PDFRef, PDFHexString, PDFNumber, PDFArray, PDFDict, PDFObject,
} from 'pdf-lib';

export interface PdfOutlineItem {
  title: string;
  /** 1-based page the bookmark jumps to. */
  page: number;
  children?: PdfOutlineItem[];
}

interface OutlineNode {
  ref: PDFRef;
  parent: PDFRef | null;
  prev: PDFRef | null;
  next: PDFRef | null;
  first: PDFRef | null;
  last: PDFRef | null;
  /** Number of visible descendants (only meaningful for parents). */
  count: number;
}

export async function addPdfOutline(
  pdfBytes: Uint8Array,
  items: PdfOutlineItem[],
): Promise<Uint8Array> {
  if (!items || items.length === 0) return pdfBytes;

  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const context = doc.context;
  const pages = doc.getPages();
  if (pages.length === 0) return pdfBytes;
  const clampPage = (p: number) => Math.max(0, Math.min(p - 1, pages.length - 1));

  const rootRef = context.nextRef();
  const nodes: OutlineNode[] = [];
  const flat: Array<{ item: PdfOutlineItem; node: OutlineNode }> = [];

  const build = (list: PdfOutlineItem[], parentRef: PDFRef | null): PDFRef[] => {
    const refs: PDFRef[] = [];
    for (const item of list) {
      const ref = context.nextRef();
      const node: OutlineNode = { ref, parent: parentRef, prev: null, next: null, first: null, last: null, count: 0 };
      nodes.push(node);
      flat.push({ item, node });
      refs.push(ref);
      if (item.children && item.children.length > 0) {
        const childRefs = build(item.children, ref);
        node.first = childRefs[0];
        node.last = childRefs[childRefs.length - 1];
        node.count = item.children.length;
      }
    }
    for (let i = 0; i < refs.length; i++) {
      const n = nodes.find(x => x.ref === refs[i])!;
      n.prev = i > 0 ? refs[i - 1] : null;
      n.next = i < refs.length - 1 ? refs[i + 1] : null;
    }
    return refs;
  };

  const topRefs = build(items, rootRef);

  // Item dicts.
  for (const { item, node } of flat) {
    const dict: Record<string, PDFObject | PDFRef | PDFName | PDFArray | PDFNumber | PDFHexString | null> = {
      Title: PDFHexString.fromText(item.title),
      Parent: node.parent as PDFRef,
      Dest: context.obj([pages[clampPage(item.page)].ref, PDFName.of('Fit')]) as PDFArray,
    };
    if (node.prev) dict.Prev = node.prev;
    if (node.next) dict.Next = node.next;
    if (node.first) dict.First = node.first;
    if (node.last) dict.Last = node.last;
    if (node.count > 0) dict.Count = context.obj(node.count) as PDFNumber;
    context.assign(node.ref, context.obj(dict) as PDFDict);
  }

  // Root outline dict.
  context.assign(rootRef, context.obj({
    Type: PDFName.of('Outlines'),
    First: topRefs[0],
    Last: topRefs[topRefs.length - 1],
    Count: context.obj(flat.length),
  }) as PDFDict);

  // Attach to the catalog.
  doc.catalog.set(PDFName.of('Outlines'), rootRef);

  return doc.save({ useObjectStreams: false });
}
