// Mock portfolio hook for demo mode
export const usePortfolio = (userId: string | null) => {
  return {
    data: {
      portfolio: {
        id: 'mock-portfolio-id',
        userId: userId || 'mock-user-id',
        name: 'My Portfolio',
        positions: [],
        totalValue: 0,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      summary: {
        totalValue: 0,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        positionCount: 0,
        topPerformers: [],
        worstPerformers: [],
      },
    },
    isLoading: false,
    error: null,
    refetch: async () => {},
  };
};
