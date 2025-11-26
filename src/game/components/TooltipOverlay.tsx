import { useEffect, useRef } from 'react';
import type { PlayerOutpostView } from '../fogOfWar/types';
import type { Structure } from '../structures';
import type { FontSizeOption } from '../utils/fontSize';
import { Z_INDEX } from '../styles/constants';
import { GLYPH_HEIGHT, drawGlyphText, measureGlyphText } from '../glyphs';
import { formatTimeAgo, desaturateColor, VISIBILITY_CONFIG } from '../fogOfWar/rendering';
import { parseHexColor } from '../utils/color';
import { getResponsiveFontValue } from '../utils/fontSize';

interface TooltipOverlayProps {
  hoveredStructure: Structure | null;
  mousePos: { x: number; y: number };
  fontSize: FontSizeOption;
  viewportWidth: number;
  viewportHeight: number;
  displayWidth?: number;
  displayHeight?: number;
  isMobile: boolean;
  // Fog of war props
  outpostViews?: PlayerOutpostView[];
  gameTime?: number;
  fogOfWarEnabled?: boolean;
}

export const TooltipOverlay = ({
  hoveredStructure,
  mousePos,
  fontSize,
  viewportWidth,
  viewportHeight,
  displayWidth,
  displayHeight,
  isMobile,
  outpostViews = [],
  gameTime = Date.now(),
  fogOfWarEnabled = false,
}: TooltipOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!hoveredStructure) return;

    const { playerColor, type, droneGenerationRate } = hoveredStructure;
    
    // Get visibility state if fog of war is enabled
    const outpostView = fogOfWarEnabled
      ? outpostViews.find((v) => v.id === hoveredStructure.id)
      : undefined;
    const visibility = outpostView?.visibility ?? 'live';
    const visConfig = VISIBILITY_CONFIG[visibility];

    // Adjust colors based on visibility
    let [r, g, b] = parseHexColor(playerColor);
    
    if (visibility !== 'live' && visConfig.colorDesaturation > 0) {
      [r, g, b] = desaturateColor(r, g, b, visConfig.colorDesaturation);
    }

    const typeName =
      type === 'hq'
        ? 'HQ'
        : type === 'foundry'
        ? 'FOUNDRY'
        : type === 'reactor'
        ? 'REACTOR'
        : 'EXTRACTOR';

    const lines: string[] = [typeName];

    // Add visibility status line for fog of war
    if (fogOfWarEnabled && visibility !== 'live') {
      if (visibility === 'lastSeen' && outpostView?.visibility === 'lastSeen') {
        lines.push(`~${formatTimeAgo(outpostView.lastSeenAt, gameTime)}`);
      } else if (visibility === 'unknown') {
        lines.push('UNKNOWN');
      }
    }

    // Add structure-specific info (only for live visibility)
    if (visibility === 'live') {
      if (type === 'foundry') {
        lines.push('+3 DRONES/MIN');
      } else if (type === 'reactor') {
        lines.push('+50 ENERGY');
      } else if (type === 'hq') {
        lines.push('+150 ENERGY');
      } else if (droneGenerationRate !== undefined) {
        lines.push(`+${droneGenerationRate}/MIN`);
      }
    }

    const tooltipScaleMap: Record<FontSizeOption, number> = {
      small: 1.7,
      medium: 2.0,
      large: 2.3,
    };
    const scale = getResponsiveFontValue(fontSize, tooltipScaleMap, isMobile);
    const padding = 6;
    const lineHeight = (GLYPH_HEIGHT + 3) * scale;
    const lineWidths = lines.map((line) => measureGlyphText(line, scale));
    const textWidth = Math.max(...lineWidths);

    const dividerTopPadding = 4 * scale;
    const dividerBottomPadding = 4 * scale;
    const bottomMargin = 2 * scale;
    const extraHeight =
      lines.length > 1 ? dividerTopPadding + dividerBottomPadding + bottomMargin : bottomMargin;
    const tooltipHeight = lines.length * lineHeight - 3 * scale + padding * 2 + extraHeight;

    const tooltipX = mousePos.x + 15;
    const tooltipY = mousePos.y + 15;

    ctx.globalAlpha = visibility === 'live' ? 1 : 0.85;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(tooltipX - padding, tooltipY - padding, textWidth + padding * 2, tooltipHeight);

    const borderColor = `rgb(${r}, ${g}, ${b})`;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(tooltipX - padding, tooltipY - padding, textWidth + padding * 2, tooltipHeight);

    let currentY = tooltipY;
    lines.forEach((line, index) => {
      const startX = index === 0 ? tooltipX + (textWidth - lineWidths[index]) / 2 : tooltipX;
      const isTitle = index === 0;

      if (isTitle) {
        drawGlyphText(ctx, line, startX, currentY, r, g, b, scale);
        drawGlyphText(ctx, line, startX + scale * 0.4, currentY, r, g, b, scale);
      } else {
        // For visibility status lines, use slightly dimmer color
        const dimFactor = line.startsWith('~') || line === 'UNKNOWN' ? 0.7 : 1;
        drawGlyphText(
          ctx,
          line,
          startX,
          currentY,
          Math.floor(r * dimFactor),
          Math.floor(g * dimFactor),
          Math.floor(b * dimFactor),
          scale
        );
      }

      if (index === 0 && lines.length > 1) {
        const dividerY = currentY + GLYPH_HEIGHT * scale + dividerTopPadding;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tooltipX - padding / 2, dividerY);
        ctx.lineTo(tooltipX - padding / 2 + textWidth + padding, dividerY);
        ctx.stroke();
        currentY += lineHeight + dividerTopPadding + dividerBottomPadding;
      } else {
        currentY += lineHeight;
      }
    });
    
    ctx.globalAlpha = 1;
  }, [fontSize, hoveredStructure, isMobile, mousePos, viewportHeight, viewportWidth, outpostViews, gameTime, fogOfWarEnabled]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: displayWidth ? `${displayWidth}px` : '100%',
        height: displayHeight ? `${displayHeight}px` : '100%',
        pointerEvents: 'none',
        zIndex: Z_INDEX.tooltip,
      }}
    />
  );
};
