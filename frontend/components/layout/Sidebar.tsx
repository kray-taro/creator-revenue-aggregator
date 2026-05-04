'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUIStore } from '@/stores/uiStore';
import { useDashboardAggregates } from '@/hooks/useDashboard';
import { cn } from '@/utils/cn';
import styles from './Sidebar.module.css';
import { MdDashboard, MdFactCheck, MdExtension, MdAccountBalance, MdSettings, MdHelp, MdAdd, MdBarChart, MdPeople, MdHistory } from 'react-icons/md';

const PRIMARY_NAV = [
  { href: '/', icon: <MdDashboard />, label: 'Dashboard' },
  { href: '/queue', icon: <MdFactCheck />, label: 'Review Queue' },
  { href: '/clients', icon: <MdPeople />, label: 'Clients' },
  { href: '/reports', icon: <MdBarChart />, label: 'Reports' },
  { href: '/integrations', icon: <MdExtension />, label: 'Integrations' },
  { href: '/audit-log', icon: <MdHistory />, label: 'Audit Log' },
];

const FOOTER_NAV = [
  { href: '/settings', icon: <MdSettings />, label: 'Settings' },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const pathname = usePathname();
  const { data: dashAgg } = useDashboardAggregates();
  const pendingCount = dashAgg?.totalPending ?? 0;

  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)}>
      {/* Logo */}
      <div className={styles.brand} onClick={toggle} role="button" tabIndex={0} aria-label="Toggle sidebar">
        <div className={styles.logoIcon}><span className={styles.logoLetter}>C</span></div>
        {!collapsed && (
          <div className={styles.logoTextWrap}>
            <span className={styles.logoTitle}>Credbo</span>
            <span className={styles.logoSub}>CREATOR PRO</span>
          </div>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className={cn(styles.nav, collapsed && styles.navCollapsed)}>
        {PRIMARY_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const isQueue = item.href === '/queue';
          return (
            <Link key={item.href} href={item.href}
              className={cn(styles.navItem, active && styles.active)}
              title={collapsed ? item.label : undefined}>
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
              {!collapsed && isQueue && pendingCount > 0 && (
                <span className={styles.badge}>{pendingCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn(styles.footer, collapsed && styles.footerCollapsed)}>
        {FOOTER_NAV.map((item) => (
          <Link key={item.label} href={item.href}
            className={cn(styles.navItem, pathname === item.href && styles.active)}
            title={collapsed ? item.label : undefined}>
            <span className={styles.navIcon}>{item.icon}</span>
            {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
          </Link>
        ))}
        <button className={styles.navItem} title={collapsed ? 'Help Center' : undefined}>
          <span className={styles.navIcon}><MdHelp /></span>
          {!collapsed && <span className={styles.navLabel}>Support</span>}
        </button>
        <Link href="/onboarding" className={styles.ctaBtn} title="Add Client">
          <MdAdd className={styles.ctaIcon} />
          {!collapsed && <span className={styles.ctaLabel}>Add Client</span>}
        </Link>
      </div>
    </aside>
  );
}
