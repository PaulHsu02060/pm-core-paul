// project.js — 專案頁(header/KPI/階段/部門/任務 CRUD/buildTaskRowHtml/看板卡/會議彈窗/排程產生/predecessor/taskForm)+ renderKanban。app.js 之後載入；taskDisplayProgress/getProjectStages 在 core、範本表單在 template。docs §18.7.2。
// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT
// ═══════════════════════════════════════════════════════
App.buildProjectHeaderHtml = function() {
  const proj = this.getProj(this.currentProjectId);
  if (!proj) return '';
  return `<div class="proj-header">
        <div class="proj-color" style="background:${proj.color}"></div>
        <div style="flex:1; min-width:0;">
          <div class="proj-name">
            ${U.esc(proj.name)}
          </div>
        </div>
        <span class="hdr-menu-wrap">
          <button class="tb-action ghost hdr-menu-toggle" data-edit-hide onclick="App.toggleExportMenu(event, '${proj.id}')"><i class="ti ti-download" style="font-size:15px; vertical-align:-2px; margin-right:5px; color:var(--sage-600);"></i>匯出 Excel ▾</button>
          <div class="hdr-menu hdr-menu-right" id="hdrExportMenu">
            <div class="hdr-menu-title">匯出完整 WBS Excel</div>
            <div class="hdr-menu-sub">含專案資訊 + 甘特圖分頁</div>
            <button class="hdr-menu-item" onclick="App.exportProjectWbs('${proj.id}','day'); App.closeHdrMenus();">日刻度<span class="hdr-menu-note">甘特每日一欄</span></button>
            <button class="hdr-menu-item" onclick="App.exportProjectWbs('${proj.id}','week'); App.closeHdrMenus();">週刻度<span class="hdr-menu-note">甘特每週一欄</span></button>
            <button class="hdr-menu-item" onclick="App.exportProjectWbs('${proj.id}','month'); App.closeHdrMenus();">月刻度<span class="hdr-menu-note">甘特每月一欄</span></button>
          </div>
        </span>
        <span class="hdr-divider"></span>
        <button class="tb-action ghost" data-edit onclick="App.editProject('${proj.id}')">編輯專案</button>
        <span class="hdr-menu-wrap">
          <button class="tb-action ghost hdr-menu-toggle" data-edit onclick="App.toggleMoreMenu(event, '${proj.id}')">⋯</button>
          <div class="hdr-menu hdr-menu-right" id="hdrMoreMenu">
            <button class="hdr-menu-item hdr-menu-danger" onclick="App.openWbsImport('${proj.id}'); App.closeHdrMenus();">覆蓋匯入<span class="hdr-menu-note hdr-menu-danger-note">危險</span></button>
          </div>
        </span>
      </div>`;
};

// §16 塊5：header 下拉/選單（toggle + 點外關閉；單一專案頁故用固定 id）
App.toggleExportMenu = function(ev, projId) {
  ev.stopPropagation();
  this._ensureHdrMenuClose();
  const m = document.getElementById('hdrExportMenu');
  const open = m && m.classList.contains('open');
  this.closeHdrMenus();
  if (m && !open) m.classList.add('open');
};
App.toggleMoreMenu = function(ev, projId) {
  ev.stopPropagation();
  this._ensureHdrMenuClose();
  const m = document.getElementById('hdrMoreMenu');
  const open = m && m.classList.contains('open');
  this.closeHdrMenus();
  if (m && !open) m.classList.add('open');
};
App.closeHdrMenus = function() {
  document.querySelectorAll('.hdr-menu.open').forEach(m => m.classList.remove('open'));
};
App._ensureHdrMenuClose = function() {
  if (this._hdrMenuCloseBound) return;
  this._hdrMenuCloseBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hdr-menu')) App.closeHdrMenus();
  });
};

App.renderProject = function() {
  if (!this.currentProjectId) {
    // Show first project
    if (DATA.projects.length > 0) {
      this.currentProjectId = DATA.projects[0].id;
    } else {
      document.getElementById('page-project').innerHTML = '<div class="empty-task-list"><div class="empty-task-list-icon">📁</div>請先建立專案</div>';
      return;
    }
  }
  const proj = this.getProj(this.currentProjectId);
  if (!proj) {
    document.getElementById('page-project').innerHTML = '<div class="empty-task-list">專案不存在</div>';
    return;
  }

  const html = `
    ${this.buildProjectHeaderHtml()}
    <div class="view-tabs-bar">${this.buildProjectViewTabsHtml()}</div>

    ${this.renderProjectDashboard(proj)}
  `;
  document.getElementById('page-project').innerHTML = html;
};

