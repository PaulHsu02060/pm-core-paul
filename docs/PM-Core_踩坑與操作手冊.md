# PM-Core 踩坑與操作手冊

> 本檔記「踩過的坑」：現象 + 根因 + 暫繞法 + 根治方向。與規則類文件分工：
> - 硬規則（commit-gate / CRLF / 一次一件）看 `docs/AGENT_GATE.md`。
> - 架構單一真實來源看 `docs/pm-core-architecture.md`。
> - 本檔只記「曾經出事、容易再犯」的操作層教訓，供換 session / 換機時快速避雷。
> 每節格式固定：現象 → 根因（附 app.js 行號）→ 暫繞法 → 根治方向 → 操作提醒。

---

## 坑 1：清空 localStorage 後髒專案 reseed（migration 旗標連帶被清）

**現象**
開發機為了測「乾淨初始狀態」而清空 localStorage、重整頁面後，畫面不是空專案，
反而冒回髒專案（含舊 J 系列、約 105 筆 WBS task 的舊資料）。越想清乾淨越髒。

**根因（已查證，附行號）**
- migration 旗標存在 `DATA.settings._migrations`（app.js:596-597），而 `DATA.settings`
  整包持久化到 localStorage（`STORE.settings`）。
- 清空 localStorage = 把 `_migrations` 旗標一起清掉 → 下次 init `!M.pdcaMerge_v1`、
  `!M.pdcaInitialData_v1` 都成立 → 兩個 migration **重跑**。
- `pdcaMerge_v1`（app.js:600-639）裡 `SEED('projEnsure')`（627-635）：專案名不存在
  就用種子重新 `push` 一個專案；`projMerges` / `projDeletes` 同樣吃 SEED 規則改資料。
- `pdcaInitialData_v1`（app.js:644 起）：用 `SEED('INIT')` / `SEED('KEYWORDS')`
  補 pdcaData / group meta + 依關鍵字自動歸類 task。
- ⚠ Storage.load 本身（app.js:144）讀 `localStorage.getItem(STORE.projects) || '[]'`，
  空就空、**不灌 SEED**。真正把種子灌回來的是上面的 migration，不是 load。

**⚠ 未查證（不臆測）：task 層 105 筆的來源**
app.js 的 `SEED()` 只種 recurringMeetings / cleaningDefaults / projMerges / projDeletes
/ projEnsure / INIT / KEYWORDS，**沒有 `SEED('tasks')`**；`projEnsure` 只建空專案、
不帶 task。故「105 筆 J 系列 WBS」的 **task 層 reseed 來源在 app.js migration 之外**，
可能是：①`seed.local.js` 帶 task 種子 ②J 同步 `syncJSeries` 重新拉 ③清空時 `STORE.tasks`
其實沒被真正清掉。此項**待實測確認**，先不寫死根因。

**暫繞法（已用，未根治）**
`DATA.projects = []` 後 `Storage.save()`，把空專案陣列寫回 localStorage。
只是覆蓋掉當下的髒專案，**沒有阻止 migration 重跑**、也沒清 task 層；
下次再清 localStorage 一樣會 reseed。

**根治方向（待議，未動工）**
- (a) migration 旗標移出 localStorage（或另存一支不被「清 localStorage」連帶清掉的 key）
  → 清資料不等於重置 migration。
- (b) migration 入口加「使用者已主動清空」哨兵：偵測到明確清空意圖就不重 seed。
- (c) 先釐清 task 層 105 筆的真正來源（見上「未查證」），對症再決定。

**操作提醒**
開發機要測乾淨初始狀態時，「清 localStorage」目前不夠乾淨、反而招髒。根治前，
清完要手動確認專案 / task 是否被 migration 灌回，必要時連 `STORE.tasks` 一起檢查。

---

## 坑 2：非 admin 按「儲存設定」崩潰（被 isAdmin 條件 render 的欄位讀 null）

**現象**
非 admin（view-only 或一般編輯者）在設定頁按「儲存所有設定」沒反應 / 崩潰，
`Storage.save` 根本跑不到——按了像當掉。

**根因（已查證，附行號）**
- jSheet 同步欄位（`set-url` / `set-st1` / `set-st2` / `set-autosync`）放在
  `settings-jsync` 區塊，被 `isAdmin()` 三元條件 render（app.js:6529 起）。
  非 admin 時這些元素**根本不在 DOM**。
