import { useEffect, useState, useRef, RefObject } from 'react';
import type { CSSProperties } from 'react';
import type { FontSizeOption } from '../utils/fontSize';
import { COLORS, Z_INDEX } from '../styles/constants';
import { hexToRgba } from '../utils/color';
import { fuzzyMatchScore } from '../utils/fuzzyMatch';
import { FONT_PREVIEW_SIZES, FONT_SIZE_OPTIONS } from './commandPaletteConfig';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  scrollSettings: {
    invertX: boolean;
    invertY: boolean;
  };
  onScrollSettingsChange: (settings: { invertX: boolean; invertY: boolean }) => void;
  fontSize: FontSizeOption;
  onFontSizeChange: (size: FontSizeOption) => void;
  fogOfWarEnabled: boolean;
  onFogOfWarToggle: (enabled: boolean) => void;
  triggerRef?: RefObject<HTMLElement>;
  accentColor?: string;
  isMobile?: boolean;
}

type CommandItem = {
  id: string;
  label: string;
  type: 'category' | 'action';
  action?: () => void;
  children?: CommandItem[];
};

const DEFAULT_ACCENT_COLOR = COLORS.defaultAccent;

const getPaletteContainerStyle = (
  isMobile: boolean,
  mobileAnchor: { bottom: number; right: number },
  accent: string,
  accentRgba: (alpha: number) => string
): CSSProperties => ({
  position: 'fixed',
  top: isMobile ? 'auto' : '80px',
  bottom: isMobile ? `${mobileAnchor.bottom}px` : 'auto',
  right: isMobile ? `${mobileAnchor.right}px` : '20px',
  left: 'auto',
  width: isMobile ? 'min(520px, calc(100% - 32px))' : '500px',
  maxWidth: isMobile ? 'min(520px, calc(100% - 32px))' : '500px',
  maxHeight: isMobile ? '70vh' : '500px',
  backgroundColor: COLORS.panelBackgroundSolid,
  border: `2px solid ${accent}`,
  borderRadius: isMobile ? '12px' : '8px',
  boxShadow: isMobile
    ? `0 -8px 32px ${accentRgba(0.25)}, 0 -2px 20px ${accentRgba(0.2)}`
    : `0 8px 32px ${accentRgba(0.3)}, 0 0 60px ${accentRgba(0.15)}`,
  overflow: 'hidden',
  zIndex: Z_INDEX.commandPalette,
  animation: 'commandPaletteSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  transformOrigin: isMobile ? 'bottom right' : 'top right',
  display: 'flex',
  flexDirection: 'column',
});

const getCommandListContainerStyle = (isMobile: boolean): CSSProperties => ({
  flex: isMobile ? 1 : undefined,
  maxHeight: isMobile ? '50vh' : '400px',
  overflowY: 'auto',
  overflowX: 'hidden',
});

const getSearchSectionStyle = (
  placement: 'top' | 'bottom',
  isMobile: boolean,
  accentRgba: (alpha: number) => string
): CSSProperties => ({
  padding: '16px',
  paddingTop: placement === 'bottom' && isMobile ? '12px' : '16px',
  paddingBottom:
    placement === 'bottom' && isMobile
      ? 'calc(12px + env(safe-area-inset-bottom, 0px))'
      : '16px',
  borderBottom: !isMobile && placement === 'top' ? `1px solid ${accentRgba(0.3)}` : 'none',
  borderTop: isMobile && placement === 'bottom' ? `1px solid ${accentRgba(0.3)}` : 'none',
  backgroundColor: 'transparent',
});

const getSearchInputStyle = (
  accent: string,
  accentRgba: (alpha: number) => string,
  isFocused: boolean
): CSSProperties => ({
  width: '100%',
  padding: '12px 16px',
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  border: `1px solid ${isFocused ? accent : accentRgba(0.4)}`,
  boxShadow: isFocused ? `0 0 0 2px ${accentRgba(0.2)}` : 'none',
  borderRadius: '6px',
  color: accent,
  fontSize: '16px',
  outline: 'none',
  fontFamily: 'inherit',
});

