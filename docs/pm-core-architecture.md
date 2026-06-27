# PM-Core 系統架構設計文件（主文件）

> 本文件是 PM-Core 的**單一架構真實來源**。整合所有定案設計 + 已完成進度，只保留最新正確版本。
> 施工前必讀；定案內容不憑記憶改動；新需求若與本文件衝突，以討論更新本文件為先。
> 最後更新：2026-06-22（家裡桌機，基準 HEAD `f731c18`）

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

### 開發節奏：有文件就一批做完再測（2026-06-19 定案）

有架構文件當基礎時，標準節奏是：討論 → 寫文件 → 拆項目 → **一次實作完一個完整階段** → **一次集中測試 debug**。不要「做一個測一個」。

「一測一」只在沒有文件、邊摸索邊做時才需要。痛點是反覆「本機測 → debug → push → 線上測」的時間成本太高，把一個完整功能拆成多次測會拖慢整體節奏。

例外：只有「跟核心相關、需分多次驗證」的才拆多次測（如排程引擎逐案審有價值）。純 UI／前端體驗類即使有多個小項，也應一批做完一次測。

反例：2026-06-19 權限 viewonly 前端體驗被拆太碎（設定頁限 admin → modal 鈕 → 拆鈕 → 假資料 → 第二階段 → badge，各自 commit 各自等線上驗），應一批做完一次驗。

配套：後端 .gs 那種「改錯會把自己鎖在外面」的高風險，才獨立 session、先完整規劃再下手。此節與「設計一次想完整、執行按風險拆步」（規劃方法論）相輔：設計階段一次想完整 → 執行階段一批做完 → 一次測。

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

- 手動任務錨點讀 `t.start`（修正「92 任務全錨定」bug）；J override 層已移除（問題3 步2），override 群本體 + synced/locked UI 留步3 清。
- 錨點跳過 scheduled 寫入（scheduled 是純機器層）。

### 4.5 getEffectiveSchedule 優先序

`actual > scheduled > planned`，並帶 `startSource`。
**用 `||` 不用 `??`**（空字串也要 fallback 到下層）。

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

**工期依賴排程內部再分三模式（依使用者手上有哪些時間約束）：** 見 §4.8。正推/反推/區間約束共用同一套工期引擎（topoSort、FS/SS/FF/SF 關係、工作日曆），非三套引擎、不重複——差別只在推算方向與必填輸入。

### 4.8 排程三模式（正推／反推／區間約束）（2026-06-23 重新定案）

> NPI 真實情境：業務常只給「最晚必須上市日」，不在乎中間過程——反推/區間約束才是 NPI 主場景，正推適合自主開發。三模式共用同一工期引擎（§4.7），差別在「手上有哪些時間約束」。輸入決定模式，不硬塞。

**三模式對應「使用者手上有哪些時間約束」：**

| 模式 | 必填約束 | 引擎算什麼 | 適合情境 |
|---|---|---|---|
| 正推 forward | 開始日 | 從開始往後推 → 各任務最早開始/結束、結果可販日 | 自主開發、有足夠時間（J 系列） |
| 反推 backward | 可販日 | 從可販日往前推 → 各任務最晚開始/完成、專案最晚啟動日 | 客戶/OEM 給死交期，開始日無所謂多早 |
| 區間約束 interval | 開始日 + 可販日兩者 | 區間內排 → 算餘裕（可用-所需）、夠不夠 | 兩頭都卡死：最快開案 A + 業務要可販 B，算剩多少緩衝 |

一案別一模式，但可從單約束模式「補第二約束」升級到區間約束（見 4.8.6）。三模式共用 topoSort/關係/日曆，零重複（最高原則）。

#### 4.8.1 模式選擇與必填欄位
- 每個案別（variant）選自己的排程方向 variant.schedule.direction（forward/backward/interval），一案別一模式；同專案不同案別可不同方向（主案逆推、另案正推）。帶白話引導（正推=有自主開發時間/反推=客戶要可販日/區間=兩約束都有）。
- 欄位跟著模式動（不同時顯示避免混淆）：正推顯「預計開始日」、反推顯「目標可販日」、區間顯兩者，對應必填、空值 guard 擋下。
- schema 對應（落地現況）：模式存 variant.schedule.direction、開始日存 variant.schedule.startDate、目標可販日即 variant.schedule.endDate（§4.8 的 targetEndDate＝既有 endDate，免新增欄位）。三者巢狀在 project.variants，隨整 project 序列化自動持久化（§15.5），無 top-level DATA.X 四步。
- 僅範本模式有三模式選擇；Excel 匯入（照檔內容建）、空白（無範本階段）維持原流程，不套三模式（見 4.8.6 建專案流程）。

#### 4.8.2 反推引擎（backward pass）
反推是正推鏡像、共用元件反向跑：

| | 正推 forward（現有） | 反推 backward（新增） |
|---|---|---|
| 跑序 | topoSort order 正序 | order 逆序 |
| 算 | 最早開始/結束 | 最晚開始/完成 |
| 終端起算 | 從開始日 | 從可販日（末端最晚完成=可販日） |
| 傳播 | 前置→後續 | 後續→前置 |
| 多重取捨 | 多前置取最晚 max | 多後續取最早 min（須早到讓最早後續能開始） |

**反向關係公式（鏡像 FS/SS/FF/SF）：**
- FS：前項最晚完成 = 後項最晚開始 − lag（addWorkdays 負值往前，下限對稱正推 max(1,lag)）
- SS：前項最晚開始 = 後項最晚開始 − lag
- FF：前項最晚完成 = 後項最晚完成 − lag
- SF：前項最晚開始 = 後項最晚完成 − lag
- 各任務最晚開始 = addWorkdays(最晚完成, -(dur-1))

**末端任務**（無後續）最晚完成 = 目標可販日。**源頭任務**（無前置）算出的最晚開始取最早 = 專案最晚啟動日。
**底層工具現成**：addWorkdays 負值往前推、正推 FF/SF 已用 addWorkdays(end,-(dur-1)) 反算 = 反推最小元件。反推 = 擴成全鏈 backward pass。
**錨點/circular/落地**：反推同樣尊重手填錨點（t.start 不覆蓋只警示）、topoSort 先擋 circular、結果寫 scheduledStart/End（不碰 plannedStart/start）。
**溢出判斷**：專案最晚啟動日 < today → 來不及（見 4.8.4）。

#### 4.8.3 區間約束模式（雙錨 plannedStart + deadline）

使用者同時有兩個約束：最快能開案日（A）+ 業務要求可販日（B），引擎判斷「A~B 區間內塞不塞得下整個開發鏈」。

**算法 = 反推 backward pass + 跟開始日 A 比對：**
1. 從可販日 B 跑 backward pass（4.8.2）→ 算出專案「最晚啟動日」L
2. 跟使用者填的「最快能開案日」A 比對：
   - L ≥ A（最晚啟動日比能開案日晚）→ **塞得下**，有緩衝。實際結束日落在某天（可能早於 B → 能提早可販）
   - L < A（要比能開案還早才行）→ **塞不下**，來不及 → 進溢出三層（4.8.4）

**區間約束 = 反推 + 開始日比對**，共用 backward pass，不是第三套引擎（零重複）。

#### 4.8.4 溢出三層報錯（餘裕 < 0 時的引導，呼應 §8d.6b）

當區間/反推算出「來不及」（最晚啟動日 < today，或區間 L < A），不只報錯，分三層由省力到費力引導 PM 修正：

**層1：建議最佳可販日（最省力）**
- 假設「今天就開工」（today = 起點）跑一次正推 → 算出「最快能在 X 日可販」
- 跳視窗：「依現有工時與前置，最快可販日為 X（比原定晚 Z 天）。是否採用？」
- 同意 → 可販日改 X、重算、收工

**層2：使用者自填延後日（按計算鈕才算，不自動傻跑）**
- 不同意層1 建議 → 讓使用者自填一個可接受的可販日
- **限制**：只能填晚於原可販日（填更早無意義，反推都說來不及了），空值/更早擋下提示
- 填完**按「計算」鈕**才重算（不自動觸發，防使用者亂改日期狂跑）
- 塞得下 → 用此日；塞不下 → 進層3

**層3：引導手動壓縮（由粗到細）**
- 層2 填的日期仍達不到 → 不再自動建議，引導改任務
- **先列「最值得改的」**：關鍵路徑上的長工期 + 複雜前置任務（撐爆時程的那條鏈），讓使用者優先改這幾個
- **這幾個都不想改** → 才列出全部各階段 Task，使用者自己一一看、一一改

**設計精神**：每層先給省力的路，不行才往下。給判斷依據（建議日/關鍵路徑），不把問題直接丟回使用者。

#### 4.8.5 餘裕計算

區間約束模式的核心產出（PM 最想知道的「還剩多少緩衝」）：
- **可用工作天** = A（開案日）到 B（可販日）之間的工作天數（跳假日，工作日曆）
- **所需工作天** = 整個開發鏈關鍵路徑的最短工作天數（backward pass 算出的最長依賴鏈）
- **餘裕 = 可用 − 所需**：
  - 餘裕 > 0 → 有 N 天緩衝，結束日可落在 B 之前
  - 餘裕 = 0 → 剛好卡死，零緩衝，任何延誤跳票
  - 餘裕 < 0 → 來不及，差 N 天 → 溢出三層（4.8.4）

餘裕是純正推/純反推給不了的資訊（單模式只給一個日期結果），唯有雙錨區間能算「可用 vs 所需」的差距。

#### 4.8.6 階段三補約束升級 + 懶人式建專案流程

**建專案三入口分流（範本走懶人式、Excel/blank 維持原流程）：**

| 建立方式 | 流程 | 為什麼 |
|---|---|---|
| 範本 | 懶人式兩頁（第一頁大局時間 → 第二頁細節） | 範本有階段結構，能先算時間落點、選三模式 |
| Excel 匯入 | 原流程（選檔→預覽→建） | 照 Excel 內容建，不該強迫重選模式/填日期，硬塞就不是匯入 |
| 空白 blank | 原流程（填基本→建） | 空的，無範本階段可預覽落點 |

**懶人式兩頁（範本專用）：**
- **第一頁（大局時間）**：專案名稱 + 選範本 + 選模式（正/反/區間，白話引導）+ 填對應日期 + 選階段 → 立刻顯示總時間區間 + 各階段預計落點。反推/區間在這頁就算出最晚啟動日/餘裕/來不來得及。
- **早期攔截**：第一頁就看到大方向可不可行——反推來不及 → 當場進溢出三層（4.8.4）調日期/換模式，不用先填完細節才後悔。
- **第二頁（細節，購物車式）**：在第一頁定好的時間框架下，任務清單填/改細節（工期/前置/擔當），即時反映回階段時間 → 建立。
- 精神：先看大局（來得及嗎）→ 再填細節（具體怎麼做），符合 PM 思考順序，貼合市面主流（先骨架後細化）。

**階段三補約束升級（單約束 → 區間約束，資料不丟）：**
- 第二頁排完發現結果違反預期時，切換不是「換成相反模式」（那會逼使用者丟資料想破頭），而是「補上第二個約束 → 升級區間約束」：
  - 原正推（有開始日）排完太晚 → 跳出「目標可販日」欄補上 → 開始日+可販日都有 → 升級區間約束
  - 原反推（有可販日）算出最晚開始太早來不及 → 跳出「開始日」欄補上 → 升級區間約束
- **「想改」這動作本身透露第二約束浮現**（正推喊太晚=心裡有 deadline；反推喊太早=心裡有最早能開始日）。系統順勢讓補上，不推翻。
- **資料全留**：任務（工期/前置/擔當/階段）+ 已填的那個日期都保留，只多填一個剛意識到的約束 → 重算（區間約束算餘裕/溢出）。
- UX 細節（補約束欄怎麼提示）後續設計，此節定邏輯。

#### 4.8.7 塊3 接線實作規格（_reschedulePreview 方向分流 + 餘裕燈號 + 溢出三層 UI）

> 本小節是塊3 的施工接線規格，不重述 §4.8.3~4.8.6 的算法意圖（區間=反推+開始日比對、溢出三層、餘裕=可用−所需、懶人式兩頁那些「為什麼」已在前述小節定案）。本節只講「在現有第二階段任務骨架編輯頁這張圖上，這些算法怎麼接、欄位怎麼映、狀態怎麼存」。
> 設計來源：2026-06-24 塊3 設計討論（接續塊2 反推引擎 0cc65fa）。

##### 4.8.7.1 現況勘查結論（能重用 vs 要新增）

第二階段這張圖（_renderStage2:5453）的日期顯示層是純衍生、零改即可重用：
- 專案頭尾（caseRange:5466）= 任務 plannedStart/plannedEnd 的 min/max。
- 階段起訖（_s2StageRanges:5790）= 每階段任務 plannedStart 最小 / plannedEnd 最大。
- 結論：排程方向只要讓任務 plannedStart/plannedEnd 變，這張圖自動跟著變，顯示層不動。

現成可重用元件（不重造）：
- computeScheduleBackward（塊2，app.js:1424）：反推/區間核心引擎，已寫已測（133 綠），尚未接 _reschedulePreview。
- D.workdaysBetween(start, end)（:476）：逐日 isWorkday 計數含頭尾，s>e 回 0 → 直接當「可用工作天」。
- _reschedulePreview（:2451）骨架：seed 開始日 → compute → 寫回 plannedStart/End → 6b 單層溢出偵測，現成。
- 結束日輸入框（stage1 case-end/pf-end:5067/5102）+ variant.schedule.endDate（:5271/5423）已 captured，interval 雙約束資料齊。
- direction 下拉現成（backward 目前 disabled，拔掉即可）。

塊3 要新增的四塊（以下逐塊規格）。

##### 4.8.7.2 _reschedulePreview 方向分流（判斷風險，核心改動）

現況 _reschedulePreview（:2464）寫死 computeSchedule（正推），backward 只警示 fallback 正推。改為依 variant.schedule.direction 三分流：
- 'forward'（只填開始日）→ computeSchedule（現有正推，不動）。
- 'backward'（只填結束日）→ computeScheduleBackward，末端 seed = variant.schedule.endDate（當 targetEnd）。
- 'interval'（開始+結束都填）→ computeScheduleBackward 算最晚日期鏈，再與開始日比對算餘裕（見 4.8.7.4）。

關鍵接線點（最大技術風險）：欄位名映射。
反推引擎吐 lateStart/lateFinish，但這張圖讀 plannedStart/plannedEnd。分流為 backward/interval 時，寫回前需轉一層：
  plannedStart = result.lateStart
  plannedEnd   = result.lateFinish
正推分支維持 plannedStart=suggestedStart / plannedEnd=suggestedEnd（不變）。

映射層要逐筆驗證（Node + Excel 反向 WORKDAY 外部標準，比照塊2）：反推鏈映回 plannedStart/End 後，這張圖的階段起訖 min/max 是否＝Excel 手算的最晚日期。此步是塊3 唯一要逐行審 + 測試先行的核心改動。

##### 4.8.7.3 排程方向輸入啟用

- 拔掉 stage1 direction 下拉的 backward disabled（:5070/5108），三模式可選。
- direction 預設仍 'forward'（不破壞現有只填開始日的行為）。
- interval 不需新 UI 欄位：開始日（case-start）+ 結束日（case-end）兩框都填 = 自動進 interval 分流（由 direction 或「兩框皆有值」判定，實作時擇一，記入規格）。

##### 4.8.7.4 餘裕計算 + 三級燈號

- 可用工作天 = D.workdaysBetween(開始日, 結束日)（現成，含頭尾）。
- 需要工作天 = 關鍵路徑（最長依賴鏈）工作天，從 backward pass 的最長鏈取。
  - 設計邊界（已定案）：系統假設前置允許即可並行，不做資源排程（人力/設備衝突）。並行任務若實際需排隊，應在範本以前置依賴表達，非由系統推測。
- 餘裕 = 可用 − 需要（單位：工作天，不含假日週末）。
- 三級燈號（分界已定案）：
  - 餘裕 > 5（含等於 5）→ 綠燈「時間充足，還有 N 個工作天緩衝」。
  - 餘裕 0~4（≥0 且 <5）→ 黃燈「時間偏緊，只剩 N 個工作天緩衝，任何延誤都可能時程延誤、緩衝期較少」。
  - 餘裕 < 0 → 紅燈「時間不足，照專案範本的工期排，比需求的最快完成日晚 N 個工作天」→ 觸發溢出三層（4.8.7.5）。
- 燈號顯示欄位（2026-06-25 定稿，待 _s2SlackHtml 接；現程式吐舊版「可用/需要/餘裕」，下為新白話定稿）：
  - s2-slack-dot：燈號圓點（綠／黃／紅）。
  - s2-slack-msg：三態文案（上方三級燈號那三句）。
  - s2-slack-period：需求專案週期完整起訖「開始日（週X）→ 結束日（週X）」（三態都顯示）。
  - s2-slack-nums：白話數字列「可排工作天 X／任務需要 Y／(綠)多出 Z·(黃)只多 Z·(紅)少了 Z」。可排＝available、任務需要＝needed、Z＝可排−需要。
  - s2-slack-fastest（紅燈額外，待接 earliestFinish）：實際最快完成日（週X）＋「晚 N 個工作天」，與需求結束日對照。
- 配色方案 B（走 :root、零寫死 hex；黃用 amber-accent 不開正黃）：
  - 綠 .s2-slack-green：底 var(--sage-50)／點 var(--sage-600)／字 var(--sage-700)。
  - 黃 .s2-slack-yellow：底 var(--amber-l)／點 var(--amber-accent)／字 var(--amber-ink)。
  - 紅 .s2-slack-red：底 var(--rose-l)／點 var(--rose)／字 var(--rose-ink)。
- 燈號 UI 掛點：這張圖頭部（caseRange 那行旁／上方），加餘裕顯示區塊。
- 頭尾星期幾：開始日、結束日顯示星期幾（一~日）；任務細節列不逐筆掛星期幾（避免擠）。

##### 4.8.7.4b 塊3a-刀1 施工規格：第一階段預覽頁 + 燈號說明卡（照 Mockup②③，引擎已備純接 UI）

> 本小節是塊3a 第一刀的施工接線規格。引擎（computeScheduleBackward 塊2、_computeSlack 塊3a 計算層 c22b9c5）已備，本刀純接 UI——把休眠的餘裕/燈號算法接上 Mockup②③ 的呈現。不重述 §4.8.7.4 的算法（餘裕＝可用−需要、三級燈號門檻已定案）。
> 設計來源：2026-06-26 塊3a-刀1 mockup-to-code。

