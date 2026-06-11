# PM-Core 系統架構設計文件（主文件）

> 本文件是 PM-Core 的**單一架構真實來源**。整合所有定案設計 + 已完成進度，只保留最新正確版本。
> 施工前必讀；定案內容不憑記憶改動；新需求若與本文件衝突，以討論更新本文件為先。
> 最後更新：2026-06-11（基準 HEAD `dcfddd3`）

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

## 第零部分之二：協作鐵則（最高優先，每次開 session 必先遵守）

> 這些是使用者（勝堯）與 Claude 協作的硬規則，違反即停。寫在文件最前是因為它們約束「怎麼工作」，比任何技術內容都優先。

1. **唯一架構規格書 = 本文件（`pm-core-architecture.md`）。** 「架構規格書」一律指這本。所有資料、資訊、待辦、架構議題、決策脈絡，全部整理進這本，**禁止自創新文件**（不另寫工作日誌、交接包、獨立 MD）。需要記錄就更新本文件。

2. **「去找過往資料」= 過往一定討論過，先撈再答。** 使用者說「找過往紀錄/之前討論過」時，代表確實存在，**第一動作是用 conversation_search / recent_chats 撈出來**，不准憑記憶瞎猜、不准重新推導已定案的東西。鬼打牆重問已決定的事 = 浪費使用者時間，嚴禁。

3. **需要決議的事，一律白話文解釋。** 給使用者做決定時，必須：①白話講清楚每個選項是什麼、差在哪 ②各自優缺點 ③Claude 的建議是哪個、為什麼。**禁止丟一堆簡短程式術語/行號/英文函式名要使用者裸選。** 使用者要的是「聽得懂的選擇」，不是「看 code 猜意思」。

4. **新對話開始先讀本文件。** 每次開新 session，第一件事是讀 `pm-core-architecture.md`（專案檔案區），掌握做完什麼、沒做什麼、決策脈絡，**不要重工、不要重問已記錄的事**。

5. **每天從待辦清單（§9）撈工作 + 優先順序。** §9 待施工清單是每日工作來源。開工先看 §9，依風險/依賴排序挑下一件；做完的劃掉、新長出的補進去。§9 永遠是「現在該做什麼」的單一真實來源。

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

**核心洞見：分流的分界不是「屬不屬於專案」**（因為瑣事也常來自專案的細項），**而是「我要不要親自排時間動手做」。** 但前提是該任務本身是**時段制**（小時級、可塞日曆格）；**工期制（WBS）任務一律留視圖二，即使勾選「排入行事曆」也不進時程表**——因為它的工時是 `durationDays × dailyHours` 換算值，塞不進小時格（會被排程引擎判定排不下而略過）。判斷依據：`t.wbs` 非空＝工期制（同時涵蓋 Google 同步 `synced:true` 與 Excel 本機匯入 `synced:false` 兩條路徑），閘門 `generateSchedule` 候選 filter `.filter(t => !t.wbs)`。
- 同樣掛 J 系列：「我要追進度的」留視圖二；「我要動手做的**時段制**細項」（手動建、小時級）勾「排入行事曆」進視圖一。**工期制 WBS 項目本身**不論勾不勾，都留視圖二。
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

## 第四部分：排程引擎（核心 56/56 PASS；接線完整但未觸發）

### 4.0 接線真相（2026-06-09 查證，修正舊認知）

**舊文件曾標「引擎從沒接 UI、高優先根本問題」——此描述已作廢。** 查證證實鏈路完整：`predecessor（§6.4 結構化已完成）→ computeSchedule(app.js:1034) → applySchedule(1135) 寫 scheduled → getEffectiveSchedule(1436) 顯示`。顯示層（待辦表 buildTaskRowHtml:3074 / 甘特 / 月曆 / KPI / 報表）全部走 getEffectiveSchedule。甘特表頭有「⚡一鍵套用排程」按鈕(:4443) 已綁定 applyGanttSchedule(:4458)；甘特 bar 渲染時跑 computeSchedule 純算做唯讀預覽。

**但「感覺日期要手填、比 Excel 差」的真相 = scheduled 從沒被寫入過：**
- scheduledStart/End 預設全空 `''`（4 條建任務路徑：同步 1557、新任務 3349、saveNewTask 3678、其他 6892）。
- 唯一寫入點 = applySchedule(1155)，**只由甘特那顆「⚡一鍵套用」觸發**。
- 沒按過按鈕 → scheduled 全空 → getEffectiveSchedule 優先序跳過空 scheduled，**fallback 到 plannedStart（手填日）**。
- **結論：不是接線斷，是引擎結果從沒落地。** 按一次按鈕，連動任務 scheduled 就被寫入，顯示立刻切到引擎算的日期。
- 待改進（§9）：把觸發點從「甘特手動按」改為「存任務自動重算」（saveTask/saveNewTask 加 applySchedule，judgment-risk，動存檔流程）。

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

---

### 4.7 時段制排程引擎（正向，2026-06-11 設計定案）

