import { distance } from '../utils/math';
import { DEFAULT_FOG_OF_WAR_CONFIG, type FogOfWarConfig } from './config';
import type { CanonicalCarrier, CanonicalOutpost } from './types';

type SonarSource = {
  outpostId: string;
  x: number;
  y: number;
  radius: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const getSpecialistSonarMultiplier = (outpost: CanonicalOutpost) =>
  outpost.specialists.reduce((acc, specialist) => acc * (specialist.sonarRadiusMultiplier ?? 1), 1);

export const getOutpostSonarRadius = (
  outpost: CanonicalOutpost,
  config: FogOfWarConfig = DEFAULT_FOG_OF_WAR_CONFIG
): number => {
  const specialistMultiplier = getSpecialistSonarMultiplier(outpost);
  const hostMultiplier = outpost.sonarRadiusMultiplier ?? 1;
  return config.baseSonarRadius * hostMultiplier * specialistMultiplier;
};

export const getPlayerSonarSources = (
  outposts: CanonicalOutpost[],
  playerId: string,
  config: FogOfWarConfig = DEFAULT_FOG_OF_WAR_CONFIG
): SonarSource[] =>
  outposts
    .filter((outpost) => outpost.ownerId === playerId)
    .map((outpost) => ({
      outpostId: outpost.id,
      x: outpost.position.x,
      y: outpost.position.y,
      radius: getOutpostSonarRadius(outpost, config),
    }));

const isPositionInSonar = (pos: { x: number; y: number }, sources: SonarSource[]) =>
  sources.some((source) => distance(pos.x, pos.y, source.x, source.y) <= source.radius);

export const isOutpostVisibleToPlayer = ({
  outpost,
  playerId,
  allOutposts,
  sonarSources,
  config = DEFAULT_FOG_OF_WAR_CONFIG,
}: {
  outpost: CanonicalOutpost;
  playerId: string;
  allOutposts: CanonicalOutpost[];
  sonarSources?: SonarSource[];
  config?: FogOfWarConfig;
}): boolean => {
  if (outpost.ownerId === playerId) return true;
  const sources = sonarSources ?? getPlayerSonarSources(allOutposts, playerId, config);
  return isPositionInSonar(outpost.position, sources);
};

const getOutpostLookup = (outposts: CanonicalOutpost[]) =>
  new Map(outposts.map((outpost) => [outpost.id, outpost]));

export const getCarrierPosition = (
  carrier: CanonicalCarrier,
  time: number,
  outpostLookup: Map<string, CanonicalOutpost>
) => {
  const origin = outpostLookup.get(carrier.originId);
  const destination = outpostLookup.get(carrier.destinationId);
  if (!origin || !destination) {
    return { x: 0, y: 0 };
  }
  const duration = carrier.arrivalTime - carrier.launchTime;
  const t = duration > 0 ? clamp01((time - carrier.launchTime) / duration) : 1;
  return {
    x: origin.position.x + (destination.position.x - origin.position.x) * t,
    y: origin.position.y + (destination.position.y - origin.position.y) * t,
  };
};

export const isCarrierVisibleToPlayer = ({
  carrier,
  playerId,
  outposts,
  time,
  sonarSources,
  config = DEFAULT_FOG_OF_WAR_CONFIG,
}: {
  carrier: CanonicalCarrier;
  playerId: string;
  outposts: CanonicalOutpost[];
  time: number;
  sonarSources?: SonarSource[];
  config?: FogOfWarConfig;
}): boolean => {
  if (carrier.ownerId === playerId) return true;
  const lookup = getOutpostLookup(outposts);
  const destination = lookup.get(carrier.destinationId);
  if (destination?.ownerId === playerId) return true;
  const sources = sonarSources ?? getPlayerSonarSources(outposts, playerId, config);
  if (!sources.length) return false;
  const position = getCarrierPosition(carrier, time, lookup);
  return isPositionInSonar(position, sources);
};
