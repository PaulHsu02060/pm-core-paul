# PM-Core Archive · C · 排程引擎

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

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

> ⚠ **層三部分已被 §4.8.7.10 取代（2026-06-27）**：本節「層三＝獨立 segmented＋即時戰報＋時程異動表」經使用者拍板**砍掉**（過度設計、操作割裂），改為「層二搞不定 → 直接進 Stage 2，Stage 2 頂部進度條嵌 dashboard 指引」。已刪 `_ovfSegmentedHtml`／`_ovfBattleHtml`／`_ovfStage3TableHtml`／`_ovfLayer3CardHtml`／`_ovfLockedTableHtml`。**層一/層二聚焦面板＋Top3 快選＋mini戰報＋對照看板仍有效**，見 §4.8.7.10。

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

##### 4.8.7.10 層三退役 → 層二直通 Stage 2 ＋ Stage 2 嵌入式 dashboard（2026-06-27，`[unverified]`）

> 設計演進：§4.8.7.9 的「層三獨立頁（segmented＋戰報＋時程異動表／甘特＋抽屜）」經多版 mockup 後使用者判定**過度設計、操作割裂**，拍板砍掉。
> 終極邏輯：**有衝突時頂部只到層二；層二的大方向日期＋Top3 長工時搞不定 → 按右下角「下一步：進階調整任務工期」直接進 Stage 2 標準大表**（完整繼承層二改好的工期），由 Stage 2 既有版面**無縫嵌入**輕量 dashboard 指引補完。版本 app.js／style.css `?v=20260627-20`。

**A. 退役層三（移除，不再有獨立頁）**
- 刪 `_ovfSegmentedHtml`／`_ovfBattleHtml`／`_ovfStage3TableHtml`／`_ovfLayer3CardHtml`／`_ovfLockedTableHtml`＋ `_ovfCaseHtml` 的 `sel==='3'` 分支＋層二 Top3 的「解鎖層三」連結。
- `_ovfGotoStage2` 簡化為直接 `_renderStage2New()`（不軟擋；剩餘紅案由 Stage 2 dashboard 指引）。底部主鈕文案「下一步：進階調整任務工期 →」。
- **保留**：層一 `_ovfLayer1Html`／層二 `_ovfLayer2CardHtml`+`_ovfLayer2Panel`+`_ovfTop3Html`（Top5 穩定清單＋階段·部門＋Enter 存）＋mini戰報 `_ovfMiniBattleHtml`＋對照看板 `_ovfRangeBadge`；方案一/二達標仍 `_ovfAfterResolve` → Stage 2。
- ⚠ `.ovf-seg*`／`.ovf-battle*`／`.ovf-s3*`／`.ovf-tbl*`／`.ovf-locktable`／`.ovf-p3*` CSS 暫留為 dead（無害，待清）。

**B. Stage 2 嵌入式 dashboard（純加法，零刪既有欄位/按鈕）**
- `_s2StageStatuses(variantId)`：**單一真實來源**——抽出「各階段上色（interval/backward 同 §4.8.7.4b 邏輯）＋每階段 `lack`＝該段落點超出上市日的工作天」；甘特標籤與當前階段橫條共用，避免兩套漂移。
- `_s2GanttHtml`：每階段進度條尾端加狀態標籤 `[✓正常]`（綠/黃）／`[⚠️尚缺N天]`（紅）；紅標 `onclick` → `_s2GotoStage`（選該階段→表格切該階段任務＋平滑捲到表）。只填單一日期（無上市日）→不顯示標籤。
- `_s2BannerHtml`：當前階段橫條加狀態文字「（時程充足）／（⚠ 排程尚缺 N 個工作天，請縮減下方關鍵路徑工期）」。
- `_s2ListHtml`：關鍵路徑列**淡橘底高亮＋「關鍵路徑」tag**（`isCrit`＝長工時門檻近似 `max(15, 案內工期前 1/3)`）。工期框直接改 → `_s2SetDuration`（既有，重排）→ 標籤即時連動。
- 資料繼承：Stage 2 讀同一份 `_tplPreview`，層二的工期改動天然帶入，無需額外傳遞。

**已知近似／待辦**
1. 關鍵路徑＝長工時門檻近似（真關鍵路徑＝最長依賴鏈，待辦）。
2. dead `.ovf-*` CSS 待清。
3. `[unverified]`：待線上驗（層三入口消失、層二「下一步」直通 Stage 2、進度條紅標可點捲到階段、當前階段狀態文字、關鍵路徑高亮、改工期→標籤連動）。

**關鍵函式**：移除見 A；新增/改 `_s2StageStatuses`／`_s2GotoStage`／`_s2GanttHtml`(+標籤)／`_s2BannerHtml`(+狀態)／`_s2ListHtml`(+關鍵路徑高亮)；接線 `_ovfCaseHtml`／`_ovfGotoStage2`／`_ovfTop3Html`。**CSS**：`.s2-gstat`(.ok/.bad)／`.s2n-bn-bad`/`.s2n-bn-ok`／`.s2-crit`(列)/`.s2-crit-tag`／`.ovf-t3hint`。

### 4.9 工期排程接 UI 自動觸發（2026-06-13 已落地，commit `cc7436a`）

落實 4.7「工期依賴排程＝存檔即自動算」，把引擎接上 UI：

- **A-1 存檔自動觸發**：`saveNewTask` / `saveTask` 存檔後（Storage.save 之前）自動跑 `applySchedule(DATA.tasks, 'full')`，前置鏈自動傳播算出 `scheduledStart/End`。
- **A-2 表單回顯**：`autoStartDisplay` 改讀 `t.scheduledStart`（有值顯示推算日、沒值顯示「待排程引擎推算」），取代舊版只讀 `t.start`。
- **錨點保護**：自動觸發排除 `anchor:manual` / `anchor:override`（用 `!String(s.reason||'').startsWith('anchor')` 過濾），手填日不被覆蓋；只有真 blocked（circular/unscheduled）才 toast 警告。
- **applySchedule 回傳結構**：`{ applied, skipped, total }`。skipped 裡 reason 四種值：`circular`、`unscheduled`、`anchor:manual`、`anchor:override`。

**風險記錄：** 存檔即觸發會讓「尊重手填不覆蓋」的判定每次存檔都跑（比手動按一次頻繁）。computeSchedule 須確實尊重手填錨點不覆蓋（§4.3），自動觸發放大任何判定漏洞。已驗 90 測試 §5/§7/§8 手填保護通過。
