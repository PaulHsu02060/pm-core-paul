# PM-Core 系統架構設計文件（主文件）

> 本文件是 PM-Core 的**單一架構真實來源**。整合所有定案設計 + 已完成進度，只保留最新正確版本。
> 施工前必讀；定案內容不憑記憶改動；新需求若與本文件衝突，以討論更新本文件為先。
> 最後更新：2026-06-13（家裡桌機，基準 HEAD `aca041c`）

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

## 第四部分：排程引擎（已完成，105/105 PASS；2026-06-13 已接 UI 自動觸發）

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

### 4.6 逾期判定（待施工，§9 第 2 項）

改口徑為 `(deadline || plannedEnd) < today 且 status !== 'done'`（擱置 hold 排除）。現況散落 4 處（:2245/2562/2963/4552），要統一改、不可漏。

### 4.7 兩套排程引擎的分工（2026-06-12 定案，最高優先釐清）

> 此節是「為什麼有兩套排程、各管什麼、哪套要按鈕哪套自動」的單一真實來源。
> 反覆被誤解，每換 session 都要重講——以此節為準，不再口頭解釋。

系統有**兩套本質不同的排程引擎**，對應第二部分雙視圖模型。它們不是重複、不該合流，各管一種任務：

| 引擎 | 函式 | 管什麼 | 觸發方式 | 對應視圖 |
|---|---|---|---|---|
| **時段制週排程** | `generateSchedule`（generateNow / generateGlobalSchedule 呼叫） | 小時制工作項目（很多小細項、會議）：把它們排進這週合適的時段格子 | **手動按鈕**（總儀表板「智慧排程」）——時段排程本質需人工觸發，**這顆按鈕保留** | 視圖一（行事曆/時間軸） |
| **工期依賴排程** | `computeSchedule` / `applySchedule`（FS/SS/FF/SF、105 測試覆蓋） | WBS 工期任務：算前置鏈、自動傳播每項開始/結束日 | **不該有按鈕**——資料輸入完就該自動算（見 4.9） | 視圖二（專案進度/甘特/待辦） |

**核心原則：工期依賴排程是「資料輸入完即自動算」，不是手動觸發。**

「自動排程要人按按鈕」本身就是接線斷掉的症狀——按鈕代表引擎沒接、要人手動叫它一次。正確設計是存檔即驅動（已於 4.9 落地）。

- 甘特圖「⚡一鍵套用排程」按鈕（applyGanttSchedule）**已移除**（commit `aca041c`）——存檔自動觸發後它多餘，存在就是「引擎沒接」的證據。
- 總儀表板「智慧排程」按鈕**保留**——那是另一套時段制週排程，管小時制細項排時段，與工期依賴自動排是兩回事，不可一起砍。

### 4.8 正推 / 反推雙模式（2026-06-12 定案，反推待新增）

使用者只填預計開始與預計結束，提供選項切換排程基準（呼應第 N 部分範本系統 §N.3）：

- **正推（forward，依預計開始日順排）**：從開始日往後按工期+依賴推。**引擎已有**（computeSchedule）。
- **反推（backward，依結束日反推）**：從交期（deadline）往前倒推，算每項**最晚必須何時開始/完成**，否則跳票。**引擎尚無此演算法**，需新增一套 backward pass（關鍵路徑法的 backward pass）。**核心函式改動、判斷風險最高、需家裡桌機 Node 跑回歸測試。**

**理由：** 專案時間跨度不同——跨度大時，有人要從 deadline 倒推卡點（不然跳票），有人要從起點順排。

**路線決策（沿用 §N.6，不重複）：** 先做正推版，**反推 UI 留位子標「未開放」、灰掉不可選**，等引擎補反推算法再點亮。好處：最快有可用功能，且不假裝引擎有它沒有的能力。反推算法列為工期引擎自動觸發（4.9）穩定後的下一階段。

### 4.9 工期排程接 UI 自動觸發（2026-06-13 已落地，commit `cc7436a`）

落實 4.7「工期依賴排程＝存檔即自動算」，把引擎接上 UI：

- **A-1 存檔自動觸發**：`saveNewTask` / `saveTask` 存檔後（Storage.save 之前）自動跑 `applySchedule(DATA.tasks, 'full')`，前置鏈自動傳播算出 `scheduledStart/End`。
- **A-2 表單回顯**：`autoStartDisplay` 改讀 `t.scheduledStart`（有值顯示推算日、沒值顯示「待排程引擎推算」），取代舊版只讀 `t.start`。
- **錨點保護**：自動觸發排除 `anchor:manual` / `anchor:override`（用 `!String(s.reason||'').startsWith('anchor')` 過濾），手填日不被覆蓋；只有真 blocked（circular/unscheduled）才 toast 警告。
- **applySchedule 回傳結構**：`{ applied, skipped, total }`。skipped 裡 reason 四種值：`circular`、`unscheduled`、`anchor:manual`、`anchor:override`。

