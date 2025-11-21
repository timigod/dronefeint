import { useCallback, useEffect, useRef, useState } from 'react';
import type { FontSizeOption } from '../utils/fontSize';

export const FONT_SIZE_STORAGE_KEY = 'dronefeint-font-size';
export const DEFAULT_FONT_SIZE: FontSizeOption = 'small';

const getStoredFontSize = (): FontSizeOption => {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_SIZE;
  }
  const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return stored === 'small' || stored === 'medium' || stored === 'large' ? stored : DEFAULT_FONT_SIZE;
};

export const useFontSizeSetting = () => {
  const [fontSize, setFontSizeState] = useState<FontSizeOption>(() => getStoredFontSize());
  const fontSizeRef = useRef(fontSize);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  const setFontSize = useCallback((next: FontSizeOption) => {
    setFontSizeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    }
  }, []);

  return {
    fontSize,
    fontSizeRef,
    setFontSize,
  };
};
