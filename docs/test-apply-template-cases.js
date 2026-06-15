/**
 * applyTemplate 範本套用引擎 — 測試案例（§8d.6 批1：步驟①②③）
 * ─────────────────────────────────────────────────────────────
 * 執行：node docs/test-apply-template-cases.js
 * 逐案印 PASS / FAIL，最後印總計；全過 exit 0，有失敗 exit 1。
 *
 * 涵蓋（批1）：①建專案 ②建 variants(含 schedule)+對照表 ③建 depts(role→人)。
 *   task/warnings 批1 留空，步驟④~⑧後批補測。
 *
 * ⚠ sync 複本：app.js 非 module，node 無法 require。下方 applyTemplate body 為 app.js
 *   App.applyTemplate 的同步複本——改 app.js 引擎請同步此處，否則驗到舊邏輯。
 * ⚠ U.id 用遞增 stub（id_1,id_2…）取代 app.js 的 Date.now/Math.random 版，使測試決定性；
 *   測「結構與關聯」（variantNameToId 對得上 variants[i].id）非測字面 id。
 */

// ── stubs（測試環境，對齊 app.js 介面） ──
let _idc = 0;
const U = { id() { return 'id_' + (++_idc); }, esc(s) { return String(s == null ? '' : s); } };
const PROJ_COLORS = ['#4A7C5C', '#5C7A8B', '#A8693B'];
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}
const App = {};

// ════ applyTemplate 同步複本（批1：①②③） ════════════════════
App.applyTemplate = function(template, userInput) {
  const ui = userInput || {};
  const project = {
    id: U.id(),
    name: (ui.projectName || '').trim(),
    color: ui.color || PROJ_COLORS[0],
    note: (ui.note || '').trim(),
    synced: false,
    createdAt: new Date().toISOString(),
  };
  ensurePdcaData(project);
  const variants = [];
  const variantNameToId = {};
  (ui.cases || []).forEach(c => {
    const id = U.id();
    const name = (c.variantName || '').trim();
    variants.push({
      id, name,
      schedule: {
        startDate: c.startDate || '',
        endDate: c.endDate || '',
        direction: c.direction || 'forward',
      },
      stages: c.selectedStages ? c.selectedStages.slice() : [],
    });
    variantNameToId[name] = id;
  });
  const depts = [];
  const roleMap = ui.roleMap || {};
  Object.keys(roleMap).forEach(role => {
    const r = (role || '').trim();
    const person = (roleMap[role] || '').trim();
    if (!r || !person) return;
    depts.push({ id: U.id(), name: r, members: [{ id: U.id(), name: person }] });
  });
  return { project, variants, variantNameToId, depts, tasks: [], warnings: [] };
};

// ════ check ════════════════════════════════════════════════
let pass = 0, fail = 0;
function check(name, got, expected, why) {
  const g = typeof got === 'object' ? JSON.stringify(got) : String(got);
  const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected);
  const ok = g === e;
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok) { console.log(`       got=${g}  expected=${e}`); if (why) console.log(`       why: ${why}`); }
}

// ════ 共用 fixture ════════════════════════════════════════
const TPL = { templateId: 'product-dev-v1', templateName: '產品開發範本' };
const UI = {
  projectName: '  測試專案  ', note: ' 備註 ',
  cases: [
    { variantName: '主案', startDate: '2026-07-01', endDate: '', direction: 'forward', selectedStages: ['Prototype', 'EVT'] },
    { variantName: '另案', startDate: '2026-08-01', endDate: '2026-12-01', direction: 'backward', selectedStages: ['EVT'] },
  ],
  roleMap: { PM: '王小明', ME: '李大華', EE: '' },   // EE 無人 → 不建
};

// ════ 1. 專案欄位 ════
const r1 = App.applyTemplate(TPL, UI);
check('1a 專案名去空白', r1.project.name, '測試專案');
check('1b 備註去空白', r1.project.note, '備註');
check('1c color 預設取 PROJ_COLORS[0]', r1.project.color, PROJ_COLORS[0]);
check('1d synced=false', r1.project.synced, false);
check('1e ensurePdcaData 補 pdcaData', r1.project.pdcaData, { startDate: '', targetDate: '', summary: '' });
check('1f project.id 有值（id_ 開頭）', /^id_/.test(r1.project.id), true);

// ════ 2. variants + schedule ════
check('2a variants 數量=cases 數', r1.variants.length, 2);
check('2b 主案 name', r1.variants[0].name, '主案');
check('2c 主案 schedule', r1.variants[0].schedule, { startDate: '2026-07-01', endDate: '', direction: 'forward' });
check('2d 另案 schedule(逆推+結束日)', r1.variants[1].schedule, { startDate: '2026-08-01', endDate: '2026-12-01', direction: 'backward' });
check('2e selectedStages 帶入 stages', r1.variants[1].stages, ['EVT']);

// ════ 3. variantNameToId 對照表 ════
check('3a 對照表 key=主案 → variants[0].id', r1.variantNameToId['主案'], r1.variants[0].id);
check('3b 對照表 key=另案 → variants[1].id', r1.variantNameToId['另案'], r1.variants[1].id);

// ════ 4. depts + members ════
check('4a depts 數量（PM/ME，EE 無人跳過）', r1.depts.length, 2);
check('4b dept name=role', r1.depts[0].name, 'PM');
check('4c member name=人', r1.depts[0].members[0].name, '王小明');
check('4d EE 空人未建 dept', r1.depts.some(d => d.name === 'EE'), false);

// ════ 5. task / warnings 批1 留空 ════
check('5a tasks 空陣列', r1.tasks, []);
check('5b warnings 空陣列', r1.warnings, []);

// ════ 6. 邊界：無 cases / 無 roleMap ════
const r2 = App.applyTemplate(TPL, { projectName: 'X' });
check('6a 無 cases → variants 空', r2.variants, []);
check('6b 無 cases → 對照表空', r2.variantNameToId, {});
check('6c 無 roleMap → depts 空', r2.depts, []);

// ════ 7. 邊界：單 case 只主案 ════
const r3 = App.applyTemplate(TPL, { projectName: 'Y', cases: [{ variantName: '主案', startDate: '2026-07-01', direction: 'forward' }] });
check('7a 單 case → variants 1 筆', r3.variants.length, 1);
check('7b direction 預設 forward 保留', r3.variants[0].schedule.direction, 'forward');
check('7c selectedStages 未給 → stages 空', r3.variants[0].stages, []);

// ════ 結果 ════
console.log(`\nPASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail ? 1 : 0);
