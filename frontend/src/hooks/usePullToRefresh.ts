import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  enabled?: boolean;
}

/**
 * Custom hook for implementing pull-to-refresh functionality on mobile
 * @param options - Configuration options
 * @returns Object containing refresh state and ref to attach to container
 */
export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  enabled = true,
}: PullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    let isPulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Only start pull if at the top of the page
      if (container.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      // Only allow pulling down
      if (distance > 0 && container.scrollTop === 0) {
        // Prevent default scrolling
        e.preventDefault();
        
        // Apply resistance to the pull
        const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
        setPullDistance(resistedDistance);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling) return;

      isPulling = false;

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isRefreshing, onRefresh, pullDistance, threshold]);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    shouldShowIndicator: pullDistance > 0,
    progress: Math.min((pullDistance / threshold) * 100, 100),
  };
};
