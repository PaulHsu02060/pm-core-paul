// portfolio.js — 全專案總覽（Portfolio.*）。app.js 之後載入；TDZ 鐵則見 docs §18.7.1。
// ═══════════════════════════════════════════════════════
//  PAGE: DASHBOARD
// ═══════════════════════════════════════════════════════
Portfolio.buildTabsHtml = function() {
  const v = App.currentView;
  return `
    <div class="tabs">
      <button class="tab-btn ${v === 'overview' ? 'active' : ''}" onclick="Portfolio.switchTab('overview')">總覽</button>
      <button class="tab-btn ${v === 'gantt' ? 'active' : ''}" onclick="Portfolio.switchTab('gantt')">跨專案時程</button>
      <button class="tab-btn ${v === 'month' ? 'active' : ''}" onclick="Portfolio.switchTab('month')">歷史月曆</button>
    </div>`;
};

Portfolio.render = function() {
  document.getElementById('page-portfolio').innerHTML =
    `<div class="view-tabs-bar">${this.buildTabsHtml()}</div><div id="portfolio-body"></div>`;
  this.renderBody();
};

Portfolio.switchTab = function(view) {
  App.currentView = view;
  if (view === 'gantt') { App.ganttProjectFilter = new Set(DATA.projects.map(p => p.id)); App.ganttStageFilter = null; App.ganttOwnerFilter = null; }
  document.getElementById('page-portfolio').innerHTML =
    `<div class="view-tabs-bar">${this.buildTabsHtml()}</div><div id="portfolio-body"></div>`;
  this.renderBody();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

Portfolio.renderBody = function() {
  const v = App.currentView;
  if (v === 'gantt') return App.renderGantt('portfolio-body');
  if (v === 'month') return App.renderMonth('portfolio-body');
  this.renderOverview('portfolio-body');
};

// ═══ Phase 1 總覽算法 helper（§18.8，純資料層，不碰 DOM/Storage）═══
Portfolio._live = function() { return (DATA.tasks || []).filter(t => !t._deleted); };

// 逾期口徑（與 §4.6/KPI 一致）：未完成/未擱置且有效完成日 < 今天
Portfolio._overdue = function(t, today) {
  return isTaskDelayed(t, today);   // 逾期口徑單一來源（§4.6：未完成/未擱置 + 有效迄日<今天）
};

// A 健康度：紅=有逾期／黃=14 工作天內到期未逾期／綠=其餘
Portfolio.projectHealth = function(projId, today) {
  const ts = this._live().filter(t => t.project === projId && t.status !== 'done');
  if (ts.some(t => this._overdue(t, today))) return 'red';
  const todayIso = D.fmt(today, 'iso');
  const soon = ts.some(t => {
    const end = getEffectiveSchedule(t).end;
    if (!end) return false;
    const wd = D.workdaysBetween(todayIso, end) - 1;   // 含頭尾 -1
    return wd >= 0 && wd <= 14;
  });
  return soon ? 'yellow' : 'green';
};

Portfolio.healthCounts = function() {
  const today = D.today();
  const c = { green: 0, yellow: 0, red: 0 };
  (DATA.projects || []).forEach(p => { c[this.projectHealth(p.id, today)]++; });
  return c;
};

// B 總進度：全任務 taskDisplayProgress 簡單平均
Portfolio.totalProgress = function() {
  const ts = this._live();
  if (!ts.length) return null;
  return Math.round(ts.reduce((s, t) => s + taskDisplayProgress(t), 0) / ts.length);
};

// 核心延誤：跨專案逾期任務（逾期工作日多者在前）
Portfolio.overdueTasks = function() {
  const today = D.today(), todayIso = D.fmt(today, 'iso');
  return this._live().filter(t => this._overdue(t, today))
    .map(t => ({ t, days: Math.max(0, D.workdaysBetween(getEffectiveSchedule(t).end, todayIso) - 1) }))
    .sort((a, b) => b.days - a.days);
};

// 本週個人雜事佔比：時段制本週工時 / 可用工時
Portfolio.choreRatio = function() {
  const wk = D.weekKey(D.monday());
  return { totalHours: Math.round(weeklyScheduledHours(wk)), availableHours: weekCapacityHours() };
};

// ═══ 較上週 KPI 輕量週快照（§18.12，純前端 localStorage，與 §17 後端全量快照獨立）═══
// 只快取「當下算出的 4 個 KPI 值」做週對比，不碰 DATA、不進雲端 blob、不被 migration 影響。
Portfolio._KPI_SNAP_KEY = 'pm_kpi_snapshot_v1';
Portfolio._kpiSnapRead = function() {
  try { return JSON.parse(localStorage.getItem(this._KPI_SNAP_KEY) || '{}') || {}; }
  catch (e) { return {}; }
};
// upsert 本週快照（idempotent）＋只留最近 2 週（本週＋上週），回傳上週快照（無則 null）。
Portfolio._kpiSnap = function(cur) {
  const monday = D.monday();
  const curKey = D.weekKey(monday), prevKey = D.weekKey(D.addDays(monday, -7));
  const store = this._kpiSnapRead();
  const prev = store[prevKey] || null;
  store[curKey] = { ...cur, ts: D.fmt(D.today(), 'iso') };
  const keep = [curKey, prevKey];
  Object.keys(store).forEach(k => { if (!keep.includes(k)) delete store[k]; });
  try { localStorage.setItem(this._KPI_SNAP_KEY, JSON.stringify(store)); } catch (e) {}
  return prev;
};
// 趨勢徽章：cur/prev 同指標數值。opt.betterWhenDown=數字變小=改善；opt.neutral=不判好壞（雜事偏忙）。
// 無上週（prev null）或本期無值→灰「—」。色義看「好壞」不看箭頭方向（§18.12）。
Portfolio._trendBadge = function(cur, prev, opt) {
  opt = opt || {};
  if (prev === null || prev === undefined || cur === null || cur === undefined)
    return '<span class="pf-trend pf-trend-none">—</span>';
  const d = cur - prev, suffix = opt.suffix || '', prefix = opt.prefix || '';
  if (d === 0) return `<span class="pf-trend pf-trend-flat"><i class="ti ti-minus"></i>${prefix}0${suffix}</span>`;
  const arrow = d > 0 ? 'ti-arrow-up' : 'ti-arrow-down';
  let tone;
  if (opt.neutral) tone = 'busy';
  else tone = (opt.betterWhenDown ? d < 0 : d > 0) ? 'good' : 'bad';
  return `<span class="pf-trend pf-trend-${tone}"><i class="ti ${arrow}"></i>${prefix}${Math.abs(d)}${suffix}</span>`;
};

// C 當前階段：首個未全完成階段顯示名（getProjectStages 的 minWbs 序）
Portfolio.currentStage = function(projId) {
  const stages = App.getProjectStages(projId).filter(s => s.name !== '未分階段');
  if (!stages.length) return '—';
  const inc = stages.find(s => s.doneCount < s.itemCount);
  return inc ? inc.name : '已完成';
};

// 專案實際/預計總進度（雙列）。實際＝任務 progress 平均；預計＝各任務「到今天應完成%」平均
Portfolio.projectProgress = function(projId, today) {
  const ts = this._live().filter(t => t.project === projId);
  if (!ts.length) return { actual: null, planned: null };
  const actual = Math.round(ts.reduce((s, t) => s + taskDisplayProgress(t), 0) / ts.length);
  const withDates = ts.map(t => getEffectiveSchedule(t)).filter(e => e.start && e.end);
  let planned = null;
  if (withDates.length) {
    const todayIso = D.fmt(today, 'iso');
    const sum = withDates.reduce((s, e) => {
      let pct;
      if (todayIso <= e.start) pct = 0;
      else if (todayIso >= e.end) pct = 100;
      else pct = D.workdaysBetween(e.start, todayIso) / D.workdaysBetween(e.start, e.end) * 100;
      return s + Math.max(0, Math.min(100, pct));
    }, 0);
    planned = Math.round(sum / withDates.length);
  }
  return { actual, planned };
};

// 週容量（部門負載容量線）：每日工時 × 每週工作日數 ＝ KPI4 availableHours（單一口徑，§18.10）
Portfolio.weekCapacity = function() {
  return weekCapacityHours();
};

// 部門負載（本週負荷，§18.10）：綠＝WBS 工期任務本週均攤（本週重疊工作天 × 日工時）、橘＝本週排程格子時段任務工時；跨專案依部門名彙整。
// ⚠ 個人雜事資料偏頗：僅含已記錄並掛部門的時段任務、且須被智慧排程排進本週格子才計、不含會議（Phase 2 ③），必有漏算。
Portfolio.deptLoad = function() {
  const daily = DATA.settings.dailyHours || 6;
  const monday = D.monday(), sunday = D.addDays(monday, 6), wk = D.weekKey(monday);
  const cap = this.weekCapacity();
  // 跨專案 dept id→名稱表（部門名穩健解析：先查 id→名稱、查無則值本身當名稱，容納 dept 欄 Y 池存的名稱）
  const idToName = {};
  (DATA.projects || []).forEach(p => (p.depts || []).forEach(d => { idToName[d.id] = d.name; }));
  const deptName = v => v ? (idToName[v] || v) : '未指派';
  const byName = {};  // 名稱 → {proj, chore}
  const bump = (nm, key, h) => { (byName[nm] = byName[nm] || { proj: 0, chore: 0 })[key] += h; };

  // 綠塊：未完成 WBS 工期任務，本週重疊工作天 × 日工時（攤平到本週，§三）
  this._live().filter(t => t.measureType !== 'hours' && t.status !== 'done').forEach(t => {
    const e = getEffectiveSchedule(t);
    if (!e || !e.start || !e.end) return;                  // 待排無區間→不計
    const eS = new Date(e.start), eE = new Date(e.end);
    if (isNaN(eS) || isNaN(eE)) return;
    const ovS = eS > monday ? eS : monday;                 // 重疊頭 ＝ max(start, 週一)
    const ovE = eE < sunday ? eE : sunday;                 // 重疊尾 ＝ min(end, 週日)
    if (ovS > ovE) return;                                 // 本週無重疊
    const wd = D.workdaysBetween(ovS, ovE);                // 含頭尾工作天（跳假日）
    if (wd <= 0) return;
    bump(deptName(t.dept), 'proj', wd * daily);
  });

  // 橘塊：本週排程格子的時段任務工時（duration 分→H），依 item.taskId→task.dept 分流（與 KPI4 totalHours 同源）
  const taskById = {};
  (DATA.tasks || []).forEach(t => { taskById[t.id] = t; });
  ((DATA.schedule && DATA.schedule.items) || []).filter(it => it.week === wk).forEach(it => {
    const t = taskById[it.taskId];
    bump(deptName(t && t.dept), 'chore', (Number(it.duration) || 0) / 60);
  });

  // 橘塊續：本週「專案會議」工時疊進 chore（§18.10b）。只計 category=meeting 且已指派部門/全體均攤；打掃雜項與未指派不計
  const deptPool = [...new Set(Object.values(idToName))];   // 選項Y池：全專案部門名去重（__ALL__ 展開用）
  const meetingHours = m => {                               // 會議時數（小時）：once 用 startTime/endTime，recurring/special 用 start/end
    const st = m.start || m.startTime, et = m.end || m.endTime;
    if (!st || !et) return 0;
    const [sh, sm] = st.split(':').map(Number), [eh, em] = et.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins / 60 : 0;
  };
  const addMeetingLoad = m => {
    if ((m.category || 'meeting') !== 'meeting') return;   // 打掃/雜項排除（special 無 category＝視為會議）
    const dv = m.dept;
    if (!dv || dv === '未指派') return;                    // 未指派不計入橘塊
    const h = meetingHours(m);
    if (h <= 0) return;
    if (dv === '__ALL__') deptPool.forEach(nm => bump(nm, 'chore', h));   // 全體均攤：同時疊所有專案部門、不乘人數
    else bump(deptName(dv), 'chore', h);                   // 型態甲：具名部門只加該部門
  };
  // 逐日掃本週工作日（與容量線同基準：週末/假日會議屬異常加班、不入常態負荷）；recurring 用現成 eventOccursOnDate（單一真實來源，自動吃 frequency/起訖日/enabled）
  for (let i = 0; i <= 6; i++) {
    const day = D.addDays(monday, i);
    if (!D.isWorkday(day)) continue;
    const dayIso = D.fmt(day, 'iso');
    (DATA.settings.recurringMeetings || []).forEach(m => { if (eventOccursOnDate(m, dayIso)) addMeetingLoad(m); });
    (DATA.settings.specialMeetings || []).forEach(m => { if (m.date === dayIso) addMeetingLoad(m); });
    (DATA.meetings || []).forEach(m => { if (m.date === dayIso) addMeetingLoad(m); });
  }

  return Object.keys(byName).map(nm => {
    const proj = Math.round(byName[nm].proj), chore = Math.round(byName[nm].chore), hours = proj + chore;
    return { name: nm, proj, chore, hours, over: cap > 0 && hours > cap };
  }).sort((a, b) => b.hours - a.hours);
};

// 當週待處理 Top N：本週內預計開始/到期且未完成；逾期優先，其餘依緊急度+到期日
Portfolio.weeklyTop = function(n) {
  const today = D.today(), todayIso = D.fmt(today, 'iso');
  const monday = D.monday(today), sunday = D.addDays(monday, 6);
  const inWeek = d => d && new Date(d) >= monday && new Date(d) <= sunday;
  const urg = u => u === 'high' ? 0 : (u === 'low' ? 2 : 1);
  const cand = this._live().filter(t => {
    if (t.status === 'done' || t.status === 'hold') return false;
    const e = getEffectiveSchedule(t);
    return this._overdue(t, today) || inWeek(e.start) || inWeek(e.end);
  }).map(t => {
    const e = getEffectiveSchedule(t);
    const od = this._overdue(t, today) ? Math.max(0, D.workdaysBetween(e.end, todayIso) - 1) : null;
    return { t, end: e.end, od };
  });
  cand.sort((a, b) => {
    if ((a.od != null) !== (b.od != null)) return (b.od != null) - (a.od != null);
    if (a.od != null) return b.od - a.od;
    const u = urg(a.t.urgency) - urg(b.t.urgency);
    if (u) return u;
    return String(a.end || '').localeCompare(String(b.end || ''));
  });
  return n ? cand.slice(0, n) : cand;
};

// 總覽頁渲染（§18.8）：4 指標卡＋雙列進度矩陣＋部門負載＋當週待處理＋各區塊 HintBox
Portfolio.renderOverview = function(mountId) {
  const el = document.getElementById(mountId);
  if (!el) return;
  const projects = DATA.projects || [];
  if (!projects.length) {
    el.innerHTML = `<div class="pf-empty"><i class="ti ti-layout-dashboard"></i><div class="pf-empty-t">尚無專案</div><div class="pf-empty-s">建立專案後，這裡會顯示跨專案健康度、進度與部門負載。</div></div>`;
    return;
  }
  const today = D.today();
  const hc = this.healthCounts(), tp = this.totalProgress(), ov = this.overdueTasks();
  const cr = this.choreRatio(), dl = this.deptLoad(), wk = this.weeklyTop(8);

  // 較上週趨勢（§18.12）：快取本週 4 KPI、取上週同指標比對；色義看好壞不看箭頭。
  const prevSnap = this._kpiSnap({ hcG: hc.green, hcY: hc.yellow, hcR: hc.red, tp: tp, ov: ov.length, chT: cr.totalHours, chA: cr.availableHours });
  const tHealth = this._trendBadge(hc.red, prevSnap ? prevSnap.hcR : null, { betterWhenDown: true, prefix: '紅' });
  const tProg = this._trendBadge(tp, prevSnap ? prevSnap.tp : null, { betterWhenDown: false, suffix: '%' });
  const tOver = this._trendBadge(ov.length, prevSnap ? prevSnap.ov : null, { betterWhenDown: true });
  const tChore = this._trendBadge(cr.totalHours, prevSnap ? prevSnap.chT : null, { neutral: true, suffix: 'h' });

  const kpiHtml = `<div class="pf-kpi-row">
    <div class="pf-kpi" style="border-top-color:var(--sage-700)">
      <i class="ti ti-info-circle pf-kpi-i" data-tip="專案健康度|紅=有逾期任務／黃=14 工作天內到期未逾期／綠=其餘|徽章＝較上週紅燈數增減（綠=減少改善／紅=增加惡化／—無上週快照）"></i>
      <div class="pf-kpi-lbl">專案健康度</div>
      <div class="pf-kpi-metric"><div class="pf-kpi-health"><span class="pf-hd pf-hd-g">●</span>${hc.green}<span class="pf-hd pf-hd-y">●</span>${hc.yellow}<span class="pf-hd pf-hd-r">●</span>${hc.red}</div>${tHealth}</div>
      <div class="pf-kpi-sub">健康 / 注意 / 延誤</div>
    </div>
    <div class="pf-kpi" style="border-top-color:var(--sage-700)">
      <i class="ti ti-info-circle pf-kpi-i" data-tip="跨專案總進度|全任務進度（progress）簡單平均|徽章＝較上週進度增減（綠=上升／紅=下降／—無上週快照）"></i>
      <div class="pf-kpi-lbl">跨專案總進度</div>
      <div class="pf-kpi-metric"><div class="pf-kpi-num">${tp === null ? '—' : tp + '<span class="pf-kpi-unit">%</span>'}</div>${tProg}</div>
      <div class="pf-bar pf-bar-sm"><span class="pf-bar-act" style="width:${tp || 0}%; background:var(--navy)"></span></div>
      <div class="pf-kpi-sub">全任務進度平均</div>
    </div>
    <div class="pf-kpi" style="border-top-color:var(--danger)">
      <i class="ti ti-info-circle pf-kpi-i" data-tip="核心延誤警報|有效完成日 小於 今天且未完成的任務數（工作日逾期天數）|徽章＝較上週逾期數增減（綠=減少改善／紅=增加惡化／—無上週快照）"></i>
      <div class="pf-kpi-lbl">核心延誤警報</div>
      <div class="pf-kpi-metric"><div class="pf-kpi-num pf-num-rose">${ov.length}<span class="pf-kpi-unit"> 筆逾期</span></div>${tOver}</div>
      <div class="pf-kpi-sub">${ov.length ? '最久：' + U.esc(ov[0].t.name) + ' 逾 ' + ov[0].days + ' 天' : '目前無逾期'}</div>
    </div>
    <div class="pf-kpi" style="border-top-color:var(--sage-700)">
      <i class="ti ti-info-circle pf-kpi-i" data-tip="本週個人雜事佔比|本週時段制工時 / (每日工時 × 工作天數)|徽章＝較上週時段工時增減（琥珀=偏忙提示·不判好壞／—無上週快照）"></i>
      <div class="pf-kpi-lbl">本週個人雜事佔比</div>
      <div class="pf-kpi-metric"><div class="pf-kpi-num">${cr.totalHours}h<span class="pf-kpi-unit">/${cr.availableHours}h</span></div>${tChore}</div>
      <div class="pf-kpi-sub">本週時段任務工時</div>
    </div>
  </div>`;
  const kpiHint = App.buildHintBox({ key: 'portfolio-kpi', icon: 'ti-help-circle', collapsed: true, title: '快速看懂數據指標', summary: '健康度／總進度／延誤／雜事佔比',
    bodyHtml: `<ol class="pf-hint-list">
      <li><b>健康度</b>：🔴 紅燈代表專案內有任何任務「已逾期」；🟡 黃燈為目前無逾期，但有任務「14 個工作天內即將到期」🚨 之預警；🟢 綠燈代表進度安全。</li>
      <li><b>總進度</b>：全專案所有階段的平均進度。</li>
      <li><b>延遲警報</b>：目前已過期但未完成的任務總數，並標註「最久過期天數」。</li>
      <li><b>雜事佔比</b>：本週手動排程的「時段任務」佔總工時的百分比（不含會議）。</li>
    </ol>` });

  const matrixRows = projects.map(p => {
    const pr = this.projectProgress(p.id, today);
    const stage = this.currentStage(p.id);
    const isRed = this.projectHealth(p.id, today) === 'red';
    const behind = (pr.planned != null && pr.actual != null && pr.actual < pr.planned);
    return `<div class="pf-mx-row">
      <div class="pf-mx-head"><span class="pf-dot" style="background:${p.color || 'var(--ink4)'}"></span><span class="pf-mx-name">${U.esc(p.name)}</span><span class="pf-mx-stage${isRed ? ' pf-mx-stage-red' : ''}">${U.esc(stage)}</span></div>
      <div class="pf-mx-line"><span class="pf-mx-tag">預計</span><span class="pf-bar"><span class="pf-bar-plan" style="width:${pr.planned || 0}%"></span></span><span class="pf-mx-pct">${pr.planned == null ? '—' : pr.planned + '%'}</span></div>
      <div class="pf-mx-line"><span class="pf-mx-tag">實際</span><span class="pf-bar"><span class="pf-bar-act" style="width:${pr.actual || 0}%"></span></span><span class="pf-mx-pct ${behind ? 'pf-mx-behind' : 'pf-mx-ok'}">${pr.actual == null ? '—' : pr.actual + '%'}</span></div>
    </div>`;
  }).join('');
  const matrixHint = App.buildHintBox({ key: 'portfolio-matrix', icon: 'ti-help-circle', collapsed: true, title: '專案進度怎麼看（預計 vs 實際）', summary: '預計 vs 實際、當前階段',
    bodyHtml: `<ol class="pf-hint-list">
      <li><b>預計進度</b>：依計畫今天「本該完成」的進度比例。</li>
      <li><b>實際進度</b>：目前團隊「實質做完」的進度比例。</li>
      <li><b>狀態警示</b>：當「實際 < 預計」時，數字會自動高亮變紅 🚨 提示落後。點擊專案右側可展開子階段。</li>
    </ol>` });

  const cap = this.weekCapacity();
  const maxLoad = Math.max(dl.reduce((m, d) => Math.max(m, d.hours), 0), cap) || 1;
  const capPct = cap > 0 ? Math.round(cap / maxLoad * 100) : 0;
  const deptHtml = dl.length ? dl.map(d => {
    const pPct = Math.round(d.proj / maxLoad * 100), cPct = Math.round(d.chore / maxLoad * 100);
    return `<div class="pf-dl-row${d.over ? ' pf-dl-over' : ''}">
      <div class="pf-dl-head"><span class="pf-dl-name">${d.over ? '<i class="ti ti-alert-triangle"></i> ' : ''}${U.esc(d.name)}</span><span class="pf-dl-h">${d.hours}h<span class="pf-dl-brk">（專案 ${d.proj} ＋ 雜事 ${d.chore}）${d.over ? ' · 超 ' + (d.hours - cap) + 'h' : ''}</span></span></div>
      <div class="pf-bar pf-bar-stack">
        <span class="pf-bar-proj" style="width:${pPct}%"></span>
        <span class="pf-bar-chore" style="left:${pPct}%;width:${cPct}%"></span>
        ${cap > 0 ? `<span class="pf-bar-cap" style="left:${capPct}%"></span>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="pf-mini-empty">本週各部門無工時</div>';
  const deptLegend = dl.length ? `<div class="pf-dl-legend"><span><i class="pf-lg-sw pf-lg-proj"></i>專案工時</span><span><i class="pf-lg-sw pf-lg-chore"></i>日常雜事工時</span><span><i class="pf-lg-cap"></i>週容量 ${cap}h</span></div>` : '';
  const deptHint = App.buildHintBox({ key: 'portfolio-deptload', icon: 'ti-alert-triangle', collapsed: true, title: '部門忙碌大對齊（本週負荷）', summary: '本週負荷·僅含已掛部門雜事·必有漏算',
    bodyHtml: `<ol class="pf-hint-list">
      <li><b>工時口徑</b>：本週均攤專案工時（WBS 任務）＋ 本週工作日專案會議工時。</li>
      <li><b>容量線基準</b>：由「每日工時 × 本週工作天」自動衍生。</li>
      <li><b>排除原則</b>：僅計專案相關。打掃、外出或未指派部門的會議「一律不計入」，未指派會議歸在「未指派」長條。</li>
    </ol>` });

  const weeklyHtml = wk.length ? wk.map(x => {
    const proj = App.getProj(x.t.project), pn = proj ? proj.name : '';
    if (x.od != null) {
      return `<div class="pf-wk-row pf-wk-od"><span class="pf-badge pf-badge-od">逾期 ${x.od} 天</span><span class="pf-wk-name">${U.esc(x.t.name)}</span><span class="pf-wk-proj">${U.esc(pn)}</span></div>`;
    }
    const urgent = x.t.urgency === 'high';
    return `<div class="pf-wk-row">${urgent ? '<span class="pf-badge pf-badge-urg">緊急</span>' : ''}<span class="pf-wk-name">${U.esc(x.t.name)}</span><span class="pf-wk-proj">${U.esc(pn)}${x.end ? ' · ' + D.fmt(x.end, 'md') : ''}</span></div>`;
  }).join('') : '<div class="pf-mini-empty">本週無待處理任務</div>';
  const weeklyHint = App.buildHintBox({ key: 'portfolio-weekly', icon: 'ti-help-circle', collapsed: true, title: '本週戰情急先鋒（排序規則）', summary: '逾期優先、緊急度+到期日',
    bodyHtml: `<ol class="pf-hint-list">
      <li><b>任務範圍</b>：本週內「預計開始」或「預計結束」的所有待辦項目（逾期亦納入）。</li>
      <li><b>優先排序</b>：系統依【逾期天數最多 ➡️ 緊急度最高 ➡️ 預計結束日最早】自動由上至下排序。</li>
    </ol>` });

  el.innerHTML = `${kpiHint}${kpiHtml}
    <div class="pf-grid">
      <div class="pf-card"><div class="pf-card-t">專案進度矩陣</div>${matrixHint}${matrixRows}</div>
      <div class="pf-card"><div class="pf-card-t">部門負載</div>${deptHint}${deptHtml}${deptLegend}</div>
    </div>
    <div class="pf-card"><div class="pf-card-t">當週待處理</div>${weeklyHint}${weeklyHtml}</div>`;
};
