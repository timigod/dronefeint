import type { FontSizeOption } from './utils/fontSize';
import { getResponsiveFontValue } from './utils/fontSize';

// Structure types for the game
export type StructureType = 'hq' | 'foundry' | 'reactor' | 'extractor';

export interface Structure {
  id: string;
  type: StructureType;
  x: number;
  y: number;
  ownerId?: string; // player id, undefined => neutral
  label?: string;   // outpost display name
  playerColor: string; // hex color
  size: number;
  droneCount?: number; // Current drone count
  droneCapacity?: number; // Maximum drone capacity
  droneGenerationRate?: number; // Drones generated per minute (foundries only)
  useGoogleFont?: boolean; // Use Google Font instead of geometric rendering
  cacheVersion?: number; // bump to force sprite cache refresh when data changes
}

// Bayer matrix for dithering
const BAYER_4x4 = [
  [0/16, 8/16, 2/16, 10/16],
  [12/16, 4/16, 14/16, 6/16],
  [3/16, 11/16, 1/16, 9/16],
  [15/16, 7/16, 13/16, 5/16]
];

// Simple hash to get per-structure phase offsets
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

// Draw a structure on a canvas context
export function drawStructure(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  offsetX: number = 0,
  offsetY: number = 0,
  animationTime: number = 0
) {
  const { x, y, type, playerColor, size, id } = structure;
  const screenX = x + offsetX;
  const screenY = y + offsetY;

  // Parse player color
  const r = parseInt(playerColor.slice(1, 3), 16);
  const g = parseInt(playerColor.slice(3, 5), 16);
  const b = parseInt(playerColor.slice(5, 7), 16);

  // Draw subtle shadow/background circle to distinguish from terrain
  const bgRadius = size * 1.3;
  const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, bgRadius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(screenX, screenY, bgRadius, 0, Math.PI * 2);
  ctx.fill();

  const phase = hashId(id);

  switch (type) {
    case 'hq':
      drawHQ(ctx, screenX, screenY, size, r, g, b, animationTime, phase);
      break;
    case 'foundry':
      drawFoundry(ctx, screenX, screenY, size, r, g, b, animationTime, phase);
      break;
    case 'reactor':
      drawReactor(ctx, screenX, screenY, size, r, g, b, animationTime, phase);
      break;
    case 'extractor':
      drawExtractor(ctx, screenX, screenY, size, r, g, b, animationTime, phase);
      break;
  }
}

