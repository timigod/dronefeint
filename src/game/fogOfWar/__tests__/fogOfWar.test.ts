import { describe, expect, it } from 'vitest';
import { SONAR_RADIUS } from '../config';
import { getOutpostSonarRadius, isCarrierVisibleToPlayer, isOutpostVisibleToPlayer } from '../visibility';
import { buildPlayerWorldView } from '../worldView';
import type { CanonicalCarrier, CanonicalOutpost, PlayerLastSeenState } from '../types';

const makeOutpost = (
  id: string,
  ownerId: string | undefined,
  position: { x: number; y: number },
  extras?: Partial<CanonicalOutpost>
): CanonicalOutpost => ({
  id,
  type: 'foundry',
  position,
  ownerId,
  droneCount: extras?.droneCount ?? 0,
  specialists: extras?.specialists ?? [],
  sonarRadiusMultiplier: extras?.sonarRadiusMultiplier,
});

describe('fog of war visibility rules', () => {
  it('scales sonar radius deterministically', () => {
    const boosted = makeOutpost('o1', 'p1', { x: 0, y: 0 }, { sonarRadiusMultiplier: 1.1 });
    const withSpecialist = makeOutpost('o2', 'p1', { x: 0, y: 0 }, {
      specialists: [{ id: 's1', name: 'surveillance', sonarRadiusMultiplier: 1.25 }],
    });

    expect(getOutpostSonarRadius(boosted)).toBeCloseTo(SONAR_RADIUS * 1.1);
    expect(getOutpostSonarRadius(withSpecialist)).toBeCloseTo(SONAR_RADIUS * 1.25);
  });

  it('reveals owned outposts and sonar contacts only', () => {
    const owned = makeOutpost('hq', 'p1', { x: 0, y: 0 });
    const neutralInRange = makeOutpost('n1', undefined, { x: SONAR_RADIUS - 5, y: 0 });
    const neutralOutOfRange = makeOutpost('n2', undefined, { x: SONAR_RADIUS + 80, y: 0 });
    const all = [owned, neutralInRange, neutralOutOfRange];

    expect(
      isOutpostVisibleToPlayer({ outpost: owned, playerId: 'p1', allOutposts: all })
    ).toBe(true);
    expect(
      isOutpostVisibleToPlayer({ outpost: neutralInRange, playerId: 'p1', allOutposts: all })
    ).toBe(true);
    expect(
      isOutpostVisibleToPlayer({ outpost: neutralOutOfRange, playerId: 'p1', allOutposts: all })
    ).toBe(false);
  });

  it('applies carrier visibility: own, inbound, or inside sonar', () => {
    const playerHq = makeOutpost('hq', 'p1', { x: 0, y: 0 });
    const ally = makeOutpost('ally', 'p1', { x: 100, y: 0 });
    const enemyA = makeOutpost('enemyA', 'p2', { x: 700, y: 0 });
    const enemyB = makeOutpost('enemyB', 'p2', { x: -700, y: 0 });
    const outposts = [playerHq, ally, enemyA, enemyB];

    const ownCarrier: CanonicalCarrier = {
      id: 'c1',
      ownerId: 'p1',
      originId: 'ally',
      destinationId: 'enemyA',
      launchTime: 0,
      arrivalTime: 10,
      droneCount: 50,
      specialists: [],
    };
    const inboundCarrier: CanonicalCarrier = {
      id: 'c2',
      ownerId: 'p2',
      originId: 'enemyA',
      destinationId: 'hq',
      launchTime: 0,
      arrivalTime: 20,
      droneCount: 20,
      specialists: [],
    };
    const crossingCarrier: CanonicalCarrier = {
      id: 'c3',
      ownerId: 'p2',
      originId: 'enemyA',
      destinationId: 'enemyB',
      launchTime: 0,
      arrivalTime: 10,
      droneCount: 15,
      specialists: [],
    };

    expect(
      isCarrierVisibleToPlayer({ carrier: ownCarrier, playerId: 'p1', outposts, time: 5 })
    ).toBe(true);
    expect(
      isCarrierVisibleToPlayer({ carrier: inboundCarrier, playerId: 'p1', outposts, time: 1 })
    ).toBe(true);
    expect(
      isCarrierVisibleToPlayer({ carrier: crossingCarrier, playerId: 'p1', outposts, time: 0 })
    ).toBe(false);
    expect(
      isCarrierVisibleToPlayer({ carrier: crossingCarrier, playerId: 'p1', outposts, time: 5 })
    ).toBe(true);
  });

  it('tracks last-seen data and surfaces unknowns', () => {
    const playerId = 'p1';
    const owned = makeOutpost('hq', playerId, { x: 0, y: 0 }, { droneCount: 100 });
    const enemyVisible = makeOutpost('e1', 'p2', { x: SONAR_RADIUS - 10, y: 0 }, { droneCount: 20 });
    const enemyHidden = makeOutpost('e2', 'p2', { x: SONAR_RADIUS + 200, y: 0 }, { droneCount: 30 });
    const lastSeen: PlayerLastSeenState = new Map();

    let outposts: CanonicalOutpost[] = [owned, enemyVisible, enemyHidden];
    const initialView = buildPlayerWorldView({
      playerId,
      time: 0,
      outposts,
      carriers: [],
      lastSeenState: lastSeen,
    });

    const viewE1 = initialView.outposts.find((o) => o.id === 'e1');
    const viewE2 = initialView.outposts.find((o) => o.id === 'e2');
    expect(viewE1?.visibility).toBe('live');
    if (viewE1?.visibility === 'live') {
      expect(viewE1.droneCount).toBe(20);
      expect(viewE1.lastSeenAt).toBe(0);
    }
    expect(viewE2?.visibility).toBe('unknown');

    // Move e1 out of sonar and change its true count; last-seen should be retained.
    outposts = [
      owned,
      { ...enemyVisible, position: { x: SONAR_RADIUS * 2, y: 0 }, droneCount: 40 },
      enemyHidden,
    ];
    const hiddenView = buildPlayerWorldView({
      playerId,
      time: 10,
      outposts,
      carriers: [],
      lastSeenState: lastSeen,
    });
    const hiddenE1 = hiddenView.outposts.find((o) => o.id === 'e1');
    expect(hiddenE1?.visibility).toBe('lastSeen');
    if (hiddenE1?.visibility === 'lastSeen') {
      expect(hiddenE1.lastSeenDroneCount).toBe(20);
      expect(hiddenE1.lastSeenAt).toBe(0);
    }

    // Bring e1 back into sonar with a new count; snapshot should refresh.
    outposts = [
      owned,
      { ...enemyVisible, position: { x: SONAR_RADIUS - 5, y: 0 }, droneCount: 55 },
      enemyHidden,
    ];
    const returnView = buildPlayerWorldView({
      playerId,
      time: 20,
      outposts,
      carriers: [],
      lastSeenState: lastSeen,
    });
    const returnE1 = returnView.outposts.find((o) => o.id === 'e1');
    expect(returnE1?.visibility).toBe('live');
    if (returnE1?.visibility === 'live') {
      expect(returnE1.droneCount).toBe(55);
      expect(returnE1.lastSeenAt).toBe(20);
    }
  });
});
