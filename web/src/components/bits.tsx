import type { FeedInsight, TimerInfo } from '../../../shared/types';
import { formatDelta, formatDuration, timerValue } from '../../../shared/format';

export function TimerText({ timer, now, offset }: { timer: TimerInfo | null; now: number; offset: number }) {
  const v = timerValue(timer, now, offset);
  if (v === null) return null;
  return <span className={`timer ${timer?.running ? 'running' : ''}`}>{formatDuration(v)}</span>;
}

export function DeltaText({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return <span className={`delta ${ms < 0 ? 'ahead' : 'behind'}`}>{formatDelta(ms)}</span>;
}

export function ScoreBadge({ insight }: { insight: FeedInsight | undefined }) {
  if (!insight || insight.score <= 0) return null;
  const tone = insight.score >= 70 ? 'hot' : insight.score >= 45 ? 'warm' : 'cool';
  return (
    <span className={`score ${tone}`} title={insight.reasons.join(' · ')}>
      {insight.score}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
      <span>
        {label}
        {hint && <small className="muted block">{hint}</small>}
      </span>
    </label>
  );
}
