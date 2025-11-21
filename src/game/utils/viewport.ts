export interface ViewportSize {
  width: number;
  height: number;
}

const DESKTOP_VIEWPORT_SCALE = 1;
const MOBILE_VIEWPORT_SCALE = 2; // default: show 2x more area on mobile

export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  );
};

export const getViewportScale = () => {
  if (typeof window === 'undefined') {
    return DESKTOP_VIEWPORT_SCALE;
  }
  return isMobileDevice() ? MOBILE_VIEWPORT_SCALE : DESKTOP_VIEWPORT_SCALE;
};

export const getViewportSize = (): ViewportSize => {
  const scale = getViewportScale();

  if (typeof window === 'undefined') {
    const fallbackWidth = Math.round(1280 * scale);
    const fallbackHeight = Math.round(720 * scale);
    return { width: fallbackWidth, height: fallbackHeight };
  }

  const visual = window.visualViewport;
  const width = visual?.width ?? window.innerWidth;
  const height = visual?.height ?? window.innerHeight;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