- 舊 `saveSettings` 前段直接 `document.getElementById('set-url').value` 讀這些欄位
  → 元素為 `null` → 讀 `null.value` 觸發 **TypeError** → 函式中斷 →
  後面的 `Storage.save()` 整個跑不到 ＝ 「按了沒反應」。

**暫繞法**
無（已根治）。

**根治（已做，commit `face34a`）**
- 前段欄位讀取改用 helper `sv(id)`（app.js:6831）：`const e = el(id); return e ? e.value : null;`
  ——元素不存在回 `null`，呼叫端 `!== null` 才寫入、`null` 跳過保留原值。
- set-url … set-retention 一連串欄位（app.js:6833-6849，共 **15 處** sv 守衛）全套此 pattern。
- `workDays` 特殊處理：改用 `dayPills` 容器存在判斷（app.js:6844-6845），容器在才讀 pill。
- 效果：非 admin 缺欄位時安全跳過、不炸，Storage.save 正常執行。

**操作提醒**
被 `isAdmin()` / 權限條件 render 的欄位，任何「一次讀所有欄位」的 save 函式都要防 `null`
（元素可能不存在）。「DOM 元素被條件渲染、save 卻假設它一定在」是本專案反覆出現的坑
（同類：架構文件警告過 DOM 移除 → 裸讀 null crash，如任務表單實際執行區 DOM 永遠保留的設計）。

---

## 坑 3：cleanOldDoneTasks 每次 init 硬刪 done 任務（PLM 工期制任務被誤刪）

**現象**
PLM 專案任務（WBS 匯入 / 手動建）標「已完成」後，過了 30 天，下次開頁／重整就
從待辦清單消失——且**不進「已刪除」區、不可還原**（永久消失）。

**根因（已查證，附行號）**
- `cleanOldDoneTasks`（app.js:859-872）在 `init()`（app.js:1959，`Storage.load` 之後）
  **每次載入就跑**。
- 它把 `status==='done'` 的任務，`completedAt` 超過 `doneRetentionDays`（預設 30 天）者
  從 `DATA.tasks` **filter 掉（真刪除）+ Storage.save**——非 `_deleted` 軟刪除、不進
  已刪除區、不可還原。
- 豁免原本只有 `if (t.synced) return true`（app.js:867，J 系列同步任務）。**WBS Excel 匯入
  （performWbsImport，未設 synced）+ 手動建任務（synced:false）都不豁免 → done 超 30 天
  被硬刪。**
- 顯示層「完成超過 N 天自動清除」tip 文字準確，刪除是真的、不是裝飾。

**暫繞法**
無（已根治）。

**根治（已做，commit `2243ae9`）**
- `cleanOldDoneTasks` 在 synced 豁免之後加一行
  `if (t.measureType !== 'hours') return true;`——**工期制（WBS / 手動專案任務）永不
  自動清除，只清時段制雜事**（`measureType==='hours'`）。
- 一併移除待辦頂部 toggle bar 的「自動清除」tip（工期制不清、文字會誤導）。
- 效果：工期制 done 任務永久保留；只有時段制 done 超 N 天才清。

**操作提醒**
- 任何「掃 `DATA.tasks` 做 filter + Storage.save」的清理函式都是**真刪除、永久**——
  改它前先確認豁免條件涵蓋了所有「不該被刪」的任務類別。
- cleanOldDoneTasks 跑在**每次 init**，威力放大（每次開頁就掃），動它的豁免要特別謹慎。
- 線上驗法：建一筆工期制 done 任務、把 `completedAt` 改成超過 30 天前、重整頁面 →
  確認**不被刪**；時段制雜事 done 超期則仍會清。

## 範本引擎實作踩坑（2026-06-15）

