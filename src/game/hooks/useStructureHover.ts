import { useCallback, useState } from 'react';
import { Structure } from '../structures';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import { distance, wrap } from '../utils/math';

interface HoverArgs {
  clientX: number;
  clientY: number;
  offset: { x: number; y: number };
}

export const useStructureHover = (structures: Structure[]) => {
  const [hoveredStructure, setHoveredStructure] = useState<Structure | null>(null);

  const updateHover = useCallback(
    ({ clientX, clientY, offset }: HoverArgs) => {
      const wrappedOffsetX = wrap(offset.x, MAP_WIDTH);
      const wrappedOffsetY = wrap(offset.y, MAP_HEIGHT);

      let found: Structure | null = null;

      for (const structure of structures) {
        if (found) break;
        for (let tileX = -1; tileX <= 1; tileX += 1) {
          if (found) break;
          for (let tileY = -1; tileY <= 1; tileY += 1) {
            const tileOffsetX = tileX * MAP_WIDTH;
            const tileOffsetY = tileY * MAP_HEIGHT;
            const screenX = structure.x + tileOffsetX - wrappedOffsetX;
            const screenY = structure.y + tileOffsetY - wrappedOffsetY;

            if (distance(clientX, clientY, screenX, screenY) < structure.size * 1.5) {
              found = structure;
              break;
            }
          }
        }
      }

      setHoveredStructure(found);
      return found;
    },
    [structures]
  );

  const clearHover = useCallback(() => {
    setHoveredStructure(null);
  }, []);

  return {
    hoveredStructure,
    updateHover,
    clearHover,
  };
};