現況：generateSchedule()（app.js:1218）是半成品——slot 模型/findRun 連續格/避會議/goldenTime preferGolden 已鋪好，工時設定（dailyHours/workStart-End/goldenTime/workDays）真的有讀。但三個缺口（程式碼自標 TODO 1b）：MAX_CHUNKS_PER_TASK=1 鎖死同日單塊、只排本週、不算完成日。本規格補完正向排程。逆向（deadline 反推）獨立待辦。

**決定性鐵則（最高，驗收硬指標）**：相同輸入（任務無增減、無手動調整）→ N 次排程 N 次結果完全相同。任何隨機性/順序不穩定都是 bug。要求：①任務處理順序穩定（sortTasks urgency → plannedStart → id 多鍵排序，平手不飄）②slot 選擇決定性（多可用區間永遠選最早/最早golden）③無 Math.random、無 Date.now 滲進排序、無物件遍歷順序依賴。56 測試須新增「同組任務跑兩次，assert items 完全相同」案例。

**重排策略**：選「全清重排」（每次全清 DATA.schedule.items 重算），非增量。但手動拖動過的任務鎖定，重排時當已佔用不動（呼應「手填日期不覆蓋」鐵則）。「避開已排定」= 同一次重排內先排佔位、後排避開，非跨次保留。

**輸入**：任務 estHours + plannedStart；設定 dailyHours/workStart-End兩段/goldenTime/workDays；已佔用=會議時段+手動鎖定任務。

**正向邏輯**：
1. 起算日 = max(plannedStart, 前置完成日+1, today)。plannedStart 空值或落在過去 → 從 today 起（納入前置依賴）。
2. 從起算日逐日掃可用 slot（60分格，避會議/已佔/手動鎖定）。
3. 跨日分配：當日空檔不足 estHours，當日塞滿可塞的，剩餘順延到下一個有空檔工作日，直到排完（取代 MAX_CHUNKS_PER_TASK=1）。
4. 多週順延：不限本週，往後找。上限 horizon=8 週，超過標「排不下，需8週」警示並停（取代只排本週）。
5. golden time 優先：深度任務優先黃金時段（沿用 preferGolden）。golden 滿則排同日非黃金，不為golden拖到隔天。
6. 切分閾值（啟用既有 splitThreshold）：超過閾值才允許跨日拆；小於閾值要求同日完成（不打散小任務）。小任務找不到同日 N 連格 → 套 horizon 上限警示。

**輸出**：每 slot = date+start+duration（沿用 DATA.schedule.items）；新增 slotScheduledEnd（完成日=最後一個 slot 日期）寫回任務。獨立欄位，不與工期制 scheduledEnd 共用（避免兩引擎碰同欄位）。

**estHours 粒度**：維持 60分格，向上取整（3.5h→4h），跨日拆以小時格為單位。

**不在此規格（獨立待辦）**：逆向排程（deadline + estHours → 反推最晚開始日）；slack/餘裕計算（依賴逆向+deadline 資料源）。

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

## 第八部分之二：序號身分/位置分離 + 中間插入（2026-06-09 定案，核心改造）

> 本節是「序排序亂」「中間插入會打亂依賴」兩問題的根本解。
> 已確認分兩層次：層次一（顯示層流水號）可低風險先做；層次二（前置 id 化）是核心改造，動引擎，須回家排程、跑 56 cases。
> 設計核心沿用 2026-06-05 已定案的「身分/位置分離」。

### 8b.1 問題根源：序號身兼兩職

Excel 的序號（N 欄）同時被當兩件事用，綁死導致插入會亂：
1. **身分（identity）**：前置依賴靠它指認。`2FS+2` 的「2」指的是序號 2 的任務。
2. **位置（ordering）**：決定任務排在清單第幾列。

**插入即出事**：在 38、39 間插一筆，若新的編 39，原 39→40、40→41…**所有「前置寫 39/40」的任務全部指向錯對象**，依賴鏈錯位。這是 Excel 做專案的經典痛點，也是「不斷變動才叫專案、能中間插入才是 PM 工具」這個核心需求受阻的原因。

### 8b.2 定案正解：身分 / 位置 / 顯示 三者拆開

1. **身分 = 系統自動發的永久 id**（`U.id()`，使用者看不到）。前置依賴改成**引用 id**，不引用序號。不論顯示序號怎麼變，「A 依賴 B」永遠正確。
2. **位置 = 可變的排序值**（order/sortKey 或 array 順序）。插入只動位置，不動任何 id、不動任何前置引用。
3. **顯示序號（1,2,3…）= 從位置即時算出的純顯示**，不存、不被引用。插入後重算一遍，永遠連續、不跳號。

**WBS 原值（wbs 欄）維持與 Excel 一致**：資料層保留 `A` / `C-1.1` / `26` 原值（識別、追溯用），只是**不再拿它當顯示序號、不再拿它當排序鍵**。符合「單一真實來源」——Excel 是來源，但前端排序/顯示用的是位置與流水號，互不衝突。

### 8b.3 現況查證（2026-06-09，為層次一鋪路）

