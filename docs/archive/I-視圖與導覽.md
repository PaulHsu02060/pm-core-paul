# PM-Core Archive · I · 視圖／UI／導覽

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

### 8g.8 死碼清除（轉 auto 後）

轉 auto 後清除：`:root` 三個寬度 token（--col-num-w/--col-mid-w/--col-action-w）、`col.col-*` 寬度綁定三條、`.data-table.compact` 變體、各表 render 的 colgroup 固定寬。待辦遷移後另清 subgrid 殘留（舊 fr 規則、#activeTaskList 系選擇器、.toschedule-group.collapsed）。

---

### 16.7 施工分塊
✅ 塊1 :root 新增 --nav-active/--danger/-d/--ink-btn（純加變數）`35f6f80`
✅ 塊2 .tb-action.ink variant + .tb-action.danger 改引 --danger（CSS）`35f6f80`
✅ 塊3 .view-tabs-bar .tab-btn.active scoped --nav-active（CSS scoped）`35f6f80`
✅ 塊4 buildProjectHeaderHtml 重排（HTML）`2a9b992`
✅ 塊5 ⋯ 更多選單 + 匯出下拉元件（HTML+CSS+JS toggle，z-index --z-dropdown、點外關閉）`2a9b992`

---

### 18.7.1 拆檔執行盤點（2026-06-30 確認，供新 session 照做）

> app.js＝**11928 行**。命名已聚集（§18.7）。本節＝實際抽檔範圍＋載入序＋執行步驟的確認盤點。**分批做、每批獨立 commit、零行為變更（純剪貼）**。乾淨不出錯優先，分幾批無妨。
>
> ⚠ **本節（§18.7.1）為早期「先抽 3 檔」草案；2026-06-30 已做全檔盤點＋跨檔驗證 → 完整 12 檔總盤見 §18.7.2（權威）**。**修正**：§18.7.1 批3 chunk C 把 `_ganttDateRange`/`_ganttColumns` 分去 shared-render 是錯的——它們只被 `exportProjectWbs` 用、應歸 `excel.js`（見 §18.7.2 夾島3）。**載入序/TDZ/執行步驟兩節共用**，新 session 以 §18.7.2 的檔案清單為準。

**載入序鐵則（TDZ／最關鍵）**
- `const App`(2198)／`const Workspace`(2524)／`const Portfolio`(2525) 宣告都在 app.js → **app.js 必須在所有抽出檔之前載入**。
- 抽出檔只做 `X.method = function`（執行期才呼叫）；啟動點 `DOMContentLoaded`（app.js 結尾 ~11915）在所有 `<script>` 載完後才跑 → 抽出檔彼此順序不拘，只要都在 app.js 之後（同步 script 天然滿足）。
- index.html `<script>` 順序：**app.js →（其餘抽出檔任意序）**，各帶獨立 `?v=`。
- 跨檔全域引用（抽出檔呼叫 app.js 的 top-level：`getEffectiveSchedule`/`isTaskDelayed`/`getProjectStages`/`weeklyScheduledHours`/`weekCapacityHours`/`taskDisplayProgress`/`generateSchedule`/`D.*`/`U.*`/`Storage`/`CloudSync`/`Auth`）→ 經 classic-script 全域語彙環境解析，app.js 先載即可用。

**批 1：portfolio.js（最乾淨，零夾島；已驗全檔無漏網 Portfolio.*）**
- **抽取錨點（精確）**：起＝`Portfolio.buildTabsHtml = function()`（行 2822；前可含節標題 `// ═══ PAGE: DASHBOARD ═══` 2819–2821）；止＝**到（不含）** `App.buildProjectViewTabsHtml = function()`（行 3183）。**即 2822–3182**，21 個 Portfolio.* 全在內（`_live`/`_overdue`/`projectHealth`/`healthCounts`/`totalProgress`/`overdueTasks`/`choreRatio`/`_kpiSnap*`/`_trendBadge`/`currentStage`/`projectProgress`/`weekCapacity`/`deptLoad`/`weeklyTop`/`renderOverview` …）。
- 其後 3183/3193 兩個 `App.*`（`buildProjectViewTabsHtml`/`buildReportTabsHtml`）**留 app.js**。

