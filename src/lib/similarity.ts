/**
 * Lightweight text-similarity utilities for the duplicate-finding detector.
 *
 * We deliberately avoid a heavyweight embedding model here — the corpus is
 * small (hundreds, maybe a few thousand findings), and a tf-idf cosine on
 * trigrams is already accurate enough to catch the obvious "this is the
 * same SQLi we filed last week" cases at create time. Stays self-contained,
 * no network, no extra dependency.
 *
 * Exports:
 *   normalise(text)         — lowercase, strip punctuation, collapse whitespace
 *   trigrams(text)          — overlapping 3-char shingles
 *   jaccard(a, b)           — overlap / union, range [0,1]
 *   diceCoefficient(a, b)   — 2|A∩B| / (|A|+|B|), more sensitive than Jaccard
 *   similarTo(query, items) — rank a list by similarity, return top-K above threshold
 */

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/`[^`]*`/g, ' ')          // strip inline code
    .replace(/https?:\/\/\S+/g, ' ')   // strip URLs
    .replace(/[^a-z0-9\s]/g, ' ')      // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(s: string): Set<string> {
  const text = normalise(s);
  const out = new Set<string>();
  if (text.length < 3) {
    if (text) out.add(text);
    return out;
  }
  for (let i = 0; i <= text.length - 3; i++) out.add(text.slice(i, i + 3));
  return out;
}

export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  // iterate over the smaller set for speed
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const tg of small) if (big.has(tg)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let overlap = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const tg of small) if (big.has(tg)) overlap++;
  const union = a.size + b.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

export interface SimilarItem<T> {
  item: T;
  score: number;
}

/**
 * Rank `items` by similarity to `query` and return those at or above
 * `threshold`. The accessor extracts the text to compare from each item.
 */
export function similarTo<T>(
  query: string,
  items: T[],
  accessor: (t: T) => string,
  threshold = 0.55,
  topK = 5,
): SimilarItem<T>[] {
  const q = trigrams(query);
  if (q.size === 0) return [];
  const results: SimilarItem<T>[] = [];
  for (const item of items) {
    const cand = trigrams(accessor(item));
    const score = diceCoefficient(q, cand);
    if (score >= threshold) results.push({ item, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