- **task 層無 order/sortIndex 欄位**，但 `DATA.tasks` 的 **array 順序本身 = Excel 列順序**（parseWbsExcel 由上到下讀並保序、performWbsImport 依 rows append、getTasksOf 用 filter 保序）。→ array index 即天然 order，**層次一不需新增欄位**。
- 現況 sort 比較器(2668-2670) 用 `wbsKey`；`wbsKey`(2660-2667) 只認 4 種格式（空/純數字/純字母/字母+數字），**漏接 `C-1` `C-1.1` 等「字母+橫線+分式」**，落入 catch-all `[0,0]` → 整群無序擠前 → 「序看起來亂」的真因。
- 序欄顯示(buildTaskRowHtml:3111) **直接印 `t.wbs`**（印 WBS 原值，不是流水號）。

**array 順序的脆弱點（將來若升級層次二用顯式欄位的理由）**：Storage.save/load、CloudSync 上下傳、saveTask/toggleTaskDone 皆保序；saveNewTask push 到尾端（剛好對應「手動任務排最後」現行語意，OK）。⚠️ 但日後若有「整理/去重/合併」重建 DATA.tasks 的操作，array 順序可能被打亂——屆時改用顯式 order 欄位才絕對穩。

### 8b.4 層次一：顯示層流水號（低風險，可先做）

**目標**：序欄變連續 1,2,3…（不跳號）、排序照 Excel 匯入順序。**解決「序看起來亂」，但還不能安全插入。**

- sort 比較器：移除 `wbsKey`，改用 array 原順序（`allTasks` 原序或 `indexOf`）。
- 序欄顯示(3111)：不印 `t.wbs`，改印渲染迴圈位置 `index+1`。
- wbs 原值不動（前置引用、識別照用）。
- 流水號**全連續不分段**（匯入 + 手動一條龍編下去；2026-06-09 定案：「以後整體都用現在 UI 管理，是否 Excel 匯入不重要」）。
- **零資料結構改動**，純顯示層，Claude Code 已驗證可行。

### 8b.5 層次二：前置 id 化 + 任意插入（核心改造，回家做）

**目標**：真正支援「像 Excel 一樣中間插入、依賴不亂」。**這是這系統存在的意義，當正式核心改造規劃。**

涉及範圍（動 [CORE]，須跑 56 cases）：
1. **前置依賴從「存序號」改為「存 id」**：匯入器兩段式——先建全部 task 各發 id + 建「序號→id」對照表，第二輪把每筆 predecessor 的序號翻成 id。
2. **引擎跟著改**：`parsePredecessors` / `isTaskBlocked` / `computeSchedule` / `topoSortTasks` 從「比對 wbs 序號」改為「比對 id」。
3. **位置欄位**：引入顯式 order/sortKey（不再只靠 array 順序），插入時取「前後兩筆 order 的中間值」或重算。
4. **插入 UI**：在任意兩列間插入新任務 → 拿新 id + 中間 order → 顯示流水號重算 → 既有前置因指 id 不受影響。
5. **測試**：56 regression cases 全綠；新增「插入後依賴不錯位」案。

**風險**：動核心引擎，公司桌機無 node 無法驗，必須家裡桌機做。分步驟、逐一核 diff、每步跑測試。

### 8b.6 兩層次依賴關係

- 層次一可獨立先上（馬上解決視覺亂序），不阻擋層次二。
- 層次二上線後，層次一的「array 順序排序」自然被「顯式 order 排序」取代（屆時順手收斂）。
- 層次二完成 = 前置全部 id 化，§6.4「前置候選只列有 wbs 編號任務」的限制可放寬（手動任務也能當前置，因為靠 id 不靠 wbs）。

---

## 第八部分之三：方案 B（拔 Auth + 唯讀分享）+ 分享兩條路（2026-06-09）

> 「方案 B」= 拔 Google 登入、開機預設唯讀看雲端、設定頁密碼解鎖編輯。
> 前端三塊今日完成；後端 doGet 公開化（唯讀分享最後一步）待使用者親自操作。

### 8c.0 三憑證釐清（2026-06-11，防混淆鐵則）

動 0b/0c 前必讀，三者互不相干，勿混為一談：

| 憑證 | 真值位置 | 管什麼 | 碰雲端 |
|---|---|---|---|
| `editPasswordHash`（`935817361`） | config.js 公開 | 前台解鎖編輯，只移除 viewonly class | 否，純前台 DOM |
| `SYNC_TOKEN` | config.local.js 家裡真值（gitignored） | 雲端寫入 doPost 驗證 | 是，寫入命根 |
| 雲端 blob 殘留 | Google Sheet | 舊 upload 寫進的 token 殘影，0b 要蓋掉的對象 | — |

- `editPasswordHash` 公開可接受（君子鎖，F12 可繞、但寫不進雲端），**勿當機密**。
- `SYNC_TOKEN` 是唯一寫入鑰，公司機假值（`CHANGE_THIS_TOKEN`）寫不進雲端（doPost 擋），故 **0b 只能家裡做**。
- `SYNC_TOKEN` 備援：真值記密碼管理器，任何新機填回 config.local.js 即恢復。家裡桌機非系統一部分，掛了不影響（資料在雲端、code 在 GitHub）。