- **TDZ（暫時死區）**：`App.xxx = function` 賦值語句不能放在 `const App` 宣告之前，瀏覽器載入到該行時 App 還在 TDZ →「Cannot access App before initialization」→ 整檔中斷。`function foo(){}` 宣告式會 hoist 不受影響。教訓：對 App 的賦值一律放 `const App` 宣告之後。node --check + 測試都抓不到（只執行期現），靠線上實測抓。2026-06-22 Excel 匯出 predToWbsFormat 再犯，症狀＝卡登入頁（init 中斷→checkLoginState 沒跑→loginOverlay 不隱藏）。辨識：本機突然卡登入頁、DEV 面板消失＝載入崩潰。
- **latent bug（未選案別全生成）**：applyTemplate 案別迴圈 `selected=null` 時全 included，userInput 沒給的案別會全階段生成。補 `if(!uiCase) return`。測試若每個案別都涵蓋會漏此縫，接線只傳主案才暴露。
- **deleteProject sidebar 殘留**：刪完只 showPage 沒重繪 sidebar → 舊按鈕殘留。補 refreshAll（showPage('dashboard')先設currentPage，避開 renderProject null 自動跳第一個專案）。純顯示殘留，F5 會消失。
- **範本建模（備料缺前置）**：後段備料無前置→CPM順推全 day1 起跑（假象）。靠真範本 sanity（非單元測試）抓出，補跨階段前置修正。

## 坑 4：node 大改後 commit，CRLF blob 與 LF 歷史不一致 → diff 爆量（2026-06-20）

**現象**
node 腳本大量改檔後 commit，diff 爆量——~150 行真實改動卻顯示 `9418 insertions / 9406 deletions`（幾乎整檔每行都算改）。

**根因**
commit 把 app.js/style.css 存成 **CRLF blob**，與 repo 歷史不一致。本 repo `core.autocrlf=true`、無 `.gitattributes`：blob 一律 **LF**（工作檔簽出才轉 CRLF），歷史各版 app.js 都 LF。某次 commit 存成 CRLF（`git add` 沒正常化，`--renormalize` 也不一定生效）→ 整檔 LF↔CRLF flip 充當「每行改動」。
⚠ 危害不只難審：CRLF blob 被別台 `pull` 簽出時（smudge LF→CRLF）可能雙重加 CR、檔案損壞。

**偵測**
`git diff --cached --ignore-all-space --shortstat`——若 ignore-space 後行數驟降（9418→166），就是 CRLF/LF flip 噪音、非真實改動。

**修法（push 前攔下）**
1. `git reset --soft HEAD~1`（保留改動）。
2. 手動把工作檔 CRLF→LF（node：`readFileSync(f,'latin1').replace(/\r\n/g,'\n')` 寫回）。
3. `git add` → 確認 blob 是 LF（`git show :app.js | file -` 不含 CRLF）+ `--shortstat` 降回真實行數。
4. 重新 commit。
5. 工作檔 smudge 回 CRLF：`rm <檔> && git checkout -- <檔>`（跨機工作區一致）。

**鐵則**
push 前 diff 行數異常膨脹，先 `--ignore-all-space --shortstat` 確認；八成是 CRLF flip，**手動轉 LF 再 add 最穩**（別賭 `--renormalize`）。

## 坑 5：Edit 整段替換 old_string 沒涵蓋完整 → 新舊並存（2026-06-20，給 Claude Code）

**現象**
用 Edit 工具整段替換 render/函式時，`old_string` 常沒涵蓋完整舊段 → 替換後新舊並存：兩個 `const userInput`（重複宣告 SyntaxError）、兩套部門 UI（舊 inline + 新元件）。

**根因**
old_string 只匹配舊段一部分，新內容疊後面、舊段殘留。整段 render（含巢狀 `${}`/template literal）尤其框不全。

**正解**
大段替換**改用 node 腳本**：
- `replaceUpTo`（後面固定錨點當邊界、吃掉中間整段）或 `replaceSpanIncl`（含頭含尾整段換），每錨點 `count===1` 守門。
- **dry-run 先印替換結果** + **計數證明**（如替換後 `const userInput` 應=1、舊 class 應=0）確認無並存、無重複，再正式寫。
- Edit 適合**單行/小範圍**；**整段 render/函式換**用 node replaceSpan 才不會框不全。

---

## 坑 6：跳過中間階段→下游階段甘特浮到專案最前面（2026-06-27）

**現象**
第一/第二階段預覽選階段時若**跳過中間階段**（如選 設計／手工機／量產機、跳過 性試機／量試機），
下游階段（量產機）的甘特長條不接在前段之後，反而**浮到專案最前面**（起點＝專案開始日），時間明顯不合理。

