import { evaluateScenarioFairness } from './fairnessMetrics';
import type { ScenarioFairnessMetrics } from './fairnessMetrics';
import { generateStartingScenario } from './startingScenario';
import type { Player } from './startingScenario';
import type { Structure } from '../structures';

export type ScenarioMetricsReport = {
  seed: number;
  scenario: {
    players: Player[];
    structures: Structure[];
    activePlayerIndex: number;
  };
  metrics: ScenarioFairnessMetrics;
};

export type FairnessStat = {
  value: number;
  seed: number | null;
};

export type FairnessStatKey =
  | 'adjacentRange'
  | 'hqRadiusRange'
  | 'hqNearestEnemyRange'
  | 'hqAverageEnemyRange'
  | 'hqAngleMaxDeviationDeg'
  | 'satelliteAngleStdDevDeg'
  | 'neutralAngleStdDevDeg'
  | 'centerNeutralCount'
  | 'centerNeutralCountMax'
  | 'neutralSpread'
  | 'clusterAverageRange'
  | 'clusterMinSpacing'
  | 'clusterMaxSpacing'
  | 'minForeignGap'
  | 'neutralNearCountRange'
  | 'neutralMidCountRange'
  | 'neutralFarCountRange'
  | 'neutralNearMidCountRange'
  | 'neutralFoundryRange'
  | 'neutralReactorRange'
  | 'connectivityRange'
  | 'isolationRange'
  | 'clearance'
  | 'maxDistanceToCenter'
  | 'minStructureDistance';

export type FairnessStats = Record<FairnessStatKey, FairnessStat>;

export type FairnessSummary = {
  seedsTested: number;
  averageHqDistance: number;
  stats: FairnessStats;
};

export type FairnessThresholds = {
  adjacentRange: number;
  hqRadiusRange: number;
  hqNearestEnemyRange: number;
  hqAverageEnemyRange: number;
  hqAngleMaxDeviationDeg: number;
  satelliteAngleStdDevDegMin: number;
  neutralAngleStdDevDegMin: number;
  minCenterNeutralCount: number;
  maxCenterNeutralCount: number;
  neutralSpread: number;
  clusterAverageRange: number;
  clusterMinSpacing: number;
  clusterMaxSpacing: number;
  minForeignGap: number;
  isolationRange: number;
  clearance: number;
  maxStructureDistanceToCenter: number;
};

export const DEFAULT_FAIRNESS_THRESHOLDS: FairnessThresholds = {
  adjacentRange: 20,
  hqRadiusRange: 15,
  hqNearestEnemyRange: 20,
  hqAverageEnemyRange: 30,
  hqAngleMaxDeviationDeg: 1.5,
  satelliteAngleStdDevDegMin: 6, // avoid rigid polygon for satellites
  neutralAngleStdDevDegMin: 5, // avoid rigid polygon for neutrals
  minCenterNeutralCount: 3,
  maxCenterNeutralCount: 7,
  neutralSpread: 350,
  clusterAverageRange: 60,
  clusterMinSpacing: 170,
  clusterMaxSpacing: 320,
  minForeignGap: 60,
  isolationRange: 300,
  clearance: 40,
  maxStructureDistanceToCenter: 1600,
};

export type FairnessCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  value: number;
  limit: number;
  seed: number | null;
  passText: string;
  failText: string;
};

type StatDefinition = {
  reducer: 'max' | 'min';
};