### 8c.1 方案 B 前端（已完成）

| commit | 內容 |
|---|---|
| `06fad34` | 停用 Google auth：`checkLoginState`(1721) 開頭 early return 呼叫既有 `enterViewOnly()`。Google 整套程式碼（initGoogleSignIn/handleGoogleCredential/GSI script）保留未刪——刪 early return 即接回（好還原，未來做白名單用） |
| `d6b0d7b` | 設定頁密碼解鎖：`App.unlockEdit()`(6595) 讀 #unlock-pw → `U.hash(輸入).toString() === editPasswordHash` → 對則 remove viewonly + userMode 改 EDITOR |

- 密碼 hash 存 config.js（`editPasswordHash`，值 = `U.hash('<密碼>')`）。
- `U.hash`(709) 是 Java String.hashCode 類弱雜湊（非 SHA-256、無鹽、可暴力）——**僅前端軟鎖防君子，擋不住 F12**。
- **安全模型**：前端密碼是 UI 軟鎖；**後端 doPost 的 SYNC_TOKEN 才是真防線**（token 在 config.local.js、不進 git）。前端鎖被破，對方只能改自己瀏覽器的本機副本，**寫不回雲端**（doPost token 擋）。

### 8c.2 致命漏洞修復（0a 已做，0b/0c 待家裡驗）

⚠️ **CloudSync.upload 原本把整包 DATA.settings（含 cloudSyncToken 明文）上傳雲端 blob。一旦 doGet 改公開，訪客 download 就能讀到 token → 寫入防線破功。**

- **0a（commit `155d2c7` [WIP]）已修**：upload 剝掉 cloudSyncToken + PII（_loggedInEmail/_loggedInPicture），上傳 safeSettings；token 仍走 payload.token 供 doPost 寫入驗證。
- **0b（家裡待做）**：在有 config.local.js 真 token 的家裡桌機做一次乾淨 upload，蓋掉雲端舊的含 token blob。
- **0c（生死關，家裡待做）**：親自 download + F12 驗證雲端 JSON 內 cloudSyncToken/_loggedInEmail/_loggedInPicture 都不存在、整個回應搜 token 0 筆命中。
- **★ 0c PASS 前，絕對不可做 doGet 公開化**，否則雲端舊 blob 仍洩 token。

### 8c.2.1 0b/0c 回家操作步驟（生死關，逐步）

1. 家裡開 app（config.local.js 載真 token/URL）→ 設定頁按「⬇ 從雲端下載最新」或 init 自動 download。
2. F12 → console 印 `DATA.settings`，實搜有沒有 `cloudSyncToken` / `_loggedInEmail` / `_loggedInPicture`。
3. 判讀：
   - 雲端 blob 的 `data.settings` **仍含 token** → 是 0a 之前的舊髒 blob（舊 app.js 沒剝）→ 證實「舊 blob 髒」，正是 0b 要蓋的。
   - **0b**：用 0a 後的 app.js 重跑一次乾淨 upload（payload.token 帶真 token 過 doPost，但 data.settings 已剝乾淨）→ 蓋掉髒 blob。
   - **0c**：再 download 驗一次（=0c），`data.settings` 搜不到 token → PASS。
4. ⚠ **0c PASS 前，後端 doGet 絕不可改公開**（步驟1，見 §8c E 群）。

> 推論（code 層面可確認，非實證）：0a（`155d2c7`）已把剝欄位的 code 上線，故 0a 之後任何一次 upload 寫出的 blob 必乾淨。風險只在「雲端現存那份是不是 0a 之後寫的」——若 0a 後從沒 upload 過，雲端可能仍是舊髒 blob。這無法靠 code 推斷，只能 download 實看，故 0c 不可省。

### 8c.3 分享兩條路（2026-06-09 釐清，互不衝突）

**路 A：Fork（同事獨立一套）—— 今日已可行，零 code，差 SOP 文件**

同事要「自己一套獨立 PM-Core 管自己的專案」。成立條件全到位：
1. 程式碼 → 同事直接開公開 GitHub Pages URL（不用 fork repo、不用部署）。
2. 進編輯 → 密碼解鎖（8c.1）。
3. 自己的雲端 → `cloudSyncUrl`/`cloudSyncToken` 是設定頁可填的 per-機器設定（非寫死 config.js），填自己的即與你隔離。

SOP（待寫）：你在同事 Google 帳號開新 Apps Script、貼 `apps-script-cloud-sync.gs`、設他的 CHECK_TOKEN、綁他的試算表、部署拿 URL（約 10 分）；同事開你 URL → 密碼解鎖 → 設定頁填他的 URL+token（約 3 分）。**不需要 doGet 公開化**（同事讀自己的雲端）。

**路 B：唯讀分享（訪客看你的資料）—— 差最後一步 doGet 公開化**

