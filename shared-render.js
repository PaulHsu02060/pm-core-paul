// shared-render.js — 甘特 + 月曆共用渲染層(Project/Portfolio 共用，§12.1 單一真實來源)。app.js 之後載入；renderKanban 不在此(留 app→project)。docs §18.7.1/2。
// ═══════════════════════════════════════════════════════
//  PAGE: GANTT
// ═══════════════════════════════════════════════════════
App.renderGantt = function(targetId = 'page-gantt', singleProject = false) {
  this.ganttScope = { targetId, singleProject };
  if (this.ganttFilterOpen === undefined) this.ganttFilterOpen = false;
  if (!this.ganttStart) this.ganttStart = D.monday();
  if (!this.ganttProjectFilter) this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
  const start = this.ganttStart;
  const days = [];
  for (let i = 0; i < 14; i++) days.push(D.addDays(start, i));
  const endDay = days[13];
  const today = D.today();
  const wd = ['日','一','二','三','四','五','六'];

  // Header
  let headerHtml = '<div class="gantt-corner">任務</div>';
  for (const d of days) {
    const isHol = !D.isWorkday(d);
    const isToday = D.isSameDay(d, today);
    const holName = (() => {
      if (!isHol) return '';
      const hols = (DATA.calendars?.base?.holidays) || {};
      const selfKey = D.fmt(d, 'iso');
      if (hols[selfKey]) return hols[selfKey].slice(0,2);
      for (let back = 1; back <= 4; back++) {
        const prev = new Date(d); prev.setDate(prev.getDate() - back);
        if (D.isWorkday(prev)) break;
        const prevKey = D.fmt(prev, 'iso');
        if (hols[prevKey]) return hols[prevKey].slice(0,2);
      }
      return '';
    })();
    headerHtml += `<div class="gantt-day-header ${isHol ? 'holiday' : ''} ${isToday ? 'today' : ''}">
      <span class="gd-day">${d.getDate()}</span>${wd[d.getDay()]}${holName ? `<span class="gd-hol">${holName}</span>` : ''}
    </div>`;
  }

  // Collect tasks to display (active + recently done, with dates)
  const projFilter = this.ganttProjectFilter;
  const tasks = DATA.tasks.filter(t => {
    if (t._deleted) return false;
    if (!projFilter.has(t.project)) return false;
    if (this.ganttStageFilter && !this.ganttStageFilter.has(t.stage)) return false;
    if (this.ganttOwnerFilter) {
      const owners = (t.owner || '').split(/[、\/＋+]/).map(s => s.trim()).filter(Boolean);
      if (!owners.some(o => this.ganttOwnerFilter.has(o))) return false;
    }
    if (t.status === 'hold') return false;
    const sch = getEffectiveSchedule(t);
    if (!sch.start && !sch.end) return false;
    // Check if range overlaps
    const ts = sch.start ? new Date(sch.start) : new Date(sch.end);
    const te = sch.end ? new Date(sch.end) : new Date(sch.start);
    return te >= start && ts <= endDay;
  });

  if (tasks.length === 0) {
    document.getElementById(targetId).innerHTML = `
      <div class="gantt-card">
        ${this.buildGanttHeaderHtml(days)}
        ${this.buildGanttFilterHtml(singleProject)}
        <div class="empty-task-list" style="grid-column: 1 / -1;">
          <div class="empty-task-list-icon">📊</div>
          ${singleProject ? '此專案目前沒有任務' : '目前篩選沒有任務<br><span style="font-size:11px;">請勾選至少一個專案</span>'}
        </div>
      </div>`;
    return;
  }

  // Build rows
  const sortedTasks = tasks.sort((a, b) => {
    const aSch = getEffectiveSchedule(a);
    const bSch = getEffectiveSchedule(b);
    const aStart = new Date(aSch.start || aSch.end);
    const bStart = new Date(bSch.start || bSch.end);
    return aStart - bStart;
  });

  // 唯讀排程快取：每個顯示中的專案算一次 computeSchedule，result 以 taskId 建表供 bar 查（純算不寫回、不 mutate）。
  // 用「該專案全部任務」算（非只視窗內），前置鏈才解析得到視窗外的上游。
  const schedById = new Map();
  new Set(sortedTasks.map(t => t.project)).forEach(pid => {
    const projTasks = DATA.tasks.filter(t => t.project === pid && !t._deleted);
    const { results } = computeSchedule(projTasks);
    results.forEach(r => schedById.set(r.taskId, r));
  });

  const rowsHtml = sortedTasks.map(t => this.buildGanttRowHtml(t, start, days, schedById)).join('');

  document.getElementById(targetId).innerHTML = `
    <div class="gantt-card">
      ${this.buildGanttHeaderHtml(days)}
      ${this.buildGanttFilterHtml(singleProject)}
      <div class="gantt">
        ${headerHtml}
        ${rowsHtml}
        <svg class="gantt-links" aria-hidden="true"></svg>
      </div>
      ${!singleProject ? `<div class="legend-row" style="border-top:1px solid var(--rule); margin-top:18px; padding-top:14px;">
        ${DATA.projects.map(p => `
          <span class="legend-item"><span class="legend-sw" style="background:${p.color}"></span>${U.esc(p.name)}</span>
        `).join('')}
        <span style="margin-left:auto; font-size:10.5px;">◆ 里程碑 · 進度條顯示完成度</span>
      </div>` : ''}
    </div>
  `;
  // §12.3 連接線：僅專案頁畫（總儀表板無線，見 §12.1）。render 完量 DOM 再疊 SVG（方案甲）。
  if (singleProject) this._drawGanttLinks(targetId);
};

