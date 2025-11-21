import outpostNamesRaw from '../../../outpost-names.txt?raw';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import { Structure } from '../structures';
import { rebalanceNeutrals } from './neutralRebalancer';

export type Player = {
  id: string;
  name: string;
  color: string;
};

const PLAYER_COLORS = ['#dc3545', '#28a745', '#17a2b8', '#ffc107', '#6f42c1'];
const NEUTRAL_COLORS = ['#969aa6', '#b0b4b8'];

const OUTPOST_NAMES = outpostNamesRaw
  .split(/\r?\n/)
  .map((n) => n.trim())
  .filter(Boolean);

// Core sizes used by rendering; also double as collision radii seeds
const sizeByType: Record<'hq' | 'foundry' | 'reactor', number> = {
  hq: 25,
  foundry: 24,
  reactor: 25,
};

// Geometry and fairness parameters (tuned conservatively; adjust after playtest)
const NUM_PLAYERS = 5;
const TWO_PI = Math.PI * 2;
const WEDGE_ARC = TWO_PI / NUM_PLAYERS; // 72 deg

// Travel-time-derived spacing. If carrier speed changes, update CARRIER_SPEED_UNITS_PER_SEC or directly set HQ_HQ_MIN_DISTANCE.
const MIN_HQ_TRAVEL_TIME_SEC = 180; // 3 minutes target
const CARRIER_SPEED_UNITS_PER_SEC = 6; // assumption; adjust with gameplay tuning
const HQ_HQ_MIN_DISTANCE = MIN_HQ_TRAVEL_TIME_SEC * CARRIER_SPEED_UNITS_PER_SEC; // straight-line chord target
const SAT_COUNT = 3;
const SAT_ANGLE_SPREAD = (100 * Math.PI) / 180; // half-angle from center-facing vector
const SAT_MIN_ANGLE_SEP = (35 * Math.PI) / 180;

// Cluster sampling (relative to each HQ, sampled within player wedge)
// We keep min/max distances as fairness guardrails and sample angle within the wedge.
const CLUSTER_JITTER_RADIAL = 25;
const CLUSTER_JITTER_TANGENTIAL = 35;
const CLUSTER_TANGENTIAL_MAX = 140;
const CLUSTER_DISTANCE_MIN = 210;
const CLUSTER_DISTANCE_MAX = 320;
const CLUSTER_MIN_SEPARATION = 140;
const CLUSTER_FOREIGN_MARGIN = 60;
const CLUSTER_MAX_ATTEMPTS = 500;
const CROSS_PLAYER_SONAR_BUFFER = 380;

const NEUTRAL_MIN_SEPARATION = 240;
const NEUTRAL_COUNT = NUM_PLAYERS * 2; // 10 neutrals total in current game setup
const NEUTRAL_TYPE_POOL: Array<'foundry' | 'reactor'> = [
  'foundry',
  'foundry',
  'foundry',
  'foundry',
  'foundry',
  'reactor',
  'reactor',
  'reactor',
  'reactor',
  'reactor',
];
const NEUTRAL_CENTER_COUNT_RANGE = { min: 3, max: 7 };
const NEUTRAL_NEAR_RADIUS = 450;
const CENTER_OCCUPANCY_RADIUS = 450;
const NEUTRAL_MID_RADIUS = 900;
const NEUTRAL_FAR_RADIUS = 1400;
const NEUTRAL_MID_BAND = { min: NEUTRAL_NEAR_RADIUS, max: NEUTRAL_MID_RADIUS };
const NEUTRAL_WEDGE_OFFSET_MIN = 0.15;
const BACKFIELD_PER_PLAYER = 1;
const BACKFIELD_RADIUS_RANGE: [number, number] = [340, 430];
const BACKFIELD_ANGLE_JITTER = Math.PI;
const BACKFIELD_COUNT = 3;
const CENTER_NEUTRAL_RADIUS_RANGE: [number, number] = [220, 420];
const OUTER_NEUTRAL_RADIUS_RANGE: [number, number] = [650, 1250];

// Absolute center-based neutral bands to avoid a central void
const CENTER_BAND_RADIUS_MIN = 280;
const CENTER_BAND_RADIUS_MAX = 380;
const MID_BAND_RADIUS_MIN = 650;
const MID_BAND_RADIUS_MAX = 820;