訪客開你的 URL 看你同步上去的進度（唯讀）。
- **驗證結論**：女友乾淨瀏覽器測試證明——現狀訪客**看不到** J 系列（本機 localStorage 匯入、訪客讀不到、雲端 doGet 驗 token 擋住）。「丟 URL 就能看」目前**不成立**，必須做 doGet 公開化。
- **doGet 公開化（使用者親自操作，Claude/Claude Code 不代做）**：去 `script.google.com` 改 doGet 拿掉 token 檢查改公開讀 + 用「編輯現有部署」重新部署（URL 不變；repo 的 .gs 只是備份，改了不生效）。**doPost（寫）token 鎖絕對不能動**——命根。
- **順序鐵則**：先 0b/0c PASS（雲端無 token）→ 確認雲端已 upload 最新資料 → 才開 doGet。

### 8c.4 開機自動 download 行為（查證）

開機若 `cloudSyncEnabled && cloudSyncUrl` 都有 → `CloudSync.download(true)` **整包覆蓋**本機 localStorage（非合併）。cloudSyncUrl 預設 `''`、cloudSyncToken 預設 `CFG('SYNC_TOKEN','CHANGE_THIS_TOKEN')`，真值放 config.local.js。

---

## 第九部分：待施工清單（依風險與依賴排序）

每項獨立 commit，逐一核 diff → 線上驗證 → commit。

**A 群：表單收尾（純 UI，低風險，可立即做）**
1. Tooltip 統一（類型/緊急/前置/HL 的 `?` hover）
2. 前置任務結構化下拉（§6.4，中等複雜）

**A2 群：序排序層次一（純顯示層，低風險，已查證可行，下次優先）**
3. 序欄改連續流水號（§8b.4）：sort 移除 wbsKey 改 array 順序、序欄印 index+1、wbs 原值不動、全連續不分段。

**B 群：動引擎/匯入器（高風險，要細核時段、跑 56 cases）**
4. 移除 category 連動 → 行事曆配色改讀 taskType
5. 逾期口徑統一 → 4 處改讀 `deadline || plannedEnd`
6. 匯入器補 deadline 欄（parseWbsExcel + performWbsImport，測試檔副本同步）
7. 預計完成自動算（接 addWorkdays）
8. 餘裕計算（§9b）—— 前置決策：先定 deadline 資料來源，否則餘裕恆 0
9. 存任務自動重算（§4.0）：saveNewTask/saveTask 的 Storage.save() 前加 applySchedule，取代甘特手動按。judgment-risk

**C 群：序排序層次二 —— 前置 id 化 + 任意插入（核心改造，多 session，回家做）**
10. §8b.5：前置序號→id、引擎改比對 id、引入 order 欄位、插入 UI、56 cases + 插入案。中間插入不亂的根本解。
   互動定案（2026-06-11）：甲—列間 hover 浮現「+ 在此插入」細線，點擊在該位置插一列、流水號自動重排。UI 與前置 id 化綁死，須一起做。

**D 群：雙視圖架構（大工程，多 session，先定分流再動）**
11. ✅ **已完成（2026-06-10~11，b73e58a/6a5386b/106edfc）** 新增「排入行事曆」欄位 + 分流邏輯。**定案（2026-06-10）**：欄位 `scheduleToCalendar`（布林預設 false）；最簡分流（只顯示手動勾選、舊資料不排入、Excel 延後）；`getCalendarTasks(tasks)` 純函式回傳勾選子集，時程表接線屬第 8 項。施工規格見 `docs/第7項-排入行事曆-施工規格.md`，回家裡桌機做（需 56 測試）。
12. 視圖一（時間軸/時段制）呈現
13. 視圖二（進度/待辦/逾期清單）呈現
14. 部門負荷計算改用統一 H（工期×dailyHours 攤平到區間）
15. 緊急任務清單移植 —— 依賴視圖二

**E 群：view-only 公開分享（核心需求 2026-06-11 查證定案，§8c）**

需求：PM 分享前台 URL 給 RD/同事，對方開 URL 即看到唯讀最新進度，**零設定**。現況做不到——新設備 localStorage 無 `cloudSyncUrl`（預設 `''`，無 CFG 兜底），init 的 download 閘門（app.js:1728 `cloudSyncEnabled && cloudSyncUrl`）不成立，看到的是本地種子空白。

施工步驟（**嚴格依賴順序，0c 是不可跨越的安全閘**）。本群在 §9 待施工清單佔第 16~18 項，內部以 0b/0c/步驟1/2a/2b 標識：

- **0b（待回家，真 token）**：家裡用含真 token 的 `config.local.js` 跑一次乾淨 upload，覆蓋雲端舊版 blob（舊 blob 可能殘留 token）。公司桌機是假 token + 空 URL，做不了。
- **0c（待回家，生死關）**：download 回來 + F12 實搜雲端 JSON 的 `data.settings`，確認**搜不到 token** 才算過。
  - ⚠ **鐵則：0c PASS 前，後端 doGet 絕不可改公開**，否則公開讀把殘留 token 一起洩出，寫入防線破功。