App.buildGanttHeaderHtml = function(days) {
  const periodStr = `${D.fmt(days[0], 'ymd')} – ${D.fmt(days[13], 'md')}`;
  return `<div class="gantt-header-row">
    <div class="gantt-period">${periodStr}</div>
    <div style="flex:1"></div>
    <div class="gantt-nav">
      <button onclick="App.ganttShift(-7)">« 上週</button>
      <button onclick="App.ganttToday()">今天</button>
      <button onclick="App.ganttShift(7)">下週 »</button>
    </div>
  </div>`;
};

App.ganttShift = function(days) {
  this.ganttStart = D.addDays(this.ganttStart || D.monday(), days);
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};
App.ganttToday = function() {
  this.ganttStart = D.monday();
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};

App.buildGanttFilterHtml = function(singleProject) {
  const tasks = DATA.tasks.filter(t => !t._deleted);
  // 階段選項：動態收集（去重、保序）
  const stages = [...new Set(tasks.map(t => t.stage).filter(Boolean))];
  // 負責人選項：動態收集 + 拆多人分隔符
  const owners = [...new Set(tasks.flatMap(t =>
    (t.owner || '').split(/[、\/＋+]/).map(s => s.trim()).filter(Boolean)
  ))].sort();

  const sf = this.ganttStageFilter;
  const of_ = this.ganttOwnerFilter;
  const pf = this.ganttProjectFilter || new Set();

  // 專案多選（總儀表板專屬）
  const projOpen = this.ganttFilterOpen;
  const projMenu = projOpen ? `<div class="gantt-filter-menu">
    ${DATA.projects.map(p => `
      <label class="gantt-filter-item">
        <input type="checkbox" ${pf.has(p.id) ? 'checked' : ''} onchange="App.toggleGanttProject('${p.id}')">
        <span class="gantt-filter-sw" style="background:${p.color}"></span>${U.esc(p.name)}
      </label>
    `).join('')}
  </div>` : '';
  const projFilter = singleProject ? '' : `<div class="gantt-filter">
    <button class="gantt-filter-field ${projOpen ? 'open' : ''}" onclick="App.toggleGanttFilterOpen()">
      <span class="gantt-filter-label">by 專案</span>
      <span class="gantt-filter-summary">已選 ${pf.size} 個</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${projMenu}
  </div>`;

  // 階段下拉
  const stageOpen = this.ganttStageOpen;
  const stageMenu = stageOpen ? `<div class="gantt-filter-menu">
    ${stages.map(s => `
      <label class="gantt-filter-item">
        <input type="checkbox" ${!sf || sf.has(s) ? 'checked' : ''} onchange="App.toggleGanttStage('${U.esc(s)}')">
        ${U.esc(s)}
      </label>
    `).join('')}
  </div>` : '';
  const stageFilter = `<div class="gantt-filter">
    <button class="gantt-filter-field ${stageOpen ? 'open' : ''}" onclick="App.toggleGanttStageOpen()">
      <span class="gantt-filter-label">階段</span>
      <span class="gantt-filter-summary">${sf ? `已選 ${sf.size} 個` : '全部'}</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${stageMenu}
  </div>`;

  // 負責人下拉
  const ownerOpen = this.ganttOwnerOpen;
  const ownerMenu = ownerOpen ? `<div class="gantt-filter-menu">
    ${owners.map(o => `
      <label class="gantt-filter-item">
        <input type="checkbox" ${!of_ || of_.has(o) ? 'checked' : ''} onchange="App.toggleGanttOwner('${U.esc(o)}')">
        ${U.esc(o)}
      </label>
    `).join('')}
  </div>` : '';
  const ownerFilter = `<div class="gantt-filter">
    <button class="gantt-filter-field ${ownerOpen ? 'open' : ''}" onclick="App.toggleGanttOwnerOpen()">
      <span class="gantt-filter-label">負責人</span>
      <span class="gantt-filter-summary">${of_ ? `已選 ${of_.size} 人` : '全部'}</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${ownerMenu}
  </div>`;

  return `<div class="gantt-filter-bar">${projFilter}${stageFilter}${ownerFilter}</div>`;
};

