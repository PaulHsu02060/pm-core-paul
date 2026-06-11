# WIP 工作筆記：模板系統引擎接線 diff 計畫（feat/template-engine 分支）

> 狀態：**公司桌機查證產物，純計畫、未寫 code、未驗證**。回家用 Node 照此填邏輯、跑 56 cases，綠了才正式寫入架構文件 + merge main。
> 查證日：2026-06-11。行號對 app.js 當前 HEAD（85816db 之後分支基準）。

---

## 第29項：引擎接線到存檔流程（最小改動，建議先做）

### 現況事實（已查證）
- `applySchedule(tasks, scope='full')`（app.js:1190）：內部呼叫 `computeSchedule(tasks)`，mutate `task.scheduledStart/End`，return `{applied, skipped, total}`。scope 目前只實作 `'full'`（整鏈），乙/甲未實作。
- `applyGanttSchedule()`（app.js:4569）：**逐專案** filter `DATA.tasks` by project → `applySchedule(tasks)` → `Storage.save()`(4582) → `renderGantt`。逐專案是因為 wbs 僅專案內唯一。
- `saveNewTask`（app.js:3757）：build task（`scheduledStart/End:''` 在 3787-3788）→ `DATA.tasks.push(task)`(3802) → `Storage.save()`(3803) → closeModal → refreshAll。
- `saveTask`（app.js:3954）：mutate 既有 `t` 各欄 → `Storage.save()`(4003) → closeModal → refreshAll。
- 結論（呼應架構 §4.0）：接線完整，只差「scheduled 從沒被自動觸發寫入」。autospread 缺口就是這兩個存檔點沒呼叫 applySchedule。

### diff 計畫
**插入點**：
- saveNewTask：在 `DATA.tasks.push(task)`(3802) 之後、`Storage.save()`(3803) 之前。
- saveTask：在最後一個欄位賦值（`t.status = newStatus` 4001）之後、`Storage.save()`(4003) 之前。

**要加的行（兩處對稱，照抄 applyGanttSchedule 模式，但只對該任務所屬「單一專案」跑一次，非全部專案）**：
```
// saveNewTask（用 task.project）：
const projTasks = DATA.tasks.filter(x => x.project === task.project && !x._deleted);
applySchedule(projTasks);   // mutate scheduledStart/End，與 DATA.tasks 同參考

// saveTask（用 t.project）：
const projTasks = DATA.tasks.filter(x => x.project === t.project && !x._deleted);
applySchedule(projTasks);
```
- scope 用預設 `'full'`（唯一實作）。
- **不需**額外 `Storage.save()`：applySchedule 只 mutate 記憶體，後面原本就有 Storage.save() 落地。
- applyGanttSchedule(4573) 原本**沒**過濾 `_deleted`；自動重算建議補 `&& !x._deleted`，避免把已刪任務拉進排程鏈（判斷點，與既有甘特行為略不同）。

### judgment-risk（家裡審重點）
1. **每次存檔都 full 整鏈重算 → 會沖掉拖動結果**。applySchedule 規則：錨點(override/manual)跳過不寫，只連動任務寫 scheduled。但第26項「拖動 locked 持久化」未落地（locked 只活在當前 schedule 快照），full 重算會重排所有連動任務 → 拖動結果被沖。**與第26項同源，需先決定是否一起處理，或先接線、拖動另案**。
2. **效能**：大專案（92 筆）每存一筆就跑整鏈 computeSchedule+topoSort。可接受但要知道。
3. **錨點語意 OK**：saveTask 若使用者手填 start（manual anchor），該任務自己被 applySchedule 跳過，下游連動重算 → 符合預期。
4. **循環依賴不炸**：新存 predecessor 造環 → computeSchedule 標 circular、applySchedule 跳過，該任務 scheduled 維持空 → 顯示 fallback plannedStart。可接受。

### 測試影響
- applySchedule/computeSchedule 邏輯不動 → 56 cases 不受影響（仍應綠）。
- 新增的是「呼叫時機」非引擎邏輯。可加整合測試：建任務後連動任務 `scheduledStart` 自動有值（非 `''`）。

### 分級
- 機械（兩處各加 2-3 行）**但** judgment-risk 在「full 重算 vs 拖動持久化」這個語意衝突 → **截 diff 審核**，且家裡實機跑甘特看拖動是否被沖。

---

## 第28項 + §8b.5：前置序號 id 化（[CORE] 大改，分步）

