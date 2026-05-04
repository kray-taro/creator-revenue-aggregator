'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useContext } from 'react';
import { ThemeContext } from '@/components/providers/ThemeProvider';
import { useUIStore } from '@/stores/uiStore';
import { MdSearch, MdNotifications, MdHelp } from 'react-icons/md';
import styles from './Header.module.css';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/search': 'Review Queue',
  '/queue': 'Review Queue',
  '/clients': 'Clients',
  '/onboarding': 'Add Client',
  '/settings': 'Settings',
};

export const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [searchValue, setSearchValue] = useState('');
  
  const pageTitle = useUIStore((s) => s.pageTitle);
  const pageSubtitle = useUIStore((s) => s.pageSubtitle);

  const defaultTitle = PAGE_TITLES[pathname]
    ?? (pathname.startsWith('/clients/') ? 'Client Review' : 'Credbo');
    
  const titleToDisplay = pageTitle || defaultTitle;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <header className={styles.header}>
      {/* Left: Page title */}
      <div className={styles.titleArea}>
        <div role="heading" aria-level={1} className={styles.title}>{titleToDisplay}</div>
        {pageSubtitle && <div className={styles.subtitle}>{pageSubtitle}</div>}
      </div>

      {/* Center: Search bar */}
      <form className={styles.searchBar} onSubmit={handleSearch}>
        <MdSearch className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search clients or transactions..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </form>

      {/* Right: Actions */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} aria-label="Notifications">
          <MdNotifications />
          <span className={styles.notifDot} />
        </button>
        <button className={styles.actionBtn} aria-label="Help">
          <MdHelp />
        </button>
        <div className={styles.divider} />
        <button className={styles.avatarBtn} aria-label="User menu">
          <div className={styles.avatar}>S</div>
        </button>
      </div>
    </header>
  );
};
