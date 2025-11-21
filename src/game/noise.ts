export const noise2D = (x: number, y: number, seed: number = 0): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
};

export const smoothNoise = (
  x: number,
  y: number,
  scale: number = 0.01,
  seed: number = 0
): number => {
  const scaledX = x * scale;
  const scaledY = y * scale;

  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < 4; i++) {
    value += noise2D(scaledX * frequency, scaledY * frequency, seed + i) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
};