App.toggleGanttFilterOpen = function() {
  this.ganttFilterOpen = !this.ganttFilterOpen;
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};

App.toggleGanttProject = function(id) {
  if (!this.ganttProjectFilter) this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
  if (this.ganttProjectFilter.has(id)) this.ganttProjectFilter.delete(id);
  else this.ganttProjectFilter.add(id);
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};

App.toggleGanttStageOpen = function() { this.ganttStageOpen = !this.ganttStageOpen; this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject); };
App.toggleGanttOwnerOpen = function() { this.ganttOwnerOpen = !this.ganttOwnerOpen; this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject); };

App.toggleGanttStage = function(s) {
  const all = [...new Set(DATA.tasks.filter(t => !t._deleted).map(t => t.stage).filter(Boolean))];
  if (!this.ganttStageFilter) this.ganttStageFilter = new Set(all);
  if (this.ganttStageFilter.has(s)) this.ganttStageFilter.delete(s);
  else this.ganttStageFilter.add(s);
  if (this.ganttStageFilter.size === 0 || this.ganttStageFilter.size === all.length) this.ganttStageFilter = null;
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};

App.toggleGanttOwner = function(o) {
  const all = [...new Set(DATA.tasks.filter(t => !t._deleted).flatMap(t =>
    (t.owner || '').split(/[、\/＋+]/).map(s => s.trim()).filter(Boolean)
  ))];
  if (!this.ganttOwnerFilter) this.ganttOwnerFilter = new Set(all);
  if (this.ganttOwnerFilter.has(o)) this.ganttOwnerFilter.delete(o);
  else this.ganttOwnerFilter.add(o);
  if (this.ganttOwnerFilter.size === 0 || this.ganttOwnerFilter.size === all.length) this.ganttOwnerFilter = null;
  this.renderGantt(this.ganttScope.targetId, this.ganttScope.singleProject);
};

// ─── 甘特狀態標籤（暫定樣式，集中於此；要改字/調色改這裡，勿散落到渲染中）───
// 標籤來源 = computeSchedule result 的 anchorSource（manual/override）或「可排」推導出的 scheduled。
const GANTT_STATUS_LABELS = { manual: '手動', override: '鎖', scheduled: '排程' };
// §12.2 Hunk4：狀態膠囊/warn 顏色收進 CSS class（.gantt-status-tag.tag-* / .gantt-warn），不再 inline。
const GANTT_SOURCE_DESC = { manual: '手動錨點', override: '本地鎖定（override）', scheduled: '機器排程連動' };

