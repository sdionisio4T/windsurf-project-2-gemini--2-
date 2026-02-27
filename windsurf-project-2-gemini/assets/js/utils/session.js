/**
 * Lee la sesión activa de Supabase desde localStorage.
 * Retorna el objeto de sesión o null si no hay sesión válida.
 */
export function getSupabaseRawSession() {
  try {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!sbKey) return null;
    const raw = localStorage.getItem(sbKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.session ?? parsed;
    if (!session?.user) return null;
    if (session.expires_at && Date.now() / 1000 > session.expires_at) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Retorna el username activo o null.
 */
export function getActiveUsername() {
  const session = getSupabaseRawSession();
  if (!session) return null;
  const meta = session.user?.user_metadata || {};
  return meta.username || session.user?.email?.split('@')[0] || null;
}

/**
 * Retorna los metadatos del usuario activo o null.
 */
export function getActiveUserMetadata() {
  const session = getSupabaseRawSession();
  return session?.user?.user_metadata || null;
}
