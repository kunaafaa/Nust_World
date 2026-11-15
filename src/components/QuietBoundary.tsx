'use client';
import { Component, type ReactNode } from 'react';

/**
 * Error boundary for optional parts of the UI (reviews). If they throw (a chunk fails to load, a service returns
 * something unexpected), only that part is replaced by `fallback`; the map and the rest of the card keep working.
 * Nothing about the error is shown to the user.
 */
export class QuietBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