**現況**：_stage1FormHtml（:5312）填完直接 _flowStage2Next（:5459）跳第二階段，中間無「大局時間預覽頁」。Mockup② 要在第一階段填完日期後、當頁顯示主案/另案各階段甘特落點 + 燈號，讓 PM 早期就看到大方向可不可行（呼應 §4.8.6 早期攔截）。

**A. 第一階段預覽（Mockup②）**
- 新增 `App._renderStage1Preview(userInput)`：複用 `_reschedulePreview` 算各案 plannedStart/End 落點、`_computeSlack` 算燈號，render 進 `#page-stage1` 下方預覽區（不另開頁，同頁下方展開）。
- 版面照 Mockup②：頂部「專案名 + 顏色點 + 範本選擇」並排；主案/另案左右兩欄（`.s1-case-col`，沿用 case-card 語意）；各欄含案名 / 開始日 / 結束日 / 排程方向。
- 排程方向欄改成跟著日期自動判定 `_effScheduleDir`（開始+結束＝interval／只結束＝backward／其餘＝forward，§4.8.7.2），不再是純下拉；保留手動覆寫逃生口。
- 底部「階段區間預覽」：每案一條 mini-gantt（複用 `s2-gantt` 樣式）+ 各階段日期右對齊 + 案別總區間燈號膠囊（`.slack-pill`，比照 cap-pill）。
- 燈號膠囊文案（對 _computeSlack 的 light + slack/overDays）：
  - 綠（light==='green'）：底 --sage-chip ／ 點 --sage-500，文案「可行·餘裕 N 天」（N＝slack）。
  - 黃（light==='yellow'）：底 --amber-l ／ 點 --amber，文案「偏緊·餘裕 N 天」（N＝slack）。
  - 紅（light==='red'）：底 --rose-l ／ 點 --rose，文案「不足·超出 N 工作天」（N＝overDays）。
- 「下一步：檢視任務」鈕進第二階段（現有 _flowStage2Next，不改流程）。

**B. 燈號說明（Mockup③，複用昨日 HintBox 共用組件，不另造）**
- 用 `App.buildHintBox({ key:'s1-slack-help', title:'餘裕燈號代表什麼', summary:'綠可行／黃偏緊／紅不足', icon:'ti-help', collapsed:true, bodyHtml: 三條燈號說明 })` 掛在第一階段預覽區燈號旁。
- 自帶兩段式 tooltip（收起態 hover 浮短提示「餘裕燈號代表什麼｜綠可行／黃偏緊／紅不足 — 點擊展開看完整說明」、點擊展開全文）、展開／收起持久化（Storage.save）——全部複用 buildHintBox，零新組件。
- bodyHtml 三條（照 Mockup③ + §4.8.7.4 定稿，各帶 `.slack-dot` 圓點走 :root sage／amber／rose）：
  - 綠「可行（餘裕 ＞5 工作天）：時間充足，遊刃有餘。」
  - 黃「偏緊（餘裕 0~4 工作天）：勉強做完，但無緩衝。」
  - 紅「不足：照範本工期排會超出結束日。」
- 不另造 _slackHelpCard ／ 不另寫 tooltip 引擎——違反單一真實來源。

**C. class／變數**
- 燈號：`s2-slack-dot` ／ `s2-slack-msg`（已存在 :6070，換新白話文案，不另造）。
- 甘特：複用 `s2-gantt`。
- 新增（走 :root，禁寫死 hex）：`.s1-preview` ／ `.s1-case-col` ／ `.slack-pill` ／ `.slack-dot`。

**D. 施工順序（鐵則：先 UI 後接資料）**
先 `_renderStage1Preview` 靜態版面（假資料）→ 接 `_reschedulePreview` ／ `_computeSlack` 真資料 → 燈號說明卡 → 本地測。
燈號說明用 buildHintBox（key=s1-slack-help），tooltip／持久化全繼承，不重做。
塊3a-刀1 不碰第二階段 ／ 溢出三層（屬刀2 + 塊3b）。

**UI 文案定稿（2026-06-26，Gemini 版，全繁體，使用者面＝上市日期）**

> 承 §8d.17.2 入口教育卡、§8d.17.3 第一階填寫頁。本段把 Mockup①②③ 的實際 UI 文案逐字定稿，供塊3a-刀1 後續接線照抄。

**文-A. 第一頁入口教育卡（Mockup①，凸顯防呆智慧）**
- 標題：如何選擇排程方式
- 頂部引導語：先看看您手上有哪些時間條件？決定等等要填什麼日期。
- 三種選填模式（純說明、非選項）：
  1. 有開工日，想知道做到幾號（填開始日）——已經確定哪天開工，系統會正向順推，算出最後一天能完工。
  2. 有交期，想知道最晚幾時要開工（填結束日）——輸入您的上市日期，系統會逆向倒推最晚開工日。超強防呆：若倒推後發現開工日「早已過去」，系統會聰明地改以今天開工重新順推，直接建議您最快何時能完工。
  3. 開始和結束日都有，想知道時間夠不夠（都填）——開工日和上市日期都定了，系統會雙向比對，精算出中間還剩多少天彈性（餘裕時間），最完整、最精準。
- 底部提示（ti-bulb）：免煩惱！下一頁不論您填哪一格，系統都會自動判斷最佳排程方向。如果手頭都有日期，建議全部填上，算出來的時間最精準。
- 按鈕：取消 ／ 我懂了，開始填寫 →

**文-B. 第二頁頂部灰色說明區（欄位上方，條列化）**
- 標題（ti-info-circle）：排程小秘訣
- ◆ 只填開始日 → 自動順推，算出預計完工日。
- ◆ 只填結束日 → 自動倒推最晚開工日（若發現來不及，會自動改為建議最快完工日）。
- ◆ 兩者皆填齊 → 精算時間夠不夠，產出中間的「餘裕天數」。
- 燈泡：若有多個產品規格（如 7.3kW ／ 2.2kW），點擊主案右側 ＋【新增另案】即可獨立排程。

**文-C. 第二頁輸入框下方「動態狀態提示區」（淺綠區塊，隨填法即時切換）**
- 情境A 只填開始日（正向排程中）：系統正從您的開工日往後順推，自動算出最後的預計完工日。
- 情境B 只填結束日·來得及（逆向倒推中）：已成功為您推算出最晚必須在 [系統算出的日期] 前開工，才趕得上上市。
- 情境C 只填結束日·來不及（最晚開工日已過去）：時空警報！上市日期太緊，最晚開工日已過。系統已自動切換防呆模式：改以「今天」開工為您順推，下方已為您呈現最快完工日期。
- 情境D 兩者都填（雙向精算中）：已幫您比對開工與上市日期，中間的彈性天數已呈現在下方的「餘裕燈號」中。

**文-D. 第二頁下方甘特燈號說明（Mockup③，HintBox key=s1-slack-help）**
- 標題：餘裕燈號代表什麼？
- 摘要：綠可行 ／ 黃偏緊 ／ 紅不足
- 展開內容（左側搭配 .slack-dot 色點走 :root sage ／ amber ／ rose）：
  - 綠 可行（餘裕 ＞5 工作天）：時間充裕，遊刃有餘！中間還有超過一週的緩衝，遇到突發狀況也不怕。
  - 黃 偏緊（餘裕 0~4 工作天）：勉強做完，但毫無緩衝。時程扣得很死，一旦中間有任務卡住就會延誤。
  - 紅 不足（照範本工期排會超出上市日期）：時程爆表！依照現有範本一定會超過上市日期，需要調整人力或壓縮工期。

**文-E. 用詞統一**：使用者面 UI 文案一律「上市日期」（取代死線 ／ 交期 ／ 可販日白話）；引擎 ／ 設計層術語「可販日 ／ targetEndDate ／ endDate」保留不動（對內術語，不影響使用者）。

**塊3a-刀1 第二步追加（規格待命，下一小步實作，本步未做）**

> 第二步本體（教育卡 ＋ 文案 ＋ ＋新增另案方框）落地後，預覽頁兩處體驗再升級。先寫規格，下一小步接 code。

**追加1. 開發階段膠囊 inline 可編輯（方案甲）**
- 區塊標題「開發階段」＋灰字備註：「順序由左到右，點膠囊可改名、最右 ＋ 新增、hover × 刪除」。
- 下方膠囊排互動：
  - 點膠囊 → 原地變 input 改名，失焦（blur）即存。
  - 最右一顆虛線「＋」膠囊：點擊新增一顆空膠囊，自動 focus 等填名。
  - hover 膠囊右上角浮出「×」刪除。
- 持久化：沿用現有 schema selectedStages ／ stageRenames，不新增欄位（改名只動顯示名，比照 §8d.5 stage id 對照）。
- 取代第二步的唯讀 .s1-stage-chip 顯示。

**追加2. 下方甘特區套案卡外框（一眼分辨案別）**
- 「階段區間預覽」每案甘特區外層套 .case-card 外框：主案 sage 左邊框（s2-case-main）、另案另色（s2-case-other），與上方案別輸入卡同視覺語言。
- 目的：多案並陳時一眼分辨哪條甘特屬哪案。

**追加3. 動態提示 loading（第三步實作，本步未做）**
- 膠囊改名／＋增／×刪 → 甘特重畫前 0.5 秒顯示「⚡ 階段已變更，正在重新計算時間落點與餘裕燈號...」loading 態（--ink3 淡色），算完淡出。

##### 4.8.7.5 溢出三層 UI 接線（紅燈，細化 §4.8.4）

> §4.8.4 已定「為什麼三層」。本節細化「這張圖上三層怎麼接、狀態怎麼存」，補 §4.8.4 未涵蓋的層三兩段式 + 儲存閘門 + 目標日預設 + 範本/專案儲存差異。

紅燈時逐層引導（一層解決不了才往下，非一次全攤）：

層一：最快可行完成日 + 一鍵改結束日。
- 顯示「照此工期最快 YYYY-MM-DD（星期X）完成，比設定晚 N 個工作天」。
- 按鈕「把結束日改成 YYYY-MM-DD」→ 採納 → 直接進最後階段（看各 Task 在各階段時程）→ 建立完成。

層二：手填日期重算。
- 使用者手填結束日 → 按「重新計算餘裕」。
- 餘裕 ≥ 0（OK）→ 進最後階段 → 完成。
- 餘裕 < 0（仍不行）→ 進層三。

層三：壓縮任務（卡頁調整，無「展開全部任務」分支——2026-06-25 修正定案）。
- 目標日：層三進來一定先有目標日，預設 = 層一最快完成日；若層二填過手填日，則多一個手填日可勾選，勾完顯示於上方。
- 列關鍵路徑上長工期任務（只列關鍵路徑——壓非關鍵路徑對總工期無效）優先讓使用者改，使用者改工期 → 按「儲存重算」。
- 不達標時：不彈「展開全部任務」（一次攤 67 筆是爛 UX，使用者最終否決此分支）。改為「比照第二階段、用階段切換、一次列一階段任務」讓使用者繼續改其他階段任務，按「儲存重算」反覆調，直到餘裕 ≥ 0 才能往下（卡在層三此頁，調到塞得下為止）。
- 改過並按「儲存重算」的任務反色標「已修改」（淺底＋工期框強調色＋日期欄「已修改」標記），讓使用者知道哪幾筆動過、值已留。未按儲存重算者維持範本原始工期。
- 達標（餘裕 ≥ 0）→ 完成建立，不再回最後階段看一次（避免看兩次相同內容）。

儲存閘門：層三的工期改動採「即時寫記憶體 preview 物件」（切階段不丟值，純記憶體不卡），「儲存重算」只負責把累積工期換算日期＋重畫 Gantt（§8d.18 資料模型）。故無「展開前檢查未存」的提醒——值在改的當下已進記憶體，切階段零遺失。

範本 vs 專案的儲存差異（已定案）：
- 建專案情境：層三改工期 → 存進該專案的任務工期（理所當然）。
- 範本試算情境（乙案）：層三改工期 → 只影響本次試算，不回寫範本。要正式改範本工期，回範本編輯頁（§8d.16）的任務表改。
  - 理由：範本試算定位是「檢查這套工期合不合理」，非「編輯範本」；避免單次專案的特殊調整污染範本母版。

##### 4.8.7.6 塊3 施工拆分與測試

- 塊3a：方向分流（4.8.7.2）+ direction 啟用（4.8.7.3）+ 餘裕燈號（4.8.7.4）+ 溢出層一/層二（4.8.7.5）。能用閉環。判斷風險、逐步審、Node + Excel 外部標準鎖期望值（驗 lateStart→plannedStart 映射、餘裕值）。
- 塊3b：溢出層三（卡頁切階段調到餘裕≥0 + 已修改反色 + 即時寫記憶體，4.8.7.5 後半）。有狀態流程，獨立做。
- 測試期望值一律外部 Excel 反向 WORKDAY，禁從 code 推（鐵則）。
- 引擎（computeScheduleBackward）塊2 已備，塊3 不改引擎、只改接線（_reschedulePreview）與 UI。

##### 4.8.7.7 Stage 2 New UI（編輯任務骨架）落地紀錄（2026-06-27，commit `13928f1` `[unverified]`）

> 承 §4.8.7.4b 第一階段預覽頁。本節記錄「套用範本」新流程第二段（編輯任務骨架）的全新 UI 落地實況——
> 取代第一階段「下一步：檢視任務」原本的 stub（`onclick="void 0"`）。**全新頁面 `_renderStage2New`，不接回舊 `_renderStage2`**
> （舊的保留為 dead render path、未清理）；建立仍複用舊 `_stage2Commit`（落地邏輯單一真實來源）。
> 設計來源：2026-06-27 一連串 mockup-to-code（暖調定稿，配色經多版對照後回歸 Stage 1 暖森林綠）。
> 版本：app.js `?v=20260627-9`、style.css `?v=20260627-8`。⚠ 本批 `[unverified]`，尚未線上驗證。

**流程接線**
- 第一階段預覽「下一步：檢視任務」→ `_flowStage1Next`：`_s1CollectInput` 蒐集 → `applyTemplate`（不落地）→ 存 `_tplPreview` → `_renderStage2New`。
- 「上一步」`_s2BackToStage1`：只切 `.active` 回 page-stage1、**不重繪**（保留第一階段輸入）。
- 「建立專案」`_s2CommitNew`：先還原全域 topbar，再走既有 `_stage2Commit`（讀 `_tplPreview` 落地，邏輯不變）。

**已完成（✅）**
1. 頁殼：滿版（`.s2n-wrap` max-width 1340）、麵包屑＋「2 編輯任務骨架」、底部 上一步／建立專案。多案各一張 `.s2n-case`（主案 sage 左框／子案 proj-c3）；案別膠囊文案「主案／子案」。
2. 頂部說明改 `buildHintBox`（可收折、hover 兩段式 tooltip、收合持久化）：「任務骨架編輯指南」＋每案「前置任務設定指南」（操作格式＋3 階段防呆＋範例），icon 分色、Title 列加底色區隔（scoped 不影響 Stage 1）。
3. 左部門面板 `_s2DeptPanelHtml`（加寬 300px）：列各部門→成員＋該案任務數、「未指派」紅標；標題右側內嵌「新增/編輯部門」鈕。**純顯示、不可點**。
4. 部門彈窗 `_s2OpenDeptModal`：複用 `buildDeptRowsHtml`＋`deptUI`(tpl 模式)；**預載範本角色**——依 `task.role` 抓出既有部門，user 只填負責人姓名（已存部門沿用成員、非角色自建部門保留）。「儲存並套用」`_s2ApplyDepts`：**不重跑 applyTemplate**，依 role 重映射 `task.dept`，並**負責人自動帶入**（凡未指派且屬該部門者帶第一位成員；手動已填不覆蓋＝手動 > 系統）。
5. `applyTemplate` 任務物件新增 `role` 欄位（存範本角色 `tk.role`，供上述 role→dept 重映射，免重跑即保留手改）；`_s2InsertRow` 新列同步帶 `role:''`。
6. 當前階段 Banner `_s2BannerHtml`：「當前階段：XX ＋ 階段 Deadline」；**固定專案綠**（不隨階段換色），切階段只更新文字（`_s2RefreshCase` 連動刷新 banner-wrap）。
7. 甘特 `_s2GanttHtml`：**綠黃紅燈號**（色點＋長條），**共用 `_s1ColorStagesForward`**，與 Stage 1 同一套「順推落點 vs 上市日期算 margin（≥5 綠／≥0 黃／<0 紅）」；點階段切換下方任務表＋Banner。
8. **階段順序鏈 `_chainStages`（共用）**：跳過中間階段時，下游段前置被剝離→順推會浮到專案最前面；依顯示順序逐段檢查，某段起點若早於前段結束就改接前段之後（保留工期跨度，idempotent）。Stage 1（`_s1ComputePreview`：interval/情境C 走 `_s1ColorStagesForward` 內含鏈；forward／倒推來得及走 `else` 補鏈）＋ Stage 2（`_s2GanttHtml` 同分流）**全模式套**。根治「只要刪階段甘特就浮位」。
9. 任務表 `_s2ListHtml`：滿版、無垂直格線、暖深綠（sage-700）圓角表頭白字、斑馬紋（偶數資料列 `.s2-rz`、避開階段/插入列）、輸入框平時透明、滑入該列才浮淡邊框＋白底、hover 整列左側 3px 高亮條。欄位：序／任務名／部門（唯讀，顯示 role）／負責人（下拉，本部門排前）／前置任務（三欄）／工期／日期（**只顯示月/日**，title 留完整含年）／需交付。
10. 前置任務拆**三個獨立 `<td>` 欄位**（根治組合框溢出壓字）：序號（`_s2PredSeqInput`，**可手動輸入＋datalist 建議**）／白話銜接型（`_s2PredTypeOptions`：完成後才開始=FS／同一天開始=SS／同一天完成=FF／開始才完成=SF，UI 全白話無縮寫）／緩衝。表頭「前置任務」`colspan=3` 跨欄置中、下排子欄標題（序號／銜接方式／緩衝）；其餘表頭 `rowspan=2` 垂直＋水平置中。寫回 `_s2SetPredCombo`：序→taskId 映射，存 `id#型別±lag`。多前置仍**唯讀**「接在 N 項後」（跨三欄 colspan=3）。
11. 3 階段防呆：datalist 建議只列「當前＋過去 3 階段內、序在前」；**手動可輸入更早項目**（防呆窗只當建議、不限制手打）；序須 < 本任務序（未來/自己一律擋並清空前置）。
12. 視覺：暖調統一（守 UI-CSS 規範暖森林綠盤）；字級等比例放大；Banner 奶油底＋左綠線。

