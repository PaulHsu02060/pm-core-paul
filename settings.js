// settings.js — 設定頁(行事曆/安全/雲端同步/登出)+ 備份還原(App.*)。app.js 之後載入；TDZ 鐵則見 docs §18.7.1。
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
  if (id === '資料與備份') App._loadBackupPanel();   // §17：進 tab 才拉備份設定 + 快照清單
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

// ─── 安全防護網（設定→安全 tab，給 MIS/主管審閱）───────────────
//   資料驅動：文案集中此物件，Gemini 潤稿後只改這裡的字串、不動版面/render。
//   ⚠ 每項都對應實際 code/後端，禁浮報——改文案前先核對對應機制（§8f 權限、§14 雲端授權、§8f.6 硬化）。
const SECURITY_INFO = {
  principle: '系統安全界線鎖在「後端授權」，不依賴隱藏前端程式碼。前端公開（GitHub Pages）屬正常——未通過後端授權，即使取得程式碼也讀不到任何資料。',
  groups: [
    { title: '🔑 身分驗證', items: [
      { name: 'Google 帳號登入（OAuth 2.0），不自建密碼', desc: '系統內不存任何密碼，消滅密碼庫外洩風險；沿用 Google 企業級身分驗證（含雙重驗證）。' },
      { name: '後端簽章嚴格校對', desc: '後端在讀寫資料時向 Google 官方端點重驗 id_token 的簽章真偽、受眾（aud）與 Email 驗證狀態，偽造或過期 Token 一律封鎖。' },
    ]},
    { title: '🛡 授權（系統的真正防線）', items: [
      { name: '四層權限白名單', desc: 'SuperAdmin / Admin / Editor / Viewonly；不在名單者預設無權限、完全無法進入系統。' },
      { name: '後端強制授權閘', desc: '權限不由前端判定。即使直接叫用 API，後端皆依身分反查：讀取 ≥ Viewonly、寫入 ≥ Editor、改名單限 Admin、改 Admin 名單限 SuperAdmin（防自我提權）。' },
      { name: '失敗即關閉（Fail-Closed）', desc: '驗證流程一發生非預期錯誤（連線逾時／回應異常），預設判定「無權限」直接擋下，絕不放行。' },
    ]},
    { title: '🔒 防竄改機制', items: [
      { name: '最高權限死鎖', desc: 'SuperAdmin 由後端環境變數（Script Properties）指定，前端不提供任何可改寫最高權限的介面或管道。' },
      { name: '唯讀模式咽喉', desc: 'Viewonly 帳號在「本機存檔」與「上傳雲端」兩處後端接口皆被硬編碼攔阻，只能檢視、無法修改或外傳。' },
    ]},
    { title: '📦 資料保護與隱私', items: [
      { name: '機密與前端抽離', desc: '白名單 Email、資料表位置均存於後端，公開程式碼不含任何敏感設定；本機機密檔不進版本控制。' },
      { name: '登入前零資料載入', desc: '資料僅在通過後端驗證後才下載至瀏覽器；未授權者即使打開開發者工具（F12），網頁背後也無資料可讀。' },
      { name: '登出即清空快取', desc: '登出時立即銷毀本機快取；資料以雲端為唯一真實來源、未登入不寫入任何資料，防裝置遺失外洩。' },
      { name: '上傳自動剝除個資', desc: '同步至雲端時自動剔除使用者 Email、頭像與角色資訊，落實資料最小化。' },
      { name: '憑證不落地、短時效', desc: 'Google 身分憑證僅留存於記憶體且時效極短，本機不存放長期存取憑證。' },
    ]},
    { title: '🔐 傳輸安全', items: [
      { name: '全程 HTTPS 加密', desc: '網頁與後端 API 之間所有通訊強制加密傳輸。' },
    ]},
  ],
  positioning: '本系統屬「Google 身分驗證 ＋ 後端授權的內部工具」等級，防護強度與多數 SaaS 內部後台同級（非國防／零信任架構）。',
  limits: [
    '被授權的合法使用者，在其權限範圍內本就能檢視並匯出他被允許的資料（由權限分級與人員管理控管）。',
    '資料同步採整份覆蓋、目前不做欄位級合併；單人輪流編輯安全，多人同時編輯存在覆蓋風險。',
  ],
  roadmap: [
    '全域定期備份與一鍵還原機制（對抗誤刪、覆蓋與資料損壞）。',
  ],
};

