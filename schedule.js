// schedule.js — 排程引擎(computeSchedule/Backward/applySchedule/placeTask/fillAcrossDays/generateSchedule)。app.js 之後載入；口徑 helper 與 getEffectiveSchedule 留 core。docs §18.7.1。
// 步驟4 第二段：排程本體（中間版，純計算，不寫回 task）
// 依拓撲順序逐個算「建議 start/end + 警示」，blocked 沿鏈污染傳遞。
// 日期推算（lag 一律用工作日 D.addWorkdays）：
//   FS impliedStart = addWorkdays(前置 end,   1 + lag)   // 次一工作日起算，再 +lag
//   SS impliedStart = addWorkdays(前置 start, lag)
//   FF impliedEnd   = addWorkdays(前置 end,   lag) → start = addWorkdays(end, -(dur-1))
//   SF impliedEnd   = addWorkdays(前置 start, lag) → start = addWorkdays(end, -(dur-1))
//   多前置：各自換算成 impliedStart，取最晚（max）。
//   end = addWorkdays(start, dur - 1)；dur = durationDays（至少 1）。
// 優先序：①手填 start（尊重不覆蓋，算 end + isTaskBlocked 警示，不 block）
//        ②無手填但前置污染（circular / 已 blocked / 待排 / 無日期）→ 本 task 也 blocked，不推算
//        ③無手填、前置正常 → 依關係推算
//        ④無手填、無前置 → 標 toSchedule（待排）
// @return { results:[{wbs,taskId,name,suggestedStart,suggestedEnd,blocked,error,toSchedule,blockedCause,warnings}],
//           circular:[id], hasCircular }
// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function computeSchedule(tasks) {
  const { order, circular, nodes } = topoSortTasks(tasks);
  const byId = new Map();   // id -> result（供連鎖污染查前置；前置 id 化後 key=task.id）
  const results = [];

  const iso = (d) => D.fmt(d, 'iso');
  const durOf = (t) => Math.max(1, parseFloat(t.durationDays) || 1);
  const ident = (t) => ({ wbs: (t.wbs === undefined || t.wbs === null) ? '' : t.wbs, taskId: t.id, name: t.name || '' });

  // 1. 先標 circular 節點（讓下游污染查得到）
  for (const id of circular) {
    const t = nodes.get(id);
    byId.set(id, { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: true, error: 'circular', toSchedule: false, blockedCause: 'circular',
      warnings: ['循環依賴：此任務在依賴環上，無法排程'] });
  }

  function processTask(t) {
    const fullPreds = parsePredecessors(t.predecessor);
    const preds = fullPreds.filter(p => nodes.has(p.dep));
    const missingWarn = fullPreds.filter(p => !nodes.has(p.dep))
      .map(p => `前置 #${p.dep} 不存在`);
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

    // ② 連鎖污染：前置 circular / 已 blocked / 待排 / 無日期 → 本 task 也 blocked
    const pollutedWarn = [];
    let pollutedCause = null;
    for (const p of preds) {
      const pr = byId.get(p.dep);
      if (!pr) continue;
      if (pr.error === 'circular' || pr.blockedCause === 'circular') {
        pollutedWarn.push(`前置 #${p.dep} 無法排程（上游循環）`);
        pollutedCause = 'circular';
      } else if (pr.blocked || pr.toSchedule || !pr.suggestedStart) {
        pollutedWarn.push(`前置 #${p.dep} 尚未排程（上游待排）`);
        if (!pollutedCause) pollutedCause = 'unscheduled';
      }
    }
    if (pollutedWarn.length) {
      return { ...ident(t), suggestedStart: null, suggestedEnd: null,
        blocked: true, error: null, toSchedule: false, blockedCause: pollutedCause,
        warnings: pollutedWarn.concat(missingWarn) };
    }

    // ③ 無 start、前置正常：依關係換算 impliedStart，取最晚
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
        else s = D.addWorkdays(pe, Math.max(1, p.lag));   // FS：Excel WORKDAY(end,1)=純FS、WORKDAY(end,N)=FS+N；lag 即總工作日位移(下限1)，非 1+lag
        if (latest === null || s > latest) latest = s;
      }
      return { ...ident(t), suggestedStart: iso(latest), suggestedEnd: iso(D.addWorkdays(latest, dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }

    // ④ 無前置：有起算來源(plannedStart) → 從它起算(起算來源，非錨點，仍參與連動)；無起算來源才待排
    const src = t.start || t.plannedStart;
    if (src) {
      return { ...ident(t), suggestedStart: src, suggestedEnd: iso(D.addWorkdays(new Date(src), dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }
    return { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: false, error: null, toSchedule: true, blockedCause: null,
      warnings: ['待排：無前置且未填開始日'].concat(missingWarn) };
  }

  // 2. 圖內節點按拓撲順序處理
  for (const id of order) byId.set(id, processTask(nodes.get(id)));

  // 3. 整理輸出：order → circular → 非圖內任務（無 wbs，例如手填任務）
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


// ═══ applySchedule：把 computeSchedule 算出的建議落地到 task.scheduledStart/End ═══
// scope: 'full' = 整鏈套用（丙，目前唯一模式；乙/甲未來加）
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

// ─── SMART SCHEDULE GENERATOR ──────────────────────────

// 純函式：把單一任務放進 slots，回傳 segments[]（標 taken 為放置副作用，不寫 task）
// 分流：N>=splitThreshold 跨日(fillAcrossDays)、N<splitThreshold 同日(findRun 不降級)；toSegments 切段標 chunk；commit 標 taken
// 排不下回傳 []（呼叫端重算 N 警示）；slotScheduledEnd 由呼叫端寫回 task
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

// 純函式（純讀，不碰 taken）：跨日逐日掃，挑出 N 格（時序排好）給呼叫端切 segment；湊不滿回 null
// 逐日順延：日期顯式排序由早到晚；當日 isDeep 先 golden(時間序) 再非 golden(時間序)、非 deep 純時間序
// 當日塞滿才換次日（不為 golden 拖隔天）；標 taken 由呼叫端 commit（先收集後提交，此處零副作用）
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

function generateSchedule() {
  const { dailyHours, workStart1, workEnd1, workStart2, workEnd2, goldenTime, workDays, splitThreshold } = DATA.settings;
  const monday = D.weekStart();
  const weekKey = D.weekKey(D.weekStart());
  const HORIZON_WEEKS = 8;   // 多週順延上限：本週起往後 8 週（§4.7 缺口②）

  // Build available slots for each work day（horizon 8 週：外層逐週、內層逐工作日）
  const slots = [];
  for (let w = 0; w < HORIZON_WEEKS; w++) {
  const weekMonday = D.addDays(monday, w * 7);
  for (const dayNum of workDays) {
    const date = new Date(weekMonday);
    date.setDate(weekMonday.getDate() + (dayNum - 1));
    const dateIso = D.fmt(date, 'iso');

    // Work periods
    const periods = [
      { start: workStart1, end: workEnd1, golden: goldenTime === 'morning' },
      { start: workStart2, end: workEnd2, golden: goldenTime === 'afternoon' },
    ];

    for (const p of periods) {
      const [sh, sm] = p.start.split(':').map(Number);
      const [eh, em] = p.end.split(':').map(Number);
      let cur = sh * 60 + sm;
      const end = eh * 60 + em;
      while (cur < end) {
        slots.push({
          date: dateIso,
          dayNum,
          start: `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`,
          duration: 60,
          golden: p.golden,
          taken: false,
        });
        cur += 60;
      }
    }
  }
  }  // end horizon week loop

  // Helper: check if slot overlaps meeting time range
  function overlapsMeeting(slot, startTime, endTime) {
    const [sh, sm] = slot.start.split(':').map(Number);
    const slotStart = sh * 60 + sm;
    const slotEnd = slotStart + 60;
    const [msh, msm] = startTime.split(':').map(Number);
    const [meh, mem] = endTime.split(':').map(Number);
    const mStart = msh * 60 + msm;
    const mEnd = meh * 60 + mem;
    return slotStart < mEnd && slotEnd > mStart;
  }

  // Mark meeting slots taken (legacy DATA.meetings)
  for (const meeting of DATA.meetings) {
    if (!meeting.date) continue;
    for (const slot of slots) {
      if (slot.date !== meeting.date) continue;
      const [sh] = slot.start.split(':').map(Number);
      const [mh] = (meeting.startTime || '00:00').split(':').map(Number);
      if (Math.abs(sh - mh) <= 1) slot.taken = true;
    }
  }

  // Mark RECURRING meeting slots taken (settings.recurringMeetings)
  // 支援 daily / weekly / biweekly / triweekly + startDate/endDate
  const recurring = (DATA.settings.recurringMeetings || []).filter(m => m.enabled !== false);
  for (const m of recurring) {
    for (const slot of slots) {
      if (!eventOccursOnDate(m, slot.date)) continue;
      if (overlapsMeeting(slot, m.start, m.end)) slot.taken = true;
    }
  }

  // Mark SPECIAL date meetings slots taken (settings.specialMeetings)
  const special = (DATA.settings.specialMeetings || []);
  for (const m of special) {
    if (!m.date) continue;
    for (const slot of slots) {
      if (slot.date !== m.date) continue;
      if (overlapsMeeting(slot, m.start, m.end)) slot.taken = true;
    }
  }

  // Get tasks that need scheduling for THIS WEEK (4 個條件都納入，包含同步任務)
  //   1. 預計開始日 ≤ 本週五
  //   2. 預計完成日 ≥ 本週一
  //   3. 已逾期（end < today 且未 done）
  //   4. 預計完成日 ≤ 兩週內
  const friday = D.addDays(monday, 4);
  const sunday = D.addDays(monday, 6);
  const todayDate = D.today();
  const twoWeeksLater = D.addDays(todayDate, 14);

  const candidates = DATA.tasks
    .filter(t => !t._deleted)
    .filter(t => t.status !== 'hold')
    .filter(t => !t.wbs)  // 甲：視圖一只收時段制（無 WBS 編號）任務；工期制（WBS，含 Excel 匯入 synced:false 那批）走視圖二
    .filter(t => {
      // 已完成任務：本週才完成的也顯示（不重新排程，但要在時程表顯示）
      if (t.status === 'done') {
        const completedDate = t.actualEnd ? new Date(t.actualEnd) : (t.completedAt ? new Date(t.completedAt) : null);
        if (completedDate && completedDate >= monday && completedDate <= sunday) {
          return true; // 本週完成 → 顯示
        }
        return false;
      }
      // 第8項 B：勾選「排入行事曆」強制上排（聯集，繞過日期窗/緊急度；done 後判斷故完成任務仍走上方規則）
      if (t.scheduleToCalendar === true) return true;
      // 【需求 A】預計開始日落在本週之後、且未被釘選 → 不自動進本週（plannedStart 空值不受影響）
      const pinned = (DATA.settings.pinnedWeekTaskIds || []).includes(t.id);
      if (!pinned && t.plannedStart && new Date(t.plannedStart) > sunday) {
        return false;
      }
      // 未完成的任務沿用原有 4 個條件
      const sch = getEffectiveSchedule(t);
      if (!sch.start && !sch.end) {
        return t.urgency === 'high';
      }
      const ts = sch.start ? new Date(sch.start) : null;
      const te = sch.end   ? new Date(sch.end)   : null;

      if (ts && te && te >= monday && ts <= sunday) return true;
      if (te && te < todayDate) return true;
      if (te && te <= twoWeeksLater && te >= monday) return true;

      return false;
    });

  const sorted = sortTasks(candidates);

  // 全清重排：清掉所有時段制任務(非wbs)上輪殘留的 slotScheduledEnd
  // 涵蓋「上輪排到、這輪掉出 candidates」者；工期制(wbs)走 scheduledEnd 不碰
  for (const t of DATA.tasks) {
    if (!t.wbs) t.slotScheduledEnd = null;
  }

  // Schedule items（全清：每次乾淨重排，不保留 locked 殘留）
  const items = [];

  // 起算日基準：今天（迴圈不變量，算一次）
  const todayIso = D.fmt(D.today(), 'iso');

  for (const task of sorted) {
    const totalHours = parseFloat(task.estHours) || 1;
    const isDone = task.status === 'done';

    // 已完成任務：只排 1 段，固定排在實際完成日的第一個空 slot
    if (isDone) {
      const doneDate = task.actualEnd || (task.completedAt ? task.completedAt.slice(0, 10) : null);
      if (!doneDate) continue;
      const doneSlot = slots.find(s => s.date === doneDate && !s.taken);
      if (doneSlot) {
        doneSlot.taken = true;
        items.push({
          taskId: task.id,
          date: doneSlot.date,
          start: doneSlot.start,
          duration: 60,
          chunk: null,
          totalHours,
          week: D.weekKey(new Date(doneSlot.date)),   // item 帶所在週標籤（horizon 8 週，渲染按週挑）
          locked: false,
          completed: true, // 標記為已完成顯示
        });
      }
      continue;
    }

    // 1a：放置抽純函式 placeTask（階段一行為不變，單 segment）
    const segments = placeTask(slots, task, { ...DATA.settings, todayIso });
    if (segments.length === 0) {
      const N = Math.max(1, Math.ceil(parseFloat(task.estHours) || 1));
      console.warn(`[generateSchedule] 任務「${task.name}」需 ${N}h 連續空檔，8 週內排不下，略過`);
      continue;
    }
    task.slotScheduledEnd = segments[segments.length - 1].slotScheduledEnd;  // 寫回 task，查詢用
    for (const seg of segments) {
      items.push({
        taskId: task.id,
        date: seg.date,
        start: seg.start,
        duration: seg.duration,
        chunk: seg.chunk,
        totalHours: totalHours,
        week: D.weekKey(new Date(seg.date)),     // item 帶所在週標籤（horizon 8 週，渲染按週挑）
        locked: false,
        slotScheduledEnd: seg.slotScheduledEnd,  // item，渲染用
      });
    }
  }
  DATA.schedule = { week: weekKey, items, generatedAt: new Date().toISOString() };
  Storage.save();
  return { taskCount: candidates.length, scheduledCount: items.length, lockedCount: 0 };
}