function drawHQ(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  animationTime: number = 0,
  phase: number = 0
) {
  // HQ: Tall tower with circular base and detailed panels
  const baseRadius = size * 0.9;
  const towerHeight = size * 1.8;
  const towerWidth = size * 0.45;

  // Draw circular base (ground platform) with subtle pulse
  const basePulse = Math.sin(animationTime * 0.002 + phase) * 0.03 + 1; // Subtle 3% pulse
  
  for (let dy = -baseRadius; dy <= baseRadius; dy += 1) {
    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > baseRadius) continue;

      const elevation = 1 - (dist / baseRadius);
      const bayerX = Math.floor(Math.abs(dx)) % 4;
      const bayerY = Math.floor(Math.abs(dy)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];

      // Add panel lines
      const angle = Math.atan2(dy, dx);
      const panelEffect = Math.abs(Math.sin(angle * 6)) < 0.1 ? 0.15 : 0;

      if (elevation > threshold * 0.9) {
        const intensity = (0.3 + elevation * 0.5 + panelEffect) * basePulse;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.6 + elevation * 0.3})`;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  // Draw tower with detail
  for (let ty = -towerHeight; ty < 0; ty += 1) {
    for (let tx = -towerWidth; tx <= towerWidth; tx += 1) {
      const heightFactor = 1 - (Math.abs(ty) / towerHeight);
      const sideDist = Math.abs(tx) / towerWidth;
      
      if (sideDist > heightFactor * 0.85) continue;

      // Add horizontal bands
      const bandEffect = Math.abs(ty % 15) < 2 ? 0.2 : 0;
      
      const intensity = 0.5 + heightFactor * 0.4 + bandEffect;
      const bayerX = Math.floor(Math.abs(tx)) % 4;
      const bayerY = Math.floor(Math.abs(ty)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];

      if (heightFactor > threshold * 0.4) {
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.7 + heightFactor * 0.2})`;
        ctx.fillRect(x + tx, y + ty, 1, 1);
      }
    }
  }

  // Add antenna/spire details with wispy sway
  for (let sy = -towerHeight - 20; sy < -towerHeight; sy += 1) {
    const heightFactor = Math.abs(sy + towerHeight) / 20;
    const spireWidth = (1 - heightFactor) * 3;
    // Dramatic wispy sway - not in sync thanks to per-structure phase
    const sway =
      Math.sin(animationTime * 0.003 + phase * 2 + heightFactor * 5) * (1 + heightFactor * 4) +
      Math.sin(animationTime * 0.007 + phase * 5 + heightFactor * 8) * (0.6 + heightFactor * 3) +
      Math.sin(animationTime * 0.012 + phase * 9 + heightFactor * 11) * 0.4;

    for (let sx = -spireWidth; sx <= spireWidth; sx += 1) {
      if (Math.abs(sx) < spireWidth) {
        ctx.fillStyle = `rgba(${r * 0.8}, ${g * 0.8}, ${b * 0.8}, 0.9)`;
        ctx.fillRect(x + sx + sway * 0.3, y + sy, 1, 1);
      }
    }
  }

  // Pulsing/flickering glowing top (flame-like effect) per-structure phase
  const pulse1 = Math.sin(animationTime * 0.003 + phase) * 0.15 + 0.85; // Slow pulse
  const pulse2 = Math.sin(animationTime * 0.007 + 1.2 + phase * 1.8) * 0.1; // Fast flicker
  const pulse3 = Math.sin(animationTime * 0.011 + 2.5 + phase * 2.7) * 0.08; // Medium variation
  const flameIntensity = pulse1 + pulse2 + pulse3;
  
  const coreRadius = towerWidth * (0.35 + pulse2 * 0.08);
  
  ctx.fillStyle = `rgba(${r * flameIntensity}, ${g * flameIntensity}, ${b * flameIntensity}, ${0.85 + pulse1 * 0.15})`;
  ctx.beginPath();
  ctx.arc(x, y - towerHeight, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  // Outer glow ring with pulse
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + pulse1 * 0.2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - towerHeight, towerWidth * (0.6 + pulse2 * 0.1), 0, Math.PI * 2);
  ctx.stroke();
}

function drawFoundry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  animationTime: number = 0,
  phase: number = 0
) {
  // Foundry: Wide angular structure with multiple sections and details
  const width = size * 1.4;
  const height = size * 0.9;

  // Main body (angular hexagon)
  const points = [
    { x: 0, y: -height },
    { x: width * 0.6, y: -height * 0.5 },
    { x: width, y: -height * 0.2 },
    { x: width * 0.85, y: height * 0.4 },
    { x: -width * 0.85, y: height * 0.4 },
    { x: -width, y: -height * 0.2 },
    { x: -width * 0.6, y: -height * 0.5 },
  ];

  // Fill with high-res dithered pattern
  for (let dy = -height - 5; dy <= height * 0.5; dy += 1) {
    for (let dx = -width - 5; dx <= width + 5; dx += 1) {
      // Check if inside polygon
      const px = x + dx;
      const py = y + dy;
      
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = x + points[i].x, yi = y + points[i].y;
        const xj = x + points[j].x, yj = y + points[j].y;
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }

      if (!inside) continue;

      const centerDist = Math.sqrt(dx * dx + dy * dy) / width;
      
      // Add animated marquee panel patterns
      const marqueeOffset = (animationTime * 0.02 + phase * 25) % 18; // Slow vertical scroll
      const verticalPanel = Math.abs((dx - marqueeOffset) % 18) < 2 ? 0.15 : 0;
      const horizontalPanel = Math.abs(dy % 12) < 1 ? 0.12 : 0;
      
      const intensity = 0.4 + (1 - centerDist) * 0.5 + verticalPanel + horizontalPanel;
      const bayerX = Math.floor(Math.abs(dx)) % 4;
      const bayerY = Math.floor(Math.abs(dy)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];

      if ((1 - centerDist) > threshold * 0.8) {
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.5 + (1 - centerDist) * 0.3})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  // Animated vents/exhaust ports (horizontal rows of vertical dashes marqueeing sideways)
  const ventSpacing = 28;
  const ventWidth = 6;
  const ventOffset = (animationTime * 0.01 + phase * 40) % ventSpacing;

  for (let vy = -height * 0.5; vy <= height * 0.3; vy += 14) {
    for (let vx = -width; vx <= width; vx += 1) {
      const shifted = (vx + ventOffset + ventSpacing) % ventSpacing;
      if (shifted < ventWidth) {
        ctx.fillStyle = `rgba(${r * 0.2}, ${g * 0.2}, ${b * 0.2}, 0.85)`;
        ctx.fillRect(x + vx, y + vy - 4, 1, 8);
      }
    }
  }

  // Accent stripes with detail
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.7, y);
  ctx.lineTo(x + width * 0.7, y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.7, y + 8);
  ctx.lineTo(x + width * 0.7, y + 8);
  ctx.stroke();
}

