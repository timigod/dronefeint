export const MAP_WIDTH = 2660; // Horizontal size reduced by ~30% for tighter play area
export const MAP_HEIGHT = 2100; // Vertical size reduced by ~30% to match density goals
export const GRID_SIZE = 50; // Grid cell size

export const MINIMAP_HEIGHT = 160;
export const MINIMAP_WIDTH = Math.round((MAP_WIDTH / MAP_HEIGHT) * MINIMAP_HEIGHT);
export const MINIMAP_TOPO_SCALE = 2;
export const MINIMAP_TEXTURE_WIDTH = MINIMAP_WIDTH * MINIMAP_TOPO_SCALE;
export const MINIMAP_TEXTURE_HEIGHT = MINIMAP_HEIGHT * MINIMAP_TOPO_SCALE;

