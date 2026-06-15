/**
 * applyTemplate 範本套用引擎 — 測試案例（§8d.6 批1：①②③ / 批2a：④⑤⑦）
 * ─────────────────────────────────────────────────────────────
 * 執行：node docs/test-apply-template-cases.js
 * 逐案印 PASS / FAIL，最後印總計；全過 exit 0，有失敗 exit 1。
 *
 * 涵蓋：①建專案 ②variants(含schedule)+對照表 ③depts(role→人)
 *       ④篩選勾選階段+收集excludedNs ⑤id重產 ⑦task組裝(38欄,predecessor暫留raw序號)。
 *   依賴重指⑥(批2b) / 排程⑧(批3) 後批補測。
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
const DATA = { settings: { dailyHours: 6 } };
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}
const App = {};

// ════ applyTemplate 同步複本（批1：①②③ / 批2a：④⑤⑦） ════════════════
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

  // ④ 篩選勾選階段 + 收集 excludedNs / ⑤ id重產 / ⑦ task組裝（38欄）
  //   predecessor 暫留 raw 序號字串，批2b 才譯 id（excludedNs 斷依賴+warning）
  const roleToDeptId = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; });
  const uiCaseByName = {};
  (ui.cases || []).forEach(c => { uiCaseByName[(c.variantName || '').trim()] = c; });
  const dailyHours = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.dailyHours) || 6;

  const tasks = [];
  const excludedNs = [];
  (template && template.cases ? template.cases : []).forEach(tc => {
    const vName = (tc.variant || '').trim();
    const uiCase = uiCaseByName[vName];
    const variantId = variantNameToId[vName] || null;
    const selected = (uiCase && uiCase.selectedStages) ? uiCase.selectedStages : null;
    (tc.modules || []).forEach(mod => {
      const included = !selected || selected.indexOf(mod.stage) >= 0;
      (mod.tasks || []).forEach(tk => {
        if (!included) { excludedNs.push(tk.n); return; }
        tasks.push({
          id: U.id(),
          project: project.id,
          wbs: tk.n,
          parentWbsId: '',
          name: tk.name || '',
          desc: mod.stage ? (mod.stage + ' / ' + (tk.subgroup || '')) : (tk.subgroup || ''),
          category: (tk.type || '').indexOf('里程碑') >= 0 ? 'meeting' : 'deep',
          taskType: tk.type || '任務',
          predecessor: tk.predecessor || '',
          durationDays: tk.durationDays,
          owner: '',
          dept: roleToDeptId[(tk.role || '').trim()] || '',
          variant: variantId,
          start: '',
          end: '',
          plannedStart: '',
          plannedEnd: '',
          actualStart: '',
          actualEnd: '',
          progress: 0,
          status: 'pending',
          urgency: 'med',
          estHours: parseFloat(tk.durationDays || 0) * dailyHours || 4,
          method: '',
          canSplit: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          scheduledStart: '',
          scheduledEnd: '',
          synced: false,
          stage: mod.stage || '',
          subgroup: tk.subgroup || '',
          mustDeliver: false,
          deliverable: tk.deliverable || '',
          riskIssue: '',
          delivered: '',
          deliverableLink: '',
          note: '',
        });
      });
    });
  });

  return { project, variants, variantNameToId, depts, tasks, excludedNs, warnings: [] };
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

// ════ 共用 fixture（批1） ════════════════════════════════════════
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

// ════ 5. task / warnings（批1 fixture 無 cases.modules → task 空） ════
check('5a tasks 空陣列（TPL 無 cases.modules）', r1.tasks, []);
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

// ════════ 批2a：篩選④ + id重產⑤ + 組裝⑦ ════════
const TPL2 = { cases: [
  { variant: '主案', stages: ['Prototype', 'EVT'], modules: [
    { stage: 'Prototype', tasks: [
      { tplId: 't1', n: 1, name: 'A', type: '任務', subgroup: '系統', durationDays: 5, predecessor: '', deliverable: '文件', role: 'PM' },
      { tplId: 't2', n: 2, name: 'B', type: '里程碑', subgroup: '', durationDays: 1, predecessor: '1', deliverable: '', role: '' },
    ]},
    { stage: 'EVT', tasks: [
      { tplId: 't3', n: 3, name: 'C', type: '任務', subgroup: '電控', durationDays: 8, predecessor: '2', deliverable: '報告', role: 'EE' },
    ]},
  ]},
  { variant: '另案', stages: ['EVT'], modules: [
    { stage: 'EVT', tasks: [
      { tplId: 't4', n: 4, name: 'D', type: '任務', subgroup: '', durationDays: 3, predecessor: '', deliverable: '', role: 'PM' },
    ]},
  ]},
]};
const UI2 = {
  projectName: 'P',
  cases: [
    { variantName: '主案', startDate: '2026-07-01', direction: 'forward', selectedStages: ['Prototype'] }, // 砍 EVT(t3)
    { variantName: '另案', startDate: '2026-08-01', direction: 'forward', selectedStages: ['EVT'] },
  ],
  roleMap: { PM: '王', EE: '李' },
};
const a = App.applyTemplate(TPL2, UI2);
const byWbs = w => a.tasks.find(t => t.wbs === w);

check('2a-1 task數=勾選階段總和(t1,t2,t4)', a.tasks.length, 3);
check('2a-2 excludedNs=被砍EVT的t3', a.excludedNs, [3]);
check('2a-3 wbs=n', byWbs(1).wbs, 1);
check('2a-4 taskType帶入', byWbs(2).taskType, '里程碑');
check('2a-5 category里程碑→meeting', byWbs(2).category, 'meeting');
check('2a-6 category任務→deep', byWbs(1).category, 'deep');
check('2a-7 status一律pending', byWbs(1).status, 'pending');
check('2a-8 estHours=dur*6', byWbs(1).estHours, 30);
check('2a-9 dept=role反查deptId', byWbs(1).dept, a.depts.find(d => d.name === 'PM').id);
check('2a-10 空role→dept空', byWbs(2).dept, '');
check('2a-11 variant=主案id', byWbs(1).variant, a.variantNameToId['主案']);
check('2a-12 另案task variant=另案id', byWbs(4).variant, a.variantNameToId['另案']);
check('2a-13 predecessor暫留raw序號', byWbs(2).predecessor, '1');
check('2a-14 日期欄清空', [byWbs(1).start, byWbs(1).plannedStart, byWbs(1).scheduledStart], ['', '', '']);

// 邊界：全選→excludedNs空
const aFull = App.applyTemplate(TPL2, { projectName: 'P', cases: [
  { variantName: '主案', selectedStages: ['Prototype', 'EVT'] },
  { variantName: '另案', selectedStages: ['EVT'] },
], roleMap: { PM: '王', EE: '李' } });
check('2a-15 全選→excludedNs空', aFull.excludedNs, []);
check('2a-16 全選→task數4', aFull.tasks.length, 4);

// ════ 結果 ════
console.log(`\nPASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail ? 1 : 0);
