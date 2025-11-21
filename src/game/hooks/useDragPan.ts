import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [isMomentum, setIsMomentum] = useState(false);
  const dragStartRef = useRef<DragState>({
    pointerX: 0,
    pointerY: 0,
    offsetX: initialOffset.x,
    offsetY: initialOffset.y,
  });
  const animationFrameRef = useRef<number | null>(null);
  const momentumFrameRef = useRef<number | null>(null);
  const lastDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number | null>(null);
  const velocityRef = useRef<Point>({ x: 0, y: 0 });

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (momentumFrameRef.current !== null) {
        cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
        setIsMomentum(false);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      dragStartRef.current = {
        pointerX: clientX,
        pointerY: clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      lastDeltaRef.current = { x: 0, y: 0 };
      velocityRef.current = { x: 0, y: 0 };
      lastTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setIsDragging(true);
      setIsMomentum(false);
    },
    [offset.x, offset.y]
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const { pointerX, pointerY, offsetX, offsetY } = dragStartRef.current;
      const deltaX = clientX - pointerX;
      const deltaY = clientY - pointerY;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const lastTime = lastTimeRef.current ?? now;
      const elapsed = Math.max(1, now - lastTime); // avoid divide by zero
      const mapDeltaX = -(deltaX - lastDeltaRef.current.x);
      const mapDeltaY = -(deltaY - lastDeltaRef.current.y);
      lastDeltaRef.current = { x: deltaX, y: deltaY };
      lastTimeRef.current = now;
      const alpha = 0.25;
      velocityRef.current = {
        x: velocityRef.current.x * (1 - alpha) + (mapDeltaX / elapsed) * alpha,
        y: velocityRef.current.y * (1 - alpha) + (mapDeltaY / elapsed) * alpha,
      };
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const applyOffset = () => {
        setOffset({
          x: offsetX - deltaX,
          y: offsetY - deltaY,
        });
        animationFrameRef.current = null;
      };

      if (typeof requestAnimationFrame === 'function') {
        animationFrameRef.current = requestAnimationFrame(applyOffset);
      } else {
        applyOffset();
      }
    },
    [isDragging]
  );

  const endDrag = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (momentumFrameRef.current !== null) {
      cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }

    const startMomentum = () => {
      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
      const minSpeed = 0.05; // px per ms threshold for fling
      if (speed < minSpeed) {
        velocityRef.current = { x: 0, y: 0 };
        lastDeltaRef.current = { x: 0, y: 0 };
        lastTimeRef.current = null;
        setIsMomentum(false);
        return;
      }

      setIsMomentum(true);
      const friction = 0.0035; // exponential friction for decay
      const step = (prevTime: number) => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = Math.max(1, now - prevTime);
        const damping = Math.exp(-friction * dt);
        velocityRef.current = {
          x: velocityRef.current.x * damping,
          y: velocityRef.current.y * damping,
        };

        const vx = velocityRef.current.x;
        const vy = velocityRef.current.y;
        const moveX = vx * dt;
        const moveY = vy * dt;

        setOffset((prev) => ({
          x: prev.x + moveX,
          y: prev.y + moveY,
        }));

        if (Math.hypot(vx, vy) < 0.01) {
          velocityRef.current = { x: 0, y: 0 };
          momentumFrameRef.current = null;
          lastDeltaRef.current = { x: 0, y: 0 };
          lastTimeRef.current = null;
          setIsMomentum(false);
          return;
        }

        momentumFrameRef.current = requestAnimationFrame(() => step(now));
      };

      momentumFrameRef.current = requestAnimationFrame(() =>
        step(typeof performance !== 'undefined' ? performance.now() : Date.now())
      );
    };

    startMomentum();
    setIsDragging(false);
  }, [setOffset]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (momentumFrameRef.current !== null) {
        cancelAnimationFrame(momentumFrameRef.current);
      }
    };
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
    isMomentum,
    beginDrag,
    updateDrag,
    endDrag,
    nudgeOffset,
  };
};