**批 2：workspace.js（含 4 個工作台週曆 App.* 方法，連續一段）**
- **抽取錨點（精確）**：起＝`Workspace.render = function()`（行 3200）；止＝**到（不含）** `App.promptModal = function(opts)`（行 3782）。**即 3200–3781**，整段連續。
- 內含：6 個 `Workspace.*`（render/dashboardWeekShift/buildWeekScheduleHtml/buildNextWeekTodoHtml/buildMemoListHtml/attachMemoDrag）＋ `// ─── DRAG & DROP HANDLERS ───`(3582) ＋ **4 個 App.* 週曆方法**（`handleScheduleDragStart`/`handleScheduleDrop`/`pinTaskToWeek`/`unpinTaskFromWeek`，3583–3649）。那 4 個＝週曆拖拉移動任務＋釘選/取消釘選本週，100% 工作台、只是掛 App.*；**跟著搬、維持 App.* 名稱**。
- ⚠ **`buildWeekScheduleHtml`(3340) 函式很長、本體內有 col-0 的 `};`**（會誤判 brace 配對）→ **務必以「下一個頂層 def」當結束錨點，不要用 brace/第一個 `};` 當尾界**（批1/批3 同此原則）。

**批 3：shared-render.js（gantt/月曆，3 段、跳島，風險最高；已驗全檔 gantt/month 方法無漏網）**
- **抽取錨點（精確，3 段，皆「起＝某 def、止＝到下一 def 前」）**：
  - **段A 8491–8962**：起＝`App.renderGantt = function`（8491；前可含 `// ═══ PAGE: GANTT ═══` 8488–8490）；止＝到（不含）`App.renderKanban = function`（8963）。含 gantt 全套（renderGantt/buildGanttHeaderHtml/ganttShift/ganttToday/buildGanttFilterHtml/toggleGantt*/`GANTT_STATUS_LABELS`/`GANTT_SOURCE_DESC`/buildGanttRowHtml/_ganttPreds/_drawGanttLinks）＋`renderMonth`。
  - **段B 9013–9071**：起＝`App.buildYMPickerHtml = function`（9013）；止＝到（不含）`App.renderReport = function`（9072）。月曆 picker 7 法（buildYMPickerHtml/toggleYMPicker/monthShift/monthToday/monthYearShift/monthYearSelect/monthPick）。
  - **段C 9544–9585**：起＝`App._ganttDateRange = function`（9544；含前註解 9540–9543）；止＝到（不含）`App.exportProjectWbs = async function`（9586）。gantt 共用 helper（`_ganttDateRange`/`_ganttColumns`；亦被 Excel 匯出用）。
- **跳過的島（留 app.js）**：`renderKanban`(8963–9012)、`renderReport`＋週報 helper＋`predToWbsFormat`(9072–9543)。
- ⚠ renderGantt/renderMonth 不可搬進 Portfolio：被專案頁 gantt/月曆 tab 同時用（§12.1 單一真實來源），故留 top-level 共用層。