// Final visual margin (percentage of map dims) after normalization
const TARGET_MARGIN_RATIO = 0.02;
const DEBUG_FAIRNESS = typeof process !== 'undefined' && (process.env?.DEBUG_FAIRNESS === '1' || false);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function length(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function polar(center: { x: number; y: number }, r: number, angle: number) {
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

function project(
  anchorX: number,
  anchorY: number,
  angle: number,
  radial: number,
  tangential: number
): { x: number; y: number } {
  const radialUnit = { x: Math.cos(angle), y: Math.sin(angle) };
  const tangentialUnit = { x: -Math.sin(angle), y: Math.cos(angle) };
  return {
    x: anchorX + radialUnit.x * radial + tangentialUnit.x * tangential,
    y: anchorY + radialUnit.y * radial + tangentialUnit.y * tangential,
  };
}

const randomRange = (min: number, max: number, rng: () => number) => min + (max - min) * rng();
const clampAngle = (a: number) => {
  let angle = a;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
};

type LabeledPoint = { x: number; y: number; id: string; type: 'hq' | 'foundry' | 'reactor'; ownerId?: string };
type NeutralPlacement = { x: number; y: number; type?: 'foundry' | 'reactor' };

type NeutralFormationContext = {
  center: { x: number; y: number };
  rotationOffset: number;
  placed: LabeledPoint[];
  rng: () => number;
};

type AngleOffsetArgs = {
  wedgeIndex: number;
  totalWedges: number;
  rng: () => number;
};

type NeutralBandConfig = {
  id: 'inner' | 'mid';
  type: 'foundry' | 'reactor';
  radiusRange: [number, number];
  angleOffset: (args: AngleOffsetArgs) => number;
  angleJitter: number;
  radialJitter: number;
};

type NeutralFormationConfig = {
  name: NeutralFormationType;
  bands: NeutralBandConfig[];
};

type NeutralTemplate = {
  id: 'cluster' | 'belt' | 'sprawl';
  radiusRange: [number, number];
  angleBias: number;
  angleJitter: number;
};

const NEUTRAL_TEMPLATES: NeutralTemplate[] = [
  { id: 'cluster', radiusRange: [750, 950], angleBias: 0, angleJitter: Math.PI },
  { id: 'belt', radiusRange: [900, 1200], angleBias: 0, angleJitter: Math.PI },
  { id: 'sprawl', radiusRange: [800, 1300], angleBias: 0, angleJitter: Math.PI },
];

function canPlaceNeutral(
  candidate: { x: number; y: number },
  placed: LabeledPoint[],
  neutrals: NeutralPlacement[]
): boolean {
  const safeFromPlayers = placed.every(
    (structure) => length(structure, candidate) >= NEUTRAL_MIN_SEPARATION
  );
  if (!safeFromPlayers) return false;
  return neutrals.every((neutral) => length(neutral, candidate) >= NEUTRAL_MIN_SEPARATION);
}

const tryPlaceNeutral = ({
  attempts,
  sampler,
  placed,
  neutrals,
  extraCheck,
}: {
  attempts: number;
  sampler: () => { x: number; y: number };
  placed: LabeledPoint[];
  neutrals: NeutralPlacement[];
  extraCheck?: (candidate: { x: number; y: number }) => boolean;
}): NeutralPlacement | null => {
  for (let i = 0; i < attempts; i++) {
    const candidate = sampler();
    if (extraCheck && !extraCheck(candidate)) continue;
    if (canPlaceNeutral(candidate, placed, neutrals)) {
      return { x: candidate.x, y: candidate.y };
    }
  }
  return null;
};

const computeNeutralStats = ({
  neutrals,
  hqs,
  center,
}: {
  neutrals: NeutralPlacement[];
  hqs: LabeledPoint[];
  center: { x: number; y: number };
}) => {
  const nearCounts: number[] = [];
  const midCounts: number[] = [];
  const farCounts: number[] = [];
  const angles: number[] = [];
  const wedgeArc = TWO_PI / hqs.length;

  const orderedHqs = hqs
    .map((hq) => ({
      hq,
      angle: Math.atan2(hq.y - center.y, hq.x - center.x),
    }))
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.hq);

  const wedgeCenters = orderedHqs.map((hq) => {
    const a = Math.atan2(hq.y - center.y, hq.x - center.x);
    return (a + wedgeArc / 2 + TWO_PI) % TWO_PI;
  });

  neutrals.forEach((neutral) => {
    const angle = Math.atan2(neutral.y - center.y, neutral.x - center.x);
    const dists = orderedHqs.map((hq) => length(hq, neutral));
    orderedHqs.forEach((hq, idx) => {
      const d = dists[idx];
      if (!nearCounts[idx]) nearCounts[idx] = 0;
      if (!midCounts[idx]) midCounts[idx] = 0;
      if (!farCounts[idx]) farCounts[idx] = 0;
      if (d <= NEUTRAL_NEAR_RADIUS) nearCounts[idx] += 1;
      else if (d <= NEUTRAL_MID_BAND.max) midCounts[idx] += 1;
      else if (d <= NEUTRAL_FAR_RADIUS) farCounts[idx] += 1;
    });

    angles.push(angle);
    // nearest wedge center
    let bestDiff = Infinity;
    let diff = 0;
    wedgeCenters.forEach((wc) => {
      const delta = Math.abs(clampAngle(angle - wc));
      if (delta < bestDiff) {
        bestDiff = delta;
        diff = delta;
      }
    });
  });

  const playerNearestSums = hqs.map((hq) => {
    const dists = neutrals.map((n) => length(n, hq)).sort((a, b) => a - b);
    const pair = dists.slice(0, 2);
    return pair.reduce((a, b) => a + b, 0);
  });

  const nearRange = Math.max(...nearCounts) - Math.min(...nearCounts);
  const midRange = Math.max(...midCounts) - Math.min(...midCounts);
  const nearMidRange =
    Math.max(...nearCounts.map((c, i) => c + (midCounts[i] ?? 0))) -
    Math.min(...nearCounts.map((c, i) => c + (midCounts[i] ?? 0)));
  const neutralSpread =
    playerNearestSums.length > 0
      ? Math.max(...playerNearestSums) - Math.min(...playerNearestSums)
      : 0;

  const centerCount = neutrals.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length;

  const angleMean =
    angles.length > 0 ? angles.reduce((sum, a) => sum + a, 0) / angles.length : 0;
  const angleVariance =
    angles.length > 1
      ? angles.reduce((sum, a) => sum + Math.pow(clampAngle(a - angleMean), 2), 0) / angles.length
      : 0;
  const neutralAngleStdDevDeg = Math.sqrt(angleVariance) * (180 / Math.PI);

  return {
    nearRange,
    midRange,
    nearMidRange,
    centerCount,
    neutralAngleStdDevDeg,
    neutralSpread,
  };
};

const minAngleOffsetToWedge = (
  point: { x: number; y: number },
  hqs: LabeledPoint[],
  center: { x: number; y: number }
) => {
  if (!hqs.length) return Math.PI;
  const wedgeArc = TWO_PI / hqs.length;
  const hqAngles = hqs
    .map((hq) => Math.atan2(hq.y - center.y, hq.x - center.x))
    .sort((a, b) => a - b);
  const wedgeCenters = hqAngles.map((a) => (a + wedgeArc / 2 + TWO_PI) % TWO_PI);
  const angle = (Math.atan2(point.y - center.y, point.x - center.x) + TWO_PI) % TWO_PI;
  let best = Math.PI;
  wedgeCenters.forEach((wc) => {
    const diff = Math.abs(clampAngle(angle - wc));
    if (diff < best) best = diff;
  });
  return best;
};

const scoreNeutrals = ({
  neutrals,
  hqs,
  center,
}: {
  neutrals: NeutralPlacement[];
  hqs: LabeledPoint[];
  center: { x: number; y: number };
}) => {
  const stats = computeNeutralStats({ neutrals, hqs, center });
  const anglePenalty = Math.max(0, 5 - stats.neutralAngleStdDevDeg);
  const centerPenalty =
    stats.centerCount < NEUTRAL_CENTER_COUNT_RANGE.min
      ? (NEUTRAL_CENTER_COUNT_RANGE.min - stats.centerCount) * 40
      : stats.centerCount > NEUTRAL_CENTER_COUNT_RANGE.max
      ? (stats.centerCount - NEUTRAL_CENTER_COUNT_RANGE.max) * 40
      : 0;

  return (
    stats.nearRange * 10 +
    stats.midRange * 8 +
    stats.nearMidRange * 12 +
    stats.neutralSpread * 1.2 +
    anglePenalty * 50 +
    centerPenalty
  );
};

const placeBackfieldNeutral = ({
  hq,
  hqs,
  center,
  placed,
  neutrals,
  rng,
}: {
  hq: LabeledPoint;
  hqs: LabeledPoint[];
  center: { x: number; y: number };
  placed: LabeledPoint[];
  neutrals: NeutralPlacement[];
  rng: () => number;
}): NeutralPlacement | null => {
  const angleFromCenter = Math.atan2(hq.y - center.y, hq.x - center.x);
  const backAngle = angleFromCenter + (rng() - 0.5) * BACKFIELD_ANGLE_JITTER;
  return tryPlaceNeutral({
    attempts: 80,
    placed,
    neutrals,
    extraCheck: (candidate) => minAngleOffsetToWedge(candidate, [hq, ...hqs], center) >= NEUTRAL_WEDGE_OFFSET_MIN,
    sampler: () => {
      const radial = randomRange(BACKFIELD_RADIUS_RANGE[0], BACKFIELD_RADIUS_RANGE[1], rng);
      const pos = project(hq.x, hq.y, backAngle, radial, (rng() - 0.5) * 60);
      return pos;
    },
  });
};

const placeCenterNeutral = ({
  center,
  placed,
  neutrals,
  hqs,
  rng,
}: {
  center: { x: number; y: number };
  placed: LabeledPoint[];
  neutrals: NeutralPlacement[];
  hqs: LabeledPoint[];
  rng: () => number;
}): NeutralPlacement | null =>
  tryPlaceNeutral({
    attempts: 120,
    placed,
    neutrals,
    extraCheck: (candidate) =>
      hqs.every((hq) => length(candidate, hq) >= NEUTRAL_NEAR_RADIUS + 40) &&
      minAngleOffsetToWedge(candidate, hqs, center) >= NEUTRAL_WEDGE_OFFSET_MIN,
    sampler: () => {
      const radius = randomRange(CENTER_NEUTRAL_RADIUS_RANGE[0], CENTER_NEUTRAL_RADIUS_RANGE[1], rng);
      const angle = rng() * TWO_PI;
      return polar(center, radius, angle);
    },
  });

const placeOuterNeutral = ({
  center,
  placed,
  neutrals,
  hqs,
  rng,
}: {
  center: { x: number; y: number };
  placed: LabeledPoint[];
  neutrals: NeutralPlacement[];
  hqs: LabeledPoint[];
  rng: () => number;
}): NeutralPlacement | null => {
  const template = NEUTRAL_TEMPLATES[Math.floor(rng() * NEUTRAL_TEMPLATES.length)];
  return tryPlaceNeutral({
    attempts: 140,
    placed,
    neutrals,
    extraCheck: (candidate) =>
      hqs.every((hq) => length(candidate, hq) >= NEUTRAL_NEAR_RADIUS + 40) &&
      minAngleOffsetToWedge(candidate, hqs, center) >= NEUTRAL_WEDGE_OFFSET_MIN,
    sampler: () => {
      const radius = randomRange(template.radiusRange[0], template.radiusRange[1], rng);
      const angle = rng() * TWO_PI + (rng() - 0.5) * template.angleJitter + template.angleBias;
      return polar(center, radius, angle);
    },
  });
};

const improveNeutrals = ({
  neutrals,
  placed,
  hqs,
  center,
  rng,
}: {
  neutrals: NeutralPlacement[];
  placed: LabeledPoint[];
  hqs: LabeledPoint[];
  center: { x: number; y: number };
  rng: () => number;
}) => {
  let best = neutrals.slice();
  let bestScore = scoreNeutrals({ neutrals: best, hqs, center });

  const sampleCandidate = (current: NeutralPlacement[]) => {
    if (rng() < 0.3) {
      const radius = randomRange(CENTER_NEUTRAL_RADIUS_RANGE[0], CENTER_NEUTRAL_RADIUS_RANGE[1], rng);
      const angle = rng() * TWO_PI;
      return polar(center, radius, angle);
    }
    const template = NEUTRAL_TEMPLATES[Math.floor(rng() * NEUTRAL_TEMPLATES.length)];
    const radius = randomRange(template.radiusRange[0], template.radiusRange[1], rng);
    const angle = rng() * TWO_PI;
    return polar(center, radius, angle);
  };

  for (let iter = 0; iter < 400; iter++) {
    const idx = Math.floor(rng() * best.length);
    const proposal = sampleCandidate(best);
    if (minAngleOffsetToWedge(proposal, hqs, center) < NEUTRAL_WEDGE_OFFSET_MIN) continue;
    const without = best.filter((_, i) => i !== idx);
    if (!canPlaceNeutral(proposal, placed, without)) continue;
    const next = without.concat([{ x: proposal.x, y: proposal.y }]);
    const score = scoreNeutrals({ neutrals: next, hqs, center });
    if (score < bestScore) {
      bestScore = score;
      best = next;
    }
  }

  return best;
};

const balanceNeutralReach = ({
  neutrals,
  placed,
  hqs,
  center,
  rng,
}: {
  neutrals: NeutralPlacement[];
  placed: LabeledPoint[];
  hqs: LabeledPoint[];
  center: { x: number; y: number };
  rng: () => number;
}) => {
  const nearestSums = () =>
    hqs.map((hq) => {
      const dists = neutrals.map((n) => length(n, hq)).sort((a, b) => a - b);
      return dists.slice(0, 2).reduce((a, b) => a + b, 0);
    });

  let attempts = 0;
  while (attempts++ < 200) {
    const sums = nearestSums();
    const max = Math.max(...sums);
    const min = Math.min(...sums);
    const currentSpread = max - min;
    if (currentSpread <= 120) break;
    const targetIdx = sums.indexOf(max);
    const targetHq = hqs[targetIdx];
    const replaceIdx = neutrals.reduce(
      (acc, n, idx) => {
        const d = length(n, targetHq);
        return d > acc.bestDist ? { idx, bestDist: d } : acc;
      },
      { idx: 0, bestDist: -Infinity }
    ).idx;

    let proposal: NeutralPlacement | null = null;
    for (let t = 0; t < 200 && !proposal; t++) {
      const angle = rng() * TWO_PI;
      const radius = randomRange(260, 720, rng);
      const candidate = polar(targetHq, radius, angle);
      if (minAngleOffsetToWedge(candidate, hqs, center) < NEUTRAL_WEDGE_OFFSET_MIN) continue;
      if (!canPlaceNeutral(candidate, placed, neutrals.filter((_, i) => i !== replaceIdx))) continue;
      proposal = { x: candidate.x, y: candidate.y };
    }
    if (!proposal) break;
    const previous = neutrals[replaceIdx];
    neutrals[replaceIdx] = proposal;
    const newSums = nearestSums();
    const newSpread = Math.max(...newSums) - Math.min(...newSums);
    if (newSpread >= currentSpread) {
      neutrals[replaceIdx] = previous;
      continue;
    }
  }
  return neutrals;
};

export type StartingScenarioOptions = {
  seed?: number;
};

export function generateStartingScenario(options: StartingScenarioOptions = {}): {
  players: Player[];
  structures: Structure[];
  activePlayerIndex: number;
} {
  const resolvedSeed =
    typeof options.seed === 'number' && Number.isFinite(options.seed)
      ? Math.max(1, Math.floor(Math.abs(options.seed)))
      : Math.floor(Math.random() * 1e9) || 1;
  let s = resolvedSeed;
  const rng = () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };

  const players: Player[] = PLAYER_COLORS.map((color, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color,
  }));
  const activePlayerIndex = 0;

  const center = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

  // Anchor radius derived from min HQ-HQ chord distance
  const ringRadius = HQ_HQ_MIN_DISTANCE / (2 * Math.sin(Math.PI / NUM_PLAYERS));

  // Build HQs on the ring (perfect rotational symmetry)
  const rotationOffset = rng() * TWO_PI;
  const hqs: LabeledPoint[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const theta = rotationOffset + (i * TWO_PI) / NUM_PLAYERS;
    const p = polar(center, ringRadius, theta);
    hqs.push({ x: p.x, y: p.y, id: `p${i + 1}-hq`, type: 'hq', ownerId: `p${i + 1}` });
  }

  const placed: LabeledPoint[] = [...hqs];

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const player = players[i];
    const anchor = hqs[i];
    const enemyHqs = hqs.filter((hq) => hq.ownerId !== player.id);
    const local: LabeledPoint[] = [];

    const baseDir = Math.atan2(center.y - anchor.y, center.x - anchor.x);
    const sats: Array<{ x: number; y: number }> = [];
    for (let s = 0; s < SAT_COUNT; s++) {
      let satTries = 0;
      while (satTries++ < 60) {
        const off = (rng() - 0.5) * 2 * SAT_ANGLE_SPREAD;
        const angle = baseDir + off;
        const r =
          CLUSTER_DISTANCE_MIN +
          (CLUSTER_DISTANCE_MAX - CLUSTER_DISTANCE_MIN) * (0.35 + 0.65 * rng());
        const pos = polar(anchor, r, angle);
        const distToOwn = r;
        if (distToOwn < CLUSTER_DISTANCE_MIN || distToOwn > CLUSTER_DISTANCE_MAX) continue;
        if (sats.some((sat) => length(sat, pos) < CLUSTER_MIN_SEPARATION)) continue;
        const angleToAnchor = Math.atan2(pos.y - anchor.y, pos.x - anchor.x);
        if (
          sats.some(
            (sat) =>
              Math.abs(clampAngle(Math.atan2(sat.y - anchor.y, sat.x - anchor.x) - angleToAnchor)) <
              SAT_MIN_ANGLE_SEP
          )
        )
          continue;
        const minEnemy = Math.min(...enemyHqs.map((hq) => length(hq, pos)));
        if (minEnemy - distToOwn < CLUSTER_FOREIGN_MARGIN) continue;
        if (enemyHqs.some((hq) => length(hq, pos) < CROSS_PLAYER_SONAR_BUFFER)) continue;
        if (
          placed.some(
            (structure) =>
              structure.ownerId !== player.id && length(structure, pos) < CLUSTER_MIN_SEPARATION
          )
        )
          continue;
        sats.push(pos);
        break;
      }
    }

    if (sats.length === 3) {
      const satellitesToPlace: Array<{ id: string; type: 'foundry' | 'reactor' }> = [
        { id: 'foundry-a', type: 'foundry' },
        { id: 'foundry-b', type: 'foundry' },
        { id: 'reactor', type: 'reactor' },
      ];
      for (let si = 0; si < 3; si++) {
        const spot = sats[si];
        const spec = satellitesToPlace[si];
        const point: LabeledPoint = {
          id: `${player.id}-${spec.id}`,
          type: spec.type,
          x: spot.x,
          y: spot.y,
          ownerId: player.id,
        };
        local.push(point);
        placed.push(point);
      }
    }
  }

  let neutralPlacements: NeutralPlacement[] = [];

  // Small center cluster to satisfy occupancy without locking into a star
  for (let i = 0; i < NEUTRAL_CENTER_COUNT_RANGE.min && neutralPlacements.length < NEUTRAL_COUNT; i++) {
    const centerNeutral = placeCenterNeutral({ center, placed, neutrals: neutralPlacements, hqs, rng });
    if (centerNeutral) neutralPlacements.push(centerNeutral);
  }

  // Backfield neutrals: a subset of players, to avoid rigid pentagon symmetry
  const shuffledHqs = shuffle(hqs, rng);
  for (let i = 0; i < Math.min(BACKFIELD_COUNT, shuffledHqs.length); i++) {
    if (neutralPlacements.length >= NEUTRAL_COUNT) break;
    const backfield = placeBackfieldNeutral({
      hq: shuffledHqs[i],
      hqs,
      center,
      placed,
      neutrals: neutralPlacements,
      rng,
    });
    if (backfield) neutralPlacements.push(backfield);
  }

  // Mid neutrals: rotate across players with large angular jitter to avoid rigid spokes
  while (neutralPlacements.length < NEUTRAL_COUNT) {
    const playerIdx = neutralPlacements.length % NUM_PLAYERS;
    const targetAngle = rng() * TWO_PI;
    const mid = tryPlaceNeutral({
      attempts: 140,
      placed,
      neutrals: neutralPlacements,
      extraCheck: (candidate) => hqs.every((hq) => length(candidate, hq) >= NEUTRAL_NEAR_RADIUS - 30),
      sampler: () => {
        const radius = randomRange(880, 1150, rng);
        return polar(center, radius, targetAngle);
      },
    });
    if (mid) {
      neutralPlacements.push(mid);
    } else {
      const filler = placeOuterNeutral({ center, placed, neutrals: neutralPlacements, hqs, rng });
      if (!filler) break;
      neutralPlacements.push(filler);
    }
  }

  neutralPlacements = improveNeutrals({
    neutrals: neutralPlacements,
    placed,
    hqs,
    center,
    rng,
  });

  neutralPlacements = balanceNeutralReach({
    neutrals: neutralPlacements,
    placed,
    hqs,
    center,
    rng,
  });

  // If we still came up short on neutrals, aggressively top up with relaxed placement to avoid rerolls
  if (neutralPlacements.length < NEUTRAL_COUNT) {
    let fillAttempts = 0;
    while (neutralPlacements.length < NEUTRAL_COUNT && fillAttempts++ < 600) {
      const angle = rng() * TWO_PI;
      const radius = randomRange(CENTER_BAND_RADIUS_MIN, NEUTRAL_FAR_RADIUS, rng);
      const candidate = polar(center, radius, angle);
      if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
        continue;
      if (minAngleOffsetToWedge(candidate, hqs, center) < NEUTRAL_WEDGE_OFFSET_MIN * 0.5) continue;
      if (!canPlaceNeutral(candidate, placed, neutralPlacements)) continue;
      neutralPlacements.push({ x: candidate.x, y: candidate.y });
    }
  }

  // Guarantee each player has two reasonably close neutrals to tame neutral spread
  const clampNearestAccess = () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const hq of hqs) {
        const dists = neutralPlacements.map((n) => length(n, hq)).sort((a, b) => a - b);
        const nearestTwo = dists.slice(0, 2);
        const sum = nearestTwo.reduce((a, b) => a + b, 0);
        if (sum <= 720) continue;
        const replaceIdx = neutralPlacements.reduce(
          (acc, n, idx) => {
            const d = length(n, hq);
            return d > acc.bestDist ? { idx, bestDist: d } : acc;
          },
          { idx: -1, bestDist: -Infinity }
        ).idx;
        if (replaceIdx === -1) continue;
        const proposal = tryPlaceNeutral({
          attempts: 180,
          placed,
          neutrals: neutralPlacements.filter((_, i) => i !== replaceIdx),
          extraCheck: (candidate) =>
            minAngleOffsetToWedge(candidate, hqs, center) >= NEUTRAL_WEDGE_OFFSET_MIN,
          sampler: () => {
            const angle = rng() * TWO_PI;
            const radius = randomRange(280, 560, rng);
            return polar(hq, radius, angle);
          },
        });
        if (proposal) neutralPlacements[replaceIdx] = proposal;
      }
    }
  };

  clampNearestAccess();

  // Ensure each player has at least one personal neutral reasonably close
  for (const hq of hqs) {
    const nearest = neutralPlacements.reduce(
      (acc, n, idx) => {
        const d = length(n, hq);
        return d < acc.best ? { best: d, idx } : acc;
      },
      { best: Infinity, idx: -1 }
    );
    if (nearest.best <= 520) continue;
    const replaceIdx = neutralPlacements.reduce(
      (acc, n, idx) => {
        const d = length(n, hq);
        return d > acc.best ? { idx, best: d } : acc;
      },
      { idx: -1, best: -Infinity }
    ).idx;
    if (replaceIdx === -1) continue;
    const proposal = tryPlaceNeutral({
      attempts: 200,
      placed,
      neutrals: neutralPlacements.filter((_, i) => i !== replaceIdx),
      extraCheck: (candidate) => minAngleOffsetToWedge(candidate, hqs, center) >= NEUTRAL_WEDGE_OFFSET_MIN,
      sampler: () => {
        const angle = rng() * TWO_PI;
        const radius = randomRange(340, 520, rng);
        return polar(hq, radius, angle);
      },
    });
    if (proposal) neutralPlacements[replaceIdx] = proposal;
  }

  // Hard clamp nearest-two distances per player to keep neutralSpread within bounds
  const targetNearestSum = 700;
  for (const hq of hqs) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ordered = neutralPlacements
        .map((n, idx) => ({ idx, d: length(n, hq) }))
        .sort((a, b) => a.d - b.d);
      const sum = ordered.slice(0, 2).reduce((acc, entry) => acc + entry.d, 0);
      if (sum <= targetNearestSum) break;
      const replaceIdx = ordered[ordered.length - 1]?.idx ?? -1;
      if (replaceIdx === -1) break;
      const proposal = tryPlaceNeutral({
        attempts: 200,
        placed,
        neutrals: neutralPlacements.filter((_, i) => i !== replaceIdx),
        extraCheck: (candidate) =>
          minAngleOffsetToWedge(candidate, hqs, center) >= NEUTRAL_WEDGE_OFFSET_MIN,
        sampler: () => {
          const angle = rng() * TWO_PI;
          const radius = randomRange(320, 540, rng);
          return polar(hq, radius, angle);
        },
      });
      if (!proposal) continue;
      neutralPlacements[replaceIdx] = proposal;
    }
  }

  let centerFix = 0;
  while (
    neutralPlacements.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length <
      NEUTRAL_CENTER_COUNT_RANGE.min &&
    centerFix++ < 30
  ) {
    const farthestIdx = neutralPlacements.reduce(
      (acc, n, idx) => {
        const d = length(n, center);
        return d > acc.best ? { best: d, idx } : acc;
      },
      { best: -Infinity, idx: -1 }
    ).idx;
    const replacement = placeCenterNeutral({
      center,
      placed,
      neutrals: neutralPlacements.filter((_, i) => i !== farthestIdx),
      hqs,
      rng,
    });
    if (!replacement || farthestIdx === -1) break;
    neutralPlacements[farthestIdx] = replacement;
  }

  let centerHigh = 0;
  const centerMaxTarget = NEUTRAL_CENTER_COUNT_RANGE.max;
  while (
    neutralPlacements.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length >
      centerMaxTarget &&
    centerHigh++ < 80
  ) {
    const nearestIdx = neutralPlacements.reduce(
      (acc, n, idx) => {
        const d = length(n, center);
        return d < acc.best ? { best: d, idx } : acc;
      },
      { best: Infinity, idx: -1 }
    ).idx;
    if (nearestIdx === -1) break;
    let replacement: NeutralPlacement | null = null;
    const others = neutralPlacements.filter((_, i) => i !== nearestIdx);
    for (let t = 0; t < 220 && !replacement; t++) {
      const radius = randomRange(CENTER_OCCUPANCY_RADIUS + 200, 1300, rng);
      const angle = rng() * TWO_PI;
      const candidate = polar(center, radius, angle);
      if (minAngleOffsetToWedge(candidate, hqs, center) < NEUTRAL_WEDGE_OFFSET_MIN) continue;
      if (!canPlaceNeutral(candidate, placed, others)) continue;
      replacement = { x: candidate.x, y: candidate.y };
    }
    if (!replacement) break;
    neutralPlacements[nearestIdx] = replacement;
  }

  // Final safety: if center is still over cap, forcibly relocate extras outward
  let forceIdx = 0;
  while (
    neutralPlacements.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length >
      NEUTRAL_CENTER_COUNT_RANGE.max &&
    forceIdx++ < neutralPlacements.length
  ) {
    const idx = neutralPlacements.findIndex((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS);
    if (idx === -1) break;
    let moved = false;
    const others = neutralPlacements.filter((_, i) => i !== idx);
    for (let t = 0; t < 400 && !moved; t++) {
      const radius = randomRange(CENTER_OCCUPANCY_RADIUS + 200, 1400, rng);
      const angle = rng() * TWO_PI;
      const candidate = polar(center, radius, angle);
      if (!canPlaceNeutral(candidate, placed, others)) continue;
      if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
        continue;
      neutralPlacements[idx] = { x: candidate.x, y: candidate.y };
      moved = true;
    }
    if (!moved) break;
  }

  // Last-resort evac: keep trying until center count <= max by relocating closest center neutral far outward
  let evacGuard = 0;
  while (
    neutralPlacements.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length >
      NEUTRAL_CENTER_COUNT_RANGE.max &&
    evacGuard++ < 300
  ) {
    const idx = neutralPlacements.reduce(
      (acc, n, i) => {
        const d = length(n, center);
        if (d < acc.best) return { best: d, idx: i };
        return acc;
      },
      { best: Infinity, idx: -1 }
    ).idx;
    if (idx === -1) break;
    const others = neutralPlacements.filter((_, i) => i !== idx);
    let placedOut = false;
    for (let t = 0; t < 500 && !placedOut; t++) {
      const radius = randomRange(CENTER_OCCUPANCY_RADIUS + 300, 1400, rng);
      const angle = rng() * TWO_PI;
      const candidate = polar(center, radius, angle);
      if (!canPlaceNeutral(candidate, placed, others)) continue;
      if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
        continue;
      neutralPlacements[idx] = { x: candidate.x, y: candidate.y };
      placedOut = true;
    }
    if (!placedOut) break;
  }

  const neutralTypes = shuffle([...NEUTRAL_TYPE_POOL], rng);
  const neutrals: LabeledPoint[] = [];
  neutralPlacements.slice(0, NEUTRAL_COUNT).forEach((slot, idx) => {
    const type = slot.type ?? neutralTypes[idx % neutralTypes.length];
    neutrals[idx] = {
      x: slot.x,
      y: slot.y,
      id: `neutral-${idx}`,
      type,
    } as LabeledPoint;
  });

  // Combine and then normalize to target viewport margin
  let allPoints = [...placed, ...neutrals];
  const relativePoints = allPoints.map((p) => ({
    ...p,
    x: p.x - center.x,
    y: p.y - center.y,
  }));

  const extents = relativePoints.reduce(
    (acc, p) => {
      acc.maxAbsX = Math.max(acc.maxAbsX, Math.abs(p.x));
      acc.maxAbsY = Math.max(acc.maxAbsY, Math.abs(p.y));
      return acc;
    },
    { maxAbsX: 0, maxAbsY: 0 }
  );

  const targetMargin = Math.min(MAP_WIDTH, MAP_HEIGHT) * TARGET_MARGIN_RATIO;
  const halfWidth = MAP_WIDTH / 2 - targetMargin;
  const halfHeight = MAP_HEIGHT / 2 - targetMargin;
  const scale = Math.min(
    1,
    extents.maxAbsX ? halfWidth / extents.maxAbsX : 1,
    extents.maxAbsY ? halfHeight / extents.maxAbsY : 1
  );

  allPoints = relativePoints.map((p) => ({
    ...p,
    x: p.x * scale + center.x,
    y: p.y * scale + center.y,
  }));

  // After normalization, rebalance neutrals to satisfy neutralSpread/isolation invariants
  const normalizedHqs = allPoints.filter((p) => p.ownerId && p.type === 'hq');
  const normalizedNeutrals = allPoints.filter((p) => !p.ownerId);
  const normalizedStructures = allPoints;
  const normalizedPlayerStructures = normalizedStructures.filter((p) => p.ownerId);
  const neutralPositions = normalizedNeutrals.map((n) => ({ x: n.x, y: n.y }));
  rebalanceNeutrals(
    normalizedHqs.map((hq) => ({ x: hq.x, y: hq.y })),
    neutralPositions,
    normalizedPlayerStructures.map((p) => ({ x: p.x, y: p.y })),
    {
      neutralSpreadLimit: 320,
      isolationRangeLimit: 300,
      centerRadius: CENTER_OCCUPANCY_RADIUS,
      maxCenterCount: NEUTRAL_CENTER_COUNT_RANGE.max,
      minNeutralSeparation: 150,
      maxDistanceToCenter: 1600,
      maxIterations: 800,
      rng: { next: rng },
    }
  );
  neutralPositions.forEach((pos, idx) => {
    normalizedNeutrals[idx].x = pos.x;
    normalizedNeutrals[idx].y = pos.y;
  });

  // Clamp all points to map bounds after adjustments
  normalizedStructures.forEach((p) => {
    p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
    p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
  });

  // Enforce center occupancy cap post-rebalance
  let centerEvac = 0;
  const maxCenter = NEUTRAL_CENTER_COUNT_RANGE.max;
  const centerCount = () =>
    normalizedNeutrals.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length;
  while (centerCount() > maxCenter && centerEvac++ < 300) {
    const idx = normalizedNeutrals.reduce(
      (acc, n, i) => {
        const d = length(n, center);
        if (d < acc.best) return { best: d, idx: i };
        return acc;
      },
      { best: Infinity, idx: -1 }
    ).idx;
    if (idx === -1) break;
    const others = normalizedStructures.filter((_, i) => normalizedStructures[i] !== normalizedNeutrals[idx]);
    let moved = false;
    for (let t = 0; t < 300 && !moved; t++) {
      const radius = randomRange(CENTER_OCCUPANCY_RADIUS + 240, 1400, rng);
      const angle = rng() * TWO_PI;
      const candidate = polar(center, radius, angle);
      if (
        others.every((p) => length(p, candidate) >= NEUTRAL_MIN_SEPARATION) &&
        length(candidate, center) <= 1600 &&
        candidate.x >= 0 &&
        candidate.x <= MAP_WIDTH &&
        candidate.y >= 0 &&
        candidate.y <= MAP_HEIGHT
      ) {
        normalizedNeutrals[idx].x = candidate.x;
        normalizedNeutrals[idx].y = candidate.y;
        normalizedStructures[normalizedStructures.indexOf(normalizedNeutrals[idx])] = normalizedNeutrals[idx];
        moved = true;
      }
    }
    if (!moved) break;
  }
  const computeNeutralSpread = () => {
    const sums = normalizedHqs.map((hq) =>
      normalizedNeutrals
        .map((n) => length(n, hq))
        .sort((a, b) => a - b)
        .slice(0, 2)
        .reduce((a, b) => a + b, 0)
    );
    return Math.max(...sums) - Math.min(...sums);
  };

  let finalSpread = computeNeutralSpread();
  if (finalSpread > 350) {
    const nearestSums = () =>
      normalizedHqs.map((hq) =>
        normalizedNeutrals
          .map((n) => length(n, hq))
          .sort((a, b) => a - b)
          .slice(0, 2)
          .reduce((a, b) => a + b, 0)
      );
    let sums = nearestSums();
    let guard = 0;
    while (Math.max(...sums) - Math.min(...sums) > 350 && guard++ < 25) {
      const worstIdx = sums.indexOf(Math.max(...sums));
      const targetHQ = normalizedHqs[worstIdx];
      const baseAngle = Math.atan2(center.y - targetHQ.y, center.x - targetHQ.x);
      const angles = [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3, Math.PI / 2];
      const radii = [200, 320, 440, 560];
      let bestMove: { pos: { x: number; y: number }; spread: number; sums: number[]; idx: number } | null = null;

      const consider = (candidate: { x: number; y: number }, moveIdx: number) => {
        if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
          return;
        if (normalizedPlayerStructures.some((p) => length(p, candidate) < 140)) return;
        for (let i = 0; i < normalizedNeutrals.length; i++) {
          if (i === moveIdx) continue;
          if (length(normalizedNeutrals[i], candidate) < 140) return;
        }
        const original = normalizedNeutrals[moveIdx];
        normalizedNeutrals[moveIdx] = { ...original, x: candidate.x, y: candidate.y };
        const nextSums = nearestSums();
        const spread = Math.max(...nextSums) - Math.min(...nextSums);
        normalizedNeutrals[moveIdx] = original;
        if (!bestMove || spread < bestMove.spread) {
          bestMove = { pos: candidate, spread, sums: nextSums, idx: moveIdx };
        }
      };

      for (let moveIdx = 0; moveIdx < normalizedNeutrals.length; moveIdx++) {
        for (const offset of angles) {
          for (const r of radii) {
            consider(polar(targetHQ, r, baseAngle + offset), moveIdx);
          }
        }
      }

      if (!bestMove || bestMove.spread >= Math.max(...sums) - Math.min(...sums)) break;
      normalizedNeutrals[bestMove.idx].x = bestMove.pos.x;
      normalizedNeutrals[bestMove.idx].y = bestMove.pos.y;
      sums = bestMove.sums;
    }
    normalizedStructures.forEach((p) => {
      p.x = clamp(p.x, 0, MAP_WIDTH);
      p.y = clamp(p.y, 0, MAP_HEIGHT);
    });
    finalSpread = Math.max(...sums) - Math.min(...sums);
  }

  // Guarantee minimum center occupancy after all adjustments
  let centerShortGuard = 0;
  while (
    normalizedNeutrals.filter((n) => length(n, center) <= CENTER_OCCUPANCY_RADIUS).length <
      NEUTRAL_CENTER_COUNT_RANGE.min &&
    centerShortGuard++ < 60
  ) {
    const idx = normalizedNeutrals.reduce(
      (acc, n, i) => {
        const d = length(n, center);
        return d > acc.best ? { best: d, idx: i } : acc;
      },
      { best: -Infinity, idx: -1 }
    ).idx;
    if (idx === -1) break;
    let placed = false;
    for (let t = 0; t < 180 && !placed; t++) {
      const radius = randomRange(CENTER_NEUTRAL_RADIUS_RANGE[0], CENTER_NEUTRAL_RADIUS_RANGE[1], rng);
      const angle = rng() * TWO_PI;
      const candidate = polar(center, radius, angle);
      if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
        continue;
      if (normalizedPlayerStructures.some((p) => length(p, candidate) < 140)) continue;
      if (normalizedNeutrals.some((n, i) => i !== idx && length(n, candidate) < 140)) continue;
      normalizedNeutrals[idx].x = candidate.x;
      normalizedNeutrals[idx].y = candidate.y;
      placed = true;
    }
    if (!placed) break;
  }

  // Build structures
  const names = shuffle(OUTPOST_NAMES.length ? OUTPOST_NAMES : ['Alpha'], rng);
  let nameIndex = 0;
  const nextLabel = () =>
    (names.length ? names[nameIndex++ % names.length] : `OP-${nameIndex++}`).toUpperCase();

  const structures: Structure[] = [];

  // Emit player-owned
  for (const p of allPoints) {
    if (p.ownerId) {
      const playerIdx = parseInt(p.ownerId.slice(1)) - 1;
      const player = players[playerIdx];
      structures.push({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        ownerId: p.ownerId,
      label: nextLabel(),
      playerColor: player.color,
        size: sizeByType[p.type],
      droneCount: 40,
        droneCapacity: p.type === 'foundry' ? 100 : p.type === 'reactor' ? 150 : 200,
        droneGenerationRate: p.type === 'foundry' ? 3 : undefined,
      });
    }
  }

  // Emit neutrals
  for (const p of allPoints) {
    if (!p.ownerId) {
      const color = NEUTRAL_COLORS[structures.length % NEUTRAL_COLORS.length];
      structures.push({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
    ownerId: undefined,
    label: nextLabel(),
        playerColor: color,
        size: sizeByType[p.type],
    droneCount: 0,
        droneCapacity: p.type === 'foundry' ? 100 : 150,
        droneGenerationRate: p.type === 'foundry' ? 3 : undefined,
      });
}
  }

  // Final sanity: guarantee totals (20 player-owned + 10 neutral = 30). If not, regenerate quickly.
  if (structures.filter((s) => s.ownerId).length !== 20 || structures.filter((s) => !s.ownerId).length !== 10) {
    const retrySeed = resolvedSeed + 1;
    if (DEBUG_FAIRNESS) {
      // eslint-disable-next-line no-console
      console.warn(
        'Structure count mismatch',
        structures.filter((s) => s.ownerId).length,
        structures.filter((s) => !s.ownerId).length,
        'on seed',
        resolvedSeed,
        'retrying with seed',
        retrySeed
      );
    }
    return generateStartingScenario({ seed: retrySeed });
  }

  return { players, structures, activePlayerIndex };
}
