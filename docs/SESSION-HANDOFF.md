# Session 交接快照（2026-06-29 收工 — 雙軌導覽 Phase 0/1 + UI/設定整理）

> 給「重開 session」直接讀的 pickup。**這是快照**；定案/細節以
> `pm-core-architecture.md`（§18 雙軌導覽、§18.9 落地紀錄）、`HANDOFF.md §B`、`PM-Core_踩坑與操作手冊.md` 為單一真實來源。
> 下個 session 開工後此檔可覆蓋成新快照。

## 開工先做（鐵則）
1. cwd 是 pm-core-paul；`git remote -v` 確認指向 `PaulHsu02060/pm-core-paul`。
2. `git pull` → `git log -3` 確認 HEAD 與 origin/main 齊平（**目前應為 `c0f9717`**）。
3. 讀必讀：`HANDOFF.md`（§A 鐵則＋§B 本週）、`AGENT_GATE.md`、`pm-core-architecture.md`、`PM-Core_踩坑與操作手冊.md`；做 CSS 前讀 `UI-CSS-設計規範.md`。

## 目前狀態
- HEAD `c0f9717`（origin 齊平）；版本號 app.js／style.css 皆 `?v=20260629-7`。
- 純靜態單頁：index.html + app.js + style.css，localStorage，no build step。
- 引擎測試 160/160 PASS。
- ⚠ 本 session 六批全 `[unverified]`（DEV file:// 驗過，**github.io 線上未驗**）。

## 本 session 做了什麼（已 commit＋push，詳見架構 §18.9）
- **雙軌導覽 Phase 0**（`869a955`）：sidebar 拆「個人工作台(workspace,首頁)／全專案總覽(portfolio)」；新增 `Workspace`/`Portfolio` 頂層物件（§18.7 分包，未來拆檔）；`renderDashboard`→`Workspace.render`＋builder 搬包；甘特/月曆留共用層。
- **Phase 1 總覽頁**（`f03d5cd`）：`Portfolio.renderOverview`＝4 指標卡＋雙列進度矩陣＋部門負載＋當週待處理＋HintBox（§18.8，A/B/C 算法）。
- **UI 配色＋會議簡化**（`974e16e`）：暖沙底/燕麥格/格線A(橫實縱虛)/日期凍結/午休縮半/週末預設下週；會議右欄卡→週曆表頭「管理會議」鈕；Portfolio B 卡頂線+階段膠囊。
- **設定精簡**（`86cc402`）：排程 tab 只留工作日曆。
- **修正**（`c0f9717`）：sticky 回正＋token toast 守衛＋DEV 面板收起。

## 明天 / 下個 session 從這開始（待辦，見 HANDOFF §B）
1. **線上驗證最優先**：github.io 逐項驗本批（全 `[unverified]`）。
2. **雙軌導覽 Phase 2**：小時計 Task 折算部門負荷＋驗證／趨勢「較上週」綁快照／會議加 dept-owner 欄。需 §17 快照＋會議 schema 擴欄。
3. **§17 全域定時備份+還原**：後端 .gs 起，最高風險、獨立 session、照 §8f 新部署驗。
4. **尾巴**：工時設定 UI 已移除(值固定現值不可改)、saveSettings 留 null-guard dead reads、預計%/部門負載近似、DEV 膠囊與 toast 可能微重疊、KPI「較上週」留白。

## 關鍵錨點（app.js）
- 路由：`showPage`／`renderPage`（case workspace→`Workspace.render`、portfolio→`Portfolio.render`）；`currentPage` 預設 `workspace`、`currentView` 預設 `overview`。
- 工作台：`Workspace.render`（4 KPI＋週曆`buildWeekScheduleHtml`＋會議鈕`App.openMeetingModal`＋便利貼）。
- 總覽：`Portfolio.render`/`switchTab`/`buildTabsHtml`/`renderOverview`＋算法 `projectHealth`/`totalProgress`/`overdueTasks`/`choreRatio`/`currentStage`/`projectProgress`/`deptLoad`/`weeklyTop`。
- 會議管理單一入口：`buildMeetingModalBody`（定期＋特定）。
- 週曆配色變數：`--cal-cell-bg`#FAF9F5／`--cal-axis-bg`#F2EFE6／`--cal-line-h`#C4CDC5／`--cal-line-v`#D6DDD7／`--cal-today-bg`#EEF5EF／`--cal-today-badge`#2D5A42；頁面底 `--bg`#F5F4EE、`--pearl`#F9F8F3。

## 硬規則（每步必守）
- **commit-gate**：commit 前單獨 `git status` 貼完整原文（無 config.local.js/seed.local.js/seed.sample.js/_probe*/_tmp_*）；add→commit→push **三步分開、嚴禁 `&&`/`;`**；`git add` 只列明確檔名；禁 `push --force`；訊息經 Paul 確認；避 `>` `/`。
- 動 code 前後 `node --check app.js` ＋ `node docs/test-schedule-cases.js`(160)，輸出原文都貼。未線上驗標 `[unverified]`。
- 改 app.js 或 style.css → 同步升 index.html 對應 `?v=`（只升動到的檔；目前皆 `20260629-7`）。
- 改檔一律 Edit/Write，禁 PowerShell 文字回寫（中文亂碼）；大區塊刪改可用 node 腳本＋count 守門（坑5）。
- **CSS 鐵則**：顏色/圓角/z-index 走 `:root`，hex 只准在 `:root`；暖森林綠盤（sage/amber/rose/stone），動 CSS 前讀 `UI-CSS-設計規範.md`。
- 回覆一律正體中文、白話、列選項+建議、不用工具彈窗問、要 diff 貼完整原文。
- **大功能/UI 先出 Mockup 定版再寫**（visualize/show_widget 用**純靜態 HTML**，JS 版本曾渲染空白）。

## 協作風格（Paul）
機械改動一口氣做完、最後貼總結（node --check + 160 + 原文）；只有測試 FAIL／邏輯分支語意改變／anchor 不確定／動既有邏輯／commit-gate 才停。判斷風險截 diff 審。決策過的不重複問。這台桌機有 Node v24（可本機驗）。
