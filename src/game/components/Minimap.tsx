import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEventHandler, TouchEventHandler } from 'react';
import type { Structure } from '../structures';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MINIMAP_HEIGHT,
  MINIMAP_TEXTURE_HEIGHT,
  MINIMAP_TEXTURE_WIDTH,
  MINIMAP_WIDTH,
} from '../mapConstants';
import { wrap } from '../utils/math';
import type { SonarCircle } from '../hooks/useFogOfWar';

export interface MinimapProps {
  structures: Structure[];
  offset: { x: number; y: number };
  viewportWidth: number;
  viewportHeight: number;
  minimapReady: boolean;
  minimapTexture: CanvasImageSource | null;
  onViewportChange: (nextOffset: { x: number; y: number }) => void;
  style?: CSSProperties;
  // Fog of war props
  sonarCircles?: SonarCircle[];
  playerColor?: string;
  fogOfWarEnabled?: boolean;
}

const getViewportSegments = (start: number, length: number, limit: number) => {
  if (length <= 0 || limit <= 0) {
    return [];
  }

  if (length >= limit) {
    return [{ start: 0, length: limit }];
  }

  const normalizedStart = wrap(start, limit);
  const firstSegmentLength = Math.min(length, limit - normalizedStart);
  const segments = [{ start: normalizedStart, length: firstSegmentLength }];
  const remainder = length - firstSegmentLength;

  if (remainder > 0) {
    segments.push({ start: 0, length: remainder });
  }

  return segments;
};