function drawReactor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  animationTime: number = 0,
  phase: number = 0
) {
  // Reactor: Detailed sphere with radiating power conduits
  const coreRadius = size * 0.6;
  const ringRadius = size * 1.0;

  // Draw core sphere with high detail
  for (let dy = -coreRadius; dy <= coreRadius; dy += 1) {
    for (let dx = -coreRadius; dx <= coreRadius; dx += 1) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > coreRadius) continue;

      const elevation = 1 - (dist / coreRadius);
      
      // Add surface detail patterns
      const angle = Math.atan2(dy, dx);
      const surfacePattern = Math.abs(Math.sin(angle * 8)) < 0.15 ? 0.1 : 0;
      const latitudeLines = Math.abs(dy % 8) < 1 ? 0.12 : 0;
      
      const bayerX = Math.floor(Math.abs(dx)) % 4;
      const bayerY = Math.floor(Math.abs(dy)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];

      if (elevation > threshold * 0.4) {
        const intensity = 0.5 + elevation * 0.5 + surfacePattern + latitudeLines;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.7 + elevation * 0.2})`;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  // Radiating power conduits (4 cardinal + 4 diagonal = 8 directions) with rotation
  const armLength = size * 0.8;
  const armWidth = size * 0.12;
  const rotationAngle = animationTime * 0.0005 + phase * Math.PI * 2; // Slow rotation with offset
  
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI / 4) + rotationAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const isDiagonal = i % 2 === 1;
    const length = isDiagonal ? armLength * 0.7 : armLength;

    for (let d = coreRadius + 5; d < coreRadius + length; d += 1) {
      const distFactor = (d - coreRadius) / length;
      const intensity = 1 - distFactor;
      const px = x + cos * d;
      const py = y + sin * d;

      // Add segmented appearance
      const segment = Math.floor(d / 8) % 2;
      const segmentIntensity = segment === 0 ? intensity : intensity * 0.7;

      // Thicker at base, thinner at end
      const currentWidth = armWidth * (1.2 - distFactor * 0.5);

      ctx.fillStyle = `rgba(${r * segmentIntensity}, ${g * segmentIntensity}, ${b * segmentIntensity}, ${0.5 + intensity * 0.4})`;
      ctx.fillRect(px - currentWidth, py - currentWidth, currentWidth * 2, currentWidth * 2);

      // Add center line detail
      if (d % 4 === 0) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + intensity * 0.3})`;
        ctx.fillRect(px - currentWidth * 0.4, py - currentWidth * 0.4, currentWidth * 0.8, currentWidth * 0.8);
      }
    }
  }

  // Inner core glow (pulsing energy)
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Mid ring
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // Outer containment ring
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle outer glow
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius + 5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawExtractor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  animationTime: number = 0,
  phase: number = 0
) {
  // Extractor: Wide industrial facility with domed top and smokestack
  const baseWidth = size * 1.6;
  const baseHeight = size * 0.4;
  const midWidth = size * 1.3;
  const midHeight = size * 0.5;
  const domeRadius = size * 0.7;
  const stackHeight = size * 1.4;
  const stackWidth = size * 0.2;

  // Draw tiered base (bottom platform)
  for (let ty = -baseHeight; ty <= baseHeight * 0.3; ty += 1) {
    const tierFactor = 1 - Math.abs(ty / baseHeight);
    const tierWidth = baseWidth * (0.85 + tierFactor * 0.15);
    
    for (let tx = -tierWidth; tx <= tierWidth; tx += 1) {
      // Horizontal band details
      const bandEffect = Math.abs(ty % 8) < 1 ? 0.15 : 0;
      const windowEffect = (Math.abs(tx % 20) < 3 && Math.abs(ty % 8) > 2) ? -0.2 : 0;
      
      const bayerX = Math.floor(Math.abs(tx)) % 4;
      const bayerY = Math.floor(Math.abs(ty)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];
      
      if (tierFactor > threshold * 0.6) {
        const intensity = 0.4 + tierFactor * 0.4 + bandEffect + windowEffect;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.6 + tierFactor * 0.2})`;
        ctx.fillRect(x + tx, y + ty, 1, 1);
      }
    }
  }

  // Draw mid section
  for (let ty = -baseHeight - midHeight; ty < -baseHeight; ty += 1) {
    const midFactor = 1 - Math.abs((ty + baseHeight + midHeight/2) / (midHeight/2));
    const currentWidth = midWidth * (0.9 + midFactor * 0.1);
    
    for (let tx = -currentWidth; tx <= currentWidth; tx += 1) {
      // Panel patterns and windows
      const vertPattern = Math.abs(tx % 16) < 2 ? 0.12 : 0;
      const horzBand = Math.abs((ty + baseHeight) % 10) < 1 ? 0.15 : 0;
      const windowPattern = (Math.abs(tx % 24) < 4 && Math.abs((ty + baseHeight) % 10) > 3) ? -0.25 : 0;
      
      const bayerX = Math.floor(Math.abs(tx)) % 4;
      const bayerY = Math.floor(Math.abs(ty)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];
      
      if (midFactor > threshold * 0.5) {
        const intensity = 0.45 + midFactor * 0.35 + vertPattern + horzBand + windowPattern;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.65 + midFactor * 0.2})`;
        ctx.fillRect(x + tx, y + ty, 1, 1);
      }
    }
  }

  // Draw domed top section
  const domeBaseY = y - baseHeight - midHeight;
  for (let dy = -domeRadius; dy <= 0; dy += 1) {
    for (let dx = -domeRadius; dx <= domeRadius; dx += 1) {
      const dist = Math.sqrt(dx * dx + dy * dy * 0.7); // Elliptical dome
      if (dist > domeRadius) continue;

      const elevation = 1 - (dist / domeRadius);
      
      // Add varied texture to dome
      const angle = Math.atan2(dy, dx);
      const panelPattern = Math.abs(Math.sin(angle * 12)) < 0.12 ? 0.12 : 0;
      const horizBands = Math.abs(dy % 6) < 1 ? 0.1 : 0;
      
      const bayerX = Math.floor(Math.abs(dx)) % 4;
      const bayerY = Math.floor(Math.abs(dy)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];

      if (elevation > threshold * 0.7) {
        const intensity = 0.5 + elevation * 0.4 + panelPattern + horizBands;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.65 + elevation * 0.25})`;
        ctx.fillRect(x + dx, domeBaseY + dy, 1, 1);
      }
    }
  }

  // Draw smokestack with animated smoke
  const stackX = x + baseWidth * 0.6;
  for (let sy = -stackHeight; sy < 0; sy += 1) {
    const heightFactor = Math.abs(sy) / stackHeight;
    const currentStackWidth = stackWidth * (1 - heightFactor * 0.2);
    
    for (let sx = -currentStackWidth; sx <= currentStackWidth; sx += 1) {
      // Vertical bands on stack
      const bandEffect = Math.abs(sx % 5) < 1 ? 0.15 : 0;
      
      const intensity = 0.4 + (1 - heightFactor) * 0.4 + bandEffect;
      const bayerX = Math.floor(Math.abs(sx)) % 4;
      const bayerY = Math.floor(Math.abs(sy)) % 4;
      const threshold = BAYER_4x4[bayerY][bayerX];
      
      if ((1 - heightFactor) > threshold * 0.5) {
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, ${0.7 + (1 - heightFactor) * 0.2})`;
        ctx.fillRect(stackX + sx, y + sy, 1, 1);
      }
    }
  }

  // Animated smoke particles from smokestack
  const smokeCount = 8;
  for (let i = 0; i < smokeCount; i++) {
    const smokePhase = (animationTime * 0.0008 + phase * 3 + i * 0.4) % 1;
    const smokeY = y - stackHeight - smokePhase * 40;
    const smokeDrift = Math.sin(smokePhase * Math.PI * 2 + i) * 8;
    const smokeX = stackX + smokeDrift;
    const smokeSize = 2 + smokePhase * 3;
    const smokeAlpha = (1 - smokePhase) * 0.4;
    
    ctx.fillStyle = `rgba(${r * 0.5}, ${g * 0.5}, ${b * 0.5}, ${smokeAlpha})`;
    ctx.beginPath();
    ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add side support structures
  const supportWidth = size * 0.3;
  const supportHeight = size * 0.5;
  
  for (let side of [-1, 1]) {
    const supportX = x + side * baseWidth * 0.7;
    for (let sy = -supportHeight; sy <= 0; sy += 1) {
      for (let sx = -supportWidth * 0.5; sx <= supportWidth * 0.5; sx += 1) {
        const heightFactor = 1 - Math.abs(sy) / supportHeight;
        
        // Window pattern
        const isWindow = Math.abs(sx % 8) < 2 && Math.abs(sy % 8) > 2;
        const windowDark = isWindow ? -0.3 : 0;
        
        const intensity = 0.35 + heightFactor * 0.3 + windowDark;
        ctx.fillStyle = `rgba(${r * intensity}, ${g * intensity}, ${b * intensity}, 0.6)`;
        ctx.fillRect(supportX + sx, y + sy, 1, 1);
      }
    }
  }

  // Accent lights/glow on base
  const glowPulse = Math.sin(animationTime * 0.003 + phase) * 0.5 + 0.5;
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + glowPulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - baseWidth * 0.8, y);
  ctx.lineTo(x + baseWidth * 0.8, y);
  ctx.stroke();
}

