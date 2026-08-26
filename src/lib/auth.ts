import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'aegis-super-secret-key-change-in-production'
);

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  team: string;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('aegis-session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    const id = (payload as SessionUser).id;
    if (!id) return null;
    // Self-heal: confirm the user still exists and return the CURRENT row.
    // JWTs live 7 days and carry the id from login time — if the DB was
    // re-seeded or the user's row changed, a stale token used to make
    // FK-backed writes (Chat, FindingWatcher, …) fail with 23503. Looking the
    // user up here turns that into a clean 401 → user logs in again.
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, initials: true, role: true, team: true },
    });
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function getUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}
