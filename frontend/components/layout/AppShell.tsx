'use client';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/cn';

/**
 * Client-side shell layout that reads sidebar collapse state
 * and applies the correct CSS class to the app-shell grid.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className={cn('app-shell', collapsed && 'collapsed')} id="app-shell">
      {children}
    </div>
  );
}
