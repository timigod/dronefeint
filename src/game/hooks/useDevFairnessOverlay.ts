import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dev-fairness-overlay-visible';

const getDefaultVisibility = () => {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return true;
  const cached = localStorage.getItem(STORAGE_KEY);
  return cached !== null ? cached === 'true' : true;
};

export const useDevFairnessOverlay = () => {
  const [isVisible, setIsVisible] = useState(() => getDefaultVisibility());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleToggle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleToggle);
    return () => window.removeEventListener('keydown', handleToggle);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(isVisible));
  }, [isVisible]);

  return {
    isVisible,
    setIsVisible,
  };
};