**未做／取捨／後續（❌）**
1. 左部門面板**純顯示不可點**（不做點部門篩任務／批次指派）——v1 取捨。
2. **未指派數不即時更新**：表內改負責人後，左面板「未指派 N 件」與底部 bar 需整頁重繪才更新（與舊 Stage 2 行為一致）。
3. **「灰色=草稿」未做**（mockup 提過，未定義哪種任務算草稿）。
4. **5 色階段主題色聯動最終未採用**：多版對照後改回「Banner 固定專案綠＋甘特綠黃紅」（與 Stage 1 一致、守暖色盤、不開第二套色盤）。
5. 序號手動輸入：無效輸入（未來序/亂字）→ 清空前置（重繪後欄位變空）。
6. 多前置任務在此頁**唯讀**，不可編多前置（維持單前置組合框）。
7. backward「倒推來得及」模式也套了 `_chainStages`，但較少實測（interval/情境C/forward 已線上看過）。
8. **溢出三層紅燈 UI（§4.8.7.5）第一刀已落地（見 §4.8.7.8，2026-06-27）**：層一（採用建議上市日）／層二（手填重算）／層三（引導改工期）＋逐案接力＋建立軟提醒閘門已做；**未做**＝多案 Tab 切換版面（目前用堆疊逐案）、方案三鎖表＋關鍵路徑標記、彈窗改設計款（目前用原生 confirm）。
9. 舊 `_renderStage2`／`_stage2Commit` 仍在（dead render path，未清理）；`_s2SetPred`／`_s2PredOptions`／`_s2PredSeqOptions` 已被三欄組合框取代、成為 dead code。
10. **`[unverified]`**：2026-06-27 commit `13928f1` 標未驗證，待線上逐項驗（各排程方向×跳階段甘特順序、序號手打/下拉/綁更早、綁未來被擋、負責人自動帶入、前置三欄不壓字）。

**關鍵函式（app.js）**：`_flowStage1Next`／`_s2BackToStage1`／`_s2CommitNew`／`_s2DeptPanelHtml`／`_s2OpenDeptModal`／`_s2ApplyDepts`／`_renderStage2New`／`_s2BannerHtml`／`_chainStages`／`_s2GanttHtml`／`_s2ListHtml`／`_s2PredCells`／`_s2PredSeqInput`／`_s2PredTypeOptions`／`_s2SetPredCombo`／`_s2ParsePred`／`_s2RefreshCase`；既有複用：`_s1ColorStagesForward`／`applyTemplate`(+role)／`_stage2Commit`／`buildHintBox`／`buildDeptRowsHtml`/`deptUI`／`_s2OwnerOptions`／`_s2GroupByStage`／`_reschedulePreview`／`_s2SlackHtml`。**CSS**：`.s2n-*`（頁殼/部門面板/Banner/說明列）、`.s2-tbl` 系列（圓角表頭/斑馬/三欄前置 `.s2-pc-*`/`.col-pred*`）、`.s2-gdot*`（甘特燈號色點）。

##### 4.8.7.8 溢出三層紅燈引導 第一刀落地紀錄（2026-06-27，`[unverified]`）

> ⚠ **已被 §4.8.7.9 取代並退役（2026-06-27）**：本節描述的「嵌入 Stage 2、堆疊逐案、非 Tab」舊版溢出引導
> （`_s2OverflowGuideHtml`／`_s2AdoptFastest`／`_s2OverflowRecalc`／`_s2OverflowHandoff`＋`.s2-ovf*` CSS）
> 經使用者實測後否決（「不該一進來就攤 Stage 2 全表、版型對不上定案 mockup」），改為 §4.8.7.9 的**獨立聚焦分頁面板**。
> 本批已**移除**舊函式與接線（`_renderStage2New`／`_s2RefreshCase` 不再渲染 `_s2OverflowGuideHtml`）。本節保留為設計沿革。
> **仍保留共用**：`_s2VariantSlack`（餘裕單一真實來源，新面板續用）、`_s2CommitNew`／`_s2DoCommit`（建立路徑）、`_s2SlackHtml`（Stage 2 狀態條）。

> 承 §4.8.7.5 規格、§4.8.7.7 新 Stage 2。本刀把紅燈（餘裕<0）的層一/層二引導＋建立閘門接到新 Stage 2。
> **採堆疊逐案（非 Tab）**：每個 interval 紅燈案別在自己的 slack 框下渲染引導面板，多子案各自處理；
> 接力靠 toast＋捲動到下一個紅案（取代 mockup 的 Tab 切換，先求功能到位、整合既有堆疊版面、低風險）。
> 版本：app.js／style.css `?v=20260627-10`。⚠ `[unverified]`，待線上驗。

**已完成（✅）**
1. `_s2VariantSlack(variantId)`：抽出「該案餘裕」共用（interval 才算，否則 null）；燈號 HTML／引導／閘門同一真實來源。
2. `_s2OverflowGuideHtml(variantId)`：紅燈才渲染的引導面板（層一綠／層二琥珀／層三紅，escalation 左框色）。掛在 `.s2-overflow-wrap[data-variant]`，`_renderStage2New` 接在 slack 框下、`_s2RefreshCase` 連動刷新。
3. **層一** `_s2AdoptFastest`：採用 `_computeSlack.earliestFinish`（最快可行上市日）→ `confirm` → 改 `v.schedule.endDate` → `_reschedulePreview` 重排 → 重繪（轉綠/黃、引導面板自動消失）。
4. **層二** `_s2OverflowRecalc`：手填晚日期（須 > 原 endDate，否則 toast 擋）→ 改 endDate 重排重繪；仍紅則面板更新缺口、夠了轉綠。
5. **層三**：引導文字指向下方任務表（工期欄本就可改、即時重算）；鎖表＋關鍵路徑標記留第二刀。
6. **接力** `_s2OverflowHandoff`：某案解決後若仍有其他紅案 → toast「還有 N 個案別時程不足」＋捲動到下一個紅案；全解決 → 「可以建立」。
7. **建立軟提醒閘門**：`_s2CommitNew` 偵測任一紅燈案 → `confirm`「有 N 個案別時程不足，確定強制建立？」（軟提醒，不硬擋）。
8. CSS `.s2-ovf*`（全走 `:root`：rose/sage/amber escalation）。

**未做／後續（❌）**
1. **多案 Tab 切換版面**（mockup 模式 A）：目前用堆疊逐案＋接力捲動；Tab 是可選的呈現重構。
2. **層三鎖表＋關鍵路徑標記**：方案三未選時鎖住工期表（半透明遮罩）＋標記關鍵路徑長工期任務（需算最長依賴鏈）。
3. **彈窗改設計款**：層一採用／建立閘門目前用原生 `confirm`；mockup 設計的三款確認彈窗（circle-check／calendar／tool）＋「主案完成→引導子案」衔接彈窗待接 `openModal`。
4. `[unverified]`：待線上驗（紅燈案層一一鍵改上市日轉綠、層二手填重算、多子案接力、建立軟提醒）。

**關鍵函式**：`_s2VariantSlack`／`_s2OverflowGuideHtml`／`_s2AdoptFastest`／`_s2OverflowRecalc`／`_s2OverflowHandoff`；接線改 `_renderStage2New`／`_s2RefreshCase`／`_s2CommitNew`；複用 `_computeSlack`／`_reschedulePreview`／`_effScheduleDir`。

##### 4.8.7.9 智慧排程衝突處理面板（獨立聚焦頁，取代 §4.8.7.8 嵌入版；2026-06-27，`[unverified]`）

> 設計來源：2026-06-27 一連串 mockup-to-code 定案（使用者拍板）。取代 §4.8.7.8「嵌入 Stage 2、堆疊逐案」舊版。
> 版本：app.js／style.css `?v=20260627-16`。⚠ 全批 `[unverified]`，待線上逐項驗。

**核心流程（單一閉環）**
- 第一階段填寫頁「下一步：檢視任務」`_flowStage1Next`：`applyTemplate`（不落地）→ 偵測任一案別紅燈（`_s2VariantSlack.light==='red'`）：
  - **時間足夠** → 直接 `_renderStage2New`（編輯任務骨架頁，§4.8.7.7）。
  - **時間不足** → 彈**過渡中繼彈窗 ③**（`confirmModal`，ti-chart-bar）「偵測到時程衝突！已為您開啟智慧排程引導」→ 按「開始智慧排程」→ `_renderOverflowFlow`（聚焦面板）。
- 聚焦面板解決後 → **路由回 `_renderStage2New`**（任務細節/負責人在 Stage 2 處理，不在面板硬擋）→ Stage 2 footer 才走 `_s2CommitNew`／`_stage2Commit` 建立（單一建立路徑）。

**版面（`_renderOverflowFlow`／`_ovfRender`，渲染進 `#page-stage2`）**
1. **頂部分頁** `_ovfTabsInner`：每案一頁，紅燈標「● 尚缺 N 天」、已解決標「✓ 已足夠」；`_ovfSelectTab` 切案。
2. **案頭前後時程對照看板** `_ovfRangeBadge`：`原始 start→baseEnd ➔ 新時程 start→curEnd（順延 N 個工作天）`（陶土色膠囊）；進場 snapshot `_ovfState.baseEnd/baseTask` 當「變更前」基準。
3. **綠/紅 Banner**：紅＝排程不足；解決後 `_ovfCaseHtml` 轉綠成功 Banner（`.ovf-banner.ok`）。
4. **三層卡（階段一，未選層別且紅）**：層一 `_ovfLayer1Html`（採用系統建議上市日 `earliestFinish`）／層二 `_ovfLayer2CardHtml`／層三 `_ovfLayer3CardHtml`＋鎖表 `_ovfLockedTableHtml`。**選了層別就原地留存**（即使編到綠燈也不塌回小卡，避免跳走錯覺）。
5. **層二展開（sel='2'）** `_ovfLayer2Panel`：日期框＋`_ovfRecalc`（重新計算餘裕，可見的 `.ovf-l2-recalc-btn`）＋**Top 3 長工時快選** `_ovfTop3Html`（`-N天` 膠囊 `_ovfTrim`／手動 `_ovfSetDur`，即時扣工期重排）＋**層二 mini 戰報** `_ovfMiniBattleHtml`（已縮短 N／還差 M，足夠轉綠）。
6. **層三（sel='3'）**：Segmented Control 切換卡 `_ovfSegmentedHtml`（層三選中、可切回層一/二）＋**即時戰報** `_ovfBattleHtml`（當前階段／整體工期／目標對齊三列，前後對比＋達標整欄轉綠 ✓）＋**時程異動表** `_ovfStage3TableHtml`（序/任務/標記/工期/原→新日期，改過列反色＋工期框高亮 `_ovfSetDur`）。

**達標路由與回饋（重點修正）**
- **方案一** `_ovfAdoptFastest`：`confirmModal`（circle-check）確認 → 改 endDate 重排 → `_ovfAfterResolve`：**全案達標→`_renderStage2New`**；仍有紅案→自動切下一紅案接力（toast）。
- **方案二** `_ovfRecalc`／`_ovfReeval`：重算後一律彈**中央白底結果窗** `_ovfResultModal`（取代右下角灰 toast）——足夠→主鈕「**確認並前往調整任務細節**」→`_ovfAfterResolve`（路由 Stage 2，**不在此建立、不觸發原生「未指派負責人」confirm**）；不足→單按鈕資訊窗（`cancelText:null`）。
- **底部主鈕**「前往調整任務細節 →」`_ovfGotoStage2`：紅案→設計款軟提醒（不硬擋）；全綠→直接前往。**上一步** `_ovfBack`：在層別內先退回三層選擇（保留本案編輯），已在三層選擇頁才回 Stage 1。

**彈窗設計系統（履行「禁原生 confirm」鐵則）**
- 增強既有共用 `App.confirmModal`（§6.5，渲染 `#confirmOverlay` 疊在 #modal 上）：選用 `icon`／`iconBg`／`iconColor`（圖示圓）＋`okClass`（危險鈕）＋`cancelText:null`（單按鈕）。**向後相容**既有負工期彈窗 2 個呼叫端。
- 溢出全部確認（③過渡／方案一/二／建立軟提醒）走 `confirmModal`；已**移除**面板內所有 `confirm()`／驗證 toast。

**Stage 1 排程預覽 backward 修正（同批，§4.8.7.4b 連帶）**
- `_chainStagesBackward(stages, deadline)`：backward 跳階段時各段 lateFinish 全錨 deadline → 甘特塌成一團、順序錯亂（坑6 backward 版）。新增「末段對齊 deadline、各段依序往前、保留工期跨度」反向順序鏈；`_s1ComputePreview` backward 分支先串接、再回算真最晚開工日，真來不及才走情境C（紅＋報最快完工）。
- **Stage 1 整體膠囊與甘特同源**：`_s1ComputePreview` 的 light/slack/overDays 改用「串接後各段最末落點 vs 上市日」算（interval／backward 皆套），修「膠囊綠但甘特紅」矛盾（跳階段時 `_computeSlack` 低估 needed 誤判餘裕為正）。
- **`_s2VariantSlack` 補 backward**：原只算 interval（backward 回 null → 溢出面板誤判已足夠、無選項）；補「順推自今日＋串接取最末完工（複用 `_s1ColorStagesForward`，`desc==stage` key 對得上）vs 上市日」→ 正確判紅、給 `earliestFinish`/`overDays`。

**已知近似（待後續精修）**
1. **「關鍵路徑·長工時」標記**＝工期門檻近似（前 1/3 或 ≥15 天），真關鍵路徑（最長依賴鏈）待做。
2. **Top 3 膠囊級距**（-N天）＝工期比例（≈15%／25%）算，非寫死 -3/-5。
3. **`_s2VariantSlack` backward** 每次呼叫跑一次 `computeSchedule`（互動層級無感，案數極多時略重）。

**未做／後續（❌）**
1. 退役舊 §4.8.7.8 `_s2Overflow*` **已隨本批移除**；Stage 2 內若紅案（被軟提醒「仍要前往」帶入、或在 Stage 2 改工期變紅）目前只剩狀態條顯紅＋可在 Stage 2 任務表直接改工期，**無嵌入引導**（設計上溢出引導集中在聚焦面板）。如要「Stage 2 紅案導回聚焦面板」是後續可選增強。
2. 真關鍵路徑標記、層三鎖表（半透明遮罩）。
3. `[unverified]`：待線上逐項驗（子案 backward 有選項、方案一二達標進 Stage 2 不跳原生框、對照看板、無灰 toast、Stage1 膠囊與甘特一致）。

**關鍵函式**：`_renderOverflowFlow`／`_ovfRender`／`_ovfRefresh`／`_ovfTabsInner`／`_ovfSelectTab`／`_ovfPickLayer`／`_ovfCaseHtml`／`_ovfRangeBadge`／`_ovfLayer1Html`／`_ovfLayer2CardHtml`／`_ovfLayer2Panel`／`_ovfTop3Html`／`_ovfMiniBattleHtml`／`_ovfLayer3CardHtml`／`_ovfLockedTableHtml`／`_ovfSegmentedHtml`／`_ovfBattleHtml`／`_ovfStage3TableHtml`／`_ovfAdoptFastest`／`_ovfRecalc`／`_ovfReeval`／`_ovfResultModal`／`_ovfTrim`／`_ovfSetDur`／`_ovfAfterResolve`／`_ovfGotoStage2`／`_ovfBack`；引擎/共用：`_chainStagesBackward`／`_s1ColorStagesForward`／`_s2VariantSlack`(+backward)／`_reschedulePreview`／`confirmModal`(+icon)；接線：`_flowStage1Next`(③)／`_renderStage2New`(移除舊溢出)／`_s2RefreshCase`(移除舊溢出)。**CSS**：`.ovf-*`（分頁/三層卡/Top3/mini戰報/segmented/戰報/時程異動表/對照看板，全走 `:root`）。

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

### 4.11 時段制週時程表呈現層待辦（2026-06-23 記，未施工）

> 計算層 `generateSchedule`（§4.10）已讀工時設定排時段；但呈現層 `buildWeekScheduleHtml`（app.js:2690，總儀表板週時程表）畫格與計算層脫鉤、不讀工作日曆。三個待辦依序施工：先修脫鉤地基 → 接日曆 → mockup 美化。

**現況查證（2026-06-23，app.js）：**
- 時段格（小時列）寫死 `hours = [8,9,10,11,12,13,14,15,16,17]`（app.js:2707），08:00~17:30 固定，**不讀** `workStart1/workEnd1/workStart2/workEnd2`。午休寫死只擋 `hr===12` 一格（app.js:2808），13:00 仍當正常工作格畫。
- 計算層 `generateSchedule`（app.js:1543）**有讀** `workStart1~workEnd2 + goldenTime`。→ 計算用設定工時、畫格用寫死範圍，兩者脫鉤。
- 設定頁工時範圍存 `DATA.settings.workStart1/workEnd1/workStart2/workEnd2`（預設 09:00-12:00 / 14:00-18:00，app.js:83-86；UI 8107-8127「上午時段/下午時段」）。脫鉤具體錯位：設定上午 09:00 起但表格 08:00 起（多一格）、設定下午到 18:00 但表格到 17:30（少畫）、設定午休 12:00~14:00 但表格只擋 12:00 一格、13:00 照畫成工作格。
- 日欄寫死週一~週五（`wd=['一'..'五']` app.js:2694；表頭/格各一處 `for i<5` app.js:2698/2817），全函式零 `isWorkday`/`DATA.calendars` 呼叫 → 國定假日/補班/週末規則完全不反映（對比餘裕欄 §9-2、引擎 addWorkdays 皆吃四層日曆）。

**待辦（依序施工）：**
1. **時段格跟設定動（修脫鉤地基）**：`hours` 改從 `workStart1~workEnd2` 推算（生哪幾格、從幾點到幾點跟設定走）；午休從 `workEnd1~workStart2` 算區間（取代寫死只擋 12:00 一格）。對齊計算層同一份工時設定，單一真實來源。
2. **假日反映（接四層工作日曆）**：日欄/格接 `isWorkday`（§之二.5 四層判定：補班 > 額外公休 > 國定假日 > 週末規則），假日格反色 + 不可排會議/任務。讀同一份 `DATA.calendars`（與排程引擎、餘裕欄同來源，單一真實來源）。
3. **UI 配色對齊專案頁新標準（mockup 審後做）**：對齊 §16 陶土橘三層 `:root` 變數（--nav-active/--ink-btn/--danger）配色語言。需先出 mockup 審核才動 CSS。

**施工序**：1 修脫鉤地基 → 2 接日曆 → 3 mockup 美化。1/2 屬呈現層 bug 修正（與 §4.10 計算層對齊），3 屬 UI 美化。

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

### 6.5 Task 雙向修改（2026-06-25 定稿）

**原則：開始日／工期／完成日三者皆可自由改，系統照規則連動、不鎖不攔（資料矛盾只提示不擋死）。**

