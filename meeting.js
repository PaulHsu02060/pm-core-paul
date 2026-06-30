// meeting.js — 會議 OCR 截圖 + 會議範本（App.*）。app.js 之後載入；TDZ 鐵則見 docs §18.7.1。
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

// OCR 前處理：深底（白字行事曆截圖）平均亮度低 → 反相成白底黑字，tesseract 準度大增。失敗就回原圖。
App._preprocessForOcr = function(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
          if (!c.width || !c.height) { resolve(dataUrl); return; }
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data; let sum = 0;
          for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
          const avg = sum / (px.length / 4);
          if (avg < 110) {   // 深底 → 反相
            for (let i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
            ctx.putImageData(d, 0, 0);
            resolve(c.toDataURL('image/png'));
          } else { resolve(dataUrl); }
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (e) { resolve(dataUrl); }
  });
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
    const allRaw = [];

    for (const shot of this.shotFiles) {
      if (btn) btn.textContent = `⏳ 辨識中 (${++done}/${total})...`;
      try {
        const procUrl = await App._preprocessForOcr(shot.dataUrl);   // 深底自動反相，提升白字辨識
        const { data: { text } } = await window.tesseractWorker.recognize(procUrl);
        allRaw.push(text);
        const meetings = parseMeetingText(text);
        // Apply week offset
        const offset = shot.week === 'last' ? -7 : shot.week === 'next' ? 7 : 0;
        for (const m of meetings) {
          m._off = offset;   // 該截圖的週偏移；確認清單自己選星期時據此算回正確那週
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

    if (unique.length === 0) {
      const wrap = document.getElementById('ocrResult');
      if (wrap) wrap.innerHTML = `<div style="padding:10px; background:var(--terracotta-l); border-radius:6px; font-size:11px; color:var(--terracotta-ink); margin-top:10px; line-height:1.6;">⚠ 沒解析到有「起訖時間」的項目。<b>深色截圖辨識較差</b>——改用淺色背景或「單日檢視」截圖較準，或改「手動」輸入。<details style="margin-top:6px;"><summary style="cursor:pointer;">看 OCR 原始辨識文字（診斷用）</summary><pre style="white-space:pre-wrap; word-break:break-all; font-size:10px; max-height:160px; overflow:auto; margin-top:4px; color:var(--ink2);">${U.esc(allRaw.join('\n---\n').slice(0, 1500)) || '（空白：完全沒辨識到文字，多半是深底+低對比）'}</pre></details></div>`;
    } else {
      this.renderOCRResult(unique);
    }
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
    wrap.innerHTML = `<div style="padding:10px; background:var(--terracotta-l); border-radius:6px; font-size:11px; color:var(--terracotta-ink); margin-top:10px;">⚠ 沒辨識到有「起訖時間」的項目。改用「單日檢視」截圖較準，或改用「手動」輸入。</div>`;
    return;
  }
  meetings.sort((a, b) => ((a.date || '') + a.startTime).localeCompare((b.date || '') + b.startTime));
  const days = [['1','週一'],['2','週二'],['3','週三'],['4','週四'],['5','週五'],['6','週六'],['0','週日']];
  const rows = meetings.map(m => {
    const wdSel = m.date ? String(new Date(m.date).getDay()) : '';
    const dayOpts = '<option value="">請選</option>' +
      days.map(([v, l]) => `<option value="${v}"${wdSel === v ? ' selected' : ''}>${l}</option>`).join('');
    return `<div class="ocr-row" data-off="${m._off || 0}">
      <input type="checkbox" class="ocr-ck" checked>
      <select class="ocr-day${wdSel ? '' : ' ocr-day-need'}">${dayOpts}</select>
      <input type="time" class="ocr-st" value="${m.startTime || ''}">
      <span class="ocr-dash">–</span>
      <input type="time" class="ocr-et" value="${m.endTime || ''}">
      <input type="text" class="ocr-tt" value="${U.esc(m.title || '')}" placeholder="（未命名）">
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="ocr-result">
    <div class="ocr-result-head">辨識完成 · 去重後 <b>&nbsp;${meetings.length}</b>&nbsp; 場，勾選並修正後加入</div>
    ${rows}
    <div style="display:flex; gap:6px; margin-top:10px;">
      <button class="am-add-btn" style="flex:1;" onclick="App.confirmOCRMeetings()">加入勾選</button>
      <button class="am-add-btn" style="flex:0 0 auto; background:var(--stone-100); color:var(--ink2);" onclick="App.cancelOCR()">取消</button>
    </div>
  </div>`;
};

App.confirmOCRMeetings = function() {
  if (App._roGuard()) return;
  const rows = document.querySelectorAll('#ocrResult .ocr-row');
  const monday = D.monday();
  let added = 0, skipped = 0;
  rows.forEach(row => {
    if (!row.querySelector('.ocr-ck').checked) return;
    const daySel = row.querySelector('.ocr-day');
    const dayV = daySel.value;
    const st = row.querySelector('.ocr-st').value;
    if (dayV === '' || !st) { skipped++; daySel.classList.add('ocr-day-need'); return; }   // 缺星期/起始時間 → 標色框、不擋整批
    daySel.classList.remove('ocr-day-need');
    const et = row.querySelector('.ocr-et').value;
    const tt = row.querySelector('.ocr-tt').value.trim();
    const off = parseInt(row.dataset.off || '0', 10) || 0;
    const di = parseInt(dayV, 10);
    const date = D.fmt(D.addDays(monday, (di === 0 ? 6 : di - 1) + off), 'iso');
    DATA.meetings.push({ id: U.id(), date, startTime: st, endTime: et, title: tt || '會議', category: 'meeting' });
    added++;
  });
  if (added === 0) { U.toast(skipped ? '幫色框標出的列選個星期就能加入（週檢視抓不到日期）' : '⚠ 沒有勾選任何會議', 'warning'); return; }
  Storage.save();
  this.shotFiles = [];
  App._refreshMeetingUI();
  const note = skipped ? `（${skipped} 列缺星期/時間已略過）` : '';
  U.toast(`✓ 已加入 ${added} 場會議${note}`, 'success');
};

App.cancelOCR = function() {
  document.getElementById('ocrResult').innerHTML = '';
  this.shotFiles = [];
  this.renderShotList();
};

// ─── MEETING TEMPLATE HELPERS ───
App.buildRecurringMeetingsHtml = function() {
  const list = DATA.settings.recurringMeetings || [];
  if (list.length === 0) {
    return '<div style="padding:18px; text-align:center; color:var(--ink4); font-size:12px;">尚未設定任何定期事件</div>';
  }
  const dayLabels = ['週日','週一','週二','週三','週四','週五','週六'];
  const freqLabels = { once: '單次', daily: '每天', weekly: '每週', biweekly: '隔週(一天)', triweekly: '隔兩週(一天)', 'biweekly-allday': '隔週整週每天', 'triweekly-allday': '隔兩週整週每天' };
  let html = `<div style="display:flex; align-items:center; gap:8px; padding:7px 12px; border-bottom:1px solid var(--rule); background:var(--surface2); font-size:10.5px; font-weight:600; color:var(--ink3); letter-spacing:.03em;">
    <span style="width:34px;">啟用</span>
    <span style="min-width:78px;">頻率</span>
    <span style="min-width:40px;">星期</span>
    <span style="min-width:105px;">時間</span>
    <span style="flex:1;">事件名稱</span>
    <span style="min-width:88px; text-align:right;">操作</span>
  </div>`;
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
  let html = `<div style="display:flex; align-items:center; gap:8px; padding:7px 12px; border-bottom:1px solid var(--rule); background:var(--surface2); font-size:10.5px; font-weight:600; color:var(--ink3); letter-spacing:.03em;">
    <span style="min-width:90px;">日期</span>
    <span style="min-width:105px;">時間</span>
    <span style="flex:1;">事件名稱</span>
    <span style="min-width:88px; text-align:right;">操作</span>
  </div>`;
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
  App._reopenMeetingManage = !!document.getElementById('meetingModalBody');   // 從 Dashboard 會議彈窗進來 → 存完回管理分頁
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
            <option value="monthly" ${cur.frequency === 'monthly' ? 'selected' : ''}>每月（第N個週幾）</option>
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
      <div class="form-row">
        <div class="form-field">
          <label>負責人（預設＝我）</label>
          <input type="text" id="mtform-owner" value="${U.esc(cur.owner != null ? cur.owner : (DATA.settings.userName || ''))}">
        </div>
        <div class="form-field">
          <label>部門（負載分流）</label>
          <select id="mtform-dept">${App._meetingDeptOptions(cur.dept)}</select>
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
  const owner = ((document.getElementById('mtform-owner') || {}).value || '').trim();   // §18.10b
  const dept = (document.getElementById('mtform-dept') || {}).value || '';
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
      m.owner = owner; m.dept = dept;
    }
  } else {
    DATA.settings.recurringMeetings.push({
      id: 'rm_' + Date.now().toString(36),
      category, frequency, day, start, end, title,
      startDate, endDate,
      enabled: true, owner, dept,
    });
  }
  Storage.save();
  this.closeModal();
  const _rl = document.getElementById('recurringMeetingList'); if (_rl) _rl.innerHTML = this.buildRecurringMeetingsHtml();
  U.toast('✓ 已儲存');
  if (App.currentPage === 'workspace') Workspace.render();
  if (App._reopenMeetingManage) { App._reopenMeetingManage = false; App.openMeetingModal(); }
};

App.toggleRecurringMeeting = function(id) {
  const m = (DATA.settings.recurringMeetings || []).find(x => x.id === id);
  if (!m) return;
  m.enabled = m.enabled === false;
  Storage.save();
  document.getElementById('recurringMeetingList').innerHTML = this.buildRecurringMeetingsHtml();
  if (App.currentPage === 'workspace') Workspace.render();
};

App.deleteRecurringMeeting = function(id) {
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '確定刪除這個定期事件？', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.settings.recurringMeetings = (DATA.settings.recurringMeetings || []).filter(m => m.id !== id);
      Storage.save();
      document.getElementById('recurringMeetingList').innerHTML = App.buildRecurringMeetingsHtml();
      U.toast('✓ 已刪除');
      if (App.currentPage === 'workspace') Workspace.render();
    },
  });
};

