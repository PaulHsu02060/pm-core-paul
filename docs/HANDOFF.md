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
- 大功能（尤其 CSS/UI）**先出 Mockup 定版再寫 code**，避免來回改；**Mockup 一定版即把細節（版面/欄位/逐條文案/色彩 token/互動）完整回寫架構文件**，不留「大概方向」，避免下次 session 重討論 Mockup 重工（AGENT_GATE 規則12）。
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

### 架構文件三檔分工（2026-07-01 起，取代單一巨檔）
- **`pm-core-architecture.md`＝現役 spec 單一真實來源**（原則／未完成設計／現行行為規格）。已完成功能只留現役規格＋一行指標，不留落地流水帳。
- **`architecture-archive.md`（router）＋`docs/archive/<功能群>.md`＝歷史沉澱**：已完成功能落地紀錄／施工計畫／退役草稿。保存可查、非現役。
- **`architecture-INDEX.md`＝全文地圖**：每節 §→狀態(現役/落地/退役/草稿/未做)→所在檔，是「查已完成功能去哪找」的反查表。
- **維護流程**：功能落地→該節落地紀錄搬對應功能群 archive、主檔留現役 spec＋指標行、INDEX 更新狀態/所在檔；過時或退役內容（如拆檔前 monolith 行號）直接刪不留。找 code 以**函式名**為錨（行號會漂），檔案歸屬查 §18.7.2。
- **大段搬移**用 node 腳本（錨點抓段＋dry-run 計數＋utf8＋保留換行，坑5），搬完 `git diff --ignore-all-space --shortstat` 對帳防 CRLF flip（坑4）。

---

## §B 本週進度（每週滾動，只留當週）

### 2026-07-02（本週）

**目前 HEAD**：`6aae2e0`｜project.js `?v=20260702-12`／style.css `?v=20260702-25`／template.js `?v=20260702-18`／templates/ecn-template `?v=20260702-3`／app.js `?v=20260702-3`｜**§19 ECN 戰情室 Tab A 全落地並上線 `6aae2e0`（開案→戰情室 dashboard 全欄可操作，多輪線上驗 Pass）**；先前：§19 Phase 1 三方碰撞定案＋Mockup 定版＋規格全回寫（§19.1b/19.2/19.4/19.5/19.6/19.9/19.10 A·B·C）＋開案畫面＋範本引擎（`ad8a73f`）＋HintBox 全站淺色 reg A（`3778393`）