連動規則（開始為錨、工期為橋）：
| 改哪個 | 自己這筆算什麼 | 上游 | 下游 |
|---|---|---|---|
| 開始日 | 算完成日 `end = addWorkdays(start, dur-1)` | 不動 | 連動重排 |
| 工期 | 算完成日（開始日當錨） | 不動 | 連動重排 |
| 完成日 | 回算工期 `dur = workdaysBetween(start, end)`（開始日當錨、不反推開始日） | 不動 | 連動重排 |

- **開始日當錨**：改完成日只回算工期，不反推開始日。
- **三者皆可改**：含第一筆 Task 的專案開始日（反映「無法準時開案」的現實）。
- **下游一律連動**：三種改動都觸發 `applySchedule(DATA.tasks, 'full')` 整鏈傳播 + 手填錨點保護（anchor:manual 跳過不覆蓋只警示，§4.3）+ toast 告知「已重排 N 個下游任務」。
- **自動態開始日**：開始日為自動態（start=''，由排程推算）時，用 `getEffectiveSchedule(t)` 的有效開始日當錨來算，自動態也能雙向，不逼切手動。
- **資料矛盾（完成日 < 開始日 = 負工期）**：提示「這樣是負工期，要不要調開始日？」，給資訊不擋死。

**核心設計哲學（重要，避免重蹈錨定按鈕覆轍）：**
「系統內部錨定計算點」≠「使用者能不能改」是兩件事。錨定是系統內部怎麼算（計算基準），使用者改欄位是給系統新輸入；使用者改了→系統拿新值照同一套錨定邏輯重算，不衝突。鎖任何欄位都是錯方向。此誤解源頭＝最早 UI 的「錨定按鈕📌」（§6.8 已廢除 a9499a4），那按鈕預設「任務要釘住才不被連動改」的錯前提，污染 UI+核心。未來碰任何「錨定/鎖定/連動」設計先警惕，不要再做出「鎖住才不連動」的東西。

系統忠實連動、不替使用者做主：時程被壓縮是如實結果，使用者要鬆綁就回去給某些任務合理工期，系統不攔。若四條連動讓排程引擎卡 bug＝當初核心沒達最終需求，修核心、不加限制。

**施工順序**：UI 接三欄連動 → Node/Python + Excel WORKDAY 鎖期望值（測試先行）→ 驗下游 applySchedule 承接。判斷風險、逐步審。
**Deadline 拆欄獨立另一批**（現況「預計完成 / Deadline」併在 tf-end 單欄、t.deadline 不存在，見 §6.6）。

### 6.5b HintBox 區塊級說明框公版（2026-06-25 已上線 76a9216/2f85353/dde6462）

全站說明區唯一公版，取代散落的寫死 formula / title / ? 提示（不重複原則）。

**元件**：`App.buildHintBox({key, icon, title, summary, bodyHtml})` + `App.toggleHintBox(key)`。

**行為三態**：
- 預設展開（首次，DATA.settings.hintBoxState[key] 為 undefined/false 時展開）。
- 點標題列收起/展開，寫 hintBoxState[key] + Storage.save，局部換 class 不整頁重繪。
- 收起態 hover 浮出短提示「標題｜summary — 點擊展開看完整說明」（複用既有 data-tip 引擎 app.js:10066，不另造；不塞 bodyHtml 全文避免一坨）。
- 觸控降級點擊。

**持久化**：收合狀態存 `DATA.settings.hintBoxState`（單一真實來源在 DEFAULT_SETTINGS，load/download 的 {...DEFAULT, ...blob} spread 自動兜底，不需 load/download 各補 ||{}＝重複碼）。

**CSS**：`.hintbox` 全走 :root；`.ht-rule` 直向佈局（標題獨立一行、說明 span 佔滿整寬）+ 中文換行優化（text-wrap:pretty + word-break:keep-all + overflow-wrap:break-word）；四規則色塊 ht-start(sage)/ht-dur(amber)/ht-end(slate)/ht-down(rose)，成對 -l 底 / -ink 字。

**hover 兩套分工**：HintBox 收起態 hover = 短提示（有展開區可細讀）；KPI 卡 / 欄位 ? 的 data-tip = 完整內容不動（無展開區、hover 是唯一出口）。同一個 data-tip 引擎、兩種餵法。

**已套用者**：①Task 時間說明（key:'task-time'，工期欄下方）②階段進度卡（key:'stage-progress'，ti-stairs）③部門負荷卡（key:'dept-load'，ti-users-group）。
**待續**：其餘散落說明（KPI data-tip 等）逐區塊收斂為第二階段，已套三處驗過後再評估。

### 6.5c t.end 衍生化重構 spec（2026-06-25 定，【已落地 2026-06-25】五塊全完成）

**為什麼重構**：今日施工 §6.5 四塊後發現根本矛盾——改預計完成（t.end）改不動。根因：getEffectiveSchedule 顯示優先序 `dispEnd = actualEnd || scheduledEnd || plannedEnd || t.end || ''`，引擎算的 scheduledEnd 優先序高於手填 t.end，使用者改的值存進 t.end 卻被 scheduledEnd 遮住看不到。本質＝把「預計完成」當成獨立資料層欄位（t.end），跟引擎算的 scheduledEnd 兩個來源打架。補丁式修法（甲：補破口）治標不治本、會補丁疊補丁，違反單一真實來源鐵則。

**重構正解（使用者拍板）**：預計完成對排程態任務 = 開始日 + 工期的衍生顯示值，不獨立儲存。
- 不存獨立 t.end、不跟 scheduledEnd 比優先序。
- 使用者改預計完成 = 改工期（開始日當錨，workdaysBetween 換算成工期存）。
- 顯示永遠 `addWorkdays(開始日, 工期-1)` 現算。
- 單一真實來源 = 開始日 + 工期，永遠一致、不打架。
- 使用者體驗不變：仍直接改完成日欄、照樣能改；只是系統內部存工期、不存 t.end。
- 預計完成永遠當下算、不存系統、無資料可丟（除非開始日/工期本身掛）。

**關鍵分辨（重構勿砍錯）**：
- 預計完成 = 衍生值。砍掉 t.end 獨立儲存、改現算。不會要加回（它無獨立資訊量，永遠=開始日+工期，加回=製造重複/打架）。
- 實際完成 = 事實，必須留資料層。算不出（現實不照工作日曆，加班/拖延/提早）、是排程輸入錨。實際>預計往下排（getEffectiveSchedule actual 優先）是現有正確邏輯，重構不碰。
- 負工期 = 工期<0 這筆資料（存工期欄）。引擎算 scheduledEnd 早於開始日，忠實反映 + 列表標紅警示。透過工期表達，不需獨立 t.end。

**§6.5 四塊重做計畫（從乾淨 HEAD 43eb132 重做，整合 t.end 衍生化）**：
1. 三欄連動（recalcTaskTimeFields + 三欄 onchange）：改開始/工期→算完成日顯示；改完成日→換算工期存（核心：存工期不存 t.end）。錨點讀 tf-start.value（=getEffectiveSchedule(t).start，buildTaskFormHtml 已填，不繞查 task）。寫回顯示用 D.fmt(...,'iso') 避 Bug2 時區。
2. 下游告知：save 時 applySchedule snapshot 比對、toast「已重排N個」只數真正變動排除自己。⚠ toast 篩選：砍「已重排N個」（實測94個太吵無意義）、留「N筆無法排程」失敗警示 + 「已儲存」。
3. 負工期彈窗：兩觸發（手填負工期、預計完成<開始）→存檔自訂彈窗（⚠ 不用原生 confirm，醜；做設計感 modal，配色圓角走 :root）「工期為負數，確認要這樣修改嗎？系統照您輸入儲存」按確認才存、取消留表單，不用 toast。判定 (end<start)||(dur≤0) 涵蓋 auto/manual。milestone 工期恆1不誤觸發。
4. 列表標示：buildTaskRowHtml 偵測 negDur → 整列淡紅底（--rose-l）+ 行首紅三角（--rose）+ 區間欄標紅（--rose-ink，用專屬 class task-range 避與第10欄 task-deadline 共用）+ hover data-tip「負工期|工期為負數，請確認是否調整」。CSS 走 :root rose 家族。t.end 衍生化後塊二入口A（end<start）才真正活（重構前是半活、只 durationDays≤0 入口在作用）。

**今日勘查成果（重用，回家不必重撈）**：
- 三欄 HTML app.js:4783-4802（tf-start 雙態、tf-end 與 Deadline 併欄、tf-duration）；saveNewTask 寫 4948-4954、saveTask 寫 5123-5129。
- addWorkdays:502-513、workdaysBetween:484-496（s>e 回0，負工期靠 save 端比日期）現成可用。
- isWorkday:463-480（補班>放假>workDays，base.holidays 空靠匯入）。
- getEffectiveSchedule:1897-1912（actual>scheduled>planned>start，無 override 層）。
- applySchedule:1565（computeSchedule 整鏈 + anchorSource manual skip 1580；⚠ 手填跳過時 scheduledEnd 殘留沒清 = 遮 t.end 主因之一，重構要處理）。
- buildTaskRowHtml:4078-4156（10欄無工期欄、第8欄區間 task-deadline 與第10欄共用）。
- 確認彈窗全站現用原生 confirm()（重構改自訂 modal）。

**測試**：docs/test-bidirectional-65.py（16案全綠、Excel WORKDAY 口徑、含端午6/19跨假日、台灣假日28筆）已 commit，回家直接重用驗連動公式。

**核心哲學（重構勿繞錯）**：錨定計算≠使用者能不能改（鎖任何欄位都錯）；系統忠實連動不替使用者做主；連動讓引擎卡 bug = 核心沒達需求要修核心；病根 = 最早 UI 錨定按鈕📌（§6.8 廢除 a9499a4）「釘住才不連動」錯前提。

**deadline 拆欄**：獨立另一批（現況預計完成/Deadline 併 tf-end 單欄、t.deadline 不存在）。

**【§6.5 落地紀錄 2026-06-25（五塊全完成，t.end 全檔絕跡）】**

- 塊一 t.end 衍生化主線（commit 8036d52→d37391f）：App.recalcTaskTimeFields 三欄連動（改開始/工期→現算 addWorkdays(有效開始日,dur-1) 寫 tf-end 顯示）；App.bindTaskTimeListeners 改 document 事件委派（_taskTimeDelegated 只綁一次，因自動態 tf-start 不在 DOM，個別綁不到）；App.readEffStart（tf-start.value 優先、否則讀隱藏欄 tf-effstart=getEffectiveSchedule(t).start）解決自動態錨點空；recalc guard 移除 !startEl；getEffectiveSchedule dispEnd 衍生兜底（actual||scheduled||planned 全空→現算 addWorkdays(dispStart,max(1,dur)-1)）；save 端 readDurationField（start+end 都有→deriveDurationFromEnd 反推工期，存 durationDays 不存 t.end）。實測通過：手填錨點任務改工期→視窗內即時跳+存檔外層即時變+重開不空。
- 塊二刀① isTaskBlocked（commit e70b407）：衝突檢查改讀 getEffectiveSchedule(task/dep) 衍生 start/end，移除原 dep.end 空補算窄修補丁（衍生兜底已涵蓋），FF/SF 不再讀 undefined；清過時 bug 註解。回歸 test-schedule-cases 160/0。
- 塊三 負工期確認 modal（commit 500eda2）：B 案 #confirmOverlay 獨立第二層 overlay（z-confirm:520 疊 modal 500 上），App.confirmModal 公版渲染至此不炸底層任務表單；saveTask/saveNewTask 加 _skipNegCheck 旗標分流，負工期（readEffStart 統一口徑、排除 milestone）跳「工期為負數，系統照您輸入儲存」modal，確認→saveXxx(...,true) 強制存、取消留表單，取代舊「擋死 toast」guard。
- 塊四 負工期列表標紅（commit 15583e6）：buildTaskRowHtml 加 _negDur 判定（end<start||dur≤0，排除 milestone），整列 neg-dur 淡紅底（--rose-l）、區間欄拆專屬 task-range class（避免污染截止欄 task-deadline）標 --rose-ink、hover data-tip。
- 塊1.5 移除 J 同步 task.end 死寫（commit 1be7bb3）：J 同步原寫 task.end=latest.planEnd（更新+新建兩處），塊一砍 t.end 後全檔零讀取，移除；J 完成日靠 plannedEnd（原始計畫）+衍生兜底承接。
- t.end 全檔絕跡（grep "task.end ="/"t.end =" 皆 0）。單一真實來源＝開始日+工期，完成日全程衍生不儲存。實際完成 actualEnd 留資料層（事實、排程錨）。

**【§6.5 B2 待議（獨立批，產品語意決策）】** J 系列延誤任務的「有效完成日」目前顯示原始計畫（plannedEnd=planEndOriginal），延長後日期（Excel "A->B" 的 B）只在 history 表可見、不經 getEffectiveSchedule。若認定「延長後才該是有效完成日」，需把 task.plannedEnd 改接 latest.planEnd（延長值）、planEndOriginal 留 history 對照——屬行為變更，待產品決策後另開批次。

### 6.6 Deadline（未做）

- 新增欄位，手填截止日。
- fallback：`deadline || plannedEnd`（沒填取預計完成）。
- 可從 Excel 匯入（模板要多一欄、匯入器要補讀）。
- **反推/區間約束的輸入前置**：deadline（可販日）是反推（4.8.2）與區間約束（4.8.3）的必填輸入。反推從它往前推、區間用它當區間上界。範本第二階段反推/區間模式的「目標可販日」即寫入此欄。

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

> ⚠ **已被 §4.8.7.7 的新 Stage 2（`_renderStage2New`）取代**（2026-06-27）。本節描述的是舊 `_renderStage2`／`_stage2Commit`——
> 舊 render 已不接入「套用範本」新流程（保留為 dead path），但**建立落地仍複用 `_stage2Commit`**。新流程的實況以 §4.8.7.7 為準；
> 本節保留供理解資料模型／preview-then-commit 心臟邏輯（仍有效）。

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

### 第八部分之三補充：§8d.16 範本管理系統（多範本 + Excel 建範本 + 預覽編輯 + 防呆）

> 設計來源：2026-06-24 範本管理討論。承 §8d 既有 applyTemplate 純函式與單一內建範本（PRODUCT_DEV_TEMPLATE），擴成「多範本並存 + 站台自訂」系統。
> 最高原則對齊：範本來源在系統外（PDF/Drawio/既有 WBS），系統只負責「匯入 + 套用」，不做系統內逐格重建流程（避免重複造輪）。

#### 8d.16.1 設計原則：範本來源在系統外

範本＝已規劃好的公司流程，真實來源永遠是系統外的文件（PDF/Drawio/舊 WBS）。PM-Core 不是「重新發明流程」的地方，是「把已規劃流程吃進來、套用」的地方。故：
- 建範本主路徑 = Excel 上傳（既有 parseWbsExcel 分流一份「匯入成範本」）。
- 輔助路徑 = 複製內建範本改名（微調用，如砍幾階段當設變起點）。
- 不做逐任務從零 inline 建範本（鼓勵系統內重建＝反模式）。上傳後的預覽編輯（8d.16.4）是「微調已有底稿」，非「從零 key」，兩者不同。

#### 8d.16.2 範本 schema 集合化

現況 PRODUCT_DEV_TEMPLATE（templates/product-dev-template.js）是單一寫死 global。改為兩來源合併、同一套結構：
- 內建範本：留檔案（程式碼資產，跟版本走、所有站台都有）。
- 自訂範本：存 DATA.templates（陣列，資料資產，跟站台走）。
- 兩者結構一致：{templateId, templateName, description, version, stageDefaults, roles, cases}（沿用既有 schema，不新增結構）。
- 內建不搬進 DATA：內建改版（push 新版）不被舊雲端 blob 蓋掉；自訂不進 public repo。

applyTemplate(template, userInput) 純函式零改（已吃 template 參數）。只改呼叫端：從寫死 PRODUCT_DEV_TEMPLATE 改為「從合併清單 find 出選的 templateId」。

#### 8d.16.3 建專案範本下拉合併

_stage1FormHtml（:5090）的下拉現況單一寫死 option。改為迴圈渲染「內建 + DATA.templates」合併清單，value=templateId。建專案套用時 templates.find(t=>t.id===選的id) 餵 applyTemplate。

#### 8d.16.4 Excel → 範本 + 預覽編輯頁

- Excel 匯入分流：重用 parseWbsExcel（不複製匯入器），解析結果（任務陣列）轉成範本結構（cases/modules/tasks 巢狀），存 DATA.templates。轉換層需對照 parseWbsExcel 輸出形狀 vs 範本 cases 結構（施工前撈，已知為塊3 後的範本施工項）。
- 預覽編輯頁（重用建專案第二階段骨架編輯頁的呈現邏輯，不另畫）：
  - 切階段看任務、點格子可改（任務名/工期/前置/角色/加刪任務）。
  - 與建專案第二階段的唯一差異：範本不含實際日期（範本是空白藍圖，日期建專案時才填）。
  - 確認後「存成範本」→ 進 DATA.templates。
- 試算（共用塊3）：預覽編輯頁可填「假設開始日／結束日」做試算（接 §4.8.7 塊3 的三方向 + 餘裕燈號 + 溢出三層），讓 PM 判斷工期合不合理（純看天數無法判斷，攤到日期才有感）。
  - 乙案（已定案）：試算中層三改工期只影響本次試算、不回寫範本。要正式改範本工期，在本預覽編輯頁的任務表直接改（非透過試算溢出修正）。

#### 8d.16.5 防呆（兩種搞錯，各自解法）

搞錯一：入口走錯（想建專案卻進了建範本）。三道防線：
- 入口分明：新增專案在主畫面專案區（高頻）；新增範本在設定頁範本 tab（深處、限 Admin）。
- 進入提醒框：點「新增範本」時，填任何資料前先跳確認「你正在建立範本（流程母版），不是建立專案。範本不含日期，建專案時套用。想開專案請走『＋新增專案』」→ 按「我了解，繼續建範本」才進。
- 全程標記：範本編輯頁標題/按鈕字樣全標「範本」（「存成範本」非「建立專案」），任何時候看畫面都知道在建範本。

搞錯二：中途中斷丟資料（無存檔機制）。
- 層次一（今天做）：未存就離開/切走 → 跳「有未儲存的範本內容，確定離開？會遺失」確認框。擋手滑誤觸。
- 層次二（標 TODO）：自動存草稿（localStorage 暫存，當機/關瀏覽器後下次問「上次有未存完範本草稿，接著編還是丟掉」）。完整草稿機制，獨立小功能後做。

#### 8d.16.6 持久化

