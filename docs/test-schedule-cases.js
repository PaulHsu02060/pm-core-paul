/**
 * 排程引擎 — 測試案例（階段2 新核心）
 * ─────────────────────────────────────────────────────────────
 * 執行：node docs/test-schedule-cases.js
 * 逐案印 PASS / FAIL，最後印總計；全過 exit 0，有失敗 exit 1。
 *
 * 涵蓋：parsePredecessors / isTaskBlocked / topoSortTasks / computeSchedule。
 *
 * ⚠ 下方所有函式為 app.js 的「同步複本」（app.js 非 module，node 無法 require）。
 *   改 app.js 的 D / parsePredecessors / isTaskBlocked / topoSortTasks / computeSchedule，
 *   請同步此處，否則驗到舊邏輯。
 *
 * ⚠ 時區：日期用 'YYYY-MM-DD' 字串，與 app.js 一致用 new Date(str)（UTC 解析）。
 *   在家裡（UTC+8）跑 getDate()/getDay() 不會偏移；結果與瀏覽器一致。
 *
 * ⚠ 一致性鐵則（最易回歸處）：isTaskBlocked 的偵測門檻 == computeSchedule 的推算門檻。
 *   只有 FS 需 +1（起點 SOD ≥ 終點 EOD，同日不成立）；SS/FF/SF 同日成立、不 +1。
 */

// ── 假 DATA（workDays = 週一~五；JS getDay() 編號 0=日..6=六） ──
const DATA = { settings: { workDays: [1, 2, 3, 4, 5] } };

// ════ D 同步複本（只含排程相關方法） ════════════════════════════
const D = {
  fmt(d, opt = 'md') {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear(), m = dt.getMonth() + 1, day = dt.getDate();
    if (opt === 'iso') return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `${m}/${day}`;
  },
  daysBetween(a, b) {
    const da = new Date(a); da.setHours(0, 0, 0, 0);
    const db = new Date(b); db.setHours(0, 0, 0, 0);
    return Math.round((db - da) / 86400000);
  },
  calendar: { holidays: [], supplementWorkDays: [] },
  isWorkday(date) {
    const iso = this.fmt(date, 'iso');
    if (!iso) return false;
    if (this.calendar.supplementWorkDays.includes(iso)) return true;
    if (this.calendar.holidays.includes(iso)) return false;
    const dt = date instanceof Date ? date : new Date(date);
    const workDays = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.workDays) || [1, 2, 3, 4, 5];
    return workDays.includes(dt.getDay());
  },
  addWorkdays(date, n) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    if (isNaN(d)) return d;
    d.setHours(0, 0, 0, 0);
    if (!n) return d;
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      if (this.isWorkday(d)) remaining--;
    }
    return d;
  },
};

// ════ parsePredecessors 同步複本 ════════════════════════════════
function parsePredecessors(str) {
  if (str === null || str === undefined) return [];
  const s = String(str).trim();
  if (!s) return [];
  const VALID = ['FS', 'SS', 'FF', 'SF'];
  const out = [];
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
    if (!m) continue;
    const dep = m[1];
    let type = (m[2] || 'FS').toUpperCase();
    if (!VALID.includes(type)) type = 'FS';
    let lag = 0;
    if (m[3]) { const n = parseInt(m[3].replace(/\s+/g, ''), 10); lag = isNaN(n) ? 0 : n; }
    out.push({ dep, type, lag });
  }
  return out;
}