// Geometric digit rendering (7-segment style, pixel-perfect)
// Each digit is 5px wide x 7px tall, with 1px spacing between digits
const DIGIT_SEGMENTS: Record<string, boolean[]> = {
  '0': [true, true, true, false, true, true, true],     // top, top-right, bottom-right, middle, bottom-left, top-left, bottom
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, true, false, true, false],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '/': [false, false, false, false, false, false, false], // Special: drawn as diagonal
  '%': [false, false, false, false, false, false, false], // Special: drawn as circles + diagonal
  '?': [false, false, false, false, false, false, false], // Special: drawn as curve + dot
};

function drawDigit(
  ctx: CanvasRenderingContext2D,
  digit: string,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  scale: number = 1
) {
  const w = 5 * scale;  // segment width
  const h = 3 * scale;  // segment height (for horizontal segments)
  const gap = 1 * scale; // gap between segments
  
  if (digit === '/') {
    // Draw diagonal slash
    for (let i = 0; i <= 7 * scale; i++) {
      const px = Math.floor(x + (w - gap) - (i / (7 * scale)) * (w - gap));
      const py = Math.floor(y + i);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
      ctx.fillRect(px, py, scale, scale);
    }
    return;
  }
  
  if (digit === '%') {
    // Draw percent symbol (two dots + diagonal)
    // Top circle
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y, scale * 2, scale * 2);
    // Bottom circle
    ctx.fillRect(x + w - scale * 2, y + h * 2 + gap * 2 - scale, scale * 2, scale * 2);
    // Diagonal
    for (let i = 0; i <= 7 * scale; i++) {
      const px = Math.floor(x + (w - gap) - (i / (7 * scale)) * (w - gap));
      const py = Math.floor(y + i);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
      ctx.fillRect(px, py, scale, scale);
    }
    return;
  }

  if (digit === '?') {
    // Draw question mark in 7-segment style
    // Top curve: top segment + top-right segment
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y, w, scale); // top
    ctx.fillRect(x + w - scale, y, scale, h + gap); // top-right
    // Middle hook
    ctx.fillRect(x + scale, y + h, w - scale, scale); // middle (offset left)
    // Stem down from middle (centered)
    const stemX = x + Math.floor(w / 2) - Math.floor(scale / 2);
    ctx.fillRect(stemX, y + h + gap, scale, scale * 1.5);
    // Dot at bottom (centered)
    const dotY = y + h * 2 + gap + scale;
    ctx.fillRect(stemX, dotY, scale, scale);
    return;
  }

  const segments = DIGIT_SEGMENTS[digit];
  if (!segments) return;

  const [top, topRight, bottomRight, middle, bottomLeft, topLeft, bottom] = segments;

  // Top horizontal
  if (top) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y, w, scale);
  }

  // Top-right vertical
  if (topRight) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x + w - scale, y, scale, h + gap);
  }

  // Bottom-right vertical
  if (bottomRight) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x + w - scale, y + h + gap, scale, h + gap);
  }

  // Middle horizontal
  if (middle) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y + h, w, scale);
  }

  // Bottom-left vertical
  if (bottomLeft) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y + h + gap, scale, h + gap);
  }

  // Top-left vertical
  if (topLeft) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y, scale, h + gap);
  }

  // Bottom horizontal
  if (bottom) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.fillRect(x, y + h * 2 + gap, w, scale);
  }
}