const STAT_CONFIG: Record<FairnessStatKey, StatDefinition> = {
  adjacentRange: { reducer: 'max' },
  hqRadiusRange: { reducer: 'max' },
  hqNearestEnemyRange: { reducer: 'max' },
  hqAverageEnemyRange: { reducer: 'max' },
  hqAngleMaxDeviationDeg: { reducer: 'max' },
  satelliteAngleStdDevDeg: { reducer: 'min' },
  neutralAngleStdDevDeg: { reducer: 'min' },
  centerNeutralCount: { reducer: 'min' },
  centerNeutralCountMax: { reducer: 'max' },
  neutralSpread: { reducer: 'max' },
  clusterAverageRange: { reducer: 'max' },
  clusterMinSpacing: { reducer: 'min' },
  clusterMaxSpacing: { reducer: 'max' },
  minForeignGap: { reducer: 'min' },
  neutralNearCountRange: { reducer: 'max' },
  neutralMidCountRange: { reducer: 'max' },
  neutralFarCountRange: { reducer: 'max' },
  neutralNearMidCountRange: { reducer: 'max' },
  neutralFoundryRange: { reducer: 'max' },
  neutralReactorRange: { reducer: 'max' },
  connectivityRange: { reducer: 'max' },
  isolationRange: { reducer: 'max' },
  clearance: { reducer: 'min' },
  maxDistanceToCenter: { reducer: 'max' },
  minStructureDistance: { reducer: 'min' },
};

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const createInitialStats = (): FairnessStats => {
  const stats = {} as FairnessStats;
  (Object.keys(STAT_CONFIG) as FairnessStatKey[]).forEach((key) => {
    stats[key] = {
      value: STAT_CONFIG[key].reducer === 'max' ? -Infinity : Infinity,
      seed: null,
    };
  });
  return stats;
};

const updateStat = (stats: FairnessStats, key: FairnessStatKey, value: number, seed: number) => {
  const { reducer } = STAT_CONFIG[key];
  if (!Number.isFinite(value)) return;
  if (reducer === 'max') {
    if (value > stats[key].value) stats[key] = { value, seed };
  } else if (value < stats[key].value) {
    stats[key] = { value, seed };
  }
};

const finalizeStat = (stat: FairnessStat, reducer: 'max' | 'min'): FairnessStat => {
  if (!Number.isFinite(stat.value)) {
    return { value: reducer === 'max' ? 0 : 0, seed: null };
  }
  return stat;
};

function summarizeReports(reports: ScenarioMetricsReport[]): FairnessSummary {
  const stats = createInitialStats();

  reports.forEach(({ metrics, seed }) => {
    updateStat(stats, 'adjacentRange', metrics.adjacentHqRange, seed);
    updateStat(stats, 'hqRadiusRange', metrics.hqRadiusRange, seed);
    updateStat(stats, 'hqNearestEnemyRange', metrics.hqNearestEnemyRange, seed);
    updateStat(stats, 'hqAverageEnemyRange', metrics.hqAverageEnemyRange, seed);
    updateStat(stats, 'hqAngleMaxDeviationDeg', metrics.hqAngleMaxDeviationDeg, seed);
    updateStat(stats, 'satelliteAngleStdDevDeg', metrics.satelliteAngleStdDevDeg, seed);
    updateStat(stats, 'neutralAngleStdDevDeg', metrics.neutralAngleStdDevDeg, seed);
    updateStat(stats, 'centerNeutralCount', metrics.centerNeutralCount, seed);
    updateStat(stats, 'centerNeutralCountMax', metrics.centerNeutralCount, seed);
    updateStat(stats, 'neutralSpread', metrics.nearestNeutralSpread, seed);
    updateStat(stats, 'clusterAverageRange', metrics.clusterAverageRange, seed);
    updateStat(stats, 'clusterMinSpacing', metrics.clusterMinSpacing, seed);
    updateStat(stats, 'clusterMaxSpacing', metrics.clusterMaxSpacing, seed);
    updateStat(stats, 'minForeignGap', metrics.minForeignGapAcrossPlayers, seed);
    updateStat(stats, 'neutralNearCountRange', metrics.neutralNearCountRange, seed);
    updateStat(stats, 'neutralMidCountRange', metrics.neutralMidCountRange, seed);
    updateStat(stats, 'neutralFarCountRange', metrics.neutralFarCountRange, seed);
    updateStat(stats, 'neutralNearMidCountRange', metrics.neutralNearMidCountRange, seed);
    updateStat(stats, 'neutralFoundryRange', metrics.neutralTypeCountRanges.foundry, seed);
    updateStat(stats, 'neutralReactorRange', metrics.neutralTypeCountRanges.reactor, seed);
    updateStat(stats, 'connectivityRange', metrics.connectivityRange, seed);
    updateStat(stats, 'isolationRange', metrics.isolationRange, seed);
    updateStat(stats, 'clearance', metrics.minStructureClearance, seed);
    updateStat(stats, 'maxDistanceToCenter', metrics.maxStructureDistanceToCenter, seed);
    updateStat(stats, 'minStructureDistance', metrics.minStructureDistance, seed);
  });

  (Object.keys(stats) as FairnessStatKey[]).forEach((key) => {
    stats[key] = finalizeStat(stats[key], STAT_CONFIG[key].reducer);
  });

  const allHqDistances = reports.flatMap((report) => report.metrics.hqDistances);
  return {
    seedsTested: reports.length,
    averageHqDistance: avg(allHqDistances),
    stats,
  };
}

