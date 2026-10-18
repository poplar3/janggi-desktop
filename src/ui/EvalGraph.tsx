import type { MoveReview } from '../analysis/evaluator';
import { QUALITY_INFO, winPercent } from '../analysis/quality';

interface Props {
  /** Оценки (Чо, сп) для полуходов 0…N; undefined — ещё не посчитано. */
  evals: (number | undefined)[];
  reviews: Record<number, MoveReview>;
  viewPly: number | null;
  onSelect: (ply: number) => void;
}

const W = 320;
const H = 90;

/** График шансов: выше середины — перевес Чо, ниже — Хана. */
export function EvalGraph({ evals, reviews, viewPly, onSelect }: Props) {
  const n = Math.max(evals.length - 1, 1);
  const x = (i: number) => (i / n) * W;
  const y = (cp: number) => H - (winPercent(cp) / 100) * H;
  const pts = evals.map((e, i) => (e === undefined ? null : `${x(i).toFixed(1)},${y(e).toFixed(1)}`)).filter(Boolean) as string[];
  const area = pts.length ? `M0,${H} L${pts.join(' L')} L${x(evals.length - 1)},${H} Z` : '';
  return (
    <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={(e) => {
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const ply = Math.round(((e.clientX - r.left) / r.width) * n);
      onSelect(Math.max(0, Math.min(evals.length - 1, ply)));
    }}>
      <rect width={W} height={H} fill="var(--han-soft)" />
      {area && <path d={area} fill="var(--cho-soft)" />}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(0,0,0,0.25)" strokeDasharray="3 3" />
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="#3b2a1a" strokeWidth={1.5} />}
      {Object.values(reviews)
        .filter((r) => r.quality === 'mistake' || r.quality === 'blunder' || r.quality === 'inaccuracy')
        .map((r) => (
          <circle key={r.ply} cx={x(r.ply)} cy={y(r.after.cpCho)} r={3.5} fill={QUALITY_INFO[r.quality].color} stroke="#fff" strokeWidth={1} />
        ))}
      {viewPly !== null && <line x1={x(viewPly)} x2={x(viewPly)} y1={0} y2={H} stroke="#2f6fd6" strokeWidth={2} />}
    </svg>
  );
}
