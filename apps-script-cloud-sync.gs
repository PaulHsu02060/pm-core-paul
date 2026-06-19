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
      return _checkRole(e.parameter.email);
    }
    const data = _readData();
    return _json({ ok: true, data, ts: Date.now() });
  } catch (err) {
    return _json({ error: String(err), stack: err.stack });
  }
}

// 查櫃子裡的名單，只回 admin / editor / none，永遠不回整份名單
function _checkRole(email) {
  const target = String(email || '').toLowerCase().trim();
  if (!target) return _json({ role: 'none' });
  const props = PropertiesService.getScriptProperties();
  const admins = (props.getProperty('ADMIN_EMAILS') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const allowed = (props.getProperty('ALLOWED_EMAILS') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (admins.indexOf(target) >= 0) return _json({ role: 'admin' });
  if (allowed.indexOf(target) >= 0) return _json({ role: 'editor' });
  return _json({ role: 'none' });
}

function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return _json({ error: 'Invalid JSON: ' + parseErr });
    }

    if (ENABLE_TOKEN) {
      if (body.token !== CHECK_TOKEN) {
        return _json({ error: 'Invalid token' });
      }
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