**每批執行步驟（照 PDCA 拔除驗證過的）**
1. node 腳本：讀 app.js（**utf8**，踩坑5＝讀寫編碼必一致 utf8，曾踩 latin1 寫壞中文）→ 錨點自檢（防行號漂移）→ 抽目標段寫新檔（utf8）＋從 app.js 刪同段；**dry-run 先印計數**（目標方法 app.js→0、新檔→N、跳過的島計數不變）。確認再 `--write`。
2. index.html 加 `<script src="X.js?v=...">`（app.js 之後）＋升該檔 `?v=`。
3. `node --check app.js X.js` ＋ `node docs/test-schedule-cases.js`(160) ＋ **線上驗**（該檔對應頁面正常、Console 無紅字）。
4. **獨立 commit、勿混功能**。CRLF：split/join 只動 `'\n'`、留行尾 `'\r'`；commit 前 `git diff --ignore-all-space --shortstat` 與一般 shortstat 對齊＝無翻車（坑4）。
5. **邊界已釘死、夾島已盤完**（2026-06-30 本盤點：全檔 Portfolio/Workspace/gantt/month 方法已驗無漏網、島已標明）→ 新 session **不必重新分析**，直接照上方各批「起/止錨點」用 node 抽段即可。執行時僅需 node 錨點自檢（確認那兩行 def 文字仍在預期行）防行號漂移。

### 18.7.2 全檔拆檔總盤（2026-06-30 全檔盤點＋跨檔驗證，**權威**）

> app.js 11928 行 → **11 檔**（app.js 餘料併入 app-core）。本節＝「新 session 照著拆、不必再分析」的總圖：每檔來源行界＋夾島＋風險。零行為變更（純剪貼）。載入序/TDZ/執行步驟見 §18.7.1（共用）。**行號為本盤點當下值；抽取一律用 next-def 錨點自檢防漂移，長函式內有 col-0 `};` 不可用 brace 配對。**

**目標檔（11）＋載入序（index.html `<script>`，各帶 `?v=`）**
1. `app-core.js`（~1760，**最先**）2. `schedule.js`（~585）3. `template.js`（~2600，高）4. `portfolio.js`（~363）5. `workspace.js`（~600）6. `project.js`（~2230）7. `shared-render.js`（~470）8. `report.js`（~825）9. `settings.js`（~620）10. `meeting.js`（~594）11. `excel.js`（~870，高）
- **硬約束**：`app-core.js` 第一（內含 `const App`/`Workspace`/`Portfolio`/`Auth` 宣告＋**所有跨檔共用 top-level 函式**＋modal helper＋bootstrap `DOMContentLoaded` 在其結尾）。2–11 彼此順序不拘（方法執行期才互呼）。

**5 個關鍵跨檔夾島（已親自驗證跨檔呼叫，務必照此歸位，否則拆完會壞）**
1. `getProjectStages`＋`taskFieldDatalistOptions`/`stageDatalistOptions`/`subgroupDatalistOptions`（~9878–9918）→ **app-core**（Portfolio 2940／project 4152/4316/5076 跨呼，已驗）。
2. `taskDisplayProgress`（4238）→ **app-core**（Portfolio 2887/2950 用，已驗）。
3. `_ganttDateRange`/`_ganttColumns`/`predToWbsFormat`/`exportProjectWbs`（9529–9877，物理在 REPORT 區尾）→ **excel.js**（_ganttDateRange/_ganttColumns 只被 exportProjectWbs 用 9597/9598、renderGantt 沒碰；exportProjectWbs 依賴 excel 的 WBS_COLUMNS/GANTT_FILL，已驗。**§18.7.1 chunk C 原誤分 shared-render，以此為準**）。
4. WBS 匯入 helper `wbsDateStr`/`buildMemberToDept`/`ownerToDept`/`buildDepts`（10956–11022，物理在 EXCEL-HISTORY 區尾）→ **excel.js**（parseWbsExcel 用）。
5. modal helper `confirmModal`/`openModal`/`closeModal`（11809–11860）＋`promptModal`（3782）→ **app-core**（102 處跨檔，已驗）。
- 小島：`renderKanban`（MONTH 區 8963–9012）→ **project.js**；`backupAll`/`restoreAll`/`clearAll`（11723–11769，WBS 區尾）→ **settings.js**（呼叫端 10209–10212）。

