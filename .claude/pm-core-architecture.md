# PM-Core 系統架構設計文件（主文件）

> 本文件是 PM-Core 的**單一架構真實來源**。整合所有定案設計 + 已完成進度，只保留最新正確版本。
> 施工前必讀；定案內容不憑記憶改動；新需求若與本文件衝突，以討論更新本文件為先。
> 最後更新：2026-06-06（家裡桌機，基準 HEAD `5eaa1f9`）

---

## 第零部分：專案最高原則

**整體系統的「邏輯乾淨、正確、單一真實來源、不重複」是最高原則。**

由來：前兩版舊系統（各自有 bug、無法合併）打掉重做，才有這第三版 PM-Core。所以「乾淨/不重複/可合併」不是潔癖，是專案誕生的理由。重蹈「兩份各自演化、各自有 bug、合不起來」的覆轍 ＝ 專案失敗。

衍生原則：
- **抽共用 vs 複製兩份 → 一律選共用**（重構打底）。
- **不重構，除非底層假設錯** —— 防的是對穩定 code 亂改結構；但當新需求即將長出重複時，先合併再加＝正解，不違反此鐵則。
- **計算層純資料**：core 函式只回傳資料，不碰 DOM、不碰 Storage；呈現分流不影響計算。
- **每個計算結果都帶推理依據**：warning、reason、startSource、anchorSource 都顯式。
- **真實使用情境優先**：假設只有 PM 一人維護資料，圍繞實際用法設計。

---

## 第一部分：四層架構

```
Core（純排程/計算邏輯，無 DOM、無 Storage）
  ↓
UI（渲染層，消費 core 算好的資料）
  ↓
DB（Storage / 雲端同步）
  ↓
Auth（檢視/編輯/登入）
```

分層紀律「從第一天就遵守」，即使 code 物理上還在單一檔案：core 函式回傳資料，呼叫端決定渲染或儲存。`computeSchedule` 直接呼叫 `renderGantt` + `Storage.save` 是要避免的反模式。物理拆檔之後是機械搬移，不是重新架構。

---

## 第二部分：核心架構決策 —— 雙視圖模型（2026-06-06 定案）

### 2.1 問題根源

系統裝著兩種本質不同的任務，硬用同一套欄位描述會打架：

- **時段制任務**：日常瑣事 + 會議。天生是「某天某時段做、花幾小時」，要塞日曆格子、可拆分。
- **工期制任務**：WBS 專案項目。天生是「佔幾個工作天、有前置依賴」，是甘特區間。

用工時描述 WBS → 算不出甘特依賴；用工期描述瑣事 → 拆時段無意義。**一個欄位扛不起兩種語意。**

### 2.2 解法：雙視圖

| 視圖 | 回答的問題 | 內容 | 計量 | 呈現 |
|---|---|---|---|---|
| **視圖一：行事曆/時間軸** | 我今天/這週要做哪些、怎麼排時間 | 會議 + 勾「排入行事曆」的任務 | 工時（H）+ 時段，可拆分 | 時間軸/日曆格子 |
| **視圖二：專案進度/待辦** | 所有專案項目進度、什麼快逾期 | 其餘所有任務 | 工期（工作天）+ 區間 | 甘特 + 逾期/待辦清單 |

兩視圖切換或並列；各用自己合理的計量，不互相打架。

### 2.3 分流規則

| 任務 | 分流 | 判斷依據 |
|---|---|---|
| 會議 | 視圖一 | 來自 meetings store，自動 |
| 勾了「排入行事曆」 | 視圖一 | 新增欄位，手動勾 |
| 其餘所有任務 | 視圖二 | 預設 |

**核心洞見：分流的分界不是「屬不屬於專案」**（因為瑣事也常來自專案的細項），**而是「我要不要親自排時間動手做」。**
- 同樣掛 J 系列：「我要追進度的」留視圖二；「我要動手做的細項」勾「排入行事曆」進視圖一。
- 新增欄位：**「排入行事曆」**（布林勾選，手動建任務時決定）。

### 2.4 分流只管呈現，不管計算

**部門負荷、KPI、報表是獨立計算層，吃全部任務，不受分流影響。** 一筆任務無論顯示在哪個視圖，都是「你做的事」，都要進計算。

---

## 第三部分：部門負荷計算（2026-06-06 定案）

**統一單位：H（小時）**，所有任務換算成 H 後相加到該擔當：

