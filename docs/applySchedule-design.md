# applySchedule + 錨點改 override 設計稿（第二段核心）

> 狀態：設計稿（純文件，未動 app.js）。回家有 node 後照此實作 + 邊寫邊驗。
> 前置：commit 11120b4（欄位統一）已 push，回家先 pull + 跑測試確認 46/0 + 20/20 再開始。
> 目標：讓「改一筆 → 重排 → 下游連動、錨點釘住」成立，排程結果落地到 scheduledStart/End。

---

## 0. 為什麼要做這段（問題回顧）

- computeSchedule 純算 suggestedStart/End，不寫回 task → 算了沒地方放，前後端/甘特/報表拿不到值。
- processTask 行 1004 用 `if (t.start)` 判斷錨點。但 `t.start = effectiveStart = actualStart || plannedStart`，
  WBS 同步 92 筆全有 plannedStart → t.start 全有值 → 92 筆全被當錨點 → 全不推算 → 「改一筆下游連動」失效。

## 1. 關鍵事實（本次現況確認，決定設計）

- override 機制只有「J task」（WBS 同步任務）有。isJTask: `proj.syncSource === 'jSheet'`。
- override 實際儲存在 `task._localStart` / `task._localEnd`；getJOverride(id) 把它們組成 `{start, end}` 回傳，無則 null。
- 手動任務（B 快速新增 / C 完整對話框）不是 J task → getJOverride 永遠 null。它們的 t.start 就是使用者真填的（建立時預設 ''，填了才有值），本來就該當錨點。
- 故錨點來源因任務類型而異：同步任務看 override._localStart；手動任務看 t.start。→ 採 α 方案分流。

---

## 2. 改動一：錨點來源改判斷（processTask，行 1004）

### Before（現況）
```js
    // ① 手填 start：最高優先，尊重不覆蓋
    if (t.start) {
      const end = iso(D.addWorkdays(new Date(t.start), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: t.start, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null, warnings: warns };
    }
```

### After（α 方案：isJTask 分流）
```js
    // ① 錨點：使用者刻意定的開始日，最高優先、不被推算覆蓋
    //   - 同步任務(J task)：錨點 = override._localStart（前端刻意改的），plannedStart 不算錨點
    //   - 手動任務：錨點 = t.start（使用者建立時真填的）
    //   這樣同步進來的 92 筆(只有 plannedStart、無 override)不會被當錨點 → 可正常連動
    const ov = isJTask(t) ? getJOverride(t.id) : null;
    const anchorStart = ov?.start ?? (isJTask(t) ? '' : t.start);
    if (anchorStart) {
      const end = iso(D.addWorkdays(new Date(anchorStart), dur - 1));
      const b = isTaskBlocked(t, nodes);
      const warns = b.reasons.map(r => `前置 #${r.dep}(${r.type}) ${r.conflict}`);
      return { ...ident(t), suggestedStart: anchorStart, suggestedEnd: end,
        blocked: false, error: null, toSchedule: false, blockedCause: null,
        warnings: warns, anchorSource: ov?.start ? 'override' : 'manual' };  // 推導理由：錨點來源
    }