**逐檔來源行界**
- **app-core.js**：1–1043（地基＋共用 helper 全套）＋`getEffectiveSchedule`/`mapStatus`（1949/1972，從 schedule 區挖）＋Auth＋App 字面量＋Workspace/Portfolio 宣告（1986–2525）＋夾島1（~9878–9918）＋夾島2（4238）＋夾島5（modal 11809–11860＋promptModal 3782/3794）＋onboarding/initTooltip（11774/11861–11911）＋bootstrap（11912–11928，**最後**）。
- **schedule.js**：1365–1948（純引擎 computeSchedule/Backward/applySchedule/placeTask/fillAcrossDays/generateSchedule）。⚠ 1044–1364 前置/口徑 helper 已歸 core（多檔共用）。
- **template.js**（高）：2527–2818（範本套用 _reschedulePreview/_computeSlack/applyTemplate）＋5965–8272（路線B 建立流程＋Stage 2 新舊版 _s1*/_s2*/_ovf*＋部門 component buildDeptRowsHtml/deptUI/deleteProject）。⚠ 5875–5964 範本第一階段表單（_stagePickHtml 等）歸此（從 project 區挪）。
- **portfolio.js**（低）：2819–3181（Portfolio.* 21；零夾島）。
- **workspace.js**（中）：3182–3199（App tabs buildProjectViewTabsHtml/buildReportTabsHtml）＋3200–3781（Workspace.* 6＋4 個 App.* 週曆方法 3583–3649）＋memo CRUD（addMemo/editMemo/deleteMemo/showUrgentModal ~3796–3859）。promptModal 移 core。
- **project.js**（中，大）：3894–5874（PAGE PROJECT：header/KPI/階段/部門/soft-delete/quick add/task modal/predecessor/HintBox/task CRUD）＋renderKanban（8963–9012 挖入）。⚠ taskDisplayProgress 挖出→core；5875–5964 範本表單挪→template。
- **shared-render.js**（中）：8488–8862（gantt 全套＋GANTT_STATUS_LABELS/SOURCE_DESC）＋8868–8962（renderMonth，跳 renderKanban）＋9013–9068（月曆 picker）。**不含 _ganttDateRange/_ganttColumns（→excel）**。
- **report.js**（中）：9069–9528（renderReport/reportWeekShift/saveWeekNote/exportReportExcel）＋週報匯入整包（10874–10955＋11406–11722，parseExcelImport/render/perform）。
- **settings.js**（低）：9920–10425（PAGE SETTINGS＋SECURITY_INFO）＋10426–10493（cloud sync handlers）＋backupAll/restoreAll/clearAll（11723–11769 挖入）。⚠ **加收 `googleSignOut`**（原物理位置夾在 meeting 範本區尾 orig~10850；屬登入/登出地基、與 cloud sync 三法同家族 → 歸此，非 meeting。2026-06-30 批2 拆檔審出，見下行修正）。
- **meeting.js**（低）：8273–8487（OCR 截圖 handleShotUpload/runOCR/confirmOCRMeetings）＋會議範本（**止錨更正**：原寫 10494–10872，含 `googleSignOut` 為誤掃；正解＝起 `// MEETING TEMPLATE HELPERS` 標題、止到 `deleteSpecialMeeting` 尾，**排除其後的 `googleSignOut`→settings**。2026-06-30 批2 已落地）。
- **excel.js**（高）：夾島3（9529–9877 WBS 匯出）＋夾島4（10956–11022 WBS 匯入 helper）＋11023–11405（WBS_COLUMNS/GANTT_FILL/parseWbsExcel/buildWbsPreview/performWbsImport）。

**建議執行批次順序（低風險先、依賴少先；每批 `node --check`＋`node docs/test-schedule-cases.js`(160)＋線上驗＋獨立 commit）**
1 portfolio → 2 meeting → 3 settings → 4 schedule → 5 shared-render → 6 report → 7 excel → 8 workspace → 9 project → 10 template。
- **app-core.js 骨架最先建、定稿最後**：每抽一檔，把它挖出的共用 helper 順手歸位 core；全抽完 core 自然成形。

