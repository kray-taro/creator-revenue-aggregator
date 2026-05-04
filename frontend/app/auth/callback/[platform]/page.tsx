'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { oauthService } from '@/services/oauthService';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { getPlatformName } from '@/utils/platformMeta';
import type { PlatformName } from '@/types';
import { MdCheckCircleOutline } from 'react-icons/md';
import styles from './page.module.css';

/**
 * OAuth callback handler page.
 *
 * PRD US-101 AC #3-4: "Client clicks platform button → OAuth popup →
 * After approval, token stored encrypted at rest"
 *
 * PRD §9 Renewal Flow: "Client authenticates → Token returned →
 * Dashboard updates: Red → Green"
 *
 * Receives `code` and `state` from URL params after platform redirect,
 * exchanges them for tokens via backend API.
 */
export default function OAuthCallbackPage() {
  const { platform } = useParams<{ platform: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(5);

  const platformName = platform as PlatformName;
  const displayName = getPlatformName(platformName);

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage(`Authorization denied: ${error}`);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Missing authorization code or state parameter.');
        return;
      }

      try {
        const result = await oauthService.handleCallback(platform, code, state);
        if (result.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage('Token exchange failed. Please try again.');
        }
      } catch {
        setStatus('error');
        setErrorMessage('An unexpected error occurred during authorization.');
      }
    }

    handleCallback();
  }, [platform, searchParams]);

  // Auto-redirect countdown after success
  useEffect(() => {
    if (status !== 'success') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          router.push('/');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <PlatformIcon platform={platformName} size="lg" />
        </div>

        {status === 'loading' && (
          <>
            <div className={styles.spinner} />
            <h1 className={styles.title}>Connecting {displayName}…</h1>
            <p className={styles.subtitle}>Exchanging authorization tokens securely.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className={styles.successIcon}><MdCheckCircleOutline /></div>
            <h1 className={styles.title}>{displayName} Connected!</h1>
            <p className={styles.subtitle}>
              Your account has been securely authorized. Revenue data will sync automatically.
            </p>
            <p className={styles.countdown}>
              Redirecting to dashboard in {countdown}s…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className={styles.errorIcon}>✕</div>
            <h1 className={styles.title}>Connection Failed</h1>
            <p className={styles.subtitle}>{errorMessage}</p>
            <button
              className={styles.retryBtn}
              onClick={() => router.back()}
            >
              ← Go Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