export const CommandPalette = ({
  isOpen,
  onClose,
  scrollSettings,
  onScrollSettingsChange,
  fontSize,
  onFontSizeChange,
  fogOfWarEnabled,
  onFogOfWarToggle,
  triggerRef,
  accentColor = DEFAULT_ACCENT_COLOR,
  isMobile = false,
}: CommandPaletteProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [mobileAnchor, setMobileAnchor] = useState({ bottom: 24, right: 16 });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const accent = accentColor ?? DEFAULT_ACCENT_COLOR;
  const accentRgba = (alpha: number) => hexToRgba(accent, alpha);

  // Define available commands
  const settingsChildren: CommandItem[] = [
    {
      id: 'font-size',
      label: 'Font Size',
      type: 'action',
    },
    {
      id: 'fog-of-war',
      label: `${fogOfWarEnabled ? '✓ ' : ''}Fog of War`,
      type: 'action',
      action: () => onFogOfWarToggle(!fogOfWarEnabled),
    },
  ];

  // Only add axis inversion options on desktop
  if (!isMobile) {
    settingsChildren.push(
      {
        id: 'invert-x',
        label: `${scrollSettings.invertX ? '✓ ' : ''}Invert X-Axis Scroll`,
        type: 'action',
        action: () => onScrollSettingsChange({ ...scrollSettings, invertX: !scrollSettings.invertX }),
      },
      {
        id: 'invert-y',
        label: `${scrollSettings.invertY ? '✓ ' : ''}Invert Y-Axis Scroll`,
        type: 'action',
        action: () => onScrollSettingsChange({ ...scrollSettings, invertY: !scrollSettings.invertY }),
      },
      {
        id: 'invert-both',
        label: `${scrollSettings.invertX && scrollSettings.invertY ? '✓ ' : ''}Invert Both Axes`,
        type: 'action',
        action: () => {
          const bothInverted = scrollSettings.invertX && scrollSettings.invertY;
          onScrollSettingsChange({ invertX: !bothInverted, invertY: !bothInverted });
        },
      }
    );
  }

  const commands: CommandItem[] = [
    {
      id: 'settings',
      label: 'Settings',
      type: 'category',
      children: settingsChildren,
    },
  ];

  // Flatten commands for display
  const getFlattenedCommands = () => {
    const flattened: (CommandItem & { depth: number; parentId?: string; score?: number })[] = [];
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const hasQuery = trimmedQuery.length > 0;

    commands.forEach(cmd => {
      const parentScore = hasQuery ? fuzzyMatchScore(cmd.label, trimmedQuery) : 0;
      const parentMatches = !hasQuery || parentScore >= 0;

      let childrenMatch = false;
      const matchingChildren: (CommandItem & { score: number })[] = [];

      if (cmd.children) {
        cmd.children.forEach(child => {
          const childScore = hasQuery ? fuzzyMatchScore(child.label, trimmedQuery) : 0;
          if (!hasQuery || childScore >= 0) {
            childrenMatch = true;
            matchingChildren.push({ ...child, score: childScore });
          }
        });
      }

      if (parentMatches || childrenMatch) {
        flattened.push({ ...cmd, depth: 0, score: parentScore });

        if (cmd.children && (expandedCategories.has(cmd.id) || hasQuery)) {
          const childrenToShow = hasQuery
            ? matchingChildren.sort((a, b) => b.score - a.score)
            : cmd.children.map(child => ({ ...child, score: 0 }));

          childrenToShow.forEach(child => {
            flattened.push({ ...child, depth: 1, parentId: cmd.id, score: child.score });
          });
        }
      }
    });

    return flattened;
  };

  const visibleCommands = getFlattenedCommands();

  // Focus input when opened (but not on mobile to prevent keyboard)
  useEffect(() => {
    if (isOpen && inputRef.current && !isMobile) {
      inputRef.current.focus();
      setSearchQuery('');
      setSelectedIndex(0);
    } else if (isOpen) {
      // On mobile, just reset state without focusing
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen, isMobile]);

  // Close when clicking/touching outside without blocking map interactions
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!paletteRef.current) return;
      const targetNode = event.target as Node;
      if (triggerRef?.current && triggerRef.current.contains(targetNode)) {
        return;
      }
      if (!paletteRef.current.contains(targetNode)) {
        onClose();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!paletteRef.current) return;
      const targetNode = event.target as Node;
      if (triggerRef?.current && triggerRef.current.contains(targetNode)) {
        return;
      }
      if (!paletteRef.current.contains(targetNode)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('touchstart', handleTouchStart, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('touchstart', handleTouchStart, true);
    };
  }, [isOpen, onClose, triggerRef]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (visibleCommands.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % visibleCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + visibleCommands.length) % visibleCommands.length);
          break;
        case 'Enter':
          e.preventDefault();
          const selected = visibleCommands[selectedIndex];
          if (selected) {
            if (selected.type === 'category') {
              toggleCategory(selected.id);
            } else if (selected.action) {
              selected.action();
              // Don't close for settings changes
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
          e.preventDefault();
          const selectedRight = visibleCommands[selectedIndex];
          if (selectedRight?.id === 'font-size') {
            // Cycle font size forward
            const currentIndex = FONT_SIZE_OPTIONS.indexOf(fontSize);
            const nextIndex = (currentIndex + 1) % FONT_SIZE_OPTIONS.length;
            onFontSizeChange(FONT_SIZE_OPTIONS[nextIndex]);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const selectedLeft = visibleCommands[selectedIndex];
          if (selectedLeft?.id === 'font-size') {
            // Cycle font size backward
            const currentIndex = FONT_SIZE_OPTIONS.indexOf(fontSize);
            const prevIndex = (currentIndex - 1 + FONT_SIZE_OPTIONS.length) % FONT_SIZE_OPTIONS.length;
            onFontSizeChange(FONT_SIZE_OPTIONS[prevIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, visibleCommands]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const renderSearchSection = (placement: 'top' | 'bottom') => (
    <div style={getSearchSectionStyle(placement, isMobile, accentRgba)}>
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search commands..."
        style={getSearchInputStyle(accent, accentRgba, isSearchFocused)}
        onFocus={() => setIsSearchFocused(true)}
        onBlur={() => setIsSearchFocused(false)}
      />
    </div>
  );

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return;

    const updateAnchor = () => {
      if (!triggerRef?.current) {
        setMobileAnchor({ bottom: 24, right: 16 });
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const gap = 12;
      const minMargin = 12;

      setMobileAnchor({
        bottom: Math.max(window.innerHeight - rect.top + gap, minMargin),
        right: Math.max(window.innerWidth - rect.right, minMargin),
      });
    };

    updateAnchor();

    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);

    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [isMobile, isOpen, triggerRef]);

  if (!isOpen) return null;

  return (
    <>
      {/* Command Palette */}
      <div
        ref={paletteRef}
        style={getPaletteContainerStyle(isMobile, mobileAnchor, accent, accentRgba)}
      >
        {!isMobile && renderSearchSection('top')}

        {/* Command List */}
        <div style={getCommandListContainerStyle(isMobile)}>
          {visibleCommands.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: accentRgba(0.5),
                fontSize: '14px',
              }}
            >
              No commands found
            </div>
          ) : (
            visibleCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                onClick={() => {
                  if (cmd.type === 'category') {
                    toggleCategory(cmd.id);
                  } else if (cmd.action) {
                    cmd.action();
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '12px 16px',
                  paddingLeft: `${16 + cmd.depth * 24}px`,
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex 
                    ? accentRgba(0.2) 
                    : 'transparent',
                  color: index === selectedIndex ? accent : accentRgba(0.8),
                  fontSize: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontWeight: cmd.type === 'category' ? 600 : 400 }}>
                  {cmd.label}
                </span>
                {cmd.type === 'category' && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: accentRgba(0.6),
                      transform: expandedCategories.has(cmd.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    ▶
                  </span>
                )}
                {cmd.id === 'font-size' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {FONT_SIZE_OPTIONS.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onFontSizeChange(size);
                        }}
                        aria-pressed={fontSize === size}
                        aria-label={`Switch to ${size} font size`}
                      style={{
                          fontSize: FONT_PREVIEW_SIZES[size],
                          fontWeight: fontSize === size ? 700 : 400,
                          color: fontSize === size ? accent : accentRgba(0.5),
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          fontFamily: 'inherit',
                          lineHeight: 1,
                          cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      Aa
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {isMobile && renderSearchSection('bottom')}

        {/* Footer with shortcuts hint - hidden on mobile */}
        {!isMobile && (
          <div
            style={{
              padding: '8px 16px',
              borderTop: `1px solid ${accentRgba(0.3)}`,
              fontSize: '11px',
              color: accentRgba(0.5),
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>↑↓ Navigate</span>
            <span>← → Adjust</span>
            <span>↵ Select/Expand</span>
            <span>ESC Close</span>
          </div>
        )}
      </div>
    </>
  );
};
