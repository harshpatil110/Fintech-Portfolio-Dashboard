import { useTheme, useMediaQuery } from '@mui/material';

/**
 * Custom hook for responsive breakpoints
 * Provides convenient boolean flags for different screen sizes
 */
export const useResponsive = () => {
  const theme = useTheme();
  
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.down('md')); // < 900px
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg')); // >= 1200px
  const isSmallMobile = useMediaQuery('(max-width:400px)'); // Very small phones
  
  // Specific breakpoint checks
  const isXs = useMediaQuery(theme.breakpoints.only('xs')); // 0-600px
  const isSm = useMediaQuery(theme.breakpoints.only('sm')); // 600-900px
  const isMd = useMediaQuery(theme.breakpoints.only('md')); // 900-1200px
  const isLg = useMediaQuery(theme.breakpoints.only('lg')); // 1200-1536px
  const isXl = useMediaQuery(theme.breakpoints.only('xl')); // >= 1536px
  
  // Touch device detection
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Orientation
  const isPortrait = useMediaQuery('(orientation: portrait)');
  const isLandscape = useMediaQuery('(orientation: landscape)');
  
  return {
    // Main breakpoints
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    
    // Specific breakpoints
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    
    // Device capabilities
    isTouchDevice,
    
    // Orientation
    isPortrait,
    isLandscape,
    
    // Helper functions
    getSpacing: (desktop: number, tablet?: number, mobile?: number) => {
      if (isMobile && mobile !== undefined) return mobile;
      if (isTablet && tablet !== undefined) return tablet;
      return desktop;
    },
    
    getFontSize: (desktop: string, mobile?: string) => {
      return isMobile && mobile ? mobile : desktop;
    },
    
    getColumns: (desktop: number, tablet?: number, mobile?: number) => {
      if (isMobile && mobile !== undefined) return mobile;
      if (isTablet && tablet !== undefined) return tablet;
      return desktop;
    },
  };
};
