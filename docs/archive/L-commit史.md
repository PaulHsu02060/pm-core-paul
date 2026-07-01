# PM-Core Archive · L · 完成的 commit（歷史）

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

## 附錄：完成的 commit

**2026-06-29（雙軌導覽 Phase 0/1 + UI/設定整理 + 修正，基準 HEAD `c0f9717`）：**
- `9c87e41` docs §18.7 命名空間方案 + §18.8 總覽頁定案
- `869a955` Phase 0 導覽拆分 + Workspace/Portfolio 分包
- `f03d5cd` Phase 1 總覽頁 MVP
- `974e16e` UI 配色降亮 + 會議面板簡化 + 格線A + 日期凍結/午休/週末 + Portfolio B
- `86cc402` 設定精簡（排程 tab 只留工作日曆）
- `c0f9717` 修正（sticky 回正 + token toast 守衛 + DEV 面板收起）
- 基準 HEAD：`c0f9717`；版號 app.js／style.css `?v=20260629-7`。全 `[unverified]`、線上待驗。詳見 §18.9。

**2026-06-28（Dashboard 階段一降噪 + Excel 新建匯入修復，基準 HEAD `498073b`）：**
- `59755b7` feat(dashboard階段一)：儀表板降噪—兩說明卡(階段進度/部門負荷)預設收起；6 數據卡白底＋頂部細彩線＋數字 24px＋標籤縮小（清 6 個 `--kpi-*-l` 孤兒 var、tone 改 `border-top-color`）；匯出 Excel 改 ghost 次要鈕＋下載 icon；延遲徽章＋逾期 N 天改 terracotta 暖膠囊。`?v=20260628-1`
- `fa6336d` fix(Excel匯入新建)：`buildWbsPreview` 案別 variant 補 `schedule`（對齊 applyTemplate）修 Stage 2 `_s2VariantSlack` 讀 `v.schedule.startDate` 爆 TypeError（見踩坑手冊坑 7）。`?v=20260628-2`
- `42e6e7b` refactor(saveProject)：移除不可達的舊 create 分支（含 Excel「下一批實作」stub＋已不存在的 `pf-mode`），收斂成純編輯（新增專案走 `_flowStep1`）。`?v=20260628-3`
- 基準 HEAD：`42e6e7b`；版本號 app.js `?v=20260628-3`、style.css `?v=20260628-1`。

**2026-06-27（任務 modal 內層重構 + 退役 CSS 清理，基準 HEAD `ef08f5f`）：**
- `bae6919` feat(任務modal)：內層排版重構—六分區＋排程時程群組卡＋時程三劍客；預計開始改單一可編輯日期格（data-autostart 防誤落錨）；砍可切分欄位；時間連動 HintBox 預設收起；欄位標題 13px 暖墨；清退役 startmode CSS（見 §6.2）。`?v=20260627-31`
- `c5ca512` chore(§4.8.7.9)：清退役 `.ovf-*` 層三孤兒 CSS（40 個 zero-reference class：locktable/seg/battle/s3-tbl/p3/resolved/t3hint 等；腳本交叉比對 app.js+templates+index.html 確認，剩 56 個全有引用）。`style.css ?v=20260627-32`
- 基準 HEAD：`c5ca512`；版本號 app.js `?v=20260627-31`、style.css `?v=20260627-32`。

**2026-06-23（§15 Excel 匯入收斂 + §16 header 重排，基準 HEAD `c3ff595`）：**
- `82feb84` §15 設計（Excel 匯入收斂 + 資料管理歸位）
- `8d542c3` 段1 資料管理歸位 + 廢除清除重複
- `98f7068` 雲端同步失敗通知（upload alert + download toast，一次性旗標防風暴）
- `ed606ad` 段2 專案頁覆蓋匯入（performWbsImport + projId）
- `534c8c4` §15.3 同名守衛異名擋死 + 文字中性化（文件）
- `1975d6e` 覆蓋匯入同名守衛（異名擋死）+ 文字中性化（code）
- `aefbab7` §15.5 巢狀欄位自動持久化 + version 寫入規則
- `9136fcc` 段3 新建專案同名告警 + 並存版本（三模式齊全）
- `b9b8c72` 段4 sidebar 同名專案顯示版號 + 日期
- `5f3ba76` §16 設計（header 重排 + 三層配色）
- `3db41d1` §16 補操作鈕隔線分組 + 四視圖分段控制
- `35f6f80` §16 塊1-3 header 三層配色 CSS 打底
- `2a9b992` §16 塊4-5 header 重排 + 匯出下拉 + ⋯選單
- `c3ff595` U.toast 加 {duration,closable} + 覆蓋匯入成功自動關 modal + 清多餘 btn.disable
- 基準 HEAD：`c3ff595`

