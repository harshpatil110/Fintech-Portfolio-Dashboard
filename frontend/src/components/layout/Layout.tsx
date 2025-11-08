import React from 'react';
import { Box, Container, useTheme, useMediaQuery } from '@mui/material';
import { Navigation } from './Navigation';
import { MobileBottomNav } from './MobileBottomNav';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navigation />
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          py: isMobile ? 2 : isTablet ? 2.5 : 3,
          px: isMobile ? 1 : 0,
          pb: isMobile ? 10 : isTablet ? 2.5 : 3, // Extra padding for bottom nav on mobile
        }}
      >
        <Container 
          maxWidth="xl"
          sx={{
            px: isMobile ? 1 : isTablet ? 2 : 3,
          }}
        >
          {children}
        </Container>
      </Box>
      {isMobile && <MobileBottomNav />}
    </Box>
  );
};