### 現況事實（predecessor 怎麼存，已查證）
全程存「**wbs 序號字串**」，非 id。三處：
- **匯入器** `performWbsImport`（app.js:7031）：單段 forEach 建 task，`predecessor: row.predecessor`(7066) 原樣序號字串（如 `"16FS+2"`）；`wbs: row.wbs`(7060) 存 N 序號。
- **手動建/編輯** `serializePredecessors`（app.js:3535 區）：DOM 列序列化成 wbs 序號字串。候選清單(3485)`filter` **只列「有 wbs 編號」的任務** → 手動任務（無 wbs）不能當前置（§6.4 限制根源）。
- **解析** `parsePredecessors`（app.js:866）：regex `^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$` → dep 是**數字序號字串**。id 是 `U.id()`（非純數字）→ 現 regex 不認 id。
- **比對全靠 `String(t.wbs)`**：
  - `topoSortTasks`(1020)：`nodes.set(String(t.wbs), t)`；edges `nodes.has(String(p.dep))`(1026)；且 1018 先 filter 掉無 wbs 任務（手動任務不進圖）。
  - `computeSchedule`(1108)：`nodes.has(String(p.dep))`；byWbs key=`String(wbs)`；末段(1178-1181)對「無 wbs 任務」特判補進 results。
  - `isTaskBlocked`(920)：`lookup(p.dep)` 查 `allTasksMap[String(wbs)]`。

### diff 計畫（分 A–E 步，每步跑 56）

**步驟 A — 資料層雙軌（不動引擎比對）**
- 任務加 `order`（數字，顯式排序鍵）；`wbs` 保留作顯示流水號。
- 前置改存 id：兩條路——
  - (a) 原地把 `predecessor` 內容序號→id：**否決**，parsePredecessors 的 `\d+` 不認 id 字串。
  - (b) **新增平行欄位 `predDeps: [{depId, type, lag}]`**，`predecessor` 字串保留供顯示/相容。引擎改讀 predDeps。← **建議**，向後相容、可漸進。**需 Paul 拍板 (a)/(b)**。

**步驟 B — 匯入器兩段式**（performWbsImport 7051 forEach 改兩輪）
1. 第一輪：建全部 task 各發 `U.id()`，同時建對照 `wbsToId.set(String(row.wbs), task.id)`。
2. 第二輪：對每筆 `parsePredecessors(row.predecessor)` 的每個 dep（序號）用 `wbsToId` 翻成 depId → 存 `task.predDeps`。
- 注意對照表 key 用 `String(row.wbs)`，與現有比對口徑一致。

**步驟 C — 引擎改比對 id（4 函式 + 測試副本同步）**
- `topoSortTasks`(1017)：nodes key 從 `String(t.wbs)` 改 `t.id`；不再 filter 無 wbs（1018）；edges 從 `predDeps.depId` 建。→ 手動任務也能進圖（兌現 §8b.6 放寬 §6.4）。
- `computeSchedule`(1089)：byWbs→byId key 改 id；processTask 的 preds 來源改 `predDeps`；`ident`(1096) 仍帶 wbs 供顯示；末段「無 wbs 特判」(1178-1181) 可移除（全任務都有 id、都進圖）。
- `isTaskBlocked`(905)：preds 來源改 predDeps；lookup 以 id 查。
- `parsePredecessors`(866)：保留供 UI 解析字串；引擎不再靠它的序號 dep（或新增 `parsePredDeps` 直接吃 predDeps）。

**步驟 D — order / 插入 UI**
- 顯示排序從「array 順序 / wbs」改讀 `order`。
- 任意兩列間插入：取前後兩筆 order 中間值（order=10,20 → 插 15）；流水號(wbs 顯示)重算，但 predDeps 指 id 不受影響 → **依賴不錯位**（這就是整個改造的目的）。

**步驟 E — 測試**
- 56 regression 全綠（**測試檔 docs/test-schedule-cases.js 含 parsePredecessors/isTaskBlocked/computeSchedule/topoSortTasks 副本，4 函式 + 對照邏輯兩邊同步改**）。
- 新增「插入後依賴不錯位」案。

### judgment-risk / 隱藏工作量（家裡審重點）
1. **欄位策略 (a) 原地改 vs (b) 平行 predDeps** — 建議 (b)。**需 Paul 拍板**，這決定後面所有步驟形狀。
2. **既有資料 migration（隱藏成本）**：localStorage 現存任務無 predDeps/order → 首次 load 要 migration：同專案內把 predecessor 序號翻 id、補 order。migration 寫哪、循環/查無序號怎麼處理 — 未設計。
3. **測試副本同步**：4 函式副本 + 新欄位邏輯都要在測試檔複製，否則 56 case 對不上真實引擎。
4. **§6.4 候選清單放寬**：id 化後手動任務可當前置，UI(3485 filter)要拿掉「只列有 wbs」限制 → 連帶 serializePredecessors/候選渲染都要改。

### 分級 / 切分建議
- 全程 [CORE]、judgment-risk、須跑 56 → **回家做、每步單獨 commit、逐步截 diff 審**。
- 非一個 session 能完。建議家裡順序：A+B（資料雙軌＋匯入器兩段式，可先驗匯入資料正確）→ C（引擎比對，單獨一步單獨驗 56）→ D（UI）→ E（補插入案）。migration(風險2)夾在 A 之後單獨處理。

---

## 依賴鏈回顧（架構 §9 G 群 463）
27（欄位，偏 UI 可上 main）→ 28（本筆記 §8b.5 id 化，[CORE]）→ 29（本筆記引擎接線，[CORE]）。
第29項可獨立於第28項先接線（applySchedule 現靠 wbs 比對也能跑）；但第28項插案穩定性依賴 id 化。兩項都進本分支，不 merge main 直到家裡 56 綠。
