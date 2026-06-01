/**
 * PM-Core · Cloud Sync API (v1.0)
 * ─────────────────────────────────────────────────────────
 * 跨裝置同步：把 PM-Core 全部資料存在一個 Google Sheet 裡，
 * 任何一台裝置都可以 GET / POST 同步。
 *
 * 使用方式：
 *   1. 新建一個 Google Sheet（命名隨意，例如 "PM-Core 雲端同步"）
 *   2. 開啟「擴充功能」→「Apps Script」
 *   3. 把這段程式碼貼到 Code.gs（全選刪除原本內容）
 *   4. 替換下方 SHEET_ID 為你新建 Sheet 的 ID（從網址抓）
 *      網址範例：https://docs.google.com/spreadsheets/d/【這串】/edit
 *   5. 部署 → 新部署 → 類型「網頁應用程式」
 *      - 執行身分：我
 *      - 存取對象：任何人（必要，要不然外部不能呼叫）
 *   6. 取得部署 URL，貼到 PM-Core 設定頁
 *
 * 安全性說明：
 *   - 部署 URL 看似公開，但 URL 本身夠長（128 個字元），無法被猜到
 *   - 若不放心可以加 token 驗證（見下方 CHECK_TOKEN）
 *   - 資料只在你的 Google 帳號中，不會外流
 */

// ═══════════════════════════════════════════════════════════════
// 配置區（必須修改）
// ═══════════════════════════════════════════════════════════════
const CLOUD_SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE'; // ⚠️ 改成你的 Sheet ID
const CLOUD_SHEET_NAME = 'data'; // 內部分頁名（自動建立）

// ═══════════════════════════════════════════════════════════════
// 可選：簡單 token 驗證（兩端必須一致）
// 如不需要，把 ENABLE_TOKEN 改為 false
// ═══════════════════════════════════════════════════════════════
const ENABLE_TOKEN = true;
// 與 app.js 的 cloudSyncToken 成對：改在函式內呼叫 _syncToken() 讀 APP_CONFIG.SYNC_TOKEN，
// 避開 Apps Script 頂層載入順序問題；未載入時退回模板預設。
function _syncToken() {
  return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SYNC_TOKEN) || 'CHANGE_THIS_TOKEN';
}

// ═══════════════════════════════════════════════════════════════
// 不要動以下程式碼
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    if (ENABLE_TOKEN) {
      const token = e?.parameter?.token || '';
      if (token !== _syncToken()) {
        return _json({ error: 'Invalid token' });
      }
    }
    const data = _readData();
    return _json({ ok: true, data, ts: Date.now() });
  } catch (err) {
    return _json({ error: String(err), stack: err.stack });
  }
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
      if (body.token !== _syncToken()) {
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
  // 從 A2 起讀所有 chunks 並組合
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
  // 清空後寫入：第 1 列為 metadata，第 2 列起為 JSON chunks
  sheet.clear();
  sheet.getRange(1, 1).setValue('last_sync_ts');
  sheet.getRange(1, 2).setValue(ts);

  // 把 JSON 字串切成每塊 45000 字元（避免單格 50000 限制）
  const json = JSON.stringify(data);
  const CHUNK_SIZE = 45000;
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push([json.slice(i, i + CHUNK_SIZE)]);
  }
  if (chunks.length === 0) chunks.push(['']);
  // 一次寫入到 A2:A(N+1)
  sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
  console.log(`寫入 ${chunks.length} 個 chunks，總 ${json.length} 字元`);
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