App.buildGanttRowHtml = function(task, start, days, schedById) {
  const proj = this.getProj(task.project);
  const sch = getEffectiveSchedule(task);
  const isMilestone = task.taskType === 'milestone';  // M2-T3：類型正本，不再靠 category==='meeting' 啟發式誤判
  // §12.2 union-span 雙座標：plan 框（plannedStart/End）+ actual 填，合併格涵蓋兩者聯集。
  // 里程碑=節點(工期0)：座標基準維持 sch.start||end 單格(peIdx=psIdx)，日期跨度視為髒資料不畫長條，
  // startCol===endCol → 前後空格迴圈恰好補滿 14 格，格線不塌。
  const col = (d) => D.daysBetween(start, new Date(d));
  const clampIdx = (n) => Math.max(0, Math.min(13, n));
  // 框 = plan 範圍（plannedStart/End；退無則回 sch.start/end）。里程碑用有效日單格、不動。
  const psIdx = isMilestone ? col(sch.start || sch.end) : col(sch.plannedStart || sch.start || sch.end);
  const peIdx = isMilestone ? psIdx : col(sch.plannedEnd || sch.end || sch.start);
  // §12.2 actual 填色狀態（precedence: done > 逾期 > wip > 未開始）。aSIdx/aEIdx 須在 startCol/endCol 前算定，
  // union 才涵蓋爆框。里程碑無進度填色 → 維持框佔位、不畫 fill（HTML 走 isMilestone 菱形分支）。
  let aSIdx = psIdx, aEIdx = peIdx;   // 預設＝框（未開始/里程碑時 union 退化成框）
  let fillClass = '', showFill = false, overdueDays = 0;
  const todayD = D.today();
  if (!isMilestone) {
    if (task.status === 'done' || task.actualEnd) {            // 完成：actualStart→actualEnd
      aSIdx = col(task.actualStart || sch.plannedStart || sch.start);
      aEIdx = col(task.actualEnd   || sch.plannedEnd   || sch.end);
      fillClass = 'fill-done'; showFill = true;
    } else if (isTaskDelayed(task, todayD)) {                  // 逾期：計畫段填滿框＋爆出到今天
      aSIdx = psIdx;
      aEIdx = col(todayD);
      fillClass = 'fill-over'; showFill = true;
      overdueDays = -D.daysBetween(todayD, new Date(sch.end)); // 資料層真實逾期天數（日曆天，比照既有 ws tip）
    } else if (task.actualStart) {                             // 進行中：actualStart→今天（每天跟今天長）
      aSIdx = col(task.actualStart);
      aEIdx = col(todayD);
      fillClass = 'fill-wip'; showFill = true;
    }
    // else 未開始：showFill=false，框內不填不寫名（膠囊/warn 仍掛透明載體層，見 HTML）
  }
  // 合併格 = 框 ∪ 填，右界截斷在 14 格窗（aEIdx>13 爆框 → endCol 卡 13）。
  const startCol = Math.max(0, Math.min(psIdx, aSIdx));
  const endCol = Math.min(13, Math.max(peIdx, aEIdx));
  const span = endCol - startCol + 1;

  if (startCol > 13 || endCol < 0) return '';

  // 格內 % 定位（idx 左緣 / idx+1 右緣，對齊 inclusive 語意）；超窗 idx 先 clampIdx 再算。
  const leftPct = (idx) => (clampIdx(idx) - startCol) / span * 100;
  const rightPct = (idx) => (clampIdx(idx) + 1 - startCol) / span * 100;

  // ─ 狀態標籤 + 警示（唯讀查排程快取；無快取則不標，不影響既有顯示）─
  const r = schedById && schedById.get(task.id);
  let statusKey = null;
  if (r) {
    if (r.anchorSource === 'manual') statusKey = 'manual';
    else if (r.anchorSource === 'override') statusKey = 'override';
    else if (!r.blocked && !r.toSchedule && !r.error && r.suggestedStart) statusKey = 'scheduled';
  }
  // ! 只對排程「異常」三態亮（循環/blocked/待排）；warnings 如「前置未完成」是進度狀態，不亮 !
  const hasIssue = !!(r && (r.error === 'circular' || r.blocked || r.toSchedule));
  const statusTagHtml = statusKey
    ? `<span class="gantt-status-tag tag-${statusKey}">${GANTT_STATUS_LABELS[statusKey]}</span>`
    : '';
  const warnHtml = hasIssue
    ? `<span class="gantt-warn" title="排程異常">!</span>`
    : '';
  // tooltip：來源 + 異常 + warnings（warnings 僅作資訊列出，不亮 !）
  const titleLines = [];
  if (statusKey) titleLines.push(`來源：${GANTT_STATUS_LABELS[statusKey]}（${GANTT_SOURCE_DESC[statusKey]}）`);
  if (r) {
    if (r.error === 'circular') titleLines.push('⚠ 循環依賴：無法排程');
    else if (r.blocked) titleLines.push('⚠ 受阻：上游尚未排出');
    else if (r.toSchedule) titleLines.push('⚠ 待排：無前置且未填開始日');
    if (r.warnings && r.warnings.length) titleLines.push('提醒：' + r.warnings.join('；'));
  }
  const barTitle = titleLines.join('|');

  // Row label
  let html = `<div class="gantt-row-label">
    <span class="dot" style="background:${proj?.color || '#888'}"></span>
    <span class="gantt-row-label-text">${U.esc(task.name)}</span>
  </div>`;

  // Empty cells before
  for (let i = 0; i < startCol; i++) {
    const d = days[i];
    html += `<div class="gantt-cell ${!D.isWorkday(d) ? 'holiday' : ''} ${D.isSameDay(d, D.today()) ? 'today' : ''}"></div>`;
  }

  // Bar cell
  const progress = task.progress || (task.status === 'done' ? 100 : task.status === 'wip' ? 30 : 0);

  if (isMilestone) {
    html += `<div class="gantt-cell" style="position:relative;">
      <div class="gantt-bar milestone" data-link-id="${task.id}" style="left:50%; transform:translateX(-50%);" onclick="App.openTaskModal('${task.id}')"${barTitle ? ` data-tip="甘特狀態|${U.esc(barTitle)}"` : ''}></div>
    </div>`;
  } else {
    // §12.2 雙層：plan 虛框（一律畫，plannedStart/End）+ actual 填色（showFill 才有底色；
    // 未開始＝透明載體層，只掛膠囊/warn、不寫名不顯 pill → 視覺＝空框＋左側小標）。
    const frameStyle = `left:${leftPct(psIdx).toFixed(2)}%; right:${(100 - rightPct(peIdx)).toFixed(2)}%;`;
    const fillStyle  = `left:${leftPct(aSIdx).toFixed(2)}%; right:${(100 - rightPct(aEIdx)).toFixed(2)}%;`;
    html += `<div class="gantt-cell" style="grid-column: span ${span}; position:relative;">
      <div class="gantt-plan-frame" data-link-id="${task.id}" style="${frameStyle}"></div>
      <div class="gantt-actual-fill ${showFill ? fillClass : ''}" style="${fillStyle}" onclick="App.openTaskModal('${task.id}')"${barTitle ? ` data-tip="甘特狀態|${U.esc(barTitle)}"` : ''}>
        ${statusTagHtml}${warnHtml}${(() => {
          const xPreds = App._ganttPreds(task).filter(p => p.stage !== task.stage);
          return xPreds.length ? `<span class="gantt-xstage-badge" data-tip="跨階段前置|${U.esc(xPreds.map(p=>p.name).join('、'))}"><i class="ti ti-link"></i>${xPreds.length}</span>` : '';
        })()}${showFill ? `${U.esc(task.name)} <span class="pill">${overdueDays > 0 ? `逾期+${overdueDays}天` : progress + '%'}</span>` : ''}
      </div>
    </div>`;
  }

  // Empty cells after
  for (let i = endCol + 1; i < 14; i++) {
    const d = days[i];
    html += `<div class="gantt-cell ${!D.isWorkday(d) ? 'holiday' : ''}"></div>`;
  }

  return html;
};

