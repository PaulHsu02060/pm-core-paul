// report.js — 週報表(renderReport/exportReportExcel)+ 週報 Excel 匯入(openExcelImport/parseExcelImport/perform)。app.js 之後載入；WBS 匯出入在 excel.js。docs §18.7.1/2。
// ═══════════════════════════════════════════════════════
//  PAGE: REPORT
// ═══════════════════════════════════════════════════════
App.renderReport = function() {
  // Init: default to current week
  if (!this.reportWeekKey) {
    this.reportWeekKey = D.weekKey();
  }

  // Build week options (±4 weeks)
  const today = D.today();
  const currMonday = D.monday(today);
  const opts = [];
  for (let offset = -4; offset <= 4; offset++) {
    const m = D.addDays(currMonday, offset * 7);
    const e = D.addDays(m, 6);
    const wk = D.weekNum(m);
    const key = `W${wk}-${m.getFullYear()}`;
    let suffix = '';
    if (offset === -1) suffix = '  (上週)';
    else if (offset === 0) suffix = '  (本週)';
    else if (offset === 1) suffix = '  (下週)';
    opts.push({
      key,
      label: `W${wk}  ${D.fmt(m, 'ymd')} – ${D.fmt(e, 'md')}${suffix}`,
      monday: m,
      sunday: e,
    });
  }

  const currentOpt = opts.find(o => o.key === this.reportWeekKey) || opts.find(o => o.label.includes('本週'));
  if (currentOpt) this.reportWeekKey = currentOpt.key;
  const { monday, sunday } = currentOpt;
  const wkNum = D.weekNum(monday);

  // Gather tasks active during this specific week
  // Logic: 任務的「日期區間」與「該週」有交集
  // 嚴格依照選擇的週別，不擴大範圍（區別於儀表板的兩週視窗）
  const weekEnd = D.addDays(sunday, 1); // 含週日整天
  const inWeekTasks = DATA.tasks.filter(t => {
    if (t._deleted) return false;
    // 已完成：只看完成日是否在這週
    if (t.status === 'done' && t.completedAt) {
      const cd = new Date(t.completedAt);
      return cd >= monday && cd < weekEnd;
    }
    // 已完成但沒 completedAt → 用實際完成日
    if (t.status === 'done' && t.actualEnd) {
      const ad = new Date(t.actualEnd);
      return ad >= monday && ad < weekEnd;
    }
    // 進行中/未開始：任務區間 [start, end] 與本週 [monday, sunday] 有交集
    if (t.status !== 'done' && t.status !== 'hold') {
      const sch = getEffectiveSchedule(t);
      const ts = sch.start ? new Date(sch.start) : (sch.end ? new Date(sch.end) : null);
      const te = sch.end   ? new Date(sch.end)   : (sch.start ? new Date(sch.start) : null);
      if (!ts || !te) return false; // 無日期任務不計入週報
      return te >= monday && ts <= sunday;
    }
    return false;
  });

  // Summary
  const totalCnt = inWeekTasks.length;
  const doneCnt = inWeekTasks.filter(t => t.status === 'done').length;
  const wipCnt = inWeekTasks.filter(t => t.status === 'wip').length;
  const lateCnt = inWeekTasks.filter(t => {
    if (t.status === 'done') return false;
    const sch = getEffectiveSchedule(t);
    return sch.end && new Date(sch.end) < D.today();
  }).length;
  const totalHours = inWeekTasks.reduce((s, t) => s + (t.estHours || 0), 0);
  const completionRate = totalCnt > 0 ? Math.round(doneCnt / totalCnt * 100) : 0;

  // Group by project
  const projectGroups = {};
  for (const t of inWeekTasks) {
    if (!projectGroups[t.project]) projectGroups[t.project] = [];
    projectGroups[t.project].push(t);
  }

  // Notes
  const notes = DATA.weekNotes[this.reportWeekKey] || '';

  // Build HTML
  const html = `
    <div class="report-toolbar">
      <div class="report-week-nav">
        <button class="rw-arrow" onclick="App.reportWeekShift(-4)" title="跳到較早 4 週">‹‹</button>
        <button class="rw-arrow" onclick="App.reportWeekShift(-1)">‹</button>
        <select class="rw-select" onchange="App.reportWeekKey = this.value; App.renderReport();">
          ${opts.map(o => `<option value="${o.key}" ${o.key === currentOpt.key ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <button class="rw-arrow" onclick="App.reportWeekShift(1)">›</button>
        <button class="rw-arrow" onclick="App.reportWeekShift(4)" title="跳到較晚 4 週">››</button>
      </div>
      <div style="flex:1"></div>
      <button class="tb-action ghost" onclick="App.openExcelImport()">📊 匯入週報 Excel</button>
      <button class="tb-action ghost" onclick="window.print()">🖨 列印</button>
      <button class="tb-action" onclick="App.exportReportExcel('${this.reportWeekKey}')">⬇ 匯出 Excel</button>
    </div>

    <div class="report-print-head">
      <div>
        <div class="rph-week">W${wkNum} · ${monday.getFullYear()} 年 第 ${wkNum} 週</div>
        <div class="rph-range">${D.fmt(monday, 'ymd')} – ${D.fmt(sunday, 'ymd')}</div>
      </div>
      <div class="rph-right">
        <div class="rph-author">${U.esc(DATA.settings.userName || '使用者')}</div>
        <div class="rph-dept">${U.esc(DATA.settings.department || '')}</div>
      </div>
    </div>

    <div class="report-summary">
      <div class="rs-stat"><div class="rs-num">${totalCnt}</div><div class="rs-label">本週任務</div></div>
      <div class="rs-stat"><div class="rs-num">${doneCnt}</div><div class="rs-label">已完成</div></div>
      <div class="rs-stat"><div class="rs-num">${wipCnt}</div><div class="rs-label">進行中</div></div>
      <div class="rs-stat"><div class="rs-num">${lateCnt}</div><div class="rs-label">延遲</div></div>
      <div class="rs-stat"><div class="rs-num">${Math.round(totalHours)}h</div><div class="rs-label">總工時</div></div>
      <div class="rs-stat"><div class="rs-num">${completionRate}%</div><div class="rs-label">完成率</div></div>
    </div>

    ${totalCnt === 0 ? `<div class="empty-report">本週沒有任務</div>` :
      Object.entries(projectGroups).map(([projId, tasks]) => {
        const proj = this.getProj(projId);
        if (!proj) return '';
        return `<div class="report-project">
          <div class="rp-head" style="border-left:4px solid ${proj.color};">
            <span class="rp-dot" style="background:${proj.color}"></span>
            <span class="rp-name">${U.esc(proj.name)}</span>
            <span class="rp-stats">${tasks.length} 項 · ${tasks.filter(t=>t.status==='done').length} 完成 · ${tasks.filter(t=>t.status==='wip').length} 進行</span>
          </div>
          <table class="rp-table">
            <thead>
              <tr>
                <th style="width:30px;">#</th>
                <th>任務</th>
                <th style="width:60px;">擔當</th>
                <th style="width:88px;">預計開始</th>
                <th style="width:88px;">預計完成</th>
                <th style="width:60px;">進度</th>
                <th style="width:120px;">本週狀況</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              ${tasks.map((t, i) => {
                const sch = getEffectiveSchedule(t);
                const prog = t.progress || (t.status === 'done' ? 100 : t.status === 'wip' ? 30 : 0);
                const progClass = t.status === 'done' ? 'done' : (sch.end && new Date(sch.end) < D.today() && t.status !== 'done') ? 'late' : 'wip';
                let stateText = '', stateClass = 'wip';
                if (t.status === 'done') {
                  stateClass = 'done';
                  stateText = `✓ ${t.completedAt ? D.fmt(t.completedAt, 'md') + ' 完成' : '已完成'}`;
                } else if (sch.end && new Date(sch.end) < D.today()) {
                  stateClass = 'late';
                  stateText = `⚠ 延遲 ${-D.daysBetween(D.today(), new Date(sch.end)) + 1} 天`;
                } else {
                  stateText = '進行中';
                }
                return `<tr>
                  <td>${i + 1}</td>
                  <td>
                    <div class="rp-task-name">${U.esc(t.name)}</div>
                    ${t.desc ? `<div class="rp-task-desc">${U.esc(t.desc)}</div>` : ''}
                  </td>
                  <td>${U.esc(t.owner || '—')}</td>
                  <td class="rp-date">${sch.start ? D.fmt(sch.start, 'ymdShort') : '—'}</td>
                  <td class="rp-date">${sch.end ? D.fmt(sch.end, 'ymdShort') : '—'}</td>
                  <td><span class="rp-progress ${progClass}">${prog}%</span></td>
                  <td><span class="rp-status ${stateClass}">${stateText}</span></td>
                  <td><span class="rp-note">${U.esc(t.note || '—')}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('')
    }

    <div class="report-notes">
      <div class="rn-title">📝 額外備註</div>
      <div class="rn-textarea-wrap">
        <textarea class="rn-textarea" id="weekNotes" data-edit placeholder="本週遇到的問題、需要主管支援的事項..."
                  onblur="App.saveWeekNote('${this.reportWeekKey}', this.value)">${U.esc(notes)}</textarea>
      </div>
    </div>
  `;
  document.getElementById('page-report').innerHTML = '<div class="view-tabs-bar">' + this.buildReportTabsHtml() + '</div>' + html;
};

App.reportWeekShift = function(weeks) {
  // Parse current key to date
  const m = this.reportWeekKey.match(/W(\d+)-(\d+)/);
  if (!m) return;
  const wk = parseInt(m[1]), yr = parseInt(m[2]);
  // Approximate: find date for that week (use Jan 4 as anchor)
  const jan4 = new Date(yr, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const w1Monday = D.addDays(jan4, -jan4Day);
  const targetMonday = D.addDays(w1Monday, (wk - 1) * 7 + weeks * 7);
  this.reportWeekKey = D.weekKey(targetMonday);
  this.renderReport();
};

App.saveWeekNote = function(weekKey, text) {
  DATA.weekNotes[weekKey] = text;
  Storage.save();
};

App.exportReportExcel = async function(weekKey, opts) {
  opts = opts || {};
  // weekKey 可為單一週 ("W22-2026") 或 'all' (匯出所有有任務的週)
  if (typeof ExcelJS === 'undefined') {
    U.toast('❌ ExcelJS 函式庫未載入，請檢查 index.html 的 CDN', 'error');
    return;
  }

  // ── helpers ─────────────────────────────────────────────
  function weekKeyToRange(wk) {
    const m = wk.match(/W(\d+)-(\d+)/);
    if (!m) return null;
    const wkNum = parseInt(m[1]), yr = parseInt(m[2]);
    const jan4 = new Date(yr, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const w1Monday = D.addDays(jan4, -jan4Day);
    const monday = D.addDays(w1Monday, (wkNum - 1) * 7);
    const sunday = D.addDays(monday, 6);
    return { monday, sunday };
  }

  function statusText(t) {
    if (t.status === 'done') return '完成';
    if (t.status === 'hold') return '擱置';
    if (t.status === 'pending') return '尚未開始';
    const sch = getEffectiveSchedule(t);
    if (sch.end && new Date(sch.end) < D.today()) return '延遲';
    return '進行中';
  }

  function getDelayReason(t) {
    if (!t.desc) return '';
    const m = t.desc.match(/【延誤】([^\n]+)/);
    return m ? m[1].trim() : '';
  }

  function getWorkDesc(t) {
    if (!t.desc) return '';
    return t.desc.replace(/【延誤】[^\n]+\n?/g, '').trim() || t.name;
  }

  // F 欄 (預計完成日)：若有展延則用 "原日期\n-> 展延" 字串；單一日期則用 Date 物件（讓 Excel 套日期格式）
  function planEndCell(t) {
    const sch = getEffectiveSchedule(t);
    const planned = t.plannedEnd || '';
    const eff = sch.end || '';
    if (planned && eff && D.fmt(planned, 'iso') !== D.fmt(eff, 'iso')) {
      // 有展延：可能還有多段（歷史更多次展延），但目前 schema 只記一次
      return `${D.fmt(planned, 'ymd')}\n-> ${D.fmt(eff, 'ymd')}`;
    }
    return eff ? new Date(eff) : null;
  }

  function actualEndCell(t) {
    return t.actualEnd ? new Date(t.actualEnd) : null;
  }

  // 收集每週任務
  function gatherWeekTasks(monday, sunday) {
    const weekEnd = D.addDays(sunday, 1);
    return DATA.tasks.filter(t => {
      if (t._deleted) return false;
      if (t.status === 'done' && t.completedAt) {
        const cd = new Date(t.completedAt);
        return cd >= monday && cd < weekEnd;
      }
      if (t.status === 'done' && t.actualEnd) {
        const ad = new Date(t.actualEnd);
        return ad >= monday && ad < weekEnd;
      }
      if (t.status !== 'done' && t.status !== 'hold') {
        const sch = getEffectiveSchedule(t);
        const ts = sch.start ? new Date(sch.start) : (sch.end ? new Date(sch.end) : null);
        const te = sch.end   ? new Date(sch.end)   : (sch.start ? new Date(sch.start) : null);
        if (!ts || !te) return false;
        return te >= monday && ts <= sunday;
      }
      return false;
    });
  }

  // 決定要匯出哪些週
  const weekKeysToExport = [];
  if (weekKey === 'all') {
    // 掃所有 tasks 取得所有涉及的週次
    const wks = new Set();
    for (const t of DATA.tasks) {
      if (t._deleted) continue;
      const sch = getEffectiveSchedule(t);
      const d = sch.end || sch.start || t.actualEnd || t.completedAt;
      if (d) wks.add(D.weekKey(new Date(d)));
    }
    weekKeysToExport.push(...Array.from(wks).sort((a, b) => {
      const ra = weekKeyToRange(a), rb = weekKeyToRange(b);
      return ra.monday - rb.monday;
    }));
  } else {
    weekKeysToExport.push(weekKey);
  }

  if (weekKeysToExport.length === 0) {
    U.toast('⚠ 沒有可匯出的週次', 'warning');
    return;
  }

  // ── 建立 ExcelJS workbook ───────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = DATA.settings.userName || CFG('APP_NAME', 'PM-Core');
  workbook.created = new Date();

  const FONT = { name: '新細明體', size: 12 };
  const FONT_BOLD = { name: '新細明體', size: 12, bold: true };
  const HEADER_ROW = ['專案名稱', '項次', '議題項目', '狀態', '本周工作預計項目/對策', '預計完成日', '實際完成日', '延誤理由(有延誤才填寫)', '負責人', '備註'];
  const COL_WIDTHS = [19.375, 7.5, 26.375, 9.5, 69.125, 14.125, 12.75, 56.5, 15.25, 5.5];

  for (const wk of weekKeysToExport) {
    const range = weekKeyToRange(wk);
    if (!range) continue;
    const { monday, sunday } = range;
    const inWeekTasks = gatherWeekTasks(monday, sunday);
    if (inWeekTasks.length === 0 && weekKeysToExport.length > 1) continue;  // 多週模式略過空週

    // sheet 名稱：民國格式 e.g. 115.5.26
    const rocYear = monday.getFullYear() - 1911;
    const sheetName = `${rocYear}.${monday.getMonth() + 1}.${monday.getDate()}`;
    const ws = workbook.addWorksheet(sheetName, { views: [{ state: 'normal' }] });

    // 欄寬
    ws.columns = COL_WIDTHS.map(w => ({ width: w }));

    // 標題列
    const headerRow = ws.addRow(HEADER_ROW);
    headerRow.height = undefined;  // 讓 Excel 自動依 wrap 撐高
    headerRow.eachCell((cell, colNum) => {
      cell.font = FONT_BOLD;
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });

    // 分組：依專案
    const projectGroups = {};
    const projOrder = [];
    for (const t of inWeekTasks) {
      if (!projectGroups[t.project]) {
        projectGroups[t.project] = [];
        projOrder.push(t.project);
      }
      projectGroups[t.project].push(t);
    }

    let projIdx = 0;
    const projRowSpans = [];  // {startRow, endRow} for A column merging

    for (const projId of projOrder) {
      const proj = App.getProj(projId);
      if (!proj) continue;
      projIdx++;
      const tasks = projectGroups[projId];
      const rowStart = ws.rowCount + 1;  // 下一列要寫入的行號

      tasks.forEach((t, i) => {
        // 項次格式：多專案時用 "主-子"，單一專案用純數字
        const itemIdx = projOrder.length > 1 ? `${projIdx}-${i + 1}` : `${i + 1}`;
        const row = ws.addRow([
          i === 0 ? proj.name : null,           // A 專案名稱（只在第一列）
          itemIdx,                               // B 項次
          t.name,                                // C 議題項目
          statusText(t),                         // D 狀態
          getWorkDesc(t),                        // E 本周預計
          planEndCell(t),                        // F 預計完成日 (Date 或 String)
          actualEndCell(t),                      // G 實際完成日 (Date 或 null)
          getDelayReason(t),                     // H 延誤理由
          t.owner || '',                         // I 負責人
          t.note || '',                          // J 備註
        ]);

        // 全列共通格式
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.font = FONT;
          // 對齊：A/B/D/F/G/I/J 置中；C/E/H 左對齊
          const centerCols = [1, 2, 4, 6, 7, 9, 10];
          cell.alignment = {
            wrapText: true,
            vertical: 'middle',
            horizontal: centerCols.includes(colNum) ? 'center' : 'left',
          };
        });

        // 特殊 number_format
        row.getCell(2).numFmt = '@';            // 項次：文字
        // F 欄：如果是 Date 物件用日期格式；如果是字串（有展延）就 General
        const fCell = row.getCell(6);
        if (fCell.value instanceof Date) fCell.numFmt = 'yyyy/mm/dd';
        // G 欄：實際完成日
        const gCell = row.getCell(7);
        if (gCell.value instanceof Date) gCell.numFmt = 'yyyy/mm/dd';
      });

      const rowEnd = ws.rowCount;
      if (tasks.length > 1) {
        projRowSpans.push({ start: rowStart, end: rowEnd });
      }
    }

    // 合併 A 欄
    for (const span of projRowSpans) {
      ws.mergeCells(span.start, 1, span.end, 1);
    }
  }

  // 額外備註 sheet（若有當週備註且只匯出單一週）
  if (weekKey !== 'all') {
    const notes = DATA.weekNotes && DATA.weekNotes[weekKey];
    if (notes) {
      const range = weekKeyToRange(weekKey);
      const ws = workbook.addWorksheet('備註');
      ws.columns = [{ width: 12 }, { width: 60 }];
      ws.addRow(['📝 本週備註']).getCell(1).font = FONT_BOLD;
      ws.addRow([notes]).getCell(1).alignment = { wrapText: true, vertical: 'top' };
      ws.addRow([]);
      ws.addRow(['日期', `${D.fmt(range.monday, 'ymd')} – ${D.fmt(range.sunday, 'ymd')}`]);
      ws.addRow(['製作人', DATA.settings.userName || '']);
      ws.addRow(['部門', DATA.settings.department || '']);
      ws.eachRow(row => row.eachCell(c => { if (!c.font) c.font = FONT; }));
    }
  }

  // 下載
  const buffer = await workbook.xlsx.writeBuffer();
  let filename;
  if (weekKey === 'all') {
    filename = `週會進度_全部_${D.fmt(new Date(), 'ymd').replace(/\//g, '')}.xlsx`;
  } else {
    const range = weekKeyToRange(weekKey);
    const rocYear = range.monday.getFullYear() - 1911;
    filename = `週會進度_${rocYear}.${range.monday.getMonth() + 1}.${range.monday.getDate()}.xlsx`;
  }
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  U.toast(`✓ 已下載 ${filename}`);
};

// ─── 週報 Excel 匯入：入口 + 解析狀態（原 EXCEL HISTORY 區）───
// ─── EXCEL HISTORY IMPORT (Weekly Report) ───
App.openExcelImport = function() {
  this.openModal({
    title: '📊 匯入週報 Excel',
    body: `
      <div style="font-size:12.5px; line-height:1.6; color:var(--ink2); margin-bottom:14px;">
        匯入「週會進度」Excel，<b style="color:var(--sage-700);">智慧合併</b>：
        <br>• 同名任務（同專案 + 同議題項目）→ 更新狀態 / 日期 / 延誤理由
        <br>• Excel 新任務 → 自動新增
        <br>• ${CFG('APP_NAME', 'PM-Core')} 已有但 Excel 沒有的 → <b>保留不動</b>
      </div>

      <div style="margin-bottom:14px; padding:10px 14px; background:var(--surface2); border:1px solid var(--rule); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px;">
          <input type="checkbox" id="excelImportSkipJ" style="width:16px; height:16px; cursor:pointer;">
          <span><b>跳過 ${CFG('WBS_LABEL', 'WBS')}任務</b>（預設：不跳過，全部一起合併）</span>
        </label>
        <div style="font-size:11px; color:var(--ink3); margin-top:6px; margin-left:24px;">
          勾起 → ${CFG('WBS_LABEL', 'WBS')}由 Google Sheet 同步管理 / 不勾 → Excel 為準
        </div>
      </div>

      <div id="excelImportZone" style="border:2px dashed var(--rule); border-radius:10px; padding:32px; text-align:center; cursor:pointer; background:var(--surface2); transition:all .15s;">
        <div style="font-size:32px; margin-bottom:8px;">📊</div>
        <div style="font-size:13px; font-weight:500;">點擊或拖曳 .xlsx 週報檔案</div>
        <div style="font-size:11px; color:var(--ink3); margin-top:4px;">支援多週合併（一份檔案內多 sheet）</div>
        <input type="file" id="excelImportFile" accept=".xlsx,.xls" style="display:none;">
      </div>

      <div id="excelImportPreview" style="display:none; margin-top:14px;">
        <div id="excelImportStats" style="padding:10px 14px; background:var(--sage-50); border-radius:8px; font-size:12px; margin-bottom:10px;"></div>
        <div style="max-height:280px; overflow-y:auto; border:1px solid var(--rule); border-radius:8px;">
          <table id="excelImportTable" class="data-table" style="font-size:11.5px;">
          </table>
        </div>
      </div>

      <div id="excelImportLog" style="display:none; margin-top:14px; padding:10px 14px; background:var(--sage-800); color:var(--sage-100); border-radius:8px; font-family:var(--mono); font-size:11px; max-height:160px; overflow-y:auto;"></div>
    `,
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" id="excelImportBtn" onclick="App.performExcelImport()" disabled style="opacity:.5;">確定匯入</button>
    `,
  });

  // Bind events after modal renders
  setTimeout(() => {
    const zone = document.getElementById('excelImportZone');
    const fileInput = document.getElementById('excelImportFile');
    const skipJBox = document.getElementById('excelImportSkipJ');
    if (!zone || !fileInput) return;

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.background = 'var(--sage-50)'; zone.style.borderColor = 'var(--sage-500)'; });
    zone.addEventListener('dragleave', () => { zone.style.background = 'var(--surface2)'; zone.style.borderColor = 'var(--rule)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.background = 'var(--surface2)';
      zone.style.borderColor = 'var(--rule)';
      if (e.dataTransfer.files.length) App.parseExcelImport(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) App.parseExcelImport(e.target.files[0]);
    });
    // checkbox 變更時，若已解析過則重新 render preview（用新 skipJ 規則）
    if (skipJBox) {
      skipJBox.addEventListener('change', () => {
        if (App._excelParsedRows && App._excelParsedRows.length) {
          // 重新計算 skipped 旗標
          const skipJ = skipJBox.checked;
          for (const r of App._excelParsedRows) {
            r.skipped = skipJ && r.projDisplay.includes(CFG('WBS_SKIP_KEYWORD', 'WBS'));
          }
          App.renderExcelImportPreview();
        }
      });
    }
  }, 50);
};

App._excelParsedRows = [];

// ─── 週報 Excel 匯入：解析/預覽/執行（原 WBS 匯入區之後）───
App.parseExcelImport = async function(file) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = [];

    // Normalize / map project name → display name
    function mapProj(name) {
      if (!name) return '';
      const s = String(name).trim().replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
      for (const a of SEED('projAliases', [])) {
        if ((a.includes || []).some(k => s.includes(k))) return a.name;
      }
      return s;
    }

    // ROC year sheet name → Monday of that week
    function parseSheetDate(name) {
      const m = String(name).match(/(\d+)\.(\d+)\.(\d+)/);
      if (!m) return null;
      const y = parseInt(m[1]) + 1911;
      const d = new Date(y, parseInt(m[2]) - 1, parseInt(m[3]));
      const dow = d.getDay();
      d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
      return d;
    }

    function fmtIso(d) {
      if (!d || isNaN(d)) return '';
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function parseDateCell(v) {
      if (!v) return { original: '', extended: '' };
      if (v instanceof Date) return { original: fmtIso(v), extended: '' };
      const s = String(v).trim();
      const arrow = s.match(/^(.+?)[\s\n]*->\s*(.+)$/);
      if (arrow) {
        return { original: parseLoose(arrow[1].trim()), extended: parseLoose(arrow[2].trim()) };
      }
      return { original: parseLoose(s), extended: '' };
    }

    function parseLoose(s) {
      let m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
      if (m) return `${new Date().getFullYear()}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
      return s;
    }

    let totalWeeks = 0;
    for (const sheetName of wb.SheetNames) {
      const weekMon = parseSheetDate(sheetName);
      if (!weekMon) continue;
      totalWeeks++;
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: 'yyyy-mm-dd' });

      let currentProj = '';
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!r || r.length === 0) continue;
        const [projName, idx, item, status, work, planEnd, actualEnd, delay, owner, note] = r;
        if (projName) currentProj = String(projName).trim();
        if (!currentProj || (!item && !work)) continue;

        const projDisplay = mapProj(currentProj);
        const planDates = parseDateCell(planEnd);
        const actDates = parseDateCell(actualEnd);

        rows.push({
          sheetName,
          weekMonday: fmtIso(weekMon),
          projDisplay,
          idx: idx ? String(idx) : '',
          item: item ? String(item).trim() : '',
          status: status ? String(status).trim() : '進行中',
          work: work ? String(work).trim() : '',
          planEndOriginal: planDates.original,
          planEnd: planDates.extended || planDates.original,
          actualEnd: actDates.original,
          delayReason: delay ? String(delay).trim() : '',
          owner: owner ? String(owner).trim() : '',
          note: note ? String(note).trim() : '',
          skipped: (document.getElementById('excelImportSkipJ')?.checked && projDisplay.includes(CFG('WBS_SKIP_KEYWORD', 'WBS'))) || false,
        });
      }
    }

    App._excelParsedRows = rows;
    App._excelTotalWeeks = totalWeeks;
    App.renderExcelImportPreview();
  } catch (e) {
    U.toast('❌ 解析失敗：' + e.message, 'error');
    console.error(e);
  }
};