**已落地（2026-07-01→07-02，本 session）——§19 ECN Phase 1 定案 + 開工首塊**
- **§19 三方碰撞（Paul×Claude×Gemini）定案**：瘦流程骨架（6 階段＋條件/迷霧池，取代 S/M/L 胖範本）／Model Y PM 常駐協調列（death-by-small-cases 盾）／雙軌變異（執行落後 vs 範圍蔓延）／成因 Hybrid 標記／暴走告警客戶端界線／BOM ROI 差異四區·目標成本（設變差額＋採購降價·每行納入布林）／切換方式（即刻/漸進）→呆滯（含刪除料）／整台年效益·可設年限／幣別三情境軟擋／無單價核對／**存資料不存 Excel 走 exceljs 重生**／生效日雙卡／多交付軌／DR 回歸。commit `d457b78`/`2ebea97`。
- **三張 Mockup 定版**：開案畫面（方向 C·S/M/L 動態·PM 協調條·排程建議行跟隨·Fan-out·**前置白話三欄零 FS**）／設變專屬 dashboard（左 HUD 健康三指標＋右 3 資料夾頁籤·成因 Enum·迴圈列·PM 常駐列）／BOM·ROI 差異四區。開案即落地跳 dashboard、sidebar 設變案群組、ECN 簡化實體（無 view 工具列）、**跨案 135% 推 Phase 2**。
- **開工首塊 `71c398c`**：`renderSidebar` 抽 `renderProj`、依 `ecnType` 分 NPI／ECN 兩群、各自新增鈕、V3 區塊底帶群標（`.sb-grp` 色點 NPI 綠/ECN 琥珀，全走 :root）、`openEcnDialog` 占位 toast。
- **HintBox 淺色 `3778393`+`3e7dd30`**：移除總覽 `#portfolio-body` 深色 override、header 暖沙 `--hint-head #F1EFE8`、body 四色塊中性化統一白底（一種規則）。§6.5b 更新。
- **統一入口＋選型引導頁 落地** `4c4bb51`：sidebar 頂端單一「＋建立新案」、兩群退為 View 分類清單、兩欄型別卡＋不可互轉警示＋防過勞條。規格 §19.10 A.0；AGENT_GATE 規則12＋memory `mockup-detail-into-docs`（`f578348`）。
- **ECN 開案畫面＋範本引擎 落地** `ad8a73f`（§19.10 A/A.1 定版，多輪線上驗＋Gemini 覆核）：`templates/ecn-template.js`（§19.9 瘦骨架 e1–e13＋sizeMeta，oracle 三級前置零懸空）＋`_ecnTplForSize`/`_s1Tpl` 引擎＋三列式表單（分級全寬+固定高度提示塊／類型40·需求單號60／背景原因 textarea 整併·選填）＋S/M/L 即時反饋＋ROI 純手動下拉雙 hint＋?氣泡＋名冊挪前(HintBox 展開)＋PM 協調條＋單案制＋琥珀主題白底＋建立前防呆彈窗(Banner 方案廢)＋落地寫 §19.2 欄位(`sourceNo` 新)＋動態生成 PM 常駐任務。選型 Modal XL(88vw)＋subgrid 表頭對齊＋`_s1Back` 上一步不留背景＋色點補點擊。**過渡：建立後暫落一般內頁**（戰情室做完改跳）。尾兩修（日期引導同底色/名冊 HintBox 展開）未線上驗。
- **Design Tokens 定版** `07a638d`：UI 規範 §6（Modal S400/M600/L800/XL1140·8px 網格·五級字階·Icon 24/20/16·高度 40/32/48）＋AGENT_GATE 規則 7 補「禁清單外自定 px」＋memory `design-tokens-standard`。
- **戰情室細節＋Mockup 終版定版（2026-07-02，§19.10 B.1/B.2）**：6 點細節定案（雙軌口徑+baselineHours/雙旗入口/案內重排/頁籤C=事件時間軸/結案下波/升降級）＋Mockup 七輪迭代 v7 定版——滿版流動 HUD 280、HUD 白話四卡+進度條視覺化、說明回歸 HintBox（左展開/右收合，文案 Gemini 定稿）、**大表複用 Stage 2 真實結構琥珀化**（前置三窄格 inline、投入%佔需交付位、表頭淡琥珀+深字、關鍵路徑左紅框、操作欄「⚙編輯▾」統一入口→打回重測/刪除）、成因窗（enum 必填+fade-in）、重做歸屬=loopFromId 自動綁非前置判定、進度不進大表。ECN 開案改「建立專案」直落地+上一步資料警告（`b7aaa71`）。
- **戰情室 Tab A 全落地並上線 `6aae2e0`（§19.10 B/B.1/B.2 定版·多輪線上驗 Pass）**：`renderEcnDashboard` 依 `ecnType` 分流（`renderProject` 開頭）＋滿版佈局（HUD 280 sticky＋右工作區）＋HUD 四卡（工時·異常統計·雙軌進度條·部門卡）＋三頁籤（A 大表／B BOM 佔位／C 事件時間軸）。大表**複用 `.s2-tbl`／`_s2PredCells`／既有 `_s2*` handler**（hijack `_tplPreview` 指向 ECN live res，`_s2RefreshCase`/`_s2SetOwner` 加 `_s2EcnPersist` 存檔重繪），欄位＝部門(下拉·雙向連動擔當)·擔當·前置三窄格·工期·**投入%(六檔行為錨點 0/10/25/50/75/100)**·**計畫日期(可編輯)**·**狀態(實際優先衍生·唯讀)**·⚙編輯。**編輯彈窗**＝實際開工/完工日＋擱置(附原因)＋打回重測(有實際完工日才有→成因窗→`isLoopTask` 重做列)＋刪除(二次確認)。列間「＋」＝中途追加(成因窗＋`scopeGrowthCount++`)。**ECN 一律 forward 排程**（`_ecnForwardVariants` 清 `endDate` 存 `targetEndDate`，因 `_effScheduleDir` 雙日期強制 interval）。範本 `effortRatio` 歸六檔＋生管PMC→生管。開案落地補 `baselineHours`/`ecnEvents`。名冊卡複用 `_s2DeptPanelHtml`＋`_s2OpenDeptModal`（`_s2ApplyDepts` 加 ECN 分支）。
- **今日確立的鐵則（見文件，勿再犯）**：①共用是預設決策·別問 A/B（AGENT_GATE 規則13）②UI 元件一律自適應·grid item `min-width:0` 防 overflow（踩坑 坑10）③狀態模型：日期分「計畫/實際」·狀態衍生不手選·時間到≠完成·完成靠實際（§19.10 設計原則）④外層大表＝排程監控·內層彈窗＝進度回報/異常處置（§19.10 設計原則）。
- **下一件**：投入% 批量修改（Paul 需求）→ 全專案總覽「PM 跨案負荷」區塊（§19.4 Phase 1 交付 b）→ BOM·ROI（Tab B 先設計）→ 結案流程/epoch 凍結/翻案重啟。**專案範本管理頁分 NPI/ECN·Admin 直接編修**（§19.11 待做，取代改 Excel）。受影響機種/多子案＝Phase 2 與 variant 一起。