// ════ isTaskBlocked 同步複本（含 fsBump：只 FS +1） ═══════════════
function isTaskBlocked(task, allTasksMap) {
  const result = { blocked: false, reasons: [] };
  if (!task) return result;
  const preds = parsePredecessors(task.predecessor);
  if (preds.length === 0) return result;
  const lookup = (key) => {
    if (!allTasksMap) return undefined;
    const k = String(key);
    if (typeof allTasksMap.get === 'function') return allTasksMap.get(k) || allTasksMap.get(key);
    return allTasksMap[k];
  };
  for (const p of preds) {
    const dep = lookup(p.dep);
    if (!dep) { result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置不存在' }); continue; }
    if (dep.status !== 'done') result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置未完成' });
    const taskRefStr = (p.type === 'FF' || p.type === 'SF') ? task.end : task.start;
    const predRefStr = (p.type === 'SS' || p.type === 'SF') ? dep.start : dep.end;
    if (taskRefStr && predRefStr) {
      const fsBump = (p.type === 'FS') ? 1 : 0;
      const predShifted = D.addWorkdays(new Date(predRefStr), p.lag + fsBump);
      const taskRef = new Date(taskRefStr);
      if (D.daysBetween(taskRef, predShifted) > 0) {
        result.reasons.push({ dep: p.dep, type: p.type, conflict: '日期衝突' });
      }
    }
  }
  result.blocked = result.reasons.length > 0;
  return result;
}

// ════ topoSortTasks 同步複本 ════════════════════════════════════
function topoSortTasks(tasks) {
  const list = (tasks || []).filter(t => t && t.wbs !== '' && t.wbs !== undefined && t.wbs !== null);
  const nodes = new Map();
  for (const t of list) nodes.set(String(t.wbs), t);
  const edges = new Map();
  for (const t of list) {
    const preds = parsePredecessors(t.predecessor).filter(p => nodes.has(String(p.dep)));
    edges.set(String(t.wbs), preds);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const k of nodes.keys()) color.set(k, WHITE);
  const order = [];
  const circular = new Set();
  function visit(startKey) {
    const stack = [{ key: startKey, i: 0 }];
    color.set(startKey, GRAY);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const preds = edges.get(top.key) || [];
      if (top.i < preds.length) {
        const depKey = String(preds[top.i].dep);
        top.i++;
        const c = color.get(depKey);
        if (c === WHITE) { color.set(depKey, GRAY); stack.push({ key: depKey, i: 0 }); }
        else if (c === GRAY) {
          let onCycle = false;
          for (const f of stack) { if (f.key === depKey) onCycle = true; if (onCycle) circular.add(f.key); }
        }
      } else {
        color.set(top.key, BLACK);
        if (!circular.has(top.key)) order.push(top.key);
        stack.pop();
      }
    }
  }
  for (const k of nodes.keys()) if (color.get(k) === WHITE) visit(k);
  return { order, circular: Array.from(circular), nodes, edges };
}

