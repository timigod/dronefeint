import type { Landmass } from './types';
import { smoothNoise } from './noise';

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

const getRenderingContext = (
  canvas: CanvasLike
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null => {
  return canvas.getContext('2d');
};

const BAYER_MATRIX = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

export interface TerrainRenderOptions {
  canvas: CanvasLike;
  landmasses: Landmass[];
  mapWidth: number;
  mapHeight: number;
}

export const renderTerrain = ({
  canvas,
  landmasses,
  mapWidth,
  mapHeight,
}: TerrainRenderOptions): boolean => {
  const ctx = getRenderingContext(canvas);
  if (!ctx) return false;

  if ('clearRect' in ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const isPointInLandmass = (px: number, py: number, landmass: Landmass): boolean => {
    if (!landmass.points || landmass.points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = landmass.points.length - 1; i < landmass.points.length; j = i++) {
      const xi = landmass.points[i].x;
      const yi = landmass.points[i].y;
      const xj = landmass.points[j].x;
      const yj = landmass.points[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const getElevationAtPoint = (px: number, py: number, landmass: Landmass): number => {
    if (landmass.elevationType === 'flat') return 0.15;
    const peaks = landmass.elevationPeaks || [];
    if (peaks.length === 0) return 0.15;
    let maxElevation = 0;
    for (const peak of peaks) {
      const dx = px - peak.x;
      const dy = py - peak.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const peakSize = Math.max(landmass.width, landmass.height) * 0.5;
      const elevation = Math.max(0, 1 - dist / (peakSize * peak.intensity));
      maxElevation = Math.max(maxElevation, elevation);
    }
    const weight = landmass.peakWeight ?? 1;
    return Math.min(1, maxElevation * weight);
  };

  const drawWrappedDot = (centerX: number, centerY: number, radius: number) => {
    const offsets = [-mapWidth, 0, mapWidth];
    for (const offsetX of offsets) {
      const drawX = centerX + offsetX;
      if (drawX < -radius || drawX > mapWidth + radius) continue;
      for (const offsetY of offsets) {
        const drawY = centerY + offsetY;
        if (drawY < -radius || drawY > mapHeight + radius) continue;
        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const hashToSeed = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0) / 4294967295;
  };

  const CHAR_SPACING = 6;

  landmasses.forEach((landmass) => {
    if (!landmass.points) return;
    const minX = Math.min(...landmass.points.map((p) => p.x));
    const maxX = Math.max(...landmass.points.map((p) => p.x));
    const minY = Math.min(...landmass.points.map((p) => p.y));
    const maxY = Math.max(...landmass.points.map((p) => p.y));
    const seed = hashToSeed(landmass.id) * 1000;
    const interiorFreq =
      landmass.elevationType === 'mountains'
        ? 0.0022
        : landmass.elevationType === 'hills'
          ? 0.0018
          : 0.0014;
    const interiorAmp =
      landmass.elevationType === 'mountains'
        ? 0.16
        : landmass.elevationType === 'hills'
          ? 0.12
          : 0.08;
    const plateauExp =
      landmass.elevationType === 'mountains'
        ? 0.9
        : landmass.elevationType === 'hills'
          ? 0.85
          : 0.8;

    for (let px = minX; px <= maxX; px += CHAR_SPACING) {
      for (let py = minY; py <= maxY; py += CHAR_SPACING) {
        if (!isPointInLandmass(px, py, landmass)) continue;

        let minDist = Infinity;
        for (const point of landmass.points) {
          const dx = px - point.x;
          const dy = py - point.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          minDist = Math.min(minDist, dist);
        }

        const maxRadius = Math.max(landmass.width, landmass.height) * 0.5;
        const falloff = landmass.falloffScale ?? 0.3;
        const baseNorm = Math.min(1, minDist / (maxRadius * falloff));
        let baseElevation = Math.pow(baseNorm, plateauExp) * 0.85;

        const peakElevation = getElevationAtPoint(px, py, landmass);
        const peakBlend = 0.35 + 0.45 * Math.min(1, peakElevation);
        let elevation = baseElevation * (1 - peakBlend) + peakElevation * peakBlend;

        const interiorNoise =
          (smoothNoise(
            px * interiorFreq + seed * 0.11,
            py * interiorFreq - seed * 0.07,
            1,
            seed * 0.37
          ) -
            0.5) *
          interiorAmp;
        elevation = Math.max(0, Math.min(1.05, elevation + interiorNoise));
        const clamped = Math.max(0, Math.min(1, elevation));
        if (clamped < 0.02) continue;

        let layerCount =
          landmass.elevationType === 'mountains'
            ? 6
            : landmass.elevationType === 'hills'
              ? 5
              : 4;
        if (landmass.elevationLayers) {
          layerCount = Math.max(4, Math.min(11, Math.round(landmass.elevationLayers)));
        } else {
          layerCount = Math.max(4, Math.min(11, layerCount));
        }
        const scaledElevation = clamped * (layerCount - 1);
        const baseLayer = Math.floor(scaledElevation);
        const layerFraction = scaledElevation - baseLayer;

        const bayerX = Math.floor((px / CHAR_SPACING) % 4);
        const bayerY = Math.floor((py / CHAR_SPACING) % 4);
        const ditherThreshold = BAYER_MATRIX[bayerY][bayerX];
        const DITHER_BAND = 0.18;
        let layer = Math.round(scaledElevation);
        if (layer === baseLayer && layerFraction > 1 - DITHER_BAND) {
          const within = (layerFraction - (1 - DITHER_BAND)) / DITHER_BAND;
          if (ditherThreshold < within) {
            layer = baseLayer + 1;
          }
        }
        layer = Math.max(0, Math.min(layerCount - 1, layer));

        const normalizedLayer = layerCount > 1 ? layer / (layerCount - 1) : 0;
        const dotSize = 0.9 + normalizedLayer * 1.2;
        const baseShade = Math.floor(80 + normalizedLayer * 140);
        const alpha = 0.11 + normalizedLayer * 0.19;
        ctx.fillStyle = `rgba(${baseShade}, ${baseShade}, ${baseShade}, ${alpha})`;
        drawWrappedDot(px, py, dotSize);
      }
    }
  });

  return true;
};

export interface WaterRenderOptions {
  canvas: CanvasLike;
  mapWidth: number;
  mapHeight: number;
}

export const renderWater = ({
  canvas,
  mapWidth,
  mapHeight,
}: WaterRenderOptions): boolean => {
  const ctx = getRenderingContext(canvas);
  if (!ctx) return false;

  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, mapWidth, mapHeight);

  const seed = Math.random() * 1000;
  const DOT_SPACING = 5;

  for (let y = 0; y < mapHeight; y += DOT_SPACING) {
    for (let x = 0; x < mapWidth; x += DOT_SPACING) {
      const swirl = smoothNoise(x * 0.0025 + seed, y * 0.0025 - seed, 1, seed + 50);
      const currents = smoothNoise(
        x * 0.001 + seed * 0.4,
        y * 0.001 - seed * 0.4,
        1,
        seed + 240
      );
      const sparkle = smoothNoise(
        x * 0.006 - seed * 0.2,
        y * 0.006 + seed * 0.2,
        1,
        seed + 480
      );
      const combined = (swirl * 0.55 + currents * 0.35 + sparkle * 0.1 + 1) * 0.5;
      if (combined < 0.56) continue;

      const alpha = Math.min(0.22, (combined - 0.56) * 0.35);
      const radius = 0.6 + (combined - 0.56) * 2.2;
      const hueBlend = 90 + combined * 40;
      ctx.fillStyle = `rgba(${hueBlend}, ${hueBlend + 35}, ${hueBlend + 60}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return true;
};

export interface MinimapRenderOptions {
  canvas: CanvasLike;
  landmasses: Landmass[];
  mapWidth: number;
  mapHeight: number;
}

export const renderMinimapTexture = ({
  canvas,
  landmasses,
  mapWidth,
  mapHeight,
}: MinimapRenderOptions): boolean => {
  const ctx = getRenderingContext(canvas);
  if (!ctx) return false;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(8, 8, 10, 0.9)';
  ctx.fillRect(0, 0, width, height);

  const textureScaleX = width / mapWidth;
  const textureScaleY = height / mapHeight;
  const mapCenterX = width / 2;
  const mapCenterY = height / 2;

  landmasses.forEach((landmass) => {
    if (!landmass.points) return;

    const points = landmass.points.map((p) => ({
      x: mapCenterX + (p.x - mapWidth / 2) * textureScaleX,
      y: mapCenterY + (p.y - mapHeight / 2) * textureScaleY,
    }));

    ctx.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    const alpha =
      landmass.elevationType === 'mountains'
        ? 0.12
        : landmass.elevationType === 'hills'
          ? 0.09
          : 0.07;

    ctx.fillStyle = `rgba(220, 220, 220, ${alpha})`;
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
    ctx.lineWidth = 0.55;
    ctx.stroke();
  });

  return true;
};

