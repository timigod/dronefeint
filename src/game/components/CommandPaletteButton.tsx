import type React from 'react';

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
  const baseStyle: React.CSSProperties = {
    position: isMobile ? 'fixed' : 'absolute',
    top: isMobile ? 'auto' : '20px',
    bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 36px)' : 'auto',
    right: isMobile ? 'calc(env(safe-area-inset-right, 0px) + 16px)' : '20px',
    width: '44px',
    height: '44px',
    backgroundColor: 'rgba(20, 10, 15, 0.8)',
    border: `2px solid ${accentColor}`,
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 4px 12px ${accentColor}55`,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: isOpen ? (isMobile ? 'rotate(90deg)' : 'rotate(-90deg)') : 'rotate(0deg)',
    zIndex: 120,
  };

  return (
    <button
      ref={triggerRef}
      onClick={onToggle}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!isOpen) {
          e.currentTarget.style.backgroundColor = `${accentColor}33`;
          e.currentTarget.style.transform = 'scale(1.05) rotate(0deg)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isOpen) {
          e.currentTarget.style.backgroundColor = 'rgba(20, 10, 15, 0.8)';
          e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
        }
      }}
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