**3 個必停審點（截 diff 確認，非全重分析）**
- **template.js**：~50 個 _s1*/_s2*/_ovf* ＋退役註解夾雜、col-0 `};` 多 → 逐方法 next-`App.` 錨點。
- **excel.js**：跨三區拼湊，exportProjectWbs 依賴的 _ganttDateRange/_ganttColumns/predToWbsFormat/WBS_COLUMNS/GANTT_FILL 必須全收同檔（const 在用它的函式上方）。
- **project.js 5875–5964 切點**：範本第一階段表單 vs task CRUD，截 diff 確認別切錯邊。

**通用鐵則**：node 讀寫一律 utf8（坑5）；CRLF split/join 留 `\r`、commit 前 `git diff --ignore-all-space --shortstat` 與一般 shortstat 對齊＝無翻車（坑4）；每檔獨立 commit、勿混功能；每個 `<script src>` 帶 `?v=` 與 style.css 同值（CLAUDE.md）。

### 18.9 落地紀錄（2026-06-29，Phase 0＋Phase 1＋UI/設定整理，全 [unverified] 線上待驗）

**Phase 0 導覽拆分（`869a955`）**：sidebar「總儀表板」→ `個人工作台`(workspace,預設首頁)＋`全專案總覽`(portfolio) 兩節點；`currentPage` 新增 workspace/portfolio、portfolio 內 `currentView` overview/gantt/month；新增 `Workspace`／`Portfolio` 頂層物件（§18.7）；`renderDashboard`→`Workspace.render`，週曆/會議/便利貼 builder 全搬 `Workspace.*`（handler/dialog/memo-CRUD 留 `App.*`、onclick 對應改）；`renderGantt`/`renderMonth` 留共用層、`Portfolio` 帶全專案範圍呼叫；index.html `page-workspace`/`page-portfolio` 容器。

**Phase 1 總覽頁（`f03d5cd`）**：`Portfolio.renderOverview` 真內容（§18.8）——4 指標卡＋雙列進度矩陣（預計 vs 實際）＋部門負載＋當週待處理＋各區塊 HintBox。算法 helper 複用 `taskDisplayProgress`／`getProjectStages`／逾期口徑（單一來源），A/B/C 算法已套；CSS `.pf-*` 走 :root。

**UI 配色＋會議簡化（`974e16e`）**：頁面底 `--bg`→暖沙 `#F5F4EE`；週曆燕麥格 `#FAF9F5`＋暖沙軸 `#F2EFE6`＋格線方案 A（橫實 `--cal-line-h`#C4CDC5／縱虛 `--cal-line-v`#D6DDD7，改逐格 border、移除 gap 線與圓角）＋今日 `#EEF5EF`＋圓圈 `#2D5A42`；日期列凍結（`.ws-day-header`/`.ws-corner` sticky，top=render 時實測 topbar 高 `--ws-sticky-top`）；午休縮半 33px；六日預設顯示下週（`dashboardWeekOffset` 初值）；會議右欄卡移除→週曆表頭「管理會議」鈕（`Workspace.buildMeetingPanelHtml` 已刪）；Portfolio B 卡頂線（正常 `--sage-700`／延誤 `--danger`）＋當前階段淡綠膠囊。

**設定精簡（`86cc402`）**：設定「排程」tab 移除「工時與排程」「定期事件」兩區、只留工作日曆；會議管理收斂至工作台「管理會議」彈窗（`buildMeetingModalBody` 含定期＋特定，單一入口）；工時值由 `saveSettings` `sv()` null 防呆保留現值（引擎照常用 `DATA.settings`）。

