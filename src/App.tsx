import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  CENTER,
  DEFAULT_GROUPS,
  IgnitionGroup,
  POINTS,
  REASON_TAG,
  ReasonKind,
  SECTORS,
  SEGMENTS,
  SectorId,
  SITE_H,
  SITE_W,
  Verdict,
  WINDS,
  evaluate,
  fmt,
  parseTime,
  pointById,
  polarPoint,
  sectorName,
  windUnit,
} from "./interlock";

const STORAGE_KEY = "hxyfront-62008:interlock:v1";

/* ============================== 持久化 ============================== */

interface PersistShape {
  groups: IgnitionGroup[];
  windId: string;
}

function loadState(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistShape;
    if (!Array.isArray(data.groups)) return null;
    return {
      groups: data.groups.map((g) => ({
        id: String(g.id),
        name: String(g.name ?? ""),
        model: String(g.model ?? ""),
        pointId: String(g.pointId ?? "B1"),
        backupPointId: String(g.backupPointId ?? "B2"),
        sector: (SECTORS.some((s) => s.id === g.sector) ? g.sector : "N") as SectorId,
        radius: Number(g.radius) || 0,
        start: Number(g.start) || 0,
        duration: Number(g.duration) || 0,
      })),
      windId: String(data.windId ?? WINDS[0].id),
    };
  } catch {
    return null;
  }
}

/* ============================== 表单 ============================== */

interface Draft {
  editingId: string | null;
  name: string;
  model: string;
  pointId: string;
  backupPointId: string;
  sector: SectorId;
  radius: string;
  startText: string;
  duration: string;
}

function emptyDraft(): Draft {
  return {
    editingId: null,
    name: "",
    model: "",
    pointId: "B1",
    backupPointId: "B3",
    sector: "E",
    radius: "30",
    startText: "00:00.000",
    duration: "10",
  };
}

/* ============================== 组件 ============================== */