// 安全 tab 內層 HTML（由 SECURITY_INFO 渲染；版面固定、文字吃資料）
App._securityTabHtml = function() {
  const grp = g => `
    <div class="settings-section">
      <div class="ss-title">${g.title}</div>
      <ol class="sec-list">
        ${g.items.map(it => `<li><b>${U.esc(it.name)}</b>：${U.esc(it.desc)}</li>`).join('')}
      </ol>
    </div>`;
  // 雙欄黃金對稱（建議一）：分組順序固定＝身分驗證／授權／防竄改／資料保護／傳輸
  const [identity, authz, antitamper, dataprot, transport] = SECURITY_INFO.groups;
  return `<div class="sec-wrap">
    <div class="settings-section sec-banner">
      <div class="ss-title">🛡 安全防護網</div>
      <div class="ss-desc" style="margin-bottom:0;">${U.esc(SECURITY_INFO.principle)}</div>
    </div>
    <div class="sec-cols">
      <div class="sec-col">${grp(identity)}${grp(authz)}</div>
      <div class="sec-col">${grp(antitamper)}${grp(transport)}</div>
    </div>
    ${grp(dataprot)}
    <div class="settings-section">
      <div class="ss-title">📋 定位與範圍（誠實揭露，供 MIS 評估）</div>
      <div class="sec-sub">定位</div>
      <div class="sec-pos">${U.esc(SECURITY_INFO.positioning)}</div>
      <div class="sec-sub">既有限制（任何 Web 系統共通）</div>
      <ul class="sec-ul">${SECURITY_INFO.limits.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
      <div class="sec-sub">規劃中強化</div>
      <ul class="sec-ul">${SECURITY_INFO.roadmap.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
    </div>
  </div>`;
};

