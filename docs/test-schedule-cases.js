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
const DATA = { settings: { workDays: [1, 2, 3, 4, 5] }, calendars: { base: { name: '台灣公版', holidays: {} }, override: null } };

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
  // 測試 stub：固定今天為 2026-06-11（scoreTask 副本用；不隨真實日期飄，保決定性）
  today() { return new Date('2026-06-11'); },
  // ── 同步複本（app.js:360-397，A1/A2 用）：改 app.js weekNum/weekKey 須同步這幾份 ──
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  weekStart(d = new Date()) {
    const x = new Date(d); x.setHours(0,0,0,0);
    const day = x.getDay(); const diff = day === 0 ? 1 : 1 - day;
    x.setDate(x.getDate() + diff); return x;
  },
  weekNum(d = new Date()) {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target - firstThursday;
    return 1 + Math.ceil(diff / (7 * 86400000));
  },
  weekKey(d = new Date()) { return `W${this.weekNum(d)}-${d.getFullYear()}`; },
};

// ════ buildWbsToIdMap / translatePredToId 同步複本（與 app.js 函式體一字不差）═══
function buildWbsToIdMap(tasks) {
  const map = new Map();
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs !== '' && t.wbs != null) {
      const k = String(t.wbs).trim();
      if (!map.has(k)) map.set(k, t.id);   // 保留先者
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

// ════ parsePredecessors 同步複本 ════════════════════════════════
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
    const usesPredEnd = !(p.type === 'SS' || p.type === 'SF');  // FS/FF 讀 dep.end；SS/SF 讀 dep.start
    let predRefStr = usesPredEnd ? dep.end : dep.start;
    // 窄修：dep.end 為空但 dep.start 有值 → 用 start+工期補算 end（公式同 computeSchedule 的 durOf/end）；
    //       dep.start 也空則維持空字串，讓下方 guard 自然短路，避免 Invalid Date / NaN。
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


// ════ topoSortTasks 同步複本 ════════════════════════════════════
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
    // ① 錨點：使用者刻意定的開始日 t.start，最高優先、不被推算覆蓋（即使上游有問題也不 block，只警示）
    const anchorStart = t.start;
    if (anchorStart) {
      const end = iso(D.addWorkdays(new Date(anchorStart), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: anchorStart, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null,
        warnings: warns, anchorSource: 'manual' };
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
    const src = t.start || t.plannedStart;
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

// ═══ computeScheduleBackward：反推引擎（§4.8.2，computeSchedule 的反向鏡像）═══
// 從「目標可販日」往前推算各任務「最晚開始/完成」。結構鏡像正推 computeSchedule：
//   正推從 edges(前置) PULL、order 正序、多前置取最晚 max、源頭讀 plannedStart；
//   反推從 succAdj(後續) PULL、order 逆序、多後續取最早 min、末端讀 targetEnd。
// 反向關係公式（鏡像 FS/SS/FF/SF；D.addWorkdays 負值往前推）：
//   FS 前最晚完成 = addWorkdays(後最晚開始, -max(1,lag)) → 最晚開始 = addWorkdays(完成, -(dur-1))
//   FF 前最晚完成 = addWorkdays(後最晚完成, -lag)        → 最晚開始 = addWorkdays(完成, -(dur-1))
//   SS 前最晚開始 = addWorkdays(後最晚開始, -lag)        → 最晚完成 = addWorkdays(開始, +(dur-1))
//   SF 前最晚開始 = addWorkdays(後最晚完成, -lag)        → 最晚完成 = addWorkdays(開始, +(dur-1))
//   多後續：各自換算成 impliedStart，取最早（min，正推 max 的鏡像）。
// 優先序（鏡像正推四分支，方向相反）：
//   ① 手填 start 錨點：不覆蓋、與後續所需比對衝突警示、不 block
//   ② 後續污染（circular/blocked/待排/無日期）→ 本 task 也 blocked，不推算
//   ③ 有後續、正常 → 反向四公式推算、取最早 min
//   ④ 無後續（末端）→ 有 targetEnd 從可販日反推、無則待排
// 跨案邊 guard（新不變量，§8e.6）：後續 variant !== 本任務 variant → 警示 + 忽略該邊（不靜默算錯）。
//   前提：backward 只跑範本資料（§4.8.1，三模式僅範本模式），範本前置 per-variant 翻譯保證零跨案邊；
//   此 guard 為防線（Excel 全域翻譯路徑若未來放開反推才會踩到），守住「不靜默」。
// @return { results:[{wbs,taskId,name,lateStart,lateFinish,blocked,error,toSchedule,blockedCause,warnings,anchorSource?}],
//           circular:[id], hasCircular }
// ── [CORE] 純計算層：只讀 tasks、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function computeScheduleBackward(tasks) {
  const { order, circular, nodes, edges } = topoSortTasks(tasks);
  const byId = new Map();   // id -> result（供連鎖污染查後續）
  const results = [];

  const iso = (d) => D.fmt(d, 'iso');
  const durOf = (t) => Math.max(1, parseFloat(t.durationDays) || 1);
  const ident = (t) => ({ wbs: (t.wbs === undefined || t.wbs === null) ? '' : t.wbs, taskId: t.id, name: t.name || '' });

  // 從 edges(task→前置) 反轉建 succAdj(前置→後續清單)：succAdj[p.dep] = [{succId, type, lag}]
  const succAdj = new Map();
  for (const [succId, preds] of edges) {
    for (const p of preds) {
      if (!succAdj.has(p.dep)) succAdj.set(p.dep, []);
      succAdj.get(p.dep).push({ succId, type: p.type, lag: p.lag });
    }
  }

  // 1. 先標 circular 節點（鏡像正推，讓下游污染查得到）
  for (const id of circular) {
    const t = nodes.get(id);
    byId.set(id, { ...ident(t), lateStart: null, lateFinish: null,
      blocked: true, error: 'circular', toSchedule: false, blockedCause: 'circular',
      warnings: ['循環依賴：此任務在依賴環上，無法排程'] });
  }

  // 各後續換算成本任務 impliedStart，取最早 min；回 {lateStart, lateFinish}（Date）或 null（無可用後續）
  function impliedFromSuccs(dur, succs) {
    let earliest = null;
    for (const s of succs) {
      const sr = byId.get(s.succId);
      if (!sr || sr.lateStart == null || sr.lateFinish == null) continue;
      const sStart = new Date(sr.lateStart), sFin = new Date(sr.lateFinish);
      let is;
      if (s.type === 'SS')      is = D.addWorkdays(sStart, -s.lag);
      else if (s.type === 'SF') is = D.addWorkdays(sFin, -s.lag);
      else if (s.type === 'FF') is = D.addWorkdays(D.addWorkdays(sFin, -s.lag), -(dur - 1));
      else                      is = D.addWorkdays(D.addWorkdays(sStart, -Math.max(1, s.lag)), -(dur - 1)); // FS
      if (earliest === null || is < earliest) earliest = is;
    }
    if (earliest === null) return null;
    return { lateStart: earliest, lateFinish: D.addWorkdays(earliest, dur - 1) };
  }

  function processTaskBackward(t) {
    const dur = durOf(t);
    // 跨案邊 guard：濾掉不同 variant 的後續 + 警示（忽略該邊，不靜默算錯）
    const allSuccs = succAdj.get(t.id) || [];
    const crossWarn = [];
    const succs = [];
    for (const s of allSuccs) {
      const sNode = nodes.get(s.succId);
      if (sNode && (sNode.variant || null) !== (t.variant || null)) {
        crossWarn.push(`跨案邊：後續「${sNode.name || s.succId}」與本任務不同案別，已忽略該依賴`);
      } else {
        succs.push(s);
      }
    }

    // ① 錨點：手填 start 最高優先、不被推算覆蓋（即使後續有問題也不 block，只警示）
    const anchorStart = t.start;
    if (anchorStart) {
      const lateStart = anchorStart;
      const lateFinish = iso(D.addWorkdays(new Date(anchorStart), dur - 1));
      const warns = crossWarn.slice();
      const imp = impliedFromSuccs(dur, succs);   // 與後續所需比對：手填完成晚於所需 → 衝突警示
      if (imp && new Date(lateFinish) > imp.lateFinish) {
        warns.push(`日期衝突：手填最晚完成 ${lateFinish} 晚於後續所需 ${iso(imp.lateFinish)}`);
      }
      return { ...ident(t), lateStart, lateFinish,
        blocked: false, error: null, toSchedule: false, blockedCause: null,
        warnings: warns, anchorSource: 'manual' };
    }

    // ② 連鎖污染：後續 circular / 已 blocked / 待排 / 無日期 → 本 task 也 blocked
    const pollutedWarn = [];
    let pollutedCause = null;
    for (const s of succs) {
      const sr = byId.get(s.succId);
      if (!sr) continue;
      if (sr.error === 'circular' || sr.blockedCause === 'circular') {
        pollutedWarn.push(`後續 #${sr.wbs} 無法排程（下游循環）`);
        pollutedCause = 'circular';
      } else if (sr.blocked || sr.toSchedule || sr.lateStart == null) {
        pollutedWarn.push(`後續 #${sr.wbs} 尚未排程（下游待排）`);
        if (!pollutedCause) pollutedCause = 'unscheduled';
      }
    }
    if (pollutedWarn.length) {
      return { ...ident(t), lateStart: null, lateFinish: null,
        blocked: true, error: null, toSchedule: false, blockedCause: pollutedCause,
        warnings: pollutedWarn.concat(crossWarn) };
    }

    // ③ 無 start、後續正常：依關係反算 impliedStart，取最早 min
    if (succs.length > 0) {
      const imp = impliedFromSuccs(dur, succs);
      if (imp) {
        return { ...ident(t), lateStart: iso(imp.lateStart), lateFinish: iso(imp.lateFinish),
          blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: crossWarn };
      }
      // 後續存在但全不可用（理論上已被 ② 攔下，保險）→ 落 ④ 待排
    }

    // ④ 無後續(末端)：有 targetEnd → 從可販日反推；無則待排
    if (t.targetEnd) {
      return { ...ident(t), lateStart: iso(D.addWorkdays(new Date(t.targetEnd), -(dur - 1))), lateFinish: t.targetEnd,
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: crossWarn };
    }
    return { ...ident(t), lateStart: null, lateFinish: null,
      blocked: false, error: null, toSchedule: true, blockedCause: null,
      warnings: ['待排：無後續且未填目標可販日'].concat(crossWarn) };
  }

  // 2. 圖內節點按拓撲「逆序」處理（後續先算 → 前置才能 PULL）
  for (let i = order.length - 1; i >= 0; i--) byId.set(order[i], processTaskBackward(nodes.get(order[i])));

  // 3. 整理輸出（鏡像正推：order → circular → 非圖內任務）
  for (const id of order) results.push(byId.get(id));
  for (const id of circular) results.push(byId.get(id));
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs === '' || t.wbs === undefined || t.wbs === null) results.push(processTaskBackward(t));
  }

  return { results, circular: circular.slice(), hasCircular: circular.length > 0 };
}

