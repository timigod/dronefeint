import { useEffect, useRef, useState } from 'react';
import { getViewportSize, type ViewportSize } from '../utils/viewport';

interface UseViewportSizeOptions {
  onViewportChange?: (prev: ViewportSize, next: ViewportSize) => void;
}

export const useViewportSize = ({ onViewportChange }: UseViewportSizeOptions = {}) => {
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => getViewportSize());
  const viewportSizeRef = useRef(viewportSize);
  const previousViewportRef = useRef(viewportSize);

  useEffect(() => {
    const prev = previousViewportRef.current;
    viewportSizeRef.current = viewportSize;

    if (onViewportChange && (prev.width !== viewportSize.width || prev.height !== viewportSize.height)) {
      onViewportChange(prev, viewportSize);
    }

    previousViewportRef.current = viewportSize;
  }, [onViewportChange, viewportSize]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let animationFrameId: number | null = null;

    const handleResize = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        setViewportSize((prev) => {
          const next = getViewportSize();
          if (prev.width === next.width && prev.height === next.height) {
            return prev;
          }
          return next;
        });
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return {
    viewportSize,
    viewportSizeRef,
    previousViewportRef,
  };
};
