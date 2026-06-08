# PM-Core 三視圖設計文件（看板 / Gantt / 清單）

> 對應架構文件 §10 待施工清單「第二優先：核心 — 專案 Task By Stage 三視圖」。
> 動工前此文件必須先 commit。實作分階段，每階段獨立 commit、逐一核 diff → 線上驗證。
> 基準：今日（2026-06-08）HEAD `fb90882`，引擎 56/56 PASS。
> 與架構文件雙份同步：`docs/` 與 `.claude/` 逐 byte 一致。

---

## 第一部分：定案決策（2026-06-08）

### 1.1 範圍與落點

| 落點 | 內容 | 視圖 |
|---|---|---|
| 專案頁（單專案，`task.project===pid`） | 該專案 task | 看板 / Gantt / 清單 三視圖切換 |
| 總儀表板（全專案，不篩 pid） | 全部 task | **排序清單**（非看板分欄）；Gantt / 清單視圖照舊 |

**關鍵區分：總儀表板「看板」不做分欄**，改為一條按「最新階段 + 緊急程度」排序的清單（見 1.4）。看板分欄只在專案頁。

### 1.2 看板分欄（僅專案頁）

可切換分欄依據，兩種：

- **按狀態**：固定 5 欄 `pending`（未開始）/ `wip`（進行中）/ `done`（已完成）/ 延遲 / `hold`（暫停）。
  - 「延遲」非 task.status，是即時推導（`(deadline||plannedEnd) < today 且 status!=='done'`，呼應 §4.6）。延遲卡同時也屬某 status，看板「延遲」欄優先收（一張卡只進一欄，延遲優先於其原 status）。
- **按階段**（`task.stage`）：欄數動態（J系列有 11 階段）。
  - **風險：階段多時橫向爆掉**。設計對策：階段 > 6 時，看板改橫向捲動，或退回「清單依階段分組」呈現（此細節留實作階段 K-3 再定，先做狀態分欄）。

分欄依據切換 = 分段鈕或下拉，狀態存 `this.boardGroupBy = 'status'|'stage'`（重繪要帶回，防 B-1 同款坑）。

### 1.3 三視圖切換路由

- 沿用今日 B-2 的 `projectView` 機制（`dashboard|gantt|month` 已存在），擴充加入 `board|list`（或重新定義 view 集合）。
- 切換用分段鈕（同 B-2 樣式），各視圖內部切換、非全域 tab（導航形態「丙」，見架構文件導航架構節）。
- 重繪一律帶範圍（targetId + pid），沿用今日 monthScope/ganttScope 的「存範圍→重繪讀回」模式，避免重繪丟範圍。

### 1.4 總儀表板排序清單

- 不分專案、不分欄，一條排序清單。
- 排序鍵：**最新階段（用 task 時間判定）→ 緊急程度**。
  - 「最新階段」定義：用 task 的有效日期（`getEffectiveSchedule`）判定該專案/該 task 目前進行到的階段。具體判定邏輯實作階段 K-5 設計（候選：取該專案中 today 落在其區間、或最近未完成的階段）。
  - 緊急程度：`task.urgency`。
- 卡片需顯示**所屬專案**（跨專案清單，否則分不清）。

### 1.5 Gantt

- **大部分共用今日修好的 `renderGantt`**（已帶 ganttScope，§B-1）。三視圖的 Gantt = 傳入範圍呼叫，不重做（最高原則：不重複）。
- **專案頁 Gantt 加前置連接線**（FS/SS/FF/SF 箭頭）：
  - 這是架構文件 §10「Gantt 另案 #2」，**獨立大功能**，列為本設計最後階段 K-6，單獨規劃。
  - 有設前置（`task.predecessor`）才畫；解析沿用 `parsePredecessors`。
  - 需設計：箭頭起訖座標（依甘特條 DOM 位置）、SVG overlay 圖層、四種關係的連法、避免線交錯的繞線（先求有，繞線後續精修）。
- 總儀表板 Gantt 無連接線（跨專案無統一前置關係，也做不了）。

### 1.6 清單視圖（圖二樣式）

- 表格欄位（順序）：**編號**（`task.wbs`，標題顯示「編號」不顯示「WBS」）/ 任務名稱（`name`）/ 部門（`dept`，id→name）/ 負責人（`owner`）/ 截止日（`deadline||plannedEnd`）/ 進度（`progress`）/ 狀態（`status`）/ 優先級（`urgency`）。
- 依專案分組標頭（單專案頁就一組；總儀表板可不分組或按專案分組）。
- 可排序（點欄標題）留後續，先做固定排序（依 wbs 或階段）。

### 1.7 看板卡片欄位

