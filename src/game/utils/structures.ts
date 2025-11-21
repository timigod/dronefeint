import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import type { Structure } from '../structures';

export const getStructureClusterCenter = (structures: Structure[]) => {
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
