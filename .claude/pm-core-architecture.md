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

## 第零部分之二：開發方法論（2026-06-15 定案）

文件驅動開發流程（大功能模組一律照此）：
細部討論 → 寫進架構文件 → Claude Code 讀文件+查 code → 確認方向 → 改 code → 自動驗證 → 實測兜底 → commit-gate

核心原則：
- 前期規劃（討論+寫文件）花時間，但整體加速且可靠；有問題有文件對照，知道從何找起。
- 設計決策一律先寫進架構文件（單一真實來源），再讓 Claude Code 照文件落地——避免雜亂無章、來回重改。
- ⚠ 測試綠 ≠ 能跑：核心邏輯靠測試驗、UI/載入/DOM 行為靠實測驗。node --check 只驗語法不驗執行，測試檔自帶環境（stub）抓不到 TDZ/render 順序等真環境問題。每批必實測兜底。

協作分工（兩者皆不可少）：
- Paul：問對問題、找根本、給方向、領域判斷（排程合理性/階段歸屬等）。
- Claude：給方向後深挖解法、執行中攔截技術盲區（TDZ/latent bug/render 順序/單一真實來源違反）、補看不見的細節。

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

## 第四部分：排程引擎（已完成，90/90 PASS；2026-06-13 已接 UI 自動觸發）

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
| **工期依賴排程** | `computeSchedule` / `applySchedule`（FS/SS/FF/SF、90 測試覆蓋） | WBS 工期任務：算前置鏈、自動傳播每項開始/結束日 | **不該有按鈕**——資料輸入完就該自動算（見 4.9） | 視圖二（專案進度/甘特/待辦） |

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

**風險記錄：** 存檔即觸發會讓「尊重手填不覆蓋」的判定每次存檔都跑（比手動按一次頻繁）。computeSchedule 須確實尊重手填錨點不覆蓋（§4.3），自動觸發放大任何判定漏洞。已驗 90 測試 §5/§7/§8 手填保護通過。

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

addWorkdays 改呼叫 isWorkday，引擎全鏈吃同一份日曆。屬核心函式改動，逐 diff + 90 測試 + 補日曆測試。

### 之二.6 設定頁 UI（「能修改」）
- 基底層：多格式匯入（Excel/PDF/截圖，可靠度遞減 Excel>PDF>截圖，三者都先預覽+可手動修正才寫入）、假日清單顯示（年份分組可搜尋）、單筆增刪。
- 覆蓋層：命名、加 extraHolidays/workOverrides、整層啟用/停用/刪除（換公司一鍵移除）。
- 週末規則：預設週六日休，可勾變體。
- UI 動工前先出 mockup 審核。

### 之二.7 施工分段（先文件後 code，每段獨立 commit）
1. 本節 commit（先行）。
2. 資料結構 + isWorkday 純函式（不接引擎，先建+測試）。
3. 匯入器：Excel 公司行事曆 → base（PDF/截圖後補）。
4. 引擎接 isWorkday（核心改動，逐 diff + 90 測試 + 補日曆測試）。
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

順序為今天重排後（2026-06-14，`f5a1c0f`）的實際渲染序（app.js:3980 起 `buildTaskFormHtml`）：

| 順序 | 欄位 | 必填 | 元件 | 狀態 |
|---|---|---|---|---|
| 1 | 專案 | ✅ | select | ✅（改名、移到最上） |
| 2 | 任務名稱 | ✅ | text | ✅ |
| 3 | 計量切換（工期制／時段制） | — | measure-toggle 按鈕 | ✅（切換 dur-only／hours 欄位顯隱） |
| 4a | 擔當 | ✅ | text | ✅ |
| 4b | 類型 | ✅ | select（? tooltip） | ✅（含 tooltip） |
| 5a | 階段 | ✅ | text+datalist | ✅（改名 PLM階段→階段） |
| 5b | 子群組 | — | text+datalist（dur-only） | ✅ |
| 6 | 預計開始 | ✅ | date（+ 推算日顯示） | ✅（顯示 scheduledStart 推算日，§4.9） |
| 7 | 預計完成 / Deadline | — | date（tf-end，兩者併一欄） | ✅ 欄位 / ❌ 自動算未做 |
| 8a | 工期（工作天） | — | number（dur-only，tf-duration） | ✅ 欄位 / ❌ 自動算未做 |
| 8b | 預估工時 (h) | — | number（hours，tf-hours） | ✅ |
| 9 | 前置任務 | — | 結構化下拉（見 6.4） | ✅（select、value=id、label「序·名稱」、optgroup 階段、階段窗，2026-06-15 commit1） |
| 10a | 緊急程度 | — | select（? tooltip，自動算可覆蓋） | ✅（含 tooltip） |
| 10b | 狀態 | — | select（? tooltip） | ✅ tooltip / ❌ 反灰唯讀未做 |
| 11 | 說明 | — | textarea | ✅ |
| 12 | 實際執行區 | — | 反向摺疊（實際開始/完成 + 交付物 + 連結） | ✅ |
| 13 | 需拉高層 HL + 風險內容 | — | checkbox（? tooltip）+ textarea | ✅ |
| 14 | 備註 | — | text（dur-only） | ✅ |
| 15 | 可切分（≥4h 拆多天） | — | checkbox（dur-only） | ✅ |
| 16 | 排入行事曆 | — | checkbox（dur-only，? tooltip） | ✅（雙視圖分流欄位，§2.3） |

**順序重排（2026-06-14，`f5a1c0f`）：** 時間區（預計開始／完成／工期／工時／前置）上移到階段下方
——時間是專案重心；緊急／狀態降到時間之後；說明移到末段（實際執行／HL／備註／可切分／排行事曆前）。
`buildTaskFormHtml` 18 區塊 splice 重排，**每區塊內容不動、只換序**，共用表單（new／edit／工期制／時段制）
所有入口一致（單一真實來源，不複製兩份）。

**已移除：** 分類（category，UI 拿掉、資料層保留、行事曆配色仍讀 category）、處理方式（method）。

**必填（6）：** 專案、任務名稱、擔當、類型、階段、預計開始。已完成。

**欄位大小：** 統一 38px（前置列內 36px）。

### 6.3 類型說明（Tooltip，未做）

- 任務：有工期、要排程的實際工作項目
- 里程碑：時間點標記（工期 0），如審查、交付節點
- 群組：純分類母項，不參與排程
- 里程碑/群組的 category 給空。
- **所有 Tooltip 統一用 `?` 圖示 hover 顯示（title 屬性）。**

### 6.4 前置任務結構化（✅ 已做，2026-06-15 commit1）

取代舊自由文字 `1FF,2FS+2`（沒人會填）。

> 實作註（commit1）：原設計模糊搜尋輸入因 datalist value 帶不了乾淨 id（顯示文字≠task.id），改 <select> value=task.id；代價是失去打字搜尋，靠 optgroup 階段分組 + 階段窗縮短候選彌補。

- 結構化「一列一條」：搜尋任務（模糊）+ 關係下拉（白話）+ lag（預設隱藏，點「+延遲」展開）
- 關係白話：完成才能開始(FS) / 同時開始(SS) / 同時完成(FF) / 開始才能完成(SF)
- `?` + 範例：`16FS`=等#16完成才開始 / `16FS+2`=完成後再隔2工作天 / `16SS`=同天開始 / `16FF`=同天完成 / `16SF`=#16開始後才能完成
- 候選清單限制（已放寬）：列 `measureType !== 'hours'` 的任務（工期制＝WBS＋手動專案任務都可當前置，不再限有 wbs 編號）；階段窗過濾（前 1-2 階段＋同階段之前）見 §9 S5。
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
- **本案是「位置插入」純位置層**，不綁前置依賴 id 化（§8b.5 層次二已 revert）。「依賴不錯位」的根本解需 id 化重做（見 §9 待辦）。
- 【更新 2026-06-18，commit `80fad1b`（二刀-B step1，日期序世界）】列間➕ 改為**自動接前置落位**：點某列下緣➕ → `_insertAfterId=該列 id` → `saveNewTask` 在**表單前置為空時**自動帶入 `_insertAfterId#FS`（沿用 `serializePredecessors` id#格式）→ `applySchedule` 算日期 → 依日期序落到參考列後。**有手填前置則不覆蓋。**
- ⚠ `splice(_i+1)` 保留但作用退化＝「同 `dispStart` 任務的 tiebreak」（同日期 `orderTasksByDispStart` 用 decorate-index 保陣列序）。**看似死碼、實則同日排序靠它，勿刪。**

---

## 第七部分：WBS 匯入器（現況，已查證）

