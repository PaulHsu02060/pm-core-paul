# PM-Core 雙軌導覽設計（個人工作台 / 全專案總覽）

> 定案 2026-06-29（Paul 拍板）。**動工前此文件必先 commit**；實作分階段、各自 commit、逐處核 diff、線上驗過才推。
> 補充架構文件 §2「雙視圖模型」：§2 講「專案頁 vs 總儀表板」的**呈現分流**；本文件講更上層的 **IA 重組**——把現「總儀表板」再拆成微觀/宏觀兩個平級 sidebar 節點。

---

## 0. 問題意識（為何要拆）

現「總儀表板」混了兩個**不同維度**的東西：

- **微觀（小時/分鐘）**：日常雜事、會議、便利貼、臨時備忘 → 個人日常執行。
- **宏觀（天/週）**：跨專案 WBS 工期、進度、部門負荷、延誤 → 大局監控。

混在一頁 → User 混淆；後台撈資料、算智慧排程時，兩種維度的邏輯互相打架。標準 PM 系統（Jira/Monday/Linear）都把這兩塊拆成獨立節點。

---

## 1. 現況盤點（重要：大半已存在，是「重組」非「重蓋」）

總儀表板 `currentView` 已有三個子視圖（`app.js` switchView，:2417）：

| 子視圖 | 內容 | 維度 |
|---|---|---|
| 儀表板 tab | `buildWeekScheduleHtml`（週曆）＋`buildMeetingPanelHtml`（會議）＋便利貼＋4 KPI（兩週內任務/進行中/緊急/本週工時） | **微觀** |
| 甘特圖 tab | `renderGantt`（全專案，標題已是「甘特圖·跨專案時程」） | **宏觀，已存在** |
| 月曆 tab | `renderMonth`（全專案範圍） | **宏觀，已存在** |

- 跨專案甘特、全專案月曆**早就做好了**，拆分時直接搬位、不重寫。
- 專案層已有 `depts:[{name,members}]`、`task.dept`、`task.role`（部門資料在專案端齊全）。
- 會議資料三 store：`DATA.meetings`（一次性）、`settings.recurringMeetings`（定期）、`settings.specialMeetings`（特定日期）——**目前皆無「部門/擔當」欄位**（影響 Phase 2 部門負載）。

---

## 2. 定案決策（2026-06-29）

**A. 兩個平級 sidebar 節點取代「總儀表板」**

- 🟢 **個人工作台（My Workspace）** ＝ 現「儀表板」tab 內容：週曆時程表＋會議管理＋便利貼＋個人 KPI。右上只留「＋新增小時 Task」；**無甘特**。**預設首頁**。
- 📊 **全專案總覽（Portfolio）** ＝ 內含 tabs：**總覽**(新建)／**跨專案時程**(=現成 `renderGantt`)／**歷史月曆**(=現成 `renderMonth`)。

**B. Q1＝B（個人記錄為主，可選掛他人）**
個人工作台只記「**我個人**」的小時計工作；其他單位的工作只在 Task 端（概略、以日計）紀錄，個人工作台**不計（必有漏算，已知且接受）**。會議/事件加一個**可選**「擔當/部門」欄：預設＝我；我知道的協作項目可手動掛某部門/人。
→ 宏觀的「部門負載」可選擇納入「已標註部門的個人時數」，但**文件與 UI 都必須明示：此數據偏頗，只含我記錄＋我願意掛上的，必有漏算**，不是真正的全員負載。

**C. Q2＝個人工作台當預設首頁**（天天用）；全專案總覽為第二顆（看大局/給主管）。

---

## 3. 命名 / 路由

- sidebar 第一區兩顆：`workspace`（個人工作台）、`portfolio`（全專案總覽）；移除「總儀表板」。
- `currentPage` 新增 `'workspace'`、`'portfolio'`。
- portfolio 內部 tab 狀態（沿用 `currentView` 模式）：`overview`／`gantt`／`month`。
  - gantt = `renderGantt`（全專案）、month = `renderMonth`（全專案）、overview = 新 `renderPortfolioOverview`。