### 2026-06-29

**目前 HEAD**：版本號 app.js／各拆檔 `?v=20260630-26`／style.css `?v=20260630-26`｜**app.js 物理拆檔完成（11 檔·批1–10·160 全綠，§18.7.2）**｜**§19 ECN 設變模組設計草稿落地（待拍板）**｜PDCA 報表區**拔除完成（第一刀 UI −563 行＋第二刀資料層孤兒）·線上驗 Pass**（§18.14；夾島 getProjectStages/datalist 保留、可販日 `pdcaData.targetDate` 保留、migration 不動、處 6/7 收掉）；Phase 2 ② 較上週趨勢（§18.12）；口徑收斂（§18.13，160＋差異 84/0）；Excel WBS 狀態 round-trip 修正（踩坑坑9）；安全硬化 #1/#2＋安全頁——以上均**線上驗 Pass**

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

**已落地（2026-06-30，本 session）——Phase 2 ② 較上週趨勢：前端 KPI 輕量週快照（線上驗 Pass），詳見架構 §18.12**
- **走 B 方案**（前端 localStorage 快取，不為較上週做 §17 後端快照）；4 KPI 公式不動（沿用 §18.8），快照只捕捉當下值。
- `a4d1dd1`：`Portfolio._kpiSnap`（key `pm_kpi_snapshot_v1`、DATA 外、只留本週＋上週）＋`_trendBadge`（色義看好壞不看箭頭）；4 卡加趨勢徽章（健康度比紅燈數／進度比%／延誤比筆數／雜事比工時，琥珀中性）；無上週留白「—」；`?v=20260630-12`。**160 PASS＋線上驗（首載留白＋注入假上週彩色）兩態 Pass**。
- **口徑稽核（讀檔比對，無改 code）**：進度全系統共用 `taskDisplayProgress`（零分歧）；逾期 Portfolio／Project DELAYED 口徑一致；工時 Portfolio choreRatio／工作台一致。無衝突。**唯二可選收斂**：逾期判斷複製 7+ 處、工時公式複製 3 處（值一致、潛在漂移）→ 抽 `isOverdue`／`weeklyHours` 共用 helper（獨立批次，見下一件）。

**已落地（2026-06-30，本 session）——Excel WBS 狀態 round-trip 修正（線上驗 Pass），詳見踩坑坑9**
- 起因：Prod 下載 Excel 匯入 Dev，兩邊 KPI 對不上。查出 WBS Excel＝計畫骨架交換、非全狀態鏡像（匯入重設 scheduled/urgency/dept/重算）。
- **修狀態那半**：`mapStatus` 加認英文內碼 `done/wip/hold`（保留中文，additive）＋匯出 `cellValue` status 改寫中文標籤（複用 `STATUS_LABELS_ZH`）。狀態自此 round-trip 正確（擱置/已完成不再變 pending 誤算逾期）。`node --check`＋round-trip 14/0＋160 PASS；線上驗：Dev 匯出狀態欄中文 ✓、DONE/DELAYED 與 Prod 一致 ✓。`?v=20260630-14`。
- **殘差為設計侷限**（非 bug）：scheduled/urgency/手動 dept/行事曆不隨 Excel 帶 → WORKDAYS LEFT、部門負荷等仍可能差。要全一致走雲端同步（含 calendars）/JSON/§17。

