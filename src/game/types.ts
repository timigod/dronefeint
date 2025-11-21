export interface Landmass {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: { x: number; y: number }[];
  elevationType?: 'flat' | 'hills' | 'mountains';
  elevationPeaks?: { x: number; y: number; intensity: number }[];
  // Optional rendering/profile controls for variety
  elevationLayers?: number;      // how many contour levels to quantize into
  falloffScale?: number;         // how quickly elevation falls from edge to center
  peakWeight?: number;           // scale for peak influence on elevation
}

export interface ViewPort {
  x: number;
  y: number;
  zoom: number;
}

