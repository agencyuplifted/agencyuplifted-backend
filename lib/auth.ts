import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "./session";

// Server-only Helper (next/headers) -- NICHT in der Middleware importieren,
// dort direkt verifySession() aus lib/session.ts mit dem Cookie aus der
// Request verwenden.
export async function getAktuellerBenutzer(): Promise<{ id: string; name: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  return { id: session.mitarbeiterId, name: session.name };
}