| 任務類型 | 負荷（H） |
|---|---|
| 時段制（排入行事曆） | 直接用工時 H |
| 工期制（WBS） | `durationDays × dailyHours`（每日工時，`DATA.settings.dailyHours`，預設 6） |
| 會議 | 會議時長 H |

換算邏輯已存在系統（匯入器的 `estHours = durationDays × dailyHours`），直接沿用。

**重點：**
- 不論有沒有勾「排入行事曆」，**全部算進負荷**。
- **工期 H 要按區間攤平到每個工作日**，不可整包壓在開始那天（15 天 = 90H，是攤在 15 天裡，不是今天壓 90H）。

---

## 第四部分：排程引擎（已完成，56/56 PASS）

### 4.1 計量定義

- **工期（durationDays）**：任務本身佔幾個工作天。引擎核心輸入，`end = addWorkdays(start, durationDays - 1)`。決定後續任務何時能接。獨立欄位，不可與前置 lag 共用。
- **前置 lag（+N）**：前項完成後「等」幾個工作天才開始本項（等材料、等簽核）。是任務「之間」的間隔，不是任何任務的長度。UI 預設隱藏，可點開填。
- 兩者本質不同：例「A 完成後等 3 天，B 自己做 5 天」→ lag=3、工期=5，各管一段。

### 4.2 前置依賴關係（FS/SS/FF/SF）

- FS（完成才能開始）：前項完成後本項才開始（最常用）。唯一需要 +1（SOD/EOD 模型）。
- SS（同時開始）/ FF（同時完成）/ SF（開始才能完成，少用）：+0。
- `parsePredecessors` 支援純編號與 FS/SS/FF/SF+lag 格式。

### 4.3 排程方案（丙 + 逃生口）

- **computeSchedule**：純計算，尊重手填日期（不覆蓋），只在空白時從前置推算開始日，無 start 無前置標「待排」，輸出建議串。
- **applySchedule(tasks, scope)**：scope = `'manual'|'one-level'|'full'`，甲/乙/丙 全是參數。
  - 甲：手動逐筆，逃生口
  - 乙：套一層（日常維運）
  - 丙：整鏈套用（初次匯入 92 筆最實用），預設推薦
- 寫回 `plannedStart/plannedEnd`，**絕不碰 `task.start`**（碰了會誤鎖成手填錨點，下游不跟動）。
- 只套 `blocked===false && suggestedStart!=null`，blocked/循環/手填錨點自動跳過留警示。

### 4.4 α 方案錨點分流

- J 任務讀 `override._localStart`，手動任務讀 `t.start`（修正「92 任務全錨定」bug）。
- 錨點跳過 scheduled 寫入（scheduled 是純機器層）。

### 4.5 getEffectiveSchedule 優先序

`override > actual > scheduled > planned`，並帶 `startSource`。
**用 `||` 不用 `??`**（override 可存空字串，nullish coalescing 會誤判）。

### 4.6 逾期判定（待施工，§10 第 2 項）

改口徑為 `(deadline || plannedEnd) < today 且 status !== 'done'`（擱置 hold 排除）。現況散落 4 處（:2245/2562/2963/4552），要統一改、不可漏。

---

## 第五部分：狀態衍生規則

四值：`pending`（未開始）/ `wip`（進行中）/ `done`（已完成）/ `hold`（擱置中）。

自動推導（實際日期優先於狀態欄）：
- 有實際完成日（actualEnd）→ 強制「已完成」
- 有實際開始（actualStart，無完成）→ 強制「進行中」
- 皆無 → 看狀態欄
- 逾期非狀態，即時推導（見 4.6）

UI：狀態欄反灰唯讀，`?` hover 說明規則。

---

## 第六部分：任務表單（M2，三塊已完成 + 待施工項）

### 6.1 共用架構

- 由 `App.buildTaskFormHtml(task, mode)`（app.js:3217）產生，new/edit 共用同一份。單一真實來源，禁止複製兩份。
- 儲存函式維持兩個（`saveNewTask`/`saveTask`），不合併；跨模式可能讀到不存在欄位處加 null 防呆。
- locked 版（synced 唯讀）不套此設計。
- 驗證訊息 house style：`U.toast('⚠️請填XXX', 'warning')` + 直接 `return`。

### 6.2 欄位與排序

