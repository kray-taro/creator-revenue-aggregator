'use client';
import { useState, useCallback } from 'react';
import { searchService } from '@/services/searchService';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { MoneyDisplay } from '@/components/shared/MoneyDisplay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/utils/formatDate';
import { ALL_PLATFORMS } from '@/utils/platformMeta';
import type { Transaction, PlatformName } from '@/types';
import styles from './page.module.css';
import { MdSearch } from 'react-icons/md';

const STATUS_OPTIONS = ['pending_review', 'approved', 'synced', 'error'];

export default function SearchPage() {
  const [query, setQuery]       = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus]     = useState('');
  const [results, setResults]   = useState<Transaction[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() && !platform && !status) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchService.search({
        q: query,
        platform: platform || undefined,
        status: status || undefined,
      });
      setResults(res.data);
      setTotal(res.total);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, platform, status]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Search</h1>
        <p className={styles.pageSubtitle}>Find transactions across all clients</p>
      </div>

      {/* Search bar + filters */}
      <form className={styles.searchForm} onSubmit={handleSearch}>
        <div className={styles.searchBar}>
          <MdSearch className={styles.searchIcon} />
          <input
            id="global-search-input"
            className={styles.searchInput}
            type="text"
            placeholder='Try "Stripe >500", "Client A March", "Duplicate"…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All Platforms</option>
            {ALL_PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <select className={styles.filterSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <Button type="submit" variant="primary" loading={loading} id="search-submit-btn">Search</Button>
        </div>
      </form>

      {/* Hints */}
      {!searched && (
        <div className={styles.hints}>
          {['"stripe >500"', '"Client A March"', '"duplicate"', '"youtube adsense"'].map((h) => (
            <button key={h} className={styles.hint} onClick={() => { setQuery(h.replace(/"/g, '')); setTimeout(handleSearch, 50); }}>
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && (
        <div>
          <p className={styles.resultCount}>{loading ? 'Searching…' : `${total} result${total !== 1 ? 's' : ''}`}</p>
          {!loading && results.length > 0 && (
            <div className={styles.resultsTable}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.thead}>
                    <th>Platform</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Net Payout</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((tx) => (
                    <tr key={tx.id} className={styles.trow}>
                      <td className={styles.td}><PlatformIcon platform={tx.platform} size="sm" showName /></td>
                      <td className={styles.td}><span className={styles.clientId}>{tx.clientId}</span></td>
                      <td className={styles.td}><span className={styles.mono}>{formatDate(tx.transactionDate, { short: true })}</span></td>
                      <td className={styles.td}><span className={styles.desc}>{tx.description}</span></td>
                      <td className={styles.td}><MoneyDisplay amount={tx.netPayout} size="sm" /></td>
                      <td className={styles.td}>
                        <Badge
                          variant={tx.status === 'synced' ? 'green' : tx.status === 'error' ? 'red' : tx.status === 'approved' ? 'blue' : 'yellow'}
                          size="sm"
                        >
                          {tx.status.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className={styles.empty}>
              <MdSearch className={styles.emptyIcon} />
              <p>No transactions matched your search.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
