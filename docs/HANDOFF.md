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

### 2026-06-27（本週）

**目前 HEAD**：`8a53b18`（將進一個 `[unverified]` 大檢查點）｜版本號 app.js／style.css `?v=20260627-16`

**已落地（皆 `[unverified]`，待線上驗）**
- `13928f1` Stage 2 New UI（編輯任務骨架）— 見 `§4.8.7.7`。
- `b41ac46` 溢出三層 第一刀（嵌入 Stage 2、堆疊逐案）— **已於本批退役**，見 `§4.8.7.8` 退役橫幅。
- **本批（未 commit，待進大檢查點）**：
  - **§4.8.7.9 智慧排程衝突處理面板（獨立聚焦分頁頁，取代舊嵌入版）**：頂部分頁＋三層卡＋層二 Top3 長工時快選＋mini戰報＋層三 Segmented＋即時戰報＋時程異動表＋前後時程對照看板；方案一/二達標**路由 Stage 2**（不在面板建立、不跳原生「未指派」框）。
  - **彈窗設計系統**：`confirmModal` 增強（icon/okClass/單按鈕）；③過渡彈窗；溢出全部確認走設計款、**移除原生 confirm 與灰 toast**。
  - **教育卡文案瘦身**（§4.8.7.4b 文-A）＋排程小秘訣第三點過渡暗示。
  - **Stage 1 backward 修正**：`_chainStagesBackward`（跳階段塌 deadline）／整體膠囊與甘特同源／`_s2VariantSlack` 補 backward。
  - **退役舊溢出**：刪 `_s2OverflowGuideHtml`／`_s2AdoptFastest`／`_s2OverflowRecalc`／`_s2OverflowHandoff`＋`.s2-ovf*` CSS＋接線。

**待驗清單**：見 `§4.8.7.9` 文末（子案 backward 有選項、方案一二達標進 Stage 2 不跳原生框、對照看板、無灰 toast、Stage1 膠囊與甘特一致）。

**下一件（已定案未做）**
1. 真**關鍵路徑**標記（最長依賴鏈）取代目前工期門檻近似；層三**鎖工期表**（半透明遮罩）。
2. 「Stage 2 紅案導回聚焦面板」（可選增強，目前 Stage 2 紅案只剩狀態條＋可直接改工期）。
3. Top3 膠囊級距是否改寫死 -3/-5（目前工期比例算）。