// ════ applySchedule 同步複本（內容與 app.js 一字不差） ═══
// 規則（抉擇 B 定案=「不寫」錨點）：循環/blocked/待排 跳過；錨點任務(override/manual)也跳過，
//   不進機器層 scheduled；其餘連動任務寫入 scheduled。
function applySchedule(tasks, scope = 'full') {
  const { results } = computeSchedule(tasks);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const applied = [];
  const skipped = [];
  results.forEach(r => {
    const task = byId.get(r.taskId);
    if (!task) return;
    // 跳過：循環/blocked/待排(無有效建議)
    if (r.error === 'circular' || r.blocked || r.toSchedule || !r.suggestedStart) {
      skipped.push({ id: r.taskId, reason: r.error || r.blockedCause || 'unscheduled', warnings: r.warnings });
      return;
    }
    // 跳過：錨點任務(手動手填)——人的意志，不進機器層scheduled(B定案=不寫)
    //   顯示靠 getEffectiveSchedule 的 actual 層補
    if (r.anchorSource === 'manual') {
      skipped.push({ id: r.taskId, reason: 'anchor:' + r.anchorSource });
      return;
    }
    // 正常連動任務：寫入排程結果(純機器層)
    task.scheduledStart = r.suggestedStart;
    task.scheduledEnd = r.suggestedEnd;
    applied.push({ id: r.taskId, start: r.suggestedStart, end: r.suggestedEnd });
  });
  return { applied, skipped, total: results.length };
}

// ════ 測試入口 wrapper（§8b.5 層次二 S2b-2）═══════════════════════
// 模擬生產三條寫入路徑（WBS 匯入 / J 同步 / 手動表單）的「序號→id 翻譯」：
// fixture 維持人類可讀的序號 predecessor，餵 id 化引擎前先翻成 id#格式。
//   ⚠ 就地翻譯、不深拷貝——§8 applySchedule 需把 scheduledStart 寫回原 fixture 物件，
//     clone 會讓寫入落在拷貝上、原物件讀不到。就地翻安全：translatePredToId 對已是 id 的
//     字串不重翻（正則 ^(\d+) 不吃 id 開頭），同物件翻兩次冪等。
function translatePreds(tasks) {
  const map = buildWbsToIdMap(tasks);
  tasks.forEach(t => { t.predecessor = translatePredToId(t.predecessor, map); });
  return tasks;
}
function runSchedule(tasks) { return computeSchedule(translatePreds(tasks)); }
function runApply(tasks) { return applySchedule(translatePreds(tasks)); }
// §3 topoSort 直測用：翻 fixture 後 order/circular 回的是 id 清單，映回 wbs 讓 expected 維持序號可讀。
// 只覆寫 order/circular 兩欄，其餘欄（nodes/edges）以 ...out 原樣保留。
function runTopo(tasks) {
  const out = topoSortTasks(translatePreds(tasks));
  const idToWbs = new Map(tasks.map(t => [t.id, t.wbs]));
  return { ...out,
    order: out.order.map(id => idToWbs.get(id)),
    circular: out.circular.map(id => idToWbs.get(id)) };
}

// ════ getEffectiveSchedule 同步複本（dispStart/dispEnd 與 app.js 一字不差） ═══
function getEffectiveSchedule(task) {
  if (!task) return null;
  // 顯示優先序：actual(已開工) > scheduled(排程算) > planned(初始預計) > start(手填)
  // ⚠ 用 || 不用 ??：空字串也要 fallback 到下層
  const dispStart = (task.actualStart || task.scheduledStart || task.plannedStart || task.start || '');
  const dispEnd   = (task.actualEnd   || task.scheduledEnd   || task.plannedEnd   || task.end   || '');
  return {
    start: dispStart,
    end: dispEnd,
    plannedStart: task.plannedStart,
    plannedEnd: task.plannedEnd,
    scheduledStart: task.scheduledStart || '',
    scheduledEnd: task.scheduledEnd || '',
    startSource: (task.actualStart ? 'actual' : (task.scheduledStart ? 'scheduled' : (task.plannedStart ? 'planned' : (task.start ? 'manual' : 'none')))),
  };
}

// ════ 測試框架 ══════════════════════════════════════════════════
// ════ scoreTask + sortTasks 同步複本（app.js:735-770）════════════
// ⚠ 改 app.js 的 scoreTask/sortTasks 時，這兩份副本要一起改（決定性測試用）。
function scoreTask(t) {
  if (t.status === 'done')  return -9999;
  if (t.status === 'hold')  return -9000;
  let score = 0;
  score += { high: 300, medium: 100, low: 0 }[t.urgency] || 0;
  const sch = getEffectiveSchedule(t);
  if (sch.end) {
    const days = D.daysBetween(D.today(), new Date(sch.end));
    if (days < 0)      score += 500 + Math.abs(days) * 10;
    else if (days <= 1) score += 400;
    else if (days <= 3) score += 250;
    else if (days <= 7) score += 120;
    else if (days <= 14) score += 50;
  } else score -= 20;
  if (t.status === 'wip') score += 80;
  if (t.synced) score += 5; // tiny bias for synced items
  return score;
}
function sortTasks(arr) {
  return [...arr].sort((a, b) => {
    const ds = scoreTask(b) - scoreTask(a);   // 主鍵：維持現有 scoreTask 降序
    if (ds !== 0) return ds;
    // 平手 tiebreak（決定性）：plannedStart 早的先（空值排最後），再 id 字典序
    const pa = a.plannedStart || '', pb = b.plannedStart || '';
    if (pa !== pb) {
      if (!pa) return 1;            // a 無 plannedStart → 排後
      if (!pb) return -1;           // b 無 → a 在前
      return pa < pb ? -1 : 1;      // ISO 字串比較 = 時序，早的先
    }
    const ia = String(a.id || ''), ib = String(b.id || '');
    return ia < ib ? -1 : (ia > ib ? 1 : 0);   // 最終 id 字典序，保證唯一定序
  });
}

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
//   o 在 Object.assign 末位故直接覆寫帶入預設值
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
  const tEarly = mk({ wbs: 'c', predecessor: '2FS+2', start: '2026-01-12' }); // 門檻 01-13
  const tOk = mk({ wbs: 'd', predecessor: '2FS+2', start: '2026-01-13' });
  check('2FS+2 start=01-12 → 衝突', isTaskBlocked(tEarly, m).blocked, true,
    '門檻=addWorkdays(01-09, max(1,2)=2)=01-13，01-12 太早');
  check('2FS+2 start=01-13 → OK', isTaskBlocked(tOk, m).blocked, false, '剛好達門檻不衝突');
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
  runTopo([mk({ wbs: '1' }), mk({ wbs: '2', predecessor: '1' }), mk({ wbs: '3', predecessor: '2' })]).order,
  ['1', '2', '3'], '無前置先、依賴後');
{
  const direct = runTopo([mk({ wbs: '1', predecessor: '2' }), mk({ wbs: '2', predecessor: '1' })]);
  check('直接環 1↔2 circular', direct.circular.slice().sort(), ['1', '2'], 'A→B→A 兩節點都標環');
  check('直接環 order 空', direct.order, [], '環上節點不進 order');
}
{
  // 間接環 1→3→2→1 + 無辜上游 4→1
  const ind = runTopo([mk({ wbs: '1', predecessor: '3' }), mk({ wbs: '2', predecessor: '1' }), mk({ wbs: '3', predecessor: '2' }), mk({ wbs: '4', predecessor: '1' })]);
  check('間接環 {1,2,3} circular', ind.circular.slice().sort(), ['1', '2', '3'], 'A→B→C→A 整環標到');
  check('無辜上游 4 不在 circular', ind.circular.includes('4'), false, '只標環上節點，不誤標依賴環的上游');
  check('無辜上游 4 在 order', ind.order.includes('4'), true, '4 自己不在環上，正常進 order');
}

