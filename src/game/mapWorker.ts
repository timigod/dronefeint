/// <reference lib="webworker" />
import { renderTerrain, renderWater, renderMinimapTexture } from './renderers';
import type { Landmass } from './types';

interface GenerateAssetsMessage {
  type: 'generateAssets';
  payload: {
    landmasses: Landmass[];
    mapWidth: number;
    mapHeight: number;
    minimapTextureWidth: number;
    minimapTextureHeight: number;
  };
}

type WorkerMessage = GenerateAssetsMessage;

type AssetMessage =
  | {
      type: 'assetsGenerated';
      payload: {
        terrainBitmap: ImageBitmap;
        waterBitmap: ImageBitmap;
        minimapBitmap: ImageBitmap;
      };
    }
  | {
      type: 'assetError';
      payload: {
        error: string;
      };
    };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const handleGenerateAssets = async ({
  landmasses,
  mapWidth,
  mapHeight,
  minimapTextureHeight,
  minimapTextureWidth,
}: GenerateAssetsMessage['payload']) => {
  try {
    const terrainCanvas = new OffscreenCanvas(mapWidth, mapHeight);
    renderTerrain({
      canvas: terrainCanvas,
      landmasses,
      mapWidth,
      mapHeight,
    });
    const terrainBitmap = terrainCanvas.transferToImageBitmap();

    const waterCanvas = new OffscreenCanvas(mapWidth, mapHeight);
    renderWater({
      canvas: waterCanvas,
      mapWidth,
      mapHeight,
    });
    const waterBitmap = waterCanvas.transferToImageBitmap();

    const minimapCanvas = new OffscreenCanvas(minimapTextureWidth, minimapTextureHeight);
    renderMinimapTexture({
      canvas: minimapCanvas,
      landmasses,
      mapWidth,
      mapHeight,
    });
    const minimapBitmap = minimapCanvas.transferToImageBitmap();

    const message: AssetMessage = {
      type: 'assetsGenerated',
      payload: {
        terrainBitmap,
        waterBitmap,
        minimapBitmap,
      },
    };
    ctx.postMessage(message, [terrainBitmap, waterBitmap, minimapBitmap]);
  } catch (error) {
    const message: AssetMessage = {
      type: 'assetError',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown asset generation error',
      },
    };
    ctx.postMessage(message);
  }
};

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { data } = event;
  if (data.type === 'generateAssets') {
    handleGenerateAssets(data.payload);
  }
};

export {};