// §12.3 _ganttPreds：回傳此 task 的所有 FS 前置 task 物件（跨/同階段都含）。
// 供 buildGanttRowHtml（跨階段 badge）與 _drawGanttLinks（同階段 SVG 線）共用。
App._ganttPreds = function(task) {
  if (!task.predecessor) return [];
  return parsePredecessors(task.predecessor)
    .filter(p => p.type === 'FS')
    .map(p => DATA.tasks.find(t => t.id === p.dep))
    .filter(Boolean);
};

// §12.3 連接線（僅專案頁）：render 完量每根 bar 的 DOM 位置，疊 SVG 畫 FS 依賴折線。
// Hunk 2 跨階段改走 clay 膠囊 badge（此函式處理同階段 SVG 線，Hunk 3 實作）。
App._drawGanttLinks = function(targetId) {};

// ═══════════════════════════════════════════════════════
//  PAGE: MONTH
// ═══════════════════════════════════════════════════════
App.renderMonth = function(targetId = 'page-month', pid = null) {
  this.monthScope = { targetId, pid };
  if (!this.monthCursor) {
    const today = D.today();
    this.monthCursor = { year: today.getFullYear(), month: today.getMonth() };
  }
  const { year, month } = this.monthCursor;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstDayOfWeek = firstDay.getDay();

  // Build 6 weeks of cells
  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    const d = new Date(year, month, -firstDayOfWeek + i + 1);
    cells.push({ d, other: true });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    cells.push({ d: new Date(year, month, i), other: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1].d;
    const next = new Date(last); next.setDate(last.getDate() + 1);
    cells.push({ d: next, other: next.getMonth() !== month });
    if (cells.length >= 42) break;
  }

  const today = D.today();
  const previewWeeksMs = (DATA.settings.previewWeeks || 2) * 7 * 86400000;
  const previewLimit = new Date(today.getTime() + previewWeeksMs);

  const cellsHtml = cells.map(c => {
    const isToday = D.isSameDay(c.d, today);
    const isWk = D.isWeekend(c.d);
    const dateIso = D.fmt(c.d, 'iso');

    // Find events on this day
    const meetings = DATA.meetings.filter(m => m.date === dateIso);
    const taskDeadlines = DATA.tasks.filter(t => !t._deleted && (!pid || t.project === pid) && getEffectiveSchedule(t).end === dateIso && t.status !== 'done' && t.status !== 'hold');

    const dayEvents = [];
    // Meetings
    for (const m of meetings) {
      dayEvents.push(`<div class="month-evt meeting" title="${U.esc(m.title)}">${U.esc(m.startTime || '')} ${U.esc(m.title).slice(0, 6)}</div>`);
    }
    // Task deadlines (urgent/preview)
    for (const t of taskDeadlines) {
      const sch = getEffectiveSchedule(t);
      const days = D.daysBetween(today, new Date(sch.end));
      const isPreview = days > 7 && days <= 14;
      const cls = days <= 3 ? 'rust-evt' : isPreview ? 'preview' : 'deep';
      dayEvents.push(`<div class="month-evt ${cls}" title="${U.esc(t.name)}" onclick="event.stopPropagation(); App.openTaskModal('${t.id}')">${U.esc(t.name).slice(0, 8)}</div>`);
    }
    const MONTH_CELL_MAX = 6;
    let evtsHtml = dayEvents.slice(0, MONTH_CELL_MAX).join('');
    if (dayEvents.length > MONTH_CELL_MAX) {
      evtsHtml += `<div style="font-size:9px; color:var(--ink3); font-family:var(--mono);">+ ${dayEvents.length - MONTH_CELL_MAX} 個</div>`;
    }

    return `<div class="month-cell ${c.other ? 'other-month' : ''} ${isWk ? 'weekend' : ''} ${isToday ? 'today' : ''}">
      <div class="date">${c.d.getDate()}</div>
      ${evtsHtml}
    </div>`;
  }).join('');

  document.getElementById(targetId).innerHTML = `
    <div class="month-card">
      <div class="month-head-row" style="position:relative;">
        <button class="month-title-btn" onclick="App.toggleYMPicker(event)">
          ${year} 年 ${month + 1} 月 <span class="chevron">▼</span>
        </button>
        <div class="ym-picker" id="ymPicker">
          ${this.buildYMPickerHtml(year, month)}
        </div>
        <div class="month-spacer"></div>
        <div class="month-nav">
          <button onclick="App.monthShift(-1)">‹</button>
          <button onclick="App.monthToday()">今天</button>
          <button onclick="App.monthShift(1)">›</button>
        </div>
      </div>
      <div class="month-weekday-row">
        <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
      </div>
      <div class="month-grid">${cellsHtml}</div>
      <div class="legend-row" style="border-top:1px solid var(--rule); margin-top:18px; padding-top:14px;">
        <span class="legend-item"><span class="legend-sw" style="background:var(--slate)"></span>會議</span>
        <span class="legend-item"><span class="legend-sw" style="background:var(--sage-500)"></span>任務截止</span>
        <span class="legend-item"><span class="legend-sw" style="background:var(--terracotta)"></span>緊急截止</span>
        <span class="legend-item"><span style="display:inline-block; width:10px; height:10px; border-radius:3px; border:1px dashed var(--amber);"></span>兩週預告</span>
      </div>
    </div>
  `;
};