// 7-segment text dimensions
export const SEGMENT_DIGIT_WIDTH = 5;
export const SEGMENT_DIGIT_HEIGHT = 7;
export const SEGMENT_DIGIT_SPACING = 1;

// Vertical spacing for drone count / indicators below structures
export const DRONE_COUNT_SPACING: Record<StructureType, number> = {
  hq: -3,         // nest right under the tower
  foundry: -2,    // sit inside the main body
  reactor: 14,    // still needs the extra clearance
  extractor: -10, // already very close
};

export function measureSegmentText(text: string, scale: number = 1): number {
  if (!text.length) return 0;
  const digitWidth = SEGMENT_DIGIT_WIDTH * scale;
  const spacing = SEGMENT_DIGIT_SPACING * scale;
  return text.length * (digitWidth + spacing) - spacing;
}

export function drawSegmentText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  scale: number = 1
) {
  const digitWidth = SEGMENT_DIGIT_WIDTH * scale;
  const spacing = SEGMENT_DIGIT_SPACING * scale;
  let offsetX = 0;

  for (let i = 0; i < text.length; i++) {
    drawDigit(ctx, text[i], x + offsetX, y, r, g, b, scale);
    offsetX += digitWidth + spacing;
  }
}

// Alias for internal use
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  scale: number = 1
) {
  drawSegmentText(ctx, text, x, y, r, g, b, scale);
}

