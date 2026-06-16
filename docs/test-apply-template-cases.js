/**
 * applyTemplate 範本套用引擎 — 測試案例（§8d.6 批1①②③ / 批2a④⑤⑦ / 批2b⑥ / 批3⑧+6b）
 * ─────────────────────────────────────────────────────────────
 * 執行：node docs/test-apply-template-cases.js
 * 逐案印 PASS / FAIL，最後印總計；全過 exit 0，有失敗 exit 1。
 *
 * 涵蓋：①建專案 ②variants(含schedule)+對照表 ③depts ④篩選+excludedNs ⑤id重產
 *       ⑦組裝38欄 ⑥依賴重指(剝excluded+warning) ⑧各案別順推排程寫planned*+6b溢出偵測。
 *
 * ⚠ sync 複本：app.js 非 module，node 無法 require。下方為 app.js 同步複本：
 *     - applyTemplate body（批1~批3 全部）
 *     - buildWbsToIdMap / translatePredToId / parsePredecessors / isTaskBlocked /
 *       isJTask / getJOverride / topoSortTasks / computeSchedule / D
 *   ⚠ 排程那組（D / parsePredecessors / isTaskBlocked / isJTask / getJOverride /
 *     topoSortTasks / computeSchedule）**同步自 docs/test-schedule-cases.js（行 21-324）**。
 *     改 app.js 的排程引擎 → 此檔與 test-schedule-cases.js 兩份複本都要同步。
 * ⚠ U.id 用遞增 stub（id_1,id_2…）使測試決定性；測「結構與關聯」非測字面 id。
 * ⚠ 日期用 'YYYY-MM-DD'，與 app.js 一致用 new Date(str)（UTC 解析）；workDays 週一~五。
 */

// ── stubs（測試環境，對齊 app.js 介面） ──
let _idc = 0;
const U = { id() { return 'id_' + (++_idc); }, esc(s) { return String(s == null ? '' : s); } };
const PROJ_COLORS = ['#4A7C5C', '#5C7A8B', '#A8693B'];
const DATA = { settings: { dailyHours: 6, workDays: [1, 2, 3, 4, 5] }, calendars: { base: { name: '台灣公版', holidays: {} }, override: null } };
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}

// ════ D 同步複本（自 test-schedule-cases.js 行 24-83；加 workdaysBetween 供 6b） ════
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
  isWorkday(date) {
    const iso = this.fmt(date, 'iso');
    if (!iso) return false;
    const cal = (typeof DATA !== 'undefined' && DATA.calendars) || null;
    const base = cal && cal.base;
    const override = cal && cal.override;
    if (override?.workOverrides && iso in override.workOverrides) return true;
    if (override?.extraHolidays && iso in override.extraHolidays) return false;
    if (base?.holidays && iso in base.holidays) return false;
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
  workdaysBetween(start, end) {
    const s = start instanceof Date ? new Date(start) : new Date(start);
    const e = end instanceof Date ? new Date(end) : new Date(end);
    if (isNaN(s) || isNaN(e)) return 0;
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    if (s > e) return 0;
    let count = 0;
    for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (this.isWorkday(d)) count++;
    }
    return count;
  },
};

// ════ buildWbsToIdMap / translatePredToId 同步複本（app.js 964 / 981） ════
function buildWbsToIdMap(tasks) {
  const map = new Map();
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs !== '' && t.wbs != null) {
      const k = String(t.wbs).trim();
      if (!map.has(k)) map.set(k, t.id);
    }
  }
  return map;
}
function translatePredToId(predStr, wbsToIdMap) {
  if (predStr === null || predStr === undefined) return '';
  const s = String(predStr).trim();
  if (!s) return '';
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
    if (!m) { out.push(part); continue; }
    const id = wbsToIdMap && wbsToIdMap.get(String(m[1]).trim());
    if (!id) { out.push(part); continue; }
    const type = m[2] ? m[2] : '';
    const lag = m[3] ? m[3].replace(/\s+/g, '') : '';
    out.push(id + '#' + type + lag);
  }
  return out.join(',');
}

