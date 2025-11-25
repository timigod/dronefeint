import type { Structure } from '../structures';
import type { CanonicalOutpost } from './types';

export const structureToCanonicalOutpost = (structure: Structure): CanonicalOutpost => ({
  id: structure.id,
  type: structure.type,
  position: { x: structure.x, y: structure.y },
  ownerId: structure.ownerId,
  droneCount: structure.droneCount ?? 0,
  specialists: [],
});

export const structuresToOutposts = (structures: Structure[]): CanonicalOutpost[] =>
  structures.map(structureToCanonicalOutpost);
