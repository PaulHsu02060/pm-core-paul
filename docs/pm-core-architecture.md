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

### 4.10 時段制排程引擎（正向，2026-06-11 設計定案，已上線）

現況：generateSchedule()（app.js:1218）是半成品——slot 模型/findRun 連續格/避會議/goldenTime preferGolden 已鋪好，工時設定（dailyHours/workStart-End/goldenTime/workDays）真的有讀。但三個缺口（程式碼自標 TODO 1b）：缺口①：findRun 要求同一天 N 格連續，找不到整段即 skip（不跨日順延）；且 findRun 未套起算日 max(plannedStart, 前置完成日+1, today)。§4.10 目標：換掉 findRun 放置演算法為逐日掃格、當日塞滿剩餘順延次日，並套起算日。死常數 MAX_CHUNKS_PER_TASK/HOURS_PER_CHUNK 未被讀取，重寫後清除。缺口②：只排本週。缺口③：不算完成日。本規格補完正向排程。逆向（deadline 反推）獨立待辦。

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

**B 施工拍板（2026-06-11 定案，缺口④跨日重寫，code 已完成：Step 0~4 進 feat，node 85 案綠）**：D/C/A 已完成並進 feat（決定性排序 / slotScheduledEnd+全清 / horizon 8 週），B 是最後一塊，照下列 8 點動工：

1. **起算日**：時段制任務**無前置**，起算日 = max(plannedStart 或 today, today)；規格「前置完成日+1」對時段制 N/A（前置是工期制依賴鏈專屬）。
2. **一任務多 item**（B 地基）：跨日後一任務的工時分散在多天/多時段，改為一任務 push **多個 item**，用既有 `chunk` 欄位標第幾段；渲染端 buildWeekScheduleHtml 逐格畫應自然分散，**同任務多段顯示渲染已驗**（本機 index.html 驗過：同日午休切兩段不黏、多段同名同色、卡高對應 duration）。
3. **當日塞滿**：當日**零散空格全塞**（利用率優先），不限只塞最長連續段。
4. **8 週排不下**：**整任務回滾**（已佔格釋放）、整個不排 + 警示（全有或全無，乾淨優先），不留半段。
5. **golden**：沿用現有 `isDeep`（category==='deep'||空）定義不改；每日先填當日 golden、同日 golden 滿才填當日非 golden、**不為 golden 拖到隔天**（Qextra 在逐日掃下自然收斂）。
6. **splitThreshold**：判準 `N >= splitThreshold` → 允許跨日拆；`N < splitThreshold` → 要求同日連續完成，同日找不到 N 連格就**整個不排 + horizon 警示、不降級成跨日**。邊界用 `>=`（N==threshold 可拆）。
7. **不碰範圍**：B **不處理 locked / 手動拖動鎖定**（拖動功能尚未實作，維持全清 locked:false，另一條待辦）；**done 分支不動**（已完成維持單格放 actualEnd）。
8. **測試（選 A 抽純函式）**：放置邏輯抽成純函式 `placeTask(slots, task, settings) → segments[]`，app.js 呼叫、測試檔抄此函式副本端到端驗（起算日 / 跨日順延 / 當日全塞 / splitThreshold 邊界 / golden 同日優先 / 回滾）；加決定性案「同 task 跑兩次 segments 完全相同」。

**順手修正（B 一起做）**：estHours 取整 `Math.round` → `Math.ceil`（向上取整，對齊上方 estHours 粒度）；清死常數 `MAX_CHUNKS_PER_TASK` / `HOURS_PER_CHUNK`（已無讀取）。

