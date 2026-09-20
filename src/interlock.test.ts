import { DEFAULT_GROUPS, WINDS, evaluate } from "./interlock";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

for (const wind of WINDS) {
  console.log(`\n=== ${wind.name} ===`);
  const v = evaluate(DEFAULT_GROUPS, wind);
  for (const g of DEFAULT_GROUPS) {
    const r = v[g.id];
    console.log(
      `${g.id} ${g.name}: ${r.approved ? "获准" : "拒绝"} drift=${r.drift} end=${r.end} seg=${r.segmentId ?? "-"}`
    );
    for (const reason of r.reasons) console.log(`    [${reason.kind}] ${reason.text}`);
  }
}

const wa = evaluate(DEFAULT_GROUPS, WINDS[0]); // 弱风 210° 3m/s
const wb = evaluate(DEFAULT_GROUPS, WINDS[1]); // 强南风 9m/s

console.log("\n=== 规则断言 ===");
check("弱风: G1 被漂移交叠拒绝", !wa.G1.approved && wa.G1.reasons.some((r) => r.kind === "overlap"));
check("弱风: G2 被漂移交叠拒绝", !wa.G2.approved && wa.G2.reasons.some((r) => r.kind === "overlap"));
check("弱风: G1/G2 双向原因（互指）",
  wa.G1.reasons.some((r) => r.text.includes("G2") || r.text.includes("主礼花齐射")) &&
  wa.G2.reasons.some((r) => r.text.includes("G1") || r.text.includes("开场扇形架")));
check("弱风: G3 通过", wa.G3.approved);
check("弱风: G4 越段拒绝", !wa.G4.approved && wa.G4.reasons.some((r) => r.kind === "segment"));
check("弱风: G4 结束 02:05 越过 Chorus A 01:50", wa.G4.end === 125);
check("弱风: G5 备选点同扇区拒绝", !wa.G5.approved && wa.G5.reasons.some((r) => r.kind === "backup"));
check("弱风: 非全绿，无总览条件", DEFAULT_GROUPS.some((g) => !wa[g.id].approved));

check("强南风: G1 通过", wb.G1.approved);
check("强南风: G2 通过", wb.G2.approved);
check("强南风: G3 通过", wb.G3.approved);
check("强南风: G4 仍越段拒绝", !wb.G4.approved && wb.G4.reasons.some((r) => r.kind === "segment"));
check("强南风: G5 仍备选点同扇区", !wb.G5.approved && wb.G5.reasons.some((r) => r.kind === "backup"));
check("强南风漂移 G1=360m", wb.G1.drift === 360);
check("弱风漂移 G1=120m", wa.G1.drift === 120);

// 修复场景：G4 提前到段内并改到 B4、G5 备选点改异扇区 → 强南风全绿
const fixed = DEFAULT_GROUPS.map((g) =>
  g.id === "G4" ? { ...g, start: 85, duration: 20, pointId: "B4" } : g
).map((g) => (g.id === "G5" ? { ...g, backupPointId: "B2" } : g));
const wf = evaluate(fixed, WINDS[1]);
check("修复后强南风: 全部获准", fixed.every((g) => wf[g.id].approved),
  fixed.filter((g) => !wf[g.id].approved).map((g) => g.id + ":" + wf[g.id].reasons.map((r) => r.kind).join(",")).join("; "));

// 段间空档：点火落在 115s 应 schedule 拒绝
const gapGroup = [{ ...DEFAULT_GROUPS[0], id: "GX", start: 115, duration: 3 }];
const wg = evaluate(gapGroup, WINDS[1]);
check("段间空档点火被 schedule 拒绝", !wg.GX.approved && wg.GX.reasons.some((r) => r.kind === "schedule"));

// 纯函数性：拒绝不改排期
const snapshot = JSON.stringify(DEFAULT_GROUPS);
evaluate(DEFAULT_GROUPS, WINDS[0]);
check("评估不改变输入排期", JSON.stringify(DEFAULT_GROUPS) === snapshot);

console.log(failures === 0 ? "\n全部断言通过" : `\n${failures} 条断言失败`);
process.exit(failures === 0 ? 0 : 1);
