# WBS 匯入器 importWbsExcel 實作藍圖（M1 回家照此 coding）

## 骨架（照 parseExcelImport 三段式）
openWbsImport() → parseWbsExcel(file) → performWbsImport()

## 1. openWbsImport()（入口 modal）
- 照 openExcelImport（:6075-6152）抄：openModal + 拖放區 + 隱藏 file input(accept=.xlsx,.xls) + 預覽容器 + log 容器 + 「確定匯入」鈕(預設 disabled)
- setTimeout 綁事件：zone click→fileInput.click、dragover/drop、change → 導向 parseWbsExcel(file)
- 入口按鈕：設定頁「資料管理」按鈕列（renderSettings :5580 旁），加「匯入 WBS Excel」鈕(tb-action ghost, onclick=App.openWbsImport())；:5584-5587 help 區補一行說明

## 2. parseWbsExcel(file)（解析預覽，全包 try/catch）
- const buffer = await file.arrayBuffer()
- const wb = XLSX.read(buffer, {type:'array', cellDates:true})
- 讀兩張 sheet（按名直取）：
  - const wsWbs = wb.Sheets['J系列整合WBS']（取不到報錯）
  - const wsInfo = wb.Sheets['專案資訊']（僅讀專案名稱；取不到→用預設專案名，不報錯）
- const rows = XLSX.utils.sheet_to_json(wsWbs, {header:1, defval:null, raw:false, dateNF:'yyyy-mm-dd'})
- for (let i=1; i<rows.length; i++) 逐列：D欄(idx 3)任務名空→skip；否則照 22 欄解析（見 wbs-import-spec.md 對應表）暫存進 App._wbsParsedRows
- 解析專案資訊分頁：只取專案名稱（單一專案 J 系列）。日期不在此讀——infobar 即時算（乙案，見 project-infobar-spec.md），匯入器不灌日期
- renderWbsImportPreview()：填統計（幾筆有效、幾筆 skip）+ 預覽表 + enable「確定匯入」鈕

## 3. performWbsImport()（確認執行）
- 取 App._wbsParsedRows
- 找/建專案：照 :6313-6339，但只建一個專案（J系列，名稱來自專案資訊分頁）
- 清舊（甲案）：清掉此專案既有任務後重灌（DATA.tasks 過濾掉該 project 的）
- 逐列建 task：
  - 模板照同步版（:1484-1522）改：id 走 U.id()（:666，不要 inline 拼）、synced:false、不要 locked、加 wbs 欄存 N 序號、predecessor 原樣存序號字串
  - 狀態：actualEnd→done / actualStart→wip / 否則 mapStatus(全域版 :1582)
  - 日期：D.fmt(d,'iso')（:991）
  - 緊急：deduceUrgency（:1573，全域）
  - 新欄：mustDeliver(O✓→true) / deliverable(P) / riskIssue(Q) / delivered(U) / deliverableLink(V)
  - 必要欄位預設值照 :3281-3291（createdAt 必帶 :1520）
  - DATA.tasks.push(task)
- Storage.save()
- refreshAll()（renderSidebar + renderPage，補 parseExcelImport 漏掉的 refresh）

## 回家驗證重點（node + F5）
- 93 筆有效進來、空列正確 skip
- 前置抽查：2FS+2 連到 wbs===2、118,119 連到 118/119（computeSchedule 算得出依賴）
- 階段/子群組/類型（里程碑畫菱形）正確
- 風險議題(Q欄)有進 riskIssue、交付(O/P)正確
- 資訊條驗證：匯入後 getProjectStages 算得出性試/量試/量產階段 latestEnd、任務名含可販的完成日，infobar 即時顯示（不靠匯入灌日期）
- 重複匯入：再匯一次→清舊重灌、不重複

## 注意
- mapStatus 用全域版（:1582），不是 performExcelImport 內部版（外面拿不到）
- task id 用 U.id()，不要學 performExcelImport :6429 的 inline 拼法
