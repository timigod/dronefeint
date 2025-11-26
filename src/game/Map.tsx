import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { DevFairnessOverlay } from './components/DevFairnessOverlay';
import { FogOfWarOverlay } from './components/FogOfWarOverlay';
import { Minimap } from './components/Minimap';
import { TooltipOverlay } from './components/TooltipOverlay';
import { CommandPaletteButton } from './components/CommandPaletteButton';
import { PlayerSwitcher } from './components/PlayerSwitcher';
import { useDragPan } from './hooks/useDragPan';
import { useFogOfWar } from './hooks/useFogOfWar';
import { useFontSizeSetting } from './hooks/useFontSizeSetting';
import { useMapInteractions } from './hooks/useMapInteractions';
import { useMapRendering } from './hooks/useMapRendering';
import { useMapTextures } from './hooks/useMapTextures';
import { useStructureHover } from './hooks/useStructureHover';
import { useViewportSize } from './hooks/useViewportSize';
import { useCommandPaletteHotkey } from './hooks/useCommandPaletteHotkey';
import { useDevFairnessOverlay } from './hooks/useDevFairnessOverlay';
import { usePreventContextMenu } from './hooks/usePreventContextMenu';
import type { Player } from './scenarios/startingScenario';
import { generateStartingScenario } from './scenarios/startingScenario';
import type { Structure } from './structures';
import { COLORS, Z_INDEX } from './styles/constants';
import { getStructureClusterCenter } from './utils/structures';
import { getViewportScale, isMobileDevice } from './utils/viewport';
import { generateLandmasses } from './worldgen/landmasses';

const getLoadingStyle = (viewportWidth?: number, viewportHeight?: number): CSSProperties => ({
  width: viewportWidth || '100vw',
  height: viewportHeight || '100vh',
  backgroundColor: COLORS.background,
  color: '#ff6b7a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  letterSpacing: '0.15em',
  fontSize: '14px',
});

const getContainerStyle = (isDragging: boolean, hasHover: boolean, isMobile: boolean): CSSProperties => ({
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  cursor: isDragging ? 'grabbing' : hasHover ? 'pointer' : 'grab',
  position: 'relative',
  backgroundColor: COLORS.background,
  paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
});

const canvasBaseStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
};

const getMainCanvasStyle = (displayWidth: number, displayHeight: number): CSSProperties => ({
  ...canvasBaseStyle,
  width: `${displayWidth}px`,
  height: `${displayHeight}px`,
  zIndex: Z_INDEX.terrain,
  touchAction: 'none',
});

const getGridCanvasStyle = (displayWidth: number, displayHeight: number): CSSProperties => ({
  ...canvasBaseStyle,
  width: `${displayWidth}px`,
  height: `${displayHeight}px`,
  pointerEvents: 'none',
  zIndex: Z_INDEX.grid,
});

const getStructuresCanvasStyle = (displayWidth: number, displayHeight: number): CSSProperties => ({
  ...canvasBaseStyle,
  width: `${displayWidth}px`,
  height: `${displayHeight}px`,
  pointerEvents: 'none',
  zIndex: Z_INDEX.structures,
});

