/**
 * PM-Core · Cloud Sync API (v1.1)
 * 跨裝置同步 + Google 帳號身份查詢（白名單藏後台 Script Properties）
 *
 * ★ 這是線上實際部署在跑的版本（取代 repo 舊 v1.0 _syncToken 分支），存此建可回溯基準。
 * ★ 脫敏：CHECK_TOKEN / CLOUD_SHEET_ID 明文已移至 Script Properties（public repo 不留密鑰）。
 *   部署前置（否則同步/讀取會失效）：Apps Script 後台 → 專案設定 → Script Properties 需設：
 *     - CHECK_TOKEN   = <同步 token>（與前端 APP_CONFIG.SYNC_TOKEN 成對；舊明文 token 已外露於開發過程，部署時建議換新值）
 *     - SHEET_ID      = <雲端同步 Sheet 的 ID>
 *     - ADMIN_EMAILS  = 逗號分隔 email（role 查詢回 admin）
 *     - ALLOWED_EMAILS= 逗號分隔 email（role 查詢回 editor）
 * ★ role 邏輯未改：仍為三層 admin/editor/none；§8f.3b superadmin/viewonly/isForeign/首登密鑰 留塊三後續。
 */

// ═══════════════════════════════════════════════════════════════
// 配置區（值移至 Script Properties，源碼不留明文）
// ═══════════════════════════════════════════════════════════════
const CLOUD_SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '';
const CLOUD_SHEET_NAME = 'data';

const ENABLE_TOKEN = true;
const CHECK_TOKEN = PropertiesService.getScriptProperties().getProperty('CHECK_TOKEN') || '';

// ═══════════════════════════════════════════════════════════════
// 不要動以下程式碼
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    // 有人來問「我是什麼身份」→ 查櫃子回一個字（不回整份名單）
    if (e && e.parameter && e.parameter.action === 'role') {
      return _checkRole(e.parameter.email, e.parameter.setupKey);
    }
    // 資料路：驗 JWT + role≥viewonly（取代公開唯讀）。role 分支維持公開（登入 bootstrap）。
    const auth = _authUser({ id_token: e.parameter.id_token });
    if (!auth.ok) return auth.resp;
    if (auth.role === 'none') return _json({ error: 'Forbidden: read requires whitelist' });
    const data = _readData();
    return _json({ ok: true, data, ts: Date.now() });
  } catch (err) {
    return _json({ error: String(err), stack: err.stack });
  }
}

// 查櫃子裡的名單，只回單一身份字串（superadmin/admin/editor/viewonly/none），永不回整份名單。
// 首登綁定（§8f.6）：ADMIN_EMAILS 空 + 帶對 SETUP_KEY → 一次性寫入此 email 為 admin。
function _checkRole(email, setupKey) {
  const target = String(email || '').toLowerCase().trim();
  if (!target) return _json({ role: 'none' });

  const props = PropertiesService.getScriptProperties();
  const superEmail = String(props.getProperty('SUPERADMIN_EMAIL') || '').toLowerCase().trim();
  const admins   = _list(props, 'ADMIN_EMAILS');
  const allowed  = _list(props, 'ALLOWED_EMAILS');
  const viewonly = _list(props, 'VIEWONLY_EMAILS');

  // a. SuperAdmin（§8f.3b 後門）：進他人副本（已綁 admin 且不含自己）→ isForeign 警示
  if (superEmail && target === superEmail) {
    const isForeign = admins.length > 0 && admins.indexOf(superEmail) < 0;
    return isForeign ? _json({ role: 'superadmin', isForeign: true }) : _json({ role: 'superadmin' });
  }

  // b. 首登綁定（§8f.6）：本副本尚無 admin + 帶對首登密鑰 → 一次性綁定（LockService 防競爭）
  const SETUP_KEY = String(props.getProperty('SETUP_KEY') || '');
  if (admins.length === 0 && SETUP_KEY && String(setupKey || '') === SETUP_KEY) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      if (_list(props, 'ADMIN_EMAILS').length === 0) {   // 取鎖後重讀，競爭防護
        props.setProperty('ADMIN_EMAILS', target);
        return _json({ role: 'admin' });
      }
      // 競爭落敗（已被別人綁）→ 不寫，往下照名單判斷
    } finally {
      lock.releaseLock();
    }
  }

  // c~f. 名單判斷（admin > editor > viewonly > none）
  if (admins.indexOf(target) >= 0)   return _json({ role: 'admin' });
  if (allowed.indexOf(target) >= 0)  return _json({ role: 'editor' });
  if (viewonly.indexOf(target) >= 0) return _json({ role: 'viewonly' });
  return _json({ role: 'none' });
}

