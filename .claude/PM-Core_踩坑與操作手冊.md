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