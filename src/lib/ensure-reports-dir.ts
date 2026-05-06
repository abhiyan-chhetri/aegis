import { promises as fs } from 'fs';
import path from 'path';

export async function ensureReportsDir(): Promise<string> {
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  try {
    await fs.mkdir(reportsDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create reports directory:', error);
  }
  return reportsDir;
}
