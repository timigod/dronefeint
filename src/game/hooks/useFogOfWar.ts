import { useMemo, useRef } from 'react';
import { structuresToOutposts } from '../fogOfWar/adapters';
import { DEFAULT_FOG_OF_WAR_CONFIG } from '../fogOfWar/config';
import type { PlayerLastSeenState, PlayerWorldView, CanonicalCarrier } from '../fogOfWar/types';
import { getPlayerSonarSources, getOutpostSonarRadius } from '../fogOfWar/visibility';
import { buildPlayerWorldView } from '../fogOfWar/worldView';
import type { Structure } from '../structures';

export interface SonarCircle {
  x: number;
  y: number;
  radius: number;
  outpostId: string;
}

export interface FogOfWarState {
  worldView: PlayerWorldView;
  sonarCircles: SonarCircle[];
  isOutpostVisible: (outpostId: string) => boolean;
  getOutpostVisibility: (outpostId: string) => 'live' | 'lastSeen' | 'unknown';
}

interface UseFogOfWarProps {
  structures: Structure[];
  playerId: string | undefined;
  gameTime?: number;
  carriers?: CanonicalCarrier[];
  enabled?: boolean;
}

export const useFogOfWar = ({
  structures,
  playerId,
  gameTime = Date.now(),
  carriers = [],
  enabled = true,
}: UseFogOfWarProps): FogOfWarState => {
  // Persistent last-seen state across renders
  const lastSeenStateRef = useRef<PlayerLastSeenState>(new Map());

  const canonicalOutposts = useMemo(() => structuresToOutposts(structures), [structures]);

  const worldView = useMemo(() => {
    if (!enabled || !playerId) {
      // When fog of war is disabled, return all outposts as live
      return {
        playerId: playerId ?? '',
        asOfTime: gameTime,
        outposts: canonicalOutposts.map((outpost) => ({
          id: outpost.id,
          position: outpost.position,
          type: outpost.type,
          ownerId: outpost.ownerId,
          visibility: 'live' as const,
          droneCount: outpost.droneCount,
          specialists: outpost.specialists,
          lastSeenAt: gameTime,
        })),
        carriers: carriers.map((c) => ({
          ...c,
          position: { x: 0, y: 0 }, // Position will be calculated elsewhere
        })),
      };
    }

    return buildPlayerWorldView({
      playerId,
      time: gameTime,
      outposts: canonicalOutposts,
      carriers,
      lastSeenState: lastSeenStateRef.current,
      config: DEFAULT_FOG_OF_WAR_CONFIG,
    });
  }, [enabled, playerId, gameTime, canonicalOutposts, carriers]);

  const sonarCircles = useMemo((): SonarCircle[] => {
    if (!enabled || !playerId) return [];

    const sources = getPlayerSonarSources(canonicalOutposts, playerId, DEFAULT_FOG_OF_WAR_CONFIG);
    return sources.map((source) => ({
      x: source.x,
      y: source.y,
      radius: source.radius,
      outpostId: source.outpostId,
    }));
  }, [enabled, playerId, canonicalOutposts]);

  const visibilityLookup = useMemo(() => {
    const map = new Map<string, 'live' | 'lastSeen' | 'unknown'>();
    worldView.outposts.forEach((outpost) => {
      map.set(outpost.id, outpost.visibility);
    });
    return map;
  }, [worldView.outposts]);

  const isOutpostVisible = (outpostId: string): boolean => {
    const visibility = visibilityLookup.get(outpostId);
    return visibility === 'live';
  };

  const getOutpostVisibility = (outpostId: string): 'live' | 'lastSeen' | 'unknown' => {
    return visibilityLookup.get(outpostId) ?? 'unknown';
  };

  return {
    worldView,
    sonarCircles,
    isOutpostVisible,
    getOutpostVisibility,
  };
};

export { getOutpostSonarRadius };

