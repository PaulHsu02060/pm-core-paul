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

**目前 HEAD**：`d2785b2`｜版本號 app.js／style.css `?v=20260630-11`｜安全硬化 #1/#2＋安全頁**全線上驗 Pass**；Phase 2 JS 閘門**已補（160 PASS）**；剩 Phase 2 一刀/二刀 github.io 全量線上驗

**已落地（本 session）——Phase 2 第一刀（部門負載改本週負荷＋個人雜事疊加），詳見架構 §18.10**
- 設計定案：§18.10 部門負載本週負荷／§6.5b HintBox 放置標準 `7c849e5` `d217f3a`
- Commit 1：`Portfolio.deptLoad` 改本週負荷均攤（WBS 工期攤本週工作日×日工時）＋`weekCapacity` 容量衍生＋部門名穩健解析 `e958427`
- Commit 2：總覽部門負載改 stacked bar（綠 `--sage-600`＋琥珀 `--amber-accent` 疊段＋`--stone-400` 容量虛線＋爆單 rose 高亮＋圖例）；四區塊 HintBox 移到 Title 下方（§6.5b 標準）`2277c53`
- Commit 3：新增小時 Task 表單補「部門」下拉（選項Y＝全專案部門名去重池，時段制限定）＋saveNewTask/saveTask 依 measure 寫 `dept` `f5e8df5`
- Commit 4：設定「工時設定」UI 回歸（每日工時＋每週工作日，全系統單一來源）＋變更影響彈窗確認 `4f0a7cc`
- 修正2：任務表單必填欄位加 `*`＋空欄一次標紅 `.tf-invalid` 引導＋輸入即消紅 `e40e9c9`
- 修正1：新建小時 Task 立刻在預計開始日放臨時時段、週曆即時可見（智慧排程整批重建時覆蓋重排）`c93fd19`
- 修正3：設定頁有改未存、離開時彈窗提醒（儲存並離開／放棄並離開／取消）＋dirty 偵測 `a6c009f`
- 方案一：週曆今日欄底改暖沙灰 `--cal-today-bg` `#EEF5EF→#F4F2EA`（後由 v6/白卡批再調，見下）`b23adfd`

**已落地（本 session 續）——工作台 UI 換裝＋全域彈窗收斂（線上驗多項 Pass）**
- 工作台週曆 **版本六暖中性洗淨**：純白格＋暖灰實線＋深度卡白底深綠線＋卡片排版統一（8px12px/r6/13px）＋時間 Google 線上式 `09bf59c`
- 工作台 4 KPI 卡重定義為**小時計/時程表**（今日時段任務／本週時段任務／緊急只列小時計／本週工時）`aeb9acc`
- **全域原生彈窗清零**（17 confirm＋2 alert＋2 prompt → 設計款 `confirmModal`／新 `promptModal`／`openModal`）`858c808` `5f983ab` `b4d84a8`；鐵則寫進 UI 規範 §0.6＋踩坑坑8 `5669b37`
- 工作台**白卡化**：時程表拔 `--pearl` 沙底→純白獨立卡＋今日欄極淡暖綠白 `#F4F7F4`＋格線 `#E5E1D7` `42ddc0a`；KPI 字卡＋便利貼底改純白 `--surface` `04b1037`
- **時程表顯示設定修正**：移除失效密度 toggle＋改範圍不重開 modal（即時可見）＋顯示結束時間（`_ge` 標籤）＋時間軸標籤對齊隔線 `c1d5d29`