**B 已完成上線（2026-06-12 收工）**：Step 0~4 全進 main（FF merge `c87d17d..5afdaf0`、無 merge commit、已 push 上線 github.io）、HEAD `5afdaf0`。node 85 案綠（決定性鐵則 / 起算日 / 跨日順延 / 當日全塞 / splitThreshold `>=` 邊界 / golden 同日收斂不拖隔天 / 整任務回滾）；渲染本機 index.html 驗過（同日午休切兩段不黏、多段同名同色、卡高對應 duration）；快取 bust `app.js?v=20260612-1`（style.css 未動不升）。實作鏈：placeTask 抽純函式（行為不變）→ N `Math.round`→`Math.ceil` + 清死常數 → 起算日 `max(plannedStart, today)` filter（順帶修「排到本週已過日」）→ `fillAcrossDays` 跨日選格引擎（純讀、groupBy+顯式 sort、golden 先填、先收集後提交→回滾自然成立）→ placeTask 分流（`N>=splitThreshold` 跨日 / `N<` 同日 findRun 不降級）+ `toSegments` 同日相鄰併段標 chunk。測試副本 byte 對齊本體。

---

## 第四部分之二：工作日曆（兩層疊加）（2026-06-13 定案）

> 排程引擎 addWorkdays/工期推算的工作日定義來源。動工前此節先 commit。
> 由來：J 系列 Excel 日期由前置 WORKDAY 推算、排除「公司公休」，但 PM-Core 假日表
> 未對齊公司行事曆 → 原有 55/93 筆日期不一致（已解決）。對齊行事曆 + 引擎修正後 74 筆零不一致。工作日曆是讓引擎日期與 Excel 一致的地基。

