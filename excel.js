// excel.js — WBS Excel 匯出(exportProjectWbs/_gantt*/predToWbsFormat)+ 匯入(WBS_COLUMNS/GANTT_FILL/wbsDateStr/buildWbsPreview/performWbsImport/openWbsImport)。app.js 之後載入；getProjectStages/datalists 在 core。docs §18.7.2。
// predToWbsFormat(predStr, idToWbsMap)：id#FS+2 → wbs 序號縮寫 12FS（§13.3 匯出反解）。
// 複用 parsePredecessors 解析；dep(id)→wbs 查 idToWbsMap，查不到保留原 dep + warn；FS 全顯、lag 帶號；多筆逗號接。
App.predToWbsFormat = function(predStr, idToWbsMap) {
  const preds = parsePredecessors(predStr);
  if (!preds.length) return '';
  return preds.map(p => {
    const wbs = idToWbsMap.get(p.dep);
    const ref = (wbs != null) ? wbs : p.dep;   // 查不到保留原 dep
    if (wbs == null) console.warn('[predToWbsFormat] dep 查無 wbs:', p.dep);
    const lag = p.lag > 0 ? '+' + p.lag : (p.lag < 0 ? String(p.lag) : '');
    return ref + p.type + lag;   // FS 全顯：12FS / 16SS+2 / 5SS-1
  }).join(',');
};

// 甘特日期範圍（§13.5）：掃 tasks 四個日期欄（ISO 字串），字串比找最小/最大
// （避時區坑，沿用 §4103 全系統「ISO 字串比＝時序」慣例）；空值跳過。
// 末端只把贏家轉 Date。無任何有效日期回 null。
App._ganttDateRange = function(tasks) {
  let minIso = '', maxIso = '';
  (tasks || []).forEach(t => {
    [t.plannedStart, t.actualStart, t.plannedEnd, t.actualEnd].forEach(v => {
      if (!v) return;                            // 空值跳過
      if (!minIso || v < minIso) minIso = v;     // ISO YYYY-MM-DD 字串比＝時序
      if (!maxIso || v > maxIso) maxIso = v;
    });
  });
  if (!minIso) return null;                      // 全空
  return { min: new Date(minIso), max: new Date(maxIso) };
};

