# PM-Core 交接 / Session 快速上手（HANDOFF）

> 開新 session 的**必讀文件之一**。分兩區：
> **§A 常駐鐵則**（永久保留、不清除）＋ **§B 本週進度**（每週滾動、只留當週）。
>
> ## 維護規則（更新本檔時務必照做）
> - **§A 常駐鐵則**：永久保留，不清除。
> - **§B 本週進度**：每筆標日期。更新本檔時，把日期**超過 7 天**的條目刪掉，只留最近一週，避免膨脹。
> - 每次有功能落地：在 §B 加一條（日期＋commit＋一句話＋指向 `pm-core-architecture.md` 的章節），**同時更新架構文件的落地紀錄**（HANDOFF 只放指標與當週狀態，細節以架構文件為單一真實來源）。
> - 開新 session 時：對照今天日期，清掉 §B 中 >7 天的條目。

---

## §A 常駐鐵則（永久，不清除）

### 開工檢查（每次必做）
1. `git remote -v` 確認指向 `PaulHsu02060/pm-core-paul`；不是就停、別在錯 repo 動工。
2. `git log -3` 確認 HEAD 與 origin/main 齊平；不一致先 `git pull`。
3. 讀必讀文件：本檔（HANDOFF）、`docs/AGENT_GATE.md`、`docs/pm-core-architecture.md`、`docs/PM-Core_踩坑與操作手冊.md`；CSS 相關另讀 `docs/UI-CSS-設計規範.md`。

### 語言
- 回覆**一律正體（繁體）中文，禁任何簡體字**。常手滑字：線上/動/組合/欄/測試/專案/順序/顯示/寬度/處/驗證/檔案/腳本。**長對話後段、整批機械報告最容易手滑，每則送出前逐字掃。**

### 溝通／回覆風格
- 講白話文，不大段解釋 code、不貼行號原始碼，減少篇幅。
- 明確指出「問題是什麼／需要 Paul 做的選擇」，列選項＋tradeoff＋建議。
- **不用工具彈窗問問題**——一律用文字列選項。
- 決策過的不重複問。
- **不主動叫休息**、別在結尾建議收工/改天（Paul 說停才停）。
- 要 diff 就**貼完整原文**，不給摘要結論。

### 工作流程
- 大功能（尤其 CSS/UI）**先出 Mockup 定版再寫 code**，避免來回改。
- 機械性改動一口氣做完、最後貼總結；只有「測試 FAIL／邏輯分支或語意改變／anchor 不確定／動既有邏輯／commit-gate」要停下貼審。
- Paul 明說「自主執行不用同意」時，照建議連續做完再貼總結；否則一次一件、做完停等放行。
- **寫完先停、線上驗過才 commit**（除非 Paul 明說「先 commit」，例如要在本機測）。未線上驗的 commit message 標 `[unverified]`。

### commit-gate（最高優先）
- commit 前先**單獨** `git status` 看完整原文，確認只有預期檔、無 `config.local.js`／`seed.local.js`／`seed.sample.js`／`_probe*` 等機密/本地檔。
- `add` → `commit` → `push` **三步分開執行**，禁 `&&`／`;` 串接（連 `add && status` 也別串）。
- `git add` 只列**明確檔名**，禁 `git add -A`／`.`。
- 禁 `git push --force`。commit message 由 Paul 提供或經確認。
- 動到邏輯/引擎前必跑 `node --check app.js` ＋ `node docs/test-schedule-cases.js`（目前 160 案），兩者輸出原文都貼。

### 改檔紀律
- 改檔一律用 Edit/Write，**禁 PowerShell 文字回寫**（`Set-Content`／`Out-File` 會把中文寫成亂碼）。
- 只改指定範圍，不順手動其他行。

### 版本號（cache-busting）
- 改 `app.js` 或 `style.css` 必同步遞增 `index.html` 的 `?v=`（格式 `YYYYMMDD-N`，同日 `-N` 遞增、跨日重置 `-1`；只升真的動到的檔）。

### CSS 鐵則
- 動 CSS 前先讀 `docs/UI-CSS-設計規範.md`。
- 顏色／圓角／z-index／陰影一律走 `:root` 變數，hex 只准出現在 `:root`（例外：rgba 透明衍生、膠囊 99px、圓點 50%）。
- 色系**暖森林綠**（sage／amber／rose／stone），**非 Tailwind 冷色**；Tailwind 色票只是意圖、不寫進 code。

### 跨機
- 三台機器各自 clone、Git＋GitHub 同步。開工先 `git pull`、收工 commit＋push、不留未同步工作。
- `config.local.js`／`seed.local.js` 本地機密檔，不入版控、看到要警示、絕不 add。

---

## §B 本週進度（每週滾動，只留當週）

### 2026-06-29（本週）

**目前 HEAD**：`c0f9717`｜版本號 app.js／style.css `?v=20260629-7`｜本 session 六批已 commit＋push（全 `[unverified]`、線上待驗）

**已落地（本 session，DEV 驗、github.io 未驗）**——詳見架構 **§18.9 落地紀錄**
- 雙軌導覽 **Phase 0** 拆分：個人工作台/全專案總覽兩節點、`Workspace`/`Portfolio` 分包（§18.7）`869a955`
- **Phase 1** 總覽頁 MVP：4 指標卡＋雙列進度矩陣（預計vs實際）＋部門負載＋當週待處理＋HintBox（§18.8）`f03d5cd`
- 工作台 UI：暖沙底＋燕麥格＋格線A（橫實縱虛）＋日期列凍結＋午休縮半＋週末預設下週；會議面板簡化（右欄卡→週曆表頭「管理會議」鈕）；Portfolio B 卡頂線/階段膠囊 `974e16e`
- 設定精簡：排程 tab 只留工作日曆（工時與排程/定期事件移除、會議改走管理會議彈窗）`86cc402`
- 修正：週曆 sticky 回正＋`renderLists` 無憑證守衛(止 DEV「登入已過期」toast)＋DEV 面板預設收起 `c0f9717`

**下一件 / 待辦（本 session 撈出，未做）**
1. **線上驗證（最優先）**：本批全 `[unverified]`，github.io 部署後逐項驗——工作台週曆凍結/配色/午休/週末、總覽頁四卡與矩陣數字、設定頁只剩工作日曆、管理會議彈窗、DEV 面板收起、不再跳 token toast。
2. **雙軌導覽 Phase 2**（需新資料/快照）：① 小時計(時段制)Task 折算進部門負荷＋驗證 ② 趨勢「較上週」綁 §17 每日快照 ③ 會議/事件加 `dept`/`owner` 欄（跨部門雜事負載堆疊、含偏頗標註）。見 §18.9 / §18.5。
3. **§17 全域定時備份+還原**（Paul 拍板）：後端 .gs 起（time-trigger + `doGet snapshots`/`snapshot`，最高風險、獨立 session、照 §8f 新部署驗完才切正式）。規格見 §17。
4. **本批尾巴**：工時與排程設定 UI 已移除→工時/工作日值固定現值、不能從 UI 改（要改需重開 UI 或改資料層）；`saveSettings` 留 null-guard 工時 dead reads（無害未清）；預計%／部門負載為近似（§18.9）；DEV 收起膠囊與右下 toast 仍可能微重疊（要完全不擋可移左下）；KPI「較上週」留白。
5. overflow 面板字級（規範過時，待 Paul 重看現況再定）。
