'use client';
import { useState, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { oauthService } from '@/services/oauthService';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { MdCheckCircleOutline, MdMailOutline } from 'react-icons/md';
import { ALL_PLATFORMS, getPlatformName } from '@/utils/platformMeta';
import { formatDate } from '@/utils/formatDate';
import type { PlatformConnection } from '@/types/client';
import type { PlatformName } from '@/types';
import styles from './ConnectionPanel.module.css';

interface ConnectionPanelProps {
  clientId: string;
}

export function ConnectionPanel({ clientId }: ConnectionPanelProps) {
  const showToast = useUIStore((s) => s.showToast);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [sendingRenewal, setSendingRenewal] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await oauthService.getConnections(clientId);
        setConnections(data);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId]);

  const getConnectionForPlatform = (platform: PlatformName): PlatformConnection | undefined =>
    connections.find((c) => c.platform === platform);

  const getDaysUntilExpiry = (expiresAt?: string): number | null => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (conn?: PlatformConnection) => {
    if (!conn || conn.status === 'pending') {
      return <Badge variant="ghost" size="sm">⏳ Pending Auth</Badge>;
    }
    if (conn.status === 'expired') {
      return <Badge variant="red" size="sm" dot>Expired</Badge>;
    }
    if (conn.status === 'expiring') {
      const days = getDaysUntilExpiry(conn.expiresAt);
      return <Badge variant="yellow" size="sm" dot>Expires in {days}d</Badge>;
    }
    if (conn.status === 'error') {
      return <Badge variant="red" size="sm">Error</Badge>;
    }
    return <Badge variant="green" size="sm"><MdCheckCircleOutline /> Connected</Badge>;
  };

  const handleConnect = async (platform: PlatformName) => {
    setConnectingPlatform(platform);
    try {
      const { authUrl } = await oauthService.initiateAuth(clientId, platform);
      window.open(authUrl, '_blank', 'width=600,height=700');
      showToast({ type: 'info', title: `${getPlatformName(platform)} authorization started`, message: 'Complete the login in the popup window.' });
    } catch {
      showToast({ type: 'error', title: 'Failed to start authorization' });
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleSendRenewal = async (platform: PlatformName) => {
    setSendingRenewal(platform);
    try {
      await oauthService.sendRenewal(clientId, platform);
      showToast({ type: 'success', title: 'Renewal reminder sent', message: `Email sent to client for ${getPlatformName(platform)} re-authorization.` });
    } catch {
      showToast({ type: 'error', title: 'Failed to send renewal' });
    } finally {
      setSendingRenewal(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.mainPanel}>
          <div className={styles.header}>
            <h3 className={styles.title}>Platform Connections</h3>
          </div>
          <div className={styles.grid}>
            {[1, 2].map((i) => (
              <div key={i} className={`skeleton ${styles.skeleton}`} />
            ))}
          </div>
        </div>
        <div className={styles.sidePanel}>
          <div className={styles.sideHeader}>
            <h3 className={styles.title}>Available Integrations</h3>
          </div>
          <div className={styles.list}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`skeleton ${styles.skeletonList}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activePlatforms = ALL_PLATFORMS.filter((p) => {
    const conn = getConnectionForPlatform(p);
    return conn && conn.status !== 'pending';
  });

  const unconnectedPlatforms = ALL_PLATFORMS.filter((p) => {
    const conn = getConnectionForPlatform(p);
    return !conn || conn.status === 'pending';
  });

  const connectedCount = connections.filter((c) => c.status === 'connected').length;
  const totalPlatforms = ALL_PLATFORMS.length;

  return (
    <div className={styles.layout}>
      {/* Active Connections Grid */}
      <div className={styles.mainPanel}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Connected Platforms</h3>
            <p className={styles.subtitle}>
              {connectedCount}/{totalPlatforms} platforms actively synced
            </p>
          </div>
        </div>

        {activePlatforms.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No platforms connected yet. Connect a platform from the list to start syncing revenue data.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {activePlatforms.map((platform) => {
              const conn = getConnectionForPlatform(platform);
              const days = conn?.expiresAt ? getDaysUntilExpiry(conn.expiresAt) : null;
              const isExpired = conn?.status === 'expired';
              const isExpiring = conn?.status === 'expiring';
              const isConnected = conn?.status === 'connected';

              return (
                <Card
                  key={platform}
                  className={`${styles.card} ${isExpired ? styles.cardExpired : ''} ${isExpiring ? styles.cardExpiring : ''} ${isConnected ? styles.cardConnected : ''}`}
                  padding="md"
                >
                  <div className={styles.cardTop}>
                    <PlatformIcon platform={platform} size="md" />
                    <div className={styles.cardInfo}>
                      <span className={styles.platformName}>{getPlatformName(platform)}</span>
                      {getStatusBadge(conn)}
                    </div>
                  </div>

                  {isConnected && conn?.lastSyncAt && (
                    <div className={styles.cardMeta}>
                      <span className={styles.metaItem}>
                        Last sync: {formatDate(conn.lastSyncAt, { short: true })}
                      </span>
                      {days !== null && days > 0 && (
                        <span className={styles.metaItem}>
                          Expires: {days}d
                        </span>
                      )}
                    </div>
                  )}

                  {isExpired && (
                    <div className={styles.cardMeta}>
                      <span className={styles.metaExpired}>
                        Token expired {conn?.expiresAt ? formatDate(conn.expiresAt, { short: true }) : ''}
                      </span>
                    </div>
                  )}

                  {isExpiring && (
                    <div className={styles.cardMeta}>
                      <span className={styles.metaExpiring}>
                        Expires in {days} day{days !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  <div className={styles.cardActions}>
                    {(isExpired || isExpiring) && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleSendRenewal(platform)}
                        loading={sendingRenewal === platform}
                        id={`renew-${platform}`}
                        icon={<MdMailOutline />}
                        tooltip="Send renewal email"
                      >
                        Send Renewal
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Integrations List (Right Side) */}
      <div className={styles.sidePanel}>
        <div className={styles.sideHeader}>
          <h3 className={styles.title}>Available Integrations</h3>
          <p className={styles.subtitle}>Connect new revenue sources</p>
        </div>
        
        <div className={styles.list}>
          {unconnectedPlatforms.length === 0 ? (
            <div className={styles.emptyStateSide}>
              <p>All available platforms are connected.</p>
            </div>
          ) : (
            unconnectedPlatforms.map((platform) => (
              <div key={platform} className={styles.listItem}>
                <div className={styles.listInfo}>
                  <PlatformIcon platform={platform} size="sm" />
                  <span className={styles.listName}>{getPlatformName(platform)}</span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleConnect(platform)}
                  loading={connectingPlatform === platform}
                  id={`connect-${platform}`}
                  tooltip="Connect integration"
                >
                  Connect
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
