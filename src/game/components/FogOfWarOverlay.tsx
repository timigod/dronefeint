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
  sonarCircles: SonarCircle[];
  playerColor: string;
  enabled: boolean;
}

// Edge fade distance in pixels
const EDGE_FADE_DISTANCE = 60;
// Distance between dots for dithered edge rendering
const DOT_SPACING = 4;

export const FogOfWarOverlay = ({
  offset,
  viewportWidth,
  viewportHeight,
  sonarCircles,
  playerColor,
  enabled,
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

          // Draw dithered ring at the edge of sonar radius
          drawDitheredRing(ctx, screenX, screenY, circle.radius, r, g, b);
        });
      }
    }
  }, [enabled, offset, playerColor, sonarCircles, viewportHeight, viewportWidth]);

  // Draw a dithered ring at the edge of sonar coverage
  const drawDitheredRing = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    r: number,
    g: number,
    b: number
  ) => {
    const ringWidth = 20; // Width of the dithered ring
    const innerRadius = radius - ringWidth / 2;
    const outerRadius = radius + ringWidth / 2;

    // Draw dots in a ring pattern using Bayer dithering
    for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (let d = innerRadius; d <= outerRadius; d += DOT_SPACING) {
        const px = centerX + cos * d;
        const py = centerY + sin * d;

        // Calculate distance from the center of the ring (sonar edge)
        const distFromEdge = Math.abs(d - radius);
        const normalizedDist = 1 - distFromEdge / (ringWidth / 2);

        // Apply Bayer dithering
        const bayerX = Math.floor(Math.abs(px)) % 4;
        const bayerY = Math.floor(Math.abs(py)) % 4;
        const threshold = BAYER_4x4[bayerY][bayerX];

        // Only draw if normalized distance exceeds dither threshold
        if (normalizedDist > threshold * 0.8) {
          const alpha = 0.15 + normalizedDist * 0.25;
          const intensity = 0.6 + normalizedDist * 0.4;
          ctx.fillStyle = `rgba(${Math.floor(r * intensity)}, ${Math.floor(g * intensity)}, ${Math.floor(b * intensity)}, ${alpha})`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
      }
    }

    // Draw a subtle solid line at the exact radius for clarity
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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
        width: viewportWidth,
        height: viewportHeight,
        pointerEvents: 'none',
        zIndex: Z_INDEX.fogOfWar, // Above terrain and grid, below structures
      }}
    />
  );
};