DATA.templates 走「新增持久化欄位四步」（踩坑手冊三 + §15.5）：
1. STORE 加 templates key（陣列預設 []）。
2. Storage.save 寫入。
3. Storage.load 讀（fallback []，舊環境無 key 不炸）。
4. CloudSync upload 帶 templates + download 防坑 cloud.templates || DATA.templates（舊 blob 無此欄不蓋空本地）+ 寫回 localStorage。

後端 .gs 不改：範本跟 DATA blob 走，後端只存 JSON 不認識內容，自動帶。

#### 8d.16.7 權限

範本管理掛設定頁範本 tab，renderSettings 開頭 if(!isAdmin())return 已整頁限 Admin → 範本管理自動 Admin-gated，不需另設閘。（Auth 三層已在 main，2026-06-24 確認。）

#### 8d.16.8 施工順序

範本管理接在塊3（§4.8.7）完整後做（消費塊3 的試算能力）。拆項：schema 集合化 → 下拉合併 → Excel 轉範本 + 預覽編輯頁 → 設定頁範本 tab + 防呆 → 持久化。最大技術點＝parseWbsExcel 輸出轉範本 cases 結構（施工前撈對照）。

### 第八部分之三補充：§8d.17 建專案閉環 UI 設計（2026-06-25 定案，Mockup 審核過）

> 承 §8d.16 範本系統與 §4.8.7 塊3 排程接線。本節定案「用範本建專案」從頭到尾的完整 UI 閉環：教育卡 → 第一階填設定看燈號 → 紅燈走溢出三層 → 第二階檢視任務 → 建立。配色全走 :root 變數（綠系主案／藍系另案／琥珀警示／陶土未指派，缺的新增具名變數）。

#### 8d.17.1 閉環總流程與三出口

建立方式三入口分流（沿用 §4.8.6）：範本走此閉環；Excel 匯入、空白走原流程（無範本階段可預覽落點，不套此閉環）。

範本閉環總流程：
選範本 → 入口教育卡 → 第一階（填日期/選階段 → 看燈號判斷可不可行）→ 三出口 → 建立。

三出口（關鍵分界＝有沒有動到「任務」）：
- 綠燈／黃燈 → 進第二階補任務細節（含部門擔當）→ 建立。
- 紅燈走溢出層一／層二（只改日期、沒動任務）→ 仍進第二階補任務 → 建立。
- 紅燈走層三（已壓過任務）→ 直接建立，不進第二階（層三逐筆動過任務，等同做完第二階）。

#### 8d.17.2 入口教育卡（選範本後、進填寫頁前）

- 標題「如何選擇排程方式」，定調「以下是說明、不是選項」。純教育、不 hover、不是選項。
- 三種情況卡片（多色分類、三張平等無主推，避免誤以為可選）：有開工日想知道做到幾號→填開始日／有交期想知道最晚幾號開工→填結束日／開始結束都有想知道時間夠不夠→兩個都填。每卡含小字說明。
- 底部提示：「只要填日期（開始／結束，擇一或皆填）——系統會依你填了哪格自動判斷。不確定可以填入日期試看看。」
- 使用者不選排程方向，系統自動判斷（接 §4.8.7.2 _effScheduleDir：開始+結束＝interval／只結束＝backward／其餘＝forward）。

#### 8d.17.3 第一階填寫頁

- 版型：螢幕滿版（非窄 modal）。頂部「專案名稱＋顏色＋選範本」並排一條；下方主案／另案各自填寫區塊（主案綠左框、另案藍左框、可＋新增另案／刪除）；每案含：案別名稱＋開始日＋結束日＋選擇階段膠囊（預設全選可取消，不選＝不建該階段）。
- 日期不打死星號：開始／結束欄標「擇一或皆填」，三種情況寫進藍色 info 提示帶（只填開始＝往後排完成日／只填結束＝往前推開工日／兩個都填＝算時間夠不夠），無排程方向選單。
- 底部「階段區間預覽」：各案別一條完整 Gantt（比照第二階樣式——案別膠囊＋餘裕燈號徽章＋完整總區間「開始→完成」，系統推算那端標註＋月份刻度＋各階段 bar＋逐條起訖日）。
- 燈號＝各案別整體一顆值（§4.8.7.4，_computeSlack 只算整案餘裕，不分階段）。階段 bar 同色，不做單階段染色（引擎無分階段餘裕資料，假染色禁止）。
- 燈號「?」說明（三行各標工作天門檻，不黏成一段）：可行（餘裕≥5工作天）／偏緊（餘裕0~4）／不足（餘裕<0）；註明「餘裕＝可用−需要工作天（不含假日週末）」「只有開始＋結束都填才出現燈號」。
- 主按鈕「下一步：檢視任務」。

#### 8d.17.4 紅燈溢出三層 UI 位置（接 §4.8.7.5）

- 三層算法／流程定義見 §4.8.7.5（已修正：層三卡頁切階段調到餘裕≥0、無展開全部）。本節補 UI 位置：
- 跟著紅燈案別走：哪個案別紅燈，該案的溢出引導（層一／層二，層二fail後展層三）就長在該案 Gantt 下方。多案各自紅燈＝各自一套引導（主案上、另案下，獨立）。原因：每案日期／最快完成日不同，引導不能合併。
- 層一／層二 pass（採納日期或重算餘裕≥0）→ 按鈕導「下一步：檢視任務」進第二階（因沒動任務、部門擔當待填）。層二 fail（手填仍<0）→ 展開層三。
- 重算範圍：每案各自重算（_reschedulePreview 本就逐案 per variant，互不影響），各案 Gantt 區塊各有自己的重算鈕只管該案。

#### 8d.17.5 第二階檢視任務頁（版型 C：左導航＋右內容）

- 進場引導（僅有未指派任務時出現）：頂部琥珀條「建議先設定部門與負責人，人員會自動套用到主案和另案的所有任務，再針對個別任務微調」＋「前往設定部門」鈕（直接開部門彈窗）；全指派好則消失。
- 左導航：①部門與負責人卡（外框＋↗，點開彈窗填，顯示「N 部門已設／M 未指派」）②主案各階段（帶任務數＋該案餘裕燈號）③另案各階段。選中階段反白。
- 部門彈窗：每列＝部門名稱輸入框（可改）＋擔當姓名輸入框（可改）＋＋擔當（多人）＋✕刪列，底部新增部門，可自由增減。頂部警語見下。
- 右側上半：選中案的完整 Gantt（全階段，非只選中階段）＋總時程＋餘裕燈號＋「重新計算時程」鈕（帶「有未套用變更」橘點標記）。點不同階段，上方 Gantt 不變、下方任務換。
- 右側下半：當前選中階段的任務清單表（比照截圖欄位，能改/唯讀如下）：序（唯讀自動重排）／任務名（輸入框可改）／負責人（下拉）／前置（下拉）／工期（輸入框可改）／日期起訖（唯讀引擎算）／需交付（勾選＋階段標題列全選）／✕刪除。布林欄垂直對齊。
- 負責人自動帶入＋手動優先：範本每任務標所屬部門角色，applyTemplate 依部門對照自動帶入該任務負責人。部門彈窗改人員→只回灌「沒被手動改過」的任務（ownerManual 旗標：自動帶 false、手動改設 true，回灌只灌 false）。手動改過的不覆蓋。
- 負責人警語（常駐＋手動改前提醒）：「系統不會覆蓋你手動調整過的負責人。建議先到部門與負責人修改人員，完成後會自動套用到主案和另案全部工作項目；若在此單獨手動修改，這一筆將不再跟隨部門資料更新。」引導優先用部門批量套，手動是逃生口。
- 層三反色標：在層三（或第二階）改過工期並按儲存重算的任務，反色標「已修改」（淺底＋工期框強調色＋日期欄「已修改」標記），未存者維持範本原始工期。
- 底部：上一步（退第一階）／刪除草稿（紅，點跳嚴重警語見 §8d.18）／建立專案（確認才落地）。

#### 8d.17.6 第二階＝唯一任務編輯頁（單一真實來源）

所有進第二階的路徑（綠燈／黃燈／層一pass／層二pass）看到的都是同一頁第二階 C 版 UI，一份多用、不複製兩份（最高原則）。僅層三例外＝在層三頁壓任務到達標直接建立、不進第二階。

### 第八部分之三補充：§8d.18 建專案資料模型（記憶體即時存 + 雲端草稿 + 手動優先，2026-06-25 定案）

> 承 §8d.17 建專案閉環 UI。本節定案閉環背後的資料模型：欄位怎麼存、效能怎麼撐、草稿怎麼跨設備、負責人回灌怎麼不踩手動。§8d.17 兩處引用此節（層三儲存閘門、刪除草稿警語）。

#### 8d.18.1 三層儲存（即時存 ≠ 即時重算 ≠ 落地）

第二階所有可改欄位（任務名／負責人／前置／工期／需交付）的改動，分三層處理，不混：
- 記憶體 preview 物件：改欄位即時寫此層（JS 物件屬性賦值，奈秒級）。切階段、切案都在同一個記憶體物件上，不丟值。此層是「使用者改了什麼」的即時事實。
- 重新計算時程：使用者主動按鈕觸發。讀記憶體 preview → 跑 _reschedulePreview（per variant）→ 把工期換算成日期、更新記憶體裡的日期、重畫該案 Gantt。只重該案（§8d.17.4）。帶「有未套用變更」標記提醒改完要按。
- 落地（localStorage/雲端正式資料）：只在按「建立專案」才寫一次。中途不落地（避免每改一筆 I/O、避免未建立就污染正式資料）。

#### 8d.18.2 效能模型

改欄位無限次（純記憶體不卡）→ 想看時程按重算（重操作，使用者主動、頻率低）→ 建立才落地存檔（一次）。即「改的當下只動記憶體物件，重的東西延後到使用者明確觸發」。20 張任務每張改不同欄位、跨階段改來改去皆不卡，因改動只是記憶體物件賦值。

#### 8d.18.3 負責人回灌 + 手動優先（ownerManual 旗標）

範本每任務標所屬部門角色，applyTemplate 依「部門→人」對照自動帶入負責人。部門彈窗改人員後回灌規則：
- 每任務記 ownerManual 旗標：自動帶入＝false，使用者手動改過該筆負責人＝設 true。
- 回灌只更新 ownerManual===false 的任務（沒被手動碰過的）；true 的不覆蓋（尊重手動）。
- 與系統既有 getEffectiveSchedule「override > 自動」同精神（手動優先於自動）。
- UI 配套警語見 §8d.17.5（不覆蓋手動改過的、建議先改部門自動套全部）。

#### 8d.18.4 雲端草稿（綁帳號、跨設備）

定位：第二階改到一半可離開、換設備、回來接續。因系統綁 Google Auth、使用者跨設備登入（公司/家裡輪流），草稿必須跟帳號走、存雲端——存 localStorage 綁裝置，換設備等於重來，功能不成立。
- 存哪：雲端，綁 Google 帳號 id/email。沿用現有 Apps Script 同步（doPost 寫、doGet 讀，存 Google Sheet），不另起後端。
- 存什麼：記憶體 preview 全部（已改欄位 + 已設時程 + 部門設定）。
- 何時存：節流。不是每改一筆都上傳（雲端 doPost 是網路往返、有成本）。改欄位只即時寫記憶體（§8d.18.1），草稿在「切階段／切案／離開頁面（beforeunload）／閒置較久」時把記憶體 dump 上傳一次。萬一上傳前當掉，丟的是最後一次快照後的少數改動，可接受。
- 一個範本一份草稿：不並存多份。再開同範本→偵測到草稿→跳「接續／丟棄重開」。
- 接續：登入後 doGet 撈該帳號草稿，有→回到上次停的那一步（畫面就是當時狀態，改過的值都在），可按「上一步」回第一階改前面，草稿資料跟著還在。
- 刪除：建立成功 → 刪雲端 + 本機兩邊草稿（釋放空間）；或使用者主動按刪除（跳 §8d.18.5 警語）。

#### 8d.18.5 刪除草稿嚴重警語

使用者按「刪除草稿」時跳明確警告（不可隨手清）：「確定放棄？先前填寫的所有資料（已改的任務、設定好的時程、部門指派）都會刪除，下次使用此專案範本需要從頭建立。此動作無法復原。」取消／確定刪除二選一。

#### 8d.18.6 前置依賴

草稿綁帳號需 Auth 帳號身分可用（撈/存草稿要 email/id）。前者：Auth 三層已在 main，帳號身分可用，前提成立。

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
- **✅ 前置候選過濾已加 variant 維度**（2026-06-22，`ffc8e4f`）：predCandidates 疊「同 variant」AND（同 variant + 同階段及之前），跨案別不互列。
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

### 8f.3b SuperAdmin 顯示獨立 + 進別人副本警示（2026-06-19 定案）

SuperAdmin 進任何副本時，role 顯示與一般 Admin 區隔（修正原「後端一律回 admin、前端零改」的簡化）：

- 後端 ?action=role 對 SUPERADMIN_EMAIL 回傳 `superadmin`（非 `admin`）。
- 前端 isAdmin() 改認 `_role === 'admin' || _role === 'superadmin'`（兩者都有完整 admin 權限與設定頁存取）。
- badge 多一態：superadmin → 顯示「SUPER ADMIN」，與一般 Admin 區隔。

進別人副本警示：SuperAdmin 登入「非自己綁定的副本」時（即該副本已有別人是 admin、自己是靠後門進入），彈窗提醒「你正以 SuperAdmin 身份進入他人副本，請小心避免誤改資料」。設計理念：SuperAdmin 後門是救火/debug 的保險，非隨意改他人資料的工具，進入時主動提醒避免誤改。

判斷「是否他人副本」：後端已記的 admin email 存在且不等於 SUPERADMIN_EMAIL → 視為他人副本 → 回傳 role 時附帶旗標（如 isForeign:true），前端據此彈窗。

落地時機：與後端 .gs 塊三（接後端）一起做（後端回 superadmin role + isForeign 旗標、前端 isAdmin() 擴認 + badge 多態 + 彈窗）。

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

> 雲端讀寫如何接上四層權限（廢 token、JWT 綁登入、doGet/doPost 驗 role）見第十四部分。

### 8f.7 既有安全防線（沿用，不得破壞）

- 唯讀咽喉（app.js:205）：viewonly 一律不落地，鎖 body.viewonly。
- PII 最小化：viewonly 不留 email；upload 前剝除 cloudSyncToken / _loggedInEmail / _loggedInPicture / _role（app.js:254）。
- JWT 前端不驗簽（Google 已簽發），授權靠後端 role。

### 8f.8 施工順序（2026-06-19 大轉向定案）

開發順序定為「前端全做好 → 本地測四層 → 最後接後端」，取代原「後端先、前端後」。理由：先把前端設定介面（含白名單管理頁）做到位，後端接上時直接吃前端已設定好的資料結構，不必後端先寫死再手動填 Script Properties、改壞重跑。

**塊一：清場（純前端，先做）**
- 拔除設定頁「編輯密碼」+「忘記密碼」兩功能（已無用，memory 廢密碼殘骸）。純移除不碰後端。

**塊二：前端四層 UI 全做（localStorage 暫存 + 本地 role 切換器測）**
- Landing page 兩路（Gmail + 首登密鑰 → Admin／viewonly 按鈕），廢 index.html:32 舊 OAuth fallback。
- 白名單管理頁（Admin 設定頁管 editor／viewonly 名單，暫存 localStorage，後端接上再換來源）。
- 四層分流（改 §2144 分支，拆 admin／editor／viewonly／none）。
- enterBlockout 擋頁（none 全屏擋光）。
- isAdmin() 擴認 superadmin + badge SUPER ADMIN 多態 + isForeign 彈窗（§8f.3b）。
- 本地 role 切換器（開發測試用，能切著看四層畫面，不依賴後端；後端接上後移除或隱藏）。
- 此塊名單與身份暫存 localStorage，UI 全做完四層都能本地切看，後端接上時資料結構直接搬。

**塊三：接後端（最後，獨立 session，最高風險「改錯鎖死自己」）**
- .gs 加 SUPERADMIN_EMAIL（開發者 email）+ 首登密鑰（存後端）+ ?action=role 端點（回 role + isForeign）+ editor／viewonly 名單存 Script Properties。
- 前端名單來源從 localStorage 換成後端 fetch。
- 安全策略：用「新部署」開測試 URL（不動正式部署），前端用測試 URL 驗四層 role 全對，再切正式。
- 改 .gs 前備份可運作版本，照「管理部署一律失敗→直接新部署」教訓（§10）。

### 8f.8b 權限層隔離紀律（塊二施工地基，2026-06-19 定案）

權限/安全是獨立一層，與核心（排程引擎/資料/UI）保持單向、窄介面，未來抽成獨立檔是機械搬移而非解耦。立此紀律防重蹈耦合覆轍（前兩版合不起來、半套 id 化害 J 系列全壞的同類教訓）。

三條鐵則：

1. **權限只回答、不動手**：權限函式只回傳布林或 role 字串（如「這人能不能編輯」「他是什麼角色」），不直接碰 task／project 資料、不 render DOM、不呼叫排程引擎。判斷與執行分離。

2. **核心只透過窄門問**：核心要權限時，只能透過固定入口問——isAdmin()／_roGuard()／Auth.getRole() 等少數窄介面，不准伸手讀權限層的內部變數（如直接讀 _role 做業務分支）。禁止在排程引擎/資料層寫死 if role==='admin' 之類深度耦合。

3. **命名聚集（Auth 命名空間）**：塊二起，所有新增的權限相關函式掛進 Auth.* 命名空間（Auth.getRole／Auth.checkWhitelist／Auth.enterBlockout／Auth.bindAdmin 等）。舊散名（isAdmin/_roGuard/enterViewOnly/refreshUserBadge）暫不動、之後順手收進 Auth。物理上散在 app.js 無妨，命名一致即可，未來整個 Auth 物件搬出成獨立檔是剪下貼上、不拆線。

此紀律與 §第一部分「四層架構」對 core 層的要求同源：core 只算不碰 DOM/Storage、權限只判斷不碰資料/DOM，兩層皆「純功能、單向被呼叫」，未來拆檔皆機械搬移。塊二每個新功能依此長。

### 8f.8c 塊二完整藍圖（2026-06-19 定案，分兩批做）

塊二＝前端四層 UI 全做（localStorage 暫存、本地 role 切換器測，不依賴後端）。六項依 8f.8b 隔離紀律：新增全掛 Auth.* 命名空間、localStorage key 統一 auth_* 前綴、權限只判斷不碰核心資料。

**批一：四層骨架（①②③，做完用切換器本地測四層畫面）**

