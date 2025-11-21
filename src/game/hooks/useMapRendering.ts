import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { drawGlyphText, measureGlyphText, GLYPH_HEIGHT } from '../glyphs';
import { GRID_SIZE, MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import { drawStructure, drawDroneCount, type Structure } from '../structures';
import type { FontSizeOption } from '../utils/fontSize';
import { getResponsiveFontValue } from '../utils/fontSize';
import { wrap } from '../utils/math';

interface UseMapRenderingProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  gridCanvasRef: RefObject<HTMLCanvasElement>;
  structuresCanvasRef: RefObject<HTMLCanvasElement>;
  offset: { x: number; y: number };
  viewportSize: { width: number; height: number };
  structures: Structure[];
  fontSize: FontSizeOption;
  isMobile: boolean;
  terrainTexture: CanvasImageSource | null;
  waterTexture: CanvasImageSource | null;
  terrainReady: boolean;
  waterReady: boolean;
  isDragging: boolean;
  isMomentum: boolean;
}

const LABEL_SCALE_MAP: Record<FontSizeOption, number> = {
  small: 1.35,
  medium: 1.6,
  large: 1.85,
};

const LABEL_SPACING_MAP: Record<Structure['type'], number> = {
  hq: 12,
  foundry: 12,
  reactor: 14,
  extractor: 12,
};

const LABEL_ANCHOR_MULTIPLIER_MAP: Record<Structure['type'], number> = {
  hq: 2.6,
  foundry: 1,
  reactor: 1,
  extractor: 1,
};

export const useMapRendering = ({
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
}: UseMapRenderingProps) => {
  const offsetRef = useRef(offset);
  const fontSizeRef = useRef(fontSize);
  const viewportSizeRef = useRef(viewportSize);
  const terrainDirtyRef = useRef(true);
  const gridDirtyRef = useRef(true);
  const structuresDirtyRef = useRef(true);
  const lastStructuresDrawRef = useRef(0);
  const gridPatternRef = useRef<CanvasPattern | null>(null);

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
    viewportSizeRef.current = viewportSize;
    terrainDirtyRef.current = true;
    gridDirtyRef.current = true;
    structuresDirtyRef.current = true;
  }, [viewportSize.height, viewportSize.width, viewportSize]);

  useEffect(() => {
    if (terrainReady || waterReady) {
      terrainDirtyRef.current = true;
    }
  }, [terrainReady, waterReady]);

  useEffect(() => {
    structuresDirtyRef.current = true;
  }, [structures]);

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
      for (let x = startX; x < canvas.width; x += MAP_WIDTH) {
        for (let y = startY; y < canvas.height; y += MAP_HEIGHT) {
          ctx.drawImage(waterTexture, x, y);
        }
      }
    }

    if (terrainTexture) {
      for (let x = startX; x < canvas.width; x += MAP_WIDTH) {
        for (let y = startY; y < canvas.height; y += MAP_HEIGHT) {
          ctx.drawImage(terrainTexture, x, y);
        }
      }
    }
  }, [canvasRef, terrainReady, terrainTexture, waterReady, waterTexture]);

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
  }, [gridCanvasRef]);

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
            drawDroneCount(ctx, structure, tileStartX, tileStartY, fontSizeRef.current, isMobile);

            if (structure.label) {
              const scale = getResponsiveFontValue(fontSizeRef.current, LABEL_SCALE_MAP, isMobile);
              const spacing = LABEL_SPACING_MAP[structure.type] ?? 10;
              const anchorMultiplier = LABEL_ANCHOR_MULTIPLIER_MAP[structure.type] ?? 1;
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
    [isMobile, structures, structuresCanvasRef]
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
};