- 啟動預設頁 = `workspace`。
- 標題/麵包屑/sidebar active 同步更新。

---

## 4. 分階段施工

### Phase 0：導覽拆分（小、低風險、**先做**）

- sidebar 加 workspace / portfolio 兩顆，移除總儀表板。
- **workspace page** = 現 `renderDashboard` 的微觀內容（4 KPI ＋ 週曆 ＋ 會議面板 ＋ 便利貼 ＋ 排序規則 ＋ 下週待辦），**拿掉** view-tabs（甘特/月曆）。
- **portfolio page** = view-tabs（總覽/跨專案時程/歷史月曆）；甘特 = `renderGantt` 全專案、月曆 = `renderMonth` 全專案；總覽先放 placeholder（Phase 1 補）。
- 路由/標題/麵包屑/sidebar active 對應更新；`switchView` 改掛 portfolio。
- **風險：低**（搬現成 render）。注意 `currentView` 狀態與「重繪帶範圍」沿用既有模式，防丟範圍坑（見 three-view-design §1.3）。

### Phase 1：全專案總覽「總覽」頁 MVP（**只用現有資料**，先 Mockup 定版再寫）

大廠四維精神，但**只畫有真資料的區塊**：

- **區塊 A 指標卡**（橫 4，暖石底）：
  - 專案健康度：總數 ＋ 🟢正常/🟡警告/🔴延誤 計數（延誤＝有 task 逾期；警告門檻後續定）。
  - 跨專案總進度：整體完工率（task done/total 或工時加權，算法後續定）。「較上週」**留白**（需快照，Phase 2）。
  - 核心延誤警報：逾期任務數 ＋ 最嚴重一筆影響。
  - 本週個人雜事佔比：現成 `totalHours / availableHours`（單人，已有）。
- **區塊 B 雙欄**：
  - 左 專案進度矩陣：各專案名／總起訖／進度條／當前階段（`_s2StageStatuses` 或 `getEffectiveSchedule` 推；資料現成）。
  - 右 部門負載：專案 WBS 各 dept 工時長條（現成 dept/task）。個人雜事色塊堆疊＝**可選**、且只含已標註部門者（Q1=B caveat）。
- **區塊 C**：當週待處理 Top N ＋ 逾期任務紅框卡（現成）。
- **empty state**：資料少時給漂亮空狀態（0 延誤＝🟢全部正常 hero），**不塞假卡、不留空格**（直接回應 Paul 的「版面空洞」顧慮）。

### Phase 2：需新資料 / 快照才能做（先別做，先設計）

- 趨勢（較上週 +x%）、歷史完工里程碑月曆牆 → 需**每日快照**，綁架構 §17 全域備份一起。
- 會議/事件加「擔當/部門」欄位（資料模型加欄）→ 才能做跨部門雜事負載堆疊。
- 部門負載把個人雜事正式併入（須先有上面欄位＋偏頗性標註）。

---

## 5. 資料模型 / 待決（細節 Phase 1 Mockup 後定）

- 會議三 store 加**可選** `dept` / `owner` 欄（Phase 2）。
- 「總進度」「健康度門檻」「當前階段判定」算法 Phase 1 Mockup 後定。
- 部門負載偏頗性：文件與 UI 皆明示「僅含已記錄項目，必有漏算」。

---

## 6. 鐵則（每 Phase 必守）

- 各 Phase 獨立 commit、逐處核 diff、`node --check app.js` ＋ `node docs/test-schedule-cases.js`(160)、**線上驗過才 commit**。
- 大功能（尤其總覽頁 UI）**先出 Mockup 定版**再寫 code。
- CSS 走 `:root` 暖森林綠；版面 empty state 不塞假卡。
- 改 `app.js`/`style.css` 同步升 `index.html` 的 `?v=`。