const seedLabel = (seed: number | null) => (typeof seed === 'number' ? `seed #${seed}` : 'unknown seed');

type CheckDefinition = {
  id: string;
  label: string;
  statKey: FairnessStatKey;
  thresholdKey: keyof FairnessThresholds;
  direction: 'max' | 'min';
  passText: (value: number, limit: number) => string;
  failText: (value: number, limit: number, seed: number | null) => string;
};

const formatUnits = (value: number, digits = 1) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}u` : '—';
const formatDegrees = (value: number, digits = 2) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}°` : '—';

const CHECK_DEFINITIONS: CheckDefinition[] = [
  {
    id: 'adjacent',
    label: 'HQ spacing',
    statKey: 'adjacentRange',
    thresholdKey: 'adjacentRange',
    direction: 'max',
    passText: (value) => `Neighboring HQ distances only varied by ${formatUnits(value)}.`,
    failText: (value, limit, seed) =>
      `Neighbor HQ gap hit ${formatUnits(value)} on ${seedLabel(seed)} (limit ${formatUnits(limit)}).`,
  },
  {
    id: 'centerOccupancy',
    label: 'Center occupancy',
    statKey: 'centerNeutralCount',
    thresholdKey: 'minCenterNeutralCount',
    direction: 'min',
    passText: (value, limit) => `Center populated with ${value.toFixed(0)} neutrals (min ${limit}).`,
    failText: (value, limit, seed) =>
      `Center was sparse on ${seedLabel(seed)} (${value.toFixed(0)} < ${limit}).`,
  },
  {
    id: 'centerCap',
    label: 'Center not overcrowded',
    statKey: 'centerNeutralCountMax',
    thresholdKey: 'maxCenterNeutralCount',
    direction: 'max',
    passText: (value, limit) => `Center stayed breathable (${value.toFixed(0)} ≤ ${limit}).`,
    failText: (value, limit, seed) =>
      `Center overfilled on ${seedLabel(seed)} (${value.toFixed(0)} > ${limit}).`,
  },
  {
    id: 'antiHexSat',
    label: 'Organic satellite angles',
    statKey: 'satelliteAngleStdDevDeg',
    thresholdKey: 'satelliteAngleStdDevDegMin',
    direction: 'min',
    passText: (value, limit) => `Satellite angles varied (stddev ${formatDegrees(value)} ≥ ${formatDegrees(limit)}).`,
    failText: (value, limit, seed) =>
      `Satellite angles collapsed toward a rigid pattern (${formatDegrees(value)} < ${formatDegrees(limit)} on ${seedLabel(
        seed
      )}).`,
  },
  {
    id: 'antiHexNeu',
    label: 'Organic neutral angles',
    statKey: 'neutralAngleStdDevDeg',
    thresholdKey: 'neutralAngleStdDevDegMin',
    direction: 'min',
    passText: (value, limit) => `Neutral angles varied (stddev ${formatDegrees(value)} ≥ ${formatDegrees(limit)}).`,
    failText: (value, limit, seed) =>
      `Neutral angles collapsed toward a rigid ring (${formatDegrees(value)} < ${formatDegrees(limit)} on ${seedLabel(
        seed
      )}).`,
  },
  {
    id: 'hqRadius',
    label: 'Equal hub radius',
    statKey: 'hqRadiusRange',
    thresholdKey: 'hqRadiusRange',
    direction: 'max',
    passText: (value) => `All HQs stayed on the same ring (radius spread ${formatUnits(value)}).`,
    failText: (value, limit, seed) =>
      `HQ radius spread ${formatUnits(value)} on ${seedLabel(seed)} exceeded ${formatUnits(limit)}.`,
  },
  {
    id: 'hqNearest',
    label: 'Nearest enemy distance',
    statKey: 'hqNearestEnemyRange',
    thresholdKey: 'hqNearestEnemyRange',
    direction: 'max',
    passText: (value) => `Closest-enemy travel time was uniform (spread ${formatUnits(value)}).`,
    failText: (value, limit, seed) =>
      `One player had a closer enemy (spread ${formatUnits(value)} > ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
  {
    id: 'hqAverage',
    label: 'No free central player',
    statKey: 'hqAverageEnemyRange',
    thresholdKey: 'hqAverageEnemyRange',
    direction: 'max',
    passText: (value) => `Average distance to all rivals stayed tightly clustered (spread ${formatUnits(value)}).`,
    failText: (value, limit, seed) =>
      `Someone sat more central (${formatUnits(value)} spread > ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
  {
    id: 'hqAngle',
    label: 'Rotational symmetry',
    statKey: 'hqAngleMaxDeviationDeg',
    thresholdKey: 'hqAngleMaxDeviationDeg',
    direction: 'max',
    passText: (value) => `HQ angles formed a clean pentagon (max deviation ${formatDegrees(value)}).`,
    failText: (value, limit, seed) =>
      `HQ angles drifted ${formatDegrees(value)} on ${seedLabel(seed)} (limit ${formatDegrees(limit)}).`,
  },
  {
    id: 'clusterSpacing',
    label: 'Cluster spacing match',
    statKey: 'clusterAverageRange',
    thresholdKey: 'clusterAverageRange',
    direction: 'max',
    passText: (value) => `HQ→satellite spacing matched across players (${formatUnits(value)} spread).`,
    failText: (value, limit, seed) =>
      `Cluster spacing spread ${formatUnits(value)} on ${seedLabel(seed)} (limit ${formatUnits(limit)}).`,
  },
  {
    id: 'clusterInner',
    label: 'Cluster inner radius',
    statKey: 'clusterMinSpacing',
    thresholdKey: 'clusterMinSpacing',
    direction: 'min',
    passText: (value, limit) => `Closest satellite stayed ${formatUnits(value)} from its HQ (limit ${formatUnits(limit)}).`,
    failText: (value, limit, seed) =>
      `A satellite was only ${formatUnits(value)} from its HQ (needs ≥ ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
  {
    id: 'clusterOuter',
    label: 'Cluster outer radius',
    statKey: 'clusterMaxSpacing',
    thresholdKey: 'clusterMaxSpacing',
    direction: 'max',
    passText: (value, limit) => `No satellite drifted beyond ${formatUnits(value)} (limit ${formatUnits(limit)}).`,
    failText: (value, limit, seed) =>
      `A satellite pushed to ${formatUnits(value)} (limit ${formatUnits(limit)}) on ${seedLabel(seed)}.`,
  },
  {
    id: 'foreignGap',
    label: 'No unfair adjacency',
    statKey: 'minForeignGap',
    thresholdKey: 'minForeignGap',
    direction: 'min',
    passText: (value) => `Every starting outpost favored its owner (foreign gap ${formatUnits(value)}).`,
    failText: (value, limit, seed) =>
      `A starting outpost was too close to an enemy HQ (${formatUnits(value)} < ${formatUnits(limit)} on ${seedLabel(
        seed
      )}).`,
  },
  {
    id: 'neutralSpread',
    label: 'Neutral reach parity',
    statKey: 'neutralSpread',
    thresholdKey: 'neutralSpread',
    direction: 'max',
    passText: (value) => `First neutral targets landed within ${formatUnits(value)} total difference.`,
    failText: (value, limit, seed) =>
      `Neutral reach skewed (${formatUnits(value)} > ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
  {
    id: 'isolation',
    label: 'No isolated player',
    statKey: 'isolationRange',
    thresholdKey: 'isolationRange',
    direction: 'max',
    passText: (value) => `No one was stranded (isolation spread ${formatUnits(value)}).`,
    failText: (value, limit, seed) =>
      `Someone was isolated (${formatUnits(value)} > ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
  {
    id: 'clearance',
    label: 'Structure clearance',
    statKey: 'clearance',
    thresholdKey: 'clearance',
    direction: 'min',
    passText: (value, limit) => `All structures spawned with at least ${formatUnits(value)} clearance (limit ${formatUnits(limit)}).`,
    failText: (value, limit, seed) =>
      `Two structures nearly overlapped on ${seedLabel(seed)} (${formatUnits(value)} < ${formatUnits(limit)}).`,
  },
  {
    id: 'maxDistance',
    label: 'Bounded travel distances',
    statKey: 'maxDistanceToCenter',
    thresholdKey: 'maxStructureDistanceToCenter',
    direction: 'max',
    passText: (value, limit) => `No outpost spawned beyond ${formatUnits(value)} from center (limit ${formatUnits(limit)}).`,
    failText: (value, limit, seed) =>
      `An outpost was too far (${formatUnits(value)} > ${formatUnits(limit)} on ${seedLabel(seed)}).`,
  },
];

export function evaluateFairnessChecks(
  summary: FairnessSummary,
  thresholds: FairnessThresholds = DEFAULT_FAIRNESS_THRESHOLDS
): FairnessCheckResult[] {
  return CHECK_DEFINITIONS.map((definition) => {
    const stat = summary.stats[definition.statKey];
    const limit = thresholds[definition.thresholdKey];
    const value = stat?.value ?? 0;
    const seed = stat?.seed ?? null;
    const passed =
      definition.direction === 'max' ? value <= limit : value >= limit;
    return {
      id: definition.id,
      label: definition.label,
      passed,
      value,
      limit,
      seed,
      passText: definition.passText(value, limit),
      failText: definition.failText(value, limit, seed),
    };
  });
}

export function buildFairnessNarrative(
  summary: FairnessSummary,
  thresholds: FairnessThresholds = DEFAULT_FAIRNESS_THRESHOLDS
) {
  const checks = evaluateFairnessChecks(summary, thresholds);
  const lines = [
    `Across ${summary.seedsTested} seeds, neighboring HQ travel distance stayed around ${summary.averageHqDistance.toFixed(
      0
    )} units.`,
    ...checks.map((check) => `${check.passed ? '✅' : '⚠️'} ${check.passed ? check.passText : check.failText}`),
  ];
  return { checks, lines };
}

export function runFairnessSamples(sampleSize: number, startSeed = 1) {
  const reports: ScenarioMetricsReport[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const seed = startSeed + i;
    const scenario = generateStartingScenario({ seed });
    const metrics = evaluateScenarioFairness(scenario.players, scenario.structures);
    reports.push({ seed, scenario, metrics });
  }

  return {
    reports,
    summary: summarizeReports(reports),
  };
}
