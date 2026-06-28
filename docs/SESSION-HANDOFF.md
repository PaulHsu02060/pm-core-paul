# Session 交接快照（2026-06-29 收工 — 雙軌導覽拆分前夕）

> 給「重開 session」直接讀的 pickup。**這是快照**；定案/細節以
> `pm-core-architecture.md` **§18 雙軌導覽**、`PM-Core_踩坑與操作手冊.md`、`HANDOFF.md §B` 為單一真實來源。
> 下個 session 開工後此檔可覆蓋成新快照。

## 開工先做（鐵則）
1. cwd 是 pm-core-paul；`git remote -v` 確認指向 `PaulHsu02060/pm-core-paul`。
2. `git pull` → `git log -3` 確認 HEAD 與 origin/main 齊平（**目前應為 `3bc4ac5`**）。
3. 讀必讀：`HANDOFF.md`（§A 鐵則＋§B 本週）、`AGENT_GATE.md`、`pm-core-architecture.md`、`PM-Core_踩坑與操作手冊.md`；做 CSS 前讀 `UI-CSS-設計規範.md`；**這次主題先讀架構文件 §18 雙軌導覽**。

## 目前狀態
- HEAD `3bc4ac5`（origin 齊平）；版本號 index.html `app.js?v=20260628-16`、`style.css?v=20260628-8`。
- 純靜態單頁：index.html + app.js + style.css，localStorage，no build step。
- 引擎測試 160/160 PASS。

## 本 session 做了什麼（已驗＋commit＋push）
- `b42066d` 週曆：半小時→**一小時一格**＋暖綠一體化配色＋事件**依分鐘比例定位**（純視覺、拖放不動）；OCR `TIME` 吃 3-4 位連續數字救「830→8:30」。
- `3bc4ac5` 會議彈窗重組：**管理主頁**(定期+特定清單＋欄位標題列＋編輯/刪除/啟用)＋「＋新增事件」子頁(手動填入帶標籤下拉／上傳截圖)＋存完回主頁；OCR 缺星期改色框不空擋。
- 文件：架構文件新增 **§18 雙軌導覽**（定案）、滾動 `HANDOFF.md §B`、本檔。

## 明天要做（已定案，從這開始）
**雙軌導覽重組** — 完整規格見架構文件 **§18**。重點：

- **這是重組不是重蓋**：現「總儀表板」已有三子視圖（儀表板=微觀／甘特圖=跨專案／月曆=全專案）。拆成兩個 sidebar 節點：
  - 🟢 **個人工作台**（=現「儀表板」tab 內容，週曆/會議/便利貼/個人 KPI，無甘特）＝**預設首頁**。
  - 📊 **全專案總覽**（tabs：總覽[新]／跨專案時程[=現成 `renderGantt`]／歷史月曆[=現成 `renderMonth`]）。
- **決策**：Q1=B（只記個人小時計、會議加**可選**擔當/部門欄、部門負載明示偏頗有漏算）；Q2=個人工作台當首頁。
- **施工順序**：
  1. **Phase 0 導覽拆分先做**（低風險、搬現成 render）：sidebar 加 workspace/portfolio、currentPage 新增兩值、portfolio 內 tab(overview/gantt/month)、預設啟動 workspace、標題/麵包屑/active 更新。注意重繪帶範圍（防丟範圍坑）。
  2. **Phase 1 總覽頁 MVP**：**先出 Mockup 定版再寫**；只畫有真資料的區塊（健康度計數/總進度/逾期/本週個人雜事佔比/專案進度矩陣/部門負載 WBS/當週待處理 Top N），少資料給漂亮 empty state，不塞假卡。
  3. **Phase 2**（先別做）：趨勢「較上週」、歷史完工里程碑月曆 → 綁 §17 快照；會議加 dept/owner 欄 → 才能做跨部門雜事負載堆疊。

## 關鍵錨點（app.js）
- 路由：`showPage`(:2383)／`switchView`(:2417)／`renderPage`(:2443)；`currentPage`(:2167)、`currentView`(:2169)。
- 微觀：`renderDashboard`(:2819)＝KPI statsHtml＋view-tabs＋週曆`buildWeekScheduleHtml`(:2971)＋`buildMeetingPanelHtml`(:4256)＋便利貼。
- 宏觀現成：`renderGantt`（全專案，標題「甘特圖·跨專案時程」）／`renderMonth`（全專案）。
- 部門資料：專案層 `depts:[{name,members}]`、`task.dept`、`task.role`；會議三 store（`DATA.meetings`/`settings.recurringMeetings`/`settings.specialMeetings`）目前**無**部門欄。

## 硬規則（每步必守）
- **commit-gate**：commit 前單獨 `git status` 貼完整原文（無 config.local.js/seed.local.js/seed.sample.js/_probe*）；add→commit→push **三步分開、嚴禁 `&&`/`;`**；`git add` 只列明確檔名；禁 `push --force`；訊息經 Paul 確認。
- 動 code 前後 `node --check app.js` ＋ `node docs/test-schedule-cases.js`(160)，輸出原文都貼。未線上驗標 `[unverified]`。
- 改 app.js 或 style.css → 同步升 index.html 兩條 `?v=`（目前 app -16 / style -8）。
- 改檔一律 Edit/Write，禁 PowerShell 文字回寫（中文亂碼）。
- **CSS 鐵則**：顏色/圓角/z-index 走 `:root`，hex 只准在 `:root`；暖森林綠（sage/amber/rose/stone），顧問給的冷灰 hex 換暖石。
- 回覆一律正體中文、白話、列選項+建議、不用工具彈窗問、不主動叫休息、要 diff 貼完整原文。
- **大功能先出 Mockup 定版再寫 code**（visualize/show_widget；自驗可用 preview server + DOM 量測，截圖會 timeout）。

## 協作風格（Paul）
機械改動一口氣做完、最後貼總結（node --check + 160 + 原文）；只有測試 FAIL／邏輯分支語意改變／anchor 不確定／動既有邏輯／commit-gate 才停。決策過的不重複問。判斷風險截 diff 審＋線上驗過才 commit。