① Auth 本地 role 切換器（地基，先做）：Auth._devRole（localStorage auth_dev_role）暫存測試身份；Auth.setDevRole(role) 切 superadmin/admin/editor/viewonly/none（寫 localStorage + 設 _role + body class + refreshAll）；UI 浮動小面板（角落、開發用）。受 Auth.DEV_MODE flag 控制，後端接上後 flag 關閉、保留當 debug 工具。純前端開發工具，不碰後端。

② Auth 四層分流 + enterBlockout：改 §2144 那道，admin/editor→編輯、viewonly→enterViewOnly、none→Auth.enterBlockout()。Auth.enterBlockout() 全屏擋頁覆蓋，顯示「您沒有檢視權限，請聯絡管理員」，不留 PII、不顯示任何專案內容。擋頁只 render 自己（符合隔離紀律：權限可 render 自己的擋頁，不碰 task/project 資料）。

③ badge superadmin 多態：refreshUserBadge 統一邏輯加 superadmin→「SUPER ADMIN」；isAdmin() 擴認 _role==='admin'||_role==='superadmin'；isForeign 彈窗（§8f.3b）先留介面，本地切換器可手動觸發測。

**批二：名單 + 登入（④⑤，做完測名單管理 + 兩路登入）**

④ Auth 白名單管理頁（改來源）：editor/viewonly 兩名單 localStorage 暫存（auth_editor_list / auth_viewonly_list）；設定頁「編輯權限」tab 改雙名單管理 UI（加/刪 email），僅 Admin 可見；Auth.checkWhitelist(email) 回 editor/viewonly/none（純判斷，後端接上換 fetch）；現有 allowedEmails（CFG 來源）改讀 localStorage。

⑤ Landing page 兩路（最後，牽動最多）：改 loginOverlay 為①「登入並成為管理員」（Gmail + 首登密鑰輸入）②「以檢視模式進入」；廢 index.html:32 舊 OAuth fallback 後門；首登密鑰本地先用假值（後端接上換真）；舊 loginPwMode 密碼登入此時一起拔（B 組退場，新登入上線才拔、不留空窗）。

**分批理由**：①②③是「能獨立驗證的完整骨架」（四層畫面切得出來即對），④⑤是「另一個完整功能」（名單+登入）。兩個各自完整子塊，非把單一功能拆碎（符合開發節奏鐵則）。

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

## 第八部分之七：共用表格規範（`.data-table`）（2026-06-20 改版：內容自適應）

> 全系統「資料表格」單一真實來源。核心原則：表格欄寬由內容自動決定，人不管寬度。任何表單把資料丟進去就自動漂亮顯示——新增表格、改欄位內容，永遠不會跑版/破圖/文字被吃。

### 8g.1 路線：統一 `<table>` + 內容自適應

全系統資料表格統一用 `<table class="data-table">`。核心是 `table-layout: auto`——瀏覽器自動量每欄內容（文字、input、select、勾選框、按鈕）算出該多寬、自動分配。沒有任何固定欄寬，所以內容怎麼變都自己排好，永不回來調。這是 `<table>` 原生最強的能力，也是「丟資料就漂亮」的根本。

（歷史：本規範初版曾用 table-layout:fixed + 固定 token 欄寬 + compact 變體，但那套等於把欄寬寫死、每次內容變就破版要回來調，與「通用、不回來調」的目標相反，已於 2026-06-20 改為 auto 自適應。）

### 8g.2 機制：寬度自動、class 只管行為

- **寬度**：由 `table-layout: auto` 內容自動撐，人不設、不給 colgroup 固定寬、不給 token。
- **行為**：欄類型 class 只管「對齊傾向」與「主欄上限截斷」，不含寬度。
- **表單 cell 自適應的關鍵**：`.data-table` 通用規則讓 cell 內的 input/select 寬度吃滿所在欄（width:100%），輸入框跟著 auto 撐出的欄寬走，不破圖。所有表單表自動套用、零設定。

### 8g.3 欄類型語彙（只管對齊/截斷傾向，不管寬度）

- `.col-num`：置中（序/數字/狀態/進度）。
- `.col-action`：置中 + 不換行（操作鈕欄，鈕不被擠掉）。
- `.col-mid`：靠左、不截斷（一般文字欄，auto 自己撐夠寬）。
- `.col-flex`：靠左 + 上限截斷（主欄，如任務名/議題；設 max-width 上限避免單一超長欄撐爆整表，超過 ellipsis 截、hover 看全文）。
- 都可不加：`<table class="data-table">` 純丟內容也會 auto 自適應靠左，欄類型 class 只是要管對齊時才加。

▎ 多行例外 `.col-wrap`（修飾，非欄類型）：需保留多行的 cell（如任務史「預計完成」帶第二行）標 `.col-wrap`，解除截斷、允許換行。與欄類型 class 正交、可疊加。

### 8g.4 截斷溢出 hover 全文

`.col-flex` 主欄上限截斷後，render 時 cell 給 `title="{全文}"` hover 顯示全文。全系統一致。

### 8g.5 新增表格怎麼用（零設定）

新表格：`<table class="data-table">` 包起來，內容直接丟。要管對齊就在 td/th 加欄類型 class（col-num 置中、col-action 操作欄、col-flex 主欄截斷），不加就純 auto 靠左。**不需要排 colgroup、不需要設任何欄寬、不需要 compact**。表單欄位（input/select）自動吃滿欄寬。這就是「丟資料就漂亮」。

### 8g.6 遷移狀態（§8g 全節完成，2026-06-20）

| 表 | 狀態 |
|---|---|
| WBS 匯入預覽 | ✅ 已完成（auto） |
| Excel 匯入預覽 | ✅ 已完成（auto，拔 compact） |
| 任務史 | ✅ 已完成（auto，拔 compact） |
| 公休日（cal-table） | ✅ 已完成（auto，年份 tbody + sticky + 專屬 zebra） |
| stage2 s2-tbl | ✅ 已完成（auto，雙色表頭/需交付靠左/列間插入 .dt-insert-row） |
| 待辦 task-grid | ✅ 已完成（auto，div→table、4 全寬 bar、摺疊、.dt-insert-row、欄距調勻） |

五張表 + 待辦 task-grid 全遷 auto；通用列間插入元件 .dt-insert-row（s2 與待辦共用）；§8g.8 死碼（subgrid／row-insert／compact／:root 三寬度 token）已清光。**下一步轉非表格主線**：cloudSyncToken 安全、Auth 三層（feat/auth-3tier）、範本換公司標準 WBS 等，見 §9 待施工清單。

### 8g.7 明確排除（不套此規範）

圖表/日曆/卡片結構特殊，不套：甘特 `.gantt`、週曆 `.week-schedule`、月曆 `.month-grid`、看板 `.kanban-board`、KPI 卡 `.report-summary`。週報表 `.rp-table`、PDCA 月報 `.pr-group-table` 是獨立列印文件、不吃 app style.css，排除、保留自有列印樣式。

### 8g.8 死碼清除（轉 auto 後）

轉 auto 後清除：`:root` 三個寬度 token（--col-num-w/--col-mid-w/--col-action-w）、`col.col-*` 寬度綁定三條、`.data-table.compact` 變體、各表 render 的 colgroup 固定寬。待辦遷移後另清 subgrid 殘留（舊 fr 規則、#activeTaskList 系選擇器、.toschedule-group.collapsed）。

---

## 第八部分之八：新增專案三段式流程（路線B）+ 部門解耦 + Excel 匯入（2026-06-21 定案）

### 之八.1 三段式建立流程（路線B）

①建立方式（modal 三卡：範本/Excel/空白）→ ②填資料（modal）→ ③任務骨架（整頁 _renderStage2）。①②同一 #modal 換內容、③整頁。openModal 同步塞 DOM，回傳後可直接 querySelector 回填，無需 callback。

**狀態物件 `_createFlow`**（資料活在狀態、不活 DOM，解決需求4「上一步資料消失」）：
`{ step, mode, stage1Data, excelParsed }`
- stage1Data：②填的資料快照（範本：name/color/note/cases/depts），供③上一步回填。
- excelParsed：Excel 模式選檔解析結果（parseWbsExcel 回傳）。

**flow 函式職責**：
- `_flowStep1`：①卡片頁，重置 _createFlow（step/mode/stage1Data）
- `_flowPickMode`：點卡選 mode、清 stage1Data
- `_flowStep2`：②表單，依 mode 分流 body（範本出 _stage1FormHtml、空白出 _deptEditorHtml、excel 出上傳區）；全新進入才預載 _tplDepts（範本=標準 PRODUCT_DEV_TEMPLATE.roles、空白=一列空部門），stage1Data 有值（回填情境）則不重設
- `_flowStage2Next`：②→③，依 mode 分流（範本算 applyTemplate preview、excel 用 buildWbsPreview、空白走 _flowBlankCommit）；範本/excel 算完 _tplPreview → closeModal → _renderStage2
- `_flowStage3Back`：③上一步退②並回填（部門先還原 _tplDepts → _flowStep2 → 回填 name/color/note/主案+另案卡/階段）；無 snap 防呆退①
- `_flowBlankCommit`：空白專案落地（np 含 depts），清 _createFlow
- `_flowExcelPick`：Excel 選檔 async 解析、存 _createFlow.excelParsed、顯示狀態
- `_applyStagePicks(cardEl, selectedStages)`：階段膠囊精確設定 helper（toggle on/off，非 additive）
- `_stage1FormHtml`：範本表單（主案/另案卡、階段膠囊、部門編輯區）
- `_deptEditorHtml`：部門編輯區 helper（範本/空白/編輯三處共用，避免重複）

③上一步、③建立落地後 _createFlow=null 清狀態。

**案別標頭**：膠囊顯「主案/另案」（isMain），名稱顯 v.name，兩者語意分開（避免單一案別時膠囊與名稱重複）。

### 之八.2 部門解耦成專案基本屬性

部門/擔當是每個專案的基本屬性（每專案都有 PM/RD 負責），與「要不要套範本排 task」是兩回事。原本部門預載綁在範本流程，空白專案沒部門＝架構耦合。

- 空白專案②也有部門編輯區（預載一列空部門待填）、落地寫 np.depts、編輯時 isEdit 部門區讀 editing.depts 自動讀到。
- `_deptEditorHtml` 範本/空白/編輯三處共用、單一真實來源。
- placeholder 範例提示（例：研發部／例：小明）。
- 成員框 `field-sizing: content` 自適應（移除寫死 80px、隨內容變寬、放不下由 .dept-members flex-wrap 換行）。
- 成員框去 chip 外殼、padding 對齊部門名框等高。
- 成員 × 刪鈕 hover 才出現（--rose，緊貼名字、不與＋擔當混淆）。
- ＋擔當改輕量文字鈕（無框、--sage-600、對齊成員框高度）。

### 之八.3 Excel 匯入（buildWbsPreview 拆分）

`performWbsImport` 拆出 `buildWbsPreview(parsed)`：純算 preview（候選 project fresh id + id 化 tasks/variants/depts + 前置序號→id），回 _tplPreview 形狀 `{project, variants, depts, tasks, warnings}`，不 push DATA。project 同時掛 depts + variants（新建路徑 push 才完整）。

- **重灌入口**（設定頁，performWbsImport）：buildWbsPreview + 找同名既有→重用 id 並重指 task.project→清舊 task→push；無同名則 push 候選。
- **新建入口**（路線B Excel）：②選檔→parseWbsExcel→buildWbsPreview→塞 _tplPreview→第三段 _renderStage2（可編輯：改階段/前置/工期/列尾刪/列間插全繼承）→_stage2Commit 落地（直接共用、零分支，_stage2Commit 只用 project/tasks/depts/variants/warnings，excel 缺的 variantNameToId/excludedNs 未讀）。

兩入口語意不同（重灌 vs 新建），共用 buildWbsPreview + 第三段 + commit，符合單一真實來源。toast 文案泛化為「已建立 N 筆任務」（範本/excel 通用）。

### 之八.4 待辦（接續第九部分）

- Excel 步驟3：.excel-upload/.excel-status CSS + 清孤兒 .excel-placeholder CSS；③上一步 _flowStage3Back 的 excel mode 回填（目前 excel 進③按上一步回①，未保留已選檔）
- 舊 stage2 整條清理（_stage2Back 死定義、_renderStage2/_stage2Commit 確認共用後可整理）
- 路線B Excel 同名專案擋/重灌：已評估，不做（新增入口新建語意正確；同名提醒屬獨立功能，不綁進此批）

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
7. **反推引擎（§4.8）**：✅ 已定案規格（§4.8 排程三模式 + backward pass + 區間餘裕 + 溢出三層 + 階段三升級，2026-06-23）。施工分塊：塊1 schema（targetEndDate/scheduleMode，✅ 49a89fe）→ 塊2 backward pass 核心+Node測試（✅ 0cc65fa，133綠）→ 塊3 區間/餘裕/溢出（規格見 §4.8.7）：塊3a 計算層✅（c22b9c5，160綠，引擎方向分流+_computeSlack餘裕，UI呈現層休眠待懶人流程）｜塊3b 溢出層三待做 → 塊4 懶人式UI。需家裡桌機 Node。

- 【新增 2026-06-23】時段制週時程表呈現層三待辦（§4.11）：①時段格跟設定動（修 `hours`/午休寫死脫鉤地基）②接四層工作日曆（假日反色+不可排）③配色對齊 §16（mockup 審）。施工序 1→2→3。
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
19. ✅ variant 變體／案別架構（id 制）核心已實作（2026-06-14，`3df295f`/`db4e499`/`25d7fed`，見 §8e）：資料結構（project.variants=[{id,name}]、task.variant 存 id）、匯入器接案別欄、階段複合鍵分塊、案別膠囊配色全到位。**剩**：variant 編輯 UI、兩種版面（主案完整／變體精簡）mockup（前置候選過濾 ✅ ffc8e4f）。
20. **Excel 匯出（規格見 §13）**：把 J 系列/排程結果匯出成 Excel（ExcelJS（已載入），client 端產生）。variant 核心已完成（§8e），可動——匯出帶「案別」欄才乾淨，否則 stage 混「變體+階段」會匯出髒資料。
21. **Template 範本系統正推/逆推（§8d + §4.8 + §6.8）**：錨定已從 Task 層移除（§6.8 廢除），正解在 Template 層。正推 UI + 逆推引擎（backward pass，§4.8）待做；逆推引擎屬核心新增、判斷風險最高。

- 【新增 2026-06-16，現行重點】第二階段任務骨架編輯頁（greenfield，多 session）：完整規格見 §8d.15。落地分塊 N.8：B preview 流程骨架（頁殼＋Gantt 階段軸＋只讀清單）→ C 可編輯欄（負責人／工期／需交付）→ D 互動（前置 hover 目標列高亮＋插入＋刪除＋未指派閉環）→ 前置三層函式（prettyPredecessor／predToWbsFormat）→ 配色對齊。屬 §21 Template 系統下一階段（非低優先，現行主線）。 **✅ B 頁殼/Gantt 軸/只讀清單、C 可編輯（負責人/工期重排/需交付）、D 互動（刪除/插入/未指派閉環/前置 hover/前置可改）已落地（2026-06-18，見附錄）；剩前置三層函式 + 配色對齊。**
- 【新增 2026-06-16】建立方式雙模式入口（乙-1，§8d.15 N.2）：套範本走兩階段（主鈕「下一步：檢視任務」）／空白直接建（主鈕「建立」）；卡片式雙選項取代乾巴下拉。
- 【新增 2026-06-16】甘特 bar 配色對齊：`.bar-*` 8 class（app.js:5498）跟新 `--proj-c1~8` 不同步；舊專案 `proj.color` 在新 PROJ_COLORS 回 -1 退 bar-sage。處理時機＝甘特視圖正式施工時（屆時 bar 配色本就要重規劃）。舊專案配色靠重灌測試資料解決，不寫 hex→hex migration。

**雲端（已完成）：** doGet 公開唯讀已上線（2026-06-12）——訪客開網頁即見最新 J 系列資料。新部署繞過舊部署不生效問題；doGet 拔 token 鎖（純讀），doPost token 檢查保留（寫入維持鎖）。前端 config.js 換新 exec URL。教訓：Apps Script 編輯部署若不生效，直接建新部署最快（代價 URL 變、前端要跟著換）。

**雲端（待補）：** `pdcaGroups` 尚未進 CloudSync upload/download blob——它在 Storage(localStorage) 有存，但 upload payload 與 download 還原都沒帶，跨機不同步、download 不還原（在雲端機器間切換會掉 PDCA 分組）。低風險但會掉資料。比照 calendars（2026-06-14 已補）做法：upload 加 `pdcaGroups: DATA.pdcaGroups`、download 加 `DATA.pdcaGroups = cloud.pdcaGroups || DATA.pdcaGroups` 防坑 + 寫回 localStorage。另做，這次不碰。

**E 群：J-sync 退場收尾 + Gantt 續 + 安全/權限（2026-06-21 盤清）**

22. ✅ **問題3 步3：拔 J Sheet 同步死碼（2026-06-21 完成，4 批）**：DATA 確認無 synced/locked 殘留後四批清除—批1 `7f13da3`（override 群本體 `J_OVERRIDE_FIELDS`/`isJTask`/`getJOverride`/`setJOverride`/`clearJOverride`/`getAllJOverrides` + locked-modal + toggleTaskDone 守衛）、批2 `d59f717`（synced/🔗 散點消費端 18 處 + ✎ 死分支 + J CSS 8 條）、批3 `0f95b13`（getEffectiveSchedule `hasOverride` 死 property + 過時 override 註解）、批4 `24f3faf`（測試 §7 `__isJ` 死旗標 + J 字樣）。核心/UI/CSS/測試/註解零殘留、約 −190 行、測試 98/0。⚠ E 群同名非 J 全保留（`item.locked` 時段鎖、`ti-link`、`cal.override` 工作日曆、`sync-status` 登入）。方法論：拔死碼前先 F12 實查 DATA 殘留—本次發現 test_jsheet 測試夾具帶 synced/locked，清除後才確認純死碼可全拔；資料殘留會讓拔 UI 後殘留任務掉進錯誤流程。
23. **4-3 甘特時間粒度（年/月/週/日）**：§12.5 已設計、code 未做。碰 renderGantt 視窗重寫（現寫死 14 天）、獨立 session。
24. **§12.3 Hunk3 同階段 SVG 折線**：附錄已記未做（連接線骨架 + 跨階段 badge 已上，剩同階段實線）。
25. ✅ **cloudSyncToken 安全（完成 2026-06-22）**：整合進第十四部分（雲端寫入授權收斂）全六階段 + Admin 層白名單，C 全階段落地並線上驗通——廢 token 改 JWT 綁登入、doGet/doPost 驗 role、URL 收斂 BACKEND_URL。原「剝離 payload」早完成，餘項由 §14 結案。
    > 此項整合進第十四部分（雲端寫入授權收斂），詳見該節分階段執行。
