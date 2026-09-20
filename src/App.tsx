import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  buildOverview,
  DRIFT_COEFF,
  driftOf,
  evaluateAll,
  fmtTime,
  groupsHash,
  loadState,
  POINTS,
  resetState,
  saveState,
  SEGMENTS,
  WINDS,
  type FireGroup,
  type GroupEval,
  type Overview,
} from "./domain";
import { PlanView, Timeline } from "./views";

const project = {
  sourceNo: 10,
  id: "hxyfront-62008",
  port: 62008,
  title: "烟花燃放联锁台",
};

interface Draft {
  mainPointId: string;
  altPointId: string;
  minRadius: number;
  start: number;
  duration: number;
}

function draftOf(g: FireGroup): Draft {
  return {
    mainPointId: g.mainPointId,
    altPointId: g.altPointId,
    minRadius: g.minRadius,
    start: g.start,
    duration: g.duration,
  };
}

function App() {
  const [initial] = useState(loadState);
  const [windId, setWindId] = useState(initial.windId);
  const [groups, setGroups] = useState<FireGroup[]>(initial.groups);
  const [overview, setOverview] = useState<Overview | null>(initial.overview);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const wind = WINDS.find((w) => w.id === windId) ?? WINDS[0];
  const evals = useMemo(() => evaluateAll(groups, wind), [groups, wind]);
  const approvedCount = evals.filter((e) => e.approved).length;
  const allApproved = evals.every((e) => e.approved);
  const overviewStale =
    overview !== null && (overview.windId !== wind.id || overview.groupsHash !== groupsHash(groups));

  // 数据只存浏览器：任何状态变化即写入 localStorage，刷新后保留
  useEffect(() => {
    saveState({ windId, groups, overview });
  }, [windId, groups, overview]);

  function openEdit(e: GroupEval) {
    setEditingId(e.group.id);
    setDraft(draftOf(e.group));
  }

  function saveEdit(groupId: string) {
    if (!draft) return;
    const clean: FireGroup = {
      ...groups.find((g) => g.id === groupId)!,
      mainPointId: draft.mainPointId,
      altPointId: draft.altPointId,
      minRadius: Math.max(1, Math.round(draft.minRadius)),
      start: Math.max(0, Math.round(draft.start)),
      duration: Math.max(1, Math.round(draft.duration)),
    };
    setGroups(groups.map((g) => (g.id === groupId ? clean : g)));
    setEditingId(null);
    setDraft(null);
  }

  function restoreSeeds() {
    const fresh = resetState();
    setWindId(fresh.windId);
    setGroups(fresh.groups);
    setOverview(fresh.overview);
    setEditingId(null);
    setDraft(null);
  }

  const metrics: Array<[string, string]> = [
    ["预置点位", `${POINTS.length} 点`],
    ["节目段落", `${SEGMENTS.length} 段`],
    ["点火组", `${groups.length} 组`],
    ["联锁结果", `获准 ${approvedCount} · 拒绝 ${evals.length - approvedCount}`],
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>
          预置四个点位、三段节目与两种风况。每个点火组登记扇区、最小安全半径、持续时间与备选点；
          风况变化后按「漂移 = 风速 × {DRIFT_COEFF}s」重算有效半径——若有效半径与邻点交叠、
          持续越过节目段，或备选点与主点同扇区，则整组拒绝且原排期不变。
          只有所有组获准才能生成总览。数据仅保存于本浏览器，刷新后保留。
        </span>
      </section>

      <section className="metrics">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>风况切换</p>
            <h2>当前风况：{wind.name}</h2>
          </div>
          <button onClick={restoreSeeds}>重置为预置数据</button>
        </div>
        <div className="wind-grid">
          {WINDS.map((w) => (
            <button
              key={w.id}
              className={w.id === wind.id ? "wind-card active" : "wind-card"}
              onClick={() => setWindId(w.id)}
            >
              <b>{w.name}</b>
              <span>{w.dirLabel}</span>
              <span>
                风速 {w.speed} m/s · 漂移 {driftOf(w)} m
              </span>
            </button>
          ))}
        </div>
        <p className="note">切换风况即重算全部点火组的漂移与有效半径，并重新执行联锁评估。</p>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>点位平面图</h2>
          <PlanView evals={evals} wind={wind} />
          <ul className="legend">
            <li><i className="dot ok" /> 有效半径（获准）</li>
            <li><i className="dot bad" /> 有效半径（拒绝）</li>
            <li><i className="dot min" /> 最小安全半径</li>
          </ul>
          <h2>节目段时间轴</h2>
          <Timeline evals={evals} />
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>点火组登记</p>
              <h2>联锁评估（{wind.name}）</h2>
            </div>
          </div>
          <div className="groups">
            {evals.map((e) => (
              <article key={e.group.id} className={e.approved ? "group ok" : "group bad"}>
                <header>
                  <div>
                    <h3>
                      {e.group.name}
                      <em>{e.group.model}</em>
                    </h3>
                    <p>
                      主点 {e.main.name}（{e.main.sector}） · 备选 {e.alt.name}（{e.alt.sector}）
                    </p>
                  </div>
                  <span className="badge">{e.approved ? "获准" : "整组拒绝 · 原排期不变"}</span>
                </header>

                <dl className="spec">
                  <div><dt>点火时刻</dt><dd>{fmtTime(e.group.start)}</dd></div>
                  <div><dt>持续时间</dt><dd>{e.group.duration}s</dd></div>
                  <div><dt>预计结束</dt><dd>{fmtTime(e.end)}</dd></div>
                  <div><dt>节目段</dt><dd>{e.segment ? e.segment.name : "段外"}</dd></div>
                  <div><dt>最小安全半径</dt><dd>{e.group.minRadius}m</dd></div>
                  <div><dt>有效半径</dt><dd>{e.effectiveRadius}m（含漂移 {e.drift}m）</dd></div>
                </dl>

                {e.rejections.length > 0 && (
                  <ul className="rejections">
                    {e.rejections.map((r, i) => (
                      <li key={i}>
                        <b>[{r.rule}]</b> {r.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {editingId === e.group.id && draft ? (
                  <div className="editor">
                    <div className="field-grid">
                      <label>
                        <span>主点（登记扇区随主点）</span>
                        <select
                          value={draft.mainPointId}
                          onChange={(ev) => setDraft({ ...draft, mainPointId: ev.target.value })}
                        >
                          {POINTS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} · {p.sector}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>备选点</span>
                        <select
                          value={draft.altPointId}
                          onChange={(ev) => setDraft({ ...draft, altPointId: ev.target.value })}
                        >
                          {POINTS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} · {p.sector}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>最小安全半径（米）</span>
                        <input
                          type="number"
                          min={1}
                          value={draft.minRadius}
                          onChange={(ev) => setDraft({ ...draft, minRadius: Number(ev.target.value) })}
                        />
                      </label>
                      <label>
                        <span>点火时刻（秒，当前 {fmtTime(draft.start)}）</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.start}
                          onChange={(ev) => setDraft({ ...draft, start: Number(ev.target.value) })}
                        />
                      </label>
                      <label>
                        <span>持续时间（秒）</span>
                        <input
                          type="number"
                          min={1}
                          value={draft.duration}
                          onChange={(ev) => setDraft({ ...draft, duration: Number(ev.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="editor-actions">
                      <button className="primary" onClick={() => saveEdit(e.group.id)}>保存登记</button>
                      <button onClick={() => { setEditingId(null); setDraft(null); }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <button className="edit-btn" onClick={() => openEdit(e)}>编辑登记</button>
                )}
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>整场总览</p>
            <h2>燃放总览</h2>
          </div>
          <button
            className="primary"
            disabled={!allApproved}
            title={allApproved ? "生成总览" : "存在未获准的点火组，无法生成总览"}
            onClick={() => setOverview(buildOverview(evals, wind))}
          >
            {overview ? "重新生成总览" : "生成总览"}
          </button>
        </div>

        {!allApproved && (
          <p className="note warn">
            {evals.length - approvedCount} 个点火组未获准（
            {evals.filter((e) => !e.approved).map((e) => e.group.name).join("、")}
            ），联锁未解除，不能生成总览。
          </p>
        )}
        {overviewStale && (
          <p className="note warn">风况或排期已变化，当前总览失效，请在全部获准后重新生成。</p>
        )}

        {overview && !overviewStale ? (
          <div className="overview">
            <p className="note">
              生成于 {new Date(overview.generatedAt).toLocaleString()} · 风况「{overview.windName}」 ·
              共 {overview.rows.length} 组，全部获准。
            </p>
            <table>
              <thead>
                <tr>
                  <th>节目段</th><th>点火组</th><th>型号</th><th>点位</th><th>扇区</th>
                  <th>点火</th><th>结束</th><th>持续</th><th>有效半径</th><th>备选点</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((r) => (
                  <tr key={r.groupId}>
                    <td>{r.segmentName}</td>
                    <td>{r.name}</td>
                    <td>{r.model}</td>
                    <td>{r.pointName}</td>
                    <td>{r.sector}</td>
                    <td>{fmtTime(r.start)}</td>
                    <td>{fmtTime(r.end)}</td>
                    <td>{r.duration}s</td>
                    <td>{r.effectiveRadius}m（{r.minRadius}+{r.drift}）</td>
                    <td>{r.altPointName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !overview && <p className="note">全部点火组获准后，可在此生成整场燃放总览。</p>
        )}
      </section>
    </main>
  );
}

export default App;
