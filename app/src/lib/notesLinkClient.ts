// Client half of the link-metadata flow: calls the authenticated
// /api/link-meta edge function with the current session's JWT.

import { supabase } from './supabase';
import type { LinkMeta } from './notesLinkMeta';

export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/link-meta?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as LinkMeta;
  } catch (err) {
    console.error('link metadata fetch failed:', err);
    return null;
  }
}