App.renderSettings = function() {
  if (!isAdmin()) return;
  App._settingsDirty = false;   // 修正3：重繪＝乾淨狀態
  App._bindSettingsDirty();
  const s = DATA.settings;

  document.getElementById('page-settings').innerHTML = `
    <div class="tabs" style="margin-bottom:18px;">
      <button class="tab-btn active" onclick="App.showSettingsTab(this,'排程')">排程</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料與備份')">資料與備份</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'編輯權限')">編輯權限</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'安全')">🛡 安全</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'關於')">關於</button>
    </div>

    <div class="tab-panel active" id="排程"><div class="settings-grid">
      <!-- 工時設定（全系統單一來源，§18.10）-->
      <div class="settings-section">
        <div class="ss-title">⏱ 工時設定</div>
        <div class="ss-desc">全系統工時換算的單一來源：WBS 任務工時(estHours)、部門負載與容量線、個人雜事佔比皆依此；「每週工作日」另決定哪幾天算工作日（排程日期推算依此）。變更時會提示影響範圍。</div>
        <div class="form-field" style="max-width:180px;"><label>每日工時 (h)</label>
          <input type="number" id="set-hours" min="1" max="24" step="0.5" value="${s.dailyHours}">
        </div>
        <div class="form-field" style="margin-top:14px;"><label>每週工作日</label>
          <div id="dayPills" class="day-pills">${[[1,'一'],[2,'二'],[3,'三'],[4,'四'],[5,'五'],[6,'六'],[0,'日']].map(p => `<button type="button" class="day-pill${(s.workDays || []).includes(p[0]) ? ' on' : ''}" data-day="${p[0]}" onclick="this.classList.toggle('on');App._settingsDirty=true">${p[1]}</button>`).join('')}</div>
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
      <!-- /排程 --></div></div>
    <div class="tab-panel" id="資料與備份"><div class="settings-grid">
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

      <!-- 雲端每日備份（§17，訪客唯讀時隱藏） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">🕓 雲端每日備份</div>
        <div class="ss-desc">後端每天自動把雲端資料存成帶日期快照，不需開著網頁；誤刪或故障可回溯還原。設定存後端、admin 才能改。</div>
        <div class="ss-field">
          <label>啟用每日備份</label>
          <div><select id="set-backup-enabled" style="width:160px;"><option value="true">啟用</option><option value="false">停用</option></select></div>
        </div>
        <div class="ss-field">
          <label>備份時間</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; color:var(--ink3);">每天</span>
            <select id="set-backup-hour" style="width:90px;">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}</option>`).join('')}</select>
            <span style="font-size:13px; color:var(--ink3);">時（台灣時間）</span>
          </div>
        </div>
        <div class="ss-field">
          <label>保留天數</label>
          <div><select id="set-backup-retention" style="width:160px;"><option value="14">14 天</option><option value="30">30 天</option><option value="60">60 天</option></select></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; align-items:center; flex-wrap:wrap;">
          <button class="tb-action" onclick="App.saveBackupConfig()">💾 儲存備份設定</button>
          <span id="backupStatusEl" style="font-size:12px; color:var(--ink4);">讀取備份狀態中…</span>
        </div>
      </div>

      <!-- 備份還原（§17，訪客唯讀時隱藏） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">⏮ 備份還原</div>
        <div class="ss-desc">挑一個歷史快照，把全部資料整碗還原到那天的狀態（第一版整碗還原）。還原會覆蓋目前所有資料，動作前建議先「下載 JSON 備份」。</div>
        <div class="ss-field">
          <label>選擇還原版本</label>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="restore-snap" style="width:240px;" onchange="App.onSnapshotPick()"><option value="">讀取中…</option></select>
            <button class="tb-action ghost" onclick="App.loadSnapshots()">🔄 重新整理</button>
          </div>
        </div>
        <div id="restorePreviewEl" style="padding:10px 12px; background:var(--surface2); border-radius:8px; margin-top:6px; font-size:12px; color:var(--ink3);">選一個版本以預覽內容。</div>
        <div style="display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap;">
          <button class="tb-action danger" onclick="App.restoreSnapshot()">⏮ 還原到此版本</button>
          <span style="font-size:12px; color:var(--ink4);">⚠ 會覆蓋目前所有資料、無法復原</span>
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

    <div class="tab-panel" id="安全">${App._securityTabHtml()}</div>

    <div style="text-align:center; margin-top:14px;">
      <button class="tb-action" onclick="App.saveSettings()" style="padding:12px 32px;">💾 儲存所有設定</button>
    </div>
  `;
  Auth.renderLists();   // ④ 名單容器在「編輯權限」tab 模板，innerHTML 設好後即時填
};

// 修正3：設定頁未存提醒——dirty 旗標 + 離開攔截彈窗（儲存並離開／放棄並離開／取消）
App._bindSettingsDirty = function() {
  if (App._settingsDirtyBound) return;
  App._settingsDirtyBound = true;
  const mark = (e) => { if (e.target && e.target.closest && e.target.closest('#page-settings')) App._settingsDirty = true; };
  document.addEventListener('input', mark);
  document.addEventListener('change', mark);
};
App._confirmLeaveSettings = function(name, btn) {
  App._pendingNav = { name, btn };
  App.openModal({
    title: '設定尚未儲存',
    body: '<div style="font-size:14px;color:var(--ink2);line-height:1.7;">你在設定頁有未儲存的變更。要先儲存再離開嗎？</div>',
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action ghost" onclick="App._leaveSettings(false)">放棄變更離開</button>
             <button class="tb-action" onclick="App._leaveSettings(true)">儲存並離開</button>`,
  });
};
App._leaveSettings = function(doSave) {
  const nav = App._pendingNav || {}; App._pendingNav = null;
  if (doSave) App.saveSettings(true);   // 跳過工時 confirm，直接存（含 Storage.save + 清 dirty）
  App._settingsDirty = false;
  App.closeModal();
  if (nav.name) App.showPage(nav.name, nav.btn, true);
};
App.saveSettings = function(_skipWorkConfirm) {
  const el = (id) => document.getElementById(id);
  const sv = (id) => { const e = el(id); return e ? e.value : null; };
  // §18.10：每日工時／每週工作日變更 → 彈影響清單確認（confirmModal 無 onCancel：取消＝整個儲存中止、工時與其餘設定都不寫，需重按儲存）
  if (!_skipWorkConfirm) {
    const _nh = sv('set-hours'); const _newHours = _nh !== null ? parseFloat(_nh) : null;
    const _dp = el('dayPills');
    const _newDays = _dp ? Array.from(_dp.querySelectorAll('.day-pill.on')).map(b => parseInt(b.dataset.day)) : null;
    const _curDays = DATA.settings.workDays || [];
    const _hoursChg = _newHours !== null && !isNaN(_newHours) && _newHours !== DATA.settings.dailyHours;
    const _daysChg = _newDays !== null && (_newDays.length !== _curDays.length || _newDays.some(d => !_curDays.includes(d)));
    if (_hoursChg || _daysChg) {
      App.confirmModal({
        icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
        title: '確認變更工時設定',
        msg: '修改「每日工時／每週工作日」會連動重算：<br>· WBS 任務工時換算（estHours）<br>· 部門負載與容量線<br>· 個人雜事佔比<br>· <b>每週工作日更會改變「哪幾天算工作日」→ 全系統排程日期、工期、甘特、剩餘工作天全部重算</b><br><br>確定要修改嗎？',
        okText: '確定修改', cancelText: '取消',
        onConfirm: () => App.saveSettings(true),
      });
      return;
    }
  }
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
  App._settingsDirty = false;   // 修正3：存檔後清除未存旗標
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
  App.confirmModal({
    icon: 'ti-cloud-download', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '從雲端下載最新資料？', msg: '這會用雲端的資料「完全覆蓋」本地所有任務、專案、設定。建議先按「⬇ 下載 JSON 備份」備份本地資料。', okText: '下載並覆蓋', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      CloudSync.download(false).then(success => {
        if (success) {
          App.refreshAll();
          App.renderSidebar();
          const currentPage = App.currentPage;
          if (currentPage) {
            const btn = document.querySelector(`[data-page="${currentPage}"]`);
            App.showPage(currentPage, btn);
          }
        }
      });
    },
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

// ─── §17 BACKUP / RESTORE HANDLERS ───
App._backupUrl = function() { return (DATA.settings.cloudSyncUrl || CFG('BACKEND_URL', '') || '').trim(); };

// GET 後端備份 API（沿用 §14 JWT）：action=snapshots/snapshot/backupConfig。回 parsed JSON；error 或無憑證 throw。
App._backupGet = async function(action, extra) {
  const url = App._backupUrl();
  if (!url) throw new Error('尚未設定雲端 URL');
  if (!Auth._idToken) throw new Error('登入已過期，請重新登入');
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(url + sep + 'action=' + action + (extra || '') + '&id_token=' + encodeURIComponent(Auth._idToken), { method: 'GET', mode: 'cors', redirect: 'follow' });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j;
};

// 進「資料與備份」tab 時載入備份設定 + 快照清單（設定頁本就 admin 才進）
App._loadBackupPanel = async function() {
  const st = document.getElementById('backupStatusEl');
  if (!Auth._idToken || !App._backupUrl()) { if (st) st.textContent = '需登入且設定雲端 URL 後才能使用'; return; }
  try {
    const j = await App._backupGet('backupConfig');
    const c = j.config || {};
    const setV = (id, v) => { const e = document.getElementById(id); if (e != null && v != null) e.value = String(v); };
    setV('set-backup-enabled', c.enabled ? 'true' : 'false');
    setV('set-backup-hour', c.hour);
    setV('set-backup-retention', c.retentionDays);
    if (st) st.textContent = c.lastBackup ? `最後備份 ${c.lastBackup} · 共 ${c.count} 份快照` : `尚無快照（啟用後每天自動備份，目前 ${c.count || 0} 份）`;
  } catch (e) {
    if (st) st.textContent = '讀取備份狀態失敗：' + e.message;
  }
  App.loadSnapshots();
};

App.loadSnapshots = async function() {
  const sel = document.getElementById('restore-snap');
  if (!sel) return;
  try {
    const j = await App._backupGet('snapshots');
    const list = j.snapshots || [];
    if (!list.length) { sel.innerHTML = '<option value="">（目前沒有快照）</option>'; document.getElementById('restorePreviewEl').textContent = '目前沒有可還原的快照。'; return; }
    sel.innerHTML = list.map(s => `<option value="${s.date}">${s.date}（${Math.round((s.chars || 0) / 1024)} KB）</option>`).join('');
    App.onSnapshotPick();
  } catch (e) {
    sel.innerHTML = `<option value="">讀取失敗：${U.esc(e.message)}</option>`;
  }
};

App.saveBackupConfig = async function() {
  const gv = id => { const e = document.getElementById(id); return e ? e.value : null; };
  if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
  const enabled = gv('set-backup-enabled') === 'true';
  const hour = parseInt(gv('set-backup-hour'), 10);
  const retentionDays = parseInt(gv('set-backup-retention'), 10);
  try {
    const j = await Auth._postBackend({ action: 'setBackupConfig', id_token: Auth._idToken, enabled, hour, retentionDays });
    if (j.error) throw new Error(j.error);
    U.toast('✓ 備份設定已儲存', 'success');
    const c = j.config || {};
    const st = document.getElementById('backupStatusEl');
    if (st) st.textContent = c.lastBackup ? `最後備份 ${c.lastBackup} · 共 ${c.count} 份快照` : `尚無快照（目前 ${c.count || 0} 份）`;
  } catch (e) {
    U.toast('⚠ 儲存失敗：' + e.message, 'warning');
  }
};

App.onSnapshotPick = async function() {
  const sel = document.getElementById('restore-snap');
  const prev = document.getElementById('restorePreviewEl');
  if (!sel || !prev) return;
  const date = sel.value;
  if (!date) { prev.textContent = '選一個版本以預覽內容。'; App._restorePreviewData = null; return; }
  prev.textContent = '讀取中…';
  try {
    const j = await App._backupGet('snapshot', '&date=' + encodeURIComponent(date));
    const d = j.data || {};
    prev.innerHTML = `👁 這個版本有 <b>${(d.projects || []).length}</b> 個專案、<b>${(d.tasks || []).length}</b> 筆任務`;
    App._restorePreviewData = d; App._restorePreviewDate = date;   // 快取，還原直接用免重抓
  } catch (e) {
    prev.textContent = '預覽失敗：' + e.message; App._restorePreviewData = null;
  }
};

App.restoreSnapshot = function() {
  const sel = document.getElementById('restore-snap');
  const date = sel ? sel.value : '';
  if (!date) { U.toast('⚠ 請先選一個還原版本', 'warning'); return; }
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `還原到 ${date}？`,
    msg: `會把目前<b>所有</b>資料（含這天之後的改動、其他專案）覆蓋成 <b>${date}</b> 的狀態，<b>無法復原</b>。<br>建議先按「⬇ 下載 JSON 備份」再還原。`,
    okText: '還原並覆蓋', cancelText: '取消', okClass: 'danger',
    onConfirm: async () => {
      if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
      U.toast('⏮ 還原中…', 'info');
      try {
        let data = (App._restorePreviewDate === date && App._restorePreviewData) ? App._restorePreviewData : null;
        if (!data) { const j = await App._backupGet('snapshot', '&date=' + encodeURIComponent(date)); data = j.data; }
        if (!data) throw new Error('找不到該快照資料');
        CloudSync._applyCloudData(data);   // 整碗替換本地（含 localStorage + migration）
        await CloudSync.upload(true);       // 決策3：回寫雲端最新，避免下次同步被舊 blob 蓋回
        App.refreshAll();
        App.renderSidebar();
        const cp = App.currentPage; if (cp) { const btn = document.querySelector(`[data-page="${cp}"]`); App.showPage(cp, btn); }
        U.toast(`✓ 已還原到 ${date}`, 'success');
      } catch (e) {
        U.toast('⚠ 還原失敗：' + e.message, 'warning'); console.error(e);
      }
    },
  });
};