// ════ parsePredecessors 同步複本（自 test-schedule-cases.js） ════
function parsePredecessors(str) {
  if (str === null || str === undefined) return [];
  const s = String(str).trim();
  if (!s) return [];
  const VALID = ['FS', 'SS', 'FF', 'SF'];
  const out = [];
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const hashIdx = part.indexOf('#');
    let dep, mTail;
    if (hashIdx >= 0) {
      dep = part.slice(0, hashIdx).trim();
      mTail = part.slice(hashIdx + 1).trim().match(/^([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!dep || !mTail) continue;
    } else {
      const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!m) continue;
      dep = m[1];
      mTail = [m[0], m[2], m[3]];
    }
    let type = (mTail[1] || 'FS').toUpperCase();
    if (!VALID.includes(type)) type = 'FS';
    let lag = 0;
    if (mTail[2]) { const n = parseInt(mTail[2].replace(/\s+/g, ''), 10); lag = isNaN(n) ? 0 : n; }
    out.push({ dep, type, lag });
  }
  return out;
}

// ════ isTaskBlocked 同步複本（自 test-schedule-cases.js） ════
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
    const usesPredEnd = !(p.type === 'SS' || p.type === 'SF');
    let predRefStr = usesPredEnd ? dep.end : dep.start;
    if (usesPredEnd && !predRefStr && dep.start) {
      const depDur = Math.max(1, parseFloat(dep.durationDays) || 1);
      predRefStr = D.fmt(D.addWorkdays(new Date(dep.start), depDur - 1), 'iso');
    }
    if (taskRefStr && predRefStr) {
      const fsOffset = (p.type === 'FS') ? Math.max(1, p.lag) : p.lag;
      const predShifted = D.addWorkdays(new Date(predRefStr), fsOffset);
      const taskRef = new Date(taskRefStr);
      if (D.daysBetween(taskRef, predShifted) > 0) {
        result.reasons.push({ dep: p.dep, type: p.type, conflict: '日期衝突' });
      }
    }
  }
  result.blocked = result.reasons.length > 0;
  return result;
}

// ════ isJTask / getJOverride 同步複本（測試版 stub；範本 task 無 __isJ → 恆 false） ════
function isJTask(task) { return !!(task && task.__isJ); }
function getJOverride(task) {
  if (!task) return null;
  const r = {}; let has = false;
  if (task._localStart !== undefined) { r.start = task._localStart; has = true; }
  if (task._localEnd !== undefined) { r.end = task._localEnd; has = true; }
  return has ? r : null;
}