// 甘特時間軸欄（§13.5 C1）：依 granularity 產欄陣列 [{start,end,label}]。
// 時間軸走日曆日（含週末），非工作日。day:一天一欄(start===end)；week:週一為界、含週日；month:當月1號~月底。
App._ganttColumns = function(min, max, granularity) {
  const cols = [];
  if (!min || !max) return cols;
  if (granularity === 'month') {
    let d = new Date(min.getFullYear(), min.getMonth(), 1);
    while (d <= max) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);   // 月底
      cols.push({ start: new Date(d), end, label: d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  } else if (granularity === 'week') {
    let d = D.monday(min);
    while (d <= max) {
      const end = D.addDays(d, 6);
      cols.push({ start: new Date(d), end, label: D.fmt(d, 'md') });   // 該週週一 M/D
      d = D.addDays(d, 7);
    }
  } else {   // 'day'
    let d = new Date(min);
    while (d <= max) {
      cols.push({ start: new Date(d), end: new Date(d), label: D.fmt(d, 'md') });
      d = D.addDays(d, 1);
    }
  }
  return cols;
};

App.exportProjectWbs = async function(projId, granularity) {
  if (typeof ExcelJS === 'undefined') {
    U.toast('❌ ExcelJS 函式庫未載入，請檢查 index.html 的 CDN', 'error');
    return;
  }
  const proj = DATA.projects.find(p => p.id === projId);
  if (!proj) { U.toast('⚠ 找不到專案', 'warning'); return; }
  const tasks = DATA.tasks.filter(t => t.project === projId && !t._deleted);
  if (!tasks.length) { U.toast('⚠ 此專案無任務可匯出', 'warning'); return; }

  // 甘特日期範圍 + 時間軸欄（供下方甘特分頁鋪表頭/任務/填色）
  const range = App._ganttDateRange(tasks);
  const cols = App._ganttColumns(range && range.min, range && range.max, granularity || 'week');

  // 反查表：variant id→案別名、task id→wbs（id 全域唯一）
  const variantIdToName = {};
  (proj.variants || []).forEach(v => { variantIdToName[v.id] = v.name; });
  const idToWbsMap = new Map();
  tasks.forEach(t => { if (t.wbs != null && t.wbs !== '') idToWbsMap.set(t.id, t.wbs); });

  // 逐欄反向格式（round-trip 對齊 parseWbsExcel 讀法）
  const TYPE_LABEL = { milestone: '里程碑', group: '群組', task: '任務' };
  const dateCell = (iso) => iso ? new Date(iso) : null;
  const cellValue = (t, key) => {
    switch (key) {
      case 'wbs':         return t.wbs != null ? t.wbs : '';
      case 'variant':     return variantIdToName[t.variant] || '';
      case 'taskType':    return TYPE_LABEL[t.taskType] || '任務';
      case 'predecessor': return App.predToWbsFormat(t.predecessor, idToWbsMap);
      case 'progress':    return (typeof t.progress === 'number' ? t.progress : 0) / 100;
      case 'status':      return STATUS_LABELS_ZH[t.status] || '';   // 中文標籤 round-trip（對上 mapStatus，§13.x）
      case 'mustDeliver':
      case 'requiredTask':
      case 'mustIssue':   return t[key] ? '✓' : '';
      case 'plannedStart':
      case 'plannedEnd':
      case 'actualStart':
      case 'actualEnd':   return dateCell(t[key]);
      default:            return t[key] != null ? t[key] : '';
    }
  };

  // ── workbook ──
  const workbook = new ExcelJS.Workbook();
  workbook.creator = DATA.settings.userName || CFG('APP_NAME', 'PM-Core');
  workbook.created = new Date();
  const FONT = { name: '新細明體', size: 12 };
  const FONT_BOLD = { name: '新細明體', size: 12, bold: true };
  const FONT_MEMO = { name: '新細明體', size: 10, italic: true };

  const nCols = WBS_COLUMNS.length;
  const ws = workbook.addWorksheet(proj.name || 'WBS', { views: [{ state: 'frozen', ySplit: 2 }] });

  // 前置 memo 列（跨欄合併，§13.4）
  const memoText = '前置(N)欄：12FS=接#12完成後開始；SS同時開始／FF同時完成／SF開始才能完成；+N=延後 N 工作天';
  ws.addRow([memoText]);
  ws.mergeCells(1, 1, 1, nCols);
  const memoCell = ws.getCell(1, 1);
  memoCell.font = FONT_MEMO;
  memoCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  // 表頭列
  const headerRow = ws.addRow(WBS_COLUMNS.map(c => c.header));
  headerRow.eachCell((cell) => {
    cell.font = FONT_BOLD;
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  // 資料列（排序：_seqOf 全域序）
  const DATE_KEYS = ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd'];
  const sorted = tasks.slice().sort((a, b) => App._seqOf(a.id) - App._seqOf(b.id));
  sorted.forEach((t) => {
    const row = ws.addRow(WBS_COLUMNS.map(c => cellValue(t, c.key)));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });
    WBS_COLUMNS.forEach((c, i) => {
      if (DATE_KEYS.indexOf(c.key) >= 0) {
        const cell = row.getCell(i + 1);
        if (cell.value instanceof Date) cell.numFmt = 'yyyy/mm/dd';
      } else if (c.key === 'progress') {
        row.getCell(i + 1).numFmt = '0%';   // 顯示 50% 非 0.5（round-trip 值仍 0~1）
      }
    });
  });

  // ── 專案資訊分頁（round-trip：專案名 + 部門表，對齊 parseWbsExcel buildDepts/buildMemberToDept 讀法）──
  const wsInfo = workbook.addWorksheet('專案資訊');
  wsInfo.addRow(['專案名稱', proj.name || '']);
  wsInfo.addRow([]);                              // 空列分隔
  wsInfo.addRow(['部門', '專案成員']);           // 表頭（buildDepts/buildMemberToDept 掃這列）
  (proj.depts || []).forEach(d => {
    wsInfo.addRow([d.name || '', (d.members || []).map(m => m.name).filter(Boolean).join('、')]);
  });
  wsInfo.columns = [{ width: 16 }, { width: 40 }];

  // ── 甘特分頁(§13.5 ② 三層表頭 年/月/日 + 凍結;分段3 畫任務列、③段填色)──
  const ganttG = granularity || 'week';
  const isMonth = ganttG === 'month';
  const headRows = isMonth ? 2 : 3;   // month:年/月 兩層;day/week:年/月/日 三層
  const headTop = 3;                  // 表頭起始 row(圖例row1 + 空row2 + 表頭row3起)
  const bodyTop = headRows + 3;       // 任務列起始 row(圖例1 + 空1 + 表頭headRows + 1)
  const wsGantt = workbook.addWorksheet('甘特', { views: [{ state: 'frozen', xSplit: 5, ySplit: headRows + 2 }] });

  const GANTT_LEFT = ['序', '任務名', '標籤', '計畫起', '計畫訖'];
  const nLeft = 5;

  // 圖例列(row 1) + 空列(row 2) + 表頭列(row 3..headRows+2,空殼後填)
  const blank = cols.map(() => '');
  const rows = [];
  for (let r = 0; r < headRows + 2; r++) rows.push(wsGantt.addRow([...GANTT_LEFT.map(() => ''), ...blank]));

  // 圖例(row 1):A1 標題「甘特圖顏色代表意思：」+ 5 組[色塊merge2 + 文字merge2],col3 起
  const LEGEND = [
    { argb: GANTT_FILL.plan, text: '計畫' },
    { argb: GANTT_FILL.done, text: '完成' },
    { argb: GANTT_FILL.wip, text: '進行中' },
    { argb: GANTT_FILL.late, text: '逾期' },
    { argb: GANTT_FILL.holiday, text: '假日' },
  ];
  // A1 標題 merge(col1-2)
  wsGantt.mergeCells(1, 1, 1, 2);
  const titleCell = wsGantt.getCell(1, 1);
  titleCell.value = '甘特圖顏色代表意思：';
  titleCell.font = FONT_BOLD;
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  // 色塊文字從 col3 起,每組4欄(色塊merge2 + 文字merge2)
  LEGEND.forEach((lg, gi) => {
    const swatchCol = 3 + gi * 4;   // col 3/7/11/15/19
    wsGantt.mergeCells(1, swatchCol, 1, swatchCol + 1);
    wsGantt.getCell(1, swatchCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lg.argb } };
    wsGantt.mergeCells(1, swatchCol + 2, 1, swatchCol + 3);
    const tc = wsGantt.getCell(1, swatchCol + 2);
    tc.value = lg.text;
    tc.font = FONT_BOLD;
    tc.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  // 左 5 欄:標題放表頭首列、跨表頭列 merge、置中(不含圖例 row 1)
  GANTT_LEFT.forEach((title, idx) => {
    const col = idx + 1;
    wsGantt.mergeCells(headTop, col, headTop + headRows - 1, col);
    const cell = wsGantt.getCell(headTop, col);
    cell.value = title;
    cell.font = FONT_BOLD;
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  // 分組 merge helper:依 keyFn 把連續同 key 的欄合併、寫 label
  const groupRow = (rowIdx, keyFn, labelFn) => {
    let s = 0;
    for (let i = 1; i <= cols.length; i++) {
      const end = (i === cols.length) || (keyFn(cols[i]) !== keyFn(cols[s]));
      if (end) {
        const colL = nLeft + 1 + s, colR = nLeft + i;
        if (colR > colL) wsGantt.mergeCells(rowIdx, colL, rowIdx, colR);
        const cell = wsGantt.getCell(rowIdx, colL);
        cell.value = labelFn(cols[s]);
        cell.font = FONT_BOLD;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        s = i;
      }
    }
  };

  // 列1 年:merge 同年
  groupRow(headTop, c => c.start.getFullYear(), c => String(c.start.getFullYear()));
  if (isMonth) {
    // month 粒度:列2 月份(每欄一月,不 merge,直接寫 M)
    cols.forEach((c, i) => {
      const cell = wsGantt.getCell(headTop + 1, nLeft + 1 + i);
      cell.value = (c.start.getMonth() + 1) + '月';
      cell.font = FONT_BOLD;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  } else {
    // day/week:列2 月(merge 同年同月)、列3 日刻度
    groupRow(headTop + 1, c => c.start.getFullYear() + '-' + c.start.getMonth(), c => (c.start.getMonth() + 1) + '月');
    cols.forEach((c, i) => {
      const cell = wsGantt.getCell(headTop + 2, nLeft + 1 + i);
      if (ganttG === 'day') {
        const wd = ['日','一','二','三','四','五','六'][c.start.getDay()];
        cell.value = wd + '\n' + c.start.getDate();   // 星期\n日號
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        if (!D.isWorkday(c.start)) {                   // 假日格標粉紅
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GANTT_FILL.holiday } };
        }
      } else {
        cell.value = c.label;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      cell.font = FONT_BOLD;
    });
  }

  // 欄寬
  const ganttTimeW = ganttG === 'day' ? 4 : (isMonth ? 9 : 6);
  wsGantt.columns = [
    { width: 5 }, { width: 28 }, { width: 7 }, { width: 11 }, { width: 11 },
    ...cols.map(() => ({ width: ganttTimeW })),
  ];

  // ── 甘特任務列(§13.5 ② 分段3:每任務兩列 plan/actual + merge;③段才填色)──
  const ganttSorted = tasks.slice().sort((a, b) => App._seqOf(a.id) - App._seqOf(b.id));
  const DATEFMT = 'yyyy/mm/dd';
  const setDateCell = (cell, iso) => {
    if (iso) { cell.value = new Date(iso); cell.numFmt = DATEFMT; }
  };
  ganttSorted.forEach((t, k) => {
    const rTop = bodyTop + k * 2;   // plan 列
    const rBot = rTop + 1;               // actual 列
    const sch = getEffectiveSchedule(t);

    // 序、任務名跨兩列 merge(顯示一次、置中)
    wsGantt.mergeCells(rTop, 1, rBot, 1);  // 序
    wsGantt.mergeCells(rTop, 2, rBot, 2);  // 任務名
    const seqCell = wsGantt.getCell(rTop, 1);
    seqCell.value = App._seqOf(t.id);
    seqCell.alignment = { vertical: 'middle', horizontal: 'center' };
    const nameCell = wsGantt.getCell(rTop, 2);
    nameCell.value = t.name || '';
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    // 標籤欄(第3):plan 列「計畫」、actual 列「實際」
    wsGantt.getCell(rTop, 3).value = '計畫';
    wsGantt.getCell(rBot, 3).value = '實際';
    wsGantt.getCell(rTop, 3).alignment = { vertical: 'middle', horizontal: 'center' };
    wsGantt.getCell(rBot, 3).alignment = { vertical: 'middle', horizontal: 'center' };

    // 計畫起訖(第4/5):plan 列 = sch.plannedStart/End、actual 列 = t.actualStart/End
    setDateCell(wsGantt.getCell(rTop, 4), sch.plannedStart);
    setDateCell(wsGantt.getCell(rTop, 5), sch.plannedEnd);
    setDateCell(wsGantt.getCell(rBot, 4), t.actualStart);
    setDateCell(wsGantt.getCell(rBot, 5), t.actualEnd);
  });

  // ── 甘特填色(§13.5 ③:假日底先鋪、plan/actual bar 後蓋)──
  const fillCell = (r, c, argb) => {
    wsGantt.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  };
  // cols 的 ISO 預算(字串比交集,免時區)
  const colIso = cols.map(c => ({ s: D.fmt(c.start, 'iso'), e: D.fmt(c.end, 'iso') }));
  const colRange = (sIso, eIso) => {
    if (!sIso || !eIso || eIso < sIso) return null;
    let first = -1, last = -1;
    for (let i = 0; i < colIso.length; i++) {
      if (sIso <= colIso[i].e && eIso >= colIso[i].s) { if (first < 0) first = i; last = i; }
    }
    return first < 0 ? null : [first, last];
  };

  // plan/actual bar 後蓋
  const today = D.today();
  ganttSorted.forEach((t, k) => {
    const rTop = bodyTop + k * 2;
    const rBot = rTop + 1;
    const sch = getEffectiveSchedule(t);
    // plan 列
    const pr = colRange(sch.plannedStart, sch.plannedEnd);
    if (pr) for (let i = pr[0]; i <= pr[1]; i++) fillCell(rTop, nLeft + 1 + i, GANTT_FILL.plan);
    // actual 列:狀態色,逾期 late
    const ar = colRange(t.actualStart, t.actualEnd);
    if (ar) {
      const st = t.status || 'pending';
      const overdue = sch.plannedEnd && new Date(sch.plannedEnd) < today && st !== 'done';
      const argb = overdue ? GANTT_FILL.late : (st === 'done' ? GANTT_FILL.done : GANTT_FILL.wip);
      for (let i = ar[0]; i <= ar[1]; i++) fillCell(rBot, nLeft + 1 + i, argb);
    }
  });

  // ── 下載（照 exportReportExcel house style）──
  const buffer = await workbook.xlsx.writeBuffer();
  const dateStr = D.fmt(new Date(), 'ymd').replace(/\//g, '');
  const filename = (proj.name || 'WBS') + '_WBS_' + dateStr + '.xlsx';
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  U.toast('✓ 已下載 ' + filename);
};

// ─── WBS 匯入：helper + 欄位常數 + 預覽/執行（原夾島4 + WBS 區）───
// Date → 'YYYY-MM-DD'；空值/非 Date → ''
function wbsDateStr(v) {
  if (!v) return '';
  // 日期型（cellDates:true 解析的本地午夜 Date）→ 用本地 getter，不走 UTC toISOString（避免 UTC+8 -1 天）
  if (v instanceof Date && !isNaN(v)) return D.fmt(v, 'iso');
  // 字串/其他：先正則直抽 YYYY-MM-DD（完全不經 Date，免疫時區）
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 非標準格式才 round-trip（盡力而為；斜線日期 new Date 走本地，仍安全）
  const d = new Date(s);
  return isNaN(d) ? '' : D.fmt(d, 'iso');
}

// 讀專案資訊頁部門表（列12表頭，列13起對應），建「成員→部門」反查 map
// B欄空(品保/採購/生管)→用A部門名當成員；部門名自己也當key(H欄可能直接填'PM')
function buildMemberToDept(wsInfo) {
  const map = {};
  if (!wsInfo) return map;
  const info = XLSX.utils.sheet_to_json(wsInfo, { header: 'A', range: 0 });
  // 找表頭「部門」那列，往下到空白為止
  let headerIdx = info.findIndex(r => String(r.A || '').trim() === '部門'
                                   && String(r.B || '').trim() === '專案成員');
  if (headerIdx < 0) return map;
  for (let i = headerIdx + 1; i < info.length; i++) {
    const dept = String(info[i].A || '').trim();
    if (!dept) break;            // 遇空白列停止
    map[dept] = dept;            // 部門名自己當 key（H欄可能直接填部門名）
    const members = String(info[i].B || '').trim();
    if (members) {
      // 成員一格多人用頓號分隔
      members.split(/[、,，]/).map(s => s.trim()).filter(Boolean)
             .forEach(m => { map[m] = dept; });
    }
    // B欄空(品保/採購/生管)：上面 map[dept]=dept 已涵蓋，部門名自己就是成員
  }
  return map;
}

// H欄負責人→主責部門。split三種分隔符取第一個人名查map，查不到/髒值歸未指派
function ownerToDept(ownerStr, memberToDept) {
  const raw = String(ownerStr || '').trim();
  // 髒值過濾：空、破折號、表頭殘留
  if (!raw || raw === '—' || raw === '-' || raw === '負責人') return '未指派';
  // 三種分隔符：、 / ＋(全形) +(半形)，取第一個
  const first = raw.split(/[、,，\/／＋+]/)[0].trim();
  if (!first) return '未指派';
  return memberToDept[first] || '未指派';   // 查不到(如航嘉)歸未指派
}

// 讀專案資訊頁部門表，建 id 結構 [{id,name,members:[{id,name}]}]（D-2a：存進 project.depts，暫未被消費）
function buildDepts(wsInfo) {
  const depts = [];
  if (!wsInfo) return depts;
  const info = XLSX.utils.sheet_to_json(wsInfo, { header:'A', range:0 });
  const h = info.findIndex(r => String(r.A||'').trim()==='部門' && String(r.B||'').trim()==='專案成員');
  if (h<0) return depts;
  for (let i=h+1; i<info.length; i++) {
    const name = String(info[i].A||'').trim();
    if (!name) break;
    const members = String(info[i].B||'').trim()
      ? String(info[i].B).split(/[、,，]/).map(s=>s.trim()).filter(Boolean).map(n=>({id:U.id(), name:n}))
      : [];
    depts.push({ id: U.id(), name, members });
  }
  return depts;
}

// ─── WBS_COLUMNS：Excel 欄位定義單一來源（§13.1）───
// 匯出讀 header 寫表頭；未來匯入收斂 + 模糊辨識（aliases）三方共用此常數。
// header 逐字對齊 parseWbsExcel 實際讀的名（含「預計結束」「實際完成」怪名，見 §13.2）。
// aliases 本批先全空、預留模糊辨識（§13.7）。
// 人工對齊依據（key ↔ header，對 parseWbsExcel 讀法 app.js:8591-8644）：見下方陣列逐欄。
// 自檢：parseWbsExcel 目前 inline 讀、無常數名單可比對 → 真自檢待其收斂到常數後加（§13.1）；此陣列即人工對齊依據。
const WBS_COLUMNS = [
  { key: 'wbs', header: 'N', aliases: [] },
  { key: 'variant', header: '案別', aliases: [] },
  { key: 'stage', header: 'PLM階段', aliases: [] },
  { key: 'subgroup', header: '子群組', aliases: [] },
  { key: 'name', header: '任務名', aliases: [] },
  { key: 'taskType', header: '類型', aliases: [] },
  { key: 'predecessor', header: '前置(N)', aliases: [] },
  { key: 'durationDays', header: '工期', aliases: [] },
  { key: 'owner', header: '負責人', aliases: [] },
  { key: 'plannedStart', header: '預計開始', aliases: [] },
  { key: 'plannedEnd', header: '預計結束', aliases: [] },
  { key: 'actualStart', header: '實際開始', aliases: [] },
  { key: 'actualEnd', header: '實際完成', aliases: [] },
  { key: 'progress', header: '進度%', aliases: [] },
  { key: 'status', header: '狀態', aliases: [] },
  { key: 'mustDeliver', header: '必須繳付', aliases: [] },
  { key: 'deliverable', header: '繳付物說明', aliases: [] },
  { key: 'riskIssue', header: '風險議題', aliases: [] },
  { key: 'note', header: '備註', aliases: [] },
  { key: 'delivered', header: '已交付', aliases: [] },
  { key: 'deliverableLink', header: '繳付連結', aliases: [] },
  { key: 'deliverableType', header: '繳付件類型', aliases: [] },
  { key: 'requiredTask', header: '必要任務', aliases: [] },
  { key: 'mustIssue', header: '繳付物必須發行', aliases: [] },
];

// ─── GANTT_FILL：甘特填色 ARGB 常數（§13.5；ExcelJS cell.fill 用，非 CSS）───
// 8碼 ARGB（FF=不透明前綴）+ hex 去井號；值逐一對齊 style.css :root 的 --xl-gantt-* 對照表。
const GANTT_FILL = {
  plan:    'FFD9D2C5',   // --xl-gantt-plan    計畫淺米灰
  wip:     'FF4A6B85',   // --xl-gantt-wip     進行中（navy）
  done:    'FF3B6B4A',   // --xl-gantt-done    完成（深綠）
  late:    'FFC4633E',   // --xl-gantt-late    逾期（terracotta）
  holiday: 'FFF7DDE4',   // --xl-gantt-holiday 假日粉紅（僅標表頭）
  weekday: 'FFF2F3F5',   // --gantt-weekday    平日欄底（保留，未用於填色）
};

// 讀 WBS Excel，解析 WBS 主分頁的有效列（sheet 名比對見下，相容他人格式保留）
// 回傳 { ok, rows, projectName, errors }，不灌日期、不碰 DOM、不存 Storage
async function parseWbsExcel(file) {
  try {
    const buffer = await file.arrayBuffer();   // house style：與 App.parseExcelImport 一致
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    // 優先按名直取；找不到則 fallback 第一個非「專案資訊」分頁（容納匯出檔/他人格式，不挑分頁名）
    let wsMain = wb.Sheets['J系列整合WBS'];
    if (!wsMain) {
      const firstName = wb.SheetNames.find(n => n !== '專案資訊');
      wsMain = firstName ? wb.Sheets[firstName] : null;
    }
    if (!wsMain) {
      return { ok: false, rows: [], projectName: '', errors: ['找不到任何資料分頁'] };
    }

    // 專案名：專案資訊頁是 key-value 直式，掃 A 欄＝「專案名稱」那列取 B（不寫死列號）
    let projectName = '';
    const wsInfo = wb.Sheets['專案資訊'];
    if (wsInfo) {
      const infoRows = XLSX.utils.sheet_to_json(wsInfo, { header: 'A', range: 0 });
      const hit = infoRows.find(r => String(r.A || '').trim() === '專案名稱');
      projectName = hit ? String(hit.B || '').trim() : '';
    }
    if (!projectName) projectName = '未命名專案';

    // 部門翻譯：建「成員→部門」反查 map（重用上面已取的 wsInfo，免重複 lookup）
    const memberToDept = buildMemberToDept(wsInfo);

    const aoa = XLSX.utils.sheet_to_json(wsMain, { header: 1, range: 0, defval: null });
    const rows = [];
    const errors = [];

    // 改靠表頭名讀（不再固定欄序，因新 Excel 在 B 欄插入「案別」整體右移）：
    // 第 1 列為表頭，建「表頭字面→欄 index」映射（String().trim() 防呆，萬一手動編輯帶到空白）
    const headerIdx = aoa.findIndex(r => {
      const cells = (r || []).map(c => String(c == null ? '' : c).trim());
      return cells.includes('N') && cells.includes('任務名');
    });
    const headerRow = (headerIdx >= 0 ? aoa[headerIdx] : aoa[0]) || [];
    const colMap = {};
    headerRow.forEach((h, i) => { const key = String(h == null ? '' : h).trim(); if (key) colMap[key] = i; });
    const cell = (row, headerName) => { const i = colMap[headerName]; return (i == null) ? null : row[i]; };

    // 必要欄檢查：缺任一即整批失敗（案別欄不在此列，缺失向後相容舊 Excel、不報錯→該批 variant 留空）
    const REQUIRED = ['N', 'PLM階段', '任務名', '類型', '前置(N)', '工期', '負責人', '預計開始'];
    const missing = REQUIRED.filter(h => colMap[h] == null);
    if (missing.length) {
      return { ok: false, rows: [], projectName, errors: ['缺少必要欄：' + missing.join('、')] };
    }

    aoa.slice((headerIdx >= 0 ? headerIdx : 0) + 1).forEach((r) => {
      // 任務名空 → skip
      const nameRaw = cell(r, '任務名');
      const name = nameRaw != null && String(nameRaw).trim() !== '' ? String(nameRaw).trim() : '';
      if (!name) return;

      const typeRaw = cell(r, '類型');
      const ownerRaw = cell(r, '負責人');
      const durRaw = cell(r, '工期');
      const progRaw = cell(r, '進度%');
      const mustRaw = cell(r, '必須繳付');
      const wbsRaw = cell(r, 'N');
      const variantRaw = cell(r, '案別');
      const stageRaw = cell(r, 'PLM階段');
      const subgroupRaw = cell(r, '子群組');
      const predRaw = cell(r, '前置(N)');
      const statusRaw = cell(r, '狀態');
      const deliverableRaw = cell(r, '繳付物說明');
      const riskRaw = cell(r, '風險議題');
      const noteRaw = cell(r, '備註');
      const deliveredRaw = cell(r, '已交付');
      const linkRaw = cell(r, '繳付連結');
      const dtypeRaw = cell(r, '繳付件類型');      // §7.1 deliverableType
      const reqRaw = cell(r, '必要任務');           // §7.1 requiredTask（預設全必要）
      const issueRaw = cell(r, '繳付物必須發行');   // §7.1 mustIssue

      rows.push({
        wbs: wbsRaw != null ? String(wbsRaw).trim() : '',
        variant: variantRaw != null ? String(variantRaw).trim() : '',
        stage: stageRaw != null ? String(stageRaw).trim() : '',
        subgroup: subgroupRaw != null ? String(subgroupRaw).trim() : '',
        name: name,
        category: String(typeRaw || '').includes('里程碑') ? 'meeting' : 'deep',
        taskType: mapTaskType(typeRaw),
        predecessor: predRaw != null ? String(predRaw).trim() : '',
        durationDays: typeof durRaw === 'number' ? durRaw : (parseFloat(durRaw) || 0),
        owner: ownerRaw != null ? String(ownerRaw).trim() : '',
        dept: ownerToDept(ownerRaw, memberToDept),
        plannedStart: wbsDateStr(cell(r, '預計開始')),
        plannedEnd: wbsDateStr(cell(r, '預計結束')),
        actualStart: wbsDateStr(cell(r, '實際開始')),
        actualEnd: wbsDateStr(cell(r, '實際完成')),
        progress: typeof progRaw === 'number' ? Math.round(progRaw * 100) : 0,
        status: statusRaw != null ? String(statusRaw).trim() : '',
        mustDeliver: mustRaw === '✓' || mustRaw === true || String(mustRaw).trim() === '✓',
        deliverableType: dtypeRaw != null ? String(dtypeRaw).trim() : '',
        // 必要任務預設 true：空白/未填＝必要；明確非✓（如✗）＝非必要
        requiredTask: reqRaw == null || String(reqRaw).trim() === ''
          ? true
          : (reqRaw === '✓' || reqRaw === true || String(reqRaw).trim() === '✓'),
        mustIssue: issueRaw === '✓' || issueRaw === true || String(issueRaw).trim() === '✓',
        deliverable: deliverableRaw != null ? String(deliverableRaw).trim() : '',
        riskIssue: riskRaw != null ? String(riskRaw).trim() : '',
        note: noteRaw != null ? String(noteRaw).trim() : '',
        delivered: deliveredRaw != null ? String(deliveredRaw).trim() : '',
        deliverableLink: linkRaw != null ? String(linkRaw).trim() : '',
      });
    });

    return { ok: true, rows, projectName, errors, depts: buildDepts(wsInfo) };
  } catch (err) {
    return { ok: false, rows: [], projectName: '', errors: ['解析失敗：' + err.message] };
  }
}

// buildWbsPreview：純算 WBS preview（candidate project + tasks，不 push DATA）
function buildWbsPreview(parsed) {
  const { rows, projectName } = parsed;
  // candidate project（fresh id；commit 時若重灌既有則重指）
  const project = { id: U.id(), name: projectName, color: CFG('WBS_PROJECT_COLOR', '#4A7C5C'), note: '', synced: false, createdAt: new Date().toISOString() };
  const projId = project.id;
  const depts = parsed.depts || [];
  project.depts = depts;
  // 案別清單（id 制）
  const variantNames = [...new Set(rows.map(r => r.variant).filter(v => v && v.trim()))];
  // variant 形狀對齊 applyTemplate（含 schedule/stages）：Excel 無「目標上市窗」→ schedule 留空（餘裕回 null 不顯燈號）。
  // 缺 schedule 會讓 Stage 2 餘裕計算 _s2VariantSlack 直接讀 v.schedule.startDate 爆 TypeError（Excel 新建一進 Stage 2 必炸）。
  const variants = variantNames.map(name => ({ id: U.id(), name, schedule: { startDate: '', endDate: '', direction: 'forward' }, stages: [] }));
  project.variants = variants;
  // 反查表
  const nameToId = {};
  depts.forEach(d => { nameToId[d.name] = d.id; });
  const variantNameToId = {};
  variants.forEach(v => { variantNameToId[v.name] = v.id; });
  // 組 task 進 local 陣列（不 push DATA）
  const tasks = [];
  rows.forEach(row => {
    let status;
    if (row.actualEnd) status = 'done';
    else if (row.actualStart) status = 'wip';
    else status = mapStatus(row.status, row.progress);
    tasks.push({
      id: U.id(),
      project: projId,
      wbs: row.wbs,
      parentWbsId: '',
      name: row.name,
      desc: row.stage ? `${row.stage} / ${row.subgroup || ''}` : (row.subgroup || ''),
      category: row.category,
      taskType: row.taskType,
      predecessor: row.predecessor,
      durationDays: row.durationDays,
      owner: row.owner,
      dept: nameToId[row.dept] || row.dept,
      variant: variantNameToId[row.variant] || null,
      start: '',
      end: '',
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      progress: row.progress,
      status: status,
      urgency: 'med',
      estHours: parseFloat(row.durationDays || 0) * (DATA.settings.dailyHours || 6) || 4,
      method: '',
      canSplit: false,
      completedAt: status === 'done' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      scheduledStart: '',
      scheduledEnd: '',
      synced: false,
      stage: row.stage,
      subgroup: row.subgroup,
      mustDeliver: row.mustDeliver,
      deliverableType: row.deliverableType,
      requiredTask: row.requiredTask,
      mustIssue: row.mustIssue,
      deliverable: row.deliverable,
      riskIssue: row.riskIssue,
      delivered: row.delivered,
      deliverableLink: row.deliverableLink,
      note: row.note,
    });
  });
  // 前置 id 化（對 local tasks 陣列，等價於原本對 importedBatch）
  const wbsToIdMap = buildWbsToIdMap(tasks);
  tasks.forEach(t => { t.predecessor = translatePredToId(t.predecessor, wbsToIdMap); });
  return { project, variants, depts, tasks, warnings: [] };
}

function performWbsImport(parsed, projId) {
  const res = buildWbsPreview(parsed);
  // 重灌語意：① projId 傳入（專案頁覆蓋匯入）→ 鎖當前專案、跳過同名比對；② 不傳（向後相容）→ 找同名既有→重用 id；無則用 candidate
  let proj = projId
    ? DATA.projects.find(p => p.id === projId)
    : DATA.projects.find(p => p.name === res.project.name);
  if (projId && !proj) { U.toast('⚠ 找不到目標專案，覆蓋取消', 'error'); return { imported: 0, projectId: null }; }
  if (proj) {
    // 重用既有 id：把 res 的 project/task/相關 id 全重指成既有 projId
    const oldId = res.project.id, newId = proj.id;
    proj.depts = res.depts;
    proj.variants = res.variants;
    proj.importedAt = D.fmt(new Date(), 'iso');   // §15 覆蓋＝重匯，刷新匯入日期
    if (proj.version == null) proj.version = 1;    // 舊專案首次補 version 欄；覆蓋不遞增（仍同一專案）
    res.tasks.forEach(t => { if (t.project === oldId) t.project = newId; });
    DATA.tasks = DATA.tasks.filter(t => t.project !== newId);   // 清該專案舊 task
    res.tasks.forEach(t => DATA.tasks.push(t));
  } else {
    DATA.projects.push(res.project);
    res.tasks.forEach(t => DATA.tasks.push(t));
  }
  const outProjId = proj ? proj.id : res.project.id;
  Storage.save();
  App.refreshAll();
  return { imported: res.tasks.length, projectId: outProjId };
}

App.openWbsImport = function(projId) {
  const projName = (this.getProj(projId) || {}).name || '';
  this.openModal({
    title: '📥 覆蓋匯入 — ' + U.esc(projName),
    body: `
      <div style="font-size:12.5px; line-height:1.6; color:var(--ink2); margin-bottom:14px;">
        匯入 WBS Excel，<b style="color:var(--sage-700);">整批重灌</b>：
        <br>• <b>清空該專案既有任務</b>，以 Excel 為唯一真值重新建立
        <br>• 匯入後任務為<b>可編輯</b>（非唯讀、非 synced），資料主權歸 ${CFG('APP_NAME', 'PM-Core')}
        <br>• 階段時程（性試/量試/量產）由資訊條即時計算，匯入器不灌日期
      </div>

      <div id="wbsImportZone" style="border:2px dashed var(--rule); border-radius:10px; padding:32px; text-align:center; cursor:pointer; background:var(--surface2); transition:all .15s;">
        <div style="font-size:32px; margin-bottom:8px;">📥</div>
        <div style="font-size:13px; font-weight:500;">點擊或拖曳 WBS Excel 檔</div>
        <div style="font-size:11px; color:var(--ink3); margin-top:4px;">讀 WBS 分頁，任務名非空者匯入</div>
        <input type="file" id="wbsImportFile" accept=".xlsx,.xls" style="display:none;">
      </div>

      <div id="wbsImportPreview" style="display:none; margin-top:14px;">
        <div id="wbsImportStats" style="padding:10px 14px; background:var(--sage-50); border-radius:8px; font-size:12px; margin-bottom:10px;"></div>
        <div style="max-height:280px; overflow-y:auto; border:1px solid var(--rule); border-radius:8px;">
          <table id="wbsImportTable" class="data-table" style="font-size:11.5px;"></table>
        </div>
      </div>

      <div id="wbsImportLog" style="display:none; margin-top:14px; padding:10px 14px; background:var(--surface2); color:var(--ink2); border:1px solid var(--rule); border-radius:8px; font-family:var(--mono); font-size:11px; max-height:160px; overflow-y:auto;"></div>
    `,
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" id="wbsImportBtn" disabled style="opacity:.5;">確定匯入（清舊重灌）</button>
    `,
  });

  // 綁事件 + parsed 閉包（confirm 鈕 onclick 字串傳不了物件，故用 addEventListener）
  setTimeout(() => {
    const zone = document.getElementById('wbsImportZone');
    const fileInput = document.getElementById('wbsImportFile');
    const btn = document.getElementById('wbsImportBtn');
    if (!zone || !fileInput) return;
    let parsed = null;

    const handleFile = async (file) => {
      const log = document.getElementById('wbsImportLog');
      parsed = await parseWbsExcel(file);
      if (!parsed || !parsed.ok) {
        if (log) {
          log.style.display = 'block';
          log.textContent = '⚠ ' + ((parsed && parsed.errors && parsed.errors.join('；')) || '解析失敗');
        }
        btn.disabled = true; btn.style.opacity = '.5';
        return;
      }
      // 同名守衛：覆蓋只能蓋回同名專案（防拿錯 Excel）。異名／空名／fallback 預設名 → 擋死、不啟用確定鈕
      if (!parsed.projectName || parsed.projectName === '未命名專案' || parsed.projectName !== projName) {
        const sg = document.getElementById('wbsImportStats');
        if (sg) sg.innerHTML = `<b style="color:var(--rose-ink);">⚠ 此 Excel 的專案名稱『${U.esc(parsed.projectName || '（無專案名）')}』與目前專案『${U.esc(projName)}』不符，無法覆蓋。請改用『${U.esc(projName)}』匯出的 WBS 檔。</b>`;
        document.getElementById('wbsImportPreview').style.display = 'block';
        btn.disabled = true; btn.style.opacity = '.5';
        return;
      }
      // 統計 + 前 8 筆預覽
      const stats = document.getElementById('wbsImportStats');
      const table = document.getElementById('wbsImportTable');
      const done = parsed.rows.filter(r => r.progress === 100).length;
      const wip = parsed.rows.filter(r => r.progress > 0 && r.progress < 100).length;
      if (stats) {
        stats.innerHTML = `專案：<b>${U.esc(parsed.projectName)}</b>　|　共 <b style="color:var(--sage-700);">${parsed.rows.length}</b> 筆有效` +
          `　|　完成 <b>${done}</b>　進行中 <b>${wip}</b>　|　<b style="color:var(--ink3);">確定後將清空既有任務重灌</b>`;
      }
      if (table) {
        const head =
          `<thead><tr>` +
          `<th class="col-num">N</th>` +
          `<th class="col-flex">任務名</th>` +
          `<th class="col-mid">前置</th>` +
          `<th class="col-num">進度</th>` +
          `<th class="col-num">狀態</th></tr></thead>`;
        const body = parsed.rows.slice(0, 8).map(r =>
          `<tr><td class="col-num" style="font-family:var(--mono);">${U.esc(r.wbs)}</td>` +
          `<td class="col-flex" title="${U.esc(r.name)}">${U.esc(r.name)}</td>` +
          `<td class="col-mid" style="font-family:var(--mono);" title="${U.esc(r.predecessor)}">${U.esc(r.predecessor)}</td>` +
          `<td class="col-num">${r.progress}%</td>` +
          `<td class="col-num">${U.esc(r.status)}</td></tr>`).join('');
        const more = parsed.rows.length > 8 ? `<tr><td colspan="5" style="color:var(--ink3);">…還有 ${parsed.rows.length - 8} 筆</td></tr>` : '';
        table.innerHTML = head + '<tbody>' + body + more + '</tbody>';
      }
      document.getElementById('wbsImportPreview').style.display = 'block';
      btn.disabled = false; btn.style.opacity = '1';
    };

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.background = 'var(--sage-50)'; zone.style.borderColor = 'var(--sage-500)'; });
    zone.addEventListener('dragleave', () => { zone.style.background = 'var(--surface2)'; zone.style.borderColor = 'var(--rule)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.background = 'var(--surface2)';
      zone.style.borderColor = 'var(--rule)';
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });

    btn.addEventListener('click', () => {
      if (!parsed || !parsed.ok) return;
      App.confirmModal({
        icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
        title: `用此 Excel 覆蓋「${projName}」？`, msg: '現有任務會清空重灌，確定？', okText: '覆蓋匯入', cancelText: '取消', okClass: 'danger',
        onConfirm: () => {
          const res = performWbsImport(parsed, projId);
          U.toast(`✅ 已匯入 ${res.imported} 筆任務到「${projName}」`, 'success', { duration: 10000, closable: true });
          App.closeModal();
        },
      });
    });
  }, 50);
};
