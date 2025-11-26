import { useMemo, useState } from 'react';
import type React from 'react';
import { COLORS, Z_INDEX } from '../styles/constants';

interface CommandPaletteButtonProps {
  accentColor: string;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  isMobile: boolean;
}

export const CommandPaletteButton = ({
  accentColor,
  isOpen,
  onToggle,
  triggerRef,
  isMobile,
}: CommandPaletteButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const style = useMemo<React.CSSProperties>(() => {
    const isHoverActive = isHovered && !isOpen;
    const transform = isOpen ? (isMobile ? 'rotate(90deg)' : 'rotate(-90deg)') : isHoverActive ? 'scale(1.05) rotate(0deg)' : 'rotate(0deg)';

    return {
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? 'auto' : '20px',
      bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 36px)' : 'auto',
      right: isMobile ? 'calc(env(safe-area-inset-right, 0px) + 16px)' : '20px',
      width: '44px',
      height: '44px',
      backgroundColor: isHoverActive ? `${accentColor}33` : COLORS.panelBackground,
      border: `2px solid ${accentColor}`,
      borderRadius: '8px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: `0 4px 12px ${accentColor}55`,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      transform,
      zIndex: Z_INDEX.commandPaletteButton,
    };
  }, [accentColor, isHovered, isMobile, isOpen]);

  return (
    <button
      ref={triggerRef}
      onClick={onToggle}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      title="Command Palette (Cmd+K)"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={accentColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="3" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="3" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21" y2="12" />
      </svg>
    </button>
  );
};
