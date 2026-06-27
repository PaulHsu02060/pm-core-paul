# Session 交接快照（2026-06-27 智慧排程衝突面板）

> 給「重開 session」直接讀的 pickup 文件。**這是快照**，定案/細節以
> `pm-core-architecture.md`（§4.8.7.7 / .8〔退役〕/ .9〔層三段退役〕/ .10〔最新〕）、
> `PM-Core_踩坑與操作手冊.md`、`HANDOFF.md §B` 為單一真實來源。
> 下個 session 開工後，此檔可覆蓋成新快照或刪除；長期狀態走 HANDOFF.md §B 與架構文件。

## 開工先做（鐵則）
1. cwd 是 pm-core-paul；`git remote -v` 確認指向 `PaulHsu02060/pm-core-paul`。
2. `git pull` →「`git log -3`」確認 HEAD 與 origin/main 齊平。
3. 讀必讀文件：`HANDOFF.md`（§A 常駐鐵則＋§B 本週進度）、`AGENT_GATE.md`、
   `pm-core-architecture.md`、`PM-Core_踩坑與操作手冊.md`；動 CSS 前讀 `UI-CSS-設計規範.md`。

## 目前狀態
- 兩個本 session commit：`f73e8d1`（§4.8.7.9）、`153c919`（§4.8.7.10，最新 HEAD）。
- 版本號 index.html 兩條 `?v=20260627-20`（app.js / style.css 同值）。
- 純靜態單頁：index.html + app.js + style.css，localStorage 存資料，no build step。
- 本 session 改動皆 `[unverified]`（node --check + 160 案測試過，未線上逐項驗）。

## 本 session 做了什麼（智慧排程衝突面板，mockup 驅動）
入口流程：建專案選範本 → 教育卡(說明指南) → 第一階段填寫頁 →「下一步」：
- 時間足夠 → 直接 Stage 2 編輯任務骨架頁（`_renderStage2New`）。
- 時間不足 → 過渡彈窗「偵測到時程衝突」→「開始智慧排程」→ 智慧排程衝突聚焦面板（`_renderOverflowFlow`）。

聚焦面板（`_ovf*`，渲染進 `#page-stage2`）現況＝**只到層二**（層三已砍）：
- 頂部分頁（主案/子案，紅燈標尚缺N天）＋案頭前後時程對照看板（原始→新時程 順延N）。
- 層一卡：採用系統建議最快上市日（`_ovfAdoptFastest`，設計款 `confirmModal`）。
- 層二卡展開：填較晚日期+重新計算 / Top5 長工時快選（−N天膠囊+手動框，標階段·部門，清單穩定、Enter存）/ 層二mini戰報。
- 達標 → `_ovfAfterResolve` → 前往 Stage 2（仍有別案紅→接力切換）。
- 仍不足 → 右下角「下一步：進階調整任務工期」→ `_ovfGotoStage2` → 直接進 Stage 2（繼承層二改好的工期）。

Stage 2（`_renderStage2New`）= 標準大表，本 session **純加法嵌入 dashboard**（零刪既有欄位/按鈕）：
- 共用 `_s2StageStatuses`（各階段上色 + 每階段 lack＝超出上市日工作天）。
- `_s2GanttHtml` 進度條每階段尾端標籤 `[✓正常]`/`[⚠️尚缺N天]`（紅標可點→`_s2GotoStage`：選該階段+捲到表）。
- `_s2BannerHtml` 當前階段橫條加狀態文字。
- `_s2ListHtml` 關鍵路徑列淡橘高亮+tag（`isCrit`＝長工時門檻近似 `max(15,案內工期前1/3)`）；工期框直接改→`_s2SetDuration`→標籤連動。

彈窗系統：一律走設計款 `App.confirmModal`（§6.5，`#confirmOverlay`，已增強 icon/okClass/單按鈕），禁原生 confirm/alert。

排程引擎修正（本 session）：
- `_chainStagesBackward`：修 backward 跳階段甘特塌 deadline（踩坑手冊坑6 的 backward 版）。
- Stage1 整體膠囊改「串接後落點 vs 上市日」算，與甘特同源（修膠囊綠但甘特紅矛盾）。
- `_s2VariantSlack` 補 backward 支援（原只算 interval → 子案無選項 bug）。

## 待辦／下一件（HANDOFF §B 也有）
1. **使用者線上驗 -20 後會回報「有不少問題要改」——等他列清單，逐一修（之後各自獨立 commit）。**
2. 真**關鍵路徑**標記（最長依賴鏈）取代長工時門檻近似（`_s2ListHtml` isCrit / `_ovfTopTasks`）。
3. 清 dead CSS：`.ovf-seg*` / `.ovf-battle*` / `.ovf-s3*` / `.ovf-tbl*` / `.ovf-locktable` / `.ovf-p3*`（層三砍掉後沒人用，無害待清）。
4. Top5 膠囊級距是否改寫死 -3/-5（目前工期比例 ~15%/25% 算）。

## 硬規則（每步必守）
- **commit-gate**：commit 前單獨 `git status` 貼完整原文確認（無 `config.local.js`/`seed.local.js`/`seed.sample.js`/`_probe*`）；add→commit→push 三步分開、禁 `&&`/`;` 串接；`git add` 只列明確檔名（禁 `-A`/`.`）；禁 `push --force`；訊息經使用者確認。
- 動 code 前後跑 `node --check app.js` ＋ `node docs/test-schedule-cases.js`（160 案），輸出原文都貼。未線上驗的 commit 標 `[unverified]`。
- 改 app.js 或 style.css → 同步升 index.html 兩條 `?v=`（格式 YYYYMMDD-N，只升真的動到的檔；目前 -20）。
- 改檔一律用 Edit/Write，禁 PowerShell 文字回寫（中文變亂碼）。
- **CSS 鐵則**：顏色/圓角/z-index 走 `:root` 變數，hex 只准在 `:root`；色系**暖森林綠（sage/amber/rose/stone，降彩度，非 Tailwind 冷色）**——顧問給的 Tailwind hex（#E11D48 等）只是意圖，一律用 `:root` token 做同等高對比，不寫進 code。
- 回覆一律正體中文、白話、列選項+建議、不用工具彈窗問問題、不主動叫休息、要 diff 就貼完整原文。
- 大功能先出 Mockup 定版再寫 code（用 visualize/show_widget，外層別用深色背景會卡黑畫面）。

## 協作風格（Paul 要求）
機械改動一口氣做完、最後貼總結（node --check + 160 測試 + 原文）；只有測試 FAIL / 邏輯分支語意改變 / anchor 不確定 / 動既有邏輯 / commit-gate 才停下貼審。決策過的不重複問。
