import type { PlayerOutpostView } from './types';
import type { Structure } from '../structures';
import {
  DRONE_COUNT_SPACING,
  SEGMENT_DIGIT_HEIGHT,
  drawSegmentText,
  measureSegmentText,
} from '../structures';
import { GLYPH_HEIGHT, drawGlyphText, measureGlyphText } from '../glyphs';
import type { FontSizeOption } from '../utils/fontSize';
import { getResponsiveFontValue } from '../utils/fontSize';

// Visual configuration for different visibility states
export const VISIBILITY_CONFIG = {
  live: {
    structureOpacity: 1.0,
    labelOpacity: 1.0,
    colorDesaturation: 0,
    droneCountVisible: true,
  },
  lastSeen: {
    structureOpacity: 0.5,
    labelOpacity: 0.6,
    colorDesaturation: 0.5, // How much to desaturate (0 = full color, 1 = grayscale)
    droneCountVisible: true,
  },
  unknown: {
    structureOpacity: 0.25,
    labelOpacity: 0.35,
    colorDesaturation: 0.85,
    droneCountVisible: false,
  },
} as const;

// Helper to desaturate a color
export const desaturateColor = (r: number, g: number, b: number, amount: number): [number, number, number] => {
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  return [
    Math.round(r + (gray - r) * amount),
    Math.round(g + (gray - g) * amount),
    Math.round(b + (gray - b) * amount),
  ];
};

// Get display color based on visibility state
export const getVisibilityAdjustedColor = (
  playerColor: string,
  visibility: 'live' | 'lastSeen' | 'unknown'
): { r: number; g: number; b: number; opacity: number } => {
  const r = parseInt(playerColor.slice(1, 3), 16);
  const g = parseInt(playerColor.slice(3, 5), 16);
  const b = parseInt(playerColor.slice(5, 7), 16);

  const config = VISIBILITY_CONFIG[visibility];
  const [dr, dg, db] = desaturateColor(r, g, b, config.colorDesaturation);

  return {
    r: dr,
    g: dg,
    b: db,
    opacity: config.structureOpacity,
  };
};

// Format time ago string
export const formatTimeAgo = (timestamp: number, currentTime: number): string => {
  const diffMs = currentTime - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);

  if (diffHrs > 0) {
    const mins = diffMin % 60;
    return `${diffHrs}H ${mins.toString().padStart(2, '0')}M AGO`;
  }
  if (diffMin > 0) {
    const secs = diffSec % 60;
    return `${diffMin}M ${secs.toString().padStart(2, '0')}S AGO`;
  }
  return `${diffSec}S AGO`;
};

// Draw "last seen" indicator below drone count
export const drawLastSeenIndicator = (
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  visibility: 'lastSeen',
  lastSeenAt: number,
  currentTime: number,
  offsetX: number,
  offsetY: number,
  fontSize: FontSizeOption,
  isMobile: boolean
) => {
  const { x, y, size, playerColor, type } = structure;
  const screenX = x + offsetX;
  const screenY = y + offsetY;

  const { r, g, b, opacity } = getVisibilityAdjustedColor(playerColor, visibility);

  const scaleMap: Record<FontSizeOption, number> = {
    small: 0.9,
    medium: 1.1,
    large: 1.3,
  };
  const scale = getResponsiveFontValue(fontSize, scaleMap, isMobile);

  const timeText = formatTimeAgo(lastSeenAt, currentTime);
  const textWidth = measureGlyphText(timeText, scale);
  const textHeight = GLYPH_HEIGHT * scale;

  // Position below the drone count area
  const spacing = DRONE_COUNT_SPACING[type] ?? 3;
  const textX = screenX - textWidth / 2;
  const textY = screenY + size + spacing + 21; // Below drone count

  // Background
  const paddingX = 4;
  const paddingY = 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(textX - paddingX, textY - paddingY, textWidth + paddingX * 2, textHeight + paddingY * 2);

  // Border
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.5})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(textX - paddingX, textY - paddingY, textWidth + paddingX * 2, textHeight + paddingY * 2);

  // Text
  drawGlyphText(ctx, timeText, textX, textY, r, g, b, scale);
};

// Draw "unknown" indicator (question marks in 7-segment style to match drone counts)
export const drawUnknownIndicator = (
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  offsetX: number,
  offsetY: number,
  fontSize: FontSizeOption,
  isMobile: boolean
) => {
  const { x, y, size, playerColor, type } = structure;
  const screenX = x + offsetX;
  const screenY = y + offsetY;

  const { r, g, b } = getVisibilityAdjustedColor(playerColor, 'unknown');

  // Use same scale mapping as drone counts for visual consistency
  const scaleMap: Record<FontSizeOption, number> = {
    small: 1.5,
    medium: 1.8,
    large: 2.1,
  };
  const scale = getResponsiveFontValue(fontSize, scaleMap, isMobile);

  const text = '???';
  const textWidth = measureSegmentText(text, scale);
  const textHeight = SEGMENT_DIGIT_HEIGHT * scale;

  // Position below structure (same spacing as drone counts)
  const spacing = DRONE_COUNT_SPACING[type] ?? 3;
  const textX = screenX - textWidth / 2;
  const textY = screenY + size + spacing;

  // Background (same style as drone counts)
  const paddingX = 4;
  const paddingY = 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(textX - paddingX, textY - paddingY, textWidth + paddingX * 2, textHeight + paddingY * 2);

  // Draw using 7-segment style (matches drone count numbers)
  drawSegmentText(ctx, text, textX, textY, r, g, b, scale);
};

// Get drone count to display based on visibility
export const getDisplayDroneCount = (
  outpostView: PlayerOutpostView
): { count: number | undefined; isEstimate: boolean } => {
  if (outpostView.visibility === 'live') {
    return { count: outpostView.droneCount, isEstimate: false };
  }
  if (outpostView.visibility === 'lastSeen') {
    return { count: outpostView.lastSeenDroneCount, isEstimate: true };
  }
  return { count: undefined, isEstimate: false };
};

// Build a lookup map for visibility data
export const buildVisibilityLookup = (
  outpostViews: PlayerOutpostView[]
): Map<string, PlayerOutpostView> => {
  const map = new Map<string, PlayerOutpostView>();
  outpostViews.forEach((view) => {
    map.set(view.id, view);
  });
  return map;
};