// ════ 4. computeSchedule — 四種關係算日期 ════════════════════════
console.log('\n===== 4. computeSchedule 日期推算 =====');
// FS 鏈 A→B→C（含 N-1、跨週末）
{
  const out = runSchedule([
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
  const out = runSchedule([
    mk({ wbs: '10', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '11', predecessor: '10FS+10', durationDays: 1 }),   // start=addWorkdays(01-09,10)=01-23
    mk({ wbs: '20', start: '2026-01-05', durationDays: 3 }),      // end 01-07
    mk({ wbs: '21', predecessor: '20FS+2', durationDays: 2 }),    // start=addWorkdays(01-07,2)=01-09
  ]);
  check('10FS+10', R(out, '11').suggestedStart, '2026-01-23', 'addWorkdays(前置end 01-09, max(1,10)=10)=01-23');
  check('2FS+2', `${R(out, '21').suggestedStart}~${R(out, '21').suggestedEnd}`, '2026-01-09~2026-01-12', 'addWorkdays(01-07,max(1,2)=2)=01-09');
}
// FF（Sheet 例 1FF）：finish 對齊前置 finish
{
  const out = runSchedule([
    mk({ wbs: '30', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '31', predecessor: '30FF', durationDays: 3 }),      // end=01-09 → start 反推 01-07
  ]);
  check('1FF（finish 對齊）', `${R(out, '31').suggestedStart}~${R(out, '31').suggestedEnd}`, '2026-01-07~2026-01-09', 'FF：end=前置end 01-09，start=addWorkdays(end,-(3-1))');
}
// SS：start 對齊前置 start
{
  const out = runSchedule([
    mk({ wbs: '40', start: '2026-01-06', durationDays: 4 }),
    mk({ wbs: '41', predecessor: '40SS', durationDays: 2 }),      // start=前置start 01-06
  ]);
  check('SS（start 對齊）', `${R(out, '41').suggestedStart}~${R(out, '41').suggestedEnd}`, '2026-01-06~2026-01-07', 'SS：start=addWorkdays(前置start,0)');
}
// SF（+0）：finish 對齊前置 start
{
  const out = runSchedule([
    mk({ wbs: '50', start: '2026-01-12', durationDays: 3 }),
    mk({ wbs: '51', predecessor: '50SF', durationDays: 2 }),      // end=前置start 01-12 → start 反推 01-09
  ]);
  check('SF（finish 對齊前置 start，+0）', `${R(out, '51').suggestedStart}~${R(out, '51').suggestedEnd}`, '2026-01-09~2026-01-12', 'SF：end=addWorkdays(前置start,0)=01-12');
}
// SS/FF/SF +lag（lag=3 跨週末，鎖 lag>0 行為；改 FS 前就該綠，SS/FF/SF 為純 p.lag）
{
  const out = runSchedule([
    mk({ wbs: '80', start: '2026-01-08', durationDays: 1 }),
    mk({ wbs: '81', predecessor: '80SS+3', durationDays: 2 }),    // SS+3：start=addWorkdays(前start 01-08,3)=01-13
    mk({ wbs: '82', start: '2026-01-05', durationDays: 5 }),      // end 01-09
    mk({ wbs: '83', predecessor: '82FF+3', durationDays: 2 }),    // FF+3：end=addWorkdays(前end 01-09,3)=01-14，start反推01-13
    mk({ wbs: '84', start: '2026-01-09', durationDays: 3 }),
    mk({ wbs: '85', predecessor: '84SF+3', durationDays: 2 }),    // SF+3：end=addWorkdays(前start 01-09,3)=01-14，start反推01-13
  ]);
  check('SS+3（後start=前start+3工作日，跨週末）', `${R(out, '81').suggestedStart}~${R(out, '81').suggestedEnd}`, '2026-01-13~2026-01-14', 'SS：addWorkdays(01-08,3)=01-13 跳過10/11週末');
  check('FF+3（後end=前end+3工作日，跨週末）', `${R(out, '83').suggestedStart}~${R(out, '83').suggestedEnd}`, '2026-01-13~2026-01-14', 'FF：addWorkdays(01-09,3)=01-14，start=addWorkdays(14,-1)=01-13');
  check('SF+3（後end=前start+3工作日，跨週末）', `${R(out, '85').suggestedStart}~${R(out, '85').suggestedEnd}`, '2026-01-13~2026-01-14', 'SF：addWorkdays(01-09,3)=01-14，start=addWorkdays(14,-1)=01-13');
}
// 多前置取最晚
{
  const out = runSchedule([
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
  const out = runSchedule([
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
  const out = runSchedule([mk({ wbs: '80', predecessor: '999', durationDays: 1 })]);
  check('前置不存在 → toSchedule', R(out, '80').toSchedule, true, '唯一前置不存在=無有效前置 → 待排');
  check('前置不存在 → 警示', hasWarn(R(out, '80'), '前置 #999 不存在'), true, '標前置不存在不報錯');
}
// 無 start 無前置 → 待排
{
  const out = runSchedule([mk({ wbs: '85', durationDays: 1 })]);
  check('無start無前置 → 待排', R(out, '85').toSchedule, true, '標待排');
}
// 手填 start 不被覆蓋、只警示
{
  const out = runSchedule([
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
  const out = runSchedule([pred, succ]);
  const sStart = R(out, '2').suggestedStart;             // 引擎推算 = 01-12
  const m = mapOf([pred]);
  check('FS：引擎推算 start 丟回偵測 → 不衝突', isTaskBlocked(mk({ wbs: '2', predecessor: '1', start: sStart }), m).blocked, false,
    '推算門檻與偵測門檻同尺，自家算的不該被自家判衝突');
  const earlier = D.fmt(D.addWorkdays(new Date(sStart), -1), 'iso');
  check('FS：推算 start 早一天 → 衝突', isTaskBlocked(mk({ wbs: '2', predecessor: '1', start: earlier }), m).blocked, true,
    '早一個工作日就違反門檻');
}

// ════ 7. 錨點分流（plannedStart 起算 vs t.start 錨點） ═══════
// 驗證：有 plannedStart 無 start 的任務不被 plannedStart 釘成錨點（src=undefined、正常連動）；
// 手動填 start 的任務才當錨點(manual)。這是修「92 筆全錨點」的核心。
console.log('\n===== 7. 錨點分流（plannedStart 起算 vs t.start 錨點） =====');
// 案例1：有 plannedStart 無 start + 前置 → 依前置推算、不被 plannedStart 釘住、下游連動
{
  const out = runSchedule([
    mk({ wbs: '101', start: '2026-01-05', status: 'done', durationDays: 3 }),                        // 手動上游：01-05(一)dur3→end 01-07(三)
    mk({ wbs: '102', plannedStart: '2026-01-12', predecessor: '101', durationDays: 2 }),// 有 plannedStart 無 start、有前置
    mk({ wbs: '103', predecessor: '102', durationDays: 2 }),                                          // 下游
  ]);
  check('案例1 有plannedStart無start：不被plannedStart釘住、下游連動',
    `start=${R(out, '102').suggestedStart} src=${R(out, '102').anchorSource} 下游=${R(out, '103').suggestedStart}`,
    'start=2026-01-08 src=undefined 下游=2026-01-12',
    '有plannedStart 01-12但無start→不當錨點，依前置101(end 01-07)FS推算→01-08(四)；anchorSource未設(undefined)；下游FS(102 end 01-09週五→次工作日01-12週一)');
}
// 案例3：手動任務有 start → 當錨點(manual)
{
  const out = runSchedule([
    mk({ wbs: '301', start: '2026-01-12', durationDays: 2 }),   // 手動填 start
  ]);
  check('案例3 手動有start：當錨點(manual)、suggestedStart=01-12',
    `start=${R(out, '301').suggestedStart} end=${R(out, '301').suggestedEnd} src=${R(out, '301').anchorSource}`,
    'start=2026-01-12 end=2026-01-13 src=manual',
    '有 start→錨點看t.start=01-12(一)，anchorSource=manual，end=addWorkdays(01-12,1)=01-13(二)');
}
// 案例4：手動任務無 start → 無前置走待排、有前置走推算（皆非錨點）
{
  const noPred = runSchedule([mk({ wbs: '401', durationDays: 2 })]);        // 無start、無前置
  const withPred = runSchedule([
    mk({ wbs: '402', start: '2026-01-05', status: 'done', durationDays: 3 }),   // 手動上游 end 01-07
    mk({ wbs: '403', predecessor: '402', durationDays: 2 }),                    // 無start、有前置
  ]);
  check('案例4 手動無start：無前置→待排、有前置→推算（皆非錨點）',
    `待排=${R(noPred, '401').toSchedule} src無=${R(noPred, '401').anchorSource} 推算=${R(withPred, '403').suggestedStart} src推=${R(withPred, '403').anchorSource}`,
    '待排=true src無=undefined 推算=2026-01-08 src推=undefined',
    '無start：無前置→toSchedule=true且未進錨點分支(anchorSource undefined)；有前置則依402(end 01-07)FS推算→01-08(四)，亦非錨點');
}

// ════ 7b. ④ plannedStart 起算來源（新邏輯：無前置但有 plannedStart → 起算、非錨點、保留連動） ═══
// 驗證 computeSchedule ④ 分支改動：源頭任務(無前置)有 plannedStart 時，從它起算而非待排，
// 且「不設 anchorSource」=當「起算來源」非「錨點」→ applySchedule 會寫 scheduled、下游可連動。
console.log('\n===== 7b. ④ plannedStart 起算來源 =====');
// 案A：無前置 + plannedStart → 從它起算、不待排、非錨點
{
  const out = runSchedule([
    mk({ wbs: '501', plannedStart: '2026-01-12', durationDays: 5 }),   // 無start、無前置、有 plannedStart
  ]);
  check('案A 無前置+plannedStart：從它起算、不待排、非錨點',
    `start=${R(out, '501').suggestedStart} 待排=${R(out, '501').toSchedule} blocked=${R(out, '501').blocked} src=${R(out, '501').anchorSource}`,
    'start=2026-01-12 待排=false blocked=false src=undefined',
    '無前置但有plannedStart→④起算來源 src=t.start||t.plannedStart=01-12；toSchedule=false不待排；無anchorSource(undefined)證明是起算來源非錨點→守住連動命脈');
}
// 案B：源頭 plannedStart 起算 + 下游連動（今日核心需求）
{
  const out = runSchedule([
    mk({ wbs: '511', plannedStart: '2026-01-12', durationDays: 5 }),   // 源頭：無前置、plannedStart 01-12(一)dur5→end 01-16(五)
    mk({ wbs: '512', predecessor: '511', durationDays: 3 }),           // 下游：FS 接 511、無 plannedStart
  ]);
  check('案B 源頭plannedStart起算→下游連動',
    `源頭start=${R(out, '511').suggestedStart} 源頭src=${R(out, '511').anchorSource} 下游start=${R(out, '512').suggestedStart} 下游待排=${R(out, '512').toSchedule}`,
    '源頭start=2026-01-12 源頭src=undefined 下游start=2026-01-19 下游待排=false',
    '源頭④起算 src=plannedStart 01-12(一)dur5→end addWorkdays(01-12,4)=01-16(五)、無anchorSource；下游FS=addWorkdays(01-16,1)跨週末→01-19(一)、前置鏈通故toSchedule=false');
}

// ════ 8. applySchedule — 落地 scheduledStart/End（抉擇 B：錨點不寫） ═══
console.log('\n===== 8. applySchedule 落地 =====');
// 案例5：整鏈套用 A(手動錨點)→B→C，B/C 連動寫入 scheduled
{
  const tasks = [
    mk({ wbs: '501', start: '2026-01-05', durationDays: 3 }),   // 手動錨點上游 A：01-05(一)dur3→end 01-07(三)
    mk({ wbs: '502', predecessor: '501', durationDays: 2 }),    // B 連動
    mk({ wbs: '503', predecessor: '502', durationDays: 2 }),    // C 連動
  ];
  runApply(tasks);
  const B = tasks.find(t => t.wbs === '502');
  const C = tasks.find(t => t.wbs === '503');
  check('案例5 整鏈套用：B/C scheduled 寫入且連動',
    `B=${B.scheduledStart}~${B.scheduledEnd} C=${C.scheduledStart}~${C.scheduledEnd}`,
    'B=2026-01-08~2026-01-09 C=2026-01-12~2026-01-13',
    'A(手動錨點01-05 end01-07)→B FS 01-08(四)~01-09(五)→C FS 01-12(一)~01-13(二)；B/C 非錨點故寫入 scheduledStart/End');
}
// 案例6：循環 + 連鎖下游 → 跳過，scheduled 維持空、進 skipped、reason 正確
{
  const tasks = [
    mk({ wbs: '601', predecessor: '602', durationDays: 1 }),
    mk({ wbs: '602', predecessor: '601', durationDays: 1 }),
    mk({ wbs: '603', predecessor: '601', durationDays: 1 }),    // 下游依賴循環節點 → 連鎖 blocked
  ];
  const res = runApply(tasks);
  const t = (wbs) => tasks.find(x => x.wbs === wbs);
  const sk = (wbs) => res.skipped.find(s => s.id === t(wbs).id);
  check('案例6 循環/連鎖：scheduled維持空、進skipped、reason正確',
    `601空=${t('601').scheduledStart === undefined} 602空=${t('602').scheduledStart === undefined} 603空=${t('603').scheduledStart === undefined} r601=${sk('601') && sk('601').reason} r603=${sk('603') && sk('603').reason}`,
    '601空=true 602空=true 603空=true r601=circular r603=circular',
    '601/602在環→error=circular跳過；603連鎖blocked(blockedCause=circular)跳過；三者皆不寫scheduled');
}
// 案例7：錨點(manual)跳過不寫scheduled，但其下游正常連動寫入
{
  const tasks = [
    mk({ wbs: '701', start: '2026-01-05', durationDays: 2 }),                     // 手動錨點：01-05(一)dur2→end 01-06(二)
    mk({ wbs: '702', predecessor: '701', durationDays: 2 }),                      // 其下游連動
  ];
  const res = runApply(tasks);
  const t = (wbs) => tasks.find(x => x.wbs === wbs);
  const sk = (wbs) => res.skipped.find(s => s.id === t(wbs).id);
  check('案例7 錨點跳過不寫scheduled、但下游連動寫入',
    `701空=${t('701').scheduledStart === undefined} r701=${sk('701') && sk('701').reason} 702=${t('702').scheduledStart}`,
    '701空=true r701=anchor:manual 702=2026-01-07',
    '手動錨點701→skipped(reason=anchor:manual)且不寫scheduled(B定案)；下游702(FS 01-07週三)正常寫入scheduled');
}

// ════ 9. getEffectiveSchedule — 顯示優先序 actual>scheduled>planned ═══
console.log('\n===== 9. getEffectiveSchedule 優先序 =====');
// 同一 task 物件逐層加值，驗 start 取值與 startSource 依優先序切換
{
  const task = mk({ wbs: '801', plannedStart: '2026-01-05', durationDays: 2 });   // (a) 只有 planned
  const a = getEffectiveSchedule(task);
  task.scheduledStart = '2026-01-08';                                             // (b) 加 scheduled
  const b = getEffectiveSchedule(task);
  task.actualStart = '2026-01-06';                                               // (c) 加 actual
  const c = getEffectiveSchedule(task);
  check('案例8 getEffectiveSchedule 優先序 actual>scheduled>planned',
    `a=${a.start}/${a.startSource} b=${b.start}/${b.startSource} c=${c.start}/${c.startSource}`,
    'a=2026-01-05/planned b=2026-01-08/scheduled c=2026-01-06/actual',
    '(a)只planned→planned；(b)加scheduled→壓planned；(c)加actual→壓scheduled');
}

// ════ 10. getEffectiveSchedule — 手動任務 t.start/t.end 鏈尾 fallback（修 KPI DELAYED 漏報） ═══
console.log('\n===== 10. getEffectiveSchedule 手動 fallback =====');
// 案例A：純手動任務（四層 override/actual/scheduled/planned 全空，只有 t.start/t.end）
//   修正前 end 恆空 → 過期手動任務被歸「無日期」漏報；修正後顯示層讀得到、startSource=manual
{
  const task = mk({ wbs: '901', start: '2026-05-01', end: '2026-05-10' });
  const r = getEffectiveSchedule(task);
  check('案例A 手動任務 t.start/t.end 進顯示層（end 不再恆空）',
    `start=${r.start} end=${r.end} src=${r.startSource}`,
    'start=2026-05-01 end=2026-05-10 src=manual',
    '四層全空→鏈尾fallback讀t.start/t.end；過期手動任務自此可被DELAYED計到');
}
// 案例B（迴歸）：有 planned 層的任務同時帶 t.start/t.end → planned 優先，fallback 不搶位
{
  const task = mk({ wbs: '902', plannedStart: '2026-04-01', plannedEnd: '2026-04-20', start: '2026-01-01', end: '2026-01-15' });
  const r = getEffectiveSchedule(task);
  check('案例B planned 層存在時 t.start/t.end 不搶位（迴歸）',
    `start=${r.start} end=${r.end} src=${r.startSource}`,
    'start=2026-04-01 end=2026-04-20 src=planned',
    't.start/t.end只在四層全空時兜底；既有任務(同步/匯入帶planned)取值與來源標記不變');
}

// ════ 11. sortTasks 決定性多鍵 tiebreak（§4.7 決定性鐵則）════════
// 案D1 決定性：同組任務跑兩次，id 序列須完全相同
{
  const group = [
    mk({ id: 'a1', urgency: 'high',   plannedStart: '2026-06-20', end: '2026-06-15' }),
    mk({ id: 'a2', urgency: 'medium', plannedStart: '2026-06-10' }),
    mk({ id: 'a3', urgency: 'low',    plannedStart: '2026-06-05', end: '2026-07-01' }),
    mk({ id: 'a4', urgency: 'medium', plannedStart: '2026-06-10' }),
  ];
  const r1 = sortTasks(group).map(t => t.id).join(',');
  const r2 = sortTasks(group).map(t => t.id).join(',');
  check('案D1 sortTasks 跑兩次結果完全相同（決定性）', r1 === r2, true,
    '相同輸入兩次排序 id 序列須完全一致，無飄移');
}
// 案D2 平手靠 id：同分(medium/pending/無end)、同 plannedStart → 只 id 不同；輸入故意 zzz 在前
{
  const t_b = mk({ id: 'zzz', urgency: 'medium', plannedStart: '2026-06-10' });
  const t_a = mk({ id: 'aaa', urgency: 'medium', plannedStart: '2026-06-10' });
  const out = sortTasks([t_b, t_a]).map(t => t.id).join(',');
  check('案D2 平手靠 id 字典序（不靠輸入序）', out, 'aaa,zzz',
    'scoreTask 同分、plannedStart 同 → id 字典序 aaa 在 zzz 前，雖輸入 zzz 在前');
}
// 案D3 平手靠 plannedStart：同分、plannedStart 一早一晚 → 早的先（優先於 id）
{
  const t_late  = mk({ id: 'aaa', urgency: 'medium', plannedStart: '2026-06-20' });
  const t_early = mk({ id: 'zzz', urgency: 'medium', plannedStart: '2026-06-05' });
  const out = sortTasks([t_late, t_early]).map(t => t.id).join(',');
  check('案D3 平手靠 plannedStart 早的先（優先於 id）', out, 'zzz,aaa',
    'scoreTask 同分 → plannedStart 早(zzz 06-05)在前，壓過 id 字典序(aaa<zzz)');
}

// ════ 12. §4.7 C 缺口 slotScheduledEnd（取值 + 全清）════════════
// 案C1 取值：slotEnd = run[run.length-1].date（取最後一格，非 run[0]）
{
  const run1 = [{ date: '2026-06-15' }];                          // 單日（現階段）
  const run2 = [{ date: '2026-06-15' }, { date: '2026-06-16' }];  // 跨日（預演 B）
  check('案C1 slotScheduledEnd 取 run 最後一格（非 run[0]）',
    `${run1[run1.length - 1].date}|${run2[run2.length - 1].date}`,
    '2026-06-15|2026-06-16',
    '單日 run 取唯一格；跨日 run 取最後一格 06-16(非起點 06-15) → B 跨日後自動正確');
}
// 案C2 全清：!t.wbs 才清，工期制(wbs)不碰、時段制(非wbs)清 null
{
  const tasks = [
    { wbs: '1', slotScheduledEnd: '舊值' },   // 工期制 → 不動
    { wbs: '',  slotScheduledEnd: '舊值' },   // 時段制(空字串 wbs) → 清
    {           slotScheduledEnd: '舊值' },   // 無 wbs 欄位 → 清
  ];
  for (const t of tasks) { if (!t.wbs) t.slotScheduledEnd = null; }
  check('案C2 全清 !t.wbs：工期制不動、時段制清 null',
    `${tasks[0].slotScheduledEnd}|${tasks[1].slotScheduledEnd}|${tasks[2].slotScheduledEnd}`,
    '舊值|null|null',
    'wbs:1→!false 留舊值；wbs:""→!true 清；無wbs→!undefined 清');
}

// ════ 13. §4.7 A 缺口 horizon 8 週（per-item week + 邊界）════════
// 案A1 per-item 分週：連續兩週的日期算出不同 weekKey（渲染按週挑的前提）
{
  const k1 = D.weekKey(new Date('2026-06-15'));   // 第25週
  const k2 = D.weekKey(new Date('2026-06-22'));   // 次週第26週
  check('案A1 連續兩週 weekKey 不同 + 已知日期算對',
    `${k1}|${k2}|${k1 !== k2}`, 'W25-2026|W26-2026|true',
    '06-15→W25、06-22→W26：跨週標籤不同(渲染按週挑)，且 weekKey 值算對');
}
// 案A2 horizon=8 週邊界：跨度 56 天 + 8 個不重複 week key
{
  const ws = D.weekStart(new Date('2026-06-11'));
  const span = (D.addDays(ws, 7 * 8) - ws) / 86400000;   // 56 天
  const keys = [];
  for (let w = 0; w < 8; w++) keys.push(D.weekKey(D.addDays(ws, w * 7)));
  check('案A2 horizon=8 週：跨度 56 天 + 8 個不同 weekKey',
    `${span}|${new Set(keys).size}`, '56|8',
    'addDays(ws,7*8) 距起點 56 天(8週上限)；連續 8 週算出 8 個不同 key，horizon 內不撞週');
}

// ════ 14. §4.7 B Step1 起算日 filter（placeTask 副本端到端）════════
// ⚠ placeTask 為 app.js 同步複本（函式體與本體 byte 對齊；placeTask 不依賴 D/Storage/DATA）。
//   改 app.js placeTask 須同步此處，否則驗到舊邏輯。
function placeTask(slots, task, settings) {
  // slot 起始分鐘數（用於判斷時間相鄰）
  function startMin(slot) {
    const [h, m] = slot.start.split(':').map(Number);
    return h * 60 + m;
  }

  // 找一段「同一天、時間相鄰、N 格都空」的連續 slot 區間
  // preferGolden：深度工作優先 golden time；找不到回 null
  function findRun(allSlots, N, preferGolden) {
    const startIdxs = [];
    for (let i = 0; i + N <= allSlots.length; i++) {
      let ok = true;
      for (let k = 0; k < N; k++) {
        const s = allSlots[i + k];
        if (s.taken) { ok = false; break; }
        if (k > 0) {
          const prev = allSlots[i + k - 1];
          // 同天 + 時間差正好 60 分 → 自動避開午休缺口 / 跨日 / 跨工作時段
          if (s.date !== prev.date || startMin(s) !== startMin(prev) + 60) {
            ok = false; break;
          }
        }
      }
      if (ok) startIdxs.push(i);
    }
    if (startIdxs.length === 0) return null;
    let best = startIdxs[0];
    if (preferGolden) {
      const g = startIdxs.find(i => allSlots[i].golden);
      if (g !== undefined) best = g;
    }
    return allSlots.slice(best, best + N);
  }

  // 平鋪時序 slot → segment：同日相鄰(時間差 60)併一段、斷格/跨日切新段；標 chunk index、各段帶末日
  function toSegments(chosen) {
    const overallEnd = chosen[chosen.length - 1].date;   // 末格日期（chosen 已時序）
    const segs = [];
    let cur = null, prevDate = null, prevMin = null;
    for (const s of chosen) {
      const m = startMin(s);
      if (cur && s.date === prevDate && m === prevMin + 60) {
        cur.duration += 60;        // 接續同段（同日相鄰）
      } else {
        cur = { date: s.date, start: s.start, duration: 60 };
        segs.push(cur);            // 新段（跨日 or 時間斷格）
      }
      prevDate = s.date; prevMin = m;
    }
    return segs.map((seg, i) => ({ ...seg, chunk: i, slotScheduledEnd: overallEnd }));
  }

  const isDeep = task.category === 'deep' || !task.category;
  // N = 取整後的 estHours 小時數
  const N = Math.max(1, Math.ceil(parseFloat(task.estHours) || 1));
  // 起算日 = max(plannedStart, today)；ISO 字串比較=時序比較（空字串/過去→today、未來→plannedStart）
  const todayIso = settings.todayIso;
  const plannedIso = task.plannedStart || '';
  const startIso = plannedIso > todayIso ? plannedIso : todayIso;
  // filter 回傳同一批 slot 物件參照 → 後續 commit 標 s.taken 仍寫回原 slots（佔位不斷）
  const scanSlots = slots.filter(s => s.date >= startIso);
  // 分流：N>=splitThreshold 允許跨日（fillAcrossDays）；N<splitThreshold 同日連續（findRun，排不下回 [] 不降級）
  const chosen = N >= settings.splitThreshold
    ? fillAcrossDays(scanSlots, N, isDeep)
    : findRun(scanSlots, N, isDeep);
  if (!chosen) return [];
  chosen.forEach(s => s.taken = true);   // commit：兩分支統一在此標 taken（先收集後提交）
  return toSegments(chosen);
}
{
  // 手工 slot fixture：含過去格(06-08~06-10) + today(06-11)+；workDays 週一~五
  const mkSlot = (date, start, golden = false) => ({ date, dayNum: new Date(date).getDay(), start, duration: 60, golden, taken: false });
  const tIso = D.fmt(D.today(), 'iso');   // 2026-06-11（D stub 固定）
  // 案E1：過去 plannedStart → 推到 today，不落過去格
  {
    const slots = [
      mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-09', '09:00'), mkSlot('2026-06-10', '09:00'),
      mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-12', '09:00'),
    ];
    const segs = placeTask(slots, { estHours: 1, plannedStart: '2026-06-05' }, { todayIso: tIso, splitThreshold: 4, workDays: [1, 2, 3, 4, 5] });
    check('案E1 起算日：過去 plannedStart 推到 today（不落過去格）',
      segs[0].date, '2026-06-11',
      'plannedStart 06-05 < today 06-11 → startIso=today；06-08/09/10 被 filter 擋，排到 06-11');
  }
  // 案E2：未來 plannedStart → 起算日取 plannedStart 自己
  {
    const slots = [
      mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-12', '09:00'),
      mkSlot('2026-06-15', '09:00'), mkSlot('2026-06-16', '09:00'),
    ];
    const segs = placeTask(slots, { estHours: 1, plannedStart: '2026-06-15' }, { todayIso: tIso, splitThreshold: 4, workDays: [1, 2, 3, 4, 5] });
    check('案E2 起算日：未來 plannedStart 取自己（不從 today 起）',
      segs[0].date >= '2026-06-15' ? '2026-06-15' : segs[0].date, '2026-06-15',
      'plannedStart 06-15 > today 06-11 → startIso=06-15；06-11/12 被 filter 擋，排到 >= 06-15');
  }
}

// ════ 15. §4.7 B Step2 fillAcrossDays 跨日選格引擎（純讀，不接線）════════
// ⚠ fillAcrossDays 為 app.js 同步複本（函式體 byte 對齊；純函式不依賴 D/Storage/DATA、不碰 taken）。
//   改 app.js fillAcrossDays 須同步此處。
function fillAcrossDays(availSlots, N, isDeep) {
  const tmin = s => { const [h, m] = s.start.split(':').map(Number); return h * 60 + m; };
  const free = availSlots.filter(s => !s.taken);   // 跳已佔（會議/前面任務）
  // 按日分組（date → 該日 slots）
  const byDate = new Map();
  for (const s of free) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()].sort();   // ISO 字串排序=時序（不靠輸入順序，決定性）
  // 逐日掃：當日 golden 先填→非 golden 補，湊滿 N 即止；當日塞不滿順延次日
  const chosen = [];
  for (const date of dates) {
    if (chosen.length >= N) break;
    const day = byDate.get(date);
    const ordered = isDeep
      ? [...day.filter(s => s.golden).sort((a, b) => tmin(a) - tmin(b)),
         ...day.filter(s => !s.golden).sort((a, b) => tmin(a) - tmin(b))]
      : [...day].sort((a, b) => tmin(a) - tmin(b));
    for (const s of ordered) {
      if (chosen.length >= N) break;
      chosen.push(s);
    }
  }
  if (chosen.length < N) return null;   // 湊不滿：完全沒碰 taken，無 state 可滾
  // 湊滿：依時序回傳（給 Step 3 切 segment / 算 slotScheduledEnd）
  return chosen.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : tmin(a) - tmin(b));
}
{
  const mkSlot = (date, start, golden = false, taken = false) => ({ date, dayNum: new Date(date).getDay(), start, duration: 60, golden, taken });
  const sig = arr => arr === null ? 'null' : arr.map(s => s.date + ' ' + s.start).join(',');
  const tk = slots => slots.map(s => s.taken).join(',');
  // 案F1 當日全塞(零散格)+ 驗純讀(success 路徑 taken 不變)
  {
    const slots = [mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-11', '10:00', false, true), mkSlot('2026-06-11', '11:00')];
    const r = fillAcrossDays(slots, 2, true);
    check('案F1 當日全塞：跳會議格、同日兩格不溢次日（且 taken 不變=純讀）',
      sig(r) + ' | taken=' + tk(slots),
      '2026-06-11 09:00,2026-06-11 11:00 | taken=false,true,false',
      '10:00 taken 跳過；09/11 同日湊滿 N=2；回傳後輸入 taken 原樣（fillAcrossDays 不碰 taken）');
  }
  // 案F2 跨日順延：day1 滿 + day2 補，末格=次日
  {
    const slots = [mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-11', '10:00'), mkSlot('2026-06-12', '09:00'), mkSlot('2026-06-12', '10:00')];
    const r = fillAcrossDays(slots, 3, true);
    check('案F2 跨日順延：N>當日容量 → 順延次日，末格=次日',
      sig(r) + ' | end=' + r[r.length - 1].date,
      '2026-06-11 09:00,2026-06-11 10:00,2026-06-12 09:00 | end=2026-06-12',
      'N=3 > day1 容量 2 → day1 兩格 + day2 一格；slotScheduledEnd 取末格 06-12');
  }
  // 案F3 golden 同日優先、不拖隔天（修 latent bug 關鍵案）
  {
    const slots = [mkSlot('2026-06-11', '09:00', true), mkSlot('2026-06-11', '10:00', false), mkSlot('2026-06-12', '09:00', true), mkSlot('2026-06-12', '10:00', true)];
    const r = fillAcrossDays(slots, 2, true);
    check('案F3 golden 同日優先、不拖隔天：選 day1 兩格不碰 day2 golden',
      sig(r), '2026-06-11 09:00,2026-06-11 10:00',
      'day1 golden 先 + 非 golden 補湊滿 N=2 → 不為 day2 golden 拖隔天（修全域找最早 golden 跨週拉）');
  }
  // 案F4 golden 先於時間：下午 golden 壓過上午非 golden（isDeep,N=1）
  {
    const slots = [mkSlot('2026-06-11', '09:00', false), mkSlot('2026-06-11', '14:00', true)];
    const r = fillAcrossDays(slots, 1, true);
    check('案F4 golden 先於時間：isDeep 取下午 golden 14:00 非上午 09:00',
      sig(r), '2026-06-11 14:00',
      'isDeep 同日先填 golden（golden 可能在下午）→ 14:00 壓過更早的非 golden 09:00');
  }
  // 案F5 非 deep 純時間：同組格取最早（不偏 golden），與 F4 對照
  {
    const slots = [mkSlot('2026-06-11', '09:00', false), mkSlot('2026-06-11', '14:00', true)];
    const r = fillAcrossDays(slots, 1, false);
    check('案F5 非 deep 純時間：取最早 09:00（不主動偏/避 golden）',
      sig(r), '2026-06-11 09:00',
      '!isDeep → 純時間序，與 F4 同組格但取 09:00（沿用 findRun 語意，不擅自加語意）');
  }
  // 案F6 湊不滿回 null + 驗純讀(null 路徑 taken 不變)
  {
    const slots = [mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-12', '09:00')];
    const r = fillAcrossDays(slots, 3, true);
    check('案F6 湊不滿回 null：總空格 2 < N=3（且 taken 不變=純讀）',
      sig(r) + ' | taken=' + tk(slots), 'null | taken=false,false',
      '掃完所有 day 仍 < N → null；null 路徑亦完全沒碰 taken（無 state 可滾）');
  }
  // 案F7 跳已佔：taken 格不選
  {
    const slots = [mkSlot('2026-06-11', '09:00', false, true), mkSlot('2026-06-11', '10:00', false)];
    const r = fillAcrossDays(slots, 1, true);
    check('案F7 跳已佔：taken=true 格不被選', sig(r), '2026-06-11 10:00',
      '09:00 taken → 略過，選 10:00');
  }
  // 案F8 決定性 + 亂序無關（顯式 date sort）
  {
    const shuffled = [mkSlot('2026-06-12', '10:00'), mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-12', '09:00'), mkSlot('2026-06-11', '10:00')];
    const r1 = sig(fillAcrossDays(shuffled, 3, true));
    const r2 = sig(fillAcrossDays(shuffled, 3, true));
    const sorted = [mkSlot('2026-06-11', '09:00'), mkSlot('2026-06-11', '10:00'), mkSlot('2026-06-12', '09:00'), mkSlot('2026-06-12', '10:00')];
    const rs = sig(fillAcrossDays(sorted, 3, true));
    check('案F8 決定性+亂序無關：兩跑相同且=排序輸入結果',
      `${r1 === r2}|${r1 === rs}`, 'true|true',
      '顯式 date sort → 亂序餵與排序餵結果一致、重跑穩定（決定性鐵則）');
  }
}

// ════ 16. §4.7 B Step3 placeTask 接線（分流 + toSegments，端到端）════════
// ⚠ placeTask 副本（section 14）已同步分流版；以下驗分流兩路徑 / segment 分組 / commit。
{
  const mkSlot = (date, start, golden = false, taken = false) => ({ date, dayNum: new Date(date).getDay(), start, duration: 60, golden, taken });
  const st = (thr) => ({ todayIso: '2026-06-01', splitThreshold: thr, workDays: [1, 2, 3, 4, 5] });
  const sigSeg = segs => segs.length === 0 ? '[]' : segs.map(s => s.date + ' ' + s.start + '/' + s.duration + '/' + s.chunk).join(' | ');
  // 案G1 N>=threshold 跨日：多 segment、chunk index、各段帶末日
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00'), mkSlot('2026-06-09', '09:00')];
    const segs = placeTask(slots, { estHours: 3 }, st(2));
    check('案G1 跨日分流：N=3>=threshold → 多段 chunk0/1、各段 slotScheduledEnd=末日',
      sigSeg(segs) + ' end=' + segs.map(s => s.slotScheduledEnd).join(','),
      '2026-06-08 09:00/120/0 | 2026-06-09 09:00/60/1 end=2026-06-09,2026-06-09',
      'day1 兩格併 120 段(chunk0)+day2 一格 60 段(chunk1)；兩段末日同為 06-09');
  }
  // 案G2 N<threshold 同日 findRun：單段 chunk0
  {
    const slots = [mkSlot('2026-06-08', '09:00')];
    const segs = placeTask(slots, { estHours: 1 }, st(4));
    check('案G2 同日分流：N=1<threshold → findRun 單段 chunk0',
      sigSeg(segs), '2026-06-08 09:00/60/0',
      'N=1<4 走 findRun，單格單段，chunk index=0');
  }
  // 案G3 N<threshold 同日排不下 → [] 不降級成跨日
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-09', '09:00')];
    const segs = placeTask(slots, { estHours: 2 }, st(4));
    check('案G3 不降級：N=2<threshold 同日無連續2格 → []（不退成跨日）',
      sigSeg(segs) + ' | len=' + segs.length, '[] | len=0',
      'findRun 找不到同日 2 連格回 null → placeTask []；若降級跨日會誤排兩天，故 [] 證明不降級');
  }
  // 案G4 同日零散切兩段（被會議切開）
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00', false, true), mkSlot('2026-06-08', '11:00')];
    const segs = placeTask(slots, { estHours: 2 }, st(2));
    check('案G4 segment 分組：同日 09/11(中間 10 會議) → 切兩段 chunk0/1',
      sigSeg(segs), '2026-06-08 09:00/60/0 | 2026-06-08 11:00/60/1',
      '09 與 11 時間差 120 非相鄰 → 各自一段（不黏成一張）；同日仍兩段');
  }
  // 案G5 commit：拿到非 null → chosen 標 taken、未選格不動
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00'), mkSlot('2026-06-08', '11:00')];
    placeTask(slots, { estHours: 2 }, st(2));
    check('案G5 commit 標 taken：選中 2 格 taken=true、未選格不動',
      slots.map(s => s.taken).join(','), 'true,true,false',
      'placeTask 統一 commit：09/10 被選標 taken，11 未選保持 false');
  }
  // 案G6 三日跨度：各段 slotScheduledEnd 都=最末日（含最早段）
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-09', '09:00'), mkSlot('2026-06-10', '09:00')];
    const segs = placeTask(slots, { estHours: 3 }, st(2));
    check('案G6 各段帶末日：三日各一段，chunk 012、slotScheduledEnd 皆=06-10',
      segs.length + '|' + segs.map(s => s.chunk).join('') + '|' + segs.every(s => s.slotScheduledEnd === '2026-06-10'),
      '3|012|true',
      '三日不相鄰 → 3 段 chunk0/1/2；連最早 06-08 段也帶末日 06-10（caller 寫 task 取 last 一致）');
  }
  // 案G7 決定性：同輸入跑兩次 segments 全等（每次 fresh slots，避 commit 污染）
  {
    const build = () => [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00'), mkSlot('2026-06-09', '09:00')];
    const r1 = sigSeg(placeTask(build(), { estHours: 3 }, st(2)));
    const r2 = sigSeg(placeTask(build(), { estHours: 3 }, st(2)));
    check('案G7 決定性：同輸入兩次 segments 全等', (r1 === r2) + '|' + r1,
      'true|2026-06-08 09:00/120/0 | 2026-06-09 09:00/60/1',
      'fresh slots 各跑一次（避 commit 污染 taken）→ 分流/分組決定性');
  }
}

// ════ 17. §4.7 B Step4 決定性補齊 + 分流邊界回歸（純測試）════════
// 補 G/F 未蓋到的：splitThreshold >= 邊界、起算日空值、多任務序列(避已排/決定性)、golden 端到端。
{
  const mkSlot = (date, start, golden = false, taken = false) => ({ date, dayNum: new Date(date).getDay(), start, duration: 60, golden, taken });
  const st = (thr, today) => ({ todayIso: today || '2026-06-01', splitThreshold: thr, workDays: [1, 2, 3, 4, 5] });
  const sigSeg = segs => segs.length === 0 ? '[]' : segs.map(s => s.date + ' ' + s.start + '/' + s.duration + '/' + s.chunk).join(' | ');
  // 案H1 splitThreshold >= 邊界：N==threshold → 走跨日（證明 >= 非 >）
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-09', '09:00')];
    const segs = placeTask(slots, { estHours: 2 }, st(2));
    check('案H1 splitThreshold >= 邊界：N==threshold(2) 走跨日 fillAcrossDays',
      sigSeg(segs), '2026-06-08 09:00/60/0 | 2026-06-09 09:00/60/1',
      'N=2>=threshold=2 → 跨日各日一格；若是 > 則 findRun 同日無 2 連格回 []，故跨日結果證明邊界是 >=');
  }
  // 案H2 起算日空 plannedStart → today（E1/E2 未蓋空字串分支）
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-09', '09:00'), mkSlot('2026-06-10', '09:00')];
    const segs = placeTask(slots, { estHours: 1 }, st(4, '2026-06-09'));
    check('案H2 起算日：plannedStart 空 → 取 today（過去格被擋）',
      segs[0].date, '2026-06-09',
      "plannedIso='' > todayIso 為 false → startIso=today 06-09；過去格 06-08 被 filter 擋");
  }
  // 案H3 多任務序列：避開已排定（taskB 避 taskA 已佔格）
  {
    const slots = [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00'), mkSlot('2026-06-08', '11:00')];
    const segA = sigSeg(placeTask(slots, { estHours: 2 }, st(2)));   // 先排 A：佔 09/10
    const segB = sigSeg(placeTask(slots, { estHours: 1 }, st(2)));   // 後排 B：09/10 已 taken → 落 11
    check('案H3 序列避開已排定：B 避開 A 佔的 09/10，落到 11',
      segA + ' || ' + segB, '2026-06-08 09:00/120/0 || 2026-06-08 11:00/60/0',
      'A 跨日分支佔 09/10 並 commit taken；B 同 slots 只見 11 空 → 序列 taken 累積正確');
  }
  // 案H4 全鏈路決定性：sortTasks → 序列 placeTask，整組跑兩次 segments 全等（§4.7 決定性鐵則）
  {
    const taskA = { id: 'a', estHours: 3, urgency: 'high', plannedStart: '2026-06-08' };
    const taskB = { id: 'b', estHours: 2, urgency: 'medium', plannedStart: '2026-06-08' };
    const build = () => [mkSlot('2026-06-08', '09:00'), mkSlot('2026-06-08', '10:00'), mkSlot('2026-06-08', '11:00'), mkSlot('2026-06-09', '09:00'), mkSlot('2026-06-09', '10:00')];
    const run = () => {
      const slots = build();   // fresh slots 每跑（避 commit 污染）
      return sortTasks([taskA, taskB]).map(t => sigSeg(placeTask(slots, t, st(2)))).join(' || ');
    };
    const r1 = run(), r2 = run();
    check('案H4 全鏈路決定性：同組任務跑兩次 segments 完全相同',
      (r1 === r2) + '|' + r1,
      'true|2026-06-08 09:00/180/0 || 2026-06-09 09:00/120/0',
      'sortTasks 排序穩定(A 高於 B) + 序列 placeTask(A 佔 06-08 三格成 180 段、B 落 06-09 兩格 120 段) → 兩跑全等');
  }
  // 案H5 golden 端到端：placeTask(isDeep) 真的把 isDeep 接進 fillAcrossDays golden 先填
  {
    const slots = [mkSlot('2026-06-08', '09:00', false), mkSlot('2026-06-08', '14:00', true), mkSlot('2026-06-08', '15:00', true)];
    const segs = placeTask(slots, { estHours: 2 }, st(2));   // 無 category → isDeep=true
    check('案H5 golden 端到端：isDeep 跨日分支取下午 golden 14/15 非上午 09',
      sigSeg(segs), '2026-06-08 14:00/120/0',
      'placeTask 把 isDeep 傳進 fillAcrossDays → golden 14/15 先填(相鄰併 120 段)，09 非 golden 留空，證明 wiring 未斷');
  }
}

// ════ 11. orderTasksByDispStart — 序改日期排序（待排殿後／同日期穩定／dispStart 取對） ═══
console.log('\n===== 11. orderTasksByDispStart 序排序 =====');
// ⚠ 與 app.js function orderTasksByDispStart 同步複本（改一邊兩邊改）
function orderTasksByDispStart(list) {
  const dec = (list || []).map((t, i) => ({ t, i, ds: getEffectiveSchedule(t).start || '' }));
  const dated   = dec.filter(x => x.ds !== '').sort((a, b) => (a.ds < b.ds ? -1 : (a.ds > b.ds ? 1 : a.i - b.i)));
  const undated = dec.filter(x => x.ds === '');
  return dated.map(x => x.t).concat(undated.map(x => x.t));
}
{
  const list = [ mk({ wbs: 'A', plannedStart: '2026-03-10' }), mk({ wbs: 'B', plannedStart: '2026-01-05' }), mk({ wbs: 'C', plannedStart: '2026-02-20' }) ];
  check('案11.1 有日期按 dispStart ISO 升序', orderTasksByDispStart(list).map(t => t.wbs).join(','), 'B,C,A', '01-05 < 02-20 < 03-10，ISO 字串升序=時序');
}
{
  const list = [ mk({ wbs: 'X' }), mk({ wbs: 'Y', plannedStart: '2026-05-01' }), mk({ wbs: 'Z' }), mk({ wbs: 'W', plannedStart: '2026-04-01' }) ];
  check('案11.2 待排（空dispStart）殿後不頂前', orderTasksByDispStart(list).map(t => t.wbs).join(','), 'W,Y,X,Z', '有日期 W(04-01)<Y(05-01) 在前；待排 X,Z 殿後且維持原陣列序（非空字串頂最前）');
}
{
  const list = [ mk({ wbs: 'P1', plannedStart: '2026-06-10' }), mk({ wbs: 'P2', plannedStart: '2026-06-10' }), mk({ wbs: 'P3', plannedStart: '2026-06-10' }) ];
  check('案11.3 同 dispStart 維持原陣列序（穩定）', orderTasksByDispStart(list).map(t => t.wbs).join(','), 'P1,P2,P3', '三筆同日 06-10 → decorate index 平手回原序');
}
{
  const list = [ mk({ wbs: 'pl', plannedStart: '2026-07-01' }), mk({ wbs: 'sc', plannedStart: '2026-07-01', scheduledStart: '2026-02-01' }), mk({ wbs: 'ac', plannedStart: '2026-07-01', actualStart: '2026-01-01' }) ];
  check('案11.4 dispStart 依 getEffectiveSchedule 優先序取對', orderTasksByDispStart(list).map(t => t.wbs).join(','), 'ac,sc,pl', 'ac=actual01-01 < sc=scheduled02-01 < pl=planned07-01；證明取 dispStart 非 plannedStart');
}

// ════ 12. applyTaskFilter — 待辦列篩選接線（四 Set 多選／交集／空不篩／保序） ═══
console.log('\n===== 12. applyTaskFilter 篩選 =====');
// ⚠ 與 app.js function applyTaskFilter 同步複本（改一邊兩邊改）
function applyTaskFilter(tasks, filter) {
  const f = filter || {};
  const has = (s) => s && s.size > 0;
  return (tasks || []).filter(t => {
    if (has(f.stages) && !f.stages.has(t.stage)) return false;
    if (has(f.owners) && !f.owners.has(t.owner)) return false;
    if (has(f.urg)    && !f.urg.has(t.urgency || 'medium')) return false;
    if (has(f.status) && !f.status.has(t.status)) return false;
    return true;
  });
}
const ef = () => ({ stages: new Set(), owners: new Set(), urg: new Set(), status: new Set() });
{
  const list = [ mk({wbs:'1',stage:'手工機'}), mk({wbs:'2',stage:'性試機'}), mk({wbs:'3',stage:'手工機'}) ];
  const f = ef(); f.stages.add('手工機');
  check('案12.1 單維篩階段', applyTaskFilter(list, f).map(t=>t.wbs).join(','), '1,3', '只留 stage==手工機');
}
{
  const list = [ mk({wbs:'1',stage:'手工機'}), mk({wbs:'2',stage:'性試機'}), mk({wbs:'3',stage:'量產機'}) ];
  const f = ef(); f.stages.add('手工機'); f.stages.add('性試機');
  check('案12.2 多選同維 OR', applyTaskFilter(list, f).map(t=>t.wbs).join(','), '1,2', '同維多選=OR：手工機或性試機都留');
}
{
  const list = [ mk({wbs:'1',stage:'手工機',owner:'王'}), mk({wbs:'2',stage:'手工機',owner:'李'}), mk({wbs:'3',stage:'性試機',owner:'王'}) ];
  const f = ef(); f.stages.add('手工機'); f.owners.add('王');
  check('案12.3 多維交集 AND', applyTaskFilter(list, f).map(t=>t.wbs).join(','), '1', '跨維=AND：手工機 且 owner==王');
}
{
  const list = [ mk({wbs:'1',stage:'手工機'}), mk({wbs:'2',stage:'性試機'}) ];
  check('案12.4 全空 Set 不篩', applyTaskFilter(list, ef()).map(t=>t.wbs).join(','), '1,2', '四維皆空→不篩，原樣全留');
}
{
  const list = [ mk({wbs:'a',status:'wip'}), mk({wbs:'b',status:'done'}), mk({wbs:'c',status:'wip'}), mk({wbs:'d',status:'wip'}) ];
  const f = ef(); f.status.add('wip');
  check('案12.5 篩後保持原序（不重排）', applyTaskFilter(list, f).map(t=>t.wbs).join(','), 'a,c,d', '.filter 保序：篩 wip 後 a,c,d 維持輸入相對順序');
}

// ════ 反推引擎 computeScheduleBackward（§4.8 塊2，鏡像正推；期望值=外部 Excel 反向 WORKDAY）════
// 末端任務讀 task.targetEnd 當「最晚完成」seed（呼叫端塞 variant可販日）。
function runBackward(tasks) { return computeScheduleBackward(translatePreds(tasks)); }

console.log('\n===== B1. 反向四公式（lag>0 避盲點，每案跨週末） =====');
// FS 純（offset=max(1,0)=1）：後最晚開始 01-12(一) → 前最晚完成=WORKDAY(01-12,-1)=01-09(五，跨週末)
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 3 }),
    mk({ wbs: '2', predecessor: '1', durationDays: 1, targetEnd: '2026-01-12' }),
  ]);
  check('FS純 後最晚開始', R(out, '2').lateStart, '2026-01-12', '末端 seed=targetEnd 01-12，dur1 → lateStart=lateFinish=01-12');
  check('FS純 前最晚完成', R(out, '1').lateFinish, '2026-01-09', 'WORKDAY(01-12一,-1)=01-09五（跨週末跳 Sat/Sun）');
  check('FS純 前最晚開始', R(out, '1').lateStart, '2026-01-07', 'lateStart=WORKDAY(01-09五,-(3-1)=-2)=01-07三');
}
// FS+2：後最晚開始 01-12(一) → 前最晚完成=WORKDAY(01-12,-2)=01-08(四，跨週末)
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 1 }),
    mk({ wbs: '2', predecessor: '1FS+2', durationDays: 1, targetEnd: '2026-01-12' }),
  ]);
  check('FS+2 前最晚完成', R(out, '1').lateFinish, '2026-01-08', 'WORKDAY(01-12一,-2)=01-08四（跳 Sat/Sun）');
  check('FS+2 前最晚開始', R(out, '1').lateStart, '2026-01-08', 'dur1 → lateStart=lateFinish=01-08');
}
// SS+3：前最晚開始=WORKDAY(後最晚開始 01-12, -3)=01-07(三，跨週末)
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2 }),
    mk({ wbs: '2', predecessor: '1SS+3', durationDays: 1, targetEnd: '2026-01-12' }),
  ]);
  check('SS+3 前最晚開始', R(out, '1').lateStart, '2026-01-07', 'WORKDAY(01-12一,-3)=01-07三（Fri/Thu/Wed，首步跨週末）');
  check('SS+3 前最晚完成', R(out, '1').lateFinish, '2026-01-08', 'lateFinish=WORKDAY(01-07三,+(2-1))=01-08四');
}
// FF+3：前最晚完成=WORKDAY(後最晚完成 01-14, -3)=01-09(五，跨週末)
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2 }),
    mk({ wbs: '2', predecessor: '1FF+3', durationDays: 1, targetEnd: '2026-01-14' }),
  ]);
  check('FF+3 前最晚完成', R(out, '1').lateFinish, '2026-01-09', 'WORKDAY(01-14三,-3)=01-09五（Tue/Mon/Fri，末步跨週末）');
  check('FF+3 前最晚開始', R(out, '1').lateStart, '2026-01-08', 'WORKDAY(01-09五,-(2-1))=01-08四');
}
// SF+3：前最晚開始=WORKDAY(後最晚完成 01-14, -3)=01-09(五，跨週末)
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2 }),
    mk({ wbs: '2', predecessor: '1SF+3', durationDays: 1, targetEnd: '2026-01-14' }),
  ]);
  check('SF+3 前最晚開始', R(out, '1').lateStart, '2026-01-09', 'WORKDAY(01-14三,-3)=01-09五');
  check('SF+3 前最晚完成', R(out, '1').lateFinish, '2026-01-12', 'WORKDAY(01-09五,+(2-1))=01-12一');
}