- **步驟1（後端，0c PASS 後才做）**：`script.google.com` 編輯器改 doGet 拿掉 token 檢查（`ENABLE_TOKEN` 對 doGet 關閉），**doPost 的 token 檢查不動**（寫入永遠要 token）。用「編輯現有部署→新版本」重部署，URL 不變。注意 repo 的 `.gs` 是備份，真正生效的是編輯器那份。
- **步驟2a（前端）**：`cloudSyncUrl` 預設改讀 `CFG('CLOUD_SYNC_URL', '')`，把公開讀 URL baked 進 `config.js`，新設備零設定就有 URL → init 的 download 閘門成立。
- **步驟2b（前端）**：✅ **已完成**（`enterViewOnly` app.js:1795，預設 view-only 保持唯讀）。

**安全模型**：讀公開、寫仍鎖 token。真 token 只在不部署的 `config.local.js`（gitignored），線上 github.io 永遠寫不進雲端（assemble blob 時沒真 token，doPost 擋掉）。

**排程**：0b → 0c（驗）→ PASS 才 步驟1 → 2a。全部屬 `[unverified]` / 動後端，**須回家做、需另開 session 專門執行**（碰安全 + Apps Script 後端）。

（另：路 A Fork 分享 SOP 文件——零 code、同事讀自己的雲端、不需 doGet 公開化——見 §8c.3，獨立於本 view-only 路 B。）

**F 群：架構整理（低優先，feature 穩定後）**
19. app.js 拆檔（~7000 行，no-build 約束）
20. ✅ **部分完成** 設定頁已拆 4 panel tab（排程/資料/編輯權限/關於，34366b1/b26b4a9）；編輯密碼區已隱藏（接停用 doLogin 失效，dcfddd3）。剩餘：editpw-sec CSS 死規則待清（style.css:266）；個人資訊/Google 登入/資料管理經評估決定全留不砍（原 v2 砍 3 塊計畫取消）。
21. 部門 D-2c/D-2d、D-3
22. 四視圖看板（綜觀/看板/甘特/月曆 + renderKanban）
23. 刪 A/B 群組母項（先查前置引用/getProjectStages 依賴）
24. 待辦表餘裕/截止欄微調（純 CSS 一行）
25.（待設計）待辦表頭凍結 `.task-row-header` sticky —— 已查證 2026-06-10，非單條 CSS。
   - 捲動容器 = 視窗（主內容鏈 .app/.main/.content/#page-project 皆無局部 overflow 捲動層；sidebar 是另一條獨立 sticky 內捲，無關）。
   - 受阻① `.task-list-card` 直接父層 `overflow:hidden`（style.css:608，用於裁圓角）會成為 sticky 的捲動容器 → header 失效。移除它，今天做好的 `.tlc-head` 底色 + 斑馬紋列背景會在卡片圓角處露方角。
   - 受阻② topbar 已 `position:sticky; top:0`（style.css:218）；header 的 `top` 須扣 topbar 高度才不被蓋住，但目前無對應變數。
   - 需設計：圓角替代做法（子元素各自 border-radius／改包法，取代卡層 overflow:hidden）＋ 新增 `--topbar-h` 變數定 top 偏移 ＋ 決定是否連 `.tlc-head` 一起釘。
   - 等完整時段專門處理，不在零碎顯示層批次內做。
26.（待設計）拖動 locked 持久化 —— N.3「拖動不覆蓋」未落地（拆自第8項，2026-06-10）。
   - 現況：`generateSchedule()` 每次「全清重排」（app.js:1375 註解「不保留 locked 殘留」），新 items 一律 `locked:false`；拖動設的 `item.locked=true`（`handleScheduleDrop`, app.js:2456）只活在當前 `DATA.schedule` 快照，撐不過下一次重排。
   - 缺口：架構 N.3「拖動過的 Task 智慧排程不覆蓋」目前 code 並未真正落地。
   - 需設計：locked 狀態持久化（存哪、key 用 taskId 還是 date+start、重排時讀回並讓對應 slot 固定不被 `findRun` 佔走）。
   - 高風險：動 `generateSchedule` 全清重排邏輯（引擎核心、56 cases 範圍）。與第8項「選誰上排」是兩件事，獨立 commit、一次一件。

**G 群：Task 模板系統 + 引擎接線（大工程，需另開 session 完整設計，依賴最深）**
27. Task 新模板（時/天計）設定頁欄位規劃 —— 區分「時段制(工時 H)」與「工期制(工作天)」兩種計量的表單欄位，呼應第二部分雙視圖模型。
   ✅ 2026-06-11 部分完成：
   - main：時段制白名單顯隱（切時段制藏子群組/前置/工期/deadline/可切分/備註/排入行事曆）
   - feat（待回家 node 驗）：measureType 接線（saveNewTask 寫入、saveTask edit 鎖定保留）+ 總儀表板「+新增小時 Task」按鈕（buildTaskFormHtml 加 measure 參數、active 改吃參數、tf-project 加空 option、openHoursTaskDialog 鎖時段制）
   - 計量按鈕方向 B 顯眼化已 main 上線
