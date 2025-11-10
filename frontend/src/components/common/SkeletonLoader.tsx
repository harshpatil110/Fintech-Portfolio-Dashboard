import { Box, Card, CardContent, Skeleton } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';

interface SkeletonLoaderProps {
  variant?: 'dashboard' | 'portfolio' | 'watchlist' | 'chart' | 'card';
  count?: number;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant = 'card', 
  count = 1 
}) => {
  const renderDashboardSkeleton = () => (
    <Box>
      <Grid container spacing={3}>
        {/* Summary cards */}
        {[1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card>
              <CardContent>
                <Skeleton variant="text" width="60%" height={24} />
                <Skeleton variant="text" width="80%" height={40} sx={{ mt: 1 }} />
                <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
        
        {/* Chart skeleton */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />
              <Skeleton variant="rectangular" height={300} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  const renderPortfolioSkeleton = () => (
    <Box>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="40%" height={28} />
                <Skeleton variant="text" width="30%" height={20} />
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Skeleton variant="text" width={100} height={28} />
                <Skeleton variant="text" width={80} height={20} />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Skeleton variant="text" width="20%" />
              <Skeleton variant="text" width="20%" />
              <Skeleton variant="text" width="20%" />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );

  const renderWatchlistSkeleton = () => (
    <Box>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} sx={{ mb: 1.5 }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Skeleton variant="text" width={80} height={24} />
                <Skeleton variant="text" width={120} height={18} />
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Skeleton variant="text" width={80} height={24} />
                <Skeleton variant="text" width={60} height={18} />
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );

  const renderChartSkeleton = () => (
    <Card>
      <CardContent>
        <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" width={60} height={32} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );

  const renderCardSkeleton = () => (
    <Card>
      <CardContent>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="80%" height={20} sx={{ mt: 1 }} />
        <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
      </CardContent>
    </Card>
  );

  switch (variant) {
    case 'dashboard':
      return renderDashboardSkeleton();
    case 'portfolio':
      return renderPortfolioSkeleton();
    case 'watchlist':
      return renderWatchlistSkeleton();
    case 'chart':
      return renderChartSkeleton();
    case 'card':
    default:
      return renderCardSkeleton();
  }
};

export default SkeletonLoader;