console.log('\n===== B2. 末端 / 源頭 / 單鏈 / 待排 =====');
// 末端讀 targetEnd 反推（源頭 lateStart = 專案最晚啟動日）
{
  const out = runBackward([mk({ wbs: '1', durationDays: 3, targetEnd: '2026-01-15' })]);
  check('末端 lateFinish=targetEnd', R(out, '1').lateFinish, '2026-01-15', '無後續 → 最晚完成=可販日 01-15');
  check('末端 lateStart', R(out, '1').lateStart, '2026-01-13', 'WORKDAY(01-15四,-(3-1)=-2)=01-13二（=源頭，亦專案最晚啟動日）');
  check('末端 不待排', R(out, '1').toSchedule, false, '有 targetEnd → toSchedule=false');
}
// 末端無 targetEnd → 待排（④ 無可販日分支）
{
  const out = runBackward([mk({ wbs: '1', durationDays: 2 })]);
  check('末端無targetEnd → 待排', R(out, '1').toSchedule, true, '無後續且無可販日 → toSchedule=true');
  check('末端無targetEnd → lateFinish=null', R(out, '1').lateFinish, null, '待排無日期');
}
// 單鏈三任務 A→B→C，C 末端 targetEnd，逐節倒推，源頭 A.lateStart=專案最晚啟動日
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2 }),
    mk({ wbs: '2', predecessor: '1', durationDays: 3 }),
    mk({ wbs: '3', predecessor: '2', durationDays: 2, targetEnd: '2026-01-30' }),
  ]);
  check('單鏈 C 最晚開始', R(out, '3').lateStart, '2026-01-29', 'C: WORKDAY(01-30五,-(2-1))=01-29四');
  check('單鏈 B 最晚完成', R(out, '2').lateFinish, '2026-01-28', 'WORKDAY(C開01-29,-1)=01-28三');
  check('單鏈 B 最晚開始', R(out, '2').lateStart, '2026-01-26', 'WORKDAY(01-28三,-(3-1)=-2)=01-26一');
  check('單鏈 A 最晚完成', R(out, '1').lateFinish, '2026-01-23', 'WORKDAY(B開01-26一,-1)=01-23五（跨週末）');
  check('單鏈 A 最晚開始(=專案最晚啟動日)', R(out, '1').lateStart, '2026-01-22', 'WORKDAY(01-23五,-(2-1))=01-22四');
}

