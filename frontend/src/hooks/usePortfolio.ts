import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { portfolioService } from '../services/portfolioService';
import { PortfolioResponse } from '../types/portfolio';

export const usePortfolio = (userId: string | null): UseQueryResult<PortfolioResponse, Error> => {
  return useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return portfolioService.getPortfolio(userId);
    },
    enabled: !!userId,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute for live updates
    refetchIntervalInBackground: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};