**2026-06-20（共用表格規範 .data-table，§8g 治本主線）：**
- `dcae482`/`0804c8a` 待辦 subgrid 步2 + 剩餘空間分散 `[unverified]`
- `f8c539f` docs：第八部分之七 規範定案（統一 `<table>` 路線①）
- `0e4feda` 步1 地基（:root token + .data-table + 4 欄類型 class，dormant）
- `a25ef64` docs：§8g 補強（col/td 兩用 + ISO 日期歸 col-mid + 遷移序）
- `8651a4e` 步1.5 colgroup 寬度 CSS（col.col-* 接 token）
- `504510c` docs：Path X 排除 rp-table + 試金石改 WBS 單表
- `2b182ed` 步2 試金石：WBS 匯入預覽套 .data-table（已線上驗通：深 sage 表頭/五欄對齊正常）
- `968aa96` 步3-B1：.data-table.compact + .col-wrap CSS（dormant）
- `c3ebc3e` 步3-B2a：Excel 匯入預覽套 compact `[unverified]`（匯入流程才顯示，同 WBS pattern）
- `e578080` 步3-B2b：任務史套 compact + col-wrap（本週工作/預計完成兩欄）`[unverified]`（需有歷史紀錄才顯示）
- `d438fd2` 步4：公休日表 .cal-row div-grid → .data-table（年份分組 tbody + colspan 年份列 sticky + cal-table 專屬 zebra）已線上驗通
- `f21853a` docs：附錄補步3+步4 進度
- `b9c5203` docs：§8g 規範改版—固定欄寬→內容自適應（table-layout auto）
- `88fd204` 一+二階段 auto：CSS 主體 fixed→auto + 四文字表（WBS/Excel/任務史/cal）拔 colgroup
- `74e362d` 步5 重做：s2-tbl 原始 inline 直接做 auto（取代已 revert 的 fixed 步5）
- `0b0e3be` s2-tbl 需交付欄改靠左
- `8037a0c` s2-tbl 列間插入元件 .dt-insert-row（通用，待辦共用）+ 操作欄收尾（B）
- `2e0c612` 步6：待辦 task-grid div→table + auto 欄寬自適應（§8g.8 死碼清 :root 三寬度 token；進度條/時程/狀態欄距調勻）
- 基準 HEAD：`2e0c612`；版號 app.js `?v=20260620-12`、style.css `?v=20260620-16`。**§8g 共用表格規範全部完成**：五張表 + 待辦全遷 auto、通用 .dt-insert-row、死碼清光。下一步轉非表格主線（見 §9）。

**2026-06-19（§8f.9 viewonly 可看不可改體驗，線上已驗 pass）：**
- `7b55e21` 設定頁限 Admin 三道防線（showPage 攔截 + renderSettings 守衛 + 側欄隱藏）
- `a10e4de` modal 寫入鈕 viewonly 隱藏（data-edit-hide 乙案，8 顆建立/儲存鈕）
- `20a38c9` 建立專案拆「建立」「下一步」兩鈕（解 data-edit-hide 與預覽切換衝突）
- `c21d7e8` viewonly 第一階段帶標準模板假資料 + 欄位 disabled
- `6a1c808` 第二階段 viewonly 反灰（render 後一次 disabled）
- `2530957` userMode 四處散寫收斂進 refreshUserBadge（單一真實來源）
- `b856cc3` viewonly 改「入口可開 modal + 內部擋寫入」策略（甲）+ deleteProject 補 _roGuard
- `6e0e9c6` saveProject _roGuard 下移，viewonly 可進第二階段預覽
- 基準 HEAD：`6e0e9c6`，§8f.9 viewonly 體驗前端全部線上驗收 pass

**2026-06-18（§12 甘特視圖主線，公司桌機+筆電 UI 直上 main）：**
- `ac938a3` docs：§12 甘特定案（雙態白字/空框/逾期變色 + 連線依真實前置大階段 + 四單位預設週 + 6 變數對照）
- `5c99868` §12 補 :root 三變數（--gantt-plan/done/holiday）
- `d492248` §12.4 假日底色（讀 D.isWorkday，週末併入假日）[線上已驗：假日欄暖灰、今日紅、補班不灰]
- `b048a93` §12.2 Plan/Actual 雙態條（plan 虛框+actual 填色、done/wip/逾期狀態色白字、未開始空框、逾期爆框標天數、里程碑菱形、收 inline 進 class）[線上已驗：未開始空框、逾期爆框+天數、膠囊收 class 沒掉色]
- `c6ebd0b` §12.3 甘特連接線骨架（SVG overlay + data-link-id 錨點，僅專案頁）
- `7fcf1d9` §12.4 甘特表頭顯示假日名稱（讀 base.holidays，連假往前歸名）
- `4f09453` §12.4 假日名加大加粗（8.5→10px/600/ink2）
- `2aa9b87` §12.3 Hunk2 跨階段前置 clay 膠囊 badge（_ganttPreds + ti-link 計數）
- `c7d8fc0` §12.3 badge 位置修正 + z-index 防遮蔽
- `42c896c` §12.3 badge 改用既有 initTooltip + 移回填色層（單一 tooltip 來源）
- `f796414` 甘特 bar tooltip 全面改走 initTooltip（data-tip="甘特狀態|..."）[線上已驗]
- `dbb3dd7` 甘特專案配色圖例改只在總儀表板顯示（專案頁隱藏）[線上已驗]
- 基準 HEAD：`dbb3dd7`（§12.3 Hunk3 同階段 SVG 折線尚未實作）