```

### 重點
- `anchorStart` 取代原本的 `t.start`。同步任務只認 override，手動任務認 t.start。
- 加 `anchorSource` 欄位（'override' / 'manual'）→ 供 UI 顯示「為什麼這天是錨點」。延續核心原則「每算一結果附帶推導理由」。
- isTaskBlocked 仍傳 t（它內部讀 t.start 比對，這部分維持；注意：同步任務若無 override 但 t.start 有值，這分支根本不會進來，所以 isTaskBlocked 拿到的 t.start 在此分支恆等於 anchorStart，不衝突。回家用測試驗證此點）。
- ⚠ 待驗疑點：同步任務「無 override」時走到 ② 推算分支，推算用的是前置 + 關係，不讀 t.start，正確。但要確認推算分支(③)沒有別處偷讀 t.start 當依據。回家 node 驗。

---

## 3. 改動二：getEffectiveSchedule 擴充 scheduled 層（行 1342）

### Before
```js
function getEffectiveSchedule(task) {
  if (!task) return null;
  const override = isJTask(task) ? getJOverride(task.id) : null;
  return {
    start: override?.start ?? task.start,
    end: override?.end ?? task.end,
    plannedStart: override?.plannedStart ?? task.plannedStart,
    plannedEnd: override?.plannedEnd ?? task.plannedEnd,
    hasOverride: !!override,
  };
}
```

### After（甲案優先序：override > actual > scheduled > planned）
```js
function getEffectiveSchedule(task) {
  if (!task) return null;
  const override = isJTask(task) ? getJOverride(task.id) : null;
  // 顯示優先序（甲案）：override(人刻意改) > actual(已開工事實) > scheduled(排程算) > planned(初始預計)
  const dispStart = override?.start ?? task.actualStart || task.scheduledStart || task.plannedStart || '';
  const dispEnd   = override?.end   ?? task.actualEnd   || task.scheduledEnd   || task.plannedEnd   || '';
  return {
    start: dispStart,
    end: dispEnd,
    plannedStart: override?.plannedStart ?? task.plannedStart,
    plannedEnd: override?.plannedEnd ?? task.plannedEnd,
    scheduledStart: task.scheduledStart || '',
    scheduledEnd: task.scheduledEnd || '',
    hasOverride: !!override,
    // 顯示來源（推導理由，供 UI）：這個 start 是哪一層來的
    startSource: override?.start ? 'override' : (task.actualStart ? 'actual' : (task.scheduledStart ? 'scheduled' : (task.plannedStart ? 'planned' : 'none'))),
  };
}
```

### 重點
- ⚠ 混用 `??` 與 `||`：override?.start 用 `??`（只在 null/undefined 時 fallback，空字串 '' 仍視為「有 override」嗎？）
  → 要決定：override 存 '' 算不算「有設定」？建議：override 的空字串視為「未設定」，所以這裡 actualStart 以下用 `||`（空字串會繼續往下找）。
  但 override?.start 若可能是 ''，要改成 `(override?.start || ...)`。**回家確認 override 會不會存 ''**，決定用 ?? 還是 ||。此為易錯點，務必驗。
- 加 startSource → UI 顯示「這個日期是人改的/實際/排程算的/預計」。
- 保留 plannedStart/End 原樣回傳（既有呼叫端可能用到）。

---

## 4. 改動三：新增 applySchedule(tasks, scope)

### 位置
緊接 computeSchedule 之後（computeSchedule 結尾找 `return { results, circular...` 那行之後）。

### Code
```js
// ═══ applySchedule：把 computeSchedule 算出的建議落地到 task.scheduledStart/End ═══
// scope: 'full' = 整鏈套用（丙，目前唯一模式；乙/甲未來加）
// 規則：blocked/circular/錨點任務 跳過不寫，留警示；其餘把 suggested 寫進 scheduled
function applySchedule(tasks, scope = 'full') {
  const { results } = computeSchedule(tasks);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const applied = [];
  const skipped = [];
  results.forEach(r => {
    const task = byId.get(r.taskId);
    if (!task) return;
    // 跳過：循環 / blocked / 待排（無有效建議）/ 錨點（人刻意定的，不被排程覆蓋）
    const isAnchor = (r.anchorSource === 'override' || r.anchorSource === 'manual');
    if (r.error === 'circular' || r.blocked || r.toSchedule || !r.suggestedStart) {
      skipped.push({ id: r.taskId, reason: r.error || r.blockedCause || 'unscheduled', warnings: r.warnings });
      return;
    }
    if (isAnchor) {
      // 錨點任務：suggestedStart 就是錨點值，仍寫進 scheduled 讓顯示一致，但標記來源
      task.scheduledStart = r.suggestedStart;
      task.scheduledEnd = r.suggestedEnd;
      applied.push({ id: r.taskId, start: r.suggestedStart, source: 'anchor' });
      return;
    }
    // 正常連動任務：寫入排程結果
    task.scheduledStart = r.suggestedStart;
    task.scheduledEnd = r.suggestedEnd;
    applied.push({ id: r.taskId, start: r.suggestedStart, source: 'scheduled' });
  });
  return { applied, skipped, total: results.length };  // 回傳供 UI 顯示套用了幾筆、跳過幾筆及原因
}
```

### 重點
- 不碰 override（人的意志）、不碰 plannedStart（Sheet 原值）、不碰 t.start。只寫 scheduledStart/End。
- 錨點任務也寫 scheduled（值=錨點值），讓甘特顯示一致；但 applied 標 source:'anchor' 區分。
  → 這樣顯示層讀 scheduled 就有完整一條鏈，不會錨點任務空一格。
- 回傳 {applied, skipped, total}：UI 可顯示「套用 X 筆、跳過 Y 筆（原因）」。推導理由透明化。
- ⚠ 設計抉擇待確認：錨點任務要不要寫 scheduled？
  - 寫（上面寫法）：甘特一條鏈完整，但 scheduled 跟 override 值重複。
  - 不寫：scheduled 只存「機器算的」，錨點任務的 scheduled 留空，顯示靠 getEffectiveSchedule 的 override 層補。
  - 建議「不寫」更乾淨（scheduled 純機器層），但要確認 getEffectiveSchedule 的 override 層能補上錨點任務的顯示。回家決定。

---

## 5. 測試案例（加進 test-schedule-cases.js，回家 node 驗）

### ⚠ 同步複本 + isJTask stub 難題（最重要）
- test-schedule-cases.js 的 mk() 造裸 task，沒有 synced/DATA.projects，isJTask 會出錯或恆 false。
- 錨點改用 isJTask 分流後，測試要能模擬兩種任務：
  - 手動任務：mk({ start: '2026-01-12' }) → 錨點看 t.start（isJTask=false 走 else 分支）
  - 同步任務有 override：要 stub isJTask 回 true + 給 _localStart
- 解法：測試檔複本裡，把 isJTask 改成「可被測試控制」的版本，例如：
  ```js
  // 測試複本：isJTask 簡化為看 task.__isJ 旗標（生產是看 syncSource）
  function isJTask(task) { return !!(task && task.__isJ); }
  function getJOverride(task) { // 測試複本：直接讀 _localStart/_localEnd
    if (!task) return null;
    const r = {}; let has = false;
    if (task._localStart !== undefined) { r.start = task._localStart; has = true; }
    if (task._localEnd !== undefined) { r.end = task._localEnd; has = true; }
    return has ? r : null;
  }
  ```
  注意：生產 getJOverride 吃 taskId 去 DATA.tasks.find；測試複本改吃 task 物件（因測試無 DATA.tasks）。
  → processTask 裡呼叫處在測試複本也要對應改成傳 task 而非 id。這是同步複本必須留意的差異點。
  ⚠ 這代表測試複本的 isJTask/getJOverride 跟生產「介面不同」（一個吃 id、一個吃物件）。
     要嘛統一介面（生產也改吃物件），要嘛測試複本明確註記此差異。回家決定，別讓兩邊靜默分歧。

### 必含案例
1. 【同步任務無 override → 連動】mk 同步任務(__isJ:true, plannedStart 有值但無 _localStart)，
   確認它「不被當錨點」、會跟上游推算。← 這是修 92 筆全錨點 的核心驗證。
2. 【同步任務有 override → 錨點釘住】__isJ:true + _localStart='2026-01-15'，
   確認 suggestedStart=01-15、anchorSource='override'、下游照此連動。
3. 【手動任務有 t.start → 錨點】__isJ:false + start='2026-01-12'，
   確認當錨點、anchorSource='manual'。
4. 【手動任務無 start → 推算/待排】__isJ:false + start=''，確認走推算或待排。
5. 【applySchedule 整鏈】一條 A→B→C，套用後 B/C 的 scheduledStart 正確連動。
6. 【applySchedule 跳過】blocked/circular 任務套用後 scheduled 維持空、進 skipped。
7. 【applySchedule 錨點處理】有 override 的任務，套用後行為符合第 4 節的抉擇（寫或不寫 scheduled）。
8. 【getEffectiveSchedule 優先序】同一 task 分別只有 planned / 加 scheduled / 加 actual / 加 override，
   確認顯示 start 依 override>actual>scheduled>planned 取值，startSource 正確。

### 驗證目標
- 全部 PASS。原 46 個案例不可回歸（錨點改動後，原本餵 start 當錨點的案例行為要重新確認——
  原案例的 mk 多是手動任務語意(無 __isJ)，t.start 仍當錨點，應不變；但務必逐一確認，這是最可能回歸的地方）。

---

## 6. 實作順序（回家照此，邊寫邊 node 驗）

1. pull + 跑測試，確認 11120b4 基準 46/0 + 20/20。
2. 先改測試複本的 isJTask/getJOverride stub（第 5 節），先讓測試框架能模擬兩種任務。
3. 改 processTask 錨點（改動一），app.js + test 複本同步改。跑測試，確認原 46 不回歸。
4. 加新測試案例 1-4（錨點分流），跑，確認 PASS。
5. 寫 applySchedule（改動三），加測試案例 5-7，跑。
6. 擴充 getEffectiveSchedule（改動二），加測試案例 8，跑。
7. 全綠（應 54+/0、20/20）→ commit [fix/feat] + push。

## 7. 待回家拍板的抉擇（設計稿標 ⚠ 處彙整）
- A. getEffectiveSchedule override 用 ?? 還是 ||（override 會不會存空字串 ''）。
- B. applySchedule 錨點任務要不要寫 scheduled（寫=甘特完整 / 不寫=scheduled 純機器層）。
- C. isJTask/getJOverride 測試複本與生產的介面差異（吃 id vs 吃物件）要不要統一。
- D. 確認推算分支(②③)沒有別處偷讀 t.start，否則錨點改動不完整。

> 這四點都需要 node 邊驗邊定。設計稿先把選項與取捨寫清楚，回家決定不用重想。
