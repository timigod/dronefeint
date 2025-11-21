import { useCallback, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

export const useDragPan = (initialOffset: Point) => {
  const [offset, setOffset] = useState<Point>(initialOffset);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      dragStartRef.current = {
        x: clientX - offset.x,
        y: clientY - offset.y,
      };
      setIsDragging(true);
    },
    [offset.x, offset.y]
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;
      setOffset({
        x: clientX - dragStartRef.current.x,
        y: clientY - dragStartRef.current.y,
      });
    },
    [isDragging]
  );

  const endDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  const nudgeOffset = useCallback((deltaX: number, deltaY: number) => {
    setOffset((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
  }, []);

  return {
    offset,
    setOffset,
    isDragging,
    beginDrag,
    updateDrag,
    endDrag,
    nudgeOffset,
  };
};

