import { useCallback, useRef, type RefObject } from 'react';
import type React from 'react';
import type { Structure } from '../structures';

interface MapInteractionsProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  offset: { x: number; y: number };
  isDragging: boolean;
  beginDrag: (x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  clearHover: () => void;
  updateHover: (args: { clientX: number; clientY: number; offset: { x: number; y: number } }) => Structure | null;
  setMousePos: (pos: { x: number; y: number }) => void;
  nudgeOffset: (deltaX: number, deltaY: number) => void;
  scrollSettings: { invertX: boolean; invertY: boolean };
  hoveredStructure: Structure | null;
}

const MOVE_THRESHOLD_PX = 10;
const TAP_TIME_THRESHOLD_MS = 300;

export const useMapInteractions = ({
  canvasRef,
  offset,
  isDragging,
  beginDrag,
  updateDrag,
  endDrag,
  clearHover,
  updateHover,
  setMousePos,
  nudgeOffset,
  scrollSettings,
  hoveredStructure,
}: MapInteractionsProps) => {
  const touchStartPosRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const touchStartTimeRef = useRef(0);
  const touchCanvasStartRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDraggingRef = useRef(false);
  const lastTappedStructureIdRef = useRef<string | null>(null);

  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [canvasRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      beginDrag(coords.x, coords.y);
      clearHover();
    },
    [beginDrag, clearHover, toCanvasCoords]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      setMousePos(coords);

      if (isDragging) {
        clearHover();
        updateDrag(coords.x, coords.y);
      } else {
        updateHover({ clientX: coords.x, clientY: coords.y, offset });
      }
    },
    [clearHover, isDragging, offset, setMousePos, toCanvasCoords, updateDrag, updateHover]
  );

  const handleMouseUp = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const coords = toCanvasCoords(touch.clientX, touch.clientY);

      touchStartPosRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        offset: { ...offset },
      };
      touchCanvasStartRef.current = coords ? { x: coords.x, y: coords.y } : null;
      touchStartTimeRef.current = Date.now();
      isTouchDraggingRef.current = false;

      clearHover();
    },
    [clearHover, offset, toCanvasCoords]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const coords = toCanvasCoords(touch.clientX, touch.clientY);
      if (coords) {
        setMousePos(coords);
      }

      const start = touchStartPosRef.current;
      const exceededThreshold =
        start &&
        (Math.abs(touch.clientX - start.x) > MOVE_THRESHOLD_PX ||
          Math.abs(touch.clientY - start.y) > MOVE_THRESHOLD_PX);

      if (!isTouchDraggingRef.current && exceededThreshold) {
        isTouchDraggingRef.current = true;
        clearHover();
        const startCoords = touchCanvasStartRef.current ?? coords;
        if (startCoords) {
          beginDrag(startCoords.x, startCoords.y);
        }
        lastTappedStructureIdRef.current = null;
      }

      if (isTouchDraggingRef.current && coords) {
        updateDrag(coords.x, coords.y);
      }
    },
    [beginDrag, clearHover, setMousePos, toCanvasCoords, updateDrag]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const start = touchStartPosRef.current;
      if (!touch || !start) {
        isTouchDraggingRef.current = false;
        touchStartPosRef.current = null;
        touchCanvasStartRef.current = null;
        endDrag();
        return;
      }

      if (!isTouchDraggingRef.current) {
        const timeDiff = Date.now() - touchStartTimeRef.current;
        const deltaX = Math.abs(touch.clientX - start.x);
        const deltaY = Math.abs(touch.clientY - start.y);

        if (timeDiff < TAP_TIME_THRESHOLD_MS && deltaX < MOVE_THRESHOLD_PX && deltaY < MOVE_THRESHOLD_PX) {
          const coords = toCanvasCoords(touch.clientX, touch.clientY);
          if (coords) {
            setMousePos(coords);
            const tappedStructure = updateHover({ clientX: coords.x, clientY: coords.y, offset });
            if (tappedStructure && lastTappedStructureIdRef.current === tappedStructure.id) {
              clearHover();
              lastTappedStructureIdRef.current = null;
            } else {
              lastTappedStructureIdRef.current = tappedStructure?.id ?? null;
            }
            if (!tappedStructure) {
              clearHover();
            }
          }
        }
      }

      isTouchDraggingRef.current = false;
      touchStartPosRef.current = null;
      touchCanvasStartRef.current = null;
      endDrag();
    },
    [clearHover, endDrag, offset, setMousePos, toCanvasCoords, updateHover]
  );

  const handleTouchCancel = useCallback(() => {
    isTouchDraggingRef.current = false;
    touchStartPosRef.current = null;
    touchCanvasStartRef.current = null;
    endDrag();
  }, [endDrag]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      clearHover();
      const xMultiplier = scrollSettings.invertX ? 1 : -1;
      const yMultiplier = scrollSettings.invertY ? 1 : -1;
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const scaleX = canvas && rect?.width ? canvas.width / rect.width : 1;
      const scaleY = canvas && rect?.height ? canvas.height / rect.height : 1;
      nudgeOffset(e.deltaX * xMultiplier * scaleX, e.deltaY * yMultiplier * scaleY);
    },
    [canvasRef, clearHover, nudgeOffset, scrollSettings.invertX, scrollSettings.invertY]
  );

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleWheel,
  };
};
