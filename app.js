/* ═══════════════════════════════════════════════════════════════════
 * PM-Core · Personal Task Board
 * ───────────────────────────────────────────────────────────────────
 *  作者 (Author)        範例作者
 *  GitHub Username      your-name
 *  共同開發 (Co-author) Anthropic Claude
 *  專案 Repo            github.com/your-name/your-repo
 *  開發歷程            （公司/單位名稱）
 *                       手動需求 → AI 協作 → iterative refinement
 *  License             個人作品，禁止未經授權的商業使用
 *  簽章 (Build hash)    PM-Core
 * ───────────────────────────────────────────────────────────────────
 *  本程式為作者與 Claude (Anthropic) 共同開發的個人專案，
 *  歷經多輪需求設計、架構規劃、功能迭代後完成。
 *  完整開發記錄保存於 GitHub commit history。
 * ═══════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.5.0';
const APP_AUTHOR = CFG('AUTHOR', 'PM-Core');

// ─── CONFIG READER ─────────────────────────────────────
// 優先讀 APP_CONFIG（config.js 預設值 + config.local.js 本機覆蓋），
// 未載入時退回中性 fallback，避免 config 尚未接上時整支壞掉。
function CFG(key, fallback) {
  return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG[key] !== undefined)
    ? APP_CONFIG[key] : fallback;
}

// 種子資料讀取：SEED_LOCAL（真值，不進 git）優先，否則 SEED_SAMPLE（假值模板）。
function SEED(key, fallback) {
  if (typeof SEED_LOCAL !== 'undefined' && SEED_LOCAL[key] !== undefined) return SEED_LOCAL[key];
  if (typeof SEED_SAMPLE !== 'undefined' && SEED_SAMPLE[key] !== undefined) return SEED_SAMPLE[key];
  return fallback;
}

const APP_BUILD_SIGNATURE = CFG('APP_BUILD_SIGNATURE', 'PM-Core');

// ─── ADMIN / DEFAULT OAUTH ─────────────────────────────
// Admin Gmail 名單：登入後能看到 WBS 同步等管理者功能
// 非 admin 看不到也用不到（WBS Sheet 由公司權限自行管控）
const ADMIN_EMAILS = CFG('ADMIN_EMAILS', []);

// 預設 OAuth Client ID：hardcode 在這，同事零設定就能 Google 登入
// 安全性：OAuth Client ID 本來就是公開資訊，配 redirect_uri 白名單防呆
// 來源：https://console.cloud.google.com/apis/credentials  (你的 GitHub Pages 網域)
const DEFAULT_OAUTH_CLIENT_ID = CFG('OAUTH_CLIENT_ID', 'PASTE_YOUR_OAUTH_CLIENT_ID');

// helper：當前登入的 Gmail 是不是 admin
function isAdmin() {
  const email = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings._loggedInEmail) || '';
  return ADMIN_EMAILS.includes(String(email).toLowerCase());
}

// build hash 用於辨識：把作者名 + 重要常數 hash 起來
// 任何人移除作者標記都會改變這個 hash → 可比對辨識
console.log(`%c ${CFG('APP_NAME', 'PM-Core')} v${APP_VERSION} `, 'background:#4A7C5C;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold', `by ${APP_AUTHOR} · build: ${APP_BUILD_SIGNATURE}`);

// ─── BRANCH-AWARE STORAGE ──────────────────────────────
const PATH_KEY = location.pathname.replace(/\/index\.html?$/i, '').replace(/\/$/, '') || 'root';
const STORE = {
  projects: `pmw::${PATH_KEY}::projects`,
  tasks:    `pmw::${PATH_KEY}::tasks`,
  meetings: `pmw::${PATH_KEY}::meetings`,
  memos:    `pmw::${PATH_KEY}::memos`,
  schedule: `pmw::${PATH_KEY}::schedule`,
  settings: `pmw::${PATH_KEY}::settings`,
  password: `pmw::${PATH_KEY}::password`,
  syncLog:  `pmw::${PATH_KEY}::synclog`,
  weekNotes: `pmw::${PATH_KEY}::weeknotes`,
  pdcaGroups: `pmw::${PATH_KEY}::pdcagroups`,
};

// ─── DEFAULT SETTINGS ──────────────────────────────────
const DEFAULT_SETTINGS = {
  userName: '使用者',
  department: '',
  dailyHours: 6,
  workStart1: '09:00',
  workEnd1: '12:00',
  workStart2: '14:00',
  workEnd2: '18:00',
  goldenTime: 'morning',
  workDays: [1, 2, 3, 4, 5],
  splitThreshold: 4,
  doneRetentionDays: 30,
  previewWeeks: 2,
  // 【需求 A】手動釘選到本週的 task id；釘選後不因 plannedStart 在未來被排程踢出
  pinnedWeekTaskIds: [],
  jSheetUrl: '',
  syncTimes: ['09:00', '14:00'],
  autoSyncEnabled: false,
  // Google OAuth 白名單（只有這些 Gmail 登入後才能編輯）
  allowedEmails: CFG('ALLOWED_EMAILS', []),
  googleClientId: '', // 由使用者在設定頁填入

  // ─── 雲端同步 (Cloud Sync via Google Apps Script) ───
  cloudSyncUrl: '',                      // Apps Script Web App URL
  cloudSyncToken: CFG('SYNC_TOKEN', 'CHANGE_THIS_TOKEN'),  // = APP_CONFIG.SYNC_TOKEN，與 apps-script-cloud-sync.gs 的 CHECK_TOKEN 成對
  cloudSyncEnabled: true,                // 預設開啟（只要填了 URL 就會自動運作）
  cloudAutoSync: true,                   // 儲存後自動上傳
  cloudLastSync: '',                     // 最後同步時間（ISO）

  // ─── 事件規則（會議/打掃 等定期事件） ───
  // 智慧排程會自動避開這些時段
  // category: 'meeting' (會議) | 'cleaning' (打掃)
  // frequency: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'biweekly-allday' | 'triweekly-allday'
  // day: 0~6（週日 ~ 週六）— frequency 非 daily/allday 時使用
  // startDate: 開始日期（iso）— 雙週/三週時用來計算「第幾週」
  // endDate: 結束日期（iso，空=永久）
  recurringMeetings: SEED('recurringMeetings', []),
  // 特定日期會議
  specialMeetings: [],
};

// ─── COLORS FOR PROJECTS ───────────────────────────────
const PROJ_COLORS = [
  '#4A7C5C', '#C4633E', '#5C7A8B', '#8B5E73',
  '#C4956C', '#B8504D', '#3A6B4E', '#2D4A3A',
];
const MEMO_COLORS = ['memo-y', 'memo-p', 'memo-b', 'memo-g', 'memo-o'];

// ─── DATA ──────────────────────────────────────────────
let DATA = {
  projects: [],
  tasks: [],
  meetings: [],
  memos: [],
  schedule: { week: null, items: [] },
  settings: { ...DEFAULT_SETTINGS },
  weekNotes: {}, // { 'W21-2026': 'note text' }
  pdcaGroups: {}, // { [pid]: { [group]: { level, owner, note, workContent, actualStart, targetDate, delayDaysOverride, delayReason, recoveryMethod, recoveryDate, affectsLaunch } } }
};

// ─── STORAGE HELPERS ───────────────────────────────────
const Storage = {
  load() {
    try {
      DATA.projects  = JSON.parse(localStorage.getItem(STORE.projects)  || '[]');
      DATA.tasks     = JSON.parse(localStorage.getItem(STORE.tasks)     || '[]');
      DATA.meetings  = JSON.parse(localStorage.getItem(STORE.meetings)  || '[]');
      DATA.memos     = JSON.parse(localStorage.getItem(STORE.memos)     || '[]');
      DATA.schedule  = JSON.parse(localStorage.getItem(STORE.schedule)  || '{"week":null,"items":[]}');
      DATA.settings  = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(STORE.settings) || '{}')) };
      DATA.weekNotes = JSON.parse(localStorage.getItem(STORE.weekNotes) || '{}');
      DATA.pdcaGroups = JSON.parse(localStorage.getItem(STORE.pdcaGroups) || '{}');

      // ─── 清掉「找不到任務」的 schedule 殘留 ───
      if (DATA.schedule && Array.isArray(DATA.schedule.items)) {
        const before = DATA.schedule.items.length;
        DATA.schedule.items = DATA.schedule.items.filter(it => {
          const task = DATA.tasks.find(t => t.id === it.taskId);
          return !!task; // 找不到對應任務就清掉
        });
        if (before !== DATA.schedule.items.length) {
          localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
        }
      }

      // ─── Settings migration: 為舊的 recurringMeetings 補上新欄位 ───
      if (DATA.settings.recurringMeetings && DATA.settings.recurringMeetings.length > 0) {
        let migrated = false;
        for (const m of DATA.settings.recurringMeetings) {
          if (!m.category) { m.category = 'meeting'; migrated = true; }
          if (!m.frequency) { m.frequency = 'weekly'; migrated = true; }
          if (m.startDate === undefined) { m.startDate = ''; migrated = true; }
          if (m.endDate === undefined) { m.endDate = ''; migrated = true; }
          // 把舊的「定期打掃（早）週一」升級為「整週每天」
          if (m.category === 'cleaning' && m.title && m.title.includes('早') && m.frequency === 'biweekly' && m.day === 1) {
            m.frequency = 'biweekly-allday';
            delete m.day; // allday 不需要 day
            migrated = true;
          }
        }

        // 若沒有任何「打掃」項目 → 自動補上預設的兩條
        const hasCleaning = DATA.settings.recurringMeetings.some(m => m.category === 'cleaning');
        if (!hasCleaning) {
          DATA.settings.recurringMeetings.push(
            ...SEED('cleaningDefaults', []).map(o => ({ ...o }))
          );
          migrated = true;
        }

        if (migrated) {
          localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
          console.log('Settings migrated: added cleaning defaults + new fields');
        }
      }
      // PDCA：確保資料結構（DATA.pdcaGroups / project.pdcaData / task.pdcaGroup）
      ensurePdcaGroupsRoot();
      DATA.projects.forEach(ensurePdcaData);
      DATA.tasks.forEach(ensureTaskPdcaGroup);
      DATA.tasks.forEach(ensureTaskType);
      runMigrations();
    } catch(e) { console.error('Load failed', e); }
  },
  save() {
    localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
    localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
    localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
    localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
    localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
    localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
    localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
    localStorage.setItem(STORE.pdcaGroups, JSON.stringify(DATA.pdcaGroups || {}));

    // ─── 雲端自動同步（debounced，避免頻繁上傳）───
    if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudAutoSync && DATA.settings.cloudSyncUrl) {
      CloudSync.scheduleUpload();
    }
  },
};

// ─── CLOUD SYNC MODULE ───
// 雙向同步：載入時拉雲端，儲存時推雲端
const CloudSync = {
  _uploadTimer: null,
  _isUploading: false,

  // Debounced upload (3 秒內多次儲存只上傳一次)
  scheduleUpload() {
    if (this._uploadTimer) clearTimeout(this._uploadTimer);
    this._uploadTimer = setTimeout(() => this.upload(true), 3000);
  },

  // 上傳本地資料到雲端
  async upload(silent = false) {
    const url = DATA.settings.cloudSyncUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 尚未設定雲端 URL', 'warning');
      return false;
    }
    if (this._isUploading) return false;
    this._isUploading = true;
    if (!silent) U.toast('☁ 上傳中...', 'info');

    try {
      const payload = {
        token: DATA.settings.cloudSyncToken || '',
        data: {
          projects: DATA.projects,
          tasks: DATA.tasks,
          meetings: DATA.meetings,
          memos: DATA.memos,
          schedule: DATA.schedule,
          settings: DATA.settings,
          weekNotes: DATA.weekNotes,
          _uploadedAt: new Date().toISOString(),
        },
      };
      // 用 text/plain 避免 CORS preflight
      const res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      DATA.settings.cloudLastSync = new Date().toISOString();
      // 不能再呼叫 Storage.save() 否則無限迴圈，直接寫 localStorage
      localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
      this._refreshSyncStatus();
      if (!silent) U.toast('☁ 已上傳到雲端', 'success');
      return true;
    } catch (e) {
      console.error('Cloud upload failed:', e);
      if (!silent) U.toast('⚠ 雲端上傳失敗：' + e.message, 'warning');
      return false;
    } finally {
      this._isUploading = false;
    }
  },

  // 從雲端下載最新資料（覆蓋本地）
  async download(silent = false) {
    const url = DATA.settings.cloudSyncUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 尚未設定雲端 URL', 'warning');
      return false;
    }
    if (!silent) U.toast('☁ 從雲端下載中...', 'info');

    try {
      const token = encodeURIComponent(DATA.settings.cloudSyncToken || '');
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 'token=' + token, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow',
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      if (!result.data) {
        if (!silent) U.toast('⚠ 雲端目前沒有資料', 'warning');
        return false;
      }

      const cloud = result.data;
      // 合併雲端 settings（保留本地的 cloud* 相關設定，避免一拉就斷線）
      const localCloudCfg = {
        cloudSyncUrl: DATA.settings.cloudSyncUrl,
        cloudSyncToken: DATA.settings.cloudSyncToken,
        cloudSyncEnabled: DATA.settings.cloudSyncEnabled,
        cloudAutoSync: DATA.settings.cloudAutoSync,
      };

      DATA.projects = cloud.projects || [];
      DATA.tasks = cloud.tasks || [];
      DATA.meetings = cloud.meetings || [];
      DATA.memos = cloud.memos || [];
      DATA.schedule = cloud.schedule || { week: null, items: [] };
      DATA.settings = { ...DEFAULT_SETTINGS, ...(cloud.settings || {}), ...localCloudCfg };
      DATA.weekNotes = cloud.weekNotes || {};
      DATA.settings.cloudLastSync = new Date().toISOString();

      // 寫入 localStorage（直接寫，不觸發 auto-upload）
      localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
      localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
      localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
      localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
      localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
      localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
      localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
      // 雲端覆蓋後再跑一次 migration（否則 load 時跑的會被雲端蓋掉）；其內 Storage.save 會把結果上傳回雲端
      runMigrations();

      this._refreshSyncStatus();
      if (!silent) U.toast('☁ 已從雲端載入最新資料', 'success');
      return true;
    } catch (e) {
      console.error('Cloud download failed:', e);
      if (!silent) U.toast('⚠ 雲端下載失敗：' + e.message, 'warning');
      return false;
    }
  },

  _refreshSyncStatus() {
    // 更新設定頁的 last sync 顯示（如果在設定頁）
    const el = document.getElementById('cloudSyncLastEl');
    if (el && DATA.settings.cloudLastSync) {
      const d = new Date(DATA.settings.cloudLastSync);
      el.textContent = `${d.toLocaleDateString('zh-TW')} ${d.toTimeString().slice(0, 5)}`;
    }
  },
};

// ─── DATE UTILS ────────────────────────────────────────
const D = {
  today() { return new Date(); },
  monday(d = new Date()) {
    const x = new Date(d); x.setHours(0,0,0,0);
    const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff); return x;
  },
  // 規劃週起算:週日視為「下一週」的開始;週一~週六與 monday() 完全一致
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
  weekRange(d = new Date()) {
    const m = this.monday(d); const s = new Date(m); const e = new Date(m); e.setDate(e.getDate() + 6);
    return { start: s, end: e };
  },
  fmt(d, opt = 'md') {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear(), m = dt.getMonth() + 1, day = dt.getDate();
    if (opt === 'iso') return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (opt === 'md') return `${m}/${day}`;
    if (opt === 'ymd') return `${y}/${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    if (opt === 'ymdShort') return `${y}/${m}/${day}`;
    return `${y}/${m}/${day}`;
  },
  daysBetween(a, b) {
    const da = new Date(a); da.setHours(0,0,0,0);
    const db = new Date(b); db.setHours(0,0,0,0);
    return Math.round((db - da) / 86400000);
  },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; },
  isSameDay(a, b) {
    if (!a || !b) return false;
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  },

  // ─── 工作日曆 + 工作日計算（階段2 新核心）──────────────────────
  // 行事曆資料由後端 API（行事曆分頁）於啟動時填入；預設空陣列，
  // 無資料時自動退回「只認週末」行為（換 Sheet 沒建分頁也不會壞）。
  // holidays / supplementWorkDays 皆為 'YYYY-MM-DD' 字串陣列。
  // 行事曆分頁三欄：日期(YYYY-MM-DD) / 類型(holiday=放假, workday=補班, company=公司事件) / 說明。
  // company 及任何未知類型不放進這兩個陣列，不影響工作日判斷（照常上班）。
  calendar: { holidays: [], supplementWorkDays: [] },

  // 是否為工作日。判斷優先序：補班日 > 放假日 > 設定頁 workDays。
  // workDays 用 JS 原生 getDay() 編號（0=日,1=一,…,6=六；預設 [1,2,3,4,5] 週一~五）。
  isWorkday(date) {
    const iso = this.fmt(date, 'iso');
    if (!iso) return false;
    // a. 補班日 → 一定上班（即使落在週末）
    if (this.calendar.supplementWorkDays.includes(iso)) return true;
    // b. 放假日 → 一定不上班（即使落在平日）
    if (this.calendar.holidays.includes(iso)) return false;
    // c. 否則照設定頁 workDays 判斷（無 DATA 時退回週一~五）
    const dt = date instanceof Date ? date : new Date(date);
    const workDays = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.workDays) || [1, 2, 3, 4, 5];
    return workDays.includes(dt.getDay());
  },

  // 區間工作日數（含頭含尾，逐日 isWorkday 計數）。
  // 邊界：同一天且為工作日 → 1；start > end → 回 0（無效區間視為 0）；日期無法解析 → 回 0。
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

  // 從 date 起算 n 個工作日後的日期（排程引擎用）。
  // 不把起算日本身算進 n：從次一日起往指定方向找，數到第 n 個工作日為止。
  // n > 0 往後、n < 0 往前、n = 0 回傳起算日當天（正規化為 00:00，不檢查是否工作日）。
  // 回傳新的 Date 物件（00:00）。
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

// ─── PDCA 報告：資料模型（方式 1 — 任務掛 pdcaGroup，大項目動態聚合）───
// project.pdcaData：整個專案的時間軸 + 摘要（不含 milestones/delays array）
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}
// DATA.pdcaGroups[projectId][groupName] = { level, owner, note, workContent, actualStart, targetDate, delayDaysOverride, delayReason, recoveryMethod, recoveryDate, affectsLaunch }
function ensurePdcaGroupsRoot() {
  if (!DATA.pdcaGroups || typeof DATA.pdcaGroups !== 'object') DATA.pdcaGroups = {};
}
// task.pdcaGroup：歸屬的大項目名稱（""＝未歸類）
function ensureTaskPdcaGroup(task) {
  if (!task) return task;
  if (typeof task.pdcaGroup !== 'string') task.pdcaGroup = '';
  return task;
}
// 一次確保全部 PDCA 結構（renderPdca 進頁保險用，涵蓋 J/cloud 後來才進來的專案）
function ensureAllPdcaData() {
  ensurePdcaGroupsRoot();
  (DATA.projects || []).forEach(ensurePdcaData);
  (DATA.tasks || []).forEach(ensureTaskPdcaGroup);
}

// M2-T：Sheet/Excel 類型欄原字串 → taskType 正典值（task=排甘特 / milestone=節點工期0 / group=母項不執行）
// 未知字串與空值一律退回 'task'（同 parsePredecessors 未知關係退 FS 的容錯先例）
function mapTaskType(rawType) {
  const s = (rawType == null ? '' : String(rawType)).trim();
  if (s === '里程碑') return 'milestone';
  if (s === '群組') return 'group';
  return 'task';
}
// M2-T：taskType 形狀保險（照 ensureTaskPdcaGroup 模式，每次 load 跑、只補缺不蓋值）。
// 單一兜底點：手動建任務三路徑（quickAdd/saveNew/excelImport）刻意不各寫預設，避免多份各自演化。
function ensureTaskType(task) {
  if (!task) return task;
  if (typeof task.taskType !== 'string' || !task.taskType) task.taskType = 'task';
  return task;
}

// ─── 一次性資料 migration（_migrations 記錄已跑過的 key；存在性檢查 → 重複跑安全）───
function runMigrations() {
  DATA.settings._migrations = DATA.settings._migrations || {};
  const M = DATA.settings._migrations;
  let changed = false;

  // pdcaMerge_v1：合併重複專案（搬 task + merge 大項目設定）、刪除/新增特定專案（規則由 seed 提供）
  if (!M.pdcaMerge_v1) {
    const byName = nm => DATA.projects.find(p => p.name === nm);
    const moveTasks = (fromId, toId) => DATA.tasks.forEach(t => { if (t.project === fromId) t.project = toId; });
    // merge 大項目設定：keep 沒有的 group 才補、keep 有的不覆蓋（避免搬走的 task 標籤變孤兒）
    const mergePdcaGroups = (fromId, toId) => {
      const from = (DATA.pdcaGroups || {})[fromId];
      if (!from) return;
      DATA.pdcaGroups[toId] = DATA.pdcaGroups[toId] || {};
      Object.keys(from).forEach(g => {
        if (!(g in DATA.pdcaGroups[toId])) DATA.pdcaGroups[toId][g] = from[g];
      });
    };
    const removeProject = pid => {
      DATA.projects = DATA.projects.filter(p => p.id !== pid);
      if (DATA.pdcaGroups) delete DATA.pdcaGroups[pid];
    };

    // 專案資料修正：合併 / 刪除 / 補建，規則由 seed 提供（projMerges / projDeletes / projEnsure）
    SEED('projMerges', []).forEach(m => {
      const keep = byName(m.keep), drop = byName(m.drop);
      if (keep && drop) { moveTasks(drop.id, keep.id); mergePdcaGroups(drop.id, keep.id); removeProject(drop.id); }
    });
    SEED('projDeletes', []).forEach(d => {
      const p = byName(d.name);
      if (p) { DATA.tasks = DATA.tasks.filter(t => t.project !== p.id); removeProject(p.id); }
    });
    SEED('projEnsure', []).forEach(e => {
      if (!DATA.projects.some(p => p.name === e.name)) {
        const used = new Set(DATA.projects.map(p => p.color));
        const color = (e.colorPool || []).find(c => !used.has(c)) || (e.colorPool && e.colorPool[0]) || '#5DCAA5';
        const np = { id: U.id(), name: e.name, color, note: '', synced: false, createdAt: new Date().toISOString() };
        ensurePdcaData(np);
        DATA.projects.push(np);
      }
    });

    M.pdcaMerge_v1 = true;
    changed = true;
  }

  // pdcaInitialData_v1：補六專案 pdcaData/group seed + 依關鍵字自動歸類 task。
  // 只填空、不蓋已有值；group 已有 owner/recoveryMethod 則整組跳過；已歸類的 task 不重歸。
  // → 雲端覆蓋後二次執行沿用同套，不會洗掉使用者手動修改。
  if (!M.pdcaInitialData_v1) {
    const norm = s => (s || '').replace(/\s+/g, '');            // 正規化比對（保險：去空白）
    const findProj = nm => DATA.projects.find(p => norm(p.name) === norm(nm));
    const emptyGroupMeta = () => ({
      level: 'med', owner: '', note: '',
      workContent: '', actualStart: '', targetDate: '',
      delayDaysOverride: null, delayReason: '',
      recoveryMethod: '', recoveryDate: '', affectsLaunch: false,
    });

    // ── 六專案 INIT：pdcaData（時間軸/摘要）+ 要 seed 的 group meta ──
    const INIT = SEED('INIT', {});

    // ── 關鍵字歸類表：每專案陣列「由上到下＝優先序」，先對先設後 break；沒對到留 '' ──
    const KEYWORDS = SEED('KEYWORDS', {});

    Object.keys(INIT).forEach(name => {
      const proj = findProj(name);
      if (!proj) return;                                          // 專案不在（被刪/未建）→ 跳過
      const cfg = INIT[name];

      // 1. pdcaData：只填空、不蓋已有值
      ensurePdcaData(proj);
      if (!proj.pdcaData.startDate  && cfg.startDate)  proj.pdcaData.startDate  = cfg.startDate;
      if (!proj.pdcaData.targetDate && cfg.targetDate) proj.pdcaData.targetDate = cfg.targetDate;
      if (!proj.pdcaData.summary    && cfg.summary)    proj.pdcaData.summary    = cfg.summary;

      // 2. group meta：已存在且 owner 或 recoveryMethod 非空 → 整組跳過；新建用 seed，舊的只填空欄
      DATA.pdcaGroups[proj.id] = DATA.pdcaGroups[proj.id] || {};
      Object.keys(cfg.groups || {}).forEach(gName => {
        const existing = DATA.pdcaGroups[proj.id][gName];
        if (existing && (existing.owner || existing.recoveryMethod)) return;
        const seed = cfg.groups[gName];
        if (!existing) {
          DATA.pdcaGroups[proj.id][gName] = { ...emptyGroupMeta(), ...seed };
        } else {
          Object.keys(seed).forEach(k => { if (!existing[k]) existing[k] = seed[k]; });
        }
      });

      // 3. 自動歸類 task：只動尚未歸類（pdcaGroup=''）的；先對先設後 break；沒對到留 ''
      const table = KEYWORDS[name];
      if (table) {
        DATA.tasks.forEach(t => {
          if (t.project !== proj.id || t.pdcaGroup) return;       // 別的專案 / 已歸類 → 不動
          const nm = t.name || '';
          for (const [gName, kws] of table) {
            if (kws.some(kw => nm.includes(kw))) { t.pdcaGroup = gName; break; }
          }
        });
      }
    });

    M.pdcaInitialData_v1 = true;
    changed = true;
  }

  // taskTypeBackfill_v1：存量任務 category==='meeting'(里程碑) → taskType='milestone'
  // 只轉 WBS 匯入里程碑(wbs 非空)；手動真會議 wbs='' 落不動側，避免誤標 milestone
  // category='meeting' 有兩種來源：(A)手動表單建的真會議 task，wbs 寫死 ''；
  //   (B)WBS 匯入被 lossy 壓進 category 的里程碑，wbs 是 A 欄序號非空。
  //   兩邊 wbs 都程式寫死＝結構性區分訊號，可靠。
  //   排程跳會議讀的是獨立 store(DATA.meetings/recurringMeetings/specialMeetings)、不讀 task.category，
  //   故本 migration 不影響排程；加 t.wbs 是為語意正確(避免手動真會議被誤標 milestone 害甘特畫菱形)。
  // 同步任務(!t.synced 排除)A-1 已帶正確值不需轉
  // 注意：ensureTaskType(193) 在本 migration(194) 前跑，存量 taskType 已被補成 'task'，
  //       故用 category 判斷直接改寫，不能用「taskType 缺席」當條件
  // group 不處理：存量資料無「群組」痕跡可辨識，group 只從 M2-T1 後新同步/匯入產生
  if (!M.taskTypeBackfill_v1) {
    DATA.tasks.forEach(t => {
      if (t.synced) return;                    // 同步任務跳過
      if (t.wbs && t.category === 'meeting') t.taskType = 'milestone';
    });
    M.taskTypeBackfill_v1 = true;
    changed = true;
  }

  if (changed) Storage.save();
}

// ─── 判斷一個定期事件是否發生在指定日期 ───
// event: { category, frequency, day, startDate, endDate, enabled }
function eventOccursOnDate(event, dateIso) {
  if (event.enabled === false) return false;
  const d = new Date(dateIso); d.setHours(0,0,0,0);
  if (isNaN(d)) return false;

  // 範圍檢查
  if (event.startDate) {
    const start = new Date(event.startDate); start.setHours(0,0,0,0);
    if (d < start) return false;
  }
  if (event.endDate) {
    const end = new Date(event.endDate); end.setHours(0,0,0,0);
    if (d > end) return false;
  }

  const freq = event.frequency || 'weekly';

  if (freq === 'once') {
    return event.startDate ? dateIso === event.startDate : false;
  }

  if (freq === 'daily') {
    return true; // 每天
  }

  // ─── biweekly-allday / triweekly-allday: 隔週/隔兩週的「整週每天」 ───
  // 用途：例如定期打掃是「我那週的每一天早上」都要做
  // 規則：從 startDate 那週起算，每隔 2 週（或 3 週）的「週一到週五」都觸發
  if (freq === 'biweekly-allday' || freq === 'triweekly-allday') {
    const start = event.startDate ? new Date(event.startDate) : new Date('2026-01-01');
    start.setHours(0,0,0,0);
    // 對齊到 startDate 所在週的週一
    const startDow = start.getDay();
    const startMonday = new Date(start);
    startMonday.setDate(start.getDate() + (startDow === 0 ? -6 : 1 - startDow));
    startMonday.setHours(0,0,0,0);
    // 算 d 所在週的週一
    const dDow = d.getDay();
    const dMonday = new Date(d);
    dMonday.setDate(d.getDate() + (dDow === 0 ? -6 : 1 - dDow));
    dMonday.setHours(0,0,0,0);
    // 兩個週一相差幾週
    const diffWeeks = Math.round((dMonday - startMonday) / (7 * 86400000));
    if (diffWeeks < 0) return false;
    // 限制週一到週五
    if (dDow === 0 || dDow === 6) return false;
    if (freq === 'biweekly-allday') return diffWeeks % 2 === 0;
    if (freq === 'triweekly-allday') return diffWeeks % 3 === 0;
  }

  // weekly/biweekly/triweekly: 必須是指定週幾
  if (event.day === undefined || event.day === null) return false;
  if (d.getDay() !== event.day) return false;

  if (freq === 'weekly') return true;

  // biweekly / triweekly: 從 startDate 起算第幾週（每幾週一次）
  const start = event.startDate ? new Date(event.startDate) : new Date('2026-01-01');
  start.setHours(0,0,0,0);
  const diffDays = Math.round((d - start) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (freq === 'biweekly') return diffWeeks % 2 === 0;
  if (freq === 'triweekly') return diffWeeks % 3 === 0;

  return false;
}

// ─── UTILS ────────────────────────────────────────────
const U = {
  id() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  esc(s) { return String(s ?? '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); },
  hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); },
  toast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  },
};

// ─── URGENCY / STATUS LABELS ───────────────────────────
const LABELS = {
  urgency:  { high: '緊急', medium: '普通', low: '不急' },
  status:   { pending: '未開始', wip: '進行中', done: '已完成', hold: '擱置中' },
  category: { deep: '深度', admin: '雜事', meeting: '會議', other: '其他', milestone: '◆ 里程碑' },  // milestone 鍵供 taskType 顯示用（M2-T3），非 category 值域
  categoryClass: { deep: 'tag-deep', admin: 'tag-admin', meeting: 'tag-meeting', other: 'tag-other', milestone: 'tag-milestone' },
};

// ─── TASK SCORING (priority sort) ──────────────────────
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
  return [...arr].sort((a, b) => scoreTask(b) - scoreTask(a));
}

// ─── CLEAN OLD DONE TASKS ──────────────────────────────
function cleanOldDoneTasks() {
  const retentionDays = DATA.settings.doneRetentionDays || 30;
  if (retentionDays === 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const before = DATA.tasks.length;
  DATA.tasks = DATA.tasks.filter(t => {
    if (t.status !== 'done') return true;
    if (t.synced) return true; // synced tasks managed by sync
    if (!t.completedAt) { t.completedAt = new Date().toISOString(); return true; }
    return new Date(t.completedAt) >= cutoff;
  });
  if (before !== DATA.tasks.length) Storage.save();
}

// ─── REGEX MEETING PARSER ──────────────────────────────
function parseMeetingText(text) {
  if (!text) return [];
  const meetings = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Patterns to match. Examples:
  // 5/19 (一) 10:00-11:00 移行會議
  // 5/19 10:00-11:00 移行會議
  // 一 10:00-11:00 移行會議
  // 週一 10:00 移行會議
  // 5月19日 10:00-11:00 移行會議
  const dayMap = { '日':0, '一':1, '二':2, '三':3, '四':4, '五':5, '六':6 };
  const today = D.today();
  const monday = D.monday(today);

  for (const line of lines) {
    // Try MM/DD format
    let m = line.match(/(\d{1,2})[\/月](\d{1,2})[日\)\s]?[^\d]*?(\d{1,2}):(\d{2})[\-~~~]?(\d{1,2}:\d{2})?\s*(.+?)$/);
    if (m) {
      const month = parseInt(m[1]), day = parseInt(m[2]);
      const hour = parseInt(m[3]), min = parseInt(m[4]);
      const end = m[5] || '';
      const title = (m[6] || '').replace(/^[（(].*?[）)]\s*/, '').trim();
      const year = today.getFullYear();
      const date = new Date(year, month - 1, day, hour, min);
      // adjust year if date is too far in past
      if (D.daysBetween(today, date) < -180) date.setFullYear(year + 1);
      meetings.push({
        date: D.fmt(date, 'iso'),
        startTime: `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`,
        endTime: end || '',
        title: title || '會議',
      });
      continue;
    }
    // Try weekday format
    m = line.match(/(?:週|星期)?([日一二三四五六])[^\d]*?(\d{1,2}):(\d{2})[\-~~~]?(\d{1,2}:\d{2})?\s*(.+?)$/);
    if (m) {
      const dayIdx = dayMap[m[1]];
      const hour = parseInt(m[2]), min = parseInt(m[3]);
      const end = m[4] || '';
      const title = (m[5] || '').trim();
      const date = new Date(monday);
      date.setDate(monday.getDate() + (dayIdx === 0 ? 6 : dayIdx - 1));
      date.setHours(hour, min);
      meetings.push({
        date: D.fmt(date, 'iso'),
        startTime: `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`,
        endTime: end || '',
        title: title || '會議',
      });
    }
  }
  return meetings;
}

