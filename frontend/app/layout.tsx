import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Toaster } from '@/components/layout/Toaster';
import { MSWProvider } from '@/components/providers/MSWProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import * as Tooltip from '@radix-ui/react-tooltip';

export const metadata: Metadata = {
  title: { default: 'Credbo', template: '%s | Credbo' },
  description: 'Multi-platform revenue aggregation for creator economy bookkeepers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <QueryProvider>
            <MSWProvider>
              <Tooltip.Provider delayDuration={200} disableHoverableContent>
                <AppShell>
                  <Sidebar />
                  <div className="main-content">
                    <Header />
                    <main className="page-body">{children}</main>
                  </div>
                </AppShell>
                <Toaster />
              </Tooltip.Provider>
            </MSWProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