| 順序 | 欄位 | 必填 | 元件 | 狀態 |
|---|---|---|---|---|
| 1 | 專案 | ✅ | select | ✅ 完成（改名、移到最上） |
| 2 | 任務名稱 | ✅ | text | ✅ |
| 3 | 說明 | — | textarea | ✅ |
| 4a | 擔當 | ✅ | text | ✅ |
| 4b | 類型 | ✅ | select（帶 ? 說明） | ✅ 欄位完成 / ❌ Tooltip 未做 |
| 5a | 階段 | ✅ | text+datalist | ✅（改名 PLM階段→階段） |
| 5b | 子群組 | — | text+datalist | ✅ |
| 6a | 緊急程度 | — | select（自動算可覆蓋，帶 ?） | ✅ 欄位 / ❌ Tooltip 未做 |
| 6b | 狀態 | — | select（反灰唯讀，帶 ?） | ❌ 反灰+Tooltip 未做 |
| 7 | 前置任務 | — | 結構化下拉（見 6.4） | ❌ 未做（還是舊自由文字） |
| 8a | 預計開始 | ✅ | date | ✅ |
| 8b | 工期 | — | number | ✅ 欄位 / ❌ 自動算未做 |
| 8c | 預計完成 | — | date（自動算） | ❌ 自動算未做 |
| 9 | Deadline | — | date | ❌ 新欄位未做 |
| 10 | 需拉高層 HL | — | checkbox+textarea | ✅ 完成 |
| 11 | 實際執行區 | — | 反向摺疊 | ✅ 完成（含交付物） |
| 新增 | 排入行事曆 | — | checkbox | ❌ 未做（雙視圖分流用） |

**已移除：** 分類（category，UI 拿掉、資料層保留、行事曆配色仍讀 category）、處理方式（method）。

**必填（6）：** 專案、任務名稱、擔當、類型、階段、預計開始。已完成。

**欄位大小：** 統一 38px（前置列內 36px）。

### 6.3 類型說明（Tooltip，未做）

- 任務：有工期、要排程的實際工作項目
- 里程碑：時間點標記（工期 0），如審查、交付節點
- 群組：純分類母項，不參與排程
- 里程碑/群組的 category 給空。
- **所有 Tooltip 統一用 `?` 圖示 hover 顯示（title 屬性）。**

### 6.4 前置任務結構化（未做）

取代舊自由文字 `1FF,2FS+2`（沒人會填）。
- 結構化「一列一條」：搜尋任務（模糊）+ 關係下拉（白話）+ lag（預設隱藏，點「+延遲」展開）
- 關係白話：完成才能開始(FS) / 同時開始(SS) / 同時完成(FF) / 開始才能完成(SF)
- `?` + 範例：`16FS`=等#16完成才開始 / `16FS+2`=完成後再隔2工作天 / `16SS`=同天開始 / `16FF`=同天完成 / `16SF`=#16開始後才能完成
- 候選清單限制：只列有 wbs 編號的任務（手動建無編號暫不能當前置）。
- 改結構化後不需 parsePredecessors 格式檢查。

### 6.5 預計完成自動算（未做）

- `預計完成 = addWorkdays(預計開始, 工期 - 1)`，跳國定假日+公司行事曆。
- 預計開始+工期填完自動帶出，可手動覆蓋。

### 6.6 Deadline（未做）

- 新增欄位，手填截止日。
- fallback：`deadline || plannedEnd`（沒填取預計完成）。
- 可從 Excel 匯入（模板要多一欄、匯入器要補讀）。

### 6.7 HL + 實際執行（已完成）

- HL：單一布林 `riskHL` 勾選 → 展開 `riskIssue` 文字欄。
- 實際執行：CSS 反向摺疊（new 收起、edit 展開，DOM 永遠在避免裸讀炸），內含實際開始/完成 + 交付物（`deliverable` 文字 + `deliverableLink` 連結）。原生檔案上傳未做（無檔案後端，未來接雲端 storage）。

---

## 第七部分：WBS 匯入器（現況，已查證）

`parseWbsExcel`(:6378) + `performWbsImport`(:6444) 已將 Excel 幾乎所有欄位寫入 task：

| Excel欄 | task 屬性 |
|---|---|
| A 序號 | wbs |
| B 階段 | stage |
| C 子群組 | subgroup |
| D 任務名 | name |
| E 類型 | taskType（+category lossy 過渡） |
| F 前置 | predecessor |
| G 工期 | durationDays |
| H 負責人 | owner + dept |
| I 預計開始 | plannedStart |
| J 預計完成 | plannedEnd |
| K/L 實際開始/完成 | actualStart/End |
| M 進度 | progress |
| N 狀態 | status |
| O/P 必交付/交付物 | mustDeliver/deliverable |
| Q 風險議題 | riskIssue |
| R 備註 | note |
| U/V 已交付/連結 | delivered/deliverableLink |
| 待補 | deadline（§6.6） |