// Script Property 逗號名單 → 正規化小寫去空陣列
function _list(props, key) {
  return (props.getProperty(key) || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}

// 純讀身份（無首登綁定、無 isForeign、回字串）：給 setlist 等權限判斷用，與 _checkRole 共用 _list/名單來源。
function _roleOf(email) {
  const target = String(email || '').toLowerCase().trim();
  if (!target) return 'none';
  const props = PropertiesService.getScriptProperties();
  const superEmail = String(props.getProperty('SUPERADMIN_EMAIL') || '').toLowerCase().trim();
  if (superEmail && target === superEmail) return 'superadmin';
  if (_list(props, 'ADMIN_EMAILS').indexOf(target) >= 0) return 'admin';
  if (_list(props, 'ALLOWED_EMAILS').indexOf(target) >= 0) return 'editor';
  if (_list(props, 'VIEWONLY_EMAILS').indexOf(target) >= 0) return 'viewonly';
  return 'none';
}

// 共用 JWT 底座：驗 Google id_token 真偽（tokeninfo + aud + email_verified）+ 解 email + 查 role。
// 不含 role 閘——呼叫端自行依需求檢查 role。回 { ok:true, email, role } 或 { ok:false, resp:<_json 錯誤> }。
function _authUser(body) {
  const idToken = String(body.id_token || '');
  if (!idToken) return { ok:false, resp:_json({ error:'Missing id_token' }) };
  let info;
  try {
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions:true });
    if (r.getResponseCode() !== 200) return { ok:false, resp:_json({ error:'Invalid token' }) };
    info = JSON.parse(r.getContentText());
  } catch (err) { return { ok:false, resp:_json({ error:'Token verify failed' }) }; }
  if (info.error) return { ok:false, resp:_json({ error:'Invalid token' }) };
  const clientId = String(PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID') || '');
  if (!clientId || info.aud !== clientId) return { ok:false, resp:_json({ error:'aud mismatch' }) };
  if (String(info.email_verified) !== 'true') return { ok:false, resp:_json({ error:'email not verified' }) };
  const email = String(info.email || '').toLowerCase().trim();
  if (!email) return { ok:false, resp:_json({ error:'no email' }) };
  return { ok:true, email:email, role:_roleOf(email) };
}

// 名單管理專用：admin/superadmin 才放（委派 _authUser 驗真偽，加 admin 閘）。
function _authAdmin(body) {
  const auth = _authUser(body);
  if (!auth.ok) return auth;
  if (auth.role !== 'admin' && auth.role !== 'superadmin') return { ok:false, resp:_json({ error:'Forbidden' }) };
  return auth;
}

// 名單寫入：只准 admin/superadmin；只能寫 editor/viewonly，絕不寫 ADMIN_EMAILS（防提權）。
function _setList(body) {
  const auth = _authAdmin(body);
  if (!auth.ok) return auth.resp;

  const keyMap = { editor: 'ALLOWED_EMAILS', viewonly: 'VIEWONLY_EMAILS' };
  const propKey = keyMap[String(body.listType || '')];
  if (!propKey) return _json({ error: 'Invalid listType' });

  const emails = (Array.isArray(body.emails) ? body.emails : [])
    .map(s => String(s || '').toLowerCase().trim()).filter(Boolean);
  PropertiesService.getScriptProperties().setProperty(propKey, emails.join(','));
  return _json({ ok: true });   // 不回名單內容
}

// 名單讀取：只准 admin/superadmin；回 editor/viewonly 兩份，絕不回 ADMIN_EMAILS（敏感）。
function _getLists(body) {
  const auth = _authAdmin(body);
  if (!auth.ok) return auth.resp;

  const props = PropertiesService.getScriptProperties();
  return _json({ ok: true, editor: _list(props, 'ALLOWED_EMAILS'), viewonly: _list(props, 'VIEWONLY_EMAILS') });
}

function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return _json({ error: 'Invalid JSON: ' + parseErr });
    }

    // 名單端點（JWT 驗證路；與同步寫入的 CHECK_TOKEN 路分開）
    if (body.action === 'setlist') {
      return _setList(body);
    }
    if (body.action === 'getlists') {
      return _getLists(body);
    }

    // 同步寫入：JWT 驗身分 + role≥editor（取代舊 CHECK_TOKEN）。viewonly/none 擋。
    const auth = _authUser(body);
    if (!auth.ok) return auth.resp;
    if (auth.role !== 'superadmin' && auth.role !== 'admin' && auth.role !== 'editor') {
      return _json({ error: 'Forbidden: write requires editor or above' });
    }

    if (!body.data) {
      return _json({ error: 'Missing data field' });
    }

    _writeData(body.data);
    return _json({ ok: true, message: '已存入雲端', ts: Date.now() });
  } catch (err) {
    return _json({ error: String(err), stack: err.stack });
  }
}

function _readData() {
  const sheet = _getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const range = sheet.getRange(2, 1, lastRow - 1, 1);
  const values = range.getValues();
  let json = '';
  for (const row of values) {
    if (row[0]) json += row[0];
  }
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function _writeData(data) {
  const sheet = _getSheet();
  const ts = new Date().toISOString();
  sheet.clear();
  sheet.getRange(1, 1).setValue('last_sync_ts');
  sheet.getRange(1, 2).setValue(ts);

  const json = JSON.stringify(data);
  const CHUNK_SIZE = 45000;
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push([json.slice(i, i + CHUNK_SIZE)]);
  }
  if (chunks.length === 0) chunks.push(['']);
  sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
  console.log('寫入 ' + chunks.length + ' 個 chunks，總 ' + json.length + ' 字元');
}

function _getSheet() {
  const ss = SpreadsheetApp.openById(CLOUD_SHEET_ID);
  let sheet = ss.getSheetByName(CLOUD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CLOUD_SHEET_NAME);
  }
  return sheet;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 測試函式 ───
function testWrite() {
  _writeData({ test: 'hello', tasks: [{ id: 't1', name: '測試' }] });
  console.log('✓ 寫入成功');
}

function testRead() {
  const data = _readData();
  console.log(JSON.stringify(data, null, 2));
}
