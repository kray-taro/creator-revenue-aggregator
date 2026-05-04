'use client';
import { useEffect } from 'react';
import { useTransactionStore } from '@/stores/transactionStore';
import { transactionService } from '@/services/transactionService';
import { ReviewQueue } from '@/components/review/ReviewQueue';
import styles from './page.module.css';

export default function QueuePage() {
  const { setTransactions, isLoading, setLoading } = useTransactionStore();

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true);
      try {
        const txData = await transactionService.listAll();
        setTransactions(txData.data);
      } catch {
        // Handle error gracefully if needed
      } finally {
        setLoading(false);
      }
    }
    loadTransactions();
  }, [setTransactions, setLoading]);

  return (
    <div className={styles.page}>
      {isLoading ? (
        <div className={styles.loading}>
          {[...Array(4)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
        </div>
      ) : (
        <ReviewQueue clientId="global" />
      )}
    </div>
  );
}
