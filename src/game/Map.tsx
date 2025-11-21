import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Landmass } from './types';
import { CommandPalette } from './CommandPalette';
import { Structure, drawStructure, drawDroneCount } from './structures';
import { Minimap } from './Minimap';
import { TooltipOverlay } from './TooltipOverlay';
import { useMapTextures } from './hooks/useMapTextures';
import { useDragPan } from './hooks/useDragPan';
import { useStructureHover } from './hooks/useStructureHover';
import {
  GRID_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
} from './mapConstants';
import { generateLandmasses } from './worldgen/landmasses';
import { wrap } from './utils/math';
import { drawGlyphText, measureGlyphText, GLYPH_HEIGHT } from './glyphs';
import { generateStartingScenario, Player } from './scenarios/startingScenario';
import { DevFairnessOverlay } from './DevFairnessOverlay';
import type { FontSizeOption } from './utils/fontSize';
import { getResponsiveFontValue } from './utils/fontSize';

const VIEWPORT_SCALE = 1;

const getViewportScale = () => {
  if (typeof window === 'undefined') {
    return VIEWPORT_SCALE;
  }
  return VIEWPORT_SCALE;
};

const getViewportSize = () => {
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

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         window.innerWidth <= 768;
};

const FONT_SIZE_STORAGE_KEY = 'dronefeint-font-size';
const DEFAULT_FONT_SIZE: FontSizeOption = 'small';

const getStoredFontSize = (): FontSizeOption => {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_SIZE;
  }
  const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return stored === 'small' || stored === 'medium' || stored === 'large' ? stored : DEFAULT_FONT_SIZE;
};