28. Task 中間插案邏輯接上 —— 任意位置插入任務、後續自動順延。依賴 §8b.5 前置序號 id 化（第10項），無 id 化無法穩定插案。
29. WBS 完整模板一鍵套用（核心痛點 UX）—— 內建「設計→量產」全流程基礎模板；新使用者建專案只需設「初始預計開始日」+ 批量編輯各欄位，套用後自動產出全部 Task，並自動帶出全部預計開始/完成日期，免逐筆手填。
   ⚠ 前置鐵則：第29項「自動帶日期」＝排程引擎接線。computeSchedule / applySchedule（56 測試過）早已建好，但 applySchedule 只由甘特手動鈕觸發，scheduledStart/End 從未自動寫入 —— 這是「比 Excel 還差」的根源。第29項成立的前提是引擎接到 UI（applySchedule 在建/改任務時自動跑、寫回 scheduledStart/End），須先做。
   依賴鏈：27（欄位）→ 28（插案，需 §8b.5 id 化）→ 29（模板 + 引擎接線）。三項屬同一功能群，須整體設計，不可散做。
   ⚠ 註：27→28→29 屬**工期制** computeSchedule/applySchedule 接線；**時段制** generateSchedule 的三缺口（MAX_CHUNKS 跨日順延 / 只排本週→horizon 8 週 / 補 slotScheduledEnd + 決定性測試）是另一條，正向排程規格已定（§4.7，commit e74abda），回家做、與第 30 項釘子一起。
30. 釘子（task-anchor/setAnchor）整包重做（回家，feat，跟 §4.7 一起）：現況空殼（點了只跳 toast「錨點功能開發中」，洗版且記不住釘哪個）。改為：拿掉 toast；視覺 toggle（未釘空心淡灰、已釘實心主色）；持久化釘選狀態（存 task，非純 UI state，否則重整即忘）；錨定聯算（寫 override → 觸發下游重排）。與排程錨點 §4.3/§4.4 同件，須一起做、不可拆。

---

## 第九部分之二：餘裕計算規格（§9-8 細節）

- 公式：餘裕 = `deadline - plannedEnd`。正=餘 N 天（綠）/ 0=黃 / 負=超 N 天（紅）/ 完成或無 deadline=「—」。
- **卡點**：`task.deadline` 不存在；待辦表「截止日」(3079-3088) 讀 `getEffectiveSchedule(t).end`（有效結束日），非獨立 deadline。拿它當 deadline → 餘裕恆 0。
- **必須先定 deadline 獨立來源**（與 §6.6 同一件事）才能算。

---

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

**跨機分工開發流程（2026-06-11 修訂，依改動性質分流）**

分流的判準是「改完能不能當場驗證」，不是「在哪台機器」：

- **UI / 純前端**（畫面、欄位顯隱、按鈕、CSS、DOM 位置）→ 改完用瀏覽器即可驗（眼睛就是驗證工具）→ **直接進 main、commit/push，不開分支**。無論在哪台機器都這樣。
- **後端邏輯 / 核心 / 資料層**（存欄位、saveTask 讀寫、排程引擎、計算）→ 改完畫面看不出對錯、需 Node 跑測試 → **開 feature 分支，commit 進分支、不 merge**。回家 Node 跑測試過了才 merge，不過在分支改到過才 merge。

關鍵認知：
- 分支的用途是「先寫、晚點驗」。在分支寫核心、commit、回家驗，是標準 RD flow，撰寫不必等驗證。
- 系統目前未對外開放，分支 code 有 bug 也進不了 main、影響不到線上（github.io 跑 main 綠版本）。
- 公司機無 Node「不能驗證」≠「不能寫」。後端照寫進分支，驗證時間點往後挪即可。
- 一個任務同時含 UI + 後端時：UI 部分進 main、後端部分進分支，各走各的。

Claude 與 Claude Code 一律遵守此分流，不得以「公司無 Node」為由阻擋後端撰寫。

**CSS 鐵則**
- 顏色/圓角/z-index/陰影一律走 :root 變數，禁規則裡寫死 hex/數字。
- 合理例外：rgba 透明衍生、膠囊 99px、圓點 50%。
- hex 收斂結案（2026-06）：style.css 規則內零裸 hex（全進 :root），:root 外僅 rgba 帶 alpha 例外。app.js 寫死色**不收**——PROJ_COLORS/fallback 屬 JS 資料層值（非 CSS 呈現規則）、`_pdcaReportCss` 為獨立列印文件（拿不到 :root，無法 var()）；index.html 零 hex。

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

## 附錄：今日（2026-06-09）完成的 commit

- `155d2c7` [WIP] CloudSync.upload 剝 token + PII（auth 漏洞 0a）
- `3494b6b` 待辦表 wbs 排序（後被 §8b 層次一取代方向）
- `06fad34` 方案 B 停用 Google auth、開機唯讀
- `d6b0d7b` 方案 B 設定頁密碼解鎖
- `4ba6234` 專案頁回復滿版（刪 #page-project max-width）
- `d781c14` 待辦表 grid 改全 fr 比例、右側欄對齊修正（含刪廢棄 max-width 殘留）
- 基準 HEAD：`d781c14`，引擎核心 56/56 PASS

