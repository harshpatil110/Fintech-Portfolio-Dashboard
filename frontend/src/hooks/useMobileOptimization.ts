import { useEffect, useState } from 'react';

interface MobileOptimizationOptions {
  enableReducedMotion?: boolean;
  enableDataSaver?: boolean;
}

interface NetworkInformation extends EventTarget {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  saveData?: boolean;
  downlink?: number;
  rtt?: number;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

/**
 * Hook for mobile-specific optimizations
 * Detects network conditions, battery status, and user preferences
 */
export const useMobileOptimization = (
  options: MobileOptimizationOptions = {}
) => {
  const [networkSpeed, setNetworkSpeed] = useState<'fast' | 'slow' | 'unknown'>('unknown');
  const [dataSaverEnabled, setDataSaverEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    // Check network connection
    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    if (connection) {
      const updateNetworkInfo = () => {
        const effectiveType = connection.effectiveType;
        
        if (effectiveType === '4g') {
          setNetworkSpeed('fast');
        } else if (effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g') {
          setNetworkSpeed('slow');
        }

        setDataSaverEnabled(connection.saveData || false);
      };

      updateNetworkInfo();
      connection.addEventListener('change', updateNetworkInfo);

      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    }
  }, []);

  useEffect(() => {
    // Check battery status for low power mode detection
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatteryStatus = () => {
          // Consider low power mode if battery is below 20% and not charging
          setIsLowPowerMode(battery.level < 0.2 && !battery.charging);
        };

        updateBatteryStatus();
        battery.addEventListener('levelchange', updateBatteryStatus);
        battery.addEventListener('chargingchange', updateBatteryStatus);

        return () => {
          battery.removeEventListener('levelchange', updateBatteryStatus);
          battery.removeEventListener('chargingchange', updateBatteryStatus);
        };
      });
    }
  }, []);

  // Determine if we should use optimized mode
  const shouldOptimize = 
    dataSaverEnabled || 
    networkSpeed === 'slow' || 
    isLowPowerMode ||
    (options.enableReducedMotion && reducedMotion) ||
    options.enableDataSaver;

  return {
    networkSpeed,
    dataSaverEnabled,
    reducedMotion,
    isLowPowerMode,
    shouldOptimize,
    
    // Optimization recommendations
    shouldReduceAnimations: reducedMotion || isLowPowerMode,
    shouldLazyLoadImages: dataSaverEnabled || networkSpeed === 'slow',
    shouldReducePolling: isLowPowerMode || networkSpeed === 'slow',
    shouldUseCompression: networkSpeed === 'slow',
  };
};
