# 專案頁頂部資訊條規格（M3，建議與 M1 一起做）

## 顯示內容（五格）
性試結束日 / 量試結束日 / 量產結束日 / 預計可販日 / 另案開發說明
- 前四格是日期，第五格是文字（截圖第5格是說明性內容，如「2.2kW 待壓縮機與航嘉電控盒交期確認，預計6/15評估」）

## 位置
插在 proj-header（:2600）之後、buildProjKpiHtml（:2602）之前，當第四塊放最前，不動 header 內部結構。新函式 buildProjInfoBarHtml(proj)。

## 資料欄位（收進 project.pdcaData 同一層，不另開頂層）
ensurePdcaData（:462-466）加四行 if undefined：
- targetDate（既有）= 預計可販日，直接複用，不新增（PDCA 頁與資訊條自動同源）
- dvtEndDate（新增）：性試結束日 ISO
- pvtEndDate（新增）：量試結束日 ISO
- mpEndDate（新增）：量產結束日 ISO
- sideProject（新增）：另案開發說明文字
migration runMigrations（:557-559）/ ensureAllPdcaData（:478）會自動涵蓋舊專案。

## M1 灌入點（一處）
匯入器建/找到 J 專案後：Object.assign(proj.pdcaData, {dvtEndDate, pvtEndDate, mpEndDate, sideProject})，值來自「專案資訊」分頁。所以 M1 和資訊條一起做。

## 實作（複用現成）
- 卡片產生器：照 buildProjKpiHtml 的 card(label,value,sub,dataTip,warn,stack) closure（:2745-2750）寫 buildProjInfoBarHtml，五格同 KPI 六卡同構
- 日期格式化：D.fmt(date,'iso' 或 'md')（:349）
- 剩餘工作天（若某格要顯示「距量產還 N 工作日」）：D.workdaysBetween（:2740）
- tooltip：data-tip + initTooltip（:6656）
- CSS：複用 .stats-row + .stat/.stat-num/.stat-label（:245-260），開個 .proj-info-bar 變體 class 同款（含 kpi-warn 警示紅 :265 適期日可用、.stat-sub 第二行 :267）
- 顏色走 :root 變數，不寫死 hex

## 缺損容忍
- 某格日期空 → 顯示「—」或「未設定」，不報錯
- 整條資訊條：五格全空（簡易專案）→ 整條不顯示，或顯示「未設定階段日期」，不破版

## 驗收
- J 系列匯入後，資訊條顯示性試 2026-08-24 / 量試 2026-11-20 / 量產 2027-01-28 / 可販 2027-01-30 / 另案 2.2kW 說明（對照舊系統截圖）
- 簡易專案（無這些日期）資訊條優雅降級不破版