**已落地（2026-06-30，本 session）——PDCA 報表區拔除·第一刀（UI/頁面，線上驗 Pass），詳見架構 §18.14**
- 砍 17 個 `App.*pdca*` render 函式（含口徑收斂處 6/7）＋導覽 4 處＋CSS `.pdca-*`/`.pst-*`；**−563 行**。可販日方案 A（保留 `pdcaData.targetDate`、不動 KPI）。
- **夾島保留**（盤點報告誤判可整段砍、實讀才抓到）：`getProjectStages`＋三個 datalist helper。用 node 腳本錨點刪 3 段跳 2 島；計數證明（PDCA 函式 17→0、島不變、class 歸零）＋`node --check`＋160 PASS＋線上驗。`?v=20260630-15`。
- **踩坑**：node 改中文檔讀寫編碼要一致 utf8（踩過讀 utf8 寫 latin1 寫壞中文，git checkout 還原）→ 記入坑5。
- **第二刀已落地**：清資料層孤兒（`STORE.pdcaGroups` key/load/save／`DATA_SUFFIXES`／`ensurePdcaGroupsRoot`/`ensureTaskPdcaGroup`/`ensureAllPdcaData`＋呼叫＋殘留註解）；保留 `ensurePdcaData`＋`pdcaData.targetDate`＋`DATA.pdcaGroups` 預設（migration 用）。`node --check`＋160 PASS。`?v=20260630-16`。

**已落地（2026-06-30→07-01，本 session）——app.js 物理拆檔完成（11 檔）＋ §19 ECN 草稿，詳見架構 §18.7.2／§19**
- **拆檔（批1–10 全落地）**：`app.js`(11928 行)→ **app-core**（地基＋跨檔共用 helper＋modal＋bootstrap）＋ portfolio／meeting／settings／schedule／shared-render／report／excel／workspace／project／template。**零行為變更（純剪貼）**，每批 `node --check`＋160 測試全綠、獨立 commit；5 個關鍵跨檔夾島照 §18.7.2 歸位（getProjectStages／taskDisplayProgress／modal→core、_gantt 系列＋exportProjectWbs→excel）。載入序 app-core 最先、bootstrap 結尾，`?v=20260630-26`。**剩 github.io 線上驗**（重點驗載入序/TDZ：登入頁正常隱藏、各頁渲染、智慧排程/匯出入無 console 紅字）。
- **§19 ECN 設變案管理模組（設計草稿）** `dd5d594`：複用三劍客排程／Stage 2 大表／智慧面板＋新增 S/M/L 範本·投入比例%·負荷雙指標(人横切·案縱切)·迴圈/重啟紅旗·結案版本快照·BOM 差額面板。**整節 `[待拍板]`**，等 RD/老闆會議鎖定；§19.1 有決策表（已填建議值）。

**已落地（2026-07-01，本 session）——§17 全域每日備份＋還原（Prod 線上驗 Pass），詳見架構 §17.8**
- **後端**（`apps-script-cloud-sync.gs`，additive、不動現有寫入路）`fd2e391`：`dailySnapshot` 每小時 trigger、命中設定時鐘點才把 `data` 分頁複製成 `snap_YYYY-MM-DD`（複用 45000 分格）＋清超期；`snapshots`／`snapshot`／`backupConfig`(GET,role≥editor)＋`setBackupConfig`(POST,admin)，沿用 §14 JWT。編輯器驗（testSnapshotNow／setupBackupTrigger）＋Prod 測試連線 Pass。config.js `BACKEND_URL` 換新部署。
- **前端**（`settings.js`「資料與備份」tab）`ab48873`：雲端每日備份（啟用／時間／保留天數／狀態）＋備份還原（版本下拉→預覽→confirmModal→整碗替換＋回寫雲端）；抽 `CloudSync._applyCloudData` 共用（app-core，download 與還原共用）。`?v=20260701-1`。
- **安全頁**：`SECURITY_INFO` 把備份從 roadmap 移到「📦 資料保護」防護網（論述改已具備）＋roadmap 換「單一專案精準還原」。`?v=20260701-2`。
- **決策**：保留 30 天（UI 可改）／存法＝同試算表 snap 分頁／還原回寫雲端／備份時間 UI 可設。**尾巴**：Dev（`file://`）無法 Google 登入故不跨機同步、**維持現狀**（Paul 拍板不做，要做需 localhost＋OAuth＋獨立測試 Sheet）；單一專案還原列 §17.6 後續。

