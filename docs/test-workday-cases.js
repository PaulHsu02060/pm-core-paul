/**
 * 工作日計算 — 測試案例（階段2 新核心）
 * ─────────────────────────────────────────────────────────────
 * 執行：node docs/test-workday-cases.js
 * 會逐案印出 PASS / FAIL，最後印總計；全過 exit code 0，有失敗 exit code 1。
 *
 * ⚠ 重要：下方 D 物件是 app.js 中 `const D` 的「同步複本」（只含工作日相關 4 個方法 + fmt）。
 *   app.js 不是 module、且載入時會碰 document/window，node 無法直接 require，
 *   所以這裡複製一份供獨立驗證。若改了 app.js 的 isWorkday/workdaysBetween/addWorkdays 邏輯，
 *   請務必同步更新這裡，否則測試會驗到舊邏輯。
 *
 * ⚠ 時區：本檔所有日期都用 d('YYYY-MM-DD') 以「本地時間」建構（new Date(y, m-1, day)），
 *   並把 Date 物件（非字串）餵進函式，避免 new Date('YYYY-MM-DD') 被當 UTC 午夜解析、
 *   在非 UTC+8 時區 getDay()/getDate() 偏一天的坑。在家裡（UTC+8）跑結果一致。
 */

// ── 假的 DATA（提供 workDays；預設週一~五，JS getDay() 編號 0=日..6=六） ──
const DATA = { settings: { workDays: [1, 2, 3, 4, 5] }, calendars: { base: { name: '台灣公版', holidays: {} }, override: { workOverrides: {}, extraHolidays: {} } } };

// ── D 物件同步複本（與 app.js 一致） ──────────────────────────────
const D = {
  fmt(d, opt = 'md') {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear(), m = dt.getMonth() + 1, day = dt.getDate();
    if (opt === 'iso') return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `${m}/${day}`;
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

  // 解析貼上的行事曆文字（Tab 分隔）→ {holidays, workOverrides, skipped, error?}
  // 彈性表頭對應：靠表頭名稱定位欄位（不要求欄位順序），需含表頭那一行。
  // 純函式：不碰 DOM/Storage，寫入由呼叫端負責（之二.9）。
  parseCalendarPaste(text) {
    const holidays = {};
    const workOverrides = {};
    let skipped = 0;
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    // 同義詞表（小寫比對，精確或子字串命中）
    const SYN = {
      date: ['日期', 'date', '年月日'],
      type: ['類型', 'type', '假別', '性質', '類別'],
      name: ['節日名稱', '名稱', '假日名', 'name', '說明', '節日'],
      workday: ['工作日', '上班', '是否上班', 'workday'],
      weekday: ['星期', 'weekday'],
    };
    const matchCol = (h) => {
      const hl = (h || '').trim().toLowerCase();
      if (!hl) return null;
      for (const key in SYN) {
        for (const s of SYN[key]) {
          const sl = s.toLowerCase();
          if (sl === hl || hl.indexOf(sl) !== -1) return key;
        }
      }
      return null;
    };
    // 找表頭行：第一個能對到「日期」欄的行
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const m = {};
      for (let ci = 0; ci < cols.length; ci++) {
        const k = matchCol(cols[ci]);
        if (k && !(k in m)) m[k] = ci;
      }
      if ('date' in m) { headerIdx = i; colMap = m; break; }
    }
    if (headerIdx < 0 || !('date' in colMap)) {
      return { holidays: {}, workOverrides: {}, skipped: 0, error: '找不到「日期」欄表頭，請確認複製時包含表頭那一行' };
    }
    const di = colMap.date, ti = colMap.type, ni = colMap.name, wi = colMap.workday, wki = colMap.weekday;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols.length <= di) { skipped++; continue; }
      const date = (cols[di] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
      const type = (ti != null && ti < cols.length) ? (cols[ti] || '').trim() : '';
      const name = (ni != null && ni < cols.length) ? (cols[ni] || '').trim() : '';
      const workFlag = (wi != null && wi < cols.length) ? (cols[wi] || '').trim() : '';
      const wk = (wki != null && wki < cols.length) ? (cols[wki] || '').trim() : '';
      let isHol = false, isMk = false;
      if (ti != null && type) {
        if (type === '公休日') isHol = true;
        else if (type === '補班') isMk = true;
        else if (type === '週末' || type === '工作日') { /* 跳過 */ }
        else if (wi != null && workFlag === '0' && wk !== '六' && wk !== '日') isHol = true;
      } else if (wi != null) {
        if (workFlag === '0' && wk !== '六' && wk !== '日') isHol = true;
        else if (workFlag === '1' && (wk === '六' || wk === '日')) isMk = true;
      }
      if (isHol) holidays[date] = name || '公休';
      else if (isMk) workOverrides[date] = name || '補班';
    }
    return { holidays, workOverrides, skipped };
  },
};