// ─── 月曆 年月 picker（原 renderKanban 之後）───
App.buildYMPickerHtml = function(curYear, curMonth) {
  const yearOptions = [];
  for (let y = curYear - 3; y <= curYear + 3; y++) {
    yearOptions.push(`<option value="${y}" ${y === curYear ? 'selected' : ''}>${y} 年</option>`);
  }
  return `
    <div class="ym-picker-year-row">
      <button onclick="event.stopPropagation(); App.monthYearShift(-1)">‹</button>
      <select id="ymYearSelect" onchange="App.monthYearSelect(this.value); event.stopPropagation();">${yearOptions.join('')}</select>
      <button onclick="event.stopPropagation(); App.monthYearShift(1)">›</button>
    </div>
    <div class="ym-months">
      ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
        <button class="${m === curMonth + 1 ? 'current' : ''}" onclick="App.monthPick(${m - 1}); event.stopPropagation();">${m}月</button>
      `).join('')}
    </div>
  `;
};

App.toggleYMPicker = function(e) {
  e.stopPropagation();
  document.getElementById('ymPicker').classList.toggle('open');
};
App.monthShift = function(n) {
  this.monthCursor.month += n;
  if (this.monthCursor.month < 0) { this.monthCursor.month = 11; this.monthCursor.year--; }
  if (this.monthCursor.month > 11) { this.monthCursor.month = 0; this.monthCursor.year++; }
  this.renderMonth(this.monthScope.targetId, this.monthScope.pid);
};
App.monthToday = function() {
  const today = D.today();
  this.monthCursor = { year: today.getFullYear(), month: today.getMonth() };
  this.renderMonth(this.monthScope.targetId, this.monthScope.pid);
};
App.monthYearShift = function(n) {
  this.monthCursor.year += n;
  this.renderMonth(this.monthScope.targetId, this.monthScope.pid);
};
App.monthYearSelect = function(y) {
  this.monthCursor.year = parseInt(y);
  this.renderMonth(this.monthScope.targetId, this.monthScope.pid);
};
App.monthPick = function(m) {
  this.monthCursor.month = m;
  document.getElementById('ymPicker').classList.remove('open');
  this.renderMonth(this.monthScope.targetId, this.monthScope.pid);
};

// Click outside to close year/month picker
document.addEventListener('click', e => {
  const picker = document.getElementById('ymPicker');
  if (picker && !picker.contains(e.target) && !e.target.classList.contains('month-title-btn')) {
    picker.classList.remove('open');
  }
});
