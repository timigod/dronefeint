import type { FairnessSummary } from './fairnessReport';

export type RawMetricDefinition = {
  title: string;
  description: string;
  getValue: (summary: FairnessSummary) => number;
  getSeed?: (summary: FairnessSummary) => number | null;
  format: (value: number) => string;
};

export const RAW_METRICS: RawMetricDefinition[] = [
  {
    title: 'Average HQ distance',
    description: 'Baseline travel time between neighboring command hubs.',
    getValue: (summary: FairnessSummary) => summary.averageHqDistance,
    format: (value: number) => `${value.toFixed(1)}u`,
  },
  {
    title: 'HQ radius spread',
    description: 'How evenly HQs stay on the main ring.',
    getValue: (summary: FairnessSummary) => summary.stats.hqRadiusRange.value,
    getSeed: (summary: FairnessSummary) => summary.stats.hqRadiusRange.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
  {
    title: 'Satellite angle stddev',
    description: 'Angular standard deviation of satellites vs wedge centers (higher is more organic).',
    getValue: (summary: FairnessSummary) => summary.stats.satelliteAngleStdDevDeg.value,
    getSeed: (summary: FairnessSummary) => summary.stats.satelliteAngleStdDevDeg.seed,
    format: (value: number) => `${value.toFixed(2)}°`,
  },
  {
    title: 'Neutral angle stddev',
    description: 'Angular standard deviation of neutrals vs wedge centers (higher is more organic).',
    getValue: (summary: FairnessSummary) => summary.stats.neutralAngleStdDevDeg.value,
    getSeed: (summary: FairnessSummary) => summary.stats.neutralAngleStdDevDeg.seed,
    format: (value: number) => `${value.toFixed(2)}°`,
  },
  {
    title: 'Closest satellite distance',
    description: 'Minimum HQ→satellite distance observed.',
    getValue: (summary: FairnessSummary) => summary.stats.clusterMinSpacing.value,
    getSeed: (summary: FairnessSummary) => summary.stats.clusterMinSpacing.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
  {
    title: 'Farthest satellite distance',
    description: 'Maximum HQ→satellite distance observed.',
    getValue: (summary: FairnessSummary) => summary.stats.clusterMaxSpacing.value,
    getSeed: (summary: FairnessSummary) => summary.stats.clusterMaxSpacing.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
  {
    title: 'Nearest-neutral spread',
    description: 'Difference in the sum of the first two neutrals per player.',
    getValue: (summary: FairnessSummary) => summary.stats.neutralSpread.value,
    getSeed: (summary: FairnessSummary) => summary.stats.neutralSpread.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
  {
    title: 'Min visible neutrals at spawn',
    description: 'Lowest number of neutral outposts any player sees at t=0.',
    getValue: (summary: FairnessSummary) => summary.stats.visibleNeutralMin.value,
    getSeed: (summary: FairnessSummary) => summary.stats.visibleNeutralMin.seed,
    format: (value: number) => `${value.toFixed(0)} outposts`,
  },
  {
    title: 'Neutral vision spread',
    description: 'Difference between most and least neutrals visible at spawn.',
    getValue: (summary: FairnessSummary) => summary.stats.visibleNeutralRange.value,
    getSeed: (summary: FairnessSummary) => summary.stats.visibleNeutralRange.seed,
    format: (value: number) => `${value.toFixed(0)} outposts`,
  },
  {
    title: 'Max visible enemy outposts',
    description: 'Highest number of enemy outposts any player sees at spawn.',
    getValue: (summary: FairnessSummary) => summary.stats.visibleEnemyMax.value,
    getSeed: (summary: FairnessSummary) => summary.stats.visibleEnemyMax.seed,
    format: (value: number) => `${value.toFixed(0)} outposts`,
  },
  {
    title: 'Center neutrals',
    description: 'How many neutrals spawned in the central area.',
    getValue: (summary: FairnessSummary) => summary.stats.centerNeutralCount.value,
    getSeed: (summary: FairnessSummary) => summary.stats.centerNeutralCount.seed,
    format: (value: number) => `${value.toFixed(0)}`,
  },
  {
    title: 'Min structure clearance',
    description: 'Smallest buffer between any two outposts.',
    getValue: (summary: FairnessSummary) => summary.stats.clearance.value,
    getSeed: (summary: FairnessSummary) => summary.stats.clearance.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
  {
    title: 'Max distance to center',
    description: 'Farthest any outpost spawned from the center.',
    getValue: (summary: FairnessSummary) => summary.stats.maxDistanceToCenter.value,
    getSeed: (summary: FairnessSummary) => summary.stats.maxDistanceToCenter.seed,
    format: (value: number) => `${value.toFixed(1)}u`,
  },
  {
    title: 'Minimum center-to-center distance',
    description: 'Closest pair of outposts before subtracting radii.',
    getValue: (summary: FairnessSummary) => summary.stats.minStructureDistance.value,
    getSeed: (summary: FairnessSummary) => summary.stats.minStructureDistance.seed,
    format: (value: number) => `${value.toFixed(2)}u`,
  },
];
