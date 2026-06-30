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
  // 每案有效方向：複用 App._effScheduleDir 單一真實來源（§4.8.7.2/.3），與燈號 slackOf 共用，防判定漂移。
  const effDir = (vid) => App._effScheduleDir(variantStart[vid], variantEnd[vid], variantDir[vid]);

  // 6b 溢出偵測（per 案別 computedEnd=max(plannedEnd) vs 設定結束日），只對 forward 案有意義
  const detectOverflow6b = (vid, vname) => {
    const endLimit = variantEnd[vid];
    if (!endLimit) return;
    const vts = tasks.filter(t => t.variant === vid && t.plannedEnd);
    if (!vts.length) return;
    let binding = vts[0];
    vts.forEach(t => { if (t.plannedEnd > binding.plannedEnd) binding = t; });
    const computedEnd = binding.plannedEnd;
    if (computedEnd > endLimit) {
      const overDays = Math.max(0, D.workdaysBetween(endLimit, computedEnd) - 1);
      warnings.push('「' + vname + '」排程溢出：最晚「' + binding.name + '」需排到 ' + computedEnd +
        '，超過設定結束日 ' + endLimit + '（約 ' + overDays + ' 工作天）');
    }
  };

  // 方案 B：所有案皆 forward → 走原單次正推 path（行為與舊版逐字等價）。
  if (variants.every(v => effDir(v.id) === 'forward')) {
    tasks.forEach(t => { if (!t.predecessor) t.plannedStart = variantStart[t.variant] || ''; });
    const sch = computeSchedule(tasks);
    const schById = new Map();
    sch.results.forEach(r => schById.set(r.taskId, r));
    tasks.forEach(t => {
      const r = schById.get(t.id);
      if (r && r.suggestedStart) { t.plannedStart = r.suggestedStart; t.plannedEnd = r.suggestedEnd; }
      else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無起算日或循環依賴）'); }
    });
    variants.forEach(v => detectOverflow6b(v.id, v.name));
    return;
  }

  // 任一案非 forward → 逐案依方向分派（範本零跨案邊，子集排程與全陣列等價）。
  variants.forEach(v => {
    const vid = v.id;
    const vtasks = tasks.filter(t => t.variant === vid);
    if (!vtasks.length) return;
    const dir = effDir(vid);

    if (dir === 'forward') {
      vtasks.forEach(t => { if (!t.predecessor) t.plannedStart = variantStart[vid] || ''; });
      const sch = computeSchedule(vtasks);
      const m = new Map(); sch.results.forEach(r => m.set(r.taskId, r));
      vtasks.forEach(t => {
        const r = m.get(t.id);
        if (r && r.suggestedStart) { t.plannedStart = r.suggestedStart; t.plannedEnd = r.suggestedEnd; }
        else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無起算日或循環依賴）'); }
      });
      detectOverflow6b(vid, v.name);
      return;
    }

    // backward / interval：seed targetEnd(transient) → 反推 → 映射 lateStart/lateFinish→plannedStart/End
    const endDate = variantEnd[vid];
    let sch;
    try {
      vtasks.forEach(t => { t.targetEnd = endDate; });
      sch = computeScheduleBackward(vtasks);
    } finally {
      vtasks.forEach(t => { delete t.targetEnd; });   // transient seed：無條件清，不隨建立落地
    }
    const m = new Map(); sch.results.forEach(r => m.set(r.taskId, r));
    vtasks.forEach(t => {
      const r = m.get(t.id);
      // ★ 映射轉換（最大技術風險）：反推吐 lateStart/lateFinish，這張圖讀 plannedStart/plannedEnd
      if (r && r.lateStart != null) { t.plannedStart = r.lateStart; t.plannedEnd = r.lateFinish; }
      else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無目標可販日或循環依賴）'); }
    });

    if (dir === 'interval') {
      const slack = App._computeSlack(sch.results, variantStart[vid], endDate);
      if (slack && slack.light === 'red') {
        warnings.push('「' + v.name + '」時間不足：最快 ' + slack.earliestFinish +
          ' 完成，超出結束日 ' + endDate + ' 約 ' + slack.overDays + ' 工作天');
      }
    }
  });
};

// _computeSlack(results, startDate, endDate)：interval 餘裕 + 三級燈號（§4.8.7.4，純函式 [CORE]）。
//   可用工作天 = workdaysBetween(start,end)；需要工作天 = 關鍵路徑(最長依賴鏈) = workdaysBetween(min lateStart, max lateFinish)；
//   餘裕 = 可用 - 需要；燈號 ≥5 綠 / 0~4 黃 / <0 紅；紅燈附 earliestFinish(從 start 順推 needed) + overDays。
//   start/end 任一缺 → 回 null（非 interval，不顯示燈號）。
App._computeSlack = function(results, startDate, endDate) {
  if (!startDate || !endDate) return null;
  let minStart = null, maxFinish = null;
  (results || []).forEach(r => {
    if (r.lateStart != null && (minStart === null || r.lateStart < minStart)) minStart = r.lateStart;
    if (r.lateFinish != null && (maxFinish === null || r.lateFinish > maxFinish)) maxFinish = r.lateFinish;
  });
  const available = D.workdaysBetween(startDate, endDate);
  const needed = (minStart && maxFinish) ? D.workdaysBetween(minStart, maxFinish) : 0;
  const slack = available - needed;
  const light = slack >= 5 ? 'green' : (slack >= 0 ? 'yellow' : 'red');
  const earliestFinish = needed > 0 ? D.fmt(D.addWorkdays(startDate, needed - 1), 'iso') : '';
  const overDays = slack < 0 ? Math.max(0, D.workdaysBetween(endDate, earliestFinish) - 1) : 0;
  return { available, needed, slack, light, earliestFinish, overDays };
};