**已落地（2026-07-01，本 session）——§19 ECN 設變案模組 Phase 1 定案（Mockup 定版），詳見架構 §19.1/§19.9/§19.10**
- 兩輪與 Gemini 來回＋三張 Mockup（開案 Modal／內頁三區塊／BOM 抽屜）定版。§19.1 決策全數定案、範本 §19.9 填妥（S/M/L 三張含投入比例%）、Phase 1 權威施工清單 §19.10（Modal 欄位＋排程模式切換＋選 SML 展開範本＋內頁三區塊＋大表編輯鎖/狀態唯讀＋投入比例 HintBox＋BOM 萬用 schema/雙幣別/清除重貼）。
- **核心觀念**：投入比例%＝該任務吃某人一天的%（工時點數＝比例×日工時×工期）；不需加總 100%；跨案同人同日 >100%＝爆單。負荷雙指標正名（左側＝本案在途+累計；人橫切跨案圖屬 Phase 2）。純文件、未動 code。
- **下一件**：Phase 1 開發（開案 Modal＋內頁三區塊大表＋BOM 純工具，複用三劍客/Stage2/_ovf/exceljs）；洞7 迴圈互動 Stage 2 時定；Phase 2（跨案人均負荷圖／BOM 認定卡鎖）另議。

**下一件 / 待辦**
1. **線上驗證（github.io）**：Phase 2 第一刀（部門負載 stacked／容量線／爆單、HintBox 位置、小時 Task 部門分流、工時設定彈窗、設定未存提醒）部署後全量過一遍；工作台 UI（v6 週曆／白卡化／KPI 卡／時程表設定）DEV 已驗多項 Pass。
2. **Phase 2 後續**：③ 會議/事件 `dept`/`owner` ＋橘塊納會議 **已落地（§18.10b，node 驗已補 160 PASS、剩 github.io 線上驗）**；② 趨勢「較上週」**已落地（§18.12，B 方案前端快照、線上驗 Pass）**。Phase 2 三刀全落地。見 §18.10b／§18.12／§18.5。
   - **口徑收斂 已落地（§18.13，等值重構）**：逾期 4 處改 call 現成 `isTaskDelayed`＋工時抽 `weeklyScheduledHours`/`weekCapacityHours` 共用（Portfolio／工作台四處）。`node --check`＋160 PASS＋**差異測試 84/0**（OLD≟NEW 逐筆相等，無對照版改用程式邏輯驗）。PDCA 處 6/7 **已隨 PDCA 拔除第一刀收掉**（§18.14）。`?v=20260630-13`。
3. **§17 全域每日備份+還原——✅ 已完成**（2026-07-01，Prod 驗 Pass）：後端每日快照 API＋前端「資料與備份」tab＋安全頁論述已改，詳見上方落地紀錄與 §17.8。單一專案還原（§17.6）列後續增強。
4. **app.js 全檔物理拆檔——✅ 已完成**（批1–10，2026-06-30→07-01）：11 檔全落地、每批 160 全綠、`?v=20260630-26`，詳見上方落地紀錄與架構 §18.7.2。**僅剩 github.io 線上驗**（拆檔零行為變更，重點驗載入序/TDZ）。
5. **已知尾巴**：部門負載橘塊現含時段任務＋專案會議（category=meeting 且已指派/全體均攤；打掃與未指派不計、週末會議不計）；設定 cal-paste 打字也算 dirty（離開可能多跳一次提醒、按放棄即可）；「儲存並離開」走 `saveSettings(true)` 跳過工時影響彈窗；KPI 較上週首週/清快取時 4 卡留白「—」（需累積一週才亮趨勢，符合不放假數字）；overflow 面板字級（規範過時待重看）。