// ════ topoSortTasks 同步複本（自 test-schedule-cases.js） ════
function topoSortTasks(tasks) {
  const list = (tasks || []).filter(t => t && t.measureType !== 'hours');
  const nodes = new Map();
  for (const t of list) nodes.set(t.id, t);
  const edges = new Map();
  for (const t of list) {
    const preds = parsePredecessors(t.predecessor).filter(p => nodes.has(p.dep));
    edges.set(t.id, preds);
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
          for (const fr of stack) { if (fr.key === depKey) onCycle = true; if (onCycle) circular.add(fr.key); }
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

// ════ computeSchedule 同步複本（自 test-schedule-cases.js 行 243-324） ════
function computeSchedule(tasks) {
  const { order, circular, nodes } = topoSortTasks(tasks);
  const byId = new Map();
  const results = [];
  const iso = (d) => D.fmt(d, 'iso');
  const durOf = (t) => Math.max(1, parseFloat(t.durationDays) || 1);
  const ident = (t) => ({ wbs: (t.wbs === undefined || t.wbs === null) ? '' : t.wbs, taskId: t.id, name: t.name || '' });
  for (const id of circular) {
    const t = nodes.get(id);
    byId.set(id, { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: true, error: 'circular', toSchedule: false, blockedCause: 'circular',
      warnings: ['循環依賴：此任務在依賴環上，無法排程'] });
  }
  function processTask(t) {
    const fullPreds = parsePredecessors(t.predecessor);
    const preds = fullPreds.filter(p => nodes.has(p.dep));
    const missingWarn = fullPreds.filter(p => !nodes.has(p.dep)).map(p => `前置 #${p.dep} 不存在`);
    const dur = durOf(t);
    const ov = isJTask(t) ? getJOverride(t) : null;
    const anchorStart = ov?.start ?? (isJTask(t) ? '' : t.start);
    if (anchorStart) {
      const end = iso(D.addWorkdays(new Date(anchorStart), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: anchorStart, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null,
        warnings: warns, anchorSource: ov?.start ? 'override' : 'manual' };
    }
    const pollutedWarn = [];
    let pollutedCause = null;
    for (const p of preds) {
      const pr = byId.get(p.dep);
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
        const pr = byId.get(p.dep);
        const ps = new Date(pr.suggestedStart);
        const pe = new Date(pr.suggestedEnd);
        let s;
        if (p.type === 'SS') s = D.addWorkdays(ps, p.lag);
        else if (p.type === 'FF') s = D.addWorkdays(D.addWorkdays(pe, p.lag), -(dur - 1));
        else if (p.type === 'SF') s = D.addWorkdays(D.addWorkdays(ps, p.lag), -(dur - 1));
        else s = D.addWorkdays(pe, Math.max(1, p.lag));
        if (latest === null || s > latest) latest = s;
      }
      return { ...ident(t), suggestedStart: iso(latest), suggestedEnd: iso(D.addWorkdays(latest, dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }
    const src = isJTask(t) ? t.plannedStart : (t.start || t.plannedStart);
    if (src) {
      return { ...ident(t), suggestedStart: src, suggestedEnd: iso(D.addWorkdays(new Date(src), dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }
    return { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: false, error: null, toSchedule: true, blockedCause: null,
      warnings: ['待排：無前置且未填開始日'].concat(missingWarn) };
  }
  for (const id of order) byId.set(id, processTask(nodes.get(id)));
  for (const id of order) results.push(byId.get(id));
  for (const id of circular) results.push(byId.get(id));
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs === '' || t.wbs === undefined || t.wbs === null) results.push(processTask(t));
  }
  return { results, circular: circular.slice(), hasCircular: circular.length > 0 };
}

const App = {};

// ════ applyTemplate 同步複本（批1①②③ / 批2a④⑤⑦ / 批2b⑥ / 批3⑧+6b） ════
App.applyTemplate = function(template, userInput) {
  const ui = userInput || {};
  const project = {
    id: U.id(), name: (ui.projectName || '').trim(), color: ui.color || PROJ_COLORS[0],
    note: (ui.note || '').trim(), synced: false, createdAt: new Date().toISOString(),
  };
  ensurePdcaData(project);
  const variants = [];
  const variantNameToId = {};
  (ui.cases || []).forEach(c => {
    const id = U.id();
    const name = (c.variantName || '').trim();
    variants.push({ id, name, schedule: { startDate: c.startDate || '', endDate: c.endDate || '', direction: c.direction || 'forward' }, stages: c.selectedStages ? c.selectedStages.slice() : [] });
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

  // ④⑤⑦ 篩選 + id重產 + 組裝
  const roleToDeptId = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; });
  const uiCaseByName = {};
  (ui.cases || []).forEach(c => { uiCaseByName[(c.variantName || '').trim()] = c; });
  const dailyHours = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.dailyHours) || 6;
  const tasks = [];
  // 被砍階段的 n 改「按案別」收集（variantId→Set(n)；null/通案 → 空字串 key）。
  // 同源範本兩案 n 重複，全域 Set 會跨案誤砍另案前置，故分案。
  const excludedByVariant = {};
  const variantKey = (v) => (v == null ? '' : v);
  (template && template.cases ? template.cases : []).forEach(tc => {
    const vName = (tc.variant || '').trim();
    const uiCase = uiCaseByName[vName];
    if (!uiCase) return;   // 該案別未選入 userInput → 整案不生成（§8d.4 另案不選則不建）
    const variantId = variantNameToId[vName] || null;
    const selected = (uiCase && uiCase.selectedStages) ? uiCase.selectedStages : null;
    (tc.modules || []).forEach(mod => {
      const included = !selected || selected.indexOf(mod.stage) >= 0;
      (mod.tasks || []).forEach(tk => {
        if (!included) {
          const _vk = variantKey(variantId);
          (excludedByVariant[_vk] || (excludedByVariant[_vk] = new Set())).add(tk.n);
          return;
        }
        tasks.push({
          id: U.id(), project: project.id, wbs: tk.n, parentWbsId: '', name: tk.name || '',
          desc: mod.stage ? (mod.stage + ' / ' + (tk.subgroup || '')) : (tk.subgroup || ''),
          category: (tk.type || '').indexOf('里程碑') >= 0 ? 'meeting' : 'deep',
          taskType: tk.type || '任務', predecessor: tk.predecessor || '', durationDays: tk.durationDays,
          owner: '', dept: roleToDeptId[(tk.role || '').trim()] || '', variant: variantId,
          start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
          progress: 0, status: 'pending', urgency: 'med', estHours: parseFloat(tk.durationDays || 0) * dailyHours || 4,
          method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
          scheduledStart: '', scheduledEnd: '', synced: false, stage: mod.stage || '', subgroup: tk.subgroup || '',
          mustDeliver: false, deliverable: tk.deliverable || '', riskIssue: '', delivered: '', deliverableLink: '', note: '',
        });
      });
    });
  });

  // 衍生扁平 excludedNs（各案 Set 的 union）供回傳契約（test 斷言 res.excludedNs；回傳形狀不變）
  const excludedNs = [].concat(...Object.values(excludedByVariant).map(s => [...s]));

  // ⑥ 依賴重指：map 改「按案別」各 build 一張（variantKey→Map），翻譯吃 task 自己 variant 的 map
  const wbsToIdMapByVariant = {};
  {
    const tasksByVariant = {};
    tasks.forEach(t => { const k = variantKey(t.variant); (tasksByVariant[k] || (tasksByVariant[k] = [])).push(t); });
    Object.keys(tasksByVariant).forEach(k => { wbsToIdMapByVariant[k] = buildWbsToIdMap(tasksByVariant[k]); });
  }
  const nToName = {};
  (template && template.cases ? template.cases : []).forEach(tc => {
    (tc.modules || []).forEach(mod => {
      (mod.tasks || []).forEach(tk => { nToName[tk.n] = tk.name || ''; });
    });
  });
  const warnings = [];
  function relinkPred(rawPred, selfName, vMap, vExcluded) {
    const parts = String(rawPred || '').split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
    const kept = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)/);
      if (m && vExcluded && vExcluded.has(parseInt(m[1], 10))) {
        const depName = nToName[m[1]] || ('#' + m[1]);
        warnings.push('「' + selfName + '」的前置「' + depName + '」因所在階段未選，已自動移除');
        continue;
      }
      kept.push(part);
    }
    return translatePredToId(kept.join(','), vMap);
  }
  tasks.forEach(t => {
    const k = variantKey(t.variant);
    t.predecessor = relinkPred(t.predecessor, t.name, wbsToIdMapByVariant[k], excludedByVariant[k]);
  });

  // ⑧ 各案別順推排程 + 6b 溢出
  const variantStart = {}, variantEnd = {}, variantDir = {};
  variants.forEach(v => {
    variantStart[v.id] = v.schedule.startDate || '';
    variantEnd[v.id] = v.schedule.endDate || '';
    variantDir[v.id] = v.schedule.direction || 'forward';
  });
  variants.forEach(v => {
    if (variantDir[v.id] === 'backward') {
      warnings.push('「' + v.name + '」逆推排程尚未開放，已改用開始日順推（未填開始日則該案未排）');
    }
  });
  tasks.forEach(t => { if (!t.predecessor) t.plannedStart = variantStart[t.variant] || ''; });
  const sch = computeSchedule(tasks);
  const schById = new Map();
  sch.results.forEach(r => schById.set(r.taskId, r));
  tasks.forEach(t => {
    const r = schById.get(t.id);
    if (r && r.suggestedStart) { t.plannedStart = r.suggestedStart; t.plannedEnd = r.suggestedEnd; }
    else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無起算日或循環依賴）'); }
  });
  variants.forEach(v => {
    const endLimit = variantEnd[v.id];
    if (!endLimit) return;
    const vts = tasks.filter(t => t.variant === v.id && t.plannedEnd);
    if (!vts.length) return;
    let binding = vts[0];
    vts.forEach(t => { if (t.plannedEnd > binding.plannedEnd) binding = t; });
    const computedEnd = binding.plannedEnd;
    if (computedEnd > endLimit) {
      const overDays = Math.max(0, D.workdaysBetween(endLimit, computedEnd) - 1);
      warnings.push('「' + v.name + '」排程溢出：最晚「' + binding.name + '」需排到 ' + computedEnd +
        '，超過設定結束日 ' + endLimit + '（約 ' + overDays + ' 工作天）');
    }
  });

  return { project, variants, variantNameToId, depts, tasks, excludedNs, warnings };
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
  roleMap: { PM: '王小明', ME: '李大華', EE: '' },
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

// ════ 5. task / warnings（TPL 無 cases.modules → task 空；另案 backward → 逆推 warning） ════
check('5a tasks 空陣列（TPL 無 cases.modules）', r1.tasks, []);
check('5b 另案 backward → 逆推 warning（批3⑧連鎖）', r1.warnings.some(w => w.indexOf('逆推') >= 0), true);

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
    { variantName: '主案', startDate: '2026-07-01', direction: 'forward', selectedStages: ['Prototype'] },
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
check('2a-13 predecessor譯id(t2→t1)', byWbs(2).predecessor, byWbs(1).id + '#');
// 2a-14 改：批3⑧ 現在會 seed plannedStart → 改測真正清空的欄（start/actualStart/scheduledStart）
check('2a-14 真清空欄(start/actual/scheduled)', [byWbs(1).start, byWbs(1).actualStart, byWbs(1).scheduledStart], ['', '', '']);

// 邊界：全選→excludedNs空
const aFull = App.applyTemplate(TPL2, { projectName: 'P', cases: [
  { variantName: '主案', startDate: '2026-07-01', selectedStages: ['Prototype', 'EVT'] },
  { variantName: '另案', startDate: '2026-08-01', selectedStages: ['EVT'] },
], roleMap: { PM: '王', EE: '李' } });
check('2a-15 全選→excludedNs空', aFull.excludedNs, []);
check('2a-16 全選→task數4', aFull.tasks.length, 4);

// ════════ 批2b：依賴重指⑥（B 系列 UI 補 startDate 讓⑧排程乾淨、不混入未能排入 warning） ════════
const TPL3 = { cases: [
  { variant: '主案', stages: ['S1', 'S2'], modules: [
    { stage: 'S1', tasks: [
      { tplId: 't1', n: 1, name: '規格', type: '任務', subgroup: '', durationDays: 5, predecessor: '', deliverable: '', role: 'PM' },
      { tplId: 't2', n: 2, name: '設計', type: '任務', subgroup: '', durationDays: 5, predecessor: '1', deliverable: '', role: 'PM' },
    ]},
    { stage: 'S2', tasks: [
      { tplId: 't3', n: 3, name: '打樣', type: '任務', subgroup: '', durationDays: 8, predecessor: '2FS+2', deliverable: '', role: 'ME' },
      { tplId: 't4', n: 4, name: '測試', type: '任務', subgroup: '', durationDays: 3, predecessor: '2,3', deliverable: '', role: 'ME' },
    ]},
  ]},
]};
const ROLE = { PM: '甲', ME: '乙' };

const bAll = App.applyTemplate(TPL3, { projectName: 'P', cases: [{ variantName: '主案', startDate: '2026-07-01', selectedStages: ['S1', 'S2'] }], roleMap: ROLE });
const bw = w => bAll.tasks.find(t => t.wbs === w);
check('B-1 純序號譯id', bw(2).predecessor, bw(1).id + '#');
check('B-2 FS+lag保留譯id', bw(3).predecessor, bw(2).id + '#FS+2');
check('B-3 多前置全留兩段都譯', bw(4).predecessor, bw(2).id + '#,' + bw(3).id + '#');
check('B-4 全選warnings空', bAll.warnings, []);

const bCut = App.applyTemplate(TPL3, { projectName: 'P', cases: [{ variantName: '主案', startDate: '2026-07-01', selectedStages: ['S2'] }], roleMap: ROLE });
const cw = w => bCut.tasks.find(t => t.wbs === w);
check('B-5 多前置部分斷(2,3砍2只剩3)', cw(4).predecessor, cw(3).id + '#');
check('B-6 指向excluded全斷→空', cw(3).predecessor, '');
check('B-7 warnings數=2', bCut.warnings.length, 2);
check('B-8 warning文案(含X/Y名)', bCut.warnings.includes('「打樣」的前置「設計」因所在階段未選，已自動移除'), true);

const bCut2 = App.applyTemplate(TPL3, { projectName: 'P', cases: [{ variantName: '主案', startDate: '2026-07-01', selectedStages: ['S1'] }], roleMap: ROLE });
const dw = w => bCut2.tasks.find(t => t.wbs === w);
check('B-9 砍下游→kept不references excluded→warnings空', bCut2.warnings, []);
check('B-10 kept正常譯id', dw(2).predecessor, dw(1).id + '#');

// ════════ 批3：排程⑧ + 6b 溢出 ════════
// fixture：主案 t1(dur3,源頭)→t2(FS)→t3(FS+2,尾)；另案 t4(dur2,源頭)。workDays 週一~五。
// 主案開始 2026-07-01(週三)、另案開始 2026-08-03(週一)。手算：
//   t1 07-01~07-03、t2 07-06~07-07、t3 07-09~07-09、t4 08-03~08-04
const TPL4 = { cases: [
  { variant: '主案', stages: ['S1'], modules: [
    { stage: 'S1', tasks: [
      { tplId: 't1', n: 1, name: '起', type: '任務', subgroup: '', durationDays: 3, predecessor: '', deliverable: '', role: 'PM' },
      { tplId: 't2', n: 2, name: '中', type: '任務', subgroup: '', durationDays: 2, predecessor: '1', deliverable: '', role: 'PM' },
      { tplId: 't3', n: 3, name: '尾', type: '任務', subgroup: '', durationDays: 1, predecessor: '2FS+2', deliverable: '', role: 'PM' },
    ]},
  ]},
  { variant: '另案', stages: ['S1'], modules: [
    { stage: 'S1', tasks: [
      { tplId: 't4', n: 4, name: '另起', type: '任務', subgroup: '', durationDays: 2, predecessor: '', deliverable: '', role: 'PM' },
    ]},
  ]},
]};
function ui4(mainEnd, mainDir) {
  return { projectName: 'P', cases: [
    { variantName: '主案', startDate: '2026-07-01', endDate: mainEnd || '', direction: mainDir || 'forward', selectedStages: ['S1'] },
    { variantName: '另案', startDate: '2026-08-03', direction: 'forward', selectedStages: ['S1'] },
  ], roleMap: { PM: '甲' } };
}
const sch4 = App.applyTemplate(TPL4, ui4());
const sw = w => sch4.tasks.find(t => t.wbs === w);
check('C-1 源頭 seed=主案開始日', sw(1).plannedStart, '2026-07-01');
check('C-2 源頭 plannedEnd=start+dur', sw(1).plannedEnd, '2026-07-03');
check('C-3 FS鏈 t2 start=t1end次工作日', sw(2).plannedStart, '2026-07-06');
check('C-4 t2 end', sw(2).plannedEnd, '2026-07-07');
check('C-5 FS+2 t3 start', sw(3).plannedStart, '2026-07-09');
check('C-6 t3 end(dur1)', sw(3).plannedEnd, '2026-07-09');
check('C-7 另案獨立起算(不受主案影響)', sw(4).plannedStart, '2026-08-03');
check('C-8 另案 end', sw(4).plannedEnd, '2026-08-04');
check('C-9 順推無 warning', sch4.warnings, []);

const sch5 = App.applyTemplate(TPL4, ui4('2026-07-07'));   // endDate < computedEnd 07-09
check('C-10 6b溢出觸發', sch5.warnings.some(w => w.indexOf('排程溢出') >= 0), true);
check('C-11 6b binding=尾+computedEnd', sch5.warnings.some(w => w.indexOf('尾') >= 0 && w.indexOf('2026-07-09') >= 0), true);

const sch6 = App.applyTemplate(TPL4, ui4('2026-12-31'));
check('C-12 6b不溢出(endDate充足)', sch6.warnings.some(w => w.indexOf('排程溢出') >= 0), false);
check('C-13 無endDate→不比', sch4.warnings.some(w => w.indexOf('排程溢出') >= 0), false);

const sch7 = App.applyTemplate(TPL4, ui4('', 'backward'));
check('C-14 backward→逆推warning', sch7.warnings.some(w => w.indexOf('逆推') >= 0), true);
check('C-15 backward仍以開始日順推', sch7.tasks.find(t => t.wbs === 1).plannedStart, '2026-07-01');

const TPLcyc = { cases: [{ variant: '主案', stages: ['S1'], modules: [{ stage: 'S1', tasks: [
  { tplId: 't1', n: 1, name: 'A', type: '任務', subgroup: '', durationDays: 1, predecessor: '2', deliverable: '', role: 'PM' },
  { tplId: 't2', n: 2, name: 'B', type: '任務', subgroup: '', durationDays: 1, predecessor: '1', deliverable: '', role: 'PM' },
]}]}]};
const schC = App.applyTemplate(TPLcyc, { projectName: 'P', cases: [{ variantName: '主案', startDate: '2026-07-01', selectedStages: ['S1'] }], roleMap: { PM: '甲' } });
check('C-16 循環→plannedStart留空', schC.tasks[0].plannedStart, '');
check('C-17 循環→未能排入warning', schC.warnings.some(w => w.indexOf('未能排入') >= 0), true);

// ════════ 批4a：未選入的案別不生成（TPL4 含主案+另案，userInput 只給主案） ════════
const r4a = App.applyTemplate(TPL4, { projectName: 'P', cases: [{ variantName: '主案', startDate: '2026-07-01', selectedStages: ['S1'] }], roleMap: { PM: '甲' } });
check('4a-1 未選另案→只剩主案 task', r4a.tasks.every(t => t.variant === r4a.variantNameToId['主案']), true);
check('4a-2 只主案3筆(另案t4不生成)', r4a.tasks.length, 3);

// ════ 結果 ════
console.log(`\nPASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail ? 1 : 0);
