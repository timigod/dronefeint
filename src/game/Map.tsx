import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { DevFairnessOverlay } from './components/DevFairnessOverlay';
import { Minimap } from './components/Minimap';
import { TooltipOverlay } from './components/TooltipOverlay';
import { CommandPaletteButton } from './components/CommandPaletteButton';
import { PlayerSwitcher } from './components/PlayerSwitcher';
import { useDragPan } from './hooks/useDragPan';
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
import { getStructureClusterCenter } from './utils/structures';
import { isMobileDevice } from './utils/viewport';
import { generateLandmasses } from './worldgen/landmasses';

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
  const accentColor = activePlayer?.color ?? '#dc3545';

  const [scrollSettings, setScrollSettings] = useState({ invertX: false, invertY: false });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile] = useState(() => isMobileDevice());
  const { fontSize, setFontSize } = useFontSizeSetting();
  const { isVisible: isFairnessOverlayVisible } = useDevFairnessOverlay();

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
