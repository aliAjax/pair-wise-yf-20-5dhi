import { fmtTime, POINTS, SEGMENTS, type GroupEval, type Wind } from "./domain";

// ---------------------------------------------------------------- 点位平面图
// 1 单位 = 1 米；绘制四扇区、四个点位、各组有效半径圈与风况漂移箭头。
export function PlanView({ evals, wind }: { evals: GroupEval[]; wind: Wind }) {
  const cx = 160;
  const cy = 150;
  const arrowLen = 26 + wind.speed * 4;
  const rad = ((wind.arrowDeg - 90) * Math.PI) / 180;
  const ax = cx + Math.cos(rad) * arrowLen;
  const ay = cy + Math.sin(rad) * arrowLen;

  return (
    <svg className="plan" viewBox="0 0 320 300" role="img" aria-label="燃放点位平面图">
      {/* 扇区划分：中心向四角的斜线 */}
      <line x1={cx} y1={cy} x2={0} y2={0} className="sector-line" />
      <line x1={cx} y1={cy} x2={320} y2={0} className="sector-line" />
      <line x1={cx} y1={cy} x2={320} y2={300} className="sector-line" />
      <line x1={cx} y1={cy} x2={0} y2={300} className="sector-line" />
      <text x={160} y={16} className="sector-label">北扇区</text>
      <text x={308} y={152} className="sector-label" textAnchor="end">东扇区</text>
      <text x={160} y={294} className="sector-label">南扇区</text>
      <text x={12} y={152} className="sector-label">西扇区</text>

      {/* 各组有效半径圈（主点处） */}
      {evals.map((e) => (
        <g key={e.group.id}>
          <circle
            cx={e.main.x}
            cy={e.main.y}
            r={e.effectiveRadius}
            className={e.approved ? "radius-effective ok" : "radius-effective bad"}
          />
          <circle cx={e.main.x} cy={e.main.y} r={e.group.minRadius} className="radius-min" />
        </g>
      ))}

      {/* 点位 */}
      {POINTS.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={5} className="point-dot" />
          <text x={p.x} y={p.y - 9} className="point-label" textAnchor="middle">
            {p.name}
          </text>
        </g>
      ))}

      {/* 风况漂移箭头 */}
      <line x1={cx} y1={cy} x2={ax} y2={ay} className="wind-arrow" markerEnd="url(#windHead)" />
      <text x={cx + 8} y={cy - 8} className="wind-label">
        漂移 {Math.round(wind.speed * 4)}m
      </text>
      <defs>
        <marker id="windHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" />
        </marker>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------- 节目时间轴
export function Timeline({ evals }: { evals: GroupEval[] }) {
  const total = SEGMENTS[SEGMENTS.length - 1].end;
 // 全场时长（秒）
  return (
    <div className="timeline">
      <div className="timeline-bar">
        {SEGMENTS.map((s) => (
          <div
            key={s.id}
            className="timeline-seg"
            style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }}
          >
            <b>{s.name}</b>
            <span>
              {fmtTime(s.start)}–{fmtTime(s.end)}
            </span>
          </div>
        ))}
        {evals.map((e) => (
          <div
            key={e.group.id}
            className={e.approved ? "timeline-marker ok" : "timeline-marker bad"}
            style={{ left: `${(e.group.start / total) * 100}%` }}
            title={`${e.group.name} · ${e.main.name} · ${fmtTime(e.group.start)}`}
          >
            <i />
            <span>{e.group.name}</span>
          </div>
        ))}
      </div>
      <div className="timeline-scale">
        <span>{fmtTime(0)}</span>
        <span>{fmtTime(total)}</span>
      </div>
    </div>
  );
}
