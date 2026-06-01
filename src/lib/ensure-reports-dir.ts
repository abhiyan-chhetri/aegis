import { promises as fs } from 'fs';
import path from 'path';

export async function ensureReportsDir(): Promise<string> {
  // Store outside public/ — files must be served through an authenticated API route
  const reportsDir = path.join(process.cwd(), 'storage', 'reports');
  try {
    await fs.mkdir(reportsDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create reports directory:', error);
  }
  return reportsDir;
}
