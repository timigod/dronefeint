import { FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_FAIRNESS_THRESHOLDS,
  buildFairnessNarrative,
  evaluateFairnessChecks,
  runFairnessSamples,
} from './scenarios/fairnessReport';
import type { FairnessSummary, FairnessThresholds } from './scenarios/fairnessReport';

const DEFAULT_SAMPLE_SIZE = Number(import.meta.env.VITE_DEV_FAIRNESS_SAMPLE_SIZE ?? '50');

const formatValue = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

const prettySeed = (seed: number | null) => (typeof seed === 'number' ? `#${seed}` : '—');

const thresholds: FairnessThresholds = { ...DEFAULT_FAIRNESS_THRESHOLDS };
const overrideThreshold = (key: keyof FairnessThresholds, envValue?: string) => {
  if (!envValue) return;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return;
  thresholds[key] = parsed;
};

overrideThreshold('adjacentRange', import.meta.env.VITE_DEV_FAIRNESS_ADJ_RANGE_LIMIT as string | undefined);
overrideThreshold('neutralSpread', import.meta.env.VITE_DEV_FAIRNESS_NEUTRAL_LIMIT as string | undefined);
overrideThreshold('clearance', import.meta.env.VITE_DEV_FAIRNESS_CLEARANCE_LIMIT as string | undefined);

type RawMetricDefinition = {
  title: string;
  description: string;
  getValue: (summary: FairnessSummary) => number;
  getSeed?: (summary: FairnessSummary) => number | null;
  format: (value: number) => string;
};

