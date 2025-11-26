import { FormEvent, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FairnessSummary, FairnessThresholds } from '../scenarios/fairnessReport';
import {
  DEFAULT_FAIRNESS_THRESHOLDS,
  buildFairnessNarrative,
  evaluateFairnessChecks,
  runFairnessSamples,
} from '../scenarios/fairnessReport';
import { RAW_METRICS } from '../scenarios/rawMetricsConfig';
import { Z_INDEX } from '../styles/constants';

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

const styles: {
  container: CSSProperties;
  title: CSSProperties;
  description: CSSProperties;
  form: CSSProperties;
  label: CSSProperties;
  labelText: CSSProperties;
  input: CSSProperties;
  refreshButtonBase: CSSProperties;
  section: CSSProperties;
  summaryRow: CSSProperties;
  diagnosticsHeading: CSSProperties;
  diagnosticsList: CSSProperties;
  checksList: CSSProperties;
  checkItem: CSSProperties;
  itemHeader: CSSProperties;
  checkDetail: CSSProperties;
  checkRaw: CSSProperties;
  rawToggleContainer: CSSProperties;
  rawToggleButton: CSSProperties;
  rawList: CSSProperties;
  rawItem: CSSProperties;
  rawDescription: CSSProperties;
  rawSeed: CSSProperties;
  pendingText: CSSProperties;
  copyButtonBase: CSSProperties;
} = {
  container: {
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
    zIndex: Z_INDEX.devOverlay,
    pointerEvents: 'auto',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  title: {
    fontSize: 13,
    letterSpacing: '0.08em',
    marginBottom: 6,
    color: '#7fffd4',
  },
  description: {
    color: '#9ea7c4',
    marginBottom: 8,
  },
  form: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  labelText: {
    fontSize: 11,
    color: '#9ea7c4',
    marginBottom: 3,
  },
  input: {
    padding: '4px 6px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    color: '#e1e5f8',
  },
  refreshButtonBase: {
    padding: '6px 10px',
    borderRadius: 4,
    border: '1px solid rgba(127,255,212,0.7)',
    color: '#7fffd4',
    fontWeight: 600,
  },
  section: {
    marginBottom: 12,
  },
  summaryRow: {
    marginBottom: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagnosticsHeading: {
    color: '#9ea7c4',
    marginBottom: 4,
  },
  diagnosticsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  checksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  checkItem: {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  checkDetail: {
    color: '#9ea7c4',
  },
  checkRaw: {
    color: '#bbb',
    marginTop: 4,
    fontSize: 11,
  },
  rawToggleContainer: {
    marginTop: 12,
  },
  rawToggleButton: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: '#e1e5f8',
    cursor: 'pointer',
  },
  rawList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
  },
  rawItem: {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  rawDescription: {
    color: '#9ea7c4',
  },
  rawSeed: {
    color: '#bbb',
    marginTop: 2,
  },
  pendingText: {
    color: '#9ea7c4',
  },
  copyButtonBase: {
    padding: '4px 8px',
    borderRadius: 4,
    color: '#7fffd4',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },
};

const getRefreshButtonStyle = (isRunning: boolean): CSSProperties => ({
  ...styles.refreshButtonBase,
  background: isRunning ? 'rgba(127,255,212,0.15)' : 'rgba(127,255,212,0.25)',
  cursor: isRunning ? 'progress' : 'pointer',
});

const getCopyButtonStyle = (isHovered: boolean): CSSProperties => ({
  ...styles.copyButtonBase,
  border: isHovered ? '1px solid rgba(127,255,212,0.7)' : '1px solid rgba(127,255,212,0.5)',
  background: isHovered ? 'rgba(127,255,212,0.2)' : 'rgba(127,255,212,0.1)',
});
export const DevFairnessOverlay = () => {
  if (!import.meta.env.DEV) return null;

  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE_SIZE);
  const [summary, setSummary] = useState<FairnessSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy Report');
  const [isCopyHovered, setIsCopyHovered] = useState(false);

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
    <div style={styles.container}>
      <div style={styles.title}>
        DEV FAIRNESS REPORT
      </div>
      <div style={styles.description}>
        “Refresh” simulates multiple random seeds and highlights anything that might require tuning. Toggle this panel
        with <strong>Ctrl/Cmd + Shift + F</strong>.
      </div>
      <form
        onSubmit={handleSubmit}
        style={styles.form}
      >
        <label style={styles.label}>
          <span style={styles.labelText}>Sample size</span>
          <input
            type="number"
            min={5}
            max={2000}
            step={5}
            value={sampleSize}
            onChange={(event) => setSampleSize(Number(event.target.value))}
            style={styles.input}
          />
        </label>
        <button
          type="submit"
          disabled={isRunning}
          style={getRefreshButtonStyle(isRunning)}
        >
          {isRunning ? 'Running…' : 'Refresh'}
        </button>
      </form>

      {summary ? (
        <>
          <div style={styles.summaryRow}>
            <div>
              <span>Seeds tested: </span>
              <strong>{summary.seedsTested}</strong>
            </div>
            <button
              type="button"
              onClick={copyReportToClipboard}
              style={getCopyButtonStyle(isCopyHovered)}
              onMouseEnter={() => setIsCopyHovered(true)}
              onMouseLeave={() => setIsCopyHovered(false)}
            >
              {copyButtonText}
            </button>
          </div>

          <div style={styles.section}>
            <div style={styles.diagnosticsHeading}>Diagnostic summary</div>
            <div style={styles.diagnosticsList}>
              {narrative?.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>

          <div style={styles.checksList}>
            {checks.map((check) => (
              <div
                key={check.id}
                style={styles.checkItem}
              >
                <div style={styles.itemHeader}>
                  <strong>{check.passed ? '✅' : '⚠️'} {check.label}</strong>
                  <span>{check.passed ? 'OK' : 'Needs attention'}</span>
                </div>
                <div style={styles.checkDetail}>{check.passed ? check.passText : check.failText}</div>
                {showRaw && (
                  <div style={styles.checkRaw}>
                    Value {check.value.toFixed(2)} vs limit {check.limit.toFixed(2)} (worst {prettySeed(check.seed)})
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={styles.rawToggleContainer}>
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              style={styles.rawToggleButton}
            >
              {showRaw ? 'Hide' : 'Show'} raw metrics
            </button>
          </div>

          {showRaw && (
            <div style={styles.rawList}>
              {RAW_METRICS.map((metric) => {
                const rawValue = metric.getValue(summary);
                const displayValue = Number.isFinite(rawValue) ? metric.format(rawValue) : '—';
                const seed = metric.getSeed?.(summary);
                return (
                  <div key={metric.title} style={styles.rawItem}>
                    <div style={styles.itemHeader}>
                      <strong>{metric.title}</strong>
                      <span>{displayValue}</span>
                    </div>
                    <div style={styles.rawDescription}>{metric.description}</div>
                    {seed !== undefined && seed !== null && (
                      <div style={styles.rawSeed}>Worst {prettySeed(seed)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={styles.pendingText}>Computing fairness sample…</div>
      )}
    </div>
  );
};