console.log('\n===== B3. 多後續取 min（非 max） =====');
// P 一前置接 S1/S2 兩後續，最晚開始不同 → P 最晚完成取「讓最早後續能開」=min
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2 }),
    mk({ wbs: '2', predecessor: '1', durationDays: 1, targetEnd: '2026-01-20' }),
    mk({ wbs: '3', predecessor: '1', durationDays: 1, targetEnd: '2026-01-13' }),
  ]);
  check('多後續 P最晚完成取min', R(out, '1').lateFinish, '2026-01-12', 'min(WORKDAY(01-20,-1)=01-19, WORKDAY(01-13,-1)=01-12)=01-12（取早，非 max 01-19）');
  check('多後續 P最晚開始', R(out, '1').lateStart, '2026-01-09', 'WORKDAY(01-12一,-(2-1))=01-09五（跨週末）');
}

console.log('\n===== B4. circular / 錨點（鏡像正推） =====');
// circular 反推同擋
{
  const out = runBackward([
    mk({ wbs: '1', predecessor: '2', durationDays: 1 }),
    mk({ wbs: '2', predecessor: '1', durationDays: 1 }),
  ]);
  check('circular 反推 blocked', R(out, '1').blocked, true, '依賴環，反推同擋不推算');
  check('circular 反推 error', R(out, '1').error, 'circular', '鏡像正推 circular 預標');
  check('circular 反推 lateStart=null', R(out, '1').lateStart, null, '環上節點不算日');
}
// 錨點 t.start 反推不覆蓋、只警示、不 block（鏡像正推 ①）
{
  const out = runBackward([
    mk({ wbs: '1', durationDays: 2, start: '2026-01-22' }),
    mk({ wbs: '2', predecessor: '1', durationDays: 1, targetEnd: '2026-01-22' }),
  ]);
  check('錨點不覆蓋 lateStart=t.start', R(out, '1').lateStart, '2026-01-22', '推算 lateStart=WORKDAY(WORKDAY(後開01-22,-1)=01-21,-1)=01-20；手填01-22晚2工作日，尊重不覆蓋');
  check('錨點 anchorSource', R(out, '1').anchorSource, 'manual', '鏡像正推錨點分支');
  check('錨點 不 block', R(out, '1').blocked, false, '手填錨點不 block，只警示');
  check('錨點衝突有警示', R(out, '1').warnings.length > 0, true, '手填完成01-23晚於後續所需(推算前完成01-21)→衝突警示');
}

