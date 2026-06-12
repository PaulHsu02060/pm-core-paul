/**
 * config.js — 公開設定模板（會進 git，全假值）
 *
 * 真值請放 config.local.js（不進 git）。載入順序：
 *   config.js → config.local.js → app.js
 * config.local.js 會把同名鍵「合併覆蓋」到 APP_CONFIG。
 *
 * 雙環境相容說明：
 *  - 瀏覽器：以傳統 <script src="config.js"></script> 載入，var APP_CONFIG 成為全域，
 *            app.js 可直接讀（classic script 之間共用全域）。
 *  - Apps Script：把本檔內容貼成一個 .gs 檔，var APP_CONFIG 同樣是跨檔全域。
 *  - 不使用 export / import：Apps Script 無 ES module；用了會逼瀏覽器改 type="module"，
 *            破壞 classic script 的全域共用，app.js 將讀不到。
 *  - 不依賴 window.：Apps Script 環境沒有 window。
 */
var APP_CONFIG = {
  CLOUD_SHEET_ID: 'PASTE_YOUR_SHEET_ID_HERE',
  CLOUD_SYNC_URL: 'https://script.google.com/macros/s/AKfycbwDzSs44F4AENfeQKEBX_xrYH7Y38wsvAn4iYY9lXLewQUppbyaKRgBQVmAfU1W2uYNSg/exec',  // 公開讀 doGet exec URL（進 git、全公開；非 token）
  WBS_SHEET_NAME: 'WBS主表',
  ADMIN_EMAILS: [],
  ALLOWED_EMAILS: [],
  OAUTH_CLIENT_ID: '463155721513-vpcjoakeudb8r4jpuid98h8idp3grmsp.apps.googleusercontent.com',
  SYNC_TOKEN: 'CHANGE_THIS_TOKEN',
  COMPANY_NAME: 'My Company',
  APP_BUILD_SIGNATURE: 'PM-Core',

  // ─── 應用 / 署名 ───
  APP_NAME: 'PM-Core',                 // 產品名（UI/console/備份檔名等）
  AUTHOR: 'PM-Core',                   // 關於頁顯示作者
  REPO_URL: 'https://github.com/PaulHsu02060/pm-core-paul',

  // ─── WBS 同步專案（對應外部 WBS Sheet）───
  WBS_PROJECT_NAME: 'WBS 專案',        // 同步建立的專案顯示名
  WBS_PROJECT_COLOR: '#4A7C5C',        // 該專案顏色
  WBS_LABEL: 'WBS',                    // UI/toast 顯示用標籤
  WBS_SKIP_KEYWORD: 'WBS',             // 匯入時判斷「屬於 WBS 同步」的關鍵字

  // ─── 其他 UI 範例字 ───
  PROJECT_INPUT_EXAMPLE: '範例品項',   // 新增專案輸入框 placeholder 範例

  // ── 編輯鎖（訪客唯讀）──
  editPasswordHash: '935817361',
};

// 選用保險：Node / 打包器環境也能 require。
// 瀏覽器與 Apps Script 下 module 為 undefined，會安全略過。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}
