import { useEffect, useState, useRef, RefObject } from 'react';

type FontSizeOption = 'small' | 'medium' | 'large';

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
  triggerRef?: RefObject<HTMLElement>;
  accentColor?: string;
}

type CommandItem = {
  id: string;
  label: string;
  type: 'category' | 'action';
  action?: () => void;
  children?: CommandItem[];
};

const FONT_SIZE_OPTIONS: FontSizeOption[] = ['small', 'medium', 'large'];
const FONT_PREVIEW_SIZES: Record<FontSizeOption, string> = {
  small: '11px',
  medium: '14px',
  large: '17px',
};

const DEFAULT_ACCENT_COLOR = '#dc3545';

const hexToRgba = (hex: string, alpha = 1) => {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) {
    return `rgba(220, 53, 69, ${alpha})`;
  }

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const fuzzyMatchScore = (text: string, query: string): number => {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  let score = 0;
  let haystackIndex = 0;

  for (let i = 0; i < needle.length; i++) {
    const char = needle[i];
    const foundIndex = haystack.indexOf(char, haystackIndex);
    if (foundIndex === -1) {
      return -1;
    }

    const distance = foundIndex - haystackIndex;
    score += distance === 0 ? 3 : Math.max(1.5 - distance * 0.1, 0.1);

    if (foundIndex === 0 || haystack[foundIndex - 1] === ' ') {
      score += 1;
    }

    haystackIndex = foundIndex + 1;
  }

  score += Math.min(2, needle.length / haystack.length);
  return score;
};

export const CommandPalette = ({
  isOpen,
  onClose,
  scrollSettings,
  onScrollSettingsChange,
  fontSize,
  onFontSizeChange,
  triggerRef,
  accentColor = DEFAULT_ACCENT_COLOR,
}: CommandPaletteProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const accent = accentColor ?? DEFAULT_ACCENT_COLOR;
  const accentRgba = (alpha: number) => hexToRgba(accent, alpha);

  // Define available commands
  const commands: CommandItem[] = [
    {
      id: 'settings',
      label: 'Settings',
      type: 'category',
      children: [
        {
          id: 'font-size',
          label: 'Font Size',
          type: 'action',
        },
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
        },
      ],
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

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Close when clicking outside without blocking map interactions
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

    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
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

  if (!isOpen) return null;

  return (
    <>
      {/* Command Palette */}
      <div
        ref={paletteRef}
        style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          width: '500px',
          maxHeight: '500px',
          backgroundColor: 'rgba(20, 10, 15, 0.95)',
          border: `2px solid ${accent}`,
          borderRadius: '8px',
          boxShadow: `0 8px 32px ${accentRgba(0.3)}, 0 0 60px ${accentRgba(0.15)}`,
          overflow: 'hidden',
          zIndex: 1000,
          animation: 'commandPaletteSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'top right',
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${accentRgba(0.3)}` }}>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands..."
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              border: `1px solid ${accentRgba(0.4)}`,
              borderRadius: '6px',
              color: accent,
              fontSize: '16px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => {
              e.target.style.border = `1px solid ${accent}`;
              e.target.style.boxShadow = `0 0 0 2px ${accentRgba(0.2)}`;
            }}
            onBlur={(e) => {
              e.target.style.border = `1px solid ${accentRgba(0.4)}`;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Command List */}
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
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
                  borderLeft: index === selectedIndex 
                    ? `3px solid ${accent}` 
                    : '3px solid transparent',
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
                      transform: expandedCategories.has(cmd.id) ? 'rotate(-90deg)' : 'rotate(0deg)',
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

        {/* Footer with shortcuts hint */}
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
      </div>
    </>
  );
};