- 卡片顯示：編號 / 任務名 / 前置（`←N`）/ 子群組標籤（`subgroup`）/ 進度% / 截止日 / **負責人**。
- 總儀表板清單卡另加：所屬專案。

### 1.8 篩選/搜尋列（頂部，三視圖共用）

- 狀態下拉 + 部門下拉 + **負責人下拉** + 關鍵字搜尋（搜 WBS/任務名/負責人）。
- 篩選是呈現層，吃全部 task 後過濾，不影響計算層（部門負荷/KPI 仍吃全部，呼應 §2.4）。

---

## 第二部分：資料結構與分層（遵守四層架構）

### 2.1 核心層（純函式，回傳資料，不碰 DOM/Storage）

新增純計算函式（命名暫定，實作可調）：

- `groupTasksForBoard(tasks, groupBy)` → 回傳 `{ columns: [{key, label, tasks:[]}] }`。`groupBy='status'|'stage'`。延遲欄的推導在此處理。
- `sortTasksForDashboard(tasks)` → 回傳按「最新階段+緊急程度」排序的 task 陣列，每筆帶 `_projectName`、`_stageRank` 等衍生欄（帶推理依據，呼應最高原則）。
- `filterTasks(tasks, {status, dept, owner, keyword})` → 回傳過濾後 task 陣列。三視圖共用。

核心函式只回傳資料，呼叫端決定 render。**禁止在核心函式內呼叫 renderXXX 或 Storage.save**（反模式）。

### 2.2 UI 層（render，吃算好的資料吐 HTML）

- `renderBoard(targetId, pid)` / `renderList(targetId, pid)` — 新增。
- `renderGantt` — 沿用（已存在，帶 ganttScope）。
- 各 render 先呼叫核心層拿資料，再吐 HTML。範圍存進對應 scope 物件（重繪讀回）。

### 2.3 狀態存放

- `this.projectView`（已有，擴充 view 集合）
- `this.boardGroupBy = 'status'|'stage'`
- `this.viewFilter = {status, dept, owner, keyword}`（篩選列狀態，重繪保持）
- 所有狀態重繪時讀回，避免重繪丟失（今日 B-1/B-3 同款坑的教訓）。

---

## 第三部分：實作分階段（每階段獨立 commit）

> 依風險與依賴排序，由小而大。每階段：撈現況 → 核 diff → 線上驗證 → commit。

**K-1：三視圖路由骨架**（中，先做）
- 擴充 projectView 加 board/list；分段鈕加兩個頁簽；切換能動、內容先留白。骨架能動再做內容。

**K-2：清單視圖**（中）
- `renderList` + 表格欄位（§1.6）。先固定排序、先不做可排序。圖二樣式。

**K-3：看板視圖（按狀態）**（中）
- `groupTasksForBoard(tasks,'status')` + `renderBoard`。5 欄、延遲推導、卡片欄位（§1.7）。圖一樣式。

**K-4：看板切換按階段**（中，依賴 K-3）
- `groupBy='stage'` 分支 + 分欄切換鈕 + 階段過多的橫向處理。

**K-5：總儀表板排序清單**（中，獨立）
- `sortTasksForDashboard`（最新階段判定邏輯在此設計）+ 卡片含所屬專案。不分欄。

**K-6：專案頁 Gantt 前置連接線**（大，最後，獨立規劃）
- FS/SS/FF/SF 箭頭。動工前需另出細部設計（座標算法、SVG overlay、繞線）。風險最高，單獨多 commit。

**橫切：篩選/搜尋列**（§1.8）
- `filterTasks` 核心函式 + 頂部篩選列。可在 K-2 完成後插入，三視圖共用。建議 K-2 後做（K-2a）。

---

## 第四部分：施工鐵則（沿用既有）

- 每階段：先撈現況原文（不憑記憶）→ Claude 出改動清單標分級 → 逐處核 diff → 線上驗證 → commit。
- 核心函式只回傳資料，物理同檔也先邏輯分層。
- 重繪一律帶範圍/狀態，禁無參數重繪（B-1 同款坑）。
- CSS 走 :root 變數、改前出 mockup 核准。
- commit-gate 三步分開；無 Node 標 `[unverified]`；`?v=` 只升動到的檔。
- 共用優先於複製（Gantt 沿用不重做）。

---

## 附錄：未決待實作階段細化

- K-4 階段過多（>6）的看板呈現：橫捲 vs 退清單分組 — K-4 動工前定。
- K-5 「最新階段」判定演算法 — K-5 動工前定。
- K-6 連接線座標/繞線 — K-6 動工前另出細部設計文件。
- 清單可排序、看板拖曳改狀態 — 後續精修，非首版。