**已落地（2026-06-30）——Phase 2 第二刀：會議/事件 `dept`/`owner` ＋ 橘塊納專案會議，詳見架構 §18.10b（全 `[unverified]`，本機無 node）**
- 設計定案 §18.10b `e260ef0`（三決策：dept 預設未指派/owner 帶 userName、雜項不計只算 category=meeting 且已指派、三入口同步、`__ALL__` 均攤不乘人數、工作日邏輯）
- Commit 1 引擎級 `b7e9d02`：`Portfolio.deptLoad` 加橘塊納會議（逐日掃本週工作日`D.isWorkday`＋三 store＋`eventOccursOnDate`＋category/dept 過濾＋`__ALL__` 展開）＋偏頗文案更新。**Python oracle 5/5 PASS**（無 node、獨立重算驗算法）
- Commit 2 UI/schema 級 `616871d`：共用 `App._meetingDeptOptions`（未指派＋Y池＋★全體均攤）；三入口（`addManualMeeting`／`saveRecurringMeeting`／`saveSpecialMeeting`）加 owner/dept 欄＋寫 schema；index.html app.js `?v=20260630-1`。ID 配對 12/12 驗過
- **桌機待補**：`node --check app.js`＋`node docs/test-schedule-cases.js`(160) 貼原文解 `[unverified]`

**已落地（2026-06-30，本 session）——Node 補測＋總覽 HintBox＋安全硬化＋安全頁（全線上驗 Pass）**
- **Node 補測**：桌機跑 `node --check`＋160 案 PASS，解掉 Phase 2 第二刀（`b7e9d02`/`616871d`）的 JS 閘門 `[unverified]`。
- **總覽 HintBox 改版** `abe62bb`：4 框文案校對貼合 code（健康度紅黃燈語意、雜事佔比不含會議）＋深色 Header（`#portfolio-body` scope、`--sage-700` 反白）＋ol 數字序號＋body 12px 呼吸感。標準入 memory `hintbox-writing-standard`。
- **安全硬化 #1** `3a30940`/`6426b88`：移除無查核「以檢視模式進入」按鈕＋移除 Prod 無作用首登密鑰欄＋清孤兒 CSS。詳見架構 §8f.6（2026-06-30 更新）。
- **安全硬化 #2** `23c92b7`(L1)／`1a9354e`+`2cf6991`(L2)／`4163e97`(B)：登入前不渲染＋擋頁清 DOM＋登出潔癖全清（F12 全空）＋未登入不落地＋跨路徑清孤兒＋seed race 修正。詳見架構 §8f.6（2026-06-30 續）。
- **安全介紹頁** `ecd8a59`/`d2785b2`：設定→「🛡 安全」tab，`SECURITY_INFO` 資料驅動、雙欄黃金對稱，供 MIS 審閱。
- **AGENT_GATE 規則10** 補「移除功能＝順手清孤兒」`c8a22ca`；memory 新增 `orphan-cleanup-standard`。

**下一件 / 待辦**
1. **線上驗證（github.io）**：Phase 2 第一刀（部門負載 stacked／容量線／爆單、HintBox 位置、小時 Task 部門分流、工時設定彈窗、設定未存提醒）部署後全量過一遍；工作台 UI（v6 週曆／白卡化／KPI 卡／時程表設定）DEV 已驗多項 Pass。
2. **Phase 2 後續**：③ 會議/事件 `dept`/`owner` ＋橘塊納會議 **已落地（§18.10b，node 驗已補 160 PASS、剩 github.io 線上驗）**；剩 ② 趨勢「較上週」綁 §17 每日快照（卡 §17、未動）。見 §18.10b／§18.5。
3. **§17 全域定時備份+還原**（Paul 拍板）：後端 .gs 起（最高風險、獨立 session）。規格見 §17。
4. **Workspace／Portfolio 物理拆檔**（§18.7 定案，Paul 同意做完功能後拆）：命名已聚集（`Workspace.*`／`Portfolio.*`），拆成 `workspace.js`＋`portfolio.js`＋`shared-render.js`（甘特/月曆共用）＋`project.js`＝剪下貼上＋顧 `<script>` 載入順序/TDZ/各檔 `?v=`。**獨立批次做、勿混進功能 commit。**
5. **已知尾巴**：部門負載橘塊現含時段任務＋專案會議（category=meeting 且已指派/全體均攤；打掃與未指派不計、週末會議不計）；設定 cal-paste 打字也算 dirty（離開可能多跳一次提醒、按放棄即可）；「儲存並離開」走 `saveSettings(true)` 跳過工時影響彈窗；KPI「較上週」留白；overflow 面板字級（規範過時待重看）。
