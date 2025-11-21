import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../../mapConstants';
import {
  DEFAULT_FAIRNESS_THRESHOLDS,
  buildFairnessNarrative,
  evaluateFairnessChecks,
  runFairnessSamples,
} from '../fairnessReport';

const SAMPLE_SIZE = Number(process.env.FAIRNESS_SAMPLE_SIZE ?? '1000');
const SAMPLE_START_SEED = Number(process.env.FAIRNESS_START_SEED ?? '1');
const { reports: SCENARIO_REPORTS, summary: FAIRNESS_SUMMARY_RAW } = runFairnessSamples(
  SAMPLE_SIZE,
  SAMPLE_START_SEED
);
const FAIRNESS_CHECKS = evaluateFairnessChecks(FAIRNESS_SUMMARY_RAW, DEFAULT_FAIRNESS_THRESHOLDS);
const FAIRNESS_NARRATIVE = buildFairnessNarrative(FAIRNESS_SUMMARY_RAW, DEFAULT_FAIRNESS_THRESHOLDS);

if (process.env.DEBUG_FAIRNESS === '1') {
  const worstSpread = SCENARIO_REPORTS.reduce(
    (acc, entry) =>
      entry.metrics.nearestNeutralSpread > acc.metrics.nearestNeutralSpread ? entry : acc,
    SCENARIO_REPORTS[0]
  );
  // eslint-disable-next-line no-console
  console.log(
    'Debug worst spread seed',
    worstSpread.seed,
    worstSpread.metrics.nearestNeutralSpread.toFixed(1),
    'isoRange',
    worstSpread.metrics.isolationRange.toFixed(1),
    'centerCount',
    worstSpread.metrics.centerNeutralCount
  );
  const hqs = worstSpread.scenario.structures.filter((s) => s.ownerId && s.type === 'hq');
  const neutrals = worstSpread.scenario.structures.filter((s) => !s.ownerId);
  const sums = hqs.map((hq) =>
    neutrals
      .map((n) => Math.hypot(hq.x - n.x, hq.y - n.y))
      .sort((a, b) => a - b)
      .slice(0, 2)
      .reduce((a, b) => a + b, 0)
      .toFixed(1)
  );
  // eslint-disable-next-line no-console
  console.log('Nearest-two sums', sums);
  const nearestTriples = hqs.map((hq) =>
    neutrals
      .map((n) => Math.hypot(hq.x - n.x, hq.y - n.y))
      .sort((a, b) => a - b)
      .slice(0, 3)
      .map((d) => d.toFixed(1))
  );
  // eslint-disable-next-line no-console
  console.log('Nearest distances (3)', nearestTriples);
}

const FAIRNESS_TABLE_ROW = {
  label: 'Scenario Fairness',
  seedsTested: FAIRNESS_SUMMARY_RAW.seedsTested,
  averageHqDistance: Number(FAIRNESS_SUMMARY_RAW.averageHqDistance.toFixed(2)),
  hqRadiusSpread: Number(FAIRNESS_SUMMARY_RAW.stats.hqRadiusRange.value.toFixed(2)),
  neutralSpread: Number(FAIRNESS_SUMMARY_RAW.stats.neutralSpread.value.toFixed(2)),
  neutralNearCountDiff: FAIRNESS_SUMMARY_RAW.stats.neutralNearCountRange.value,
  minStructureClearance: Number(FAIRNESS_SUMMARY_RAW.stats.clearance.value.toFixed(2)),
  maxStructureDistance: Number(FAIRNESS_SUMMARY_RAW.stats.maxDistanceToCenter.value.toFixed(2)),
};

if (process.env.VITEST_SILENT_FAIRNESS !== '1') {
  // eslint-disable-next-line no-console
  console.table([FAIRNESS_TABLE_ROW]);
  FAIRNESS_NARRATIVE.lines.forEach((line) => {
    // eslint-disable-next-line no-console
    console.log(line);
  });
}

describe('startingScenario fairness & balance', () => {
  it('meets ownership and count constraints across seeds', () => {
    SCENARIO_REPORTS.forEach(({ scenario, metrics }) => {
      expect(scenario.structures).toHaveLength(30);
      expect(metrics.neutralCount).toBe(10);
      metrics.playerSummaries.forEach((summary) => {
        expect(summary.total).toBe(4);
        expect(summary.hq).toBe(1);
        expect(summary.foundry).toBe(2);
        expect(summary.reactor).toBe(1);
      });
    });
  });

  it('keeps HQ spacing uniform and neutral reachability even', () => {
    FAIRNESS_CHECKS.forEach((check) => {
      expect(check.passed, `${check.label} failed: ${check.failText}`).toBe(true);
    });
  });

  it('keeps structures within map bounds and prevents overlap', () => {
    SCENARIO_REPORTS.forEach(({ scenario, metrics, seed }) => {
      scenario.structures.forEach((structure) => {
        expect(structure.x, `x bounds violated by ${structure.id} seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(structure.x).toBeLessThanOrEqual(MAP_WIDTH);
        expect(structure.y).toBeGreaterThanOrEqual(0);
        expect(structure.y).toBeLessThanOrEqual(MAP_HEIGHT);
      });
      expect(metrics.minStructureClearance, `clearance violated @seed ${seed}`).toBeGreaterThan(0);
    });
  });

  it('avoids a rigid polygon pattern across seeds (anti-hex)', () => {
    const minSatStd = Math.min(
      ...SCENARIO_REPORTS.map(({ metrics }) => metrics.satelliteAngleStdDevDeg)
    );
    const minNeuStd = Math.min(
      ...SCENARIO_REPORTS.map(({ metrics }) => metrics.neutralAngleStdDevDeg)
    );
    expect(
      minSatStd,
      `Satellite angles collapsed (stddev ${minSatStd.toFixed(2)}° < ${DEFAULT_FAIRNESS_THRESHOLDS.satelliteAngleStdDevDegMin}°)`
    ).toBeGreaterThanOrEqual(DEFAULT_FAIRNESS_THRESHOLDS.satelliteAngleStdDevDegMin);
    expect(
      minNeuStd,
      `Neutral angles collapsed (stddev ${minNeuStd.toFixed(2)}° < ${DEFAULT_FAIRNESS_THRESHOLDS.neutralAngleStdDevDegMin}°)`
    ).toBeGreaterThanOrEqual(DEFAULT_FAIRNESS_THRESHOLDS.neutralAngleStdDevDegMin);
  });
});