**兩個 caveat：**
1. 匯入器刻意把 `start`/`end` 留空字串（只寫 planned），防 `getEffectiveSchedule` 誤判手填錨點。
2. **重新匯入整碗覆蓋**：先清空該專案任務再重建。匯入後本地編輯下次重匯被 Excel 覆蓋。工作流：來源是 Excel 的改 Excel 重匯；PM-Core 表單編輯適合手動新建任務。

H 欄解析 quirks：多人分隔符（`、` `/` `＋`/`+`）全要拆；髒值（`—`、`「負責人」`表頭）→ 未指派；未知名 → 未指派；H 欄可能直接是部門名 → 反查表要含部門名為 key。

---

## 第八部分：部門視圖（D 系列）

- **D-1 已完成**（`83cd433`）：parseWbsExcel 讀部門表 → 反查 map → task.dept（存名稱）；render 依 dept > subgroup > owner 分組。
- **D-2 結構定案**：`project.depts = [{id, name, members:[{id,name}]}]`，task.dept 存 dept **id**（非名稱，dept 改名不破壞關聯），`U.id()` 自動產 id。
  - D-2a：匯入存 project.depts（id 結構）。順序：存 depts → 建 members → 建 dept-id 反查 → translate task.dept 存 id。
  - D-2b：ownerToDept 由 project.depts 重建；render 加 fallback（dept id 找不到→未指派）；id→name 顯示。
  - D-2c：專案頁部門指派 UI（per-project，+/- dept、+/- member、改名 dept id 不變、刪 dept 提示 N 任務變未指派）。
  - D-2d：刪 dept 批次重派 modal（逐列下拉重派、重派後該列消失計數遞減、計數=0 才能刪、不離開情境）。
- **D-3（未來）**：task.dept → depts 陣列 + owners 陣列，一筆任務展開成多部門各自算負荷（解 D-1 單擔當灌爆 PM 負荷問題）。
- 部門 render fallback 標準：`hasVal ? ... : '未指派'`。

---

## 第九部分：導航架構（Sidebar 兩大區 + 分段視圖）（2026-06-07 定案）

> B 項（Sidebar 三區重構）的定案設計。動工前此節必須先 commit。
> 導航形態經議題討論定為「丙」：雙視圖不是全域 tab，而是各區內部各自切換視圖。

### 9.1 Sidebar 結構（兩大區 + 其他，共三段）

```
Sidebar
├─ 總儀表板區（彙總全專案）
│   ├─ 彙總 Dashboard   ← 視圖一（行事曆/時間軸）
│   ├─ 甘特圖           ← 全專案範圍
│   └─ 月曆視圖         ← 全專案範圍
├─ 專案區（兩層，不做樹狀展開）
│   ├─ J 系列壁掛分離式…  ← 點了進專案頁
│   ├─ 測試-排程驗證
│   ├─ 物料標準共用化
│   └─ ＋ 新增專案
└─ 其他（最下）
    ├─ 報告（專案週報 + PDCA）
    └─ 設定
```

### 9.2 視圖切換 = 分段鈕（非全域 tab）

- 切換用「分段按鈕」（參考第一版 WBS 的 `看板 / Gantt / 清單` 樣式），置於主畫面右上。
- 各區/各專案**內部**切換自己的視圖（導航形態「丙」），不是全域並列 tab。
- 總儀表板區分段鈕：`Dashboard ｜ Gantt ｜ 月曆`（全專案範圍）。
- 專案頁分段鈕：`Dashboard ｜ Gantt ｜ 月曆`（單專案範圍）。

### 9.3 雙視圖對應（接續第二部分雙視圖模型）

| 視圖 | 落地位置 | 內容 |
|---|---|---|
| 視圖一（時間軸） | 總儀表板區的「彙總 Dashboard」 | 個人週排程、智慧排程按鈕、會議設定、Task 可點編輯、Task 可拖動到時段 |
| 視圖二（進度/待辦） | 專案區的「專案 Dashboard」 | 階段進度 / 部門負荷 / 逾期清單（即現況 J 系列那頁） |

