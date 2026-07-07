// Auth shim for local/desktop mode: there are no accounts — the app is
// always "signed in" as the single fixed local user, so the Protected
// routes, useAuth, and every currentUserId() call work unchanged. Shapes
// mirror the exact supabase-js surface this app uses (getUser, getSession,
// onAuthStateChange, signInWithOtp, signOut).

import { LOCAL_USER_EMAIL, LOCAL_USER_ID } from './prelude';

const localUser = {
  id: LOCAL_USER_ID,
  email: LOCAL_USER_EMAIL,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date(0).toISOString(),
};

const localSession = {
  access_token: 'local',
  refresh_token: 'local',
  token_type: 'bearer',
  // Far-future expiry: the "session" is the app being open on this machine.
  expires_at: 2_000_000_000,
  expires_in: 2_000_000_000,
  user: localUser,
};

export function createAuthShim() {
  return {
    async getUser() {
      return { data: { user: localUser }, error: null };
    },
    async getSession() {
      return { data: { session: localSession }, error: null };
    },
    onAuthStateChange(
      callback: (event: string, session: typeof localSession | null) => void,
    ) {
      // Report the signed-in state once, asynchronously (matching the real
      // client's timing so React effects behave identically).
      queueMicrotask(() => callback('SIGNED_IN', localSession));
      return { data: { subscription: { unsubscribe() { /* nothing to undo */ } } } };
    },
    async signInWithOtp(_opts: unknown) {
      // No accounts locally; succeed silently (the Login page is never
      // reached anyway because a session always exists).
      return { data: {}, error: null };
    },
    async signOut() {
      return { error: null };
    },
  };
}
