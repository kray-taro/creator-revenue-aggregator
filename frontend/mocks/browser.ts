import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

const worker = typeof window !== 'undefined' ? setupWorker(...handlers) : null;

export async function setupMSW() {
  if (!worker) return;
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
  console.debug('[MSW] Mock service worker active');
}