**今日重大認知修正**：
1. 排程引擎「早就接好 UI」（§4.0），舊文件「引擎從沒接 UI」作廢；真因是 scheduled 從沒被觸發寫入。
2. 序排序亂的根本解 = 身分/位置分離（§8b），分層次一（顯示流水號，低風險）與層次二（前置 id 化，核心改造）。中間插入是系統存在意義。
3. 分享有兩條獨立路（§8c）：Fork（已可行差 SOP）vs 唯讀分享（差 doGet 公開化，前置 0b/0c 驗 token）。
4. 餘裕卡在 deadline 無資料來源，需先拍板。

**今日教訓**：①版型「本來能用」別重構（早上 1080 置中繞一大圈）②不憑記憶先查證（差點重做已完成的引擎接線）③提公式前先確認資料源存在（餘裕的 deadline）④工作區未 commit 改動會累積成亂帳。

---

## 附錄之二：今日（2026-06-10）session 紀錄

接續 2026-06-09，基準起點 HEAD = `d781c14`。

**完成：配色工程全批收尾**（今日 push，HEAD 收於 `b227302`）
- `1dbdfd8` 甘特錨點狀態色收進變數
- `e3b2e59` :root 新增配色變數（sidebar/KPI/表頭）
- `1532715` sidebar 深色主題（含 3 處繼承字修正）
- `b128b3d` KPI 六卡分色（六張語意淺色底，`--kpi-*-l` 六變數）
- `729a5ab` 待辦表頭橫槓 `.task-row-header` 底色 `--head-band` + 字級 12→13px
- `1e1568b` `.tlc-head` 底色 surface2→`--head-band` + 移除狀態流向註記文字 + 按鈕 margin auto 維持靠右
- `b227302` 斑馬紋 `.task-row:nth-child(even)` 套 `--cream`（anchor=hover 整行、插前面；synced/hover/done-list 蓋過斑馬，synced 列保留 sage 識別色）
- → **配色工程全部結案**。
- （另：今日 origin/main 尚有非配色批的看板視圖/篩選列/專案頁重構/序欄流水號 commit，非本紀錄範圍。）

**完成：CSS hex 收斂全面盤點 → 結案**
- style.css：規則內零裸 hex（全進 :root）；:root 外僅 rgba-alpha 合理例外。
- app.js：寫死色兩類**都不收**——PROJ_COLORS/fallback 是 JS 資料層值（非 CSS 呈現規則）、`_pdcaReportCss` 是獨立列印文件（拿不到 :root，技術上無法 var()）。
- index.html：零 hex。
- 記憶裡「CSS hex 第二批待收」這條過時，無對應、無需動作（詳 §10 CSS 鐵則）。

**環境確認 + 未動工**
- 公司桌機（1141103004）確認無 Node（bash/PowerShell 皆 `command not found`）。
- 第7項（§9 C 群第 7 項 排入行事曆欄位 + 分流）屬資料層、需跑 56 測試，**延回家裡桌機做**。
- 第7項施工規格（`docs/第7項-排入行事曆-施工規格.md`）已寫、未開工，今日一併入版控（跨機要用）。

**第7項定案**（細節見施工規格，§9-11 同步參照）
- 欄位名 `scheduleToCalendar`（布林，預設 `false`）。
- 分流走最簡版：只顯示手動勾選的、舊資料預設不排入、Excel 匯入延後。
- `getCalendarTasks(tasks)` 純函式回傳勾選子集；時程表接線是第 8 項。

---

## 附錄之三：2026-06-10~11 完成的 commit

接續配色工程批（`b227302`）之後，第8項時程表 + 設定頁 tab 重構系列：

- `b73e58a` scheduleToCalendar 欄位 + getCalendarTasks 分流
- `6a5386b` 時程表強制上排（第8項 B/聯集）
- `106edfc` 甲修正 `!t.wbs` 總閘門（工期制不進視圖一）
- `16fbf18` 雲端同步區 view-only 隱藏
- `973c565` 解鎖編輯加「記住我 5 天」
- `34366b1` 設定頁 tab 段1（CSS panel + showSettingsTab）
- `b26b4a9` 設定頁 tab 段2（拆 4 panel）
- `cb79a5c` 編輯權限 tab 文案 + icon
- `dcfddd3` 隱藏失效「變更編輯密碼」區（接停用 doLogin）
- 基準 HEAD：`dcfddd3`，引擎核心 56/56 PASS

## 附錄之四：2026-06-11（公司桌機，無 Node）完成

- **main**（純前端，已 push，線上可驗，標 [unverified] 待回家 node --check）：`161ac26` 計量按鈕方向 B 顯眼化、`df2a9b5` 待辦標題字級 11px→14px
- **feat/template-engine**（已 push origin/feat，回家 node 驗過才 merge）：`3565a38` merge main、`5c997d7` measureType 接線、`ee963ed` 總儀表板小時 Task 按鈕 + 計量參數化
- 兩分支皆乾淨同步遠端。feat 尚未含 `df2a9b5`（字級），下次 feat 動 UI 或回家做引擎前先 merge main 進 feat。