### 之二.1 驗收標準（Excel 已給）
- 引擎算出 2.9~7.3kW 可販日(#54) = 2027-01-29
- 引擎算出 2.2kW 可販日(#120) = 2027-03-30
- 對齊行事曆 + 引擎修正後，引擎日期與 Excel 預計開始/結束一致、74 筆零不一致（已驗收）

### 之二.2 核心：兩層疊加
某天是否工作日 = 覆蓋層有定義用覆蓋層，否則看基底層。

| 層 | 內容 | 換工作時 | 維護 |
|---|---|---|---|
| 基底層（公版） | 全國固定假日 + 週末規則 | 不動（通用） | 固定上傳一次 |
| 覆蓋層（公司調休） | 公司特別補班/額外公休 | 整層換掉 | 隨公司換 |

換公司只換覆蓋層，基底與歷史排程邏輯不變。

### 之二.3 全域單一真實來源
DATA.calendars 全系統唯一一份，總 Dashboard 與所有 Project 共用同一份。不分專案各自一份
（違反最高原則）。任何視圖任何專案的 addWorkdays 一律讀同一份。換覆蓋層 → 全系統排程同步變。

### 之二.4 資料結構

```js
DATA.calendars = {
  base: {                         // 基底層
    name: '台灣公版 2025-2027',
    weekends: [0, 6],             // 0=日 6=六（可改，週六上班的公司）
    holidays: { '2026-01-01': '元旦', ... }   // 日期→節日名
  },
  override: {                     // 覆蓋層（可 null）
    name: '公司調休（範例）',
    extraHolidays: { '日期': '公司額外公休' },  // 基底沒有的公休
    workOverrides: { '日期': '補班' }           // 強制變工作日，蓋基底假日/週末
  }
}
```

### 之二.5 判定函式（純函式，不碰 DOM）

```
isWorkday(dateStr):
  1. override.workOverrides 有 → true（補班，最高優先）
  2. override.extraHolidays 有 → false（公司額外公休）
  3. base.holidays 有 → false（國定假日）
  4. 是 base.weekends → false
  5. 否則 → true
```

addWorkdays 改呼叫 isWorkday，引擎全鏈吃同一份日曆。屬核心函式改動，逐 diff + 105 測試 + 補日曆測試。

### 之二.6 設定頁 UI（「能修改」）
- 基底層：多格式匯入（Excel/PDF/截圖，可靠度遞減 Excel>PDF>截圖，三者都先預覽+可手動修正才寫入）、假日清單顯示（年份分組可搜尋）、單筆增刪。
- 覆蓋層：命名、加 extraHolidays/workOverrides、整層啟用/停用/刪除（換公司一鍵移除）。
- 週末規則：預設週六日休，可勾變體。
- UI 動工前先出 mockup 審核。

### 之二.7 施工分段（先文件後 code，每段獨立 commit）
1. 本節 commit（先行）。
2. 資料結構 + isWorkday 純函式（不接引擎，先建+測試）。
3. 匯入器：Excel 公司行事曆 → base（PDF/截圖後補）。
4. 引擎接 isWorkday（核心改動，逐 diff + 105 測試 + 補日曆測試）。
5. 設定頁 UI（先 mockup 審）。
6. ✅ 驗收（2026-06-14 完成）：重算 J 系列，#54=2027-01-29、#120=2027-03-30、74 筆零不一致（FF 全改 FS、序號連續、前置重映射）。

### 之二.8 先做哪步（建議）
先做 2+3（isWorkday + 匯入公司行事曆 28 個公休日），重算對照 Excel。實測 74 筆零不一致（已驗證，2026-06-14）→ 證實引擎修正 + 行事曆對齊後完全一致。UI（第 5 步）已完成。

### 之二.9 匯入功能第一版（貼上文字解析，2026-06-13 定案；2026-06-14 五步閉環完成）

第一版採「貼上 Excel 文字解析」，零外部庫（no-build 友善），不解析 .xlsx 檔本體（SheetJS 等留待第二版增強）。

**使用流程：** 設定頁「工作日曆」區 → 從 Excel 公司行事曆框選整段複製貼進 textarea → 「解析並匯入」→ 預覽抓到幾筆 → 確認寫入 base.holidays + 持久化 → 下方顯示已載入公休清單（年份分組、單筆增刪）。

**解析規則**（對齊公司行事曆欄位：日期/星期/類型/節日名稱/工作日(1/0)/備註，Tab 分隔）：
- 逐行切 Tab，取 日期(1)、類型(3)、節日名稱(4)、工作日(5)
- 類型==='公休日' → base.holidays[日期]=節日名
- 類型==='補班' 或（星期六/日 且 工作日===1）→ override.workOverrides[日期]=名（範例公司目前無補班，保留供其他公司）
- 類型==='週末'/'工作日' → 跳過（週末靠 base.weekends 規則）
- 表頭行（首欄非 YYYY-MM-DD）、空行、欄位不足 → 跳過並計數
- 解析後顯示「成功 N 筆公休、M 筆補班、跳過 K 行」供使用者覆核（不盲信自動解析）

**匯入模式：整批覆蓋** base.holidays（重貼一份=換掉舊的，符合換公司上傳覆蓋）。

**持久化：** 寫 DATA.calendars → Storage.save()（localStorage）。⚠️ DATA.calendars 必須一併進雲端 blob，否則 init 時 CloudSync.download 會用雲端（無 calendars）蓋掉本地（與錨定 override 同款覆蓋風險）。施工時確認 CloudSync.upload/download 帶上 calendars。

**施工分段（每段獨立 commit）：**
1. ✅ 解析純函式 parseCalendarPaste(text) → {holidays, workOverrides, skipped, error?}（彈性表頭版，commit 61117e6→3d61155）
2. ✅ 解析測試：§5 測試 16 案（標準/亂序/無類型欄/英文表頭/無表頭報錯/補班），42 案全綠
3. ✅ 設定頁 UI（排程 tab 貼上→解析→預覽→確認→年份分組清單，commit 8a7d2dd）
4. ✅ 持久化（DATA.calendars 進 localStorage + 雲端 blob，download 防坑，commit b10c457）
5. ✅ 驗收（2026-06-14）：貼公司行事曆→公休進系統→重匯修正版 Excel→重算→74 筆零不一致、#54=2027-01-29、#120=2027-03-30（FF 全改 FS、序號連續、前置重映射）

**✅ 五步閉環完成（2026-06-14）。解析升級為彈性表頭（吃任何公司行事曆，不限欄序、需含表頭）。**

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

> ⚠️ **已廢除（2026-06-13）**：Task 層個別錨定移除。個別任務本就應跟前置連動，釘住反而違反連動；錨定的正確位置在 **Template 層（正推／逆推）**，非個別 Task。已移除 📌 `task-anchor` UI（task-row + header 第 2 欄 + grid 11→10 欄）、`App.setAnchor` 函式、`.task-anchor`/`.anchor-badge` CSS。`t.pinned` 孤兒欄位保留（無人讀、不顯示）。下方為原設計記錄，僅供歷史參照。

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

## 第八部分之二：序號身分/位置分離 + 中間插入（2026-06-09 定案，核心改造）

✅ 前置 id 化已於 2026-06-13 完整重做完成（S1→S2b-3，7 commit，105 案全綠、線上實測）。本段藍圖已落地。實作摘要見 §8b.7。

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

### 8b.7 前置 id 化實作完成紀錄（2026-06-13）

走「資料端先帶 id、引擎最後切」的安全順序，每步線上可用、無中途爆炸：
- S1（862a926）：翻譯純函式 buildWbsToIdMap + translatePredToId（純函式不碰 DOM/Storage）
- S3（1578185）：WBS 匯入 performWbsImport 第二輪翻 predecessor 序號→id
- S4（1465876）：J 同步 syncJSeries 每次同步當下翻譯（方案 P，不靠 one-shot 旗標，避開上次爆炸根因）
- S2a（a9c9627）：translatePredToId 輸出加 # 分隔符（id#FS）根除邊界歧義；parsePredecessors 雙格式相容（有#走 id、無#走舊序號）
- S2b-1（cfd445f）：引擎節點 key wbs→id（topoSort/computeSchedule/isTaskBlocked，生產+測試副本一字不差）
- S2b-2（733e0e6）：測試端 runSchedule/runApply wrapper（fixture 維持序號、入口翻譯）
- S2b-3（c7214ca）：§3 runTopo wrapper，105 案全綠

關鍵設計：predecessor 存 task.id（永久身分）、wbs 保留供顯示/追溯、# 分隔符避免 id 與 type 撞、翻譯對已翻 id 冪等（就地翻安全）。

⚠️ 未完成（S5，新 session 修）：手動表單 new/edit 的 serializePredecessors 尚未接 id 化。手動建任務時前置仍存 wbs 序號，引擎 nodes 用 id → 對不上 → 手動任務前置失效、排不出。詳見 §9 S5。
（WBS 匯入、J 同步兩條主路徑已 id 化、線上可用，僅手動表單這條待修。）

---

## 第八部分之三：專案範本系統（2026-06-12 定案）

⚠️ 本段（範本系統本體）仍為未實作藍圖，尚無對應 commit。兩個前置障礙：前置一「前置 id 化」已於 2026-06-13 完成（見 §8b.7），8d.4 依賴重指可直接吃 id 制 ✅；前置二「反推引擎」（§4.8 / §8d.6）仍未做 ❌。範本系統待兩前置齊備後，先出 mockup + 資料結構設計再開工。

### 8d.1 需求由來

每開一個新開發案就從 0 手 key 99 項 task = 廢系統，沒人會用。要的是「PLM 式專案範本」：
以 J 系列為範本，新案一鍵套用，自動帶入完整結構 + 排好時間，使用者只微調。範本也要能
分享給同事（開新 url 就有預設範本）。

### 8d.2 範本本體 = repo 裡的版控 JSON（非寫死 code）

**關鍵架構決策**：範本是一份獨立的版控 JSON（例如 `templates/j-series-template.json`），
放 repo、可改、push 後所有人下次開 url 拉到的都是最新版。範本「內容」與「套用程式」徹底
分開——改範本 = 改 JSON + push，不動程式。符合單一真實來源原則。

範本 JSON 內容 = 清乾淨的「骨架 + 假資料」：
- **保留（骨架）**：階段、子群組、任務名、類型、工期（durationDays）、前置依賴（predecessor）。
- **清成假資料/空（不外洩實際營運）**：負責人（owner/dept）、實際開始/完成、進度、交付物、
  風險議題、備註等「誰做了什麼」的真實資料。
- 範本內 id 用範本自己的臨時 id；套用時一律系統重產（見 8d.4）。

### 8d.3 建專案輸入（套範本前的表單）

開新案套範本時，先讓使用者輸入：

1. **各單位 + 負責人清單**：給幾行範例列，可自由增減欄位。填完自動帶進專案的
   `project.depts`（接 D-2 的 `{id,name,members:[{id,name}]}` 結構）。範本的 task.dept
   先指向範本部門，套用時 translate 到新建的 project.depts id。
2. **專案開始日 + 結束日**：兩個日期輸入。系統自動排序後，使用者仍可手動逐項調日期。
3. **排序方向勾選**：
   - 「依開始日順排」（forward，從開始日往後按工期+依賴推）。
   - 「依結束日反推」（backward，從交期往前倒推每項最晚開始）。
   - **順排與反推皆支援（引擎已含 backward pass，見 8d.6）**；兩者排完後此勾選仍可改、重排。
4. 第 2、3 點目的：時間跨度大的專案，讓使用者自由決定時間落點。

### 8d.4 套用引擎 applyTemplate（純資料，不碰 DOM/Storage）

輸入：範本 JSON + 使用者輸入（專案名、開始日、結束日、排序方向、部門清單）。
步驟：
1. **deep copy** 範本 task 陣列（不可污染範本本體）。
2. **id 全部重產**（`U.id()`），建「範本 id → 新 id」對照表。
3. **依賴重指**：每筆 task.predecessor 內的範本 id，照對照表換成新 id（接「§8b 乙案
   predecessor id 化」——回家驗完 merge 後，predecessor 已是 id 制，這裡直接套對照表）。
4. **部門 translate**：task.dept 從範本部門 id → 新建 project.depts 的對應 id。
5. **排時間**：呼叫排程引擎 `computeSchedule`/`applySchedule`，依使用者選的方向排程——順排從
   專案開始日按工期+依賴往後推、反推從結束日往前倒推最晚開始，寫回 plannedStart/plannedEnd。
6. **回傳** 新 task 陣列 + 警示串（衝突/排不進去，見 8d.5）；呼叫端決定 render / save。
   （守分層：引擎只回資料，不直接 renderGantt 或 Storage.save。）

### 8d.5 排不進去的偵測與報錯

時間跨度太短：就算每項工期壓到最小、按依賴排，算出的總 end 仍 > 使用者給的結束日 = 溢出。
- **偵測**：引擎排完後比對 `computedEnd` 與使用者輸入的結束日；computedEnd > 結束日即溢出。
  順排與反推皆做此比對。
- **報錯要讓使用者好調整**（UI，非引擎）：
  - 明確告知「依目前範本項目與依賴，最短需 X 個工作天，但你給的區間只有 Y 天，差 Z 天」。
  - 指出是哪條依賴鏈最長（關鍵路徑）撐爆區間，讓使用者知道要砍哪段或拉長交期。
  - 允許使用者：①拉長結束日 ②縮短某些項目工期 ③刪非必要項目 後重排。

### 8d.6 依賴鏈與引擎能力（前置：排程引擎做完整）

完整範本系統需要的引擎能力：
1. **順排（forward）**：computeSchedule ✓
2. **反推（backward）**：backward pass，從交期往前倒推每項最晚開始 ✓
3. **衝突偵測**：引擎算完後比對區間（computedEnd vs 使用者給的結束日，見 8d.5），順排/反推皆適用 ✓

**範本系統前置 = 排程引擎做完整**：順排 + 反推 + 衝突偵測 + 接 UI 全部到位（核心函式改動、
判斷風險最高，需家裡桌機 Node 跑回歸測試）。**此前置完成後才做範本系統。** 好處：範本一上線
即可順排與反推皆用，不必分兩波、不留半殘 UI，也不假裝引擎有它沒有的能力。

### 8d.7 入口與生命週期

- **入口**：「新增專案」流程中提供「套用範本」選項（選範本 → 填 8d.3 輸入 → 套用）。
- **用完收起**：專案 task 建好後，「套用範本」入口對該專案隱藏（一次性動作，不長佔版面）。
  具體放哪/怎麼隱藏待 mockup 細化。
- **之後 Task 頁**：只保留「批量修改」+「新增 task」兩個按鈕（範本套用已完成其使命）。

### 8d.8 批量編輯頁（Excel 式表格，後續階段）

範本套完總要微調 → 批量編輯頁：表格每格可改、可多筆批改、Excel 式往下拉填滿。
- 現有待辦清單已是表格，inline edit = cell 點了變輸入框、改完存回。
- 難點在守存檔路徑單一（改即存 or 批次存，別跟雲端同步打架），非技術難。
- 「往下拉填滿」是進階互動，最後做或先跳過（範本複製後此需求大減）。
- 此頁屬獨立階段，範本系統穩定後再開工。

### 8d.9 配套

- 使用指引 Tooltip（建專案輸入頁各欄位 `?` hover）。
- 操作 SOP 下載按鈕（範本套用流程的說明文件，格式待定）。

### 8d.10 實作階段（每段獨立 commit，逐一核 diff → 線上驗證）

> 前置：①排程引擎做完整（順排 + 反推 + 衝突偵測 + 接 UI，見 8d.6）先完成；
> ②§8b 乙案 predecessor id 化回家驗完 merge（8d.4 依賴重指吃 id 制）。

1. **範本 JSON 產出**：把 J 系列匯出成清乾淨的 `templates/j-series-template.json`
   （骨架保留、實際營運資料清空/假資料化）。定義匯出規則。
2. **建專案輸入表單**（8d.3）：部門清單列、開始/結束日、排序方向（順排 + 反推皆可選）。
3. **applyTemplate 引擎**（8d.4）：deep copy + id 重產 + 依賴重指 + 部門 translate + 排時間
   （順排/反推依使用者選）。純資料、回傳 task + 警示。家裡桌機寫 + Node 驗。
4. **溢出/衝突偵測 + 報錯 UI**（8d.5）。
5. **入口 + 生命週期**（8d.7）：新增專案接套範本、用完收起、Task 頁兩鈕。
6. **批量編輯頁**（8d.8）：獨立階段，範本系統穩定後。
7. **配套**（8d.9）：Tooltip + SOP 下載。

---

## 第八部分之四：view-only 唯讀分享 0b/0c 安全步驟（2026-06-12 已完成，存查）

### 8c.2.1 0b/0c 操作步驟（生死關，逐步；在選定真實來源那台做，傾向公司桌機）

1. 在真實來源那台（傾向公司桌機、local 較多）開 app（config.local.js 載真 token/URL）→ 設定頁按「⬇ 從雲端下載最新」或 init 自動 download。
2. F12 → console 印 `DATA.settings`，實搜有沒有 `cloudSyncToken` / `_loggedInEmail` / `_loggedInPicture`。
3. 判讀：
   - 雲端 blob 的 `data.settings` **仍含 token** → 是 0a 之前的舊髒 blob（舊 app.js 沒剝）→ 證實「舊 blob 髒」，正是 0b 要蓋的。
   - **0b**：用 0a 後的 app.js 重跑一次乾淨 upload（payload.token 帶真 token 過 doPost，但 data.settings 已剝乾淨）→ 蓋掉髒 blob。
   - **0c**：再 download 驗一次（=0c），`data.settings` 搜不到 token → PASS。
4. ⚠ **0c PASS 前，後端 doGet 絕不可改公開**（步驟1，見 §8c E 群）。

> 推論（code 層面可確認，非實證）：0a（`155d2c7`）已把剝欄位的 code 上線，故 0a 之後任何一次 upload 寫出的 blob 必乾淨。風險只在「雲端現存那份是不是 0a 之後寫的」——若 0a 後從沒 upload 過，雲端可能仍是舊髒 blob。這無法靠 code 推斷，只能 download 實看，故 0c 不可省。

---

## 第九部分：待施工清單（依風險與依賴排序）

每項獨立 commit，逐一核 diff → 線上驗證 → commit。

**★ 最高優先（新 session 第一件）：S5 手動表單前置 id 化（修今天線上實測發現的 bug）**
今天前置 id 化大重構完成（§8b.7），但手動表單 new/edit 的 serializePredecessors 尚未接 id 化，導致手動建任務綁前置時：前置選錯參照（下拉顯示 wbs 非流水號）、綁了排不出（存 wbs 序號、引擎 nodes 用 id 對不上）。
修法已定案，分 S5a/S5b：
- S5a：predCandidates 改造 —— 加 id 欄、放寬 has-wbs→全部任務（手動可當前置）、階段過濾（parseFloat(stage) ≤ 表單已選階段、含同階段、NaN 變體暫排除）、含 done、加 1-based seq；下拉 option value 存 task.id、label 顯示「seq·任務名」（路 Z：下拉自己連續號，不動任務列）。
- S5b：serializePredecessors 讀下拉 id 直接吐 id；_predRowHtml edit 回顯用 candidates.find(c=>c.id===dep) 反查 label；階段欄 onchange 即時重 render 候選（改階段清掉超範圍已選前置+toast）。
- 產品決策（已拍板）：前置篩選 ≤含本階段；變體（2.2kW 等）暫不特殊處理，走主案假設，留 variant 架構（下方）。

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
13. ✅ 前置依賴 id 化完整版（2026-06-13 完成，S1→S2b-3，7 commit，105 案全綠，見 §8b.7）。剩 S5 手動表單接線（見上方最高優先）。
14. 釘子聯算（§6.8）：釘住觸發 override / 下游級聯重排，依 §4.3/§4.4 錨點機制，與排程錨點一起做。
15. 全檔 emoji 統一換 Tabler icon（§6.8 已引入字體，階段二配 UI/設定頁重規劃）。
16. app.js 拆檔（~7000 行，no-build 約束，ES modules 或 ordered script）
17. 設定頁 v2（移除 J 系列遺留、側欄預設收合）
18. 部門 D-2c/D-2d、D-3
19. variant 變體/案別架構（task.variant id 制）：一個 J 系列專案承載主案 + 多變體（2.2kW 等），變體階段可能是主案子集、階段名重複，只能靠 kW/代號區分。stage 欄目前被迫扛「變體+階段」兩維度（出現「手工機(2.2)」縫合產物）。正解：拆 variant（id 制，project.variants=[{id,name}]）+ stage（純階段）兩欄。前置候選過濾屆時 = 同 variant + 同階段及之前。屬大功能，動工前先出 mockup + 資料結構設計 + 兩種版面（主案完整/變體精簡）。S5 階段過濾預留疊加空間（未來多一個 variant 相同 AND 條件）。
20. **Excel 匯出**：把 J 系列/排程結果匯出成 Excel（JS + SheetJS，client 端產生）。待 variant 後做——匯出帶「案別」欄才乾淨，否則 stage 混「變體+階段」會匯出髒資料。
21. **Template 範本系統正推/逆推（§8d + §4.8 + §6.8）**：錨定已從 Task 層移除（§6.8 廢除），正解在 Template 層。正推 UI + 逆推引擎（backward pass，§4.8）待做；逆推引擎屬核心新增、判斷風險最高。

**雲端（已完成）：** doGet 公開唯讀已上線（2026-06-12）——訪客開網頁即見最新 J 系列資料。新部署繞過舊部署不生效問題；doGet 拔 token 鎖（純讀），doPost token 檢查保留（寫入維持鎖）。前端 config.js 換新 exec URL。教訓：Apps Script 編輯部署若不生效，直接建新部署最快（代價 URL 變、前端要跟著換）。

**雲端（待補）：** `pdcaGroups` 尚未進 CloudSync upload/download blob——它在 Storage(localStorage) 有存，但 upload payload 與 download 還原都沒帶，跨機不同步、download 不還原（在雲端機器間切換會掉 PDCA 分組）。低風險但會掉資料。比照 calendars（2026-06-14 已補）做法：upload 加 `pdcaGroups: DATA.pdcaGroups`、download 加 `DATA.pdcaGroups = cloud.pdcaGroups || DATA.pdcaGroups` 防坑 + 寫回 localStorage。另做，這次不碰。

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

**CSS 鐵則**
- 顏色/圓角/z-index/陰影一律走 :root 變數，禁規則裡寫死 hex/數字。
- 合理例外：rgba 透明衍生、膠囊 99px、圓點 50%。

**改檔紀律**
- 禁 PowerShell 文字回寫（UTF-8 變亂碼）。含中文檔用 Edit（單行/短改）或 node 腳本（多行區塊，見下方 CRLF 鐵則）。
- `?v=` 版本號只升動到的檔對應行，不全升。

**CRLF 多行替換鐵則（2026-06-13 慘痛教訓）**
- 本專案 repo 混合換行（多數程式碼檔 app.js/測試/index.html 是 CRLF，md 文件是 LF）。str_replace/Edit 對 CRLF 多行 old_string 定位不穩，跨 session 反覆失敗（曾在 isWorkday 兩層化同步耗費大量來回，多次「舊行沒刪、新邏輯並存」）。
- 改多行區塊（函式整塊、含中文段）改用 node 腳本：讀檔偵測 `useCRLF = content.includes('\r\n')`，用 `nl(s)=> useCRLF ? s.replace(/\n/g,'\r\n') : s` 把樣板字串轉 CRLF 再比對；`content.split(old).length-1 === 1` 才 `fs.writeFileSync`，否則 ABORT 不寫（多塊則全部 count===1 才一起寫）。
- 腳本經 `cat > _tmp_*.js << 'EOF'`（bash heredoc，繞開會「插入而非取代」的編輯工具）寫入，跑完即 `rm`。`_tmp_*.js` 機密檔規則已排除。
- 單行替換（如 `?v=` 升版）CRLF 影響小，但統一用 node 手法最穩、且 count===1 防呆避免重複行。

**測試**
- Node.js（家裡桌機）跑 `node docs/test-schedule-cases.js`（56 案）+ `node --check app.js`。
- 測試檔含核心函式副本（parsePredecessors/isTaskBlocked/computeSchedule/topoSortTasks/isJTask/getJOverride/applySchedule/getEffectiveSchedule），改動兩邊同步。
- ⚠️ **測試全綠 ≠ 公式對**：測試 expected 與 code 同源會自圓其說，需外部標準（Excel WORKDAY／標準 PM 定義）交叉驗證才能戳破隱形 bug。本專案三個 bug（FS lag +1／匯入時區 -1天／工作日曆假日表）皆此法挖出。

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

**2026-06-14（家裡桌機）：**
- `6351e92` 工作日曆兩層疊加 DATA.calendars 結構 + isWorkday 改讀（§之二.2）
- `8808e4a` 補 SS/FF/SF lag>0 測試（鎖前置引擎 lag 縮放）
- `70f8c97` 修正 FS 前置 lag +1 公式 bug（對齊 Excel WORKDAY，藏 105 測試後靠外部標準戳破）
- `7ffb15d` 修正 wbsDateStr 匯入日期 UTC 位移 -1天 bug（toISOString→D.fmt 本地）
- `a9499a4` 移除 Task 層錨定 UI 空殼（錨定歸 Template 層，§6.8 廢除）
- `b10c457` 工作日曆 DATA.calendars 持久化（localStorage + 雲端跨機）
- `3d61155` parseCalendarPaste 改彈性表頭對應 + 去特定公司字眼（§之二.9）
- `8a7d2dd` 工作日曆設定頁 UI（公休貼上匯入，§之二.9 五步閉環）
- 測試：排程 105 + 工作日 42 全綠；J 系列驗收 74 筆零不一致

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

