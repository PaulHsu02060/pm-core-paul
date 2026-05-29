/* ═══════════════════════════════════════════════════════════════════
 * PM-Workspace · Personal Task Board
 * ───────────────────────────────────────────────────────────────────
 *  作者 (Author)        許勝堯 (Hsu Sheng-Yao)
 *  GitHub Username      PaulHsu02060
 *  共同開發 (Co-author) Anthropic Claude
 *  專案 Repo            github.com/PaulHsu02060/pm-workspace-app
 *  開發歷程            2026 年 5 月於 BingDian Air Tech 產品開發部
 *                       手動需求 → AI 協作 → iterative refinement
 *  License             個人作品，禁止未經授權的商業使用
 *  簽章 (Build hash)    PMW-PaulHsu02060-2026
 * ───────────────────────────────────────────────────────────────────
 *  本程式為許勝堯與 Claude (Anthropic) 共同開發的個人專案，
 *  歷經多輪需求設計、架構規劃、功能迭代後完成。
 *  完整開發記錄保存於 GitHub commit history。
 * ═══════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.5.0';
const APP_AUTHOR = '許勝堯 (PaulHsu02060)';
const APP_BUILD_SIGNATURE = 'PMW-PaulHsu02060-2026';

// ─── ADMIN / DEFAULT OAUTH ─────────────────────────────
// Admin Gmail 名單：登入後能看到 J 系列同步等管理者功能
// 非 admin 看不到也用不到（J 系列 Sheet 由公司權限自行管控）
const ADMIN_EMAILS = ['shengyao1003@gmail.com'];

// 預設 OAuth Client ID：hardcode 在這，同事零設定就能 Google 登入
// 安全性：OAuth Client ID 本來就是公開資訊，配 redirect_uri 白名單防呆
// 來源：https://console.cloud.google.com/apis/credentials  (paulhsu02060.github.io)
const DEFAULT_OAUTH_CLIENT_ID = '463155721513-vpcjoakeudb8r4jpuid98h8idp3grmsp.apps.googleusercontent.com';

// helper：當前登入的 Gmail 是不是 admin
function isAdmin() {
  const email = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings._loggedInEmail) || '';
  return ADMIN_EMAILS.includes(String(email).toLowerCase());
}

// build hash 用於辨識：把作者名 + 重要常數 hash 起來
// 任何人移除作者標記都會改變這個 hash → 可比對辨識
console.log(`%c PM-Workspace v${APP_VERSION} `, 'background:#4A7C5C;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold', `by ${APP_AUTHOR} · build: ${APP_BUILD_SIGNATURE}`);

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
  jSheetUrl: '',
  syncTimes: ['09:00', '14:00'],
  autoSyncEnabled: false,
  // Google OAuth 白名單（只有這些 Gmail 登入後才能編輯）
  allowedEmails: ['shengyao1003@gmail.com'],
  googleClientId: '', // 由使用者在設定頁填入

  // ─── 雲端同步 (Cloud Sync via Google Apps Script) ───
  cloudSyncUrl: '',                      // Apps Script Web App URL
  cloudSyncToken: 'pmw-paul-2026',       // 對應 Apps Script 的 CHECK_TOKEN
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
  recurringMeetings: [
    { id: 'rm_1', category: 'meeting', frequency: 'weekly', day: 2, start: '07:50', end: '10:00', title: '主管週會', startDate: '', endDate: '', enabled: true },
    { id: 'rm_2', category: 'meeting', frequency: 'weekly', day: 2, start: '13:00', end: '14:00', title: '品管試驗進度', startDate: '', endDate: '', enabled: true },
    { id: 'rm_3', category: 'meeting', frequency: 'weekly', day: 3, start: '09:00', end: '10:00', title: 'J系列週會', startDate: '', endDate: '', enabled: true },
    { id: 'rm_4', category: 'cleaning', frequency: 'biweekly-allday', start: '07:50', end: '08:20', title: '輪值掃地（早）', startDate: '2026-05-25', endDate: '', enabled: true },
    { id: 'rm_5', category: 'cleaning', frequency: 'biweekly', day: 5, start: '16:30', end: '17:00', title: '輪值掃地（下班前）', startDate: '2026-05-25', endDate: '', enabled: true },
  ],
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
  pdcaGroups: {}, // { [projectId]: { [groupName]: { level, recoveryPlan, owner, note } } }
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
          // 把舊的「輪值掃地（早）週一」升級為「整週每天」
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
            { id: 'rm_cl_1', category: 'cleaning', frequency: 'biweekly-allday', start: '07:50', end: '08:20', title: '輪值掃地（早）', startDate: '2026-05-25', endDate: '', enabled: true },
            { id: 'rm_cl_2', category: 'cleaning', frequency: 'biweekly', day: 5, start: '16:30', end: '17:00', title: '輪值掃地（下班前）', startDate: '2026-05-25', endDate: '', enabled: true }
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
// DATA.pdcaGroups[projectId][groupName] = { level, recoveryPlan, owner, note }
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
  // 用途：例如輪值掃地是「我那週的每一天早上」都要做
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
  category: { deep: '深度', admin: '雜事', meeting: '會議', other: '其他' },
  categoryClass: { deep: 'tag-deep', admin: 'tag-admin', meeting: 'tag-meeting', other: 'tag-other' },
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

// ─── SMART SCHEDULE GENERATOR ──────────────────────────
function generateSchedule() {
  const { dailyHours, workStart1, workEnd1, workStart2, workEnd2, goldenTime, workDays, splitThreshold } = DATA.settings;
  const monday = D.monday();
  const weekKey = D.weekKey();

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

// === J 系列本地時程覆蓋（抽象層） ===
const J_OVERRIDE_FIELDS = ['start', 'end'];

function isJTask(task) {
  if (!task || !task.synced) return false;
  const proj = DATA.projects.find(p => p.id === task.project);
  return proj ? proj.syncSource === 'jSheet' : false;
}

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

function getEffectiveSchedule(task) {
  if (!task) return null;
  const override = isJTask(task) ? getJOverride(task.id) : null;
  return {
    start: override?.start ?? task.start,
    end: override?.end ?? task.end,
    plannedStart: override?.plannedStart ?? task.plannedStart,
    plannedEnd: override?.plannedEnd ?? task.plannedEnd,
    hasOverride: !!override,
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
    if (!silent) U.toast('🔄 正在同步 J 系列...');

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.tasks || !Array.isArray(data.tasks)) throw new Error('回應格式錯誤');

      // Find or create J系列 project
      let jProj = DATA.projects.find(p => p.synced && p.syncSource === 'jSheet');
      if (!jProj) {
        jProj = {
          id: U.id(), name: 'J系列 WBS', color: '#4A7C5C',
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
          owner: row.owner || '',
          start: effectiveStart,           // 用實際的覆蓋預計
          end: effectiveEnd,                // 用實際的覆蓋預計
          plannedStart: row.plannedStart || '', // 保留預計日期供顯示
          plannedEnd: row.plannedEnd || '',
          actualStart: row.actualStart || '',
          actualEnd: row.actualEnd || '',
          estHours: parseFloat(row.workdays || 0) * 6 || 4,
          category: row.type === '里程碑' ? 'meeting' : 'deep',
          urgency: deduceUrgency(row),
          status: realStatus,
          progress: realProgress,
          note: row.note || '',
          locked: true,
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
        U.toast(`✅ J 系列已同步 (${data.tasks.length} 項任務)`, 'success');
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
      // J 系列同步等 admin 功能由 isAdmin() 控制，不再依賴白名單擋人

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

    if (btn) {
      document.querySelectorAll('.sb-item, .sb-proj').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Render the active page（進甘特頁重設專案篩選＝全選；切週 ganttShift 不重設）
    if (name === 'gantt') this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id));
    this.renderPage(name);
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

    // Update sync info display (僅 admin 顯示 J 系列同步徽章 + 頂部立即同步按鈕)
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
            <div class="tabs" style="margin-left:auto">
              <button class="tab-btn active">週視圖</button>
              <button class="tab-btn" onclick="App.showPage('gantt', document.querySelector('[data-page=gantt]'))">甘特圖</button>
              <button class="tab-btn" onclick="App.showPage('month', document.querySelector('[data-page=month]'))">月曆</button>
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
          const cat = task.category || 'deep';
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
        <div class="proj-meta">
          ${tasks.length} 個任務 · ${tasks.filter(t=>t.status==='wip').length} 進行中
          ${proj.synced && proj.lastSync ? ' · 同步：' + D.fmt(new Date(proj.lastSync), 'ymd') + ' ' + new Date(proj.lastSync).toTimeString().slice(0,5) : ''}
        </div>
      </div>
      ${proj.synced ? `<button class="tb-action ghost" data-edit onclick="Sync.syncJSeries()">↻ 立即同步</button>` : ''}
      ${!proj.synced ? `<button class="tb-action ghost" data-edit onclick="App.editProject('${proj.id}')">編輯專案</button>` : ''}
    </div>

    <div class="proj-grid">
      <div>
        <!-- Active tasks -->
        <div class="task-list-card">
          <div class="tlc-head">
            <span class="tlc-title">待辦任務</span>
            <span class="tlc-count">${activeTasks.length}</span>
            <span style="font-size:11px; color:var(--ink3); margin-left:auto;">延遲 → 進行中 → 未開始</span>
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

      <div>
        ${this.buildMeetingPanelHtml()}
        ${this.buildGeneratePanelHtml()}
        <div class="tip">
          <b>💡 排程邏輯</b><br>
          • 每日 ${DATA.settings.dailyHours}h、${DATA.settings.goldenTime === 'morning' ? '上午' : DATA.settings.goldenTime === 'afternoon' ? '下午' : ''}深度時段優先<br>
          • 緊急 × Deadline 計算順序<br>
          • ≥${DATA.settings.splitThreshold}h 任務自動切分多天<br>
          • 鎖定 🔒 任務不會被覆蓋
        </div>
      </div>
    </div>
  `;
  document.getElementById('page-project').innerHTML = html;
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
  const cat = t.category || 'deep';
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

// 完整新增任務對話框（含日期、緊急度等所有欄位）
App.openNewTaskDialog = function(projId) {
  const projectOptions = DATA.projects.filter(p => !p.synced).map(p =>
    `<option value="${p.id}" ${projId === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`
  ).join('');

  const today = D.fmt(D.today(), 'iso');

  this.openModal({
    title: '新增任務',
    body: `
      <div class="form-field">
        <label>任務名稱 *</label>
        <input type="text" id="tf-name" placeholder="例：完成 BOM 表 6 型壁掛機">
      </div>
      <div class="form-field">
        <label>說明</label>
        <textarea id="tf-desc" placeholder="任務詳細說明（選填）"></textarea>
      </div>
      <div class="form-field">
        <label>所屬專案</label>
        <select id="tf-project">${projectOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-field"><label>擔當</label><input type="text" id="tf-owner" value="${U.esc(DATA.settings.userName || '')}"></div>
        <div class="form-field"><label>分類</label>
          <select id="tf-category">
            <option value="deep" selected>🌳 深度工作</option>
            <option value="admin">📋 雜事零碎</option>
            <option value="meeting">📅 會議</option>
            <option value="other">·  其他</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>緊急程度</label>
          <select id="tf-urgency">
            <option value="high">🔴 緊急</option>
            <option value="medium" selected>🟡 普通</option>
            <option value="low">🟢 不急</option>
          </select>
        </div>
        <div class="form-field"><label>狀態</label>
          <select id="tf-status">
            <option value="pending" selected>未開始</option>
            <option value="wip">進行中</option>
            <option value="done">已完成</option>
            <option value="hold">擱置中</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>預計開始</label><input type="date" id="tf-start" value="${today}"></div>
        <div class="form-field"><label>預計完成 / Deadline</label><input type="date" id="tf-end"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>預估工時 (h)</label><input type="number" id="tf-hours" value="1" min="0.5" step="0.5"></div>
        <div class="form-field"><label>處理方式</label><input type="text" id="tf-method" placeholder="會議/郵件/現場"></div>
      </div>
      <div class="form-field">
        <label>備註</label>
        <input type="text" id="tf-note">
      </div>
      <div class="form-field">
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="tf-split" checked style="width:auto;">
          可切分（≥4h 任務拆成多天）
        </label>
      </div>
    `,
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
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }

  const status = document.getElementById('tf-status').value;
  const task = {
    id: U.id(),
    project: document.getElementById('tf-project').value || projId,
    name,
    desc: document.getElementById('tf-desc').value.trim(),
    owner: document.getElementById('tf-owner').value.trim(),
    category: document.getElementById('tf-category').value,
    urgency: document.getElementById('tf-urgency').value,
    status,
    start: document.getElementById('tf-start').value,
    end: document.getElementById('tf-end').value,
    estHours: parseFloat(document.getElementById('tf-hours').value) || 1,
    method: document.getElementById('tf-method').value.trim(),
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
    body: `
      <div class="form-field">
        <label>任務名稱 *</label>
        <input type="text" id="tf-name" value="${U.esc(t.name)}">
      </div>
      <div class="form-field">
        <label>說明</label>
        <textarea id="tf-desc">${U.esc(t.desc || '')}</textarea>
      </div>
      <div class="form-field">
        <label>所屬專案</label>
        <div style="padding:8px 0; font-size:13px; display:flex; align-items:center; gap:7px;">${proj && proj.color ? `<span style="width:10px;height:10px;border-radius:3px;background:${proj.color};display:inline-block;flex-shrink:0;"></span>` : ''}${U.esc(proj ? proj.name : '—')}</div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>擔當</label><input type="text" id="tf-owner" value="${U.esc(t.owner || '')}"></div>
        <div class="form-field"><label>分類</label>
          <select id="tf-category">
            <option value="deep" ${t.category === 'deep' ? 'selected' : ''}>🌳 深度工作</option>
            <option value="admin" ${t.category === 'admin' ? 'selected' : ''}>📋 雜事零碎</option>
            <option value="meeting" ${t.category === 'meeting' ? 'selected' : ''}>📅 會議</option>
            <option value="other" ${t.category === 'other' ? 'selected' : ''}>·  其他</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>緊急程度</label>
          <select id="tf-urgency">
            <option value="high" ${t.urgency === 'high' ? 'selected' : ''}>🔴 緊急</option>
            <option value="medium" ${t.urgency === 'medium' ? 'selected' : ''}>🟡 普通</option>
            <option value="low" ${t.urgency === 'low' ? 'selected' : ''}>🟢 不急</option>
          </select>
        </div>
        <div class="form-field"><label>狀態</label>
          <select id="tf-status">
            <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>未開始</option>
            <option value="wip" ${t.status === 'wip' ? 'selected' : ''}>進行中</option>
            <option value="done" ${t.status === 'done' ? 'selected' : ''}>已完成</option>
            <option value="hold" ${t.status === 'hold' ? 'selected' : ''}>擱置中</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>預計開始</label><input type="date" id="tf-start" value="${sch.start || ''}"></div>
        <div class="form-field"><label>預計完成 / Deadline</label><input type="date" id="tf-end" value="${sch.end || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>實際開始</label><input type="date" id="tf-actualStart" value="${t.actualStart || ''}"></div>
        <div class="form-field"><label>實際完成（填了自動標已完成）</label><input type="date" id="tf-actualEnd" value="${t.actualEnd || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>預估工時 (h)</label><input type="number" id="tf-hours" value="${t.estHours || 1}" min="0.5" step="0.5"></div>
        <div class="form-field"><label>處理方式</label><input type="text" id="tf-method" value="${U.esc(t.method || '')}" placeholder="會議/郵件/現場"></div>
      </div>
      <div class="form-field">
        <label>備註</label>
        <input type="text" id="tf-note" value="${U.esc(t.note || '')}">
      </div>
      <div class="form-field">
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="tf-split" ${t.canSplit !== false ? 'checked' : ''} style="width:auto;">
          可切分（≥4h 任務拆成多天）
        </label>
      </div>
      <div class="form-field">
        <label>PDCA 大項目</label>
        <input type="text" id="tf-pdcaGroup" list="tf-pdcaGroup-list" value="${U.esc(t.pdcaGroup || '')}" placeholder="輸入或選擇大項目（空＝未歸類）">
        <datalist id="tf-pdcaGroup-list">${this.pdcaGroupDatalistOptions(t.project)}</datalist>
      </div>
      ${historyHtml}
    `,
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
  const name = document.getElementById('tf-name').value.trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }

  t.name      = name;
  t.desc      = document.getElementById('tf-desc').value.trim();
  t.owner     = document.getElementById('tf-owner').value.trim();
  t.category  = document.getElementById('tf-category').value;
  t.urgency   = document.getElementById('tf-urgency').value;
  t.start     = document.getElementById('tf-start').value;
  t.end       = document.getElementById('tf-end').value;
  t.actualStart = document.getElementById('tf-actualStart').value;
  t.actualEnd   = document.getElementById('tf-actualEnd').value;
  t.estHours  = parseFloat(document.getElementById('tf-hours').value) || 1;
  t.method    = document.getElementById('tf-method').value.trim();
  t.note      = document.getElementById('tf-note').value.trim();
  t.canSplit  = document.getElementById('tf-split').checked;
  const pgEl = document.getElementById('tf-pdcaGroup');
  if (pgEl) t.pdcaGroup = pgEl.value.trim();

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
    U.toast('目前沒有本地覆蓋的 J 系列時程');
    return;
  }
  if (!confirm(`確定要重置 ${list.length} 筆 J 系列任務的本地時程？此操作不可復原。`)) return;
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
  U.toast(`↺ 已重置 ${list.length} 筆 J 系列時程`);
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
        <input type="text" id="pf-name" value="${editing ? U.esc(editing.name) : ''}" placeholder="e.g. 熱泵水桶">
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
App.renderGantt = function() {
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
    document.getElementById('page-gantt').innerHTML = `
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

  const rowsHtml = sortedTasks.map(t => this.buildGanttRowHtml(t, start, days)).join('');

  document.getElementById('page-gantt').innerHTML = `
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

App.buildGanttRowHtml = function(task, start, days) {
  const proj = this.getProj(task.project);
  const colorIdx = proj ? PROJ_COLORS.indexOf(proj.color) : -1;
  const colorClass = ['bar-sage','bar-terracotta','bar-slate','bar-plum','bar-amber','bar-rose','bar-sage','bar-sage'][colorIdx % 8] || 'bar-sage';
  const sch = getEffectiveSchedule(task);
  const isMilestone = task.category === 'meeting' && sch.start === sch.end;
  const tsDate = new Date(sch.start || sch.end);
  const teDate = new Date(sch.end || sch.start);
  const tsIdx = D.daysBetween(start, tsDate);
  const teIdx = D.daysBetween(start, teDate);
  const startCol = Math.max(0, tsIdx);
  const endCol = Math.min(13, teIdx);
  const span = endCol - startCol + 1;

  if (startCol > 13 || endCol < 0) return '';

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
      <div class="gantt-bar milestone" style="left:50%; transform:translateX(-50%);" onclick="App.openTaskModal('${task.id}')"></div>
    </div>`;
  } else {
    html += `<div class="gantt-cell" style="grid-column: span ${span}; position:relative;">
      <div class="gantt-bar ${colorClass}" style="left:4px; right:4px; ${isPreview ? 'opacity:0.7;' : ''}" onclick="App.openTaskModal('${task.id}')">
        ${progress > 0 ? `<div class="progress" style="width:${progress}%;"></div>` : ''}
        ${U.esc(task.name)} <span class="pill">${progress}%</span>
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
App.renderMonth = function() {
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

  document.getElementById('page-month').innerHTML = `
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
  document.getElementById('page-report').innerHTML = html;
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
  workbook.creator = DATA.settings.userName || 'PM-Workspace';
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
    host.innerHTML = `<div class="empty-task-list"><div class="empty-task-list-icon">📊</div>尚無專案<br><span style="font-size:11px;">先到側欄「＋ 新增專案」建立</span></div>`;
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
    <div class="pdca-tabs">${tabsHtml}</div>
    ${this.buildPdcaPanelHtml(active)}
  `;
};

App.selectPdcaProject = function(id) {
  this.pdcaActiveProject = id;
  this.renderPdca();
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
        <div class="stat"><div class="stat-num">${pct(st.actual)}</div><div class="stat-label">實際進度</div></div>
        <div class="stat"><div class="stat-num">${pct(st.expected)}</div><div class="stat-label">預期進度</div></div>
        <div class="stat"><div class="stat-num">${diffStr}</div><div class="stat-label">差異</div></div>
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

// 大項目附加資料（唯讀取值，帶預設；實際寫入走 updatePdcaGroupMeta）
App.getPdcaGroupMeta = function(projectId, groupName) {
  const m = ((DATA.pdcaGroups || {})[projectId] || {})[groupName] || {};
  return { level: m.level || 'med', recoveryPlan: m.recoveryPlan || '', owner: m.owner || '', note: m.note || '' };
};

App.updatePdcaGroupMeta = function(el, field) {
  const projectId = el.dataset.pproj, groupName = el.dataset.pgroup;
  if (!projectId || groupName === undefined) return;
  ensurePdcaGroupsRoot();
  if (!DATA.pdcaGroups[projectId]) DATA.pdcaGroups[projectId] = {};
  const g = DATA.pdcaGroups[projectId][groupName] ||
    (DATA.pdcaGroups[projectId][groupName] = { level: 'med', recoveryPlan: '', owner: '', note: '' });
  g[field] = el.value;
  Storage.save();
};

App.togglePdcaSubtasks = function(btn) {
  const card = btn.closest('.pdca-group');
  if (!card) return;
  const list = card.querySelector('.pdca-subtasks');
  if (!list) return;
  const open = list.classList.toggle('open');
  btn.textContent = open ? '▴ 收合子任務' : '▾ 展開子任務';
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

  const subtasks = tasks.map(t => {
    const end = getEffectiveSchedule(t).end;
    const overdue = end && new Date(end) < today && t.status !== 'done';
    return `<div class="pdca-subtask">
      <span class="pst-name">${U.esc(t.name)}</span>
      <span class="pst-deadline ${overdue ? 'overdue' : ''}">${end ? D.fmt(end, 'ymdShort') : '—'}</span>
      <span class="pst-status">${LABELS.status[t.status] || t.status || ''}</span>
      <span class="pst-owner">${U.esc(t.owner || '')}</span>
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
      <label class="pgm-recovery">補回計畫
        <textarea rows="2" ${gAttr} onchange="App.updatePdcaGroupMeta(this, 'recoveryPlan')">${U.esc(meta.recoveryPlan)}</textarea>
      </label>
    </div>`;
  }

  return `<div class="pdca-group">
    <div class="pdca-group-head">
      <span class="pdca-group-light">${light}</span>
      <span class="pdca-group-name">${U.esc(name)}</span>
      <span class="pdca-group-progress">${done}/${total} 完成</span>
    </div>
    ${metaHtml}
    <button class="pdca-expand-btn" onclick="App.togglePdcaSubtasks(this)">▾ 展開子任務</button>
    <div class="pdca-subtasks">${subtasks || '<div class="pst-empty">無子任務</div>'}</div>
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

      <!-- Sync (J 系列同步：僅 admin 顯示) -->
      ${isAdmin() ? `
      <div class="settings-section" id="settings-jsync">
        <div class="ss-title">🔗 J 系列 WBS 同步 <span style="font-size:11px; background:var(--sage-100); color:var(--sage-700); padding:2px 8px; border-radius:10px; margin-left:8px;">👑 ADMIN</span></div>
        <div class="ss-desc">從公司「J 系列整合 WBS」Sheet 唯讀同步任務（每天 2 次 + 同步後自動執行智慧排程）<br>
          <span style="color:var(--ink4); font-size:11.5px;">⚠️ 僅限產品開發部使用，需 J 系列 Sheet 的讀取權限</span>
        </div>

        ${s.jSheetUrl ? `<div class="sync-status ${syncOk ? '' : 'error'}">
          <div class="sync-pulse"></div>
          <div class="sync-status-text">
            ${syncOk ? `<b>已同步</b> · ${log.count || 0} 個任務` : '<b>未同步</b> · 請點「立即同步」測試'}
          </div>
          <div class="sync-status-time">${syncOk ? D.fmt(new Date(log.syncedAt),'md') + ' ' + new Date(log.syncedAt).toTimeString().slice(0,5) : ''}</div>
        </div>` : ''}

        <div class="ss-field">
          <label>J 系列 Apps Script URL</label>
          <div>
            <input type="text" id="set-url" value="${U.esc(s.jSheetUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec  (J 系列 WBS API)" style="font-family:var(--mono); font-size:11px;">
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
          <button class="tb-action ghost" onclick="App.resetAllJOverrides()">↺ 重置所有 J 系列本地時程</button>
        </div>

        <div class="tip" style="margin-top:14px;">
          <b>同步邏輯說明：</b><br>
          • J 系列任務在 PM-Workspace 為<b>唯讀</b>，如需修改請至 Google Sheet<br>
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
          <div><input type="text" id="set-dept" value="${U.esc(s.department || '')}" placeholder="e.g. 產品開發部"></div>
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
              授權的 JavaScript 來源加入：<code style="background:var(--surface2); padding:1px 5px; border-radius:3px;">https://paulhsu02060.github.io</code>
            </div>
          </div>
        </div>
        ` : `
        <div style="padding:12px 14px; background:var(--surface2); border-radius:6px; font-size:12px; color:var(--ink3); line-height:1.6;">
          💡 你的資料以 Gmail 區分，完全獨立。<br>
          • 想跨裝置同步：到下方「☁ PM-Workspace 跨裝置同步」設定<br>
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
        <div class="ss-title">☁ PM-Workspace 跨裝置同步</div>
        <div class="ss-desc">透過你自己的 Google Sheet + Apps Script，把 PM-Workspace 個人資料同步到多台裝置<br>
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
            <input type="text" id="set-cloud-token" value="${U.esc(s.cloudSyncToken || 'pmw-paul-2026')}" placeholder="pmw-paul-2026" style="font-family:var(--mono); font-size:12px;">
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
          6. 在第二台裝置打開 PM-Workspace、設定一樣的 URL + Token → 自動同步 ✨
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
          <button class="tb-action ghost" onclick="App.dedupeTasks()">🧹 清除重複任務</button>
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
        </div>
        <div class="help" style="margin-top:8px;">
          💡「匯入週報 Excel」智慧合併：同名任務更新狀態/日期，新任務新增，PM 既有但 Excel 沒有的保留<br>
          💡「清除重複任務」把同專案 + 同任務名的舊紀錄合併到「歷史紀錄」中，只保留一筆主任務
        </div>
      </div>

      <!-- 關於 PM-Workspace -->
      <div class="settings-section">
        <div class="ss-title">ℹ️ 關於 PM-Workspace</div>
        <div style="display:grid; grid-template-columns: 130px 1fr; gap:10px 16px; font-size:13px; line-height:1.7; padding:8px 0;">
          <div style="color:var(--ink3);">版本</div>
          <div><b>v${APP_VERSION}</b> <span style="font-family:var(--mono); font-size:11px; color:var(--ink3); margin-left:8px;">${APP_BUILD_SIGNATURE}</span></div>
          <div style="color:var(--ink3);">作者</div>
          <div>${APP_AUTHOR}</div>
          <div style="color:var(--ink3);">共同開發</div>
          <div>Anthropic Claude (AI 協作)</div>
          <div style="color:var(--ink3);">開發歷程</div>
          <div style="color:var(--ink2); font-size:12.5px; line-height:1.6;">
            2026 年 5 月於 BingDian Air Tech 產品開發部開發。<br>
            從需求設計、架構規劃到功能迭代，全程由人工主導 + AI 協作完成。<br>
            完整 commit history 保存於 GitHub repo。
          </div>
          <div style="color:var(--ink3);">Repo</div>
          <div><a href="https://github.com/PaulHsu02060/pm-workspace-app" target="_blank" style="color:var(--sage-700); text-decoration:underline;">github.com/PaulHsu02060/pm-workspace-app</a></div>
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
          <input type="text" id="mtform-title" value="${U.esc(cur.title)}" placeholder="例：J 系列週會 / 輪值掃地">
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
        <br>• PM-Workspace 已有但 Excel 沒有的 → <b>保留不動</b>
      </div>

      <div style="margin-bottom:14px; padding:10px 14px; background:var(--surface2); border:1px solid var(--rule); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px;">
          <input type="checkbox" id="excelImportSkipJ" style="width:16px; height:16px; cursor:pointer;">
          <span><b>跳過 J 系列任務</b>（預設：不跳過，全部一起合併）</span>
        </label>
        <div style="font-size:11px; color:var(--ink3); margin-top:6px; margin-left:24px;">
          勾起 → J 系列由 Google Sheet 同步管理 / 不勾 → Excel 為準
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
            r.skipped = skipJ && r.projDisplay.includes('J系列');
          }
          App.renderExcelImportPreview();
        }
      });
    }
  }, 50);
};

App._excelParsedRows = [];

App.parseExcelImport = async function(file) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = [];

    // Normalize / map project name → display name
    function mapProj(name) {
      if (!name) return '';
      const s = String(name).trim().replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
      if (s.includes('J系列')) return 'J系列 WBS';
      if (s.includes('三菱')) return '三菱電梯冷氣';
      if (s.includes('10L') || s.includes('除濕')) return '10L除濕機';
      if (s.includes('熱泵') || s.includes('70') || s.includes('156')) return '70/156L熱泵';
      if (s.includes('VRF')) return 'VRF專案';
      if (s.includes('美國') || s.includes('G2')) return '美國向G2';
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
          skipped: (document.getElementById('excelImportSkipJ')?.checked && projDisplay.includes('J系列')) || false,
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
    `<b>${App._excelTotalWeeks}</b> 個週次　|　共 <b>${rows.length}</b> 筆　|　<b style="color:var(--sage-700);">${toImport}</b> 將匯入　|　<b style="color:var(--ink4);">${skipped}</b> J系列跳過　|　<b>${projects.size}</b> 個專案`;

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
    if (name.includes('J系列')) return '#4A7C5C';
    if (name.includes('三菱')) return '#C4633E';
    if (name.includes('10L')) return '#5C7A8B';
    if (name.includes('熱泵')) return '#8B5E73';
    if (name.includes('VRF')) return '#C4956C';
    if (name.includes('美國')) return '#B8504D';
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
  a.download = `pm-workspace-backup-${D.fmt(new Date(),'ymd').replace(/\//g,'-')}.json`;
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
    title: '🎉 歡迎使用 PM-Workspace',
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
            ⚙ 之後到「設定 → PM-Workspace 跨裝置同步」依步驟設定即可
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

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') App.closeModal();
    if (e.key === 'Enter' && e.target.id === 'loginPw') App.doLogin();
  });
});