- **拖動規則**：在彙總 Dashboard 上拖動過的 Task，智慧排程不再覆蓋其時間（手動位置優先，呼應第四部分「手填日期不覆蓋」）。
- **計算層獨立**：部門負荷 / KPI 吃全部任務，不受視圖分流影響（沿用 §2.4）。

### 9.4 Gantt / 月曆共用元件原則

- 總儀表板的 Gantt/月曆 與 專案頁的 Gantt/月曆 **是同一套渲染元件**，差別只在傳入的 task 範圍（全專案 vs `task.project === pid`）。
- 禁止複製兩份（最高原則：抽共用、不重複）。動工前需撈現有 Gantt/月曆 render 函式，確認能否以「傳入 task 子集」方式重用，或需先解耦。
- 月曆的「預計/實際完成率」細項：順位低，後補（先前已討論，目前順位低）。

### 9.5 留白原則

- 未接好/未實作的視圖：分段鈕頁簽要在（讓缺口可見），頁面可留白（議題 4 定案）。

### 9.6 明確排除（不在 B 範圍，另案處理）

1. **專案模板分類（全新開發案 vs 設變案）**：獨立大功能，另開專案設計+執行。需設計
   `project.type` 資料結構、兩種 Dashboard 版面（全新=完整階段模板；設變=簡易模板）、
   建專案時選類型的流程。**不綁進 B**（避免導航重構膨脹成模板系統）。
2. **Sidebar 樹狀展開（專案 > 階段 > Task）**：不做。階段/Task 細節在專案頁內看
   （專案 Dashboard 的階段進度卡、Gantt 的展開列），不在 sidebar 展開。
   理由：與專案頁內視圖切換功能重疊＝重複，違反最高原則。

### 9.7 實作分段（待規劃，動工前此文件需先 commit）

> 實際拆法需先撈以下 code 才能定，列為下一步：
> - 現有 `showPage` 路由（app.js:1828 起）如何改成「區 + 視圖」二維。
> - 現有 6 導航項（總儀表板/甘特圖/月曆視圖/專案週報/PDCA報告/設定）如何搬進新結構。
> - Gantt（renderGantt 相關）/ 月曆（renderMonth 相關）元件如何改吃「傳入範圍」。
> - 分段鈕元件設計（新建共用元件，總儀表板與專案頁共用）。
> 每段獨立 commit，逐一核 diff → 線上驗證 → commit。

---

## 第十部分：待施工清單（依優先序排列，2026-06-08 重排）

每項獨立 commit，逐一核 diff → 線上驗證 → commit。

**已完成（導航架構落地，原 §10 第 7 項）**
- ✅ B-1 雙視圖頁內切換（修法二，`aa7a0d8`）：總儀表板頁頂分段鈕（儀表板｜甘特｜月曆），三視圖同頁互切。
- ✅ B-4 sidebar 三段重組 + 報告頁分段鈕（`724d6bd`）：sidebar 改三段（總儀表板/專案/其他）；報告頁頂分段鈕（專案週報｜PDCA）。
- ✅ B-2 專案頁接分段鈕（`9247b37`，待家裡桌機驗）：專案頁頂分段鈕（儀表板｜甘特圖｜月曆，單專案範圍）；renderGantt 加 singleProject 參數隱藏單專案篩選 chips；月曆頁簽留白待 B-3。

**第一優先：B 系列收尾（地基，低風險）**
1. B-3 `renderMonth` 月曆解耦：單專案範圍的 task/meeting 篩選。B-2 月曆視圖需要。

**第二優先：核心大功能（要先出設計文件）**
2. 專案 Task By Stage 三視圖（看板/Gantt/清單，參考舊版 WBS）：依 stage 分組，三種呈現切換（看板拖卡 / Gantt 時間軸 / 清單表格）。依賴 B-2 分段鈕框架落地。動工前須先產獨立設計文件（三視圖呈現規格、By Stage 分組邏輯、與現有 renderGantt 共用方式）。

**第三優先：UI 微調（純 CSS，動工前出 mockup）**
3. 總儀表板分段鈕放大 + 配色：現 `.tab-btn` 太小不顯眼，放大並配色讓可點性明確。
4. 週報專案資訊欄對齊：每個專案的資訊欄未對齊，調版面。

**第四優先：整理（低優先）**
5. 設定頁 v2 重規劃：選項雜亂，盤點分類；側欄預設收合。

