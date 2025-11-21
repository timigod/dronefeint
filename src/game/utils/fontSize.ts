export const FONT_SIZE_SEQUENCE = ['small', 'medium', 'large'] as const;

export type FontSizeOption = (typeof FONT_SIZE_SEQUENCE)[number];

const MOBILE_SHIFT_STEPS = 2;

const getStepSize = (baseValues: Record<FontSizeOption, number>) => {
  const [smallKey, mediumKey, largeKey] = FONT_SIZE_SEQUENCE;
  const stepCandidates = [
    baseValues[largeKey] - baseValues[mediumKey],
    baseValues[mediumKey] - baseValues[smallKey],
    baseValues[largeKey] * 0.15,
  ];

  return stepCandidates.find((value) => Number.isFinite(value) && value !== 0) ?? 0.2;
};

export const getResponsiveFontValue = (
  fontSize: FontSizeOption,
  baseValues: Record<FontSizeOption, number>,
  isMobile: boolean
) => {
  if (!isMobile) {
    return baseValues[fontSize];
  }

  const currentIndex = FONT_SIZE_SEQUENCE.indexOf(fontSize);
  const shiftedIndex = currentIndex + MOBILE_SHIFT_STEPS;
  const lastIndex = FONT_SIZE_SEQUENCE.length - 1;

  if (shiftedIndex <= lastIndex) {
    const shiftedKey = FONT_SIZE_SEQUENCE[shiftedIndex];
    return baseValues[shiftedKey];
  }

  const extraStepsBeyond = shiftedIndex - lastIndex;
  const step = getStepSize(baseValues);
  const lastValue = baseValues[FONT_SIZE_SEQUENCE[lastIndex]];

  return lastValue + step * extraStepsBeyond;
};