const getStructureClusterCenter = (structures: Structure[]) => {
  if (structures.length === 0) {
    return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  }

  const bounds = structures.reduce(
    (acc, structure) => ({
      minX: Math.min(acc.minX, structure.x),
      maxX: Math.max(acc.maxX, structure.x),
      minY: Math.min(acc.minY, structure.y),
      maxY: Math.max(acc.maxY, structure.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
};

export const Map = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const structuresCanvasRef = useRef<HTMLCanvasElement>(null);
  const scenario = useMemo(() => generateStartingScenario(), []);
  const [structures] = useState<Structure[]>(scenario.structures);
  const [players] = useState<Player[]>(scenario.players);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(scenario.activePlayerIndex);
  const activePlayer = players[activePlayerIndex] ?? players[0];
  const accentColor = activePlayer?.color ?? '#dc3545';
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const viewportSizeRef = useRef(viewportSize);
  viewportSizeRef.current = viewportSize;
  const previousViewportRef = useRef(viewportSize);
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;

  const {
    offset,
    setOffset,
    isDragging,
    isMomentum,
    beginDrag,
    updateDrag,
    endDrag,
    nudgeOffset,
  } = useDragPan({ x: 0, y: 0 });
  const [landmasses] = useState<Landmass[]>(generateLandmasses);
  const {
    terrainTexture,
    waterTexture,
    minimapTexture,
    terrainReady,
    waterReady,
    minimapReady,
  } = useMapTextures(landmasses);
  const { hoveredStructure, updateHover, clearHover } = useStructureHover(structures);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [scrollSettings, setScrollSettings] = useState({ invertX: false, invertY: false });
  const [fontSize, setFontSizeState] = useState<FontSizeOption>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_FONT_SIZE;
    }
    return getStoredFontSize();
  });
  const setFontSize = useCallback((next: FontSizeOption) => {
    setFontSizeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    }
  }, []);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const fontSizeRef = useRef(fontSize);
  const isReady = terrainReady && waterReady && minimapReady;
  const terrainDirtyRef = useRef(true);
  const gridDirtyRef = useRef(true);
  const structuresDirtyRef = useRef(true);
  const lastStructuresDrawRef = useRef(0);
  const gridPatternRef = useRef<CanvasPattern | null>(null);
  const commandPaletteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isFairnessOverlayVisible, setFairnessOverlayVisible] = useState(() => {
    if (!import.meta.env.DEV) return false;
    if (typeof window === 'undefined') return true;
    const cached = localStorage.getItem('dev-fairness-overlay-visible');
    return cached !== null ? cached === 'true' : true;
  });
  const [isMobile] = useState(() => isMobileDevice());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let animationFrameId: number | null = null;

    const handleResize = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        setViewportSize((prev) => {
          const next = getViewportSize();
          if (prev.width === next.width && prev.height === next.height) {
            return prev;
          }
          return next;
        });
      });
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const prev = previousViewportRef.current;

    if (!viewportWidth || !viewportHeight) {
      previousViewportRef.current = viewportSize;
      return;
    }

    if (prev.width === viewportWidth && prev.height === viewportHeight) {
      return;
    }

    previousViewportRef.current = viewportSize;

    if (!prev.width || !prev.height) {
      return;
    }

    setOffset((currentOffset) => {
      const centerX = currentOffset.x + prev.width / 2;
      const centerY = currentOffset.y + prev.height / 2;
      return {
        x: centerX - viewportWidth / 2,
        y: centerY - viewportHeight / 2,
      };
    });
  }, [setOffset, viewportHeight, viewportSize, viewportWidth]);

  const recenterOnActivePlayer = useCallback(() => {
    const { width, height } = viewportSizeRef.current;
    if (!width || !height) return;
    const owned = structures.filter((s) => s.ownerId === activePlayer?.id);
    const center = getStructureClusterCenter(owned.length ? owned : structures);
    setOffset({
      x: center.x - width / 2,
      y: center.y - height / 2,
    });
  }, [activePlayer?.id, setOffset, structures]);

  useEffect(() => {
    recenterOnActivePlayer();
  }, [recenterOnActivePlayer]);

  useEffect(() => {
    offsetRef.current = offset;
    terrainDirtyRef.current = true;
    gridDirtyRef.current = true;
    structuresDirtyRef.current = true;
  }, [offset]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    structuresDirtyRef.current = true;
  }, [fontSize]);

  useEffect(() => {
    terrainDirtyRef.current = true;
    gridDirtyRef.current = true;
    structuresDirtyRef.current = true;
  }, [viewportHeight, viewportWidth]);

  useEffect(() => {
    if (terrainReady || waterReady) {
      terrainDirtyRef.current = true;
    }
  }, [terrainReady, waterReady]);

  useEffect(() => {
    structuresDirtyRef.current = true;
  }, [structures]);

  // Keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Temporarily disable native context menu (right-click)
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', preventContextMenu);
    return () => window.removeEventListener('contextmenu', preventContextMenu);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleToggle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFairnessOverlayVisible((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleToggle);
    return () => window.removeEventListener('keydown', handleToggle);
  }, []);

  // Cache visibility state to localStorage
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    localStorage.setItem('dev-fairness-overlay-visible', String(isFairnessOverlayVisible));
  }, [isFairnessOverlayVisible]);

  if (!scenario || !structures.length || !players.length) {
    return (
      <div
        style={{
        width: viewportWidth || '100vw',
        height: viewportHeight || '100vh',
          backgroundColor: '#050505',
          color: '#ff6b7a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: '0.15em',
          fontSize: '14px',
        }}
      >
        Initializing battlefield...
      </div>
    );
  }

  const drawTerrainAndWater = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !terrainReady || !terrainTexture) return;

    const { width: viewportWidth, height: viewportHeight } = viewportSizeRef.current;
    if (!viewportWidth || !viewportHeight) return;

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const wrappedOffsetX = wrap(offsetRef.current.x, MAP_WIDTH);
    const wrappedOffsetY = wrap(offsetRef.current.y, MAP_HEIGHT);
    const startX = -wrappedOffsetX;
    const startY = -wrappedOffsetY;

    if (waterReady && waterTexture) {
      const water = waterTexture;
      for (let x = startX; x < canvas.width; x += MAP_WIDTH) {
        for (let y = startY; y < canvas.height; y += MAP_HEIGHT) {
          ctx.drawImage(water, x, y);
        }
      }
    }

    const terrain = terrainTexture;
    if (terrain) {
      for (let x = startX; x < canvas.width; x += MAP_WIDTH) {
        for (let y = startY; y < canvas.height; y += MAP_HEIGHT) {
          ctx.drawImage(terrain, x, y);
        }
      }
    }
  }, [terrainReady, terrainTexture, waterReady, waterTexture]);

  const drawGrid = useCallback(() => {
    const gridCanvas = gridCanvasRef.current;
    if (!gridCanvas) return;

    const { width: viewportWidth, height: viewportHeight } = viewportSizeRef.current;
    if (!viewportWidth || !viewportHeight) return;

    gridCanvas.width = viewportWidth;
    gridCanvas.height = viewportHeight;

    const ctx = gridCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

    if (!gridPatternRef.current) {
      const tile = document.createElement('canvas');
      tile.width = GRID_SIZE;
      tile.height = GRID_SIZE;
      const tileCtx = tile.getContext('2d');
      if (!tileCtx) return;
      tileCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      tileCtx.fillRect(0, 0, 1, GRID_SIZE);
      tileCtx.fillRect(0, 0, GRID_SIZE, 1);
      gridPatternRef.current = ctx.createPattern(tile, 'repeat');
    }

    const wrappedOffsetX = wrap(offsetRef.current.x, MAP_WIDTH);
    const wrappedOffsetY = wrap(offsetRef.current.y, MAP_HEIGHT);
    const translateX = -(wrappedOffsetX % GRID_SIZE);
    const translateY = -(wrappedOffsetY % GRID_SIZE);

    ctx.save();
    ctx.translate(translateX, translateY);
    if (gridPatternRef.current) {
      ctx.fillStyle = gridPatternRef.current;
      ctx.fillRect(-translateX, -translateY, gridCanvas.width, gridCanvas.height);
    }
    ctx.restore();
  }, []);

  const drawStructures = useCallback(
    (time: number) => {
      const structuresCanvas = structuresCanvasRef.current;
      if (!structuresCanvas) return;

      const { width: viewportWidth, height: viewportHeight } = viewportSizeRef.current;
      if (!viewportWidth || !viewportHeight) return;

      structuresCanvas.width = viewportWidth;
      structuresCanvas.height = viewportHeight;

      const ctx = structuresCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, structuresCanvas.width, structuresCanvas.height);

      const wrappedOffsetX = wrap(offsetRef.current.x, MAP_WIDTH);
      const wrappedOffsetY = wrap(offsetRef.current.y, MAP_HEIGHT);

      for (let tileX = -1; tileX <= 1; tileX++) {
        for (let tileY = -1; tileY <= 1; tileY++) {
          const tileOffsetX = tileX * MAP_WIDTH;
          const tileOffsetY = tileY * MAP_HEIGHT;
          const tileStartX = -wrappedOffsetX + tileOffsetX;
          const tileStartY = -wrappedOffsetY + tileOffsetY;

          if (tileStartX > viewportWidth || tileStartX + MAP_WIDTH < 0) continue;
          if (tileStartY > viewportHeight || tileStartY + MAP_HEIGHT < 0) continue;

          structures.forEach((structure) => {
            const structureScreenX = structure.x + tileStartX;
            const structureScreenY = structure.y + tileStartY;

            const maxSize = structure.size * 2;
            if (
              structureScreenX < -maxSize ||
              structureScreenX > viewportWidth + maxSize ||
              structureScreenY < -maxSize ||
              structureScreenY > viewportHeight + maxSize
            ) {
              return;
            }

            drawStructure(ctx, structure, tileStartX, tileStartY, time);
            drawDroneCount(
              ctx,
              structure,
              tileStartX,
              tileStartY,
              fontSizeRef.current,
              isMobile
            );

            if (structure.label) {
              const labelScaleMap: Record<FontSizeOption, number> = {
                small: 1.35,
                medium: 1.6,
                large: 1.85,
              };
              const labelSpacingMap: Record<Structure['type'], number> = {
                hq: 12,
                foundry: 12,
                reactor: 14,
                extractor: 12,
              };
              const labelAnchorMultiplierMap: Record<Structure['type'], number> = {
                hq: 2.6,
                foundry: 1,
                reactor: 1,
                extractor: 1,
              };
              const scale = getResponsiveFontValue(fontSizeRef.current, labelScaleMap, isMobile);
              const spacing = labelSpacingMap[structure.type] ?? 10;
              const anchorMultiplier = labelAnchorMultiplierMap[structure.type] ?? 1;
              const anchorOffset = structure.size * anchorMultiplier;
              const text = structure.label.toUpperCase();
              const textWidth = measureGlyphText(text, scale);
              const textHeight = GLYPH_HEIGHT * scale;
              const textX = structureScreenX - textWidth / 2;
              const textY = structureScreenY - anchorOffset - textHeight - spacing;

              ctx.fillStyle = 'rgba(0,0,0,0.85)';
              ctx.fillRect(textX - 3, textY - 2, textWidth + 6, textHeight + 4);

              const r = parseInt(structure.playerColor.slice(1, 3), 16);
              const g = parseInt(structure.playerColor.slice(3, 5), 16);
              const b = parseInt(structure.playerColor.slice(5, 7), 16);
              drawGlyphText(ctx, text, textX, textY, r, g, b, scale);
            }
          });
        }
      }
    },
    [structures, isMobile]
  );

  useEffect(() => {
    let rafId: number;

    const render = (time: number) => {
      if (terrainDirtyRef.current) {
        drawTerrainAndWater();
        terrainDirtyRef.current = false;
      }

      if (gridDirtyRef.current) {
        drawGrid();
        gridDirtyRef.current = false;
      }

      const intervalMs = isDragging || isMomentum ? 16 : 33;
      if (structuresDirtyRef.current || time - lastStructuresDrawRef.current >= intervalMs) {
        drawStructures(time);
        structuresDirtyRef.current = false;
        lastStructuresDrawRef.current = time;
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [drawGrid, drawStructures, drawTerrainAndWater, isDragging, isMomentum]);

  // Minimap is rendered through dedicated component

  // Mouse event handlers for dragging/scrolling
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = toCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    beginDrag(coords.x, coords.y);
    clearHover();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = toCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    setMousePos(coords);

    if (isDragging) {
      clearHover();
      updateDrag(coords.x, coords.y);
    } else {
      updateHover({ clientX: coords.x, clientY: coords.y, offset });
    }
  };

  const handleMouseUp = () => {
    endDrag();
  };

  const touchStartPosRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const touchCanvasStartRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDraggingRef = useRef(false);
  const touchLastHoveredRef = useRef<Structure | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const coords = toCanvasCoords(touch.clientX, touch.clientY);
    
    // Store initial touch position and time for tap detection
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      offset: { ...offset },
    };
    touchCanvasStartRef.current = coords ? { x: coords.x, y: coords.y } : null;
    touchStartTimeRef.current = Date.now();
    isTouchDraggingRef.current = false;
    
    // Always clear hover on touch start - we'll show it on touch end if it was a tap
    touchLastHoveredRef.current = hoveredStructure;
    clearHover();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const coords = toCanvasCoords(touch.clientX, touch.clientY);
    if (coords) {
      setMousePos(coords);
    }

    const start = touchStartPosRef.current;
    const moveThreshold = 10; // pixels
    const exceededThreshold =
      start && (Math.abs(touch.clientX - start.x) > moveThreshold || Math.abs(touch.clientY - start.y) > moveThreshold);

    if (!isTouchDraggingRef.current && exceededThreshold) {
      isTouchDraggingRef.current = true;
      clearHover();
      const startCoords = touchCanvasStartRef.current ?? coords;
      if (startCoords) {
        beginDrag(startCoords.x, startCoords.y);
      }
    }

    if (isTouchDraggingRef.current && coords) {
      updateDrag(coords.x, coords.y);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const start = touchStartPosRef.current;
    if (!touch || !start) {
      isTouchDraggingRef.current = false;
      touchStartPosRef.current = null;
      touchCanvasStartRef.current = null;
      endDrag();
      return;
    }
    
    // Check if this was a tap (not a drag)
    if (!isTouchDraggingRef.current) {
      const timeDiff = Date.now() - touchStartTimeRef.current;
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      const tapThreshold = 10; // pixels
      const tapTimeThreshold = 300; // ms
      
      if (timeDiff < tapTimeThreshold && deltaX < tapThreshold && deltaY < tapThreshold) {
        // This was a tap - trigger hover effect
        const coords = toCanvasCoords(touch.clientX, touch.clientY);
        if (coords) {
          setMousePos(coords);
          const tappedStructure = updateHover({ clientX: coords.x, clientY: coords.y, offset });
          const previouslyHovered = touchLastHoveredRef.current;

          if (tappedStructure && previouslyHovered && tappedStructure.id === previouslyHovered.id) {
            clearHover();
            touchLastHoveredRef.current = null;
          } else {
            touchLastHoveredRef.current = tappedStructure ?? null;
          }
        }
      }
    }
    
    isTouchDraggingRef.current = false;
    touchStartPosRef.current = null;
    touchCanvasStartRef.current = null;
    endDrag();
  };

  const handleTouchCancel = () => {
    // Keep behavior consistent with touch end, prevent default browser highlights
    // and fully reset drag state.
    isTouchDraggingRef.current = false;
    touchStartPosRef.current = null;
    touchCanvasStartRef.current = null;
    endDrag();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    clearHover();
    const xMultiplier = scrollSettings.invertX ? 1 : -1;
    const yMultiplier = scrollSettings.invertY ? 1 : -1;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const scaleX = canvas && rect?.width ? canvas.width / rect.width : 1;
    const scaleY = canvas && rect?.height ? canvas.height / rect.height : 1;
    nudgeOffset(e.deltaX * xMultiplier * scaleX, e.deltaY * yMultiplier * scaleY);
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : hoveredStructure ? 'pointer' : 'grab',
        position: 'relative',
        backgroundColor: '#050505',
      }}
    >
      {!isReady && (
        <div className="map-loading-overlay">
          <div className="map-loading-panel">
            Loading map
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          touchAction: 'none',
        }}
      />
      <canvas
        ref={gridCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      <canvas
        ref={structuresCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />
      <TooltipOverlay
        hoveredStructure={hoveredStructure}
        mousePos={mousePos}
        fontSize={fontSize}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        isMobile={isMobile}
      />
      {!isMobile && (
        <Minimap
          offset={offset}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          structures={structures}
          minimapReady={minimapReady}
          minimapTexture={minimapTexture}
          onViewportChange={setOffset}
        />
      )}
      {import.meta.env.DEV && isFairnessOverlayVisible && !isMobile && <DevFairnessOverlay />}
    
    {/* Command Palette Trigger Button */}
    <button
      ref={commandPaletteButtonRef}
      onClick={() => setIsCommandPaletteOpen((prev) => !prev)}
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : '20px',
        bottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom, 0px))' : 'auto',
        right: '20px',
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
        transform: isCommandPaletteOpen
          ? isMobile
            ? 'rotate(90deg)'
            : 'rotate(-90deg)'
          : 'rotate(0deg)',
        zIndex: 120,
      }}
      onMouseEnter={(e) => {
        if (!isCommandPaletteOpen) {
          e.currentTarget.style.backgroundColor = `${accentColor}33`;
          e.currentTarget.style.transform = 'scale(1.05) rotate(0deg)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isCommandPaletteOpen) {
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

    {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        scrollSettings={scrollSettings}
        onScrollSettingsChange={setScrollSettings}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        triggerRef={commandPaletteButtonRef}
        accentColor={accentColor}
        isMobile={isMobile}
      />
      {/* Player switcher */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          display: 'flex',
          gap: '10px',
          zIndex: 110,
        }}
      >
        {players.map((p, idx) => {
          const isActive = idx === activePlayerIndex;
          return (
            <button
              key={p.id}
              onClick={() => {
                setActivePlayerIndex(idx);
                // recentre on this player's cluster
                const owned = structures.filter((s) => s.ownerId === p.id);
                const c = getStructureClusterCenter(owned.length ? owned : structures);
                setOffset({
                  x: c.x - viewportWidth / 2,
                  y: c.y - viewportHeight / 2,
                });
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: `2px solid ${p.color}`,
                backgroundColor: isActive ? `${p.color}33` : 'rgba(20,20,25,0.6)',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
              title={`Switch to ${p.name}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
};