**2026-06-18（甘特續+第二階段主線）：**
- `4ffe59a` 甘特週導航改 ±7 天（上週/下週）[unverified]
- `fb72847` §12.5 甘特篩選列加階段/負責人下拉（buildGanttFilterHtml 重寫）[unverified]
- `e37a767` 第二階段工期可改+即時重排（抽共用 _reschedulePreview）[unverified]
- `41f13f3` 第二階段未指派閉環（底部橘條 + 建立前 confirm）[unverified]
- `7d8950c` 第二階段前置欄 hover 高亮被指向列（data-preds）[unverified]
- `641aaac` 第二階段前置可改下拉（同案序之前候選，存 id#FS 重排）[unverified]
- `7026129` 第二階段列間插入（＋鈕 splice 全 schema 新任務）[unverified]
- 基準 HEAD：`7026129`

**2026-06-17~18（序改日期排序主線，家裡桌機 Node 驗）：**
- `15ecfde`（06-17）第一刀：序改日期排序 + 待排區
- `9107bca`（06-17）二刀-A：篩選四維生效
- `edc5d8c`（06-17）二刀-C：前置下拉註解對齊
- `80fad1b`（06-18）二刀-B step1：列間➕自動接前置（app.js +4/-2、index.html `?v=20260618-1`）
- 基準 HEAD：`80fad1b`，引擎 schedule 99/0、workday 42/0
- 註：06-16 整批、Auth 三層（`7a27203`/`430a0f5`/`e1ec402`/`d2ae501`，[unverified] 線上待驗）、範本第二階段（`0d93dd0` 等）屬獨立主線，各自收尾時補附錄。

**2026-06-14（家裡桌機）：**
- `6351e92` 工作日曆兩層疊加 DATA.calendars 結構 + isWorkday 改讀（§之二.2）
- `8808e4a` 補 SS/FF/SF lag>0 測試（鎖前置引擎 lag 縮放）
- `70f8c97` 修正 FS 前置 lag +1 公式 bug（對齊 Excel WORKDAY，藏 90 測試後靠外部標準戳破）
- `7ffb15d` 修正 wbsDateStr 匯入日期 UTC 位移 -1天 bug（toISOString→D.fmt 本地）
- `a9499a4` 移除 Task 層錨定 UI 空殼（錨定歸 Template 層，§6.8 廢除）
- `b10c457` 工作日曆 DATA.calendars 持久化（localStorage + 雲端跨機）
- `3d61155` parseCalendarPaste 改彈性表頭對應 + 去特定公司字眼（§之二.9）
- `8a7d2dd` 工作日曆設定頁 UI（公休貼上匯入，§之二.9 五步閉環）
- 測試：排程 90 + 工作日 42 全綠；J 系列驗收 74 筆零不一致

**2026-06-13（家裡桌機）：**
- `6a89be4` 釘子改視覺 toggle badge + Tabler icon（§6.8）
- `416f970` 任務列中間插入 hover➕（§6.9）
- `cc7436a` 任務存檔自動觸發工期排程 + 表單顯示推算日（§4.9，A-1/A-2）
- `aca041c` 移除甘特一鍵套用排程按鈕（§4.7）
- （另：feat/pred-id-migration merge `d56d800` 後 revert `96bc2fd` 止血——id 化半套導致 J 系列前置全失效，完整版列 §9-D 第13項）
- 基準 HEAD：`aca041c`，引擎 90/90 PASS
- **待線上驗證（明天無痕視窗）：** ① A-1 新建有前置任務存檔→開始日自動算 ② A-2 表單顯示推算日 ③ 甘特圖無「⚡一鍵套用排程」 ④ 中間插入 hover➕ 對齊/能插/末尾不放 ⑤ 釘子圓底「已釘」badge

**2026-06-06（家裡桌機）：**
- `8f0544a` 移除分類/處理方式欄（UI 拿掉，category 資料層保留）
- `f70a2c0` 欄位改名排序加必填驗證
- `e40931c` HL 風險勾選 + 交付物 + 實際執行反向摺疊
- `5eaa1f9` docs：M2 任務表單設計文件