App.renderProjectDashboard = function(proj) {
  const allTasks = this.getTasksOf(proj.id);
  const today = D.today();
  // 序基準（同源）：orderedProjectTasks 日期序（dispStart 升序、待排殿後）、排除 deleted、含 done（done 佔號）。外層+前置下拉共用。
  const ordered = this.orderedProjectTasks(proj.id);
  // 第二刀-A：篩選只在 render 局部過濾。filtered 是 const 局部變數，絕不回寫 orderedProjectTasks 本體
  // （本體被 _seqOf／前置下拉共用，需維持全量）。下游 counts／預覽切點／visible／firstUndated 全吃 filtered。
  const taskFilter = this.getTaskFilter(proj.id);
  const hasFilter = ['stages', 'owners', 'urg', 'status'].some(k => taskFilter[k] && taskFilter[k].size > 0);   // 2甲：任一維 Set 非空＝篩選啟用
  const filtered = applyTaskFilter(ordered, taskFilter);
  const activeCount = filtered.filter(t => t.status !== 'done').length;
  const doneCount = filtered.length - activeCount;
  const deletedTasks = allTasks.filter(t => t._deleted).sort((a, b) => (b._deletedAt || '').localeCompare(a._deletedAt || ''));

  // 預覽切到「第 15 個未完成」位置（done 不佔額度、夾在中間者原位保留）
  const PREVIEW_ACTIVE_LIMIT = 15;
  this._projectExpanded = this._projectExpanded || {};
  const isExpanded = !!this._projectExpanded[proj.id];
  let activeSeen = 0, cutIdx = filtered.length - 1;
  for (let p = 0; p < filtered.length; p++) {
    if (filtered[p].status !== 'done') {
      activeSeen++;
      if (activeSeen === PREVIEW_ACTIVE_LIMIT) { cutIdx = p; break; }
    }
  }
  const overflow = activeCount > PREVIEW_ACTIVE_LIMIT;
  const showAll = hasFilter || isExpanded || !overflow;   // 2甲：篩選啟用 → 不套 15 筆預覽上限，顯示全部篩後集
  const visible = showAll ? filtered : filtered.slice(0, cutIdx + 1);

  this._doneVisible = this._doneVisible || {};
  const doneVisible = !!this._doneVisible[proj.id];

  this._toScheduleVisible = this._toScheduleVisible || {};
  const toScheduleVisible = this._toScheduleVisible[proj.id] !== false;   // 待排區預設展開（未設過 = true）
  // 待排分隔：orderTasksByDispStart 已把空 dispStart 殿後 → visible 尾段連續；找第一筆切點
  const firstUndated = visible.findIndex(t => getEffectiveSchedule(t).start === '');
  const tsCollapsed = toScheduleVisible ? '' : 'collapsed';
  let activeListInner;
  if (visible.length === 0) {
    activeListInner = hasFilter
      ? '<tr class="empty-task-list bar-row"><td colspan="10"><div class="empty-task-list-icon">🔍</div>無符合篩選條件的任務</td></tr>'
      : '<tr class="empty-task-list bar-row"><td colspan="10"><div class="empty-task-list-icon">📝</div>尚無待辦任務</td></tr>';
  } else if (firstUndated < 0) {
    activeListInner = visible.map(t => this.buildTaskRowHtml(t)).join('');
  } else {
    const datedRows = visible.slice(0, firstUndated).map(t => this.buildTaskRowHtml(t)).join('');
    const undatedRows = visible.slice(firstUndated).map(t => this.buildTaskRowHtml(t, 'undated')).join('');
    const undatedCount = visible.length - firstUndated;
    activeListInner = datedRows +
      `<tr class="toschedule-bar bar-row ${tsCollapsed}" onclick="App.toggleToScheduleVisible('${proj.id}')"><td colspan="10"><div class="bar-inner">
            <span class="done-head-chevron">▼</span>
            <span class="done-head-title">待排</span>
            <span class="done-head-count">${undatedCount}</span>
            <span class="done-toggle-note">${toScheduleVisible ? '未填開始日（補開始日或前置即排入）' : '已收合'}</span>
          </div></td></tr>` +
          undatedRows;
  }

  return `    ${this.buildProjKpiHtml(proj)}

    <div class="proj-dash-grid">
      ${this.buildProjStagesHtml(proj)}
      ${this.buildProjDeptHtml(proj)}
    </div>

    <div class="proj-grid">
      <div>
        <!-- Active tasks -->
        <div class="task-list-card">
          <div class="tlc-head">
            <span class="tlc-title">待辦任務</span>
            <span class="tlc-count">${activeCount}</span>
            <button class="tb-action" onclick="App.openNewTaskDialog('${proj.id}')" style="margin-left:auto;">＋ 新增任務</button>
          </div>
          ${this.buildTaskFilterBar(proj.id)}
          <!-- 第二刀-A 已接線：applyTaskFilter(ordered, getTaskFilter) 四 Set 過濾 → filtered，下游 counts／預覽／visible 全吃 filtered；獨立過濾不碰 filterTasks（看板專用）。 -->
          <!-- subgrid 步2：單一 .task-grid 父，header/done-bar/各列直屬，欄軌共用自動算；hide-done/ts-collapsed 摺疊 class 烤在父上。 -->
          <table id="activeTaskList" class="data-table task-table${doneVisible ? '' : ' hide-done'}${toScheduleVisible ? '' : ' ts-collapsed'}">
            <thead>
              <tr class="task-row-header">
                <th class="col-num">序</th>
                <th class="col-mid">階段</th>
                <th class="col-flex">任務</th>
                <th class="col-mid">進度%</th>
                <th class="col-mid">負責人</th>
                <th class="col-mid">前置任務</th>
                <th class="col-num">狀態</th>
                <th class="col-mid">預計時程（開始→結束）</th>
                <th class="col-num">餘裕（天）</th>
                <th class="col-num">截止日</th>
              </tr>
            </thead>
            <tbody>
            ${doneCount > 0 ? `
            <tr class="done-toggle-bar bar-row ${doneVisible ? '' : 'collapsed'}" onclick="App.toggleDoneVisible('${proj.id}')"><td colspan="10"><div class="bar-inner">
              <span class="done-head-chevron">▼</span>
              <span class="done-head-title">已完成</span>
              <span class="done-head-count">${doneCount}</span>
              <span class="done-toggle-note">${doneVisible ? '原位顯示（灰字刪除線）' : '已收合'}</span>
            </div></td></tr>` : ''}
            ${activeListInner}
            </tbody>
          </table>
          ${!showAll ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              展開全部（還有 ${activeCount - PREVIEW_ACTIVE_LIMIT} 筆）▼
            </button>
          </div>` : (isExpanded && overflow ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              收起（只顯示前 ${PREVIEW_ACTIVE_LIMIT} 個未完成）▲
            </button>
          </div>` : '')}
          <div class="list-foot">
            <input id="quickAddTask" placeholder="＋ 快速新增任務（按 Enter 完成）" data-edit
                   onkeydown="if(event.key==='Enter') App.quickAddTask('${proj.id}', this)">
            <button data-edit onclick="App.quickAddTask('${proj.id}', document.getElementById('quickAddTask'))">新增</button>
          </div>
        </div>


        ${deletedTasks.length > 0 ? `
        <div class="done-section deleted-section collapsed" id="deletedSection">
          <div class="done-head" onclick="document.getElementById('deletedSection').classList.toggle('collapsed')">
            <span class="done-head-title">🗑 已刪除</span>
            <span class="done-head-count" style="background:var(--terracotta-l); color:var(--terracotta);">${deletedTasks.length}</span>
            <span class="done-head-chevron">▼</span>
          </div>
          <div class="done-list">
            ${deletedTasks.map(t => `<div class="deleted-row" style="display:flex; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid var(--rule);">
              <div style="flex:1; min-width:0;">
                <div style="font-size:12.5px; text-decoration:line-through; color:var(--ink3);">${U.esc(t.name)}</div>
                <div style="font-size:10.5px; color:var(--ink4); margin-top:2px;">刪除於 ${t._deletedAt ? D.fmt(t._deletedAt, 'ymd') : '—'}</div>
              </div>
              <button class="tb-action ghost" onclick="App.restoreTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--sage-700);">↺ 還原</button>
              <button class="tb-action ghost" onclick="App.permanentDeleteTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--terracotta);">永久刪除</button>
            </div>`).join('')}
          </div>
          <div class="done-clear-tip">
            💡 已刪除任務保留 14 天，過期自動清除
          </div>
        </div>` : ''}
      </div>
    </div>
`;
};

// ─── 待辦清單篩選器 UI 殼（§塊3）──────────────────────────────
// 膠囊 chip 多選 + 展開面板。本批只做 UI：勾選只更新 state Set + 切 DOM 樣式，
// 不過濾清單（接線見 renderProjectDashboard 內 TODO，回家碰 filterTasks Node 驗）。
// state per-proj，不入 localStorage；面板開合真實來源是 DOM .open class，不在 state 存一份。
App.getTaskFilter = function(projId) {
  this._taskFilter = this._taskFilter || {};
  if (!this._taskFilter[projId])
    this._taskFilter[projId] = { stages: new Set(), owners: new Set(), urg: new Set(), status: new Set() };
  return this._taskFilter[projId];
};

// 該專案 task 的 distinct 負責人（排序）。階段選項另用 getProjectStages 的 name。
App.taskOwnerOptions = function(projectId) {
  const set = new Set();
  (DATA.tasks || []).forEach(t => {
    if (t.project === projectId && !t._deleted && typeof t.owner === 'string' && t.owner.trim())
      set.add(t.owner.trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
};

App.buildTaskFilterBar = function(projId) {
  const seenStage = new Set();
  const stageOpts = this.getProjectStages(projId)
    .filter(s => { if (seenStage.has(s.name)) return false; seenStage.add(s.name); return true; })
    .map(s => ({ value: s.name, label: s.name }));
  const ownerOpts = this.taskOwnerOptions(projId).map(o => ({ value: o, label: o }));
  const urgOpts = ['high', 'medium', 'low'].map(v => ({ value: v, label: URGENCY_LABELS_ZH[v] }));
  const statusOpts = ['pending', 'wip', 'done', 'hold'].map(v => ({ value: v, label: STATUS_LABELS_ZH[v] }));
  return `<div class="task-filter-bar">
    ${this.buildTaskFilterChip(projId, 'stages', '階段', stageOpts)}
    ${this.buildTaskFilterChip(projId, 'owners', '負責人', ownerOpts)}
    ${this.buildTaskFilterChip(projId, 'urg', '緊急程度', urgOpts)}
    ${this.buildTaskFilterChip(projId, 'status', '狀態', statusOpts)}
    <button class="tf-clear-all" onclick="App.clearTaskFilter('${projId}')">全部清除</button>
  </div>`;
};

App.buildTaskFilterChip = function(projId, key, label, options) {
  const sel = this.getTaskFilter(projId)[key];
  const selArr = [...sel];
  const chipText = selArr.length === 0 ? label
    : selArr[0] + (selArr.length > 1 ? ` +${selArr.length - 1}` : '');
  const boxes = options.length ? options.map(o =>
    `<label class="tf-opt${sel.has(o.value) ? ' on' : ''}">
      <input type="checkbox" value="${U.esc(o.value)}"${sel.has(o.value) ? ' checked' : ''}
        onchange="App.toggleTaskFilterOpt('${projId}','${key}',this.value,this.checked)">
      <span>${U.esc(o.label)}</span>
    </label>`).join('') : '<div class="tf-empty">無選項</div>';
  return `<div class="tf-chip-wrap" data-key="${key}">
    <button class="tf-chip tf-${key}${selArr.length ? ' active' : ''}" data-label="${U.esc(label)}"
      onclick="App.toggleTaskFilterPanel('${projId}','${key}')">
      <span class="tf-chip-label">${U.esc(chipText)}</span><span class="tf-caret">▾</span>
    </button>
    <div class="tf-panel">
      <div class="tf-opts">${boxes}</div>
      <div class="tf-panel-foot">
        <button onclick="App.clearTaskFilterKey('${projId}','${key}')">清除</button>
        <button onclick="App.toggleTaskFilterPanel('${projId}','${key}')">套用</button>
      </div>
    </div>
  </div>`;
};

// 面板開合:同時只開一顆,純 toggle .open class（不重繪）
App.toggleTaskFilterPanel = function(projId, key) {
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (!wrap) return;
  const willOpen = !wrap.classList.contains('open');
  document.querySelectorAll('.tf-chip-wrap.open').forEach(w => w.classList.remove('open'));
  if (willOpen) wrap.classList.add('open');
  else this.renderProject();   // 選項2：關閉面板＝套用篩選（套用鈕/再點 chip 都走這條）→ 重繪待辦列吃 getTaskFilter
};

// chip 勾選:更新 Set + 即時改 DOM 樣式/膠囊文字（本批不觸發過濾）
App.toggleTaskFilterOpt = function(projId, key, value, checked) {
  const sel = this.getTaskFilter(projId)[key];
  checked ? sel.add(value) : sel.delete(value);
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (!wrap) return;
  wrap.querySelectorAll('.tf-opt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  const chip = wrap.querySelector('.tf-chip');
  const selArr = [...sel];
  chip.classList.toggle('active', selArr.length > 0);
  wrap.querySelector('.tf-chip-label').textContent =
    selArr.length === 0 ? chip.dataset.label
    : selArr[0] + (selArr.length > 1 ? ` +${selArr.length - 1}` : '');
};

App.clearTaskFilterKey = function(projId, key) {
  this.getTaskFilter(projId)[key].clear();
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (wrap) wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  this.renderProject();   // 選項2：清完該維 Set → 重繪套用（重讀空 Set＝該維全顯示），面板隨整頁重繪收合
};

App.clearTaskFilter = function(projId) {
  const f = this.getTaskFilter(projId);
  ['stages', 'owners', 'urg', 'status'].forEach(k => f[k].clear());
  document.querySelectorAll('.task-filter-bar input[type=checkbox]').forEach(cb => {
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  this.renderProject();   // 選項2：四維 Set 全清 → 重繪套用（全部重讀空 Set＝清單全顯示）
};

// ─── 專案 KPI/階段/部門/任務 CRUD（taskDisplayProgress 留 core）───
// 第一原則「資料缺損容忍」:全計數排除 _deleted;分母 0 顯示 —;缺欄位優雅降級,不報錯不出 NaN。
// 推導理由(混合制):卡片格子小 → 公式+降級說明放原生 title tooltip(pm-core 無 tooltip 元件,先例:PDCA 預期進度卡);
//                  關鍵降級數字(無日期件數/逾期天數)放卡片副標常駐顯示,不藏 hover。
App.buildProjKpiHtml = function(proj) {
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);
  const total = tasks.length;
  const today = D.today();

  const done = tasks.filter(t => t.status === 'done').length;
  const donePct = total > 0 ? Math.round(done / total * 100) : null;   // 分母 0 → null → 顯示 —
  const wip = tasks.filter(t => t.status === 'wip').length;

  // DELAYED:未完成且有效結束日<今天(不含擱置=刻意凍結非延遲)。
  // 無日期者不列入(不知 deadline 不能說延遲),另計 noEnd 常駐顯示於副標。
  let delayed = 0, noEnd = 0;
  tasks.forEach(t => {
    if (t.status === 'done' || t.status === 'hold') return;
    if (isTaskDelayed(t, today)) { delayed++; return; }
    if (!getEffectiveSchedule(t).end) noEnd++;
  });

  // OVERALL:件數等權(拍板:不用 estHours 加權,粗衍生值不可靠)。
  // 進度取值共用 taskDisplayProgress(階段進度卡同口徑):無數值→狀態折算(done=100、其餘=0),
  // 排除法會讓「整體」變成子集平均、名不符實;0 折算保守但誠實。
  const overall = total > 0 ? Math.round(tasks.reduce((s, t) => s + taskDisplayProgress(t), 0) / total) : null;

  // WORKDAYS LEFT:終點優先序 可販日(pdcaData.targetDate) > 最晚任務有效結束日 > 未設定。
  // workdaysBetween 含頭含尾、s>e 回 0 → 逾期須先比日期,逾期天數反向算再 -1(=終點次一工作日起算)。
  const targetDate = (proj.pdcaData && proj.pdcaData.targetDate) || '';
  let endDate = targetDate;
  if (!endDate) {
    tasks.forEach(t => { const e = getEffectiveSchedule(t).end; if (e && e > endDate) endDate = e; });
  }
  let wdLeft = null, overdueWd = 0;
  if (endDate) {
    if (new Date(endDate) < today) { wdLeft = 0; overdueWd = Math.max(0, D.workdaysBetween(endDate, today) - 1); }
    else wdLeft = D.workdaysBetween(today, endDate);
  }

  // dataTip 格式「標題|內文|內文…」走 initTooltip;stack=true 時 sub 改獨立第二行(.stat-sub),非 stack 維持 inline span
  const card = (label, value, sub, dataTip, warn, stack, tone) => `
    <div class="stat${warn ? ' kpi-warn' : ''}${stack && sub ? ' kpi-stack' : ''}${tone ? ' ' + tone : ''}"${dataTip ? ` data-tip="${U.esc(dataTip)}"` : ''}>
      <div class="stat-num">${value}</div>
      <div class="stat-label">${label}${sub && !stack ? ` <span class="stat-pct">${sub}</span>` : ''}</div>
      ${stack && sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;

  return `<div class="stats-row proj-kpi">
    ${card('TASKS', total, '',
      '任務總數|這個專案的所有工作項目數(不含已刪除)', false, false, 'kpi-tone-task')}
    ${card('DONE', done, donePct === null ? '—' : donePct + '%',
      '完成件數|已完成的工作項目數|完成% = 已完成 ÷ 任務總數', false, true, 'kpi-tone-done')}
    ${card('IN-PROGRESS', wip, '',
      '進行中|正在進行、還沒完成的項目數', false, false, 'kpi-tone-wip')}
    ${card('DELAYED', delayed, noEnd > 0 ? `另${noEnd}件無日期` : '',
      '延遲件數|已過結束日但還沒完成的項目數|(暫停的不算;沒設日期的另計)',
      delayed > 0, false, 'kpi-tone-delayed')}
    ${card('OVERALL', overall === null ? '—' : overall + '%', '',
      '整體完成度|所有項目的平均完成度,每項等重、不看工時', false, false, 'kpi-tone-overall')}
    ${card('WORKDAYS LEFT', wdLeft === null ? '—' : wdLeft,
      wdLeft === null ? '未設定' : (overdueWd > 0 ? `已逾期${overdueWd}工作日` : `至${endDate}`),
      '剩餘工作天|到專案結束日還剩幾個上班日(不含週末假日)',
      overdueWd > 0, false, 'kpi-tone-days')}
  </div>`;
};

// ─── 專案階段進度卡(圖1 第二塊):純顯示層,讀 getProjectStages 不改它 ───
// 完成% = 該階段任務進度平均(件數等權,taskDisplayProgress 與 KPI OVERALL 同口徑)。
// (b) 案:不動已驗的 getProjectStages,完成%在此 re-filter 自算;回家有 node 後揉回一次收斂(已記待辦)。
// 推導理由(混合制):卡底常駐公式一行(PDCA pr-formula 模式);每列 data-tip hover 白話說明(走 initTooltip)。
// 2.2KW 另案不做子分區(不寫死 "2.2" 字串),數字前綴排序自然排尾;等真實 Sheet 資料核對後再定。
App.buildProjStagesHtml = function(proj) {
  const stages = this.getProjectStages(proj.id);
  if (stages.length === 0 || (stages.length === 1 && stages[0].name === '未分階段')) {
    return `<div class="proj-stages-card">
      <div class="proj-stages-head">階段進度</div>
      <div class="proj-stages-empty">此專案未分階段(同步專案會自動帶入 PLM 階段)</div>
    </div>`;
  }
  const stageOf = (t) => (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : '未分階段';
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);

  // 日期區間：起迄兩行標籤、完整 YYYY/MM/DD；空值顯 –
  const rangeStr = (s, e) => {
    const sLine = s ? `<span class="stage-date-lbl">起</span> ${D.fmt(s, 'ymd')}` : '<span class="stage-date-lbl">起</span> –';
    const eLine = e ? `<span class="stage-date-lbl">迄</span> ${D.fmt(e, 'ymd')}` : '<span class="stage-date-lbl">迄</span> –';
    return `${sLine}<br>${eLine}`;
  };

  const rowHtml = (st) => {
    const ts = tasks.filter(t => stageOf(t) === st.name && (t.variant || null) === st.variantId);
    const pct = ts.length > 0
      ? Math.round(ts.reduce((s, t) => s + taskDisplayProgress(t), 0) / ts.length)
      : null;
    const tier = pct === null ? 's0' : (pct >= 100 ? 's100' : (pct >= 50 ? 's50' : (pct > 0 ? 's1' : 's0')));
    const dateStr = rangeStr(st.earliestStart, st.latestEnd);
    const dateCls = (st.earliestStart || st.latestEnd) ? '' : ' stage-date-empty';
    return `<div class="stage-row">
      <div class="stage-name">
        <div class="stage-name-txt">${U.esc(st.name)}</div>
        <div class="stage-date${dateCls}">${dateStr}</div>
      </div>
      <div class="stage-bar"><div class="stage-bar-fill ${tier}" style="width:${pct || 0}%"></div></div>
      <div class="stage-pct ${tier}">${pct === null ? '—' : pct + '%'}</div>
      <div class="stage-cnt">${st.doneCount}/${st.itemCount}</div>
    </div>`;
  };

  const colHead = `<div class="stage-colhead">
      <div class="stage-name"></div><div class="stage-bar-spacer"></div>
      <div class="stage-pct-h">完成</div><div class="stage-cnt-h">完成/件數</div>
    </div>`;

  // 分塊：proj.variants 有值→按案別分塊；無→單組顯示(其他專案維持原樣)
  const variantList = (proj.variants && proj.variants.length) ? proj.variants : null;
  let blocks;
  if (variantList) {
    blocks = variantList.map((vr, i) => {
      const gs = stages.filter(st => st.variantId === vr.id);
      if (gs.length === 0) return '';
      const cap = `<div class="stage-group-cap"><span class="stage-cap-pill cap-${i % 3}">${U.esc(vr.name)}</span><span class="stage-cap-rule"></span></div>`;
      return cap + colHead + gs.map(rowHtml).join('');
    }).join('');
    const noVar = stages.filter(st => !st.variantId);
    if (noVar.length) blocks += colHead + noVar.map(rowHtml).join('');
  } else {
    blocks = colHead + stages.map(rowHtml).join('');
  }

  return `<div class="proj-stages-card">
    <div class="proj-stages-head">階段進度 <span class="proj-stages-count">${stages.length} 個階段</span></div>
    ${App.buildHintBox({
      key: 'stage-progress', icon: 'ti-stairs', title: '階段進度怎麼算', summary: '完成%、件數、日期的計算方式', collapsed: true,
      bodyHtml:
        '<div class="ht-rule ht-start"><b>完成%</b><span>將這階段「所有任務的進度」加起來算平均（每個任務的影響力都一樣）。任務有寫進度就依比例計算；沒寫進度的話，已完成的算 100%、沒完成的算 0%。例：階段內有 4 個任務，進度分別是 100 / 50 / 0 / 0，平均下來該階段進度就是 38%。</span></div>' +
        '<div class="ht-rule ht-dur"><b>件數</b><span>顯示「已完成的任務數 / 總任務數」。例：5/16 代表這個階段總共有 16 個任務，目前已經搞定 5 個。</span></div>' +
        '<div class="ht-rule ht-end"><b>日期</b><span>自動抓取這階段裡「最早開始」到「最晚結束」的任務時間，代表整個階段預計要跑的時間跨度。</span></div>' +
        '<div class="ht-rule ht-down"><b>同名階段分開算</b><span>主專案和子專案即使有同名的階段（例如都叫「手工機」），系統也會貼心地把它們各自獨立成一桶、分開計算，絕對不會混在一起。</span></div>'
    })}
    ${blocks}
  </div>`;
};

// ─── 專案部門負荷卡(圖1 第三塊):純顯示層 ───
// 分組三層降級(第一原則:資料缺損容忍):
//   有任一 subgroup → 依子群組(個別空→「未指派」);全無 subgroup 有 owner → 依負責人(標示於標題);
//   兩者全無 → 收斂一句話。動態去重,有什麼列什麼——不寫死部門名單(舊系統 deptKeys/HIDDEN/ORDER 不照抄)。
// owner 不拆頓號多人:拆了一件算多件、總數失真(舊系統有拆,不照抄);公式小字註明依原值分組。
// 每任務恰好進一段(優先序):done → delayed(同 KPI 口徑:非hold且有效end<today) → wip → todo(=未開始+擱置)。
App.buildProjDeptHtml = function(proj) {
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);
  const hasVal = (v) => typeof v === 'string' && v.trim();
  const hasDept = tasks.some(t => hasVal(t.dept));
  const hasSubgroup = tasks.some(t => hasVal(t.subgroup));
  const hasOwner = tasks.some(t => hasVal(t.owner));
  if (tasks.length === 0 || (!hasDept && !hasSubgroup && !hasOwner)) {
    return `<div class="proj-stages-card proj-dept-card">
      <div class="proj-stages-head">部門負荷</div>
      <div class="proj-stages-empty">無部門/負責人資料(任務有「子群組」或「負責人」欄位即可顯示)</div>
    </div>`;
  }
  const field = hasDept ? 'dept' : (hasSubgroup ? 'subgroup' : 'owner');
  const mode = hasDept ? '部門' : (hasSubgroup ? '子群組' : '負責人');
  // D-2b：dept 模式下 task.dept 存 id，建「id→部門名」表供顯示（未指派/查無→保留字面）
  const idToName = {};
  (proj.depts || []).forEach(d => { idToName[d.id] = d.name; });
  const today = D.today();

  // 動態去重分組;hold 過期不算 delayed(同 KPI),歸 todo 並另計 hold(業務統計保留,目前 UI 未顯示)
  const groups = {};
  tasks.forEach(t => {
    const k = hasDept ? (idToName[t.dept] || t.dept || '未指派') : (hasVal(t[field]) ? t[field].trim() : '未指派');
    const g = groups[k] || (groups[k] = { done: 0, wip: 0, delayed: 0, todo: 0, hold: 0, total: 0 });
    g.total++;
    if (t.status === 'done') { g.done++; return; }
    if (isTaskDelayed(t, today)) { g.delayed++; return; }   // 逾期口徑單一來源（已排 done/hold）
    if (t.status === 'wip') g.wip++;
    else { g.todo++; if (t.status === 'hold') g.hold++; }
  });

  // 排序:總件數降冪;「未指派」固定最後(無寫死順序名單)
  const entries = Object.entries(groups).sort((a, b) =>
    ((a[0] === '未指派') - (b[0] === '未指派')) || (b[1].total - a[1].total));

  const rows = entries.map(([name, g]) => {
    const seg = (n, cls) => n > 0 ? `<div class="dept-seg ${cls}" style="width:${(n / g.total * 100).toFixed(1)}%"></div>` : '';
    return `<div class="dept-row">
      <div class="dept-name">${U.esc(name)}</div>
      <div class="dept-bar">${seg(g.done, 'done')}${seg(g.delayed, 'delayed')}${seg(g.wip, 'wip')}${seg(g.todo, 'todo')}</div>
      <div class="dept-cnt">${g.total} 件</div>
    </div>`;
  }).join('');

  // 逾期迷你清單:口徑同上方 delayed(非hold、有效迄日<today、非done),前5筆逾期天數降冪
  const overdue = tasks.filter(t => isTaskDelayed(t, today))
    .map(t => ({ t, days: -D.daysBetween(today, new Date(getEffectiveSchedule(t).end)) }))
    .sort((a,b) => b.days - a.days).slice(0, 5);
  const overdueHtml = overdue.length === 0 ? '' : `
    <div class="dept-overdue">
      <div class="dept-overdue-head">
        <span class="dept-overdue-title">逾期任務</span>
        <span class="dept-overdue-count">${overdue.length}</span>
      </div>
      ${overdue.map(({t, days}) => `
        <div class="dept-overdue-row" onclick="App.openTaskModal('${t.id}')">
          <div class="dept-overdue-name">
            <div>${U.esc(t.name)}</div>
            <div class="dept-overdue-sub">${U.esc(t.stage || '')} ${t.subgroup ? '/ ' + U.esc(t.subgroup) : ''}</div>
          </div>
          <div class="dept-overdue-days">逾期 ${days} 天</div>
        </div>`).join('')}
    </div>`;

  return `<div class="proj-stages-card proj-dept-card">
    <div class="proj-stages-head dept-head">
      <span>部門負荷${mode === '負責人' ? '(依負責人)' : ''} <span class="proj-stages-count">${entries.length} 個${mode === '負責人' ? '負責人' : '部門'}</span></span>
      <div class="dept-legend">
        <span class="dept-legend-item"><span class="dept-legend-dot done"></span>完成</span>
        <span class="dept-legend-item"><span class="dept-legend-dot delayed"></span>延遲</span>
        <span class="dept-legend-item"><span class="dept-legend-dot wip"></span>進行中</span>
        <span class="dept-legend-item"><span class="dept-legend-dot todo"></span>待辦</span>
      </div>
    </div>
    ${App.buildHintBox({
      key: 'dept-load', icon: 'ti-users-group', title: '部門負荷怎麼看', summary: '掌握各部門的工作量與四種任務狀態', collapsed: true,
      bodyHtml:
        '<div class="ht-rule ht-start"><b>怎麼分組</b><span>系統會自動依照任務的「負責部門」來分類，幫你盤點每個團隊手上有多少工作、目前進度到哪。如果任務沒有設定部門，就會統一收納在「未指派」。</span></div>' +
        '<div class="ht-rule ht-dur"><b>四種狀態</b><span>每項任務只會落入一種狀態：已完成 / 延遲 / 進行中 / 待辦。下方的進度條就是依照這四種狀態的比例來上色的喔！</span></div>' +
        '<div class="ht-rule ht-end"><b>什麼算延遲</b><span>只要任務「還沒完成」、「沒有被擱置」、「有設定完成日」，而且「完成日已經過了今天」，系統就會判定為延遲。沒設完成日的任務因為不知道何時該完工，所以不算延遲；「擱置中」則是刻意凍結的任務，也不會算進延遲裡。</span></div>' +
        '<div class="ht-rule ht-down"><b>待辦包含什麼</b><span>「待辦」包含了：還沒有開始做的任務、被刻意擱置的任務，以及那些「沒有設定完成日」的任務，都會貼心地先幫你收在這裡。</span></div>'
    })}
    ${rows}
    ${overdueHtml}
  </div>`;
};

App.toggleProjectExpanded = function(projId) {
  this._projectExpanded = this._projectExpanded || {};
  this._projectExpanded[projId] = !this._projectExpanded[projId];
  this.renderProject();
};

App.toggleDoneVisible = function(projId) {
  this._doneVisible = this._doneVisible || {};
  this._doneVisible[projId] = !this._doneVisible[projId];
  this.renderProject();
};

App.toggleToScheduleVisible = function(projId) {
  this._toScheduleVisible = this._toScheduleVisible || {};
  // 預設展開：未設過視為 true，第一次點 → false（收合）
  const cur = this._toScheduleVisible[projId] !== false;
  this._toScheduleVisible[projId] = !cur;
  this.renderProject();
};

// ─── Soft delete / restore ───
App.restoreTask = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  delete t._deleted;
  delete t._deletedAt;
  Storage.save();
  this.refreshAll();
  U.toast('↺ 已還原');
};

App.permanentDeleteTask = function(id) {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '永久刪除？', msg: '此操作無法復原。', okText: '永久刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.tasks = DATA.tasks.filter(t => t.id !== id);
      if (DATA.schedule && DATA.schedule.items) {
        DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
      }
      Storage.save();
      App.refreshAll();
      U.toast('🗑 已永久刪除');
    },
  });
};

// 自動清除逾期 14 天的軟刪除任務（在 load 時呼叫）
App.cleanExpiredDeletedTasks = function() {
  const cutoff = D.addDays(D.today(), -14);
  const before = DATA.tasks.length;
  DATA.tasks = DATA.tasks.filter(t => {
    if (!t._deleted) return true;
    const delDate = new Date(t._deletedAt || 0);
    return delDate > cutoff; // 14 天內保留
  });
  if (before !== DATA.tasks.length) {
    Storage.save();
  }
};

App.buildTaskRowHtml = function(t, cls) {
  const sch = getEffectiveSchedule(t);
  const cat = t.taskType === 'milestone' ? 'milestone' : (t.category || 'deep');  // M2-T3：milestone 優先於 category，修 WBS 里程碑誤顯「會議」tag
  const isPreview = !DATA.settings.previewWeeks ? false : (
    sch.end && D.daysBetween(D.today(), new Date(sch.end)) > 7 && D.daysBetween(D.today(), new Date(sch.end)) <= (DATA.settings.previewWeeks * 7)
  );
  let dlText = '—';
  let dlClass = '';
  if (sch.end) {
    const days = D.daysBetween(D.today(), new Date(sch.end));
    if (days < 0)      { dlText = `逾${D.workdaysBetween(sch.end, D.today()) - 1}`; dlClass = 'overdue'; }      // 短格式（截止欄窄）：逾41 / 今日 / 明日 / 2天 / 7/10
    else if (days === 0) { dlText = '今日'; dlClass = 'near'; }
    else if (days === 1) { dlText = '明日'; dlClass = 'near'; }
    else if (days <= 3)  { dlText = `${days}天`; dlClass = 'near'; }
    else                 { dlText = D.fmt(new Date(sch.end), 'md'); }
  }

  // 開始→完成 區間（純顯示，讀 sch.start/sch.end；任一空顯示 '—'。日期格式沿用 D.fmt(date,'md')）
  const rangeText = (sch.start && sch.end)
    ? `${D.fmt(new Date(sch.start), 'md')} → ${D.fmt(new Date(sch.end), 'md')}`
    : '—';
  // §6.5 塊四：負工期（完成日早於開始日 或 工期≤0）→ 整列標紅警示；milestone(工期恆1)不誤觸發。
  const _negDur = (t.taskType !== 'milestone')
    && ((sch.start && sch.end && new Date(sch.end) < new Date(sch.start))
        || (parseFloat(t.durationDays) <= 0));
  // 來源中文標籤（讀 getEffectiveSchedule 的 startSource；'none' 留空不顯示）
  const SRC_LABELS = { planned: '預計（未排程）', scheduled: '排程算出', override: '手釘錨點', actual: '實際', manual: '手填' };
  const srcLabel = SRC_LABELS[sch.startSource] || '';

  // 進度：taskDisplayProgress 回 0-100；100% 成功色、其餘次要色（2 態，不用階段卡 s0/s1/s50/s100 四階）
  const pct = taskDisplayProgress(t);
  const barColor = pct >= 100 ? 'var(--sage-500)' : 'var(--ink4)';

  // 狀態徽章：延遲（overdue 且非 done/非 hold）優先於 status；其餘讀 STATUS_LABELS_ZH。色用現成 .rp-status 修飾
  const isDelayed = dlClass === 'overdue' && t.status !== 'done' && t.status !== 'hold';
  const statusCls = isDelayed ? 'late' : (t.status === 'done' ? 'done' : (t.status === 'wip' ? 'wip' : ''));
  const statusTxt = isDelayed ? '延遲' : (STATUS_LABELS_ZH[t.status] || t.status || '');

  // 餘裕：sch.end − 今天(工作日,含頭尾故 -1);done 或無 end 顯 '—'
  let slackTxt;
  if (t.status === 'done' || !sch.end) {
    slackTxt = '—';
  } else {
    const today = D.today();
    today.setHours(0, 0, 0, 0);
    if (new Date(sch.end) < today) {
      slackTxt = '超' + (D.workdaysBetween(sch.end, today) - 1) + '天';
    } else {
      slackTxt = '餘' + (D.workdaysBetween(today, sch.end) - 1) + '天';
    }
  }

  return `<tr class="task-row ${t.status === 'done' ? 'done' : ''} ${_negDur ? 'neg-dur' : ''} ${cls || ''}" data-taskid="${t.id}" onclick="App.openTaskModal('${t.id}')">
    <td class="col-num">${_negDur ? '<span class="neg-flag" data-tip="負工期|工期為負數，請確認是否調整">⚠</span>' : ''}<span style="font-family:var(--mono); font-size:11px; color:var(--ink4);">${App._seqOf(t.id)}</span></td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.stage || '—')}</span></td>
    <td class="col-flex" title="${U.esc(t.name)}">
      <div class="task-info">
        <div class="task-name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${U.esc(t.name)}
          ${isPreview ? '<span class="preview-tag">📅 兩週預告</span>' : ''}
        </div>
      </div>
    </td>
    <td class="col-mid">
      <div style="display:flex; justify-content:flex-start; align-items:center; gap:6px;">
        <div class="stage-bar" style="border:1px solid var(--rule2);"><div class="stage-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <span style="font-family:var(--mono); font-size:10.5px; color:var(--ink3); min-width:30px; text-align:right;">${pct}%</span>
      </div>
    </td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.owner || '—')}</span></td>
    <td class="col-mid task-pred" data-preds="${parsePredecessors(t.predecessor).map(p => p.dep).join(',')}" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()" title="${U.esc(predTitleOf(t.predecessor))}">${U.esc(prettyPredecessor(t.predecessor))}</td>
    <td class="col-num"><span class="rp-status ${statusCls}">${statusTxt}</span></td>
    <td class="col-mid">
      <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
        <span class="task-range${_negDur ? ' neg' : ''}"${_negDur ? ' data-tip="負工期|工期為負數，請確認是否調整"' : ''}>${rangeText}</span>
        ${srcLabel ? `<span class="task-tag tag-other">${srcLabel}</span>` : ''}
      </div>
    </td>
    <td class="col-num"><span style="font-style:italic; color:var(--ink4); font-size:12px;">${slackTxt}</span></td>
    <td class="col-num"><span class="task-deadline ${dlClass}" style="font-size:12px;">${dlText}</span></td>
  </tr>
  <tr class="dt-insert-row"><td colspan="10" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="event.stopPropagation(); App._insertAfterId='${t.id}'; App.openNewTaskDialog('${t.project}');"><i class="ti ti-plus"></i></button></div></td></tr>`;
};

// 看板窄卡（§1.7）：dlClass/dlText、進度、前置數皆照抄 buildTaskRowHtml 口徑，顏色走 :root 變數（CSS 另給）。
App.buildKanbanCardHtml = function(t) {
  const sch = getEffectiveSchedule(t);
  const pct = taskDisplayProgress(t);
  const preds = parsePredecessors(t.predecessor);
  const predText = preds.map(p => {
    let s = '#' + p.dep;
    if (p.type !== 'FS') s += p.type;
    if (p.lag > 0) s += '+' + p.lag;
    else if (p.lag < 0) s += p.lag;
    return s;
  }).join(', ');
  const startTxt = sch.start ? D.fmt(new Date(sch.start), 'md') : '—';
  const endTxt   = sch.end   ? D.fmt(new Date(sch.end), 'md')   : '—';
  const hasDates = !!(sch.start || sch.end);
  return `<div class="kanban-card" onclick="App.openTaskModal('${t.id}')">
    <div class="kanban-card-top">
      <span class="kanban-card-wbs">${U.esc(t.wbs || '')}</span>
      <span class="kanban-card-name">${U.esc(t.name || '')}</span>
    </div>
    ${preds.length > 0 ? `<div class="kanban-card-pred">← ${predText}</div>` : ''}
    <div class="kanban-card-progress">
      <div class="kanban-prog-track"><div class="kanban-prog-fill" style="width:${pct}%"></div></div>
      <span class="kanban-prog-pct">${pct}%</span>
    </div>
    ${hasDates ? `<div class="kanban-card-dates">${startTxt} ~ ${endTxt}</div>` : ''}
    <div class="kanban-card-owner">${U.esc(t.owner || '—')}</div>
  </div>`;
};

// 會議設定彈窗：截圖（OCR）+ 手動兩 tab，比右欄寬、好閱讀（Paul 要求）。設計款 openModal。
App.openMeetingModal = function() {
  App.shotFiles = [];
  App.openModal({
    title: '📅 會議時程設定',
    body: App.buildMeetingModalBody(),
    footer: '<button class="tb-action" onclick="App.closeModal()" style="background:var(--stone-200); color:var(--ink2);">關閉</button>',
    wide: true,
  });
  // 剪貼簿貼上截圖（Ctrl+V）：document 級只綁一次，handler 內判斷彈窗開著才吃
  if (!App._meetingPasteBound) {
    App._meetingPasteBound = true;
    document.addEventListener('paste', App._meetingPasteHandler);
  }
};

// Ctrl+V 貼上截圖 → 直接進 OCR（不必先存成 png 再上傳，UX 佳）。只在會議彈窗開著時作用。
App._meetingPasteHandler = function(e) {
  if (!document.getElementById('meetingModalBody')) return;   // 彈窗沒開 → 不攔
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const files = [];
  for (const it of items) {
    if (it.type && it.type.indexOf('image/') === 0) { const f = it.getAsFile(); if (f) files.push(f); }
  }
  if (!files.length) return;
  e.preventDefault();
  // 自動進「新增」子頁並切到「上傳截圖」tab
  App.showMeetingAddView();
  const shot = document.getElementById('am-shot'), manual = document.getElementById('am-manual');
  if (shot && manual) {
    shot.style.display = ''; manual.style.display = 'none';
    document.querySelectorAll('#meetingModalBody .am-tab').forEach(b => b.classList.toggle('active', /截圖/.test(b.textContent)));
  }
  App.handleShotUpload(files);
  U.toast('📋 已貼上截圖，按「🪄 一次解析全部」辨識', 'info');
};

// 會議部門下拉選項（三入口共用，§18.10b）：未指派（value 空）＋選項Y池（全專案部門名去重）＋★全體均攤（__ALL__）
App._meetingDeptOptions = function(sel) {
  const pool = [...new Set((DATA.projects || []).flatMap(p => (p.depts || []).map(d => (d.name || '').trim())).filter(Boolean))];
  const cur = sel || '';
  let html = `<option value=""${cur === '' ? ' selected' : ''}>未指派</option>`;
  html += pool.map(n => `<option value="${U.esc(n)}"${cur === n ? ' selected' : ''}>${U.esc(n)}</option>`).join('');
  html += `<option value="__ALL__"${cur === '__ALL__' ? ' selected' : ''}>★ 全體均攤（跨部門）</option>`;
  return html;
};

// 彈窗 body：截圖（OCR）+ 手動兩 tab（手動頻率 §階段二再補）。包一層 #meetingModalBody 供加入後就地刷新。
App.buildMeetingModalBody = function() {
  return `<div id="meetingModalBody">
    <!-- 管理主頁（開啟即見） -->
    <div id="am-home">
      <div style="display:flex; align-items:center; justify-content:space-between; margin:2px 0 8px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink2);">⏰ 定期事件（會議 / 打掃）</div>
        <button class="am-add-btn" data-edit onclick="App.showMeetingAddView()" style="width:auto; padding:5px 14px; font-size:12px;">＋ 新增事件</button>
      </div>
      <div id="recurringMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden;">${App.buildRecurringMeetingsHtml()}</div>

      <div style="display:flex; align-items:center; justify-content:space-between; margin:16px 0 8px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink2);">📌 特定日期事件</div>
        <button class="tb-action ghost" data-edit onclick="App.addSpecialMeeting()" style="font-size:11px; padding:3px 9px;">＋ 新增</button>
      </div>
      <div id="specialMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:240px; overflow-y:auto;">${App.buildSpecialMeetingsHtml()}</div>
    </div>

    <!-- 新增（手動填入 / 上傳截圖） -->
    <div id="am-add" style="display:none">
      <div style="margin:0 0 10px;">
        <span onclick="App.showMeetingManageView()" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--sage-700); cursor:pointer;">‹ 返回清單</span>
      </div>
      <div class="add-meeting-tabs">
        <button class="am-tab active" onclick="App.switchAmTab(this, 'manual')">⌨ 手動填入</button>
        <button class="am-tab" onclick="App.switchAmTab(this, 'shot')">📷 上傳截圖</button>
      </div>

      <div id="am-manual" class="am-form">
        <div class="form-row">
          <div class="form-field">
            <label>類型 *</label>
            <select id="mCat" onchange="App._toggleMcatLabel()">
              <option value="meeting">📅 會議</option>
              <option value="cleaning">🧹 雜項</option>
            </select>
          </div>
          <div class="form-field" style="flex:2;">
            <label>名稱 *</label>
            <input type="text" id="mTitle" placeholder="例：主管週會 / 輪值掃地">
          </div>
        </div>
        <div class="form-row" id="mCatLabelRow" style="display:none;">
          <div class="form-field">
            <label>分類名稱（雜項自訂）</label>
            <input id="mCatLabel" placeholder="如：打掃、外出、私人">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>頻率 *</label>
            <select id="mFreq">
              <option value="once">單次（當週）</option>
              <option value="weekly">每週</option>
              <option value="biweekly">隔週</option>
              <option value="monthly">每月（第N個週幾）</option>
            </select>
          </div>
          <div class="form-field">
            <label>日期 *</label>
            <input type="date" id="mDate" value="${D.fmt(D.today(), 'iso')}">
          </div>
          <div class="form-field">
            <label>開始時間 *</label>
            <input type="time" id="mStart" value="10:00">
          </div>
          <div class="form-field">
            <label>結束時間 *</label>
            <input type="time" id="mEnd" value="11:00">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>負責人（預設＝我）</label>
            <input type="text" id="mOwner" value="${U.esc(DATA.settings.userName || '')}">
          </div>
          <div class="form-field">
            <label>部門（負載分流）</label>
            <select id="mDept">${App._meetingDeptOptions('')}</select>
          </div>
        </div>
        <button class="am-add-btn" data-edit onclick="App.addManualMeeting()">＋ 加入</button>
        <div class="ocr-tip">頻率選「每週/隔週/每月」存定期事件、自動重複；「單次」只放當週。星期由日期自動推算。</div>
      </div>

      <div id="am-shot" class="am-form" style="display:none">
        <div class="am-drop" id="shotDrop" onclick="document.getElementById('shotInput').click()">
          <div class="ic">🖼</div>
          <div class="tx">點擊、拖曳，或直接 Ctrl+V 貼上截圖</div>
          <div class="sub">免費 · 純本地辨識 · 截圖不會被儲存（可多張）</div>
        </div>
        <input type="file" id="shotInput" multiple accept="image/*" style="display:none"
               onchange="App.handleShotUpload(this.files)">
        <div id="shotList" class="shot-list" style="display:none;"></div>
        <div id="ocrResult"></div>
        <div class="ocr-tip">💡 週檢視日期抓不到時請在清單自己選；想最準用「單日檢視」截圖。多張自動去重。</div>
      </div>
    </div>
  </div>`;
};

// 加入/刪除會議後刷新：更新儀表板（週曆 + 右欄精簡卡），彈窗開著就就地重繪 body（更新清單、清表單）。
App._refreshMeetingUI = function() {
  if (typeof Workspace.render === 'function') Workspace.render();
  const mb = document.querySelector('#modal .modal-body');
  if (mb && document.getElementById('meetingModalBody')) mb.innerHTML = App.buildMeetingModalBody();
};

// 時程表顯示設定（設計款彈窗）：起訖時數 + 半/一小時密度。值存全域 settings → 上雲跨機。午休 12–13 固定。
App.openGridSettingsModal = function() {
  const s = DATA.settings;
  const opt = (sel, lo, hi) => { let o = ''; for (let h = lo; h <= hi; h++) o += `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`; return o; };
  App.openModal({
    title: '⚙ 時程表顯示設定',
    body: `<div class="form-field"><label>顯示時間範圍</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <select onchange="App.setGridSetting('gridStartHour', this.value)" style="flex:1;">${opt(parseInt(s.gridStartHour, 10) || 8, 0, 22)}</select>
          <span style="color:var(--ink4);">→</span>
          <select onchange="App.setGridSetting('gridEndHour', this.value)" style="flex:1;">${opt(parseInt(s.gridEndHour, 10) || 18, 1, 24)}</select>
        </div></div>
      <div class="field-hint">☕ 午休 12:00–13:00 固定，不受此設定影響。</div>
      <div class="field-hint">☁ 此偏好存全域設定、自動同步雲端、跨機一致。</div>`,
    footer: '<button class="tb-action" onclick="App.closeModal()" style="background:var(--stone-200); color:var(--ink2);">關閉</button>',
  });
};

App.setGridSetting = function(key, val) {
  if (App._roGuard && App._roGuard()) return;
  let v = parseInt(val, 10);
  if (isNaN(v)) return;
  if (key === 'gridStartHour') v = Math.max(0, Math.min(22, v));
  else if (key === 'gridEndHour') v = Math.max(1, Math.min(24, v));
  DATA.settings[key] = v;
  if (DATA.settings.gridEndHour <= DATA.settings.gridStartHour) {   // 夾住起<迄，避免空表
    if (key === 'gridStartHour') DATA.settings.gridEndHour = Math.min(24, DATA.settings.gridStartHour + 1);
    else DATA.settings.gridStartHour = Math.max(0, DATA.settings.gridEndHour - 1);
  }
  Storage.save();          // 寫 localStorage + 觸發雲端上傳
  Workspace.render();   // 週曆即時重畫（modal 不重開，改動即時反映在 modal 兩側可見的日曆）
};

App.buildGeneratePanelHtml = function() {
  const lastGen = DATA.schedule.generatedAt;
  return `<div class="generate-section">
    <button class="generate-cta" data-edit onclick="App.generateNow()">
      <span style="font-size:16px;">⚡</span> 產生本週智慧排程
    </button>
    <div class="gen-sub">
      ${lastGen ?
        '最後產生：' + D.fmt(new Date(lastGen), 'md') + ' ' + new Date(lastGen).toTimeString().slice(0,5)
        : '尚未產生過排程'}
    </div>
    <div class="gen-result-card" id="genResult"></div>
  </div>`;
};

App.switchAmTab = function(btn, name) {
  btn.parentElement.querySelectorAll('.am-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['shot','manual'].forEach(n => {
    const el = document.getElementById('am-' + n);
    if (el) el.style.display = n === name ? '' : 'none';
  });
};

// 會議彈窗：管理主頁 ↔ 新增（手動/截圖）子頁切換
App.showMeetingAddView = function() {
  const home = document.getElementById('am-home'), add = document.getElementById('am-add');
  if (home) home.style.display = 'none';
  if (add) add.style.display = '';
};
App.showMeetingManageView = function() {
  const home = document.getElementById('am-home'), add = document.getElementById('am-add');
  if (add) add.style.display = 'none';
  if (home) home.style.display = '';
};

App.deleteMeeting = function(id) {
  if (App._roGuard()) return;
  DATA.meetings = DATA.meetings.filter(m => m.id !== id);
  Storage.save();
  App._refreshMeetingUI();
};

// 手動分類切換：選「雜項」才顯示自訂「分類名稱」欄
App._toggleMcatLabel = function() {
  const row = document.getElementById('mCatLabelRow');
  if (row) row.style.display = ((document.getElementById('mCat') || {}).value === 'cleaning') ? '' : 'none';
};

App.addManualMeeting = function() {
  if (App._roGuard()) return;
  const freq = (document.getElementById('mFreq') || {}).value || 'once';   // 不定期單次 / 每週 / 隔週 / 每月
  const cat = (document.getElementById('mCat') || {}).value || 'meeting';   // 內部分類桶：meeting / cleaning（皆避開排程、週曆分色）
  const catLabelRaw = ((document.getElementById('mCatLabel') || {}).value || '').trim();   // 雜項自訂顯示名（打掃/外出/私人…，不綁死打掃）
  const catLabel = cat === 'cleaning' ? (catLabelRaw || '雜項') : '';
  const dateStr = (document.getElementById('mDate') || {}).value || D.fmt(D.today(), 'iso');
  const start = document.getElementById('mStart').value;
  const end = document.getElementById('mEnd').value;
  const title = document.getElementById('mTitle').value.trim();
  if (!title) { U.toast('⚠ 請填主題', 'warning'); return; }
  const owner = ((document.getElementById('mOwner') || {}).value || '').trim();   // 負責人（預設帶 userName，§18.10b）
  const dept = (document.getElementById('mDept') || {}).value || '';              // 部門（空＝未指派；__ALL__＝全體均攤）
  const dayNum = new Date(dateStr + 'T00:00:00').getDay();   // 由日期推星期（0-6），週期性據此重複

  if (freq === 'once') {
    // 一次性 → 該日期，存 DATA.meetings
    DATA.meetings.push({
      id: U.id(), date: dateStr, startTime: start, endTime: end,
      title, category: cat, categoryLabel: catLabel, owner, dept,
    });
  } else {
    // 週期性（每週/隔週/每月）→ 存 settings.recurringMeetings（與設定頁定期事件同源、自動重複上週曆）；該日期當起算錨點
    if (!DATA.settings.recurringMeetings) DATA.settings.recurringMeetings = [];
    DATA.settings.recurringMeetings.push({
      id: U.id(), category: cat, categoryLabel: catLabel, frequency: freq,
      day: dayNum, start, end, title, startDate: dateStr, endDate: '', enabled: true, owner, dept,
    });
  }
  Storage.save();
  App._refreshMeetingUI();
  const fl = ({ once: '單次', weekly: '每週', biweekly: '隔週', monthly: '每月' })[freq] || '';
  U.toast(`✓ 已加入${fl ? '（' + fl + '）' : ''}${cat === 'cleaning' ? '雜項' : '會議'}`, 'success');
};

App.generateNow = function() {
  if (App._roGuard()) return;
  if (DATA.tasks.filter(t => t.status !== 'done' && t.status !== 'hold').length === 0) {
    U.toast('⚠ 沒有任務可排程', 'warning');
    return;
  }
  const result = generateSchedule();
  const resultBox = document.getElementById('genResult');
  if (resultBox) {
    resultBox.classList.add('show');
    resultBox.innerHTML = `
      <div class="gen-result-title">✓ 已為你排好本週工作</div>
      <div class="gen-result-sub">
        共安排 <b>${result.scheduledCount}</b> 個任務時段<br>
        ${result.lockedCount > 0 ? `保留 ${result.lockedCount} 個鎖定項目<br>` : ''}
        避開 <b>${DATA.meetings.length}</b> 場會議時段<br><br>
        <a href="#" onclick="App.showPage('workspace', document.querySelector('[data-page=workspace]')); return false;" style="color:var(--sage-600); font-weight:600;">→ 查看個人工作台時程表</a>
      </div>
    `;
  }
  U.toast(`✨ 排程已產生 (${result.scheduledCount} 項)`);
};

// ─── Global schedule (Topbar button) ───
App.generateGlobalSchedule = function() {
  const activeTasks = DATA.tasks.filter(t => t.status !== 'done' && t.status !== 'hold');
  if (activeTasks.length === 0) {
    U.toast('⚠ 沒有任務可排程', 'warning');
    return;
  }

  const result = generateSchedule();
  this.refreshAll();

  if (result.scheduledCount === 0) {
    U.toast('⚠ 本週沒有需要排程的任務（任務日期都在本週外）', 'warning');
    return;
  }
  U.toast(`⚡ 本週智慧排程完成：${result.scheduledCount} 個時段`);
  // Jump to workspace to see the result
  if (this.currentPage !== 'workspace') {
    this.showPage('workspace', document.querySelector('[data-page=workspace]'));
  }
};

// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT — Quick add + task modal + screenshot OCR
// ═══════════════════════════════════════════════════════
App.quickAddTask = function(projId, input) {
  if (App._roGuard()) return;
  const name = input.value.trim();
  if (!name) {
    // Input 是空 → 直接打開完整新增任務對話框
    this.openNewTaskDialog(projId);
    return;
  }
  const task = {
    id: U.id(),
    project: projId,
    name,
    desc: '',
    owner: DATA.settings.userName || '',
    urgency: 'medium',
    category: 'deep',
    estHours: 1,
    canSplit: false,
    predecessor: '',   // 階段2 排程引擎：前置任務編碼（見 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: 1,     // 手動新建預設1工作天（完整對話框可填工期，UI往後做）
    scheduledStart: '',  // 排程套用結果，四條一致
    scheduledEnd: '',
    parentWbsId: '',   // 階段2：子綁父
    start: '',
    end: '',
    status: 'pending',
    note: '',
    method: '',
    createdAt: new Date().toISOString(),
  };
  DATA.tasks.push(task);
  Storage.save();
  input.value = '';
  this.renderProject();
  this.renderSidebar();
  U.toast(`✓ 已新增「${name}」`);
};

// ── M2-§6.4：前置任務結構化（自由文字 → 一列一條）────────────────────────
// 資料格式不變：序列化回 task.predecessor 字串（16FS / 16FS+2 / 16SS），引擎 parsePredecessors 照吃。
// 候選：同專案(t.project) 且有 wbs 編號的任務（手動無編號暫不可當前置），排除自己。
// 單一真實來源：序列化 serializePredecessors() 兩存檔點共用；反序列化走既有 parsePredecessors。

// 關係白話 ↔ 引擎代碼（單一定義）
App.PRED_RELATIONS = [
  { code: 'FS', label: '等它完成後，本任務才開始（最常用）' },
  { code: 'SS', label: '跟它同一天開始' },
  { code: 'FF', label: '跟它同一天完成' },
  { code: 'SF', label: '它開始後，本任務才能完成' },
];

// 序排序（第一刀，2026-06-17 序改日期排序）：純函式，吃 list 回排序後 list。
// 規則：有有效開始日（dispStart = getEffectiveSchedule(t).start，全系統 ISO YYYY-MM-DD，字串比=時序）→ 升序；
//   空值（待排：無 dispStart）顯式歸殿後組、不參與字串比（空字串字典序最小，naive 比會頂最前）；
//   同 dispStart / 待排組內 → 維持原陣列序（decorate index 穩定排序，不依賴引擎 sort 穩定性）。
// ⚠ 測試副本：test-schedule-cases.js §11，改此函式要兩邊同步。
function orderTasksByDispStart(list) {
  const dec = (list || []).map((t, i) => ({ t, i, ds: getEffectiveSchedule(t).start || '' }));
  const dated   = dec.filter(x => x.ds !== '').sort((a, b) => (a.ds < b.ds ? -1 : (a.ds > b.ds ? 1 : a.i - b.i)));
  const undated = dec.filter(x => x.ds === '');   // 待排：filter 保原陣列序
  return dated.map(x => x.t).concat(undated.map(x => x.t));
}

// 待辦列篩選（第二刀-A 接線）：純函式，吃四 Set 篩選器，.filter 保序（不重排，待排殿後不破）。
// 每維 Set 空 → 該維不篩；非空 → t 對應值 ∈ Set 才留（同維多選＝OR，跨維＝AND 交集）。
// ⚠ status 為待辦列純四枚舉（pending/wip/done/hold），不含看板 filterTasks 的 'delayed' 特例。
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

// 序基準（單一真實來源）：專案任務按 dispStart 升序、待排殿後（orderTasksByDispStart）。
// 排除已刪除、含 done（done 佔號）。外層待辦列與前置下拉共用此排序與 seq（同源）。
App.orderedProjectTasks = function(projId) {
  return orderTasksByDispStart((DATA.tasks || []).filter(t => t.project === projId && !t._deleted));
};

// 任務在其專案 ordered 序中的 seq（同源，1-based）；查無回 '?'（供超範圍前置顯示標籤）
App._seqOf = function(taskId) {
  const t = (DATA.tasks || []).find(x => x.id === taskId);
  if (!t) return '?';
  const i = this.orderedProjectTasks(t.project).findIndex(x => x.id === taskId);
  return i < 0 ? '?' : (i + 1);
};

// 前置候選：本專案、measureType!=='hours'、排除自己；階段窗（前1-2階段全收 + 同階段只列自己之前）。
// 序與 seq 同源 orderedProjectTasks；階段序 SoT = getProjectStages（minWbs，忽略 variant）。
// @param currentStage 表單當前階段（新建讀 tf-stage、編輯讀 t.stage）→ 定本任務階段序 S
App.predCandidates = function(projId, selfId, currentStage, selfVariant) {
  const NO_STAGE = '未分階段';
  const norm = (s) => (typeof s === 'string' && s.trim()) ? s.trim() : NO_STAGE;

  // 階段名 → index（getProjectStages 已按 minWbs 排序；同名取首次序，忽略 variant）
  const stages = App.getProjectStages(projId);
  const nameToIdx = {};
  let k = 0;
  stages.forEach(s => { if (!(s.name in nameToIdx)) nameToIdx[s.name] = k++; });
  const idxOf = (stage) => (norm(stage) in nameToIdx) ? nameToIdx[norm(stage)] : stages.length;

  const S = idxOf(currentStage);   // 本任務階段序（全新階段名 → stages.length，視為最後）

  // 同源序：日期序（orderTasksByDispStart）、含 done、排除 deleted；seq = 日期序位置+1
  const ordered = App.orderedProjectTasks(projId);
  const selfPos = selfId ? ordered.findIndex(t => t.id === selfId) : -1;
  const selfBefore = selfPos < 0 ? Infinity : selfPos;   // 新建自己不在序中 → 視為在尾，同階段全收

  return ordered
    .map((t, pos) => ({ t, pos }))
    .filter(({ t, pos }) => {
      if (t.id === selfId) return false;                 // 排自己
      if (t.measureType === 'hours') return false;       // 對齊 S5c：小時 Task 不可當工期前置
      if ((t.variant || null) !== (selfVariant || null)) return false;   // §8e.6 疊加：同案別才可當前置（通案 null===null）
      const d = S - idxOf(t.stage);                      // 候選比自己早幾個階段
      if (d === 0) return pos < selfBefore;              // 同階段 → 只列開始日早於自己（第一刀後 pos 為日期序位置）
      if (d === 1 || d === 2) return true;               // 前 1-2 階段 → 全收
      return false;                                      // d>=3（太早）/ d<0（同後或更晚）→ 擋
    })
    .map(({ t, pos }) => ({
      id: t.id,
      seq: pos + 1,                                      // 與外層待辦同源序（可非連續）
      name: t.name || '',
      stage: norm(t.stage),                              // 供 optgroup 分組
      stageIdx: idxOf(t.stage),                          // 供 optgroup 依階段序排
    }));
};

// 單列 HTML（pred = {dep,type,lag} 或 null=空白列）：前置任務改 <select>，value=task.id、label「seq · 名稱」、按階段 optgroup。
App._predRowHtml = function(pred, candidates) {
  const cands = candidates || App._predCands || [];
  const depId = pred ? String(pred.dep) : '';
  const type  = pred ? pred.type : 'FS';
  const lag   = pred ? pred.lag : 0;

  // 選項：（不設前置）+ 按階段 optgroup（stageIdx 升冪）
  let optsHtml = `<option value="">（不設前置）</option>`;
  const byIdx = {}, order = [];
  cands.forEach(c => {
    if (!(c.stageIdx in byIdx)) { byIdx[c.stageIdx] = { name: c.stage, items: [] }; order.push(c.stageIdx); }
    byIdx[c.stageIdx].items.push(c);
  });
  order.sort((a, b) => a - b);
  order.forEach(idx => {
    const g = byIdx[idx];
    optsHtml += `<optgroup label="${U.esc(g.name)}">` +
      g.items.map(c => `<option value="${U.esc(c.id)}"${c.id === depId ? ' selected' : ''}>${U.esc(c.seq + ' · ' + c.name)}</option>`).join('') +
      `</optgroup>`;
  });
  // 超範圍 selected（回顯保留，不丟資料；改階段才清＝onTaskStageChange）
  if (depId && !cands.some(c => c.id === depId)) {
    const to = (DATA.tasks || []).find(t => t.id === depId);
    const label = to ? (App._seqOf(depId) + ' · ' + (to.name || '')) : depId;
    optsHtml += `<optgroup label="（目前範圍外）"><option value="${U.esc(depId)}" selected>${U.esc(label)}（範圍外）</option></optgroup>`;
  }

  const rels = App.PRED_RELATIONS.map(r =>
    `<option value="${r.code}" ${type === r.code ? 'selected' : ''}>${U.esc(r.label)}</option>`).join('');
  return `
      <div class="pred-row">
        <div class="pred-field">
          <label class="pred-field-label">🔗 要接在這個任務之後</label>
          <div class="pred-field-line">
            <select class="pred-search">${optsHtml}</select>
            <button type="button" class="pred-del" onclick="App.removePredRow(this)" title="刪除這條前置">✕</button>
          </div>
        </div>
        <div class="pred-field">
          <label class="pred-field-label">🔀 兩者的銜接方式</label>
          <select class="pred-rel">${rels}</select>
        </div>
        <div class="pred-field">
          <label class="pred-field-label">⏳ 中間留幾天緩衝</label>
          <input type="number" class="pred-lag" value="${lag}" step="1" min="0">
          <div class="field-hint">前置完成後想多等幾天再開始（等材料、簽核）才需要填，不需要則維持 0。</div>
        </div>
      </div>`;
};

// 整個前置欄內容（select 候選列 + 加列鈕）；反序列化走 parsePredecessors（字串→陣列）。候選快取供 addPredRow/onTaskStageChange 共用。
App.buildPredListHtml = function(t) {
  const cands = App.predCandidates(t.project, t.id, t.stage, t.variant);
  App._predCands  = cands;       // 快取：addPredRow 新列 + onTaskStageChange 重建共用
  App._predProj   = t.project;   // 快取：onTaskStageChange 重算 predCandidates 用
  App._predSelfId = t.id;
  App._predVariant = t.variant;  // 快取：variant 過濾（onTaskStageChange 重算用）
  const preds = parsePredecessors(t.predecessor);
  const rows = preds.length
    ? preds.map(p => App._predRowHtml(p, cands)).join('')
    : App._predRowHtml(null, cands);   // 沒有前置時給一條空白列起手
  return `
      <div class="field-hint pred-intro">設定這個任務接在哪個任務之後，系統會自動排好開始日期。</div>
      <div id="tf-pred-list">${rows}</div>
      <button type="button" class="pred-add" onclick="App.addPredRow()">＋ 加一條前置</button>
      <div class="tip pred-example">想成『這件事要排在誰後面』。例如本任務要等『#16 模具開發』做完、再隔 2 天材料到位才動工 → 選 #16、選『完成後才開始』、緩衝填 2。</div>`;
};

// 序列化：DOM 列 → task.predecessor 字串（兩存檔點共用，單一真實來源）
App.serializePredecessors = function() {
  const rows = Array.from(document.querySelectorAll('#tf-pred-list .pred-row'));
  const parts = [];
  for (const row of rows) {
    const sel = row.querySelector('.pred-search');
    const id = sel ? (sel.value || '').trim() : '';   // select.value = task.id（空=不設前置）
    if (!id) continue;                                 // 空值 → 跳過該列
    const type = (row.querySelector('.pred-rel') || {}).value || 'FS';
    const lagEl = row.querySelector('.pred-lag');
    const lagVisible = lagEl && lagEl.style.display !== 'none';
    const lag = lagVisible ? (parseInt(lagEl.value, 10) || 0) : 0;
    let token = id + '#' + type;                       // id#關係（# 分隔，對齊 translatePredToId）
    if (lag > 0) token += '+' + lag;
    else if (lag < 0) token += lag;                    // 負 lag 自帶 '-'
    parts.push(token);
  }
  return parts.join(',');
};

// 加一條空白列
App.addPredRow = function() {
  const list = document.getElementById('tf-pred-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', App._predRowHtml(null, App._predCands || []));
};

// 刪一條列（刪到空則補一條空白列，維持起手姿態）
App.removePredRow = function(btn) {
  const list = document.getElementById('tf-pred-list');
  const row = btn.closest('.pred-row');
  if (!list || !row) return;
  row.remove();
  if (!list.querySelector('.pred-row')) App.addPredRow();
};

// 階段欄改變 → 用新階段重算候選窗、重建前置 select；超出新窗的「已選」前置清掉+toast。
// （對齊回顯分工：回顯保留超範圍、僅「改階段」這個主動動作才清。）
App.onTaskStageChange = function() {
  const list = document.getElementById('tf-pred-list');
  if (!list) return;
  const newStage = (document.getElementById('tf-stage') || {}).value || '';

  // 重建前，先收集現有列「已選」的前置（含 relation/lag，保留有效者用）
  const current = Array.from(list.querySelectorAll('.pred-row')).map(row => {
    const sel = row.querySelector('.pred-search');
    const id = sel ? (sel.value || '').trim() : '';
    if (!id) return null;
    const type = (row.querySelector('.pred-rel') || {}).value || 'FS';
    const lagEl = row.querySelector('.pred-lag');
    const lag = lagEl ? (parseInt(lagEl.value, 10) || 0) : 0;
    return { dep: id, type: type, lag: lag };
  }).filter(Boolean);

  // 新階段重算候選 + 更新快取
  const cands = App.predCandidates(App._predProj, App._predSelfId, newStage, App._predVariant);
  App._predCands = cands;
  const inWindow = new Set(cands.map(c => c.id));

  // 只保留仍在新窗內的，清掉超範圍的
  const kept = current.filter(p => inWindow.has(p.dep));
  const dropped = current.length - kept.length;

  // 重建列（保留者逐列回填；全清→一條空白列起手）
  list.innerHTML = kept.length
    ? kept.map(p => App._predRowHtml(p, cands)).join('')
    : App._predRowHtml(null, cands);

  if (dropped > 0) {
    U.toast('⚠️' + dropped + ' 筆前置因階段調整超出可選範圍，已移除', 'warning');
  }
};

// ── 2-A：預計開始「自動／手動」雙態（startMode 純 UI 意圖記憶；引擎錨點機制不動）──
// 判定當前態：顯式 startMode 優先；舊任務無此欄位 → t.start 有值當 manual、空當 auto（一次性相容）
App.startModeOf = function(t) {
  if (t && (t.startMode === 'manual' || t.startMode === 'auto')) return t.startMode;
  return (t && t.start && String(t.start).trim()) ? 'manual' : 'auto';
};

// 重構（取消自動/手動切換）：預計開始改單一可編輯日期格，setStartMode 已移除。

// 計量方式切換（殼，第27項）：純改 data-measure + active class，CSS 控顯隱；
//   tf-duration/tf-hours 的 DOM 永遠在，不增刪、不碰資料層，saveTask 照常讀得到。
App.setMeasureMode = function(m) {
  const g = document.querySelector('.task-form');
  if (!g) return;
  g.dataset.measure = m;
  g.querySelectorAll('.measure-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.measure === m));
};

// 讀預計開始雙態 → {start, startMode}（saveNewTask / saveTask 共用，單一真實來源）
//   手動態：startMode='manual'，start = #tf-start 值（引擎據此當錨點）
//   自動態：startMode='auto'，start = ''（清空，引擎視為非錨點、由前置推算）
App.readStartField = function() {
  // 重構：預計開始為單一可編輯日期格。經手填/改（data-autostart 已清）=手動錨點；未經手=自動，不落錨、下游連動。
  const el = document.getElementById('tf-start');
  if (!el || el.dataset.autostart === '1') return { startMode: 'auto', start: '' };
  const val = el.value || '';
  return { startMode: val ? 'manual' : 'auto', start: val };
};

// §6.5c 錨點：取有效開始日。手動態用 tf-start 手填值；自動態 tf-start 為空，改讀隱藏 tf-effstart（=getEffectiveSchedule(t).start，渲染時寫入）。
App.readEffStart = function() {
  const manual = (document.getElementById('tf-start') || {}).value || '';
  if (manual) return manual;                                          // 手動態：手填值優先
  return (document.getElementById('tf-effstart') || {}).value || '';  // 自動態：有效開始日
};

// §6.5c t.end 衍生化：save 端取工期。tf-end 反推為主（開始日當錨）、tf-duration 為輔（無法反推時）。
//   start+endVal 都有 → deriveDurationFromEnd（含 negDur→回 0，不套 ||1 才不會把合法 0 蓋成 1）。
//   milestone 工期恆 1，不反推。saveTask/saveNewTask 共用，單一真實來源。
App.readDurationField = function() {
  const start  = App.readEffStart();
  const endVal = (document.getElementById('tf-end')      || {}).value || '';
  const durRaw = parseFloat((document.getElementById('tf-duration') || {}).value);
  const taskType = (document.getElementById('tf-taskType') || {}).value;
  if (taskType === 'milestone') return 1;
  if (start && endVal) return D.deriveDurationFromEnd(start, endVal);
  return isNaN(durRaw) ? 1 : durRaw;   // §6.5 只在非數字時兜 1，0/負數照實回（負工期可手填）
};

// §6.5c 三欄連動：改開始/工期 → 算「預計完成」顯示值（開始當錨，addWorkdays(start, dur-1)）。
//   改完成日不在此（反推工期交給 save 端），故 tf-end 不綁、此函式只算 end。
//   guard：開始日空（待排）或工期非有效數（NaN/<1）→ 不算，保留現值。
App.recalcTaskTimeFields = function() {
  const startEl = document.getElementById('tf-start');
  const durEl   = document.getElementById('tf-duration');
  const endEl   = document.getElementById('tf-end');
  if (!durEl || !endEl) return;
  const start = App.readEffStart();
  if (!start) return;                          // 待排（自動態無有效開始日）→ 不強寫
  const dur = parseFloat(durEl.value);
  if (isNaN(dur)) return;              // §6.5 只擋非數字；dur≤0（負工期）照算 addWorkdays(start,dur-1)=早於start；milestone dur=1→addWorkdays(start,0)=start
  endEl.value = D.fmt(D.addWorkdays(start, dur - 1), 'iso');   // D.fmt iso 避時區 Bug2
};

// 表單渲染後掛三欄連動：只綁 tf-start / tf-duration（改它們→算完成日）；
//   tf-end 不綁（改完成日→反推工期是 save 端的事，綁了會蓋掉使用者輸入）。
App.bindTaskTimeListeners = function() {
  if (App._taskTimeDelegated) return;            // 只綁一次，避免重複
  App._taskTimeDelegated = true;
  const f = (e) => {
    const id = e.target && e.target.id;
    if (e.target && e.target.classList) e.target.classList.remove('tf-invalid');   // 修正2：必填欄位輸入即消紅
    if (id === 'tf-start' && e.target.dataset) delete e.target.dataset.autostart;   // 重構：手改開始日 → 落為手動錨點
    if (id === 'tf-duration' || id === 'tf-start') App.recalcTaskTimeFields();
  };
  document.addEventListener('input', f);
  document.addEventListener('change', f);
};

// 修正2：必填欄位驗證——空的標紅(.tf-invalid)、有值清紅，回傳缺漏欄位名（saveNewTask/saveTask 共用，單一真實來源）
App._markTaskRequired = function(reqs) {
  const missing = [];
  reqs.forEach(r => {
    const e = document.getElementById(r.id);
    if (!e) return;
    const empty = !((e.value || '').trim());
    e.classList.toggle('tf-invalid', empty);
    if (empty) missing.push(r.name);
  });
  return missing;
};

// ─── HintBox：區塊級說明框公版（展開/收起持久化 + 收起態 hover 浮出，複用 data-tip 引擎）───
//   state 存 DATA.settings.hintBoxState[key]：undefined/false=展開、true=收起（預設展開）。
//   收起態標題列掛 data-tip（標題|body 純文字），hover 浮出；觸控無 hover 則點擊展開。
App.buildHintBox = function(opts) {
  const o = opts || {};
  const key = o.key || '';
  const _hbStored = (DATA.settings.hintBoxState || {})[key];
  const collapsed = _hbStored === undefined ? !!o.collapsed : !!_hbStored;
  const icon = o.icon ? `<i class="ti ${o.icon}"></i>` : '';
  const summary = o.summary ? `<span class="hintbox-summary">${U.esc(o.summary)}</span>` : '';
  const tip = collapsed ? ` data-tip="${U.esc((o.title || '') + '|' + (o.summary || '') + ' — 點擊展開看完整說明')}"` : '';
  return `<div class="hintbox${collapsed ? ' collapsed' : ''}" data-hintkey="${U.esc(key)}">
    <div class="hintbox-bar" onclick="App.toggleHintBox('${U.esc(key)}')"${tip}>
      <span class="hintbox-head">${icon}<b class="hintbox-title">${U.esc(o.title || '')}</b>${summary}</span>
      <span class="hintbox-toggle">${collapsed ? '展開▾' : '收起▴'}</span>
    </div>
    <div class="hintbox-body">${o.bodyHtml || ''}</div>
  </div>`;
};
// 點標題列 toggle：寫 state + Storage.save，局部換 class（不整頁重繪）；收起態補掛 data-tip、展開態拔掉。
App.toggleHintBox = function(key) {
  if (!DATA.settings.hintBoxState) DATA.settings.hintBoxState = {};
  DATA.settings.hintBoxState[key] = !DATA.settings.hintBoxState[key];
  Storage.save();
  const box = document.querySelector('.hintbox[data-hintkey="' + key + '"]');
  if (!box) return;
  const collapsed = !!DATA.settings.hintBoxState[key];
  box.classList.toggle('collapsed', collapsed);
  const tg = box.querySelector('.hintbox-toggle');
  if (tg) tg.textContent = collapsed ? '展開▾' : '收起▴';
  const bar = box.querySelector('.hintbox-bar');
  if (bar) {
    if (collapsed) {
      const title = (box.querySelector('.hintbox-title') || {}).textContent || '';
      const summary = (box.querySelector('.hintbox-summary') || {}).textContent || '';
      bar.setAttribute('data-tip', title + '|' + summary + ' — 點擊展開看完整說明');
    } else {
      bar.removeAttribute('data-tip');
    }
  }
};

App.buildTaskFormHtml = function(task, mode, measure = 'duration') {
  const t = task || {};
  const v = (x) => (x == null ? '' : x);
  const startMode = (mode === 'new') ? 'auto' : App.startModeOf(t);   // 2-A：新任務一律 auto；編輯讀 startMode（含舊任務相容）
  const effSch = getEffectiveSchedule(t);
  const deptNames = [...new Set((DATA.projects || []).flatMap(p => (p.depts || []).map(d => (d.name || '').trim())).filter(Boolean))];   // 選項Y：全專案部門名去重池（個人雜事掛公司部門，§18.10）
  const isAutoStart = (startMode === 'auto');                              // 重構：無手填 t.start = 依前置自動排
  const startInputVal = isAutoStart ? (effSch.start || '') : v(t.start);   // 自動態預填引擎算到的日；data-autostart 標記，未經手不落錨（保住下游連動）
  const startHint = isAutoStart
    ? (effSch.start ? '預計開始目前依前置排到 ' + D.fmt(effSch.start, 'ymd') + '；直接改此日即固定為起點，下游接著排。改完成日會自動反推工期。'
                    : '預計開始留白＝依前置自動排；填入日期即固定為起點。改完成日會自動反推工期。')
    : '預計開始已固定為起點，下游接著排；清空可改回依前置自動排。改完成日會自動反推工期。';
  return `
    <div class="task-form tf-redesign" data-measure="${measure}">
    ${mode === 'new' ? `
    <div class="form-field">
      <label>專案 *</label>
      <select id="tf-project"><option value="" ${!t.project ? 'selected' : ''}>— 請選擇 —</option>${DATA.projects.map(p => `<option value="${p.id}" ${t.project === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>
    </div>` : `
    <div class="form-field tf-proj-field">
      <label>專案</label>
      <div class="task-proj-readonly">${U.esc((DATA.projects.find(p => p.id === t.project) || {}).name || '')}</div>
    </div>`}
    <div class="form-field tf-field-name">
      <label>任務名稱 *</label>
      <input type="text" id="tf-name" value="${U.esc(v(t.name))}" placeholder="例：完成 BOM 表 6 型壁掛機">
    </div>
    <div class="form-row">
      <div class="form-field"><label>階段 *</label>
        <input type="text" id="tf-stage" list="tf-stage-list" value="${U.esc(v(t.stage))}" placeholder="輸入或選擇階段" onchange="App.onTaskStageChange()">
        <datalist id="tf-stage-list">${this.stageDatalistOptions(t.project)}</datalist>
      </div>
      <div class="form-field dur-only"><label>子群組</label>
        <input type="text" id="tf-subgroup" list="tf-subgroup-list" value="${U.esc(v(t.subgroup))}" placeholder="輸入或選擇子群組">
        <datalist id="tf-subgroup-list">${this.subgroupDatalistOptions(t.project)}</datalist>
      </div>
    </div>
    <div class="measure-toggle">
      <button type="button" class="measure-btn ${measure==='duration'?'active':''}" data-measure="duration" onclick="App.setMeasureMode('duration')">工期制（工作天）</button>
      <button type="button" class="measure-btn ${measure==='hours'?'active':''}" data-measure="hours" onclick="App.setMeasureMode('hours')">時段制（工時 h）</button>
    </div>

    <div class="tf-section-label">權責</div>
    <div class="form-row">
      <div class="form-field"><label>擔當 *</label><input type="text" id="tf-owner" value="${U.esc(v(t.owner) || (mode === 'new' ? (DATA.settings.userName || '') : ''))}"></div>
      <div class="form-field"><label>類型 * <span data-tip="類型|任務=要排程的工作；里程碑=時間點標記（工期0）；群組=純分類母項，不排程" style="cursor:help;">?</span></label>
        <select id="tf-taskType">
          <option value="task" ${t.taskType === 'task' || !t.taskType ? 'selected' : ''}>📋 任務</option>
          <option value="milestone" ${t.taskType === 'milestone' ? 'selected' : ''}>◆ 里程碑</option>
          <option value="group" ${t.taskType === 'group' ? 'selected' : ''}>▦ 群組</option>
        </select>
      </div>
    </div>

    <div class="form-field mg-hours"><label>部門 <span data-tip="部門|個人雜事掛到的公司部門（部門負載依此分流）；選項為全專案出現過的部門" style="cursor:help;">?</span></label>
      <select id="tf-dept">
        <option value="">未指派</option>
        ${deptNames.map(n => `<option value="${U.esc(n)}" ${(t.dept || '') === n ? 'selected' : ''}>${U.esc(n)}</option>`).join('')}
      </select>
    </div>

    <div class="tf-sched-card">
      <div class="tf-sched-title"><i class="ti ti-clock-bolt" aria-hidden="true"></i>排程與時程</div>
      <div class="form-field dur-only tf-pred-field">
        <label>前置任務</label>
        ${App.buildPredListHtml(t)}
      </div>
      <div class="tf-chain">
        <div class="tf-chain-cell tf-start-cell">
          <div class="tf-cell-label">預計開始</div>
          <input type="date" id="tf-start" value="${startInputVal}"${isAutoStart ? ' data-autostart="1"' : ''}>
        </div>
        <div class="tf-chain-arrow dur-only"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
        <div class="tf-chain-cell tf-dur-cell mg-duration">
          <div class="tf-cell-label tf-cell-accent">工期（天）</div>
          <input type="number" id="tf-duration" value="${v(t.durationDays) || 1}" step="1">
        </div>
        <div class="tf-chain-cell tf-hours-cell mg-hours">
          <div class="tf-cell-label">預估工時 (h)</div>
          <input type="number" id="tf-hours" value="${v(t.estHours) || 1}" min="0.5" step="0.5">
        </div>
        <div class="tf-chain-arrow dur-only"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
        <div class="tf-chain-cell tf-end-cell dur-only">
          <div class="tf-cell-label">預計完成 / Deadline</div>
          <input type="date" id="tf-end" value="${v(effSch.end)}">
        </div>
      </div>
      <input type="hidden" id="tf-effstart" value="${v(effSch.start)}">
      <div class="field-hint tf-chain-hint dur-only">${startHint}</div>
      <div class="dur-only">${App.buildHintBox({
      key: 'task-time', icon: 'ti-clock-bolt', title: '時間怎麼連動', summary: '填兩個，第三個自動算', collapsed: true,
      bodyHtml:
        '<div class="ht-rule ht-start"><b>改開始日</b><span>工期不動，自動算出新的完成日。例：開始改 6/25、工期 5 天 → 完成自動變 7/1（跳週末與國定假日）。</span></div>' +
        '<div class="ht-rule ht-dur"><b>改工期</b><span>開始日當錨不動，自動算出新的完成日。例：工期改 7 天 → 完成日往後移到第 7 個工作天。</span></div>' +
        '<div class="ht-rule ht-end"><b>改完成日</b><span>開始日不動，回算工期（等於調整這任務要做多久）。例：完成改 7/3 → 工期自動變成 6/25 到 7/3 的工作天數。</span></div>' +
        '<div class="ht-rule ht-down"><b>下游連動</b><span>這任務時間一改，有設前置的下游任務跟著自動重排；你手動指定過日期的任務不會被動到。</span></div>'
    })}</div>
    </div>

    <div class="tf-section-label">狀態與說明</div>
    <div class="form-row">
      <div class="form-field"><label>緊急程度 <span data-tip="緊急程度|系統自動推算，可手動覆蓋" style="cursor:help;">?</span></label>
        <select id="tf-urgency">
          <option value="high" ${t.urgency === 'high' ? 'selected' : ''}>🔴 緊急</option>
          <option value="medium" ${t.urgency === 'medium' || !t.urgency ? 'selected' : ''}>🟡 普通</option>
          <option value="low" ${t.urgency === 'low' ? 'selected' : ''}>🟢 不急</option>
        </select>
      </div>
      <div class="form-field"><label>狀態 <span data-tip="狀態|依實際開始/完成日自動推導" style="cursor:help;">?</span></label>
        <select id="tf-status">
          <option value="pending" ${t.status === 'pending' || !t.status ? 'selected' : ''}>未開始</option>
          <option value="wip" ${t.status === 'wip' ? 'selected' : ''}>進行中</option>
          <option value="done" ${t.status === 'done' ? 'selected' : ''}>已完成</option>
          <option value="hold" ${t.status === 'hold' ? 'selected' : ''}>擱置中</option>
        </select>
      </div>
    </div>
    <div class="form-field">
      <label>說明</label>
      <textarea id="tf-desc" placeholder="任務詳細說明（選填）">${U.esc(v(t.desc))}</textarea>
    </div>

    <div class="form-collapse ${mode === 'edit' ? 'open' : ''}" id="tf-actualSection">
      <div class="form-collapse-head" onclick="document.getElementById('tf-actualSection').classList.toggle('open')">
        <span class="form-collapse-chevron">▸</span> 實際執行
      </div>
      <div class="collapse-body">
        <div class="form-row">
          <div class="form-field"><label>實際開始</label><input type="date" id="tf-actualStart" value="${v(t.actualStart)}"></div>
          <div class="form-field"><label>實際完成</label><input type="date" id="tf-actualEnd" value="${v(t.actualEnd)}"></div>
        </div>
        <div class="form-field">
          <label>交付物</label>
          <textarea id="tf-deliverable" placeholder="交付物說明（選填）">${U.esc(v(t.deliverable))}</textarea>
        </div>
        <div class="form-field">
          <label>交付物連結</label>
          <input type="text" id="tf-deliverableLink" value="${U.esc(v(t.deliverableLink))}" placeholder="貼雲端連結（Drive 等）">
        </div>
      </div>
    </div>

    <div class="tf-section-label">風險與其他</div>
    <div class="form-field">
      <label style="display:flex; align-items:center; gap:6px;">
        <input type="checkbox" id="tf-riskHL" ${t.riskHL ? 'checked' : ''} style="width:auto;">
        需拉高層 (HL)
        <span data-tip="需拉高層 HL|勾選表示此風險需升級到高層關注" style="cursor:help;">?</span>
      </label>
    </div>
    <div class="form-field">
      <label>風險內容</label>
      <textarea id="tf-riskIssue" placeholder="描述風險內容…">${U.esc(v(t.riskIssue))}</textarea>
    </div>
    <div class="form-field dur-only">
      <label>備註</label>
      <input type="text" id="tf-note" value="${U.esc(v(t.note))}">
    </div>
    <div class="form-field dur-only">
      <label style="display:flex; align-items:center; gap:6px;">
        <input type="checkbox" id="tf-cal" ${t.scheduleToCalendar ? 'checked' : ''} style="width:auto;">
        排入行事曆
        <span data-tip="排入行事曆|勾選後此任務會出現在總儀表板時程表（視圖一），用於「我要親自排時間動手做」的任務" style="cursor:help;">?</span>
      </label>
    </div>
    </div>
  `;
};

// 完整新增任務對話框（含日期、緊急度等所有欄位）
App.openNewTaskDialog = function(projId) {
  this.openModal({
    title: '新增任務',
    body: App.buildTaskFormHtml({ project: projId, start: D.fmt(D.today(), 'iso') }, 'new'),
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveNewTask('${projId}')">建立任務</button>
    `,
  });
  App.bindTaskTimeListeners();
  // Auto-focus on name field
  setTimeout(() => {
    const nameField = document.getElementById('tf-name');
    if (nameField) nameField.focus();
  }, 50);
};

// 總儀表板「+ 新增小時 Task」：照 openNewTaskDialog 同套，差別=不帶 project（跨專案，留空讓使用者選）+ measure='hours'（開出時段制）
App.openHoursTaskDialog = function() {
  this.openModal({
    title: '新增小時 Task',
    body: App.buildTaskFormHtml({ start: D.fmt(D.today(), 'iso') }, 'new', 'hours'),
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" data-edit-hide onclick="App.saveNewTask()">建立任務</button>`,
  });
  App.bindTaskTimeListeners();
  setTimeout(() => { const n = document.getElementById('tf-name'); if (n) n.focus(); }, 50);
};

App.saveNewTask = function(projId, _skipNegCheck) {
  if (App._roGuard()) return;
  // M2 表單改造：必填檢查（專案/名稱/擔當/類型/階段/預計開始；house style：toast warning + return）
  const _miss = App._markTaskRequired([
    { id: 'tf-project', name: '專案' }, { id: 'tf-name', name: '任務名稱' }, { id: 'tf-owner', name: '擔當' },
    { id: 'tf-taskType', name: '類型' }, { id: 'tf-stage', name: '階段' },
  ]);
  if (_miss.length) { U.toast('⚠ 請填必填欄位：' + _miss.join('、'), 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();

  const status = document.getElementById('tf-status').value;
  const startField = App.readStartField();   // 2-A：預計開始雙態 → {start, startMode}（與 saveTask 共用）
  // §6.5 塊三：負工期（完成早於開始）不擋死，改 confirm modal。判定讀 readEffStart 與 save 端/塊四口徑一致（涵蓋自動態）。
  const _negStart = App.readEffStart();
  const _pEnd = document.getElementById('tf-end').value;
  const _taskTypeV = document.getElementById('tf-taskType').value;
  if (!_skipNegCheck && _taskTypeV !== 'milestone' && _negStart && _pEnd && _pEnd < _negStart) {
    App.confirmModal({ title: '工期為負數', msg: '預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。', okText: '確認儲存', cancelText: '取消', onConfirm: () => App.saveNewTask(projId, true) });
    return;
  }
  const task = {
    id: U.id(),
    project: document.getElementById('tf-project').value || projId,
    name,
    desc: document.getElementById('tf-desc').value.trim(),
    owner: document.getElementById('tf-owner').value.trim(),
    dept: (document.querySelector('.task-form').dataset.measure === 'hours') ? ((document.getElementById('tf-dept') || {}).value || '') : '',   // 選項Y：時段制存部門名（§18.10）；工期制不掛、留 role 衍生
    category: 'deep',  // M2 表單改造：分類欄 UI 已移除，資料層保留、新任務一律 deep（工作性質維度後續另議）
    taskType: document.getElementById('tf-taskType').value,  // M2-T4：使用者顯式選擇（非 hardcode 預設，quickAdd 仍靠 ensureTaskType 兜底）
    stage: document.getElementById('tf-stage').value.trim(),       // M2-2a：與同步/匯入同欄位，trim 同收集口徑
    subgroup: document.getElementById('tf-subgroup').value.trim(),
    urgency: document.getElementById('tf-urgency').value,
    status,
    start: startField.start,           // 2-A：手動態存值、自動態存 ''（共用 readStartField）
    startMode: startField.startMode,   // 2-A：純 UI 意圖記憶（auto/manual）
    estHours: parseFloat(document.getElementById('tf-hours').value) || 1,
    predecessor: App.serializePredecessors(),  // M2-§6.4：結構化列序列化回字串（取代 #tf-predecessor 自由文字；格式同 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: App.readDurationField(),  // §6.5c：tf-end 反推為主、工期欄為輔（helper 單一真實來源）
    measureType: (document.querySelector('.task-form').dataset.measure) || 'duration',  // 第27項：計量制(duration工期/hours時段)，讀表單 data-measure；讀不到兜 duration
    scheduledStart: '',  // 排程套用結果，四條一致
    scheduledEnd: '',
    parentWbsId: '',   // 階段2：子綁父
    method: '',        // M2 表單改造：處理方式欄 UI 已移除，新任務存空字串
    riskHL: document.getElementById('tf-riskHL').checked,                       // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
    riskIssue: document.getElementById('tf-riskIssue').value.trim(),
    deliverable: document.getElementById('tf-deliverable').value.trim(),
    deliverableLink: document.getElementById('tf-deliverableLink').value.trim(),
    deliverableType: '',   // §7.1（不接 UI，預設值）
    requiredTask: true,    // §7.1（預設全必要）
    mustIssue: false,      // §7.1
    note: document.getElementById('tf-note').value.trim(),
    canSplit: true,   // 表單改造：可切分欄位移除，新任務沿用預設可切分
    scheduleToCalendar: document.getElementById('tf-cal').checked,
    completedAt: status === 'done' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };

  if (App._insertAfterId) {
    // 第二刀-B 選項1：列間➕＝接在上一列後。表單前置為空才自動帶入，不覆蓋使用者明填。
    if (!task.predecessor) task.predecessor = App._insertAfterId + '#FS';
    const _i = DATA.tasks.findIndex(x => x.id === App._insertAfterId);
    if (_i >= 0) { DATA.tasks.splice(_i + 1, 0, task); }   // 保留：同日 tiebreak
    else { DATA.tasks.push(task); }
    App._insertAfterId = null;
  } else {
    DATA.tasks.push(task);
  }
  // 修正1：新建小時 Task 立刻在「預計開始日」放臨時時段，週曆即時可見（智慧排程整批重建 schedule.items 時自然覆蓋重排；applySchedule 是 WBS 引擎、不碰時段 items）
  if (task.measureType === 'hours') {
    const _ps = (document.getElementById('tf-start') && document.getElementById('tf-start').value) || D.fmt(D.today(), 'iso');
    if (!DATA.schedule || !Array.isArray(DATA.schedule.items)) DATA.schedule = { week: null, items: [] };
    DATA.schedule.items.push({
      taskId: task.id, date: _ps, start: DATA.settings.workStart1 || '09:00',
      duration: Math.max(30, Math.round((parseFloat(task.estHours) || 1) * 60)),
      chunk: null, totalHours: parseFloat(task.estHours) || 1,
      week: D.weekKey(new Date(_ps)), locked: false, provisional: true,
    });
  }
  const _sch = applySchedule(DATA.tasks, 'full');
  const _blocked = _sch.skipped.filter(s => !String(s.reason || '').startsWith('anchor'));
  const _pid = this.currentProjectId;
  if (_pid) {
    const _proj = (DATA.projects || []).find(p => p.id === _pid);
    const _projBlocked = _blocked.filter(b => (DATA.tasks.find(t => t.id === b.id) || {}).project === _pid);
    if (_projBlocked.length) { U.toast('⚠️【' + ((_proj && _proj.name) || '本專案') + '】' + _projBlocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
  }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast(`✓ 已新增「${name}」`);
};

App.toggleTaskDone = function(id) {
  if (App._roGuard()) return;
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  if (t.status === 'done') {
    t.status = 'pending';
    t.completedAt = null;
  } else {
    t.status = 'done';
    t.completedAt = new Date().toISOString();
  }
  Storage.save();
  this.refreshAll();
};

App.openTaskInProject = function(id) {
  const task = DATA.tasks.find(t => t.id === id);
  if (!task) { U.toast('⚠ 找不到任務', 'warning'); return; }
  // 跳到該專案頁
  this.currentProjectId = task.project;
  // 找對應的左側選單按鈕讓它高亮
  const btn = document.querySelector(`.sb-proj[onclick*="${task.project}"]`);
  this.showPage('project', btn);
  // 等專案頁渲染完再打開編輯 modal
  setTimeout(() => { this.openTaskModal(id); }, 100);
};

App.openTaskModal = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;

  // Editable task
  const sch = getEffectiveSchedule(t);
  const proj = this.getProj(t.project);

  // 當前所在週次標示（紅色 ⁂ 表示未結案）
  const currentWeekBadge = t.currentWeek && t.status !== 'done'
    ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--terracotta-l); color:var(--terracotta); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} <span style="color:var(--terracotta);">⁂</span></span>`
    : (t.currentWeek
        ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--sage-50); color:var(--sage-700); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} ✓</span>`
        : '');

  // 歷史紀錄區塊
  const history = t.history || [];
  let historyHtml = '';
  if (history.length > 0) {
    const rows = history.map(h => {
      const statusColor = h.status?.includes('完成') ? 'var(--sage-700)' : h.status?.includes('延遲') ? 'var(--terracotta)' : 'var(--ink2)';
      return `<tr>
        <td class="col-num" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${U.esc(h.week || '')}</td>
        <td class="col-num" style="color:${statusColor};">${U.esc(h.status || '')}</td>
        <td class="col-flex col-wrap" style="line-height:1.4;">${U.esc(h.work || '—')}</td>
        <td class="col-mid col-wrap" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${h.planEnd || '—'}${h.planEndOriginal && h.planEndOriginal !== h.planEnd ? '<br><span style="color:var(--ink4); font-size:10px;">原:' + h.planEndOriginal + '</span>' : ''}</td>
        <td class="col-mid" style="font-family:var(--mono); font-size:10.5px; color:${h.actualEnd ? 'var(--sage-700)' : 'var(--ink3)'};">${h.actualEnd || '—'}</td>
        <td class="col-mid" style="color:var(--terracotta); font-size:11px;" title="${U.esc(h.delayReason || '')}">${U.esc(h.delayReason || '')}</td>
      </tr>`;
    }).join('');
    historyHtml = `
      <div class="form-field" style="margin-top:18px;">
        <label style="display:flex; align-items:center; gap:8px;">
          📋 歷史紀錄
          <span style="font-size:10.5px; color:var(--ink3); font-weight:400;">（共 ${history.length} 週的執行紀錄）</span>
        </label>
        <div style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:220px; overflow-y:auto;">
          <table class="data-table" style="font-size:11.5px;">
            <thead>
              <tr>
                <th class="col-num">週次</th>
                <th class="col-num">狀態</th>
                <th class="col-flex">本週工作</th>
                <th class="col-mid">預計完成</th>
                <th class="col-mid">實際完成</th>
                <th class="col-mid">延誤理由</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  this.openModal({
    title: `編輯任務 ${currentWeekBadge}`,
    body: App.buildTaskFormHtml({ ...t, start: sch.start, end: sch.end }, 'edit')
      + `${historyHtml}`,
    footer: `
      <button class="tb-action danger" data-edit-hide onclick="App.deleteTask('${t.id}')" style="margin-right:auto;">刪除任務</button>
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveTask('${t.id}')">儲存</button>
    `,
  });
  App.bindTaskTimeListeners();
};

App.saveTask = function(id, _skipNegCheck) {
  if (App._roGuard()) return;
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  // M2 表單改造：必填檢查（名稱/擔當/類型/階段/預計開始；編輯版專案是唯讀 div 無 tf-project，不檢查）
  const _miss = App._markTaskRequired([
    { id: 'tf-name', name: '任務名稱' }, { id: 'tf-owner', name: '擔當' },
    { id: 'tf-taskType', name: '類型' }, { id: 'tf-stage', name: '階段' },
  ]);
  if (_miss.length) { U.toast('⚠ 請填必填欄位：' + _miss.join('、'), 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();

  // §6.5 塊三：負工期（完成早於開始）不擋死，改 confirm modal（核心哲學：不替使用者做主、只提示）。判定讀 readEffStart 與塊四/save 端口徑一致（涵蓋自動態）。
  const _negStart = App.readEffStart();
  const _pEnd = document.getElementById('tf-end').value;
  const _taskTypeV = document.getElementById('tf-taskType').value;
  if (!_skipNegCheck && _taskTypeV !== 'milestone' && _negStart && _pEnd && _pEnd < _negStart) {
    App.confirmModal({ title: '工期為負數', msg: '預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。', okText: '確認儲存', cancelText: '取消', onConfirm: () => App.saveTask(id, true) });
    return;
  }
  const _aS = document.getElementById('tf-actualStart').value;
  const _aE = document.getElementById('tf-actualEnd').value;
  if (_aS && _aE && _aE < _aS) {
    U.toast('⚠ 實際完成日不能早於實際開始日', 'warning'); return;
  }

  t.name      = name;
  t.desc      = document.getElementById('tf-desc').value.trim();
  t.owner     = document.getElementById('tf-owner').value.trim();
  // M2 表單改造：分類/處理方式欄 UI 已移除——t.category / t.method 保留原值不覆蓋
  t.taskType  = document.getElementById('tf-taskType').value;  // M2-T4：編輯送出同步類型
  t.stage     = document.getElementById('tf-stage').value.trim();     // M2-2a：與同步/匯入同欄位，trim 同收集口徑
  t.subgroup  = document.getElementById('tf-subgroup').value.trim();
  t.predecessor  = App.serializePredecessors();  // M2-§6.4：結構化列序列化回字串（與 saveNewTask 共用同一函式，單一真實來源）
  t.durationDays = App.readDurationField();   // §6.5c：tf-end 反推為主、工期欄為輔（helper 單一真實來源）
  t.measureType = t.measureType || 'duration';  // 第27項：edit 鎖定計量制——保留既有值不從 form 覆寫；舊資料無此欄兜 duration
  if (t.measureType === 'hours') { const _de = document.getElementById('tf-dept'); if (_de) t.dept = _de.value; }   // 選項Y：時段制編輯同步部門名（§18.10）；工期制不碰、保 role 衍生
  t.urgency   = document.getElementById('tf-urgency').value;
  const startField = App.readStartField();   // 2-A：預計開始雙態（與 saveNewTask 共用同一取值邏輯）
  t.start     = startField.start;            // 手動態存值、自動態存 ''
  t.startMode = startField.startMode;
  t.actualStart = document.getElementById('tf-actualStart').value;
  t.actualEnd   = document.getElementById('tf-actualEnd').value;
  t.estHours  = parseFloat(document.getElementById('tf-hours').value) || 1;
  t.riskHL    = document.getElementById('tf-riskHL').checked;                   // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
  t.riskIssue = document.getElementById('tf-riskIssue').value.trim();
  t.deliverable = document.getElementById('tf-deliverable').value.trim();
  t.deliverableLink = document.getElementById('tf-deliverableLink').value.trim();
  t.note      = document.getElementById('tf-note').value.trim();
  // 表單改造：可切分欄位移除，編輯不覆蓋既有 t.canSplit
  t.scheduleToCalendar = document.getElementById('tf-cal').checked;
  ensureDeliverFields(t);   // §7.1：UI 未接，只補缺不蓋既有值（單一兜底，不寫死預設覆蓋）

  let newStatus = document.getElementById('tf-status').value;
  // 自動邏輯：實際完成日有填 → 強制標為已完成
  if (t.actualEnd) {
    newStatus = 'done';
  }
  if (newStatus === 'done') {
    if (t.status !== 'done') t.completedAt = t.actualEnd || new Date().toISOString();
    t.progress = 100;
  } else {
    t.completedAt = null;
    if (t.progress === 100) t.progress = 30;
  }
  t.status = newStatus;

  const _sch = applySchedule(DATA.tasks, 'full');
  const _blocked = _sch.skipped.filter(s => !String(s.reason || '').startsWith('anchor'));
  const _pid = this.currentProjectId;
  if (_pid) {
    const _proj = (DATA.projects || []).find(p => p.id === _pid);
    const _projBlocked = _blocked.filter(b => (DATA.tasks.find(t => t.id === b.id) || {}).project === _pid);
    if (_projBlocked.length) { U.toast('⚠️【' + ((_proj && _proj.name) || '本專案') + '】' + _projBlocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
  }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已儲存');
};

App.deleteTask = function(id) {
  if (App._roGuard()) return;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '刪除任務？', msg: '刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      const t = DATA.tasks.find(x => x.id === id);
      if (!t) return;
      t._deleted = true;
      t._deletedAt = new Date().toISOString();
      if (DATA.schedule && DATA.schedule.items) {
        DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
      }
      Storage.save();
      App.closeModal();
      App.refreshAll();
      U.toast('✓ 已移到「已刪除」區塊（14 天內可還原）');
    },
  });
};

// ─── 看板渲染 renderKanban（原物理在範本/部門區之後）───
App.renderKanban = function(targetId = 'page-kanban', pid = null) {
  const el = document.getElementById(targetId);
  if (!el) return;
  this.kanbanScope = { targetId, pid };
  if (!this.kanbanFilter) this.kanbanFilter = { status: '', stage: '', dept: '', keyword: '' };
  const tasks = (DATA.tasks || []).filter(t => !t._deleted && (!pid || t.project === pid));
  const filtered = filterTasks(tasks, this.kanbanFilter, D.today());
  const cols = groupTasksForBoard(filtered, D.today());

  // 階段下拉：本批僅專案頁範圍（pid 不為 null），讀 getProjectStages（已排序、已排 deleted）
  const stages = this.getProjectStages(pid);
  const proj = this.getProj(pid);   // dept 下拉資料源；pid=null（跨專案）→ undefined → 下拉不渲染
  const STATUS_OPTS = [
    { v: '', label: '全部' }, { v: 'pending', label: '未開始' }, { v: 'wip', label: '進行中' },
    { v: 'delayed', label: '延遲' }, { v: 'done', label: '已完成' }, { v: 'hold', label: '擱置中' }
  ];
  const statusOpts = STATUS_OPTS.map(o =>
    '<option value="' + o.v + '"' + (o.v === this.kanbanFilter.status ? ' selected' : '') + '>' + o.label + '</option>'
  ).join('');
  const seenKStage = new Set();
  const stageOpts = '<option value="">全部階段</option>' + stages
    .filter(s => { if (seenKStage.has(s.name)) return false; seenKStage.add(s.name); return true; })
    .map(s =>
    '<option value="' + U.esc(s.name) + '"' + (s.name === this.kanbanFilter.stage ? ' selected' : '') + '>' + U.esc(s.name) + '</option>'
  ).join('');
  const onch = ' App.renderKanban(App.kanbanScope.targetId, App.kanbanScope.pid);';
  const deptOpts = '<option value="">全部部門</option>' + ((proj && proj.depts) || []).map(d =>
    '<option value="' + d.id + '"' + (d.id === this.kanbanFilter.dept ? ' selected' : '') + '>' + U.esc(d.name) + '</option>'
  ).join('');
  const deptSelect = (proj && proj.depts && proj.depts.length)
    ? '<select class="kanban-filter-dept" onchange="App.kanbanFilter.dept=this.value;' + onch + '">' + deptOpts + '</select>'
    : '';
  const filterRow = '<div class="kanban-filter-row">' +
    '<select class="kanban-filter-status" onchange="App.kanbanFilter.status=this.value;' + onch + '">' + statusOpts + '</select>' +
    '<select class="kanban-filter-stage" onchange="App.kanbanFilter.stage=this.value;' + onch + '">' + stageOpts + '</select>' +
    deptSelect +
    '<input type="text" class="kanban-filter-search" placeholder="搜尋 編號/任務/負責人" value="' + U.esc(this.kanbanFilter.keyword || '') + '" onchange="App.kanbanFilter.keyword=this.value;' + onch + '">' +
  '</div>';

  el.innerHTML = filterRow + '<div class="kanban-board">' + cols.map(c =>
    '<div class="kanban-col' + (c.key === 'delayed' ? ' kanban-col-delayed' : '') + '">' +
      '<div class="kanban-col-head"><span>' + c.label + '</span>' +
        '<span class="kanban-col-count">' + c.tasks.length + '</span></div>' +
      '<div class="kanban-cards">' +
        c.tasks.map(t => App.buildKanbanCardHtml(t)).join('') +
      '</div>' +
    '</div>'
  ).join('') + '</div>';
};
