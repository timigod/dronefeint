import { distance } from '../utils/math';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import type { Structure } from '../structures';
import type { Player } from './startingScenario';
import { structuresToOutposts } from '../fogOfWar/adapters';
import { DEFAULT_FOG_OF_WAR_CONFIG } from '../fogOfWar/config';
import { getPlayerSonarSources, isOutpostVisibleToPlayer } from '../fogOfWar/visibility';

export type PlayerStructureSummary = {
  playerId: string;
  total: number;
  hq: number;
  foundry: number;
  reactor: number;
};

export type NeutralAccessSummary = {
  playerId: string;
  nearestTwoSum: number;
  nearestDistances: number[];
};

export type PlayerClusterStat = {
  playerId: string;
  averageSpacing: number;
  minSpacing: number;
  maxSpacing: number;
  minForeignGap: number;
};

export type PlayerNeutralAccessCounts = {
  playerId: string;
  nearCount: number;
  midCount: number;
  farCount: number;
};

export type PlayerNeutralTypeCounts = {
  playerId: string;
  foundry: number;
  reactor: number;
};

export type PlayerConnectivityEntry = {
  playerId: string;
  connectivityCount: number;
};

export type PlayerIsolationEntry = {
  playerId: string;
  isolationScore: number;
};

export type ScenarioFairnessMetrics = {
  totalStructures: number;
  neutralCount: number;
  centerNeutralCount: number;
  visibleNeutralCounts: number[];
  visibleEnemyCounts: number[];
  visibleNeutralMin: number;
  visibleNeutralMax: number;
  visibleNeutralRange: number;
  visibleEnemyMax: number;
  visibleEnemyRange: number;
  playerSummaries: PlayerStructureSummary[];
  hqDistances: number[];
  hqDistanceRange: number;
  adjacentHqDistances: number[];
  adjacentHqRange: number;
  hqRadiusValues: number[];
  hqRadiusRange: number;
  hqNearestEnemyDistances: number[];
  hqNearestEnemyRange: number;
  hqAverageEnemyDistances: number[];
  hqAverageEnemyRange: number;
  hqAngleMaxDeviationDeg: number;
  satelliteAngleStdDevDeg: number;
  neutralAngleStdDevDeg: number;
  neutralAccess: NeutralAccessSummary[];
  nearestNeutralSpread: number;
  playerClusterStats: PlayerClusterStat[];
  clusterAverageRange: number;
  clusterMinSpacing: number;
  clusterMaxSpacing: number;
  minForeignGapAcrossPlayers: number;
  playerNeutralAccessCounts: PlayerNeutralAccessCounts[];
  neutralNearCountRange: number;
  neutralMidCountRange: number;
  neutralFarCountRange: number;
  neutralNearMidCountRange: number;
  playerNeutralTypeCounts: PlayerNeutralTypeCounts[];
  neutralTypeCountRanges: { foundry: number; reactor: number };
  neutralWedgeCountRange: number;
  neutralWedgeRadialRange: number;
  playerConnectivityCounts: PlayerConnectivityEntry[];
  connectivityRange: number;
  playerIsolationScores: PlayerIsolationEntry[];
  isolationRange: number;
  maxStructureDistanceToCenter: number;
  minStructureDistance: number;
  minStructureClearance: number;
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const avg = (values: number[]) => (values.length ? sum(values) / values.length : 0);

const NEUTRAL_NEAR_RADIUS = 450;
const NEUTRAL_MID_RADIUS = 900;
const NEUTRAL_FAR_RADIUS = 1400;
const NEUTRAL_INNER_BAND = { min: 0, max: NEUTRAL_NEAR_RADIUS };
const NEUTRAL_MID_BAND = { min: NEUTRAL_NEAR_RADIUS, max: NEUTRAL_MID_RADIUS };
const CONNECTIVITY_RADIUS = 1200;
const ISOLATION_NEUTRAL_COUNT = 3;
const ISOLATION_HQ_COUNT = 2;
const CENTER_OCCUPANCY_RADIUS = 450;

export function evaluateScenarioFairness(players: Player[], structures: Structure[]): ScenarioFairnessMetrics {
  const neutrals = structures.filter((structure) => !structure.ownerId);
  const hqs = structures.filter((structure) => structure.type === 'hq');
  const outposts = structuresToOutposts(structures);
  const sonarConfig = DEFAULT_FOG_OF_WAR_CONFIG;
  const perPlayerVisibility = players.map((player) => {
    const sources = getPlayerSonarSources(outposts, player.id, sonarConfig);
    const neutralCount = outposts.filter(
      (outpost) =>
        !outpost.ownerId &&
        isOutpostVisibleToPlayer({
          outpost,
          playerId: player.id,
          allOutposts: outposts,
          sonarSources: sources,
          config: sonarConfig,
        })
    ).length;
    const enemyCount = outposts.filter(
      (outpost) =>
        outpost.ownerId &&
        outpost.ownerId !== player.id &&
        isOutpostVisibleToPlayer({
          outpost,
          playerId: player.id,
          allOutposts: outposts,
          sonarSources: sources,
          config: sonarConfig,
        })
    ).length;
    return { playerId: player.id, neutralCount, enemyCount };
  });
  const visibleNeutralCounts = perPlayerVisibility.map((entry) => entry.neutralCount);
  const visibleEnemyCounts = perPlayerVisibility.map((entry) => entry.enemyCount);
  const visibleNeutralMin = visibleNeutralCounts.length ? Math.min(...visibleNeutralCounts) : 0;
  const visibleNeutralMax = visibleNeutralCounts.length ? Math.max(...visibleNeutralCounts) : 0;
  const visibleNeutralRange = visibleNeutralMax - visibleNeutralMin;
  const visibleEnemyMax = visibleEnemyCounts.length ? Math.max(...visibleEnemyCounts) : 0;
  const visibleEnemyMin = visibleEnemyCounts.length ? Math.min(...visibleEnemyCounts) : 0;
  const visibleEnemyRange = visibleEnemyMax - visibleEnemyMin;

  const center = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const wedgeArc = (Math.PI * 2) / players.length;

  const playerSummaries: PlayerStructureSummary[] = players.map((player) => {
    const owned = structures.filter((structure) => structure.ownerId === player.id);
    return {
      playerId: player.id,
      total: owned.length,
      hq: owned.filter((structure) => structure.type === 'hq').length,
      foundry: owned.filter((structure) => structure.type === 'foundry').length,
      reactor: owned.filter((structure) => structure.type === 'reactor').length,
    };
  });

  const hqDistances: number[] = [];
  for (let i = 0; i < hqs.length; i++) {
    for (let j = i + 1; j < hqs.length; j++) {
      hqDistances.push(distance(hqs[i].x, hqs[i].y, hqs[j].x, hqs[j].y));
    }
  }
  const hqDistanceRange = hqDistances.length ? Math.max(...hqDistances) - Math.min(...hqDistances) : 0;

  const orderedHqs = players
    .map((player) => hqs.find((structure) => structure.ownerId === player.id))
    .filter((hq): hq is Structure => Boolean(hq));
  const adjacentHqDistances: number[] = [];
  for (let i = 0; i < orderedHqs.length; i++) {
    const current = orderedHqs[i];
    const next = orderedHqs[(i + 1) % orderedHqs.length];
    if (!current || !next) continue;
    adjacentHqDistances.push(distance(current.x, current.y, next.x, next.y));
  }
  const adjacentHqRange = adjacentHqDistances.length
    ? Math.max(...adjacentHqDistances) - Math.min(...adjacentHqDistances)
    : 0;

  const hqRadiusValues = orderedHqs.map((hq) => distance(hq.x, hq.y, center.x, center.y));
  const hqRadiusRange = hqRadiusValues.length ? Math.max(...hqRadiusValues) - Math.min(...hqRadiusValues) : 0;

  const hqNearestEnemyDistances = orderedHqs.map((hq, i) => {
    const others = orderedHqs.filter((_, idx) => idx !== i);
    return Math.min(...others.map((other) => distance(hq.x, hq.y, other.x, other.y)));
  });
  const hqNearestEnemyRange = hqNearestEnemyDistances.length
    ? Math.max(...hqNearestEnemyDistances) - Math.min(...hqNearestEnemyDistances)
    : 0;

  const hqAverageEnemyDistances = orderedHqs.map((hq, i) => {
    const others = orderedHqs.filter((_, idx) => idx !== i);
    return avg(others.map((other) => distance(hq.x, hq.y, other.x, other.y)));
  });
  const hqAverageEnemyRange = hqAverageEnemyDistances.length
    ? Math.max(...hqAverageEnemyDistances) - Math.min(...hqAverageEnemyDistances)
    : 0;

  const hqAngles = orderedHqs
    .map((hq) => {
      let angle = Math.atan2(hq.y - center.y, hq.x - center.x);
      if (angle < 0) angle += Math.PI * 2;
      return angle;
    })
    .sort((a, b) => a - b);
  const angleDeviations: number[] = [];
  for (let i = 0; i < hqAngles.length; i++) {
    const current = hqAngles[i];
    const next = hqAngles[(i + 1) % hqAngles.length];
    const delta = ((next - current + Math.PI * 2) % (Math.PI * 2)) || Math.PI * 2;
    angleDeviations.push(Math.abs(delta - wedgeArc));
  }
  const hqAngleMaxDeviationDeg =
    angleDeviations.length > 0 ? (Math.max(...angleDeviations) * 180) / Math.PI : 0;

  // Anti-hex: angular variance of satellites around their own wedge centers
  const clampAngle = (a: number) => {
    let x = a;
    while (x <= -Math.PI) x += Math.PI * 2;
    while (x > Math.PI) x -= Math.PI * 2;
    return x;
  };
  const hqAngleByOwner: Record<string, number> = {};
  orderedHqs.forEach((hq) => {
    let a = Math.atan2(hq.y - center.y, hq.x - center.x);
    if (a < 0) a += Math.PI * 2;
    hqAngleByOwner[hq.ownerId as string] = a;
  });
  const allSatelliteAngleOffsets: number[] = [];
  players.forEach((player) => {
    const hq = orderedHqs.find((s) => s.ownerId === player.id);
    if (!hq) return;
    const wedgeCenterAngle = hqAngleByOwner[player.id] ?? 0;
    const satellites = structures.filter(
      (structure) => structure.ownerId === player.id && structure.type !== 'hq'
    );
    satellites.forEach((sat) => {
      const a = Math.atan2(sat.y - hq.y, sat.x - hq.x);
      const offset = clampAngle(a - wedgeCenterAngle);
      allSatelliteAngleOffsets.push(offset);
    });
  });
  const satMean =
    allSatelliteAngleOffsets.length > 0 ? avg(allSatelliteAngleOffsets) : 0;
  const satelliteAngleStdDevDeg =
    allSatelliteAngleOffsets.length > 1
      ? Math.sqrt(
          avg(allSatelliteAngleOffsets.map((v) => (v - satMean) * (v - satMean)))
        ) *
        (180 / Math.PI)
      : 0;

  // Anti-hex: angular variance of neutrals around wedge centers (between HQs)
  const wedgeCenters: number[] = hqAngles.map((a) => (a + wedgeArc / 2) % (Math.PI * 2));
  const allNeutralAngleOffsets: number[] = [];
  neutrals.forEach((n) => {
    let a = Math.atan2(n.y - center.y, n.x - center.x);
    if (a < 0) a += Math.PI * 2;
    // nearest wedge center by smallest absolute angular difference
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < wedgeCenters.length; i++) {
      const diff = Math.abs(clampAngle(a - wedgeCenters[i]));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    const offset = clampAngle(a - wedgeCenters[best]);
    allNeutralAngleOffsets.push(offset);
  });
  const neuMean = allNeutralAngleOffsets.length > 0 ? avg(allNeutralAngleOffsets) : 0;
  const neutralAngleStdDevDeg =
    allNeutralAngleOffsets.length > 1
      ? Math.sqrt(
          avg(allNeutralAngleOffsets.map((v) => (v - neuMean) * (v - neuMean)))
        ) *
        (180 / Math.PI)
      : 0;

  const neutralAccess: NeutralAccessSummary[] = players.map((player) => {
    const hq = hqs.find((structure) => structure.ownerId === player.id);
    if (!hq || neutrals.length === 0) {
      return { playerId: player.id, nearestTwoSum: Number.POSITIVE_INFINITY, nearestDistances: [] };
    }
    const sortedDistances = neutrals
      .map((neutral) => distance(hq.x, hq.y, neutral.x, neutral.y))
      .sort((a, b) => a - b);
    const nearestTwo = sortedDistances.slice(0, 2);
    return {
      playerId: player.id,
      nearestTwoSum: sum(nearestTwo),
      nearestDistances: sortedDistances,
    };
  });
  const nearestNeutralSpread =
    neutralAccess.length > 0
      ? Math.max(...neutralAccess.map((entry) => entry.nearestTwoSum)) -
        Math.min(...neutralAccess.map((entry) => entry.nearestTwoSum))
      : 0;

  const playerClusterStats: PlayerClusterStat[] = players.map((player) => {
    const hq = orderedHqs.find((structure) => structure.ownerId === player.id);
    if (!hq) {
      return { playerId: player.id, averageSpacing: 0, minForeignGap: Number.POSITIVE_INFINITY };
    }
    const satellites = structures.filter(
      (structure) => structure.ownerId === player.id && structure.type !== 'hq'
    );
    const distances = satellites.map((structure) => distance(structure.x, structure.y, hq.x, hq.y));
    const averageSpacing = avg(distances);
    const minSpacing = distances.length ? Math.min(...distances) : 0;
    const maxSpacing = distances.length ? Math.max(...distances) : 0;
    const minForeignGap = satellites.length
      ? Math.min(
          ...satellites.map((structure) => {
            const own = distance(structure.x, structure.y, hq.x, hq.y);
            const foreign = Math.min(
              ...orderedHqs
                .filter((other) => other.ownerId !== player.id)
                .map((other) => distance(structure.x, structure.y, other.x, other.y))
            );
            return foreign - own;
          })
        )
      : Number.POSITIVE_INFINITY;
    return {
      playerId: player.id,
      averageSpacing,
      minSpacing,
      maxSpacing,
      minForeignGap,
    };
  });
  const clusterAverageRange =
    playerClusterStats.length > 0
      ? Math.max(...playerClusterStats.map((stat) => stat.averageSpacing)) -
        Math.min(...playerClusterStats.map((stat) => stat.averageSpacing))
      : 0;
  const minForeignGapAcrossPlayers = Math.min(...playerClusterStats.map((stat) => stat.minForeignGap));

  const playerNeutralAccessCounts: PlayerNeutralAccessCounts[] = players.map((player) => {
    const hq = orderedHqs.find((structure) => structure.ownerId === player.id);
    if (!hq) return { playerId: player.id, nearCount: 0, midCount: 0, farCount: 0 };
    const distances = neutrals.map((neutral) => distance(neutral.x, neutral.y, hq.x, hq.y));
    return {
      playerId: player.id,
      nearCount: distances.filter((d) => d >= NEUTRAL_INNER_BAND.min && d <= NEUTRAL_INNER_BAND.max).length,
      midCount: distances.filter((d) => d > NEUTRAL_INNER_BAND.max && d <= NEUTRAL_MID_BAND.max).length,
      farCount: distances.filter((d) => d > NEUTRAL_MID_BAND.max && d <= NEUTRAL_FAR_RADIUS).length,
    };
  });
  const neutralNearCountRange =
    playerNeutralAccessCounts.length > 0
      ? Math.max(...playerNeutralAccessCounts.map((entry) => entry.nearCount)) -
        Math.min(...playerNeutralAccessCounts.map((entry) => entry.nearCount))
      : 0;
  const neutralMidCountRange =
    playerNeutralAccessCounts.length > 0
      ? Math.max(...playerNeutralAccessCounts.map((entry) => entry.midCount)) -
        Math.min(...playerNeutralAccessCounts.map((entry) => entry.midCount))
      : 0;
  const neutralFarCountRange =
    playerNeutralAccessCounts.length > 0
      ? Math.max(...playerNeutralAccessCounts.map((entry) => entry.farCount)) -
        Math.min(...playerNeutralAccessCounts.map((entry) => entry.farCount))
      : 0;
  const neutralNearMidCountRange =
    playerNeutralAccessCounts.length > 0
      ? Math.max(
          ...playerNeutralAccessCounts.map((entry) => entry.nearCount + entry.midCount)
        ) -
        Math.min(
          ...playerNeutralAccessCounts.map((entry) => entry.nearCount + entry.midCount)
        )
      : 0;

  const playerNeutralTypeCounts: PlayerNeutralTypeCounts[] = players.map((player) => {
    const hq = orderedHqs.find((structure) => structure.ownerId === player.id);
    if (!hq) return { playerId: player.id, foundry: 0, reactor: 0 };
    const nearby = neutrals.filter((neutral) => {
      const d = distance(neutral.x, neutral.y, hq.x, hq.y);
      return d >= NEUTRAL_INNER_BAND.min && d <= NEUTRAL_MID_BAND.max;
    });
    return {
      playerId: player.id,
      foundry: nearby.filter((neutral) => neutral.type === 'foundry').length,
      reactor: nearby.filter((neutral) => neutral.type === 'reactor').length,
    };
  });
  const neutralTypeCountRanges = {
    foundry:
      playerNeutralTypeCounts.length > 0
        ? Math.max(...playerNeutralTypeCounts.map((entry) => entry.foundry)) -
          Math.min(...playerNeutralTypeCounts.map((entry) => entry.foundry))
        : 0,
    reactor:
      playerNeutralTypeCounts.length > 0
        ? Math.max(...playerNeutralTypeCounts.map((entry) => entry.reactor)) -
          Math.min(...playerNeutralTypeCounts.map((entry) => entry.reactor))
        : 0,
  };

  const neutralsPerWedge = new Array(players.length).fill(0);
  const wedgeRadialAverages = new Array(players.length).fill(0);
  neutrals.forEach((neutral) => {
    let angle = Math.atan2(neutral.y - center.y, neutral.x - center.x);
    if (angle < 0) angle += Math.PI * 2;
    const index = Math.min(players.length - 1, Math.floor(angle / wedgeArc));
    neutralsPerWedge[index] += 1;
    wedgeRadialAverages[index] += distance(neutral.x, neutral.y, center.x, center.y);
  });
  const neutralWedgeCountRange =
    neutralsPerWedge.length > 0 ? Math.max(...neutralsPerWedge) - Math.min(...neutralsPerWedge) : 0;
  const neutralWedgeRadialRange =
    wedgeRadialAverages.length > 0
      ? Math.max(
          ...wedgeRadialAverages.map((sumDist, idx) =>
            neutralsPerWedge[idx] ? sumDist / neutralsPerWedge[idx] : 0
          )
        ) -
        Math.min(
          ...wedgeRadialAverages.map((sumDist, idx) =>
            neutralsPerWedge[idx] ? sumDist / neutralsPerWedge[idx] : 0
          )
        )
      : 0;

  const playerConnectivityCounts: PlayerConnectivityEntry[] = players.map((player) => {
    const hq = orderedHqs.find((structure) => structure.ownerId === player.id);
    if (!hq) return { playerId: player.id, connectivityCount: 0 };
    const connectivityCount = neutrals.filter(
      (neutral) => distance(neutral.x, neutral.y, hq.x, hq.y) <= CONNECTIVITY_RADIUS
    ).length;
    return { playerId: player.id, connectivityCount };
  });
  const connectivityRange =
    playerConnectivityCounts.length > 0
      ? Math.max(...playerConnectivityCounts.map((entry) => entry.connectivityCount)) -
        Math.min(...playerConnectivityCounts.map((entry) => entry.connectivityCount))
      : 0;

  const playerIsolationScores: PlayerIsolationEntry[] = players.map((player) => {
    const hq = orderedHqs.find((structure) => structure.ownerId === player.id);
    if (!hq) return { playerId: player.id, isolationScore: 0 };
    const nearestNeutrals = neutrals
      .map((neutral) => distance(neutral.x, neutral.y, hq.x, hq.y))
      .sort((a, b) => a - b)
      .slice(0, ISOLATION_NEUTRAL_COUNT);
    const closestEnemies = orderedHqs
      .filter((structure) => structure.ownerId !== player.id)
      .map((structure) => distance(structure.x, structure.y, hq.x, hq.y))
      .sort((a, b) => a - b)
      .slice(0, ISOLATION_HQ_COUNT);
    const isolationScore = avg(nearestNeutrals) + avg(closestEnemies);
    return { playerId: player.id, isolationScore };
  });
  const isolationRange =
    playerIsolationScores.length > 0
      ? Math.max(...playerIsolationScores.map((entry) => entry.isolationScore)) -
        Math.min(...playerIsolationScores.map((entry) => entry.isolationScore))
      : 0;

  let minStructureDistance = Number.POSITIVE_INFINITY;
  let minStructureClearance = Number.POSITIVE_INFINITY;
  let maxStructureDistanceToCenter = 0;
  for (let i = 0; i < structures.length; i++) {
    const structure = structures[i];
    const centerDistance = distance(structure.x, structure.y, center.x, center.y);
    if (centerDistance > maxStructureDistanceToCenter) {
      maxStructureDistanceToCenter = centerDistance;
    }
    for (let j = i + 1; j < structures.length; j++) {
      const a = structures[i];
      const b = structures[j];
      const d = distance(a.x, a.y, b.x, b.y);
      const clearance = d - (a.size + b.size);
      if (d < minStructureDistance) minStructureDistance = d;
      if (clearance < minStructureClearance) {
        minStructureClearance = clearance;
      }
    }
  }

  const centerNeutralCount = neutrals.filter(
    (n) => distance(n.x, n.y, center.x, center.y) <= CENTER_OCCUPANCY_RADIUS
  ).length;

  return {
    totalStructures: structures.length,
    neutralCount: neutrals.length,
    centerNeutralCount,
    visibleNeutralCounts,
    visibleEnemyCounts,
    visibleNeutralMin,
    visibleNeutralMax,
    visibleNeutralRange,
    visibleEnemyMax,
    visibleEnemyRange,
    playerSummaries,
    hqDistances,
    hqDistanceRange,
    adjacentHqDistances,
    adjacentHqRange,
    hqRadiusValues,
    hqRadiusRange,
    hqNearestEnemyDistances,
    hqNearestEnemyRange,
    hqAverageEnemyDistances,
    hqAverageEnemyRange,
    hqAngleMaxDeviationDeg,
    neutralAccess,
    nearestNeutralSpread,
    satelliteAngleStdDevDeg,
    neutralAngleStdDevDeg,
    playerClusterStats,
    clusterAverageRange,
    clusterMinSpacing: playerClusterStats.length ? Math.min(...playerClusterStats.map((s) => s.minSpacing)) : 0,
    clusterMaxSpacing: playerClusterStats.length ? Math.max(...playerClusterStats.map((s) => s.maxSpacing)) : 0,
    minForeignGapAcrossPlayers,
    playerNeutralAccessCounts,
    neutralNearCountRange,
    neutralMidCountRange,
    neutralFarCountRange,
    neutralNearMidCountRange,
    playerNeutralTypeCounts,
    neutralTypeCountRanges,
    neutralWedgeCountRange,
    neutralWedgeRadialRange,
    playerConnectivityCounts,
    connectivityRange,
    playerIsolationScores,
    isolationRange,
    maxStructureDistanceToCenter,
    minStructureDistance: Number.isFinite(minStructureDistance) ? minStructureDistance : 0,
    minStructureClearance: Number.isFinite(minStructureClearance) ? minStructureClearance : 0,
  };
}