`parseWbsExcel`(app.js:7454) + `performWbsImport`(app.js:7553) 已將 Excel 幾乎所有欄位寫入 task。
**讀法靠表頭名、不靠固定欄序**（2026-06-14，`3df295f`）：新 Excel 在 B 欄插入「案別」整體右移，
固定欄序會全錯位，故改讀第 1 列表頭、建「表頭字面 → 欄 index」映射（app.js:7482-7494）：
- `colMap[表頭] = i`（`String().trim()` 防呆空白）；`cell(row, 表頭名)` 靠名取值，欄序不拘。
- **必要欄檢查**：`['N','PLM階段','任務名','類型','前置(N)','工期','負責人','預計開始']` 缺任一
  → 整批失敗、報「缺少必要欄」。
- 「案別」**不在必要欄**：舊 Excel 無此欄 → 不報錯、該批 variant 留空（向後相容，見 §8e.3）。

（欄序不再固定，靠表頭名讀；下表順序僅供參考，實際依 Excel 表頭字面。）

| Excel 欄（表頭名讀） | task 屬性 |
|---|---|
| 序號（N） | wbs |
| 案別 | variant（id 制，見 §8e） |
| 階段（PLM階段） | stage |
| 子群組 | subgroup |
| 任務名 | name |
| 類型 | taskType（+category lossy 過渡） |
| 前置(N) | predecessor |
| 工期 | durationDays |
| 負責人 | owner + dept |
| 預計開始 | plannedStart |
| 預計完成 | plannedEnd |
| 實際開始/完成 | actualStart/End |
| 進度 | progress |
| 狀態 | status |
| 必交付/交付物 | mustDeliver/deliverable |
| 風險議題 | riskIssue |
| 備註 | note |
| 已交付/連結 | delivered/deliverableLink |
| 待補 | deadline（§6.6） |

**兩個 caveat：**
1. 匯入器刻意把 `start`/`end` 留空字串（只寫 planned），防 `getEffectiveSchedule` 誤判手填錨點。
2. **重新匯入整碗覆蓋**：先清空該專案任務再重建。匯入後本地編輯下次重匯被 Excel 覆蓋。工作流：來源是 Excel 的改 Excel 重匯；PM-Core 表單編輯適合手動新建任務。

負責人欄解析 quirks：多人分隔符（`、` `/` `＋`/`+`）全要拆；髒值（`—`、`「負責人」`表頭）→ 未指派；未知名 → 未指派；負責人欄可能直接是部門名 → 反查表要含部門名為 key。

### 7.1 四繳付欄位全鏈（2026-06-16 定案，趁分享前定 schema，回家施工要 Node 驗）

架構決策:趁系統未分享、資料能整碗重灌,一次把資料結構欄位定到位,含目前無 UI 用的四繳付欄位。理由:欄位(schema)是地基,後加波及匯入器欄位位移/雲端 blob/跨版本相容→改爆既有 code,尤其分享後別人也存資料時。趁獨自一人改 schema 零代價。

四欄(task 結構):mustDeliver 必需繳付 / deliverableType 繳付件類型 / requiredTask 必要任務 / mustIssue 繳付物必須發行。

全鏈(回家做,判斷風險逐步驗):
①task 結構定義四欄 ②parseWbsExcel 讀 Excel 四欄寫 task ③Storage.save 寫+Storage.load 讀(fallback 完整預設,舊環境無 key 不炸) ④CloudSync upload 帶+download 防坑還原(比照踩坑手冊「新增持久化欄位四步」:cloud.X||DATA.X 不可 ||{} 否則舊 blob 蓋空)+寫回 localStorage ⑤整碗重灌。

之後才做(純加法):任務表單顯示/編輯這四欄 UI、報表/篩選用。

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

✅ 前置 id 化已於 2026-06-13 完整重做完成（S1→S2b-3，7 commit，90 案全綠、線上實測）。本段藍圖已落地。實作摘要見 §8b.7。

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

> ✅ 2026-06-15 commit2 升級：序基準收斂為 `orderedProjectTasks`（DATA.tasks 陣列序、含 done 佔號、排除 deleted），**外層待辦列與前置下拉同源**；序欄仍印 index+1，但 index 取自含 done 的 ordered（done 不再被濾掉才編號）。

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
- S2b-3（c7214ca）：§3 runTopo wrapper，90 案全綠（當時 86，後補 SS/FF/SF lag 至 90）

關鍵設計：predecessor 存 task.id（永久身分）、wbs 保留供顯示/追溯、# 分隔符避免 id 與 type 撞、翻譯對已翻 id 冪等（就地翻安全）。

✅ S5 已完成（2026-06-15，commit1）：手動表單 serializePredecessors 已接 id 化（讀 select.value=id、吐 id#關係lag，對齊 translatePredToId）。三路徑（WBS 匯入、J 同步、手動表單）全 id 化、線上可用。詳見 §9 S5。

### 8b.8 待辦列 done 改造（2026-06-15，commit `2243ae9`）

承 §8b.4 序統一，重整待辦列 done 呈現：
- **不濾 done 回主列**：done 任務原位顯示（灰字刪除線，既有 `.task-row.done`），序同源 `orderedProjectTasks`（含 done 佔號、排除 deleted），外層待辦列與前置下拉同號。
- **頂部摺疊 toggle bar**：「已完成 N」bar 放欄位表頭下方（非底部）；收合隱藏 done 列、展開原位顯示；`toggleDoneVisible` 以 `renderProject` 重繪；F 配色（sage 左粗綠條 + sage-100 底 + 深字，走變數）。
- **預覽切第 15 個未完成**：掃 ordered 累計未完成到 15 為止（done 不佔預覽額度，夾在中間者原位保留）。
- **工期制免自動清除**：`cleanOldDoneTasks` 加 `measureType !== 'hours'` 豁免——工期制（WBS／手動專案任務）done 永不自動刪，只清時段制雜事；移除誤導 tip。詳見踩坑手冊「坑 3」。

---

## 第八部分之三：專案範本系統（2026-06-15 定案）

### 8d.1 範本本體

範本=版控 JS：templates/product-dev-template.js（var PRODUCT_DEV_TEMPLATE，方案A全域變數，照config/seed機制，file://與Pages皆可讀）。內容與套用程式分離，改範本=改JS+push不動程式。已進repo。
範本骨架：保留階段/子群組/任務名/類型/工期/前置/variant；清空真名(留角色PM/ME/EE/FW/開發課/品保/採購/生管)/實際日期/進度/交付物/風險/備註。

### 8d.2 中性化規格

階段名(英文6階)：規劃→Prototype、手工機→EVT、性試→DVT、商檢→Safety、量試→PP、量產→MP。Safety沿用第4階段順序。階段中文副標：原型規劃/工程驗證/設計驗證/安規認證/試產/量產。
其餘全中文中性詞，去J系列/功率/廠商字眼。案別中性化主案/另案。#44/#50壞前置清空。範本含主案54筆(全6階段)+另案20筆(EVT/PP/MP)。

### 8d.3 模組化

範本=階段模組組合。建案勾選階段→勾幾個生成幾個模組。跨模組依賴靠predecessor存id(§8b.7已完成)，不靠序號。

### 8d.4 案別variant=帶獨立時間的子案

採做法甲(單一範本含variant)+階段勾選，不採乙(獨立子範本)。
另案有自己獨立開始/結束日+各自順推逆推方向+各自勾階段(另案不與主案同時開)。
另案起點採甲(獨立填、與主案無依賴)，不採乙(掛靠主案節點跨案依賴，列後續)。
另案是輕量選項：用→同專案內分區塊Sidebar一個project；不用→自建新專案Sidebar兩個project。
資料結構：project.variants=[{id,name,schedule:{startDate,endDate,direction},stages}]，task.variant存id，空=主案。variant結構從{id,name}擴帶schedule(動既有結構，落地需驗階段分塊複合鍵6169-6191/案別膠囊3350-3360讀取不炸)。

### 8d.5 階段勾選/改名/自訂

三類：①預設6階段可勾可改名 ②改名用id對照(stage存id顯示名另存，改名只動顯示名id不變，同D-2部門改名) ③+自訂空白階段(新id無預載任務自己填，給非標準流程如設變)。不採「改名但任務不變致名實不符」爛做法。

### 8d.6 applyTemplate套用引擎

純函式App.applyTemplate(template,userInput)，只回傳資料不碰DOM/Storage。
步驟：①建專案物件 ②建variants含schedule+對照表 ③建depts(同D-2，role→人) ④篩選勾選階段task、收集排除序號 ⑤id重產U.id()+建「序號n→新id」對照表(範本需補n欄) ⑥依賴重指(逐個前置：在保留集→換新id；指向排除階段→移除轉無依賴+warning；多前置只移除斷的保留其餘) ⑦欄位組裝 ⑧各案別各自順推排程寫plannedStart/End(第一版只順推，逆推disabled)。回傳{project,variants,depts,tasks,warnings}，呼叫端決定push/save/render。

