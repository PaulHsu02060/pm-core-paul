/* ═══════════════════════════════════════════════════════
   PM-Workspace · Main Application
   ═══════════════════════════════════════════════════════ */

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
  if (t.end) {
    const days = D.daysBetween(D.today(), new Date(t.end));
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

  // Mark meeting slots taken
  for (const meeting of DATA.meetings) {
    if (!meeting.date) continue;
    for (const slot of slots) {
      if (slot.date !== meeting.date) continue;
      // check overlap (simplified: any overlap = taken)
      const [sh] = slot.start.split(':').map(Number);
      const [mh] = (meeting.startTime || '00:00').split(':').map(Number);
      if (Math.abs(sh - mh) <= 1) slot.taken = true;
    }
  }

  // Preserve locked items from previous schedule
  const lockedItems = (DATA.schedule.items || []).filter(it => it.locked && it.week === weekKey);
  for (const item of lockedItems) {
    for (const slot of slots) {
      if (slot.date === item.date && slot.start === item.start) slot.taken = true;
    }
  }

  // Get tasks that need scheduling (active + has end date this week or earlier)
  const candidates = DATA.tasks
    .filter(t => t.status !== 'done' && t.status !== 'hold')
    .filter(t => {
      if (t.end) {
        const dl = new Date(t.end);
        return D.daysBetween(D.today(), dl) <= 21;
      }
      return true;
    });

  const sorted = sortTasks(candidates);

  // Schedule items
  const items = [...lockedItems];

  for (const task of sorted) {
    let hoursNeeded = parseFloat(task.estHours) || 1;
    const isDeep = task.category === 'deep' || !task.category;
    const canSplit = (task.canSplit !== false) && hoursNeeded >= splitThreshold;
    const chunks = canSplit ? Math.ceil(hoursNeeded / 2) : 1;
    const hoursPerChunk = canSplit ? hoursNeeded / chunks : hoursNeeded;

    let placed = 0;
    // try golden slots first for deep work
    const availableSlots = slots.filter(s => !s.taken);
    if (isDeep) availableSlots.sort((a, b) => (b.golden ? 1 : 0) - (a.golden ? 1 : 0));

    for (let i = 0; i < chunks && placed < chunks; i++) {
      const slot = availableSlots.find(s => !s.taken);
      if (!slot) break;
      slot.taken = true;
      items.push({
        taskId: task.id,
        date: slot.date,
        start: slot.start,
        duration: Math.min(hoursPerChunk, 1) * 60,
        chunk: chunks > 1 ? `${i + 1}/${chunks}` : null,
        week: weekKey,
        locked: false,
      });
      placed++;
    }
  }

  DATA.schedule = { week: weekKey, items, generatedAt: new Date().toISOString() };
  Storage.save();
  return { taskCount: candidates.length, scheduledCount: items.length - lockedItems.length, lockedCount: lockedItems.length };
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

      // Remove old synced tasks for this project
      DATA.tasks = DATA.tasks.filter(t => !(t.synced && t.project === jProj.id));

      // Add new tasks from sheet
      for (const row of data.tasks) {
        const task = {
          id: `sync_${jProj.id}_${row.n}`,
          project: jProj.id,
          synced: true,
          syncRef: `WBS#${row.n}`,
          name: row.name || `任務 ${row.n}`,
          desc: row.stage ? `${row.stage} / ${row.subgroup || ''}` : (row.subgroup || ''),
          owner: row.owner || '',
          start: row.plannedStart || '',
          end: row.plannedEnd || '',
          actualStart: row.actualStart || '',
          actualEnd: row.actualEnd || '',
          estHours: parseFloat(row.workdays || 0) * 6 || 4,
          category: row.type === '里程碑' ? 'meeting' : 'deep',
          urgency: deduceUrgency(row),
          status: mapStatus(row.status, row.progress),
          progress: parseFloat(row.progress || 0),
          note: row.note || '',
          locked: true, // synced items can't be edited
          completedAt: row.actualEnd || null,
        };
        DATA.tasks.push(task);
      }

      // Store sync log
      const syncedAt = new Date().toISOString();
      localStorage.setItem(STORE.syncLog, JSON.stringify({ syncedAt, count: data.tasks.length }));
      jProj.lastSync = syncedAt;

      Storage.save();
      if (!silent) {
        U.toast(`✅ J 系列已同步 (${data.tasks.length} 項任務)`, 'success');
        U.toast('🪄 自動執行智慧排程...', 'success');
      }
      // Auto-generate schedule
      setTimeout(() => {
        const result = generateSchedule();
        if (!silent) U.toast(`✨ 排程更新：${result.scheduledCount} 個任務已安排`);
        App.refreshAll();
      }, 800);
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
  },

  seedDefaultProjects() {
    const otherProj = {
      id: U.id(), name: '其他事項', color: '#5C7A8B',
      note: '預設專案，用於放置零散任務',
      synced: false,
      createdAt: new Date().toISOString(),
    };
    DATA.projects.push(otherProj);
    Storage.save();
  },

  refreshUserBadge() {
    const name = DATA.settings.userName || '使用者';
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  },

  updateWeekInfo() {
    const wk = D.weekNum();
    const r = D.weekRange();
    document.getElementById('weekInfo').textContent =
      `本週 W${wk} · ${D.fmt(r.start, 'md')} – ${D.fmt(r.end, 'md')}`;
  },

  // ─── LOGIN ───
  checkLoginState() {
    const hasPw = localStorage.getItem(STORE.password);
    if (!hasPw) {
      // First time, no password set
      const overlay = document.getElementById('loginOverlay');
      const hint = overlay.querySelector('.login-hint');
      if (hint) hint.innerHTML = '<b>首次使用</b>：請設定一組編輯密碼<br>之後拿到 URL 的人需要密碼才能編輯';
      const input = document.getElementById('loginPw');
      input.placeholder = '設定密碼（之後可改）';
    }
  },

  doLogin() {
    const input = document.getElementById('loginPw');
    const entered = input.value.trim();
    const stored = localStorage.getItem(STORE.password);

    if (!stored) {
      // First time - set password
      if (!entered) {
        // Allow empty password
        localStorage.setItem(STORE.password, '');
      } else {
        localStorage.setItem(STORE.password, U.hash(entered).toString());
      }
      document.body.classList.remove('viewonly');
      document.getElementById('loginOverlay').classList.add('hidden');
      U.toast(entered ? '✓ 密碼已設定' : '✓ 已登入（未設密碼）');
    } else {
      // Has password, verify
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
      settings:  '設定',
    };
    document.getElementById('pageTitle').textContent = titles[name] || name;
    document.getElementById('crumbPage').textContent = titles[name] || name;

    if (btn) {
      document.querySelectorAll('.sb-item, .sb-proj').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Render the active page
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
      const cnt = DATA.tasks.filter(t => t.project === p.id && t.status !== 'done').length;
      const isActive = this.currentPage === 'project' && this.currentProjectId === p.id;
      return `<button class="sb-proj ${isActive ? 'active' : ''}" onclick="App.openProject('${p.id}', this)">
        <span class="dot" style="background:${p.color}"></span>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;">${U.esc(p.name)}</span>
        ${p.synced ? '<span class="sync-ico">🔗</span>' : ''}
        <span class="count">${cnt}</span>
      </button>`;
    }).join('');

    // Update sync info display
    const log = JSON.parse(localStorage.getItem(STORE.syncLog) || '{}');
    const syncInfo = document.getElementById('syncInfo');
    if (log.syncedAt) {
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
  const wk = D.weekKey();
  const weekRange = D.weekRange();
  const monday = D.monday();

  // Stats
  const activeTasks = DATA.tasks.filter(t => t.status !== 'done' && t.status !== 'hold');
  const wipTasks = DATA.tasks.filter(t => t.status === 'wip');
  const urgentTasks = activeTasks.filter(t => {
    if (t.urgency === 'high') return true;
    if (t.end && D.daysBetween(D.today(), new Date(t.end)) <= 1) return true;
    return false;
  });
  const totalHours = (DATA.schedule.items || [])
    .filter(it => it.week === wk)
    .reduce((s, it) => s + (it.duration / 60), 0);
  const availableHours = DATA.settings.dailyHours * DATA.settings.workDays.length;

  // Week schedule build
  const scheduleHtml = this.buildWeekScheduleHtml();

  // Stats row
  const statsHtml = `<div class="stats-row">
    <div class="stat">
      <div class="stat-num">${activeTasks.length}</div>
      <div class="stat-label">本週任務</div>
    </div>
    <div class="stat">
      <div class="stat-num">${wipTasks.length}</div>
      <div class="stat-label">進行中</div>
    </div>
    <div class="stat stat-urgent" onclick="App.showUrgentModal()" title="點擊查看緊急任務">
      <div class="stat-num">${urgentTasks.length}</div>
      <div class="stat-label">緊急 ↗</div>
      ${urgentTasks.length > 0 ? `<div class="stat-trend">點擊查看</div>` : ''}
    </div>
    <div class="stat">
      <div class="stat-num">${Math.round(totalHours)}h</div>
      <div class="stat-label">本週工時 / ${availableHours}h</div>
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
            <div class="card-title">本週時程表</div>
            <div class="card-sub">${D.fmt(weekRange.start, 'ymd')} – ${D.fmt(weekRange.end, 'md')}</div>
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
            <span class="legend-item"><span class="legend-sw" style="background:var(--slate)"></span>會議</span>
            <span style="margin-left:auto; font-size:10.5px;">🔒 已鎖定（重新產生時不會被覆蓋）</span>
          </div>
        </div>
      </div>
      ${memoHtml}
    </div>
  `;
  this.attachMemoDrag();
};

