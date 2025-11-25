import { DEFAULT_FOG_OF_WAR_CONFIG, type FogOfWarConfig } from './config';
import {
  getCarrierPosition,
  getPlayerSonarSources,
  isCarrierVisibleToPlayer,
  isOutpostVisibleToPlayer,
} from './visibility';
import { getLastSeenSnapshot, updateLastSeenState } from './state';
import type {
  CanonicalCarrier,
  CanonicalOutpost,
  PlayerLastSeenState,
  PlayerOutpostView,
  PlayerWorldView,
} from './types';

export const buildPlayerWorldView = ({
  playerId,
  time,
  outposts,
  carriers = [],
  lastSeenState,
  config = DEFAULT_FOG_OF_WAR_CONFIG,
}: {
  playerId: string;
  time: number;
  outposts: CanonicalOutpost[];
  carriers?: CanonicalCarrier[];
  lastSeenState: PlayerLastSeenState;
  config?: FogOfWarConfig;
}): PlayerWorldView => {
  const sonarSources = getPlayerSonarSources(outposts, playerId, config);
  updateLastSeenState({
    state: lastSeenState,
    playerId,
    outposts,
    time,
    sonarSources,
    config,
  });
  const playerLastSeen = lastSeenState.get(playerId) ?? new Map();

  const outpostViews: PlayerOutpostView[] = outposts.map((outpost) => {
    const base = {
      id: outpost.id,
      position: outpost.position,
      type: outpost.type,
      ownerId: outpost.ownerId,
    };
    const visible = isOutpostVisibleToPlayer({
      outpost,
      playerId,
      allOutposts: outposts,
      sonarSources,
      config,
    });
    if (visible) {
      return {
        ...base,
        visibility: 'live' as const,
        droneCount: outpost.droneCount,
        specialists: outpost.specialists,
        lastSeenAt: time,
      };
    }
    const snapshot = getLastSeenSnapshot(lastSeenState, playerId, outpost.id);
    if (snapshot) {
      return {
        ...base,
        visibility: 'lastSeen' as const,
        lastSeenAt: snapshot.seenAt,
        lastSeenDroneCount: snapshot.droneCount,
        lastSeenSpecialists: snapshot.specialists,
      };
    }
    return { ...base, visibility: 'unknown' as const };
  });

  const outpostLookup = new Map(outposts.map((outpost) => [outpost.id, outpost]));
  const carrierViews = carriers
    .filter((carrier) =>
      isCarrierVisibleToPlayer({
        carrier,
        playerId,
        outposts,
        time,
        sonarSources,
        config,
      })
    )
    .map((carrier) => ({
      id: carrier.id,
      ownerId: carrier.ownerId,
      originId: carrier.originId,
      destinationId: carrier.destinationId,
      launchTime: carrier.launchTime,
      arrivalTime: carrier.arrivalTime,
      droneCount: carrier.droneCount,
      position: getCarrierPosition(carrier, time, outpostLookup),
    }));

  return {
    playerId,
    asOfTime: time,
    outposts: outpostViews,
    carriers: carrierViews,
  };
};