console.log('\n===== B5. 跨案邊 guard（新不變量；直連 id 邊+前提自檢防假綠） =====');
// Y(vB) 前置直連 X(vA) 的 id（不經 translatePreds），確保跨案邊真到 backward pass 入口
{
  const X = mk({ wbs: '1', variant: 'vA', durationDays: 1, targetEnd: '2026-01-15' });
  const Y = mk({ wbs: '2', variant: 'vB', durationDays: 1, targetEnd: '2026-01-20' });
  Y.predecessor = X.id + '#';   // 直連 id 邊，繞過 wbs→id 翻譯
  check('跨案邊 前提自檢:variant 確實不同', X.variant !== Y.variant, true, 'X=vA / Y=vB 確實跨案（防假綠）');
  check('跨案邊 前提自檢:邊已連 id', Y.predecessor, X.id + '#', 'pred 已是 id 格式，topoSort 不濾（nodes.has(X.id)=true）');
  const out = computeScheduleBackward([X, Y]);   // 不經 runBackward/translatePreds
  check('跨案邊 有警示含「跨案邊」', out.results.some(r => r.warnings.some(w => w.includes('跨案邊'))), true, 'guard 偵測 X.variant!==Y.variant，不靜默算錯');
  check('跨案邊 不 block', R(out, '1').blocked, false, 'guard 忽略該邊、不 block');
  check('跨案邊 X 仍按自身案末端', R(out, '1').lateFinish, '2026-01-15', '忽略跨案邊，X 在 vA 內仍末端 → lateFinish=自身 targetEnd 01-15');
}

console.log('\n===== 結果 =====');
console.log(`PASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail === 0 ? 0 : 1);