App.renderExcelImportPreview = function() {
  const rows = App._excelParsedRows || [];
  if (rows.length === 0) {
    U.toast('⚠ 檔案內沒有有效資料', 'warning');
    return;
  }

  const skipped = rows.filter(r => r.skipped).length;
  const toImport = rows.length - skipped;
  const projects = new Set(rows.filter(r => !r.skipped).map(r => r.projDisplay));

  document.getElementById('excelImportStats').innerHTML =
    `<b>${App._excelTotalWeeks}</b> 個週次　|　共 <b>${rows.length}</b> 筆　|　<b style="color:var(--sage-700);">${toImport}</b> 將匯入　|　<b style="color:var(--ink4);">${skipped}</b> ${CFG('WBS_LABEL', 'WBS')}跳過　|　<b>${projects.size}</b> 個專案`;

  const tbl = document.getElementById('excelImportTable');
  let html = `<thead><tr>
    <th class="col-num">週次</th>
    <th class="col-mid">專案</th>
    <th class="col-flex">議題</th>
    <th class="col-num">狀態</th>
    <th class="col-mid">預計完成</th>
    <th class="col-mid">擔當</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const opacity = r.skipped ? 'opacity:0.4;' : '';
    html += `<tr style="${opacity}">
      <td class="col-num" style="font-family:var(--mono); font-size:10.5px;">${r.sheetName}</td>
      <td class="col-mid" style="font-weight:500;" title="${U.esc(r.projDisplay)}">${U.esc(r.projDisplay)}${r.skipped ? ' <span style="color:var(--ink4);">(跳過)</span>' : ''}</td>
      <td class="col-flex" title="${U.esc(r.item)}">${U.esc(r.item)}</td>
      <td class="col-num">${r.status}</td>
      <td class="col-mid" style="font-family:var(--mono); font-size:10.5px;">${r.planEnd}</td>
      <td class="col-mid" style="font-size:10.5px;" title="${U.esc(r.owner)}">${U.esc(r.owner)}</td>
    </tr>`;
  }
  html += '</tbody>';
  tbl.innerHTML = html;

  document.getElementById('excelImportPreview').style.display = '';
  const btn = document.getElementById('excelImportBtn');
  btn.disabled = false;
  btn.style.opacity = '1';
};

App.performExcelImport = function() {
  const rows = (App._excelParsedRows || []).filter(r => !r.skipped);
  if (rows.length === 0) {
    U.toast('⚠ 沒有可匯入的任務', 'warning');
    return;
  }

  const logEl = document.getElementById('excelImportLog');
  logEl.style.display = '';
  logEl.innerHTML = '';
  const log = (msg) => { logEl.innerHTML += msg + '<br>'; logEl.scrollTop = logEl.scrollHeight; };

  log('開始匯入（方案 A：同名任務合併歷史紀錄）...');

  // Build/find projects
  const projMap = {};
  for (const p of DATA.projects) projMap[p.name] = p;

  function getProjColor(name) {
    for (const c of SEED('projColors', [])) {
      if ((c.includes || []).some(k => name.includes(k))) return c.color;
    }
    return '#7E796D';
  }

  // Create missing projects
  const usedProjects = new Set(rows.map(r => r.projDisplay));
  for (const name of usedProjects) {
    if (!projMap[name]) {
      const proj = {
        id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        color: getProjColor(name),
        note: '從 Excel 週報匯入建立',
        synced: false,
        createdAt: new Date().toISOString(),
      };
      DATA.projects.push(proj);
      projMap[name] = proj;
      log('+ 建立新專案：' + name);
    }
  }

  function mapStatus(s) {
    if (!s) return 'pending';
    if (s.includes('完成')) return 'done';
    if (s.includes('進行')) return 'wip';
    if (s.includes('延遲') || s.includes('延誤')) return 'wip';
    if (s.includes('擱置') || s.includes('暫停')) return 'hold';
    if (s.includes('尚未') || s.includes('未開始')) return 'pending';
    return 'pending';
  }

  // ──── 方案 A：先依「專案 + 任務名」分組 ────
  // 同一個任務在多週出現 → 視為「同任務的歷史紀錄」
  const taskGroups = {};  // { groupKey: [row, row, row...] }
  for (const r of rows) {
    const proj = projMap[r.projDisplay];
    if (!proj) continue;
    const name = (r.item || r.work.slice(0, 30) || `任務 ${r.idx}`).trim();
    const groupKey = `${proj.id}|${name}`;
    if (!taskGroups[groupKey]) taskGroups[groupKey] = [];
    taskGroups[groupKey].push({ ...r, _projId: proj.id, _name: name });
  }

  let added = 0, updated = 0;

  for (const groupKey of Object.keys(taskGroups)) {
    const group = taskGroups[groupKey];
    // 依週次排序（升序：舊週→新週）
    group.sort((a, b) => (a.weekMonday || '').localeCompare(b.weekMonday || ''));
    const latest = group[group.length - 1]; // 最新週的紀錄
    const projId = latest._projId;
    const name = latest._name;

    // 查找是否已有同名任務（同專案 + 同名）
    let task = DATA.tasks.find(t => t.project === projId && t.name === name);

    // Build history array from all weeks
    const history = group.map(r => ({
      week: r.sheetName,
      weekMonday: r.weekMonday,
      status: r.status,
      planEnd: r.planEnd,
      planEndOriginal: r.planEndOriginal,
      actualEnd: r.actualEnd,
      work: r.work,
      delayReason: r.delayReason,
      note: r.note,
      owner: r.owner,
    }));

    // 依「最新週」決定當前任務狀態（方案 A）
    const status = mapStatus(latest.status);
    const isDone = status === 'done';
    let desc = latest.work || '';
    if (latest.delayReason) desc += (desc ? '\n' : '') + '【延誤】' + latest.delayReason;

    // actualStart：取第一個有的，否則用最早週的週一
    const firstActualStart = group.find(r => r.actualStart)?.actualStart || group[0].weekMonday;
    // actualEnd：取最新週的（若有）
    const actualEnd = latest.actualEnd || group.findLast?.(r => r.actualEnd)?.actualEnd || '';

    if (task) {
      // 更新現有任務（合併 history）
      // 把舊 history 跟新 history 合併，依 week 去重
      const oldHistory = task.history || [];
      const mergedMap = {};
      for (const h of oldHistory) mergedMap[h.week] = h;
      for (const h of history) mergedMap[h.week] = h; // 新的覆蓋舊的
      task.history = Object.values(mergedMap).sort((a, b) => (a.weekMonday || '').localeCompare(b.weekMonday || ''));

      // 用最新週的內容覆蓋當前狀態
      task.desc = desc;
      task.owner = latest.owner;
      task.start = task.actualStart || firstActualStart;
      task.plannedEnd = latest.planEndOriginal;
      task.actualStart = task.actualStart || firstActualStart;
      task.actualEnd = actualEnd;
      task.status = status;
      task.progress = isDone ? 100 : (status === 'wip' ? 30 : 0);
      task.note = latest.note;
      task.completedAt = isDone ? (actualEnd || latest.planEnd || latest.weekMonday) : null;
      task.urgency = latest.status === '延遲' ? 'high' : (task.urgency || 'medium');
      // 記錄當前所在週次
      task.currentWeek = latest.sheetName;
      updated++;
    } else {
      // 新任務
      DATA.tasks.push({
        id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        project: projId,
        name,
        desc,
        owner: latest.owner,
        urgency: latest.status === '延遲' ? 'high' : 'medium',
        category: 'deep',
        estHours: 2,
        canSplit: true,
        start: firstActualStart,
        plannedEnd: latest.planEndOriginal,
        actualStart: firstActualStart,
        actualEnd: actualEnd,
        status,
        progress: isDone ? 100 : (status === 'wip' ? 30 : 0),
        note: latest.note,
        method: '',
        completedAt: isDone ? (actualEnd || latest.planEnd || latest.weekMonday) : null,
        synced: false,
        history,
        currentWeek: latest.sheetName,
        scheduledStart: '',  // 形狀統一；D為週次同步任務不參與PDM排程，故不補predecessor/wbs/durationDays
        scheduledEnd: '',
        createdAt: new Date().toISOString(),
      });
      added++;
    }
  }

  Storage.save();
  log(`✓ 新增 ${added} 筆任務`);
  if (updated > 0) log(`✓ 更新 ${updated} 筆現有任務（合併歷史）`);
  log('✓ 完成，已寫入本地儲存');

  setTimeout(() => {
    this.closeModal();
    this.refreshAll();
    U.toast(`✓ 匯入完成（${added} 新增 / ${updated} 更新）`, 'success');
    // 顯眼提醒：跨裝置同步流程
    setTimeout(() => {
      App.confirmModal({ icon: 'ti-cloud-up', iconBg: '--sage-50', iconColor: '--sage-600', title: 'Excel 匯入完成', msg: '跨裝置同步步驟：<br>1. 立即按【設定 → 立即上傳到雲端】讓雲端拿到合併後最新版。<br>2. 到別台機器第一件事按【設定 → 從雲端下載最新】再操作，避免舊資料覆蓋雲端。<br>本次匯入：' + added + ' 新增 / ' + updated + ' 更新', cancelText: null, okText: '我知道了' });
    }, 600);
  }, 1500);
};