**風險記錄：** 存檔即觸發會讓「尊重手填不覆蓋」的判定每次存檔都跑（比手動按一次頻繁）。computeSchedule 須確實尊重手填錨點不覆蓋（§4.3），自動觸發放大任何判定漏洞。已驗 105 測試 §5/§7/§8 手填保護通過。

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

### 6.8 釘子視覺 toggle（2026-06-13 已完成，commit `6a89be4`）

任務列釘子改為視覺 toggle，取代舊版空殼（點了跳 toast「開發中」）：

- 引入 **Tabler icons webfont**（CDN，鎖版本 `3.44.0`：`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.44.0/dist/tabler-icons.min.css`）。系統原本無 icon 字體、全靠 emoji，emoji 無法 CSS 染色 toggle。免費 Tabler webfont 只有 outline 線性版（無 filled）。
- **未釘**：灰色直立釘子 `ti-pin`（吃 `.task-anchor` 的 `--ink4`）。
- **已釘**：sage 圓底 badge 包 `ti-pinned`（斜插釘）+「已釘」文字（`.anchor-badge`，圓底 `--sage-100` + 文字 `--sage-700`）。形狀（直立↔斜插）+ 顏色雙重區分，比純顏色明顯。
- `setAnchor`：擋 `t.locked`（比照 toggleTaskDone）→ toggle `t.pinned` → Storage.save → refreshAll。不跳成功 toast（icon 變色即回饋）。
- **未做（下一階段）**：釘子聯算——釘住觸發 override / 下游級聯重排，依 §4.3/§4.4 錨點機制，與排程錨點一起做。目前只做視覺 toggle + 持久化。

### 6.9 任務列中間插入（2026-06-13 已完成，commit `416f970`）

解決「任務只能加在最後、不能從中間插入」：

- **列交界 hover➕**：滑鼠移到兩列交界，該列下緣分隔線變 sage 變粗（`.row-insert::before` 2px `--sage-600` 圓角線壓在列下緣）+ 浮出圓形➕。點➕開新增表單，填完插在該列下面。
- **末尾不放**：`:last-child .row-insert` 隱藏，最後一列下面無➕（加到最後走既有「+新增任務」按鈕）。`.row-insert` 預設 `display:none`，只在 `#activeTaskList` 內開 → done 清單／其他用 buildTaskRowHtml 處不冒➕。
- **插入位置用 id 反查、非渲染序**：`visibleActive[i]` 是 preview-limit 切過的子集，渲染序 i ≠ DATA.tasks 真實 index。點➕設 `App._insertAfterId = 該列 t.id`，saveNewTask 用 `DATA.tasks.findIndex(x => x.id === _insertAfterId)` 反查真實位置 splice 插其後。closeModal 清 `_insertAfterId`（取消/X/Esc 都清，防殘留誤插）。
- ➕ 用 `pointer-events:none` 不擋列點擊（列本身仍可點開編輯），只按鈕可點。z-index 走 `--z-sticky`、`.task-row` 加 `position:relative` 不建立新堆疊脈絡。
- **本案是「位置插入」純位置層**，不綁前置依賴 id 化（§8b.5 層次二已 revert）。插入的新任務前置仍手動填、不自動串。「依賴不錯位」的根本解需 id 化重做（見 §9 待辦）。

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

## 第九部分：待施工清單（依風險與依賴排序）

每項獨立 commit，逐一核 diff → 線上驗證 → commit。

**★ 明天接手第一件（待勝堯定位再動）：總儀表板「新增小時 Task」表單分流**
- 現況：總儀表板新增表單標題寫死「新增小時 Task」（時段制），但類型仍可切「工期制（工作天）」——標題與選項自相矛盾。
- 待勝堯決定：① 只能建時段制（拿掉工期制選項，標題一致但失彈性）② 保留兩種但標題不寫死「小時」。
- 這牽涉雙視圖分流定義（總儀表板＝視圖一時段制地盤 vs 專案頁新增入口的分工），非純機械改，動前先理清入口定位。屬 C 群（雙視圖架構）前置決策。

