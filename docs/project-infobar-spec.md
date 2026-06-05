# 專案頁頂部資訊條規格（M3）

## 視覺定案（款式 C 進度時間軸）
- 版型：一條水平進度線串四個里程碑點（性試 DVT → 量試 PVT → 量產 MP → 預計可販）
- 里程碑點狀態：已過的日期=實心點、未來=空心點（白底+邊框）、可販日=終點強調點（較大）
- 進度線：已過區段用較深色、未來區段用 border-tertiary 淺色
- 日期格式：YYYY / MM / DD（完整年月日，空格分隔）
- 可販格下方加「距今 N 工作天」（D.workdaysBetween 算）

## 字體大小（均衡比例，weight 兩級：400/500）
- 里程碑日期：16px / weight 500
- 階段標籤（性試 DVT 等）：13px / weight 400
- 副字（距今 N 工作天）：12px / weight 400 / text-tertiary
（原則：日期與標籤落差控制在 3px 內，不要讓日期過度搶眼）

## 配色（全走 :root 變數，禁止寫死 hex）
- 里程碑點配色呼應「階段進度條」既有階段色：性試/量試/量產各取對應階段色變數，可販用主強調色變數
- 回家實作時用真實 :root 階段色變數套上，在真實畫面微調
- 未到的里程碑（空心點）用 border-secondary

## 位置
插在 proj-header（:2600）之後、buildProjKpiHtml（:2602）之前，當第四塊放最前，不動 header 內部結構。新函式 buildProjInfoBarHtml(proj)。

## 資料來源（乙案：全 WBS 衍生，零手填）
- 性試/量試/量產結束日：getProjectStages 對應階段的 latestEnd（階段名比對：含「性試」/「量試」/「量產」）
- 預計可販日：任務名含「可販」的任務完成日
- 另案開發：本次移除，未來可選擴充
- 與 M1 的關係：匯入後 getProjectStages 自然有資料、資訊條即時算，匯入器不需特別灌日期

## 實作（複用現成）
- 新函式 buildProjInfoBarHtml(proj)：時間軸版型自建 .proj-info-bar 新 class（款式 C 是進度線+里程碑點，非卡片排，不沿用 .stats-row）
- 階段日期：getProjectStages（:5007）回傳 stages[] 的 latestEnd；可販日：掃該專案任務名含「可販」取其有效完成日（getEffectiveSchedule）
- 日期格式化：D.fmt（:349），顯示 YYYY / MM / DD
- 距今工作天：D.workdaysBetween（:2740 用法）
- tooltip：data-tip + initTooltip（:6656）
- 顏色/字級全走 :root 變數（階段色變數、border-secondary/tertiary、text-tertiary），不寫死 hex

## 缺損容忍
- 某點日期算不出（無對應階段或階段內無日期任務）→ 該點顯示「—」空心點，不報錯
- 四點全空（簡易專案）→ 整條不顯示，或顯示「未設定階段日期」，不破版

## 驗收
- J 系列匯入後，資訊條顯示性試 2026-08-24 / 量試 2026-11-20 / 量產 2027-01-28 / 可販 2027-01-30（全由 WBS 衍生即時算，對照舊系統截圖）
- 簡易專案（無這些日期）資訊條優雅降級不破版