**修正（`c0f9717`）**：週曆 sticky 因 `.week-schedule` 的 `overflow:hidden` 改變 sticky 基準→錯位，移除回正；`renderLists` 加「無憑證(`!_idToken`)不打後端」守衛、止 DEV 開設定頁狂跳「登入已過期」toast（線上 admin 有憑證照常、token 真過期仍正確提示）；DEV 身份面板預設收起（小膠囊、點開才展開、不擋右下 toast）。

**Phase 2（未做，需新資料/快照）**：① 小時計（時段制）Task 折算進部門負荷＋驗證 ② 趨勢「較上週」綁 §17 每日快照 ③ 會議/事件加 `dept`/`owner` 欄 → 才能做跨部門雜事負載堆疊（須含偏頗標註）。

**已知近似／尾巴**：預計% 用 inclusive `workdaysBetween` 近似；部門負載僅含 WBS 工期（個人雜事待 Phase 2）；工時與排程設定 UI 已移除＝之後不能從 UI 改工時/工作日（值固定現值，要改需重開 UI 或改資料層）；`saveSettings` 留 null-guard 的工時 dead reads（無害未清）；DEV 收起膠囊與右下 toast 仍可能微重疊（要完全不擋可改移左下）；KPI「較上週」留白；本批全 `[unverified]`、待 github.io 線上驗。

> ↪ 原 §18.10 落地／施工歷史
**commit 拆分（風險分層，一次一件、各自核 diff、各自停等放行）：**
1. 引擎級：`deptLoad` 大改（本週均攤＋容量衍生＋部門名穩健解析），`node --check`＋160 測試貼原文。
2. 呈現級：stacked bar UI（綠+橘分段、容量線、爆單高亮、圖例、偏頗標註）＋HintBox 移到區塊 Title 下方（§6.5b 放置標準），:root 暖色。
3. schema/UI 級：新增小時 Task 補 dept 下拉（Y 池）＋ `saveNewTask` 寫入。
4. 設定/邏輯級：全域工時設定回歸（`dailyHours`＋`workDays` UI）＋變更彈窗（影響清單＋confirm）。

**落地紀錄（2026-06-29）**：設計 `7c849e5`／`d217f3a`；Commit 1 `e958427`、Commit 2 `2277c53`、Commit 3 `f5e8df5`、Commit 4 `4f0a7cc`。連帶同 session UX 修正：任務表單必填 `*`＋空欄紅框引導 `e40e9c9`、新建小時 Task 即時顯示週曆臨時時段 `c93fd19`、設定有改未存離開提醒 `a6c009f`、週曆今日欄底改暖沙灰（`--cal-today-bg` #EEF5EF→#F4F2EA）`b23adfd`。多項 DEV 驗 Pass、github.io 全量待驗。

> ↪ 原 §18.10b 落地／施工歷史
**commit 拆分（風險分層，一次一件、各自核 diff、各自停等放行）：**
1. **引擎級**：`deptLoad` 加會議累加（逐日掃三 store＋`eventOccursOnDate`＋`__ALL__` 展開＋category/dept 過濾）＋偏頗標註文案更新。`node --check app.js`＋`node docs/test-schedule-cases.js`(160) 貼原文。
2. **UI/schema 級**：三入口加 `owner`/`dept` 欄（下拉＝Y 池＋全體均攤）＋三組 save 寫入 schema（`addManualMeeting`／`saveRecurringMeeting`／`saveSpecialMeeting`，含 once 走 `DATA.meetings` 那條）。

