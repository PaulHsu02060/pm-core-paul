/**
 * PM-Core · Web App API
 * ─────────────────────────────────────────────
 * 這個檔案是給 PM-Core 應用程式用的 API。
 *
 * 設計原則：
 *   - 所有變數、函式都加 PMW_ 前綴，避免和現有 .gs 檔案衝突
 *   - 完全唯讀，不會修改 sheet 內容
 *   - 獨立部署（新建一個 Web App，不影響現有部署）
 *
 * 使用方式：
 *   1. 在現有 Apps Script Project 新增此檔案（檔名建議：web_app_pm.gs）
 *   2. Deploy → New deployment → Web app
 *   3. Execute as: Me / Who has access: Anyone
 *   4. 把得到的 Web App URL 設到 PM-Core 的「設定」頁
 */

// ─── 常數（PMW_ 前綴避免衝突） ───
// 注意：分頁名改在函式內讀（見 PMW_handleGetRequest），避開 Apps Script 頂層載入順序問題。
// 前提：本專案內也要有一份 config.gs／config.local 內容提供 APP_CONFIG。

/**
 * GET API：回傳 WBS 任務資料（JSON）
 *
 * 注意：函式名稱必須叫 doGet，這是 Apps Script Web App 的固定入口。
 * 如果你的 Apps Script Project 已經有另一個 doGet，請看本檔案最下方說明。
 */
function doGet(e) {
  return PMW_handleGetRequest(e);
}

/**
 * 實際處理邏輯（獨立函式，方便未來做 router 共用）
 */
function PMW_handleGetRequest(e) {
  try {
    // 函式被呼叫時才讀 APP_CONFIG（此時全域已初始化完畢）；未載入退回模板預設
    const PMW_SHEET_WBS = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.WBS_SHEET_NAME) || 'WBS主表';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(PMW_SHEET_WBS);
    if (!sheet) {
      return PMW_jsonResponse({ error: 'Sheet not found: ' + PMW_SHEET_WBS });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return PMW_jsonResponse({ tasks: [], message: 'No data' });
    }

    // 讀取 A1:N{lastRow}
    const range = sheet.getRange(1, 1, lastRow, 14);
    const values = range.getValues();

    // 你的 sheet 欄位順序（從 05_utils.gs 的 COL 常數可看出）：
    // 0:N  1:PLM階段  2:子群組  3:任務名稱  4:任務類型  5:前置任務
    // 6:工期  7:負責人  8:預計開始  9:預計結束
    // 10:實際開始  11:實際完成  12:進度%  13:狀態

    const tasks = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0] && !row[3]) continue; // 略過空白行

      tasks.push({
        n: row[0],
        stage: row[1] || '',
        subgroup: row[2] || '',
        name: row[3] || '',
        type: row[4] || '任務',
        precedence: row[5] || '',
        workdays: row[6] || 0,
        owner: row[7] || '',
        plannedStart: PMW_fmtDate(row[8]),
        plannedEnd: PMW_fmtDate(row[9]),
        actualStart: PMW_fmtDate(row[10]),
        actualEnd: PMW_fmtDate(row[11]),
        progress: row[12] || 0,
        status: row[13] || '未開始',
        note: '',
      });
    }

    return PMW_jsonResponse({
      tasks,
      meta: {
        sheetName: PMW_SHEET_WBS,
        totalRows: tasks.length,
        syncedAt: new Date().toISOString(),
        version: 'pmw-1.0',
      },
    });
  } catch (err) {
    return PMW_jsonResponse({ error: err.toString() });
  }
}

/**
 * 將日期轉成 YYYY-MM-DD 字串
 */
function PMW_fmtDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v);
}

/**
 * 統一 JSON 回應
 */
function PMW_jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 測試用：手動執行檢視回傳結果（不會修改 sheet）
 *
 * 執行方式：
 *   1. 上方函式選單選 "PMW_test"
 *   2. 點 ▶ 執行
 *   3. 查看「執行記錄」看 JSON 是否正確
 */
function PMW_test() {
  const result = PMW_handleGetRequest({});
  Logger.log(result.getContent().substring(0, 2000) + ' ...');
}


/* ═══════════════════════════════════════════════════════
   ⚠️ 重要：如果你的 Apps Script Project 已經有 doGet
   ═══════════════════════════════════════════════════════

   你的 WBS 自動化 Project 已經有 web_app.gs，
   裡面很可能已經有 doGet 函式。
   Apps Script 一個 Project 只能有「一個」 doGet 函式作為 Web App 入口。

   ──────────────────────────────────────────────────────
   做法 1：新建另一個 Apps Script Project（最簡單，推薦）
   ──────────────────────────────────────────────────────
   1. 開 WBS 的 Google Sheet
   2. Extensions → Apps Script
   3. 編輯器頂部會顯示「你的 WBS 自動化」(原 project)
   4. 然後直接到 https://script.google.com → 點「新增專案」
      新建一個叫「WBS_PM_API」的 project
   5. 用「資源 → 進階 Google 服務」或左側「資料庫」綁定到同一個 Sheet
      （或更簡單：用 SpreadsheetApp.openById('SHEET_ID_HERE') 替換
       SpreadsheetApp.getActiveSpreadsheet()，並把 SHEET_ID 填入）
   6. 把本檔案內容貼入
   7. 部署新 Web App

   ──────────────────────────────────────────────────────
   做法 2：在現有 Project 加 router（進階）
   ──────────────────────────────────────────────────────
   假設你原本 web_app.gs 的 doGet 長這樣：

       function doGet(e) {
         return HtmlService.createTemplateFromFile('Index').evaluate();
       }

   改成：

       function doGet(e) {
         // 用 URL 參數區分：?api=pm 走 PM-Core API
         if (e && e.parameter && e.parameter.api === 'pm') {
           return PMW_handleGetRequest(e);
         }
         // 預設走原本的網頁
         return HtmlService.createTemplateFromFile('Index').evaluate();
       }

   然後本檔案的 doGet 函式要拿掉（讓 PMW_handleGetRequest 從原 doGet 被呼叫）。
   PM-Core 設定的網址要加 ?api=pm，例如：
       https://script.google.com/macros/s/AKfy.../exec?api=pm
*/
