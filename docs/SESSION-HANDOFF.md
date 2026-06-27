# Session 交接快照（2026-06-27 智慧排程瓶頸＋Stage2 排版＋備份規格）

> 給「重開 session」直接讀的 pickup 文件。**這是快照**，定案／細節以
> `pm-core-architecture.md`（§4.8.7.x 智慧排程、§17 全域備份）、`PM-Core_踩坑與操作手冊.md`、
> `HANDOFF.md §B` 為單一真實來源。下個 session 開工後此檔可覆蓋成新快照或刪除。

## 開工先做（鐵則）
1. cwd 是 pm-core-paul；`git remote -v` 確認指向 `PaulHsu02060/pm-core-paul`。
2. `git pull` →「`git log -3`」確認 HEAD 與 origin/main 齊平（目前應為 `1b8036d`）。
3. 讀必讀文件：`HANDOFF.md`（§A 常駐鐵則＋§B 本週進度）、`AGENT_GATE.md`、
   `pm-core-architecture.md`、`PM-Core_踩坑與操作手冊.md`；動 CSS 前讀 `UI-CSS-設計規範.md`。

## 目前狀態
- HEAD `1b8036d`（origin 齊平）；版本號 index.html `app.js?v=20260627-30`、`style.css?v=20260627-30`。
- 純靜態單頁：index.html + app.js + style.css，localStorage 存資料，no build step。
- 本 session 全部已線上驗過並 commit（非 unverified；唯 `3b0de48` 重算提示/主按鈕文字標了 unverified，後續排版批已連帶看過）。

## 本 session 做了什麼（智慧排程衝突面板大整修 + Stage2 排版 + 備份規格）
**智慧排程衝突面板（overflow，§4.8.7.x）：**
- `2b6994f` ③ 子案甘特燈號 backward 同源（`_s2StageStatuses` 比照 Stage1 反向串接+margin 上色，修「條全綠但 lack 紅」）。
- `f09f27e` N2 interval 餘裕改真實順推（`_s2VariantSlack` interval 分支棄 `_computeSlack` 近似，改 `_s1ColorStagesForward` 順推；修採用層一仍紅、slack off-by-one）。
- `120e404` N1 採用層一後**停留本案**（`sel='1'`，層一燈亮+層二反灰鎖，不自動跳）。
- `384643e` 第3 Stage2「上一步」分情境路由（`_s2From` 旗標：overflow→回面板保留設定 / 綠黃→回 Stage1）＋ 第1 進大表前掃紅案閘門（`_ovfGotoStage2` 彈窗列未處理案）。
- `9e0c6c7` **A 瓶頸建議改模擬法**（核心）：`_effectiveGains`（各任務模擬縮到底看總時程真縮否）取代 CPM 零浮時；`_ovfTopTasks` **每階段選 gain 最大代表**（避免同階段並行互拖白改）；`_taskCap` 二分算**有效縮減上限**＋膠囊/手動框 clamp 防縮過頭＋原因說明；戰報「已縮短」改進層二 snapshot 基準。
- `3b0de48` 層二加「重算撈下批不重複瓶頸」小祕訣＋主按鈕去層三化「進入 Stage 2」15px。
- `eaa7b71` HintBox Header 底色加回通用層＋Stage2 兩指南預設展開＋overflow 文案去層三化（「進階調整」→「進入 Stage 2」、「長工時」→「瓶頸任務」）。

**Stage2 大表排版（§4.8.7.7/§8g）：**
- `b7cf531` 刪階段分隔列（全選移表頭需交付欄）＋前置三欄棄寫死寬改 auto＋字級收斂 13px＋表頭文字欄靠左。
- `441b943` 部門「..」修復（任務名 cell 改 flex，關鍵路徑 tag 不溢出）＋各欄 min-width 引導＋前置三欄收窄（序號 54/緩衝 44）＋全選移需交付下方置中＋**表頭全置中、內容 col-mid 置中、任務名靠左**（推翻之前文字欄靠左版）。

**範本：** `cc20d3e` 階段名去「機」（性試機→性試/量試機→量試/量產機→量產，手工機保留；改 `PRODUCT_DEV_TEMPLATE`）。

**文件：** `1b8036d` §17 全域定時備份規格定案。

## 下一件（已定案未做，重點）
**§17 全域定時備份 + 還原**（取代 §8d.18 建專案草稿方向，Paul 拍板）：
- 方向定案：**B 後端 time-trigger 每天快照**（不靠前端開頁）＋保留 N 天（後端量 blob 定）＋JWT+role API（沿用 §14）＋**前端整碗還原**（第一版）＋單一專案還原（後續，工作量整碗 2~3 倍）。
- 施工拆分（§17.7）：① **後端 .gs**（time-trigger + `doGet snapshots`/`snapshot` 兩 API）— **最高風險、獨立 session、照 §8f 鐵則：先備份可運作版→新部署測試 URL→驗完才切正式** ② 前端整碗還原 UI（設定頁、複用 download、警語、還原前下載備份）③ 後續單一專案還原。
- 完整規格見架構文件 §17。動工從 ① 後端 .gs 開始。

## 硬規則（每步必守）
- **commit-gate**：commit 前單獨 `git status` 貼完整原文（無 config.local.js/seed.local.js/seed.sample.js/_probe*）；add→commit→push **三步分開、嚴禁 `&&`/`;` 串接**；`git add` 只列明確檔名；禁 `push --force`；訊息經 Paul 確認。
- 動 code 前後跑 `node --check app.js` ＋ `node docs/test-schedule-cases.js`（160 案），輸出原文都貼。未線上驗標 `[unverified]`。
- 改 app.js 或 style.css → 同步升 index.html 兩條 `?v=`（YYYYMMDD-N，只升真的動到的檔；目前 -30）。
- 改檔一律 Edit/Write，禁 PowerShell 文字回寫（中文亂碼）。
- **CSS 鐵則**：顏色/圓角/z-index 走 `:root`，hex 只准在 `:root`；暖森林綠（sage/amber/rose/stone），非 Tailwind 冷色（顧問給的冷灰 hex 一律換暖石 `--ink/--ink2/--ink3`）。
- 回覆一律正體中文、白話、列選項+建議、不用工具彈窗問問題、不主動叫休息、要 diff 貼完整原文。
- 大功能先出 Mockup 定版再寫 code（visualize/show_widget，外層別深色背景）。

## 協作風格（Paul 要求）
機械改動一口氣做完、最後貼總結（node --check + 160 測試 + 原文）；只有測試 FAIL／邏輯分支語意改變／anchor 不確定／動既有邏輯／commit-gate 才停下貼審。決策過的不重複問。判斷風險改動截 diff 給 Paul 審＋線上驗過才 commit。