App.googleSignOut = function() {
  App.confirmModal({
    icon: 'ti-logout', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '確定要登出？', okText: '登出', cancelText: '取消',
    msg: '登出會清除本機快取的專案資料。雲端不受影響，下次登入會自動還原。',
    onConfirm: async () => {
      U.toast('☁ 登出中，正在同步…', 'info');
      // 安全(§8f.6 Level 2)：先把待上傳改動 flush 到雲端，再清本機快取，避免遺失最後一次編輯。flush 失敗(離線/逾時)不擋登出。
      try { await CloudSync.flushPendingUpload(); } catch (e) { console.error('logout flush failed', e); }
      DATA.settings._loggedInEmail = '';
      DATA.settings._loggedInPicture = '';
      DATA.settings._role = undefined;   // 登出清身份（否則 isAdmin() 仍 true，只是被 overlay 遮住）；auth_admin_bound 保留不清
      Storage.save();                    // 存回清過身份的 settings
      Storage.clearLocalData();          // 清本機快取的專案/工作資料(settings 保留供雲端重連)
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
      }
      location.reload();
    },
  });
};


// ─── 備份/還原/清除（原 WBS 區尾挖入）───
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
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '還原將覆蓋目前所有資料', msg: '確定用此備份檔還原？目前所有任務、專案、設定會被覆蓋。', okText: '還原', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const obj = JSON.parse(e.target.result);
          if (!obj.DATA) throw new Error('檔案格式錯誤');
          DATA = obj.DATA;
          Storage.save();
          App.refreshAll();
          U.toast('✓ 資料已還原');
        } catch (err) {
          U.toast(`❌ 還原失敗：${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    },
  });
};

App.clearAll = function() {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '確定清除所有資料？', msg: '將清空本機所有任務、專案、設定，<b>此操作無法復原</b>。建議先「下載 JSON 備份」再清除。', okText: '清除全部', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      Object.values(STORE).forEach(key => localStorage.removeItem(key));
      location.reload();
    },
  });
};