// ─── DEDUPE MEETINGS ───────────────────────────────────
function dedupeMeetings(arr, sourceLabel) {
  const map = new Map();
  for (const m of arr) {
    const key = `${m.date}_${m.startTime}_${m.title}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing.sources = existing.sources || [];
      if (sourceLabel && !existing.sources.includes(sourceLabel)) {
        existing.sources.push(sourceLabel);
      }
    } else {
      map.set(key, { ...m, sources: sourceLabel ? [sourceLabel] : [] });
    }
  }
  return Array.from(map.values());
}

// ═══ 階段2 排程引擎 ═══════════════════════════════════════════════
// 解析 predecessor 前置任務字串 → [{dep, type, lag}]
// 支援兩種格式（同一字串可用逗號/分號分隔多個前置，可混用）：
//   1. 純編號：'5' 或 '5,6'        → {dep:'5', type:'FS', lag:0}
//   2. 含關係：'5FS+2' / '5SS-1'   → 完整解析 type(FS/SS/FF/SF) + lag(正負整數)
// 規則：
//   - 空字串 / null / undefined → []
//   - type 不分大小寫，統一轉大寫；非 FS/SS/FF/SF 的未知關係 → 退回 'FS'
//   - lag 可帶 +/-（容忍空白，如 '+ 2'），無 lag → 0；lag 解析失敗 → 0
//   - dep 一律回字串（task.wbs 可能是數字或字串，實際比對時再正規化）
//   - 無法解析出 dep（無數字開頭）的片段 → 跳過，不報錯
function parsePredecessors(str) {
  if (str === null || str === undefined) return [];
  const s = String(str).trim();
  if (!s) return [];
  const VALID = ['FS', 'SS', 'FF', 'SF'];
  const out = [];
  // 以半形/全形逗號或分號分隔多個前置
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    // dep(數字) + 可選 type(2 字母) + 可選 lag(+/- 數字，容忍空白)
    const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
    if (!m) continue;                          // 無法解析（非數字開頭）→ 跳過
    const dep = m[1];
    let type = (m[2] || 'FS').toUpperCase();
    if (!VALID.includes(type)) type = 'FS';    // 未知關係 → FS
    let lag = 0;
    if (m[3]) {
      const n = parseInt(m[3].replace(/\s+/g, ''), 10);
      lag = isNaN(n) ? 0 : n;
    }
    out.push({ dep, type, lag });
  }
  return out;
}

// 偵測 task 是否被前置任務擋住（甲：衝突偵測地基；只偵測 + 回報，不改任何日期）
// @param task        要檢查的任務
// @param allTasksMap 以 wbs 為 key 的查找表（Map 或 plain object 皆可；value = task）
// @return {blocked:boolean, reasons:[{dep, type, conflict}]}
//   conflict（固定字串，方便顯示與測試比對）：
//     '前置不存在' | '前置未完成' | '日期衝突'
//   同一前置可能同時「未完成」+「日期衝突」→ 產生多筆 reason。
// 日期衝突依關係類型判定（lag 以工作日計，套在「前置參考日」上後比較）：
//   FS 本任務 start 不得早於 前置 end  的次一工作日 (+1+lag)  ← 只有 FS 跳一天
//   SS 本任務 start 不得早於 前置 start(+lag)
//   FF 本任務 end   不得早於 前置 end  (+lag)
//   SF 本任務 end   不得早於 前置 start(+lag)
//   參考日任一為空 → 跳過日期檢查（留待排程引擎推算），不視為衝突。
// ── [CORE] 純計算層：查找表由參數注入、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function isTaskBlocked(task, allTasksMap) {
  const result = { blocked: false, reasons: [] };
  if (!task) return result;
  const preds = parsePredecessors(task.predecessor);
  if (preds.length === 0) return result;

  // 同時支援 Map 與 plain object 當查找表
  const lookup = (key) => {
    if (!allTasksMap) return undefined;
    const k = String(key);
    if (typeof allTasksMap.get === 'function') return allTasksMap.get(k) || allTasksMap.get(key);
    return allTasksMap[k];
  };

  for (const p of preds) {
    const dep = lookup(p.dep);
    // 1. 前置不存在
    if (!dep) {
      result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置不存在' });
      continue;
    }
    // 2. 前置未完成
    if (dep.status !== 'done') {
      result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置未完成' });
    }
    // 3. 日期衝突（依關係類型；參考日任一為空則跳過）
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
      // 只有 FS 是「起點(SOD) ≥ 終點(EOD)」→ 同日不成立，需跳次一工作日(+1)；
      // SS/FF/SF 端點同層級(SOD≥SOD / EOD≥EOD / EOD≥SOD)當日即成立，不 +1。
      // 此 fsBump 讓偵測門檻與 computeSchedule 的推算門檻完全同尺。
      const fsBump = (p.type === 'FS') ? 1 : 0;
      const predShifted = D.addWorkdays(new Date(predRefStr), p.lag + fsBump);
      const taskRef = new Date(taskRefStr);
      // predShifted 晚於 taskRef（正天數）→ 本任務排太早 → 違反
      if (D.daysBetween(taskRef, predShifted) > 0) {
        result.reasons.push({ dep: p.dep, type: p.type, conflict: '日期衝突' });
      }
    }
  }
  result.blocked = result.reasons.length > 0;
  return result;
}

// 步驟4 第一段：依賴圖 + 拓撲排序 + 循環偵測（不算日期，computeSchedule 第二段會用）
// 節點 id = String(task.wbs)；邊 = parsePredecessors(task.predecessor) 的每個 dep → 本任務。
// @param tasks 任務陣列
// @return {
//   order:    [wbs,...]      拓撲順序（前置在前、依賴在後；不含 circular 節點）
//   circular: [wbs,...]      落在環上的節點（標 error:'circular'，排程時跳過）
//   nodes:    Map<wbs,task>  節點查找表
//   edges:    Map<wbs,[{dep,type,lag}...]>  每個節點「已存在於圖中」的前置邊
// }
// 三色 DFS：white(未訪) / gray(訪問中，在堆疊上) / black(完成)。
//   訪問中又遇到 gray 節點 → 有環；直接環 A→B→A 與間接環 A→B→C→A 都會在重遇 gray 時抓到。
//   只把「環上節點」(gray 重遇點 → 堆疊頂這一段) 標 circular，不誤標單純「依賴環的上游」。
//   用迭代式 DFS（顯式堆疊）避免大圖遞迴爆堆疊。
function topoSortTasks(tasks) {
  const list = (tasks || []).filter(t => t && t.wbs !== '' && t.wbs !== undefined && t.wbs !== null);
  const nodes = new Map();
  for (const t of list) nodes.set(String(t.wbs), t);

  // 邊：本任務 → 它的前置；只保留 dep 存在於 nodes 的邊。
  // 不存在的前置不影響拓撲（由 isTaskBlocked 另報「前置不存在」）。
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
    const stack = [{ key: startKey, i: 0 }];   // i = 下一個要處理的前置 index
    color.set(startKey, GRAY);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const preds = edges.get(top.key) || [];
      if (top.i < preds.length) {
        const depKey = String(preds[top.i].dep);
        top.i++;
        const c = color.get(depKey);
        if (c === WHITE) {
          color.set(depKey, GRAY);
          stack.push({ key: depKey, i: 0 });
        } else if (c === GRAY) {
          // 環：標記 depKey..堆疊頂 這一段（正好是環上節點）
          let onCycle = false;
          for (const f of stack) {
            if (f.key === depKey) onCycle = true;
            if (onCycle) circular.add(f.key);
          }
        }
        // BLACK：已完成，略過
      } else {
        color.set(top.key, BLACK);
        if (!circular.has(top.key)) order.push(top.key);   // 環上節點不進 order
        stack.pop();
      }
    }
  }

  for (const k of nodes.keys()) {
    if (color.get(k) === WHITE) visit(k);
  }

  return { order, circular: Array.from(circular), nodes, edges };
}

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
//           circular:[wbs], hasCircular }
// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function computeSchedule(tasks) {
  const { order, circular, nodes } = topoSortTasks(tasks);
  const byWbs = new Map();   // wbs -> result（供連鎖污染查前置）
  const results = [];

  const iso = (d) => D.fmt(d, 'iso');
  const durOf = (t) => Math.max(1, parseFloat(t.durationDays) || 1);
  const ident = (t) => ({ wbs: (t.wbs === undefined || t.wbs === null) ? '' : t.wbs, taskId: t.id, name: t.name || '' });

  // 1. 先標 circular 節點（讓下游污染查得到）
  for (const wbs of circular) {
    const t = nodes.get(wbs);
    byWbs.set(wbs, { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: true, error: 'circular', toSchedule: false, blockedCause: 'circular',
      warnings: ['循環依賴：此任務在依賴環上，無法排程'] });
  }

  function processTask(t) {
    const fullPreds = parsePredecessors(t.predecessor);
    const preds = fullPreds.filter(p => nodes.has(String(p.dep)));
    const missingWarn = fullPreds.filter(p => !nodes.has(String(p.dep)))
      .map(p => `前置 #${p.dep} 不存在`);
    const dur = durOf(t);

    // ① 錨點：使用者刻意定的開始日，最高優先、不被推算覆蓋（即使上游有問題也不 block，只警示）
    //   - 同步任務(J task)：錨點 = override._localStart（前端刻意改的），plannedStart 不算錨點
    //   - 手動任務：錨點 = t.start（使用者建立時真填的）
    //   這樣同步進來的 92 筆(只有 plannedStart、無 override)不會被當錨點 → 可正常連動
    const ov = isJTask(t) ? getJOverride(t.id) : null;
    const anchorStart = ov?.start ?? (isJTask(t) ? '' : t.start);
    if (anchorStart) {
      const end = iso(D.addWorkdays(new Date(anchorStart), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: anchorStart, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null,
        warnings: warns, anchorSource: ov?.start ? 'override' : 'manual' };
    }

    // ② 連鎖污染：前置 circular / 已 blocked / 待排 / 無日期 → 本 task 也 blocked
    const pollutedWarn = [];
    let pollutedCause = null;
    for (const p of preds) {
      const pr = byWbs.get(String(p.dep));
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
        const pr = byWbs.get(String(p.dep));
        const ps = new Date(pr.suggestedStart);
        const pe = new Date(pr.suggestedEnd);
        let s;
        if (p.type === 'SS') s = D.addWorkdays(ps, p.lag);
        else if (p.type === 'FF') s = D.addWorkdays(D.addWorkdays(pe, p.lag), -(dur - 1));
        else if (p.type === 'SF') s = D.addWorkdays(D.addWorkdays(ps, p.lag), -(dur - 1));
        else s = D.addWorkdays(pe, 1 + p.lag);   // FS（parsePredecessors 已把未知關係正規化為 FS）
        if (latest === null || s > latest) latest = s;
      }
      return { ...ident(t), suggestedStart: iso(latest), suggestedEnd: iso(D.addWorkdays(latest, dur - 1)),
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: missingWarn };
    }

    // ④ 無 start、無前置：待排
    return { ...ident(t), suggestedStart: null, suggestedEnd: null,
      blocked: false, error: null, toSchedule: true, blockedCause: null,
      warnings: ['待排：無前置且未填開始日'].concat(missingWarn) };
  }

  // 2. 圖內節點按拓撲順序處理
  for (const wbs of order) byWbs.set(wbs, processTask(nodes.get(wbs)));

  // 3. 整理輸出：order → circular → 非圖內任務（無 wbs，例如手填任務）
  for (const wbs of order) results.push(byWbs.get(wbs));
  for (const wbs of circular) results.push(byWbs.get(wbs));
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs === '' || t.wbs === undefined || t.wbs === null) results.push(processTask(t));
  }

  return { results, circular: circular.slice(), hasCircular: circular.length > 0 };
}

// ═══ applySchedule：把 computeSchedule 算出的建議落地到 task.scheduledStart/End ═══
// scope: 'full' = 整鏈套用（丙，目前唯一模式；乙/甲未來加）
// 規則（抉擇 B 定案=「不寫」錨點）：循環/blocked/待排 跳過；錨點任務(override/manual)也跳過，
//   不進機器層 scheduled——顯示靠 getEffectiveSchedule 的 override/actual 層補；其餘連動任務寫入 scheduled。
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
    // 跳過：錨點任務(override或手動手填)——人的意志，不進機器層scheduled(B定案=不寫)
    //   顯示靠 getEffectiveSchedule 的 override/actual 層補
    if (r.anchorSource === 'override' || r.anchorSource === 'manual') {
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
function generateSchedule() {
  const { dailyHours, workStart1, workEnd1, workStart2, workEnd2, goldenTime, workDays, splitThreshold } = DATA.settings;
  const monday = D.weekStart();
  const weekKey = D.weekKey(D.weekStart());

  // Build available slots for each work day
  const slots = [];
  for (const dayNum of workDays) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + (dayNum - 1));
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

  // Helper: slot 起始分鐘數（用於判斷時間相鄰）
  function startMin(slot) {
    const [h, m] = slot.start.split(':').map(Number);
    return h * 60 + m;
  }

  // Helper: 找一段「同一天、時間相鄰、N 格都空」的連續 slot 區間
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
    .filter(t => {
      // 已完成任務：本週才完成的也顯示（不重新排程，但要在時程表顯示）
      if (t.status === 'done') {
        const completedDate = t.actualEnd ? new Date(t.actualEnd) : (t.completedAt ? new Date(t.completedAt) : null);
        if (completedDate && completedDate >= monday && completedDate <= sunday) {
          return true; // 本週完成 → 顯示
        }
        return false;
      }
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

  // Schedule items（全清：每次乾淨重排，不保留 locked 殘留）
  const items = [];

  // 硬上限：每個任務本週只排 1 個時段（1h）
  // 若任務工時很長，hover tooltip 會提示需要幾週
  const MAX_CHUNKS_PER_TASK = 1;   // TODO 1b: lift to allow splitting
  const HOURS_PER_CHUNK = 1;       // TODO 1b: configurable chunk size

  for (const task of sorted) {
    const totalHours = parseFloat(task.estHours) || 1;
    const isDeep = task.category === 'deep' || !task.category;
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
          week: weekKey,
          locked: false,
          completed: true, // 標記為已完成顯示
        });
      }
      continue;
    }

    // 1a：一個任務一張長卡，找連續 N 格空檔（N = 取整後的 estHours 小時數）
    const N = Math.max(1, Math.round(parseFloat(task.estHours) || 1));
    const run = findRun(slots, N, isDeep);
    if (!run) {
      console.warn(`[generateSchedule] 任務「${task.name}」需 ${N}h 連續空檔，本週排不下，略過`);
      continue;
    }
    run.forEach(s => s.taken = true);
    items.push({
      taskId: task.id,
      date: run[0].date,
      start: run[0].start,
      duration: N * 60,
      chunk: null,
      totalHours: totalHours,
      week: weekKey,
      locked: false,
    });
  }
  DATA.schedule = { week: weekKey, items, generatedAt: new Date().toISOString() };
  Storage.save();
  return { taskCount: candidates.length, scheduledCount: items.length, lockedCount: 0 };
}

// === WBS 本地時程覆蓋（抽象層） ===
const J_OVERRIDE_FIELDS = ['start', 'end'];

function isJTask(task) {
  if (!task || !task.synced) return false;
  const proj = DATA.projects.find(p => p.id === task.project);
  return proj ? proj.syncSource === 'jSheet' : false;
}

// ── [CORE] 純計算層：只讀 DATA.tasks、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function getJOverride(taskId) {
  const task = DATA.tasks.find(t => t.id === taskId);
  if (!task) return null;
  const result = {};
  let hasAny = false;
  J_OVERRIDE_FIELDS.forEach(f => {
    const key = '_local' + f.charAt(0).toUpperCase() + f.slice(1);
    if (task[key] !== undefined) {
      result[f] = task[key];
      hasAny = true;
    }
  });
  return hasAny ? result : null;
}

function setJOverride(taskId, fields) {
  const task = DATA.tasks.find(t => t.id === taskId);
  if (!task || !isJTask(task)) return false;
  Object.keys(fields).forEach(f => {
    if (J_OVERRIDE_FIELDS.includes(f)) {
      const key = '_local' + f.charAt(0).toUpperCase() + f.slice(1);
      task[key] = fields[f];
    }
  });
  Storage.save();
  return true;
}

function clearJOverride(taskId) {
  const task = DATA.tasks.find(t => t.id === taskId);
  if (!task) return false;
  J_OVERRIDE_FIELDS.forEach(f => {
    const key = '_local' + f.charAt(0).toUpperCase() + f.slice(1);
    delete task[key];
  });
  Storage.save();
  return true;
}

function getAllJOverrides() {
  return DATA.tasks
    .filter(t => isJTask(t) && getJOverride(t.id))
    .map(t => ({ id: t.id, name: t.name, override: getJOverride(t.id) }));
}

// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function getEffectiveSchedule(task) {
  if (!task) return null;
  const override = isJTask(task) ? getJOverride(task.id) : null;
  // 顯示優先序（甲案）：override(人刻意改) > actual(已開工事實) > scheduled(排程算) > planned(初始預計)
  // ⚠ 用 || 不用 ??（抉擇A）：override 會存空字串(saveJSchedule清空欄位時)，?? 不會 fallback 空字串 → 吃掉下層顯示空白
  const dispStart = (override?.start || task.actualStart || task.scheduledStart || task.plannedStart || task.start || '');
  const dispEnd   = (override?.end   || task.actualEnd   || task.scheduledEnd   || task.plannedEnd   || task.end   || '');
  return {
    start: dispStart,
    end: dispEnd,
    plannedStart: override?.plannedStart ?? task.plannedStart,
    plannedEnd: override?.plannedEnd ?? task.plannedEnd,
    scheduledStart: task.scheduledStart || '',
    scheduledEnd: task.scheduledEnd || '',
    hasOverride: !!override,
    startSource: override?.start ? 'override' : (task.actualStart ? 'actual' : (task.scheduledStart ? 'scheduled' : (task.plannedStart ? 'planned' : (task.start ? 'manual' : 'none')))),
  };
}

// ═══════════════════════════════════════════════════════
//  GOOGLE SHEETS SYNC (Apps Script)
// ═══════════════════════════════════════════════════════
const Sync = {
  syncing: false,

  async syncJSeries(silent = false) {
    if (this.syncing) return;
    const url = DATA.settings.jSheetUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 請先在「設定」填入 Apps Script URL', 'warning');
      return;
    }
    this.syncing = true;
    if (!silent) U.toast('🔄 正在同步 ' + CFG('WBS_LABEL', 'WBS') + '...');

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.tasks || !Array.isArray(data.tasks)) throw new Error('回應格式錯誤');

      // Find or create WBS project
      let jProj = DATA.projects.find(p => p.synced && p.syncSource === 'jSheet');
      if (!jProj) {
        jProj = {
          id: U.id(), name: CFG('WBS_PROJECT_NAME', 'WBS 專案'), color: CFG('WBS_PROJECT_COLOR', '#4A7C5C'),
          note: '從 Google Sheet 自動同步',
          synced: true, syncSource: 'jSheet',
          createdAt: new Date().toISOString(),
        };
        DATA.projects.unshift(jProj);
      }

      // Preserve _local* overrides before removing old tasks
      const savedOverrides = {};
      DATA.tasks.forEach(t => {
        if (t.synced && t.project === jProj.id && getJOverride(t.id)) {
          savedOverrides[t.id] = {};
          J_OVERRIDE_FIELDS.forEach(f => {
            const key = '_local' + f.charAt(0).toUpperCase() + f.slice(1);
            if (t[key] !== undefined) savedOverrides[t.id][key] = t[key];
          });
        }
      });

      // Remove old synced tasks for this project
      DATA.tasks = DATA.tasks.filter(t => !(t.synced && t.project === jProj.id));

      // Add new tasks from sheet
      for (const row of data.tasks) {
        // ─── 即時狀態判定邏輯 ───
        // 1. 有「實際完成日」 → 強制狀態 = 已完成（不管 sheet 上的狀態欄）
        // 2. 有「實際開始日」但無實際完成日 → 強制狀態 = 進行中
        // 3. 兩者都沒有 → 用 sheet 上的狀態欄判定
        let realStatus;
        let realCompletedAt = null;
        if (row.actualEnd) {
          realStatus = 'done';
          realCompletedAt = row.actualEnd;
        } else if (row.actualStart) {
          realStatus = 'wip';
        } else {
          realStatus = mapStatus(row.status, row.progress);
        }

        // ─── 即時日期判定邏輯 ───
        // 有實際開始日 → 用實際的，否則用預計的
        // 有實際完成日 → 用實際的，否則用預計的
        const effectiveStart = row.actualStart || row.plannedStart || '';
        const effectiveEnd   = row.actualEnd   || row.plannedEnd   || '';

        // 進度：已完成強制 100%
        const realProgress = realStatus === 'done' ? 100 : parseFloat(row.progress || 0);

        const task = {
          id: `sync_${jProj.id}_${row.n}`,
          project: jProj.id,
          synced: true,
          syncRef: `WBS#${row.n}`,
          name: row.name || `任務 ${row.n}`,
          desc: row.stage ? `${row.stage} / ${row.subgroup || ''}` : (row.subgroup || ''),
          stage: row.stage || '',          // PLM 階段（Sheet 第1欄）：一等欄位，供 getProjectStages 分桶
          subgroup: row.subgroup || '',     // 子群組（Sheet 第2欄）：一併存成欄位，不再只靠 desc 解析
          owner: row.owner || '',
          // ─ 階段2 排程引擎欄位 ─
          predecessor: row.precedence || '',  // 後端「前置任務」欄；格式解析見 parsePredecessors
          wbs: row.n,                          // WBS 序號（同步任務以此為 WBS 識別）
          parentWbsId: '',                     // 子綁父；待 Sheet WBS 階層格式確認後填，先留空不亂猜
          // ⚠ start = effectiveStart = actualStart||plannedStart，語意是「有效顯示日」(混實際/預計兩義)。
          //   computeSchedule(行1004)目前讀 t.start 當「手填錨點」→ 語意衝突：
          //   實際已開工(actualStart有值)的任務 start=實際日，會被誤當錨點不推算，非使用者本意。
          //   定案：錨點應改判斷 override.start(使用者前端刻意改的,見getEffectiveSchedule行1346)，
          //         plannedStart(Sheet同步進來92筆都有)不算錨點，才能讓「改一筆下游連動」成立。
          //   待改 computeSchedule 錨點判斷來源 + 加 scheduledStart/End 收排程結果。回家有node再改+驗。
          start: effectiveStart,           // 用實際的覆蓋預計（顯示用，勿直接當排程錨點，見上）
          end: effectiveEnd,                // 用實際的覆蓋預計（顯示用）
          plannedStart: row.plannedStart || '', // 保留預計日期供顯示
          plannedEnd: row.plannedEnd || '',
          actualStart: row.actualStart || '',
          actualEnd: row.actualEnd || '',
          durationDays: parseFloat(row.workdays) || 0,  // Sheet「工期」欄＝工作天數；排程 end=addWorkdays(start, n-1)
          scheduledStart: '',  // 排程套用結果（applySchedule寫入/getEffectiveSchedule讀），四條建任務路徑一致
          scheduledEnd: '',
          estHours: parseFloat(row.workdays || 0) * (DATA.settings.dailyHours || 6) || 4,  // 每日工時讀 settings（使用者可在設定頁自填），settings 無值才 fallback 6。小時來源最終設計待引擎2
          category: row.type === '里程碑' ? 'meeting' : 'deep',
          taskType: mapTaskType(row.type),  // M2-T：類型正本（task/milestone/group）；上行 lossy 映射待消費點全改完後拔除
          urgency: deduceUrgency(row),
          status: realStatus,
          progress: realProgress,
          note: row.note || '',
          locked: true,
          createdAt: new Date().toISOString(),  // 形狀統一：四條建任務路徑都帶 createdAt
          completedAt: realCompletedAt,
        };
        DATA.tasks.push(task);
        if (savedOverrides[task.id]) {
          Object.assign(task, savedOverrides[task.id]);
        }
      }

      // Store sync log
      const syncedAt = new Date().toISOString();
      localStorage.setItem(STORE.syncLog, JSON.stringify({ syncedAt, count: data.tasks.length }));
      jProj.lastSync = syncedAt;

      Storage.save();
      if (!silent) {
        U.toast(`✅ ${CFG('WBS_LABEL', 'WBS')}已同步 (${data.tasks.length} 項任務)`, 'success');
      }
      App.refreshAll();
    } catch (e) {
      console.error('Sync failed:', e);
      if (!silent) U.toast(`❌ 同步失敗：${e.message}`, 'error');
    } finally {
      this.syncing = false;
    }
  },

  // Auto-sync at scheduled times
  startAutoSync() {
    const check = () => {
      if (!DATA.settings.autoSyncEnabled || !DATA.settings.jSheetUrl) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const lastLog = JSON.parse(localStorage.getItem(STORE.syncLog) || '{}');
      const lastDay = lastLog.syncedAt ? new Date(lastLog.syncedAt).toDateString() : '';
      const todayDay = now.toDateString();
      const lastTime = lastLog.syncedAt ? `${new Date(lastLog.syncedAt).getHours()}:${new Date(lastLog.syncedAt).getMinutes()}` : '';

      for (const t of DATA.settings.syncTimes) {
        if (hhmm === t) {
          const sig = `${todayDay}_${t}`;
          if (lastLog.lastTriggerSig !== sig) {
            lastLog.lastTriggerSig = sig;
            localStorage.setItem(STORE.syncLog, JSON.stringify(lastLog));
            this.syncJSeries(true);
          }
        }
      }
    };
    setInterval(check, 60000); // check every minute
  },
};

function deduceUrgency(row) {
  if (!row.plannedEnd) return 'medium';
  const days = D.daysBetween(D.today(), new Date(row.plannedEnd));
  if (days < 0) return 'high';
  if (days <= 3) return 'high';
  if (days <= 7) return 'medium';
  return 'low';
}

function mapStatus(status, progress) {
  if (!status) return 'pending';
  const s = String(status);
  if (s.includes('完成')) return 'done';
  if (s.includes('進行') || (parseFloat(progress || 0) > 0 && parseFloat(progress) < 100)) return 'wip';
  if (s.includes('擱置') || s.includes('暫停')) return 'hold';
  return 'pending';
}