function App() {
  const initial = useMemo(loadState, []);
  const [groups, setGroups] = useState<IgnitionGroup[]>(
    () => initial?.groups ?? DEFAULT_GROUPS
  );
  const [windId, setWindId] = useState<string>(() => initial?.windId ?? WINDS[0].id);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState("");

  const wind = WINDS.find((w) => w.id === windId) ?? WINDS[0];
  const verdicts = useMemo(() => evaluate(groups, wind), [groups, wind]);
  const approvedCount = groups.filter((g) => verdicts[g.id]?.approved).length;
  const allApproved = groups.length > 0 && approvedCount === groups.length;

  // 数据只存浏览器，刷新后保留
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups, windId }));
    } catch {
      /* 存储不可用时静默 */
    }
  }, [groups, windId]);

  function groupColor(index: number, approved: boolean): string {
    if (!approved) return "#dc2626";
    return index % 2 === 0 ? "#1d4ed8" : "#f59e0b";
  }

  function submitGroup() {
    const radius = Number(draft.radius);
    const duration = Number(draft.duration);
    const start = parseTime(draft.startText);
    if (!draft.name.trim()) return setFormError("请填写点火组名称");
    if (!(radius > 0)) return setFormError("最小安全半径需为正数（m）");
    if (!(duration > 0)) return setFormError("持续时间需为正数（s）");
    if (start === null) return setFormError("点火时间格式应为 mm:ss.cc，例如 01:08.200");
    if (!pointById(draft.pointId) || !pointById(draft.backupPointId))
      return setFormError("请选择有效的主点与备选点");

    const next: IgnitionGroup = {
      id: draft.editingId ?? `G-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: draft.name.trim(),
      model: draft.model.trim(),
      pointId: draft.pointId,
      backupPointId: draft.backupPointId,
      sector: draft.sector,
      radius,
      start,
      duration,
    };
    setGroups((prev) =>
      draft.editingId ? prev.map((g) => (g.id === draft.editingId ? next : g)) : [...prev, next]
    );
    setDraft(emptyDraft());
    setFormError("");
  }

  function editGroup(g: IgnitionGroup) {
    setDraft({
      editingId: g.id,
      name: g.name,
      model: g.model,
      pointId: g.pointId,
      backupPointId: g.backupPointId,
      sector: g.sector,
      radius: String(g.radius),
      startText: fmt(g.start),
      duration: String(g.duration),
    });
    setFormError("");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function removeGroup(id: string) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    if (draft.editingId === id) setDraft(emptyDraft());
  }

  function resetDefaults() {
    if (!window.confirm("恢复为预置四点 / 三段节目 / 两种风况下的演示排期？当前登记将被覆盖。")) return;
    setGroups(DEFAULT_GROUPS);
    setWindId(WINDS[0].id);
    setDraft(emptyDraft());
    setFormError("");
  }

  const u = windUnit(wind.dir);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62008 · 源提示词10 · Port 62008</p>
        <h1>受风况约束的燃放联锁台</h1>
        <span>
          预置四点、三段节目与两种风况。每个点火组登记扇区、最小安全半径、持续时间与备选点；切换风况后自动重算风漂移与有效危险区，
          出现漂移交叠、持续越过节目段或备选点与主点同扇区即整组拒绝，<b>联锁只判定、不改期，原排期保持不变</b>；
          仅当所有组获准才生成整场总览。数据仅保存在本浏览器，刷新后保留。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>预置点位</small>
          <strong>{POINTS.length}</strong>
        </article>
        <article>
          <small>节目段落</small>
          <strong>{SEGMENTS.length}</strong>
        </article>
        <article>
          <small>预置风况</small>
          <strong>{WINDS.length}</strong>
        </article>
        <article>
          <small>当前获准</small>
          <strong className={allApproved ? "ok" : "bad"}>
            {approvedCount}/{groups.length}
          </strong>
        </article>
      </section>

      {/* 风况切换：变化即重算漂移并重跑联锁 */}
      <section className="panel">
        <div className="heading">
          <div>
            <p>风况联锁</p>
            <h2>当前风况（切换后立即重算所有点火组的风漂移）</h2>
          </div>
          <button onClick={resetDefaults}>恢复预置演示数据</button>
        </div>
        <div className="wind-grid">
          {WINDS.map((w) => (
            <button
              key={w.id}
              className={"wind-card" + (w.id === windId ? " active" : "")}
              onClick={() => setWindId(w.id)}
            >
              <span className="wind-name">{w.name}</span>
              <span className="wind-desc">{w.desc}</span>
              <span className="wind-meta">
                漂移/秒 = {w.speed.toFixed(1)}m · 组漂移 = {w.speed}m/s × 持续s
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        {/* 点位平面图：扇区 / 点 / 备选连线 / 漂移有效危险区 */}
        <section className="panel map-panel">
          <p className="panel-kicker">燃放点位平面图（1 格 = 50m）</p>
          <h2>扇区与风漂移有效危险区</h2>
          <svg viewBox="-20 -30 440 580" className="site-svg" role="img" aria-label="点位平面图">
            <defs>
              <clipPath id="siteClip">
                <rect x="0" y="0" width={SITE_W} height={SITE_H} />
              </clipPath>
            </defs>

            {/* 四扇区（以场地中心为原点的 90° 角扇区） */}
            <g clipPath="url(#siteClip)">
              {SECTORS.map((s, i) => {
                const a1 = i * 90 - 45;
                const p1 = polarPoint(CENTER.x, CENTER.y, 320, a1);
                const p2 = polarPoint(CENTER.x, CENTER.y, 320, a1 + 90);
                return (
                  <path
                    key={s.id}
                    d={`M ${CENTER.x} ${CENTER.y} L ${p1.x} ${p1.y} A 320 320 0 0 1 ${p2.x} ${p2.y} Z`}
                    fill={s.color}
                  />
                );
              })}
              {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((v) => (
                <g key={"g" + v} stroke="#e2e8f0" strokeWidth="0.6">
                  <line x1={v} y1="0" x2={v} y2={SITE_H} />
                  <line x1="0" y1={v} x2={SITE_W} y2={v} />
                </g>
              ))}
              {[-45, 45, 135, 225].map((a) => {
                const p = polarPoint(CENTER.x, CENTER.y, 320, a);
                return <line key={a} x1={CENTER.x} y1={CENTER.y} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5 4" />;
              })}
            </g>
            <rect x="0" y="0" width={SITE_W} height={SITE_H} fill="none" stroke="#94a3b8" strokeWidth="1.5" />

            {/* 主点 → 备选点 连线 */}
            {groups.map((g) => {
              const pa = pointById(g.pointId);
              const pb = pointById(g.backupPointId);
              if (!pa || !pb || pa.id === pb.id) return null;
              return (
                <line
                  key={"bk" + g.id}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.8"
                />
              );
            })}

            {/* 风漂移有效危险区：从主点向下风延伸的胶囊（半径 = 最小安全半径，长度 = 漂移） */}
            {groups.map((g, i) => {
              const p = pointById(g.pointId);
              const v = verdicts[g.id];
              if (!p || !v) return null;
              const approved = v.approved;
              const color = groupColor(i, approved);
              const ex = p.x + v.drift * u.x;
              const ey = p.y + v.drift * u.y;
              const tip = [
                `${g.name}（${g.id}）`,
                `主点 ${p.id} ${p.name} · ${fmt(g.start)}–${fmt(v.end)}`,
                `最小安全半径 ${g.radius}m，${wind.name}漂移 ${v.drift.toFixed(1)}m`,
                approved ? "联锁通过" : v.reasons.map((r) => "· " + r.text).join("\n"),
              ].join("\n");
              return (
                <g key={"cap" + g.id}>
                  <title>{tip}</title>
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={ex}
                    y2={ey}
                    stroke={color}
                    strokeWidth={g.radius * 2}
                    strokeLinecap="round"
                    opacity="0.16"
                  />
                  <line x1={p.x} y1={p.y} x2={ex} y2={ey} stroke={color} strokeWidth="1.4" opacity="0.75" />
                  {v.drift > 8 && (
                    <polygon
                      points={`${ex},${ey} ${ex - 11 * u.x + 6 * u.y},${ey - 11 * u.y - 6 * u.x} ${ex - 11 * u.x - 6 * u.y},${ey - 11 * u.y + 6 * u.x}`}
                      fill={color}
                      opacity="0.85"
                    />
                  )}
                </g>
              );
            })}

            {/* 点位 */}
            {POINTS.map((p) => (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r="5.5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
                <text x={p.x + 8} y={p.y - 7} className="point-label" paintOrder="stroke">
                  {p.id} {p.name}
                </text>
              </g>
            ))}

            {/* 风矢 */}
            <g transform={`translate(330 30)`}>
              <line x1="0" y1="0" x2={26 * u.x} y2={26 * u.y} stroke="#0f172a" strokeWidth="2.4" />
              <polygon
                points={`${26 * u.x},${26 * u.y} ${26 * u.x - 9 * u.x + 5 * u.y},${26 * u.y - 9 * u.y - 5 * u.x} ${26 * u.x - 9 * u.x - 5 * u.y},${26 * u.y - 9 * u.y + 5 * u.x}`}
                fill="#0f172a"
              />
              <text x="0" y="-10" className="wind-label">
                {wind.name} {wind.speed}m/s
              </text>
            </g>
          </svg>
          <ul className="legend">
            <li><i style={{ background: "#1d4ed8" }} />获准组有效危险区</li>
            <li><i style={{ background: "#f59e0b" }} />获准组（交替色）</li>
            <li><i style={{ background: "#dc2626" }} />被拒组有效危险区</li>
            <li><i className="dash" />主点 → 备选点</li>
          </ul>
        </section>

        {/* 三段节目 + 联锁总状态 */}
        <section className="panel">
          <p className="panel-kicker">三段节目</p>
          <h2>节目段排期窗</h2>
          <div className="seg-list">
            {SEGMENTS.map((s) => (
              <article key={s.id} className="seg-item" style={{ borderLeftColor: s.color }}>
                <h3>{s.name}</h3>
                <p>
                  {fmt(s.start)} – {fmt(s.end)}
                  <span>（时长 {(s.end - s.start).toFixed(0)}s）</span>
                </p>
              </article>
            ))}
            <article className="seg-item gap">
              <h3>段间空档</h3>
              <p>
                {fmt(110)} – {fmt(120)}
                <span>（落入此刻的点火组拒绝编入）</span>
              </p>
            </article>
          </div>

          <div className={"interlock-banner " + (allApproved ? "ok" : "lock")}>
            {allApproved ? (
              <>
                <b>联锁全部解除</b>
                <span>
                  {groups.length}/{groups.length} 组在「{wind.name}」下获准，整场总览已生成（见下方）。
                </span>
              </>
            ) : (
              <>
                <b>联锁未解除 · {groups.length - approvedCount} 组被拒</b>
                <span>
                  当前风况「{wind.name}」下仅 {approvedCount}/{groups.length} 组获准。被拒组保留原排期，
                  系统不自动改期、不自动切换备选点；调整登记后重算，全部获准方可生成总览。
                </span>
              </>
            )}
          </div>
        </section>
      </section>

      {/* 点火组登记表 */}
      <section className="panel">
        <div className="heading">
          <div>
            <p>点火组登记</p>
            <h2>{draft.editingId ? "编辑点火组" : "新增点火组"}</h2>
          </div>
          {draft.editingId && (
            <button onClick={() => { setDraft(emptyDraft()); setFormError(""); }}>取消编辑</button>
          )}
        </div>
        <div className="field-grid">
          <label>
            <span>点火组名称</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="如：开场扇形架" />
          </label>
          <label>
            <span>烟花型号</span>
            <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="如：75mm礼花弹" />
          </label>
          <label>
            <span>主点火点</span>
            <select
              value={draft.pointId}
              onChange={(e) => {
                const p = pointById(e.target.value);
                setDraft({ ...draft, pointId: e.target.value, sector: p?.sector ?? draft.sector });
              }}
            >
              {POINTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.name}（{sectorName(p.sector)}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>备选点（须与主点异扇区）</span>
            <select value={draft.backupPointId} onChange={(e) => setDraft({ ...draft, backupPointId: e.target.value })}>
              {POINTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.name}（{sectorName(p.sector)}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>登记扇区（跟随主点，可改）</span>
            <select value={draft.sector} onChange={(e) => setDraft({ ...draft, sector: e.target.value as SectorId })}>
              {SECTORS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>最小安全半径（m）</span>
            <input type="number" min="1" step="1" value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: e.target.value })} />
          </label>
          <label>
            <span>点火时间（mm:ss.cc）</span>
            <input value={draft.startText} onChange={(e) => setDraft({ ...draft, startText: e.target.value })} placeholder="00:12.500" />
          </label>
          <label>
            <span>持续时间（s）</span>
            <input type="number" min="0.5" step="0.5" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} />
          </label>
        </div>
        {formError && <p className="form-error">{formError}</p>}
        <div className="form-actions">
          <button className="primary" onClick={submitGroup}>
            {draft.editingId ? "保存修改并重算联锁" : "登记点火组并重算联锁"}
          </button>
          <span className="form-hint">登记即保存到本浏览器；联锁拒绝不会改动任何已保存的排期。</span>
        </div>

        <div className="groups">
          {groups.map((g, i) => {
            const v: Verdict | undefined = verdicts[g.id];
            const main = pointById(g.pointId);
            const back = pointById(g.backupPointId);
            const seg = SEGMENTS.find((s) => s.id === v?.segmentId);
            if (!v) return null;
            return (
              <article key={g.id} className={"igroup " + (v.approved ? "approved" : "rejected")}>
                <div className="igroup-head">
                  <b style={{ background: groupColor(i, v.approved) }}>{g.id.replace("G-", "◆").slice(0, 3)}</b>
                  <div>
                    <h3>
                      {g.name}
                      {g.model && <em> · {g.model}</em>}
                    </h3>
                    <p>
                      主点 {main ? `${main.id} ${main.name}` : g.pointId} → 备选 {back ? `${back.id} ${back.name}` : g.backupPointId}
                      {" · "}登记{sectorName(g.sector)} · 最小安全半径 {g.radius}m
                    </p>
                  </div>
                  <span className={"badge " + (v.approved ? "ok" : "bad")}>
                    {v.approved ? "联锁通过" : "整组拒绝"}
                  </span>
                </div>
                <div className="igroup-meta">
                  <span>
                    点火 {fmt(g.start)} · 持续 {g.duration.toFixed(1)}s · 结束 {fmt(v.end)}
                  </span>
                  <span>{seg ? `节目段「${seg.name}」` : "无所属节目段"}</span>
                  <span>
                    {wind.name}漂移 <b>{v.drift.toFixed(1)}m</b> · 有效下风距离 {(v.drift + g.radius).toFixed(1)}m
                  </span>
                </div>
                {!v.approved && (
                  <ul className="reason-list">
                    {v.reasons.map((r, k) => (
                      <li key={k}>
                        <span className="reason-tag" data-kind={r.kind}>{REASON_TAG[r.kind as ReasonKind]}</span>
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="igroup-actions">
                  <button onClick={() => editGroup(g)}>编辑（原排期不变，保存后重算）</button>
                  <button className="danger" onClick={() => removeGroup(g.id)}>删除</button>
                </div>
              </article>
            );
          })}
          {groups.length === 0 && <p className="empty-hint">暂无点火组，登记后开始联锁判定。</p>}
        </div>
      </section>

      {/* 总览：只有所有组获准才生成 */}
      {allApproved ? (
        <section className="panel overview">
          <div className="heading">
            <div>
              <p className="panel-kicker">整场节目总览</p>
              <h2>联锁全绿 · 总览（{wind.name}）</h2>
            </div>
            <button className="primary" onClick={() => window.print()}>打印 / 导出总览</button>
          </div>

          <svg viewBox="0 0 1000 180" className="timeline-svg" role="img" aria-label="整场时间轴">
            {SEGMENTS.map((s) => (
              <g key={s.id}>
                <rect
                  x={20 + (s.start / 200) * 960}
                  y="10"
                  width={((s.end - s.start) / 200) * 960}
                  height={20 + groups.length * 20 + 8}
                  fill={s.color}
                  opacity="0.08"
                />
                <text x={28 + (s.start / 200) * 960} y="26" className="seg-label">{s.name}</text>
              </g>
            ))}
            {Array.from({ length: 21 }, (_, k) => k * 10).map((t) => (
              <g key={t}>
                <line x1={20 + (t / 200) * 960} y1={20 + groups.length * 20 + 8} x2={20 + (t / 200) * 960} y2={20 + groups.length * 20 + 14} stroke="#64748b" strokeWidth="1" />
                <text x={20 + (t / 200) * 960} y={20 + groups.length * 20 + 28} className="tick-label">{fmt(t).slice(0, 5)}</text>
              </g>
            ))}
            {groups.map((g, i) => {
              const color = groupColor(i, true);
              const x = 20 + (g.start / 200) * 960;
              const w = Math.max(3, (g.duration / 200) * 960);
              const y = 36 + i * 20;
              return (
                <g key={g.id}>
                  <rect x={x} y={y} width={w} height="14" rx="3" fill={color} />
                  <text x={x + 5} y={y + 11} className="bar-label">
                    {g.id} {g.name}
                  </text>
                  <text x={Math.min(x + w + 6, 880)} y={y + 11} className="bar-time">
                    {fmt(g.start)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>组</th><th>型号</th><th>主点</th><th>备选点</th><th>登记扇区</th>
                  <th>点火</th><th>持续</th><th>结束</th><th>节目段</th>
                  <th>安全半径</th><th>风漂移</th><th>有效下风距离</th><th>状态</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => {
                  const v = verdicts[g.id];
                  const seg = SEGMENTS.find((s) => s.id === v?.segmentId);
                  return (
                    <tr key={g.id}>
                      <td><b style={{ color: groupColor(i, true) }}>{g.id}</b> {g.name}</td>
                      <td>{g.model || "—"}</td>
                      <td>{g.pointId}</td>
                      <td>{g.backupPointId}</td>
                      <td>{sectorName(g.sector)}</td>
                      <td>{fmt(g.start)}</td>
                      <td>{g.duration.toFixed(1)}s</td>
                      <td>{fmt(v.end)}</td>
                      <td>{seg?.name ?? "—"}</td>
                      <td>{g.radius}m</td>
                      <td>{v.drift.toFixed(1)}m</td>
                      <td>{(v.drift + g.radius).toFixed(1)}m</td>
                      <td><span className="badge ok">获准</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel overview-lock">
          <div className="heading">
            <div>
              <p className="panel-kicker">整场节目总览</p>
              <h2>总览未生成 · 联锁拒绝明细</h2>
            </div>
          </div>
          <p className="lock-hint">
            存在 {groups.length - approvedCount} 个被拒点火组，按联锁规程不得生成整场总览。以下说明均落到点位与时刻；
            被拒组原排期保持不变，修改登记并通过重算后，总览自动恢复生成。
          </p>
          <ul className="lock-reasons">
            {groups.filter((g) => !verdicts[g.id]?.approved).flatMap((g) =>
              verdicts[g.id].reasons.map((r, k) => (
                <li key={g.id + k}>
                  <span className="reason-tag" data-kind={r.kind}>{REASON_TAG[r.kind as ReasonKind]}</span>
                  {r.text}
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      <footer className="footnote">
        所有登记与风况选择仅保存在本浏览器 localStorage（键 {STORAGE_KEY}），刷新或重开页面后保留；清除站点数据或点击「恢复预置演示数据」可还原。
      </footer>
    </main>
  );
}

export default App;