**根因**
跳階段時 `applyTemplate` 把指向「被砍階段」的前置剝離（excludedNs → relinkPred 移除）→ 下游階段任務變**無前置**
→ 順推（computeSchedule）時無起算來源、落到專案開始日。Stage 1 forward 模式（只填開始日）與 Stage 2 forward 甘特
都直接吃這個浮位落點。**初版只在 interval／情境C（`_s1ColorStagesForward`）內補了順序鏈、forward 模式漏掉**，故主案（只填開始日）仍浮。

**正解（已根治）**
抽共用函式 `App._chainStages(stages)`：依顯示順序逐段檢查，某段起點若早於前段結束日，就改「接在前段之後」
（保留原工期跨度、idempotent）。三處接入：
- `_s1ColorStagesForward`（interval／情境C）內呼叫 `_chainStages`。
- `_s1ComputePreview` 的 forward／倒推來得及分支（`else`）補呼叫。
- `_s2GanttHtml` 同分流（interval/情境C 走 `_s1ColorStagesForward`、其餘走 `_chainStages`）。
→ Stage 1／2 各排程方向跳階段都不再浮位。

**操作提醒**
排程顯示層若改動「無前置任務的落點」邏輯，務必三個入口（`_s1ColorStagesForward`／`_s1ComputePreview`／`_s2GanttHtml`）一起檢查，
別只補一條路徑。`_chainStages` 假設階段為**循序**（本範本成立）；若日後有真正並行階段，需另議（強制循序會把並行段串成序列）。

---

## 坑 7：Excel 新建專案一進 Stage 2 就爆 TypeError（variant 缺 schedule）（2026-06-28）

**現象**
「新增專案 → 從 Excel 匯入」選檔解析成功（顯示「✓ 已讀取 N 筆任務」），但一按「下一步：檢視任務」就死，
Console 紅字 `Uncaught TypeError: Cannot read properties of undefined (reading 'startDate')`（app.js:`_s2VariantSlack`）。
Dev 端整條 Excel 新建因此完全不能用（檔案本身完全正常——分頁/表頭/8 必要欄都對）。

**根因（已查證，附行號）**
- 範本路徑 `applyTemplate`（app.js:2615）建的案別 variant 形狀＝`{ id, name, schedule:{startDate,endDate,direction}, stages }`。
- Excel 路徑 `buildWbsPreview`（app.js:10952）卻只建 `{ id, name }`，**沒有 `schedule`**。
- Stage 2 餘裕計算 `_s2VariantSlack`（app.js:7022）一連串**直接讀 `v.schedule.startDate/endDate/direction`，無 `|| {}` 防呆**
  → `v.schedule` 為 undefined → 讀 `.startDate` 即爆。（同檔 `_s2GanttHtml` 6837 反而有 `v.schedule || {}` 防呆，故只 slack 爆。）

**正解（已根治，commit `fa6336d`）**
`buildWbsPreview` 的 variant 補上 `schedule: { startDate:'', endDate:'', direction:'forward' }`＋`stages: []`，形狀對齊 `applyTemplate`。
Excel 匯入本來就**沒有「目標上市窗」**，空 schedule 下 `_s2VariantSlack` 自然回 `null`（不顯燈號）＝正確語意；甘特照樣讀任務 plannedStart/End。

**操作提醒**
- 兩條建專案路徑（範本 `applyTemplate`／Excel `buildWbsPreview`）**回傳的 variant 形狀必須一致**——下游 Stage 2 render 同一套，缺欄就炸。日後改 variant 結構要兩邊同步。
- Stage 2 一堆 `v.schedule.X` 是**直接讀、無防呆**（7022/7063/7116…），靠「variant 一定帶 schedule」這個前提撐著；新增任何 variant 來源都要記得帶 schedule。
- 連帶教訓：Excel 新建這條路徑體質弱（舊 `saveProject` 還留過「下一批實作」死 stub、掛在舊版 `_renderStage2`），多案別大檔匯入值得完整走查一遍。

---

## 坑 8：全域原生 `confirm`／`alert`／`prompt` 殘留（醜彈窗破壞一致性，2026-06-29 清零）

**現象**
刪任務/刪專案/登出/清資料/雲端下載/Excel 覆蓋/便利貼…等動作跳瀏覽器原生彈窗（灰底藍鈕），跟全站暖森林綠設計款 modal 落差極大、廉價。

**根因**
散落 **17 個 `confirm`＋2 個 `alert`＋2 個 `prompt`** 沒收斂——原生同步 API 寫起來方便（`if(!confirm())return`），但 UI 醜且不可主題化。

