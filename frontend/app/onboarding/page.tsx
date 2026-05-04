'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clientService } from '@/services/clientService';
import { useClientStore } from '@/stores/clientStore';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { ALL_PLATFORMS } from '@/utils/platformMeta';
import type { AccountingMode } from '@/types/client';
import { MdCheck, MdArrowBack, MdArrowForward } from 'react-icons/md';
import styles from './page.module.css';

const STEPS = ['Client Info', 'Connect Platforms', 'Accounting Mode', 'Review'];

export default function OnboardingPage() {
  const router = useRouter();
  const addClient = useClientStore((s) => s.addClient);
  const showToast = useUIStore((s) => s.showToast);
  const setPageHeader = useUIStore((s) => s.setPageHeader);

  useEffect(() => {
    setPageHeader('Add New Client', 'Walk through setup to connect platforms and configure accounting.');
    return () => setPageHeader(null, null);
  }, [setPageHeader]);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<AccountingMode>('accrual');
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const togglePlatform = (p: string) =>
    setConnected((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const canAdvance = [
    name.trim().length > 0 && email.includes('@'),
    true, // platforms optional
    true, // mode always selected
    true,
  ];

  const handleFinish = async () => {
    setSaving(true);
    try {
      const client = await clientService.create({ name, email, accountingMode: mode });
      addClient(client);
      showToast({ type: 'success', title: `${name} added!`, message: 'Platform invite emails sent.' });
      router.push('/');
    } catch {
      showToast({ type: 'error', title: 'Failed to create client' });
    } finally { setSaving(false); }
  };

  return (
    <div className={styles.page}>
      {/* Header moved to navbar */}

      {/* Step indicator */}
      <div className={styles.stepBar}>
        {STEPS.map((s, i) => (
          <div key={s} className={styles.stepItem}>
            <div className={`${styles.stepCircle} ${i < step ? styles.done : ''} ${i === step ? styles.active : ''}`}>
              {i < step ? <MdCheck /> : i + 1}
            </div>
            <span className={`${styles.stepLabel} ${i === step ? styles.stepLabelActive : ''}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className={styles.card}>
        {step === 0 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Client Information</h2>
            <div className={styles.field}>
              <label className={styles.label}>Full Name</label>
              <input id="client-name-input" className={styles.input} type="text" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <input id="client-email-input" className={styles.input} type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className={styles.hint}>An invite will be sent to connect their platforms.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Connect Platforms</h2>
            <p className={styles.stepDesc}>Select which platforms to invite the client to authorize. They'll receive an email with secure OAuth links.</p>
            <div className={styles.platformGrid}>
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  className={`${styles.platformBtn} ${connected.has(p) ? styles.platformSelected : ''}`}
                  onClick={() => togglePlatform(p)}
                  id={`platform-${p}`}
                >
                  <PlatformIcon platform={p} size="lg" />
                  <span className={styles.platformName}>{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                  {connected.has(p) && <span className={styles.platformCheck}><MdCheck /></span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Accounting Method</h2>
            <p className={styles.stepDesc}>This determines how revenue entries are created in QuickBooks.</p>
            <div className={styles.modeCards}>
              {(['accrual', 'cash'] as AccountingMode[]).map((m) => (
                <button
                  key={m}
                  className={`${styles.modeCard} ${mode === m ? styles.modeSelected : ''}`}
                  onClick={() => setMode(m)}
                  id={`mode-${m}`}
                >
                  <span className={styles.modeTitle}>{m === 'accrual' ? 'Accrual Basis' : 'Cash Basis'}</span>
                  <span className={styles.modeDesc}>
                    {m === 'accrual'
                      ? 'Revenue recorded when earned (e.g. YouTube reports). Tracks phantom receivables across NET-60 gaps.'
                      : 'Revenue recorded when bank deposit arrives. Simpler — one entry per deposit.'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Review & Confirm</h2>
            <div className={styles.summary}>
              {[
                { label: 'Client Name', value: name },
                { label: 'Email', value: email },
                { label: 'Accounting Method', value: mode === 'accrual' ? 'Accrual Basis' : 'Cash Basis' },
                { label: 'Platforms Selected', value: connected.size > 0 ? [...connected].join(', ') : 'None selected (can add later)' },
              ].map(({ label, value }) => (
                <div key={label} className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{label}</span>
                  <span className={styles.summaryValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className={styles.nav}>
          {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)} icon={<MdArrowBack />}>Back</Button>}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1
            ? <Button variant="accent" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance[step]} icon={<MdArrowForward />} iconPosition="right">Continue</Button>
            : <Button variant="success" onClick={handleFinish} loading={saving} id="finish-onboarding-btn">Add Client & Send Invites</Button>
          }
        </div>
      </div>
    </div>
  );
}
