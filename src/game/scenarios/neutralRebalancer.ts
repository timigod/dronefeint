import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';

export type Vec2 = { x: number; y: number };

export interface RNG {
  next(): number; // Deterministic 0..1 float from the scenario PRNG
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const length = (v: Vec2): number => Math.hypot(v.x, v.y);
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const fromAngle = (angle: number, radius: number): Vec2 => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});
const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x);
const randInRange = (rng: RNG, min: number, max: number) => min + (max - min) * rng.next();

// Sum of distances to the two nearest neutrals for each HQ
const nearestTwoSumsByPlayer = (hqs: Vec2[], neutrals: Vec2[]): number[] =>
  hqs.map((hq) => {
    let d1 = Infinity;
    let d2 = Infinity;
    for (const n of neutrals) {
      const d = dist(hq, n);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
    if (!Number.isFinite(d1)) d1 = 99999;
    if (!Number.isFinite(d2)) d2 = d1;
    return d1 + d2;
  });

const neutralSpreadMetric = (hqs: Vec2[], neutrals: Vec2[]) => {
  const sums = nearestTwoSumsByPlayer(hqs, neutrals);
  return {
    perPlayer: sums,
    spread: Math.max(...sums) - Math.min(...sums),
  };
};

// Isolation: avg(nearest 3 neutrals) + avg(nearest 2 enemies)
const isolationScoresByPlayer = (hqs: Vec2[], neutrals: Vec2[]): number[] => {
  const enemyAvg: number[] = [];
  for (let i = 0; i < hqs.length; i++) {
    const dists: number[] = [];
    for (let j = 0; j < hqs.length; j++) {
      if (j === i) continue;
      dists.push(dist(hqs[i], hqs[j]));
    }
    dists.sort((a, b) => a - b);
    const e1 = dists[0] ?? 99999;
    const e2 = dists[1] ?? e1;
    enemyAvg[i] = (e1 + e2) / 2;
  }

  const scores: number[] = [];
  for (let i = 0; i < hqs.length; i++) {
    const ndists = neutrals.map((n) => dist(hqs[i], n)).sort((a, b) => a - b);
    const n1 = ndists[0] ?? 99999;
    const n2 = ndists[1] ?? n1;
    const n3 = ndists[2] ?? n2;
    const neutralAvg = (n1 + n2 + n3) / 3;
    scores[i] = neutralAvg + enemyAvg[i];
  }
  return scores;
};

const isolationRangeMetric = (hqs: Vec2[], neutrals: Vec2[]) => {
  const scores = isolationScoresByPlayer(hqs, neutrals);
  return {
    perPlayer: scores,
    range: Math.max(...scores) - Math.min(...scores),
  };
};

const DEBUG_FAIRNESS =
  typeof process !== 'undefined' && typeof process.env !== 'undefined' && process.env.DEBUG_FAIRNESS === '1';

const hasMinSeparation = (
  neutrals: Vec2[],
  idxToMove: number,
  newPos: Vec2,
  allStructures: Vec2[],
  minSep: number
): boolean => {
  for (let i = 0; i < neutrals.length; i++) {
    if (i === idxToMove) continue;
    if (dist(newPos, neutrals[i]) < minSep) return false;
  }
  return allStructures.every((s) => dist(newPos, s) >= minSep);
};

export type RebalanceOptions = {
  neutralSpreadLimit: number;
  isolationRangeLimit: number;
  centerRadius: number;
  maxCenterCount: number;
  minNeutralSeparation: number;
  maxDistanceToCenter: number;
  maxIterations: number;
  rng: RNG;
};

// Mutates neutralPositions in-place to reduce neutralSpread and isolationRange if they exceed limits.
export function rebalanceNeutrals(
  hqPositions: Vec2[],
  neutralPositions: Vec2[],
  allStructurePositions: Vec2[],
  opts: RebalanceOptions
): void {
  const {
    neutralSpreadLimit,
    isolationRangeLimit,
    centerRadius,
    maxCenterCount,
    minNeutralSeparation,
    maxDistanceToCenter,
    maxIterations,
    rng,
  } = opts;

  if (!hqPositions.length || !neutralPositions.length) return;

  // Center is map center in normalized space
  const center: Vec2 = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const innerRadius = Math.max(minNeutralSeparation + 40, 200);
  const outerRadius = innerRadius + 320;

  const isCenterNeutral = (p: Vec2) => dist(p, center) <= centerRadius;

  const samplePosNearHQ = (hq: Vec2) => {
    const fromCenter = sub(hq, center);
    const towardCenterAngle = angleOf(fromCenter) + Math.PI;
    const angle = towardCenterAngle + randInRange(rng, -Math.PI / 3, Math.PI / 3); // ±60°
    const r = randInRange(rng, innerRadius, outerRadius);
    return add(hq, fromAngle(angle, r));
  };

  let { perPlayer: spreadPerPlayer, spread } = neutralSpreadMetric(hqPositions, neutralPositions);
  let { perPlayer: isoPerPlayer, range: isoRange } = isolationRangeMetric(hqPositions, neutralPositions);
  const overagePenalty = (spreadValue: number, isoValue: number) =>
    Math.max(0, spreadValue - neutralSpreadLimit) + Math.max(0, isoValue - isolationRangeLimit);
  let penalty = overagePenalty(spread, isoRange);
  let centerCount = neutralPositions.filter(isCenterNeutral).length;
  let appliedMoves = 0;

  if (spread <= neutralSpreadLimit && isoRange <= isolationRangeLimit) return;

  for (let iter = 0; iter < maxIterations; iter++) {
    const spreadOver = spread - neutralSpreadLimit;
    const isoOver = isoRange - isolationRangeLimit;
    const targetSpread = spreadOver >= isoOver;

    const perPlayer = targetSpread ? spreadPerPlayer : isoPerPlayer;
    let worstIdx = 0;
    for (let i = 1; i < perPlayer.length; i++) {
      if (perPlayer[i] > perPlayer[worstIdx]) worstIdx = i;
    }
    const targetHQ = hqPositions[worstIdx];

    const movable: number[] = [];
    const allowCenterMoves = spread - neutralSpreadLimit > 80 || iter > maxIterations / 2;
    for (let i = 0; i < neutralPositions.length; i++) {
      if (allowCenterMoves || !isCenterNeutral(neutralPositions[i])) movable.push(i);
    }
    if (!movable.length) for (let i = 0; i < neutralPositions.length; i++) movable.push(i);

    const idxToMove = movable.reduce(
      (acc, idx) => {
        const d = dist(targetHQ, neutralPositions[idx]);
        return d > acc.best ? { best: d, idx } : acc;
      },
      { best: -Infinity, idx: movable[0] ?? 0 }
    ).idx;
    const oldPos = neutralPositions[idxToMove];
    let bestMove: {
      candidate: Vec2;
      spreadMetric: ReturnType<typeof neutralSpreadMetric>;
      isoMetric: ReturnType<typeof isolationRangeMetric>;
      penalty: number;
    } | null = null;

    const considerCandidate = (candidate: Vec2) => {
      if (length(sub(candidate, center)) > maxDistanceToCenter) return;
      if (candidate.x < 0 || candidate.x > MAP_WIDTH || candidate.y < 0 || candidate.y > MAP_HEIGHT)
        return;
      if (!hasMinSeparation(neutralPositions, idxToMove, candidate, allStructurePositions, minNeutralSeparation))
        return;
      const nextCenterCount =
        centerCount - (isCenterNeutral(oldPos) ? 1 : 0) + (isCenterNeutral(candidate) ? 1 : 0);
      if (nextCenterCount > maxCenterCount) return;

      neutralPositions[idxToMove] = candidate;
      const newSpreadMetric = neutralSpreadMetric(hqPositions, neutralPositions);
      const newIsoMetric = isolationRangeMetric(hqPositions, neutralPositions);

      const newPenalty = overagePenalty(newSpreadMetric.spread, newIsoMetric.range);
      const targetImproved =
        targetSpread ? newSpreadMetric.spread < spread : newIsoMetric.range < isoRange;
      const nonTargetWithinLimit = targetSpread
        ? newIsoMetric.range <= isolationRangeLimit
        : newSpreadMetric.spread <= neutralSpreadLimit;
      const acceptable =
        newPenalty < penalty || (newPenalty === penalty && targetImproved && nonTargetWithinLimit);

      neutralPositions[idxToMove] = oldPos;
      if (!acceptable) return;

      const betterThanBest =
        !bestMove ||
        newPenalty < bestMove.penalty ||
        (newPenalty === bestMove.penalty &&
          (targetSpread
            ? newSpreadMetric.spread < bestMove.spreadMetric.spread
            : newIsoMetric.range < bestMove.isoMetric.range));
      if (betterThanBest) {
        bestMove = {
          candidate,
          spreadMetric: newSpreadMetric,
          isoMetric: newIsoMetric,
          penalty: newPenalty,
        };
      }
    };

    for (let attempt = 0; attempt < 12; attempt++) {
      considerCandidate(samplePosNearHQ(targetHQ));
      if (bestMove && bestMove.penalty === 0) break;
    }

    if (!bestMove) {
      const towardCenterAngle = angleOf(sub(targetHQ, center)) + Math.PI;
      const fallbackAngles = [
        -Math.PI / 2,
        -Math.PI / 3,
        -Math.PI / 6,
        0,
        Math.PI / 6,
        Math.PI / 3,
        Math.PI / 2,
      ];
      const fallbackRadii = [
        innerRadius + 20,
        innerRadius + 140,
        innerRadius + 260,
        innerRadius + 380,
      ];
      for (const offset of fallbackAngles) {
        for (const r of fallbackRadii) {
          considerCandidate(add(targetHQ, fromAngle(towardCenterAngle + offset, r)));
        }
      }
    }

    if (bestMove) {
      neutralPositions[idxToMove] = bestMove.candidate;
      spread = bestMove.spreadMetric.spread;
      isoRange = bestMove.isoMetric.range;
      penalty = bestMove.penalty;
      spreadPerPlayer = bestMove.spreadMetric.perPlayer;
      isoPerPlayer = bestMove.isoMetric.perPlayer;
      centerCount =
        centerCount -
        (isCenterNeutral(oldPos) ? 1 : 0) +
        (isCenterNeutral(bestMove.candidate) ? 1 : 0);
      appliedMoves++;
    }

    if (spread <= neutralSpreadLimit && isoRange <= isolationRangeLimit) break;
  }

  if (DEBUG_FAIRNESS) {
    // eslint-disable-next-line no-console
    console.log('Rebalance moves', appliedMoves, 'spread', spread.toFixed(1), 'iso', isoRange.toFixed(1));
  }
}