App.addSpecialMeeting = function() {
  this.openSpecialMeetingDialog(null);
};

App.editSpecialMeeting = function(id) {
  this.openSpecialMeetingDialog(id);
};

App.openSpecialMeetingDialog = function(id) {
  App._reopenMeetingManage = !!document.getElementById('meetingModalBody');   // 從 Dashboard 會議彈窗進來 → 存完回管理分頁
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
      <div class="form-row">
        <div class="form-field">
          <label>負責人（預設＝我）</label>
          <input type="text" id="smtform-owner" value="${U.esc(cur.owner != null ? cur.owner : (DATA.settings.userName || ''))}">
        </div>
        <div class="form-field">
          <label>部門（負載分流）</label>
          <select id="smtform-dept">${App._meetingDeptOptions(cur.dept)}</select>
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
  const owner = ((document.getElementById('smtform-owner') || {}).value || '').trim();   // §18.10b
  const dept = (document.getElementById('smtform-dept') || {}).value || '';
  if (!date || !start || !end || start >= end) { U.toast('⚠ 日期或時間無效', 'warning'); return; }

  DATA.settings.specialMeetings = DATA.settings.specialMeetings || [];
  if (id) {
    const m = DATA.settings.specialMeetings.find(x => x.id === id);
    if (m) { m.title = title; m.date = date; m.start = start; m.end = end; m.owner = owner; m.dept = dept; }
  } else {
    DATA.settings.specialMeetings.push({
      id: 'sm_' + Date.now().toString(36),
      date, start, end, title, owner, dept,
    });
  }
  Storage.save();
  this.closeModal();
  const _sl = document.getElementById('specialMeetingList'); if (_sl) _sl.innerHTML = this.buildSpecialMeetingsHtml();
  U.toast('✓ 已儲存');
  if (App.currentPage === 'workspace') Workspace.render();
  if (App._reopenMeetingManage) { App._reopenMeetingManage = false; App.openMeetingModal(); }
};

App.deleteSpecialMeeting = function(id) {
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '確定刪除這個會議？', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.settings.specialMeetings = (DATA.settings.specialMeetings || []).filter(m => m.id !== id);
      Storage.save();
      document.getElementById('specialMeetingList').innerHTML = App.buildSpecialMeetingsHtml();
      U.toast('✓ 已刪除');
      if (App.currentPage === 'workspace') Workspace.render();
    },
  });
};
