export interface ViewportSize {
  width: number;
  height: number;
}

const VIEWPORT_SCALE = 1;

export const getViewportScale = () => {
  if (typeof window === 'undefined') {
    return VIEWPORT_SCALE;
  }
  return VIEWPORT_SCALE;
};

export const getViewportSize = (): ViewportSize => {
  const scale = getViewportScale();

  if (typeof window === 'undefined') {
    const fallbackWidth = Math.round(1280 * scale);
    const fallbackHeight = Math.round(720 * scale);
    return { width: fallbackWidth, height: fallbackHeight };
  }

  return {
    width: Math.max(1, Math.round(window.innerWidth * scale)),
    height: Math.max(1, Math.round(window.innerHeight * scale)),
  };
};

export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  );
};