// ═══════════════════════════════════════════════════════
//  APP CONTROLLER
// ═══════════════════════════════════════════════════════
const App = {
  currentPage: 'dashboard',
  currentProjectId: null,
  currentView: 'dashboard', // B-1 雙視圖:dashboard|gantt|month,範圍由所在頁決定
  reportWeekKey: null, // for report page

  init() {
    Storage.load();
    cleanOldDoneTasks();
    this.cleanExpiredDeletedTasks();

    // First time? Set seed data
    if (DATA.projects.length === 0) {
      this.seedDefaultProjects();
    }

    this.refreshUserBadge();
    this.updateWeekInfo();
    this.renderSidebar();
    this.refreshAll();

    // Auto-sync if enabled
    Sync.startAutoSync();

    // Login check
    this.checkLoginState();

    // ☁ 雲端同步：開啟時先拉最新資料
    if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudSyncUrl) {
      // 延遲 800ms 讓畫面先渲染
      setTimeout(() => {
        CloudSync.download(true).then(success => {
          if (success) {
            // 重新整理畫面
            this.refreshAll();
            this.renderSidebar();
            U.toast('☁ 已自動從雲端同步最新資料', 'success');
          }
        });
      }, 800);
    }
  },

  seedDefaultProjects() {
    const otherProj = {
      id: U.id(), name: '其他事項', color: '#5C7A8B',
      note: '預設專案，用於放置零散任務',
      synced: false,
      createdAt: new Date().toISOString(),
    };
    ensurePdcaData(otherProj);
    DATA.projects.push(otherProj);
    Storage.save();
  },

  refreshUserBadge() {
    const name = DATA.settings.userName || '使用者';
    document.getElementById('userName').textContent = name;
    const avatar = document.getElementById('userAvatar');
    const picture = DATA.settings._loggedInPicture;
    if (picture) {
      avatar.textContent = '';
      avatar.style.backgroundImage = `url('${picture}')`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  },

  updateWeekInfo() {
    const wk = D.weekNum();
    const r = D.weekRange();
    document.getElementById('weekInfo').textContent =
      `本週 W${wk} · ${D.fmt(r.start, 'md')} – ${D.fmt(r.end, 'md')}`;
  },

  // ─── LOGIN ───
  checkLoginState() {
    // Fallback：若使用者沒設過 OAuth Client ID，用 hardcode 的預設值
    // 這讓「拿到 URL 的同事」零設定就能 Google 登入
    const clientId = DATA.settings.googleClientId || DEFAULT_OAUTH_CLIENT_ID;
    const pwMode = document.getElementById('loginPwMode');
    const googleMode = document.getElementById('loginGoogleMode');
    const googleSetupHint = document.getElementById('googleSetupHint');

    if (clientId) {
      // Google OAuth mode
      googleMode.style.display = '';
      pwMode.style.display = 'none';
      googleSetupHint.style.display = 'none';
      // Render Google sign-in button when API is ready
      this.initGoogleSignIn(clientId);
    } else {
      // No Google client id configured yet → show password fallback OR hint
      googleMode.style.display = '';
      pwMode.style.display = 'none';
      // Show only "view only" + hint to set up Google OAuth
      googleSetupHint.style.display = '';
      const btn = document.getElementById('gSignInBtn');
      if (btn) btn.style.display = 'none';
    }
  },

  initGoogleSignIn(clientId) {
    const tryInit = () => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        setTimeout(tryInit, 200);
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => App.handleGoogleCredential(resp),
        });
        const btnEl = document.getElementById('gSignInBtn');
        if (btnEl) {
          btnEl.style.display = '';
          btnEl.innerHTML = ''; // clear
          google.accounts.id.renderButton(btnEl, {
            theme: 'outline',
            size: 'large',
            width: 280,
            text: 'signin_with',
            shape: 'rectangular',
          });
        }
      } catch (e) {
        console.error('Google sign-in init failed', e);
        U.toast('❌ Google 登入初始化失敗：' + e.message, 'error');
      }
    };
    tryInit();
  },

  handleGoogleCredential(resp) {
    try {
      // Decode JWT payload (no verify needed for client-side, Google has issued it)
      const parts = resp.credential.split('.');
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
      const email = (payload.email || '').toLowerCase();
      const name = payload.name || payload.given_name || 'User';
      const picture = payload.picture || '';

      // 個人獨立模式：所有 Google 登入都進入 editor 模式
      // 資料以 Gmail 區分（透過 localStorage 命名空間），各看各的
      // WBS 同步等 admin 功能由 isAdmin() 控制，不再依賴白名單擋人

      // 通過 → 編輯模式
      DATA.settings.userName = name;
      DATA.settings._loggedInEmail = email;
      DATA.settings._loggedInPicture = picture;
      Storage.save();
      this.refreshUserBadge();
      document.body.classList.remove('viewonly');
      document.getElementById('loginOverlay').classList.add('hidden');
      U.toast(`✓ 歡迎 ${name}`);

      // 非 admin 首次登入（沒設過雲端同步 URL）→ 顯示 onboarding 提示
      if (!isAdmin() && !DATA.settings.cloudSyncUrl && !DATA.settings._onboardingShown) {
        DATA.settings._onboardingShown = true;
        Storage.save();
        setTimeout(() => this.showOnboarding(), 800);
      }
    } catch (e) {
      console.error('Login failed', e);
      U.toast('❌ 登入失敗：' + e.message, 'error');
    }
  },

  // ─── LEGACY PASSWORD LOGIN (備援) ───
  doLogin() {
    const input = document.getElementById('loginPw');
    const entered = input ? input.value.trim() : '';
    const stored = localStorage.getItem(STORE.password);

    if (!stored) {
      if (!entered) {
        localStorage.setItem(STORE.password, '');
      } else {
        localStorage.setItem(STORE.password, U.hash(entered).toString());
      }
      document.body.classList.remove('viewonly');
      document.getElementById('loginOverlay').classList.add('hidden');
      U.toast(entered ? '✓ 密碼已設定' : '✓ 已登入（未設密碼）');
    } else {
      const enteredHash = entered ? U.hash(entered).toString() : '';
      if (stored === '' || enteredHash === stored) {
        document.body.classList.remove('viewonly');
        document.getElementById('loginOverlay').classList.add('hidden');
      } else {
        U.toast('❌ 密碼錯誤', 'error');
      }
    }
  },

  enterViewOnly() {
    document.body.classList.add('viewonly');
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('userMode').textContent = 'VIEW ONLY';
  },

  // ─── PAGE NAV ───
  showPage(name, btn) {
    this.currentPage = name;
    if (name === 'dashboard') this.currentView = 'dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');

    const titles = {
      dashboard: '總儀表板',
      project:   this.currentProjectId ? this.getProj(this.currentProjectId)?.name + ' · 任務管理' : '專案',
      gantt:     '甘特圖 · 跨專案時程',
      month:     '月曆視圖',
      report:    '專案週報',
      pdca:      'PDCA 報告',
      settings:  '設定',
    };
    document.getElementById('pageTitle').textContent = titles[name] || name;
    document.getElementById('crumbPage').textContent = titles[name] || name;

    const tb = document.querySelector('.main > .topbar');
    if (tb) tb.classList.toggle('topbar-hidden', name === 'project');

    if (btn) {
      document.querySelectorAll('.sb-item, .sb-proj').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Render the active page（進甘特頁重設專案篩選＝全選；切週 ganttShift 不重設）
    if (name === 'gantt') this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
    this.renderPage(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchView(view) {
    this.currentView = view;
    if (view === 'dashboard') { this.renderDashboard(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (view === 'gantt') this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
    document.getElementById('page-dashboard').innerHTML = `<div class="view-tabs-bar">${this.buildViewTabsHtml()}</div><div id="view-body"></div>`;
    if (view === 'gantt') this.renderGantt('view-body');
    if (view === 'month') this.renderMonth('view-body');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  refreshAll() {
    this.renderSidebar();
    this.renderPage(this.currentPage);
  },

  renderPage(name) {
    switch (name) {
      case 'dashboard': this.renderDashboard(); break;
      case 'project':   this.renderProject();   break;
      case 'gantt':     this.renderGantt();     break;
      case 'month':     this.renderMonth();     break;
      case 'report':    this.renderReport();    break;
      case 'pdca':      this.renderPdca();      break;
      case 'settings':  this.renderSettings();  break;
    }
  },

  // ─── HELPERS ───
  getProj(id) { return DATA.projects.find(p => p.id === id); },
  getTasksOf(projId) { return DATA.tasks.filter(t => t.project === projId); },

  // ─── SIDEBAR ───
  renderSidebar() {
    const list = document.getElementById('projectList');
    list.innerHTML = DATA.projects.map(p => {
      const cnt = DATA.tasks.filter(t => t.project === p.id && t.status !== 'done' && !t._deleted).length;
      const isActive = this.currentPage === 'project' && this.currentProjectId === p.id;
      return `<button class="sb-proj ${isActive ? 'active' : ''}" onclick="App.openProject('${p.id}', this)">
        <span class="dot" style="background:${p.color}"></span>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;">${U.esc(p.name)}</span>
        ${p.synced ? '<span class="sync-ico">🔗</span>' : ''}
        <span class="count">${cnt}</span>
      </button>`;
    }).join('');

    // Update sync info display (僅 admin 顯示 WBS 同步徽章 + 頂部立即同步按鈕)
    const log = JSON.parse(localStorage.getItem(STORE.syncLog) || '{}');
    const syncInfo = document.getElementById('syncInfo');
    const topbarBtn = document.getElementById('topbarJSyncBtn');
    if (topbarBtn) topbarBtn.style.display = isAdmin() ? '' : 'none';
    if (isAdmin() && log.syncedAt) {
      const t = new Date(log.syncedAt);
      const today = D.isSameDay(t, new Date()) ? '今日' : D.fmt(t, 'md');
      document.getElementById('syncTime').textContent = `${today} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      syncInfo.style.display = '';
    } else {
      syncInfo.style.display = 'none';
    }
  },

  openProject(id, btn) {
    this.currentProjectId = id;
    this.showPage('project', btn);
  },
};

// ═══════════════════════════════════════════════════════
//  PAGE: DASHBOARD
// ═══════════════════════════════════════════════════════
App.buildViewTabsHtml = function() {
  return `
    <div class="tabs">
      <button class="tab-btn ${this.currentView === 'dashboard' ? 'active' : ''}" onclick="App.switchView('dashboard')">儀表板</button>
      <button class="tab-btn ${this.currentView === 'gantt' ? 'active' : ''}" onclick="App.switchView('gantt')">甘特圖</button>
      <button class="tab-btn ${this.currentView === 'month' ? 'active' : ''}" onclick="App.switchView('month')">月曆</button>
    </div>`;
};

App.buildReportTabsHtml = function() {
  return `
    <div class="tabs">
      <button class="tab-btn ${this.currentPage === 'report' ? 'active' : ''}" onclick="App.showPage('report')">專案週報</button>
      <button class="tab-btn ${this.currentPage === 'pdca' ? 'active' : ''}" onclick="App.showPage('pdca')">PDCA</button>
    </div>`;
};

App.renderDashboard = function() {
  // Week offset: 0 = 本週, -1 = 上週, +1 = 下週...
  if (typeof this.dashboardWeekOffset !== 'number') this.dashboardWeekOffset = 0;

  const today = D.today();
  const baseMonday = D.monday(today);
  const monday = D.addDays(baseMonday, this.dashboardWeekOffset * 7);
  const sunday = D.addDays(monday, 6);
  const wk = D.weekKey(monday);
  const wkNum = D.weekNum(monday);

  // ─── Filter: 顯示週的「前後兩週」內該做的事 ───
  // 以「顯示週的週中」為中心，前後兩週的視窗
  const centerDay = D.addDays(monday, 3); // 週四為中心
  const twoWeeksBefore = D.addDays(centerDay, -14);
  const twoWeeksAfter  = D.addDays(centerDay, +14);

  const inWindowTasks = DATA.tasks.filter(t => {
    if (t._deleted) return false;
    if (t.status === 'done' || t.status === 'hold') return false;
    const sch = getEffectiveSchedule(t);
    if (!sch.start && !sch.end) return true;
    const ts = sch.start ? new Date(sch.start) : (sch.end ? new Date(sch.end) : null);
    const te = sch.end   ? new Date(sch.end)   : (sch.start ? new Date(sch.start) : null);
    if (!ts || !te) return true;
    return te >= twoWeeksBefore && ts <= twoWeeksAfter;
  });

  const activeTasks = inWindowTasks;
  const wipTasks    = inWindowTasks.filter(t => t.status === 'wip');
  const urgentTasks = inWindowTasks.filter(t => {
    if (t.urgency === 'high') return true;
    const sch = getEffectiveSchedule(t);
    if (sch.end && D.daysBetween(today, new Date(sch.end)) <= 1) return true;
    return false;
  });

  const totalHours = (DATA.schedule.items || [])
    .filter(it => it.week === wk)
    .reduce((s, it) => s + (it.duration / 60), 0);
  const availableHours = DATA.settings.dailyHours * DATA.settings.workDays.length;

  // Week schedule (uses dashboardWeekOffset)
  const scheduleHtml = this.buildWeekScheduleHtml(monday);

  // Week label
  let weekLabelSuffix = '';
  if (this.dashboardWeekOffset === 0) weekLabelSuffix = '（本週）';
  else if (this.dashboardWeekOffset === -1) weekLabelSuffix = '（上週）';
  else if (this.dashboardWeekOffset === 1) weekLabelSuffix = '（下週）';
  else if (this.dashboardWeekOffset < 0) weekLabelSuffix = `（${-this.dashboardWeekOffset} 週前）`;
  else weekLabelSuffix = `（${this.dashboardWeekOffset} 週後）`;

  // Week selector dropdown (±8 weeks)
  const weekOpts = [];
  for (let off = -8; off <= 8; off++) {
    const m = D.addDays(baseMonday, off * 7);
    const e = D.addDays(m, 6);
    const num = D.weekNum(m);
    let suffix = '';
    if (off === -1) suffix = '（上週）';
    else if (off === 0) suffix = '（本週）';
    else if (off === 1) suffix = '（下週）';
    weekOpts.push(`<option value="${off}" ${off === this.dashboardWeekOffset ? 'selected' : ''}>W${num}  ${D.fmt(m, 'ymd')} – ${D.fmt(e, 'md')}${suffix}</option>`);
  }

  // Stats row
  const statsHtml = `<div class="stats-row">
    <div class="stat">
      <div class="stat-num">${activeTasks.length}</div>
      <div class="stat-label">兩週內任務</div>
    </div>
    <div class="stat">
      <div class="stat-num">${wipTasks.length}</div>
      <div class="stat-label">進行中</div>
    </div>
    <div class="stat stat-urgent" onclick="App.showUrgentModal()" title="點擊查看緊急任務">
      <div class="stat-num">${urgentTasks.length}</div>
      <div class="stat-label">緊急 ↗</div>
    </div>
    <div class="stat">
      <div class="stat-num">${Math.round(totalHours)}h</div>
      <div class="stat-label">${this.dashboardWeekOffset === 0 ? '本週' : 'W'+wkNum} 工時 / ${availableHours}h</div>
    </div>
  </div>`;

  // Memo board
  const memoHtml = `<div class="memo-board">
    <div class="memo-head">
      <div class="memo-title">便利貼</div>
      <button class="memo-add" data-edit onclick="App.addMemo()">＋ 新增</button>
    </div>
    <div class="memo-list" id="memoList">
      ${this.buildMemoListHtml()}
    </div>
  </div>`;

  document.getElementById('page-dashboard').innerHTML = `
    ${statsHtml}
    <div class="view-tabs-bar">${this.buildViewTabsHtml()}</div>
    <div class="dash-grid">
      <div>
        <div class="card" style="padding-bottom:14px;">
          <div class="card-head">
            <div class="card-title">時程表</div>
            <div class="week-nav-mini">
              <button class="rw-arrow" onclick="App.dashboardWeekShift(-1)" title="上一週">‹</button>
              <select class="rw-select-mini" onchange="App.dashboardWeekOffset = parseInt(this.value); App.renderDashboard();">
                ${weekOpts.join('')}
              </select>
              <button class="rw-arrow" onclick="App.dashboardWeekShift(1)" title="下一週">›</button>
              ${this.dashboardWeekOffset !== 0 ? `<button class="rw-arrow" onclick="App.dashboardWeekOffset=0; App.renderDashboard();" title="回到本週" style="background: var(--sage-50); color: var(--sage-700);">今</button>` : ''}
            </div>
          </div>
          ${scheduleHtml}
          <div class="legend-row">
            <span class="legend-item"><span class="legend-sw" style="background:var(--sage-500)"></span>深度工作</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--amber)"></span>雜事零碎</span>
            <span class="legend-item"><span class="legend-sw" style="background:#4A6B85"></span>📅 會議</span>
            <span class="legend-item"><span class="legend-sw" style="background:#8B7355"></span>🧹 打掃</span>
            <span class="legend-item"><span style="color:var(--terracotta);">⚠</span> 延遲</span>
            <span class="legend-item"><span style="color:var(--sage-600);">🔗</span> 同步</span>
            <span style="margin-left:auto; font-size:10.5px;">⋮⋮ 拖曳調整 · 🔒 已鎖定</span>
          </div>
          <details class="sched-rules">
            <summary>📊 排序規則：任務優先序怎麼算？</summary>
            <div class="sched-rules-body">
              <p class="sr-sink">⬇ <b>已完成 / 擱置：強制壓到最底</b> — 完成（−9999）與擱置（−9000）會被直接壓到最底，<b>無論其他條件如何都不參與本週搶時段</b>（這條的絕對影響最大）。</p>
              <p class="sr-intro">其餘未完成任務，系統會累加分數，分數高的排在前面、優先佔用本週時段：</p>
              <ul>
                <li>⏰ <b>deadline 逼近度</b>：已逾期 +500 起（每超時 1 天再 +10）· 剩 1 天內 +400 · 3 天內 +250 · 7 天內 +120 · 14 天內 +50；沒有預計完成日 −20</li>
                <li>🔴 <b>緊急程度</b>：緊急 +300 · 普通 +100 · 不急 +0</li>
                <li>▶ <b>進行中加分</b>：狀態為「進行中」+80</li>
                <li>🔗 <b>同步任務微加分</b>：來自 ${CFG('WBS_LABEL', 'WBS')}同步 +5</li>
              </ul>
              <p class="sr-note">附註：分數只決定「誰先排」，不決定「排幾小時」——實際排程時數另看任務的預計工時（estHours）。</p>
            </div>
          </details>
          ${this.buildNextWeekTodoHtml()}
        </div>
      </div>
      ${memoHtml}
    </div>
  `;
  this.attachMemoDrag();
};

App.dashboardWeekShift = function(delta) {
  this.dashboardWeekOffset = (this.dashboardWeekOffset || 0) + delta;
  this.renderDashboard();
};

App.buildWeekScheduleHtml = function(targetMonday) {
  const monday = targetMonday || D.monday();
  const wk = D.weekKey(monday);
  const today = D.today();
  const wd = ['一','二','三','四','五'];

  // Header
  let html = '<div class="week-schedule"><div></div>';
  for (let i = 0; i < 5; i++) {
    const d = D.addDays(monday, i);
    const isToday = D.isSameDay(d, today);
    html += `<div class="ws-day-header ${isToday ? 'today' : ''}">
      <span class="date">${d.getDate()}</span>週${wd[i]}
    </div>`;
  }

  // Rows: 09 10 11 12 14 15 16 17
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const items = (DATA.schedule.items || []).filter(it => it.week === wk);
  // Legacy DATA.meetings
  const meetings = DATA.meetings.filter(m => {
    if (!m.date) return false;
    const md = new Date(m.date);
    return D.daysBetween(monday, md) >= 0 && D.daysBetween(monday, md) <= 6;
  });
  // New: recurring + special meetings from settings
  const recurring = (DATA.settings.recurringMeetings || []).filter(m => m.enabled !== false);
  const special = (DATA.settings.specialMeetings || []);

  // Helper: 把 frequency 轉成中文標籤
  function freqLabel(f) {
    return ({ once: '單次', daily: '每天', weekly: '每週', biweekly: '隔週(一天)', triweekly: '隔兩週(一天)', 'biweekly-allday': '隔週整週每天', 'triweekly-allday': '隔兩週整週每天' })[f] || '每週';
  }

  // Build a lookup: for each (date, hour) → which meeting?
  // 優先順序：會議 > 打掃（同格衝突時會議優先；若會議完整覆蓋打掃 → 打掃跳過）
  function findMeetingAt(dateIso, hr) {
    // 排序：meeting > cleaning（讓會議優先）
    const sortedRecurring = [...recurring].sort((a, b) => {
      const aRank = a.category === 'cleaning' ? 1 : 0;
      const bRank = b.category === 'cleaning' ? 1 : 0;
      return aRank - bRank;
    });

    // 先找出當天所有 occurring events，再判斷哪個放在這個 hr slot
    const occurringEvents = [];
    for (const m of sortedRecurring) {
      if (!eventOccursOnDate(m, dateIso)) continue;
      const [sh, sm] = m.start.split(':').map(Number);
      const [eh, em] = m.end.split(':').map(Number);
      occurringEvents.push({
        ...m,
        mStart: sh * 60 + sm,
        mEnd: eh * 60 + em,
      });
    }
    // Special meetings (one-off date)
    for (const m of special) {
      if (m.date !== dateIso) continue;
      const [sh, sm] = m.start.split(':').map(Number);
      const [eh, em] = m.end.split(':').map(Number);
      occurringEvents.push({
        ...m,
        category: m.category || 'meeting',
        mStart: sh * 60 + sm,
        mEnd: eh * 60 + em,
        isSpecial: true,
      });
    }

    // 標記：如果掃地完全被會議覆蓋 → 跳過
    const meetingsOnly = occurringEvents.filter(e => e.category === 'meeting');
    const filtered = occurringEvents.filter(e => {
      if (e.category !== 'cleaning') return true;
      // 完全被某個會議覆蓋？
      const covered = meetingsOnly.some(m => m.mStart <= e.mStart && m.mEnd >= e.mEnd);
      return !covered;
    });

    // 找出與當前 slot (hr) 重疊的事件
    const slotStart = hr * 60;
    const slotEnd = slotStart + 60;
    for (const ev of filtered) {
      if (slotStart < ev.mEnd && slotEnd > ev.mStart) {
        // 找出 hours 陣列中所有與此事件重疊的時段
        const overlappingHrs = hours.filter(h => {
          const hStart = h * 60;
          const hEnd = hStart + 60;
          return hStart < ev.mEnd && hEnd > ev.mStart;
        });
        const firstOverlappingHr = overlappingHrs[0];
        const isFirstSlot = hr === firstOverlappingHr;
        let spanHours = 1;
        if (isFirstSlot) {
          const startIdx = hours.indexOf(firstOverlappingHr);
          for (let i = startIdx + 1; i < hours.length; i++) {
            if (overlappingHrs.includes(hours[i])) spanHours++;
            else break;
          }
        }
        return {
          title: ev.title,
          start: ev.start,
          end: ev.end,
          category: ev.category || 'meeting',
          frequency: ev.frequency || 'weekly',
          type: ev.isSpecial ? 'special' : 'recurring',
          isFirstSlot,
          spanHours,
        };
      }
    }
    return null;
  }

  for (const hr of hours) {
    for (const mm of [0, 30]) {
    // 午休：12:00 改成「時間欄(靠上) + 橫貫五天的單一午休帶」，12:30 子列整列跳過
    if (hr === 12) {
      if (mm === 0) {
        html += `<div class="ws-time-col ws-time-lunch">12:00</div>`;
        html += `<div class="ws-lunch-band">☕ 午休時間</div>`;
      }
      continue;
    }
    const half = mm === 0 ? '00' : '30';
    html += `<div class="ws-time-col">${String(hr).padStart(2,'0')}:${half}</div>`;
    for (let i = 0; i < 5; i++) {
      const d = D.addDays(monday, i);
      const dateIso = D.fmt(d, 'iso');
      const hrStr = `${String(hr).padStart(2,'0')}:${half}`;

      // Find items at this slot
      const item = items.find(it => it.date === dateIso && it.start === hrStr);
      const meeting = mm === 0 ? meetings.find(m => {
        if (m.date !== dateIso) return false;
        const [mh] = (m.startTime || '').split(':').map(Number);
        return mh === hr;
      }) : null;
      const meetingAuto = mm === 0 ? findMeetingAt(dateIso, hr) : null;

      // Cell is drop target
      html += `<div class="ws-cell" data-date="${dateIso}" data-start="${hrStr}" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="App.handleScheduleDrop(event, '${dateIso}', '${hrStr}')">`;
      if (item) {
        const task = DATA.tasks.find(t => t.id === item.taskId);
        if (task) {
          const cat = task.taskType === 'milestone' ? 'milestone' : (task.category || 'deep');  // M2-T3：milestone 優先於 category，修 WBS 里程碑週卡片誤披會議藍
          const proj = App.getProj(task.project);
          const projName = proj ? proj.name : '';
          const projColor = (proj && proj.color) ? proj.color : '#3a3a3a';
          const today = D.today();
          const sch = getEffectiveSchedule(task);
          const isOverdue = sch.end && new Date(sch.end) < today && task.status !== 'done';
          // Tooltip
          const tipParts = [projName ? `${projName}｜${task.name}` : task.name];
          if (task.syncRef) tipParts.push(`🔗 ${task.syncRef}`);
          const total = item.totalHours || task.estHours || 0;
          tipParts.push(`預估總工時：${total} h`);
          if (total > 6) {
            // 用每日 6h 計算 → 需要幾個工作天
            const days = Math.ceil(total / 6);
            const weeks = Math.ceil(days / 5);
            tipParts.push(`預估需要：${days} 個工作天 (約 ${weeks} 週)`);
          }
          tipParts.push(`本週已排：${(item.duration/60).toFixed(1)} h（僅提醒用，實際時間請自行安排）`);
          if (sch.start) tipParts.push(`預計開始：${D.fmt(sch.start, 'ymdShort')}`);
          if (sch.end) tipParts.push(`預計完成：${D.fmt(sch.end, 'ymdShort')}`);
          if (isOverdue) tipParts.push(`⚠ 已逾期 ${-D.daysBetween(today, new Date(sch.end))} 天`);
          if (item.completed) tipParts.push(`✓ 已完成`);
          if (task.owner) tipParts.push(`擔當：${task.owner}`);
          if (task.note) tipParts.push(`備註：${task.note}`);
          const tipText = tipParts.join('\n');

          // 卡片跨格：halfCells = duration/30，套用會議已驗證的高度公式（1h→52, 2h→108, 3h→164）
          const halfCells = Math.max(2, Math.round((item.duration || 60) / 30));
          const cardH = halfCells * 24 + (halfCells - 1) * 4;

          html += `<div class="ws-event ws-ev-task ${cat} ${item.locked ? 'locked' : ''} ${isOverdue ? 'overdue' : ''} ${item.completed ? 'completed' : ''}"
            style="top:0;height:${cardH}px;"
            ${item.completed ? '' : 'draggable="true"'}
            data-task-id="${task.id}"
            data-from-date="${dateIso}"
            data-from-start="${hrStr}"
            ${item.completed ? '' : 'ondragstart="App.handleScheduleDragStart(event)" ondragend="event.target.classList.remove(\'dragging\')"'}
            ondblclick="App.openTaskInProject('${task.id}')"
            title="${U.esc(tipText)}&#10;━━━━━━━━━━━━━━&#10;💡 雙擊跳到專案頁編輯">
            ${item.completed ? '<span class="done-badge">✓</span>' : item.locked ? '<span class="lock-ico">🔒</span>' : ''}
            ${isOverdue && !item.completed ? '<span class="overdue-badge">⚠</span>' : ''}
            ${task.synced ? '<span class="sync-badge">🔗</span>' : ''}
            <div class="ws-ev-line">${projName ? `<span class="ws-ev-proj" style="color:${projColor}">${U.esc(projName)}</span> ` : ''}<b>${U.esc(task.name)}</b></div>
          </div>`;
        }
      } else if (meeting) {
        html += `<div class="ws-event meeting" style="top:0;height:52px;" title="${U.esc(meeting.title)}">
          <b>${U.esc(meeting.title).slice(0, 14)}</b>
          <div class="ev-meta">${meeting.startTime || ''}</div>
        </div>`;
      } else if (meetingAuto) {
        // Show recurring / special meeting (auto-blocked)
        // Merged cell effect: only render on isFirstSlot with extended height
        if (meetingAuto.isFirstSlot) {
          const tip = `${meetingAuto.title}\n${meetingAuto.start}–${meetingAuto.end}\n${meetingAuto.category === 'cleaning' ? '🧹 打掃' : '📅 會議'}（${freqLabel(meetingAuto.frequency)}）`;
          const spanHr = meetingAuto.spanHours || 1;
          // 半小時格：1 小時 = 2 格（每格 24px + row-gap 4px）
          const halfCells = spanHr * 2;
          const cellHeight = halfCells * 24 + (halfCells - 1) * 4;
          const cssClass = meetingAuto.category === 'cleaning' ? 'cleaning' : 'auto-meeting';
          const icon = meetingAuto.category === 'cleaning' ? '🧹' : '📅';
          // z-index 1：低於任務（防止視覺覆蓋其他列的任務）
          html += `<div class="ws-event meeting ${cssClass}" style="top:0; height:${cellHeight}px; z-index:1;" title="${U.esc(tip)}">
            <b>${icon} ${U.esc(meetingAuto.title).slice(0, 16)}</b>
            <div class="ev-meta">${meetingAuto.start}–${meetingAuto.end}</div>
          </div>`;
        }
        // If not first slot → render nothing (the merged cell from firstSlot covers this)
      }
      html += '</div>';
    }
    }
  }
  html += '</div>';
  return html;
};

// ─── DRAG & DROP HANDLERS ───
App.handleScheduleDragStart = function(e) {
  const target = e.target.closest('.ws-event');
  if (!target) return;
  target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('taskId', target.dataset.taskId);
  e.dataTransfer.setData('fromDate', target.dataset.fromDate);
  e.dataTransfer.setData('fromStart', target.dataset.fromStart);
};

App.handleScheduleDrop = function(e, toDate, toStart) {
  e.preventDefault();
  const cell = e.currentTarget;
  cell.classList.remove('drag-over');
  const taskId = e.dataTransfer.getData('taskId');
  const fromDate = e.dataTransfer.getData('fromDate');
  const fromStart = e.dataTransfer.getData('fromStart');
  if (!taskId) return;

  // 若目標 cell 已有任務 → 互換
  const items = DATA.schedule.items || [];
  const draggedIdx = items.findIndex(it => it.taskId === taskId && it.date === fromDate && it.start === fromStart);
  const targetIdx = items.findIndex(it => it.date === toDate && it.start === toStart);

  if (draggedIdx === -1) return;

  if (targetIdx !== -1 && draggedIdx !== targetIdx) {
    // 互換位置
    const a = items[draggedIdx];
    const b = items[targetIdx];
    a.date = toDate; a.start = toStart;
    b.date = fromDate; b.start = fromStart;
    a.locked = true; b.locked = true;
  } else {
    // 移到空格
    items[draggedIdx].date = toDate;
    items[draggedIdx].start = toStart;
    items[draggedIdx].locked = true; // 手動移動後鎖定
  }
  Storage.save();
  this.renderDashboard();
  U.toast('✓ 已調整並鎖定');
};

// 【需求 A】釘選 / 取消釘選「本週」：只動 DATA.settings.pinnedWeekTaskIds（不碰 task、不碰 J 同步）
App.pinTaskToWeek = function(taskId) {
  if (!taskId) return;
  const s = DATA.settings;
  if (!Array.isArray(s.pinnedWeekTaskIds)) s.pinnedWeekTaskIds = [];
  if (!s.pinnedWeekTaskIds.includes(taskId)) s.pinnedWeekTaskIds.push(taskId);
  Storage.save();
  generateSchedule();      // 重排：釘選的 task 經篩選守門（需求 A 第二塊）後會被納入本週
  this.renderDashboard();
  U.toast('📌 已釘選到本週');
};

App.unpinTaskFromWeek = function(taskId) {
  if (!taskId) return;
  const s = DATA.settings;
  s.pinnedWeekTaskIds = (s.pinnedWeekTaskIds || []).filter(id => id !== taskId);
  Storage.save();
  generateSchedule();
  this.renderDashboard();
  U.toast('已取消釘選');
};

// 【需求 A】下週待辦：分專案顯示，一週內 top5+捲軸；更遠的另開摺疊；最後已釘選清單
App.buildNextWeekTodoHtml = function() {
  const sunday = D.addDays(D.monday(), 6);             // 本週日（沿用現法，不碰日期函式本體）
  const weekAfter = D.addDays(sunday, 7);              // 一週內上界：sunday < plannedStart <= sunday+7
  const pinnedIds = DATA.settings.pinnedWeekTaskIds || [];
  const projName = id => { const p = DATA.projects.find(x => x.id === id); return p ? p.name : ''; };

  // 基礎候選：未刪除·非done/hold·未釘選·預計開始日在本週之後（與守門條件對齊）
  const base = DATA.tasks.filter(t => !t._deleted && t.status !== 'done' && t.status !== 'hold'
    && t.plannedStart && new Date(t.plannedStart) > sunday
    && !pinnedIds.includes(t.id));
  const inWeek = t => new Date(t.plannedStart) <= weekAfter;

  // 依現有專案清單順序分組，組內 scoreTask 降冪（只呼叫，不改）
  const groupBy = pred => DATA.projects.map(p => ({
    proj: p,
    tasks: base.filter(t => t.project === p.id && pred(t)).sort((a, b) => scoreTask(b) - scoreTask(a)),
  })).filter(g => g.tasks.length > 0);
  const weekGroups = groupBy(inWeek);
  const farGroups  = groupBy(t => !inWeek(t));

  const rowOf = t => `
    <div class="nwt-row">
      <span class="nwt-name">${U.esc(t.name)}</span>
      <span class="nwt-date">${D.fmt(t.plannedStart, 'ymdShort')}</span>
      <button class="nwt-pin" data-edit onclick="App.pinTaskToWeek('${t.id}')">📌 釘選本週</button>
    </div>`;

  // 一週內：每專案 top5 常駐 + 其餘收進捲軸
  const weekBlock = weekGroups.map(g => {
    const top = g.tasks.slice(0, 5), rest = g.tasks.slice(5);
    const restHtml = rest.length ? `
      <details class="nwt-more">
        <summary>展開其餘 ${rest.length} 項</summary>
        <div class="nwt-scroll">${rest.map(rowOf).join('')}</div>
      </details>` : '';
    return `<div class="nwt-proj-group">
      <div class="nwt-proj-title">${U.esc(g.proj.name)} <span class="nwt-proj-count">${g.tasks.length} 項</span></div>
      ${top.map(rowOf).join('')}
      ${restHtml}
    </div>`;
  }).join('') || '<div class="nwt-empty">本週無一週內的待辦</div>';

  // 更遠（> 一週）：分專案、scoreTask 降冪、整塊預設收合
  const farCount = farGroups.reduce((n, g) => n + g.tasks.length, 0);
  const farBlock = farCount ? `
    <details class="nwt-far">
      <summary>📦 更遠的待辦（${farCount} 項，預計開始日 ${D.fmt(D.addDays(weekAfter, 1), 'md')} 以後）</summary>
      <div class="nwt-far-body">${farGroups.map(g => `
        <div class="nwt-proj-group">
          <div class="nwt-proj-title">${U.esc(g.proj.name)} <span class="nwt-proj-count">${g.tasks.length} 項</span></div>
          <div class="nwt-scroll">${g.tasks.map(rowOf).join('')}</div>
        </div>`).join('')}</div>
    </details>` : '';

  // 已釘選清單（維持現狀，保留每列專案名）
  const pinned = DATA.tasks.filter(t => !t._deleted && pinnedIds.includes(t.id));
  const pinnedBlock = pinned.length ? `
    <div class="nwt-subtitle">📌 已釘選本週（${pinned.length}）</div>
    ${pinned.map(t => `
    <div class="nwt-row nwt-pinned">
      <span class="nwt-name">${U.esc(t.name)}</span>
      <span class="nwt-proj">${U.esc(projName(t.project))}</span>
      <span class="nwt-date">${t.plannedStart ? D.fmt(t.plannedStart, 'ymdShort') : '—'}</span>
      <button class="nwt-unpin" data-edit onclick="App.unpinTaskFromWeek('${t.id}')">取消釘選</button>
    </div>`).join('')}` : '';

  return `<div class="next-week-todo">
    <div class="nwt-head">📅 下週待辦 <span class="nwt-hint">（一週內 ${D.fmt(D.addDays(sunday, 1), 'md')}–${D.fmt(weekAfter, 'md')}）</span></div>
    ${weekBlock}
    ${farBlock}
    ${pinnedBlock}
  </div>`;
};

App.buildMemoListHtml = function() {
  if (DATA.memos.length === 0) {
    return '<div style="text-align:center; padding:60px 20px; color:var(--ink3); font-size:13px;">尚無便利貼<br><span style="font-size:11px;">點右上「＋ 新增」加一張</span></div>';
  }
  return DATA.memos.map(m => `
    <div class="memo" style="background:var(--${m.color}); top:${m.x}px; left:${m.y}px; transform:rotate(${m.rotate}deg);" data-id="${m.id}"
         ondblclick="App.editMemo('${m.id}')"
         title="拖曳移動 · 雙擊編輯">
      <button class="memo-del" data-edit onclick="App.deleteMemo('${m.id}')">×</button>
      ${U.esc(m.text)}
      <div class="memo-author">${m.date}</div>
    </div>
  `).join('');
};

App.attachMemoDrag = function() {
  if (document.body.classList.contains('viewonly')) return;
  let dragMemo = null, offsetX = 0, offsetY = 0;
  document.querySelectorAll('.memo').forEach(m => {
    m.addEventListener('mousedown', e => {
      if (e.target.classList.contains('memo-del')) return;
      dragMemo = m;
      const rect = m.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      m.style.cursor = 'grabbing';
      m.style.zIndex = 10;
    });
  });
  document.addEventListener('mousemove', e => {
    if (!dragMemo) return;
    const parent = dragMemo.parentElement.getBoundingClientRect();
    const x = e.clientX - parent.left - offsetX;
    const y = e.clientY - parent.top - offsetY;
    const ny = Math.max(0, Math.min(x, parent.width - dragMemo.offsetWidth));
    const nx = Math.max(0, Math.min(y, parent.height - dragMemo.offsetHeight));
    dragMemo.style.left = ny + 'px';
    dragMemo.style.top = nx + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (dragMemo) {
      const id = dragMemo.dataset.id;
      const memo = DATA.memos.find(m => m.id === id);
      if (memo) {
        memo.x = parseInt(dragMemo.style.top);
        memo.y = parseInt(dragMemo.style.left);
        Storage.save();
      }
      dragMemo.style.cursor = 'grab';
      dragMemo.style.zIndex = '';
      dragMemo = null;
    }
  });
};

App.addMemo = function() {
  const text = prompt('便利貼內容：');
  if (!text) return;
  const memo = {
    id: U.id(),
    text: text.slice(0, 80),
    color: MEMO_COLORS[Math.floor(Math.random() * MEMO_COLORS.length)],
    x: 10 + Math.floor(Math.random() * 100),
    y: 10 + Math.floor(Math.random() * 50),
    rotate: -4 + Math.floor(Math.random() * 9),
    date: D.fmt(new Date(), 'md'),
  };
  DATA.memos.push(memo);
  Storage.save();
  this.renderDashboard();
  U.toast('✓ 便利貼已加入');
};

App.editMemo = function(id) {
  const memo = DATA.memos.find(m => m.id === id);
  if (!memo) return;
  const newText = prompt('編輯便利貼內容：', memo.text);
  if (newText === null) return; // cancelled
  const trimmed = newText.trim();
  if (!trimmed) {
    if (confirm('內容為空，刪除這張便利貼？')) {
      DATA.memos = DATA.memos.filter(m => m.id !== id);
      Storage.save();
      this.renderDashboard();
      U.toast('✓ 已刪除');
    }
    return;
  }
  memo.text = trimmed.slice(0, 200);
  Storage.save();
  this.renderDashboard();
  U.toast('✓ 已更新');
};

App.deleteMemo = function(id) {
  if (!confirm('刪除這張便利貼？')) return;
  DATA.memos = DATA.memos.filter(m => m.id !== id);
  Storage.save();
  this.renderDashboard();
};

App.showUrgentModal = function() {
  const urgent = DATA.tasks
    .filter(t => t.status !== 'done' && t.status !== 'hold')
    .filter(t => {
      const sch = getEffectiveSchedule(t);
      return t.urgency === 'high' || (sch.end && D.daysBetween(D.today(), new Date(sch.end)) <= 1);
    });

  const sorted = sortTasks(urgent);
  const body = sorted.length === 0 ?
    '<div style="text-align:center; padding:32px 0; color:var(--ink3);">目前沒有緊急任務 🎉</div>' :
    sorted.map(t => {
      const sch = getEffectiveSchedule(t);
      const proj = this.getProj(t.project);
      let dlText = '無 deadline';
      if (sch.end) {
        const days = D.daysBetween(D.today(), new Date(sch.end));
        dlText = days < 0 ? `逾期 ${-days} 天` : days === 0 ? '今天截止' : days === 1 ? '明天截止' : `${days} 天後`;
      }
      return `<div class="urgent-row" onclick="App.openTaskModal('${t.id}'); App.closeModal();">
        <span class="u-proj">${U.esc(proj?.name || '其他')}</span>
        <span class="u-name">${U.esc(t.name)}</span>
        <span class="u-deadline">${dlText}</span>
      </div>`;
    }).join('');

  this.openModal({
    title: `🚨 緊急任務 (${urgent.length} 項)`,
    body,
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>',
  });
};

// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT
// ═══════════════════════════════════════════════════════
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

  const allTasks = this.getTasksOf(proj.id);
  const today = D.today();
  // 排序：延遲 > 進行中 > 未開始（同類依日期）
  const activeTasks = allTasks.filter(t => t.status !== 'done' && !t._deleted).sort((a, b) => {
    const aSch = getEffectiveSchedule(a);
    const bSch = getEffectiveSchedule(b);
    const overdueA = aSch.end && new Date(aSch.end) < today ? 0 : 1;
    const overdueB = bSch.end && new Date(bSch.end) < today ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    const statusOrder = { wip: 0, pending: 1, hold: 2 };
    const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (so !== 0) return so;
    return (aSch.end || '9999').localeCompare(bSch.end || '9999');
  });
  const doneTasks = allTasks.filter(t => t.status === 'done' && !t._deleted).sort((a,b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  const deletedTasks = allTasks.filter(t => t._deleted).sort((a, b) => (b._deletedAt || '').localeCompare(a._deletedAt || ''));

  // 預設只顯示 15 筆 active tasks（超過時可展開）
  const PREVIEW_LIMIT = 15;
  this._projectExpanded = this._projectExpanded || {};
  const isExpanded = !!this._projectExpanded[proj.id];
  const showAll = isExpanded || activeTasks.length <= PREVIEW_LIMIT;
  const visibleActive = showAll ? activeTasks : activeTasks.slice(0, PREVIEW_LIMIT);

  const tasks = allTasks; // for backward compat below

  const html = `
    <div class="proj-header">
      <div class="proj-color" style="background:${proj.color}"></div>
      <div style="flex:1; min-width:0;">
        <div class="proj-name">
          ${U.esc(proj.name)}
          ${proj.synced ? '<span class="proj-sync-badge">🔗 從 Google Sheet 同步</span>' : ''}
        </div>
      </div>
      ${proj.synced ? `<button class="tb-action ghost" data-edit onclick="Sync.syncJSeries()">↻ 立即同步</button>` : ''}
      ${!proj.synced ? `<button class="tb-action ghost" data-edit onclick="App.editProject('${proj.id}')">編輯專案</button>` : ''}
    </div>

    ${this.buildProjKpiHtml(proj)}

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
            <span class="tlc-count">${activeTasks.length}</span>
            <span style="font-size:11px; color:var(--ink3); margin-left:auto;">延遲 → 進行中 → 未開始</span>
            <button class="tb-action" data-edit onclick="App.openNewTaskDialog('${proj.id}')" style="margin-left:10px;">＋ 新增任務</button>
          </div>
          <div id="activeTaskList">
            ${visibleActive.length === 0 ?
              '<div class="empty-task-list"><div class="empty-task-list-icon">📝</div>尚無待辦任務</div>' :
              visibleActive.map(t => this.buildTaskRowHtml(t)).join('')
            }
          </div>
          ${!showAll ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              展開全部（還有 ${activeTasks.length - PREVIEW_LIMIT} 筆）▼
            </button>
          </div>` : (isExpanded && activeTasks.length > PREVIEW_LIMIT ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              收起（只顯示前 ${PREVIEW_LIMIT} 筆）▲
            </button>
          </div>` : '')}
          <div class="list-foot">
            <input id="quickAddTask" placeholder="＋ 快速新增任務（按 Enter 完成）" data-edit
                   onkeydown="if(event.key==='Enter') App.quickAddTask('${proj.id}', this)">
            <button data-edit onclick="App.quickAddTask('${proj.id}', document.getElementById('quickAddTask'))">新增</button>
          </div>
        </div>

        ${doneTasks.length > 0 ? `
        <div class="done-section collapsed" id="doneSection">
          <div class="done-head" onclick="document.getElementById('doneSection').classList.toggle('collapsed')">
            <span class="done-head-title">已完成</span>
            <span class="done-head-count">${doneTasks.length}</span>
            <span class="done-head-chevron">▼</span>
          </div>
          <div class="done-list">
            ${doneTasks.map(t => this.buildTaskRowHtml(t)).join('')}
          </div>
          <div class="done-clear-tip">
            💡 完成超過 ${DATA.settings.doneRetentionDays} 天的任務會自動清除
          </div>
        </div>` : ''}

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
  document.getElementById('page-project').innerHTML = html;
};

// 顯示用任務進度(Dashboard 口徑,KPI OVERALL 與階段進度卡共用,改必同步兩處呼叫端):
// 有 progress 數值 → 夾 0~100 用之;無數值 → 狀態折算(done=100、其餘=0),保守不灌水。
function taskDisplayProgress(t) {
  if (typeof t.progress === 'number') return Math.max(0, Math.min(100, t.progress));
  return t.status === 'done' ? 100 : 0;
}

// ─── 專案 KPI 卡片排(圖1 第一塊):純顯示層,讀引擎不寫回 ───
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
  // ⚠ 已知核心 bug:getEffectiveSchedule 漏讀手動任務 t.start/t.end → 手動任務 end 恆空、可能漏報(待核心修正)。
  let delayed = 0, noEnd = 0;
  tasks.forEach(t => {
    if (t.status === 'done' || t.status === 'hold') return;
    const end = getEffectiveSchedule(t).end;
    if (!end) { noEnd++; return; }
    if (new Date(end) < today) delayed++;
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
  const card = (label, value, sub, dataTip, warn, stack) => `
    <div class="stat${warn ? ' kpi-warn' : ''}${stack && sub ? ' kpi-stack' : ''}"${dataTip ? ` data-tip="${U.esc(dataTip)}"` : ''}>
      <div class="stat-num">${value}</div>
      <div class="stat-label">${label}${sub && !stack ? ` <span class="stat-pct">${sub}</span>` : ''}</div>
      ${stack && sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;

  return `<div class="stats-row proj-kpi">
    ${card('TASKS', total, '',
      '任務總數|這個專案的所有工作項目數(不含已刪除)')}
    ${card('DONE', done, donePct === null ? '—' : donePct + '%',
      '完成件數|已完成的工作項目數|完成% = 已完成 ÷ 任務總數', false, true)}
    ${card('IN-PROGRESS', wip, '',
      '進行中|正在進行、還沒完成的項目數')}
    ${card('DELAYED', delayed, noEnd > 0 ? `另${noEnd}件無日期` : '',
      '延遲件數|已過結束日但還沒完成的項目數|(暫停的不算;沒設日期的另計)',
      delayed > 0)}
    ${card('OVERALL', overall === null ? '—' : overall + '%', '',
      '整體完成度|所有項目的平均完成度,每項等重、不看工時')}
    ${card('WORKDAYS LEFT', wdLeft === null ? '—' : wdLeft,
      wdLeft === null ? '未設定' : (overdueWd > 0 ? `已逾期${overdueWd}工作日` : `至${endDate}`),
      '剩餘工作天|到專案結束日還剩幾個上班日(不含週末假日)',
      overdueWd > 0)}
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

  // 膠囊標題：前端寫死顯示文字（純顯示層，不存後端）；分組鍵來自計算層 group
  const GROUP_TITLE = { main: '2.9 ~ 7.3 kW', alt: '2.2 kW（另案）' };

  const rowHtml = (st) => {
    const ts = tasks.filter(t => stageOf(t) === st.name);
    const pct = ts.length > 0
      ? Math.round(ts.reduce((s, t) => s + taskDisplayProgress(t), 0) / ts.length)
      : null;
    const tier = pct === null ? 's0' : (pct >= 100 ? 's100' : (pct >= 50 ? 's50' : (pct > 0 ? 's1' : 's0')));
    const dateStr = rangeStr(st.earliestStart, st.latestEnd);
    const dateCls = (st.earliestStart || st.latestEnd) ? '' : ' stage-date-empty';
    return `<div class="stage-row" data-tip="${U.esc('階段完成度|完成%=該階段任務進度平均(件數等權);件數=已完成/總數;日期=最早開始～最晚結束')}">
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

  // 動態分組：計算層回傳幾組就畫幾組（無 alt 桶 → 只畫 main，連膠囊都不出）
  const groupOrder = ['main', 'alt'];
  const blocks = groupOrder.map(gk => {
    const gs = stages.filter(st => st.group === gk);
    if (gs.length === 0) return '';
    const onlyMain = stages.every(st => st.group === 'main');
    // 只有 main 一組時不畫膠囊標題（退化成單組樣式）
    const cap = onlyMain ? '' :
      `<div class="stage-group-cap"><span class="stage-cap-pill cap-${gk}">${GROUP_TITLE[gk]}</span><span class="stage-cap-rule"></span></div>`;
    return cap + colHead + gs.map(rowHtml).join('');
  }).join('');

  return `<div class="proj-stages-card">
    <div class="proj-stages-head">階段進度 <span class="proj-stages-count">${stages.length} 個階段</span></div>
    ${blocks}
    <div class="proj-stages-formula">完成% = 該階段任務進度平均(件數等權;無進度值以狀態折算:完成=100、其餘=0) · 件數 = 已完成 / 總數 · 日期 = 最早開始 ～ 最晚結束</div>
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
    if (t.status !== 'hold') {
      const end = getEffectiveSchedule(t).end;
      if (end && new Date(end) < today) { g.delayed++; return; }
    }
    if (t.status === 'wip') g.wip++;
    else { g.todo++; if (t.status === 'hold') g.hold++; }
  });

  // 排序:總件數降冪;「未指派」固定最後(無寫死順序名單)
  const entries = Object.entries(groups).sort((a, b) =>
    ((a[0] === '未指派') - (b[0] === '未指派')) || (b[1].total - a[1].total));

  const rows = entries.map(([name, g]) => {
    const seg = (n, cls) => n > 0 ? `<div class="dept-seg ${cls}" style="width:${(n / g.total * 100).toFixed(1)}%"></div>` : '';
    return `<div class="dept-row" data-tip="${U.esc('部門負荷|依負責部門分組,看每個部門手上的工作量與進度')}">
      <div class="dept-name">${U.esc(name)}</div>
      <div class="dept-bar">${seg(g.done, 'done')}${seg(g.delayed, 'delayed')}${seg(g.wip, 'wip')}${seg(g.todo, 'todo')}</div>
      <div class="dept-cnt">${g.total} 件</div>
    </div>`;
  }).join('');

  // 逾期迷你清單:口徑同上方 delayed(非hold、有效迄日<today、非done),前5筆逾期天數降冪
  const overdue = tasks.filter(t => {
    if (t.status === 'done' || t.status === 'hold') return false;
    const end = getEffectiveSchedule(t).end;
    return end && new Date(end) < today;
  }).map(t => ({ t, days: -D.daysBetween(today, new Date(getEffectiveSchedule(t).end)) }))
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
    ${rows}
    <div class="proj-stages-formula">依${mode}分組(動態去重,依欄位原值、不拆多人);延遲口徑同 KPI DELAYED(不含擱置、無日期歸待辦);待辦=未開始+擱置</div>
    ${overdueHtml}
  </div>`;
};

App.toggleProjectExpanded = function(projId) {
  this._projectExpanded = this._projectExpanded || {};
  this._projectExpanded[projId] = !this._projectExpanded[projId];
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
  if (!confirm('永久刪除？此操作無法復原')) return;
  DATA.tasks = DATA.tasks.filter(t => t.id !== id);
  // 清掉 schedule 殘留
  if (DATA.schedule && DATA.schedule.items) {
    DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
  }
  Storage.save();
  this.refreshAll();
  U.toast('🗑 已永久刪除');
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

App.buildTaskRowHtml = function(t) {
  const sch = getEffectiveSchedule(t);
  const cat = t.taskType === 'milestone' ? 'milestone' : (t.category || 'deep');  // M2-T3：milestone 優先於 category，修 WBS 里程碑誤顯「會議」tag
  const isPreview = !DATA.settings.previewWeeks ? false : (
    sch.end && D.daysBetween(D.today(), new Date(sch.end)) > 7 && D.daysBetween(D.today(), new Date(sch.end)) <= (DATA.settings.previewWeeks * 7)
  );
  let dlText = '—';
  let dlClass = '';
  if (sch.end) {
    const days = D.daysBetween(D.today(), new Date(sch.end));
    if (days < 0)      { dlText = `逾期 ${-days} 天`; dlClass = 'overdue'; }
    else if (days === 0) { dlText = '今日'; dlClass = 'near'; }
    else if (days === 1) { dlText = '明日'; dlClass = 'near'; }
    else if (days <= 3)  { dlText = `${days} 天後`; dlClass = 'near'; }
    else                 { dlText = D.fmt(new Date(sch.end), 'md'); }
  }

  return `<div class="task-row ${t.status === 'done' ? 'done' : ''} ${t.synced ? 'synced' : ''}" onclick="App.openTaskModal('${t.id}')">
    <div class="task-check ${t.status === 'done' ? 'done' : ''} ${t.locked ? 'locked' : ''}"
         data-edit onclick="event.stopPropagation(); App.toggleTaskDone('${t.id}')">
      ${t.status === 'done' ? '✓' : ''}
    </div>
    <div class="task-info">
      <div class="task-name">
        ${U.esc(t.name)}
        ${t.synced ? `<span class="sync-tag">🔗 ${U.esc(t.syncRef || '')}</span>` : ''}
        ${isPreview ? '<span class="preview-tag">📅 兩週預告</span>' : ''}
      </div>
      ${t.desc ? `<div class="task-desc">${U.esc(t.desc)}</div>` : ''}
    </div>
    <span class="task-tag ${LABELS.categoryClass[cat]}">${LABELS.category[cat]}</span>
    <span class="task-urg ${t.urgency || 'medium'}" title="${LABELS.urgency[t.urgency || 'medium']}"></span>
    <span class="task-deadline ${dlClass}">${dlText}${sch.hasOverride ? `<span style="font-size:11px;color:var(--sage-500);margin-left:4px;cursor:help;" title="此時程為本地調整，Sheet 原值: ${t.start || '—'} ~ ${t.end || '—'}">✎</span>` : ''}</span>
  </div>`;
};

App.buildMeetingPanelHtml = function() {
  const monday = D.monday();
  const thisWeek = DATA.meetings.filter(m => {
    if (!m.date) return false;
    const md = new Date(m.date);
    return D.daysBetween(monday, md) >= 0 && D.daysBetween(monday, md) <= 6;
  }).sort((a, b) => {
    const ad = (a.date || '') + (a.startTime || '');
    const bd = (b.date || '') + (b.startTime || '');
    return ad.localeCompare(bd);
  });

  const wd = ['日','一','二','三','四','五','六'];

  return `<div class="side-card">
    <div class="side-card-title">📅 會議時程</div>
    <div class="side-card-sub">會被排程演算法避開</div>

    <div class="meeting-list">
      ${thisWeek.length === 0 ?
        '<div style="text-align:center; padding:14px; color:var(--ink3); font-size:11px;">本週尚無會議</div>' :
        thisWeek.map(m => {
          const d = new Date(m.date);
          return `<div class="meeting-item">
            <span class="m-time">${wd[d.getDay()]} ${m.startTime}</span>
            <span class="m-title">${U.esc(m.title)}</span>
            <button class="m-del" data-edit onclick="App.deleteMeeting('${m.id}')">×</button>
          </div>`;
        }).join('')
      }
    </div>

    <div class="add-meeting-tabs">
      <button class="am-tab active" onclick="App.switchAmTab(this, 'shot')">📷 截圖</button>
      <button class="am-tab" onclick="App.switchAmTab(this, 'paste')">📋 貼上</button>
      <button class="am-tab" onclick="App.switchAmTab(this, 'manual')">⌨ 手動</button>
    </div>

    <div id="am-shot" class="am-form">
      <div class="am-drop" id="shotDrop" onclick="document.getElementById('shotInput').click()">
        <div class="ic">🖼</div>
        <div class="tx">點擊或拖曳上傳截圖</div>
        <div class="sub">免費 · 純本地辨識 · 可選多張</div>
      </div>
      <input type="file" id="shotInput" multiple accept="image/*" style="display:none"
             onchange="App.handleShotUpload(this.files)">
      <div id="shotList" class="shot-list" style="display:none;"></div>
      <div id="ocrResult"></div>
      <div class="ocr-tip">💡 多張截圖會自動去重，可標註不同週次</div>
    </div>

    <div id="am-paste" class="am-form" style="display:none">
      <textarea id="pasteText" placeholder="貼上會議資訊（每行一場）&#10;格式：日期 時段 主題&#10;5/19(一) 10:00-11:00 移行會議"></textarea>
      <button class="am-add-btn" data-edit onclick="App.parseAndAddMeetings()">解析並加入</button>
    </div>

    <div id="am-manual" class="am-form" style="display:none">
      <div class="am-row">
        <select id="mDay">
          <option value="1">週一</option><option value="2">週二</option>
          <option value="3">週三</option><option value="4">週四</option>
          <option value="5">週五</option><option value="6">週六</option><option value="0">週日</option>
        </select>
        <input type="time" id="mStart" value="10:00">
      </div>
      <div class="am-row">
        <input type="time" id="mEnd" value="11:00">
        <input id="mTitle" placeholder="會議主題">
      </div>
      <button class="am-add-btn" data-edit onclick="App.addManualMeeting()">＋ 加入會議</button>
    </div>
  </div>`;
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
  ['shot','paste','manual'].forEach(n => {
    const el = document.getElementById('am-' + n);
    if (el) el.style.display = n === name ? '' : 'none';
  });
};

App.deleteMeeting = function(id) {
  DATA.meetings = DATA.meetings.filter(m => m.id !== id);
  Storage.save();
  this.renderProject();
};

App.addManualMeeting = function() {
  const dayNum = parseInt(document.getElementById('mDay').value);
  const start = document.getElementById('mStart').value;
  const end = document.getElementById('mEnd').value;
  const title = document.getElementById('mTitle').value.trim();
  if (!title) { U.toast('⚠ 請填會議主題', 'warning'); return; }

  const monday = D.monday();
  const target = D.addDays(monday, dayNum === 0 ? 6 : dayNum - 1);

  DATA.meetings.push({
    id: U.id(),
    date: D.fmt(target, 'iso'),
    startTime: start,
    endTime: end,
    title,
  });
  Storage.save();
  this.renderProject();
  U.toast('✓ 會議已加入');
};

App.parseAndAddMeetings = function() {
  const text = document.getElementById('pasteText').value;
  if (!text.trim()) { U.toast('⚠ 請貼上會議資訊', 'warning'); return; }
  const parsed = parseMeetingText(text);
  if (parsed.length === 0) {
    U.toast('⚠ 無法解析，請檢查格式', 'warning');
    return;
  }
  for (const m of parsed) {
    DATA.meetings.push({ id: U.id(), ...m });
  }
  Storage.save();
  document.getElementById('pasteText').value = '';
  this.renderProject();
  U.toast(`✓ 已加入 ${parsed.length} 場會議`);
};

App.generateNow = function() {
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
        <a href="#" onclick="App.showPage('dashboard', document.querySelector('[data-page=dashboard]')); return false;" style="color:var(--sage-600); font-weight:600;">→ 查看總儀表板時程表</a>
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
  // Jump to dashboard to see the result
  if (this.currentPage !== 'dashboard') {
    this.showPage('dashboard', document.querySelector('[data-page=dashboard]'));
  }
};

// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT — Quick add + task modal + screenshot OCR
// ═══════════════════════════════════════════════════════
App.quickAddTask = function(projId, input) {
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

App.buildTaskFormHtml = function(task, mode) {
  const t = task || {};
  const v = (x) => (x == null ? '' : x);
  return `
    ${mode === 'new' ? `
    <div class="form-field">
      <label>專案</label>
      <select id="tf-project">${DATA.projects.filter(p => !p.synced).map(p => `<option value="${p.id}" ${t.project === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>
    </div>` : `
    <div class="form-field">
      <label>專案</label>
      <div class="task-proj-readonly">${U.esc((DATA.projects.find(p => p.id === t.project) || {}).name || '')}</div>
    </div>`}
    <div class="form-field">
      <label>任務名稱 *</label>
      <input type="text" id="tf-name" value="${U.esc(v(t.name))}" placeholder="例：完成 BOM 表 6 型壁掛機">
    </div>
    <div class="form-field">
      <label>說明</label>
      <textarea id="tf-desc" placeholder="任務詳細說明（選填）">${U.esc(v(t.desc))}</textarea>
    </div>
    <div class="form-row">
      <div class="form-field"><label>擔當</label><input type="text" id="tf-owner" value="${U.esc(v(t.owner) || (mode === 'new' ? (DATA.settings.userName || '') : ''))}"></div>
      <div class="form-field"><label>類型 <span title="任務＝有工期、要排程的實際工作項目；里程碑＝時間點標記（工期0），如審查、交付節點；群組＝純分類母項，不參與排程" style="cursor:help;">?</span></label>
        <select id="tf-taskType">
          <option value="task" ${t.taskType === 'task' || !t.taskType ? 'selected' : ''}>📋 任務</option>
          <option value="milestone" ${t.taskType === 'milestone' ? 'selected' : ''}>◆ 里程碑</option>
          <option value="group" ${t.taskType === 'group' ? 'selected' : ''}>▦ 群組</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>階段</label>
        <input type="text" id="tf-stage" list="tf-stage-list" value="${U.esc(v(t.stage))}" placeholder="輸入或選擇階段">
        <datalist id="tf-stage-list">${this.stageDatalistOptions(t.project)}</datalist>
      </div>
      <div class="form-field"><label>子群組</label>
        <input type="text" id="tf-subgroup" list="tf-subgroup-list" value="${U.esc(v(t.subgroup))}" placeholder="輸入或選擇子群組">
        <datalist id="tf-subgroup-list">${this.subgroupDatalistOptions(t.project)}</datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>緊急程度 <span title="系統依 deadline 自動計算緊急度，可手動覆蓋" style="cursor:help;">?</span></label>
        <select id="tf-urgency">
          <option value="high" ${t.urgency === 'high' ? 'selected' : ''}>🔴 緊急</option>
          <option value="medium" ${t.urgency === 'medium' || !t.urgency ? 'selected' : ''}>🟡 普通</option>
          <option value="low" ${t.urgency === 'low' ? 'selected' : ''}>🟢 不急</option>
        </select>
      </div>
      <div class="form-field"><label>狀態</label>
        <select id="tf-status">
          <option value="pending" ${t.status === 'pending' || !t.status ? 'selected' : ''}>未開始</option>
          <option value="wip" ${t.status === 'wip' ? 'selected' : ''}>進行中</option>
          <option value="done" ${t.status === 'done' ? 'selected' : ''}>已完成</option>
          <option value="hold" ${t.status === 'hold' ? 'selected' : ''}>擱置中</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>前置任務</label><input type="text" id="tf-predecessor" value="${U.esc(v(t.predecessor))}" placeholder="例：1FF,2FS+2（WBS編號+關係+lag）"></div>
      <div class="form-field"><label>工期（工作天）</label><input type="number" id="tf-duration" value="${v(t.durationDays) || 1}" min="1" step="1"></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>預計開始</label><input type="date" id="tf-start" value="${v(t.start)}"></div>
      <div class="form-field"><label>預計完成 / Deadline</label><input type="date" id="tf-end" value="${v(t.end)}"></div>
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
    <div class="form-row">
      <div class="form-field"><label>預估工時 (h)</label><input type="number" id="tf-hours" value="${v(t.estHours) || 1}" min="0.5" step="0.5"></div>
    </div>
    <div class="form-field">
      <label style="display:flex; align-items:center; gap:6px;">
        <input type="checkbox" id="tf-riskHL" ${t.riskHL ? 'checked' : ''} style="width:auto;">
        需拉高層 (HL)
        <span title="勾選表示此風險需升級到高層關注" style="cursor:help;">?</span>
      </label>
    </div>
    <div class="form-field">
      <label>風險內容</label>
      <textarea id="tf-riskIssue" placeholder="描述風險內容…">${U.esc(v(t.riskIssue))}</textarea>
    </div>
    <div class="form-field">
      <label>備註</label>
      <input type="text" id="tf-note" value="${U.esc(v(t.note))}">
    </div>
    <div class="form-field">
      <label style="display:flex; align-items:center; gap:6px;">
        <input type="checkbox" id="tf-split" ${t.canSplit !== false ? 'checked' : ''} style="width:auto;">
        可切分（≥4h 任務拆成多天）
      </label>
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
      <button class="tb-action" onclick="App.saveNewTask('${projId}')">建立任務</button>
    `,
  });
  // Auto-focus on name field
  setTimeout(() => {
    const nameField = document.getElementById('tf-name');
    if (nameField) nameField.focus();
  }, 50);
};

App.saveNewTask = function(projId) {
  // M2 表單改造：必填檢查（專案/名稱/擔當/類型/階段/預計開始；house style：toast warning + return）
  if (!(document.getElementById('tf-project').value || '').trim()) { U.toast('⚠ 請選擇專案', 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }
  if (!document.getElementById('tf-owner').value.trim()) { U.toast('⚠ 請填擔當', 'warning'); return; }
  if (!document.getElementById('tf-taskType').value.trim()) { U.toast('⚠ 請選擇類型', 'warning'); return; }
  if (!document.getElementById('tf-stage').value.trim()) { U.toast('⚠ 請填階段', 'warning'); return; }
  if (!document.getElementById('tf-start').value.trim()) { U.toast('⚠ 請填預計開始', 'warning'); return; }

  const status = document.getElementById('tf-status').value;
  const task = {
    id: U.id(),
    project: document.getElementById('tf-project').value || projId,
    name,
    desc: document.getElementById('tf-desc').value.trim(),
    owner: document.getElementById('tf-owner').value.trim(),
    category: 'deep',  // M2 表單改造：分類欄 UI 已移除，資料層保留、新任務一律 deep（工作性質維度後續另議）
    taskType: document.getElementById('tf-taskType').value,  // M2-T4：使用者顯式選擇（非 hardcode 預設，quickAdd 仍靠 ensureTaskType 兜底）
    stage: document.getElementById('tf-stage').value.trim(),       // M2-2a：與同步/匯入同欄位，trim 同收集口徑
    subgroup: document.getElementById('tf-subgroup').value.trim(),
    urgency: document.getElementById('tf-urgency').value,
    status,
    start: document.getElementById('tf-start').value,
    end: document.getElementById('tf-end').value,
    estHours: parseFloat(document.getElementById('tf-hours').value) || 1,
    predecessor: document.getElementById('tf-predecessor').value.trim(),  // M2-2：前置任務編碼原樣字串（解析容錯在 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: parseFloat(document.getElementById('tf-duration').value) || 1,  // M2-2：工期(工作天)，最小1（0工期語意由 taskType=milestone 表達）
    scheduledStart: '',  // 排程套用結果，四條一致
    scheduledEnd: '',
    parentWbsId: '',   // 階段2：子綁父
    method: '',        // M2 表單改造：處理方式欄 UI 已移除，新任務存空字串
    riskHL: document.getElementById('tf-riskHL').checked,                       // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
    riskIssue: document.getElementById('tf-riskIssue').value.trim(),
    deliverable: document.getElementById('tf-deliverable').value.trim(),
    deliverableLink: document.getElementById('tf-deliverableLink').value.trim(),
    note: document.getElementById('tf-note').value.trim(),
    canSplit: document.getElementById('tf-split').checked,
    completedAt: status === 'done' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };

  DATA.tasks.push(task);
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast(`✓ 已新增「${name}」`);
};

App.toggleTaskDone = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  if (t.locked) {
    U.toast('🔗 同步來的任務無法修改，請到 Google Sheet 修改', 'warning');
    return;
  }
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

  // For synced tasks: read-only view with editable schedule
  if (t.locked) {
    const proj = this.getProj(t.project);
    const sch = getEffectiveSchedule(t);
    const hasOverride = !!getJOverride(t.id);
    this.openModal({
      title: `🔗 ${U.esc(t.name)}`,
      body: `
        <div style="font-size:12px; color:var(--ink3); margin-bottom:12px; padding:8px 12px; background:var(--sage-50); border-radius:8px;">
          此任務由 Google Sheet 同步。<b>時程可在此調整</b>（不寫回 Sheet）。
        </div>
        <div class="form-field"><label>所屬專案</label><div style="padding:8px 0; font-size:13px; display:flex; align-items:center; gap:7px;">${proj?.color ? `<span style="width:10px;height:10px;border-radius:3px;background:${proj.color};display:inline-block;flex-shrink:0;"></span>` : ''}${U.esc(proj?.name || '—')}</div></div>
        <div class="form-field"><label>WBS 編號</label><div style="padding:8px 0; font-family:var(--mono);">${U.esc(t.syncRef || '')}</div></div>
        <div class="form-field"><label>說明</label><div style="padding:8px 0;">${U.esc(t.desc || '—')}</div></div>
        <div class="form-row">
          <div class="form-field"><label>擔當</label><div style="padding:8px 0;">${U.esc(t.owner || '—')}</div></div>
          <div class="form-field"><label>進度</label><div style="padding:8px 0; font-weight:600;">${t.progress || 0}%</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>開始日期</label><input type="date" id="tf-start" value="${sch.start || ''}"></div>
          <div class="form-field"><label>完成日期 / Deadline</label><input type="date" id="tf-end" value="${sch.end || ''}"></div>
        </div>
        ${hasOverride ? `<div style="font-size:11px; color:var(--ink3); margin-top:-8px; padding:0 4px;">✎ 已調整（Sheet 原值：${t.start || '—'} ~ ${t.end || '—'}）</div>` : ''}
        <div class="form-row">
          <div class="form-field"><label>預計開始（Sheet）</label><div style="padding:8px 0; font-family:var(--mono); ${t.actualStart ? 'color:var(--ink4); text-decoration:line-through;' : ''}">${t.plannedStart ? D.fmt(t.plannedStart, 'ymdShort') : '—'}</div></div>
          <div class="form-field"><label>預計完成（Sheet）</label><div style="padding:8px 0; font-family:var(--mono); ${t.actualEnd ? 'color:var(--ink4); text-decoration:line-through;' : ''}">${t.plannedEnd ? D.fmt(t.plannedEnd, 'ymdShort') : '—'}</div></div>
        </div>
        ${t.actualStart || t.actualEnd ? `
        <div class="form-row">
          <div class="form-field"><label>實際開始</label><div style="padding:8px 0; font-family:var(--mono); color:var(--sage-700); font-weight:600;">${t.actualStart ? D.fmt(t.actualStart, 'ymdShort') : '—'}</div></div>
          <div class="form-field"><label>實際完成</label><div style="padding:8px 0; font-family:var(--mono); color:var(--sage-700); font-weight:600;">${t.actualEnd ? D.fmt(t.actualEnd, 'ymdShort') : '—'}</div></div>
        </div>` : ''}
        <div class="form-field"><label>狀態</label><div style="padding:8px 0;">${LABELS.status[t.status] || t.status}${t.actualEnd ? ' ✓（依實際完成日判定）' : t.actualStart ? '（依實際開始日判定）' : ''}</div></div>
        <div class="form-field">
          <label>PDCA 大項目</label>
          <input type="text" id="tf-pdcaGroup" list="tf-pdcaGroup-list" value="${U.esc(t.pdcaGroup || '')}" placeholder="輸入或選擇大項目（空＝未歸類，僅本地、不寫回 Sheet）">
          <datalist id="tf-pdcaGroup-list">${this.pdcaGroupDatalistOptions(t.project)}</datalist>
        </div>
      `,
      footer: `
        ${hasOverride ? `<button class="tb-action ghost" onclick="App.resetJOverride('${t.id}')" style="margin-right:auto;">↺ 重置為 Sheet 原值</button>` : '<div style="flex:1"></div>'}
        <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
        <button class="tb-action" onclick="App.saveJSchedule('${t.id}')">儲存時程</button>
      `,
    });
    return;
  }

  // Editable task
  const sch = getEffectiveSchedule(t);
  const proj = this.getProj(t.project);

  // 當前所在週次標示（紅色 ⁂ 表示未結案）
  const currentWeekBadge = t.currentWeek && t.status !== 'done'
    ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--terracotta-l); color:var(--terracotta); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} <span style="color:#C4633E;">⁂</span></span>`
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
        <td style="padding:6px 8px; font-family:var(--mono); font-size:10.5px; color:var(--ink3); border-bottom:1px solid var(--rule);">${U.esc(h.week || '')}</td>
        <td style="padding:6px 8px; font-size:11.5px; color:${statusColor}; border-bottom:1px solid var(--rule); white-space:nowrap;">${U.esc(h.status || '')}</td>
        <td style="padding:6px 8px; font-size:11.5px; border-bottom:1px solid var(--rule); line-height:1.4;">${U.esc(h.work || '—')}</td>
        <td style="padding:6px 8px; font-family:var(--mono); font-size:10.5px; color:var(--ink3); border-bottom:1px solid var(--rule); white-space:nowrap;">${h.planEnd || '—'}${h.planEndOriginal && h.planEndOriginal !== h.planEnd ? '<br><span style="color:var(--ink4); font-size:10px;">原:' + h.planEndOriginal + '</span>' : ''}</td>
        <td style="padding:6px 8px; font-family:var(--mono); font-size:10.5px; color:${h.actualEnd ? 'var(--sage-700)' : 'var(--ink3)'}; border-bottom:1px solid var(--rule); white-space:nowrap;">${h.actualEnd || '—'}</td>
        <td style="padding:6px 8px; font-size:11px; color:var(--terracotta); border-bottom:1px solid var(--rule);">${U.esc(h.delayReason || '')}</td>
      </tr>`;
    }).join('');
    historyHtml = `
      <div class="form-field" style="margin-top:18px;">
        <label style="display:flex; align-items:center; gap:8px;">
          📋 歷史紀錄
          <span style="font-size:10.5px; color:var(--ink3); font-weight:400;">（共 ${history.length} 週的執行紀錄）</span>
        </label>
        <div style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:220px; overflow-y:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
            <thead style="position:sticky; top:0; background:var(--sage-50);">
              <tr>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">週次</th>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">狀態</th>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">本週工作</th>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">預計完成</th>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">實際完成</th>
                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule); font-weight:600; font-size:11px;">延誤理由</th>
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
      <button class="tb-action danger" onclick="App.deleteTask('${t.id}')" style="margin-right:auto;">刪除任務</button>
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App.saveTask('${t.id}')">儲存</button>
    `,
  });
};

