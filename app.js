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
  // 總儀表板時程表顯示偏好（純顯示，存全域→上雲跨機）；午休 12:00–13:00 固定，不受此影響。
  gridStartHour: 8,
  gridEndHour: 18,
  gridSlotMinutes: 60,   // 週曆固定一小時一格（render 已強制；此值保留相容）
  // HintBox 區塊級說明框收合狀態：{ [key]: true=收起 }；undefined/false=展開（預設展開）。整包隨 settings 持久化＋上雲。
  hintBoxState: {},
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
  pdcaGroups: {}, // 殘留：PDCA 報表已拔除（§18.14）；僅供 migration 寫入相容、無人讀、不 load/save/sync
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
      // 可販日：確保 project.pdcaData 殼存在（KPI WORKDAYS LEFT 讀 targetDate；PDCA 報表已拔除 §18.14）
      DATA.projects.forEach(ensurePdcaData);
      DATA.tasks.forEach(ensureTaskType);
      DATA.tasks.forEach(ensureDeliverFields);
      runMigrations();
    } catch(e) { console.error('Load failed', e); }
  },
  save() {
    // 唯讀防線（咽喉）：viewonly 一律不落地。鎖 body.viewonly（非 _role——viewonly 進來只設 body class、無 _role，鎖 _role 會誤擋）。
    // 靜默 return（不 toast）：save 也被 migration/download 等內部流程呼叫，toast 會誤報；UX 提示放各編輯動作入口（第 3 處）。
    if (document.body.classList.contains('viewonly')) return;
    // 安全(§8f.6 Level 2/B)：未登入(無 _role 且非 localDev)不落地——登出清快取後的載入流程(migration／排程殘留整理等)
    //   不再把空殼寫回 localStorage，F12 保持全空。authed(admin/editor/superadmin 登入即設 _role)與 localDev 正常存檔；
    //   雲端 download 走直接 setItem、不經此函式，且登入後 _role 已設，故不受影響。
    if (!isLocalDev && !DATA.settings._role) return;
    localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
    localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
    localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
    localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
    localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
    localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
    localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
    localStorage.setItem(STORE.calendars, JSON.stringify(DATA.calendars || { base: { name: '台灣公版', holidays: {} }, override: null }));

    // ─── 雲端自動同步（debounced，避免頻繁上傳）───
    if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudAutoSync && DATA.settings.cloudSyncUrl) {
      CloudSync.scheduleUpload();
    }
  },
  // 安全(§8f.6 Level 2/B)：登出時清本機快取。
  //   當前 app(PATH_KEY) → 全清(含 settings/schedule/synclog，潔癖，登出後 F12 該路徑全空)。
  //   其他路徑(舊部署/平行部署) → 只清專案資料類，保留其 ::settings(不誤傷平行部署的設定)。
  //   被清資料雲端皆有：登入後後端位址來自 config.js 的 BACKEND_URL、自動下載還原，故清除安全、不掉資料。
  clearLocalData() {
    const DATA_SUFFIXES = ['projects', 'tasks', 'meetings', 'memos', 'schedule', 'weeknotes', 'calendars'];
    const curPrefix = 'pmw::' + PATH_KEY + '::';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('pmw::')) continue;
      if (k.startsWith(curPrefix) || DATA_SUFFIXES.includes(k.split('::').pop())) {
        localStorage.removeItem(k);
      }
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

  // 登出/離開前：把待上傳(debounce 中)的改動立即推上雲端，回傳 promise。清本機快取前呼叫，避免遺失最後一次編輯。
  //   viewonly／無憑證／未設雲端 → 直接 return(無可上傳)。
  async flushPendingUpload() {
    if (this._uploadTimer) { clearTimeout(this._uploadTimer); this._uploadTimer = null; }
    if (document.body.classList.contains('viewonly')) return;
    if (!Auth._idToken || !DATA.settings.cloudSyncEnabled || !DATA.settings.cloudSyncUrl) return;
    await this.upload(true);
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
      // 登入過期（Google JWT 短效，非系統故障）→ 友善 toast、不彈嚇人 alert；auto 靜默、手動才提示（比照 upload 開頭 !_idToken 守衛）
      const m = e && e.message;
      if (m === 'Invalid token' || m === 'Missing id_token' || m === 'Token verify failed') {
        if (!silent) U.toast('登入已過期，請重新登入', 'error');
        return false;
      }
      // 真故障（有 _idToken 卻 fetch/後端錯）→ alert 強提示，不分 silent（auto 也彈）；_uploadErrNotified 一次性防 auto-upload 每 3 秒彈一次（成功上傳才 reset）
      if (!this._uploadErrNotified) {
        this._uploadErrNotified = true;
        App.confirmModal({ icon: 'ti-cloud-off', iconBg: '--rose-l', iconColor: '--rose-ink', title: '雲端同步失敗', msg: '本次改動已存在本機、但未上傳雲端。資料暫時只在這台裝置，請勿清除瀏覽器資料；可稍後重試（再次儲存會自動重傳）。<br>錯誤：' + U.esc(e.message), cancelText: null, okText: '我知道了' });
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

  // 從開始日 + 完成日反推工期（工作天，含頭尾）= workdaysBetween 的語意化包裝。
  // §6.5c t.end 衍生化：使用者改「預計完成」時，save 端以此換算工期存（開始日當錨，不存獨立 t.end）。
  // start > end（負工期）→ workdaysBetween 回 0，由 save 端另行判定提示，此處不擋。
  deriveDurationFromEnd(start, end) {
    return this.workdaysBetween(start, end);
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

// ─── 可販日：project.pdcaData（PDCA 報表已拔除 §18.14，僅保留供 KPI「WORKDAYS LEFT」讀 targetDate）───
// pdcaData：{ startDate, targetDate（可販日，KPI 用）, summary }；startDate/summary 已成殘欄（無 UI 編輯、無人讀）
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}

// M2-T：Sheet/Excel 類型欄原字串 → taskType 正典值（task=排甘特 / milestone=節點工期0 / group=母項不執行）
// 未知字串與空值一律退回 'task'（同 parsePredecessors 未知關係退 FS 的容錯先例）
function mapTaskType(rawType) {
  const s = (rawType == null ? '' : String(rawType)).trim();
  if (s === '里程碑') return 'milestone';
  if (s === '群組') return 'group';
  return 'task';
}
// M2-T：taskType 形狀保險（每次 load 跑、只補缺不蓋值）。
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

  // monthly：每月第 N 個星期幾（依 startDate 推算 N；day 已在上方核對）。無錨點則每月該星期幾都算。
  if (freq === 'monthly') {
    const nthOf = (dt) => Math.floor((dt.getDate() - 1) / 7) + 1;
    if (!event.startDate) return true;
    const sd = new Date(event.startDate); sd.setHours(0, 0, 0, 0);
    return nthOf(d) === nthOf(sd);
  }

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
  toast(msg, type = 'success', opts = {}) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = msg;
    const dismiss = () => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); };
    if (opts.closable) {
      const x = document.createElement('button');
      x.className = 'toast-close'; x.setAttribute('aria-label', '關閉'); x.textContent = '×';
      x.addEventListener('click', dismiss);
      t.appendChild(x);
    }
    c.appendChild(t);
    const dur = opts.duration != null ? opts.duration : 3500;
    if (dur > 0) setTimeout(dismiss, dur);   // dur===0 → 不自動消失（需 closable 手動關）
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
// 放寬版（2026-06-28）：不要求同行有日期；只要有「起–迄時間範圍」就當一場（過濾時間軸單一刻度）。
// 時間吃 上午/下午/早上/晚上/中午 + H[:MM] + 點[MM分] → 正規化 24h。標題用本行剩字或上一行；
// 日期抓得到(MM/DD 或 星期)就填、抓不到留空，交確認清單讓 User 自己選星期（週檢視截圖先天對不回日期）。
function parseMeetingText(text) {
  if (!text) return [];
  // tesseract 對中文常在每字間插空格（「上 午 8 點」「1 2 3 會 議」）→ 去掉「中日字/數字/冒號/時間字」之間的空白，否則時間/標題對不上
  text = text.split('\n').map(l =>
    l.replace(/[ \t]+/g, ' ').replace(/([一-鿿\d:：點時午])\s(?=[一-鿿\d:：點時午])/g, '$1')
  ).join('\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const dayMap = { '日':0, '天':0, '一':1, '二':2, '三':3, '四':4, '五':5, '六':6 };
  const today = D.today();
  const monday = D.monday(today);

  const toHM = (mer, body) => {
    if (!body) return null;
    let h, mi;
    const cm = String(body).match(/(\d{1,2})[:：](\d{1,2})/);   // H:MM
    if (cm) { h = parseInt(cm[1], 10); mi = parseInt(cm[2], 10); }
    else {
      const dm = String(body).match(/\d+/);
      if (!dm) return null;
      const dig = dm[0];
      if (dig.length >= 3) { h = parseInt(dig.slice(0, dig.length - 2), 10); mi = parseInt(dig.slice(-2), 10); }  // 830→8:30、1030→10:30（OCR 常把冒號吃掉）
      else { h = parseInt(dig, 10); mi = 0; }   // 8點 / 10
    }
    if (/下午|晚上|傍晚|午後/.test(mer || '') && h < 12) h += 12;
    if (/上午|早上|凌晨|清晨/.test(mer || '') && h === 12) h = 0;
    if (/中午/.test(mer || '') && h < 12) h = 12;
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  };

  const MER = '上午|下午|早上|晚上|傍晚|午後|凌晨|清晨|中午';
  const TIME = '(?:\\d{3,4}|\\d{1,2}(?:[:：]\\d{1,2})?\\s*(?:點|時)?(?:\\d{1,2}\\s*分)?)';   // 先吃 3–4 位連續數字(OCR 吃掉冒號的 830/1030)，再吃一般 H[:MM]/H點[MM分]
  const RANGE = new RegExp(`(${MER})?\\s*(${TIME})\\s*[\\-–—~～至到]+\\s*(${MER})?\\s*(${TIME})`);

  const out = [];
  let prevTitle = '';
  for (const line of lines) {
    const rm = line.match(RANGE);
    if (!rm) {
      const t = line.trim();
      if (t && t.length <= 40 && !/^(GMT|UTC)/i.test(t) && !/^(週|星期)?[日一二三四五六]\s*\d{0,2}$/.test(t)) prevTitle = t;
      continue;
    }
    const startMer = rm[1] || '';
    const start = toHM(startMer, rm[2]);
    const end = toHM(rm[3] || startMer, rm[4]);   // 迄沿用起的上午/下午
    if (!start) continue;
    let title = line.replace(RANGE, ' ')
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .replace(/^\s*\d{1,2}[\/月]\d{1,2}[日]?/, '')
      .replace(/^\s*(週|星期)[日一二三四五六]/, '')
      .replace(/[，,。\-–—~：:]+/g, ' ')
      .trim();
    if (!title) title = prevTitle;
    let date = '';
    const md = line.match(/(\d{1,2})[\/月](\d{1,2})/);
    const wk = line.match(/(?:週|星期)([日一二三四五六])/);
    if (md) {
      const dt = new Date(today.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
      if (D.daysBetween(today, dt) < -180) dt.setFullYear(dt.getFullYear() + 1);
      date = D.fmt(dt, 'iso');
    } else if (wk) {
      const di = dayMap[wk[1]];
      date = D.fmt(D.addDays(monday, di === 0 ? 6 : di - 1), 'iso');
    }
    out.push({ date, startTime: start, endTime: end || '', title: title || '' });
    prevTitle = '';
  }
  return out;
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
    const _taskEff = getEffectiveSchedule(task);
    const _depEff  = getEffectiveSchedule(dep);
    const taskRefStr = (p.type === 'FF' || p.type === 'SF') ? _taskEff.end : _taskEff.start;
    const usesPredEnd = !(p.type === 'SS' || p.type === 'SF');  // FS/FF 讀 dep 完成日；SS/SF 讀 dep 開始日
    const predRefStr = usesPredEnd ? _depEff.end : _depEff.start;
    // 衍生兜底（塊一）已讓 getEffectiveSchedule.end 在 actual/scheduled/planned 全空時現算 start+工期，
    //   故原窄修補丁（dep.end 空補算）不再需要，移除。
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

// 本週已排程時段任務工時（schedule.items duration 分→H 加總）：Portfolio 雜事佔比與工作台本週工時的單一來源。
function weeklyScheduledHours(wk) {
  return (DATA.schedule.items || []).filter(it => it.week === wk).reduce((s, it) => s + (it.duration / 60), 0);
}
// 週容量：每日工時 × 每週工作日數（單一口徑，§18.10）：Portfolio.weekCapacity／雜事佔比 availableHours／工作台本週可用工時共用。
function weekCapacityHours() {
  return (DATA.settings.dailyHours || 6) * ((DATA.settings.workDays || []).length || 0);
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

// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function getEffectiveSchedule(task) {
  if (!task) return null;
  // 顯示優先序：actual(已開工) > scheduled(排程算) > planned(初始預計) > start(手填)
  // ⚠ 用 || 不用 ??：空字串也要 fallback 到下層
  const dispStart = (task.actualStart || task.scheduledStart || task.plannedStart || task.start || '');
  const _durNum = parseFloat(task.durationDays);
  // §6.5 負工期：dur≤0 也算 end（addWorkdays 支援負位移，dur=0→前一工作日、dur<0 更早）；milestone dur=1→addWorkdays(start,0)=start。
  const _derivedEnd = (dispStart && !isNaN(_durNum))
    ? D.fmt(D.addWorkdays(dispStart, _durNum - 1), 'iso')
    : '';
  const dispEnd   = (task.actualEnd   || task.scheduledEnd   || task.plannedEnd   || _derivedEnd || '');
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
  // 認中文標籤（人工/匯出 WBS）＋英文內碼（自家匯出 round-trip，§13.x Excel 狀態 round-trip 修正）
  if (s === 'done' || s.includes('完成')) return 'done';
  if (s === 'wip' || s.includes('進行') || (parseFloat(progress || 0) > 0 && parseFloat(progress) < 100)) return 'wip';
  if (s === 'hold' || s.includes('擱置') || s.includes('暫停')) return 'hold';
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
    const open = this._devOpen === true;   // 預設收起，避免擋到右下 toast；點膠囊才展開
    panel.classList.toggle('collapsed', !open);
    if (!open) {
      panel.innerHTML = '<button class="adp-toggle" onclick="Auth.toggleDevPanel()" title="DEV 身份切換">🔧 ' + cur + ' ▸</button>';
      return;
    }
    panel.innerHTML =
      '<div class="adp-title" onclick="Auth.toggleDevPanel()" style="cursor:pointer;">🔧 DEV 身份 ▾</div>' +
      '<div class="adp-cur">目前：' + cur + '</div>' +
      ['superadmin', 'admin', 'editor', 'viewonly', 'none'].map(r =>
        '<button class="adp-btn" onclick="Auth.setDevRole(\'' + r + '\')">' + r + '</button>'
      ).join('');
  },

  toggleDevPanel() {
    this._devOpen = !this._devOpen;
    this.renderDevPanel();
  },

  // none / Can't view：全屏擋頁，只 render 自己、不碰 task/project 資料（§8f.5 / §8f.8b 隔離紀律）
  enterBlockout() {
    document.body.classList.remove('viewonly'); // 擋頁不是唯讀，清掉 viewonly class
    // 安全(§8f.6 硬化)：清掉任何已渲染的敏感內容(sidebar 專案＋各頁)，防 DOM 殘留被偷看。DATA 留記憶體但不入 DOM。
    const pl = document.getElementById('projectList'); if (pl) pl.innerHTML = '';
    document.querySelectorAll('#content .page').forEach(p => { p.innerHTML = ''; });
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
    if (!this._idToken) return;   // 無憑證(DEV/未登入)：不打後端、不跳「登入已過期」噪音；名單需登入後才載
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
  currentPage: 'workspace', // 雙軌導覽預設首頁=個人工作台(§18)
  currentProjectId: null,
  currentView: 'overview', // 全專案總覽 tab:overview|gantt|month(全專案範圍,§18.4)
  projectView: 'dashboard', // B-2 專案頁視圖:dashboard|gantt|month(單專案範圍,獨立於 currentView)
  reportWeekKey: null, // for report page

  init() {
    Storage.load();
    cleanOldDoneTasks();
    this.cleanExpiredDeletedTasks();

    // First time? Set seed data
    // 安全(§8f.6 Level 2)：僅 localDev 或無雲端時 seed。Prod 有雲端時，空專案＝「尚未下載」，不 seed——
    //   否則登出清快取後 reload 會生種子專案，可能被 3 秒 auto-upload 推上雲端覆蓋真資料；交由登入後雲端下載填回。
    if (DATA.projects.length === 0 && (isLocalDev || !DATA.settings.cloudSyncUrl)) {
      this.seedDefaultProjects();
    }

    this.refreshUserBadge();
    this.updateWeekInfo();
    // 安全(§8f.6 硬化)：驗身分前【不渲染】敏感資料(sidebar 專案清單＋頁面內容)，避免 Prod 資料畫進登入遮罩底下的 DOM 被偷看。
    //   各 auth 成功路徑自行 refreshAll：localDev(checkLoginState)／admin·editor(handleGoogleCredential)／viewonly(enterViewOnly)；none→enterBlockout 不渲染。

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
    this.refreshAll();   // 安全(§8f.6 硬化)：init 不再預渲染，viewonly 進來自行畫本地資料(即時顯示，不依賴雲端下載成功)
  },

  // 唯讀編輯守門（UX）：viewonly 時 toast 提示並回 true，呼叫端 `if (App._roGuard()) return;`。
  // 單一真實來源：toast 文字只此一處。安全防線在 Storage.save/upload 咽喉（此僅 UX 提示、非安全層）。
  _roGuard() {
    if (document.body.classList.contains('viewonly')) { U.toast('唯讀模式，無法編輯', 'warning'); return true; }
    return false;
  },

  // ─── PAGE NAV ───
  showPage(name, btn, _force) {
    if (name === 'settings' && !isAdmin()) { return this.showPage('workspace', document.querySelector('[data-page=workspace]')); }
    // 修正3：離開設定頁且有未儲存變更 → 先彈窗問是否儲存（_force 跳過，供彈窗按鈕回呼）
    if (!_force && this.currentPage === 'settings' && name !== 'settings' && this._settingsDirty) { this._confirmLeaveSettings(name, btn); return; }
    this.currentPage = name;
    if (name === 'portfolio') this.currentView = 'overview';
    if (name === 'project') this.projectView = 'dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');

    const titles = {
      workspace: '個人工作台',
      portfolio: '全專案總覽',
      project:   this.currentProjectId ? this.getProj(this.currentProjectId)?.name + ' · 任務管理' : '專案',
      gantt:     '甘特圖 · 跨專案時程',
      month:     '月曆視圖',
      report:    '專案週報',
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
      case 'workspace': Workspace.render();     break;
      case 'portfolio': Portfolio.render();     break;
      case 'project':   this.renderProject();   break;
      case 'gantt':     this.renderGantt();     break;
      case 'month':     this.renderMonth();     break;
      case 'report':    this.renderReport();    break;
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

// 雙軌導覽分包（§18.7）：個人工作台 / 全專案總覽 各自命名空間，未來拆檔即剪貼。
const Workspace = {};
const Portfolio = {};

// 設計款輸入彈窗（取代原生 prompt）：textarea + 確定/取消，確定回傳值給 onSubmit
App.promptModal = function(opts) {
  const o = opts || {};
  App.openModal({
    title: o.title || '輸入',
    body: `<div class="form-field"><label>${U.esc(o.label || '')}</label>
      <textarea id="pm-input" rows="${o.rows || 3}" style="width:100%;resize:vertical;" placeholder="${U.esc(o.placeholder || '')}">${U.esc(o.value || '')}</textarea></div>`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" onclick="App._promptModalOk()">${U.esc(o.okText || '確定')}</button>`,
  });
  App._promptModalCb = o.onSubmit || null;
  setTimeout(() => { const i = document.getElementById('pm-input'); if (i) { i.focus(); if (i.select) i.select(); } }, 50);
};
App._promptModalOk = function() {
  const i = document.getElementById('pm-input');
  const val = i ? i.value : '';
  const cb = App._promptModalCb;
  App._promptModalCb = null;
  App.closeModal();
  if (cb) cb(val);
};

// 顯示用任務進度(Dashboard 口徑,KPI OVERALL 與階段進度卡共用,改必同步兩處呼叫端):
// 有 progress 數值 → 夾 0~100 用之;無數值 → 狀態折算(done=100、其餘=0),保守不灌水。
function taskDisplayProgress(t) {
  if (typeof t.progress === 'number') return Math.max(0, Math.min(100, t.progress));
  return t.status === 'done' ? 100 : 0;
}

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

// §6.5 塊三：confirm 公版——渲染到獨立 #confirmOverlay（z 疊在 #modal 上），不覆寫 #modal，底下表單原封不動。
App.confirmModal = function(opts) {
  const o = opts || {};
  const el = document.getElementById('confirmOverlay');
  // 選用 icon 圓（mockup circle-check／calendar／wrench）：給了 icon 才渲染、標題置中；沒給＝維持原樣（向後相容既有呼叫端）。
  const iconHtml = o.icon
    ? `<div style="width:46px;height:46px;border-radius:50%;background:var(${o.iconBg || '--sage-50'});display:flex;align-items:center;justify-content:center;margin:0 auto 12px;"><i class="ti ${o.icon}" style="font-size:23px;color:var(${o.iconColor || '--sage-600'});"></i></div>`
    : '';
  const okCls = o.okClass ? (' ' + o.okClass) : '';
  el.innerHTML = `<div class="confirm-box">
    ${iconHtml}
    <div class="confirm-title" style="font-weight:600;font-size:15px;${o.icon ? 'text-align:center;' : ''}">${o.title || '請確認'}</div>
    <div class="confirm-msg">${o.msg || ''}</div>
    <div class="confirm-actions">
      ${o.cancelText === null ? '' : `<button class="tb-action ghost" onclick="App._confirmModalClose()">${o.cancelText || '取消'}</button>`}
      <button class="tb-action${okCls}" onclick="App._confirmModalYes()">${o.okText || '確認'}</button>
    </div></div>`;
  el.style.display = 'flex';
  App._confirmModalCb = o.onConfirm || null;
};
App._confirmModalClose = function() {
  const el = document.getElementById('confirmOverlay');
  el.style.display = 'none'; el.innerHTML = '';
  App._confirmModalCb = null;
};
App._confirmModalYes = function() {
  const cb = App._confirmModalCb;
  App._confirmModalClose();
  if (cb) cb();
};

App.openModal = function({ title, body, footer, wide }) {
  const modal = document.getElementById('modal');
  modal.classList.toggle('modal-wide', !!wide);   // 寬版（如會議設定彈窗：確認清單欄位多）
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
