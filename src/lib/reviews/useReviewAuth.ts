'use client';
/** Signed-in reviewer, shared by the reviews section and the food raters. The store loads on first use. */
import { create } from 'zustand';
import type { ReviewStore, ReviewUser } from './types';

interface AuthState {
  ready: boolean;
  user: ReviewUser | null;
  /** a guest's display name (null until they have picked one, and for email accounts) */
  guestName: string | null;
}

export const useReviewAuth = create<AuthState>(() => ({
  ready: false,
  user: null,
  guestName: null,
}));

/** Can write: a university account, or a guest who has picked a name. */
export const canWrite = (s: Pick<AuthState, 'user' | 'guestName'>) =>
  !!s.user && (!s.user.guest || !!s.guestName);

async function apply(s: ReviewStore, user: ReviewUser | null) {
  let guestName: string | null = null;
  if (user?.guest) {
    try {
      guestName = await s.guestName();
    } catch {
      /* offline: they can pick it again */
    }
  }
  // The auth event of a new guest arrives before its name is saved: never let that late read wipe the name.
  const cur = useReviewAuth.getState();
  if (!guestName && user && cur.user?.id === user.id && user.guest) guestName = cur.guestName;
  // A guest just became a university account (same id): cached lists and counts still say "guest".
  if (user && cur.user?.id === user.id && cur.user.guest && !user.guest) {
    const { invalidate } = await import('./client');
    invalidate('rv:', 'food:');
  }
  useReviewAuth.setState({ ready: true, user, guestName });
}

/** After the guest form saved a name (with the now signed-in guest), or "Delete my data" removed it (null). */
export function setGuestName(guestName: string | null, user?: ReviewUser | null) {
  useReviewAuth.setState(user === undefined ? { guestName } : { ready: true, user, guestName });
}

let started = false;
export function ensureReviewAuth() {
  if (started) return;
  started = true;
  void (async () => {
    const { getStore } = await import('./client');
    const s = await getStore();
    if (!s) {
      started = false;
      useReviewAuth.setState({ ready: true, user: null, guestName: null });
      return;
    }
    s.onAuthChange((user) => void apply(s, user));
    try {
      await apply(s, await s.user());
    } catch {
      useReviewAuth.setState({ ready: true, user: null, guestName: null });
    }
  })();
}
