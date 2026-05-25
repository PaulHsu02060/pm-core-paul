/**
 * PM-Workspace · Cloud Sync API (v1.0)
 * ─────────────────────────────────────────────────────────
 * 跨裝置同步：把 PM-Workspace 全部資料存在一個 Google Sheet 裡，
 * 任何一台裝置都可以 GET / POST 同步。
 *
 * 使用方式：
 *   1. 新建一個 Google Sheet（命名隨意，例如 "PM-Workspace 雲端同步"）
 *   2. 開啟「擴充功能」→「Apps Script」
 *   3. 把這段程式碼貼到 Code.gs（全選刪除原本內容）
 *   4. 替換下方 SHEET_ID 為你新建 Sheet 的 ID（從網址抓）
 *      網址範例：https://docs.google.com/spreadsheets/d/【這串】/edit
 *   5. 部署 → 新部署 → 類型「網頁應用程式」
 *      - 執行身分：我
 *      - 存取對象：任何人（必要，要不然外部不能呼叫）
 *   6. 取得部署 URL，貼到 PM-Workspace 設定頁
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
const CHECK_TOKEN = 'pmw-paul-2026'; // ⚠️ 自訂你的 token

// ═══════════════════════════════════════════════════════════════
// 不要動以下程式碼
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    if (ENABLE_TOKEN) {
      const token = e?.parameter?.token || '';
      if (token !== CHECK_TOKEN) {
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
  // A1 是 timestamp，A2 是完整 JSON
  const json = sheet.getRange(2, 1).getValue();
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
  // 清空後寫入：第 1 列為時間戳，第 2 列為完整 JSON
  sheet.clear();
  sheet.getRange(1, 1).setValue('last_sync_ts');
  sheet.getRange(1, 2).setValue(ts);
  sheet.getRange(2, 1).setValue(JSON.stringify(data));
  // 為避免超出單格 50000 字元限制，分段存
  // (這裡為簡單版，建議資料量不超過 40000 字元；超過再考慮分頁)
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