**Gantt 相關另案（B-2 衍生，依優先序）**
1. B-1 遺留：renderGantt 無參數重繪丟 targetId/singleProject — toggleGanttProject/切週/拖曳呼叫 renderGantt() 不帶參數，重繪跑回 page-gantt，內嵌甘特畫面不更新。會壞功能，最優先。
2. 專案頁 Gantt 任務依賴連接線（FS/SS/FF/SF 箭頭線）— 大功能，需獨立規劃。
3. 總儀表板 Gantt 篩選 chips 改下拉選單 — 小 UI 美化，碰 CSS 需先出 mockup，順位最後（除非順手可快速解決）。

**雙視圖原架構遺留項（§2 雙視圖模型相關，待雙視圖完整推進時處理）**
- 新增「排入行事曆」欄位 + 分流邏輯
- 視圖一（時間軸/時段制）呈現、視圖二（進度/待辦/逾期清單）呈現
- 部門負荷計算改用統一 H（工期×dailyHours 攤平到區間）
- 緊急任務清單移植（依賴視圖二定案）

**表單/匯入器遺留項（原 A/B 群）**
- Tooltip 統一、前置任務結構化下拉（§6.4）
- 移除 category 連動 → 行事曆配色改讀 taskType
- 逾期口徑統一（4 處改讀 `deadline || plannedEnd`）
- 匯入器補 deadline 欄、預計完成自動算

**架構整理遺留項（原 D 群）**
- app.js 拆檔（~7000 行）、部門 D-2c/D-2d/D-3

---

## 第十一部分：工作鐵則

**Git commit-gate（最高優先）**
- 嚴禁 `git add` 與 `commit` 串成一條（禁 `&&`/`;`）。
- commit 前單獨 `git status`，完整輸出給使用者，確認只有預期檔、無 local 機密檔（config.local.js/seed.local.js/seed.sample.js/_probe*.js）後，才 add → commit → push。
- 三步分開逐一核可。
- commit 訊息避 `>` `/`（PowerShell parser error），用兩段 `-m`。
- 未線上驗證標 `[unverified]`。

**跨機鐵則**
- 公司桌機（C:\Users\1141103004\，無 Node.js，CSS/UI）與家裡桌機（C:\Users\user\，有 Node.js）輪流。
- session 開始先 `git pull` + `git log` 確認與遠端同步，不一致先 pull。
- 換機/下班前未完成也要 commit + push（可標 WIP）。

**CSS 鐵則**
- 顏色/圓角/z-index/陰影一律走 :root 變數，禁規則裡寫死 hex/數字。
- 合理例外：rgba 透明衍生、膠囊 99px、圓點 50%。

**改檔紀律**
- 含中文檔用 Edit 工具，禁 PowerShell 文字回寫（UTF-8 變亂碼）。
- `?v=` 版本號只升動到的檔對應行，不全升。

**測試**
- Node.js（家裡桌機）跑 `node docs/test-schedule-cases.js`（56 案）+ `node --check app.js`。
- 測試檔含核心函式副本（parsePredecessors/isTaskBlocked/computeSchedule/topoSortTasks/isJTask/getJOverride/applySchedule/getEffectiveSchedule），改動兩邊同步。

**Claude Code**
- 確認對話框一律按 `1`（never allow-all）。
- 標準流程：邏輯寫完先 commit + 部署 + github.io 線上測，骨架能動再做 CSS。
- agent 兩壞習慣防範：①跑完自己往前衝（要它停、貼原文）②該貼原文只給摘要（明講貼 N 行原文）。
- 一次一件：寫一處 → 貼 diff 核 → 放行 → 下一處。

---

## 第十二部分：環境與資源

- **Runtime**：no-build、browser-native JS；`file://` 本地開發；Google Sign-In（擋 file:// 與 localhost，互動驗證走線上 github.io）。
- **Repo**：`PaulHsu02060/pm-core-paul`（Public，Pages 已上線）。
- **部署**：push 後約 1-2 分自動部署。
- **本地測試資料**：`seed.local.js`（gitignored）。
- **機密**：`config.local.js`（gitignored）。

---

## 附錄：今日（2026-06-06）完成的 commit

- `8f0544a` 移除分類/處理方式欄（UI 拿掉，category 資料層保留）
- `f70a2c0` 欄位改名排序加必填驗證
- `e40931c` HL 風險勾選 + 交付物 + 實際執行反向摺疊
- `5eaa1f9` docs：M2 任務表單設計文件
- 基準 HEAD：`5eaa1f9`，引擎 56/56 PASS