export const Minimap = ({
  structures,
  offset,
  viewportHeight,
  viewportWidth,
  minimapReady,
  minimapTexture,
  onViewportChange,
  style,
  sonarCircles = [],
  playerColor = '#dc3545',
  fogOfWarEnabled = false,
}: MinimapProps) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const jumpViewportToMinimapPoint = (clientX: number, clientY: number) => {
    const minimap = minimapRef.current;
    if (!minimap) return;
    const rect = minimap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const relativeX = ((clientX - rect.left) / rect.width) * MINIMAP_WIDTH;
    const relativeY = ((clientY - rect.top) / rect.height) * MINIMAP_HEIGHT;
    const clampedX = Math.max(0, Math.min(MINIMAP_WIDTH, relativeX));
    const clampedY = Math.max(0, Math.min(MINIMAP_HEIGHT, relativeY));

    const worldX = (clampedX / MINIMAP_WIDTH) * MAP_WIDTH;
    const worldY = (clampedY / MINIMAP_HEIGHT) * MAP_HEIGHT;

    onViewportChange({
      x: worldX - viewportWidth / 2,
      y: worldY - viewportHeight / 2,
    });
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    jumpViewportToMinimapPoint(clientX, clientY);
    setIsPanning(true);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isPanning) return;
    jumpViewportToMinimapPoint(clientX, clientY);
  };

  const handleMouseDown: MouseEventHandler<HTMLCanvasElement> = (event) => {
    event.preventDefault();
    handlePointerDown(event.clientX, event.clientY);
  };

  const handleMouseMove: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (!isPanning) return;
    event.preventDefault();
    handlePointerMove(event.clientX, event.clientY);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleTouchStart: TouchEventHandler<HTMLCanvasElement> = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    handlePointerDown(touch.clientX, touch.clientY);
  };

  const handleTouchMove: TouchEventHandler<HTMLCanvasElement> = (event) => {
    if (!isPanning) return;
    const touch = event.touches[0];
    if (!touch) return;
    handlePointerMove(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    if (!isPanning) return;
    const handleEnd = () => setIsPanning(false);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isPanning]);

  useEffect(() => {
    const minimap = minimapRef.current;
    if (!minimap || !minimapReady || !minimapTexture) return;
    const ctx = minimap.getContext('2d');
    if (!ctx) return;

    minimap.width = MINIMAP_WIDTH;
    minimap.height = MINIMAP_HEIGHT;

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    ctx.fillStyle = 'rgba(8, 8, 10, 0.9)';
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      minimapTexture,
      0,
      0,
      MINIMAP_TEXTURE_WIDTH,
      MINIMAP_TEXTURE_HEIGHT,
      0,
      0,
      MINIMAP_WIDTH,
      MINIMAP_HEIGHT
    );

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    const baseScaleX = MINIMAP_WIDTH / MAP_WIDTH;
    const baseScaleY = MINIMAP_HEIGHT / MAP_HEIGHT;

    // Draw sonar circles if fog of war is enabled
    if (fogOfWarEnabled && sonarCircles.length > 0) {
      const r = parseInt(playerColor.slice(1, 3), 16);
      const g = parseInt(playerColor.slice(3, 5), 16);
      const b = parseInt(playerColor.slice(5, 7), 16);

      sonarCircles.forEach((circle) => {
        const miniX = circle.x * baseScaleX;
        const miniY = circle.y * baseScaleY;
        const miniRadius = circle.radius * Math.min(baseScaleX, baseScaleY);

        // Draw filled circle with gradient
        const gradient = ctx.createRadialGradient(miniX, miniY, 0, miniX, miniY, miniRadius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`);
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.04)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(miniX, miniY, miniRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw dashed circle outline
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(miniX, miniY, miniRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    structures.forEach((structure) => {
      const { x: structX, y: structY, playerColor: structColor, type } = structure;
      const miniX = structX * baseScaleX;
      const miniY = structY * baseScaleY;

      const r = parseInt(structColor.slice(1, 3), 16);
      const g = parseInt(structColor.slice(3, 5), 16);
      const b = parseInt(structColor.slice(5, 7), 16);

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;

      if (type === 'hq') {
        ctx.beginPath();
        ctx.moveTo(miniX, miniY - 4);
        ctx.lineTo(miniX + 3, miniY + 3);
        ctx.lineTo(miniX - 3, miniY + 3);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'foundry') {
        ctx.beginPath();
        ctx.moveTo(miniX - 2, miniY - 3);
        ctx.lineTo(miniX + 2, miniY - 3);
        ctx.lineTo(miniX + 3, miniY + 3);
        ctx.lineTo(miniX - 3, miniY + 3);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'reactor') {
        ctx.beginPath();
        ctx.arc(miniX, miniY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'extractor') {
        ctx.beginPath();
        ctx.moveTo(miniX, miniY - 3);
        ctx.lineTo(miniX + 3, miniY - 1.5);
        ctx.lineTo(miniX + 3, miniY + 1.5);
        ctx.lineTo(miniX, miniY + 3);
        ctx.lineTo(miniX - 3, miniY + 1.5);
        ctx.lineTo(miniX - 3, miniY - 1.5);
        ctx.closePath();
        ctx.fill();
      }
    });

    const viewportSegmentsX = getViewportSegments(offset.x, viewportWidth, MAP_WIDTH);
    const viewportSegmentsY = getViewportSegments(offset.y, viewportHeight, MAP_HEIGHT);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;

    viewportSegmentsX.forEach((segmentX) => {
      viewportSegmentsY.forEach((segmentY) => {
        const viewportX = segmentX.start * baseScaleX;
        const viewportY = segmentY.start * baseScaleY;
        const viewportRectWidth = segmentX.length * baseScaleX;
        const viewportRectHeight = segmentY.length * baseScaleY;
        ctx.fillRect(viewportX, viewportY, viewportRectWidth, viewportRectHeight);
        ctx.strokeRect(viewportX, viewportY, viewportRectWidth, viewportRectHeight);
      });
    });
  }, [minimapReady, minimapTexture, offset, structures, viewportHeight, viewportWidth, fogOfWarEnabled, sonarCircles, playerColor]);

  return (
    <canvas
      ref={minimapRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      onTouchCancel={handleMouseUp}
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        border: '1px solid rgba(255, 255, 255, 0.35)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        width: `${MINIMAP_WIDTH}px`,
        height: `${MINIMAP_HEIGHT}px`,
        cursor: 'pointer',
        zIndex: 5,
        touchAction: 'none',
        ...style,
      }}
    />
  );
};
