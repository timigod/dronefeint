import { useCallback, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
}

export const useDragPan = (initialOffset: Point) => {
  const [offset, setOffset] = useState<Point>(initialOffset);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<DragState>({
    pointerX: 0,
    pointerY: 0,
    offsetX: initialOffset.x,
    offsetY: initialOffset.y,
  });

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      dragStartRef.current = {
        pointerX: clientX,
        pointerY: clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      setIsDragging(true);
    },
    [offset.x, offset.y]
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const { pointerX, pointerY, offsetX, offsetY } = dragStartRef.current;
      const deltaX = clientX - pointerX;
      const deltaY = clientY - pointerY;
      setOffset({
        x: offsetX - deltaX,
        y: offsetY - deltaY,
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