App.saveTask = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  // M2 表單改造：必填檢查（名稱/擔當/類型/階段/預計開始；編輯版專案是唯讀 div 無 tf-project，不檢查）
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }
  if (!document.getElementById('tf-owner').value.trim()) { U.toast('⚠ 請填擔當', 'warning'); return; }
  if (!document.getElementById('tf-taskType').value.trim()) { U.toast('⚠ 請選擇類型', 'warning'); return; }
  if (!document.getElementById('tf-stage').value.trim()) { U.toast('⚠ 請填階段', 'warning'); return; }
  if (!document.getElementById('tf-start').value.trim()) { U.toast('⚠ 請填預計開始', 'warning'); return; }

  t.name      = name;
  t.desc      = document.getElementById('tf-desc').value.trim();
  t.owner     = document.getElementById('tf-owner').value.trim();
  // M2 表單改造：分類/處理方式欄 UI 已移除——t.category / t.method 保留原值不覆蓋
  t.taskType  = document.getElementById('tf-taskType').value;  // M2-T4：編輯送出同步類型
  t.stage     = document.getElementById('tf-stage').value.trim();     // M2-2a：與同步/匯入同欄位，trim 同收集口徑
  t.subgroup  = document.getElementById('tf-subgroup').value.trim();
  t.predecessor  = document.getElementById('tf-predecessor').value.trim();  // M2-2：編輯送出同步前置/工期（原本編輯不碰這兩欄）
  t.durationDays = parseFloat(document.getElementById('tf-duration').value) || 1;
  t.urgency   = document.getElementById('tf-urgency').value;
  t.start     = document.getElementById('tf-start').value;
  t.end       = document.getElementById('tf-end').value;
  t.actualStart = document.getElementById('tf-actualStart').value;
  t.actualEnd   = document.getElementById('tf-actualEnd').value;
  t.estHours  = parseFloat(document.getElementById('tf-hours').value) || 1;
  t.riskHL    = document.getElementById('tf-riskHL').checked;                   // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
  t.riskIssue = document.getElementById('tf-riskIssue').value.trim();
  t.deliverable = document.getElementById('tf-deliverable').value.trim();
  t.deliverableLink = document.getElementById('tf-deliverableLink').value.trim();
  t.note      = document.getElementById('tf-note').value.trim();
  t.canSplit  = document.getElementById('tf-split').checked;

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

  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已儲存');
};

