import { useEffect, useRef, useState } from 'react';
import { Landmass } from '../types';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MINIMAP_TEXTURE_HEIGHT,
  MINIMAP_TEXTURE_WIDTH,
} from '../mapConstants';
import { renderTerrain, renderWater, renderMinimapTexture } from '../renderers';

interface MapTexturesResult {
  terrainTexture: CanvasImageSource | null;
  waterTexture: CanvasImageSource | null;
  minimapTexture: CanvasImageSource | null;
  terrainReady: boolean;
  waterReady: boolean;
  minimapReady: boolean;
}

export const useMapTextures = (landmasses: Landmass[]): MapTexturesResult => {
  const [terrainTexture, setTerrainTexture] = useState<CanvasImageSource | null>(null);
  const [waterTexture, setWaterTexture] = useState<CanvasImageSource | null>(null);
  const [minimapTexture, setMinimapTexture] = useState<CanvasImageSource | null>(null);
  const [terrainReady, setTerrainReady] = useState(false);
  const [waterReady, setWaterReady] = useState(false);
  const [minimapReady, setMinimapReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setTerrainReady(false);
    setWaterReady(false);
    setMinimapReady(false);
    setTerrainTexture(null);
    setWaterTexture(null);
    setMinimapTexture(null);

    const assignAssets = (
      terrainSource: CanvasImageSource,
      waterSource: CanvasImageSource,
      minimapSource: CanvasImageSource
    ) => {
      if (isCancelled) return;
      setTerrainTexture(terrainSource);
      setWaterTexture(waterSource);
      setMinimapTexture(minimapSource);
      setTerrainReady(true);
      setWaterReady(true);
      setMinimapReady(true);
    };

    const generateOnMainThread = () => {
      const terrainCanvas = document.createElement('canvas');
      terrainCanvas.width = MAP_WIDTH;
      terrainCanvas.height = MAP_HEIGHT;
      renderTerrain({
        canvas: terrainCanvas,
        landmasses,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      });

      const waterCanvas = document.createElement('canvas');
      waterCanvas.width = MAP_WIDTH;
      waterCanvas.height = MAP_HEIGHT;
      renderWater({
        canvas: waterCanvas,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      });

      const minimapCanvas = document.createElement('canvas');
      minimapCanvas.width = MINIMAP_TEXTURE_WIDTH;
      minimapCanvas.height = MINIMAP_TEXTURE_HEIGHT;
      renderMinimapTexture({
        canvas: minimapCanvas,
        landmasses,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      });

      assignAssets(terrainCanvas, waterCanvas, minimapCanvas);
    };

    const supportsWorkers =
      typeof window !== 'undefined' && 'Worker' in window && 'OffscreenCanvas' in window;

    if (supportsWorkers) {
      try {
        const worker = new Worker(new URL('../mapWorker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker;
        const handleWorkerFailure = (error?: unknown) => {
          if (error) {
            console.error('Map worker error:', error);
          }
          worker.terminate();
          workerRef.current = null;
          generateOnMainThread();
        };

        worker.onmessage = (event) => {
          if (isCancelled) return;
          const { data } = event;
          if (data.type === 'assetsGenerated') {
            assignAssets(
              data.payload.terrainBitmap,
              data.payload.waterBitmap,
              data.payload.minimapBitmap
            );
          } else if (data.type === 'assetError') {
            handleWorkerFailure(data.payload.error);
          }
        };

        worker.onerror = (event) => {
          handleWorkerFailure(event.message);
        };

        worker.postMessage({
          type: 'generateAssets',
          payload: {
            landmasses,
            mapWidth: MAP_WIDTH,
            mapHeight: MAP_HEIGHT,
            minimapTextureWidth: MINIMAP_TEXTURE_WIDTH,
            minimapTextureHeight: MINIMAP_TEXTURE_HEIGHT,
          },
        });

        return () => {
          isCancelled = true;
          worker.terminate();
          workerRef.current = null;
        };
      } catch (error) {
        console.error('Failed to start map worker:', error);
        generateOnMainThread();
        return () => {
          isCancelled = true;
        };
      }
    }

    generateOnMainThread();

    return () => {
      isCancelled = true;
    };
  }, [landmasses]);

  return {
    terrainTexture,
    waterTexture,
    minimapTexture,
    terrainReady,
    waterReady,
    minimapReady,
  };
};
