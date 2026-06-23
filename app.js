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
// 預設 OAuth Client ID：hardcode 在這，同事零設定就能 Google 登入
// 安全性：OAuth Client ID 本來就是公開資訊，配 redirect_uri 白名單防呆
// 來源：https://console.cloud.google.com/apis/credentials  (你的 GitHub Pages 網域)
const DEFAULT_OAUTH_CLIENT_ID = CFG('OAUTH_CLIENT_ID', 'PASTE_YOUR_OAUTH_CLIENT_ID');

// 本地開發偵測：file://（OAuth 無法完成）或 localhost → 跳過 Google、自動 admin、顯示 DEV 切換器。
// 線上 github.io 為 https + hostname 非 localhost → 必為 false，bypass 與 DEV 面板皆不啟用（線上零影響）。
const isLocalDev = (location.protocol === 'file:') || ['localhost', '127.0.0.1'].includes(location.hostname);

// helper：當前登入的 Gmail 是不是 admin
function isAdmin() {
  // role 由後台 BACKEND_URL 查得後存 _role（接 Auth 三層）；不再讀 config ADMIN_EMAILS（線上空）。
  return (typeof DATA !== 'undefined' && DATA.settings && (DATA.settings._role === 'admin' || DATA.settings._role === 'superadmin'));
}