App.saveJSchedule = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  const start = document.getElementById('tf-start').value;
  const end = document.getElementById('tf-end').value;
  if (start === t.start && end === t.end) {
    clearJOverride(id);
  } else {
    setJOverride(id, { start, end });
  }
  const pgEl = document.getElementById('tf-pdcaGroup');
  if (pgEl) t.pdcaGroup = pgEl.value.trim();
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 時程已更新');
};

App.resetJOverride = function(id) {
  if (!confirm('確定要重置為 Sheet 原始時程？')) return;
  clearJOverride(id);
  this.closeModal();
  this.refreshAll();
  U.toast('↺ 已重置為 Sheet 原值');
};

App.resetAllJOverrides = function() {
  const list = getAllJOverrides();
  if (list.length === 0) {
    U.toast('目前沒有本地覆蓋的 ' + CFG('WBS_LABEL', 'WBS') + '時程');
    return;
  }
  if (!confirm(`確定要重置 ${list.length} 筆 ${CFG('WBS_LABEL', 'WBS')}任務的本地時程？此操作不可復原。`)) return;
  list.forEach(o => {
    const task = DATA.tasks.find(t => t.id === o.id);
    if (task) {
      J_OVERRIDE_FIELDS.forEach(f => {
        const key = '_local' + f.charAt(0).toUpperCase() + f.slice(1);
        delete task[key];
      });
    }
  });
  Storage.save();
  this.refreshAll();
  U.toast(`↺ 已重置 ${list.length} 筆 ${CFG('WBS_LABEL', 'WBS')}時程`);
};

App.deleteTask = function(id) {
  if (!confirm('刪除任務？\n\n刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。')) return;
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  t._deleted = true;
  t._deletedAt = new Date().toISOString();
  // 從 schedule 中移除
  if (DATA.schedule && DATA.schedule.items) {
    DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
  }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 已移到「已刪除」區塊（14 天內可還原）');
};

