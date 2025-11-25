import { DEFAULT_FOG_OF_WAR_CONFIG, type FogOfWarConfig } from './config';
import type { CanonicalOutpost, LastSeenSnapshot, PlayerLastSeenState } from './types';
import { getPlayerSonarSources, isOutpostVisibleToPlayer } from './visibility';

const getOrCreatePlayerState = (state: PlayerLastSeenState, playerId: string) => {
  const existing = state.get(playerId);
  if (existing) return existing;
  const next = new Map<string, LastSeenSnapshot>();
  state.set(playerId, next);
  return next;
};

export const getLastSeenSnapshot = (
  state: PlayerLastSeenState,
  playerId: string,
  outpostId: string
): LastSeenSnapshot | undefined => state.get(playerId)?.get(outpostId);

export const updateLastSeenState = ({
  state,
  playerId,
  outposts,
  time,
  sonarSources,
  config = DEFAULT_FOG_OF_WAR_CONFIG,
}: {
  state: PlayerLastSeenState;
  playerId: string;
  outposts: CanonicalOutpost[];
  time: number;
  sonarSources?: ReturnType<typeof getPlayerSonarSources>;
  config?: FogOfWarConfig;
}) => {
  const playerState = getOrCreatePlayerState(state, playerId);
  const sources = sonarSources ?? getPlayerSonarSources(outposts, playerId, config);

  outposts.forEach((outpost) => {
    const visible = isOutpostVisibleToPlayer({
      outpost,
      playerId,
      allOutposts: outposts,
      sonarSources: sources,
      config,
    });
    if (!visible) return;
    playerState.set(outpost.id, {
      droneCount: outpost.droneCount,
      specialists: outpost.specialists,
      seenAt: time,
    });
  });

  return playerState;
};