export const Map = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const structuresCanvasRef = useRef<HTMLCanvasElement>(null);
  const commandPaletteButtonRef = useRef<HTMLButtonElement | null>(null);

  const scenario = useMemo(() => generateStartingScenario(), []);
  const [structures] = useState<Structure[]>(scenario.structures);
  const [players] = useState<Player[]>(scenario.players);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(scenario.activePlayerIndex);
  const activePlayer = players[activePlayerIndex] ?? players[0];
  const accentColor = activePlayer?.color ?? COLORS.defaultAccent;

  const [scrollSettings, setScrollSettings] = useState({ invertX: false, invertY: false });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile] = useState(() => isMobileDevice());
  const [fogOfWarEnabled, setFogOfWarEnabled] = useState(true);
  const [gameTime, setGameTime] = useState(() => Date.now());
  const { fontSize, setFontSize } = useFontSizeSetting();
  const { isVisible: isFairnessOverlayVisible } = useDevFairnessOverlay();

  // Update game time periodically for fog of war "last seen" display
  useEffect(() => {
    if (!fogOfWarEnabled) return;
    const interval = setInterval(() => {
      setGameTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [fogOfWarEnabled]);

  // Fog of war state
  const { worldView, sonarCircles } = useFogOfWar({
    structures,
    playerId: activePlayer?.id,
    gameTime,
    enabled: fogOfWarEnabled,
  });

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

  const centerMapOnResize = useCallback(
    (prev: { width: number; height: number }, next: { width: number; height: number }) => {
      if (!prev.width || !prev.height) return;
      setOffset((currentOffset) => {
        const centerX = currentOffset.x + prev.width / 2;
        const centerY = currentOffset.y + prev.height / 2;
        return {
          x: centerX - next.width / 2,
          y: centerY - next.height / 2,
        };
      });
    },
    [setOffset]
  );

  const { viewportSize, viewportSizeRef } = useViewportSize({ onViewportChange: centerMapOnResize });
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  const viewportScale = getViewportScale();
  const displayWidth = viewportWidth / viewportScale;
  const displayHeight = viewportHeight / viewportScale;

  const landmasses = useMemo(() => generateLandmasses(), []);
  const {
    terrainTexture,
    waterTexture,
    minimapTexture,
    terrainReady,
    waterReady,
    minimapReady,
  } = useMapTextures(landmasses);
  const isReady = terrainReady && waterReady && minimapReady;

  const { hoveredStructure, updateHover, clearHover } = useStructureHover(structures);

  useMapRendering({
    canvasRef,
    gridCanvasRef,
    structuresCanvasRef,
    offset,
    viewportSize,
    structures,
    fontSize,
    isMobile,
    terrainTexture,
    waterTexture,
    terrainReady,
    waterReady,
    isDragging,
    isMomentum,
    fogOfWarEnabled,
    outpostViews: worldView.outposts,
    gameTime,
  });

  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleWheel,
  } = useMapInteractions({
    canvasRef,
    offset,
    isDragging,
    beginDrag,
    updateDrag,
    endDrag,
    clearHover,
    updateHover,
    setMousePos,
    nudgeOffset,
    scrollSettings,
    hoveredStructure,
  });

  const centerOnPlayer = useCallback(
    (playerId?: string) => {
      const { width, height } = viewportSizeRef.current;
      if (!width || !height) return;
      const owned = structures.filter((structure) => structure.ownerId === playerId);
      const center = getStructureClusterCenter(owned.length ? owned : structures);
      setOffset({
        x: center.x - width / 2,
        y: center.y - height / 2,
      });
    },
    [setOffset, structures, viewportSizeRef]
  );

  useEffect(() => {
    centerOnPlayer(activePlayer?.id);
  }, [activePlayer?.id, centerOnPlayer]);

  const handlePlayerSelect = useCallback(
    (index: number) => {
      setActivePlayerIndex(index);
      const player = players[index];
      centerOnPlayer(player?.id);
    },
    [centerOnPlayer, players]
  );

  const handlePaletteToggle = useCallback(() => setIsCommandPaletteOpen((prev) => !prev), []);

  useCommandPaletteHotkey(handlePaletteToggle);
  usePreventContextMenu();

  if (!scenario || !structures.length || !players.length) {
    return (
      <div style={getLoadingStyle(viewportWidth, viewportHeight)}>
        Initializing battlefield...
      </div>
    );
  }

  return (
    <div style={getContainerStyle(isDragging, !!hoveredStructure, isMobile)}>
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
        style={getMainCanvasStyle(displayWidth, displayHeight)}
      />
      <canvas
        ref={gridCanvasRef}
        style={getGridCanvasStyle(displayWidth, displayHeight)}
      />
      <FogOfWarOverlay
        offset={offset}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        sonarCircles={sonarCircles}
        playerColor={accentColor}
        enabled={fogOfWarEnabled}
        highlightedOutpostId={
          hoveredStructure?.ownerId === activePlayer?.id
            ? hoveredStructure?.id
            : undefined
        }
      />
      <canvas
        ref={structuresCanvasRef}
        style={getStructuresCanvasStyle(displayWidth, displayHeight)}
      />
      <TooltipOverlay
        hoveredStructure={hoveredStructure}
        mousePos={mousePos}
        fontSize={fontSize}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        isMobile={isMobile}
        outpostViews={worldView.outposts}
        gameTime={gameTime}
        fogOfWarEnabled={fogOfWarEnabled}
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
          sonarCircles={sonarCircles}
          playerColor={accentColor}
          fogOfWarEnabled={fogOfWarEnabled}
        />
      )}
      {import.meta.env.DEV && isFairnessOverlayVisible && !isMobile && <DevFairnessOverlay />}

      <CommandPaletteButton
        accentColor={accentColor}
        isOpen={isCommandPaletteOpen}
        onToggle={handlePaletteToggle}
        triggerRef={commandPaletteButtonRef}
        isMobile={isMobile}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        scrollSettings={scrollSettings}
        onScrollSettingsChange={setScrollSettings}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fogOfWarEnabled={fogOfWarEnabled}
        onFogOfWarToggle={setFogOfWarEnabled}
        triggerRef={commandPaletteButtonRef}
        accentColor={accentColor}
        isMobile={isMobile}
      />

      <PlayerSwitcher
        players={players}
        activePlayerIndex={activePlayerIndex}
        onSelect={handlePlayerSelect}
      />
    </div>
  );
};