// helper：當前登入的是不是 SuperAdmin（admin 名單管理等最高權限 UI 用）
function isSuperAdmin() {
  return (typeof DATA !== 'undefined' && DATA.settings && DATA.settings._role === 'superadmin');
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
  weekNotes: `pmw::${PATH_KEY}::weeknotes`,
  pdcaGroups: `pmw::${PATH_KEY}::pdcagroups`,
  calendars: `pmw::${PATH_KEY}::calendars`,
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
  // Google OAuth 白名單（只有這些 Gmail 登入後才能編輯）
  allowedEmails: CFG('ALLOWED_EMAILS', []),
  googleClientId: '', // 由使用者在設定頁填入

  // ─── 雲端同步 (Cloud Sync via Google Apps Script) ───
  cloudSyncUrl: CFG('BACKEND_URL', ''),  // 預設讀 config.js 後端 URL（doGet 已綁登入 §14；本機存檔/真值仍優先覆蓋）
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
// 專案識別色：讀 :root 的 --proj-c1~8（亮版），不寫死 hex（消 CSS 鐵則重複）。
// CSS 於 <head> 先載、app.js 在 body 末執行 → getComputedStyle 此刻已能解析變數。
const PROJ_COLORS = (() => {
  const _root = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6, 7, 8].map(n => _root.getPropertyValue(`--proj-c${n}`).trim());
})();
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
  // 工作日曆（架構文件 §第四部分之二）：base 公版假日 + override 公司調休，兩層疊加供 isWorkday/addWorkdays。
  // 步驟 2-1：先建初始結構（holidays 空物件、weekends 先不放維持讀 DATA.settings.workDays、override 待之二.6）；
  // 2-2 才把 isWorkday 改讀此處；第 3 步灌公司公休（約 28 筆範例）進 base.holidays。
  calendars: { base: { name: '台灣公版', holidays: {} }, override: null },
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
      // 工作日曆：舊環境無此 key → fallback 完整預設結構（非 undefined，避免 isWorkday 讀 .base 炸）
      DATA.calendars = JSON.parse(localStorage.getItem(STORE.calendars) || 'null') || { base: { name: '台灣公版', holidays: {} }, override: null };

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
      DATA.tasks.forEach(ensureDeliverFields);
      runMigrations();
    } catch(e) { console.error('Load failed', e); }
  },
  save() {
    // 唯讀防線（咽喉）：viewonly 一律不落地。鎖 body.viewonly（非 _role——viewonly 進來只設 body class、無 _role，鎖 _role 會誤擋）。
    // 靜默 return（不 toast）：save 也被 migration/download 等內部流程呼叫，toast 會誤報；UX 提示放各編輯動作入口（第 3 處）。
    if (document.body.classList.contains('viewonly')) return;
    localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
    localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
    localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
    localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
    localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
    localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
    localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
    localStorage.setItem(STORE.pdcaGroups, JSON.stringify(DATA.pdcaGroups || {}));
    localStorage.setItem(STORE.calendars, JSON.stringify(DATA.calendars || { base: { name: '台灣公版', holidays: {} }, override: null }));

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
  _uploadErrNotified: false,
  _downloadErrNotified: false,

  // Debounced upload (3 秒內多次儲存只上傳一次)
  scheduleUpload() {
    if (this._uploadTimer) clearTimeout(this._uploadTimer);
    this._uploadTimer = setTimeout(() => this.upload(true), 3000);
  },

  // 上傳本地資料到雲端
  async upload(silent = false) {
    // 唯讀防線（咽喉）：viewonly 一律不上傳雲端（堵共用 blob 外洩真向量）。鎖 body.viewonly，靜默 return false。
    if (document.body.classList.contains('viewonly')) return false;
    // ★階段2 守衛：無 id_token（重整/本地/DEV 切換、或登入過期）→ 不送。auto(silent) 靜默跳過、手動 toast 重登。
    if (!Auth._idToken) {
      if (!silent) U.toast('登入已過期，請重新登入', 'error');
      return false;
    }
    const url = DATA.settings.cloudSyncUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 尚未設定雲端 URL', 'warning');
      return false;
    }
    if (this._isUploading) return false;
    this._isUploading = true;
    if (!silent) U.toast('☁ 上傳中...', 'info');

    try {
      // ★安全：上傳前剝掉機密/PII，避免「公開讀」時雲端 blob 外洩。
      //   寫入驗證用 payload.id_token（Google JWT，§14；doPost 驗 role≥editor）。cloudSyncToken 已廢（前端 token UI/設定已清）；此處仍解構剝除，防舊機器 localStorage 殘留值上傳。
      //   _loggedInEmail/_loggedInPicture 為 PII，一併剔除。
      const { cloudSyncToken, _loggedInEmail, _loggedInPicture, _role, ...safeSettings } = DATA.settings;
      const payload = {
        id_token: Auth._idToken,
        data: {
          projects: DATA.projects,
          tasks: DATA.tasks,
          meetings: DATA.meetings,
          memos: DATA.memos,
          schedule: DATA.schedule,
          settings: safeSettings,
          weekNotes: DATA.weekNotes,
          calendars: DATA.calendars,
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
      this._uploadErrNotified = false;
      if (!silent) U.toast('☁ 已上傳到雲端', 'success');
      return true;
    } catch (e) {
      console.error('Cloud upload failed:', e);
      // 真故障（有 _idToken 卻 fetch/後端錯）→ alert 強提示，不分 silent（auto 也彈）；_uploadErrNotified 一次性防 auto-upload 每 3 秒彈一次（成功上傳才 reset）
      if (!this._uploadErrNotified) {
        this._uploadErrNotified = true;
        alert('⚠ 雲端同步失敗\n\n本次改動已存在本機，但未能上傳到雲端。\n資料暫時只在這台裝置，請勿清除瀏覽器資料。\n\n可稍後重試（再次儲存會自動重傳），或聯絡系統管理員。\n\n錯誤：' + e.message);
      }
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
    if (!Auth._idToken) {
      if (!silent) U.toast('登入已過期，請重新登入', 'error');
      return false;
    }
    if (!silent) U.toast('☁ 從雲端下載中...', 'info');

    try {
      const idt = encodeURIComponent(Auth._idToken || '');
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 'id_token=' + idt, {
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
        cloudSyncEnabled: DATA.settings.cloudSyncEnabled,
        cloudAutoSync: DATA.settings.cloudAutoSync,
        _role: DATA.settings._role,   // 本地 session 身份，不被沒帶 _role 的雲端 blob 洗掉
      };

      DATA.projects = cloud.projects || [];
      DATA.tasks = cloud.tasks || [];
      DATA.meetings = cloud.meetings || [];
      DATA.memos = cloud.memos || [];
      DATA.schedule = cloud.schedule || { week: null, items: [] };
      DATA.settings = { ...DEFAULT_SETTINGS, ...(cloud.settings || {}), ...localCloudCfg };
      DATA.weekNotes = cloud.weekNotes || {};
      // ⚠ 防坑：雲端沒帶 calendars（舊 blob）→ 保留本地剛匯入的，不可用空預設蓋掉
      DATA.calendars = cloud.calendars || DATA.calendars;
      DATA.settings.cloudLastSync = new Date().toISOString();

      // 寫入 localStorage（直接寫，不觸發 auto-upload）
      localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
      localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
      localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
      localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
      localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
      localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
      localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
      localStorage.setItem(STORE.calendars, JSON.stringify(DATA.calendars));
      // 雲端覆蓋後再跑一次 migration（否則 load 時跑的會被雲端蓋掉）；其內 Storage.save 會把結果上傳回雲端
      runMigrations();

      this._refreshSyncStatus();
      this._downloadErrNotified = false;
      if (!silent) U.toast('☁ 已從雲端載入最新資料', 'success');
      return true;
    } catch (e) {
      console.error('Cloud download failed:', e);
      // 真故障 → toast（風險低，本地資料還在）；_downloadErrNotified 一次性防 auto-download 重複彈（成功下載才 reset）
      if (!this._downloadErrNotified) {
        this._downloadErrNotified = true;
        U.toast('⚠ 雲端下載失敗，未能拉取最新資料', 'warning');
      }
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
    // 工作日曆兩層疊加（§第四部分之二.5）。DATA.calendars 未載入(舊環境)→ 退回只認週末。
    const cal = (typeof DATA !== 'undefined' && DATA.calendars) || null;
    const base = cal && cal.base;
    const override = cal && cal.override;   // 可能 null
    // a. 覆蓋層補班 → 一定上班（最高優先）
    if (override?.workOverrides && iso in override.workOverrides) return true;
    // b. 覆蓋層額外公休 → 不上班
    if (override?.extraHolidays && iso in override.extraHolidays) return false;
    // c. 基底層國定假日 → 不上班（base.holidays 是物件，用 in 判斷存在）
    if (base?.holidays && iso in base.holidays) return false;
    // d. 否則照 workDays（週末維持現狀；無 DATA 退回週一~五）
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

// §7.1：四繳付欄位 schema 兜底（mustDeliver 既有，此處補三新欄）。照 ensureTaskType 模式：
// 每次 load 跑、只補缺不蓋值。布林用 typeof 判缺（false 是合法值，不可被預設蓋掉）。
function ensureDeliverFields(task) {
  if (!task) return task;
  if (typeof task.deliverableType !== 'string') task.deliverableType = '';     // 繳付件類型
  if (typeof task.requiredTask !== 'boolean')    task.requiredTask = true;     // 必要任務（預設全必要）
  if (typeof task.mustIssue !== 'boolean')       task.mustIssue = false;       // 繳付物必須發行
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
  // 注意：ensureTaskType(193) 在本 migration(194) 前跑，存量 taskType 已被補成 'task'，
  //       故用 category 判斷直接改寫，不能用「taskType 缺席」當條件
  // group 不處理：存量資料無「群組」痕跡可辨識，group 只從 M2-T1 後新同步/匯入產生
  if (!M.taskTypeBackfill_v1) {
    DATA.tasks.forEach(t => {
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

// 狀態中文標籤：刻意獨立於 LABELS.status，供未來語系切換時狀態標籤可各自切換；綜觀清單 row 讀此（非 LABELS.status）
const STATUS_LABELS_ZH = { pending: '未開始', wip: '進行中', done: '已完成', hold: '擱置中' };
// 緊急程度中文標籤：同上獨立於 LABELS.urgency（緊急/普通/不急），綜觀清單用「高/中/低」短字；供語系切換各自切換
const URGENCY_LABELS_ZH = { high: '高', medium: '中', low: '低' };

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

// ─── CLEAN OLD DONE TASKS ──────────────────────────────
function cleanOldDoneTasks() {
  const retentionDays = DATA.settings.doneRetentionDays || 30;
  if (retentionDays === 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const before = DATA.tasks.length;
  DATA.tasks = DATA.tasks.filter(t => {
    if (t.status !== 'done') return true;
    if (t.measureType !== 'hours') return true; // 工期制（WBS/手動專案任務）永不自動清除，只清時段制雜事
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
// 排入行事曆分流：回傳勾選 scheduleToCalendar 的任務子集（純函式，不碰 DOM/Storage）
//   舊資料無此欄 → undefined !== true → 自然排除，不需 migration
//   第7項只到「回傳正確子集」，時程表 render 吃這個函式是第8項
function getCalendarTasks(tasks) {
  return tasks.filter(t => t.scheduleToCalendar === true);
}

// ── [CORE] 前置依賴 序號→id 翻譯工具（§8b.5 層次二，純函式，不碰 DOM/Storage）──
// 單一真實來源：WBS 匯入 / J 同步 / 手動表單三條路徑共用此翻譯，邏輯只此一份。
//
// buildWbsToIdMap(tasks)：建「wbs序號(String) → task.id」查找表。
//   - 只收有 wbs 的 task（空字串 / null / undefined 跳過）。
//   - 同序號重複：保留先者（map.has 才不覆蓋）。
//   - 純函式，回傳 Map。
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

// translatePredToId(predStr, wbsToIdMap)：把「序號字串 predecessor」翻成「id 字串 predecessor」。
//   - 沿用 parsePredecessors 同一套拆解（逗號/分號分隔、每段 ^(\d+)([A-Za-z]{2})?([+-]數字)?）。
//   - 只翻「序號部分」→ id；關係(FS/SS/FF/SF)與 lag(+N) 原樣保留。
//   - 查得到 → 'id_xxx#FS+2'（# 分隔 id 與 type，純前置 → 'id_xxx#'）；查不到 → 該段原樣保留（不丟棄，好 debug）。
//   - 純函式，回傳翻譯後字串。
function translatePredToId(predStr, wbsToIdMap) {
  if (predStr === null || predStr === undefined) return '';
  const s = String(predStr).trim();
  if (!s) return '';
  // 保留原分隔片段順序；逐段 match，序號翻 id、其餘原樣黏回。
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
    if (!m) { out.push(part); continue; }           // 無法解析 → 原樣保留
    const id = wbsToIdMap && wbsToIdMap.get(String(m[1]).trim());
    if (!id) { out.push(part); continue; }          // 查不到 → 原樣保留
    const type = m[2] ? m[2] : '';
    const lag = m[3] ? m[3].replace(/\s+/g, '') : '';
    out.push(id + '#' + type + lag);                 // id#關係lag（# 分隔，根除 id 結尾字母與 type 撞；type/lag 可空）
  }
  return out.join(',');
}

// 待辦列表前置：顯示「接在 #N 後」（N=_seqOf）。無→「—」；多筆→「接在 #3、#5 後」。
function prettyPredecessor(predStr) {
  const preds = parsePredecessors(predStr);
  if (!preds.length) return '—';
  return '接在 ' + preds.map(p => '#' + App._seqOf(p.dep)).join('、') + ' 後';
}

// 前置 title 全名白話（序號看不懂時 hover 補救）：無→''；單→「接在《X》後」；多→「接在 N 項後」。
function predTitleOf(predStr) {
  const preds = parsePredecessors(predStr);
  if (!preds.length) return '';
  if (preds.length === 1) {
    const dep = DATA.tasks.find(x => x.id === preds[0].dep);
    return dep ? '接在《' + dep.name + '》後' : '接在 1 項後';
  }
  return '接在 ' + preds.length + ' 項後';
}

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
    // 兩格式相容（§8b.5 層次二）：以「有無 #」切分支。
    //   有 #（id 格式）：# 前＝dep（任意字元，原樣取，因 id 是 id_xxx/sync_xxx）；# 後＝type+lag。
    //   無 #（舊序號格式）：dep(純數字) + 緊貼 type + lag —— fixture 與未翻譯資料走這條。
    const hashIdx = part.indexOf('#');
    let dep, mTail;
    if (hashIdx >= 0) {
      dep = part.slice(0, hashIdx).trim();
      // # 後只剩可選 type(2 字母) + 可選 lag；type/lag 皆可空（純前置翻成 'id_xxx#'）
      mTail = part.slice(hashIdx + 1).trim().match(/^([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!dep || !mTail) continue;            // dep 空 / # 後格式不合 → 跳過
    } else {
      // 舊序號格式：dep(數字) + 可選 type(2 字母) + 可選 lag(+/- 數字，容忍空白)
      const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!m) continue;                        // 無法解析（非數字開頭）→ 跳過
      dep = m[1];
      mTail = [m[0], m[2], m[3]];              // 對齊 # 分支：[全, type, lag]，下方共用解析
    }
    let type = (mTail[1] || 'FS').toUpperCase();
    if (!VALID.includes(type)) type = 'FS';    // 未知關係 → FS
    let lag = 0;
    if (mTail[2]) {
      const n = parseInt(mTail[2].replace(/\s+/g, ''), 10);
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
      // FS：起點(SOD) ≥ 前置終點(EOD)，offset=Math.max(1,lag)（純FS=1、FS+N=N，下限1），與 computeSchedule 同尺；
      // SS/FF/SF 端點同層級(SOD≥SOD / EOD≥EOD / EOD≥SOD)當日即成立，用純 lag、不墊高。
      const fsOffset = (p.type === 'FS') ? Math.max(1, p.lag) : p.lag;
      const predShifted = D.addWorkdays(new Date(predRefStr), fsOffset);
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

function isTaskDelayed(task, today) {
  if (!task || task.status === 'done' || task.status === 'hold') return false;
  const end = getEffectiveSchedule(task).end;
  return !!end && new Date(end) < new Date(today);
}

function groupTasksForBoard(tasks, today) {
  const cols = [
    { key: 'pending', label: '未開始', tasks: [] },
    { key: 'wip',     label: '進行中', tasks: [] },
    { key: 'delayed', label: '延遲',   tasks: [] },
    { key: 'done',    label: '已完成', tasks: [] },
    { key: 'hold',    label: '擱置中', tasks: [] }
  ];
  const byKey = {};
  cols.forEach(c => { byKey[c.key] = c; });
  (tasks || []).forEach(t => {
    if (isTaskDelayed(t, today)) { byKey.delayed.tasks.push(t); return; }
    const k = byKey[t.status] ? t.status : 'pending';
    byKey[k].tasks.push(t);
  });
  return cols;
}

// 三視圖共用篩選（§1.8）。status='delayed' 走 isTaskDelayed（與看板延遲欄同口徑）；
// 其餘 status 直接比對 t.status。variant 欄位本批預留不實作（傳了也忽略）。
function filterTasks(tasks, f, today) {
  f = f || {};
  const kw = (f.keyword || '').trim().toLowerCase();
  return (tasks || []).filter(t => {
    if (f.status) {
      if (f.status === 'delayed') { if (!isTaskDelayed(t, today)) return false; }
      else if (t.status !== f.status) return false;
    }
    if (f.stage) {
      const st = (t.stage || '').trim() || '未分階段';
      if (st !== f.stage) return false;
    }
    if (f.dept && t.dept !== f.dept) return false;
    if (kw) {
      const hay = ((t.wbs || '') + ' ' + (t.name || '') + ' ' + (t.owner || '')).toLowerCase();
      if (hay.indexOf(kw) < 0) return false;
    }
    return true;
  });
}

// 步驟4 第一段：依賴圖 + 拓撲排序 + 循環偵測（不算日期，computeSchedule 第二段會用）
// 節點 key = task.id（前置 id 化後，§8b.5 層次二）；邊 = parsePredecessors(task.predecessor) 的每個 dep(id) → 本任務。
// @param tasks 任務陣列
// @return {
//   order:    [id,...]       拓撲順序（前置在前、依賴在後；不含 circular 節點）
//   circular: [id,...]       落在環上的節點（標 error:'circular'，排程時跳過）
//   nodes:    Map<id,task>   節點查找表
//   edges:    Map<id,[{dep,type,lag}...]>  每個節點「已存在於圖中」的前置邊
// }
// 三色 DFS：white(未訪) / gray(訪問中，在堆疊上) / black(完成)。
//   訪問中又遇到 gray 節點 → 有環；直接環 A→B→A 與間接環 A→B→C→A 都會在重遇 gray 時抓到。
//   只把「環上節點」(gray 重遇點 → 堆疊頂這一段) 標 circular，不誤標單純「依賴環的上游」。
//   用迭代式 DFS（顯式堆疊）避免大圖遞迴爆堆疊。
function topoSortTasks(tasks) {
  const list = (tasks || []).filter(t => t && t.measureType !== 'hours');
  const nodes = new Map();
  for (const t of list) nodes.set(t.id, t);

  // 邊：本任務 → 它的前置；只保留 dep 存在於 nodes 的邊。
  // 不存在的前置不影響拓撲（由 isTaskBlocked 另報「前置不存在」）。
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

// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
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
// ═══ Auth：權限層（§8f.8b 隔離紀律——只判斷、不碰核心資料/排程；未來剪下成獨立檔）═══
const Auth = {
  // 開發測試用 role 切換器：DEV_MODE = isLocalDev → 本地（file:///localhost）才顯示切換器測四層；線上 https 必 false（面板不顯示）。
  DEV_MODE: isLocalDev,
  DEV_FIRST_KEY: 'pmcore-setup-2026',   // ⑤ 本地首登密鑰假值（塊三接後端後移除，改後端驗證）

  // 切換測試身份（superadmin/admin/editor/viewonly/none），寫 localStorage + 設 _role + body class + 重繪
  setDevRole(role) {
    localStorage.setItem('auth_dev_role', role);
    DATA.settings._role = (role === 'admin' || role === 'superadmin' || role === 'editor') ? role : undefined;
    if (role === 'viewonly') {
      document.body.classList.add('viewonly');
    } else if (role === 'none') {
      Auth.enterBlockout();
    } else {
      document.body.classList.remove('viewonly');
    }
    // 切到非 none 身份時收掉殘留擋頁（none→其他身份切回去不殘留）
    const bo = document.getElementById('authBlockout');
    if (bo && role !== 'none') bo.classList.add('hidden');
    Storage.save();
    App.refreshUserBadge();
    App.refreshAll();
    U.toast('🔧 [DEV] 切換身份：' + role, 'info');
    Auth.renderDevPanel(); // 重畫面板讓「目前：」即時更新切後身份
  },

  // 渲染浮動切換面板（DEV_MODE 才顯示，角落固定）
  renderDevPanel() {
    if (!this.DEV_MODE) return;
    let panel = document.getElementById('authDevPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'authDevPanel';
      document.body.appendChild(panel);
    }
    const cur = localStorage.getItem('auth_dev_role') || '(未設)';
    panel.innerHTML =
      '<div class="adp-title">🔧 DEV 身份</div>' +
      '<div class="adp-cur">目前：' + cur + '</div>' +
      ['superadmin', 'admin', 'editor', 'viewonly', 'none'].map(r =>
        '<button class="adp-btn" onclick="Auth.setDevRole(\'' + r + '\')">' + r + '</button>'
      ).join('');
  },

  // none / Can't view：全屏擋頁，只 render 自己、不碰 task/project 資料（§8f.5 / §8f.8b 隔離紀律）
  enterBlockout() {
    document.body.classList.remove('viewonly'); // 擋頁不是唯讀，清掉 viewonly class
    const ov = document.getElementById('loginOverlay');
    if (ov) ov.classList.add('hidden'); // 登入框也藏掉，只剩擋頁
    let el = document.getElementById('authBlockout');
    if (!el) {
      el = document.createElement('div');
      el.id = 'authBlockout';
      el.innerHTML = '<div>您沒有檢視權限，請聯絡管理員</div>';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
  },

  // §8f.3b：SuperAdmin 進他人副本提醒。後端未接，目前只留介面（DEV 面板手動觸發測）。
  showForeignWarning() {
    U.toast('⚠️ 你正以 SuperAdmin 身份進入他人副本，請小心避免誤改資料', 'warning');
  },

  // ④ 白名單：editor/viewonly 兩名單，localStorage 暫存（auth_* 裸 key，塊三接後端換來源）
  _getList(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  },
  checkWhitelist(email) {
    // 純判斷：回 editor / viewonly / none（後端接上後換 fetch）
    const e = (email || '').trim().toLowerCase();
    if (!e) return 'none';
    if (this._getList('auth_editor_list').includes(e)) return 'editor';
    if (this._getList('auth_viewonly_list').includes(e)) return 'viewonly';
    return 'none';
  },

  // ④ 名單管理改打後端（getlists/setlist）。in-memory 快取 + id_token（不寫 localStorage）。
  _idToken: '',
  _lists: { editor: [], viewonly: [], admin: [] },

  // POST 後端（BACKEND_URL 同一部署的 doPost）。text/plain 免 CORS preflight；回 parsed JSON，網路失敗 throw。
  async _postBackend(payload) {
    const url = CFG('BACKEND_URL', '');
    if (!url) throw new Error('no-backend');
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },

  // 後端錯誤 → 對應 toast；token 相關 → 提示重新登入。回 true=有錯（呼叫端 return）。
  _backendErr(j) {
    if (!j || j.ok !== true) {
      const e = (j && j.error) || '';
      if (e === 'Invalid token' || e === 'Missing id_token' || e === 'Token verify failed') {
        U.toast('登入已過期，請重新登入', 'error');
      } else if (e === 'Forbidden' || e === 'aud mismatch' || e === 'email not verified') {
        U.toast('沒有管理權限', 'error');
      } else {
        U.toast('名單操作失敗：' + (e || '未知錯誤'), 'error');
      }
      return true;
    }
    return false;
  },

  // ④ 從後端拉兩份名單 → 快取 + 畫。失敗：toast、不洗掉現有顯示。
  async renderLists() {
    if (!document.getElementById('wl-editor-list')) return;   // 不在設定頁 → 防呆
    let j;
    try {
      j = await this._postBackend({ action: 'getlists', id_token: this._idToken });
    } catch (err) {
      U.toast('讀取名單失敗（連不到後端）', 'error');
      return;   // 不洗掉現有顯示
    }
    if (this._backendErr(j)) return;
    this._lists = { editor: j.editor || [], viewonly: j.viewonly || [], admin: j.admin || [] };
    this._drawLists();
  },

  // 純畫（從 _lists 快取，不 fetch）
  _drawLists() {
    const draw = (type, elId) => {
      const box = document.getElementById(elId);
      if (!box) return;
      const list = this._lists[type] || [];
      if (!list.length) { box.innerHTML = '<div class="wl-empty">尚無</div>'; return; }
      box.innerHTML = list.map(e =>
        '<div class="wl-item"><span>' + U.esc(e) + '</span>' +
        '<button class="wl-del" onclick="Auth.removeFromList(\'' + type + '\',\'' + U.esc(e) + '\')">✕</button></div>'
      ).join('');
    };
    draw('editor', 'wl-editor-list');
    draw('viewonly', 'wl-viewonly-list');
    draw('admin', 'wl-admin-list');
  },

  // ④ 加入名單：前端驗格式/去重/跨名單互斥 → 算新整份 → POST setlist → 成功才更新
  async addToList(listType, inputId) {
    const input = document.getElementById(inputId);
    const email = (input ? input.value : '').trim().toLowerCase();
    if (!email) { U.toast('請輸入 email', 'warning'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { U.toast('email 格式不對', 'error'); return; }
    if ((this._lists[listType] || []).includes(email)) { U.toast('已在名單', 'warning'); return; }
    const others = ['editor', 'viewonly', 'admin'].filter(t => t !== listType);
    if (others.some(t => (this._lists[t] || []).includes(email))) { U.toast('已在其他名單，請先移除', 'warning'); return; }

    const newList = (this._lists[listType] || []).concat(email);
    let j;
    try {
      j = await this._postBackend({ action: 'setlist', id_token: this._idToken, listType: listType, emails: newList });
    } catch (err) { U.toast('寫入失敗（連不到後端）', 'error'); return; }
    if (this._backendErr(j)) return;
    this._lists[listType] = newList;
    if (input) input.value = '';
    this._drawLists();
    U.toast('✓ 已加入名單');
  },

  // ④ 移除名單：算新整份 → POST setlist → 成功才更新
  async removeFromList(listType, email) {
    const newList = (this._lists[listType] || []).filter(e => e !== email);
    let j;
    try {
      j = await this._postBackend({ action: 'setlist', id_token: this._idToken, listType: listType, emails: newList });
    } catch (err) { U.toast('移除失敗（連不到後端）', 'error'); return; }
    if (this._backendErr(j)) return;
    this._lists[listType] = newList;
    this._drawLists();
  },

  // ⑤ 本地首登綁定：記此 email 為本機 admin（一次性，塊三換後端 Script Properties）
  bindAdmin(email) {
    localStorage.setItem('auth_admin_bound', (email || '').trim().toLowerCase());
  },

  // ⑤ 本地 role 判斷（無後端時的 fallback，對齊 §8f.3 順序）：
  //   1. 已綁定本機 admin → admin
  //   2. 首登密鑰對 + 本機尚無 admin → 綁定 + admin（一次性）
  //   3. 否則查名單 → editor/viewonly/none
  tryLocalRole(email, setupKey) {
    const e = (email || '').trim().toLowerCase();
    const bound = (localStorage.getItem('auth_admin_bound') || '').trim().toLowerCase();
    if (bound && bound === e) return 'admin';
    if (!bound && setupKey && setupKey === this.DEV_FIRST_KEY) {
      this.bindAdmin(e);
      return 'admin';
    }
    return this.checkWhitelist(e);
  },
};

const App = {
  currentPage: 'dashboard',
  currentProjectId: null,
  currentView: 'dashboard', // B-1 總儀表板視圖:dashboard|gantt|month(全專案範圍)
  projectView: 'dashboard', // B-2 專案頁視圖:dashboard|gantt|month(單專案範圍,獨立於 currentView)
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


    // Login check
    this.checkLoginState();
    Auth.renderDevPanel();   // 🔧 DEV 身份面板（DEV_MODE 才顯示）

    // ☁ 雲端同步：init 不在此自動拉（階段3）——改由 handleGoogleCredential 登入成功後拉（因果正確：有憑證才拉）。
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
    // userMode 統一依狀態顯示（單一真實來源）：viewonly > superadmin > admin > editor
    const um = document.getElementById('userMode');
    if (um) {
      if (document.body.classList.contains('viewonly')) um.textContent = 'VIEW ONLY';
      else if (DATA.settings._role === 'superadmin') um.textContent = 'SUPER ADMIN';
      else if (DATA.settings._role === 'admin') um.textContent = 'ADMIN';
      else um.textContent = 'EDITOR';
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
    // 本地開發（file:// 或 localhost）：OAuth 在 file:// 無法完成 → 跳過 Google，自動 admin 直接可編輯。
    //   ★ 在 initGoogleSignIn 之前 return，本地不碰 Google（避免 file:// 上初始化卡住）。
    //   ★ 線上 github.io 為 https，isLocalDev=false → 絕不進此分支，照常走後端四層 role。
    if (isLocalDev) {
      DATA.settings._role = 'admin';
      document.body.classList.remove('viewonly');
      localStorage.setItem('auth_dev_role', 'admin');   // 乙案 session-only：清掉殘留 viewonly，面板顯示=實際 admin，reload 自動復原
      const ov = document.getElementById('loginOverlay'); if (ov) ov.classList.add('hidden');
      const bo = document.getElementById('authBlockout'); if (bo) bo.classList.add('hidden');
      this.refreshUserBadge();
      this.refreshAll();   // _role 設後重畫側邊欄（設定鈕顯隱在 renderSidebar），比照 handleGoogleCredential
      return;
    }
    // landing 只剩單一 Google 登入 + 首登密鑰 + 檢視模式（loginPwMode/googleSetupHint 已拔，無顯隱分支）
    // ★ overlay 預設可見、登入成功才 hide；clientId + initGoogleSignIn 必須留 = 顯示登入框+掛 Google 按鈕本身
    const clientId = DATA.settings.googleClientId || DEFAULT_OAUTH_CLIENT_ID;
    this.initGoogleSignIn(clientId);
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

  async handleGoogleCredential(resp) {
    try {
      // Decode JWT payload (no verify needed for client-side, Google has issued it)
      const parts = resp.credential.split('.');
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
      const email = (payload.email || '').toLowerCase();
      const name = payload.name || payload.given_name || 'User';
      const picture = payload.picture || '';

      // ─── 四層權限判斷（Admin > Editor > Viewonly > none）───
      // 安全紀律：有後端 roleUrl → 一律走後端，fetch 任何失敗（連不到/逾時/非 JSON）→ role='none' → 絕不放行。
      //   本地 fallback 只在「無 roleUrl」（純前端塊二階段）啟用，不是後端失敗的備胎——
      //   否則塊三上線後，切斷後端網路即可讓登入掉進本地判斷繞過授權。
      let role = 'none';
      const roleUrl = CFG('BACKEND_URL', '');
      if (roleUrl) {
        // 有後端 → 一律走後端，失敗往 none 倒（原安全紀律不變）
        try {
          const r = await fetch(roleUrl + '?action=role&email=' + encodeURIComponent(email), {
            method: 'GET', mode: 'cors', redirect: 'follow',
          });
          const j = await r.json();
          role = (j && j.role) || 'none';
        } catch (err) {
          console.error('Role check failed', err);
          role = 'none';   // 後端失敗 → 絕不放行
        }
      } else {
        // 無後端（塊二純前端階段）→ 本地 fallback 判斷
        const setupKey = (document.getElementById('loginSetupKey') || {}).value || '';  // landing input，子塊2才有，現在讀不到回空
        role = Auth.tryLocalRole(email, setupKey);
      }
      Auth._idToken = resp.credential;   // ★階段3(5a)：JWT 解出即有效憑證（與 role 無關），上移到分支前，供 viewonly 也能讀雲端 + 名單管理用（in-memory 不落地）
      if (role === 'viewonly') {
        // viewonly → 唯讀可看（§8f.4），不設 _loggedInEmail（PII 不留）
        this.enterViewOnly();
        if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudSyncUrl) {
          CloudSync.download(true).then(s => { if (s) { this.refreshAll(); this.renderSidebar(); } });
        }
        U.toast('此帳號僅供檢視', 'warning');
        return;
      }
      if (role !== 'admin' && role !== 'editor' && role !== 'superadmin') {
        // none / 未知 → Can't view 擋頁（§8f.5）；superadmin/admin/editor 才放行，不留 PII、不顯示任何內容
        Auth.enterBlockout();
        return;
      }

      // admin 或 editor → 編輯模式（_role 供 isAdmin() 判 admin 功能）
      DATA.settings.userName = name;
      DATA.settings._role = role;
      DATA.settings._loggedInEmail = email;
      DATA.settings._loggedInPicture = picture;
      Storage.save();
      document.body.classList.remove('viewonly');
      document.getElementById('loginOverlay').classList.add('hidden');
      this.refreshUserBadge();
      this.refreshAll();   // ★ 重畫側邊欄，登入後即時算 setBtn 顯隱（admin 設定鈕出現），比照 setDevRole
      U.toast(`✓ 歡迎 ${name}`);

      // ★階段3(5c/4b)：登入成功（已有 _idToken）→ 拉一次雲端（取代 init 800ms 盲猜計時器）。因果正確：有憑證才拉。
      if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudSyncUrl) {
        CloudSync.download(true).then(success => {
          if (success) { this.refreshAll(); this.renderSidebar(); U.toast('☁ 已自動從雲端同步最新資料', 'success'); }
        });
      }
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

  enterViewOnly() {
    document.body.classList.add('viewonly');
    document.getElementById('loginOverlay').classList.add('hidden');
    this.refreshUserBadge();
  },

  // 唯讀編輯守門（UX）：viewonly 時 toast 提示並回 true，呼叫端 `if (App._roGuard()) return;`。
  // 單一真實來源：toast 文字只此一處。安全防線在 Storage.save/upload 咽喉（此僅 UX 提示、非安全層）。
  _roGuard() {
    if (document.body.classList.contains('viewonly')) { U.toast('唯讀模式，無法編輯', 'warning'); return true; }
    return false;
  },

  // ─── PAGE NAV ───
  showPage(name, btn) {
    if (name === 'settings' && !isAdmin()) { return this.showPage('dashboard', document.querySelector('[data-page=dashboard]')); }
    this.currentPage = name;
    if (name === 'dashboard') this.currentView = 'dashboard';
    if (name === 'project') this.projectView = 'dashboard';
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
    if (name === 'gantt') { this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id)); this.ganttStageFilter = null; this.ganttOwnerFilter = null; }
    this.renderPage(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchView(view) {
    this.currentView = view;
    if (view === 'dashboard') { this.renderDashboard(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (view === 'gantt') { this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id)); this.ganttStageFilter = null; this.ganttOwnerFilter = null; }
    document.getElementById('page-dashboard').innerHTML = `<div class="view-tabs-bar">${this.buildViewTabsHtml()}</div><div id="view-body"></div>`;
    if (view === 'gantt') this.renderGantt('view-body');
    if (view === 'month') this.renderMonth('view-body');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchProjectView(view) {
    this.projectView = view;
    if (view === 'dashboard') { this.renderProject(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (view === 'gantt') { this.ganttProjectFilter = new Set([this.currentProjectId]); this.ganttStageFilter = null; this.ganttOwnerFilter = null; }
    document.getElementById('page-project').innerHTML = this.buildProjectHeaderHtml() + '<div class="view-tabs-bar">' + this.buildProjectViewTabsHtml() + '</div><div id="proj-view-body"></div>';
    if (view === 'gantt') this.renderGantt('proj-view-body', true);
    if (view === 'month') this.renderMonth('proj-view-body', this.currentProjectId);
    if (view === 'kanban') this.renderKanban('proj-view-body', this.currentProjectId);
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
    // §15 段4：同名群組（count>1）才顯版號副標，單一專案不顯（避免雜訊）
    const nameCount = {};
    DATA.projects.forEach(p => { nameCount[p.name] = (nameCount[p.name] || 0) + 1; });
    list.innerHTML = DATA.projects.map(p => {
      const cnt = DATA.tasks.filter(t => t.project === p.id && t.status !== 'done' && !t._deleted).length;
      const isActive = this.currentPage === 'project' && this.currentProjectId === p.id;
      // 版號 + 日期副標：日期 importedAt||createdAt（B 方案 fallback）、D.fmt 本地避 -1 天；version||1 兜底舊專案
      const ver = nameCount[p.name] > 1
        ? `<span style="font-size:9.5px; font-family:var(--mono); color:var(--sidebar-ink2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">V${p.version || 1} · ${D.fmt(p.importedAt || p.createdAt, 'iso')}</span>`
        : '';
      return `<button class="sb-proj ${isActive ? 'active' : ''}" onclick="App.openProject('${p.id}', this)">
        <span class="dot" style="background:${p.color}"></span>
        <span style="flex:1; min-width:0; display:flex; flex-direction:column; gap:1px;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${U.esc(p.name)}</span>
          ${ver}
        </span>
        <span class="count">${cnt}</span>
      </button>`;
    }).join('');


    const setBtn = document.querySelector('[data-page=settings]');
    if (setBtn) setBtn.style.display = isAdmin() ? '' : 'none';

    // 登出鈕：僅真登入身份（有 _role：editor/admin/superadmin）顯示；viewonly/none 無 _role、無 session 可登出
    const logoutBtn = document.querySelector('.sb-logout');
    if (logoutBtn) logoutBtn.style.display = (DATA.settings._role === 'editor' || DATA.settings._role === 'admin' || DATA.settings._role === 'superadmin') ? '' : 'none';
  },

  openProject(id, btn) {
    this.currentProjectId = id;
    this.showPage('project', btn);
  },
};

// ═══ 範本套用引擎（§8d.6）═══════════════════════════════════
// _reschedulePreview：applyTemplate ⑧+6b 抽出的純排程段，供 applyTemplate 與 _s2SetDuration 共用。
// 直接 mutate tasks[].plannedStart/End（純資料層，不碰 DOM/Storage）；warnings 由呼叫端傳入收集。
App._reschedulePreview = function(tasks, variants, warnings) {
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
  // 6b 溢出偵測：per 案別 computedEnd=max(plannedEnd) vs 設定結束日（有填才比）
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
};

// App.applyTemplate(template, userInput)：純函式，只回傳資料、不碰 DOM/Storage（[CORE]）。
//   批1：①建專案 ②建 variants(含 schedule)+對照表 ③建 depts(ui.depts→多成員,空部門/無成員跳過)。
//   task/warnings 暫留空；步驟④~⑧(篩階段/id重產/依賴重指/排程)後批接入。
//   userInput = { projectName, color?, note,
//     cases:[{variantName,templateVariant,startDate,endDate,direction,selectedStages,stageRenames}],
//     depts:[{name,members:[{name}]}] }；cases[0]=主案。
//   templateVariant=範本來源 key（對 template.cases[].variant，如「主案」/「另案」）；無則退回 variantName。
//   ④ 跑 ui.cases（非 template.cases）：多個自訂名另案各用 templateVariant 反查同一範本來源、各生成一份。
App.applyTemplate = function(template, userInput) {
  const ui = userInput || {};

  // ① 專案物件（形狀對齊 saveProject/performWbsImport；ensurePdcaData 補 pdca）
  const project = {
    id: U.id(),
    name: (ui.projectName || '').trim(),
    color: ui.color || PROJ_COLORS[0],
    note: (ui.note || '').trim(),
    synced: false,
    createdAt: new Date().toISOString(),
  };
  ensurePdcaData(project);

  // ② variants(含 schedule) + variantNameToId 對照表（平行 depts 的 nameToId）
  const variants = [];
  const variantNameToId = {};
  (ui.cases || []).forEach(c => {
    const id = U.id();
    const name = (c.variantName || '').trim();
    variants.push({
      id, name,
      schedule: {
        startDate: c.startDate || '',
        endDate: c.endDate || '',
        direction: c.direction || 'forward',
      },
      stages: c.selectedStages ? c.selectedStages.slice() : [],
    });
    variantNameToId[name] = id;
  });

  // ③ depts（共用部門編輯元件的 ui.depts → 多成員；空部門名 / 無有效成員 → 跳過不建空部門）
  const depts = [];
  (ui.depts || []).forEach(d => {
    const name = (d.name || '').trim();
    if (!name) return;
    const members = (d.members || [])
      .map(m => (m.name || '').trim()).filter(Boolean)
      .map(nm => ({ id: U.id(), name: nm }));
    if (!members.length) return;
    depts.push({ id: U.id(), name: name, members: members });
  });

  // ④ 篩選勾選階段 + 收集 excludedNs / ⑤ id重產 / ⑦ task組裝（38欄）
  //   predecessor 暫留 raw 序號字串，批2b 才譯 id（excludedNs 斷依賴+warning）
  const roleToDeptId = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; });
  const dailyHours = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.dailyHours) || 6;

  const tasks = [];
  // 被砍階段的 n 改「按案別」收集（variantId→Set(n)；null/通案 → 空字串 key）。
  // 同源範本兩案 n 重複，全域 Set 會跨案誤砍另案前置，故分案。
  const excludedByVariant = {};
  const variantKey = (v) => (v == null ? '' : v);
  // 跑 ui.cases（非 template.cases）：每個使用者案別用 templateVariant 反查範本來源，
  // 多個自訂名另案各生成一份（templateVariant 無則退回 variantName，向後相容舊測試）。
  (ui.cases || []).forEach(uiCase => {
    const srcKey = (uiCase.templateVariant || uiCase.variantName || '').trim();
    const tc = (template && template.cases ? template.cases : []).find(t => (t.variant || '').trim() === srcKey);
    if (!tc) return;   // 找不到對應範本來源 → 不生成（§8d.4 另案不選則不建）
    const variantId = variantNameToId[(uiCase.variantName || '').trim()] || null;
    const selected = uiCase.selectedStages || null;
    (tc.modules || []).forEach(mod => {
      const included = !selected || selected.indexOf(mod.stage) >= 0;
      (mod.tasks || []).forEach(tk => {
        if (!included) {
          const _vk = variantKey(variantId);
          (excludedByVariant[_vk] || (excludedByVariant[_vk] = new Set())).add(tk.n);
          return;
        }
        tasks.push({
          id: U.id(),
          project: project.id,
          wbs: tk.n,
          parentWbsId: '',
          name: tk.name || '',
          desc: mod.stage ? (mod.stage + ' / ' + (tk.subgroup || '')) : (tk.subgroup || ''),
          category: (tk.type || '').indexOf('里程碑') >= 0 ? 'meeting' : 'deep',
          taskType: tk.type || '任務',
          predecessor: tk.predecessor || '',
          durationDays: tk.durationDays,
          owner: '',
          dept: roleToDeptId[(tk.role || '').trim()] || '',
          variant: variantId,
          start: '',
          end: '',
          plannedStart: '',
          plannedEnd: '',
          actualStart: '',
          actualEnd: '',
          progress: 0,
          status: 'pending',
          urgency: 'med',
          estHours: parseFloat(tk.durationDays || 0) * dailyHours || 4,
          method: '',
          canSplit: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          scheduledStart: '',
          scheduledEnd: '',
          synced: false,
          stage: mod.stage || '',
          subgroup: tk.subgroup || '',
          mustDeliver: false,
          deliverableType: '',   // §7.1（不接 UI，預設值）
          requiredTask: true,    // §7.1（預設全必要）
          mustIssue: false,      // §7.1
          deliverable: tk.deliverable || '',
          riskIssue: '',
          delivered: '',
          deliverableLink: '',
          note: '',
        });
      });
    });
  });

  // 衍生扁平 excludedNs（各案 Set 的 union）供回傳契約（test 斷言 res.excludedNs；回傳形狀不變）
  const excludedNs = [].concat(...Object.values(excludedByVariant).map(s => [...s]));

  // ⑥ 依賴重指：predecessor(raw序號) → 剝除指向被砍階段的前置(+warning) → translatePredToId 譯新id
  //   map 改「按案別」各 build 一張（variantKey→Map）：同源範本兩案 n 重複，全域單張 first-wins
  //   會讓另案前置全翻成主案 id（跨案污染）。翻譯時吃「該 task 自己 variant 的 map」（見 relinkPred）。
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

  // ⑧ 各案別順推排程（抽共用純函式 _reschedulePreview，applyTemplate 與 _s2SetDuration 共用）
  App._reschedulePreview(tasks, variants, warnings);

  return { project, variants, variantNameToId, depts, tasks, excludedNs, warnings };
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

App.buildProjectViewTabsHtml = function() {
  return `
    <div class="tabs">
      <button class="tab-btn ${this.projectView === 'dashboard' ? 'active' : ''}" onclick="App.switchProjectView('dashboard')">儀表板</button>
      <button class="tab-btn ${this.projectView === 'kanban' ? 'active' : ''}" onclick="App.switchProjectView('kanban')">看板</button>
      <button class="tab-btn ${this.projectView === 'gantt' ? 'active' : ''}" onclick="App.switchProjectView('gantt')">甘特圖</button>
      <button class="tab-btn ${this.projectView === 'month' ? 'active' : ''}" onclick="App.switchProjectView('month')">月曆</button>
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
            <button class="tb-action" data-edit onclick="App.openHoursTaskDialog()" style="margin-left:auto;">+ 新增小時 Task</button>
          </div>
          ${scheduleHtml}
          <div class="legend-row">
            <span class="legend-item"><span class="legend-sw" style="background:var(--sage-500)"></span>深度工作</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--amber)"></span>雜事零碎</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--navy)"></span>📅 會議</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--clay)"></span>🧹 打掃</span>
            <span class="legend-item"><span style="color:var(--terracotta);">⚠</span> 延遲</span>
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
  if (App._roGuard()) return;
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
  if (App._roGuard()) return;
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
  if (App._roGuard()) return;
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
  if (App._roGuard()) return;
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
          <button class="tb-action ink hdr-menu-toggle" data-edit-hide onclick="App.toggleExportMenu(event, '${proj.id}')">匯出 Excel ▾</button>
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

  return `<tr class="task-row ${t.status === 'done' ? 'done' : ''} ${cls || ''}" data-taskid="${t.id}" onclick="App.openTaskModal('${t.id}')">
    <td class="col-num"><span style="font-family:var(--mono); font-size:11px; color:var(--ink4);">${App._seqOf(t.id)}</span></td>
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
        <span class="task-deadline">${rangeText}</span>
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
  if (App._roGuard()) return;
  DATA.meetings = DATA.meetings.filter(m => m.id !== id);
  Storage.save();
  this.renderProject();
};

App.addManualMeeting = function() {
  if (App._roGuard()) return;
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
  if (App._roGuard()) return;
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

// 切換雙態：改 #tf-start-block 的 data-mode（CSS 據此顯示對應子區塊）；切到手動且空白時預填今天
App.setStartMode = function(m) {
  const block = document.getElementById('tf-start-block');
  if (!block) return;
  block.dataset.mode = m;
  if (m === 'manual') {
    const inp = document.getElementById('tf-start');
    if (inp) { if (!inp.value) inp.value = D.fmt(D.today(), 'iso'); inp.focus(); }
  }
};

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
  const block = document.getElementById('tf-start-block');
  const mode = (block && block.dataset.mode === 'manual') ? 'manual' : 'auto';
  const val = (document.getElementById('tf-start') || {}).value || '';
  return { startMode: mode, start: mode === 'manual' ? val : '' };
};

App.buildTaskFormHtml = function(task, mode, measure = 'duration') {
  const t = task || {};
  const v = (x) => (x == null ? '' : x);
  const startMode = (mode === 'new') ? 'auto' : App.startModeOf(t);   // 2-A：新任務一律 auto；編輯讀 startMode（含舊任務相容）
  const autoStartDisplay = (mode !== 'new' && t.scheduledStart && String(t.scheduledStart).trim()) ? D.fmt(t.scheduledStart, 'ymd') : '待排程引擎推算';
  return `
    <div class="task-form" data-measure="${measure}">
    ${mode === 'new' ? `
    <div class="form-field">
      <label>專案</label>
      <select id="tf-project"><option value="" ${!t.project ? 'selected' : ''}>— 請選擇 —</option>${DATA.projects.map(p => `<option value="${p.id}" ${t.project === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>
    </div>` : `
    <div class="form-field">
      <label>專案</label>
      <div class="task-proj-readonly">${U.esc((DATA.projects.find(p => p.id === t.project) || {}).name || '')}</div>
    </div>`}
    <div class="form-field">
      <label>任務名稱 *</label>
      <input type="text" id="tf-name" value="${U.esc(v(t.name))}" placeholder="例：完成 BOM 表 6 型壁掛機">
    </div>
    <div class="measure-toggle">
      <button type="button" class="measure-btn ${measure==='duration'?'active':''}" data-measure="duration" onclick="App.setMeasureMode('duration')">工期制（工作天）</button>
      <button type="button" class="measure-btn ${measure==='hours'?'active':''}" data-measure="hours" onclick="App.setMeasureMode('hours')">時段制（工時 h）</button>
    </div>
    <div class="form-row">
      <div class="form-field"><label>擔當</label><input type="text" id="tf-owner" value="${U.esc(v(t.owner) || (mode === 'new' ? (DATA.settings.userName || '') : ''))}"></div>
      <div class="form-field"><label>類型 <span data-tip="類型|任務=要排程的工作；里程碑=時間點標記（工期0）；群組=純分類母項，不排程" style="cursor:help;">?</span></label>
        <select id="tf-taskType">
          <option value="task" ${t.taskType === 'task' || !t.taskType ? 'selected' : ''}>📋 任務</option>
          <option value="milestone" ${t.taskType === 'milestone' ? 'selected' : ''}>◆ 里程碑</option>
          <option value="group" ${t.taskType === 'group' ? 'selected' : ''}>▦ 群組</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>階段</label>
        <input type="text" id="tf-stage" list="tf-stage-list" value="${U.esc(v(t.stage))}" placeholder="輸入或選擇階段" onchange="App.onTaskStageChange()">
        <datalist id="tf-stage-list">${this.stageDatalistOptions(t.project)}</datalist>
      </div>
      <div class="form-field dur-only"><label>子群組</label>
        <input type="text" id="tf-subgroup" list="tf-subgroup-list" value="${U.esc(v(t.subgroup))}" placeholder="輸入或選擇子群組">
        <datalist id="tf-subgroup-list">${this.subgroupDatalistOptions(t.project)}</datalist>
      </div>
    </div>
    <div class="form-field">
      <label>預計開始</label>
      <div id="tf-start-block" class="startmode" data-mode="${startMode}">
        <div class="startmode-auto">
          <div class="startmode-display"><span class="startmode-badge">自動</span><span class="startmode-value">${U.esc(autoStartDisplay)}</span></div>
          <button type="button" class="startmode-switch" onclick="App.setStartMode('manual')">改用手動指定日期</button>
          <div class="field-hint">由前置任務推算，會隨前置調整自動更新。</div>
        </div>
        <div class="startmode-manual">
          <div class="startmode-manual-line">
            <input type="date" id="tf-start" value="${v(t.start)}">
            <button type="button" class="startmode-switch" onclick="App.setStartMode('auto')">改回自動排</button>
          </div>
          <div class="field-hint">這天固定不動，不受前置推算影響。</div>
        </div>
      </div>
    </div>
    <div class="form-row dur-only">
      <div class="form-field"><label>預計完成 / Deadline</label><input type="date" id="tf-end" value="${v(t.end)}"></div>
    </div>
    <div class="form-row mg-duration">
      <div class="form-field"><label>工期（工作天）</label><input type="number" id="tf-duration" value="${v(t.durationDays) || 1}" min="1" step="1"></div>
    </div>
    <div class="form-row mg-hours">
      <div class="form-field"><label>預估工時 (h)</label><input type="number" id="tf-hours" value="${v(t.estHours) || 1}" min="0.5" step="0.5"></div>
    </div>
    <div class="form-field dur-only">
      <label>前置任務</label>
      ${App.buildPredListHtml(t)}
    </div>
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
        <input type="checkbox" id="tf-split" ${t.canSplit !== false ? 'checked' : ''} style="width:auto;">
        可切分（≥4h 任務拆成多天）
      </label>
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
  setTimeout(() => { const n = document.getElementById('tf-name'); if (n) n.focus(); }, 50);
};

App.saveNewTask = function(projId) {
  if (App._roGuard()) return;
  // M2 表單改造：必填檢查（專案/名稱/擔當/類型/階段/預計開始；house style：toast warning + return）
  if (!(document.getElementById('tf-project').value || '').trim()) { U.toast('⚠ 請選擇專案', 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }
  if (!document.getElementById('tf-owner').value.trim()) { U.toast('⚠ 請填擔當', 'warning'); return; }
  if (!document.getElementById('tf-taskType').value.trim()) { U.toast('⚠ 請選擇類型', 'warning'); return; }
  if (!document.getElementById('tf-stage').value.trim()) { U.toast('⚠ 請填階段', 'warning'); return; }

  const status = document.getElementById('tf-status').value;
  const startField = App.readStartField();   // 2-A：預計開始雙態 → {start, startMode}（與 saveTask 共用）
  // 日期合理性：預計完成不得早於預計開始（兩值都有才比，ISO 字串比＝日期序）
  const _pEnd = document.getElementById('tf-end').value;
  if (startField.start && _pEnd && _pEnd < startField.start) {
    U.toast('⚠ 預計完成日不能早於預計開始日', 'warning'); return;
  }
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
    start: startField.start,           // 2-A：手動態存值、自動態存 ''（共用 readStartField）
    startMode: startField.startMode,   // 2-A：純 UI 意圖記憶（auto/manual）
    end: document.getElementById('tf-end').value,
    estHours: parseFloat(document.getElementById('tf-hours').value) || 1,
    predecessor: App.serializePredecessors(),  // M2-§6.4：結構化列序列化回字串（取代 #tf-predecessor 自由文字；格式同 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: parseFloat(document.getElementById('tf-duration').value) || 1,  // M2-2：工期(工作天)，最小1（0工期語意由 taskType=milestone 表達）
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
    canSplit: document.getElementById('tf-split').checked,
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
  const _sch = applySchedule(DATA.tasks, 'full');
  const _blocked = _sch.skipped.filter(s => !String(s.reason || '').startsWith('anchor'));
  if (_blocked.length) { U.toast('⚠️' + _blocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
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
};

App.saveTask = function(id) {
  if (App._roGuard()) return;
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  // M2 表單改造：必填檢查（名稱/擔當/類型/階段/預計開始；編輯版專案是唯讀 div 無 tf-project，不檢查）
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }
  if (!document.getElementById('tf-owner').value.trim()) { U.toast('⚠ 請填擔當', 'warning'); return; }
  if (!document.getElementById('tf-taskType').value.trim()) { U.toast('⚠ 請選擇類型', 'warning'); return; }
  if (!document.getElementById('tf-stage').value.trim()) { U.toast('⚠ 請填階段', 'warning'); return; }

  // 日期合理性（先驗再 mutate；startField 此處尚未宣告，直接讀 readStartField）
  const _pStart = App.readStartField().start;
  const _pEnd = document.getElementById('tf-end').value;
  if (_pStart && _pEnd && _pEnd < _pStart) {
    U.toast('⚠ 預計完成日不能早於預計開始日', 'warning'); return;
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
  t.durationDays = parseFloat(document.getElementById('tf-duration').value) || 1;
  t.measureType = t.measureType || 'duration';  // 第27項：edit 鎖定計量制——保留既有值不從 form 覆寫；舊資料無此欄兜 duration
  t.urgency   = document.getElementById('tf-urgency').value;
  const startField = App.readStartField();   // 2-A：預計開始雙態（與 saveNewTask 共用同一取值邏輯）
  t.start     = startField.start;            // 手動態存值、自動態存 ''
  t.startMode = startField.startMode;
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
  if (_blocked.length) { U.toast('⚠️' + _blocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已儲存');
};

App.deleteTask = function(id) {
  if (App._roGuard()) return;
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
App._stagePickHtml = function(stages) {
  if (typeof PRODUCT_DEV_TEMPLATE === 'undefined') return '';
  const cn = {};
  (PRODUCT_DEV_TEMPLATE.stageDefaults || []).forEach(s => { cn[s.stage] = s.stageNameCN; });
  // 預設主案階段；另案卡餵 cases[1].stages（單一膠囊產生器，不複製兩份 HTML）
  const list = stages || (PRODUCT_DEV_TEMPLATE.cases[0] ? PRODUCT_DEV_TEMPLATE.cases[0].stages : []) || [];
  const pills = list.map(st =>
    `<button type="button" class="stage-pick on" data-stage="${st}" onclick="this.classList.toggle('on')">${cn[st] || st}</button>`
  ).join('');
  return `<div class="form-field"><label>選擇階段（不選=不建該階段）</label><div class="stage-pick-row">${pills}</div></div>`;
};

// 階段膠囊精確設定：依 selectedStages 把該卡所有 .stage-pick 設成 on/off（精確覆蓋，非 additive；_stagePickHtml 預設全 on）。
App._applyStagePicks = function(cardEl, selectedStages) {
  if (!cardEl) return;
  const want = new Set(selectedStages || []);
  cardEl.querySelectorAll('.stage-pick').forEach(b => {
    b.classList.toggle('on', want.has(b.dataset.stage));
  });
};

// 另案卡：動態 append 進 #pf-otherCases（可加 0~N 張）。膠囊餵另案範本階段 cases[1].stages。
App._tplAddOtherCase = function() {
  const box = document.getElementById('pf-otherCases');
  if (!box) return;
  const otherStages = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined' && PRODUCT_DEV_TEMPLATE.cases[1])
    ? PRODUCT_DEV_TEMPLATE.cases[1].stages : undefined;
  const card = document.createElement('div');
  card.className = 'case-card case-other';
  card.dataset.case = 'other';
  card.innerHTML =
      `<div class="case-card-head">`
    +   `<div class="form-field"><label>案別名稱</label><input type="text" class="case-variant-name" placeholder="案別名稱（例：2.2kW）"></div>`
    +   `<button type="button" class="tb-action ghost case-del" onclick="this.closest('.case-card').remove()">刪除</button>`
    + `</div>`
    + `<div class="form-row">`
    +   `<div class="form-field"><label>開始日</label><input type="date" class="case-start"></div>`
    +   `<div class="form-field"><label>結束日</label><input type="date" class="case-end"></div>`
    + `</div>`
    + `<div class="form-field"><label>排程方向</label>`
    +   `<select class="case-direction"><option value="forward">順推（從開始日）</option><option value="backward" disabled>逆推（從結束日，尚未開放）</option></select>`
    + `</div>`
    + App._stagePickHtml(otherStages);
  box.appendChild(card);
};

// 部門編輯區 HTML（範本表單與空白專案共用，避免重複）：讀 App._tplDepts、mode=tpl。
App._deptEditorHtml = function() {
  return `        <div class="form-field"><label>部門與負責人（可自由增減）</label>
          <div class="dept-editor-head"><span class="dept-head-name">部門名稱</span><span class="dept-head-members">擔當姓名</span></div>
          <div class="dept-edit-list" id="deptEditorList">${App.buildDeptRowsHtml(App._tplDepts, 'tpl', null)}</div>
          <button class="tb-action ghost dept-add-btn" onclick="App.deptUI.addDept('tpl', '')">＋ 新增部門</button>
        </div>`;
};

// 第一階段表單 HTML（pf-tplBox + pf-excelBox）：抽出供新增專案 modal 共用（路線B 打底；純搬移、零行為改變）。
App._stage1FormHtml = function() {
  return `      <div id="pf-tplBox">
        <div class="form-field">
          <label>選擇範本</label>
          <select id="pf-tpl"><option value="product-dev-v1">${typeof PRODUCT_DEV_TEMPLATE!=='undefined' ? PRODUCT_DEV_TEMPLATE.templateName : '產品開發範本'}</option></select>
        </div>
        <div class="case-card case-main" data-case="main">
          <div class="case-card-head">
            <div class="form-field">
              <label>案別名稱</label>
              <input type="text" class="case-variant-name" id="pf-mainName" placeholder="主案名稱（例：7.3kW）" value="" oninput="this.dataset.touched='1'">
              <div class="case-name-hint">已帶入專案名，可自行修改</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field"><label>主案開始日</label><input type="date" id="pf-start" class="case-start"></div>
            <div class="form-field"><label>主案結束日</label><input type="date" id="pf-end" class="case-end"></div>
          </div>
          <div class="form-field">
            <label>排程方向</label>
            <select id="pf-direction" class="case-direction">
              <option value="forward">順推（從開始日）</option>
              <option value="backward" disabled>逆推（從結束日，尚未開放）</option>
            </select>
          </div>
          ${App._stagePickHtml()}
        </div>
        <div id="pf-otherCases"></div>
        <button type="button" class="tb-action ghost" onclick="App._tplAddOtherCase()">＋ 新增另案</button>
${App._deptEditorHtml()}
      </div>`;
};

// ═══ 路線B 建立流程（UI 流程層，兩步 modal）：① 選建立方式卡 → ② 填表單。B-1a 純新增、不接 openProjectDialog ═══
// 第一步：選建立方式（範本→Excel→空白，預設範本 .on）。重置 _createFlow。
App._flowStep1 = function() {
  App._createFlow = { step: 1, mode: 'template', stage1Data: null };
  App.openModal({
    title: '新增專案',
    body: `<div class="form-field"><label>建立方式</label>
      <div class="create-mode-cards flow-cards">
        <div class="cm-card on" data-mode="template" onclick="App._flowPickMode('template')">
          <i class="ti ti-template cm-ico"></i>
          <div class="cm-text"><div class="cm-title">套用範本</div><div class="cm-desc">產品開發範本，含階段與部門</div></div>
          <i class="ti ti-circle-check cm-check"></i></div>
        <div class="cm-card" data-mode="excel" onclick="App._flowPickMode('excel')">
          <i class="ti ti-table-import cm-ico"></i>
          <div class="cm-text"><div class="cm-title">從 Excel 匯入</div><div class="cm-desc">上傳 WBS Excel 自動建立任務</div></div>
          <i class="ti ti-circle-check cm-check"></i></div>
        <div class="cm-card" data-mode="blank" onclick="App._flowPickMode('blank')">
          <i class="ti ti-file cm-ico"></i>
          <div class="cm-text"><div class="cm-title">空白專案</div><div class="cm-desc">從零開始，自行新增任務</div></div>
          <i class="ti ti-circle-check cm-check"></i></div>
      </div></div>`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>`,
  });
};

// 點卡：記 mode、清 stage1Data，進第二步。
App._flowPickMode = function(mode) {
  if (App._createFlow) { App._createFlow.mode = mode; App._createFlow.stage1Data = null; }
  App._flowStep2();
};

// 第二步（B-1a 最小佔位版）：依 mode 顯表單；顏色/備註/部門回填、_flowStage2Next 後面段接。
App._flowStep2 = function() {
  if (App._createFlow) App._createFlow.step = 2;
  const mode = App._createFlow ? App._createFlow.mode : 'template';
  // 全新進入②（非從③上一步退回）才預載標準部門 roles；stage1Data 有值=回填情境，不碰 _tplDepts（保留使用者編輯）。
  if (!App._createFlow || !App._createFlow.stage1Data) {
    if (mode === 'blank') {
      App._tplDepts = [{ id: U.id(), name: '', members: [{ id: U.id(), name: '' }] }];   // 空白專案：預載一列空部門待填
    } else {
      const _roles = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined' && PRODUCT_DEV_TEMPLATE.roles && PRODUCT_DEV_TEMPLATE.roles.length) ? PRODUCT_DEV_TEMPLATE.roles : [''];
      App._tplDepts = _roles.map(r => ({ id: U.id(), name: r, members: [{ id: U.id(), name: '' }] }));
    }
  }
  App.openModal({
    title: mode === 'blank' ? '新增空白專案' : '填寫專案資料',
    body: `<div class="form-field"><label>專案名稱 *</label><input type="text" id="pf-name" placeholder="e.g. ${CFG('PROJECT_INPUT_EXAMPLE','範例品項')}" oninput="App._syncMainName()"></div>
      <div class="form-field"><label>顏色</label>
        <div class="color-picker" id="cpColors">
          ${PROJ_COLORS.map((c, i) => `<div class="cp-swatch ${i === 0 ? 'on' : ''}" style="background:${c}" onclick="App.pickColor('${c}', this)" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-field"><label>備註</label><input type="text" id="pf-note" placeholder="簡短描述"></div>
      ${mode === 'template' ? App._stage1FormHtml() : ''}
      ${mode === 'blank' ? App._deptEditorHtml() : ''}
      <div class="form-field excel-upload" style="${mode==='excel'?'':'display:none'}">
        <label>WBS Excel 檔</label>
        <label class="eu-filebtn"><i class="ti ti-table-import"></i> 選擇檔案<span id="pf-excelName" class="eu-filename">尚未選擇</span><input type="file" id="pf-excelFile" accept=".xlsx,.xls" onchange="App._flowExcelPick(event)"></label>
        <div id="pf-excelStatus" class="excel-status"></div>
      </div>`,
    footer: `<button class="tb-action ghost" onclick="App._flowStep1()">上一步</button>
      <button class="tb-action" onclick="App._flowStage2Next()">${mode==='blank'?'建立':'下一步：檢視任務'}</button>`,
  });
};

// viewonly 捷徑：唯讀直接開第②段範本表單全 disabled（不走三段、不用三卡）。搬原 viewonly 假資料+disabled 邏輯，body 自己開。
App._flowViewonlyPreview = function() {
  App._createFlow = { step: 2, mode: 'template', stage1Data: null };
  // 唯讀預覽每次全新：無條件預載標準部門 roles
  const _roles = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined' && PRODUCT_DEV_TEMPLATE.roles && PRODUCT_DEV_TEMPLATE.roles.length) ? PRODUCT_DEV_TEMPLATE.roles : [''];
  App._tplDepts = _roles.map(r => ({ id: U.id(), name: r, members: [{ id: U.id(), name: '' }] }));
  App.openModal({
    title: '範本預覽（唯讀）',
    body: `<div class="form-field"><label>專案名稱 *</label><input type="text" id="pf-name"></div>${App._stage1FormHtml()}`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>`,
  });
  const nameEl = document.getElementById('pf-name'); if (nameEl) nameEl.value = CFG('PROJECT_INPUT_EXAMPLE','範例品項');
  const mainNameEl = document.getElementById('pf-mainName'); if (mainNameEl) mainNameEl.value = CFG('PROJECT_INPUT_EXAMPLE','範例品項');
  const startEl = document.getElementById('pf-start'); if (startEl) startEl.value = D.fmt(new Date(),'iso');
  ['pf-name','pf-note','pf-mainName','pf-start','pf-end','pf-direction','pf-tpl'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  document.querySelectorAll('#pf-tplBox .stage-pick, #pf-tplBox #deptEditorList input, #pf-tplBox #deptEditorList button, #pf-tplBox .dept-add-btn').forEach(el => el.disabled = true);
  const addCaseBtn = document.querySelector('#pf-tplBox button[onclick*="_tplAddOtherCase"]'); if (addCaseBtn) addCaseBtn.style.display = 'none';
};

// 第②段「下一步/建立」handler：依 _createFlow.mode 分流。空白→落地（_flowBlankCommit，動作D）；Excel→佔位；範本→掃表單成 cases、存 stage1Data、算 preview 進第③段。
// Excel 上傳狀態三態（wait/ok/err）統一設定：className 重置 + textContent，避免前態 class 殘留。
App._setExcelStatus = function(text, kind) {
  const st = document.getElementById('pf-excelStatus');
  if (st) { st.className = 'excel-status ' + (kind || ''); st.textContent = text; }
};

// Excel ②選檔：async 解析→存 _createFlow.excelParsed→顯示狀態（下一步讀它進第三段）。
App._flowExcelPick = async function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  App._setExcelStatus('解析中…', 'wait');
  try {
    const parsed = await parseWbsExcel(file);
    if (!parsed || !parsed.ok) {
      if (App._createFlow) App._createFlow.excelParsed = null;
      App._setExcelStatus('⚠ 解析失敗：' + ((parsed && parsed.errors && parsed.errors[0]) || '檔案格式不符'), 'err');
      return;
    }
    if (App._createFlow) App._createFlow.excelParsed = parsed;
    App._setExcelStatus('✓ 已讀取「' + (parsed.projectName || '未命名') + '」共 ' + parsed.rows.length + ' 筆任務，按下一步檢視', 'ok');
    const nameSpan = document.getElementById('pf-excelName'); if (nameSpan && file) nameSpan.textContent = file.name;
    const nameEl = document.getElementById('pf-name');
    if (nameEl && !nameEl.value.trim() && parsed.projectName) nameEl.value = parsed.projectName;
  } catch (err) {
    if (App._createFlow) App._createFlow.excelParsed = null;
    App._setExcelStatus('⚠ 解析錯誤：' + (err.message || err), 'err');
  }
};

App._flowStage2Next = function() {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const colorEl = document.querySelector('.cp-swatch.on');
  const color = colorEl ? colorEl.dataset.color : PROJ_COLORS[0];
  const note = document.getElementById('pf-note').value.trim();
  const mode = App._createFlow ? App._createFlow.mode : 'template';

  if (mode === 'blank') { return App._flowBlankCommit(name, color, note); }   // 空白落地，動作D 定義；先呼叫，D 做完才不炸
  if (mode === 'excel') {
    const parsed = App._createFlow ? App._createFlow.excelParsed : null;
    if (!parsed || !parsed.ok) { U.toast('⚠ 請先選擇 Excel 檔', 'warning'); return; }
    this._tplPreview = buildWbsPreview(parsed);
    this._tplPreview.project.name = name;
    this.closeModal();
    this._renderStage2();
    return;
  }

  // 範本：掃表單成 cases（搬自 saveProject 範本分支，唯一真實來源）
  const tpl = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined') ? PRODUCT_DEV_TEMPLATE : null;
  if (!tpl) { U.toast('⚠ 找不到範本', 'warning'); return; }
  const cards = document.querySelectorAll('#pf-tplBox .case-card');
  const cases = [];
  for (const card of cards) {
    const isMain = card.dataset.case === 'main';
    const vnEl = card.querySelector('.case-variant-name');
    const variantName = vnEl ? vnEl.value.trim() : '';
    if (!variantName) { U.toast(isMain ? '⚠️請填主案的案別名稱' : '⚠️請填另案的案別名稱', 'warning'); return; }
    const startEl = card.querySelector('.case-start');
    const startDate = startEl ? startEl.value : '';
    if (isMain && !startDate) { U.toast('⚠ 套用範本請填主案開始日', 'warning'); return; }
    const stages = [...card.querySelectorAll('.stage-pick.on')].map(b => b.dataset.stage);
    if (!stages.length) { U.toast('⚠️請為「' + variantName + '」至少選一個階段', 'warning'); return; }
    cases.push({
      variantName,
      templateVariant: isMain ? '主案' : '另案',
      startDate,
      endDate: (card.querySelector('.case-end') || {}).value || '',
      direction: (card.querySelector('.case-direction') || {}).value || 'forward',
      selectedStages: stages,
    });
  }
  // 存 stage1Data（供③上一步回填）
  App._createFlow.stage1Data = {
    name, color, note, mode: 'template',
    cases: JSON.parse(JSON.stringify(cases)),
    depts: JSON.parse(JSON.stringify(App._tplDepts || [])),
  };
  // 算 preview 不落地，進第③段
  const userInput = { projectName: name, color, note, cases, depts: App._tplDepts || [] };
  this._tplPreview = App.applyTemplate(tpl, userInput);
  this.closeModal();
  this._renderStage2();
};

// 空白專案落地：name/color/note 由 _flowStage2Next 傳入（已驗 name 非空），複用 saveProject 空白分支邏輯，不重掃 DOM。
App._flowBlankCommit = function(name, color, note) {
  if (App._roGuard()) return;
  const np = { id: U.id(), name, color, note, depts: JSON.parse(JSON.stringify(App._tplDepts || [])), synced: false, createdAt: new Date().toISOString() };
  // §15 同名告警 + 並存（三模式齊全，鏡像 _stage2Commit）：blank 無 importedAt（不假造匯入日；段4 sidebar 用 importedAt||createdAt fallback）
  const dup = DATA.projects.filter(p => p.name === name);
  if (dup.length && !confirm('已有 ' + dup.length + ' 個同名專案「' + name + '」。\n\n確定 = 建立新版本（兩者並存，可在側邊欄辨識版號）\n取消 = 返回修改')) return;
  np.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
  ensurePdcaData(np);
  DATA.projects.push(np);
  this.currentProjectId = np.id;
  Storage.save();
  App._createFlow = null;   // 流程結束，清狀態
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 專案已建立');
  this.showPage('project', null);
};

App.openProjectDialog = function(projId) {
  const editing = projId ? this.getProj(projId) : null;
  const isEdit = !!editing;
  // 路線B：新增專案走兩步 modal 流程（viewonly 走唯讀捷徑、一般走 _flowStep1）；isEdit 維持現有編輯 modal。
  if (!isEdit && document.body.classList.contains('viewonly')) return App._flowViewonlyPreview();
  if (!isEdit) return App._flowStep1();

  this.openModal({
    title: isEdit ? '編輯專案' : '新增專案',
    body: `
      <div class="form-field">
        <label>專案名稱 *</label>
        <input type="text" id="pf-name" value="${editing ? U.esc(editing.name) : ''}" placeholder="e.g. ${CFG('PROJECT_INPUT_EXAMPLE', '範例品項')}" oninput="App._syncMainName()">
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
          <div class="dept-editor-head"><span class="dept-head-name">部門名稱</span><span class="dept-head-members">擔當姓名</span></div>
          <div class="dept-edit-list" id="deptEditorList">${App.buildDeptRowsHtml(editing.depts || [], 'edit', projId)}</div>
          <button class="tb-action ghost dept-add-btn" onclick="App.deptUI.addDept('edit', '${projId}')">＋ 新增部門</button>
        </div>
        ` : ''}
    `,
    footer: `
      ${isEdit ? `<button class="tb-action danger" data-edit-hide onclick="App.deleteProject('${projId}')" style="margin-right:auto;">刪除專案</button>` : ''}
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action pf-btn-create" id="pf-submitBtn" data-edit-hide onclick="App.saveProject('${projId || ''}')">${isEdit ? '儲存' : '建立'}</button>
    `,
  });
};

App.editProject = function(id) { this.openProjectDialog(id); };

App.pickColor = function(color, el) {
  document.querySelectorAll('.cp-swatch').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
};

// 主案名鏡像專案名：未被手動編輯（無 dataset.touched）時跟著專案名走；編輯模式無 #pf-mainName → 早返。
App._syncMainName = function() {
  const proj = document.getElementById('pf-name');
  const main = document.getElementById('pf-mainName');
  if (!proj || !main) return;
  if (!main.dataset.touched) main.value = proj.value;
};

// 套範本提醒清單：把 applyTemplate 回傳的 warnings 字串陣列列在 #content 頂部常駐 banner
// （不進 page-project，避開 renderProject 整段重繪洗掉）。空陣列不 render。
App._showTplWarnings = function(warnings) {
  if (!warnings || !warnings.length) return;
  const old = document.getElementById('tpl-warn-banner');
  if (old) old.remove();                               // 已存在先移除避免堆疊
  const banner = document.createElement('div');
  banner.id = 'tpl-warn-banner';
  banner.className = 'tpl-warn-banner';
  banner.innerHTML =
    '<div class="tpl-warn-head">' +
      '<span>套用範本提醒（' + warnings.length + ' 項）</span>' +
      '<button class="tb-action ghost" onclick="document.getElementById(\'tpl-warn-banner\').remove()">✕</button>' +
    '</div>' +
    '<ul class="tpl-warn-list">' +
      warnings.map(w => '<li>' + U.esc(w) + '</li>').join('') +
    '</ul>';
  const content = document.getElementById('content');
  content.insertBefore(banner, content.firstChild);    // 塞 #content 最頂端、不進 page-project
};

App.saveProject = function(id) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const colorEl = document.querySelector('.cp-swatch.on');
  const color = colorEl ? colorEl.dataset.color : PROJ_COLORS[0];
  const note = document.getElementById('pf-note').value.trim();

  if (id) {
    if (App._roGuard()) return;
    const p = this.getProj(id);
    if (p) { p.name = name; p.color = color; p.note = note; }
  } else {
    const mode = document.getElementById('pf-mode') ? document.getElementById('pf-mode').value : 'blank';
    if (mode === 'template') {
      const tpl = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined') ? PRODUCT_DEV_TEMPLATE : null;
      if (!tpl) { U.toast('⚠ 找不到範本', 'warning'); return; }
      // 統一 per-card 掃法：主案卡 + 0~N 另案卡各組一個 case entry（只讀自己卡內欄位，不跨卡）。
      // variantName=顯示名(分 id)、templateVariant=範本來源 key(引擎反查)——兩欄分開，餵錯多案會撞回一起。
      // cards 順序＝DOM 序：主案卡在 #pf-otherCases 之前 → cases[0] 恆主案。
      const cards = document.querySelectorAll('#pf-tplBox .case-card');
      const cases = [];
      for (const card of cards) {
        const isMain = card.dataset.case === 'main';
        const nameEl = card.querySelector('.case-variant-name');
        const variantName = nameEl ? nameEl.value.trim() : '';   // 純讀欄位，無兜底
        if (!variantName) { U.toast(isMain ? '⚠️請填主案的案別名稱' : '⚠️請填另案的案別名稱', 'warning'); return; }   // 統一：任一卡名稱空就擋
        const startEl = card.querySelector('.case-start');
        const startDate = startEl ? startEl.value : '';
        if (isMain && !startDate) { U.toast('⚠ 套用範本請填主案開始日', 'warning'); return; }   // 保留既有：主案開始日必填
        const stages = [...card.querySelectorAll('.stage-pick.on')].map(b => b.dataset.stage);
        if (!stages.length) { U.toast('⚠️請為「' + variantName + '」至少選一個階段', 'warning'); return; }   // 每案 min-1 階段
        cases.push({
          variantName,
          templateVariant: isMain ? '主案' : '另案',
          startDate,
          endDate: (card.querySelector('.case-end') || {}).value || '',
          direction: (card.querySelector('.case-direction') || {}).value || 'forward',
          selectedStages: stages,
        });
      }
      // 部門/擔當：直接用 App._tplDepts（共用部門編輯元件即時維護的暫存）；空部門/無成員由引擎 ③ 跳過。
      const userInput = { projectName: name, color, note, cases, depts: App._tplDepts || [] };
      // B 步驟1：preview-then-commit（§8d.15 N.1）——算出 res 不落地，整包存 _tplPreview，
      // 關第一階段 modal、開第二階段頁；depts/variants 掛回 + push/save 留到「建立專案」鈕。
      this._tplPreview = App.applyTemplate(tpl, userInput);
      this.closeModal();
      this._renderStage2();
      return;
    }
    if (mode === 'excel') { U.toast('⚠ Excel 匯入下一批實作', 'warning'); return; }
    if (App._roGuard()) return;
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

// ─── 範本第二階段：編輯任務骨架頁（§8d.15）。B 步驟2：頁殼+標頭+案別區塊；Gantt軸/任務清單留步驟3/4。───
// 吃 this._tplPreview（applyTemplate 回傳的 res，未落地）；render 進 #page-stage2，仿 showPage 切 .active。
App._renderStage2 = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('\u26a0 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const tasks = res.tasks || [];
  // 預設每案選中第一個階段（既有有效選擇保留；新 preview/失效選擇 → 回第一階段）
  if (!this._s2Stage) this._s2Stage = {};
  variants.forEach(v => {
    const g = this._s2GroupByStage(v.id);
    if (g.order.length && g.order.indexOf(this._s2Stage[v.id]) < 0) this._s2Stage[v.id] = g.order[0];
  });
  const fmtD = (s) => s ? String(s).replace(/-/g, '/') : '';
  // 案別總區間：純讀該案 preview tasks 的 min plannedStart \u2192 max plannedEnd（引擎\u2467已順推寫入，不落地）。
  const caseRange = (vid) => {
    const ts = tasks.filter(t => t.variant === vid);
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    const a = starts[0], b = ends[ends.length - 1];
    return (a || b) ? (fmtD(a) + ' \u2192 ' + fmtD(b)) : '（待排程）';
  };
  const help =
    '<div class="stage2-help">' +
      '<div class="stage2-help-head">\u2753 填寫說明</div>' +
      '<div class="stage2-help-block"><b>日期（起訖）</b>：系統自動計算，不直接填；請以「前置任務 \uff0b 工期」調整。</div>' +
      '<div class="stage2-help-block"><b>需交付</b>：此任務是否須繳交付件（如報告、樣品）。可逐筆勾或整階段全選。</div>' +
      '<div class="stage2-help-block"><b>前置任務</b>三種設定：' +
        '<br>\u30fb接在《A》後 \u2014 等 A 做完，隔天才開始。例：樣機組裝 接在《零件到料》後' +
        '<br>\u30fb接在《A》後 \uff0b2天 \u2014 等 A 做完，再多等 2 天才開始。例：塗裝 接在《組裝》後 \uff0b2天（等乾）' +
        '<br>\u30fb無前置 \u2014 不用等其他項目，從專案開始日就排入。例：規格訂定' +
      '</div>' +
    '</div>';
  const blocks = variants.map((v, i) => {
    const isMain = i === 0;
    return '' +
      '<div class="s2-case ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-variant="' + v.id + '">' +
        '<div class="s2-case-head">' +
          '<span class="stage-cap-pill cap-' + (i % 3) + '">' + (isMain ? '主案' : '另案') + '</span>' +
          '<span class="s2-case-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s2-case-range">' + caseRange(v.id) + '</span>' +
        '</div>' +
        '<div class="s2-gantt" data-variant="' + v.id + '">' + this._s2GanttHtml(v.id) + '</div>' +
        '<div class="s2-list" data-variant="' + v.id + '">' + this._s2ListHtml(v.id) + '</div>' +
      '</div>';
  }).join('');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage2');
  page.classList.add('active');
  page.innerHTML =
    '<div class="stage2-wrap">' +
      '<div class="stage2-head"><span class="s2-num">2</span>編輯任務骨架</div>' +
      help +
      blocks +
      (n => n > 0 ? '<div class="s2-unassigned-bar">⚠ 還有 ' + n + ' 個任務未指派負責人</div>' : '')((res.tasks || []).filter(t => !t.owner).length) +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._flowStage3Back()">上一步</button>' +
        '<button class="tb-action" data-edit-hide onclick="App._stage2Commit()">建立專案</button>' +
      '</div>' +
    '</div>';
  // §8f.9 viewonly 第二階段：所有可編輯控制項 disabled（純展示，不可改）；建立鈕已 data-edit-hide + _roGuard 雙防
  if (document.body.classList.contains('viewonly')) {
    document.querySelectorAll('#page-stage2 input, #page-stage2 select, #page-stage2 .s2-del, #page-stage2 .dt-insert-btn').forEach(el => { el.disabled = true; });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 第③段上一步（路線B）：退回第②段並用 _createFlow.stage1Data 回填（部門先還原；_flowStep2 因 stage1Data 有值不重設 _tplDepts）。
App._flowStage3Back = function() {
  if (App._createFlow && App._createFlow.mode === 'excel') {
    this.showPage('dashboard');
    App._flowStep2();
    const parsed = App._createFlow.excelParsed;
    const st = document.getElementById('pf-excelStatus');
    if (st && parsed && parsed.ok) {
      st.textContent = '✓ 已讀取「' + (parsed.projectName || '未命名') + '」共 ' + parsed.rows.length + ' 筆任務，按下一步檢視';
    }
    return;
  }
  const snap = App._createFlow ? App._createFlow.stage1Data : null;
  // 先把第③段 page 切掉、回到 dashboard（與舊退場一致），再開②
  this.showPage('dashboard');
  if (!snap) { return App._flowStep1(); }   // 無快照（異常），退回①重來
  // 部門先還原（_flowStep2 因 stage1Data 有值不會預載，需手動還原）
  App._tplDepts = JSON.parse(JSON.stringify(snap.depts || []));
  // 開第②段（_flowStep2 讀 _createFlow.mode/stage1Data；stage1Data 有值故不重設 _tplDepts）
  App._flowStep2();
  // openModal 同步，DOM 就緒，開始回填
  const nameEl = document.getElementById('pf-name'); if (nameEl) nameEl.value = snap.name || '';
  const noteEl = document.getElementById('pf-note'); if (noteEl) noteEl.value = snap.note || '';
  if (snap.color) {
    document.querySelectorAll('#cpColors .cp-swatch').forEach(s => s.classList.toggle('on', s.dataset.color === snap.color));
  }
  const cs = snap.cases || [];
  // 主案卡（cases[0]）
  const mainCard = document.querySelector('#pf-tplBox .case-card.case-main');
  if (cs[0] && mainCard) {
    const m = cs[0];
    const mn = document.getElementById('pf-mainName'); if (mn) { mn.value = m.variantName || ''; mn.dataset.touched = '1'; }
    const ms = document.getElementById('pf-start'); if (ms) ms.value = m.startDate || '';
    const me = document.getElementById('pf-end'); if (me) me.value = m.endDate || '';
    const md = document.getElementById('pf-direction'); if (md) md.value = m.direction || 'forward';
    App._applyStagePicks(mainCard, m.selectedStages);
  }
  // 另案卡（cases[1..N]）：逐張生成 + 回填
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    App._tplAddOtherCase();
    const cards = document.querySelectorAll('#pf-otherCases .case-card.case-other');
    const card = cards[cards.length - 1];
    if (!card) continue;
    const vn = card.querySelector('.case-variant-name'); if (vn) vn.value = c.variantName || '';
    const st = card.querySelector('.case-start'); if (st) st.value = c.startDate || '';
    const en = card.querySelector('.case-end'); if (en) en.value = c.endDate || '';
    const dr = card.querySelector('.case-direction'); if (dr) dr.value = c.direction || 'forward';
    App._applyStagePicks(card, c.selectedStages);
  }
};

// 建立專案：步驟5 落地，吃 _tplPreview push/save（depts/variants 掛回 res.project + DATA push + Storage.save + 清 preview 防重複建）。
App._stage2Commit = function() {
  if (App._roGuard()) return;
  const res = this._tplPreview;
  if (!res) { U.toast('\u26a0 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const unassigned = res.tasks.filter(t => !t.owner).length;
  if (unassigned > 0 && !confirm('還有 ' + unassigned + ' 個任務未指派負責人，確定建立？')) return;
  // 掛回 project（同 performWbsImport），否則 task 的 dept/variant id 解析不到（步驟1 從 saveProject 挪來此落地步）
  res.project.depts = res.depts;
  res.project.variants = res.variants;
  // §15 同名告警 + 並存：偵測同名 → confirm 建新版本；version/importedAt 巢狀欄位自動持久化（§15.5）
  const dup = DATA.projects.filter(p => p.name === res.project.name);
  if (dup.length && !confirm('已有 ' + dup.length + ' 個同名專案「' + res.project.name + '」。\n\n確定 = 建立新版本（兩者並存，可在側邊欄辨識版號）\n取消 = 返回修改')) return;
  res.project.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
  res.project.importedAt = D.fmt(new Date(), 'iso');
  DATA.projects.push(res.project);
  res.tasks.forEach(t => DATA.tasks.push(t));
  this.currentProjectId = res.project.id;
  Storage.save();
  this._tplPreview = null;               // 清 preview，防重複建
  App._createFlow = null;   // 範本流程落地完成，清狀態（對齊 _flowBlankCommit）
  this.refreshAll();
  if (res.warnings.length) {
    console.warn('套範本提醒:', res.warnings);
    this._showTplWarnings(res.warnings);
    U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆（' + res.warnings.length + ' 項提醒見上方）', 'warning');
  } else {
    U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆任務', 'success');
  }
  this.showPage('project', null);
};

// ─── 範本第二階段 步驟4：任務清單可編輯（負責人下拉＋需交付勾選，不碰工期/不重算）───
// 全部讀寫 this._tplPreview（preview 未落地，建立時才 push）；負責人/需交付不影響日期，故只寫值不重算。
App._s2GroupByStage = function(variantId) {
  const res = this._tplPreview;
  const order = [], byStage = {};
  ((res && res.tasks) || []).filter(t => t.variant === variantId).forEach(t => {
    const st = t.stage || '（未分階段）';
    if (!byStage[st]) { byStage[st] = []; order.push(st); }
    byStage[st].push(t);
  });
  return { order, byStage };
};
// 負責人下拉：該任務所屬部門(task.dept)的人排最前(本部門・)，其餘在後；首列未指派。只選不可手打(select)。
App._s2OwnerOptions = function(t) {
  const res = this._tplPreview; if (!res) return '';
  const depts = res.depts || [];
  const cur = t.owner || '';
  const ownDeptId = t.dept || '';
  let html = '<option value=""' + (cur === '' ? ' selected' : '') + '>未指派</option>';
  const ordered = depts.slice().sort((a, b) => (a.id === ownDeptId ? -1 : (b.id === ownDeptId ? 1 : 0)));
  ordered.forEach(d => {
    const members = d.members || [];
    if (!members.length) return;
    html += '<optgroup label="' + U.esc((d.id === ownDeptId ? '本部門・' : '') + d.name) + '">';
    members.forEach(m => {
      html += '<option value="' + U.esc(m.name) + '"' + (m.name === cur ? ' selected' : '') + '>' + U.esc(m.name) + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
};
// 前置 hover 高亮：滑入前置欄 → 依 data-preds（render 時 baked 的前置 id 清單）反色高亮被指向的列；滑出清除。純 UI。
App._s2PredHlOn = function(td) {
  (td.dataset.preds || '').split(',').filter(Boolean).forEach(id => {
    const r = document.querySelector('[data-taskid="' + id + '"]');
    if (r) r.classList.add('s2-pred-hl');
  });
};
App._s2PredHlOff = function() {
  document.querySelectorAll('.s2-pred-hl').forEach(e => e.classList.remove('s2-pred-hl'));
};

// 前置白話：無→「無」/單→「接在《X》後」(id 反查 name)/多→「接在 N 項後」。predecessor 為 id#關係 格式(取 # 前 id)。
App._s2PredText = function(t) {
  const res = this._tplPreview; if (!res) return '無';
  const parts = String(t.predecessor || '').split(/[,，;；]/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return '無';
  if (parts.length === 1) {
    const pid = parts[0].split('#')[0];
    const dep = (res.tasks || []).find(x => x.id === pid);
    return dep ? ('接在《' + dep.name + '》後') : '接在 1 項後';
  }
  return '接在 ' + parts.length + ' 項後';
};
// 前置候選下拉：同案別、序之前（flat 跨階段序）的任務 → <option>（含「無」＋目前選中）。
App._s2PredOptions = function(t, variantId) {
  const g = this._s2GroupByStage(variantId);
  const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
  const idx = flat.findIndex(x => x.id === t.id);
  const cur = String(t.predecessor || '').split('#')[0];
  let html = '<option value=""' + (cur ? '' : ' selected') + '>無</option>';
  for (let i = 0; i < idx; i++) {
    const x = flat[i];
    html += '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + U.esc((i + 1) + '·' + x.name) + '</option>';
  }
  return html;
};
// 寫回 preview：前置（單選 FS，存 id#FS）→ 重排所有案。predId 空＝清前置。多前置任務走唯讀、不進此函式。
App._s2SetPred = function(taskId, predId) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(t => t.id === taskId); if (!t) return;
  t.predecessor = predId ? (predId + '#FS') : '';
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 任務清單表（單一案別）：按 stage 正常序分組，每組標題列含「全選需交付」；每列 序/任務名+子群組/負責人下拉/前置白話/工期(唯讀)/日期(唯讀)/需交付勾。
App._s2ListHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const g = this._s2GroupByStage(variantId);
  if (!g.order.length) return '<div class="s2-ph">此案別無任務</div>';
  const sel = (this._s2Stage && this._s2Stage[variantId]) || g.order[0];
  const selIdx = g.order.indexOf(sel);
  const group = g.byStage[sel] || [];
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  // 序＝案內跨階段累計（前面各階段任務數加總），切階段不重編號
  let seqBase = 0;
  for (let i = 0; i < selIdx; i++) seqBase += (g.byStage[g.order[i]] || []).length;
  const allDeliver = group.length > 0 && group.every(t => t.mustDeliver);
  let rows =
    '<tr class="s2-stage-row">' +
      '<td colspan="6">' + U.esc(sel) + '</td>' +
      '<td class="col-mid s2-deliver"><label class="s2-all"><input type="checkbox"' + (allDeliver ? ' checked' : '') +
        ' onchange="App._s2DeliverAll(\'' + variantId + '\', ' + selIdx + ', this.checked)"> 全選</label></td>' +
      '<td class="col-action"></td>' +
    '</tr>';
  group.forEach((t, gi) => {
    const seq = seqBase + gi + 1;
    rows +=
      '<tr data-taskid="' + t.id + '">' +
        '<td class="col-num">' + seq + '</td>' +
        '<td class="col-flex" title="' + U.esc(t.name) + '"><input class="s2-name-inp" value="' + U.esc(t.name) + '" onchange="App._s2SetName(\'' + t.id + '\', this.value)"></td>' +
        '<td class="col-mid"><select class="s2-owner-sel' + (t.owner ? '' : ' s2-owner-unassigned') + '" onchange="App._s2SetOwner(\'' + t.id + '\', this.value)">' + this._s2OwnerOptions(t) + '</select></td>' +
        '<td class="col-mid s2-pred" data-preds="' + String(t.predecessor || '').split(/[,，;；]/).map(x => x.split('#')[0].trim()).filter(Boolean).join(',') + '" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()">' + (String(t.predecessor || '').split(/[,，;；]/).filter(Boolean).length >= 2 ? U.esc(this._s2PredText(t)) : '<select class="s2-pred-sel" onchange="App._s2SetPred(\'' + t.id + '\', this.value)">' + this._s2PredOptions(t, variantId) + '</select>') + '</td>' +
        '<td class="col-mid s2-dur"><input class="s2-dur-inp" type="number" min="0" value="' + (t.durationDays != null ? t.durationDays : '') + '" onchange="App._s2SetDuration(\'' + t.id + '\', this.value)"></td>' +
        '<td class="col-mid s2-date">' + (t.plannedStart ? (fmtD(t.plannedStart) + ' → ' + fmtD(t.plannedEnd)) : '（待排）') + '</td>' +
        '<td class="col-mid s2-deliver"><input type="checkbox"' + (t.mustDeliver ? ' checked' : '') + ' onchange="App._s2SetDeliver(\'' + t.id + '\', this.checked)"></td>' +
        '<td class="col-action s2-del-cell"><button class="s2-del" title="刪除此列" onclick="App._s2DelRow(\'' + t.id + '\')">✕</button></td>' +
      '</tr>' +
      '<tr class="dt-insert-row"><td colspan="8" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="App._s2InsertRow(\'' + t.id + '\', \'' + variantId + '\')">＋</button></div></td></tr>';
  });
  return '<table class="data-table s2-tbl"><thead><tr>' +
    '<th class="col-num">序</th><th class="col-flex">任務名</th><th class="col-mid">負責人</th><th class="col-mid">前置</th><th class="col-mid">工期</th><th class="col-mid">日期（起訖）</th><th class="col-mid">需交付</th><th class="col-action"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
};
// 寫回 preview：工期 → 重排所有案別（呼叫共用 _reschedulePreview 重算 plannedStart/End）。
// parseInt 防呆（負值/NaN→0）；warnings 此處丟棄（preview 不顯示，建立時 applyTemplate 會重算收集）。
App._s2SetDuration = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(t => t.id === taskId); if (!t) return;
  t.durationDays = Math.max(0, parseInt(value) || 0);
  App._reschedulePreview(res.tasks, res.variants, []);
  // 重繪所有案別（前置鏈跨案/跨階段連動，不能只重繪單一案）
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};

// 寫回 preview（不落地、不重算）：負責人
App._s2SetOwner = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (t) t.owner = value;
};
// 寫回 preview：任務名（只改顯示名）→ 從 task 反查 variant 重繪該案，讓前置白話即時同步。
// ⚠ 只動 t.name，不碰 t.predecessor / t.id / t.wbs(n)——前置鏈靠 id 串，改名只改顯示。
App._s2SetName = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  t.name = value;
  this._s2RefreshCase(t.variant);
};
// 刪除該列（preview 陣列 filter）→ 重繪該案。懸空前置不清，建立時 relinkPred 收尾。
// ⚠ 先取 variant 再 filter（filter 後找不到該筆拿不到 variant）。
App._s2DelRow = function(taskId) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  const variantId = t.variant;
  res.tasks = res.tasks.filter(x => x.id !== taskId);
  this._s2RefreshCase(variantId);
};
// 列間插入：在指定列之後 splice 新任務（全 schema，照 applyTemplate 欄位）→ 重排 → 重繪所有案。
// 前置留空＝落待排（§8d.15 N.6）；owner 空＝吃未指派橘標。
App._s2InsertRow = function(taskId, variantId) {
  const res = this._tplPreview; if (!res) return;
  const idx = res.tasks.findIndex(x => x.id === taskId);
  if (idx < 0) return;
  const ref = res.tasks[idx];
  const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
  const newTask = {
    id: U.id(), project: res.project.id, wbs: '', parentWbsId: '',
    name: '新任務', desc: ref.stage || '', category: 'deep', taskType: '任務',
    predecessor: '', durationDays: 1, owner: '', dept: '', variant: variantId,
    start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
    progress: 0, status: 'pending', urgency: 'med', estHours: dailyHours,
    method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
    scheduledStart: '', scheduledEnd: '', synced: false, stage: ref.stage || '', subgroup: '',
    mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
    deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: ''
  };
  res.tasks.splice(idx + 1, 0, newTask);
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 寫回 preview：需交付（單筆）
App._s2SetDeliver = function(taskId, checked) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (t) t.mustDeliver = !!checked;
};
// 寫回 preview：需交付（該階段全選）→ 重繪同步子勾選
App._s2DeliverAll = function(variantId, si, checked) {
  const g = this._s2GroupByStage(variantId);
  const st = g.order[si]; if (st == null) return;
  g.byStage[st].forEach(t => { t.mustDeliver = !!checked; });
  this._s2RefreshCase(variantId);
};
// ─── 步驟3：Gantt 階段軸 + 點階段切換清單 ───
// 各階段起迄：純讀該案 preview tasks 的 min plannedStart → max plannedEnd（不落地）。
App._s2StageRanges = function(variantId) {
  const g = this._s2GroupByStage(variantId);
  const ranges = g.order.map(st => {
    const ts = g.byStage[st];
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    return { stage: st, start: starts[0] || '', end: ends[ends.length - 1] || '' };
  });
  return { order: g.order, ranges };
};
// Gantt 階段軸：每階段一列(名+橫條+日期)，橫條 left/width 相對該案總區間；選中階段加 .on 高亮。
App._s2GanttHtml = function(variantId) {
  const data = this._s2StageRanges(variantId);
  const order = data.order, ranges = data.ranges;
  if (!order.length) return '';
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const toNum = (d) => d ? Date.parse(d) : NaN;
  const sel = (this._s2Stage && this._s2Stage[variantId]) || order[0];
  const allStarts = ranges.map(r => toNum(r.start)).filter(n => !isNaN(n));
  const allEnds = ranges.map(r => toNum(r.end)).filter(n => !isNaN(n));
  const minN = allStarts.length ? Math.min.apply(null, allStarts) : 0;
  const maxN = allEnds.length ? Math.max.apply(null, allEnds) : 0;
  const span = (maxN - minN) || 1;
  let rows = '';
  ranges.forEach((r, si) => {
    const isSel = r.stage === sel;
    const a = toNum(r.start), b = toNum(r.end);
    let bar;
    if (isNaN(a) || isNaN(b)) {
      bar = '<div class="s2-gbar-track"><div class="s2-gbar s2-gbar-none"></div></div>';
    } else {
      const left = ((a - minN) / span) * 100;
      const width = Math.max(((b - a) / span) * 100, 1.5);
      bar = '<div class="s2-gbar-track"><div class="s2-gbar" style="left:' + left + '%;width:' + width + '%"></div></div>';
    }
    // 顯示短日期：同年 MM/DD、跨年 YY/MM/DD；title hover 看完整 YYYY/MM/DD
    const shortD = (x) => { if (!x) return ''; const p = String(x).split('-'); return (p[1] || '') + '/' + (p[2] || ''); };
    const sameYr = r.start && r.end && r.start.slice(0, 4) === r.end.slice(0, 4);
    const oneD = (x) => x ? (sameYr ? shortD(x) : (String(x).slice(2, 4) + '/' + shortD(x))) : '';
    const dateLbl = (r.start || r.end) ? (oneD(r.start) + ' → ' + oneD(r.end)) : '待排';
    const dateFull = (r.start || r.end) ? (fmtD(r.start) + ' → ' + fmtD(r.end)) : '待排';
    rows +=
      '<div class="s2-grow' + (isSel ? ' on' : '') + '" onclick="App._s2SelectStage(\'' + variantId + '\', ' + si + ')">' +
        '<div class="s2-gname">' + U.esc(r.stage) + '</div>' +
        bar +
        '<div class="s2-gdate" title="' + dateFull + '">' + dateLbl + '</div>' +
      '</div>';
  });
  return '<div class="s2-gantt-axis">' + rows + '</div>';
};
// 點階段：設選中 → 只重繪該案（軸高亮 + 清單篩選），不洗整頁（已改 owner/mustDeliver 存 _tplPreview 不掉）。
App._s2SelectStage = function(variantId, si) {
  const g = this._s2GroupByStage(variantId);
  const st = g.order[si]; if (st == null) return;
  if (!this._s2Stage) this._s2Stage = {};
  this._s2Stage[variantId] = st;
  this._s2RefreshCase(variantId);
};
// 只重繪單一案別的 Gantt 軸 + 任務清單（讀 _tplPreview，已改值不掉）。
App._s2RefreshCase = function(variantId) {
  const gantt = document.querySelector('.s2-gantt[data-variant="' + variantId + '"]');
  if (gantt) gantt.innerHTML = this._s2GanttHtml(variantId);
  const list = document.querySelector('.s2-list[data-variant="' + variantId + '"]');
  if (list) list.innerHTML = this._s2ListHtml(variantId);
};

// ═══ 共用部門編輯 component（buildDeptRowsHtml 渲染 + deptUI 互動；編輯/模板兩端共用）═══
// 資料結構統一：depts = [{id, name, members:[{id, name}]}]
// mode='edit'：backing=project.depts，每動即時 Storage.save + 重繪容器
// mode='tpl' ：backing=App._tplDepts（暫存），每動只重繪容器、不存（下一步由 saveProject 收集）
App.buildDeptRowsHtml = function(depts, mode, projId) {
  const pid = projId || '';
  return (depts || []).map(d => `
      <div class="dept-edit-row" data-dept-id="${d.id}">
        <div class="dept-pill">
          <input class="dept-edit-name" value="${U.esc(d.name)}" placeholder="例：研發部" onchange="App.deptUI.renameDept('${mode}','${pid}','${d.id}',this.value)">
          <span class="dept-pill-sep"></span>
          <div class="dept-members">
            ${(d.members || []).map(m => `<span class="dept-member-chip"><input class="dept-member-name" data-member-id="${m.id}" value="${U.esc(m.name)}" placeholder="例：王小明" onchange="App.deptUI.renameMember('${mode}','${pid}','${d.id}','${m.id}',this.value)"><button class="dept-member-del" title="刪除擔當" onclick="App.deptUI.removeMember('${mode}','${pid}','${d.id}','${m.id}')">×</button></span>`).join('')}
            <button class="dept-member-add" onclick="App.deptUI.addMember('${mode}','${pid}','${d.id}')">＋擔當</button>
          </div>
        </div>
        <button class="dept-del-btn" title="刪除部門" onclick="App.deptUI.removeDept('${mode}','${pid}','${d.id}')">×</button>
      </div>`).join('');
};

App.deptUI = {
  // backing store 分流：edit→project.depts（持久）/ tpl→App._tplDepts（暫存）
  _store(mode, projId) {
    if (mode === 'edit') {
      const p = App.getProj(projId);
      if (!p) return null;
      if (!p.depts) p.depts = [];
      return p.depts;
    }
    if (!App._tplDepts) App._tplDepts = [];
    return App._tplDepts;
  },
  // 寫入時機分流：edit→存檔+重繪 / tpl→只重繪（不存）
  _after(mode, projId, focusSel) {
    if (mode === 'edit') Storage.save();
    this._rerender(mode, projId, focusSel);
  },
  // 只重繪部門容器（#deptEditorList），不重開整個 modal → 保住其他未存欄位
  _rerender(mode, projId, focusSel) {
    const box = document.getElementById('deptEditorList');
    if (!box) return;
    box.innerHTML = App.buildDeptRowsHtml(this._store(mode, projId), mode, projId);
    if (focusSel) {
      const el = box.querySelector(focusSel);
      if (el) el.focus();
    }
  },
  addDept(mode, projId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const id = U.id();
    store.push({ id: id, name: '', members: [{ id: U.id(), name: '' }] });
    this._after(mode, projId, '.dept-edit-row[data-dept-id="' + id + '"] .dept-edit-name');
  },
  renameDept(mode, projId, deptId, val) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d) return;
    const v = (val || '').trim();
    if (mode === 'edit' && !v) { U.toast('部門名不可空白'); return; }
    d.name = v;
    this._after(mode, projId);
  },
  removeDept(mode, projId, deptId) {
    const store = this._store(mode, projId);
    if (!store) return;
    if (mode === 'edit') {
      const n = DATA.tasks.filter(t => t.dept === deptId).length;
      if (n > 0) { App.openDeptReassign(projId, deptId); return; }   // 有任務掛著 → 改派彈窗（安全網）
      const d0 = store.find(x => x.id === deptId);
      if (!confirm('確定刪除部門「' + (d0 ? d0.name : deptId) + '」?')) return;
    }
    const i = store.findIndex(x => x.id === deptId);
    if (i >= 0) store.splice(i, 1);
    if (mode === 'tpl' && store.length === 0) store.push({ id: U.id(), name: '', members: [{ id: U.id(), name: '' }] });   // 模板維持至少 1 列
    this._after(mode, projId);
  },
  addMember(mode, projId, deptId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d) return;
    if (!d.members) d.members = [];
    const mid = U.id();
    d.members.push({ id: mid, name: '' });
    this._after(mode, projId, '[data-member-id="' + mid + '"]');
  },
  renameMember(mode, projId, deptId, memberId, val) {   // 修 bug：成員姓名改成可編輯
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d || !d.members) return;
    const m = d.members.find(x => x.id === memberId);
    if (!m) return;
    m.name = (val || '').trim();
    this._after(mode, projId);
  },
  removeMember(mode, projId, deptId, memberId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d || !d.members) return;
    d.members = d.members.filter(x => x.id !== memberId);
    this._after(mode, projId);
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
  App.deptUI._after('edit', projId);   // = Storage.save() + 重繪部門容器（取代舊 deptEdit._commit）
};

App.deleteProject = function(id) {
  if (App._roGuard()) return;
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
  this.refreshAll();   // 補：刪完重繪 sidebar（清舊按鈕）+ 儀表板彙總；showPage 已先設 currentPage=dashboard，避開 renderProject null 自動跳第一個專案
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
      <span class="pdca-tab-name">${U.esc(p.name)}</span>
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

// 把專案任務依 PLM 階段(task.stage)分桶，算每階段日期範圍 + 數量，依階段內最小 wbs（minWbs）排序。供階段下拉用。
// 日期走 getEffectiveSchedule 顯示優先序(override>actual>scheduled>planned)；.start==='' 的項目排除，不汙染 min/max。
// 純算：不碰 UI/渲染/引擎/applySchedule。ISO 'YYYY-MM-DD' 字串可直接字典序比較＝時序比較。
// @return [{ stageId, name, earliestStart, latestEnd, itemCount }]；空階段(無有日期項目) earliest/latest = null
// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
App.getProjectStages = function(projectId) {
  const NO_STAGE = '未分階段';
  const buckets = {};   // key = 階段名 + '\u0000' + (variant||'')；同名階段跨案別各自一桶
  (DATA.tasks || []).forEach(t => {
    if (t.project !== projectId || t._deleted) return;
    const s = (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : NO_STAGE;
    const key = s + '\u0000' + (t.variant || '');
    (buckets[key] || (buckets[key] = [])).push(t);
  });
  const stages = Object.keys(buckets).map(key => {
    const ts = buckets[key];
    const name = key.split('\u0000')[0];
    const variantId = key.split('\u0000')[1] || null;
    let earliestStart = null, latestEnd = null, doneCount = 0, minWbs = Infinity;
    ts.forEach(t => {
      if (t.status === 'done') doneCount++;
      const w = parseInt(t.wbs); if (!isNaN(w) && w < minWbs) minWbs = w;
      const sch = getEffectiveSchedule(t);
      if (sch && sch.start && (!earliestStart || sch.start < earliestStart)) earliestStart = sch.start;
      if (sch && sch.end   && (!latestEnd   || sch.end   > latestEnd))       latestEnd   = sch.end;
    });
    return { stageId: key, name, variantId, minWbs,
             earliestStart, latestEnd, itemCount: ts.length, doneCount };
  });
  // 排序：minWbs 升冪(主案 wbs 全小於另案→variant 自然分組)；平手以階段名穩定(防 Infinity-Infinity=NaN)
  stages.sort((a, b) => (a.minWbs - b.minWbs) || a.name.localeCompare(b.name));
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
  if (App._roGuard()) return;
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
// 設定頁子分頁切換：純切 .active class（CSS display 控制顯隱），不 re-render。
//   → 各 tab 的 set-* 元素永遠留在 DOM，saveSettings 跨 tab 讀取不會 crash。
//   querySelectorAll 限定 #page-settings，避免動到儀表板/專案頁的 .tab-btn。
App.showSettingsTab = function(btn, id) {
  document.querySelectorAll('#page-settings .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#page-settings .tab-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
};

App._pendingCalendar = null;   // 解析後暫存，確認才寫入

// 解析貼上文字 → 預覽（不寫入）。error/空貼/0 公休 → 提示且不給確認鈕（防清空現有）
App.parseCalendarImport = function() {
  const ta = document.getElementById('cal-paste');
  const prev = document.getElementById('cal-preview');
  const text = ((ta && ta.value) || '').trim();
  if (!text) { App._pendingCalendar = null; prev.innerHTML = '<div class="cal-hint">請先貼上行事曆文字</div>'; return; }
  const r = D.parseCalendarPaste(text);
  if (r.error) {   // 彈性版：無表頭等 → 顯示 error、不給確認鈕、不清空現有
    App._pendingCalendar = null;
    prev.innerHTML = `<div class="cal-hint">${U.esc(r.error)}</div>`;
    return;
  }
  const N = Object.keys(r.holidays).length, M = Object.keys(r.workOverrides).length, K = r.skipped;
  if (N === 0) {
    App._pendingCalendar = null;
    prev.innerHTML = `<div class="cal-hint">未解析到公休（公休 0 · 補班 ${M} · 跳過 ${K}）。請確認類型欄含「公休日」，或無類型欄時工作日欄為 0。未寫入。</div>`;
    return;
  }
  App._pendingCalendar = { holidays: r.holidays, workOverrides: r.workOverrides };
  const cur = Object.keys((DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays) || {}).length;
  prev.innerHTML = `<div class="cal-result">✅ 公休 ${N} 筆 · 補班 ${M} 筆 · 跳過 ${K} 行</div>` +
    `<button class="tb-action" onclick="App.confirmCalendarImport()">確認寫入（會覆蓋現有 ${cur} 筆公休）</button>`;
};

// 確認寫入：整批覆蓋 base.holidays（+ 有補班才寫 override.workOverrides）→ Storage.save → 重渲染
App.confirmCalendarImport = function() {
  const p = App._pendingCalendar;
  if (!p || !Object.keys(p.holidays).length) { U.toast('⚠ 沒有可寫入的公休', 'warning'); return; }
  if (!DATA.calendars) DATA.calendars = { base: { name: '台灣公版', holidays: {} }, override: null };
  DATA.calendars.base.holidays = p.holidays;
  if (Object.keys(p.workOverrides).length) {
    if (!DATA.calendars.override) DATA.calendars.override = { name: '公司調休', extraHolidays: {}, workOverrides: {} };
    DATA.calendars.override.workOverrides = p.workOverrides;
  }
  Storage.save();
  const n = Object.keys(p.holidays).length;
  App._pendingCalendar = null;
  const ta = document.getElementById('cal-paste'); if (ta) ta.value = '';
  document.getElementById('cal-preview').innerHTML = '';
  document.getElementById('cal-loaded').innerHTML = App.buildLoadedHolidaysHtml();
  U.toast(`✅ 已寫入 ${n} 筆公休`, 'success');
};

// 刪單筆公休
App.deleteHoliday = function(date) {
  const hol = DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays;
  if (!hol || !(date in hol)) return;
  delete hol[date];
  Storage.save();
  document.getElementById('cal-loaded').innerHTML = App.buildLoadedHolidaysHtml();
};

// 清空貼上區
App.clearCalendarPaste = function() {
  const ta = document.getElementById('cal-paste'); if (ta) ta.value = '';
  document.getElementById('cal-preview').innerHTML = '';
  App._pendingCalendar = null;
};

// 已載入公休清單（年份分組，第一版只顯示公休；單筆刪）
App.buildLoadedHolidaysHtml = function() {
  const hol = (DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays) || {};
  const dates = Object.keys(hol).sort();
  if (!dates.length) return '<div class="cal-empty">尚未載入公休</div>';
  const byYear = {};
  dates.forEach(d => { const y = d.slice(0, 4); (byYear[y] = byYear[y] || []).push(d); });
  const groups = Object.keys(byYear).sort().map(y =>
    `<tbody><tr><td colspan="3" class="cal-year">${y}（${byYear[y].length}）</td></tr>` +
    byYear[y].map(d => {
      const nm = U.esc(hol[d]);
      return `<tr><td class="col-mid"><span class="cal-row-date">${d}</span></td>` +
        `<td class="col-flex" title="${nm}"><span class="cal-row-name">${nm}</span></td>` +
        `<td class="col-action"><button class="cal-del" onclick="App.deleteHoliday('${d}')" title="刪除">✕</button></td></tr>`;
    }).join('') +
    `</tbody>`
  ).join('');
  return `<div class="cal-loaded-head">共 ${dates.length} 筆公休</div>` +
    `<table class="data-table cal-table">${groups}</table>`;
};

App.renderSettings = function() {
  if (!isAdmin()) return;
  const s = DATA.settings;

  document.getElementById('page-settings').innerHTML = `
    <div class="tabs" style="margin-bottom:18px;">
      <button class="tab-btn active" onclick="App.showSettingsTab(this,'排程')">排程</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料')">資料</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'編輯權限')">編輯權限</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'關於')">關於</button>
    </div>

    <div class="tab-panel active" id="排程"><div class="settings-grid">
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
      </div>
      <!-- 工作日曆（公休 / 補班）匯入 -->
      <div class="settings-section">
        <div class="ss-title">🗓 工作日曆（公休 / 補班）</div>
        <div class="ss-desc">貼上公司行事曆（含表頭，欄位順序不限），解析後寫入工作日定義（isWorkday／排程依此判工作日）</div>

        <div class="cal-import">
          <label class="cal-label">貼上行事曆文字（須含表頭那一行，如 日期／星期／類型／節日名稱／工作日；欄位順序不限）</label>
          <textarea id="cal-paste" class="cal-textarea" placeholder="日期&#9;星期&#9;類型&#9;節日名稱&#9;工作日&#10;2026-01-01&#9;四&#9;公休日&#9;元旦&#9;0"></textarea>
          <div class="cal-btns">
            <button class="tb-action" onclick="App.parseCalendarImport()">解析</button>
            <button class="tb-action ghost" onclick="App.clearCalendarPaste()">清空</button>
          </div>
          <div id="cal-preview" class="cal-preview"></div>
          <div id="cal-loaded" class="cal-loaded">${App.buildLoadedHolidaysHtml()}</div>
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
      <!-- /排程 --></div></div>
    <div class="tab-panel" id="資料"><div class="settings-grid">
      <!-- 雲端同步（訪客唯讀時隱藏，editor/admin 才顯示：CSS body.viewonly .cloud-sync-sec） -->
      <div class="settings-section cloud-sync-sec">
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
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
        </div>
      </div>
      <!-- /資料 --></div></div>
    <div class="tab-panel" id="編輯權限"><div class="settings-grid">
      <!-- 編輯權限名單（admin/editor/viewonly，後端 Script Properties）；admin 組僅 SuperAdmin 可見可改。此 tab 已限 Admin。 -->
      <div class="settings-section">
        <div class="ss-title">👥 編輯權限名單</div>
        <div class="ss-desc">加入後該 Google 帳號登入即得對應權限（名單存後端、跨裝置同步）</div>
        ${isSuperAdmin() ? `
        <div class="ss-field">
          <label>管理員 Admin</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-admin-input" placeholder="name@example.com">
              <button class="tb-action" onclick="Auth.addToList('admin','wl-admin-input')">加入</button>
            </div>
            <div id="wl-admin-list" class="wl-list"></div>
          </div>
        </div>` : ''}

        <div class="ss-field">
          <label>編輯者 Editor</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-editor-input" placeholder="name@example.com">
              <button class="tb-action" onclick="Auth.addToList('editor','wl-editor-input')">加入</button>
            </div>
            <div id="wl-editor-list" class="wl-list"></div>
          </div>
        </div>

        <div class="ss-field">
          <label>檢視者 Viewonly</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-viewonly-input" placeholder="name@example.com">
              <button class="tb-action" onclick="Auth.addToList('viewonly','wl-viewonly-input')">加入</button>
            </div>
            <div id="wl-viewonly-list" class="wl-list"></div>
          </div>
        </div>
      </div>
      <!-- /編輯權限 --></div></div>
    <div class="tab-panel" id="關於"><div class="settings-grid">
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
      </div>      <!-- 關於 ${CFG('APP_NAME', 'PM-Core')} -->
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
      <!-- /關於 --></div></div>

    <div style="text-align:center; margin-top:14px;">
      <button class="tb-action" onclick="App.saveSettings()" style="padding:12px 32px;">💾 儲存所有設定</button>
    </div>
  `;
  Auth.renderLists();   // ④ 名單容器在「編輯權限」tab 模板，innerHTML 設好後即時填
};

App.saveSettings = function() {
  const el = (id) => document.getElementById(id);
  const sv = (id) => { const e = el(id); return e ? e.value : null; };
  let v;
  if ((v = sv('set-preview')) !== null) DATA.settings.previewWeeks = parseInt(v);
  if ((v = sv('set-hours')) !== null) DATA.settings.dailyHours = parseFloat(v);
  if ((v = sv('set-ws1')) !== null) DATA.settings.workStart1 = v;
  if ((v = sv('set-we1')) !== null) DATA.settings.workEnd1 = v;
  if ((v = sv('set-ws2')) !== null) DATA.settings.workStart2 = v;
  if ((v = sv('set-we2')) !== null) DATA.settings.workEnd2 = v;
  if ((v = sv('set-golden')) !== null) DATA.settings.goldenTime = v;
  const dayPillBox = document.getElementById('dayPills');
  if (dayPillBox) DATA.settings.workDays = Array.from(dayPillBox.querySelectorAll('.day-pill.on')).map(b => parseInt(b.dataset.day));
  if ((v = sv('set-split')) !== null) DATA.settings.splitThreshold = parseFloat(v);
  if ((v = sv('set-uname')) !== null) DATA.settings.userName = v.trim();
  if ((v = sv('set-dept')) !== null) DATA.settings.department = v.trim();
  if ((v = sv('set-retention')) !== null) DATA.settings.doneRetentionDays = parseInt(v);

  // Google OAuth + whitelist
  const gciEl = document.getElementById('set-gci');
  if (gciEl) DATA.settings.googleClientId = gciEl.value.trim();
  const wlEl = document.getElementById('set-whitelist');
  if (wlEl) {
    DATA.settings.allowedEmails = wlEl.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  // ☁ Cloud sync
  const cuEl = document.getElementById('set-cloud-url');
  const ceEl = document.getElementById('set-cloud-enabled');
  const caEl = document.getElementById('set-cloud-autosync');
  if (cuEl) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (ceEl) DATA.settings.cloudSyncEnabled = ceEl.value === 'true';
  if (caEl) DATA.settings.cloudAutoSync = caEl.value === 'true';

  Storage.save();
  this.refreshUserBadge();
  U.toast('✓ 設定已儲存');
};

// ─── CLOUD SYNC HANDLERS ───
App.cloudUploadNow = function() {
  // 先把設定頁可能未存的 URL 抓進來
  const cuEl = document.getElementById('set-cloud-url');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (!DATA.settings.cloudSyncUrl) {
    U.toast('⚠ 請先設定 Apps Script URL 並儲存', 'warning');
    return;
  }
  CloudSync.upload(false);
};

App.cloudDownloadNow = function() {
  const cuEl = document.getElementById('set-cloud-url');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
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
  const url = cuEl ? cuEl.value.trim() : DATA.settings.cloudSyncUrl;
  if (!url) {
    U.toast('⚠ 請先填入 Apps Script URL', 'warning');
    return;
  }
  if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
  U.toast('🔌 測試連線中...', 'info');
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + 'id_token=' + encodeURIComponent(Auth._idToken || ''), {
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
      <button class="tb-action" data-edit-hide onclick="App.saveRecurringMeeting('${id || ''}')">${isNew ? '新增' : '儲存'}</button>
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
      <button class="tb-action" data-edit-hide onclick="App.saveSpecialMeeting('${id || ''}')">${isNew ? '新增' : '儲存'}</button>
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
  DATA.settings._role = undefined;   // 登出清身份（否則 isAdmin() 仍 true，只是被 overlay 遮住）；auth_admin_bound 保留不清
  Storage.save();
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  location.reload();
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
  const variants = variantNames.map(name => ({ id: U.id(), name }));
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
      if (!confirm('即將用此 Excel 覆蓋「' + projName + '」所有任務，現有任務清空重灌，確定？')) return;
      const res = performWbsImport(parsed, projId);
      const log = document.getElementById('wbsImportLog');
      if (log) {
        log.style.display = 'block';
        log.textContent = `✅ 已匯入 ${res.imported} 筆任務到「${projName}」（既有任務已清空重灌）`;
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
  App._insertAfterId = null;   // 取消/關閉(含 X、Esc)清插入旗標，避免殘留下次誤插
  App._tplDepts = null;        // 清模板暫存部門（取消/關閉都清，避免殘留下次誤用）
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
  // ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') App.closeModal();
  });
  initTooltip();
});