**正解（已根治，commit `858c808`／`5f983ab`／`b4d84a8`）**
全部改設計款彈窗：
- 確認 → `App.confirmModal({title,msg,okText,cancelText,onConfirm,icon,iconBg,iconColor,okClass})`。**同步→非同步**：`if(!confirm())return; X` → 把 X 搬進 `onConfirm`；多重 confirm 串成巢狀 onConfirm（如 `_stage2Commit` 未指派→同名）。單鈕設 `cancelText:null`；危險動作 `okClass:'danger'`。
- 文字輸入 → 新增共用 `App.promptModal({title,label,value,okText,onSubmit})`（textarea＋確定/取消，回值給 onSubmit），取代 `prompt`。
- 提示 → `alert` 改 `confirmModal` 單鈕或 `U.toast`。

**操作提醒**
- **禁再用原生 `confirm`／`alert`／`prompt`**（UI 規範 §0.6）。要確認/輸入一律 `confirmModal`／`promptModal`／`openModal`。
- `confirmModal` 公版**無 onCancel callback**（取消只關閉）；需要「取消也跑事」的（如離開設定頁三選一）改用 `openModal` 自訂 footer 多鈕。
- 大段含 `\n`／`\uXXXX` 字面 escape 的 code 用 Edit 易框不全，改用 node 腳本替換（坑5）。

---

## 坑 9：WBS Excel round-trip 失真——Prod 下載匯入 Dev，兩邊 KPI 值不一樣（2026-06-30）

**現象**
同一份 Prod 匯出的 WBS Excel 匯入 Dev（含「專案 Excel 覆蓋」），J 系列 KPI 跟 Prod 對不上：DONE/DELAYED、WORKDAYS LEFT、部門負荷數字都有差。直覺以為程式算錯或某次改動改壞。

**根因（已查證，附行號）**
WBS Excel 是「**計畫骨架交換**」、**非全狀態鏡像**。匯入 `buildWbsPreview`（app.js:11711）會**重設/重推**多個欄位：
- **狀態編碼對不上（已修）**：匯出走 `cellValue` default 寫**英文內碼** `done/wip/hold`，但匯入 `mapStatus`（app.js:1993）原本**只認中文**「完成/進行/擱置」→ 擱置任務、已完成但沒填實際完成日的任務，匯入後變 `pending`、過期還被誤算逾期 → DONE 變少、DELAYED 變多。
- **scheduledStart/End 強制清空**（11764-65）：智慧排程套用日全丟，`getEffectiveSchedule` 退回 planned → 日期類 KPI（DELAYED/逾期天數/WORKDAYS LEFT 經此）跟著變。
- **urgency 一律設 `med`**（11758）、`estHours`/`completedAt` 重算、手動錨點 `start/end` 清空。
- **dept 依「負責人→部門」重推** `ownerToDept`（11684），**不保留 Prod 的手動 dept**：某任務負責人屬 ME 但 Prod 手動掛「未指派」→ round-trip 改回 ME（總數不變、歸屬移位）。
- **WORKDAYS LEFT** 用 `D.workdaysBetween`（516）**逐日數**、讀**各機自己的** `settings.workDays`＋`DATA.calendars` 假日 → 同一結束日，兩機行事曆/工作日設定不同就數字不同（Excel 不帶設定、不帶行事曆）。

**正解（狀態那半已修，commit 見 §B）**
- `mapStatus` 加認英文內碼 `done/wip/hold`（保留中文判斷，additive）＋匯出 `cellValue` status 改寫**中文標籤**（複用既有 `STATUS_LABELS_ZH`，對上 `mapStatus`、人也看得懂）。狀態自此 round-trip 正確。
- 其餘（scheduled/urgency/dept/行事曆）為**設計上的「重匯入即重排/重推」**，不靠 Excel 帶。

**操作提醒**
- 要 **Prod↔Dev 全狀態一致**：走**雲端同步**（同一 blob，含 `DATA.calendars`，行事曆自動一致）／**JSON 備份下載·還原**（§15.4）／**§17 快照**。Excel 只管計畫骨架，別拿來當狀態鏡像。
- 日後若要 Excel 保留手動 dept，得在 `WBS_COLUMNS` 加「部門」欄、匯出/匯入兩側同步（目前只帶負責人、dept 靠重推）。