26. **Auth 三層（feat/auth-3tier）線上驗**：真 Google 帳號實測三層權限（superadmin/admin/editor/viewonly）。
27. **editor 放寬設定頁權限**：showPage(設定攔截) + renderSettings 的 `isAdmin()` 閘放寬，讓 editor 也能進設定頁（呼應 §4-2 兩週預告搬排程 tab 時記的「editor 也能調」另開一件）。
28. **CSS 死碼順手清（無害非急）**：①`.sync-status.error`/`.sync-status-time` 子規則（步1 孤兒，活元件 .sync-status 家族的 error/time 子規則）②`.task-check` family——步3 批2 發現 app.js 已無 `task-check` emit、整組孤兒；批2 已拔 `.task-check.locked`，剩 `.task-check`/`.task-check.done` 待清。
29. **8664 `task.synced: false` vestigial 欄位**：performWbsImport 建 task 時設的 `synced: false`，步3 後無任何 reader、不觸發 J 邏輯，留作明示 schema、無害；未來徹底清 task schema 時連帶移除（移除前確認無 reader 假設欄位存在）。
30. **廢除自訂 Google OAuth Client ID 設定 + 後端（高風險，動 Auth/後端，獨立 session）**：設定頁「關於」分頁「Google OAuth Client ID（admin only）」整塊移除、後端對應邏輯一併拔（現用內建預設 Client ID、自訂用不到）。⚠ 拔前確認內建預設 Client ID 路徑完整、登入不斷；後端走新部署測試 URL 驗完再切（照 §8f 後端鐵則）。
31. **資料管理砍「上傳還原」、只留「下載 JSON 備份」（卡 Cache 快照前置）**：下載備份現無時間點意義（下載當下記憶體、無歷史版本），需先做定時 Cache 快照（離線/故障韌性的一部分）。順序＝先定時快照 → 再整理備份。與「離線/故障韌性」（雲端恢復自動補傳、定時快照）同主題一起規劃。
32. **任務批量修改（專案頁，建立閉環衍生）**：溢出層三／第二階成案後，任務的擔當／交付等細節常為空（範本預設），需回專案頁補。決定先成案（提示「時程已排好、細節可稍後在專案頁補」），批量修改獨立另做、不綁進建立閉環。兩種都做：①勾選多筆套同值（如整階段同負責人／同交付）②攤開逐格快填（像 Excel、不逐筆開 modal）。掛專案任務頁「批量編輯」開關。價值不只服務層三，任何批量改任務（換負責人／補交付）都用得到。設計記述見 §8d.10／§8d.9b，本項為待施工指標。優先序：建立閉環＋溢出三層全做完後。
33. **雲端草稿區（建專案第二階，§8d.18.4 定案）**：第二階改到一半可離開、換設備、回來接續。綁 Google 帳號、存雲端（沿用 Apps Script doPost／doGet，非 §8b.4 舊 localStorage 版）。節流上傳（切階段／切案／離開／閒置才傳，改欄位只即時寫記憶體）；一範本一份；登入撈草稿跳「接續／丟棄」；刪除跳嚴重警語；建立成功刪雲端＋本機兩邊釋放空間。前置：Auth 三層已在 main，帳號身分可用。規格見 §8d.18，本項為待施工指標。優先序：建立閉環＋第二階 UI 做完後。

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

**設計文件先行鐵則（最高優先，每 session 預設遵守、不需額外觸發）**
- Claude（對話端）每次新 session／開始對話，先讀本架構文件（單一真實來源：各部分定案、§9 todo、§8d 各節）再回應，不靠使用者提醒。
- Claude 給 Claude Code 的每批施工指令，第一步固定是「先讀相關設計節」（如塊3b 先讀 §4.8.7.5、第二階先讀 §8d.17/§8d.18），把讀文件當指令開頭、非選配。
- 理由：架構文件是唯一規格真實來源，不先讀就動工＝憑記憶施工＝走樣（前科：誤把舊快照當基底刪 400 行、層三讀反、欄位憑空設計）。

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
- 【補 2026-06-20，4-2】平日（工作日）cell 用 --gantt-weekday（中性淡灰）提辨識，與假日暖灰 --gantt-holiday 區隔；假日暖灰、今日紅、週末併假日 維持不變（不推翻原定案）。

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

## 第十三部分：Excel 匯出 + 欄位定義單一來源（2026-06-21 定案）

### 13.1 核心設計：WBS_COLUMNS 欄位定義單一來源

匯出、匯入、未來模糊辨識三者共用一份欄位定義常數 `WBS_COLUMNS`（有序陣列），每欄：
`{ key, header, aliases }`
- key：task 屬性鍵（如 'owner'）
- header：標準 Excel 表頭名（如 '負責人'）
- aliases：模糊辨識用別名清單（如 ['擔當','owner','負責']），本批先空陣列、預留

三方共用方向：
- 匯出：讀 header 寫表頭
- 匯入（未來收斂）：讀 header 取值
- 模糊辨識（未來）：讀 aliases 模糊比對任意 Excel 表頭 → 對回 key

本批只做匯出讀 WBS_COLUMNS；parseWbsExcel 維持現狀 inline（不重構、低風險），加自檢「匯出表頭 ⊆ 匯入認得的名」兜 round-trip。未來模糊辨識填 aliases、parseWbsExcel 改讀常數收斂（另案）。

### 13.2 完整欄位集（24 欄，逐字對齊匯入器）

N／案別／PLM階段／子群組／任務名／類型／前置(N)／工期／負責人／預計開始／預計結束／實際開始／實際完成／進度%／狀態／必須繳付／繳付物說明／風險議題／備註／已交付／繳付連結／繳付件類型／必要任務／繳付物必須發行

**命名不對稱坑（round-trip 必踩）**：匯入讀的是「預計結束」（非「預計完成」）、「實際完成」（非「實際結束」）。匯出表頭必須逐字照抄這組怪名才回得來。WBS_COLUMNS 的 header 以匯入器實際讀的名為準。

### 13.3 id 反解（匯出資料正確性）

- variant id → 案別名：查 proj.variants
- 負責人：直接輸出 task.owner（人名，本就存名）。**不另開部門欄**（dept id 是匯入時從 owner 反查衍生，匯出只出 owner，再匯入自動重算 dept，保 round-trip）
- predecessor id → wbs 序號縮寫（§8d.7 predToWbsFormat，新寫）：
  - 建 id→wbs 反查（t.id→t.wbs，id 全域唯一不分案別）
  - 切 id#FS+2 → 吐 <wbs>FS+2、逗號接（解析邏輯照 prettyPredecessor:1011）
  - N 欄必須輸出 task.wbs 原值（非顯示流水號），否則前置指錯
  - round-trip 安全：§8e.6 前置已限同案別，匯出 wbs 再匯入落回同案別正確 id

### 13.4 前置欄表頭縮寫說明 memo

前置欄在 Excel 顯示成 12FS／16SS+2 縮寫。表頭區加一行 memo 解釋 FS/SS/FF/SF（同第三段前置說明：完成才能開始(FS)/同時開始(SS)/同時完成(FF)/開始才能完成(SF)），讓人看懂縮寫。

### 13.5 階段劃分

**階段一：純資料 round-trip（先做）**
匯出讀 WBS_COLUMNS 寫表頭 + 資料列（id 反解、predToWbsFormat、前置 memo）+ 自檢。驗收：匯出的 Excel 能再匯入、資料對。技術：ExcelJS（已載入 index.html:10），照抄 exportReportExcel（6730）house style。

**階段二：甘特填色（後做，幾乎全後端，有 Node 環境直接做 main、肉眼驗匯出檔、不開 branch、無排程測試項）**
另開「甘特」sheet，左資料欄 + 右時間格填色畫甘特條（MS Project 式）。ExcelJS cell.fill solid + 凍結。
- C1 粒度可選（日/週/月）：匯出鈕彈三選一 → exportProjectWbs(projId, granularity)，只甘特分頁切欄、資料分頁不受影響。欄頭：日 MM/DD、週 MM/DD(週一)、月 YYYY/MM。
- C2 一任務兩列：序+任務名跨兩列 merge，標籤欄分填「計畫/實際」；plan 列 plan 色、actual 列狀態色。
- C3 左側凍結 5 欄（序/任務名/標籤/計畫起/計畫訖，xSplit:5）+ 凍結表頭列。
- C4 列序 _seqOf 全域序（同資料表）。
- C5 假日灰底（週末+國定，讀 DATA.calendars），僅日粒度標（週/月一格含多日不標）。
- 顏色 GANTT_FILL JS 常數（ARGB，§12.8：plan 淺 sage / wip navy / done 綠 / late terracotta / holiday 暖灰）；逾期沿用 §4.6。日期範圍 min(plannedStart,actualStart)→max(plannedEnd,actualEnd)。
- 實作分段：①粒度UI+日期範圍切欄純函式 ②甘特sheet骨架(兩列/merge/凍結) ③填色條+狀態色 ④假日灰底。

### 13.6 入口

專案頁「匯出 Excel」鈕（單專案、該專案 variants 當案別欄）。總儀表板全專案匯出後議。

### 13.7 聯動

模糊匯入辨識（§9-xx）與匯出是同一組「欄位↔表頭」對應的兩向，共用 WBS_COLUMNS。做模糊辨識時填 aliases、parseWbsExcel 改讀常數，匯出不需再改。

---

## 第十四部分：雲端寫入授權收斂（廢 token + JWT 綁登入）（2026-06-22 定案）

> 動工前此節必須先 commit。後端改授權咽喉＝最高風險，照 §8f 鐵則：改前備份、新部署測試 URL 驗完再切正式、獨立 session 做。

### 14.0 由來與目標

**痛點**：跨裝置同步靠共用 token，每台機器都要手填 URL + token，token 又不能進公開 repo，還要防外洩、輪替——只有開發者自己會用的設計。

**目標**：雲端讀寫驗證從「共用 token」收斂成「Google 登入身分 + 後端白名單」：
- 設定一次（URL 進 config.js）→ 所有裝置、所有人自動套用
- 廢除 token（不再有要保管/輪替的機密）
- 讀與寫都綁登入身分（機密資料不給外人看）
- 四層權限完整接上雲端讀寫

### 14.1 現況（撈證校正）

C 原構想四件，三件已完成：
- ✅ 四層權限判斷：`handleGoogleCredential` 已完整四層，含首登綁定、失敗往 none 倒。
- ✅ Admin 層白名單管理：後端 `ADMIN_EMAILS` 層存在；前端「編輯權限」tab 能管 Editor/Viewonly，走 JWT `setlist/getlists`；`_setList` 拒寫 `ADMIN_EMAILS`（防提權）。
- 🟡 寫入綁登入：半套——名單管理已綁 JWT，但資料同步寫入（upload→doPost）仍用 CHECK_TOKEN。
- ❌ 廢 token：未做。
- ❌ doGet 綁登入：現為公開唯讀、零驗證。

真正剩下的核心：① doPost 改 JWT+role ② doGet 改 JWT+role ③ 廢 token ④ URL 收斂 ⑤ 未登入/過期守衛。

### 14.2 終局資料流

**登入**：Google Sign-In → JWT(credential) → decode email → doGet `?action=role&email=` → 後端比對白名單 → role → `Auth._idToken = credential`（in-memory，不落地）→ 分流：super/admin/editor→編輯 / viewonly→唯讀 / none→擋。

**讀（download）**：前端帶 id_token → doGet → 驗 JWT + `_roleOf` → role ∈ {super,admin,editor,viewonly} 才回 data；否則擋。

**寫（upload）**：前端帶 id_token → doPost → 驗 JWT + `_roleOf` → role ∈ {super,admin,editor} 才 `_writeData`；viewonly/none 擋。

token 從此不存在於任何路徑。

### 14.3 四層權限 × 讀寫矩陣（終局）

| 角色 | 登入 | 讀 doGet | 寫 doPost | 管白名單 | 管 Admin 層 |
|---|---|---|---|---|---|
| SuperAdmin | Google | ✅ | ✅ | ✅ Editor/Viewonly | ✅（唯一能設 Admin）|
| Admin | Google | ✅ | ✅ | ✅ Editor/Viewonly | ❌（前端藏＋後端擋）|
| Editor | Google | ✅ | ✅ | ❌ | ❌ |
| Viewonly | Google | ✅ | ❌（咽喉擋）| ❌ | ❌ |
| 不在白名單/未登入 | — | ❌ | ❌ | ❌ | ❌ |

**雙層控制鐵則**：前端依 role 藏 UI + 後端依 role 擋 API。前端藏不算數，後端必驗（`_setList` 拒寫 ADMIN_EMAILS 即此原則實作）。

### 14.4 改檔清單

**後端 .gs：**
- doPost 寫入路（174-178）：移除 ENABLE_TOKEN/CHECK_TOKEN → 驗 id_token JWT + `_roleOf ∈ {super,admin,editor}` 才 `_writeData`。
- doGet 資料路（非 role 分支）：公開回 data → 要求 id_token + `_roleOf ∈ {super,admin,editor,viewonly}` 才回 data。`action=role` 分支維持。
- 移除 ENABLE_TOKEN、CHECK_TOKEN（21-22）。

**前端 app.js：**
- upload（255）：`payload.token` → `payload.id_token = Auth._idToken`；無 _idToken 不送、往 fail 倒、提示重登。
- download（303）：改帶 id_token；無則擋。
- localCloudCfg（321）：移除 cloudSyncToken 鍵。
- cloudSyncToken config 預設（95）：移除。
- 設定頁「同步 Token」input（8154-8160）：刪 UI。
- saveSettings/cloudUploadNow/cloudDownloadNow/cloudTestConnection 讀 ctEl（8362-8417）：刪。
- auto-upload 守衛（scheduleUpload/debounce）：加「!Auth._idToken → 不打」。
- URL 收斂：cloudSyncUrl 與 ROLE_CHECK_URL 合一（一個 CFG、一個欄位）。

**config：**
- config.local.js 的 SYNC_TOKEN：手動清。
- 收斂後 URL 進 config.js（入版控、全裝置共用）。

### 14.5 分階段執行（每階段獨立 commit、線上實測、可回滾）

**階段 1（後端，獨立 session、最高風險）— doPost 改 JWT**
- doPost 寫入路：CHECK_TOKEN → JWT+role。
- 建新部署（保留舊部署當回滾退路），測試 URL 驗：editor/admin 帶 id_token 能寫、viewonly/none 擋。驗過才往下，不切正式、不動前端。
- 回滾：前端仍用舊部署（token 制）照常。
- ✅ 已驗（2026-06-22）：後端無憑證寫入擋、superadmin 帶憑證寫入 ok。

**階段 2（前端）— upload 改帶 id_token**
- upload：token → id_token；加未登入守衛。前端指向階段1新部署，線上實測：登入能寫、未登入不狂打。
- ✅ 已驗（2026-06-22）：真登入 auto-upload 成功、無憑證靜默跳過。

**階段 3（後端+前端）— doGet 綁登入**
- doGet 資料路：公開 → JWT+role。download 帶 id_token + 未登入守衛。
- 線上實測：白名單內登入能看、外人/未登入看不到。
- ⚠ 相容：此後「同事看資料也要登入+白名單」（定案接受）。
- ✅ 已驗（2026-06-22）：無憑證讀擋（Missing id_token）、superadmin 帶憑證讀 ok、登入後自動拉雲端。

**階段 4 — URL 收斂進 config.js**
- cloudSyncUrl + ROLE_CHECK_URL 合一，URL 進 config.js（公開、不含機密，token 已廢）。
- 驗：新裝置不設定、登入即讀寫。
- ✅ 已驗（2026-06-22）：URL 收斂 BACKEND_URL、設定頁/F12 讀寫走單一部署正常。

**階段 5 — 廢 token 殘骸**
- 清 14.4 token 全清單（前端 + 後端 ENABLE_TOKEN/CHECK_TOKEN）；config.local.js 清 SYNC_TOKEN。
- 驗：全套無 token、讀寫正常。
- ✅ 已驗（2026-06-22）：token UI/死碼清除、設定頁無 token 欄、讀寫照常、cloudTestConnection 改 id_token。

**階段 6 — 跨裝置/多角色實測**
- SuperAdmin/Editor/Viewonly/外人 各帳號實測讀寫權限正確。
- 公司+家裡+github.io，無需設 token、登入即用。
- ✅ 已驗（2026-06-22）：superadmin 讀寫/admin 名單管理、editor/viewonly、外人擋，跨裝置線上驗通。

### 14.6 已知邊界與擴充接縫

**已達成（撈證確認）：**
- 權限邊界：`_setList` 拒寫 ADMIN_EMAILS，Admin 不能提權。
- 第一個 Admin：首登綁定 + SUPERADMIN_EMAIL（建站者 email，存後端 Script Properties、不入公開 repo），由 SuperAdmin 設 Admin。

**留接縫、現在不做：**
- 多人覆蓋衝突：upload 仍整碗覆蓋。架構留 `_uploadedAt` 時間戳，未來加「後端衝突檢查 API」即可，前端寫入結構不變。現階段人少、不同時改，不做。
- 其他登入 provider：驗證身分抽象為「取得可信 email」。現為 Google JWT；未來加 Yahoo/微軟＝多一個取 email 來源，後端白名單比對不變。`handleGoogleCredential` 流程設計上不綁死 Google。

**記著、可接受：**
- 移除白名單的人，到「下次操作被後端擋」才生效（非即時斷線）。
- 最高權限保護：SUPERADMIN_EMAIL 在 Script Properties 寫死、白名單 API 不碰，天然防移除唯一最高權限。

### 14.7 新站 SOP（終局）

1. SuperAdmin 建 Google Sheet。
2. 部署 Apps Script，設 SUPERADMIN_EMAIL = 建站者。
3. URL 填進 config.js、push。
4. 所有裝置/所有人：開站 → Google 登入 → 自動套用權限，無需設 URL/token。
5. SuperAdmin 在「編輯權限」tab 設 Admin/Editor/Viewonly；Admin 之後自管 Editor/Viewonly。

### 14.8 Admin 層白名單管理（2026-06-22）

承 §14.3 矩陣「管 Admin 層」——SuperAdmin 可在前端設定頁直接增刪 Admin 白名單（原本只能進後端 Script Properties 手設）。

