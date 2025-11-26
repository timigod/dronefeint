const sanitizeHex = (hex: string) => hex.replace('#', '');

const DEFAULT_RGBA_FALLBACK: [number, number, number] = [220, 53, 69];

export const parseHexColor = (hex: string): [number, number, number] => {
  const sanitized = sanitizeHex(hex);

  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);

  return [r, g, b];
};

export const toRgbaString = (r: number, g: number, b: number, a = 1): string =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

export const hexToRgba = (hex: string, alpha = 1): string => {
  const sanitized = sanitizeHex(hex);
  if (sanitized.length !== 6) {
    const [fallbackR, fallbackG, fallbackB] = DEFAULT_RGBA_FALLBACK;
    return toRgbaString(fallbackR, fallbackG, fallbackB, alpha);
  }

  const [r, g, b] = parseHexColor(hex);
  return toRgbaString(r, g, b, alpha);
};