// _effScheduleDir(startDate, endDate, direction)：三模式有效方向單一真實來源（§4.8.7.2/.3＋§4.8.7.4b A 自動判定）。
//   開始+結束→interval；只結束→backward（倒推）；只開始→forward（順推）；皆空→沿用 direction 下拉（預設 forward）。
//   _reschedulePreview 與燈號／動態提示共用，防判定漂移。
App._effScheduleDir = function(startDate, endDate, direction) {
  if (startDate && endDate) return 'interval';
  if (endDate) return 'backward';
  if (startDate) return 'forward';
  return direction === 'backward' ? 'backward' : 'forward';
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
          role: (tk.role || '').trim(),   // §4.8.7.4b Stage2 New：留範本角色，供部門彈窗「儲存並套用」時 role→dept 重映射（不重跑 applyTemplate 即可保留手改）
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
    </div>`;
};

Workspace.render = function() {
  // Week offset: 0 = 本週, -1 = 上週, +1 = 下週...
  if (typeof this.dashboardWeekOffset !== 'number') {
    const _dow = D.today().getDay();   // 六(6)日(0) 預設顯示下週：假日有空可先排下週（§18）
    this.dashboardWeekOffset = (_dow === 0 || _dow === 6) ? 1 : 0;
  }

  const today = D.today();
  const baseMonday = D.monday(today);
  const monday = D.addDays(baseMonday, this.dashboardWeekOffset * 7);
  const sunday = D.addDays(monday, 6);
  const wk = D.weekKey(monday);
  const wkNum = D.weekNum(monday);

  // ─── 工作台 KPI（微觀/小時計，§A 重定義）：今日/本週時段任務數 + 緊急小時 Task（皆只吃時段制，與時程表口徑一致）───
  const _todayIso = D.fmt(today, 'iso');
  const _schItems = DATA.schedule.items || [];
  const _todayTaskCount = new Set(_schItems.filter(it => it.date === _todayIso).map(it => it.taskId)).size;
  const _weekTaskCount = new Set(_schItems.filter(it => it.week === wk).map(it => it.taskId)).size;
  const _urgentHours = DATA.tasks.filter(t => !t._deleted && t.measureType === 'hours' && t.status !== 'done' && t.status !== 'hold').filter(t => {
    const sch = getEffectiveSchedule(t);
    return t.urgency === 'high' || (sch.end && D.daysBetween(today, new Date(sch.end)) <= 1);
  });

  const totalHours = weeklyScheduledHours(wk);
  const availableHours = weekCapacityHours();

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
      <div class="stat-num">${_todayTaskCount}</div>
      <div class="stat-label">今日時段任務</div>
    </div>
    <div class="stat">
      <div class="stat-num">${_weekTaskCount}</div>
      <div class="stat-label">${this.dashboardWeekOffset === 0 ? '本週' : 'W' + wkNum} 時段任務</div>
    </div>
    <div class="stat stat-urgent" onclick="App.showUrgentModal()" title="點擊查看緊急小時 Task">
      <div class="stat-num">${_urgentHours.length}</div>
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

  document.getElementById('page-workspace').innerHTML = `
    ${statsHtml}
    <div class="dash-grid">
      <div>
        <div class="card" style="padding-bottom:14px;">
          <div class="card-head">
            <div class="card-title">時程表</div>
            <div class="week-nav-mini">
              <button class="rw-arrow" onclick="Workspace.dashboardWeekShift(-1)" title="上一週">‹</button>
              <select class="rw-select-mini" onchange="Workspace.dashboardWeekOffset = parseInt(this.value); Workspace.render();">
                ${weekOpts.join('')}
              </select>
              <button class="rw-arrow" onclick="Workspace.dashboardWeekShift(1)" title="下一週">›</button>
              ${this.dashboardWeekOffset !== 0 ? `<button class="rw-arrow" onclick="Workspace.dashboardWeekOffset=0; Workspace.render();" title="回到本週" style="background: var(--sage-50); color: var(--sage-700);">今</button>` : ''}
            </div>
            <button class="rw-arrow" title="時程表顯示設定（顯示時間範圍）" onclick="App.openGridSettingsModal()" style="margin-left:auto;"><i class="ti ti-settings"></i></button>
            <button class="tb-action" data-edit onclick="App.openHoursTaskDialog()">+ 新增小時 Task</button>
            <button class="tb-action ghost" data-edit onclick="App.openMeetingModal()"><i class="ti ti-calendar"></i> 管理會議</button>
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
      <div class="dash-side">${memoHtml}</div>
    </div>
  `;
  this.attachMemoDrag();
  // 日期列凍結：量 topbar 實際高度當 sticky 偏移（topbar 為 sticky top:0、標題在內）
  const _tb = document.querySelector('.main > .topbar');
  if (_tb) document.documentElement.style.setProperty('--ws-sticky-top', _tb.offsetHeight + 'px');
};

Workspace.dashboardWeekShift = function(delta) {
  this.dashboardWeekOffset = (this.dashboardWeekOffset || 0) + delta;
  Workspace.render();
};

Workspace.buildWeekScheduleHtml = function(targetMonday) {
  const monday = targetMonday || D.monday();
  const wk = D.weekKey(monday);
  const today = D.today();
  const wd = ['一','二','三','四','五'];

  // Header
  let html = '<div class="week-schedule"><div class="ws-corner"></div>';
  for (let i = 0; i < 5; i++) {
    const d = D.addDays(monday, i);
    const isToday = D.isSameDay(d, today);
    html += `<div class="ws-day-header ${isToday ? 'today' : ''}">
      <span class="date">${d.getDate()}</span>週${wd[i]}
    </div>`;
  }

  // Rows: 09 10 11 12 14 15 16 17
  // 顯示時數由全域設定生成（gridStartHour..gridEndHour-1）；午休 hr===12 固定不受影響
  const _gs = Math.max(0, Math.min(22, parseInt(DATA.settings.gridStartHour, 10) || 8));
  const _ge = Math.max(_gs + 1, Math.min(24, parseInt(DATA.settings.gridEndHour, 10) || 18));
  const hours = []; for (let _h = _gs; _h < _ge; _h++) hours.push(_h);
  const _lastHr = hours.length ? hours[hours.length - 1] : _gs;   // 最後一格 → 底部補結束時間(_ge)標籤
  const _slots = [0];   // 週曆全面一小時一格（不再有半小時子列）
  // 比例定位：一格高 66px、格線 gap 1px → 每小時像素間距 67；事件 top/height 依實際分鐘換算
  const CELL_H = 66, ROW_GAP = 1, PITCH = CELL_H + ROW_GAP;
  const _tmin = (s) => { const p = String(s || '').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); };
  const _minPx = (min) => (min / 60) * PITCH;
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
    return ({ once: '單次', daily: '每天', weekly: '每週', biweekly: '隔週(一天)', triweekly: '隔兩週(一天)', monthly: '每月', 'biweekly-allday': '隔週整週每天', 'triweekly-allday': '隔兩週整週每天' })[f] || '每週';
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
    for (const mm of _slots) {
    // 午休：12:00 改成「時間欄(靠上) + 橫貫五天的單一午休帶」，12:30 子列整列跳過
    if (hr === 12) {
      if (mm === 0) {
        html += `<div class="ws-time-col ws-time-lunch"><span class="ws-tlabel${hr === _gs ? ' ws-tlabel-first' : ''}">12:00</span>${hr === _lastHr ? `<span class="ws-tlabel ws-tlabel-end">${String(_ge).padStart(2,'0')}:00</span>` : ''}</div>`;
        html += `<div class="ws-lunch-band">☕ 午休時間</div>`;
      }
      continue;
    }
    const half = mm === 0 ? '00' : '30';
    html += `<div class="ws-time-col"><span class="ws-tlabel${hr === _gs ? ' ws-tlabel-first' : ''}">${String(hr).padStart(2,'0')}:${half}</span>${hr === _lastHr ? `<span class="ws-tlabel ws-tlabel-end">${String(_ge).padStart(2,'0')}:00</span>` : ''}</div>`;
    for (let i = 0; i < 5; i++) {
      const d = D.addDays(monday, i);
      const dateIso = D.fmt(d, 'iso');
      const hrStr = `${String(hr).padStart(2,'0')}:${half}`;

      // Find items at this slot（一小時格：以整點 hour 比對，HH:30 起的任務也歸入該格、靠比例定位）
      const item = items.find(it => it.date === dateIso && Math.floor(_tmin(it.start) / 60) === hr);
      const meeting = mm === 0 ? meetings.find(m => {
        if (m.date !== dateIso) return false;
        const [mh] = (m.startTime || '').split(':').map(Number);
        return mh === hr;
      }) : null;
      const meetingAuto = mm === 0 ? findMeetingAt(dateIso, hr) : null;

      // Cell is drop target
      html += `<div class="ws-cell ${D.isSameDay(d, today) ? 'today-col' : ''}" data-date="${dateIso}" data-start="${hrStr}" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="App.handleScheduleDrop(event, '${dateIso}', '${hrStr}')">`;
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

          // 卡片比例定位：top/height 依實際起訖分鐘；起點早於本格頂則釘格頂、最小高 18px
          const _stM = _tmin(item.start), _enM = _stM + (item.duration || 60);
          let _top = _minPx(_stM - hr * 60); if (_top < 0) _top = 0;
          const _h = Math.max(18, _minPx(_enM - hr * 60) - _top - ROW_GAP);

          html += `<div class="ws-event ws-ev-task ${cat} ${item.locked ? 'locked' : ''} ${isOverdue ? 'overdue' : ''} ${item.completed ? 'completed' : ''}"
            style="top:${_top}px;height:${_h}px;"
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
        const mMisc = meeting.category === 'cleaning';   // 雜項桶（自訂分類名）；其餘＝會議
        const mIcon = mMisc ? '🏷' : '📅';
        const mLbl = (mMisc && meeting.categoryLabel) ? `[${U.esc(meeting.categoryLabel)}] ` : '';
        const _mSt = _tmin(meeting.startTime || `${hr}:00`);
        const _mEn = meeting.endTime ? _tmin(meeting.endTime) : _mSt + 60;
        let _mTop = _minPx(_mSt - hr * 60); if (_mTop < 0) _mTop = 0;
        const _mH = Math.max(18, _minPx(_mEn - hr * 60) - _mTop - ROW_GAP);
        html += `<div class="ws-event ${mMisc ? 'cleaning' : 'meeting'}" style="top:${_mTop}px;height:${_mH}px;" title="${U.esc(((mMisc && meeting.categoryLabel) ? '[' + meeting.categoryLabel + '] ' : '') + meeting.title)}">
          <b>${mIcon} ${mLbl}${U.esc(meeting.title).slice(0, 12)}</b>
          <div class="ev-meta">${meeting.startTime || ''}</div>
        </div>`;
      } else if (meetingAuto) {
        // Show recurring / special meeting (auto-blocked)
        // Merged cell effect: only render on isFirstSlot with extended height
        if (meetingAuto.isFirstSlot) {
          const aMisc = meetingAuto.category === 'cleaning';
          const aLbl = (aMisc && meetingAuto.categoryLabel) ? `[${meetingAuto.categoryLabel}] ` : '';
          const catTxt = aMisc ? (meetingAuto.categoryLabel || '雜項') : '會議';
          const tip = `${aLbl}${meetingAuto.title}\n${meetingAuto.start}–${meetingAuto.end}\n${aMisc ? '🏷' : '📅'} ${catTxt}（${freqLabel(meetingAuto.frequency)}）`;
          // 比例定位：依實際起訖分鐘；起點早於本格頂則釘格頂、最小高 18px
          const _aSt = _tmin(meetingAuto.start), _aEn = meetingAuto.end ? _tmin(meetingAuto.end) : _aSt + 60;
          let _aTop = _minPx(_aSt - hr * 60); if (_aTop < 0) _aTop = 0;
          const _aH = Math.max(18, _minPx(_aEn - hr * 60) - _aTop - ROW_GAP);
          const cssClass = aMisc ? 'cleaning' : 'auto-meeting';
          const icon = aMisc ? (meetingAuto.categoryLabel ? '🏷' : '🧹') : '📅';
          // z-index 1：低於任務（防止視覺覆蓋其他列的任務）
          html += `<div class="ws-event meeting ${cssClass}" style="top:${_aTop}px; height:${_aH}px; z-index:1;" title="${U.esc(tip)}">
            <b>${icon} ${U.esc(aLbl + meetingAuto.title).slice(0, 16)}</b>
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
  Workspace.render();
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
  Workspace.render();
  U.toast('📌 已釘選到本週');
};

App.unpinTaskFromWeek = function(taskId) {
  if (App._roGuard()) return;
  if (!taskId) return;
  const s = DATA.settings;
  s.pinnedWeekTaskIds = (s.pinnedWeekTaskIds || []).filter(id => id !== taskId);
  Storage.save();
  generateSchedule();
  Workspace.render();
  U.toast('已取消釘選');
};

// 【需求 A】下週待辦：分專案顯示，一週內 top5+捲軸；更遠的另開摺疊；最後已釘選清單
Workspace.buildNextWeekTodoHtml = function() {
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

Workspace.buildMemoListHtml = function() {
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

Workspace.attachMemoDrag = function() {
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

App.addMemo = function() {
  if (App._roGuard()) return;
  App.promptModal({
    title: '新增便利貼', label: '便利貼內容', placeholder: '輸入內容…', okText: '加入',
    onSubmit: (text) => {
      if (!text || !text.trim()) return;
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
      Workspace.render();
      U.toast('✓ 便利貼已加入');
    },
  });
};

App.editMemo = function(id) {
  const memo = DATA.memos.find(m => m.id === id);
  if (!memo) return;
  App.promptModal({
    title: '編輯便利貼', label: '便利貼內容', value: memo.text, okText: '儲存',
    onSubmit: (newText) => {
      const trimmed = (newText || '').trim();
      if (!trimmed) {
        App.confirmModal({ icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
          title: '內容為空，刪除這張便利貼？', okText: '刪除', cancelText: '取消', okClass: 'danger',
          onConfirm: () => { DATA.memos = DATA.memos.filter(m => m.id !== id); Storage.save(); Workspace.render(); U.toast('✓ 已刪除'); } });
        return;
      }
      memo.text = trimmed.slice(0, 200);
      Storage.save();
      Workspace.render();
      U.toast('✓ 已更新');
    },
  });
};

App.deleteMemo = function(id) {
  if (App._roGuard()) return;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '刪除這張便利貼？', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.memos = DATA.memos.filter(m => m.id !== id);
      Storage.save();
      Workspace.render();
    },
  });
};

App.showUrgentModal = function() {
  const urgent = DATA.tasks
    .filter(t => t.status !== 'done' && t.status !== 'hold')
    .filter(t => t.measureType === 'hours')   // 工作台緊急卡：只列小時計（時段制）項目（§A）
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
    +   `<select class="case-direction"><option value="forward">順推（從開始日）</option><option value="backward">逆推（從結束日）</option></select>`
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
              <option value="backward">逆推（從結束日）</option>
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
  if (mode === 'template') { App._scheduleEduCard(); return; }   // §4.8.7.4b 3-7：範本走新流程（教育卡→第一階段預覽頁）；Excel/空白維持舊 _flowStep2
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
  const _commit = () => {
    np.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
    ensurePdcaData(np);
    DATA.projects.push(np);
    App.currentProjectId = np.id;
    Storage.save();
    App._createFlow = null;   // 流程結束，清狀態
    App.closeModal();
    App.refreshAll();
    U.toast('✓ 專案已建立');
    App.showPage('project', null);
  };
  if (dup.length) {
    App.confirmModal({ icon: 'ti-copy', iconBg: '--amber-l', iconColor: '--amber-ink',
      title: `已有 ${dup.length} 個同名專案「${name}」`, msg: '要建立新版本嗎？兩者並存，可在側邊欄辨識版號。', okText: '建立新版本', cancelText: '返回修改', onConfirm: _commit });
  } else { _commit(); }
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

  // 此函式只處理「編輯既有專案」。新增專案走 _flowStep1 多步流程；
  // 舊單一彈窗的 create 分支（pf-mode + template/blank + Excel「下一批實作」stub）已退役、不可達，移除。
  if (App._roGuard()) return;
  const p = this.getProj(id);
  if (p) { p.name = name; p.color = color; p.note = note; }
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 專案已更新');
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
        '<div class="s2-slack-wrap" data-variant="' + v.id + '">' + this._s2SlackHtml(v.id) + '</div>' +
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

// ═══ §4.8.7.4b Stage 2 New UI（Mockup⑤⑥）：編輯任務骨架 — 左部門面板＋右甘特＋階段任務表＋部門彈窗 ═══
// 接線：第一階段預覽「下一步」→ _flowStage1Next（collect→applyTemplate→_renderStage2New）。
// 不接舊 _renderStage2/_stage2Commit 的 render；建立仍複用 _stage2Commit（讀 _tplPreview，邏輯不變）。

// 第一階段「下一步：檢視任務」：掃第一階段輸入 → applyTemplate（不落地）→ 進新 Stage 2。
// 上一步靠切 .active 不重繪 page-stage1，故回上一步輸入仍在（DOM 不清）。
App._flowStage1Next = function() {
  const tpl = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined') ? PRODUCT_DEV_TEMPLATE : null;
  if (!tpl) { U.toast('⚠ 找不到範本', 'warning'); return; }
  const input = App._s1CollectInput();
  if (!input || !input.cases.length) { U.toast('⚠ 無案別資料，請重新套用範本', 'warning'); return; }
  const main = input.cases[0];
  if (!main.startDate && !main.endDate) { U.toast('⚠ 主案請至少填開始日或上市日期', 'warning'); return; }
  input.depts = App._tplDepts || [];   // 新流程部門多在 Stage 2 才編；此處沿用既有暫存（通常為空）
  this._tplPreview = App.applyTemplate(tpl, input);
  // ③ 過渡中繼彈窗：偵測到任一案別時程不足（紅燈）→ 先彈智慧排程引導窗，按「開始智慧排程」才進 Stage 2；夠就直接進。
  const reds = (this._tplPreview.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; });
  if (reds.length) {
    let maxOver = 0;
    reds.forEach(v => { const s = App._s2VariantSlack(v.id); if (s && s.overDays > maxOver) maxOver = s.overDays; });
    App.confirmModal({
      icon: 'ti-chart-bar', iconBg: '--rose-l', iconColor: '--rose',
      title: '偵測到時程衝突！已為您開啟智慧排程引導',
      msg: '目前排程規劃尚缺 <b>' + maxOver + '</b> 個工作天' + (reds.length > 1 ? '（共 ' + reds.length + ' 個案別時程不足）' : '') + '。為了協助您快速順時程，系統已將此專案導入「智慧排程衝突處理面板」。<br><br>您可以透過系統建議一鍵微調，或透過精選的長工時任務快速進行扣減。',
      okText: '開始智慧排程 →', cancelText: '返回上一步',
      onConfirm: function() { App._renderOverflowFlow(); }
    });
    return;
  }
  App._s2From = 'stage1';   // §第3：綠/黃直接進 Stage 2（未經 overflow 面板）→「上一步」回 Stage 1
  this._renderStage2New();
};

// 上一步分情境（§第3）：經 overflow 面板來的回面板、保留層一二設定（層別/工期/採用的上市日全在）；綠黃直接來的回 Stage 1。
App._s2BackToStage1 = function() {
  if (App._s2From === 'overflow' && App._ovfState) {
    App._ovfRender();   // 回智慧排程面板，_ovfState 不重置 → 設定全保留，不會被打回 Stage 1 重來
    return;
  }
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const p = document.getElementById('page-stage1');
  if (p) p.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 建立專案：先還原全域 topbar（離開流程頁）再走既有 _stage2Commit（落地邏輯單一真實來源、不重寫）。
App._s2CommitNew = function() {
  // 紅燈軟提醒閘門（§4.8.7.5）：有案別餘裕<0 → 先彈設計款確認，不硬擋（可先用紅燈引導調上市日/工期）。
  const res = this._tplPreview;
  const reds = res ? (res.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; }) : [];
  if (reds.length) {
    App.confirmModal({
      icon: 'ti-tool', iconBg: '--rose-l', iconColor: '--rose',
      title: '工期仍不足，確定建立？',
      msg: '尚有 <b>' + reds.length + '</b> 個案別時程不足（餘裕 < 0）。可先用上方紅燈引導調整上市日或壓縮工期；仍要強制建立嗎？',
      okText: '仍要強制建立', okClass: 'danger', cancelText: '返回調整',
      onConfirm: function() { App._s2DoCommit(); }
    });
    return;
  }
  App._s2DoCommit();
};
// 實際落地：還原全域 topbar（離開流程頁）再走既有 _stage2Commit（落地邏輯單一真實來源、不重寫）。
App._s2DoCommit = function() {
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.remove('topbar-hidden');
  App._stage2Commit();
};

// 左部門面板（純顯示，Mockup⑤左欄）：列各部門→成員＋該案任務數；「未指派」筆數標紅。
// 不可點（v1）；資料讀 _tplPreview，套用部門後由 _renderStage2New 整頁重繪刷新。
App._s2DeptPanelHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const depts = res.depts || [];
  const tasks = (res.tasks || []).filter(t => t.variant === variantId);
  const unassigned = tasks.filter(t => !t.owner).length;
  let rows = depts.map(d => {
    const cnt = tasks.filter(t => t.dept === d.id).length;
    const names = (d.members || []).map(m => U.esc(m.name)).filter(Boolean).join('、') || '<span class="s2n-dp-empty">無成員</span>';
    return '<div class="s2n-dp-row">' +
        '<div class="s2n-dp-name">' + U.esc(d.name) + '</div>' +
        '<div class="s2n-dp-members">' + names + '</div>' +
        '<div class="s2n-dp-cnt">' + cnt + ' 件</div>' +
      '</div>';
  }).join('');
  if (!depts.length) rows = '<div class="s2n-dp-none">尚未設定部門，點右上「新增/編輯部門」建立</div>';
  const unRow = '<div class="s2n-dp-row s2n-dp-unassigned' + (unassigned ? '' : ' ok') + '">' +
      '<div class="s2n-dp-name">未指派</div>' +
      '<div class="s2n-dp-members"></div>' +
      '<div class="s2n-dp-cnt">' + unassigned + ' 件</div>' +
    '</div>';
  return '<div class="s2n-deptpanel">' +
      '<div class="s2n-dp-head">' +
        '<span class="s2n-dp-title">部門與負責人</span>' +
        '<button class="s2n-dp-btn" onclick="App._s2OpenDeptModal()"><i class="ti ti-pencil"></i> 新增/編輯部門</button>' +
      '</div>' + rows + unRow +
    '</div>';
};

// 部門彈窗（Mockup⑥）：複用共用部門元件（buildDeptRowsHtml + deptUI tpl 模式，暫存 _tplDepts）。
// 開窗前把 _tplPreview.depts deep-clone 進 _tplDepts 當工作副本；取消＝closeModal 清掉副本、不動 preview。
App._s2OpenDeptModal = function() {
  const res = this._tplPreview; if (!res) return;
  // 預載：依本專案任務的範本角色（task.role）抓出既有部門，user 只需填負責人姓名；
  // 已存的部門沿用其成員（不重置），非角色的自建部門也保留。
  const roles = [];
  (res.tasks || []).forEach(t => { const r = (t.role || '').trim(); if (r && roles.indexOf(r) < 0) roles.push(r); });
  const existing = {};
  (res.depts || []).forEach(d => { existing[d.name] = d; });
  const working = roles.map(r => existing[r]
    ? JSON.parse(JSON.stringify(existing[r]))
    : { id: U.id(), name: r, members: [{ id: U.id(), name: '' }] });
  (res.depts || []).forEach(d => { if (roles.indexOf(d.name) < 0) working.push(JSON.parse(JSON.stringify(d))); });
  App._tplDepts = working;
  const body =
    '<div class="form-field">' +
      '<label>部門與負責人（可自由增減）</label>' +
      '<div class="s2n-dept-hint">先建立部門與成員；儲存後系統會依任務角色自動指派負責人，之後可在任務表逐筆微調。</div>' +
      '<div class="dept-edit-list" id="deptEditorList">' + App.buildDeptRowsHtml(App._tplDepts, 'tpl', null) + '</div>' +
      '<button class="dept-add-btn" onclick="App.deptUI.addDept(\'tpl\', \'\')">＋增加部門</button>' +
    '</div>';
  const footer =
    '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
    '<button class="tb-action" onclick="App._s2ApplyDepts()">儲存並套用</button>';
  App.openModal({ title: '部門與負責人', body: body, footer: footer });
};

// 儲存並套用：工作副本 → _tplPreview.depts（清空部門/無成員，鏡像 applyTemplate ③）；
// 依 role 重映射 task.dept（保留 owner/工期/需交付等手改；dept 不影響排程、不重算）→ 整頁重繪。
App._s2ApplyDepts = function() {
  const res = this._tplPreview;
  const edited = JSON.parse(JSON.stringify(App._tplDepts || []));   // 先擷取，closeModal 會清 _tplDepts
  if (!res) { App.closeModal(); return; }
  const depts = [];
  edited.forEach(d => {
    const name = (d.name || '').trim();
    if (!name) return;
    const members = (d.members || []).map(m => ({ id: m.id, name: (m.name || '').trim() })).filter(m => m.name);
    if (!members.length) return;
    depts.push({ id: d.id, name: name, members: members });
  });
  res.depts = depts;
  const roleToDeptId = {};
  const deptById = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; deptById[d.id] = d; });
  // 重映射 task.dept；負責人自動帶入：未指派的任務帶該部門第一位成員（手動 > 系統，已填的不覆蓋）。
  (res.tasks || []).forEach(t => {
    t.dept = roleToDeptId[(t.role || '').trim()] || '';
    if (!t.owner && t.dept) {
      const d = deptById[t.dept];
      if (d && d.members && d.members[0]) t.owner = d.members[0].name;
    }
  });
  App.closeModal();
  this._renderStage2New();
};

// 新 Stage 2 頁殼（Mockup⑤）：標頭＋提示條（新增/編輯部門鈕）＋每案（案頭＋燈號＋左部門面板/右甘特＋任務表）。
// 甘特/燈號/任務表全複用既有 _s2GanttHtml/_s2SlackHtml/_s2ListHtml；data-variant 容器同名，_s2RefreshCase 可刷。
App._renderStage2New = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('⚠ 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const tasks = res.tasks || [];
  if (!this._s2Stage) this._s2Stage = {};
  variants.forEach(v => {
    const g = this._s2GroupByStage(v.id);
    if (g.order.length && g.order.indexOf(this._s2Stage[v.id]) < 0) this._s2Stage[v.id] = g.order[0];
  });
  const fmtD = (s) => s ? String(s).replace(/-/g, '/') : '';
  const caseRange = (vid) => {
    const ts = tasks.filter(t => t.variant === vid);
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    const a = starts[0], b = ends[ends.length - 1];
    return (a || b) ? (fmtD(a) + ' → ' + fmtD(b)) : '（待排程）';
  };
  // 頂部說明：標準收折 HintBox（buildHintBox，字級吃 UI-CSS 規範、收合狀態持久化）
  const topGuide = App.buildHintBox({
    key: 's2-guide', icon: 'ti-info-circle', title: '任務骨架編輯指南',
    summary: '先設部門→自動帶負責人（手動優先）；點甘特切換階段', collapsed: false,
    bodyHtml:
      '<div class="s2n-gd-row"><i class="ti ti-speakerphone"></i><span><b>重要：請先設定「部門與負責人」</b>（下方卡片右上按鈕）。系統會依角色自動指派負責人；若你後續手動修改過，系統以手動為準、不予覆蓋。</span></div>' +
      '<div class="s2n-gd-row"><i class="ti ti-chart-bar"></i><span><b>點選上方甘特圖可切換階段</b>。下方任務表會同步切換成該階段的任務。</span></div>'
  });
  const predHelpHtml = (i) => App.buildHintBox({
    key: 's2-pred-help-' + i, icon: 'ti-link', title: '前置任務設定指南',
    summary: '序號→銜接方式→緩衝；只能綁當前或過去 3 階段，嚴禁綁未來', collapsed: false,
    bodyHtml:
      '<div class="s2n-gd-row"><i class="ti ti-pointer"></i><span><b>操作方式</b>：先選「前置序號」→ 再選「銜接方式」（如：完成後才開始）→ 最後填「緩衝天數」。</span></div>' +
      '<div class="s2n-gd-row s2n-gd-warn"><i class="ti ti-alert-circle"></i><span><b>防呆限制</b>：前置只能綁「當前階段」或「過去最多 3 個階段內」的任務；嚴禁綁未來項目（否則時程會跨度過大失控）。</span></div>' +
      '<div class="s2n-gd-row"><i class="ti ti-bulb"></i><span><b>範例</b>：任務 5 要等任務 3 完成後再多等 2 天 → 序號 3 ＋ 完成後才開始 ＋ 緩衝 2。</span></div>'
  });
  const blocks = variants.map((v, i) => {
    const isMain = i === 0;
    return '' +
      '<div class="s2n-case s2-case ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-variant="' + v.id + '">' +
        '<div class="s2-case-head">' +
          '<span class="stage-cap-pill cap-' + (i % 3) + '">' + (isMain ? '主案' : '子案') + '</span>' +
          '<span class="s2-case-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s2-case-range">' + caseRange(v.id) + '</span>' +
        '</div>' +
        '<div class="s2-slack-wrap" data-variant="' + v.id + '">' + this._s2SlackHtml(v.id) + '</div>' +
        '<div class="s2n-body">' +
          '<div class="s2n-left">' + this._s2DeptPanelHtml(v.id) + '</div>' +
          '<div class="s2-gantt s2n-right" data-variant="' + v.id + '">' + this._s2GanttHtml(v.id) + '</div>' +
        '</div>' +
        '<div class="s2n-banner-wrap" data-variant="' + v.id + '">' + this._s2BannerHtml(v.id) + '</div>' +
        predHelpHtml(i) +
        '<div class="s2-list" data-variant="' + v.id + '">' + this._s2ListHtml(v.id) + '</div>' +
      '</div>';
  }).join('');
  const unbar = (n => n > 0 ? '<div class="s2-unassigned-bar">⚠ 還有 ' + n + ' 個任務未指派負責人</div>' : '')(tasks.filter(t => !t.owner).length);
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage2');
  page.classList.add('active');
  page.innerHTML =
    '<div class="s2n-wrap">' +
      '<div class="s2n-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> 新增專案 <span class="s1-crumb-sep">/</span> 編輯任務</div>' +
        '<div class="s2n-head"><span class="s2-num">2</span>編輯任務骨架</div>' +
      '</div>' +
      topGuide + blocks + unbar +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._s2BackToStage1()">上一步</button>' +
        '<button class="tb-action" data-edit-hide onclick="App._s2CommitNew()">建立專案</button>' +
      '</div>' +
    '</div>';
  if (document.body.classList.contains('viewonly')) {
    document.querySelectorAll('#page-stage2 input, #page-stage2 select, #page-stage2 .s2-del, #page-stage2 .dt-insert-btn').forEach(el => { el.disabled = true; });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// §4.8.7.4b 塊3a-刀1：第一頁入口教育卡（Mockup①，文-A 定稿）。openModal 渲染三情境說明卡（純說明、非選項），→ _renderStage1Preview。
App._scheduleEduCard = function() {
  // 文案瘦身（2026-06-27 定案）：大標題（行為）＋一句核心說明＋小祕訣（淡灰），砍字呼吸；防呆/重算邏輯收進小祕訣。
  const cards = [
    { icon: 'ti-calendar', tag: '填開始日', tagcls: 's1-tag-start', lbl: '--sage-700', title: '已指定開工日',
      desc: '正向順推，算出預計完工日。', secret: '適合已定案開工日、想抓完工時間時。' },
    { icon: 'ti-flag', tag: '填上市日期', tagcls: 's1-tag-end', lbl: '--terracotta-ink', title: '有指定上市日',
      desc: '依目標日期逆向倒推開工日。', secret: '若時間不夠，系統會啟動智慧排程，建議最快完工日。' },
    { icon: 'ti-arrows-left-right', tag: '都填', tagcls: 's1-tag-both', lbl: '--amber-ink', title: '雙端日期皆鎖定',
      desc: '雙向比對排程，精算時間彈性。', secret: '時間不足時，將自動開啟引導面板，協助您無痛化解衝突。' },
  ];
  const cardsHtml = cards.map(c =>
    '<div class="s1-edu-card">' +
      '<div class="s1-edu-coretop">' +
        '<div class="s1-edu-cardhd"><i class="ti ' + c.icon + ' s1-edu-ico"></i>' +
          '<span class="s1-edu-tag ' + c.tagcls + '">' + c.tag + '</span></div>' +
        '<div class="s1-edu-cardtitle">' + c.title + '</div>' +
        '<div class="s1-edu-carddesc">' + c.desc + '</div>' +
      '</div>' +
      '<div class="s1-edu-secret"><span style="color:var(' + c.lbl + ');font-weight:600;">小祕訣：</span>' + c.secret + '</div>' +
    '</div>'
  ).join('');
  App.openModal({
    title: '<i class="ti ti-book-open"></i> 排程模式說明指南',
    body: '<div class="s1-edu">' +
      '<div class="s1-edu-lead">本頁為功能導覽，免點選字卡。下一頁直接填寫日期即可。</div>' +
      '<div class="s1-edu-cards">' + cardsHtml + '</div>' +
      '<div class="s1-edu-bulb"><i class="ti ti-bulb"></i><span>免煩惱！下一頁不論您填哪一格，系統都會自動判斷最佳排程方向。如果手頭都有日期，建議全部填上，算出來的時間最精準。</span></div>' +
    '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App.closeModal();App._renderStage1Preview()">我懂了，開始填寫 →</button>',
  });
};

// §4.8.7.4b 塊3a-刀1：第一階段「大局時間」預覽頁（靜態版面，假資料，照第②張定稿 + 今日文案/UI 調整）。
// 本步仍靜態（只主案一條 + ＋新增子案佔位 + 動態提示靜態情境A）；第三步才接 _reschedulePreview/_computeSlack 真資料 + 動態提示切換。
// console 可直接呼叫 App._scheduleEduCard() / App._renderStage1Preview() 看版面；尚未接 modal flow。
App._renderStage1Preview = function() {
  // demo fallback 假案（首開/無輸入不空白）走 App._s1FallbackCase；甘特＋真燈號膠囊建構移至
  // App._s1PreviewBlocksHtml（初次 render 與 date 改動 re-render 共用單一真實來源，§4.8.7.4b 3-3）。
  // 每案獨立狀態（§4.8.7.4b 3-5）：主案＋各子案各自 stages/renames；首次用範本主案階段（缺則退 demo）
  if (!App._s1Cases) {
    const tplMain = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined' && PRODUCT_DEV_TEMPLATE.cases && PRODUCT_DEV_TEMPLATE.cases[0])
      ? PRODUCT_DEV_TEMPLATE.cases[0].stages.slice() : App._s1FallbackCase().stages.map(s => s.stage);
    App._s1Cases = [{ key: 'main', templateVariant: '主案', stages: tplMain, renames: {} }];
  }
  const casesHtml = App._s1Cases.map((c, i) => App._s1CaseColHtml(c, i === 0)).join('');
  const addCase = '<div class="s1-add-case" onclick="App._s1AddSubcase()"><i class="ti ti-plus"></i><span>新增子案</span></div>';
  // 說明區（文-B；箭頭統一中文冒號「：」，防呆句 terracotta 強調）
  const tips = App.buildHintBox({
    key: 's1-sched-tips', icon: 'ti-info-circle', title: '排程小秘訣', summary: '怎麼填日期決定排程方向', collapsed: false,
    bodyHtml:
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填開始日：自動順推，算出預計完工日。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填上市日期：自動倒推最晚開工日<b class="s1-tips-warn">（若發現來不及，會自動改為建議最快完工日）</b>。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>兩者皆填齊：精算時間是否足夠。<b class="s1-tips-warn">若發生超時衝突（如目前顯示：時程不足），點擊「下一步」後系統將引導您透過智慧排程面板一鍵優化。</b></div>' +
      '<div class="s1-tips-line s1-tips-cap"><i class="ti ti-info-circle"></i>若有多個產品規格（如 7.3kW ／ 2.2kW），點擊主案右側 ＋【新增子案】即可獨立排程。</div>'
  });
  // 甘特三色 HintBox（瘦身：只留甘特顏色說明；大局狀態說明改 hover 燈號顯示。預設收起）
  const helpBody =
    '<div class="slack-help-ambox"><i class="ti ti-alert-triangle"></i><span>須在<span class="slack-help-hl">開始與上市日期皆填齊</span>時，各開發階段才會觸發以下顏色；只填單一日期，甘特圖維持預設單色。</span></div>' +
    '<div class="slack-help-grid">' +
      '<div class="slack-help-cell"><span class="slack-dot sd-green"></span><div><div class="slack-help-ct">綠色 ── 安全</div><div class="slack-help-cd">完工日比該段 Deadline 提前 5 天以上。</div></div></div>' +
      '<div class="slack-help-cell"><span class="slack-dot sd-yellow"></span><div><div class="slack-help-ct">黃色 ── 警告</div><div class="slack-help-cd">完工日離該段 Deadline 僅差 0～4 天。</div></div></div>' +
      '<div class="slack-help-cell"><span class="slack-dot sd-red"></span><div><div class="slack-help-ct">紅色 ── 延誤</div><div class="slack-help-cd">完工日已落在該段 Deadline 之後。</div></div></div>' +
    '</div>';
  const hint = App.buildHintBox({ key: 's1-slack-help', icon: 'ti-info-circle', title: '甘特圖階段顏色說明', summary: '一分鐘看懂各階段排程緊迫度', bodyHtml: helpBody, collapsed: true });
  // 頂部：專案名稱（label+窄 input） + 顏色 + 範本 橫排
  const swatches = (typeof PROJ_COLORS !== 'undefined' ? PROJ_COLORS : []).map((c, i) => '<div class="cp-swatch' + (i === 0 ? ' on' : '') + '" style="background:' + c + '" data-color="' + c + '"></div>').join('');
  const top =
    '<div class="s1-top">' +
      '<div class="s1-top-col"><span class="s1-top-label">專案名稱</span><input type="text" class="s1-proj-name" value="範例專案" placeholder="專案名稱" oninput="App._s1SyncMainName();App._s1RefreshPreview()"></div>' +
      '<div class="s1-top-col"><span class="s1-top-label">辨識顏色</span><div class="color-picker s1-colors">' + swatches + '</div></div>' +
      '<div class="s1-top-col"><span class="s1-top-label">選擇範本</span><select class="s1-tpl-sel"><option>產品開發範本</option></select></div>' +
    '</div>';
  // 預覽區塊（本步只主案一條；甘特＋真燈號膠囊由 _s1PreviewBlocksHtml 建，date 改動時局部重畫此容器）
  const previewBlocks = '<div id="s1-prev-blocks">' + App._s1PreviewBlocksHtml() + '</div>';
  // 隱藏全域 topbar（智慧排程鈕/重複標題不屬此頁）；本頁自帶麵包屑 + 大標題。（flow 接線後離開頁面再恢復）
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.add('topbar-hidden');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage1');
  page.classList.add('active');
  page.innerHTML =
    '<div class="s1-preview">' +
      '<div class="s1-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> 新增專案</div>' +
        '<div class="s1-pagetitle">套用範本創建</div>' +
      '</div>' +
      top +
      tips +
      '<div class="s1-cases">' + casesHtml + addCase + '</div>' +
      '<div class="s1-prev-section">' +
        '<div class="s1-prev-title">階段區間預覽</div>' +
        hint +
        previewBlocks +
      '</div>' +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._flowStep1()">上一步</button>' +
        '<button class="tb-action" onclick="App._flowStage1Next()">下一步：檢視任務</button>' +
      '</div>' +
    '</div>';
  // date input 改動即時重算改用各案卡 inline onchange（支援動態新增的子案卡，§4.8.7.4b 3-5）
  App._s1SyncMainName();     // 初始把專案名帶入主案名（未手改前）
  App._s1RefreshPreview();   // DOM 就緒後校正一次：依實際輸入（初始留空）同步動態提示與甘特空狀態
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// _s1FallbackCase：第一階段預覽 demo 假案的階段清單來源（範本缺時退此），名稱/日期已不再使用。
App._s1FallbackCase = function() {
  return { name: '7.3kW 主案', start: '2026-03-02', end: '2026-12-28', light: 'green', slack: 12, overDays: 0,
    stages: [
      { stage: '設計', start: '2026-03-02', end: '2026-05-15' },
      { stage: '手工機', start: '2026-05-18', end: '2026-07-31' },
      { stage: '性試', start: '2026-08-03', end: '2026-10-09' },
      { stage: '量試', start: '2026-10-12', end: '2026-12-28' },
    ] };
};

// _s1CaseByKey：依 key 取案狀態（§4.8.7.4b 3-5 每案獨立 stages/renames）。
App._s1CaseByKey = function(key) { return (App._s1Cases || []).find(x => x.key === key) || null; };

// _s1CaseColHtml：渲染一張案卡（主案或子案）；名稱/日期/動態提示/階段膠囊各自獨立。
App._s1CaseColHtml = function(c, isMain) {
  const pill = isMain ? '<span class="stage-cap-pill cap-0">主案</span>' : '<span class="stage-cap-pill cap-1">子案</span>';
  const del = isMain ? '' : '<button class="s1-case-del" title="刪除子案" onclick="App._s1DelSubcase(\'' + c.key + '\')"><i class="ti ti-x"></i></button>';
  const nameVal = isMain ? '' : (c.dname || '');
  const ph = isMain ? '主案名稱' : '子案名稱（例：2.2kW）';
  return '<div class="s1-case-col case-card ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-case="' + (isMain ? 'main' : c.key) + '" data-case-key="' + c.key + '" data-tplvariant="' + c.templateVariant + '">' +
      '<div class="s1-case-head">' + pill +
        '<input type="text" class="s1-case-name" value="' + U.esc(nameVal) + '" placeholder="' + ph + '" oninput="App._s1RefreshPreview()">' + del +
      '</div>' +
      '<div class="s1-case-dates">' +
        '<label>開始日<input type="date" class="s1-in-start" value="" onchange="App._s1RefreshPreview()"></label>' +
        '<label>上市日期<input type="date" class="s1-in-end" value="" onchange="App._s1RefreshPreview()"></label>' +
      '</div>' +
      '<div class="s1-dynhint s1-dynhint-init">' + App._s1DynHintHtml('', '', '') + '</div>' +
      '<div class="s1-stage-hd">開發階段</div>' +
      '<div class="s1-stage-note"><i class="ti ti-info-circle"></i>此處直接決定專案流程（由左至右）：點擊膠囊可重新命名和刪除階段，按 ＋ 可增加階段。<br><b class="s1-stage-note-em">調整後系統將自動重排下方甘特圖、並重新精算時間餘裕與燈號。</b></div>' +
      '<div class="s1-stagelist">' + App._s1StageChipsHtml(c) + '</div>' +
    '</div>';
};

// _s1AddSubcase：新增一張子案卡（預設帶範本另案階段＋唯一預設名），append 不重繪其他卡。
App._s1AddSubcase = function() {
  if (!App._s1Cases) return;
  const tplCases = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined' && PRODUCT_DEV_TEMPLATE.cases) ? PRODUCT_DEV_TEMPLATE.cases : [];
  const tplSub = (tplCases[1] ? tplCases[1].stages : (tplCases[0] ? tplCases[0].stages : [])).slice();
  App._s1SubSeq = (App._s1SubSeq || 0) + 1;
  const c = { key: 'c' + App._s1SubSeq, templateVariant: '另案', stages: tplSub, renames: {}, dname: '子案 ' + App._s1SubSeq };
  App._s1Cases.push(c);
  const wrap = document.querySelector('#page-stage1 .s1-cases');
  const addBox = wrap ? wrap.querySelector('.s1-add-case') : null;
  if (wrap && addBox) {
    const tmp = document.createElement('div');
    tmp.innerHTML = App._s1CaseColHtml(c, false);
    if (tmp.firstChild) wrap.insertBefore(tmp.firstChild, addBox);
  }
  App._s1RefreshPreview();
};

// _s1DelSubcase：刪一張子案卡（移除狀態＋DOM），重算預覽。
App._s1DelSubcase = function(key) {
  App._s1Cases = (App._s1Cases || []).filter(x => x.key !== key);
  const col = document.querySelector('#page-stage1 .s1-case-col[data-case-key="' + key + '"]');
  if (col) col.remove();
  App._s1RefreshPreview();
};

// _s1PreviewBlocksHtml：階段區間預覽（甘特＋真燈號膠囊）。初次 render 與 date 改動 re-render 共用單一真實來源。
//   燈號吃 _s1ComputePreview 各案真 slack（interval 雙填才有；單填回 null＝不顯示膠囊）；無真資料退回 demo 案不空白。
App._s1PreviewBlocksHtml = function(real) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const miniGantt = (stages) => {
    const toNum = (d) => d ? Date.parse(d) : NaN;
    const allS = stages.map(s => toNum(s.start)).filter(n => !isNaN(n));
    const allE = stages.map(s => toNum(s.end)).filter(n => !isNaN(n));
    const minN = allS.length ? Math.min.apply(null, allS) : 0;
    const maxN = allE.length ? Math.max.apply(null, allE) : 0;
    const span = (maxN - minN) || 1;
    const shortD = (x) => { const p = String(x).split('-'); return (p[1] || '') + '/' + (p[2] || ''); };
    let rows = '';
    stages.forEach(r => {
      const a = toNum(r.start), b = toNum(r.end);
      const left = ((a - minN) / span) * 100;
      const width = Math.max(((b - a) / span) * 100, 1.5);
      rows +=
        '<div class="s2-grow">' +
          '<div class="s2-gname">' + U.esc(r.label || r.stage) + '</div>' +
          '<div class="s2-gbar-track"><div class="s2-gbar' + (r.light ? ' s2-gbar-' + r.light : '') + '" style="left:' + left + '%;width:' + width + '%"></div></div>' +
          '<div class="s2-gdate">' + shortD(r.start) + ' → ' + shortD(r.end) + '</div>' +
        '</div>';
    });
    return '<div class="s2-gantt-axis">' + rows + '</div>';
  };
  const lightTxt = (light, slack, overDays) => light === 'green' ? ('時程充足·餘裕 ' + slack + ' 天')
    : light === 'yellow' ? ('時程偏緊·餘裕 ' + slack + ' 天')
    : ('時程不足·超出 ' + overDays + ' 工作天');
  if (real === undefined) real = App._s1ComputePreview();
  if (!real || !real.length) return '';
  const PILL_IC = { green: 'ti-circle-check', yellow: 'ti-alert-circle', red: 'ti-alert-triangle' };
  const PILL_LB = { green: '時程充足', yellow: '時程偏緊', red: '時程不足' };
  const PILL_TIP = {
    green: '時程非常安全！整體進度皆在上市截止日控制範圍內。',
    yellow: '勉強能如期完成，但毫無緩衝。時程扣得很死，後續階段將非常緊湊。',
    red: '依照現有範本工期排下去將會超過上市截止日，建議重新調整人力或壓縮工期。'
  };
  // 逐案一張預覽卡（§4.8.7.4b 3-5）：有日期→真甘特＋燈號；無日期→骨架（用該案階段膠囊）＋引導
  const blockOf = (v, isMain) => {
    const cls = isMain ? 's2-case-main' : 's2-case-other';
    if (!v.stages || !v.stages.length) {
      const skel = (v.skelStages || []).map(lb =>
        '<div class="s2-grow"><div class="s2-gname">' + U.esc(lb) + '</div><div class="s2-gbar-track"><div class="s2-gbar s2-gbar-none"></div></div><div class="s2-gdate"></div></div>'
      ).join('');
      return '<div class="s1-prev-case case-card ' + cls + ' s1-prev-empty">' +
          '<div class="s1-prev-head"><span class="s1-prev-name">' + U.esc(v.name || '') + '</span></div>' +
          '<div class="s2-gantt-axis">' + skel + '</div>' +
          '<div class="s1-prev-empty-hint">請於上方輸入日期以產生進度預覽</div>' +
        '</div>';
    }
    const pill = v.light
      ? '<span class="s1-pill-wrap">' +
          '<span class="slack-pill slack-pill-' + v.light + '"><i class="ti ' + PILL_IC[v.light] + '"></i>' + lightTxt(v.light, v.slack, v.overDays) + '</span>' +
          '<span class="s1-pill-tip"><span class="s1-pill-tip-hd s1-tiphd-' + v.light + '"><i class="ti ' + PILL_IC[v.light] + '"></i>' + PILL_LB[v.light] + '</span>' + PILL_TIP[v.light] + '</span>' +
        '</span>'
      : '';
    return '<div class="s1-prev-case case-card ' + cls + '">' +
        '<div class="s1-prev-head">' +
          '<span class="s1-prev-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s1-prev-range">' + fmtD(v.start) + ' → ' + fmtD(v.end) + '</span>' +
          pill +
        '</div>' +
        miniGantt(v.stages) +
      '</div>';
  };
  return real.map((v, i) => blockOf(v, i === 0)).join('');
};

// _s1DynHintHtml：動態狀態提示（文-C）依填法切情境——雙空=初始引導(CTA)／只開始=A順推／只上市=B倒推
//   ／只上市但來不及=C防呆(改今天順推、報最快完工日)／兩者皆填=D雙向精算。meta=_s1ComputePreview 該案資訊。
App._s1DynHintHtml = function(startDate, endDate, meta) {
  // 雙空＝初始引導：尚無基準日，給行動導引，不顯示「排程中」假象
  if (!startDate && !endDate) {
    return '<i class="ti ti-calendar-event"></i><span>請輸入或選擇日期：填入「開始日」或「上市日期」，系統將自動為您啟動智慧時程推算。</span>';
  }
  const fmt = (x) => x ? String(x).replace(/-/g, '/') : '';
  const eff = App._effScheduleDir(startDate, endDate, 'forward');
  let ic = 'ti-arrow-narrow-right', txt;
  if (eff === 'interval') {
    txt = '雙向精算中：已幫您比對開工與上市日期，中間的彈性天數已呈現在下方的「餘裕燈號」中。';
  } else if (eff === 'backward' && meta && meta.backFallback) {
    // 情境C：倒推最晚開工日已過 → 改今天順推、報最快完工日
    ic = 'ti-alert-triangle';
    const d = fmt(meta.forwardFinish);
    txt = '時空警報！上市日期太緊，最晚開工日已過。系統已自動改以「今天」開工順推' + (d ? ('，最快完工日為 ' + d + '。') : '。');
  } else if (eff === 'backward') {
    const d = meta ? fmt(meta.backStart) : '';
    txt = d ? ('逆向倒推中：已為您推算出最晚必須在 ' + d + ' 前開工，才趕得上上市。')
            : '逆向倒推中：系統正從您的上市日期往前推算最晚開工日。';
  } else {
    txt = '正向排程中：系統正從您的開工日往後順推，自動算出最後的預計完工日。';
  }
  return '<i class="ti ' + ic + '"></i><span>' + txt + '</span>';
};

// _s1RefreshPreview：date/階段膠囊改動時即時重算，局部重畫預覽容器＋同步更新動態提示（不動輸入卡、保留焦點）。
App._s1RefreshPreview = function() {
  const real = App._s1ComputePreview();
  const c = document.getElementById('s1-prev-blocks');
  if (c) c.innerHTML = App._s1PreviewBlocksHtml(real);
  // 各案動態提示：逐 col 依自己日期＋該案 meta 切情境（文-C；§4.8.7.4b #1＋3-5）
  const cols = document.querySelectorAll('#page-stage1 .s1-case-col');
  cols.forEach((col, i) => {
    const hintBox = col.querySelector('.s1-dynhint');
    if (!hintBox) return;
    const s = ((col.querySelector('.s1-in-start')) || {}).value || '';
    const e = ((col.querySelector('.s1-in-end')) || {}).value || '';
    const meta = (real && real[i]) ? real[i] : null;
    hintBox.innerHTML = App._s1DynHintHtml(s, e, meta);
    hintBox.classList.toggle('s1-dynhint-init', !s && !e);   // 雙空＝淡化引導態
    hintBox.classList.toggle('s1-dynhint-alert', !!(meta && meta.backFallback));   // 情境C 來不及＝紅底警示
  });
};

// _s1SyncMainName：頂部專案名帶入主案名——專案名每次修改都覆蓋主案名；改主案名不回寫專案名（單向）。
//   （此關聯只在「專案↔各案」之間；主案與子案名彼此不連動，留待 3-5 子案。）
App._s1SyncMainName = function() {
  const page = document.getElementById('page-stage1');
  if (!page) return;
  const proj = page.querySelector('.s1-proj-name');
  const main = page.querySelector('.s1-case-col[data-case="main"] .s1-case-name');
  if (!proj || !main) return;
  main.value = proj.value;
};

App._s1CollectInput = function() {
  const page = document.getElementById('page-stage1');
  if (!page) return null;
  const projectName = (page.querySelector('.s1-proj-name') || {}).value || '';
  const colorEl = page.querySelector('.s1-colors .cp-swatch.on');
  const color = colorEl ? colorEl.dataset.color : (PROJ_COLORS[0] || '');
  const cases = [];
  page.querySelectorAll('.s1-case-col').forEach(col => {
    const key = col.dataset.caseKey;
    const cs = App._s1CaseByKey(key);
    const rawName = ((col.querySelector('.s1-case-name') || {}).value || '').trim();
    const variantName = rawName || ('案-' + (key || ''));   // 空名退回唯一 key（防 applyTemplate variantNameToId 撞 id）
    const templateVariant = col.dataset.tplvariant || '主案';
    const startDate = (col.querySelector('.s1-in-start') || {}).value || '';
    const endDate = (col.querySelector('.s1-in-end') || {}).value || '';
    const direction = App._effScheduleDir(startDate, endDate, 'forward');
    const selectedStages = cs ? cs.stages.slice() : [];
    cases.push({ variantName, templateVariant, startDate, endDate, direction, selectedStages, renames: cs ? cs.renames : {} });
  });
  return { projectName, color, cases };
};

// _s1ColorStagesForward：interval 各段上色（§4.8.7.4b #2）。從開始日順推取各段自然完工日，
//   比對上市日期算 margin（>5 綠／0~4 黃／<0 紅，同燈號門檻），並把 stage 起訖改成順推值（讓超出上市日視覺可見）。
//   用 clone 跑正向 computeSchedule，不動 res.tasks（pill 仍吃 backward 結果，互不影響）。
App._s1ColorStagesForward = function(res, v, stages, startDate, endDate) {
  if (!startDate || !endDate) return;
  const fwd = res.tasks.filter(t => t.variant === v.id).map(t => Object.assign({}, t));
  fwd.forEach(t => { if (!t.predecessor) t.plannedStart = startDate; });
  const fsch = computeSchedule(fwd);
  const fm = new Map(); fsch.results.forEach(r => fm.set(r.taskId, r));
  const fStage = {};
  fwd.forEach(t => {
    const r = fm.get(t.id);
    if (!r || !r.suggestedStart) return;
    const stage = (t.desc || '').split(' / ')[0] || '其他';
    if (!fStage[stage]) fStage[stage] = { start: r.suggestedStart, end: r.suggestedEnd };
    else {
      if (r.suggestedStart < fStage[stage].start) fStage[stage].start = r.suggestedStart;
      if (r.suggestedEnd > fStage[stage].end) fStage[stage].end = r.suggestedEnd;
    }
  });
  stages.forEach(s => { const f = fStage[s.stage]; if (f) { s.start = f.start; s.end = f.end; } });   // 改順推落點（超出上市日視覺可見）
  App._chainStages(stages);   // 階段順序鏈（跳階段→下游不浮到前面）
  stages.forEach(s => {
    const margin = (s.end <= endDate)
      ? D.workdaysBetween(s.end, endDate) - 1
      : -(D.workdaysBetween(endDate, s.end) - 1);
    s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
  });
};

// 階段順序鏈（共用）：依顯示順序，某段起點若早於前段結束（跳階段→前置被剝離浮到前面），
// 改「接在前段之後」（保留原工期跨度）。idempotent：已是順序排列則不動。Stage 1／2 各模式甘特共用。
App._chainStages = function(stages) {
  let prevEnd = '';
  (stages || []).forEach(s => {
    if (!s || !s.start || !s.end) return;
    if (prevEnd && s.start < prevEnd) {
      const span = Math.max(D.workdaysBetween(s.start, s.end) - 1, 0);
      s.start = D.fmt(D.addWorkdays(prevEnd, 1), 'iso');
      s.end = D.fmt(D.addWorkdays(s.start, span), 'iso');
    }
    prevEnd = s.end;
  });
};

// 階段反向順序鏈（backward 專用）：依顯示順序，把末段對齊 deadline、其餘各段依序往前接（保留各段工期跨度）。
// 修 backward 跳階段時各段 lateFinish 全錨在 deadline → 甘特塌成一團、順序錯亂（坑6 的 backward 版）。
// idempotent：已正確序列（末段貼齊 deadline）則近似不變。回算後首段起點＝真正的最晚開工日。
App._chainStagesBackward = function(stages, deadline) {
  let nextStart = '';
  for (let i = (stages || []).length - 1; i >= 0; i--) {
    const s = stages[i];
    if (!s || !s.start || !s.end) continue;
    const span = Math.max(D.workdaysBetween(s.start, s.end) - 1, 0);
    s.end = nextStart ? D.fmt(D.addWorkdays(nextStart, -1), 'iso') : deadline;
    s.start = D.fmt(D.addWorkdays(s.end, -span), 'iso');
    nextStart = s.start;
  }
};

App._s1ComputePreview = function() {
  const tpl = (typeof PRODUCT_DEV_TEMPLATE !== 'undefined') ? PRODUCT_DEV_TEMPLATE : null;
  if (!tpl) return null;
  const input = App._s1CollectInput();
  if (!input || !input.cases.length) return null;
  const res = App.applyTemplate(tpl, input);
  const byVariant = [];
  res.variants.forEach((v, i) => {
    const vtasks = res.tasks.filter(t => t.variant === v.id && t.plannedStart && t.plannedEnd);
    const stageMap = {};
    vtasks.forEach(t => {
      const stage = (t.desc || '').split(' / ')[0] || '其他';
      if (!stageMap[stage]) stageMap[stage] = { stage, start: t.plannedStart, end: t.plannedEnd };
      else {
        if (t.plannedStart < stageMap[stage].start) stageMap[stage].start = t.plannedStart;
        if (t.plannedEnd > stageMap[stage].end) stageMap[stage].end = t.plannedEnd;
      }
    });
    const stages = (v.stages || []).map(s => stageMap[s]).filter(Boolean);
    const _rn = (input.cases[i] && input.cases[i].renames) || {};   // 該案改名表（§4.8.7.4b 3-5 每案獨立）
    stages.forEach(s => { s.label = (_rn[s.stage] != null) ? _rn[s.stage] : s.stage; });   // 顯示名（改名只動顯示，id=s.stage 不變）
    const skelStages = ((input.cases[i] && input.cases[i].selectedStages) || []).map(id => (_rn[id] != null) ? _rn[id] : id);   // 空狀態骨架列（顯示名）
    // 真燈號（§4.8.7.4b 3-3）：interval 案 plannedStart/End＝lateStart/lateFinish（_reschedulePreview :2543 映射），
    // 餵既有 _computeSlack 重算（單一真實來源、不重跑排程）；start/end 缺一→回 null→不顯示膠囊。
    const vsch = v.schedule || {};
    const pseudoResults = vtasks.map(t => ({ lateStart: t.plannedStart, lateFinish: t.plannedEnd }));
    const sl = App._computeSlack(pseudoResults, vsch.startDate, vsch.endDate);
    // per-stage 上色＋方向情境（§4.8.7.4b #2＋情境C 防呆）
    const eff = App._effScheduleDir(vsch.startDate, vsch.endDate, vsch.direction);
    let backStart = '', backFallback = false, forwardFinish = '';
    if (eff === 'interval') {
      // interval：順推各段、比對上市日期算 margin → 綠/黃/紅，並改 stage 起訖為順推值
      App._s1ColorStagesForward(res, v, stages, vsch.startDate, vsch.endDate);
    } else if (eff === 'backward' && vsch.endDate) {
      // 先反向串接：末段對齊上市日、各段依序往前（修跳階段塌 deadline／順序錯亂）。回算後首段起點＝真最晚開工日。
      App._chainStagesBackward(stages, vsch.endDate);
      const todayIso = D.fmt(D.today(), 'iso');
      backStart = stages.length ? (stages[0].start || '') : '';
      if (backStart && backStart < todayIso) {
        // 情境C 防呆：真最晚開工日早於今天＝來不及 → 改以今天順推上色（顯示紅/不足）＋報最快完工日
        App._s1ColorStagesForward(res, v, stages, todayIso, vsch.endDate);
        backStart = stages.length ? (stages[0].start || backStart) : backStart;
        backFallback = true;
        forwardFinish = stages.reduce((m, s) => (s.end > m) ? s.end : m, '');
      } else {
        // 來得及：各段依序貼齊上市日，比對 deadline 上色（餘裕 ≥5 綠／0~4 黃／<0 紅）
        stages.forEach(s => {
          if (!s.end) return;
          const margin = (s.end <= vsch.endDate) ? D.workdaysBetween(s.end, vsch.endDate) - 1 : -(D.workdaysBetween(vsch.endDate, s.end) - 1);
          s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
        });
      }
    } else {
      App._chainStages(stages);   // forward（只填開始日）／倒推來得及：套順序鏈，跳階段時下游不浮到前面
    }
    const allS = stages.map(s => s.start).filter(Boolean);
    const allE = stages.map(s => s.end).filter(Boolean);
    const caseEnd = allE.length ? allE.reduce((a,b)=>a>b?a:b) : '';
    // 整體燈號/餘裕：interval/backward 一律用「串接後各段最末落點 vs 上市日」算（與甘特同源），
    // 修「膠囊綠但甘特紅」矛盾——跳階段時 backward 把各段塌到 deadline 使 _computeSlack 低估 needed、誤判餘裕為正。
    let light = sl ? sl.light : '', slack = sl ? sl.slack : null, overDays = sl ? sl.overDays : null;
    if (caseEnd && vsch.endDate && (eff === 'interval' || eff === 'backward')) {
      const m = (caseEnd <= vsch.endDate) ? D.workdaysBetween(caseEnd, vsch.endDate) - 1 : -(D.workdaysBetween(vsch.endDate, caseEnd) - 1);
      light = m >= 5 ? 'green' : (m >= 0 ? 'yellow' : 'red');
      slack = m;
      overDays = m < 0 ? Math.abs(m) : 0;
    }
    byVariant.push({
      id: v.id, name: v.name,
      start: allS.length ? allS.reduce((a,b)=>a<b?a:b) : '',
      end: caseEnd,
      stages: stages,
      light: light,
      slack: slack,
      overDays: overDays,
      dir: eff, backStart: backStart, backFallback: backFallback, forwardFinish: forwardFinish,
      skelStages: skelStages,
    });
  });
  return byVariant;
};

// §4.8.7.4b 塊3a-刀1 第二步追加1 + 3-5：開發階段膠囊 inline 編輯（事件委派，每案獨立）。
// 每案 _s1CaseByKey(key).stages 存「階段 id（範本階段碼，供排程比對）」；.renames{id:顯示名} 存改名
// （只動顯示、不動 id → applyTemplate 仍對到任務、不被砍）。膠囊事件靠 .s1-case-col[data-case-key] 找所屬案。
App._s1StageChipsHtml = function(c) {
  const arr = (c && c.stages) || [];
  const rn = (c && c.renames) || {};
  return arr.map((id, i) => {
    const label = (rn[id] != null) ? rn[id] : id;
    return '<span class="s1-stage-chip" data-idx="' + i + '"><span class="chip-text">' + U.esc(label) + '</span><span class="chip-del" title="刪除">×</span></span>';
  }).join('<i class="ti ti-chevron-right s1-stage-arrow"></i>') + '<span class="s1-stage-add" title="新增階段"><i class="ti ti-plus"></i></span>';
};
App._renderStageChips = function(key) {
  const col = document.querySelector('#page-stage1 .s1-case-col[data-case-key="' + key + '"]');
  const c = App._s1CaseByKey(key);
  if (col && c) { const box = col.querySelector('.s1-stagelist'); if (box) box.innerHTML = App._s1StageChipsHtml(c); }
};
App._stageChipToInput = function(textEl) {
  if (!textEl) return;
  const chip = textEl.closest('.s1-stage-chip'); if (!chip) return;
  const col = chip.closest('.s1-case-col'); if (!col) return;
  const key = col.dataset.caseKey;
  const c = App._s1CaseByKey(key); if (!c) return;
  const idx = +chip.getAttribute('data-idx');
  const id0 = c.stages[idx];
  const cur = (c.renames[id0] != null) ? c.renames[id0] : (id0 != null ? id0 : '');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'chip-edit'; inp.value = cur;
  chip.classList.add('editing');
  textEl.style.display = 'none';
  const delEl = chip.querySelector('.chip-del'); if (delEl) delEl.style.display = 'none';
  chip.insertBefore(inp, textEl);
  inp.focus(); inp.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const v = inp.value.trim();
    const id = c.stages[idx];
    if (v === '') {                          // 清空＝刪該段（連帶清 rename）
      c.stages.splice(idx, 1);
      if (id) delete c.renames[id];
    } else if (!id) {                        // 新增空膠囊命名：id 即輸入值（對到範本階段碼才有任務）
      c.stages[idx] = v;
    } else if (v !== id) {                   // 既有階段改名：只動顯示名、保留 id（任務不掉）
      c.renames[id] = v;
    } else {                                 // 改回原名：清掉 rename
      delete c.renames[id];
    }
    App._renderStageChips(key);
    App._s1RefreshPreview();   // 膠囊改名/增刪 → 即時重算甘特＋燈號（§4.8.7.4b 2b）
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
    else if (ev.key === 'Escape') { inp.value = cur; inp.blur(); }
  });
};
App._bindStageChipEvents = function() {
  if (App._stageChipDelegated) return;   // 只綁一次（仿 §6.5 _taskTimeDelegated）
  App._stageChipDelegated = true;
  document.addEventListener('click', (e) => {
    const page = document.getElementById('page-stage1');
    if (!page || !page.classList.contains('active')) return;   // 僅第一階段頁作用
    const del = e.target.closest('.chip-del');
    if (del) {
      const chip = del.closest('.s1-stage-chip'); const col = chip && chip.closest('.s1-case-col');
      const c = col && App._s1CaseByKey(col.dataset.caseKey);
      if (chip && c) { const di = +chip.getAttribute('data-idx'); const id0 = c.stages[di]; c.stages.splice(di, 1); if (id0) delete c.renames[id0]; App._renderStageChips(col.dataset.caseKey); App._s1RefreshPreview(); }
      return;
    }
    const add = e.target.closest('.s1-stage-add');
    if (add) {
      const col = add.closest('.s1-case-col'); const c = col && App._s1CaseByKey(col.dataset.caseKey);
      if (c) {
        c.stages.push('');
        App._renderStageChips(col.dataset.caseKey);
        const chips = col.querySelectorAll('.s1-stage-chip');
        const last = chips[chips.length - 1];
        if (last) App._stageChipToInput(last.querySelector('.chip-text'));
      }
      return;
    }
    const txt = e.target.closest('.chip-text');
    if (txt) { App._stageChipToInput(txt); return; }
  });
};
App._bindStageChipEvents();

// 第③段上一步（路線B）：退回第②段並用 _createFlow.stage1Data 回填（部門先還原；_flowStep2 因 stage1Data 有值不重設 _tplDepts）。
App._flowStage3Back = function() {
  if (App._createFlow && App._createFlow.mode === 'excel') {
    this.showPage('workspace');
    App._flowStep2();
    const parsed = App._createFlow.excelParsed;
    const st = document.getElementById('pf-excelStatus');
    if (st && parsed && parsed.ok) {
      st.textContent = '✓ 已讀取「' + (parsed.projectName || '未命名') + '」共 ' + parsed.rows.length + ' 筆任務，按下一步檢視';
    }
    return;
  }
  const snap = App._createFlow ? App._createFlow.stage1Data : null;
  // 先把第③段 page 切掉、回到個人工作台（與舊退場一致），再開②
  this.showPage('workspace');
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
  // 掛回 project（同 performWbsImport），否則 task 的 dept/variant id 解析不到（步驟1 從 saveProject 挪來此落地步）
  res.project.depts = res.depts;
  res.project.variants = res.variants;
  const dup = DATA.projects.filter(p => p.name === res.project.name);
  const unassigned = res.tasks.filter(t => !t.owner).length;
  const _commit = () => {
    res.project.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
    res.project.importedAt = D.fmt(new Date(), 'iso');
    DATA.projects.push(res.project);
    res.tasks.forEach(t => DATA.tasks.push(t));
    App.currentProjectId = res.project.id;
    Storage.save();
    App._tplPreview = null;
    App._createFlow = null;
    App.refreshAll();
    if (res.warnings.length) {
      console.warn('套範本提醒:', res.warnings);
      App._showTplWarnings(res.warnings);
      U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆（' + res.warnings.length + ' 項提醒見上方）', 'warning');
    } else {
      U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆任務', 'success');
    }
    App.showPage('project', null);
  };
  const _checkDup = () => {
    if (dup.length) {
      App.confirmModal({ icon: 'ti-copy', iconBg: '--amber-l', iconColor: '--amber-ink',
        title: `已有 ${dup.length} 個同名專案「${res.project.name}」`, msg: '要建立新版本嗎？兩者並存，可在側邊欄辨識版號。', okText: '建立新版本', cancelText: '返回修改', onConfirm: _commit });
    } else { _commit(); }
  };
  if (unassigned > 0) {
    App.confirmModal({ icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
      title: `還有 ${unassigned} 個任務未指派負責人`, msg: '確定建立？', okText: '確定建立', cancelText: '取消', onConfirm: _checkDup });
  } else { _checkDup(); }
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
  const mmdd = (x) => { const p = String(x || '').split('-'); return p.length >= 3 ? (p[1] + '/' + p[2]) : ''; };   // 只顯示月/日（不顯示年）
  // 序＝案內跨階段累計（前面各階段任務數加總），切階段不重編號
  let seqBase = 0;
  for (let i = 0; i < selIdx; i++) seqBase += (g.byStage[g.order[i]] || []).length;
  const allDeliver = group.length > 0 && group.every(t => t.mustDeliver);
  let rows = '';   // §N3-A：刪除「階段名＋全選」分隔列，純列 Task（當前階段由甘特＋Banner 已標示）；全選移到表頭「需交付」欄
  const gains = App._effectiveGains(variantId);   // §A 有效縮短瓶頸（模擬法）：gain>0＝改其工期能真正縮短總工期
  group.forEach((t, gi) => {
    const seq = seqBase + gi + 1;
    const isCrit = (gains.get(t.id) || 0) > 0;   // §A 改其工期能有效縮短總天數（取代長工時門檻近似）
    rows +=
      '<tr data-taskid="' + t.id + '" class="' + (seq % 2 === 0 ? 's2-rz ' : '') + (isCrit ? 's2-crit' : '') + '">' +
        '<td class="col-num">' + seq + '</td>' +
        '<td class="col-flex s2-namecell" title="' + U.esc(t.name) + '"><div class="s2-nameflex"><input class="s2-name-inp" value="' + U.esc(t.name) + '" onchange="App._s2SetName(\'' + t.id + '\', this.value)">' + (isCrit ? '<span class="s2-crit-tag">關鍵路徑</span>' : '') + '</div></td>' +
        '<td class="col-mid s2-deptcell" title="此任務所屬部門（在「新增/編輯部門」設定負責人）">' + (U.esc(t.role) || '<span class="s2-dept-none">—</span>') + '</td>' +
        '<td class="col-mid s2-ownercell"><select class="s2-owner-sel' + (t.owner ? '' : ' s2-owner-unassigned') + '" onchange="App._s2SetOwner(\'' + t.id + '\', this.value)">' + this._s2OwnerOptions(t) + '</select></td>' +
        this._s2PredCells(t, variantId) +
        '<td class="col-mid s2-dur"><input class="s2-dur-inp" type="number" min="0" value="' + (t.durationDays != null ? t.durationDays : '') + '" onchange="App._s2SetDuration(\'' + t.id + '\', this.value)"></td>' +
        '<td class="col-mid s2-date" title="' + (t.plannedStart ? (fmtD(t.plannedStart) + ' → ' + fmtD(t.plannedEnd)) : '') + '">' + (t.plannedStart ? (mmdd(t.plannedStart) + ' → ' + mmdd(t.plannedEnd)) : '（待排）') + '</td>' +
        '<td class="col-mid s2-deliver"><input type="checkbox"' + (t.mustDeliver ? ' checked' : '') + ' onchange="App._s2SetDeliver(\'' + t.id + '\', this.checked)"></td>' +
        '<td class="col-action s2-del-cell"><button class="s2-del" title="刪除此列" onclick="App._s2DelRow(\'' + t.id + '\')">✕</button></td>' +
      '</tr>' +
      '<tr class="dt-insert-row"><td colspan="11" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="App._s2InsertRow(\'' + t.id + '\', \'' + variantId + '\')">＋</button></div></td></tr>';
  });
  return '<table class="data-table s2-tbl"><thead>' +
    '<tr>' +
      '<th class="col-num" rowspan="2">序</th>' +
      '<th class="col-flex" rowspan="2">任務名</th>' +
      '<th class="col-mid" rowspan="2">部門</th>' +
      '<th class="col-mid" rowspan="2">負責人</th>' +
      '<th class="col-pred-group" colspan="3">前置任務</th>' +
      '<th class="col-mid s2-dur-th" rowspan="2">工期</th>' +
      '<th class="col-mid" rowspan="2">日期（起訖）</th>' +
      '<th class="col-mid s2-deliver-th" rowspan="2">需交付<label class="s2-all-th"><input type="checkbox"' + (allDeliver ? ' checked' : '') + ' onchange="App._s2DeliverAll(\'' + variantId + '\', ' + selIdx + ', this.checked)"> 全選</label></th>' +
      '<th class="col-action" rowspan="2"></th>' +
    '</tr>' +
    '<tr>' +
      '<th class="col-pred-sub">序號</th>' +
      '<th class="col-pred-sub">銜接方式</th>' +
      '<th class="col-pred-sub">緩衝</th>' +
    '</tr>' +
    '</thead><tbody>' + rows + '</tbody></table>';
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
    predecessor: '', durationDays: 1, owner: '', dept: '', role: '', variant: variantId,
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
// Gantt 階段軸：每階段一列(色點+名+橫條+日期)，橫條 left/width 相對該案總區間；選中階段加 .on 高亮。
// 階段燈號＋落點：完全共用 Stage 1 的 _s1ColorStagesForward（interval/情境C 用「順推落點 vs 上市日期」算 margin
// 上色，超出上市日的段顯紅且橫條延伸可見；純順推/倒推來得及則維持原落點、不上色＝綠）。確保 Stage 1↔2 同案同色同落點。
// §4.8.7.10：Stage 2 各階段時程狀態（單一真實來源，甘特標籤＋當前階段橫條共用）。
// 上色（interval/backward 同 Stage1 邏輯）＋算每階段 lack＝該段落點超出上市日的工作天（>0＝紅、尚缺 N）。
App._s2StageStatuses = function(variantId) {
  const res = this._tplPreview;
  const data = this._s2StageRanges(variantId);
  const order = data.order, ranges = data.ranges;
  const v = res ? (res.variants || []).find(x => x.id === variantId) : null;
  let ed = '';
  if (res && v) {
    const vsch = v.schedule || {};
    ed = vsch.endDate || '';
    const eff = App._effScheduleDir(vsch.startDate, vsch.endDate, vsch.direction);
    if (eff === 'interval') {
      App._s1ColorStagesForward(res, v, ranges, vsch.startDate, vsch.endDate);
    } else if (eff === 'backward' && ed) {
      // 比照 Stage 1 _s1ComputePreview backward 分支：先反向串接（末段貼齊上市日、各段依序往前），算出真最晚開工日 backStart；
      // backStart < today＝來不及 → 以今天順推上色（_s1ColorStagesForward 內含 margin 上色，超出上市日顯紅）；
      // 來得及 → 各段比對上市日算 margin 上色（≥5 綠／0~4 黃／<0 紅）。修「甘特條全綠但 lack 標籤紅」的不同源矛盾。
      App._chainStagesBackward(ranges, ed);
      const todayIso = D.fmt(D.today(), 'iso');
      const backStart = ranges.length ? (ranges[0].start || '') : '';
      if (backStart && backStart < todayIso) {
        App._s1ColorStagesForward(res, v, ranges, todayIso, ed);
      } else {
        ranges.forEach(s => {
          if (!s.end) return;
          const margin = (s.end <= ed) ? D.workdaysBetween(s.end, ed) - 1 : -(D.workdaysBetween(ed, s.end) - 1);
          s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
        });
      }
    } else {
      App._chainStages(ranges);
    }
  }
  ranges.forEach(r => { r.lack = (ed && r.end && r.end > ed) ? Math.max(0, D.workdaysBetween(ed, r.end) - 1) : 0; });
  return { order: order, ranges: ranges, endDate: ed };
};
// 點甘特⚠️標籤：選中該階段（表格換成該階段任務）＋平滑捲到任務表。
App._s2GotoStage = function(variantId, si) {
  App._s2SelectStage(variantId, si);
  const list = document.querySelector('.s2-list[data-variant="' + variantId + '"]');
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
App._s2GanttHtml = function(variantId) {
  const data = App._s2StageStatuses(variantId);
  const order = data.order, ranges = data.ranges, ed = data.endDate;
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
    const light = r.light || 'green';
    let bar;
    if (isNaN(a) || isNaN(b)) {
      bar = '<div class="s2-gbar-track"><div class="s2-gbar s2-gbar-none"></div></div>';
    } else {
      const left = ((a - minN) / span) * 100;
      const width = Math.max(((b - a) / span) * 100, 1.5);
      bar = '<div class="s2-gbar-track"><div class="s2-gbar s2-gbar-' + light + '" style="left:' + left + '%;width:' + width + '%"></div></div>';
    }
    // 顯示短日期：同年 MM/DD、跨年 YY/MM/DD；title hover 看完整 YYYY/MM/DD
    const shortD = (x) => { if (!x) return ''; const p = String(x).split('-'); return (p[1] || '') + '/' + (p[2] || ''); };
    const sameYr = r.start && r.end && r.start.slice(0, 4) === r.end.slice(0, 4);
    const oneD = (x) => x ? (sameYr ? shortD(x) : (String(x).slice(2, 4) + '/' + shortD(x))) : '';
    const dateLbl = (r.start || r.end) ? (oneD(r.start) + ' → ' + oneD(r.end)) : '待排';
    const dateFull = (r.start || r.end) ? (fmtD(r.start) + ' → ' + fmtD(r.end)) : '待排';
    const dot = (isNaN(a) || isNaN(b)) ? '<span class="s2-gdot"></span>' : '<span class="s2-gdot s2-gdot-' + light + '"></span>';
    // §4.8.7.10 嵌入 dashboard：階段尾端狀態標籤（紅＝尚缺 N 天、可點捲到該階段；綠＝正常）。只填單一日期(無上市日)→不顯示。
    const stat = !ed ? '' : (r.lack > 0
      ? '<span class="s2-gstat bad" onclick="event.stopPropagation();App._s2GotoStage(\'' + variantId + '\', ' + si + ')"><i class="ti ti-alert-triangle"></i> 尚缺 ' + r.lack + ' 天</span>'
      : '<span class="s2-gstat ok"><i class="ti ti-circle-check"></i> 正常</span>');
    rows +=
      '<div class="s2-grow' + (isSel ? ' on' : '') + '" onclick="App._s2SelectStage(\'' + variantId + '\', ' + si + ')">' +
        dot +
        '<div class="s2-gname">' + U.esc(r.stage) + '</div>' +
        bar +
        '<div class="s2-gdate" title="' + dateFull + '">' + dateLbl + '</div>' +
        stat +
      '</div>';
  });
  return '<div class="s2-gantt-axis">' + rows + '</div>';
};
// 階段 Banner（Mockup）：當前階段名＋該段日期區間（Deadline）。固定專案綠（不隨階段換色），切階段更新文字。
App._s2BannerHtml = function(variantId) {
  const data = App._s2StageStatuses(variantId);
  if (!data.order.length) return '';
  const sel = (this._s2Stage && this._s2Stage[variantId]) || data.order[0];
  const r = data.ranges.find(x => x.stage === sel) || {};
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const dl = (r.start || r.end) ? (fmtD(r.start) + ' → ' + fmtD(r.end)) : '（待排）';
  const status = (data.endDate && r.lack > 0)
    ? '<span class="s2n-bn-bad">（⚠ 排程尚缺 ' + r.lack + ' 個工作天，請縮減下方關鍵路徑工期）</span>'
    : (data.endDate ? '<span class="s2n-bn-ok">（時程充足）</span>' : '');
  return '<div class="s2n-banner">' +
      '<i class="ti ti-tool s2n-bn-ico"></i>' +
      '<span class="s2n-bn-name">當前階段：' + U.esc(sel) + status + '</span>' +
      '<span class="s2n-bn-dl"><i class="ti ti-calendar"></i> 階段 Deadline：' + dl + '</span>' +
    '</div>';
};
// ─── 前置任務組合框（[序號][白話銜接型][緩衝]）：白話文＋3 階段防呆過濾 ───
// 解析現存 predecessor（id#型別±lag）為 {id,type,lag}；多前置 → {multi:true} 走唯讀白話。
App._s2ParsePred = function(t) {
  const parts = String(t.predecessor || '').split(/[,，;；]/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { multi: true };
  if (!parts.length) return { id: '', type: 'FS', lag: 0 };
  const p = parts[0];
  const h = p.indexOf('#');
  const id = h >= 0 ? p.slice(0, h).trim() : p.trim();
  const tail = h >= 0 ? p.slice(h + 1).trim() : '';
  const m = tail.match(/^([A-Za-z]{2})?\s*([+-]\s*\d+)?$/) || [];
  let type = (m[1] || 'FS').toUpperCase();
  if (['FS', 'SS', 'FF', 'SF'].indexOf(type) < 0) type = 'FS';
  let lag = m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0;
  if (isNaN(lag)) lag = 0;
  return { id: id, type: type, lag: lag };
};
// 序號下拉選項（防呆）：同案、序在本任務之前、且階段在「當前～過去 3 階段」窗內者才可選。
// 現存前置若落在窗外仍保留為選中項（不誤清），其餘窗外項不列。
// 前置序號輸入（可手動打字＋下拉建議 datalist）：value＝現存前置的「序」；datalist 建議＝序在前且當前/過去 3 階段內。
// 手動可輸入更早的項目（防呆窗只當建議，不限制手動）；未來/自己由 _s2SetPredCombo 擋（序須 < 本任務序）。
App._s2PredSeqInput = function(t, variantId, curId) {
  const g = this._s2GroupByStage(variantId);
  const stageIdxOf = {};
  g.order.forEach((st, si) => (g.byStage[st] || []).forEach(x => { stageIdxOf[x.id] = si; }));
  const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
  const myIdx = flat.findIndex(x => x.id === t.id);
  const mySi = stageIdxOf[t.id];
  let curSeq = '';
  if (curId) { const ci = flat.findIndex(x => x.id === curId); if (ci >= 0) curSeq = String(ci + 1); }
  let opts = '';
  for (let i = 0; i < myIdx; i++) {
    const x = flat[i], xsi = stageIdxOf[x.id];
    if (xsi <= mySi && xsi >= mySi - 3) opts += '<option value="' + (i + 1) + '">' + U.esc((i + 1) + '·' + x.name) + '</option>';
  }
  const did = 's2pl-' + t.id;
  return '<input class="s2-pc-seq" type="text" list="' + did + '" value="' + curSeq + '" placeholder="序號" ' +
      'title="輸入或下拉前置序號（可手動輸入更早項目；建議僅當前或過去 3 階段）" ' +
      'onchange="App._s2SetPredCombo(\'' + t.id + '\')"><datalist id="' + did + '">' + opts + '</datalist>';
};
// 白話銜接型選項（移除 FS/FF 縮寫，UI 全白話；value 仍存引擎碼）
App._s2PredTypeOptions = function(type) {
  const opts = [['FS', '完成後才開始'], ['SS', '同一天開始'], ['FF', '同一天完成'], ['SF', '開始才完成']];
  return opts.map(o => '<option value="' + o[0] + '"' + (o[0] === type ? ' selected' : '') + '>' + o[1] + '</option>').join('');
};
// 組合框寫回：讀該列三控制項 → predecessor=id#型別±lag（空序號＝清前置）→ 重排重繪所有案。
// 序號為手動輸入：先把「序」映射回 taskId（容忍「3·任務名」取數字）；只接受序在本任務之前（未來/自己→清空）。
App._s2SetPredCombo = function(taskId) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(x => x.id === taskId); if (!t) return;
  const row = document.querySelector('[data-taskid="' + taskId + '"]');
  if (!row) return;
  const seqRaw = ((row.querySelector('.s2-pc-seq') || {}).value || '').trim();
  const type = (row.querySelector('.s2-pc-type') || {}).value || 'FS';
  let lag = parseInt((row.querySelector('.s2-pc-lag') || {}).value, 10);
  if (isNaN(lag)) lag = 0;
  let predId = '';
  if (seqRaw) {
    const g = this._s2GroupByStage(t.variant);
    const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
    const myIdx = flat.findIndex(x => x.id === t.id);
    const n = parseInt(String(seqRaw).split('·')[0], 10);
    if (!isNaN(n) && n >= 1 && (n - 1) < myIdx) predId = flat[n - 1].id;   // 只接受序在本任務之前（不可綁未來/自己）
  }
  if (!predId) { t.predecessor = ''; }
  else { const lagStr = lag > 0 ? ('+' + lag) : (lag < 0 ? String(lag) : ''); t.predecessor = predId + '#' + type + lagStr; }
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 前置欄：拆三個獨立儲存格（序號／銜接方式／緩衝），交由表格自動分配欄寬、互不重疊（解決組合框溢出壓字）。
// 多前置→唯讀白話，跨三欄（colspan=3）。data-preds + hover 高亮掛在序號格。
App._s2PredCells = function(t, variantId) {
  const preds = String(t.predecessor || '').split(/[,，;；]/).map(x => x.split('#')[0].trim()).filter(Boolean).join(',');
  const pp = this._s2ParsePred(t);
  if (pp.multi) {
    return '<td class="col-pred s2-pred s2-pred-multi" colspan="3" data-preds="' + preds + '" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()">' + U.esc(this._s2PredText(t)) + '</td>';
  }
  return '<td class="col-pred s2-pred s2-pc-seqcell" data-preds="' + preds + '" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()">' + this._s2PredSeqInput(t, variantId, pp.id) + '</td>' +
    '<td class="col-pred s2-pc-typecell"><select class="s2-pc-type" title="銜接方式" onchange="App._s2SetPredCombo(\'' + t.id + '\')">' + this._s2PredTypeOptions(pp.type) + '</select></td>' +
    '<td class="col-pred s2-pc-lagcell"><input class="s2-pc-lag" type="number" value="' + pp.lag + '" title="緩衝天數：+2 多等兩天、-1 提前一天" onchange="App._s2SetPredCombo(\'' + t.id + '\')"></td>';
};
// 餘裕燈號 HTML（interval 才顯示，§4.8.7.4）：純讀 _tplPreview，初繪與 refresh 共用（單一真實來源）。
// 非 interval（純 forward/backward）回 '' 不顯示（§4.8.5：餘裕需雙錨開始+結束）。
// 該案餘裕（interval 才算，非 interval 回 null）：抽共用，供燈號 HTML／溢出引導／建立閘門同一真實來源。
App._s2VariantSlack = function(variantId) {
  const res = this._tplPreview; if (!res) return null;
  const v = (res.variants || []).find(x => x.id === variantId); if (!v) return null;
  const dir = App._effScheduleDir(v.schedule.startDate, v.schedule.endDate, v.schedule.direction);
  if (dir === 'interval' && v.schedule.startDate && v.schedule.endDate) {
    // interval（開始+結束都填）：改用「從開始日順推各段取最末完工」算 earliestFinish／餘裕（與 backward 分支、Gantt _s1ColorStagesForward 同源）。
    // 取代舊 _computeSlack 用 needed=workdaysBetween(minStart,maxFinish) 的近似——近似 earliestFinish 與真實順推完工不一致，
    // 造成「採用最快上市日後仍判紅、Gantt 階段紅但 banner 說達標、slack off-by-one 顯示紅+尚缺0天」。順推冪等：採用 fin 當上市日後再順推仍得 fin → slack=0 → 達標。
    const g = App._s2GroupByStage(variantId);
    const stages = g.order.map(st => ({ stage: st }));
    App._s1ColorStagesForward(res, v, stages, v.schedule.startDate, v.schedule.endDate);
    let fin = ''; stages.forEach(s => { if (s.end && s.end > fin) fin = s.end; });
    if (!fin) return null;
    const start = v.schedule.startDate, end = v.schedule.endDate;
    const available = D.workdaysBetween(start, end);
    const needed = D.workdaysBetween(start, fin);
    const slack = available - needed;
    return { available, needed, slack,
      light: slack >= 5 ? 'green' : (slack >= 0 ? 'yellow' : 'red'),
      earliestFinish: fin, overDays: slack < 0 ? Math.max(0, D.workdaysBetween(end, fin) - 1) : 0 };
  }
  if (dir === 'backward' && v.schedule.endDate) {
    // backward（只填上市日）：順推自今日＋階段串接取最末完工（與 Stage1 情境C 同源；desc==stage key 對得上），比對上市日 → 紅/黃/綠。
    const g = App._s2GroupByStage(variantId);
    const stages = g.order.map(st => ({ stage: st }));
    App._s1ColorStagesForward(res, v, stages, D.fmt(D.today(), 'iso'), v.schedule.endDate);
    let fin = ''; stages.forEach(s => { if (s.end && s.end > fin) fin = s.end; });
    if (!fin) return null;
    const end = v.schedule.endDate;
    const m = (fin <= end) ? D.workdaysBetween(fin, end) - 1 : -(D.workdaysBetween(end, fin) - 1);
    return { available: null, needed: null, slack: m,
      light: m >= 5 ? 'green' : (m >= 0 ? 'yellow' : 'red'),
      earliestFinish: fin, overDays: m < 0 ? Math.abs(m) : 0 };
  }
  return null;
};
App._s2SlackHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const v = (res.variants || []).find(x => x.id === variantId);
  if (!v) return '';
  const s = App._s2VariantSlack(variantId);
  if (!s) return '';
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const wkd = (iso) => iso ? '（週' + ['日','一','二','三','四','五','六'][new Date(iso).getDay()] + '）' : '';
  const sd = v.schedule.startDate, ed = v.schedule.endDate;
  const msg = s.light === 'green' ? ('時間充足，還有 ' + s.slack + ' 個工作天緩衝')
    : s.light === 'yellow' ? ('時間偏緊，只剩 ' + s.slack + ' 個工作天緩衝，任何延誤都可能時程延誤、緩衝期較少')
    : ('時間不足，照專案範本的工期排，比需求的最快完成日晚 ' + s.overDays + ' 個工作天');
  const diffTxt = s.light === 'green' ? ('多出 ' + s.slack)
    : s.light === 'yellow' ? ('只多 ' + s.slack)
    : ('少了 ' + Math.abs(s.slack));
  const fastest = (s.light === 'red' && s.earliestFinish)
    ? '<span class="s2-slack-fastest">實際最快完成 ' + fmtD(s.earliestFinish) + wkd(s.earliestFinish) + '（晚 ' + s.overDays + ' 個工作天）</span>'
    : '';
  return '<div class="s2-slack s2-slack-' + s.light + '">' +
    '<span class="s2-slack-dot"></span>' +
    '<span class="s2-slack-msg">' + msg + '</span>' +
    '<span class="s2-slack-period">需求專案週期 ' + fmtD(sd) + wkd(sd) + ' → ' + fmtD(ed) + wkd(ed) + '</span>' +
    '<span class="s2-slack-nums">可排工作天 ' + s.available + ' ／ 任務需要 ' + s.needed + ' ／ ' + diffTxt + '</span>' +
    fastest +
  '</div>';
};
// ─── §4.8.7.8 舊版「嵌入 Stage 2」溢出引導已退役（2026-06-27），由 §4.8.7.9 獨立聚焦面板 `_ovf*` 取代。
// 已刪：_s2OverflowGuideHtml／_s2AdoptFastest／_s2OverflowHandoff／_s2OverflowRecalc（接線同步移除）。
// 仍保留共用：_s2VariantSlack（餘裕，新面板續用）、_s2CommitNew/_s2DoCommit（建立）、_s2SlackHtml（Stage 2 狀態條）。
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
  const slack = document.querySelector('.s2-slack-wrap[data-variant="' + variantId + '"]');
  if (slack) slack.innerHTML = this._s2SlackHtml(variantId);
  const gantt = document.querySelector('.s2-gantt[data-variant="' + variantId + '"]');
  if (gantt) gantt.innerHTML = this._s2GanttHtml(variantId);
  const bn = document.querySelector('.s2n-banner-wrap[data-variant="' + variantId + '"]');
  if (bn) bn.innerHTML = this._s2BannerHtml(variantId);
  const list = document.querySelector('.s2-list[data-variant="' + variantId + '"]');
  if (list) list.innerHTML = this._s2ListHtml(variantId);
};

// ═══ §4.8.7.9 智慧排程衝突處理面板（聚焦獨立頁，照 2026-06-27 定案 Mockup）═══
// 時程不足才走此頁（時間足夠走 _renderStage2New 骨架編輯）。分頁切案＋三層卡（階段一）→ 層二 Top3 長工時快選＋mini戰報（階段二）→ 層三 segmented＋即時戰報＋時程異動表（階段三）。
// 進場 snapshot 各任務原排程＋各案原 endDate/缺口當「變更前」基準（戰報/時程異動 diff 用）。state 存 App._ovfState。
App._ovfState = null;
App._renderOverflowFlow = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('⚠ 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const baseTask = {};
  (res.tasks || []).forEach(t => { baseTask[t.id] = { s: t.plannedStart || null, e: t.plannedEnd || null }; });
  const baseEnd = {}, baseOver = {};
  variants.forEach(v => {
    baseEnd[v.id] = v.schedule.endDate;
    const s = App._s2VariantSlack(v.id);
    baseOver[v.id] = (s && s.light === 'red') ? s.overDays : 0;
  });
  let firstRed = null;
  variants.forEach(v => { if (firstRed) return; const s = App._s2VariantSlack(v.id); if (s && s.light === 'red') firstRed = v.id; });
  App._ovfState = { tab: firstRed || (variants[0] && variants[0].id) || null, sel: {}, modified: {}, topN: {}, baseTask: baseTask, baseEnd: baseEnd, baseOver: baseOver };
  App._s2From = 'overflow';   // §第3：Stage 2 來源＝智慧排程面板 →「上一步」回此面板（保留層一二設定），非回 Stage 1
  App._ovfRender();
};
App._ovfRender = function() {
  const page = document.getElementById('page-stage2');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  page.classList.add('active');
  page.innerHTML =
    '<div class="s2n-wrap ovf-wrap">' +
      '<div class="s2n-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> 新增專案 <span class="s1-crumb-sep">/</span> 智慧排程衝突處理</div>' +
        '<div class="s2n-head"><span class="s2-num"><i class="ti ti-wand"></i></span>智慧排程衝突處理面板</div>' +
      '</div>' +
      '<div class="ovf-tabs" id="ovf-tabs">' + App._ovfTabsInner() + '</div>' +
      '<div class="ovf-casebox" id="ovf-casebox">' + App._ovfCaseHtml(App._ovfState.tab) + '</div>' +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._ovfBack()">上一步</button>' +
        '<button class="tb-action ovf-next-btn" onclick="App._ovfGotoStage2()">下一步：進入 Stage 2 調整各階段工期 →</button>' +
      '</div>' +
    '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
App._ovfRefresh = function() {
  const tabs = document.getElementById('ovf-tabs');
  if (tabs) tabs.innerHTML = App._ovfTabsInner();
  const box = document.getElementById('ovf-casebox');
  if (box) box.innerHTML = App._ovfCaseHtml(App._ovfState.tab);
};
App._ovfTabsInner = function() {
  const res = this._tplPreview; const st = App._ovfState;
  return (res.variants || []).map((v, i) => {
    const s = App._s2VariantSlack(v.id);
    const sub = (s && s.light === 'red') ? '<span class="ovf-tab-lack">● 尚缺 ' + s.overDays + ' 天</span>'
      : (s ? '<span class="ovf-tab-ok">✓ 已足夠</span>' : '');
    return '<button class="ovf-tab' + (v.id === st.tab ? ' on' : '') + '" onclick="App._ovfSelectTab(\'' + v.id + '\')">' +
      '<span class="ovf-tab-name">' + (i === 0 ? '主案' : '子案') + ' ' + U.esc(v.name || '') + '</span>' + sub + '</button>';
  }).join('');
};
App._ovfSelectTab = function(vid) { App._ovfState.tab = vid; App._ovfRefresh(); };
App._ovfPickLayer = function(vid, n) {
  App._ovfState.sel[vid] = n;
  if (n === '2') {   // §b 進層二＝開始調整：snapshot 此刻尚缺當基準，「已縮短」與當下尚缺同基準、不再對不上
    const s = App._s2VariantSlack(vid);
    App._ovfState.baseOver[vid] = (s && s.light === 'red') ? s.overDays : 0;
  }
  App._ovfRefresh();
};
App._ovfCaseHtml = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return '';
  const isMain = (res.variants || [])[0] && (res.variants || [])[0].id === vid;
  const sel = App._ovfState.sel[vid] || null;
  const s = App._s2VariantSlack(vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const resolved = !s || s.light !== 'red';
  const head = '<div class="ovf-case-head">' +
      '<span class="stage-cap-pill cap-0">' + (isMain ? '主案' : '子案') + '</span>' +
      '<span class="ovf-case-name">' + U.esc(v.name || '') + '</span>' +
      App._ovfRangeBadge(vid, v) +
    '</div>';
  const banner = resolved
    ? '<div class="ovf-banner ok"><i class="ti ti-circle-check"></i> 時程已足夠：已成功解決排程衝突' + (s ? '（餘裕 ' + s.slack + ' 個工作天）' : '') + '。</div>'
    : '<div class="ovf-banner"><span class="ovf-bdot"></span> 排程時間不足：照範本工期排，比需求上市日晚 <b>' + s.overDays + '</b> 個工作天（尚缺 ' + s.overDays + ' 個工作天）</div>';
  // §4.8.7.10：砍層三獨立頁，頂部只到層二。層二搞不定 → 按右下角「下一步」直接進 Stage 2 大表逐項微調（帶入層二改好的工期）。
  if (sel === '2') {
    return head + banner + App._ovfLayer2Panel(vid, s, v);
  }
  if (sel === '1') {
    // §N1：採用層一後 → 層一卡選中（燈亮）＋層二卡反灰鎖；達標 banner；按右下角「下一步」進 Stage 2 或切上方 Tab 處理別案。
    return head + banner + App._ovfLayer1Html(vid, s, v, true) + App._ovfLayer2CardHtml(vid, v, true);
  }
  if (resolved) {
    return head + banner + '<div class="ovf-resolved-hint"><i class="ti ti-arrow-down-circle"></i> 可直接點右下角「下一步」進任務大表，或切換上方其他案別繼續處理。</div>';
  }
  return head + banner + '<div class="ovf-hd">排程時間不足（尚缺 ' + s.overDays + ' 個工作天），請用以下方式處理；仍不足可按右下角「下一步：進入 Stage 2」進大表逐項微調：</div>' +
    App._ovfLayer1Html(vid, s, v) + App._ovfLayer2CardHtml(vid, v);
};
App._ovfLayer1Html = function(vid, s, v, selected) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  if (selected) {
    return '<div class="ovf-plan ovf-p1 on">' +
      '<div class="ovf-radio on"><span></span></div>' +
      '<div class="ovf-pbody">' +
        '<div class="ovf-pt">已採用系統建議的最快可行上市日 <span class="ovf-tag easy">已套用</span></div>' +
        '<div class="ovf-pd">上市日已改為 <b>' + fmtD(v.schedule.endDate) + '</b>，系統已重排並點亮綠燈。如需改用其他方式，按左下「上一步」可退回重選。</div>' +
      '</div></div>';
  }
  return '<div class="ovf-plan ovf-p1">' +
    '<div class="ovf-radio" onclick="App._ovfAdoptFastest(\'' + vid + '\')"></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt">採用系統建議的最快可行上市日 <span class="ovf-tag easy">最省力</span></div>' +
      '<div class="ovf-pd">依現有工期與前置，最快 <b>' + fmtD(s.earliestFinish) + '</b> 可上市，比原定 ' + fmtD(v.schedule.endDate) + ' 順延 ' + s.overDays + ' 個工作天。</div>' +
      '<button class="tb-action ovf-p1btn" onclick="App._ovfAdoptFastest(\'' + vid + '\')">把上市日期改成 ' + fmtD(s.earliestFinish) + '</button>' +
    '</div></div>';
};
App._ovfLayer2CardHtml = function(vid, v, locked) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const click = locked ? '' : ' onclick="App._ovfPickLayer(\'' + vid + '\',\'2\')"';
  return '<div class="ovf-plan ovf-p2' + (locked ? ' locked' : '') + '">' +
    '<div class="ovf-radio"' + click + '></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt"' + click + '>延後需求上市日 <span class="ovf-tag mid">中度微調 · 核心主線</span></div>' +
      '<div class="ovf-pd">重新指定一個您可以接受的較晚日期（須晚於 ' + fmtD(v.schedule.endDate) + '），或在內部精選長工時任務快速縮減。</div>' +
    '</div></div>';
};
App._ovfLayer2Panel = function(vid, s, v) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  return '<div class="ovf-plan ovf-p2 on">' +
    '<div class="ovf-radio on"><span></span></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt">延後需求上市日 <span class="ovf-tag mid">中度微調 · 核心主線</span></div>' +
      '<div class="ovf-pd">重新指定一個您可以接受的較晚日期（須晚於 ' + fmtD(v.schedule.endDate) + '），由系統重算時間差。</div>' +
      '<div class="ovf-l2-row"><input class="ovf-l2-date" type="date" min="' + v.schedule.endDate + '">' +
        '<button class="ovf-l2-recalc-btn" onclick="App._ovfRecalc(\'' + vid + '\')">重新計算餘裕</button></div>' +
      App._ovfTop3Html(vid, s) +
    '</div></div>';
};
// §A 有效縮短瓶頸（模擬法）：對各任務模擬「工期縮到 1 天」重算總完工日，能真正縮短總天數的才算「有效瓶頸」、縮短量＝該任務有效上限。
// 取代 CPM 零浮時近似——零浮時會把「多前置匯合（如 13『6,9』）的並行等長鏈」全標關鍵，但改其中單一條、另一條還拖著＝改了沒用（Paul 實測「扣不下來」根因）。
// 回 Map(id → 可縮短日曆天上限)；>0＝改了有效。純函式（clone，不碰 res.tasks），只順推不逆推。
App._effectiveGains = function(variantId) {
  const res = this._tplPreview; if (!res) return new Map();
  const ts = (res.tasks || []).filter(t => t.variant === variantId);
  if (!ts.length) return new Map();
  const todayIso = D.fmt(D.today(), 'iso');
  const finishOf = (tasks) => {
    const fwd = tasks.map(t => Object.assign({}, t, { start: '' }));
    fwd.forEach(t => { if (!t.predecessor) t.plannedStart = todayIso; });   // 統一起點（瓶頸結構與絕對起點無關）
    const r = computeSchedule(fwd); let fin = '';
    r.results.forEach(x => { if (x.suggestedEnd && x.suggestedEnd > fin) fin = x.suggestedEnd; });
    return fin;
  };
  const baseFin = finishOf(ts);
  const gains = new Map();
  ts.forEach(t => {
    if ((t.durationDays || 0) <= 1) { gains.set(t.id, 0); return; }
    const sim = ts.map(x => x.id === t.id ? Object.assign({}, x, { durationDays: 1 }) : x);
    const f = finishOf(sim);
    const g = (f && baseFin) ? Math.max(0, Math.round((new Date(baseFin) - new Date(f)) / 86400000)) : 0;
    gains.set(t.id, g);
  });
  return gains;
};
// 精選：只列「關鍵路徑上」的長工時前 5（§A，改了才有效縮短總工期）。清單穩定（首次算定存 topN，扣減不重排→防手動值跳回）；
// 「重新計算/再次重算」時清 topN 重列當前關鍵路徑（壓縮後關鍵路徑可能轉移到另一條鏈）。
App._ovfTopTasks = function(vid) {
  const res = this._tplPreview; const st = App._ovfState;
  if (st && st.topN && st.topN[vid]) {
    return st.topN[vid].map(id => (res.tasks || []).find(t => t.id === id)).filter(Boolean);
  }
  const gains = App._effectiveGains(vid);
  // §A 每階段取「改了最有效(gain 最大>0)」的 1 個代表 → 避免同階段並行等長任務一次列多個(改任一個被另一個拖、白改)。
  // 同階段並行互拖(全 gain=0)→該階段不列；改源頭/串行瓶頸(讓整階段一起動)會被選為代表。跨階段按 gain 排序取前 5(自然 3~5 個)。
  const byStage = {};
  (res.tasks || []).filter(t => t.variant === vid).forEach(t => {
    const s = (t.stage || '').trim() || '其他';
    (byStage[s] = byStage[s] || []).push(t);
  });
  const reps = [];
  Object.keys(byStage).forEach(s => {
    const cand = byStage[s].filter(t => (gains.get(t.id) || 0) > 0).sort((a, b) => (gains.get(b.id) || 0) - (gains.get(a.id) || 0));
    if (cand.length) reps.push(cand[0]);
  });
  reps.sort((a, b) => (gains.get(b.id) || 0) - (gains.get(a.id) || 0));
  const ts = reps.slice(0, 5);
  if (st) { if (!st.topN) st.topN = {}; st.topN[vid] = ts.map(t => t.id); }
  return ts;
};
// §c 有效縮減上限：對單一任務二分搜尋「工期最多能縮幾天、再縮就被並行任務接手、總時程不再變短」。
// 回 {dur, cap(最多有效縮減工作天), minDur(縮到此值就見底)}。純函式只順推。供 Top5 顯示上限＋扣減 clamp 防縮過頭。
App._taskCap = function(vid, taskId) {
  const res = this._tplPreview; if (!res) return { dur: 0, cap: 0, minDur: 0 };
  const ts = (res.tasks || []).filter(t => t.variant === vid);
  const t = ts.find(x => x.id === taskId); if (!t) return { dur: 0, cap: 0, minDur: 0 };
  const dur = t.durationDays || 0;
  if (dur <= 1) return { dur, cap: 0, minDur: dur };
  const todayIso = D.fmt(D.today(), 'iso');
  const finWith = (d) => {
    const fwd = ts.map(x => Object.assign({}, x, { start: '', durationDays: x.id === taskId ? d : (x.durationDays || 0) }));
    fwd.forEach(x => { if (!x.predecessor) x.plannedStart = todayIso; });
    const r = computeSchedule(fwd); let f = '';
    r.results.forEach(z => { if (z.suggestedEnd && z.suggestedEnd > f) f = z.suggestedEnd; });
    return f;
  };
  const baseFin = finWith(dur), minFin = finWith(1);
  if (!baseFin || !minFin || minFin >= baseFin) return { dur, cap: 0, minDur: dur };   // 縮了也不影響總時程（非瓶頸）
  let lo = 1, hi = dur - 1, cap = dur - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (finWith(dur - mid) <= minFin) { cap = mid; hi = mid - 1; } else lo = mid + 1; }
  return { dur, cap, minDur: dur - cap };
};
App._ovfTop3Html = function(vid, s) {
  const ts = App._ovfTopTasks(vid);
  const rows = ts.map((t, i) => {
    const dur = t.durationDays || 0;
    const cp = App._taskCap(vid, t.id);
    const cap = cp.cap, minDur = cp.minDur;
    let d1 = Math.min(3, Math.max(1, Math.round(dur * 0.15)));
    let d2 = Math.min(5, Math.max(2, Math.round(dur * 0.25)));
    d1 = Math.min(d1, cap); d2 = Math.min(d2, cap);   // §c 膠囊不超過有效上限
    const meta = [(t.stage || '').trim(), (t.role || '').trim()].filter(Boolean).join(' · ') || '未分階段';
    const capNote = cap > 0
      ? '<span class="ovf-t3cap">工期 ' + dur + ' 天，但最多有效縮 <b>' + cap + '</b> 天（縮到 ' + minDur + ' 天就見底，再縮會被並行任務接手、省不了總時程）</span>'
      : '<span class="ovf-t3cap none">此任務已不在瓶頸上，縮了不影響總時程</span>';
    const pills = cap > 0
      ? '<button class="ovf-pill" onclick="App._ovfTrim(\'' + vid + '\',\'' + t.id + '\',' + d1 + ')">−' + d1 + ' 天</button>' +
        (d2 > d1 ? '<button class="ovf-pill" onclick="App._ovfTrim(\'' + vid + '\',\'' + t.id + '\',' + d2 + ')">−' + d2 + ' 天</button>' : '') +
        '<span class="ovf-t3or">或</span>' +
        '<span class="ovf-t3man">手動 <input type="number" min="' + minDur + '" class="ovf-t3inp" value="' + dur + '" ' +
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" ' +
          'onchange="App._ovfSetDur(\'' + vid + '\',\'' + t.id + '\',this.value)"> 天</span>'
      : '';
    return '<div class="ovf-t3row">' +
      '<span class="ovf-t3n">' + String.fromCharCode(65 + i) + '</span>' +
      '<span class="ovf-t3nmwrap"><span class="ovf-t3nm" title="' + U.esc(t.name) + '">' + U.esc(t.name) + '</span>' +
        '<span class="ovf-t3meta">' + U.esc(meta) + '</span></span>' +
      '<span class="ovf-t3dur">目前工期 <b>' + dur + '</b> 天</span><span class="ovf-t3arr">→</span>' +
      pills + capNote +
    '</div>';
  }).join('');
  const resolved = !s || s.light !== 'red';
  const hd = resolved
    ? '<div class="ovf-t3hd ok"><i class="ti ti-circle-check"></i> 時間已足夠！可直接建立，或繼續微調以下各階段瓶頸任務：</div>'
    : '<div class="ovf-t3hd"><i class="ti ti-alert-triangle"></i> 時間仍不足 ' + s.overDays + ' 個工作天！系統為您精選各階段「改了最能縮短總時程」的瓶頸任務（每階段一個·避免並行互拖白改），請嘗試縮減：</div>';
  return '<div class="ovf-t3box">' + hd + rows + App._ovfMiniBattleHtml(vid, s) +
    '<div class="ovf-t3foot"><button class="tb-action ovf-recalc" onclick="App._ovfReeval(\'' + vid + '\')">再次重算</button>' +
      (resolved ? '' : '<span class="ovf-t3tip"><i class="ti ti-bulb"></i> 小祕訣：每按一次重算，系統會自動撈出下一批<b>不重複</b>的瓶頸任務讓您繼續縮減，可一路扣到<b>尚缺歸零</b>；仍不足也可按右下角「下一步」進大表微調。</span>') + '</div>' +
  '</div>';
};
App._ovfMiniBattleHtml = function(vid, s) {
  const st = App._ovfState; const v = (this._tplPreview.variants || []).find(x => x.id === vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const nowOver = (s && s.light === 'red') ? s.overDays : 0;
  const cut = Math.max(0, (st.baseOver[vid] || 0) - nowOver);
  const enough = nowOver <= 0;
  return '<div class="ovf-mini">' +
    '<div class="ovf-mini-hd"><i class="ti ti-chart-line"></i> 層二微調即時戰報</div>' +
    '<div class="ovf-mini-row"><span class="ovf-mini-k">目標上市日對齊</span><span class="ovf-mini-old">預期 ' + fmtD(v.schedule.endDate) + '</span><span class="ovf-mini-arr">➔</span>' +
      (enough ? '<b class="ovf-mini-ok">時間已足夠，可直接套用</b>'
              : '<b class="ovf-mini-lack">還差 ' + nowOver + ' 個工作天</b><span class="ovf-mini-cut">（已縮短 ' + cut + ' 天）</span>') + '</div>' +
    '<div class="ovf-mini-judge">' + (enough
      ? '<i class="ti ti-circle-check"></i> 已解決，按上方「建立專案」或「再次重算」確認。'
      : '<i class="ti ti-alert-triangle"></i> <b>仍超出目標</b>，建議繼續扣減瓶頸任務，或按右下角「下一步：進入 Stage 2」進大表逐項微調。') + '</div>' +
  '</div>';
};
// §4.8.7.10：層三獨立頁退役（2026-06-27）。已刪 _ovfLayer3CardHtml／_ovfLockedTableHtml／_ovfSegmentedHtml／_ovfBattleHtml／_ovfStage3TableHtml。
// 層二搞不定 → 右下角「下一步」直接進 Stage 2 大表（帶入層二工期），由 Stage 2 頂部進度條 dashboard＋⚠️標籤指引補完。
App._ovfAdoptFastest = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const s = App._s2VariantSlack(vid); if (!s || !s.earliestFinish) return;
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  App.confirmModal({
    icon: 'ti-circle-check', iconBg: '--sage-50', iconColor: '--sage-600',
    title: '確認更換為系統建議上市日？',
    msg: '系統已為您重新規劃最佳排程。確認後，本案的需求上市日將改為 <b>' + fmtD(s.earliestFinish) + '</b>（順延 ' + s.overDays + ' 個工作天），系統將自動點亮綠燈並套用排程。',
    okText: '確認套用並關閉',
    onConfirm: function() {
      v.schedule.endDate = s.earliestFinish;
      App._reschedulePreview(res.tasks, res.variants, []);
      App._ovfState.sel[vid] = '1';   // §N1：採用層一後停留本案，層一燈亮、層二鎖；使用者自行按「下一步」進 Stage 2 或切 Tab 處理別案
      App._ovfRefresh();
    }
  });
};
// 達標後轉場：全案都解決→前往 Stage 2（任務細節/負責人在那編，不在溢出面板硬擋）；仍有紅案→自動切到下一個紅案接力。
App._ovfAfterResolve = function(vid) {
  const res = App._tplPreview; if (!res) return;
  const reds = (res.variants || []).filter(x => { const ss = App._s2VariantSlack(x.id); return ss && ss.light === 'red'; });
  if (!reds.length) {
    App._renderStage2New();
  } else {
    App._ovfState.tab = reds[0].id;
    App._ovfState.sel[reds[0].id] = null;
    App._ovfRefresh();
    U.toast('✓ 本案已解決，請繼續處理下一個時程不足的案別：' + (reds[0].name || ''), 'success');
  }
};
// 前往 Stage 2（任務大表）：§第1 進場前掃所有案，仍有紅燈（未處理）→ 彈設計款窗列出哪些案尚缺幾天，按「仍要進」才進、否則留在面板逐案處理。
App._ovfGotoStage2 = function() {
  const res = App._tplPreview;
  const reds = res ? (res.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; }) : [];
  if (reds.length) {
    const names = reds.map(v => {
      const s = App._s2VariantSlack(v.id);
      const isMain = (res.variants || [])[0] && (res.variants || [])[0].id === v.id;
      return '・' + (isMain ? '主案' : '子案') + ' ' + U.esc(v.name || '') + '（尚缺 ' + (s ? s.overDays : 0) + ' 個工作天）';
    }).join('<br>');
    App.confirmModal({
      icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose',
      title: '還有案別時程未處理',
      msg: '以下案別仍時程不足、尚未在本面板處理：<br><br>' + names + '<br><br>可切換上方頁籤逐案處理，或仍要直接進入任務大表逐項微調？',
      okText: '仍要進入大表 →', cancelText: '留在此繼續處理',
      onConfirm: function() { App._renderStage2New(); }
    });
    return;
  }
  App._renderStage2New();
};
// 案頭前後時程對照看板：原始 Stage1 區間 ➔ 變更後區間（順延 N 工作天）。未變更則只顯示需求上市日。
App._ovfRangeBadge = function(vid, v) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const st = App._ovfState;
  const baseEnd = (st && st.baseEnd) ? st.baseEnd[vid] : '';
  const curEnd = v.schedule.endDate;
  const sd = v.schedule.startDate;
  const sFmt = sd ? fmtD(sd) : '（自動起算）';
  if (baseEnd && curEnd && curEnd !== baseEnd) {
    const delay = curEnd > baseEnd ? Math.max(0, D.workdaysBetween(baseEnd, curEnd) - 1) : 0;
    return '<span class="ovf-rangebadge">' +
      '<span class="ovf-rb-old"><i class="ti ti-history"></i> 原始 ' + sFmt + ' → ' + fmtD(baseEnd) + '</span>' +
      '<span class="ovf-rb-arr">➔</span>' +
      '<span class="ovf-rb-new">新時程 ' + sFmt + ' → ' + fmtD(curEnd) + (delay > 0 ? ' <span class="ovf-rb-delay">順延 ' + delay + ' 個工作天</span>' : '') + '</span>' +
    '</span>';
  }
  return '<span class="ovf-case-range">' + sFmt + ' → ' + fmtD(curEnd) + '（需求上市日）</span>';
};
App._ovfRecalc = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const box = document.getElementById('ovf-casebox'); const inp = box ? box.querySelector('.ovf-l2-date') : null;
  const val = inp ? inp.value : '';
  if (val && val > v.schedule.endDate) { v.schedule.endDate = val; App._reschedulePreview(res.tasks, res.variants, []); }
  if (App._ovfState && App._ovfState.topN) delete App._ovfState.topN[vid];   // §A 重算→清 Top5 快取，重列當前關鍵路徑
  App._ovfRefresh();
  App._ovfResultModal(vid);   // 回饋一律走中央白底窗（取代右下角灰 toast）；無效/未填日期＝就地重算現況
};
App._ovfTrim = function(vid, taskId, days) {
  const res = this._tplPreview; const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const cp = App._taskCap(vid, taskId);
  const target = (t.durationDays || 0) - days;
  const clamped = Math.max(cp.minDur, target);   // §c 不能縮過有效上限（再縮被並行任務接手、白縮）
  if (clamped > target) U.toast('已達有效上限（縮到 ' + cp.minDur + ' 天），再縮也省不了總時程——瓶頸已轉移到並行任務', 'warning');
  t.durationDays = Math.max(0, clamped);
  App._ovfState.modified[taskId] = true;
  App._reschedulePreview(res.tasks, res.variants, []); App._ovfRefresh();
};
App._ovfSetDur = function(vid, taskId, value) {
  const res = this._tplPreview; const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const cp = App._taskCap(vid, taskId);
  const target = Math.max(0, parseInt(value) || 0);
  const clamped = Math.max(cp.minDur, target);   // §c clamp 到有效上限
  if (clamped > target) U.toast('已達有效上限（縮到 ' + cp.minDur + ' 天），再縮也省不了總時程——瓶頸已轉移到並行任務', 'warning');
  t.durationDays = clamped;
  App._ovfState.modified[taskId] = true;
  App._reschedulePreview(res.tasks, res.variants, []); App._ovfRefresh();
};
// 重算/再次重算後的結果回饋窗：夠了→問是否直接建立；不夠→告知還差幾天＋下一步建議。
App._ovfResultModal = function(vid) {
  const res = App._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const s = App._s2VariantSlack(vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const resolved = !s || s.light !== 'red';
  if (resolved) {
    App.confirmModal({
      icon: 'ti-calendar-check', iconBg: '--sage-50', iconColor: '--sage-600',
      title: '時間已足夠！',
      msg: '新排程已可在 <b>' + fmtD(v.schedule.endDate) + '</b> 前完成' + (s ? '，餘裕 ' + s.slack + ' 個工作天' : '') + '。下一步前往任務細節編輯頁（指派負責人、調整任務）。',
      okText: '確認並前往調整任務細節', cancelText: '留在此頁微調',
      onConfirm: function() { App._ovfAfterResolve(vid); }
    });
  } else {
    App.confirmModal({
      icon: 'ti-calendar', iconBg: '--amber-l', iconColor: '--amber-accent',
      title: '重新計算完成：時間仍不足',
      msg: '目前仍差 <b>' + s.overDays + '</b> 個工作天。您可以繼續扣減上方瓶頸任務、改更晚的上市日，或按右下角「下一步」進 Stage 2 大表逐項微調。',
      okText: '我知道了', cancelText: null
    });
  }
};
// 再次重算：刷新即時戰報＋彈結果回饋窗（與重新計算同一回饋來源）。
App._ovfReeval = function(vid) { if (App._ovfState && App._ovfState.topN) delete App._ovfState.topN[vid]; App._ovfRefresh(); App._ovfResultModal(vid); };   // §A 再次重算→清 Top5 快取，重列當前關鍵路徑
// 上一步：在層別內（選過層二/三）先退回三層選擇（保留本案排程編輯，不離開面板）；已在三層選擇頁才回 Stage 1。
App._ovfBack = function() {
  const tab = App._ovfState ? App._ovfState.tab : null;
  if (tab && App._ovfState.sel[tab]) { App._ovfState.sel[tab] = null; App._ovfRefresh(); return; }
  App._s2BackToStage1();
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
    const self = this;
    const _doRemove = () => {
      const i = store.findIndex(x => x.id === deptId);
      if (i >= 0) store.splice(i, 1);
      if (mode === 'tpl' && store.length === 0) store.push({ id: U.id(), name: '', members: [{ id: U.id(), name: '' }] });   // 模板維持至少 1 列
      self._after(mode, projId);
    };
    if (mode === 'edit') {
      const n = DATA.tasks.filter(t => t.dept === deptId).length;
      if (n > 0) { App.openDeptReassign(projId, deptId); return; }   // 有任務掛著 → 改派彈窗（安全網）
      const d0 = store.find(x => x.id === deptId);
      App.confirmModal({ icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
        title: `確定刪除部門「${d0 ? d0.name : deptId}」？`, okText: '刪除', cancelText: '取消', okClass: 'danger', onConfirm: _doRemove });
      return;
    }
    _doRemove();
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
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `刪除專案「${p.name}」？`, msg: `含 ${taskCnt} 個任務也會一併刪除。`, okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.projects = DATA.projects.filter(x => x.id !== id);
      DATA.tasks = DATA.tasks.filter(t => t.project !== id);
      if (App.currentProjectId === id) App.currentProjectId = null;
      Storage.save();
      App.closeModal();
      App.showPage('workspace', document.querySelector('[data-page=workspace]'));
      App.refreshAll();   // 補：刪完重繪 sidebar（清舊按鈕）+ 工作台彙總；showPage 已先設 currentPage=workspace，避開 renderProject null 自動跳第一個專案
    },
  });
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