// ─── PROJECT CRUD ───
App.openProjectDialog = function(projId) {
  const editing = projId ? this.getProj(projId) : null;
  const isEdit = !!editing;

  this.openModal({
    title: isEdit ? '編輯專案' : '新增專案',
    body: `
      <div class="form-field">
        <label>專案名稱 *</label>
        <input type="text" id="pf-name" value="${editing ? U.esc(editing.name) : ''}" placeholder="e.g. ${CFG('PROJECT_INPUT_EXAMPLE', '範例品項')}">
      </div>
      <div class="form-field">
        <label>顏色</label>
        <div class="color-picker" id="cpColors">
          ${PROJ_COLORS.map((c, i) => `
            <div class="cp-swatch ${(editing && editing.color === c) || (!editing && i === 0) ? 'on' : ''}"
                 style="background:${c}" onclick="App.pickColor('${c}', this)" data-color="${c}"></div>
          `).join('')}
        </div>
      </div>
      <div class="form-field">
        <label>備註</label>
        <input type="text" id="pf-note" value="${editing ? U.esc(editing.note || '') : ''}" placeholder="簡短描述">
      </div>
        ${isEdit ? `
        <div class="form-field">
          <label>部門擔當</label>
          <div class="dept-edit-list">
            ${(editing.depts || []).map(d => `
              <div class="dept-edit-row">
                <input class="dept-edit-name" value="${U.esc(d.name)}" onchange="App.deptEdit.renameDept('${projId}','${d.id}',this.value)">
                <button class="tb-action ghost dept-edit-del" onclick="App.deptEdit.removeDept('${projId}','${d.id}')">刪部門</button>
                <div class="dept-edit-members">
                  ${(d.members || []).map(m => `<span class="dept-member-chip">${U.esc(m.name)}<button onclick="App.deptEdit.removeMember('${projId}','${d.id}','${m.id}')">×</button></span>`).join('')}
                  <button class="dept-member-add" onclick="App.deptEdit.addMember('${projId}','${d.id}')">＋成員</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="tb-action ghost dept-add-btn" onclick="App.deptEdit.addDept('${projId}')">＋ 新增部門</button>
        </div>
        ` : ''}
    `,
    footer: `
      ${isEdit ? `<button class="tb-action danger" onclick="App.deleteProject('${projId}')" style="margin-right:auto;">刪除專案</button>` : ''}
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App.saveProject('${projId || ''}')">${isEdit ? '儲存' : '建立'}</button>
    `,
  });
};

App.editProject = function(id) { this.openProjectDialog(id); };

App.pickColor = function(color, el) {
  document.querySelectorAll('.cp-swatch').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
};

App.saveProject = function(id) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const colorEl = document.querySelector('.cp-swatch.on');
  const color = colorEl ? colorEl.dataset.color : PROJ_COLORS[0];
  const note = document.getElementById('pf-note').value.trim();

  if (id) {
    const p = this.getProj(id);
    if (p && !p.synced) { p.name = name; p.color = color; p.note = note; }
  } else {
    const np = { id: U.id(), name, color, note, synced: false, createdAt: new Date().toISOString() };
    ensurePdcaData(np);
    DATA.projects.push(np);
    this.currentProjectId = np.id;
  }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast(id ? '✓ 專案已更新' : '✓ 專案已建立');
  if (!id) this.showPage('project', null);
};

App.deptEdit = {
  _getProj(projId) {
    return DATA.projects.find(p => p.id === projId);
  },
  _commit(projId) {
    // 即時生效（D-2c 走 A 案）：存檔 + 重繪整個編輯專案 modal
    Storage.save();
    App.openProjectDialog(projId);
  },
  addDept(projId) {
    const p = this._getProj(projId);
    if (!p) return;
    if (!p.depts) p.depts = [];
    p.depts.push({ id: U.id(), name: '新部門', members: [] });
    this._commit(projId);
  },
  renameDept(projId, deptId, newName) {
    const p = this._getProj(projId);
    if (!p || !p.depts) return;
    const d = p.depts.find(x => x.id === deptId);
    if (!d) return;
    const v = (newName || '').trim();
    if (!v) { U.toast('部門名不可空白'); return; }
    d.name = v;
    this._commit(projId);
  },
  removeDept(projId, deptId) {
    const p = this._getProj(projId);
    if (!p || !p.depts) return;
    const n = DATA.tasks.filter(t => t.dept === deptId).length;
    if (n === 0) {
      // 空部門:輕量 confirm 後直接刪
      const d0 = p.depts.find(x => x.id === deptId);
      if (!confirm('確定刪除部門「' + (d0 ? d0.name : deptId) + '」?')) return;
      p.depts = p.depts.filter(x => x.id !== deptId);
      this._commit(projId);
      return;
    }
    // n>0:開批次改派彈窗(不在此寫資料)
    App.openDeptReassign(projId, deptId);
  },
  addMember(projId, deptId) {
    const p = this._getProj(projId);
    if (!p || !p.depts) return;
    const d = p.depts.find(x => x.id === deptId);
    if (!d) return;
    if (!d.members) d.members = [];
    d.members.push({ id: U.id(), name: '新成員' });
    this._commit(projId);
  },
  removeMember(projId, deptId, memberId) {
    const p = this._getProj(projId);
    if (!p || !p.depts) return;
    const d = p.depts.find(x => x.id === deptId);
    if (!d || !d.members) return;
    d.members = d.members.filter(m => m.id !== memberId);
    this._commit(projId);
  }
};

App.openDeptReassign = function(projId, deptId) {
  const p = App.getProj(projId);
  if (!p || !p.depts) return;
  const delDept = p.depts.find(x => x.id === deptId);
  const affected = DATA.tasks.filter(t => t.dept === deptId);
  // 下拉選項:其他部門 + 未指派
  const optDepts = p.depts.filter(x => x.id !== deptId);
  const rows = affected.map(t => {
    const label = (t.wbs !== undefined && t.wbs !== null && String(t.wbs).trim() !== '')
      ? (U.esc(String(t.wbs)) + ' ' + U.esc(t.name || ''))
      : U.esc(t.name || '');
    const opts = ['<option value="">— 請選擇 —</option>']
      .concat(optDepts.map(d => '<option value="' + d.id + '">' + U.esc(d.name) + '</option>'))
      .concat(['<option value="__UNASSIGN__">未指派</option>'])
      .join('');
    return '<div class="reassign-row" data-task-id="' + t.id + '">'
      + '<span class="reassign-task">' + label + '</span>'
      + '<select class="reassign-select" onchange="App.checkReassignReady()">' + opts + '</select>'
      + '</div>';
  }).join('');
  const body = '<div class="reassign-list">' + rows + '</div>';
  const footer = '<button class="tb-action ghost" onclick="App.openProjectDialog(\'' + projId + '\')">取消</button>'
    + '<button id="reassign-del-btn" class="tb-action danger" disabled '
    + 'onclick="App.confirmDeptReassign(\'' + projId + '\',\'' + deptId + '\')">刪除部門</button>';
  App.openModal({
    title: '刪除部門「' + (delDept ? U.esc(delDept.name) : deptId) + '」— 改派 ' + affected.length + ' 個任務',
    body: body,
    footer: footer
  });
};

App.checkReassignReady = function() {
  const sels = document.querySelectorAll('.reassign-select');
  const btn = document.getElementById('reassign-del-btn');
  if (!btn) return;
  const allChosen = Array.from(sels).every(s => s.value !== '');
  btn.disabled = !allChosen;
};

App.confirmDeptReassign = function(projId, deptId) {
  const p = App.getProj(projId);
  if (!p || !p.depts) return;
  const rows = Array.from(document.querySelectorAll('.reassign-row'));
  // 防呆:全部 select 有值才執行(防繞過 disabled 造成半套寫入)
  if (!rows.every(r => { const s = r.querySelector('.reassign-select'); return s && s.value !== ''; })) return;
  rows.forEach(r => {
    const taskId = r.getAttribute('data-task-id');
    const val = r.querySelector('.reassign-select').value;
    const t = DATA.tasks.find(x => x.id === taskId);
    if (!t) return;
    t.dept = (val === '__UNASSIGN__') ? '未指派' : val;
  });
  p.depts = p.depts.filter(x => x.id !== deptId);
  App.deptEdit._commit(projId);   // = Storage.save() + openProjectDialog(重繪回編輯專案 modal)
};

App.deleteProject = function(id) {
  const p = this.getProj(id);
  if (!p) return;
  const taskCnt = this.getTasksOf(id).length;
  if (!confirm(`刪除專案「${p.name}」？\n含 ${taskCnt} 個任務也會一併刪除`)) return;
  DATA.projects = DATA.projects.filter(x => x.id !== id);
  DATA.tasks = DATA.tasks.filter(t => t.project !== id);
  if (this.currentProjectId === id) this.currentProjectId = null;
  Storage.save();
  this.closeModal();
  this.showPage('dashboard', document.querySelector('[data-page=dashboard]'));
};

// ═══════════════════════════════════════════════════════
//  TESSERACT.JS OCR INTEGRATION
// ═══════════════════════════════════════════════════════
App.shotFiles = []; // { name, dataUrl, week, parsed: [] }

App.handleShotUpload = function(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.shotFiles.push({
        id: U.id(),
        name: f.name,
        dataUrl: e.target.result,
        week: 'this',
        parsed: null,
      });
      this.renderShotList();
    };
    reader.readAsDataURL(f);
  }
};

App.renderShotList = function() {
  const wrap = document.getElementById('shotList');
  if (!wrap) return;
  if (this.shotFiles.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="shot-list-head">已上傳 ${this.shotFiles.length} 張</div>
    ${this.shotFiles.map(s => `
      <div class="shot-item">
        <img class="shot-thumb" src="${s.dataUrl}" alt="">
        <span class="shot-name">${U.esc(s.name)}</span>
        <select class="shot-week" onchange="App.shotFiles.find(x=>x.id==='${s.id}').week=this.value">
          <option value="last" ${s.week === 'last' ? 'selected' : ''}>上週</option>
          <option value="this" ${s.week === 'this' ? 'selected' : ''}>本週</option>
          <option value="next" ${s.week === 'next' ? 'selected' : ''}>下週</option>
        </select>
        ${s.parsed ? `<span class="shot-progress">${s.parsed.length} 場</span>` : ''}
        <button class="m-del" onclick="App.removeShot('${s.id}')">×</button>
      </div>
    `).join('')}
    <button class="am-add-btn" id="ocrRunBtn" onclick="App.runOCR()">🪄 一次解析全部 (${this.shotFiles.length})</button>
  `;
};

App.removeShot = function(id) {
  this.shotFiles = this.shotFiles.filter(s => s.id !== id);
  this.renderShotList();
};

App.runOCR = async function() {
  if (this.shotFiles.length === 0) return;
  const btn = document.getElementById('ocrRunBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 載入辨識引擎...'; }

  try {
    // Lazy-init Tesseract worker
    if (!window.tesseractWorker) {
      if (btn) btn.textContent = '⏳ 載入中文語言檔（首次約需 1 分鐘）...';
      window.tesseractWorker = await Tesseract.createWorker(['chi_tra', 'eng']);
    }

    let total = this.shotFiles.length;
    let done = 0;
    const allMeetings = [];

    for (const shot of this.shotFiles) {
      if (btn) btn.textContent = `⏳ 辨識中 (${++done}/${total})...`;
      try {
        const { data: { text } } = await window.tesseractWorker.recognize(shot.dataUrl);
        const meetings = parseMeetingText(text);
        // Apply week offset
        const offset = shot.week === 'last' ? -7 : shot.week === 'next' ? 7 : 0;
        for (const m of meetings) {
          if (offset !== 0 && m.date) {
            const d = new Date(m.date);
            d.setDate(d.getDate() + offset);
            m.date = D.fmt(d, 'iso');
          }
        }
        shot.parsed = meetings;
        const label = `#${this.shotFiles.indexOf(shot) + 1}`;
        for (const m of meetings) allMeetings.push({ ...m, __src: label });
      } catch(e) {
        console.error('OCR failed for', shot.name, e);
      }
    }

    // Dedupe
    const grouped = {};
    for (const m of allMeetings) {
      const key = `${m.date}_${m.startTime}_${m.title}`;
      if (!grouped[key]) grouped[key] = { ...m, sources: [] };
      grouped[key].sources.push(m.__src);
    }
    const unique = Object.values(grouped);

    this.renderOCRResult(unique);
    if (btn) { btn.disabled = false; btn.textContent = '🪄 一次解析全部'; }
  } catch (e) {
    console.error('OCR error:', e);
    U.toast(`❌ 辨識失敗：${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🪄 一次解析全部'; }
  }
};

App.renderOCRResult = function(meetings) {
  const wrap = document.getElementById('ocrResult');
  if (!wrap) return;
  if (meetings.length === 0) {
    wrap.innerHTML = `<div style="padding:10px; background:var(--terracotta-l); border-radius:6px; font-size:11px; color:var(--terracotta); margin-top:10px;">⚠ 沒有辨識到會議資訊，請檢查截圖或改用「貼上」方式</div>`;
    return;
  }
  // Sort by date+time
  meetings.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const wd = ['日','一','二','三','四','五','六'];

  wrap.innerHTML = `<div class="ocr-result">
    <div class="ocr-result-head">
      辨識完成 · 自動去重後共 <b>&nbsp;${meetings.length}</b>&nbsp; 場
    </div>
    ${meetings.map((m, i) => {
      const d = m.date ? new Date(m.date) : null;
      const dateStr = d ? `${wd[d.getDay()]} ${m.startTime}` : m.startTime || '?';
      return `<label class="ocr-row">
        <input type="checkbox" checked data-idx="${i}">
        <span class="ocr-time">${dateStr}</span>
        <span class="ocr-title">${U.esc(m.title)}</span>
        <span class="ocr-src">${m.sources.join(', ')}</span>
      </label>`;
    }).join('')}
    <div style="display:flex; gap:6px; margin-top:8px;">
      <button class="am-add-btn" style="flex:1;" onclick='App.confirmOCRMeetings(${JSON.stringify(meetings).replace(/'/g, "&#39;")})'>加入勾選</button>
      <button class="am-add-btn" style="background:var(--stone-100); color:var(--ink2);" onclick="App.cancelOCR()">取消</button>
    </div>
  </div>`;
};

App.confirmOCRMeetings = function(meetings) {
  const checks = document.querySelectorAll('.ocr-row input[type=checkbox]');
  let added = 0;
  checks.forEach((c, i) => {
    if (c.checked) {
      const m = meetings[i];
      DATA.meetings.push({ id: U.id(), ...m });
      added++;
    }
  });
  Storage.save();
  this.shotFiles = [];
  this.renderProject();
  U.toast(`✓ 已加入 ${added} 場會議`);
};

App.cancelOCR = function() {
  document.getElementById('ocrResult').innerHTML = '';
  this.shotFiles = [];
  this.renderShotList();
};

// ═══════════════════════════════════════════════════════
//  PAGE: GANTT
// ═══════════════════════════════════════════════════════
App.renderGantt = function(targetId = 'page-gantt') {
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
    const isWk = D.isWeekend(d);
    const isToday = D.isSameDay(d, today);
    headerHtml += `<div class="gantt-day-header ${isWk ? 'weekend' : ''} ${isToday ? 'today' : ''}">
      <span class="gd-day">${d.getDate()}</span>${wd[d.getDay()]}
    </div>`;
  }

  // Collect tasks to display (active + recently done, with dates)
  const projFilter = this.ganttProjectFilter;
  const tasks = DATA.tasks.filter(t => {
    if (t._deleted) return false;
    if (!projFilter.has(t.project)) return false;
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
        ${this.buildGanttFilterHtml()}
        <div class="empty-task-list" style="grid-column: 1 / -1;">
          <div class="empty-task-list-icon">📊</div>
          目前篩選沒有任務<br>
          <span style="font-size:11px;">請勾選至少一個專案</span>
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
      ${this.buildGanttFilterHtml()}
      <div class="gantt">
        ${headerHtml}
        ${rowsHtml}
      </div>
      <div class="legend-row" style="border-top:1px solid var(--rule); margin-top:18px; padding-top:14px;">
        ${DATA.projects.map(p => `
          <span class="legend-item"><span class="legend-sw" style="background:${p.color}"></span>${U.esc(p.name)}${p.synced ? ' 🔗' : ''}</span>
        `).join('')}
        <span style="margin-left:auto; font-size:10.5px;">◆ 里程碑 · 進度條顯示完成度</span>
      </div>
    </div>
  `;
};

App.buildGanttHeaderHtml = function(days) {
  const periodStr = `${D.fmt(days[0], 'ymd')} – ${D.fmt(days[13], 'md')}`;
  return `<div class="gantt-header-row">
    <div class="gantt-period">${periodStr}</div>
    <div style="flex:1"></div>
    <div class="gantt-nav">
      <button onclick="App.ganttShift(-14)">‹‹ 上兩週</button>
      <button onclick="App.ganttToday()">今天</button>
      <button onclick="App.ganttShift(14)">下兩週 ››</button>
      <button onclick="App.applyGanttSchedule()">⚡ 一鍵套用排程</button>
    </div>
  </div>`;
};

App.ganttShift = function(days) {
  this.ganttStart = D.addDays(this.ganttStart || D.monday(), days);
  this.renderGantt();
};
App.ganttToday = function() {
  this.ganttStart = D.monday();
  this.renderGantt();
};

// 一鍵套用排程：逐專案跑 applySchedule（wbs 僅專案內唯一，故不可全域套用），落地後存檔重繪
App.applyGanttSchedule = function() {
  const lines = [];
  let totalA = 0, totalS = 0;
  DATA.projects.forEach(p => {
    const tasks = DATA.tasks.filter(t => t.project === p.id);
    if (tasks.length === 0) return;          // 空專案跳過
    const res = applySchedule(tasks);         // 逐專案：內部mutate task.scheduledStart/End（與DATA.tasks同參考）
    totalA += res.applied.length;
    totalS += res.skipped.length;
    if (res.applied.length || res.skipped.length) {
      lines.push(`${p.name}：套用${res.applied.length}筆／跳過${res.skipped.length}筆`);
    }
  });
  Storage.save();                             // 持久化（scheduled寫進localStorage）
  this.renderGantt();                         // 重繪，getEffectiveSchedule自動讀到scheduled層
  const summary = totalA === 0 && totalS === 0
    ? '沒有可排程的任務'
    : `⚡ 套用${totalA}筆、跳過${totalS}筆\n` + lines.join('\n');
  U.toast(summary, totalA > 0 ? 'success' : 'info');
};

App.buildGanttFilterHtml = function() {
  const f = this.ganttProjectFilter || new Set();
  return `<div class="gantt-filter-row">
    <span class="gantt-filter-label">by 專案</span>
    ${DATA.projects.map(p => `
      <label class="gantt-filter-item">
        <input type="checkbox" ${f.has(p.id) ? 'checked' : ''} onchange="App.toggleGanttProject('${p.id}')">
        <span class="gantt-filter-sw" style="background:${p.color}"></span>${U.esc(p.name)}${p.synced ? ' 🔗' : ''}
      </label>
    `).join('')}
  </div>`;
};

App.toggleGanttProject = function(id) {
  if (!this.ganttProjectFilter) this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
  if (this.ganttProjectFilter.has(id)) this.ganttProjectFilter.delete(id);
  else this.ganttProjectFilter.add(id);
  this.renderGantt();
};

// ─── 甘特狀態標籤（暫定樣式，集中於此；要改字/調色改這裡，勿散落到渲染中）───
// 標籤來源 = computeSchedule result 的 anchorSource（manual/override）或「可排」推導出的 scheduled。
const GANTT_STATUS_LABELS = { manual: '手動', override: '鎖', scheduled: '排程' };
const GANTT_STATUS_COLORS = {
  manual:    { bg: '#9CA3AF', fg: '#ffffff' },  // 灰：使用者手填錨點
  scheduled: { bg: '#5C7A8B', fg: '#ffffff' },  // 藍：引擎連動算出
  override:  { bg: '#C4956C', fg: '#ffffff' },  // 琥珀：本地鎖定 override
  warn:      { fg: '#B8504D' },                  // 紅：! 圖示（循環/blocked/待排）
};
const GANTT_SOURCE_DESC = { manual: '手動錨點', override: '本地鎖定（override）', scheduled: '機器排程連動' };

App.buildGanttRowHtml = function(task, start, days, schedById) {
  const proj = this.getProj(task.project);
  const colorIdx = proj ? PROJ_COLORS.indexOf(proj.color) : -1;
  const colorClass = ['bar-sage','bar-terracotta','bar-slate','bar-plum','bar-amber','bar-rose','bar-sage','bar-sage'][colorIdx % 8] || 'bar-sage';
  const sch = getEffectiveSchedule(task);
  const isMilestone = task.taskType === 'milestone';  // M2-T3：類型正本，不再靠 category==='meeting' 啟發式誤判
  const tsDate = new Date(sch.start || sch.end);
  // 里程碑=節點(工期0)：強制 te=ts 單格錨在 start(start 空退 end)，日期跨度視為髒資料不畫長條；
  // 亦保證 startCol===endCol → 前後空格迴圈恰好補滿 14 格，格線不塌
  const teDate = isMilestone ? tsDate : new Date(sch.end || sch.start);
  const tsIdx = D.daysBetween(start, tsDate);
  const teIdx = D.daysBetween(start, teDate);
  const startCol = Math.max(0, tsIdx);
  const endCol = Math.min(13, teIdx);
  const span = endCol - startCol + 1;

  if (startCol > 13 || endCol < 0) return '';

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
    ? `<span class="gantt-status-tag" style="display:inline-block;font-size:10px;line-height:1.4;padding:0 5px;border-radius:3px;margin-right:4px;background:${GANTT_STATUS_COLORS[statusKey].bg};color:${GANTT_STATUS_COLORS[statusKey].fg};">${GANTT_STATUS_LABELS[statusKey]}</span>`
    : '';
  const warnHtml = hasIssue
    ? `<span class="gantt-warn" style="color:${GANTT_STATUS_COLORS.warn.fg};font-weight:700;margin-right:4px;" title="排程異常">!</span>`
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
  const barTitle = titleLines.join('\n');

  // Row label
  let html = `<div class="gantt-row-label">
    <span class="dot" style="background:${proj?.color || '#888'}"></span>
    <span class="gantt-row-label-text">${U.esc(task.name)}${task.synced ? ' 🔗' : ''}${sch.hasOverride ? '<span style="font-size:11px;color:var(--sage-500);margin-left:4px;cursor:help;" title="此時程為本地調整">✎</span>' : ''}</span>
  </div>`;

  // Empty cells before
  for (let i = 0; i < startCol; i++) {
    const d = days[i];
    html += `<div class="gantt-cell ${D.isWeekend(d) ? 'weekend' : ''} ${D.isSameDay(d, D.today()) ? 'today' : ''}"></div>`;
  }

  // Bar cell
  const isPreview = sch.end && D.daysBetween(D.today(), new Date(sch.end)) > 7 && D.daysBetween(D.today(), new Date(sch.end)) <= 14;
  const progress = task.progress || (task.status === 'done' ? 100 : task.status === 'wip' ? 30 : 0);

  if (isMilestone) {
    html += `<div class="gantt-cell" style="position:relative;">
      <div class="gantt-bar milestone" style="left:50%; transform:translateX(-50%);" onclick="App.openTaskModal('${task.id}')"${barTitle ? ` title="${U.esc(barTitle)}"` : ''}></div>
    </div>`;
  } else {
    html += `<div class="gantt-cell" style="grid-column: span ${span}; position:relative;">
      <div class="gantt-bar ${colorClass}" style="left:4px; right:4px; ${isPreview ? 'opacity:0.7;' : ''}" onclick="App.openTaskModal('${task.id}')"${barTitle ? ` title="${U.esc(barTitle)}"` : ''}>
        ${progress > 0 ? `<div class="progress" style="width:${progress}%;"></div>` : ''}
        ${statusTagHtml}${warnHtml}${U.esc(task.name)} <span class="pill">${progress}%</span>
      </div>
    </div>`;
    // Fill the rest of the spanned cells (no extra cells needed because of grid-column span)
  }

  // Empty cells after
  for (let i = endCol + 1; i < 14; i++) {
    const d = days[i];
    html += `<div class="gantt-cell ${D.isWeekend(d) ? 'weekend' : ''}"></div>`;
  }

  return html;
};

// ═══════════════════════════════════════════════════════
//  PAGE: MONTH
// ═══════════════════════════════════════════════════════
App.renderMonth = function(targetId = 'page-month') {
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
    const taskDeadlines = DATA.tasks.filter(t => !t._deleted && getEffectiveSchedule(t).end === dateIso && t.status !== 'done' && t.status !== 'hold');

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
  this.renderMonth();
};
App.monthToday = function() {
  const today = D.today();
  this.monthCursor = { year: today.getFullYear(), month: today.getMonth() };
  this.renderMonth();
};
App.monthYearShift = function(n) {
  this.monthCursor.year += n;
  this.renderMonth();
};
App.monthYearSelect = function(y) {
  this.monthCursor.year = parseInt(y);
  this.renderMonth();
};
App.monthPick = function(m) {
  this.monthCursor.month = m;
  document.getElementById('ymPicker').classList.remove('open');
  this.renderMonth();
};

// Click outside to close year/month picker
document.addEventListener('click', e => {
  const picker = document.getElementById('ymPicker');
  if (picker && !picker.contains(e.target) && !e.target.classList.contains('month-title-btn')) {
    picker.classList.remove('open');
  }
});

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
            ${proj.synced ? '<span class="rp-sync-tag">🔗 Google Sheet</span>' : ''}
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
                    <div class="rp-task-name">${U.esc(t.name)}${t.synced ? `<span class="sync-tag">${U.esc(t.syncRef||'')}</span>` : ''}</div>
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

// ═══════════════════════════════════════════════════════
//  PAGE: PDCA 報告（方式 1 — 任務聚合）
// ═══════════════════════════════════════════════════════
App.renderPdca = function() {
  ensureAllPdcaData();
  const host = document.getElementById('page-pdca');
  if (!host) return;
  const projects = DATA.projects || [];
  if (projects.length === 0) {
    host.innerHTML = `<div class="view-tabs-bar">${this.buildReportTabsHtml()}</div><div class="empty-task-list"><div class="empty-task-list-icon">📊</div>尚無專案<br><span style="font-size:11px;">先到側欄「＋ 新增專案」建立</span></div>`;
    return;
  }
  // active project（session 狀態，不存 localStorage）
  if (!this.pdcaActiveProject || !projects.some(p => p.id === this.pdcaActiveProject)) {
    this.pdcaActiveProject = projects[0].id;
  }
  const active = projects.find(p => p.id === this.pdcaActiveProject);

  const tabsHtml = projects.map(p => `
    <button class="pdca-tab ${p.id === active.id ? 'active' : ''}" onclick="App.selectPdcaProject('${p.id}')">
      <span class="pdca-tab-dot" style="background:${p.color}"></span>
      <span class="pdca-tab-name">${U.esc(p.name)}${p.synced ? ' 🔗' : ''}</span>
      <span class="pdca-tab-light">${this.computePdcaStatus(p).light}</span>
    </button>`).join('');

  host.innerHTML = `
    <div class="view-tabs-bar">${this.buildReportTabsHtml()}</div>
    <div class="pdca-toolbar"><button class="tb-action" onclick="App.exportPdcaReport()">📄 匯出月報</button></div>
    <div class="pdca-tabs">${tabsHtml}</div>
    ${this.buildPdcaPanelHtml(active)}
  `;
};

App.selectPdcaProject = function(id) {
  this.pdcaActiveProject = id;
  this.renderPdca();
};

// ─── PDCA 月報匯出（單頁 HTML，Blob URL 開新分頁；進度/燈號沿用 computePdcaStatus / pdcaGroupLight）───
App.exportPdcaReport = function() {
  const projects = DATA.projects || [];
  const today = D.fmt(D.today(), 'ymd');
  const esc = U.esc;
  const pct = v => (v == null) ? '未設定' : Math.round(v) + '%';
  const diffStr = d => (d == null) ? '未設定' : (d >= 0 ? '+' : '') + Math.round(d) + '%';
  const dot = l => `<span class="pr-dot pr-dot-${l === '🟢' ? 'g' : l === '🟡' ? 'y' : l === '🔴' ? 'r' : 'w'}"></span>`;
  const rating = st => {
    if (st.actual == null || st.expected == null) return '⚪ 未設定 — 時程待補';
    const x = Math.abs(Math.round(st.diff));
    if (st.diff >= -5) return '綠燈 — 符合預期';
    if (st.diff > -20) return '黃燈 — 落後' + x + '%，需加強管控';
    return '紅燈 — 嚴重落後' + x + '%';
  };

  // 燈號分組收集（專案層 computePdcaStatus；計數用 groups.x.length 取得）
  const groups = { r: [], y: [], g: [], w: [] };
  projects.forEach(p => {
    const l = this.computePdcaStatus(p).light;
    if (l === '🔴') groups.r.push(p);
    else if (l === '🟡') groups.y.push(p);
    else if (l === '🟢') groups.g.push(p);
    else groups.w.push(p);
  });

  // (a) 專案卡片（函式化，給分組重用）
  const cardOf = p => {
    const st = this.computePdcaStatus(p), d = p.pdcaData || {};
    return `<div class="pr-pcard" style="--bar:${p.color}">
      <div class="pr-pcard-head">${dot(st.light)}<span class="pr-pcard-name">${esc(p.name)}</span></div>
      <div class="pr-pcard-stats"><span>實際 ${pct(st.actual)}</span><span>預期 ${pct(st.expected)}</span><span>差異 ${diffStr(st.diff)}</span><span>可販日 ${esc(d.targetDate || '—')}</span></div>
    </div>`;
  };
  const groupSection = (dotIcon, title, arr) => arr.length ? `
    <div class="pr-group-label">${dot(dotIcon)}<span>${title}</span><span class="pr-group-count">${arr.length} 項</span></div>
    <div class="pr-project-cards">${arr.map(cardOf).join('')}</div>` : '';

  // 延遲卡（縱切後同專案內，不再顯示專案名 .pr-delay-proj）
  const delayCardOf = x => {
    const m = x.meta, dd = this.pdcaDelayDays(m);
    return `<div class="pr-delay-card ${x.light === '🔴' ? 'pr-red' : 'pr-yellow'}">
      <div class="pr-delay-head">${dot(x.light)}<b>${esc(x.n)}</b></div>
      <div class="pr-delay-body">
        <div><label>工作內容</label>${esc(m.workContent || '—')}</div>
        <div><label>實際開始</label>${esc(m.actualStart || '—')}</div>
        <div><label>預計完成</label>${esc(m.targetDate || '—')}</div>
        <div><label>落後天數</label><span class="pr-delay-days">${dd > 0 ? dd + ' 天' : '—'}</span></div>
        <div><label>影響可販日</label>${m.affectsLaunch ? '<span class="pr-affect">是</span>' : '否'}</div>
        <div><label>落後原因</label>${esc(m.delayReason || '—')}</div>
        <div><label>補回計畫</label>${esc(m.recoveryMethod || '—')}${m.recoveryDate ? '（目標 ' + esc(m.recoveryDate) + '）' : ''}</div>
      </div>
    </div>`;
  };

  // (b) 縱切：每專案一個 .pr-project-block（WBS 表 + 該專案延遲卡）
  const blocksHtml = projects.map(p => {
    const st = this.computePdcaStatus(p), d = p.pdcaData || {};
    const groups = this.getPdcaGroups(p.id);                          // 一次算，WBS + delay 共用
    const names = Object.keys(groups).filter(n => n !== '(未歸類)').sort((a, b) => a.localeCompare(b, 'zh-Hant'));

    // WBS 表 rows
    const rows = names.map(n => {
      const meta = this.getPdcaGroupMeta(p.id, n);
      return `<tr><td>${dot(this.pdcaGroupLight(groups[n]))}</td><td>${esc(n)}</td><td>${esc(meta.owner || '—')}</td><td>${esc(meta.recoveryMethod || '—')}</td></tr>`;
    }).join('') || `<tr><td colspan="4" class="pr-empty">無大項目</td></tr>`;

    // 該專案的延遲卡（只篩這個專案的黃/紅，紅排前）
    const myDelays = names
      .map(n => ({ p, n, meta: this.getPdcaGroupMeta(p.id, n), light: this.pdcaGroupLight(groups[n]) }))
      .filter(x => x.light === '🟡' || x.light === '🔴')
      .sort((a, b) => (a.light === '🔴' ? 0 : 1) - (b.light === '🔴' ? 0 : 1));
    const delaysInner = myDelays.length
      ? myDelays.map(delayCardOf).join('')
      : `<div class="pr-empty">本專案無延遲項目</div>`;

    return `<div class="pr-project-block" style="--bar:${p.color}">
      <div class="pr-block-head">${dot(st.light)}<span class="pr-pcard-name">${esc(p.name)}</span><span class="pr-block-rating">${rating(st)}</span><span class="pr-timeline">${esc(d.startDate || '—')} → ${esc(d.targetDate || '—')}</span></div>
      <div class="pr-summary">${esc(d.summary || '—')}</div>
      <table class="pr-group-table"><thead><tr><th>燈號</th><th>大項目</th><th>負責</th><th>補回計畫</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="pr-block-delays"><div class="pr-block-subtitle">延遲項目 · 需補回計畫</div>${delaysInner}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>開發部 PDCA 月報 ${today}</title>
<style>${this._pdcaReportCss()}</style></head><body>
<button class="pr-print-btn" onclick="window.print()">🖨 列印 / 存 PDF</button>
<div class="pr-report">
  <section class="pr-cover">
    <h1 class="pr-title">開發部 PDCA 月報</h1>
    <div class="pr-cover-date">${today}</div>
    <div class="pr-legend">
      <span>${dot('🟢')}符合預期(差異≥−5%)</span>
      <span>${dot('🟡')}落後(−20%~−5%)</span>
      <span>${dot('🔴')}嚴重落後(≤−20%)</span>
      <span>${dot('⚪')}未設定</span>
    </div>
    <div class="pr-formula">計算方式 ｜ 實際% = 各大項目完成率平均×100（完成率=done÷總任務，排除未歸類） ｜ 預期% = (今天−開始日)÷(可販日−開始日)，限 0~100% ｜ 差異 = 實際% − 預期%</div>
    ${groupSection('🔴', '嚴重落後 · 需優先處理', groups.r)}
    ${groupSection('🟡', '落後 · 需加強管控', groups.y)}
    ${groupSection('🟢', '符合預期', groups.g)}
    ${groupSection('⚪', '時程未設定', groups.w)}
  </section>
  <section class="pr-blocks">${blocksHtml}</section>
</div></body></html>`;

  window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
};

// 月報樣式（暫時最小版；等使用者提供正式單頁 CSS 後替換此函式回傳值）
App._pdcaReportCss = function() {
  return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Microsoft JhengHei","PingFang TC",-apple-system,sans-serif;color:#2B2B28;background:#EDE9E0;line-height:1.5;padding:32px 16px}
.pr-report{max-width:880px;margin:0 auto}

/* 列印按鈕 */
.pr-print-btn{position:fixed;top:20px;right:20px;z-index:10;background:#3A7D5C;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.pr-print-btn:hover{background:#2F6B4D}

/* 區塊標題 */
.pr-sec-title{font-size:18px;font-weight:600;margin:28px 0 14px;padding-bottom:6px;border-bottom:2px solid #D8D2C4;color:#2B2B28}

/* 封面 */
.pr-cover{background:#fff;border:1px solid #E2DDD0;border-radius:12px;padding:28px 30px;margin-bottom:8px}
.pr-title{font-size:26px;font-weight:700;letter-spacing:.5px}
.pr-cover-date{font-size:13px;color:#8A8577;margin-top:4px}
.pr-legend{font-size:12px;color:#8A8577;margin:14px 0 4px;padding-bottom:12px;border-bottom:1px solid #EEEAE0;display:flex;flex-wrap:wrap;gap:6px 16px}
.pr-legend span{white-space:nowrap}
.pr-formula{font-size:11px;color:#6B665A;margin:10px 0 4px;line-height:1.6;padding:8px 11px;background:#F6F3EC;border-radius:8px}
.pr-group-label{display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-size:14px;font-weight:600}
.pr-group-count{font-size:12px;color:#8A8577;font-weight:400}

/* 燈號點 */
.pr-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle;flex:none}
.pr-dot-g{background:#1D9E75}
.pr-dot-y{background:#EF9F27}
.pr-dot-r{background:#E24B4A}
.pr-dot-w{background:#C9C4B6}

/* 專案進度卡片 grid */
.pr-project-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:16px}
.pr-pcard{background:#fff;border:1px solid #E2DDD0;border-left:3px solid var(--bar,#C9C4B6);border-radius:0 10px 10px 0;padding:14px 16px}
.pr-pcard-head{display:flex;align-items:center;font-weight:600;font-size:15px;margin-bottom:9px}
.pr-pcard-name{vertical-align:middle}
.pr-pcard-stats{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#5C5849}
.pr-pcard-stats span{white-space:nowrap}

/* 專案區塊（縱切：每專案 WBS 表 + 延遲卡） */
.pr-project-block{background:#fff;border:1px solid #E2DDD0;border-left:3px solid var(--bar,#C9C4B6);border-radius:0 10px 10px 0;padding:18px 20px;margin-bottom:14px}
.pr-block-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.pr-block-head .pr-pcard-name{font-size:17px;font-weight:600}
.pr-block-rating{font-size:13px;color:#5C5849}
.pr-timeline{font-size:12px;color:#8A8577}
.pr-summary{font-size:13px;color:#5C5849;background:#F6F3EC;padding:9px 12px;border-radius:8px;margin:10px 0 14px;line-height:1.6}
.pr-group-table{width:100%;border-collapse:collapse;font-size:13px}
.pr-group-table th{text-align:left;font-weight:600;color:#6B665A;padding:7px 8px;border-bottom:1px solid #D8D2C4;font-size:12px}
.pr-group-table td{padding:8px;border-bottom:1px solid #EEEAE0;color:#3D3A32;vertical-align:top}
.pr-group-table tr:last-child td{border-bottom:none}
.pr-empty{color:#A8A293;font-style:italic}

/* 延遲項目卡片（縱切：放在各專案區塊內） */
.pr-block-delays{margin-top:14px;border-top:1px solid #EEEAE0;padding-top:12px}
.pr-block-subtitle{font-size:13px;font-weight:600;color:#854F0B;margin-bottom:8px}
.pr-delay-card{background:#fff;border:1px solid #E2DDD0;border-left:3px solid #C9C4B6;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:10px}
.pr-delay-card.pr-red{border-left-color:#E24B4A;background:#FCEFEF}
.pr-delay-card.pr-yellow{border-left-color:#EF9F27;background:#FBF4E6}
.pr-delay-head{display:flex;justify-content:flex-start;align-items:baseline;margin-bottom:10px;gap:10px}
.pr-delay-head b{font-size:15px;font-weight:600}
.pr-delay-body{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px;align-items:baseline}
.pr-delay-body>div{display:contents}
.pr-delay-body label{color:#8A8577;font-size:12px;white-space:nowrap}
.pr-delay-days{font-weight:600;color:#C0392B}
.pr-affect{font-weight:600;color:#C0392B}

/* 列印 */
@media print{
  @page{margin:14mm}
  body{background:#fff;padding:0;color:#000}
  .pr-print-btn{display:none}
  .pr-report{max-width:none}
  .pr-cover,.pr-pcard,.pr-project-block,.pr-delay-card{box-shadow:none;border-color:#ccc;break-inside:avoid;page-break-inside:avoid}
  .pr-delay-card.pr-red,.pr-delay-card.pr-yellow{background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pr-dot{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
  `;
};

App.buildPdcaPanelHtml = function(project) {
  const d = project.pdcaData || {};
  const st = this.computePdcaStatus(project);
  const pct = v => (v === null || v === undefined) ? '未設定' : Math.round(v) + '%';
  const diffStr = (st.diff === null || st.diff === undefined) ? '未設定' : (st.diff >= 0 ? '+' : '') + Math.round(st.diff) + '%';
  return `
    <div class="pdca-panel">
      <div class="pdca-timeline">
        <div class="pdca-field"><label>開始日</label><input type="date" value="${d.startDate || ''}" onchange="App.updatePdcaDate('start', this.value)"></div>
        <div class="pdca-field"><label>可販日</label><input type="date" value="${d.targetDate || ''}" onchange="App.updatePdcaDate('target', this.value)"></div>
      </div>
      <div class="stats-row pdca-stats">
        <div class="stat" title="實際% = 各大項目完成率平均 ×100（完成率=done÷總任務，排除未歸類）"><div class="stat-num">${pct(st.actual)}</div><div class="stat-label">實際進度</div><div class="stat-formula">各項完成率平均×100</div></div>
        <div class="stat" title="預期% = (今天−開始日)÷(可販日−開始日)，限 0~100%"><div class="stat-num">${pct(st.expected)}</div><div class="stat-label">預期進度</div><div class="stat-formula">(今天−開始)÷(可販−開始)</div></div>
        <div class="stat" title="差異 = 實際% − 預期%"><div class="stat-num">${diffStr}</div><div class="stat-label">差異</div><div class="stat-formula">實際−預期</div></div>
        <div class="stat"><div class="stat-num">${st.light}</div><div class="stat-label">燈號</div></div>
      </div>
      <div class="pdca-summary">
        <label>整體摘要</label>
        <textarea rows="2" placeholder="整體狀態說明，例：進入手工機收尾、性試 DVT 啟動" onchange="App.updatePdcaSummary(this.value)">${U.esc(d.summary || '')}</textarea>
      </div>
      <div class="pdca-groups">
        <div class="pdca-groups-head">大項目</div>
        ${this.buildPdcaGroupsHtml(project)}
      </div>
    </div>
  `;
};

App.updatePdcaDate = function(which, val) {
  const p = (DATA.projects || []).find(x => x.id === this.pdcaActiveProject);
  if (!p) return;
  ensurePdcaData(p);
  if (which === 'start') p.pdcaData.startDate = val;
  else p.pdcaData.targetDate = val;
  Storage.save();
  this.renderPdca();
};

App.updatePdcaSummary = function(val) {
  const p = (DATA.projects || []).find(x => x.id === this.pdcaActiveProject);
  if (!p) return;
  ensurePdcaData(p);
  p.pdcaData.summary = val;
  Storage.save();
};

// 把專案任務依 pdcaGroup 動態聚合成大項目（""＝(未歸類)）
App.getPdcaGroups = function(projectId) {
  const out = {};
  (DATA.tasks || []).forEach(t => {
    if (t.project !== projectId || t._deleted) return;
    const g = (typeof t.pdcaGroup === 'string' && t.pdcaGroup.trim()) ? t.pdcaGroup : '(未歸類)';
    (out[g] || (out[g] = [])).push(t);
  });
  return out;
};

// 把專案任務依 PLM 階段(task.stage)分桶，算每階段日期範圍 + 數量，依階段名數字前綴排序。供階段下拉用。
// 日期走 getEffectiveSchedule 顯示優先序(override>actual>scheduled>planned)；.start==='' 的項目排除，不汙染 min/max。
// 純算：不碰 UI/渲染/引擎/applySchedule。ISO 'YYYY-MM-DD' 字串可直接字典序比較＝時序比較。
// @return [{ stageId, name, earliestStart, latestEnd, itemCount }]；空階段(無有日期項目) earliest/latest = null
// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
App.getProjectStages = function(projectId) {
  const NO_STAGE = '未分階段';
  const buckets = {};   // { 階段名: [tasks] }
  (DATA.tasks || []).forEach(t => {
    if (t.project !== projectId || t._deleted) return;
    const s = (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : NO_STAGE;
    (buckets[s] || (buckets[s] = [])).push(t);
  });
  const isAlt = (nm) => /\([\d.]+\)\s*$/.test(nm);
  const stages = Object.keys(buckets).map(name => {
    let earliestStart = null, latestEnd = null, doneCount = 0;
    buckets[name].forEach(t => {
      if (t.status === 'done') doneCount++;
      const sch = getEffectiveSchedule(t);
      if (sch && sch.start && (!earliestStart || sch.start < earliestStart)) earliestStart = sch.start;
      if (sch && sch.end   && (!latestEnd   || sch.end   > latestEnd))       latestEnd   = sch.end;
    });
    return { stageId: name, name, earliestStart, latestEnd,
             itemCount: buckets[name].length, doneCount, group: isAlt(name) ? 'alt' : 'main' };
  });
  // 排序：階段名數字前綴(parseFloat，"10." 排在 "2." 後)；無前綴(NaN，如「未分階段」)排最後
  const numOf = st => { const n = parseFloat(st.name); return isNaN(n) ? Infinity : n; };
  stages.sort((a, b) => numOf(a) - numOf(b) || a.name.localeCompare(b.name));
  return stages;
};

// 大項目燈號：任一過期未完成→🔴；完成率>50%→🟢；其餘→🟡；無任務→⚪
App.pdcaGroupLight = function(tasks) {
  if (!tasks || tasks.length === 0) return '⚪';
  const today = D.today();
  const overdue = tasks.some(t => {
    if (t.status === 'done') return false;
    const end = getEffectiveSchedule(t).end;
    return end && new Date(end) < today;
  });
  if (overdue) return '🔴';
  const done = tasks.filter(t => t.status === 'done').length;
  return (done / tasks.length > 0.5) ? '🟢' : '🟡';
};

// 專案整體 PDCA 狀態：實際進度=各大項目進度平均(排除「(未歸類)」)、預期進度=時間軸比例、燈號
App.computePdcaStatus = function(project) {
  const d = project.pdcaData || {};
  const groups = this.getPdcaGroups(project.id);
  const realNames = Object.keys(groups).filter(n => n !== '(未歸類)');
  let actual = null;
  if (realNames.length > 0) {
    let sum = 0;
    realNames.forEach(n => {
      const tasks = groups[n];
      const done = tasks.filter(t => t.status === 'done').length;
      sum += tasks.length > 0 ? done / tasks.length : 0;
    });
    actual = (sum / realNames.length) * 100;
  }
  let expected = null;
  if (d.startDate && d.targetDate) {
    const start = new Date(d.startDate).getTime();
    const target = new Date(d.targetDate).getTime();
    const today = D.today().getTime();
    if (target > start) {
      expected = Math.max(0, Math.min(1, (today - start) / (target - start))) * 100;
    }
  }
  let diff = null, light = '⚪';
  if (actual !== null && expected !== null) {
    diff = actual - expected;
    if (diff >= -5) light = '🟢';
    else if (diff > -20) light = '🟡';
    else light = '🔴';
  }
  return { actual, expected, diff, light };
};

// 大項目落後天數：override 優先；否則 targetDate 過期才算正數天數，未過期=0
App.pdcaDelayDays = function(meta) {
  if (meta.delayDaysOverride != null) return meta.delayDaysOverride;
  if (!meta.targetDate) return 0;
  const diff = Math.floor((D.today() - new Date(meta.targetDate)) / 86400000);
  return diff > 0 ? diff : 0;
};

// 大項目附加資料（唯讀取值，帶預設；實際寫入走 updatePdcaGroupMeta）
App.getPdcaGroupMeta = function(projectId, groupName) {
  const m = ((DATA.pdcaGroups || {})[projectId] || {})[groupName] || {};
  return {
    level: m.level || 'med',
    owner: m.owner || '',
    note: m.note || '',
    workContent: m.workContent || '',
    actualStart: m.actualStart || '',
    targetDate: m.targetDate || '',
    delayDaysOverride: (m.delayDaysOverride != null ? m.delayDaysOverride : null),
    delayReason: m.delayReason || '',
    recoveryMethod: m.recoveryMethod || m.recoveryPlan || '',   // fallback 舊欄位 recoveryPlan
    recoveryDate: m.recoveryDate || '',
    affectsLaunch: m.affectsLaunch === true,
  };
};

App.updatePdcaGroupMeta = function(el, field) {
  const projectId = el.dataset.pproj, groupName = el.dataset.pgroup;
  if (!projectId || groupName === undefined) return;
  ensurePdcaGroupsRoot();
  if (!DATA.pdcaGroups[projectId]) DATA.pdcaGroups[projectId] = {};
  const g = DATA.pdcaGroups[projectId][groupName] ||
    (DATA.pdcaGroups[projectId][groupName] = {
      level: 'med', owner: '', note: '',
      workContent: '', actualStart: '', targetDate: '',
      delayDaysOverride: null, delayReason: '',
      recoveryMethod: '', recoveryDate: '', affectsLaunch: false,
    });
  g[field] = (el.type === 'checkbox') ? el.checked : el.value;
  Storage.save();
};

App.togglePdcaSubtasks = function(btn) {
  const card = btn.closest('.pdca-group');
  if (!card) return;
  const list = card.querySelector('.pdca-subtasks');
  if (!list) return;
  const open = list.classList.toggle('open');
  btn.textContent = open ? '▴ 收合子任務' : '▾ 展開子任務';
  // 記住展開狀態，renderPdca 重繪後由 buildPdcaGroupCard 還原
  if (!this._pdcaOpenGroups) this._pdcaOpenGroups = new Set();
  const key = (card.dataset.pproj || '') + '::' + (card.dataset.pgroup || '');
  if (open) this._pdcaOpenGroups.add(key); else this._pdcaOpenGroups.delete(key);
};

// 子任務改歸類：只寫 task.pdcaGroup（歸類標籤），不碰 name/status/estHours/時程，不碰 WBS 同步
App.updatePdcaTaskGroup = function(el) {
  const taskId = el.dataset.task;
  const t = (DATA.tasks || []).find(x => x.id === taskId && !x._deleted);
  if (!t) return;
  t.pdcaGroup = el.value;   // '' = 移除歸類（歸到「(未歸類)」）
  Storage.save();
  this.renderPdca();
};

// 任務 modal 的 PDCA 大項目 datalist：該專案既有的大項目（pdcaGroups key ∪ 任務實際用到的）
App.pdcaGroupDatalistOptions = function(projectId) {
  const set = new Set();
  Object.keys((DATA.pdcaGroups || {})[projectId] || {}).forEach(g => set.add(g));
  (DATA.tasks || []).forEach(x => {
    if (x.project === projectId && !x._deleted && typeof x.pdcaGroup === 'string' && x.pdcaGroup.trim()) set.add(x.pdcaGroup);
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map(g => `<option value="${U.esc(g)}"></option>`).join('');
};

// M2-2a：任務表單 stage/subgroup datalist——掃該專案任務既有值（trim 非空才收，收 trim 後值統一口徑）。
// 「未分階段」是 getProjectStages 顯示層分桶代稱、task.stage 不存此字面值，故 trim 過濾即足、不特判
// （特判反而會吞掉使用者真打的同名值）。共用核心+薄包裝：兩欄只差欄位名，不重複原則。
function taskFieldDatalistOptions(projectId, field) {
  const set = new Set();
  (DATA.tasks || []).forEach(x => {
    if (x.project === projectId && !x._deleted && typeof x[field] === 'string' && x[field].trim()) set.add(x[field].trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map(s => `<option value="${U.esc(s)}"></option>`).join('');
}
App.stageDatalistOptions = function(projectId) { return taskFieldDatalistOptions(projectId, 'stage'); };
App.subgroupDatalistOptions = function(projectId) { return taskFieldDatalistOptions(projectId, 'subgroup'); };

App.buildPdcaGroupsHtml = function(project) {
  const groups = this.getPdcaGroups(project.id);
  const names = Object.keys(groups);
  if (names.length === 0) return `<div class="pdca-no-groups">此專案尚無任務</div>`;
  names.sort((a, b) => {
    if (a === '(未歸類)') return 1;
    if (b === '(未歸類)') return -1;
    return a.localeCompare(b, 'zh-Hant');
  });
  return names.map(name => this.buildPdcaGroupCard(project, name, groups[name])).join('');
};

App.buildPdcaGroupCard = function(project, name, tasks) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const light = this.pdcaGroupLight(tasks);
  const isUnclassified = (name === '(未歸類)');
  const today = D.today();

  // 該專案所有大項目（供子任務改歸類下拉用，排除「(未歸類)」）
  const allGroupNames = Object.keys(this.getPdcaGroups(project.id))
    .filter(n => n !== '(未歸類)')
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  // 展開狀態還原（togglePdcaSubtasks 記在 _pdcaOpenGroups）
  const isOpen = !!(this._pdcaOpenGroups && this._pdcaOpenGroups.has(project.id + '::' + name));

  const subtasks = tasks.map(t => {
    const end = getEffectiveSchedule(t).end;
    const overdue = end && new Date(end) < today && t.status !== 'done';
    const inGroup = t.pdcaGroup && allGroupNames.includes(t.pdcaGroup) ? t.pdcaGroup : '';
    const regroup = `<select class="pst-regroup" data-task="${U.esc(t.id)}" onchange="App.updatePdcaTaskGroup(this)">
      ${allGroupNames.map(g => `<option value="${U.esc(g)}" ${inGroup === g ? 'selected' : ''}>${U.esc(g)}</option>`).join('')}
      <option value="" ${inGroup === '' ? 'selected' : ''}>— 未歸類 —</option>
    </select>`;
    return `<div class="pdca-subtask">
      <span class="pst-name">${U.esc(t.name)}</span>
      <span class="pst-deadline ${overdue ? 'overdue' : ''}">${end ? D.fmt(end, 'ymdShort') : '—'}</span>
      <span class="pst-status">${LABELS.status[t.status] || t.status || ''}</span>
      <span class="pst-owner">${U.esc(t.owner || '')}</span>
      ${regroup}
    </div>`;
  }).join('');

  let metaHtml;
  if (isUnclassified) {
    metaHtml = `<div class="pdca-group-hint">這些任務尚未歸類到大項目 — 到任務編輯設定「PDCA 大項目」</div>`;
  } else {
    const meta = this.getPdcaGroupMeta(project.id, name);
    const gAttr = `data-pproj="${project.id}" data-pgroup="${U.esc(name)}"`;
    metaHtml = `<div class="pdca-group-meta">
      <label class="pgm-level">等級
        <select ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'level')">
          <option value="high" ${meta.level==='high'?'selected':''}>🔴 high</option>
          <option value="med" ${meta.level==='med'?'selected':''}>🟠 med</option>
          <option value="low" ${meta.level==='low'?'selected':''}>🟡 low</option>
        </select>
      </label>
      <label class="pgm-owner">負責人
        <input type="text" value="${U.esc(meta.owner)}" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'owner')">
      </label>
      <label class="pgm-work">工作內容
        <textarea rows="2" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'workContent')">${U.esc(meta.workContent)}</textarea>
      </label>
      <label class="pgm-date">實際開始
        <input type="date" value="${U.esc(meta.actualStart)}" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'actualStart')">
      </label>
      <label class="pgm-date">預計完成
        <input type="date" value="${U.esc(meta.targetDate)}" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'targetDate')">
      </label>
      <label class="pgm-reason">落後原因
        <textarea rows="2" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'delayReason')">${U.esc(meta.delayReason)}</textarea>
      </label>
      <label class="pgm-recovery">補回計畫
        <textarea rows="2" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'recoveryMethod')">${U.esc(meta.recoveryMethod)}</textarea>
      </label>
      <label class="pgm-date">補回目標日
        <input type="date" value="${U.esc(meta.recoveryDate)}" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'recoveryDate')">
      </label>
      <label class="pgm-affect">
        <input type="checkbox" ${meta.affectsLaunch ? 'checked' : ''} ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'affectsLaunch')">影響可販日
      </label>
    </div>`;
  }

  return `<div class="pdca-group" data-pproj="${project.id}" data-pgroup="${U.esc(name)}">
    <div class="pdca-group-head">
      <span class="pdca-group-light">${light}</span>
      <span class="pdca-group-name">${U.esc(name)}</span>
      <span class="pdca-group-progress">${done}/${total} 完成</span>
    </div>
    ${metaHtml}
    <button class="pdca-expand-btn" onclick="App.togglePdcaSubtasks(this)">${isOpen ? '▴ 收合子任務' : '▾ 展開子任務'}</button>
    <div class="pdca-subtasks${isOpen ? ' open' : ''}">${subtasks || '<div class="pst-empty">無子任務</div>'}</div>
  </div>`;
};

// ═══════════════════════════════════════════════════════
//  PAGE: SETTINGS
// ═══════════════════════════════════════════════════════
App.renderSettings = function() {
  const s = DATA.settings;
  const log = JSON.parse(localStorage.getItem(STORE.syncLog) || '{}');
  const syncOk = !!log.syncedAt;

  document.getElementById('page-settings').innerHTML = `
    <div class="settings-grid">

      <!-- Sync (WBS 同步：僅 admin 顯示) -->
      ${isAdmin() ? `
      <div class="settings-section" id="settings-jsync">
        <div class="ss-title">🔗 ${CFG('WBS_LABEL', 'WBS')} WBS 同步 <span style="font-size:11px; background:var(--sage-100); color:var(--sage-700); padding:2px 8px; border-radius:10px; margin-left:8px;">👑 ADMIN</span></div>
        <div class="ss-desc">從公司「${CFG('WBS_LABEL', 'WBS')}整合 WBS」Sheet 唯讀同步任務（每天 2 次 + 同步後自動執行智慧排程）<br>
          <span style="color:var(--ink4); font-size:11.5px;">⚠️ 僅限${CFG('COMPANY_NAME', 'My Company')}使用，需 ${CFG('WBS_LABEL', 'WBS')} Sheet 的讀取權限</span>
        </div>

        ${s.jSheetUrl ? `<div class="sync-status ${syncOk ? '' : 'error'}">
          <div class="sync-pulse"></div>
          <div class="sync-status-text">
            ${syncOk ? `<b>已同步</b> · ${log.count || 0} 個任務` : '<b>未同步</b> · 請點「立即同步」測試'}
          </div>
          <div class="sync-status-time">${syncOk ? D.fmt(new Date(log.syncedAt),'md') + ' ' + new Date(log.syncedAt).toTimeString().slice(0,5) : ''}</div>
        </div>` : ''}

        <div class="ss-field">
          <label>${CFG('WBS_LABEL', 'WBS')} Apps Script URL</label>
          <div>
            <input type="text" id="set-url" value="${U.esc(s.jSheetUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec  (${CFG('WBS_LABEL', 'WBS')} WBS API)" style="font-family:var(--mono); font-size:11px;">
            <div class="help">由你或 RD 部署 Apps Script 後取得（部署方式見 README）</div>
          </div>
        </div>

        <div class="ss-field">
          <label>每日同步時間</label>
          <div>
            <div class="time-range">
              <input type="time" id="set-st1" value="${s.syncTimes?.[0] || '09:00'}">
              <span>+</span>
              <input type="time" id="set-st2" value="${s.syncTimes?.[1] || '14:00'}">
            </div>
            <div class="help">同步完成後會自動執行智慧排程</div>
          </div>
        </div>

        <div class="ss-field">
          <label>自動同步</label>
          <div>
            <select id="set-autosync">
              <option value="true" ${s.autoSyncEnabled ? 'selected' : ''}>啟用</option>
              <option value="false" ${!s.autoSyncEnabled ? 'selected' : ''}>停用（手動）</option>
            </select>
            <div class="help">頁面要開著才會自動同步</div>
          </div>
        </div>

        <div class="ss-field">
          <label>兩週預告</label>
          <div>
            <select id="set-preview">
              <option value="2" ${s.previewWeeks === 2 ? 'selected' : ''}>啟用：14 天內 deadline 出現提示</option>
              <option value="1" ${s.previewWeeks === 1 ? 'selected' : ''}>啟用：7 天內</option>
              <option value="0" ${s.previewWeeks === 0 ? 'selected' : ''}>停用</option>
            </select>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:8px; align-items:center;">
          <button class="tb-action" onclick="App.saveAndSync()">↻ 儲存設定並立即同步</button>
          <button class="tb-action ghost" onclick="App.resetAllJOverrides()">↺ 重置所有 ${CFG('WBS_LABEL', 'WBS')}本地時程</button>
        </div>

        <div class="tip" style="margin-top:14px;">
          <b>同步邏輯說明：</b><br>
          • ${CFG('WBS_LABEL', 'WBS')}任務在 ${CFG('APP_NAME', 'PM-Core')} 為<b>唯讀</b>，如需修改請至 Google Sheet<br>
          • 衝突原則：<b>以 Sheet 為準</b>，本地修改會被覆蓋<br>
          • 同步完成後<b>自動執行智慧排程</b>，確保資料一致<br>
          • 已完成任務同步進「已完成」區，超過 ${s.doneRetentionDays} 天自動清除
        </div>
      </div>
      ` : ''}

      <!-- Work schedule -->
      <div class="settings-section">
        <div class="ss-title">⏰ 工時與排程</div>
        <div class="ss-desc">設定你的工作節奏，產生智慧排程時依此規則</div>

        <div class="ss-field">
          <label>每日可用工時</label>
          <div>
            <input type="number" id="set-hours" value="${s.dailyHours}" min="1" max="12" step="0.5">
            <div class="help">扣掉雜事休息後實際能做任務的時間</div>
          </div>
        </div>

        <div class="ss-field">
          <label>上午時段</label>
          <div>
            <div class="time-range">
              <input type="time" id="set-ws1" value="${s.workStart1}">
              <span>到</span>
              <input type="time" id="set-we1" value="${s.workEnd1}">
            </div>
          </div>
        </div>

        <div class="ss-field">
          <label>下午時段</label>
          <div>
            <div class="time-range">
              <input type="time" id="set-ws2" value="${s.workStart2}">
              <span>到</span>
              <input type="time" id="set-we2" value="${s.workEnd2}">
            </div>
          </div>
        </div>

        <div class="ss-field">
          <label>黃金時段</label>
          <div>
            <select id="set-golden">
              <option value="morning" ${s.goldenTime === 'morning' ? 'selected' : ''}>上午（深度工作優先）</option>
              <option value="afternoon" ${s.goldenTime === 'afternoon' ? 'selected' : ''}>下午</option>
              <option value="none" ${s.goldenTime === 'none' ? 'selected' : ''}>不需要規則</option>
            </select>
          </div>
        </div>

        <div class="ss-field">
          <label>工作日</label>
          <div>
            <div class="day-pills" id="dayPills">
              ${[1,2,3,4,5,6,0].map(d => {
                const name = ['日','一','二','三','四','五','六'][d];
                return `<button class="day-pill ${s.workDays.includes(d) ? 'on' : ''}" data-day="${d}"
                              onclick="this.classList.toggle('on')">${name}</button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="ss-field">
          <label>任務切分閾值 (h)</label>
          <div>
            <input type="number" id="set-split" value="${s.splitThreshold}" min="1" max="12" step="0.5">
            <div class="help">超過此工時的任務會自動切分到多天</div>
          </div>
        </div>
      </div>

      <!-- Personal -->
      <div class="settings-section">
        <div class="ss-title">📝 個人資訊</div>
        <div class="ss-desc">用於週報抬頭</div>

        <div class="ss-field">
          <label>姓名</label>
          <div><input type="text" id="set-uname" value="${U.esc(s.userName || '')}"></div>
        </div>

        <div class="ss-field">
          <label>部門</label>
          <div><input type="text" id="set-dept" value="${U.esc(s.department || '')}" placeholder="e.g. 研發部"></div>
        </div>
      </div>

      <!-- 會議模板 -->
      <div class="settings-section">
        <div class="ss-title">📅 定期事件（會議 / 打掃 等）</div>
        <div class="ss-desc">智慧排程會自動避開這些時段，包含每天、每週、每隔一週、每隔兩週的事件</div>

        <!-- 每週固定事件 -->
        <div style="margin:14px 0 8px 0; font-size:13px; font-weight:600; color:var(--ink2);">
          ⏰ 定期事件
          <button class="tb-action ghost" onclick="App.addRecurringMeeting()" style="font-size:11px; padding:3px 9px; margin-left:8px;">＋ 新增</button>
        </div>
        <div id="recurringMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden;">
          ${this.buildRecurringMeetingsHtml()}
        </div>

        <!-- 特定日期事件 -->
        <div style="margin:18px 0 8px 0; font-size:13px; font-weight:600; color:var(--ink2);">
          📌 特定日期事件
          <button class="tb-action ghost" onclick="App.addSpecialMeeting()" style="font-size:11px; padding:3px 9px; margin-left:8px;">＋ 新增</button>
          <span style="font-size:10.5px; color:var(--ink3); font-weight:400; margin-left:8px;">如試作會議、PDCA、新品發表會、營業會議等</span>
        </div>
        <div id="specialMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:280px; overflow-y:auto;">
          ${this.buildSpecialMeetingsHtml()}
        </div>
      </div>

      <!-- Google OAuth + 白名單 -->
      <div class="settings-section">
        <div class="ss-title">🔐 Google 登入</div>
        <div class="ss-desc">用 Google 帳號登入，資料以 Gmail 區分，各使用者完全獨立</div>

        ${s._loggedInEmail ? `
        <div class="sync-status" style="margin-bottom:14px;">
          <div class="sync-pulse"></div>
          <div class="sync-status-text">
            目前登入：<b>${U.esc(s._loggedInEmail)}</b>${isAdmin() ? ' <span style="font-size:10.5px; background:var(--sage-100); color:var(--sage-700); padding:1px 6px; border-radius:8px; margin-left:6px;">👑 ADMIN</span>' : ''}
          </div>
          <button class="tb-action ghost" onclick="App.googleSignOut()" style="font-size:11px; padding:4px 10px;">登出</button>
        </div>` : ''}

        ${isAdmin() ? `
        <div class="ss-field">
          <label>Google OAuth Client ID <span style="font-size:10.5px; color:var(--ink4);">(admin only)</span></label>
          <div>
            <input type="text" id="set-gci" value="${U.esc(s.googleClientId || '')}" placeholder="留空 = 使用內建預設 Client ID" style="font-family:var(--mono); font-size:11px;">
            <div class="help">
              留空時自動使用內建預設值（同事零設定即可登入）<br>
              如要自訂：到 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--sage-600);">Google Cloud Console</a> 建立 OAuth 2.0 Client ID（Web application 類型）<br>
              授權的 JavaScript 來源加入：<code style="background:var(--surface2); padding:1px 5px; border-radius:3px;">https://your-name.github.io</code>
            </div>
          </div>
        </div>
        ` : `
        <div style="padding:12px 14px; background:var(--surface2); border-radius:6px; font-size:12px; color:var(--ink3); line-height:1.6;">
          💡 你的資料以 Gmail 區分，完全獨立。<br>
          • 想跨裝置同步：到下方「☁ ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步」設定<br>
          • 想本機備份：到下方「📦 資料管理」下載 JSON 備份
        </div>
        `}
      </div>

      <!-- Password fallback -->
      <div class="settings-section">
        <div class="ss-title">🔒 編輯密碼（備援）</div>
        <div class="ss-desc">若無法設定 Google OAuth，可改用密碼登入</div>

        <div class="ss-field">
          <label>新密碼</label>
          <div>
            <input type="password" id="set-pw" placeholder="留空表示不更動">
            <div class="help">設成空白 = 不需密碼即可編輯</div>
          </div>
        </div>

        <div>
          <button class="tb-action ghost" onclick="App.changePassword()">更改密碼</button>
        </div>
      </div>

      <!-- 雲端同步 -->
      <div class="settings-section">
        <div class="ss-title">☁ ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步</div>
        <div class="ss-desc">透過你自己的 Google Sheet + Apps Script，把 ${CFG('APP_NAME', 'PM-Core')} 個人資料同步到多台裝置<br>
          <span style="color:var(--ink4); font-size:11.5px;">📋 首次使用：你需要建立自己的 Sheet + 部署 Apps Script，每人資料完全獨立</span>
        </div>

        <div class="ss-field" style="margin-top:12px;">
          <label>啟用雲端同步</label>
          <div>
            <select id="set-cloud-enabled" style="width:200px;">
              <option value="false" ${!s.cloudSyncEnabled ? 'selected' : ''}>停用</option>
              <option value="true" ${s.cloudSyncEnabled ? 'selected' : ''}>啟用</option>
            </select>
            ${s.cloudSyncEnabled && s.cloudLastSync ? `
              <span style="margin-left:14px; font-size:12px; color:var(--sage-700);">
                最後同步：<b id="cloudSyncLastEl">${new Date(s.cloudLastSync).toLocaleDateString('zh-TW')} ${new Date(s.cloudLastSync).toTimeString().slice(0,5)}</b>
              </span>
            ` : ''}
          </div>
        </div>

        <div class="ss-field">
          <label>跨裝置 Apps Script URL</label>
          <div>
            <input type="text" id="set-cloud-url" value="${U.esc(s.cloudSyncUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec  (跨裝置同步 API)" style="font-family:var(--mono); font-size:11.5px;">
            <div class="help">部署跨裝置同步 Apps Script 後取得（部署方式見 README）</div>
          </div>
        </div>

        <div class="ss-field">
          <label>同步 Token</label>
          <div>
            <input type="text" id="set-cloud-token" value="${U.esc(s.cloudSyncToken || CFG('SYNC_TOKEN', 'CHANGE_THIS_TOKEN'))}" placeholder="${CFG('SYNC_TOKEN', 'CHANGE_THIS_TOKEN')}" style="font-family:var(--mono); font-size:12px;">
            <div class="help">必須與 Apps Script 內的 CHECK_TOKEN 一致</div>
          </div>
        </div>

        <div class="ss-field">
          <label>自動同步</label>
          <div>
            <select id="set-cloud-autosync" style="width:240px;">
              <option value="true" ${s.cloudAutoSync !== false ? 'selected' : ''}>儲存後自動上傳（推薦）</option>
              <option value="false" ${s.cloudAutoSync === false ? 'selected' : ''}>停用（僅手動）</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="tb-action" onclick="App.cloudUploadNow()">⬆ 立即上傳到雲端</button>
          <button class="tb-action ghost" onclick="App.cloudDownloadNow()">⬇ 從雲端下載最新</button>
          <button class="tb-action ghost" onclick="App.cloudTestConnection()">🔌 測試連線</button>
        </div>
        <div style="padding:10px 12px; background:var(--surface2); border-radius:8px; margin-top:10px; font-size:11px; line-height:1.6; color:var(--ink3);">
          📖 <b>使用流程：</b><br>
          1. 在 Google Drive 新建一個 Sheet（隨意命名）<br>
          2. 開啟「擴充功能 → Apps Script」<br>
          3. 把 <code>apps-script-cloud-sync.gs</code> 內容貼上、修改 SHEET_ID + Token<br>
          4. 部署 → 網頁應用程式（執行身分：我；存取對象：任何人）<br>
          5. 取得 URL 貼到上方欄位，按「啟用」+「儲存所有設定」<br>
          6. 在第二台裝置打開 ${CFG('APP_NAME', 'PM-Core')}、設定一樣的 URL + Token → 自動同步 ✨
        </div>
      </div>

      <!-- Data -->
      <div class="settings-section">
        <div class="ss-title">💾 資料管理</div>
        <div class="ss-desc">本地資料儲存在你的瀏覽器，建議定期備份</div>

        <div class="ss-field">
          <label>已完成清理</label>
          <div>
            <select id="set-retention">
              <option value="30" ${s.doneRetentionDays === 30 ? 'selected' : ''}>30 天後自動清除（推薦）</option>
              <option value="60" ${s.doneRetentionDays === 60 ? 'selected' : ''}>60 天後自動清除</option>
              <option value="90" ${s.doneRetentionDays === 90 ? 'selected' : ''}>90 天後自動清除</option>
              <option value="0" ${s.doneRetentionDays === 0 ? 'selected' : ''}>永不清除</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="tb-action ghost" onclick="App.backupAll()">⬇ 下載 JSON 備份</button>
          <button class="tb-action ghost" onclick="document.getElementById('restoreInput').click()">📥 上傳還原</button>
          <input type="file" id="restoreInput" accept=".json" style="display:none" onchange="App.restoreAll(this.files[0])">
          <button class="tb-action ghost" onclick="App.openExcelImport()">📊 匯入週報 Excel</button>
          <button class="tb-action ghost" onclick="App.openWbsImport()">📥 匯入 WBS Excel</button>
          <button class="tb-action ghost" onclick="App.dedupeTasks()">🧹 清除重複任務</button>
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
        </div>
        <div class="help" style="margin-top:8px;">
          💡「匯入週報 Excel」智慧合併：同名任務更新狀態/日期，新任務新增，PM 既有但 Excel 沒有的保留<br>
          💡「匯入 WBS Excel」清空舊 J 系列任務整批重灌（甲案），匯入後資訊條即時算階段時程，不灌日期<br>
          💡「清除重複任務」把同專案 + 同任務名的舊紀錄合併到「歷史紀錄」中，只保留一筆主任務
        </div>
      </div>

      <!-- 關於 ${CFG('APP_NAME', 'PM-Core')} -->
      <div class="settings-section">
        <div class="ss-title">ℹ️ 關於 ${CFG('APP_NAME', 'PM-Core')}</div>
        <div style="display:grid; grid-template-columns: 130px 1fr; gap:10px 16px; font-size:13px; line-height:1.7; padding:8px 0;">
          <div style="color:var(--ink3);">版本</div>
          <div><b>v${APP_VERSION}</b> <span style="font-family:var(--mono); font-size:11px; color:var(--ink3); margin-left:8px;">${APP_BUILD_SIGNATURE}</span></div>
          <div style="color:var(--ink3);">作者</div>
          <div>${APP_AUTHOR}</div>
          <div style="color:var(--ink3);">共同開發</div>
          <div>Anthropic Claude (AI 協作)</div>
          <div style="color:var(--ink3);">開發歷程</div>
          <div style="color:var(--ink2); font-size:12.5px; line-height:1.6;">
            2026 年 5 月於 ${CFG('COMPANY_NAME', 'My Company')}開發。<br>
            從需求設計、架構規劃到功能迭代，全程由人工主導 + AI 協作完成。<br>
            完整 commit history 保存於 GitHub repo。
          </div>
          <div style="color:var(--ink3);">Repo</div>
          <div><a href="${CFG('REPO_URL', 'https://github.com/your-name/your-repo')}" target="_blank" style="color:var(--sage-700); text-decoration:underline;">${CFG('REPO_URL', 'https://github.com/your-name/your-repo')}</a></div>
          <div style="color:var(--ink3);">授權</div>
          <div style="color:var(--ink2); font-size:12px;">個人作品，禁止未經授權的商業使用</div>
        </div>
        <div style="font-size:11px; color:var(--ink4); padding:10px 12px; background:var(--surface2); border-radius:8px; margin-top:8px; line-height:1.5; font-family:var(--mono);">
          // 程式碼開頭含完整版權標頭<br>
          // GitHub commit history 為不可竄改的開發證據<br>
          // 任何衍生作品請保留此版權聲明
        </div>
      </div>

      <div style="text-align:center; margin-top:14px;">
        <button class="tb-action" onclick="App.saveSettings()" style="padding:12px 32px;">💾 儲存所有設定</button>
      </div>
    </div>
  `;
};

App.saveSettings = function() {
  DATA.settings.jSheetUrl = document.getElementById('set-url').value.trim();
  DATA.settings.syncTimes = [
    document.getElementById('set-st1').value,
    document.getElementById('set-st2').value,
  ];
  DATA.settings.autoSyncEnabled = document.getElementById('set-autosync').value === 'true';
  DATA.settings.previewWeeks = parseInt(document.getElementById('set-preview').value);
  DATA.settings.dailyHours = parseFloat(document.getElementById('set-hours').value);
  DATA.settings.workStart1 = document.getElementById('set-ws1').value;
  DATA.settings.workEnd1 = document.getElementById('set-we1').value;
  DATA.settings.workStart2 = document.getElementById('set-ws2').value;
  DATA.settings.workEnd2 = document.getElementById('set-we2').value;
  DATA.settings.goldenTime = document.getElementById('set-golden').value;
  DATA.settings.workDays = Array.from(document.querySelectorAll('#dayPills .day-pill.on'))
    .map(b => parseInt(b.dataset.day));
  DATA.settings.splitThreshold = parseFloat(document.getElementById('set-split').value);
  DATA.settings.userName = document.getElementById('set-uname').value.trim();
  DATA.settings.department = document.getElementById('set-dept').value.trim();
  DATA.settings.doneRetentionDays = parseInt(document.getElementById('set-retention').value);

  // Google OAuth + whitelist
  const gciEl = document.getElementById('set-gci');
  if (gciEl) DATA.settings.googleClientId = gciEl.value.trim();
  const wlEl = document.getElementById('set-whitelist');
  if (wlEl) {
    DATA.settings.allowedEmails = wlEl.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  // ☁ Cloud sync
  const cuEl = document.getElementById('set-cloud-url');
  const ctEl = document.getElementById('set-cloud-token');
  const ceEl = document.getElementById('set-cloud-enabled');
  const caEl = document.getElementById('set-cloud-autosync');
  if (cuEl) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (ctEl) DATA.settings.cloudSyncToken = ctEl.value.trim();
  if (ceEl) DATA.settings.cloudSyncEnabled = ceEl.value === 'true';
  if (caEl) DATA.settings.cloudAutoSync = caEl.value === 'true';

  Storage.save();
  this.refreshUserBadge();
  U.toast('✓ 設定已儲存');
};

// ─── CLOUD SYNC HANDLERS ───
App.cloudUploadNow = function() {
  // 先把設定頁可能未存的 URL/Token 抓進來
  const cuEl = document.getElementById('set-cloud-url');
  const ctEl = document.getElementById('set-cloud-token');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (ctEl && ctEl.value.trim()) DATA.settings.cloudSyncToken = ctEl.value.trim();
  if (!DATA.settings.cloudSyncUrl) {
    U.toast('⚠ 請先設定 Apps Script URL 並儲存', 'warning');
    return;
  }
  CloudSync.upload(false);
};

App.cloudDownloadNow = function() {
  const cuEl = document.getElementById('set-cloud-url');
  const ctEl = document.getElementById('set-cloud-token');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (ctEl && ctEl.value.trim()) DATA.settings.cloudSyncToken = ctEl.value.trim();
  if (!DATA.settings.cloudSyncUrl) {
    U.toast('⚠ 請先設定 Apps Script URL 並儲存', 'warning');
    return;
  }
  if (!confirm('☁ 從雲端下載最新資料？\n\n這會用雲端的資料「完全覆蓋」本地所有任務、專案、設定。\n建議先按「⬇ 下載 JSON 備份」備份本地資料。\n\n確定繼續？')) return;
  CloudSync.download(false).then(success => {
    if (success) {
      this.refreshAll();
      this.renderSidebar();
      // 重新渲染目前頁面（包含設定頁）
      const currentPage = this.currentPage;
      if (currentPage) {
        const btn = document.querySelector(`[data-page="${currentPage}"]`);
        this.showPage(currentPage, btn);
      }
    }
  });
};

App.cloudTestConnection = async function() {
  const cuEl = document.getElementById('set-cloud-url');
  const ctEl = document.getElementById('set-cloud-token');
  const url = cuEl ? cuEl.value.trim() : DATA.settings.cloudSyncUrl;
  const token = ctEl ? ctEl.value.trim() : DATA.settings.cloudSyncToken;
  if (!url) {
    U.toast('⚠ 請先填入 Apps Script URL', 'warning');
    return;
  }
  U.toast('🔌 測試連線中...', 'info');
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + 'token=' + encodeURIComponent(token || ''), {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    });
    const result = await res.json();
    if (result.error) {
      U.toast('⚠ 連線失敗：' + result.error, 'warning');
    } else if (result.ok) {
      U.toast(`✓ 連線成功！雲端${result.data ? '已有資料' : '是空的，可以按上傳建立'}`, 'success');
    } else {
      U.toast('⚠ 回應格式異常：' + JSON.stringify(result).slice(0, 80), 'warning');
    }
  } catch (e) {
    U.toast('⚠ 連線失敗：' + e.message, 'warning');
    console.error(e);
  }
};

// ─── MEETING TEMPLATE HELPERS ───
App.buildRecurringMeetingsHtml = function() {
  const list = DATA.settings.recurringMeetings || [];
  if (list.length === 0) {
    return '<div style="padding:18px; text-align:center; color:var(--ink4); font-size:12px;">尚未設定任何定期事件</div>';
  }
  const dayLabels = ['週日','週一','週二','週三','週四','週五','週六'];
  const freqLabels = { once: '單次', daily: '每天', weekly: '每週', biweekly: '隔週(一天)', triweekly: '隔兩週(一天)', 'biweekly-allday': '隔週整週每天', 'triweekly-allday': '隔兩週整週每天' };
  let html = '';
  list.forEach((m, idx) => {
    const cat = m.category || 'meeting';
    const icon = cat === 'cleaning' ? '🧹' : '📅';
    const freq = m.frequency || 'weekly';
    const dayText = freq === 'once' ? (m.startDate || '?') : (freq === 'daily' ? '—' : (dayLabels[m.day] || '?'));
    const freqText = freqLabels[freq] || freq;
    html += `<div class="mt-row" style="display:flex; align-items:center; gap:8px; padding:9px 12px; ${idx < list.length-1 ? 'border-bottom:1px solid var(--rule);' : ''} ${m.enabled === false ? 'opacity:0.5;' : ''}">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" ${m.enabled !== false ? 'checked' : ''} onchange="App.toggleRecurringMeeting('${m.id}')" style="width:auto;">
      </label>
      <div style="font-size:13px;">${icon}</div>
      <div style="font-size:11px; min-width:78px; color:var(--ink3); font-weight:500;">${freqText}</div>
      <div style="font-size:12px; min-width:40px; font-weight:600; color:var(--sage-700);">${dayText}</div>
      <div style="font-family:var(--mono); font-size:11.5px; min-width:105px; color:var(--ink2);">${m.start}–${m.end}</div>
      <div style="flex:1; font-size:12.5px;">${U.esc(m.title)}</div>
      <button class="tb-action ghost" onclick="App.editRecurringMeeting('${m.id}')" style="font-size:10.5px; padding:3px 8px;">編輯</button>
      <button class="tb-action ghost" onclick="App.deleteRecurringMeeting('${m.id}')" style="font-size:10.5px; padding:3px 8px; color:var(--terracotta);">刪除</button>
    </div>`;
  });
  return html;
};

App.buildSpecialMeetingsHtml = function() {
  const list = DATA.settings.specialMeetings || [];
  if (list.length === 0) {
    return '<div style="padding:18px; text-align:center; color:var(--ink4); font-size:12px;">尚未設定特定日期會議<br><span style="font-size:10.5px;">按上方「＋ 新增」加入</span></div>';
  }
  // Sort by date asc, future first
  const sorted = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const today = D.fmt(D.today(), 'iso');
  let html = '';
  sorted.forEach((m, idx) => {
    const isPast = m.date && m.date < today;
    html += `<div class="mt-row" style="display:flex; align-items:center; gap:8px; padding:9px 12px; ${idx < sorted.length-1 ? 'border-bottom:1px solid var(--rule);' : ''} ${isPast ? 'opacity:0.4;' : ''}">
      <div style="font-family:var(--mono); font-size:11.5px; min-width:90px; font-weight:600; color:${isPast ? 'var(--ink4)' : 'var(--sage-700)'};">${m.date}</div>
      <div style="font-family:var(--mono); font-size:11px; min-width:105px; color:var(--ink2);">${m.start}–${m.end}</div>
      <div style="flex:1; font-size:12.5px;">${U.esc(m.title)}</div>
      <button class="tb-action ghost" onclick="App.editSpecialMeeting('${m.id}')" style="font-size:10.5px; padding:3px 8px;">編輯</button>
      <button class="tb-action ghost" onclick="App.deleteSpecialMeeting('${m.id}')" style="font-size:10.5px; padding:3px 8px; color:var(--terracotta);">刪除</button>
    </div>`;
  });
  return html;
};

App.addRecurringMeeting = function() {
  this.openRecurringMeetingDialog(null);
};

App.editRecurringMeeting = function(id) {
  this.openRecurringMeetingDialog(id);
};

App.openRecurringMeetingDialog = function(id) {
  const m = id ? (DATA.settings.recurringMeetings || []).find(x => x.id === id) : null;
  const isNew = !m;
  const today = D.fmt(D.today(), 'iso');
  const cur = m || { category: 'meeting', frequency: 'weekly', day: 1, start: '09:00', end: '10:00', title: '', startDate: today, endDate: '', enabled: true };

  this.openModal({
    title: isNew ? '＋ 新增定期事件' : '編輯定期事件',
    body: `
      <div class="form-row">
        <div class="form-field">
          <label>類型 *</label>
          <select id="mtform-category">
            <option value="meeting" ${cur.category === 'meeting' || !cur.category ? 'selected' : ''}>📅 會議</option>
            <option value="cleaning" ${cur.category === 'cleaning' ? 'selected' : ''}>🧹 打掃</option>
          </select>
        </div>
        <div class="form-field" style="flex:2;">
          <label>名稱 *</label>
          <input type="text" id="mtform-title" value="${U.esc(cur.title)}" placeholder="例：每週會議 / 定期打掃">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>頻率 *</label>
          <select id="mtform-freq" onchange="App.toggleDayField()">
            <option value="once" ${cur.frequency === 'once' ? 'selected' : ''}>單次(不重複)</option>
            <option value="daily" ${cur.frequency === 'daily' ? 'selected' : ''}>每天</option>
            <option value="weekly" ${cur.frequency === 'weekly' || !cur.frequency ? 'selected' : ''}>每週</option>
            <option value="biweekly" ${cur.frequency === 'biweekly' ? 'selected' : ''}>隔週（指定一天）</option>
            <option value="triweekly" ${cur.frequency === 'triweekly' ? 'selected' : ''}>隔兩週（指定一天）</option>
            <option value="biweekly-allday" ${cur.frequency === 'biweekly-allday' ? 'selected' : ''}>隔週整週每天（週一~五）</option>
            <option value="triweekly-allday" ${cur.frequency === 'triweekly-allday' ? 'selected' : ''}>隔兩週整週每天（週一~五）</option>
          </select>
        </div>
        <div class="form-field" id="mtform-day-field">
          <label>星期幾 *</label>
          <select id="mtform-day">
            <option value="1" ${cur.day===1?'selected':''}>週一</option>
            <option value="2" ${cur.day===2?'selected':''}>週二</option>
            <option value="3" ${cur.day===3?'selected':''}>週三</option>
            <option value="4" ${cur.day===4?'selected':''}>週四</option>
            <option value="5" ${cur.day===5?'selected':''}>週五</option>
            <option value="6" ${cur.day===6?'selected':''}>週六</option>
            <option value="0" ${cur.day===0?'selected':''}>週日</option>
          </select>
        </div>
        <div class="form-field">
          <label>開始時間 *</label>
          <input type="time" id="mtform-start" value="${cur.start}">
        </div>
        <div class="form-field">
          <label>結束時間 *</label>
          <input type="time" id="mtform-end" value="${cur.end}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>開始日期</label>
          <input type="date" id="mtform-startDate" value="${cur.startDate || ''}">
        </div>
        <div class="form-field">
          <label>結束日期（空=永久）</label>
          <input type="date" id="mtform-endDate" value="${cur.endDate || ''}">
        </div>
      </div>
      <div style="font-size:11px; color:var(--ink3); padding:6px 10px; background:var(--surface2); border-radius:6px; line-height:1.5;">
        💡 <b>每隔一週/兩週</b>從「開始日期」開始算第一次，之後每隔指定的週數重複<br>
        💡 留空「結束日期」= 永久重複
      </div>
    `,
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App.saveRecurringMeeting('${id || ''}')">${isNew ? '新增' : '儲存'}</button>
    `,
  });
  setTimeout(() => {
    document.getElementById('mtform-title')?.focus();
    App.toggleDayField();
  }, 50);
};

App.toggleDayField = function() {
  const freq = document.getElementById('mtform-freq')?.value;
  const dayField = document.getElementById('mtform-day-field');
  if (!dayField) return;
  const hideDay = freq === 'once' || freq === 'daily' || freq === 'biweekly-allday' || freq === 'triweekly-allday';
  dayField.style.display = hideDay ? 'none' : '';
};

App.saveRecurringMeeting = function(id) {
  const title = document.getElementById('mtform-title').value.trim();
  if (!title) { U.toast('⚠ 請填名稱', 'warning'); return; }
  const category = document.getElementById('mtform-category').value;
  const frequency = document.getElementById('mtform-freq').value;
  const day = parseInt(document.getElementById('mtform-day').value);
  const start = document.getElementById('mtform-start').value;
  const end = document.getElementById('mtform-end').value;
  const startDate = document.getElementById('mtform-startDate').value;
  const endDate = document.getElementById('mtform-endDate').value;
  if (!start || !end || start >= end) { U.toast('⚠ 時間範圍無效', 'warning'); return; }
  if (endDate && startDate && endDate < startDate) { U.toast('⚠ 結束日期不可早於開始日期', 'warning'); return; }
  if (frequency === 'once' && !startDate) { U.toast('⚠ 單次事件請指定日期（填「開始日期」）', 'warning'); return; }

  DATA.settings.recurringMeetings = DATA.settings.recurringMeetings || [];
  if (id) {
    const m = DATA.settings.recurringMeetings.find(x => x.id === id);
    if (m) {
      m.title = title; m.category = category; m.frequency = frequency;
      m.day = day; m.start = start; m.end = end;
      m.startDate = startDate; m.endDate = endDate;
    }
  } else {
    DATA.settings.recurringMeetings.push({
      id: 'rm_' + Date.now().toString(36),
      category, frequency, day, start, end, title,
      startDate, endDate,
      enabled: true,
    });
  }
  Storage.save();
  this.closeModal();
  document.getElementById('recurringMeetingList').innerHTML = this.buildRecurringMeetingsHtml();
  U.toast('✓ 已儲存');
  if (App.currentPage === 'dashboard') this.renderDashboard();
};

App.toggleRecurringMeeting = function(id) {
  const m = (DATA.settings.recurringMeetings || []).find(x => x.id === id);
  if (!m) return;
  m.enabled = m.enabled === false;
  Storage.save();
  document.getElementById('recurringMeetingList').innerHTML = this.buildRecurringMeetingsHtml();
  if (App.currentPage === 'dashboard') this.renderDashboard();
};

App.deleteRecurringMeeting = function(id) {
  if (!confirm('確定刪除這個定期事件？')) return;
  DATA.settings.recurringMeetings = (DATA.settings.recurringMeetings || []).filter(m => m.id !== id);
  Storage.save();
  document.getElementById('recurringMeetingList').innerHTML = this.buildRecurringMeetingsHtml();
  U.toast('✓ 已刪除');
  if (App.currentPage === 'dashboard') this.renderDashboard();
};

App.addSpecialMeeting = function() {
  this.openSpecialMeetingDialog(null);
};

App.editSpecialMeeting = function(id) {
  this.openSpecialMeetingDialog(id);
};

App.openSpecialMeetingDialog = function(id) {
  const m = id ? (DATA.settings.specialMeetings || []).find(x => x.id === id) : null;
  const isNew = !m;
  const today = D.fmt(D.today(), 'iso');
  const cur = m || { date: today, start: '13:00', end: '15:00', title: '' };

  // Quick-select buttons for common meetings
  const commonMeetings = [
    { title: '試作會議', start: '13:00', end: '15:00' },
    { title: 'PDCA 會議', start: '13:00', end: '14:00' },
    { title: '品質向上/QC', start: '13:30', end: '15:00' },
    { title: '主管月會', start: '09:00', end: '12:00' },
    { title: '新品發表會', start: '15:00', end: '20:40' },
    { title: '營業會議', start: '14:00', end: '16:00' },
  ];
  const presetButtons = commonMeetings.map(p =>
    `<button class="tb-action ghost" onclick="App.fillSpecialMeetingPreset('${p.title}', '${p.start}', '${p.end}')" style="font-size:10.5px; padding:3px 8px;">${p.title}</button>`
  ).join(' ');

  this.openModal({
    title: isNew ? '＋ 新增特定日期會議' : '編輯特定日期會議',
    body: `
      ${isNew ? `<div style="font-size:11.5px; color:var(--ink3); margin-bottom:10px;">快速套用：${presetButtons}</div>` : ''}
      <div class="form-field">
        <label>會議名稱 *</label>
        <input type="text" id="smtform-title" value="${U.esc(cur.title)}" placeholder="例：試作會議 / 主管月會">
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>日期 *</label>
          <input type="date" id="smtform-date" value="${cur.date}">
        </div>
        <div class="form-field">
          <label>開始 *</label>
          <input type="time" id="smtform-start" value="${cur.start}">
        </div>
        <div class="form-field">
          <label>結束 *</label>
          <input type="time" id="smtform-end" value="${cur.end}">
        </div>
      </div>
    `,
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App.saveSpecialMeeting('${id || ''}')">${isNew ? '新增' : '儲存'}</button>
    `,
  });
  setTimeout(() => { document.getElementById('smtform-title')?.focus(); }, 50);
};

App.fillSpecialMeetingPreset = function(title, start, end) {
  document.getElementById('smtform-title').value = title;
  document.getElementById('smtform-start').value = start;
  document.getElementById('smtform-end').value = end;
};

App.saveSpecialMeeting = function(id) {
  const title = document.getElementById('smtform-title').value.trim();
  if (!title) { U.toast('⚠ 請填會議名稱', 'warning'); return; }
  const date = document.getElementById('smtform-date').value;
  const start = document.getElementById('smtform-start').value;
  const end = document.getElementById('smtform-end').value;
  if (!date || !start || !end || start >= end) { U.toast('⚠ 日期或時間無效', 'warning'); return; }

  DATA.settings.specialMeetings = DATA.settings.specialMeetings || [];
  if (id) {
    const m = DATA.settings.specialMeetings.find(x => x.id === id);
    if (m) { m.title = title; m.date = date; m.start = start; m.end = end; }
  } else {
    DATA.settings.specialMeetings.push({
      id: 'sm_' + Date.now().toString(36),
      date, start, end, title,
    });
  }
  Storage.save();
  this.closeModal();
  document.getElementById('specialMeetingList').innerHTML = this.buildSpecialMeetingsHtml();
  U.toast('✓ 已儲存');
  if (App.currentPage === 'dashboard') this.renderDashboard();
};

App.deleteSpecialMeeting = function(id) {
  if (!confirm('確定刪除這個會議？')) return;
  DATA.settings.specialMeetings = (DATA.settings.specialMeetings || []).filter(m => m.id !== id);
  Storage.save();
  document.getElementById('specialMeetingList').innerHTML = this.buildSpecialMeetingsHtml();
  U.toast('✓ 已刪除');
  if (App.currentPage === 'dashboard') this.renderDashboard();
};

App.googleSignOut = function() {
  if (!confirm('確定要登出？')) return;
  DATA.settings._loggedInEmail = '';
  DATA.settings._loggedInPicture = '';
  Storage.save();
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  location.reload();
};

App.saveAndSync = function() {
  this.saveSettings();
  if (!DATA.settings.jSheetUrl) {
    U.toast('⚠ 請先填入 Apps Script URL', 'warning');
    return;
  }
  Sync.syncJSeries();
};

App.changePassword = function() {
  const pw = document.getElementById('set-pw').value;
  if (pw === '') {
    if (!confirm('確定設成空白密碼？任何人都能編輯')) return;
    localStorage.setItem(STORE.password, '');
  } else {
    localStorage.setItem(STORE.password, U.hash(pw).toString());
  }
  document.getElementById('set-pw').value = '';
  U.toast('✓ 密碼已更新');
};

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
          <table id="excelImportTable" style="width:100%; border-collapse:collapse; font-size:11.5px;">
          </table>
        </div>
      </div>

      <div id="excelImportLog" style="display:none; margin-top:14px; padding:10px 14px; background:#1E3326; color:#DCE6D2; border-radius:8px; font-family:var(--mono); font-size:11px; max-height:160px; overflow-y:auto;"></div>
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

// Date → 'YYYY-MM-DD'；空值/非 Date → ''
function wbsDateStr(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  // 防呆：raw:false 已是字串時直接用；其餘嘗試 new Date
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
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

// 讀 J系列_WBS_主檔.xlsx，解析 J系列整合WBS sheet 的 93 筆有效列
// 回傳 { ok, rows, projectName, errors }，不灌日期、不碰 DOM、不存 Storage
async function parseWbsExcel(file) {
  try {
    const buffer = await file.arrayBuffer();   // house style：與 App.parseExcelImport 一致
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    // 按名直取（第一張是「專案資訊」，不是資料表）
    const wsMain = wb.Sheets['J系列整合WBS'];
    if (!wsMain) {
      return { ok: false, rows: [], projectName: '', errors: ['找不到「J系列整合WBS」分頁'] };
    }

    // 專案名：專案資訊頁是 key-value 直式，掃 A 欄＝「專案名稱」那列取 B（不寫死列號）
    let projectName = '';
    const wsInfo = wb.Sheets['專案資訊'];
    if (wsInfo) {
      const infoRows = XLSX.utils.sheet_to_json(wsInfo, { header: 'A', range: 0 });
      const hit = infoRows.find(r => String(r.A || '').trim() === '專案名稱');
      projectName = hit ? String(hit.B || '').trim() : '';
    }
    if (!projectName) projectName = 'J系列專案';

    // 部門翻譯：建「成員→部門」反查 map（重用上面已取的 wsInfo，免重複 lookup）
    const memberToDept = buildMemberToDept(wsInfo);

    const raw = XLSX.utils.sheet_to_json(wsMain, { header: 'A', range: 1 });
    const rows = [];
    const errors = [];

    raw.forEach((r) => {
      // D 欄（任務名）空 → skip
      const name = r.D != null && String(r.D).trim() !== '' ? String(r.D).trim() : '';
      if (!name) return;

      rows.push({
        wbs: r.A != null ? String(r.A).trim() : '',
        stage: r.B != null ? String(r.B).trim() : '',
        subgroup: r.C != null ? String(r.C).trim() : '',
        name: name,
        category: String(r.E || '').includes('里程碑') ? 'meeting' : 'deep',
        taskType: mapTaskType(r.E),   // M2-T：類型正本（E欄原字串→task/milestone/group）；上行 lossy 映射待消費點全改完後拔除
        predecessor: r.F != null ? String(r.F).trim() : '',      // 原樣序號字串
        durationDays: typeof r.G === 'number' ? r.G : (parseFloat(r.G) || 0),
        owner: r.H != null ? String(r.H).trim() : '',
        dept: ownerToDept(r.H, memberToDept),   // 主責部門（取H欄第一人查map）；owner 維持原樣
        plannedStart: wbsDateStr(r.I),
        plannedEnd: wbsDateStr(r.J),
        actualStart: wbsDateStr(r.K),
        actualEnd: wbsDateStr(r.L),
        progress: typeof r.M === 'number' ? Math.round(r.M * 100) : 0,  // 0~1 → 0~100
        status: r.N != null ? String(r.N).trim() : '',
        mustDeliver: r.O === '✓' || r.O === true || String(r.O).trim() === '✓',
        deliverable: r.P != null ? String(r.P).trim() : '',
        riskIssue: r.Q != null ? String(r.Q).trim() : '',
        note: r.R != null ? String(r.R).trim() : '',
        delivered: r.U != null ? String(r.U).trim() : '',
        deliverableLink: r.V != null ? String(r.V).trim() : '',
      });
    });

    return { ok: true, rows, projectName, errors, depts: buildDepts(wsInfo) };
  } catch (err) {
    return { ok: false, rows: [], projectName: '', errors: ['解析失敗：' + err.message] };
  }
}

// 找/建 J 系列專案 → 清空舊 J 任務（甲案整批重灌）→ 逐列建 task → save + refresh
function performWbsImport(parsed) {
  const { rows, projectName } = parsed;

  // 找/建專案（形狀補齊既有：:521/:3671；color 沿用既有 WBS 常數）
  let proj = DATA.projects.find(p => p.name === projectName);
  if (!proj) {
    proj = { id: U.id(), name: projectName, color: CFG('WBS_PROJECT_COLOR', '#4A7C5C'), note: '', synced: false, createdAt: new Date().toISOString() };
    DATA.projects.push(proj);
  }
  const projId = proj.id;
  proj.depts = parsed.depts || [];   // D-2a：部門表存進 proj（if/else 外→重匯也覆寫跟著 Excel 更新）

  // D-2b：建「部門名→id」反查表，task.dept 改存部門 id（「未指派」查無→保留字面）
  const nameToId = {};
  (proj.depts || []).forEach(d => { nameToId[d.name] = d.id; });

  // 甲案：清空該專案舊任務整批重灌（用 project，不是 projectId）
  DATA.tasks = DATA.tasks.filter(t => t.project !== projId);

  // 逐列建 task — 形狀對齊 :1485 同步版 / :3270 手動版交集
  rows.forEach(row => {
    let status;
    if (row.actualEnd) status = 'done';
    else if (row.actualStart) status = 'wip';
    else status = mapStatus(row.status, row.progress);   // progress 已是 0~100

    DATA.tasks.push({
      id: U.id(),                    // 走 U.id()，不要 inline 't_'+Date.now() 拼
      project: projId,               // 改點：欄名 project（非 projectId）
      wbs: row.wbs,                  // N 序號
      parentWbsId: '',               // 照同步版照搬
      name: row.name,
      desc: row.stage ? `${row.stage} / ${row.subgroup || ''}` : (row.subgroup || ''),  // 照同步版公式
      category: row.category,
      taskType: row.taskType,        // M2-T：類型正本（parseWbsExcel 已映射）
      predecessor: row.predecessor,  // 原樣序號字串
      durationDays: row.durationDays,
      owner: row.owner,
      dept: nameToId[row.dept] || row.dept,   // D-2b：存部門 id（未指派/查無→保留字面字串）
      start: '',                     // 形狀一致防 getEffectiveSchedule fallback，不灌真日期
      end: '',
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      progress: row.progress,        // 0~100
      status: status,
      urgency: 'med',                // 固定預設（row 形狀不合 deduceUrgency）
      estHours: parseFloat(row.durationDays || 0) * (DATA.settings.dailyHours || 6) || 4,  // 照同步版公式
      method: '',                    // 手動版多的欄，匯入版預設
      canSplit: false,               // 同上
      completedAt: status === 'done' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),  // 形狀統一：四條建任務路徑都帶
      scheduledStart: '',            // 四路徑一致，留空
      scheduledEnd: '',
      synced: false,                 // 改點：不要 locked: true
      stage: row.stage,
      subgroup: row.subgroup,
      mustDeliver: row.mustDeliver,
      deliverable: row.deliverable,
      riskIssue: row.riskIssue,
      delivered: row.delivered,
      deliverableLink: row.deliverableLink,
      note: row.note,
    });
  });

  Storage.save();
  App.refreshAll();
  return { imported: rows.length, projectId: projId };
}

App.openWbsImport = function() {
  this.openModal({
    title: '📥 匯入 WBS Excel',
    body: `
      <div style="font-size:12.5px; line-height:1.6; color:var(--ink2); margin-bottom:14px;">
        匯入「J 系列整合 WBS」Excel，<b style="color:var(--sage-700);">整批重灌</b>：
        <br>• <b>清空該專案既有 J 系列任務</b>，以 Excel 為唯一真值重新建立
        <br>• 匯入後任務為<b>可編輯</b>（非唯讀、非 synced），資料主權歸 ${CFG('APP_NAME', 'PM-Core')}
        <br>• 階段時程（性試/量試/量產）由資訊條即時計算，匯入器不灌日期
      </div>

      <div id="wbsImportZone" style="border:2px dashed var(--rule); border-radius:10px; padding:32px; text-align:center; cursor:pointer; background:var(--surface2); transition:all .15s;">
        <div style="font-size:32px; margin-bottom:8px;">📥</div>
        <div style="font-size:13px; font-weight:500;">點擊或拖曳 J系列_WBS_主檔.xlsx</div>
        <div style="font-size:11px; color:var(--ink3); margin-top:4px;">讀「J系列整合WBS」分頁，任務名非空者匯入</div>
        <input type="file" id="wbsImportFile" accept=".xlsx,.xls" style="display:none;">
      </div>

      <div id="wbsImportPreview" style="display:none; margin-top:14px;">
        <div id="wbsImportStats" style="padding:10px 14px; background:var(--sage-50); border-radius:8px; font-size:12px; margin-bottom:10px;"></div>
        <div style="max-height:280px; overflow-y:auto; border:1px solid var(--rule); border-radius:8px;">
          <table id="wbsImportTable" style="width:100%; border-collapse:collapse; font-size:11.5px;"></table>
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
      // 統計 + 前 8 筆預覽
      const stats = document.getElementById('wbsImportStats');
      const table = document.getElementById('wbsImportTable');
      const done = parsed.rows.filter(r => r.progress === 100).length;
      const wip = parsed.rows.filter(r => r.progress > 0 && r.progress < 100).length;
      if (stats) {
        stats.innerHTML = `專案：<b>${U.esc(parsed.projectName)}</b>　|　共 <b style="color:var(--sage-700);">${parsed.rows.length}</b> 筆有效` +
          `　|　完成 <b>${done}</b>　進行中 <b>${wip}</b>　|　<b style="color:var(--ink3);">確定後將清空舊 J 任務重灌</b>`;
      }
      if (table) {
        const head = `<thead><tr style="background:var(--surface2); text-align:left;">` +
          `<th style="padding:6px 8px; border-bottom:1px solid var(--rule);">N</th>` +
          `<th style="padding:6px 8px; border-bottom:1px solid var(--rule);">任務名</th>` +
          `<th style="padding:6px 8px; border-bottom:1px solid var(--rule);">前置</th>` +
          `<th style="padding:6px 8px; border-bottom:1px solid var(--rule);">進度</th>` +
          `<th style="padding:6px 8px; border-bottom:1px solid var(--rule);">狀態</th></tr></thead>`;
        const body = parsed.rows.slice(0, 8).map(r =>
          `<tr><td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-family:var(--mono);">${U.esc(r.wbs)}</td>` +
          `<td style="padding:5px 8px; border-bottom:1px solid var(--rule);">${U.esc(r.name)}</td>` +
          `<td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-family:var(--mono);">${U.esc(r.predecessor)}</td>` +
          `<td style="padding:5px 8px; border-bottom:1px solid var(--rule);">${r.progress}%</td>` +
          `<td style="padding:5px 8px; border-bottom:1px solid var(--rule);">${U.esc(r.status)}</td></tr>`).join('');
        const more = parsed.rows.length > 8 ? `<tr><td colspan="5" style="padding:6px 8px; color:var(--ink3);">…還有 ${parsed.rows.length - 8} 筆</td></tr>` : '';
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
      const res = performWbsImport(parsed);
      const log = document.getElementById('wbsImportLog');
      if (log) {
        log.style.display = 'block';
        log.textContent = `✅ 已匯入 ${res.imported} 筆任務到「${parsed.projectName}」（舊 J 任務已清空重灌）`;
      }
      btn.disabled = true; btn.style.opacity = '.5';
      U.toast(`✅ ${CFG('WBS_LABEL', 'WBS')} 已匯入 ${res.imported} 筆`, 'success');
    });
  }, 50);
};

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
  let html = `<thead style="position:sticky; top:0; background:var(--sage-50);"><tr>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">週次</th>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">專案</th>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">議題</th>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">狀態</th>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">預計完成</th>
    <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--rule);">擔當</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const opacity = r.skipped ? 'opacity:0.4;' : '';
    html += `<tr style="${opacity}">
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-family:var(--mono); font-size:10.5px;">${r.sheetName}</td>
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-weight:500;">${U.esc(r.projDisplay)}${r.skipped ? ' <span style="color:var(--ink4);">(跳過)</span>' : ''}</td>
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule);">${U.esc(r.item).slice(0, 22)}</td>
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule);">${r.status}</td>
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-family:var(--mono); font-size:10.5px;">${r.planEnd}</td>
      <td style="padding:5px 8px; border-bottom:1px solid var(--rule); font-size:10.5px;">${U.esc(r.owner)}</td>
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
      task.end = latest.planEnd || latest.weekMonday;
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
        end: latest.planEnd || latest.weekMonday,
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
      alert(
        '✅ Excel 匯入完成！\n\n' +
        '⚠️ 重要：跨裝置同步步驟\n' +
        '──────────────────────────\n' +
        '1️⃣ 立即按【設定 → ☁ 立即上傳到雲端】\n' +
        '   讓雲端拿到合併後的最新版\n\n' +
        '2️⃣ 明天到公司桌機，第一件事：\n' +
        '   按【設定 → ⬇ 從雲端下載最新】\n' +
        '   再開始操作，避免把舊資料覆蓋雲端\n\n' +
        `本次匯入：${added} 新增 / ${updated} 更新`
      );
    }, 600);
  }, 1500);
};

// ─── DEDUPE TASKS (merge same-name same-project into one with history) ───
App.dedupeTasks = function() {
  // Find duplicate groups: same project + same name (case-insensitive)
  const groups = {};
  for (const t of DATA.tasks) {
    if (t.synced) continue; // skip synced (managed by sheet)
    const key = `${t.project}|${(t.name || '').trim().toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  // Count actual duplicates
  const duplicates = Object.entries(groups).filter(([k, list]) => list.length > 1);
  if (duplicates.length === 0) {
    U.toast('✓ 沒有重複任務', 'success');
    return;
  }

  const totalDupes = duplicates.reduce((s, [k, list]) => s + (list.length - 1), 0);
  if (!confirm(`找到 ${duplicates.length} 組重複任務（共 ${totalDupes} 筆會被合併）。\n\n會把舊版本合併到「歷史紀錄」，只保留一筆主任務。\n\n確定繼續？`)) return;

  let merged = 0;
  for (const [key, list] of duplicates) {
    // Sort: 已完成 > 最新 createdAt > 第一個
    // 用最新建立的當主任務（最可能是最新匯入的）
    list.sort((a, b) => {
      // done > wip > pending > hold（已完成的優先當主）
      const statusOrder = { done: 3, wip: 2, pending: 1, hold: 0 };
      const so = (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
      if (so !== 0) return so;
      // 再依 createdAt 新舊
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    const main = list[0];
    const others = list.slice(1);

    // Merge history from all duplicates
    const histMap = {};
    for (const h of (main.history || [])) {
      if (h.week) histMap[h.week] = h;
    }
    for (const dup of others) {
      for (const h of (dup.history || [])) {
        if (h.week && !histMap[h.week]) histMap[h.week] = h;
      }
      // 從重複任務本身造一筆 history（如果它有 _importWeek 或別的線索）
      if (dup._importWeek && !histMap[dup._importWeek]) {
        histMap[dup._importWeek] = {
          week: dup._importWeek,
          weekMonday: dup.start || '',
          status: LABELS.status[dup.status] || dup.status,
          planEnd: dup.end || '',
          actualEnd: dup.actualEnd || '',
          work: dup.desc || '',
          note: dup.note || '',
          owner: dup.owner || '',
        };
      }
    }
    main.history = Object.values(histMap).sort((a, b) => (a.weekMonday || '').localeCompare(b.weekMonday || ''));

    // Remove duplicates from DATA.tasks
    const dupIds = new Set(others.map(o => o.id));
    DATA.tasks = DATA.tasks.filter(t => !dupIds.has(t.id));
    // Also clean up schedule.items for removed tasks
    if (DATA.schedule && DATA.schedule.items) {
      DATA.schedule.items = DATA.schedule.items.filter(it => !dupIds.has(it.taskId));
    }
    merged += others.length;
  }

  Storage.save();
  this.refreshAll();
  U.toast(`✓ 合併 ${merged} 筆重複任務`, 'success');
};

App.backupAll = function() {
  const data = { DATA, exported: new Date().toISOString(), version: '1.0' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CFG('APP_NAME', 'PM-Core').toLowerCase()}-backup-${D.fmt(new Date(),'ymd').replace(/\//g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  U.toast('✓ 備份已下載');
};

App.restoreAll = function(file) {
  if (!file) return;
  if (!confirm('還原將覆蓋目前所有資料，確定繼續？')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!obj.DATA) throw new Error('檔案格式錯誤');
      DATA = obj.DATA;
      Storage.save();
      this.refreshAll();
      U.toast('✓ 資料已還原');
    } catch (err) {
      U.toast(`❌ 還原失敗：${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
};

App.clearAll = function() {
  if (!confirm('⚠ 確定清除所有資料？此操作無法復原！')) return;
  if (!confirm('真的要全部清掉嗎？')) return;
  Object.values(STORE).forEach(key => localStorage.removeItem(key));
  location.reload();
};

// ═══════════════════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════════════════
// ─── ONBOARDING (新使用者第一次登入時的引導) ───
App.showOnboarding = function() {
  this.openModal({
    title: '🎉 歡迎使用 ' + CFG('APP_NAME', 'PM-Core'),
    body: `
      <div style="font-size:13px; line-height:1.7; color:var(--ink2);">
        <p>這是 <b>${U.esc(DATA.settings.userName || '你')}</b> 的個人任務管理工作區。</p>
        <p>所有功能你<b>現在就可以開始用</b>，資料會自動存在這台電腦的瀏覽器裡。</p>

        <div style="margin:18px 0; padding:14px 16px; background:var(--sage-50); border-left:3px solid var(--sage-500); border-radius:6px;">
          <div style="font-weight:600; margin-bottom:6px;">💡 想要跨裝置同步嗎？</div>
          <div style="font-size:12.5px; color:var(--ink3);">
            預設情況下，你的資料只存在這台電腦。如果要在多台裝置（家裡電腦 / 公司桌機 / 筆電）間同步，
            需要建立自己的 Google Sheet 當儲存空間（5 分鐘設定 / 完全免費 / 資料 100% 屬於你）。
          </div>
          <div style="font-size:12px; color:var(--ink4); margin-top:8px;">
            ⚙ 之後到「設定 → ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步」依步驟設定即可
          </div>
        </div>

        <div style="margin-top:14px; padding:12px 14px; background:var(--surface2); border-radius:6px; font-size:12px;">
          <b>📚 快速上手</b><br>
          • 左側 <b>＋ 新增專案</b> 建立你的第一個專案<br>
          • 進入專案後底部「快速新增任務」即可加入任務<br>
          • 任務拖曳到時程表自動排程<br>
          • <b>設定 → 個人資訊</b> 可改名字 / 工時 / 會議時段
        </div>
      </div>
    `,
    footer: `
      <button class="tb-action" onclick="App.closeModal()" style="padding:10px 28px;">開始使用 →</button>
    `,
  });
};

App.openModal = function({ title, body, footer }) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-head">
      <h3>${title}</h3>
      <button class="modal-close" onclick="App.closeModal()">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  `;
  document.getElementById('modalOverlay').classList.add('open');
};

App.closeModal = function() {
  document.getElementById('modalOverlay').classList.remove('open');
};

// ─── Tooltip(data-tip 事件委派):全站單例 DOM,文案格式「標題|內文|內文…」 ───
// CSS 見 style.css .pm-tooltip;掛載於 DOMContentLoaded(initTooltip() 一行)
function initTooltip() {
  const DELAY = 150, GAP = 8, PAD = 8;
  let el = null, timer = null, current = null;

  const show = (target) => {
    const raw = target.getAttribute('data-tip');
    if (!raw) return;
    if (!el) {   // 單例:全站共用一個 DOM,首次才建
      el = document.createElement('div');
      el.className = 'pm-tooltip';
      document.body.appendChild(el);
    }
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    const title = parts.shift() || '';
    el.innerHTML = `<div class="pm-tooltip-title">${U.esc(title)}</div>${
      parts.length ? `<div class="pm-tooltip-body">${U.esc(parts.join('\n'))}</div>` : ''}`;
    // 定位:預設正上方,頂到天花板翻下方;左右夾在 viewport 內(fixed 用 viewport 座標)
    const r = target.getBoundingClientRect();
    let top = r.top - el.offsetHeight - GAP;
    if (top < PAD) top = r.bottom + GAP;
    let left = r.left + r.width / 2 - el.offsetWidth / 2;
    left = Math.max(PAD, Math.min(left, window.innerWidth - el.offsetWidth - PAD));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.classList.add('show');
  };

  const hide = () => {
    clearTimeout(timer); timer = null; current = null;
    if (el) el.classList.remove('show');
  };

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    if (target === current) return;   // 同目標內子元素間移動,不重啟計時
    hide();
    current = target;
    timer = setTimeout(() => show(target), DELAY);
  });
  document.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;   // 還在目標內,不收
    hide();
  });
  // 保險:點擊或任何容器捲動(capture)都收掉,避免殘影跟錯位
  document.addEventListener('click', hide);
  window.addEventListener('scroll', hide, true);
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // 套用品牌/標籤（讀 CFG：本機顯真值、模板顯中性值）
  const _appName = CFG('APP_NAME', 'PM-Core');
  document.title = _appName;
  document.querySelectorAll('.js-brand-name').forEach(el => el.textContent = _appName);
  const _wbsLabel = CFG('WBS_LABEL', 'WBS');
  document.querySelectorAll('.js-wbs-label').forEach(el => el.textContent = _wbsLabel);
  const _jSyncBtn = document.getElementById('topbarJSyncBtn');
  if (_jSyncBtn) _jSyncBtn.title = '從 Google Sheet 同步 ' + _wbsLabel;
  // ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') App.closeModal();
    if (e.key === 'Enter' && e.target.id === 'loginPw') App.doLogin();
  });
  initTooltip();
});
