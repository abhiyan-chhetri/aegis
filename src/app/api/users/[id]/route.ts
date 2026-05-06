import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { name, role, team, initials, currentPassword, newPassword } = body;

    // Password change: only the user themselves can change their own password
    if (newPassword !== undefined) {
      if (session.id !== id) {
        return NextResponse.json({ error: 'You can only change your own password' }, { status: 403 });
      }
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      const user = await db.user.findUnique({ where: { id } });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

      const hashed = await bcrypt.hash(newPassword, 10);
      await db.user.update({ where: { id }, data: { password: hashed } });
      return NextResponse.json({ success: true });
    }

    // Profile update: name, role, team, initials
    const data: Record<string, string> = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (team !== undefined) data.team = team;
    if (initials !== undefined) data.initials = initials;

    const user = await db.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, initials: true, role: true, team: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    console.error('[PATCH /api/users/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Prevent self-deletion
    if (session.id === id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/users/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
