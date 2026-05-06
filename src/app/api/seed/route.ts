import { NextResponse } from 'next/server';
import { seed } from '@/lib/seed';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Seed endpoint is only available in development' },
      { status: 403 }
    );
  }

  try {
    await seed();
    return NextResponse.json({ success: true, message: 'Database seeded successfully' });
  } catch (error) {
    console.error('[POST /api/seed]', error);
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