> ↪ 原 §18.10b 落地／施工歷史
**落地紀錄（2026-06-30，`[unverified]`——本機無 node，JS 閘門 `node --check`＋160 案延桌機補驗）**：
- 設計定案 `e260ef0`。
- Commit 1 引擎級 `b7e9d02`：`Portfolio.deptLoad` 加「橘塊納專案會議」——逐日掃本週工作日（`D.isWorkday` 過濾）＋三 store（`recurringMeetings` 走 `eventOccursOnDate`／`specialMeetings`／`DATA.meetings`）＋過濾器（`category==='meeting'` 且 dept 有效）＋`__ALL__` 均攤所有部門不乘人數＋偏頗標註文案更新。**Python oracle 5 PASS／0 FAIL**（獨立重算驗 H_meeting／均攤不乘人數／打掃與未指派排除／週末排除）。
- Commit 2 UI/schema 級 `616871d`：共用 `App._meetingDeptOptions`（未指派＋選項Y池＋★全體均攤）；三入口加 `owner`（預設 `userName`）／`dept` 欄＋三組 save 寫入 schema（`addManualMeeting`／`saveRecurringMeeting`／`saveSpecialMeeting`）；index.html `app.js ?v=20260629-23→20260630-1`。ID 配對 12/12 驗過。
- **待補**：桌機 `node --check`＋160 案貼原文解 `[unverified]`；github.io 線上驗（三入口欄位顯示/存、橘塊納會議、全體均攤、容量線爆單）。

### 18.11 工作台視覺定案（2026-06-30，v6 暖中性洗淨＋白卡化）

> 工作台週曆與字卡的視覺單一真實來源（取代 §18.9 早期暖沙底版本）。線上驗多項 Pass。