// Draw drone count display on a structure
export function drawDroneCount(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  offsetX: number = 0,
  offsetY: number = 0,
  fontSize: FontSizeOption = 'small',
  isMobile: boolean = false
) {
  if (structure.droneCount === undefined || structure.droneCount === 0) return;

  const { x, y, playerColor, size, useGoogleFont, type } = structure;
  const screenX = x + offsetX;
  const screenY = y + offsetY;

  // Parse player color
  const r = parseInt(playerColor.slice(1, 3), 16);
  const g = parseInt(playerColor.slice(3, 5), 16);
  const b = parseInt(playerColor.slice(5, 7), 16);

  const spacing = DRONE_COUNT_SPACING[type] ?? 3;

  const text = `${structure.droneCount}`;
  
  // Map fontSize to scale values
  const scaleMap: Record<FontSizeOption, number> = {
    small: 1.5,
    medium: 1.8,
    large: 2.1
  };
  const responsiveScale = getResponsiveFontValue(fontSize, scaleMap, isMobile);
  
  if (useGoogleFont) {
    // Use Google Font rendering (canvas text)
    const baseFontSize = 11;
    const fontSizeMultiplier = responsiveScale / 1.5; // relative to base scale
    const actualFontSize = baseFontSize * fontSizeMultiplier;
    ctx.font = `700 ${actualFontSize}px 'Orbitron', monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    
    const textY = screenY + size + spacing;
    
    // Measure text for background
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = actualFontSize;
    
    // Draw solid black background slightly larger than the text
    const paddingX = 5;
    const paddingY = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(
      screenX - textWidth / 2 - paddingX,
      textY - paddingY,
      textWidth + paddingX * 2,
      textHeight + paddingY * 2
    );
    
    // Draw text with glow effect
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
    ctx.shadowBlur = 4;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillText(text, screenX, textY);
    
    // Reset shadow
    ctx.shadowBlur = 0;
  } else {
    // Use custom geometric rendering (scale based on fontSize setting)
    const scale = responsiveScale;
    const textHeight = 7 * scale;
    const charWidth = 6 * scale; // 5px + 1px spacing
    const textWidth = text.length * charWidth;
    
    // Center the text below the structure (tighter spacing)
    const textX = screenX - textWidth / 2;
    const textY = screenY + size + spacing;

    // Draw solid black background slightly larger than the text
    const paddingX = 4;
    const paddingY = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(
      textX - paddingX,
      textY - paddingY,
      textWidth + paddingX * 2,
      textHeight + paddingY * 2
    );

    // Draw the text
    drawText(ctx, text, textX, textY, r, g, b, scale);
  }
}
