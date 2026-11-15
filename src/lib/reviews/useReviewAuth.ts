'use client';
/** Signed-in reviewer, shared by the reviews section and the food raters. The store loads on first use. */
import { create } from 'zustand';
import type { ReviewUser } from './types';

interface AuthState {
  ready: boolean;
  user: ReviewUser | null;
}

export const useReviewAuth = create<AuthState>(() => ({ ready: false, user: null }));

let started = false;
export function ensureReviewAuth() {
  if (started) return;
  started = true;
  void (async () => {
    const { getStore } = await import('./client');
    const s = await getStore();
    if (!s) {
      started = false;
      useReviewAuth.setState({ ready: true, user: null });
      return;
    }
    s.onAuthChange((user) => useReviewAuth.setState({ ready: true, user }));
    try {
      useReviewAuth.setState({ ready: true, user: await s.user() });
    } catch {
      useReviewAuth.setState({ ready: true, user: null });
    }
  })();
}