- **週曆 v6**（`09bf59c`／`42ddc0a`／`c1d5d29`）：空白格純白 `--cal-cell-bg #FFFFFF`；格線暖灰實線（橫 `--cal-line-h #E5E1D7`／縱 `--cal-line-v #ECEAE2`）；今日欄極淡暖綠白 `--cal-today-bg #F4F7F4`（圓圈 `--cal-today-badge #2D5A42`，與暖沙頁底色相錯位切邊界）；深度工作卡白底 `--paper`＋1px 淡框＋4px `--sage-600` 左線；卡片 `padding 8px12px`、圓角 `--r6`、標題 13px/600、`.ev-meta` 11px、時間軸 12px。時間軸 **Google 線上式**：標籤騎隔線（中段 `.ws-tlabel` translateY(-50%)、首格 `.ws-tlabel-first` 靠上避凍結表頭、末格 `.ws-tlabel-end` 顯示結束時間 `gridEndHour`）。
- **白卡化**：時程表卡（拔掉舊 `--pearl` 沙底覆蓋）＋KPI 字卡 `.stats-row`＋便利貼 `.memo-board` 底色一律 `--surface`(#FFFFFF)，浮在暖沙頁底 `--bg #F5F4EE` 上＝獨立組件、不糊色。
- **KPI 4 卡（小時計/時程表口徑，`aeb9acc`）**：今日時段任務（schedule.items date===today 去重）／本週時段任務（week===wk 去重）／緊急（`measureType==='hours'` urgent，可點 `showUrgentModal` 只列小時計）／本週工時（`totalHours/availableHours`）。
- **時程表顯示設定（`c1d5d29`）**：只留「顯示時間範圍」（`gridStartHour`/`gridEndHour`，render `_h < _ge`＋末格補 `_ge` 結束標籤）；密度 toggle 已移除（render 固定一小時一格 `_slots=[0]`）；`setGridSetting` 不重開 modal（即時反映）。
- **全域彈窗鐵則**：禁原生 confirm/alert/prompt，用 `App.confirmModal`／`App.promptModal`（新共用）／`App.openModal`（§UI 規範 §0.6、踩坑坑8，`858c808`/`5f983ab`/`b4d84a8`/`5669b37`）。

---

### 18.13 口徑收斂：逾期/工時抽共用 helper（2026-06-30，等值重構）

> 承口徑稽核（§18.12 落地紀錄）。把散落的「逾期判斷」「工時公式」複製收斂成單一來源，等值重構（行為不變）。

- **逾期單一來源 `isTaskDelayed(t, today)`**（早存在，§4.6 口徑：未完成/未擱置 + 有效迄日<今天）。4 處改 call 它：`Portfolio._overdue`、`buildProjKpiHtml` DELAYED（保留 noEnd 另計）、`buildProjDeptHtml` 群組 delayed、部門逾期迷你清單。
- **工時單一來源（新增 top-level，split 友善）**：`weeklyScheduledHours(wk)`（本週 schedule.items duration/60 加總）＋`weekCapacityHours()`（每日工時×每週工作日，含 `||6/||0` 防呆）。`Portfolio.choreRatio`／`Portfolio.weekCapacity`／工作台本週工時·可用工時 四處改 call。工作台 availableHours 順帶得防呆（DEFAULT_SETTINGS 恆在→值不變）。
- **PDCA 處（`pdcaGroupLight`／pdca 子任務 overdue，只排 done 未排 hold）暫不收**：PDCA 整區待拔除重寫，屆時一起處理。
- **驗證**：`node --check`＋排程 160 PASS＋差異測試 84/0（5 狀態×4 迄日×4 站 OLD≟NEW 逐筆相等）。`?v=20260630-13`（僅 app.js）。

---

### 18.14 PDCA 報表區拔除（2026-06-30，第一刀＝UI/頁面；硬寫舊報表，待重寫）

> 由來：PDCA 報表頁是早期硬寫、口徑與新架構脫節（如逾期只排 done 未排 hold＝口徑收斂處 6/7）。決議整區拔除、日後重寫報表區。分兩刀。

**決策（Paul 拍板）**
- **可販日保留（方案 A）**：只砍 PDCA 的 UI/頁面，**不動 KPI**、保留 `proj.pdcaData.targetDate`（總覽/專案「WORKDAYS LEFT」仍讀它當截止日，§KPI 行為不變）。
- **分兩刀**：第一刀砍 UI/render/CSS/導覽；第二刀清資料層孤兒（ensure 函式、`STORE.pdcaGroups` load/save 等，targetDate 保留）。
- **migration 不碰**（坑1 敏感、`pdcaMerge_v1` 夾非 PDCA 專案合併邏輯）：留著，它寫的 pdcaData/pdcaGroups 無人讀＝無害（且 pdcaInitialData_v1 還幫 seed 專案填 targetDate）。

**第一刀已落地**
- 砍 17 個 `App.*pdca*` render 函式（renderPdca／exportPdcaReport／buildPdcaGroupCard…，含口徑收斂處 6/7 `pdcaGroupLight`＋pdca 子任務 overdue）＋導覽 4 處（頁標題／renderPage case／buildReportTabsHtml 的 PDCA 標籤／index.html `#page-pdca`）＋CSS `.pdca-*`/`.pst-*`（style.css）。
- **夾島保留**：`getProjectStages`（Portfolio/任務表單 5+ 處用）、`taskFieldDatalistOptions`/`stageDatalistOptions`/`subgroupDatalistOptions`（任務表單 datalist 用）——盤點報告誤判可整段砍、實讀才抓到，故用 node 腳本按錨點刪 3 段、跳過 2 島。
- 驗證：node 計數（PDCA 函式定義 17→0、島計數不變、class 引用歸零）＋`node --check`＋160 PASS＋線上（PDCA 消失、階段/datalist/WORKDAYS LEFT 迴歸正常）。`?v=20260630-15`。

**第二刀已落地**：清資料層孤兒——移 `STORE.pdcaGroups` key/load/save、`DATA_SUFFIXES` 的 'pdcagroups'、`ensurePdcaGroupsRoot`/`ensureTaskPdcaGroup`/`ensureAllPdcaData` 及呼叫＋殘留註解。**保留**：`ensurePdcaData`（初始化存活的 `pdcaData.targetDate`，migration 717/751 也叫它）＋`DATA.pdcaGroups: {}` 預設（migration 寫入相容、不持久化）。雲端同步 payload（upload/download）本就不含 pdcaGroups → 無需動 CloudSync。`node --check`＋160 PASS。`?v=20260630-16`。

---