// ── wbsDateStr 同步複本（app.js 獨立函式，匯入器日期轉換；呼叫上方 D.fmt） ──
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

// ── 工具 ──────────────────────────────────────────────────────
// 用「本地時間」建構 Date，避免 UTC 解析時區坑
function d(s) { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); }
const iso = (x) => D.fmt(x, 'iso');

// ── 注入測試用行事曆 ────────────────────────────────────────────
// 2026-01-01 元旦（週四）放假；2026-02-07（週六）補班。
// 註：company 類型（如 2026-01-08 尾牙）後端不會收進任何陣列，故這裡兩個陣列都不含它，
//     用來驗證「company 事件日照常上班」。
DATA.calendars.base.holidays = { '2026-01-01': '元旦' };            // 元旦（週四）
DATA.calendars.override.workOverrides = { '2026-02-07': '補班' };  // 補班（週六）

// ── 測試框架 ──────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, got, expected, why) {
  const ok = String(got) === String(expected);
  if (ok) pass++; else fail++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}`);
  console.log(`       got=${got}  expected=${expected}`);
  console.log(`       why: ${why}`);
}

console.log('===== 1. isWorkday =====');
check('平日（2026-01-05 週一）', D.isWorkday(d('2026-01-05')), true,
  '週一在 workDays，非假日 → 上班');
check('週末（2026-01-03 週六）', D.isWorkday(d('2026-01-03')), false,
  '週六不在 workDays，也非補班 → 不上班');
check('補班的週六（2026-02-07）', D.isWorkday(d('2026-02-07')), true,
  '在 supplementWorkDays，優先序最高 → 即使週六也上班');
check('放假的平日（2026-01-01 元旦 週四）', D.isWorkday(d('2026-01-01')), false,
  '在 holidays → 即使是平日也不上班');
check('company 事件日（2026-01-08 尾牙 週四）', D.isWorkday(d('2026-01-08')), true,
  'company 類型不進任何陣列；週四在 workDays → 照常上班');

console.log('\n===== 2. workdaysBetween（含頭含尾） =====');
check('同一天工作日（01-05~01-05）', D.workdaysBetween(d('2026-01-05'), d('2026-01-05')), 1,
  '含頭含尾，單一工作日 → 1');
check('整週一~五（01-05~01-09）', D.workdaysBetween(d('2026-01-05'), d('2026-01-09')), 5,
  '週一到週五 5 個工作日');
check('含週末區間（01-05~01-11）', D.workdaysBetween(d('2026-01-05'), d('2026-01-11')), 5,
  '週一到週日，扣掉六日 → 仍 5');
check('含國定假日區間（01-01~01-04）', D.workdaysBetween(d('2026-01-01'), d('2026-01-04')), 1,
  '元旦(四,假)不算、六日不算，只剩 01-02(五) → 1');
check('含補班週六區間（02-02~02-08）', D.workdaysBetween(d('2026-02-02'), d('2026-02-08')), 6,
  '02-02~02-06 平日 5 天 + 02-07 補班六 1 天，02-08 週日不算 → 6');
check('start>end（01-09~01-05）', D.workdaysBetween(d('2026-01-09'), d('2026-01-05')), 0,
  '無效區間（起>迄）依定義回 0');

console.log('\n===== 3. addWorkdays（起算日不算入 n） =====');
check('n=0（01-05）', iso(D.addWorkdays(d('2026-01-05'), 0)), '2026-01-05',
  'n=0 回起算日當天');
check('n=1 次一工作日（01-05 一 → 01-06 二）', iso(D.addWorkdays(d('2026-01-05'), 1)), '2026-01-06',
  '週一往後 1 個工作日 = 週二');
check('跨週末（01-09 五 +1 → 01-12 一）', iso(D.addWorkdays(d('2026-01-09'), 1)), '2026-01-12',
  '週五往後 1 個工作日要跳過六日 → 下週一');
check('跨假日（12-31 三 +1 → 01-02 五）', iso(D.addWorkdays(d('2025-12-31'), 1)), '2026-01-02',
  '隔天 01-01 是元旦假日要跳過 → 01-02 週五');
check('n 為負往前（01-05 一 -1 → 01-02 五）', iso(D.addWorkdays(d('2026-01-05'), -1)), '2026-01-02',
  '週一往前 1 個工作日要跳過六日 → 上週五');

console.log('\n===== 4. ⚠ 排程語意（避免 off-by-one） =====');
// 排程引擎換算：工期 N 天、從 start 開始，end = addWorkdays(start, N-1)。
// 因為起算日「本身算第 1 天」，所以只要再往後 N-1 個工作日。
{
  const start = d('2026-01-05'); // 週一
  const N = 3;
  const end = D.addWorkdays(start, N - 1);
  check('工期3天 週一開始 → 週三（N-1 換算）', iso(end), '2026-01-07',
    'end=addWorkdays(週一, 3-1=2)=週三；start 當天算第1天，故用 N-1');
  check('  回算 workdaysBetween 應 = N', D.workdaysBetween(start, end), N,
    'workdaysBetween(start, addWorkdays(start, N-1)) 必須等於工期 N，兩函式互為反運算');
}
{
  // 跨週末版：工期3天 從週五開始 → 五、一、二
  const start = d('2026-01-09'); // 週五
  const N = 3;
  const end = D.addWorkdays(start, N - 1);
  check('工期3天 週五開始 → 次週二（跨週末）', iso(end), '2026-01-13',
    '五(第1天)→一(第2天)→二(第3天)；end=addWorkdays(週五,2)=01-13');
  check('  回算 workdaysBetween 應 = N', D.workdaysBetween(start, end), N,
    '跨週末也成立：workdaysBetween(01-09,01-13)=3');
}

console.log('\n===== 5. parseCalendarPaste（彈性表頭對應）=====');
{
  // 5-1 標準格式（典型欄位：日期/星期/類型/節日名稱/工作日/備註）
  const sample = [
    '日期\t星期\t類型\t節日名稱\t工作日(1/0)\t備註',
    '2025-10-04\t六\t週末\t\t0\t',
    '2025-10-05\t日\t週末\t\t0\t',
    '2025-10-06\t一\t公休日\t中秋節\t0\t',
    '2025-10-07\t二\t工作日\t\t1\t',
    '2025-10-10\t五\t公休日\t國慶節\t0\t',
    '2025-10-13\t一\t工作日\t\t1\t',
    '',
    '2026-02-07\t六\t補班\t春節調整補班\t1\t',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('標準：公休=2（中秋+國慶）', Object.keys(r.holidays).length, 2, '類型=公休日進 holidays');
  check('標準：中秋名', r.holidays['2025-10-06'], '中秋節', '名稱欄抓對');
  check('標準：國慶名', r.holidays['2025-10-10'], '國慶節', '名稱欄抓對');
  check('標準：週末不進', r.holidays['2025-10-04'], undefined, '類型=週末略過');
  check('標準：工作日不進', r.holidays['2025-10-07'], undefined, '類型=工作日略過');
  check('標準：補班=1', Object.keys(r.workOverrides).length, 1, '類型=補班進 workOverrides');
  check('標準：補班名', r.workOverrides['2026-02-07'], '春節調整補班', '補班名稱抓對');
  check('標準：skipped=0（表頭當定位行不計）', r.skipped, 0, '新版表頭偵測，不靠 regex 失敗計數');
}
{
  // 5-2 欄位亂序（類型/節日名稱/日期/工作日）— colMap 定位
  const sample = [
    '類型\t節日名稱\t日期\t工作日',
    '公休日\t中秋節\t2025-10-06\t0',
    '工作日\t\t2025-10-07\t1',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('亂序：公休=1', Object.keys(r.holidays).length, 1, '靠表頭定位，不管欄序');
  check('亂序：中秋名（date 在第3欄）', r.holidays['2025-10-06'], '中秋節', 'di=colMap.date');
}
{
  // 5-3 無類型欄（日期/星期/工作日）→ 用工作日=0 且非六/日 判公休
  const sample = [
    '日期\t星期\t工作日',
    '2026-01-01\t四\t0',
    '2026-01-03\t六\t0',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('無類型：元旦(四,0)→公休', r.holidays['2026-01-01'], '公休', '無 name 欄預設「公休」');
  check('無類型：週六(0)不算公休', r.holidays['2026-01-03'], undefined, '六/日 workFlag=0 屬週末非公休');
}
{
  // 5-4 英文表頭（Date/Type/Name/Workday）
  const sample = [
    'Date\tType\tName\tWorkday',
    '2025-10-06\t公休日\tMid-Autumn\t0',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('英文表頭：公休名', r.holidays['2025-10-06'], 'Mid-Autumn', '同義詞含 date/type/name/workday');
}
{
  // 5-5 無表頭 → 報錯、不寫入
  const sample = [
    '2025-10-06\t公休日\t中秋節\t0',
    '2025-10-07\t工作日\t\t1',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('無表頭：回 error', !!r.error, true, '找不到日期欄表頭');
  check('無表頭：holidays 空', Object.keys(r.holidays).length, 0, '無表頭不寫入');
}
{
  // 5-6 補班無類型欄（週六 工作日=1）→ workOverrides
  const sample = [
    '日期\t星期\t工作日',
    '2026-02-07\t六\t1',
  ].join('\n');
  const r = D.parseCalendarPaste(sample);
  check('無類型補班：週六(1)→補班', r.workOverrides['2026-02-07'], '補班', 'workFlag=1 且六/日 → 補班');
}

console.log('\n===== 6. wbsDateStr（Excel 日期匯入不差一天） =====');
{
  // 日期型分支：cellDates:true 給的本地午夜 Date（new Date 本地建構，任何時區都這天）
  check('日期型 Date → 不差一天', wbsDateStr(new Date(2025, 10, 21)), '2025-11-21',
    '本地午夜 Nov 21 用 D.fmt 本地讀回；舊碼 toISOString 在 UTC+8 會吐 11-20（差一天 bug）');
  check('日期型 Date（#54 可販日）', wbsDateStr(new Date(2027, 0, 28)), '2027-01-28',
    '本地讀回不位移');
  // 字串分支：正則直抽，完全不經 Date
  check('ISO 字串原樣（正則直抽）', wbsDateStr('2025-11-21'), '2025-11-21',
    'YYYY-MM-DD 正則命中，不經 Date round-trip');
  check('ISO 字串帶時間只取日期', wbsDateStr('2025-11-21T00:00:00'), '2025-11-21',
    '無 $ 錨點，後段時間被忽略');
  // 邊界
  check('空字串 → 空', wbsDateStr(''), '', 'falsy 直接回空');
  check('null → 空', wbsDateStr(null), '', 'falsy 直接回空');
}

console.log('\n===== 結果 =====');
console.log(`PASS ${pass} / FAIL ${fail}  （總計 ${pass + fail}）`);
process.exit(fail === 0 ? 0 : 1);
