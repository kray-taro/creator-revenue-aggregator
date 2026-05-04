import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { clientService } from '@/services/clientService';
import { searchService } from '@/services/searchService';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const queryClient = new QueryClient();

  // Prefetch dashboard data on the server
  // Catch errors during prefetch so the build does not fail if the API is unreachable (e.g., during static generation)
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['clientAggregates'],
        queryFn: () => clientService.listAggregates(),
      }),
      queryClient.prefetchQuery({
        queryKey: ['dashboardAggregates'],
        queryFn: () => searchService.getDashboardAggregates(),
      }),
    ]);
  } catch (err) {
    console.warn('Prefetch failed during build, continuing without prefetched data.', err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
