'use client';
import { useEffect } from 'react';
import { setupMSW } from '@/mocks/browser';

let initialized = false;

export function MSWProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (initialized) return;
    // Backend API routes are not yet implemented (Sprint 3+ per backend index.ts).
    // MSW provides mock data in all environments until the real API is ready.
    initialized = true;
    setupMSW();
  }, []);
  return <>{children}</>;
}
