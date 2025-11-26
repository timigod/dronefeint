import { useCallback, useEffect, useRef } from 'react';
import type { SonarCircle } from '../hooks/useFogOfWar';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import { Z_INDEX } from '../styles/constants';
import { parseHexColor } from '../utils/color';
import { BAYER_4x4 } from '../utils/dithering';
import { wrap } from '../utils/math';

interface FogOfWarOverlayProps {
  offset: { x: number; y: number };
  viewportWidth: number;
  viewportHeight: number;
  displayWidth?: number;
  displayHeight?: number;
  sonarCircles: SonarCircle[];
  playerColor: string;
  enabled: boolean;
  highlightedOutpostId?: string;
}

// Edge fade distance in pixels
const EDGE_FADE_DISTANCE = 60;
// Distance between dots for dithered edge rendering
const DOT_SPACING = 4;

export const FogOfWarOverlay = ({
  offset,
  viewportWidth,
  viewportHeight,
  displayWidth,
  displayHeight,
  sonarCircles,
  playerColor,
  enabled,
  highlightedOutpostId,
}: FogOfWarOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawFogOfWar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Parse player color for sonar ring effects
    const [r, g, b] = parseHexColor(playerColor);

    const wrappedOffsetX = wrap(offset.x, MAP_WIDTH);
    const wrappedOffsetY = wrap(offset.y, MAP_HEIGHT);

    // Create a mask canvas for the visibility area
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = viewportWidth;
    maskCanvas.height = viewportHeight;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    // Fill mask with black (fog)
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Set composite mode to cut out visible areas
    maskCtx.globalCompositeOperation = 'destination-out';

    // Draw clear circles for each sonar source (wrapped for toroidal map)
    for (let tileX = -1; tileX <= 1; tileX++) {
      for (let tileY = -1; tileY <= 1; tileY++) {
        const tileOffsetX = tileX * MAP_WIDTH;
        const tileOffsetY = tileY * MAP_HEIGHT;

        sonarCircles.forEach((circle) => {
          const screenX = circle.x - wrappedOffsetX + tileOffsetX;
          const screenY = circle.y - wrappedOffsetY + tileOffsetY;

          // Skip if completely outside viewport with margin
          const margin = circle.radius + EDGE_FADE_DISTANCE;
          if (
            screenX < -margin ||
            screenX > viewportWidth + margin ||
            screenY < -margin ||
            screenY > viewportHeight + margin
          ) {
            return;
          }

          // Create radial gradient for smooth edge fade
          const gradient = maskCtx.createRadialGradient(
            screenX,
            screenY,
            0,
            screenX,
            screenY,
            circle.radius + EDGE_FADE_DISTANCE
          );
          gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
          gradient.addColorStop(circle.radius / (circle.radius + EDGE_FADE_DISTANCE), 'rgba(0, 0, 0, 1)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

          maskCtx.fillStyle = gradient;
          maskCtx.beginPath();
          maskCtx.arc(screenX, screenY, circle.radius + EDGE_FADE_DISTANCE, 0, Math.PI * 2);
          maskCtx.fill();
        });
      }
    }

    // Apply the fog layer with reduced opacity for a subtle effect
    ctx.globalAlpha = 0.55;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // Build list of all circle screen positions for intersection checking
    const allCircleScreenPositions: Array<{ screenX: number; screenY: number; radius: number; outpostId: string }> = [];
    for (let tileX = -1; tileX <= 1; tileX++) {
      for (let tileY = -1; tileY <= 1; tileY++) {
        const tileOffsetX = tileX * MAP_WIDTH;
        const tileOffsetY = tileY * MAP_HEIGHT;
        sonarCircles.forEach((circle) => {
          allCircleScreenPositions.push({
            screenX: circle.x - wrappedOffsetX + tileOffsetX,
            screenY: circle.y - wrappedOffsetY + tileOffsetY,
            radius: circle.radius,
            outpostId: circle.outpostId,
          });
        });
      }
    }

    // Helper to check if a point is inside any OTHER circle
    const isInsideOtherCircle = (px: number, py: number, currentOutpostId: string): boolean => {
      for (const other of allCircleScreenPositions) {
        if (other.outpostId === currentOutpostId) continue;
        const dx = px - other.screenX;
        const dy = py - other.screenY;
        const distSq = dx * dx + dy * dy;
        // Use slightly smaller radius to avoid edge-case flickering
        if (distSq < (other.radius - 5) * (other.radius - 5)) {
          return true;
        }
      }
      return false;
    };

    // Draw dithered sonar ring edges for each circle
    ctx.globalCompositeOperation = 'source-over';

    for (let tileX = -1; tileX <= 1; tileX++) {
      for (let tileY = -1; tileY <= 1; tileY++) {
        const tileOffsetX = tileX * MAP_WIDTH;
        const tileOffsetY = tileY * MAP_HEIGHT;

        sonarCircles.forEach((circle) => {
          const screenX = circle.x - wrappedOffsetX + tileOffsetX;
          const screenY = circle.y - wrappedOffsetY + tileOffsetY;

          // Skip if completely outside viewport
          const margin = circle.radius + EDGE_FADE_DISTANCE;
          if (
            screenX < -margin ||
            screenX > viewportWidth + margin ||
            screenY < -margin ||
            screenY > viewportHeight + margin
          ) {
            return;
          }

          const isHighlighted = circle.outpostId === highlightedOutpostId;

          // Draw dithered ring at the edge of sonar radius
          drawDitheredRing(ctx, screenX, screenY, circle.radius, r, g, b, isHighlighted, circle.outpostId, isInsideOtherCircle);
        });
      }
    }
  }, [enabled, offset, playerColor, sonarCircles, viewportHeight, viewportWidth, highlightedOutpostId]);

  // Draw a dithered ring at the edge of sonar coverage
  const drawDitheredRing = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    isHighlighted: boolean = false,
    outpostId: string = '',
    isInsideOtherCircle: (px: number, py: number, outpostId: string) => boolean = () => false
  ) => {
    const ringWidth = isHighlighted ? 22 : 20;
    const innerRadius = radius - ringWidth / 2;
    const outerRadius = radius + ringWidth / 2;

    // Draw dots in a ring pattern using Bayer dithering
    for (let angle = 0; angle < Math.PI * 2; angle += isHighlighted ? 0.018 : 0.02) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (let d = innerRadius; d <= outerRadius; d += isHighlighted ? DOT_SPACING * 0.85 : DOT_SPACING) {
        const px = centerX + cos * d;
        const py = centerY + sin * d;

        // Check if this point is inside another circle (internal intersection)
        // Don't fade highlighted circles
        const isInternal = !isHighlighted && isInsideOtherCircle(px, py, outpostId);
        const internalFade = isInternal ? 0.45 : 1; // Fade internal intersections to 45%

        // Calculate distance from the center of the ring (sonar edge)
        const distFromEdge = Math.abs(d - radius);
        const normalizedDist = 1 - distFromEdge / (ringWidth / 2);

        // Apply Bayer dithering
        const bayerX = Math.floor(Math.abs(px)) % 4;
        const bayerY = Math.floor(Math.abs(py)) % 4;
        const threshold = BAYER_4x4[bayerY][bayerX];

        // Only draw if normalized distance exceeds dither threshold
        // Slightly more forgiving threshold for highlighted rings
        const thresholdMultiplier = isHighlighted ? 0.65 : 0.8;
        if (normalizedDist > threshold * thresholdMultiplier) {
          const baseAlpha = isHighlighted ? 0.22 : 0.15;
          const alphaMultiplier = isHighlighted ? 0.35 : 0.25;
          const alpha = (baseAlpha + normalizedDist * alphaMultiplier) * internalFade;
          
          const baseIntensity = isHighlighted ? 0.7 : 0.6;
          const intensityMultiplier = isHighlighted ? 0.3 : 0.4;
          const intensity = baseIntensity + normalizedDist * intensityMultiplier;
          
          ctx.fillStyle = `rgba(${Math.floor(r * intensity)}, ${Math.floor(g * intensity)}, ${Math.floor(b * intensity)}, ${alpha})`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
      }
    }

    // Draw a line at the exact radius for clarity
    if (isHighlighted) {
      // Solid line for highlighted ring - always draw fully
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Draw arc segments - external at full opacity, internal at reduced opacity
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 12]);
      
      // Draw the arc in small segments, with different opacity for internal vs external
      const segmentAngle = 0.05; // Small angle increment for smooth arcs
      let currentIsInternal: boolean | null = null;
      let segmentStart = 0;
      
      for (let angle = 0; angle <= Math.PI * 2 + segmentAngle; angle += segmentAngle) {
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        const isInternal = isInsideOtherCircle(px, py, outpostId);
        
        if (currentIsInternal === null) {
          // First segment
          currentIsInternal = isInternal;
          segmentStart = angle;
        } else if (isInternal !== currentIsInternal) {
          // Transition - draw the previous segment
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${currentIsInternal ? 0.1 : 0.25})`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, segmentStart, angle);
          ctx.stroke();
          currentIsInternal = isInternal;
          segmentStart = angle;
        }
      }
      
      // Draw final segment
      if (currentIsInternal !== null) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${currentIsInternal ? 0.1 : 0.25})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, segmentStart, Math.PI * 2);
        ctx.stroke();
      }
      
      ctx.setLineDash([]);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    let rafId: number;
    const render = () => {
      drawFogOfWar();
      // Don't continuously loop - only update when dependencies change
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [drawFogOfWar, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: displayWidth ? `${displayWidth}px` : `${viewportWidth}px`,
        height: displayHeight ? `${displayHeight}px` : `${viewportHeight}px`,
        pointerEvents: 'none',
        zIndex: Z_INDEX.fogOfWar, // Above terrain and grid, below structures
      }}
    />
  );
};