**A 群：表單收尾（純 UI，低風險，可立即做）**
1. Tooltip 統一（類型/緊急/前置/HL 的 `?` hover）
2. 前置任務結構化下拉（§6.4，中等複雜）

**B 群：動引擎/匯入器（高風險，要細核時段）**
3. 移除 category 連動 → 行事曆配色改讀 taskType
4. 逾期口徑統一 → 4 處改讀 `deadline || plannedEnd`
5. 匯入器補 deadline 欄（parseWbsExcel + performWbsImport，測試檔副本同步）
6. 預計完成自動算（接 addWorkdays）
7. **反推引擎（§4.8）**：新增 backward pass（依 deadline 倒推最晚開始）。核心函式改動、判斷風險最高、需家裡桌機 Node 跑回歸。UI 先留位子標「未開放」灰掉，引擎補完再點亮。列為 §4.9 自動觸發穩定後做。

**C 群：雙視圖架構（大工程，多 session，先定分流再動）**
8. 新增「排入行事曆」欄位 + 分流邏輯
9. 視圖一（時間軸/時段制）呈現
10. 視圖二（進度/待辦/逾期清單）呈現
11. 部門負荷計算改用統一 H（工期×dailyHours 攤平到區間）
12. 緊急任務清單移植（專案頁=該專案、總儀表板=全部，可點看細節）—— 依賴視圖二定案

**D 群：架構整理（低優先，feature 穩定後）**
13. **前置依賴 id 化完整版**：今晚 merge 後 revert（feat/pred-id-migration 半套導致 J 系列前置全失效，commit `96bc2fd` 止血）。完整版要連資料來源（syncJSeries / WBS 匯入）也產 id，非半套。是解開「中間插入依賴不錯位、前置下拉、A-1 自動排程完整顯示」的鑰匙。屬大重構，獨立 session 做。
14. 釘子聯算（§6.8）：釘住觸發 override / 下游級聯重排，依 §4.3/§4.4 錨點機制，與排程錨點一起做。
15. 全檔 emoji 統一換 Tabler icon（§6.8 已引入字體，階段二配 UI/設定頁重規劃）。
16. app.js 拆檔（~7000 行，no-build 約束，ES modules 或 ordered script）
17. 設定頁 v2（移除 J 系列遺留、側欄預設收合）
18. 部門 D-2c/D-2d、D-3

**雲端（已完成）：** doGet 公開唯讀已上線（2026-06-12）——訪客開網頁即見最新 J 系列資料。新部署繞過舊部署不生效問題；doGet 拔 token 鎖（純讀），doPost token 檢查保留（寫入維持鎖）。前端 config.js 換新 exec URL。教訓：Apps Script 編輯部署若不生效，直接建新部署最快（代價 URL 變、前端要跟著換）。



## 第十部分：工作鐵則

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

## 第十一部分：環境與資源

- **Runtime**：no-build、browser-native JS；`file://` 本地開發；Google Sign-In（擋 file:// 與 localhost，互動驗證走線上 github.io）。
- **Repo**：`PaulHsu02060/pm-core-paul`（Public，Pages 已上線）。
- **部署**：push 後約 1-2 分自動部署。
- **本地測試資料**：`seed.local.js`（gitignored）。
- **機密**：`config.local.js`（gitignored）。

---

## 附錄：完成的 commit

**2026-06-13（家裡桌機）：**
- `6a89be4` 釘子改視覺 toggle badge + Tabler icon（§6.8）
- `416f970` 任務列中間插入 hover➕（§6.9）
- `cc7436a` 任務存檔自動觸發工期排程 + 表單顯示推算日（§4.9，A-1/A-2）
- `aca041c` 移除甘特一鍵套用排程按鈕（§4.7）
- （另：feat/pred-id-migration merge `d56d800` 後 revert `96bc2fd` 止血——id 化半套導致 J 系列前置全失效，完整版列 §9-D 第13項）
- 基準 HEAD：`aca041c`，引擎 105/105 PASS
- **待線上驗證（明天無痕視窗）：** ① A-1 新建有前置任務存檔→開始日自動算 ② A-2 表單顯示推算日 ③ 甘特圖無「⚡一鍵套用排程」 ④ 中間插入 hover➕ 對齊/能插/末尾不放 ⑤ 釘子圓底「已釘」badge

**2026-06-06（家裡桌機）：**
- `8f0544a` 移除分類/處理方式欄（UI 拿掉，category 資料層保留）
- `f70a2c0` 欄位改名排序加必填驗證
- `e40931c` HL 風險勾選 + 交付物 + 實際執行反向摺疊
- `5eaa1f9` docs：M2 任務表單設計文件

