export const COLORS = {
  background: '#050505',
  panelBackground: 'rgba(20, 10, 15, 0.8)',
  panelBackgroundSolid: 'rgba(20, 10, 15, 0.95)',
  defaultAccent: '#dc3545',
} as const;

export const Z_INDEX = {
  terrain: 1,
  grid: 2,
  fogOfWar: 3,
  structures: 4,
  tooltip: 5,
  devOverlay: 99,
  playerSwitcher: 110,
  commandPaletteButton: 120,
  loadingOverlay: 150,
  commandPalette: 1000,
} as const;