const RAW_METRICS: RawMetricDefinition[] = [
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

export const DevFairnessOverlay = () => {
  if (!import.meta.env.DEV) return null;

  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE_SIZE);
  const [summary, setSummary] = useState<FairnessSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy Report');

  const runSample = (size: number) => {
    setIsRunning(true);
    requestAnimationFrame(() => {
      const { summary: nextSummary } = runFairnessSamples(size);
      setSummary(nextSummary);
      setIsRunning(false);
    });
  };

  useEffect(() => {
    runSample(sampleSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSample(sampleSize);
  };

  const narrative = summary ? buildFairnessNarrative(summary, thresholds) : null;
  const checks = summary ? evaluateFairnessChecks(summary, thresholds) : [];

  const copyReportToClipboard = async () => {
    if (!summary) return;

    const lines: string[] = [];
    lines.push('FAIRNESS REPORT');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Seeds tested: ${summary.seedsTested}`);
    lines.push('');
    
    if (narrative) {
      lines.push('DIAGNOSTIC SUMMARY');
      lines.push('-'.repeat(50));
      narrative.lines.forEach((line) => lines.push(line));
      lines.push('');
    }

    lines.push('FAIRNESS CHECKS');
    lines.push('-'.repeat(50));
    checks.forEach((check) => {
      lines.push(`${check.passed ? '✅' : '⚠️'} ${check.label}`);
      lines.push(`  ${check.passed ? check.passText : check.failText}`);
      lines.push(`  Value: ${check.value.toFixed(2)} | Limit: ${check.limit.toFixed(2)}`);
      if (check.seed !== null) {
        lines.push(`  Worst seed: #${check.seed}`);
      }
      lines.push('');
    });

    if (showRaw) {
      lines.push('RAW METRICS');
      lines.push('-'.repeat(50));
      RAW_METRICS.forEach((metric) => {
        const rawValue = metric.getValue(summary);
        const displayValue = Number.isFinite(rawValue) ? metric.format(rawValue) : '—';
        const seed = metric.getSeed?.(summary);
        lines.push(`${metric.title}: ${displayValue}`);
        lines.push(`  ${metric.description}`);
        if (seed !== undefined && seed !== null) {
          lines.push(`  Worst seed: #${seed}`);
        }
        lines.push('');
      });
    }

    const reportText = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyButtonText('Copied!');
      setTimeout(() => {
        setCopyButtonText('Copy Report');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy report to clipboard:', err);
      setCopyButtonText('Copy Failed');
      setTimeout(() => {
        setCopyButtonText('Copy Report');
      }, 2000);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 360,
        padding: '16px 18px',
        borderRadius: 8,
        background: 'rgba(8, 8, 12, 0.94)',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        color: '#e1e5f8',
        fontFamily: 'IBM Plex Mono, Menlo, monospace',
        fontSize: 12,
        zIndex: 99,
        pointerEvents: 'auto',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: 13, letterSpacing: '0.08em', marginBottom: 6, color: '#7fffd4' }}>
        DEV FAIRNESS REPORT
      </div>
      <div style={{ color: '#9ea7c4', marginBottom: 8 }}>
        “Refresh” simulates multiple random seeds and highlights anything that might require tuning. Toggle this panel
        with <strong>Ctrl/Cmd + Shift + F</strong>.
      </div>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontSize: 11, color: '#9ea7c4', marginBottom: 3 }}>Sample size</span>
          <input
            type="number"
            min={5}
            max={2000}
            step={5}
            value={sampleSize}
            onChange={(event) => setSampleSize(Number(event.target.value))}
            style={{
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: '#e1e5f8',
            }}
          />
        </label>
        <button
          type="submit"
          disabled={isRunning}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid rgba(127,255,212,0.7)',
            background: isRunning ? 'rgba(127,255,212,0.15)' : 'rgba(127,255,212,0.25)',
            color: '#7fffd4',
            fontWeight: 600,
            cursor: isRunning ? 'progress' : 'pointer',
          }}
        >
          {isRunning ? 'Running…' : 'Refresh'}
        </button>
      </form>

      {summary ? (
        <>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span>Seeds tested: </span>
              <strong>{summary.seedsTested}</strong>
            </div>
            <button
              type="button"
              onClick={copyReportToClipboard}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid rgba(127,255,212,0.5)',
                background: 'rgba(127,255,212,0.1)',
                color: '#7fffd4',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(127,255,212,0.2)';
                e.currentTarget.style.borderColor = 'rgba(127,255,212,0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(127,255,212,0.1)';
                e.currentTarget.style.borderColor = 'rgba(127,255,212,0.5)';
              }}
            >
              {copyButtonText}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#9ea7c4', marginBottom: 4 }}>Diagnostic summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {narrative?.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {checks.map((check) => (
              <div
                key={check.id}
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <strong>{check.passed ? '✅' : '⚠️'} {check.label}</strong>
                  <span>{check.passed ? 'OK' : 'Needs attention'}</span>
                </div>
                <div style={{ color: '#9ea7c4' }}>{check.passed ? check.passText : check.failText}</div>
                {showRaw && (
                  <div style={{ color: '#bbb', marginTop: 4, fontSize: 11 }}>
                    Value {check.value.toFixed(2)} vs limit {check.limit.toFixed(2)} (worst {prettySeed(check.seed)})
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'transparent',
                color: '#e1e5f8',
                cursor: 'pointer',
              }}
            >
              {showRaw ? 'Hide' : 'Show'} raw metrics
            </button>
          </div>

          {showRaw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {RAW_METRICS.map((metric) => {
                const rawValue = metric.getValue(summary);
                const displayValue = Number.isFinite(rawValue) ? metric.format(rawValue) : '—';
                const seed = metric.getSeed?.(summary);
                return (
                  <div key={metric.title} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <strong>{metric.title}</strong>
                      <span>{displayValue}</span>
                    </div>
                    <div style={{ color: '#9ea7c4' }}>{metric.description}</div>
                    {seed !== undefined && seed !== null && (
                      <div style={{ color: '#bbb', marginTop: 2 }}>Worst {prettySeed(seed)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#9ea7c4' }}>Computing fairness sample…</div>
      )}
    </div>
  );
};