App.buildWeekScheduleHtml = function() {
  const monday = D.monday();
  const wk = D.weekKey();
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
  const hours = [9, 10, 11, 14, 15, 16, 17];
  const items = (DATA.schedule.items || []).filter(it => it.week === wk);
  const meetings = DATA.meetings.filter(m => {
    if (!m.date) return false;
    const md = new Date(m.date);
    return D.daysBetween(monday, md) >= 0 && D.daysBetween(monday, md) <= 6;
  });

  for (const hr of hours) {
    html += `<div class="ws-time-col">${String(hr).padStart(2,'0')}:00</div>`;
    for (let i = 0; i < 5; i++) {
      const d = D.addDays(monday, i);
      const dateIso = D.fmt(d, 'iso');
      const hrStr = `${String(hr).padStart(2,'0')}:00`;

      // Find items at this slot
      const item = items.find(it => it.date === dateIso && it.start === hrStr);
      const meeting = meetings.find(m => {
        if (m.date !== dateIso) return false;
        const [mh] = (m.startTime || '').split(':').map(Number);
        return mh === hr;
      });

      html += '<div class="ws-cell">';
      if (item) {
        const task = DATA.tasks.find(t => t.id === item.taskId);
        if (task) {
          const cat = task.category || 'deep';
          html += `<div class="ws-event ${cat} ${item.locked ? 'locked' : ''}" style="top:0;height:60px;" onclick="App.openTaskModal('${task.id}')">
            ${item.locked ? '<span class="lock-ico">🔒</span>' : ''}
            <b>${U.esc(task.name).slice(0, 20)}</b>
            <div class="ev-meta">${(item.duration/60).toFixed(1)}h${item.chunk ? ' · ' + item.chunk : ''}</div>
          </div>`;
        }
      } else if (meeting) {
        html += `<div class="ws-event meeting" style="top:0;height:32px;">
          <b>${U.esc(meeting.title).slice(0, 14)}</b>
          <div class="ev-meta">${meeting.startTime || ''}</div>
        </div>`;
      }
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
};

App.buildMemoListHtml = function() {
  if (DATA.memos.length === 0) {
    return '<div style="text-align:center; padding:60px 20px; color:var(--ink3); font-size:13px;">尚無便利貼<br><span style="font-size:11px;">點右上「＋ 新增」加一張</span></div>';
  }
  return DATA.memos.map(m => `
    <div class="memo" style="background:var(--${m.color}); top:${m.x}px; left:${m.y}px; transform:rotate(${m.rotate}deg);" data-id="${m.id}">
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

App.deleteMemo = function(id) {
  if (!confirm('刪除這張便利貼？')) return;
  DATA.memos = DATA.memos.filter(m => m.id !== id);
  Storage.save();
  this.renderDashboard();
};

App.showUrgentModal = function() {
  const urgent = DATA.tasks
    .filter(t => t.status !== 'done' && t.status !== 'hold')
    .filter(t => t.urgency === 'high' || (t.end && D.daysBetween(D.today(), new Date(t.end)) <= 1));

  const sorted = sortTasks(urgent);
  const body = sorted.length === 0 ?
    '<div style="text-align:center; padding:32px 0; color:var(--ink3);">目前沒有緊急任務 🎉</div>' :
    sorted.map(t => {
      const proj = this.getProj(t.project);
      let dlText = '無 deadline';
      if (t.end) {
        const days = D.daysBetween(D.today(), new Date(t.end));
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

  const tasks = this.getTasksOf(proj.id);
  const activeTasks = sortTasks(tasks.filter(t => t.status !== 'done'));
  const doneTasks = tasks.filter(t => t.status === 'done').sort((a,b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

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
            <span style="font-size:11px; color:var(--ink3); margin-left:auto;">依優先順序排列</span>
          </div>
          <div id="activeTaskList">
            ${activeTasks.length === 0 ?
              '<div class="empty-task-list"><div class="empty-task-list-icon">📝</div>尚無待辦任務</div>' :
              activeTasks.map(t => this.buildTaskRowHtml(t)).join('')
            }
          </div>
          ${!proj.synced ? `<div class="list-foot">
            <input id="quickAddTask" placeholder="＋ 快速新增任務（按 Enter 完成）" data-edit
                   onkeydown="if(event.key==='Enter') App.quickAddTask('${proj.id}', this)">
            <button data-edit onclick="App.quickAddTask('${proj.id}', document.getElementById('quickAddTask'))">新增</button>
          </div>` : ''}
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

App.buildTaskRowHtml = function(t) {
  const cat = t.category || 'deep';
  const isPreview = !DATA.settings.previewWeeks ? false : (
    t.end && D.daysBetween(D.today(), new Date(t.end)) > 7 && D.daysBetween(D.today(), new Date(t.end)) <= (DATA.settings.previewWeeks * 7)
  );
  let dlText = '—';
  let dlClass = '';
  if (t.end) {
    const days = D.daysBetween(D.today(), new Date(t.end));
    if (days < 0)      { dlText = `逾期 ${-days} 天`; dlClass = 'overdue'; }
    else if (days === 0) { dlText = '今日'; dlClass = 'near'; }
    else if (days === 1) { dlText = '明日'; dlClass = 'near'; }
    else if (days <= 3)  { dlText = `${days} 天後`; dlClass = 'near'; }
    else                 { dlText = D.fmt(new Date(t.end), 'md'); }
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
    <span class="task-deadline ${dlClass}">${dlText}</span>
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

// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT — Quick add + task modal + screenshot OCR
// ═══════════════════════════════════════════════════════
App.quickAddTask = function(projId, input) {
  const name = input.value.trim();
  if (!name) return;
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

App.openTaskModal = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;

  // For synced tasks: read-only view
  if (t.locked) {
    const proj = this.getProj(t.project);
    this.openModal({
      title: `🔗 ${U.esc(t.name)}`,
      body: `
        <div style="font-size:12px; color:var(--ink3); margin-bottom:12px; padding:8px 12px; background:var(--sage-50); border-radius:8px;">
          此任務由 Google Sheet 同步，<b>唯讀</b>。如需修改請到 sheet 編輯。
        </div>
        <div class="form-field"><label>所屬專案</label><div style="padding:8px 0; font-size:13px;">${U.esc(proj?.name || '')}</div></div>
        <div class="form-field"><label>WBS 編號</label><div style="padding:8px 0; font-family:var(--mono);">${U.esc(t.syncRef || '')}</div></div>
        <div class="form-field"><label>說明</label><div style="padding:8px 0;">${U.esc(t.desc || '—')}</div></div>
        <div class="form-row">
          <div class="form-field"><label>擔當</label><div style="padding:8px 0;">${U.esc(t.owner || '—')}</div></div>
          <div class="form-field"><label>進度</label><div style="padding:8px 0; font-weight:600;">${t.progress || 0}%</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>預計開始</label><div style="padding:8px 0; font-family:var(--mono);">${t.start ? D.fmt(t.start, 'ymdShort') : '—'}</div></div>
          <div class="form-field"><label>預計完成</label><div style="padding:8px 0; font-family:var(--mono);">${t.end ? D.fmt(t.end, 'ymdShort') : '—'}</div></div>
        </div>
        ${t.actualStart || t.actualEnd ? `
        <div class="form-row">
          <div class="form-field"><label>實際開始</label><div style="padding:8px 0; font-family:var(--mono);">${t.actualStart ? D.fmt(t.actualStart, 'ymdShort') : '—'}</div></div>
          <div class="form-field"><label>實際完成</label><div style="padding:8px 0; font-family:var(--mono);">${t.actualEnd ? D.fmt(t.actualEnd, 'ymdShort') : '—'}</div></div>
        </div>` : ''}
        <div class="form-field"><label>狀態</label><div style="padding:8px 0;">${LABELS.status[t.status] || t.status}</div></div>
      `,
      footer: '<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>',
    });
    return;
  }

  // Editable task
  const projectOptions = DATA.projects.filter(p => !p.synced).map(p =>
    `<option value="${p.id}" ${t.project === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`
  ).join('');

  this.openModal({
    title: '編輯任務',
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
        <select id="tf-project">${projectOptions}</select>
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
        <div class="form-field"><label>預計開始</label><input type="date" id="tf-start" value="${t.start || ''}"></div>
        <div class="form-field"><label>預計完成 / Deadline</label><input type="date" id="tf-end" value="${t.end || ''}"></div>
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
  t.project   = document.getElementById('tf-project').value;
  t.owner     = document.getElementById('tf-owner').value.trim();
  t.category  = document.getElementById('tf-category').value;
  t.urgency   = document.getElementById('tf-urgency').value;
  t.start     = document.getElementById('tf-start').value;
  t.end       = document.getElementById('tf-end').value;
  t.estHours  = parseFloat(document.getElementById('tf-hours').value) || 1;
  t.method    = document.getElementById('tf-method').value.trim();
  t.note      = document.getElementById('tf-note').value.trim();
  t.canSplit  = document.getElementById('tf-split').checked;

  const newStatus = document.getElementById('tf-status').value;
  if (newStatus === 'done' && t.status !== 'done') t.completedAt = new Date().toISOString();
  if (newStatus !== 'done') t.completedAt = null;
  t.status = newStatus;

  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已儲存');
};

App.deleteTask = function(id) {
  if (!confirm('確定要刪除這個任務？')) return;
  DATA.tasks = DATA.tasks.filter(t => t.id !== id);
  Storage.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已刪除');
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
  const tasks = DATA.tasks.filter(t => {
    if (t.status === 'hold') return false;
    if (!t.start && !t.end) return false;
    // Check if range overlaps
    const ts = t.start ? new Date(t.start) : new Date(t.end);
    const te = t.end ? new Date(t.end) : new Date(t.start);
    return te >= start && ts <= endDay;
  });

  if (tasks.length === 0) {
    document.getElementById('page-gantt').innerHTML = `
      <div class="gantt-card">
        ${this.buildGanttHeaderHtml(days)}
        <div class="empty-task-list" style="grid-column: 1 / -1;">
          <div class="empty-task-list-icon">📊</div>
          目前沒有有日期的任務可顯示<br>
          <span style="font-size:11px;">為任務設定「預計開始」「預計完成」後會出現在這裡</span>
        </div>
      </div>`;
    return;
  }

  // Build rows
  const sortedTasks = tasks.sort((a, b) => {
    const aStart = new Date(a.start || a.end);
    const bStart = new Date(b.start || b.end);
    return aStart - bStart;
  });

  const rowsHtml = sortedTasks.map(t => this.buildGanttRowHtml(t, start, days)).join('');

  document.getElementById('page-gantt').innerHTML = `
    <div class="gantt-card">
      ${this.buildGanttHeaderHtml(days)}
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

App.buildGanttRowHtml = function(task, start, days) {
  const proj = this.getProj(task.project);
  const colorIdx = proj ? PROJ_COLORS.indexOf(proj.color) : -1;
  const colorClass = ['bar-sage','bar-terracotta','bar-slate','bar-plum','bar-amber','bar-rose','bar-sage','bar-sage'][colorIdx % 8] || 'bar-sage';
  const isMilestone = task.category === 'meeting' && task.start === task.end;
  const tsDate = new Date(task.start || task.end);
  const teDate = new Date(task.end || task.start);
  const tsIdx = D.daysBetween(start, tsDate);
  const teIdx = D.daysBetween(start, teDate);
  const startCol = Math.max(0, tsIdx);
  const endCol = Math.min(13, teIdx);
  const span = endCol - startCol + 1;

  if (startCol > 13 || endCol < 0) return '';

  // Row label
  let html = `<div class="gantt-row-label">
    <span class="dot" style="background:${proj?.color || '#888'}"></span>
    <span class="gantt-row-label-text">${U.esc(task.name)}${task.synced ? ' 🔗' : ''}</span>
  </div>`;

  // Empty cells before
  for (let i = 0; i < startCol; i++) {
    const d = days[i];
    html += `<div class="gantt-cell ${D.isWeekend(d) ? 'weekend' : ''} ${D.isSameDay(d, D.today()) ? 'today' : ''}"></div>`;
  }

  // Bar cell
  const isPreview = task.end && D.daysBetween(D.today(), new Date(task.end)) > 7 && D.daysBetween(D.today(), new Date(task.end)) <= 14;
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
    const taskDeadlines = DATA.tasks.filter(t => t.end === dateIso && t.status !== 'done');
    const scheduleItems = (DATA.schedule.items || []).filter(it => it.date === dateIso);

    let evtsHtml = '';
    // Meetings
    for (const m of meetings.slice(0, 2)) {
      evtsHtml += `<div class="month-evt meeting" title="${U.esc(m.title)}">${U.esc(m.startTime || '')} ${U.esc(m.title).slice(0, 6)}</div>`;
    }
    // Task deadlines (urgent/preview)
    for (const t of taskDeadlines.slice(0, 2)) {
      const days = D.daysBetween(today, new Date(t.end));
      const isPreview = days > 7 && days <= 14;
      const cls = days <= 3 ? 'rust-evt' : isPreview ? 'preview' : 'deep';
      evtsHtml += `<div class="month-evt ${cls}" title="${U.esc(t.name)}" onclick="event.stopPropagation(); App.openTaskModal('${t.id}')">${U.esc(t.name).slice(0, 8)}</div>`;
    }
    const totalEvts = meetings.length + taskDeadlines.length;
    if (totalEvts > 4) {
      evtsHtml += `<div style="font-size:9px; color:var(--ink3); font-family:var(--mono);">+ ${totalEvts - 4} 個</div>`;
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

  // Gather tasks completed/active during this week
  const inWeekTasks = DATA.tasks.filter(t => {
    if (t.status === 'done' && t.completedAt) {
      const cd = new Date(t.completedAt);
      if (cd >= monday && cd <= D.addDays(sunday, 1)) return true;
    }
    // active tasks with deadline in/around this week
    if (t.status !== 'done' && t.status !== 'hold') {
      if (t.end) {
        const ed = new Date(t.end);
        if (ed >= monday && ed <= D.addDays(sunday, 14)) return true;
      } else if (t.start) {
        const sd = new Date(t.start);
        if (sd >= monday && sd <= sunday) return true;
      }
    }
    return false;
  });

  // Summary
  const totalCnt = inWeekTasks.length;
  const doneCnt = inWeekTasks.filter(t => t.status === 'done').length;
  const wipCnt = inWeekTasks.filter(t => t.status === 'wip').length;
  const lateCnt = inWeekTasks.filter(t => {
    if (t.status === 'done') return false;
    return t.end && new Date(t.end) < D.today();
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
                const prog = t.progress || (t.status === 'done' ? 100 : t.status === 'wip' ? 30 : 0);
                const progClass = t.status === 'done' ? 'done' : (t.end && new Date(t.end) < D.today() && t.status !== 'done') ? 'late' : 'wip';
                let stateText = '', stateClass = 'wip';
                if (t.status === 'done') {
                  stateClass = 'done';
                  stateText = `✓ ${t.completedAt ? D.fmt(t.completedAt, 'md') + ' 完成' : '已完成'}`;
                } else if (t.end && new Date(t.end) < D.today()) {
                  stateClass = 'late';
                  stateText = `⚠ 延遲 ${-D.daysBetween(D.today(), new Date(t.end)) + 1} 天`;
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
                  <td class="rp-date">${t.start ? D.fmt(t.start, 'ymdShort') : '—'}</td>
                  <td class="rp-date">${t.end ? D.fmt(t.end, 'ymdShort') : '—'}</td>
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

App.exportReportExcel = function(weekKey) {
  // Find monday/sunday for the week
  const m = weekKey.match(/W(\d+)-(\d+)/);
  if (!m) return;
  const wk = parseInt(m[1]), yr = parseInt(m[2]);
  const jan4 = new Date(yr, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const w1Monday = D.addDays(jan4, -jan4Day);
  const monday = D.addDays(w1Monday, (wk - 1) * 7);
  const sunday = D.addDays(monday, 6);

  // Gather tasks
  const inWeekTasks = DATA.tasks.filter(t => {
    if (t.status === 'done' && t.completedAt) {
      const cd = new Date(t.completedAt);
      if (cd >= monday && cd <= D.addDays(sunday, 1)) return true;
    }
    if (t.status !== 'done' && t.status !== 'hold') {
      if (t.end) {
        const ed = new Date(t.end);
        if (ed >= monday && ed <= D.addDays(sunday, 14)) return true;
      }
    }
    return false;
  });

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['週報', `W${wk}`, '', '日期', `${D.fmt(monday,'ymd')} – ${D.fmt(sunday,'ymd')}`],
    ['', '', '', '製作人', DATA.settings.userName || ''],
    ['', '', '', '部門', DATA.settings.department || ''],
    [],
    ['📊 統計'],
    ['本週任務', inWeekTasks.length],
    ['已完成', inWeekTasks.filter(t => t.status === 'done').length],
    ['進行中', inWeekTasks.filter(t => t.status === 'wip').length],
    ['延遲', inWeekTasks.filter(t => t.status !== 'done' && t.end && new Date(t.end) < D.today()).length],
    ['總工時', inWeekTasks.reduce((s,t) => s + (t.estHours||0), 0) + 'h'],
    [],
    ['📝 額外備註', DATA.weekNotes[weekKey] || ''],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{wch:18},{wch:30},{wch:5},{wch:14},{wch:30}];
  XLSX.utils.book_append_sheet(wb, wsSummary, '週報摘要');

  // Group by project
  const projectGroups = {};
  for (const t of inWeekTasks) {
    if (!projectGroups[t.project]) projectGroups[t.project] = [];
    projectGroups[t.project].push(t);
  }

  // All tasks sheet
  const allData = [['#', '專案', '任務', '說明', '擔當', '分類', '緊急', '預計開始', '預計完成', '實際完成', '工時', '進度%', '狀態', '本週狀況', '備註']];
  let idx = 1;
  for (const [projId, tasks] of Object.entries(projectGroups)) {
    const proj = this.getProj(projId);
    for (const t of tasks) {
      const prog = t.progress || (t.status === 'done' ? 100 : t.status === 'wip' ? 30 : 0);
      let state = '';
      if (t.status === 'done') state = `✓ ${t.completedAt ? D.fmt(t.completedAt,'md') + ' 完成' : '完成'}`;
      else if (t.end && new Date(t.end) < D.today()) state = `⚠ 延遲`;
      else state = '進行中';
      allData.push([
        idx++,
        proj?.name || '',
        t.name,
        t.desc || '',
        t.owner || '',
        LABELS.category[t.category || 'deep'],
        LABELS.urgency[t.urgency || 'medium'],
        t.start ? D.fmt(t.start,'ymd') : '',
        t.end ? D.fmt(t.end,'ymd') : '',
        t.actualEnd ? D.fmt(t.actualEnd,'ymd') : '',
        t.estHours || '',
        prog,
        LABELS.status[t.status] || '',
        state,
        t.note || '',
      ]);
    }
  }
  const wsAll = XLSX.utils.aoa_to_sheet(allData);
  wsAll['!cols'] = [{wch:5},{wch:14},{wch:32},{wch:24},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12},{wch:7},{wch:7},{wch:9},{wch:18},{wch:24}];
  XLSX.utils.book_append_sheet(wb, wsAll, '全部任務');

  // Per-project sheets
  for (const [projId, tasks] of Object.entries(projectGroups)) {
    const proj = this.getProj(projId);
    if (!proj) continue;
    const projData = [['#', '任務', '說明', '擔當', '分類', '緊急', '預計開始', '預計完成', '實際完成', '工時', '進度%', '狀態', '本週狀況', '備註']];
    tasks.forEach((t, i) => {
      const prog = t.progress || (t.status === 'done' ? 100 : t.status === 'wip' ? 30 : 0);
      let state = '';
      if (t.status === 'done') state = `✓ ${t.completedAt ? D.fmt(t.completedAt,'md') + ' 完成' : '完成'}`;
      else if (t.end && new Date(t.end) < D.today()) state = `⚠ 延遲`;
      else state = '進行中';
      projData.push([
        i + 1,
        t.name,
        t.desc || '',
        t.owner || '',
        LABELS.category[t.category || 'deep'],
        LABELS.urgency[t.urgency || 'medium'],
        t.start ? D.fmt(t.start,'ymd') : '',
        t.end ? D.fmt(t.end,'ymd') : '',
        t.actualEnd ? D.fmt(t.actualEnd,'ymd') : '',
        t.estHours || '',
        prog,
        LABELS.status[t.status] || '',
        state,
        t.note || '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(projData);
    ws['!cols'] = [{wch:5},{wch:32},{wch:24},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12},{wch:7},{wch:7},{wch:9},{wch:18},{wch:24}];
    // Use safe sheet name (max 31 chars, no special chars)
    const safeName = (proj.name + '').replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  const filename = `週報_W${wk}_${D.fmt(monday,'ymd').replace(/\//g,'-')}.xlsx`;
  XLSX.writeFile(wb, filename);
  U.toast(`✓ 已下載 ${filename}`);
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

      <!-- Sync -->
      <div class="settings-section">
        <div class="ss-title">🔗 Google Sheets 同步</div>
        <div class="ss-desc">從 J 系列 WBS 自動同步任務資料（唯讀，每天 2 次 + 同步後自動執行智慧排程）</div>

        ${s.jSheetUrl ? `<div class="sync-status ${syncOk ? '' : 'error'}">
          <div class="sync-pulse"></div>
          <div class="sync-status-text">
            ${syncOk ? `<b>已同步</b> · ${log.count || 0} 個任務` : '<b>未同步</b> · 請點「立即同步」測試'}
          </div>
          <div class="sync-status-time">${syncOk ? D.fmt(new Date(log.syncedAt),'md') + ' ' + new Date(log.syncedAt).toTimeString().slice(0,5) : ''}</div>
        </div>` : ''}

        <div class="ss-field">
          <label>Apps Script URL</label>
          <div>
            <input type="text" id="set-url" value="${U.esc(s.jSheetUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" style="font-family:var(--mono); font-size:11px;">
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

        <div style="margin-top:12px;">
          <button class="tb-action" onclick="App.saveAndSync()">↻ 儲存設定並立即同步</button>
        </div>

        <div class="tip" style="margin-top:14px;">
          <b>同步邏輯說明：</b><br>
          • J 系列任務在 PM-Workspace 為<b>唯讀</b>，如需修改請至 Google Sheet<br>
          • 衝突原則：<b>以 Sheet 為準</b>，本地修改會被覆蓋<br>
          • 同步完成後<b>自動執行智慧排程</b>，確保資料一致<br>
          • 已完成任務同步進「已完成」區，超過 ${s.doneRetentionDays} 天自動清除
        </div>
      </div>

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

      <!-- Password -->
      <div class="settings-section">
        <div class="ss-title">🔒 編輯密碼</div>
        <div class="ss-desc">防止拿到 URL 的人隨意修改</div>

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

        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="tb-action ghost" onclick="App.backupAll()">⬇ 下載 JSON 備份</button>
          <button class="tb-action ghost" onclick="document.getElementById('restoreInput').click()">📥 上傳還原</button>
          <input type="file" id="restoreInput" accept=".json" style="display:none" onchange="App.restoreAll(this.files[0])">
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
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

  Storage.save();
  this.refreshUserBadge();
  U.toast('✓ 設定已儲存');
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
