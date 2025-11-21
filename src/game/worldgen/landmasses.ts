import { Landmass } from '../types';
import { smoothNoise } from '../noise';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';

const landmassesOverlap = (
  l1: { x: number; y: number; width: number; height: number },
  l2: { x: number; y: number; width: number; height: number }
): boolean => {
  const margin = 240;
  return !(
    l1.x + l1.width + margin < l2.x ||
    l2.x + l2.width + margin < l1.x ||
    l1.y + l1.height + margin < l2.y ||
    l2.y + l2.height + margin < l1.y
  );
};

export const generateLandmasses = (): Landmass[] => {
  const landmasses: Landmass[] = [];
  const numLandmasses = 11;
  const maxAttempts = 50;

  for (let i = 0; i < numLandmasses; i++) {
    let attempts = 0;
    let validPosition = false;
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;

    const sizeType = Math.random();
    let minSize: number;
    let maxSize: number;
    if (sizeType < 0.35) {
      minSize = 650;
      maxSize = 1100;
    } else if (sizeType < 0.7) {
      minSize = 450;
      maxSize = 750;
    } else {
      minSize = 320;
      maxSize = 520;
    }

    while (!validPosition && attempts < maxAttempts) {
      x = 200 + Math.random() * (MAP_WIDTH - 400);
      y = 200 + Math.random() * (MAP_HEIGHT - 400);
      width = minSize + Math.random() * (maxSize - minSize);
      height = minSize + Math.random() * (maxSize - minSize);

      if (Math.random() > 0.5) {
        width *= 0.85 + Math.random() * 0.25;
      } else {
        height *= 0.85 + Math.random() * 0.25;
      }

      validPosition = landmasses.every((existing) =>
        !landmassesOverlap({ x, y, width, height }, existing)
      );
      attempts += 1;
    }

    if (!validPosition) continue;

    const numSegments = 128;
    const rawRadii: number[] = [];
    const baseRadius = 0.58 + Math.random() * 0.14;
    const primaryNoiseAmp = 0.07 + Math.random() * 0.08;
    const secondaryNoiseAmp = 0.03 + Math.random() * 0.03;
    const lowFrequencyAmplitude = 0.05 + Math.random() * 0.03;
    const rippleAmplitude = 0.012 + Math.random() * 0.01;
    const orientation = Math.random() * Math.PI;
    const noiseSeed = Math.random() * 1000;
    const axisMultiplierX = 0.7 + Math.random() * 0.45;
    const axisMultiplierY = 0.7 + Math.random() * 0.45;
    const cosOrientation = Math.cos(orientation);
    const sinOrientation = Math.sin(orientation);

    const lobeCount = 3 + Math.floor(Math.random() * 4);
    const lobes = Array.from({ length: lobeCount }).map(() => ({
      angle: Math.random() * Math.PI * 2,
      width: 0.25 + Math.random() * 0.5,
      amplitude: (0.08 + Math.random() * 0.2) * (Math.random() > 0.2 ? 1 : -0.6),
    }));

    const angleDiff = (a: number, b: number) => {
      let diff = Math.abs(a - b);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      return diff;
    };

    for (let j = 0; j < numSegments; j++) {
      const angle = (j / numSegments) * Math.PI * 2;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      const lowFrequency = Math.cos(angle * 1.6 + orientation * 0.6) * lowFrequencyAmplitude;
      const lobeContribution = lobes.reduce((acc, lobe) => {
        const diff = angleDiff(angle, lobe.angle);
        const falloff = Math.exp(-Math.pow(diff / lobe.width, 2) * 2);
        return acc + falloff * lobe.amplitude;
      }, 0);

      const mediumNoise = smoothNoise(
        cosAngle * 0.55 + noiseSeed * 0.2,
        sinAngle * 0.55 + noiseSeed * 0.2,
        1.0,
        noiseSeed + 120
      );
      const fineNoise = smoothNoise(
        cosAngle * 1.5 + noiseSeed * 0.65,
        sinAngle * 1.5 + noiseSeed * 0.65,
        1.0,
        noiseSeed + 360
      );
      const layeredNoise =
        (mediumNoise - 0.5) * primaryNoiseAmp * 2 +
        (fineNoise - 0.5) * secondaryNoiseAmp * 2;
      const ripples = Math.sin(angle * 3.8 + noiseSeed * 0.5) * rippleAmplitude;

      let radius = baseRadius + lowFrequency + layeredNoise + ripples + lobeContribution;
      radius = Math.max(0.38, Math.min(1.05, radius));
      rawRadii.push(radius);
    }

    let smoothedRadii = rawRadii.slice();
    for (let pass = 0; pass < 3; pass++) {
      const nextRadii = smoothedRadii.map((radius, idx) => {
        const prev = smoothedRadii[(idx - 1 + numSegments) % numSegments];
        const next = smoothedRadii[(idx + 1) % numSegments];
        const prevPrev = smoothedRadii[(idx - 2 + numSegments) % numSegments];
        const nextNext = smoothedRadii[(idx + 2) % numSegments];
        const prevPrevPrev = smoothedRadii[(idx - 3 + numSegments) % numSegments];
        const nextNextNext = smoothedRadii[(idx + 3) % numSegments];
        const averaged =
          (radius * 6 +
            (prev + next) * 3 +
            (prevPrev + nextNext) * 2 +
            prevPrevPrev +
            nextNextNext) /
          18;
        return Math.max(0.38, Math.min(1.05, averaged));
      });
      smoothedRadii = nextRadii;
    }

    const points: { x: number; y: number }[] = [];
    smoothedRadii.forEach((radius, idx) => {
      const angle = (idx / numSegments) * Math.PI * 2;
      const localX = Math.cos(angle) * width * radius * axisMultiplierX;
      const localY = Math.sin(angle) * height * radius * axisMultiplierY;
      const rotatedX = localX * cosOrientation - localY * sinOrientation;
      const rotatedY = localX * sinOrientation + localY * cosOrientation;

      points.push({
        x: x + rotatedX,
        y: y + rotatedY,
      });
    });

    const margin = 180;
    const bounds = points.reduce(
      (acc, p) => {
        acc.minX = Math.min(acc.minX, p.x);
        acc.maxX = Math.max(acc.maxX, p.x);
        acc.minY = Math.min(acc.minY, p.y);
        acc.maxY = Math.max(acc.maxY, p.y);
        return acc;
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );

    let shiftX = 0;
    let shiftY = 0;
    if (bounds.minX < margin) shiftX = margin - bounds.minX;
    else if (bounds.maxX > MAP_WIDTH - margin) shiftX = MAP_WIDTH - margin - bounds.maxX;
    if (bounds.minY < margin) shiftY = margin - bounds.minY;
    else if (bounds.maxY > MAP_HEIGHT - margin) shiftY = MAP_HEIGHT - margin - bounds.maxY;

    if (shiftX !== 0 || shiftY !== 0) {
      points.forEach((p) => {
        p.x += shiftX;
        p.y += shiftY;
      });
      x += shiftX;
      y += shiftY;
    }

    const elevRoll = Math.random();
    let elevationType: 'flat' | 'hills' | 'mountains';
    const elevationPeaks: { x: number; y: number; intensity: number }[] = [];

    if (elevRoll < 0.5) {
      elevationType = 'flat';
    } else if (elevRoll < 0.85) {
      elevationType = 'hills';
      const numPeaks = 1 + Math.floor(Math.random() * 2);
      for (let p = 0; p < numPeaks; p++) {
        elevationPeaks.push({
          x: x + (Math.random() - 0.5) * width * 0.6,
          y: y + (Math.random() - 0.5) * height * 0.6,
          intensity: 0.3 + Math.random() * 0.3,
        });
      }
    } else {
      elevationType = 'mountains';
      const numPeaks = 2 + Math.floor(Math.random() * 2);
      for (let p = 0; p < numPeaks; p++) {
        elevationPeaks.push({
          x: x + (Math.random() - 0.5) * width * 0.7,
          y: y + (Math.random() - 0.5) * height * 0.7,
          intensity: 0.5 + Math.random() * 0.5,
        });
      }
    }

    const defaultLayers =
      elevationType === 'mountains' ? 6 : elevationType === 'hills' ? 4 : 2;
    const elevationLayers = Math.max(
      4,
      Math.min(11, Math.round(defaultLayers + (Math.random() - 0.5) * 4))
    );
    const falloffScale = 0.22 + Math.random() * 0.18;
    const peakWeight = 0.7 + Math.random() * 0.9;

    landmasses.push({
      id: `landmass-${i}`,
      x,
      y,
      width,
      height,
      points,
      elevationType,
      elevationPeaks,
      elevationLayers,
      falloffScale,
      peakWeight,
    });
  }

  return landmasses;
};