// ════ computeSchedule 同步複本 ══════════════════════════════════
function computeSchedule(tasks) {
  const { order, circular, nodes } = topoSortTasks(tasks);
  const byWbs = new Map();
  const results = [];
  const iso = (d) => D.fmt(d, 'iso');
  const durOf = (t) => Math.max(1, parseFloat(t.durationDays) || 1);
  const ident = (t) => ({ wbs: (t.wbs === undefined || t.wbs === null) ? '' : t.wbs, taskId: t.id, name: t.name || '' });
  for (const wbs of circular) {
    const t = nodes.get(wbs);
    byWbs.set(wbs, { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: true, error: 'circular', toSchedule: false, blockedCause: 'circular',
      warnings: ['循環依賴：此任務在依賴環上，無法排程'] });
  }
  function processTask(t) {
    const fullPreds = parsePredecessors(t.predecessor);
    const preds = fullPreds.filter(p => nodes.has(String(p.dep)));
    const missingWarn = fullPreds.filter(p => !nodes.has(String(p.dep))).map(p => `前置 #${p.dep} 不存在`);
    const dur = durOf(t);
    if (t.start) {
      const end = iso(D.addWorkdays(new Date(t.start), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: t.start, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: warns };
    }
    const pollutedWarn = [];
    let pollutedCause = null;
    for (const p of preds) {
      const pr = byWbs.get(String(p.dep));
      if (!pr) continue;
      if (pr.error === 'circular' || pr.blockedCause === 'circular') {
        pollutedWarn.push(`前置 #${p.dep} 無法排程（上游循環）`); pollutedCause = 'circular';
      } else if (pr.blocked || pr.toSchedule || !pr.suggestedStart) {
        pollutedWarn.push(`前置 #${p.dep} 尚未排程（上游待排）`); if (!pollutedCause) pollutedCause = 'unscheduled';
      }
    }
    if (pollutedWarn.length) {
      return { ...ident(t), suggestedStart: null, suggestedEnd: null,
        blocked: true, error: null, toSchedule: false, blockedCause: pollutedCause,
        warnings: pollutedWarn.concat(missingWarn) };
    }
    if (preds.length > 0) {
      let latest = null;
      for (const p of preds) {
        const pr = byWbs.get(String(p.dep));
        const ps = new Date(pr.suggestedStart);
        const pe = new Date(pr.suggestedEnd);
        let s;
        if (p.type === 'SS') s = D.addWorkdays(ps, p.lag);
        else if (p.type === 'FF') s = D.addWorkdays(D.addWorkdays(pe, p.lag), -(dur - 1));
        else if (p.type === 'SF') s = D.addWorkdays(D.addWorkdays(ps, p.lag), -(dur - 1));
        else s = D.addWorkdays(pe, 1 + p.lag);
        if (latest === null || s > latest) latest = s;
      }
      return { ...ident(t), suggestedStart: iso(latest), suggestedEnd: iso(D.addWorkdays(latest, dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }
    return { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: false, error: null, toSchedule: true, blockedCause: null,
      warnings: ['待排：無前置且未填開始日'].concat(missingWarn) };
  }
  for (const wbs of order) byWbs.set(wbs, processTask(nodes.get(wbs)));
  for (const wbs of order) results.push(byWbs.get(wbs));
  for (const wbs of circular) results.push(byWbs.get(wbs));
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs === '' || t.wbs === undefined || t.wbs === null) results.push(processTask(t));
  }
  return { results, circular: circular.slice(), hasCircular: circular.length > 0 };
}

// ════ 測試框架 ══════════════════════════════════════════════════
let pass = 0, fail = 0;
function check(name, got, expected, why) {
  const g = typeof got === 'object' ? JSON.stringify(got) : String(got);
  const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected);
  const ok = g === e;
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  console.log(`       got=${g}  expected=${e}`);
  console.log(`       why: ${why}`);
}
// 小工具
const mk = (o) => Object.assign({ id: 't_' + (o.wbs || Math.round(Math.random() * 1e9)), name: 'T' + (o.wbs || ''), predecessor: '', start: '', end: '', status: 'pending', durationDays: 1 }, o);
const mapOf = (arr) => { const m = new Map(); arr.forEach(t => m.set(String(t.wbs), t)); return m; };
const R = (out, wbs) => out.results.find(r => String(r.wbs) === String(wbs));
const hasReason = (res, dep, conflict) => res.reasons.some(r => String(r.dep) === String(dep) && r.conflict === conflict);
const hasWarn = (r, sub) => r.warnings.some(w => w.includes(sub));

// ════ 1. parsePredecessors（含 Sheet 真實格式） ══════════════════
console.log('===== 1. parsePredecessors =====');
check('空/null → []', JSON.stringify([parsePredecessors(''), parsePredecessors(null)]), JSON.stringify([[], []]), '無前置回空');
check('純編號 "5"', parsePredecessors('5'), [{ dep: '5', type: 'FS', lag: 0 }], '預設 FS lag0');
check('Sheet 例 "6,7"', parsePredecessors('6,7'), [{ dep: '6', type: 'FS', lag: 0 }, { dep: '7', type: 'FS', lag: 0 }], '逗號多前置');
check('Sheet 例 "1FF"', parsePredecessors('1FF'), [{ dep: '1', type: 'FF', lag: 0 }], 'FF 無 lag');
check('Sheet 例 "2FS+2"', parsePredecessors('2FS+2'), [{ dep: '2', type: 'FS', lag: 2 }], 'FS +2');
check('Sheet 例 "10FS+10"', parsePredecessors('10FS+10'), [{ dep: '10', type: 'FS', lag: 10 }], 'FS +10');
check('負 lag "5SS-1"', parsePredecessors('5SS-1'), [{ dep: '5', type: 'SS', lag: -1 }], 'SS -1');
check('未知關係 "5XX+2" → FS', parsePredecessors('5XX+2'), [{ dep: '5', type: 'FS', lag: 2 }], '未知關係退回 FS，lag 保留');
check('混用 "1FF,2FS+2,6,7"', parsePredecessors('1FF,2FS+2,6,7'),
  [{ dep: '1', type: 'FF', lag: 0 }, { dep: '2', type: 'FS', lag: 2 }, { dep: '6', type: 'FS', lag: 0 }, { dep: '7', type: 'FS', lag: 0 }],
  'Sheet 真實混用格式');

// ════ 2. isTaskBlocked — 四種關係 SOD/EOD 邊界（一致性鐵則） ══════
console.log('\n===== 2. isTaskBlocked 四種關係邊界 =====');
// FS：前置 end 01-09(週五) done
{
  const p = mk({ wbs: '1', status: 'done', end: '2026-01-09' });
  const m = mapOf([p]);
  const sSame = mk({ wbs: 'a', predecessor: '1', start: '2026-01-09' });   // 零間隔=前置end當天
  const sNext = mk({ wbs: 'b', predecessor: '1', start: '2026-01-12' });   // 次一工作日(週一)
  check('FS 零間隔(start=前置end當天) → 衝突', isTaskBlocked(sSame, m).blocked, true,
    'FS 是 SOD≥EOD，同日重疊應被偵測（fsBump +1）');
  check('FS 次一工作日(start=01-12) → OK', isTaskBlocked(sNext, m).blocked, false,
    '跳到前置 end 次一工作日，不衝突');
}
// FS +lag：2FS+2，前置 end 01-09
{
  const p = mk({ wbs: '2', status: 'done', end: '2026-01-09' });
  const m = mapOf([p]);
  const tEarly = mk({ wbs: 'c', predecessor: '2FS+2', start: '2026-01-13' }); // 門檻 01-14
  const tOk = mk({ wbs: 'd', predecessor: '2FS+2', start: '2026-01-14' });
  check('2FS+2 start=01-13 → 衝突', isTaskBlocked(tEarly, m).blocked, true,
    '門檻=addWorkdays(01-09, 2+1)=01-14，01-13 太早');
  check('2FS+2 start=01-14 → OK', isTaskBlocked(tOk, m).blocked, false, '剛好達門檻不衝突');
}
// SS：前置 start 01-05(週一) done，同日對齊應成立
{
  const p = mk({ wbs: '3', status: 'done', start: '2026-01-05' });
  const m = mapOf([p]);
  const s = mk({ wbs: 'e', predecessor: '3SS', start: '2026-01-05' });
  check('SS 同日對齊(start=前置start) → OK', isTaskBlocked(s, m).blocked, false,
    'SS 是 SOD≥SOD，同日成立、不 +1');
}
// FF：前置 end 01-09 done，同日對齊應成立
{
  const p = mk({ wbs: '4', status: 'done', end: '2026-01-09' });
  const m = mapOf([p]);
  const s = mk({ wbs: 'f', predecessor: '4FF', end: '2026-01-09' });
  check('FF 同日對齊(end=前置end) → OK', isTaskBlocked(s, m).blocked, false,
    'FF 是 EOD≥EOD，同日成立、不 +1');
}
// SF：前置 start 01-12 done，本任務 end 同日應成立
{
  const p = mk({ wbs: '5', status: 'done', start: '2026-01-12' });
  const m = mapOf([p]);
  const s = mk({ wbs: 'g', predecessor: '5SF', end: '2026-01-12' });
  check('SF 同日對齊(end=前置start) → OK', isTaskBlocked(s, m).blocked, false,
    'SF 是 EOD≥SOD，同日成立、不 +1（你指令裡 +1 已修正為 +0）');
}
// not-done / missing
{
  const p = mk({ wbs: '6', status: 'wip' });   // 無日期 → 只測 not-done
  const m = mapOf([p]);
  const s = mk({ wbs: 'h', predecessor: '6' });
  const r = isTaskBlocked(s, m);
  check('前置未完成 → 前置未完成', hasReason(r, '6', '前置未完成'), true, '前置 status 非 done');
  const s2 = mk({ wbs: 'i', predecessor: '99' });
  check('前置不存在 → 前置不存在', hasReason(isTaskBlocked(s2, m), '99', '前置不存在'), true, 'dep 對不到任何 task，不報錯');
}

// ════ 3. topoSortTasks — 拓撲 + 循環 ═════════════════════════════
console.log('\n===== 3. topoSortTasks =====');
check('鏈 1→2→3 order',
  topoSortTasks([mk({ wbs: '1' }), mk({ wbs: '2', predecessor: '1' }), mk({ wbs: '3', predecessor: '2' })]).order,
  ['1', '2', '3'], '無前置先、依賴後');
{
  const direct = topoSortTasks([mk({ wbs: '1', predecessor: '2' }), mk({ wbs: '2', predecessor: '1' })]);
  check('直接環 1↔2 circular', direct.circular.slice().sort(), ['1', '2'], 'A→B→A 兩節點都標環');
  check('直接環 order 空', direct.order, [], '環上節點不進 order');
}
{
  // 間接環 1→3→2→1 + 無辜上游 4→1
  const ind = topoSortTasks([mk({ wbs: '1', predecessor: '3' }), mk({ wbs: '2', predecessor: '1' }), mk({ wbs: '3', predecessor: '2' }), mk({ wbs: '4', predecessor: '1' })]);
  check('間接環 {1,2,3} circular', ind.circular.slice().sort(), ['1', '2', '3'], 'A→B→C→A 整環標到');
  check('無辜上游 4 不在 circular', ind.circular.includes('4'), false, '只標環上節點，不誤標依賴環的上游');
  check('無辜上游 4 在 order', ind.order.includes('4'), true, '4 自己不在環上，正常進 order');
}

// ════ 4. computeSchedule — 四種關係算日期 ════════════════════════
console.log('\n===== 4. computeSchedule 日期推算 =====');
// FS 鏈 A→B→C（含 N-1、跨週末）
{
  const out = computeSchedule([
    mk({ wbs: '1', start: '2026-01-05', durationDays: 3 }),       // A: 一 dur3 → end 01-07
    mk({ wbs: '2', predecessor: '1', durationDays: 3 }),          // B: FS → 01-08~01-12(跨週末)
    mk({ wbs: '3', predecessor: '2', durationDays: 2 }),          // C: FS → 01-13~01-14
  ]);
  check('FS鏈 A end', `${R(out, '1').suggestedStart}~${R(out, '1').suggestedEnd}`, '2026-01-05~2026-01-07', 'dur3：end=addWorkdays(start,2)');
  check('FS鏈 B（跨週末）', `${R(out, '2').suggestedStart}~${R(out, '2').suggestedEnd}`, '2026-01-08~2026-01-12', 'B start=A.end次工作日 01-08；end 跨六日到 01-12');
  check('FS鏈 C', `${R(out, '3').suggestedStart}~${R(out, '3').suggestedEnd}`, '2026-01-13~2026-01-14', 'C start=B.end次工作日');
}
// FS +lag（Sheet 例 10FS+10、2FS+2）
{
  const out = computeSchedule([
    mk({ wbs: '10', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '11', predecessor: '10FS+10', durationDays: 1 }),   // start=addWorkdays(01-09,11)=01-26
    mk({ wbs: '20', start: '2026-01-05', durationDays: 3 }),      // end 01-07
    mk({ wbs: '21', predecessor: '20FS+2', durationDays: 2 }),    // start=addWorkdays(01-07,3)=01-12
  ]);
  check('10FS+10', R(out, '11').suggestedStart, '2026-01-26', 'addWorkdays(前置end 01-09, 1+10)=01-26');
  check('2FS+2', `${R(out, '21').suggestedStart}~${R(out, '21').suggestedEnd}`, '2026-01-12~2026-01-13', 'addWorkdays(01-07,1+2)=01-12');
}
// FF（Sheet 例 1FF）：finish 對齊前置 finish
{
  const out = computeSchedule([
    mk({ wbs: '30', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '31', predecessor: '30FF', durationDays: 3 }),      // end=01-09 → start 反推 01-07
  ]);
  check('1FF（finish 對齊）', `${R(out, '31').suggestedStart}~${R(out, '31').suggestedEnd}`, '2026-01-07~2026-01-09', 'FF：end=前置end 01-09，start=addWorkdays(end,-(3-1))');
}
// SS：start 對齊前置 start
{
  const out = computeSchedule([
    mk({ wbs: '40', start: '2026-01-06', durationDays: 4 }),
    mk({ wbs: '41', predecessor: '40SS', durationDays: 2 }),      // start=前置start 01-06
  ]);
  check('SS（start 對齊）', `${R(out, '41').suggestedStart}~${R(out, '41').suggestedEnd}`, '2026-01-06~2026-01-07', 'SS：start=addWorkdays(前置start,0)');
}
// SF（+0）：finish 對齊前置 start
{
  const out = computeSchedule([
    mk({ wbs: '50', start: '2026-01-12', durationDays: 3 }),
    mk({ wbs: '51', predecessor: '50SF', durationDays: 2 }),      // end=前置start 01-12 → start 反推 01-09
  ]);
  check('SF（finish 對齊前置 start，+0）', `${R(out, '51').suggestedStart}~${R(out, '51').suggestedEnd}`, '2026-01-09~2026-01-12', 'SF：end=addWorkdays(前置start,0)=01-12');
}
// 多前置取最晚
{
  const out = computeSchedule([
    mk({ wbs: '60', start: '2026-01-05', durationDays: 2 }),      // end 01-06
    mk({ wbs: '61', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '62', predecessor: '60,61', durationDays: 1 }),     // max(01-07, 01-12)=01-12
  ]);
  check('多前置取最晚', R(out, '62').suggestedStart, '2026-01-12', 'FS 各算 impliedStart 取 max（61 較晚）');
}

// ════ 5. computeSchedule — 連鎖 / 待排 / 手填 ════════════════════
console.log('\n===== 5. computeSchedule blocked連鎖 / 待排 / 手填 =====');
// 循環不卡死 + 下游連鎖污染
{
  const out = computeSchedule([
    mk({ wbs: '70', predecessor: '71' }),
    mk({ wbs: '71', predecessor: '70' }),
    mk({ wbs: '72', predecessor: '70', durationDays: 1 }),        // 下游：依賴循環節點
  ]);
  check('循環節點標 error', R(out, '70').error, 'circular', '環上節點 error=circular');
  check('下游 72 連鎖 blocked', R(out, '72').blocked, true, '前置 70 在環上 → 72 也 blocked');
  check('下游 72 警示「上游循環」', hasWarn(R(out, '72'), '上游循環'), true, '連鎖標記訊息');
  check('循環不無限迴圈（有產出）', out.results.length >= 3, true, '能正常回傳代表沒卡死');
}
// 前置不存在 → 待排 + 警示
{
  const out = computeSchedule([mk({ wbs: '80', predecessor: '999', durationDays: 1 })]);
  check('前置不存在 → toSchedule', R(out, '80').toSchedule, true, '唯一前置不存在=無有效前置 → 待排');
  check('前置不存在 → 警示', hasWarn(R(out, '80'), '前置 #999 不存在'), true, '標前置不存在不報錯');
}
// 無 start 無前置 → 待排
{
  const out = computeSchedule([mk({ wbs: '85', durationDays: 1 })]);
  check('無start無前置 → 待排', R(out, '85').toSchedule, true, '標待排');
}
// 手填 start 不被覆蓋、只警示
{
  const out = computeSchedule([
    mk({ wbs: '90', start: '2026-01-12', status: 'done', durationDays: 3 }),  // end 01-14
    mk({ wbs: '91', predecessor: '90', start: '2026-01-13', durationDays: 2 }), // 手填，違反 FS
  ]);
  check('手填 start 不被覆蓋', R(out, '91').suggestedStart, '2026-01-13', '尊重手填，不改');
  check('手填仍算 suggestedEnd', R(out, '91').suggestedEnd, '2026-01-14', 'end=addWorkdays(手填start,dur-1)');
  check('手填衝突 → 不 blocked、只警示', R(out, '91').blocked, false, '中間版：手填不 block');
  check('手填衝突 → 有日期衝突警示', hasWarn(R(out, '91'), '日期衝突'), true, 'isTaskBlocked 偵測（門檻=01-15>01-13）');
}

// ════ 6. 一致性鐵則：偵測門檻 == 推算門檻 ════════════════════════
console.log('\n===== 6. 一致性：isTaskBlocked 門檻 == computeSchedule 推算 =====');
// 對 FS：computeSchedule 推出的 start，丟回 isTaskBlocked 應「不衝突」；早一天則「衝突」
{
  const pred = mk({ wbs: '1', status: 'done', start: '2026-01-05', end: '2026-01-09', durationDays: 5 });
  const succ = mk({ wbs: '2', predecessor: '1', durationDays: 2 });
  const out = computeSchedule([pred, succ]);
  const sStart = R(out, '2').suggestedStart;             // 引擎推算 = 01-12
  const m = mapOf([pred]);
  check('FS：引擎推算 start 丟回偵測 → 不衝突', isTaskBlocked(mk({ wbs: '2', predecessor: '1', start: sStart }), m).blocked, false,
    '推算門檻與偵測門檻同尺，自家算的不該被自家判衝突');
  const earlier = D.fmt(D.addWorkdays(new Date(sStart), -1), 'iso');
  check('FS：推算 start 早一天 → 衝突', isTaskBlocked(mk({ wbs: '2', predecessor: '1', start: earlier }), m).blocked, true,
    '早一個工作日就違反門檻');
}

console.log('\n===== 結果 =====');
console.log(`PASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail === 0 ? 0 : 1);