- **後端（雙閘，防提權/防洩）**：`_setList` keyMap 加 `admin → ADMIN_EMAILS`，但 `listType==='admin'` 時限 `auth.role==='superadmin'`（一般 Admin 改 admin 名單 → Forbidden，防自我提權）；`_getLists` 僅 superadmin 才回 admin 名單（不洩給一般 admin）。`auth.role` 來自 Google tokeninfo 驗過的真 email，前端偽造不了。
- **前端**：設定頁「編輯權限」tab 加 Admin 組（`wl-admin-input`/`wl-admin-list`），`${isSuperAdmin() ? ... : ''}` 條件 render——僅 SuperAdmin 看得到容器；新增 `isSuperAdmin()` helper；`Auth.renderLists`/`_drawLists` 擴 admin；`addToList` 互斥由二元改三方（一 email 只能在一名單）。
- **雙層控制**：前端條件 render 是第一層、後端 role 閘是真閘——非 super 偽呼 `addToList('admin')` 仍被後端擋。
- ✅ 已驗（2026-06-22）：SuperAdmin 能增刪 admin 名單、一般 admin 看不到也改不了、editor/viewonly 名單管理回歸正常。

---

## 第十五部分：Excel 匯入收斂 + 資料管理歸位（2026-06-23 定案）

> 動工前此節必須先 commit。本節橫跨多項決策：Excel 匯入兩入口語意釐清、同名告警＋並存版本、專案頁覆蓋匯入、資料管理按鈕歸位、廢除清除重複。
> 相關現況：§7（匯入器欄位/整碗覆蓋）、§之八.3（兩入口同名處理差異，1137-1138）、§13（WBS_COLUMNS）。

### 15.0 由來與目標

**由來**：系統現有兩條 Excel 匯入路徑，同名處理完全相反（§之八.3 已載）——設定頁「匯入 WBS」（performWbsImport）同名即清舊重灌；新增專案 Excel 路線（_stage2Commit）永遠新建、無同名判斷。語意打架、入口分散，是「設定亂、不知道用哪個」的典型。

**目標**：按「使用者意圖」收斂成兩個明確入口，而非按技術路徑。同時把放錯層的按鈕歸位（針對專案的操作不放全域設定），廢除判斷不可靠的清除重複功能。

**核心原則**：兩入口對應兩種真實意圖（建新專案 vs 更新當前專案），不是冗餘；該收斂的是「放錯層的入口」，不是「合併成一條」。

### 15.1 兩入口分流（按使用者意圖）

| 意圖 | 入口 | 行為 | 同名處理 |
|---|---|---|---|
| 建一個新專案 | 新增專案 Excel（modal，現有） | 新建 fresh id 專案 | 偵測同名 → 告警 modal（取消／建立新版本並存） |
| 更新「這個」專案 | 專案頁 header「覆蓋匯入」鈕（新增） | 覆蓋當前專案：清舊重灌 | 不問同名（明確就是要蓋當前這個） |

設計理由：使用者要覆蓋某專案，直覺是「進那個專案 → 覆蓋它」，不是「去新增專案選同名 Excel」。故覆蓋入口放專案頁，符合直覺。

### 15.2 同名告警 ＋ 並存 V1/V2（新建路徑）

接點：`_stage2Commit`（app.js:5346，現無條件 push）加同名偵測。

流程：偵測 `DATA.projects.find(p => p.name === res.project.name)` → 無同名直接新建（現況不變）；有同名跳告警 modal「已有同名專案『X』」→ 取消回階段三（_renderStage2）／建立新版本則並存（push fresh id 專案，buildWbsPreview 已給 fresh id，零成本），並標記 version（V2/V3…）+ importedAt（匯入日期）。

並存不覆蓋舊版（安全：舊版保留，使用者比對後自行刪舊）。清理靠使用者手動刪，非自動覆蓋。

### 15.3 專案頁覆蓋匯入 ＋ 當前專案帶入 ✅（同名守衛已完成 `1975d6e`）

接點：專案頁 header（buildProjectHeaderHtml，3165-3181），插「覆蓋匯入 WBS」鈕於匯出/編輯專案旁（data-edit 權限）。

行為：選 Excel → 送出前 confirm「即將用此 Excel 覆蓋『X』所有任務，現有任務清空重灌，確定？」→ 確認走 performWbsImport 重灌邏輯（複用 9155-9163），用當前 projId 覆蓋當前專案。覆蓋前比對 Excel projectName 與當前專案名（見下「同名守衛」）。

與新建路徑差異：新建用 Excel projectName（同名告警）；覆蓋用 currentProjectId 鎖定，但加同名守衛：同名才可覆蓋、異名擋死。語意清楚分開、雙路徑不打架。

performWbsImport 改造：加 projId 參數。傳入時用 projId 覆蓋當前專案（跳過 9154 的 name find）；不傳時維持現有 name-based 邏輯（向後相容，但設定頁入口將移除，見 15.4）。

**同名守衛（防拿錯 Excel 誤蓋）**：覆蓋匯入選檔後（parseWbsExcel 拿到 parsed），比對 parsed.projectName 與當前專案名：
- 同名 → 預覽正常、確定鈕啟用 → confirm → 覆蓋。
- 異名（含 Excel 無專案名 fallback 預設值）→ 擋死：預覽區紅字「此 Excel 標示為『X』，無法覆蓋到『Y』」，確定鈕 disabled，只能取消重選。
嚴格比對：覆蓋匯入應使用本系統 exportProjectWbs 匯出的 round-trip 檔（帶專案資訊分頁、專案名正確）。手工製作、無專案名的 WBS 走「新增專案」入口，不走覆蓋。

**文字中性化**：匯入 modal 顯示文字去除「J 系列」專案特定字眼，改中性範本用語（「既有任務」「WBS 任務」「WBS 主檔」），使覆蓋匯入通用於任何專案。功能性 sheet 名比對（'J系列整合WBS' + fallback 取首個非資訊分頁）為相容他人格式之功能，保留不動；無專案名 fallback 預設值由 'J系列專案' 改中性 '未命名專案'。

### 15.4 資料管理歸位

設定頁「資料管理」section 按「作用範圍」歸位：

| 按鈕 | 現況 | 處置 |
|---|---|---|
| 下載 JSON 備份 | 設定頁 | 留（全域） |
| 上傳還原 | 設定頁 | 留（全域） |
| 清除所有資料 | 設定頁 | 留（全域） |
| 已完成清理設定 | 設定頁 | 留（全域規則） |
| 匯入週報 Excel | 設定頁 | 移報告區 toolbar（renderReport 6648 列印旁；週報合併跨專案、純搬位置） |
| 匯入 WBS Excel | 設定頁 | 移除（覆蓋功能搬專案頁 §15.3、新建功能在新增 modal；設定頁不再有此入口） |
| 清除重複任務 | 設定頁 | 廢除（刪函式 9612-9684 + 鈕 8212 + 說明 8218） |

廢除清除重複理由：判斷重複的邏輯（project|name 同即重複）不可靠、易誤刪；治本方案（刪專案重灌/覆蓋匯入）已存在且更可控；留著是邏輯不清的危險按鈕。符合最高原則（不重複、乾淨）。

### 15.5 project schema 補欄位 + sidebar 顯示

並存 V1/V2 需 project 物件新增欄位（現 schema：id/name/color/note/synced/createdAt/depts/variants，無版號/日期）：version（版號 V1/V2…，並存時遞增）、importedAt（匯入日期）。

version/importedAt 是 project 物件的巢狀欄位，跟著整個 project 物件序列化自動持久化（Storage.save/CloudSync upload 序列化整個 DATA.projects 陣列、download 整陣列替換）。無需「持久化四步」或 download 防坑——那是 top-level DATA.X key 的防護（舊 blob 缺 key 會出問題）；巢狀欄位舊 blob 只是缺欄 → undefined → 顯示當 V1/無日期，零資料損失。

version/importedAt 在 _stage2Commit 落地時寫（preview 會反覆重繪不適合）：無同名 → version=1；同名 → version = max(同名現有 version, 預設1) + 1；importedAt = 匯入當下時間。覆蓋匯入（performWbsImport）時更新 importedAt（重匯刷新），version 不變（仍同一專案）。

sidebar 顯示（renderSidebar 2243-2250，現只有色點+名稱+未完成數）：同名專案在名稱下方副標顯示版號（V1/V2）+ importedAt，讓使用者辨識前後版本。非同名專案可不顯示（避免雜訊），或僅同名群組顯示版號。

### 15.6 施工分段（每段獨立 commit、逐一核 diff）

✅ **段1（純搬移/刪除，最低風險）— 資料管理歸位 + 廢除清除重複**（已完成 `8d542c3`）：廢除清除重複（刪 9612-9684 + 鈕 + 說明）、匯入週報鈕設定頁→報告區、設定頁「匯入 WBS」鈕移除、設定頁資料管理只留全域四項。

✅ **段2（動匯入核心，中風險）— 專案頁覆蓋匯入**（已完成 `ed606ad`）：performWbsImport 加 projId 參數（覆蓋當前專案、跳過 name find；不傳維持現有，向後相容）、專案頁 header 加「覆蓋匯入」鈕 + confirm 警告。線上驗：專案頁覆蓋當前專案、不誤灌別的。

✅ **段3（動新建流程，中風險）— 同名告警 + 並存**（已完成 `9136fcc`）：_stage2Commit 加同名偵測 → 告警 modal（取消/建立新版本）、並存 fresh id push + version/importedAt。線上驗：同名→告警、並存產生 V2。

✅ **段4（UI 顯示，低風險）— 版號欄位 + sidebar 顯示**（已完成 `b9b8c72`）：project 加 version/importedAt（巢狀欄位自動持久化，無四步/無 download 防坑顧慮）、sidebar 同名專案顯示版號 + 日期（純 UI 層）。線上驗：sidebar V1/V2 + 日期正確、跨裝置不掉欄位。

> 段2/3 動匯入核心（重灌/新建邏輯），逐行核 diff；段4 為純 UI 顯示層（sidebar 版號）、低風險——schema 巢狀欄位隨整物件序列化自動持久化，無 download 防坑顧慮。

> **破壞性測試紀律（覆蓋匯入、清資料等會刪改既有資料的功能）**：走本機 Dev 驗，不直接 push 上正式環境驗——file:// + DEV 身份 + 關閉雲端同步 + 測試專案/測試 Excel，驗過再 push。避免破壞性測試污染正式環境/雲端資料。（教訓：曾在 github.io 線上測覆蓋匯入，誤覆蓋正式專案資料。）

---

## 第十六部分：專案頁 header 重排 + 配色分層（2026-06-23 定案）

> 動工前此節先 commit。專案頁 header 操作鈕重排 + 三層色彩語言（導航/匯出/危險各自獨立色），避免整片綠視覺疲乏、操作鈕被忽略。CSS 改前 mockup 已確認。

### 16.1 由來
原 header 5 鈕全 ghost（無主次、無危險標示），且匯出攤成「日/週/月」3 鈕（實為同一匯出的甘特刻度三選一）。問題：操作鈕跟四視圖都偏綠 → 視覺疲乏、操作鈕融入背景被忽略；覆蓋匯入（破壞性）跟日常鈕平排無警示。

### 16.2 位置（照業界標準）
- 操作鈕：標題列右側（專案名同列）
- 四視圖膠囊：標題列下方一列
- 依據：標題列=頁面層級操作（對整個專案）、四視圖=內容層級（控制下方顯示），控制項靠近被控制內容。參考 Notion/Linear/GitHub/Asana header 慣例。

### 16.3 三層色彩語言（語意獨立、避免疲乏）
| 角色 | 色 | 變數 | 套用 |
|---|---|---|---|
| 導航選中 | 陶土橘 | --nav-active #C4633E（新增，scoped .view-tabs-bar .tab-btn.active）| 專案四視圖選中態 |
| 匯出主鈕 | 深墨灰 | --ink-btn #3A332A（新增，.tb-action.ink）| 匯出 Excel ▾（較常用，主操作）|
| 危險鈕 | 更紅 | --danger #B84A3E / --danger-d #9E3A30（新增）| 所有 .tb-action.danger（覆蓋匯入/刪專案/清資料統一）|
| 次要操作 | ghost 描邊 | 沿用 | 編輯專案、⋯ |

不動：--terracotta（系統警示色 ~50 處）、--clay（#8B7355 棕，5 處用途）。新增變數與既有 terracotta/clay 語意分離、互不干擾。

scoped 約束：--nav-active 僅 scoped `.view-tabs-bar .tab-btn.active`，不動全域 .tab-btn.active（設定頁/總儀表板 tab 維持 sage）。

### 16.4 操作鈕配置
`測試-豐富專案J  [匯出 Excel ▾]（深墨灰主鈕） ｜ [編輯專案]（ghost）  [⋯]（ghost）`
- 匯出 Excel ▾：深墨灰主鈕，點擊展開下拉（三刻度）
- 編輯專案：ghost 次要
- ⋯ 更多：ghost，內含「覆蓋匯入」（--danger 磚紅 + 危險小字）
- **隔線分組**：[匯出 Excel ▾] 與 [編輯][⋯] 之間插豎隔線（`<span class="hdr-divider">`，1px var(--rule2)、高 ~22px），語意分「匯出（讀）」與「編輯/⋯（操作）」兩組，視覺區隔讀/寫意圖。

### 16.4b 四視圖分段控制（隔線）
四視圖膠囊改 segmented control 樣式（解決原未選鈕透明、四鈕糊在一起、看不出有四個可切項）：
- 鈕間細豎線：`.view-tabs-bar .tab-btn:not(:last-child)::after` 1px var(--rule2)，把四鈕視覺切成四格。
- 選中鈕（.active，--nav-active 陶土橘）兩側隔線隱藏（選中格獨立、不被線切）。
- 容器沿用 .tabs 米底膠囊（--surface2）+ 圓角，四格在內分段。

### 16.5 匯出下拉
標題「匯出完整 WBS Excel（含專案資訊 + 甘特圖分頁）」，三選項：日刻度/週刻度/月刻度（右側差異小字「甘特每日/週/月一欄」），各呼叫 exportProjectWbs(id, granularity)。日/週/月僅改甘特分頁刻度，資料分頁相同。

### 16.6 覆蓋匯入收進 ⋯
覆蓋匯入（破壞性）收進 ⋯ 更多選單：平常藏（header 清爽）、點開才見、--danger 磚紅 + 「危險」小字標示、防誤觸。呼應 §15.3 異名擋死（防誤蓋）。

### 16.7 施工分塊
✅ 塊1 :root 新增 --nav-active/--danger/-d/--ink-btn（純加變數）`35f6f80`
✅ 塊2 .tb-action.ink variant + .tb-action.danger 改引 --danger（CSS）`35f6f80`
✅ 塊3 .view-tabs-bar .tab-btn.active scoped --nav-active（CSS scoped）`35f6f80`
✅ 塊4 buildProjectHeaderHtml 重排（HTML）`2a9b992`
✅ 塊5 ⋯ 更多選單 + 匯出下拉元件（HTML+CSS+JS toggle，z-index --z-dropdown、點外關閉）`2a9b992`

---

## 附錄：完成的 commit

**2026-06-23（§15 Excel 匯入收斂 + §16 header 重排，基準 HEAD `c3ff595`）：**
- `82feb84` §15 設計（Excel 匯入收斂 + 資料管理歸位）
- `8d542c3` 段1 資料管理歸位 + 廢除清除重複
- `98f7068` 雲端同步失敗通知（upload alert + download toast，一次性旗標防風暴）
- `ed606ad` 段2 專案頁覆蓋匯入（performWbsImport + projId）
- `534c8c4` §15.3 同名守衛異名擋死 + 文字中性化（文件）
- `1975d6e` 覆蓋匯入同名守衛（異名擋死）+ 文字中性化（code）
- `aefbab7` §15.5 巢狀欄位自動持久化 + version 寫入規則
- `9136fcc` 段3 新建專案同名告警 + 並存版本（三模式齊全）
- `b9b8c72` 段4 sidebar 同名專案顯示版號 + 日期
- `5f3ba76` §16 設計（header 重排 + 三層配色）
- `3db41d1` §16 補操作鈕隔線分組 + 四視圖分段控制
- `35f6f80` §16 塊1-3 header 三層配色 CSS 打底
- `2a9b992` §16 塊4-5 header 重排 + 匯出下拉 + ⋯選單
- `c3ff595` U.toast 加 {duration,closable} + 覆蓋匯入成功自動關 modal + 清多餘 btn.disable
- 基準 HEAD：`c3ff595`

**2026-06-20（共用表格規範 .data-table，§8g 治本主線）：**
- `dcae482`/`0804c8a` 待辦 subgrid 步2 + 剩餘空間分散 `[unverified]`
- `f8c539f` docs：第八部分之七 規範定案（統一 `<table>` 路線①）
- `0e4feda` 步1 地基（:root token + .data-table + 4 欄類型 class，dormant）
- `a25ef64` docs：§8g 補強（col/td 兩用 + ISO 日期歸 col-mid + 遷移序）
- `8651a4e` 步1.5 colgroup 寬度 CSS（col.col-* 接 token）
- `504510c` docs：Path X 排除 rp-table + 試金石改 WBS 單表
- `2b182ed` 步2 試金石：WBS 匯入預覽套 .data-table（已線上驗通：深 sage 表頭/五欄對齊正常）
- `968aa96` 步3-B1：.data-table.compact + .col-wrap CSS（dormant）
- `c3ebc3e` 步3-B2a：Excel 匯入預覽套 compact `[unverified]`（匯入流程才顯示，同 WBS pattern）
- `e578080` 步3-B2b：任務史套 compact + col-wrap（本週工作/預計完成兩欄）`[unverified]`（需有歷史紀錄才顯示）
- `d438fd2` 步4：公休日表 .cal-row div-grid → .data-table（年份分組 tbody + colspan 年份列 sticky + cal-table 專屬 zebra）已線上驗通
- `f21853a` docs：附錄補步3+步4 進度
- `b9c5203` docs：§8g 規範改版—固定欄寬→內容自適應（table-layout auto）
- `88fd204` 一+二階段 auto：CSS 主體 fixed→auto + 四文字表（WBS/Excel/任務史/cal）拔 colgroup
- `74e362d` 步5 重做：s2-tbl 原始 inline 直接做 auto（取代已 revert 的 fixed 步5）
- `0b0e3be` s2-tbl 需交付欄改靠左
- `8037a0c` s2-tbl 列間插入元件 .dt-insert-row（通用，待辦共用）+ 操作欄收尾（B）
- `2e0c612` 步6：待辦 task-grid div→table + auto 欄寬自適應（§8g.8 死碼清 :root 三寬度 token；進度條/時程/狀態欄距調勻）
- 基準 HEAD：`2e0c612`；版號 app.js `?v=20260620-12`、style.css `?v=20260620-16`。**§8g 共用表格規範全部完成**：五張表 + 待辦全遷 auto、通用 .dt-insert-row、死碼清光。下一步轉非表格主線（見 §9）。

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