### 8d.6b 溢出偵測與關鍵路徑報錯

引擎排完比對 computedEnd 與使用者結束日：溢出(排不進)→白話報錯「最短需X工作天、區間只Y天、差Z天」+指出最長依賴鏈(關鍵路徑)是哪條撐爆+允許①拉長結束日②縮短工期③刪項目後重排。關鍵路徑提示即使順推也有價值。逆推/deadline相關部分順延後續。

### 8d.7 前置三層分離

UI(白話用下拉選不出現FS)／資料(id#FS+lag)／Excel匯出(16FS+2)。單一真實來源=資料層id碼。
需函式：prettyPredecessor(id→白話顯示)、predToWbsFormat(id→WBS序號FS格式匯出)、編輯用§6.4下拉(白話選→存id)。
UX：頂部固定?說明區(白話+寫死範例)只放一處；每列前置白話顯示「接在《X》後/接在N項後/無前置項目」；hover顯示綁誰；空前置點選展開下拉。「無前置項目」不寫「從起點開始」(誤會)。

### 8d.8 日期唯讀(符合§4.3)

任務預計起訖唯讀(引擎算出)。調整靠改①工期②前置③開始日(順推)/結束日(逆推)，自動重排。不碰task.start。模板頁日期全唯讀；鎖定錨點逃生口等專案建立後在專案頁才開放。

### 8d.9 兩階段UI

配色：主案深sage #2D4A3A／另案藍灰 #3D6582(獨立區塊冷暖對比防誤改)／時間軸暖灰進度條 #9A9789／前置+日期藍字 #185FA5+淺藍底 #E6F1FB。字體統一表頭~12px內文~13px標籤~12px緊湊小字(以「無前置項目」行密度為基準)。
第一階段(建專案輸入)：專案名→各案別卡(主sage/另藍灰)各自[排程方式+開始日(順推填)/結束日(逆推填另端唯讀)+階段勾選膠囊(點勾選/點名字改名/+空白階段)]+新增另案+部門負責人都可改可加。入口走openProjectDialog新增模式內加「空白vs套範本」分岔(選空白原3欄不變、選套範本展開範本流程)。
第二階段(編輯頁)：頂部前置?區→主案區塊(sage框：階段時間軸序+階段兩欄/可點高亮EVT外框/hover反色切換任務 + 任務清單前置白話hover/工期可改/日期唯讀/列間hover➕插入序號重排前置留空/列尾✕刪除/工期前置歸組)→另案區塊(藍灰框獨立分開：自己時間軸+任務清單)。序id鎖死(id自動產不可改+序號自動重排不可手填)。

### 8d.9b 生命週期與配套

套用範本是新增專案流程中的選項(openProjectDialog分岔)。task建好後「套用範本」入口對該專案隱藏(一次性動作、不長佔版面)。之後Task頁收斂為「批量修改」+「新增task」兩鈕。
建專案輸入頁各欄位配?hover tooltip + 操作SOP下載按鈕(範本套用流程說明)。

### 8d.10 落地順序

①範本JSON補n欄 ②第一階段UI(openProjectDialog分岔，分批刻) ③applyTemplate引擎(feat分支Node驗) ④第二階段UI ⑤前置三層轉換函式。逆推backward pass+批量編輯+Excel匯出+另案跨案依賴=後續。
批量編輯頁(後續)：inline edit(cell點了變輸入框、改完存回)；難點=守存檔路徑單一(改即存或批次存、勿與雲端同步打架，比照calendars防坑教訓)；「往下拉填滿」進階互動最後做。

### 8d.11 實作現況（2026-06-15 晚）

已完成（main）：
- applyTemplate 引擎①~⑧全實作（非藍圖）：建專案/variants含schedule/depts/篩階段/id重產/依賴重指/組裝/順推排程+6b溢出。純函式，68案+真範本sanity驗。
- 甲-1 接 UI：saveProject 套範本真建主案專案（push DATA/save/render/warnings）。
- 甲-2 第一塊：階段勾選膠囊（selectedStages 由 UI 勾選，觸發斷依賴邏輯）。
- 範本內容修正：補後段備料跨階段前置+加商檢測試鏈（n75/76）；計畫書（n19）移任務列最前+歸Prototype。

待做：
- 甲-2 第二塊案別卡（另案，cases由UI）、第三塊部門列（roleMap由UI）。
- 第二階段編輯頁、前置三層轉換函式、逆推引擎、配色對齊mockup、warnings清單式顯示。

備註：§8e.4「主案wbs<另案」有例外（n75/76 wbs>另案，不影響分塊，記此）。

### 8d.12 主案標準範本內容換公司標準 WBS（2026-06-16，純資料替換不動引擎）

來源:舊 PLM 系統公司標準開發 WBS(67列),舊系統無 Excel 匯出、逐張截圖,Claude 已產乾淨 Excel 模板當匯入來源。

定位:只換範本 Task 清單與前置,applyTemplate 引擎/案別卡/部門列/排程全不動。

清理決策(已定):
①階段補正連續:舊系統跳號 1/3/4/5/6 缺2→補成 1設計/2手工機/3性試機/4量試機/5量產機。
②里程碑(工期0共6筆):移行32/48/60、長期運轉機提出42、商檢機送測43、可販65,引擎當里程碑不佔工作天。
③前置兩格式混用:標準13FS+3 與純逗號列舉6,9/14,15,16/35..41/55..59,引擎吃兩種(純數字當多前置預設FS)。
④子群組:設計(系統/外觀結構/HW/FW)、手工機(組立/制御/試驗)、性試機(模具製作/試驗)、量試機(試驗)、量產機(試驗),無子群組任務留空。
⑤階段名去案別後綴當乾淨主案母版。

施工:Excel 走 parseWbsExcel 整碗重灌(配第二塊四欄一起打通),要 Node 驗。

### 8d.13 第二階段編輯頁：需交付資料欄 + 前置 hover 高亮（2026-06-16 定案，mockup 審核過）

承接 §8d.9 兩階段 UI 第二階段(編輯任務骨架頁)。本節補兩個元素。

【需交付資料欄】
- 第二階段任務清單表新增「需交付資料」布林勾選欄(位置:工期/預計起訖之後、列尾✕刪除之前)。
- 階段標題列有「全選」勾:打勾=該階段所有任務需交付全選,不打勾 user 自己挑(對齊 mustDeliver schema)。
- 表頭「需交付資料」+ (i) 圖示,hover 說明「勾選後,建完專案此 Task 會出現可填寫的交付欄位」。
- 機制(兩層):模板層勾「需交付資料」(=mustDeliver) → 建完專案後,該 Task 內層才出現繳付欄位可填(繳付件類型 deliverableType 下拉 / 繳付物必須發行 mustIssue 勾選);沒勾的 Task 內層乾淨無這些欄位。
- requiredTask(必要任務)欄:schema 保留(§7.1 已定義),但 UI 暫不顯示(目前流程任務預設全必要、此欄無區分作用);未來出現選用任務需求再開 UI(純加法,不動 schema)。

【前置 hover 整列高亮】
- 第二階段任務多時,hover 某列前置欄(白話「接在《X》後」)→ 被指向的那筆前置任務「整列反色高亮」,一眼對到是哪一項。
- 高亮樣式:淺陶土底 #F5E0D5 + 深字 #712B13 + 左側 terracotta #C4633E 色條(3px)。刻意不同於深 sage 表頭,避免撞色。
- 左色條作用:長清單捲動時視線快速定位。
- 配色走 :root 變數(缺的新增具名變數),禁寫死 hex。

【頂部說明區】
- 第二階段頂部 ? 說明區分項換行顯示(1工期+前置決定時間 / 2需交付資料用途 / 3前置填法,前置範例再分三小項:接在《X》後、+N天、無前置項目),不擠成一段。

### 8d.14 兩階段 UI 補充細節（2026-06-16 定案，mockup 審核過，補 §8d.9）

承接 §8d.9 兩階段 UI，本節補今日定案的互動細節。

【第一階段：階段膠囊】
- 階段膠囊純勾選(點＝切換勾/未勾),不在膠囊上改名(避免「點選」與「改名」操作衝突)。
- 需要新階段→「＋自訂空白階段」新增。
- 膠囊可拖曳排序:新增的階段可拖到任意位置(前/中/後),不限最後。每膠囊左側拖曳把手(ti-grip-vertical)。
- 設計理由:階段排序在第一階段做(僅約5個膠囊、成本低),第二階段任務(數十筆)就自然跟階段順序排,不必逐筆拖曳。
- 膠囊與文字縮小,省空間。

【第一階段：部門與負責人】
- 清單預設「自動帶出範本用到的所有負責人」(如系統工程師/結構工程師/硬體工程師/韌體工程師/採購/品保),使用者在此基礎上改/加/刪。
- 設計理由(甲案):清單從範本長出→涵蓋所有任務的負責人→第二階段配對不會失敗(從源頭消除配對問題)。
- 任務負責人由此部門對應帶出。
- 欄位縮小(~28px),省空間。
- 刪除部門時跳通知:「刪除『X』部門,將有 N 個任務(列出任務名)變未指派,可於下一步或建立後補上」。不攔阻,按確定即刪。通知目的=讓使用者知道刪除後果、心裡有數要去補。

【第二階段：負責人欄】
- 任務清單新增「負責人」欄(位置:前置與工期之間)。
- 預設值=範本帶的負責人(依第一階段部門對應)。
- 每列負責人欄「可下拉(選第一階段填的部門清單,用 datalist)也可手動輸入(清單沒有就打字)」。
- 此彈性設計一次解決三事:預設帶出、修改、配對失敗——配對不到的任務(如「馬達驅動工程師」不在清單)可手動補打、建完生效,無需先回第一階段加部門。不需做「刪除鎖定」「未指派強制」等額外機制。

【未指派處理(完整閉環)】
- 配對不到/被刪到的任務:負責人欄顯示橘色「未指派」標記(terracotta),醒目可見。
- 允許未指派直接建立專案(不強制填滿):真實情境=建專案當下可能還沒決定某任務由誰做,逼填=假資料。
- 建立前再提醒一次:「還有 N 個任務未指派,確定建立?」按確定即成功建立。
- 事後在專案頁補指派。
- 閉環:刪除通知(知後果)→第二階段橘標(看缺口)→可手動輸入(方便補)→建立前提醒(最後確認)→按確定建立→專案頁補。

配色走 :root 變數(橘標用 terracotta 系、缺的新增具名變數),禁寫死 hex。

### 8d.15 第二階段任務骨架編輯頁（2026-06-16 定案，mockup 審核過）

承接 §8d.9/8d.13/8d.14 兩階段 UI 第二階段。本節定案第二階段（編輯任務骨架頁）完整規格。B/C/D 已落地（見附錄），剩前置三層函式（prettyPredecessor/predToWbsFormat）+ 配色對齊。

**N.1 流程定位｜preview-then-commit**
- 第一階段填完 → applyTemplate 純函式算出 task 骨架（preview，**不落地**）→ 第二階段頁顯示供編輯 → **確認才 push/save**。applyTemplate/computeSchedule 純函式正好支援反覆算不落地（§2.4 計算層純資料紅利）。
- **即時重算**：改工期／前置／插入任務 → 重跑純函式 → 重繪日期。這是第二階段的引擎心臟。

**N.2 入口｜建立方式雙模式（乙-1 模式自動分岔）**
- 建立方式做成**卡片式雙選項**（取代乾巴下拉），各帶圖示＋標題＋說明＋適合情境：
  - **套用範本**：「套用完整 NPI 開發流程範本，自動帶出階段、時程、工作項目與部門負責人，快速建立完整開發案。下一步可逐筆檢視、調整任務骨架。」適合：完整產品開發案。
  - **空白專案**：「建立一個空專案，不套任何範本。進入後自行新增任務、記錄時程與工作內容。」適合：臨時小案、簡單記錄。
- 模式決定流程：套範本→主鈕「**下一步：檢視任務**」進第二階段；空白→主鈕「**建立**」直接進空專案（不走第二階段）。**不給「套了範本又跳過」的選項**——模式自己決定走不走。

**N.3 版面**
- 頂部「2」編號 ＋「編輯任務骨架」標題。
- 頂部說明區（? 圖示），三塊用淡分隔線區隔，順序＝日期→需交付→前置：
  - 日期（起訖）— 系統自動計算，不直接填；請以「前置任務 ＋ 工期」調整。
  - 需交付 — 此任務是否須繳交付件（如報告、樣品）。可逐筆勾或整階段全選。
  - 前置任務三種設定：
    - 接在《A》後 — 等 A 做完，隔天才開始。例：樣機組裝 接在《零件到料》後
    - 接在《A》後 ＋2天 — 等 A 做完，再多等 2 天才開始。例：塗裝 接在《組裝》後 ＋2天（等乾）
    - 無前置 — 不用等其他項目完成才能開始，從專案開始日就會排入。例：規格訂定
- **主案區塊（綠系）＋ 另案區塊（藍系）**，另案**預設展開**（同主案完整顯示，非摺疊）。多另案多區塊。
- 每區塊：標頭（案別膠囊＋案別名＋「點階段切換下方任務」小字＋專案總區間用完整年月日如 2026/03/02→2026/12/28）→ Gantt 階段軸 → 任務清單表。

**N.4 Gantt 階段軸**
- 每階段一列：階段名 ＋ 依起迄畫長短的橫條（主案綠系、另案藍系，假日底走變數）＋ 右側日期區間（短日期）。
- 階段依正常順序排不跳（標準範本＝設計→手工機→性試機→量試機→量產機）。並行階段（如 Safety）日期標「實際日期（並行）」。
- 點選階段 → 下方任務清單切換到該階段內容（選中列加框）。

**N.5 任務清單欄位（左→右）**
序(id鎖死自動重排唯讀) / 任務名(＋子群組標籤如備料／組立／試驗) / 負責人 / 前置任務 / 工期(可改輸入框) / 日期（起訖）(唯讀引擎算) / 需交付(布林勾＋階段標題列全選) / ✕刪除。列間 hover➕ 插入(序重排前置留空)。深綠／深藍表頭。拖曳把手。
- **負責人欄（今日新增）**：人名 datalist 可下拉(第一階段部門／人選項)可手打；配對不到→橘標「未指派」(terracotta)。理由：第一階段未設部門時整階段任務無負責人算不了部門負荷，於此補。位置在任務名之後、前置之前。
- **前置欄**：已設顯白話「接在《X》後／接在 N 項後」帶連接圖示(藍字可點改)；未設顯「無 ▾」(虛線框可點)，點開下拉選接在哪一項後 ＋ 延遲天數（§6.4 結構化下拉）。
- **需交付欄（今日定案）**：布林勾＝mustDeliver；階段標題列「全選」；位置在日期之後、✕ 之前。
- requiredTask 欄不顯示（§8d.13：目前全必要、無區分，schema 留 UI 暫不開）。

**N.6 無前置排程根（重要，釐清序≠時間）**
- **序＝顯示編號**(閱讀／引用用)，**前置＝排程接續關係**(引擎算日期用)，兩者獨立。**序不決定時間**。
- 標準範本 134 筆**僅 2 筆真無前置**(各案 n1「周邊／規格訂定」)，其餘 132 筆全有前置靠鏈順推。
- applyTemplate 排程前 seed：無前置任務 plannedStart＝該案開始日 → n1 拿到起算來源 → computeSchedule 從它順推整鏈傳播（§4 引擎 ④）。
- 故「**案別開始日必填**」本質＝保護每案唯一起點 n1 有起算來源；某案不填開始日→該案 n1 無起算→整案待排（圖二炸 warning 來源）。
- 無前置**不做「接上一筆」**(會破壞並行、串長龍時程爆)；維持引擎現狀(有起算來源順推／無則待排)。第二階段列間插入的新任務前置留空→落待排→手動補。

**N.7 未指派閉環 ＋ 底部**
- 配對不到負責人→橘標「未指派」可手打補；底部橘條「還有 N 個任務未指派負責人（可現在補，或建立後再補）」。
- 底部：**上一步**(退第一階段)｜**建立專案**(確認才 save)。建立前若有未指派再提醒一次（§8d.14）。

**N.8 落地分塊順序（greenfield，多 session）**
B preview 流程骨架(頁殼＋Gantt軸＋只讀清單) → C 可編輯欄(負責人／工期／需交付) → D 互動(前置 hover 目標列高亮陶土底＋插入＋刪除＋未指派閉環) → 前置三層函式(prettyPredecessor／predToWbsFormat) → 配色對齊。

**關聯既有**：補充 §8d.9／8d.13／8d.14；配色全走 :root 變數（綠系／藍系／陶土橘標，缺的新增具名變數）。第一階段必填／通知 A／B 見記憶待辦，第二階段做完後回頭做。

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

## 第八部分之五：變體／案別架構（variant，2026-06-14 已實作）

> 一個 J 系列專案同時承載「主案 + 多變體（2.2kW / 2.9~7.3kW 等案別）」的根本解。
> 落地 commit：`3df295f`（匯入器表頭名讀 + 案別欄解析）、`db4e499`（performWbsImport
> 接案別、id 制寫入 task）、`25d7fed`（階段進度卡按案別 variant 分塊顯示）。

### 8e.1 需求由來
變體階段常是主案子集、階段名重複，只能靠 kW／代號區分。原本 `stage` 欄被迫同時扛
「變體 + 階段」兩維度，出現「手工機(2.2)」這種縫合產物。正解：把 variant 拆成獨立
維度（id 制），`stage` 回歸純階段名。

### 8e.2 資料結構（id 制，平行 depts）
- `project.variants = [{ id, name }]`：案別清單，`U.id()` 自動發 id（與 `project.depts`
  同款 id 結構，name 可改不破壞關聯）。空陣列／無此欄 → 該專案無變體（通案單組）。
- `task.variant`：存 variant **id**（非名稱）。**空 = 通案 = `null`**。
- 與 §8b「身分／位置分離」一致：variant 靠 id 指認，name 只供顯示。

### 8e.3 匯入器接「案別」欄（向後相容）
- `parseWbsExcel`：改靠表頭名讀（見 §第七部分），讀「案別」欄 → `variantRaw`
  （app.js:7508/7521）。**案別欄不在必要欄檢查**：舊 Excel 無此欄 → 該批 variant 留空、
  不報錯（向後相容）。
- `performWbsImport`（app.js:7564-7597）：
  1. 從本批 rows 的 variant **去重**建清單：`[...new Set(rows.map(r => r.variant).filter(...))]`，
     `U.id()` 發 id 寫 `proj.variants`；空字串＝通案不建。
  2. 建「variant name → id」反查表（平行 depts 的 nameToId）。
  3. 逐列 `task.variant = variantNameToId[row.variant] || null`（查無／通案 → null）。

### 8e.4 階段複合鍵分塊（同名階段跨案別各自一桶）
- bucket key ＝ `階段名 + '\u0000' + (t.variant || '')`（app.js:6053-6075）。`\u0000` 當分隔符，
  同名階段在不同案別各自分到一桶、不會被合併。
- 還原：`key.split('\u0000')` → `name` ＋ `variantId`（`[1] || null`）。
- 排序：`minWbs` 升冪（主案 wbs 全小於另案 → variant 自然分組）；平手以階段名穩定
  （防 `Infinity - Infinity = NaN`）。

### 8e.5 階段進度卡渲染（按案別分塊）
- `proj.variants` 有值 → 按案別分塊（app.js:3345-3359）：每塊一個 cap 膠囊
  `stage-cap-pill cap-${i % 3}`（案別索引 mod 3 配色，cap-0/1/2 三色輪替）+ 該案別階段。
- 無 `variantId` 的階段（通案）→ 收尾單獨一塊，附在所有案別之後。
- `proj.variants` 空 → 維持**單組原樣**（其他專案不受影響，行為不變）。

### 8e.6 邊界與未竟
- status 過濾函式（app.js:1137）**本批預留不實作 variant**（傳了也忽略），非分塊路徑不吃 variant。
- **前置候選過濾尚未加 variant 維度**：§9 S5 階段過濾已預留疊加空間（未來多一個
  「variant 相同」AND 條件 → 同 variant + 同階段及之前）。
- **未做**：variant 編輯 UI、兩種版面（主案完整／變體精簡）的 mockup（屬後續，動工前先出設計）。

---

## 第八部分之六：四層權限架構（2026-06-19 定案）

### 8f.1 角色與權限

四層權限由高至低：SuperAdmin、Admin、Editor、Viewonly、Can't view（SuperAdmin 與 Admin 同為最高編輯權，差別在範圍）。

| 角色 | 成為方式 | 看 | 編輯內容 | 系統設定 | 範圍 |
|---|---|---|---|---|---|
| SuperAdmin | 後端 .gs 寫死開發者 email | 是 | 是 | 是 | 跨所有副本，永久後門 |
| Admin | 首登 + 首登密鑰，後端綁定 | 是 | 是 | 是 | 該套副本 |
| Editor | Admin 加入 editor 名單 | 是 | 是 | 否 | 該套副本 |
| Viewonly | Admin 加入 viewonly 名單 | 是 | 否 | 否 | 該套副本 |
| Can't view | 不在任何名單 | 否 | 否 | 否 | 無 |

### 8f.2 設計原則

所有副本皆為開發者複製同一份前後端 code（部署至 Cloudflare），後端 .gs 為同一份範本。SuperAdmin email 寫死於後端 .gs（私有，需進 Apps Script 編輯器才看得到），前端 code 與公開 repo 零個人資料、零密鑰、零 hash。SuperAdmin 後門隨範本自帶，新副本複製即生效，無需設定。

### 8f.3 後端 role 判斷順序（授權咽喉）

?action=role&email=... 依序判斷，先中先回：
1. email === SUPERADMIN_EMAIL（.gs 寫死）→ admin
2. 後端尚無 admin 且帶正確首登密鑰 → 記此 email 為該副本 admin（寫入 Script Properties）→ admin
3. email 在後端已記 admin → admin
4. email 在 editor 名單 → editor
5. email 在 viewonly 名單 → viewonly
6. 皆不符 → none

授權閘門在後端，前端僅消費 role。fetch 任何失敗（連不到、逾時、非 JSON）→ role = none → 往安全倒（擋光），絕不放行。

### 8f.4 前端四層分流（改現有 §2144 分支）

現況三層在 2144 行以 role !== 'admin' && role !== 'editor' 一律導向 enterViewOnly，viewonly 與 none 混為一談。四層需拆開：
- admin / editor → 編輯模式（現有 2151 分支不變）
- viewonly → 唯讀可看（現有 enterViewOnly）
- none → Can't view 擋頁（新增 enterBlockout）

### 8f.5 Can't view 擋頁（enterBlockout）

none 不走 enterViewOnly，改全屏擋頁覆蓋所有內容，顯示「您沒有檢視權限，請聯絡管理員」。目的為防止公司機密外洩，非名單內者不得看到任何專案內容或 URL 內資料。擋頁不留 PII。

### 8f.6 首登密鑰 + Landing Page（Admin 初始化，2026-06-19 修正）

新副本後端 admin 為空。登入頁（landing page）提供兩條路：

1. 「登入並成為管理員」：輸入 Gmail + 後台首登密鑰 → 後端驗證密鑰正確且該副本尚無 admin → 綁定此 email 為該副本 admin（一次性，綁定後此入口對他人失效）。
2. 「以檢視模式進入」：viewonly 按鈕，直接進入走四層判斷（不在名單則 Can't view 擋頁）。

僅通過第 1 條（Gmail + 正確首登密鑰）者成為 Admin。首登密鑰存於後端（Script Properties），非前端。SuperAdmin（後端 .gs 寫死 email）不受此流程影響，任何副本登入即最高權限。

此設計取代舊有「OAuth 未設定時 viewonly→settings 後門」（index.html:32 fallback）：首登流程本身即 admin 入口，無需該後門，且設定頁得以乾淨地整頁限 Admin（無死鎖、無初始化例外）。舊 fallback 連結於 landing page 改造時廢除。

### 8f.7 既有安全防線（沿用，不得破壞）

- 唯讀咽喉（app.js:205）：viewonly 一律不落地，鎖 body.viewonly。
- PII 最小化：viewonly 不留 email；upload 前剝除 cloudSyncToken / _loggedInEmail / _loggedInPicture / _role（app.js:254）。
- JWT 前端不驗簽（Google 已簽發），授權靠後端 role。

### 8f.8 施工分階段

階段一：四層判斷 + Can't view 擋頁。前端 2144 分支拆 viewonly / none + enterBlockout()；後端 .gs role 擴四種 + SuperAdmin 寫死 + 首登綁定 + 首登密鑰。名單暫由後端手動管。另含 Viewonly 可看不可改體驗（§8f.9）：視覺層隱藏寫入鈕、模板假資料帶入、設定頁限 Admin。

階段二：白名單管理頁面（僅 Admin 可見）。前端 admin 設定頁的 editor / viewonly 名單管理 UI；後端 doPost 新增 action: updateWhitelist（admin token 驗證後寫回 Script Properties）。

後端 .gs 為本主線重點，交由 Claude Code 在終端實作。

### 8f.9 Viewonly 可看不可改體驗（2026-06-19 定案）

將 Viewonly 從「按鈕全鎖」升級為「可進入查看、不可寫入」。目的：對 showcase 同事展示系統完整能力，但全程碰不到真資料。

核心哲學——雙層防禦：
- 視覺層：寫入按鈕（儲存／確定／建立／修改）在 viewonly 下隱藏或反灰，只保留取消／✕ 關閉。
- 咽喉層：Storage.save() / CloudSync.upload() 的 body.viewonly 守衛保留不動。視覺層萬一漏掉某鈕，資料仍寫不進去。此層為真安全，不得因體驗升級而移除。

各區域行為：
- Task modal：可點開看內容；修改／確定鈕隱藏，只剩取消／✕。
- 篩選欄位：完全可用（不寫資料）。
- 建立專案 modal：可點開查看；空白專案建立不成功。
- 專案模板第一階段：viewonly 進入時自動帶入標準模板（標準版 WBS）預設假資料（案名帶預設範例名、開始日帶今日），欄位反灰，可按「下一步」。
- 專案模板第二階段：可進入，點階段 Gantt 切換查看各階段標準模板任務骨架；所有欄位反灰、無建立鈕、只剩取消。
- 智慧排程鈕（總 Dashboard）：反灰 disabled。
- 設定頁：Editor / Viewonly / Can't view 完全看不到，整頁僅 Admin / SuperAdmin 可見（Editor 亦看不到，因設定頁含 Script／Token 等安全資料）。

實作分流：視覺層複用既有 body.viewonly 判斷（CSS + 條件 render 控制按鈕顯隱與反灰）。第一階段假資料來源＝標準模板現成內容，不另備 demo 資料。

---

## 第九部分：待施工清單（依風險與依賴排序）

每項獨立 commit，逐一核 diff → 線上驗證 → commit。

**✅ S5 手動表單前置 id 化（已完成，2026-06-15；S5c + commit1 + commit2）**
手動表單前置選擇器 id 化落地：input+datalist → `<select>`（value=task.id、label「序·名稱」、optgroup 按階段）。
- S5c：topoSort filter `wbs 非空` → `measureType !== 'hours'`（手動工期任務入排程拓撲；production + 測試副本同步）。
- S5a：predCandidates 帶 currentStage、放寬 `measureType !== 'hours'`、階段窗 `d = S - cIdx`（同階段只列自己之前、前 1-2 階段全收、≥3 或 <0 擋）、含 done、seq 同源 orderedProjectTasks。**階段序 SoT = `getProjectStages` 的 minWbs 順序（非 parseFloat(stage)——原 S5a 寫的 parseFloat 已校正為 minWbs）。**
- S5b：serializePredecessors 讀 select.value=id 吐 id#格式；_predRowHtml 回顯 by id、超範圍前置回顯保留；onTaskStageChange 改階段重建候選 + 清超範圍 + toast。
- 產品決策：前置篩選 ≤含本階段（同階段嚴格版：只列自己之前）；變體暫走主案假設。

**✅ 範本系統第一階段 UI（已完成，2026-06-16）**
- 範本多自訂名另案（ui.cases 驅動引擎 + 另案卡 UI）✅ `71f22a5`
- 案別名稱欄 UI（主案自動帶入專案名 + 統一空值 guard + 左色條）✅ `6acf5c3`
- 專案選色換亮版 8 色 + PROJ_COLORS 改走 :root 變數消 hex ✅ `2e00bdc`
- 甲-2 第二塊（另案卡）／第三塊（部門列 roleMap）已完成（接 §8d.11 待做收尾）。

**A 群：表單收尾（純 UI，低風險，可立即做）**
1. Tooltip 統一（類型/緊急/前置/HL 的 `?` hover）
2. ✅ 前置任務結構化下拉（§6.4，2026-06-15 完成，見上方 S5）

- 【新增 2026-06-16】第一階段建專案必填全盤化（案別名稱＋開始日＋至少一階段，主案另案一視同仁，label 標 *、空值 guard 擋）＋部門通知 A（刪部門告知 N 任務變未指派）＋通知 B（建立前再提醒）。詳見記憶與 §8d.14。第二階段做完後回頭做。

**B 群：動引擎/匯入器（高風險，要細核時段）**
3. 移除 category 連動 → 行事曆配色改讀 taskType
4. 逾期口徑統一 → 4 處改讀 `deadline || plannedEnd`
5. 匯入器補 deadline 欄（parseWbsExcel + performWbsImport，測試檔副本同步）
6. 預計完成自動算（接 addWorkdays）
7. **反推引擎（§4.8）**：新增 backward pass（依 deadline 倒推最晚開始）。核心函式改動、判斷風險最高、需家裡桌機 Node 跑回歸。UI 先留位子標「未開放」灰掉，引擎補完再點亮。列為 §4.9 自動觸發穩定後做。

- 【✅ 完成 2026-06-17~18】序改按日期排序全段（取代原藍圖待辦）：
  - 第一刀 `15ecfde`：待辦列改 `orderTasksByDispStart` 日期序（dispStart 升序、待排殿後）+ 待排獨立區
  - 二刀-A `9107bca`：篩選四維（階段／負責人／緊急／狀態）接線生效（applyTaskFilter + 套用/關面板/清除三路徑重繪）
  - 二刀-C `edc5d8c`：前置下拉候選註解對齊日期序（階段窗靠 minWbs stageIdx 不受影響、已驗證沒壞）
  - 二刀-B step1 `80fad1b`：列間➕＝自動接前置落位（見 §6.9）
  三消費端（render／前置下拉 `_seqOf`／列間➕ `_insertAfterId`）全改日期序，**陣列序不再是顯示序**；序號全量序 `_seqOf` 守內外一致（篩前後不變）。
  **未落地、待辦：**
  - 列間➕時段制邊際：按在時段制列→新任務拿 `hoursId#FS`→topoSort 排除→落待排。正常工期制待辦列踩不到，待雙視圖分流（§9 C 群）落地隨分流處理，**勿先補補丁**。
  - 列間➕自動帶前置缺使用者回饋：存後無提示「已接○○後」，可加 toast（UX，非 bug，獨立做）。
  - 待排區設計張力（無日期任務多時）。
- 【新增 2026-06-16】pdcaGroups 雲端防坑：在 localStorage 不在 CloudSync blob，跨機掉 PDCA 分組。比照 calendars（`b10c457`）做 download 防坑（`cloud.pdcaGroups || DATA.pdcaGroups`）＋ 寫回 localStorage。（下方「雲端待補」已記，此處併入 B 群追蹤。）

**C 群：雙視圖架構（大工程，多 session，先定分流再動）**
8. 新增「排入行事曆」欄位 + 分流邏輯
9. 視圖一（時間軸/時段制）呈現
10. 視圖二（進度/待辦/逾期清單）呈現
11. 部門負荷計算改用統一 H（工期×dailyHours 攤平到區間）
12. 緊急任務清單移植（專案頁=該專案、總儀表板=全部，可點看細節）—— 依賴視圖二定案

**D 群：架構整理（低優先，feature 穩定後）**
13. ✅ 前置依賴 id 化完整版（2026-06-13 完成，S1→S2b-3，7 commit，90 案全綠，見 §8b.7）。剩 S5 手動表單接線（見上方最高優先）。
14. 釘子聯算（§6.8）：釘住觸發 override / 下游級聯重排，依 §4.3/§4.4 錨點機制，與排程錨點一起做。
15. 全檔 emoji 統一換 Tabler icon（§6.8 已引入字體，階段二配 UI/設定頁重規劃）。
16. app.js 拆檔（~7000 行，no-build 約束，ES modules 或 ordered script）
17. 設定頁 v2（移除 J 系列遺留、側欄預設收合）
18. 部門 D-2c/D-2d、D-3
19. ✅ variant 變體／案別架構（id 制）核心已實作（2026-06-14，`3df295f`/`db4e499`/`25d7fed`，見 §8e）：資料結構（project.variants=[{id,name}]、task.variant 存 id）、匯入器接案別欄、階段複合鍵分塊、案別膠囊配色全到位。**剩**：前置候選過濾加 variant 維度（S5 已預留疊加空間）、variant 編輯 UI、兩種版面（主案完整／變體精簡）mockup。
20. **Excel 匯出**：把 J 系列/排程結果匯出成 Excel（JS + SheetJS，client 端產生）。待 variant 後做——匯出帶「案別」欄才乾淨，否則 stage 混「變體+階段」會匯出髒資料。
21. **Template 範本系統正推/逆推（§8d + §4.8 + §6.8）**：錨定已從 Task 層移除（§6.8 廢除），正解在 Template 層。正推 UI + 逆推引擎（backward pass，§4.8）待做；逆推引擎屬核心新增、判斷風險最高。

- 【新增 2026-06-16，現行重點】第二階段任務骨架編輯頁（greenfield，多 session）：完整規格見 §8d.15。落地分塊 N.8：B preview 流程骨架（頁殼＋Gantt 階段軸＋只讀清單）→ C 可編輯欄（負責人／工期／需交付）→ D 互動（前置 hover 目標列高亮＋插入＋刪除＋未指派閉環）→ 前置三層函式（prettyPredecessor／predToWbsFormat）→ 配色對齊。屬 §21 Template 系統下一階段（非低優先，現行主線）。 **✅ B 頁殼/Gantt 軸/只讀清單、C 可編輯（負責人/工期重排/需交付）、D 互動（刪除/插入/未指派閉環/前置 hover/前置可改）已落地（2026-06-18，見附錄）；剩前置三層函式 + 配色對齊。**
- 【新增 2026-06-16】建立方式雙模式入口（乙-1，§8d.15 N.2）：套範本走兩階段（主鈕「下一步：檢視任務」）／空白直接建（主鈕「建立」）；卡片式雙選項取代乾巴下拉。
- 【新增 2026-06-16】甘特 bar 配色對齊：`.bar-*` 8 class（app.js:5498）跟新 `--proj-c1~8` 不同步；舊專案 `proj.color` 在新 PROJ_COLORS 回 -1 退 bar-sage。處理時機＝甘特視圖正式施工時（屆時 bar 配色本就要重規劃）。舊專案配色靠重灌測試資料解決，不寫 hex→hex migration。

**雲端（已完成）：** doGet 公開唯讀已上線（2026-06-12）——訪客開網頁即見最新 J 系列資料。新部署繞過舊部署不生效問題；doGet 拔 token 鎖（純讀），doPost token 檢查保留（寫入維持鎖）。前端 config.js 換新 exec URL。教訓：Apps Script 編輯部署若不生效，直接建新部署最快（代價 URL 變、前端要跟著換）。

**雲端（待補）：** `pdcaGroups` 尚未進 CloudSync upload/download blob——它在 Storage(localStorage) 有存，但 upload payload 與 download 還原都沒帶，跨機不同步、download 不還原（在雲端機器間切換會掉 PDCA 分組）。低風險但會掉資料。比照 calendars（2026-06-14 已補）做法：upload 加 `pdcaGroups: DATA.pdcaGroups`、download 加 `DATA.pdcaGroups = cloud.pdcaGroups || DATA.pdcaGroups` 防坑 + 寫回 localStorage。另做，這次不碰。

---

## 第九部分之二：餘裕計算規格（2026-06-14 已實作，commit `d5104b6`）

**口徑（落地版）：** 餘裕 ＝ `sch.end − 今天`（工作日）。`sch.end` ＝ `getEffectiveSchedule(t).end`
（override > actual > scheduled > planned）。
- 正數 → `餘 N 天`、0 → `餘 0 天`、負數 → `超 N 天`、`done` 或無 `sch.end` → `—`。
- **工作日，非日曆天**：用 `D.workdaysBetween`（含頭含尾）；因含頭尾，公式取 **inclusive − 1**：
  - end ≥ 今天：`workdaysBetween(今天, sch.end) − 1`（end==今天得 0 → 餘 0 天）。
  - end < 今天：`workdaysBetween(sch.end, 今天) − 1`（逾期天數）。
  - 比較前今天正規化午夜（`setHours(0,0,0,0)`），避免 end==今天被誤判逾期。

**口徑變更（與原規格不同，顯式記）：** 原規格寫 `餘裕 = deadline − plannedEnd`（日曆天、需獨立
deadline 欄）。因 `task.deadline` 仍不存在（§6.6 未做），落地改用 **`sch.end − 今天`（工作日）**——
用既有有效結束日當基準，先讓欄位可用；待 deadline 欄補上再議是否切換基準。

**截止日欄同步：** 待辦列「截止日」(dlText) 逾期天數原本是日曆天（`-days`），一併改成工作日
（`workdaysBetween(sch.end, 今天) − 1`），與餘裕欄同一把尺 → **兩欄逾期數字一致**。

**工作日帶行事曆四層：** `workdaysBetween` 逐日呼叫 `isWorkday`（app.js:427-444），判斷順序＝
公司補班（override.workOverrides）> 公司額外公休（override.extraHolidays）> 國定假日（base.holidays）
> 週末規則（settings.workDays）。與排程引擎 `addWorkdays` 同一把尺。
（前提：`DATA.calendars` 已載入假日；未載入的環境退回只認週末，見 §第四部分之二.5。）

**關聯 §4.6：** §4.6 的「逾期判定布林」（`(deadline||plannedEnd) < today` 延遲徽章、散落 4 處待統一）
是另一機制，本次未動；此處只改餘裕欄與截止日欄的「天數顯示計量」。

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

## 第十二部分：甘特視圖設計（2026-06-16 定案，mockup 審核通過，實作待回家）

> 承接第二部分雙視圖（視圖二＝工期制 WBS 甘特）、第四部分排程引擎、第四部分之二工作日曆。

### 12.1 兩種甘特（同一套元件，傳入範圍 + 是否畫線旗標區分，不複製兩份）
- 總儀表板甘特：全專案(可多選)、無連接線(避免跨專案線爆量)、多專案多選下拉篩選。
- 專案頁甘特：單專案(task.project===pid)、有連接線(同階段)、階段+負責人篩選。
- 視圖狀態獨立:總儀表板 currentView、專案頁 projectView(不連動,見既有定案)。

### 12.2 Plan/Actual 雙條
- 計畫(Plan)=淺 sage #7FA08C 的 1.5px dashed 虛線外框,標 plannedStart→plannedEnd。
- 實際(Actual)=實心填色條疊框內,依狀態上色:進行中 navy #4A6B85 / 已完成 sage綠 #3B6B4A / 超期 terracotta #C4633E。
- 未開始=只畫虛線框、不畫實心(無 actualStart 就不畫實心層)。
- 進行中藍 vs 完成綠 刻意拉藍綠對比(兩綠相近分不出);完成=綠對齊號誌燈直覺與 DONE KPI 卡。
- 超期判定沿用 §4.6 逾期口徑。
- 全部顏色走 :root 變數,禁寫死 hex。
- 填色條(實際)文字一律白字(走 var(--ink-inverse)),確保彩色底上可讀。
- 未開始:只畫虛線框,框內不填色、不寫字(空框＝尚未動工)。
- 逾期:框維持 Plan 寬度(不延長 bar),框內變 terracotta、標逾期天數。

### 12.3 連接線(FS 依賴,僅專案頁)
畫法鐵則(四段折線,對齊 ClickUp/MS Project):
前置 bar 右端中央 → ①往右脫離一小段 → ②往下到後續 bar 中央高度 → ③往右一段明顯水平線 → ④箭頭水平戳入後續 bar 左端中央。
- 連線依據:依 task 真實 predecessor(id 制前置)畫,非渲染排序相鄰列——前後兩 bar 真有 FS 依賴才連。
- 關鍵:箭頭前必有看得見的水平段(③),箭頭收末端水平指入,不可黏在垂直轉角(否則像多一槓)。
- 起終點對齊 bar 垂直中央(非頂部);轉角 stroke-linejoin:round;clay #8B7355;1.5px。
- 同階段→畫線;跨階段→不畫線,改 bar 上 clay 膠囊 badge(ti-link + 跨階段前置數,如🔗2),hover 顯示前置清單(#編號/名稱/階段/FS),hover 浮窗釘板階段做。
- 同階段判定層級【定案 2026-06-18】:用大階段(比 task.stage 欄位),子群組不進判定。前置綁 task ID,「同階段」只決定畫實線或膠囊 badge,與子群組無關(子群組選項作廢)。
- fallback:若後續 bar 左端排在前置右端左側(lag/手動致重疊)連接線會卡,實作遇到再處理。

### 12.4 假日底色
- 六日+國定假日+公司休假日→該日整欄暖灰 #EFEAE2(垂直滿高貫穿所有列),日期數字轉灰。
- 來源=工作日曆(讀既有 DATA.calendars 兩層 base+override,同排程來源,單一真實來源):六日固定灰、國定假日灰、補班日不灰。
- 雙作用:好辨識非工作日 + 因 Task 只算工作天故 bar 壓到灰底=排程 bug 的視覺檢查。

### 12.5 篩選列
頂部一列:時間單位膠囊(年/月/週/日切刻度粗細) + 階段下拉 + 負責人下拉 + 專案多選下拉(總儀表板專屬,點開列全專案各帶勾選框) + 右側週導航(上週/今天/下週)。
時間單位四種年/月/週/日,預設週(顯示本週+1週)【定案 2026-06-18】。

### 12.6 時區單一日期來源(既有坑沿用)
今日線/工作天倒數/負荷本週/月報當月,三機+同事裝置日期不準會悄悄錯,釘死單一日期來源,不各自 new Date()。

### 12.7 待確認項(施工前補齊)
①同階段判定:大階段(比 task.stage,子群組不進判定)【定案 2026-06-18】 ②時間單位預設:週(本週+1週)【定案 2026-06-18】 ③總儀表板甘特 mockup 未畫(多專案篩選/無連接線/按專案分組)——先做專案頁甘特、總板後補,本條留 TODO。

### 12.8 :root 變數對照(落地用,code 階段照此補 style.css)

| §12 用途 | 規格 hex | :root 變數 | 處置 |
|---|---|---|---|
| 12.2 進行中(實際) | #4A6B85 | var(--navy) | 複用 |
| 12.2 逾期(實際) | #C4633E | var(--terracotta) | 複用 |
| 12.3 連接線 | #8B7355 | var(--clay) | 複用 |
| 12.2 計畫虛框 | #7FA08C | var(--gantt-plan) | 新增(值同 --sidebar-ink2,語意獨立不借) |
| 12.2 完成(實際) | #3B6B4A | var(--gantt-done) | 新增(不借 --sage-600 #3A6B4E,號誌燈綠) |
| 12.4 假日底色 | #EFEAE2 | var(--gantt-holiday) | 新增 |

---

## 附錄：完成的 commit

**2026-06-19（§8f.9 viewonly 可看不可改體驗，線上已驗 pass）：**
- `7b55e21` 設定頁限 Admin 三道防線（showPage 攔截 + renderSettings 守衛 + 側欄隱藏）
- `a10e4de` modal 寫入鈕 viewonly 隱藏（data-edit-hide 乙案，8 顆建立/儲存鈕）
- `20a38c9` 建立專案拆「建立」「下一步」兩鈕（解 data-edit-hide 與預覽切換衝突）
- `c21d7e8` viewonly 第一階段帶標準模板假資料 + 欄位 disabled
- `6a1c808` 第二階段 viewonly 反灰（render 後一次 disabled）
- `2530957` userMode 四處散寫收斂進 refreshUserBadge（單一真實來源）
- `b856cc3` viewonly 改「入口可開 modal + 內部擋寫入」策略（甲）+ deleteProject 補 _roGuard
- `6e0e9c6` saveProject _roGuard 下移，viewonly 可進第二階段預覽
- 基準 HEAD：`6e0e9c6`，§8f.9 viewonly 體驗前端全部線上驗收 pass

**2026-06-18（§12 甘特視圖主線，公司桌機+筆電 UI 直上 main）：**
- `ac938a3` docs：§12 甘特定案（雙態白字/空框/逾期變色 + 連線依真實前置大階段 + 四單位預設週 + 6 變數對照）
- `5c99868` §12 補 :root 三變數（--gantt-plan/done/holiday）
- `d492248` §12.4 假日底色（讀 D.isWorkday，週末併入假日）[線上已驗：假日欄暖灰、今日紅、補班不灰]
- `b048a93` §12.2 Plan/Actual 雙態條（plan 虛框+actual 填色、done/wip/逾期狀態色白字、未開始空框、逾期爆框標天數、里程碑菱形、收 inline 進 class）[線上已驗：未開始空框、逾期爆框+天數、膠囊收 class 沒掉色]
- `c6ebd0b` §12.3 甘特連接線骨架（SVG overlay + data-link-id 錨點，僅專案頁）
- `7fcf1d9` §12.4 甘特表頭顯示假日名稱（讀 base.holidays，連假往前歸名）
- `4f09453` §12.4 假日名加大加粗（8.5→10px/600/ink2）
- `2aa9b87` §12.3 Hunk2 跨階段前置 clay 膠囊 badge（_ganttPreds + ti-link 計數）
- `c7d8fc0` §12.3 badge 位置修正 + z-index 防遮蔽
- `42c896c` §12.3 badge 改用既有 initTooltip + 移回填色層（單一 tooltip 來源）
- `f796414` 甘特 bar tooltip 全面改走 initTooltip（data-tip="甘特狀態|..."）[線上已驗]
- `dbb3dd7` 甘特專案配色圖例改只在總儀表板顯示（專案頁隱藏）[線上已驗]
- 基準 HEAD：`dbb3dd7`（§12.3 Hunk3 同階段 SVG 折線尚未實作）

**2026-06-18（甘特續+第二階段主線）：**
- `4ffe59a` 甘特週導航改 ±7 天（上週/下週）[unverified]
- `fb72847` §12.5 甘特篩選列加階段/負責人下拉（buildGanttFilterHtml 重寫）[unverified]
- `e37a767` 第二階段工期可改+即時重排（抽共用 _reschedulePreview）[unverified]
- `41f13f3` 第二階段未指派閉環（底部橘條 + 建立前 confirm）[unverified]
- `7d8950c` 第二階段前置欄 hover 高亮被指向列（data-preds）[unverified]
- `641aaac` 第二階段前置可改下拉（同案序之前候選，存 id#FS 重排）[unverified]
- `7026129` 第二階段列間插入（＋鈕 splice 全 schema 新任務）[unverified]
- 基準 HEAD：`7026129`

**2026-06-17~18（序改日期排序主線，家裡桌機 Node 驗）：**
- `15ecfde`（06-17）第一刀：序改日期排序 + 待排區
- `9107bca`（06-17）二刀-A：篩選四維生效
- `edc5d8c`（06-17）二刀-C：前置下拉註解對齊
- `80fad1b`（06-18）二刀-B step1：列間➕自動接前置（app.js +4/-2、index.html `?v=20260618-1`）
- 基準 HEAD：`80fad1b`，引擎 schedule 99/0、workday 42/0
- 註：06-16 整批、Auth 三層（`7a27203`/`430a0f5`/`e1ec402`/`d2ae501`，[unverified] 線上待驗）、範本第二階段（`0d93dd0` 等）屬獨立主線，各自收尾時補附錄。

**2026-06-14（家裡桌機）：**
- `6351e92` 工作日曆兩層疊加 DATA.calendars 結構 + isWorkday 改讀（§之二.2）
- `8808e4a` 補 SS/FF/SF lag>0 測試（鎖前置引擎 lag 縮放）
- `70f8c97` 修正 FS 前置 lag +1 公式 bug（對齊 Excel WORKDAY，藏 90 測試後靠外部標準戳破）
- `7ffb15d` 修正 wbsDateStr 匯入日期 UTC 位移 -1天 bug（toISOString→D.fmt 本地）
- `a9499a4` 移除 Task 層錨定 UI 空殼（錨定歸 Template 層，§6.8 廢除）
- `b10c457` 工作日曆 DATA.calendars 持久化（localStorage + 雲端跨機）
- `3d61155` parseCalendarPaste 改彈性表頭對應 + 去特定公司字眼（§之二.9）
- `8a7d2dd` 工作日曆設定頁 UI（公休貼上匯入，§之二.9 五步閉環）
- 測試：排程 90 + 工作日 42 全綠；J 系列驗收 74 筆零不一致

**2026-06-13（家裡桌機）：**
- `6a89be4` 釘子改視覺 toggle badge + Tabler icon（§6.8）
- `416f970` 任務列中間插入 hover➕（§6.9）
- `cc7436a` 任務存檔自動觸發工期排程 + 表單顯示推算日（§4.9，A-1/A-2）
- `aca041c` 移除甘特一鍵套用排程按鈕（§4.7）
- （另：feat/pred-id-migration merge `d56d800` 後 revert `96bc2fd` 止血——id 化半套導致 J 系列前置全失效，完整版列 §9-D 第13項）
- 基準 HEAD：`aca041c`，引擎 90/90 PASS
- **待線上驗證（明天無痕視窗）：** ① A-1 新建有前置任務存檔→開始日自動算 ② A-2 表單顯示推算日 ③ 甘特圖無「⚡一鍵套用排程」 ④ 中間插入 hover➕ 對齊/能插/末尾不放 ⑤ 釘子圓底「已釘」badge

**2026-06-06（家裡桌機）：**
- `8f0544a` 移除分類/處理方式欄（UI 拿掉，category 資料層保留）
- `f70a2c0` 欄位改名排序加必填驗證
- `e40931c` HL 風險勾選 + 交付物 + 實際執行反向摺疊
- `5eaa1f9` docs：M2 任務表單設計文件

