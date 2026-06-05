# PM-Core 核心層藍圖與重構路線

## 系統終局與執行順序（優先級，由現在到未來）
1. 【現在最需要】拆程式碼：按屬性/功能區分，拆不同檔分開管理維護。長期可運作系統的地基。
2. 【最終想要】資料分表：把單一全域 DATA 物件拆成多個獨立資料來源/表。排在程式碼拆檔穩定之後，不可提前。
3. 【明確最後】效能優化：建索引/快取、消除全表掃。目前用量不大，暫不需要，等真的有量再做。
原則：拆檔服務「開發效率與維護」，不等於執行加速；效能靠演算法（索引/快取），是獨立且最後的工作。三者不可揉在一起做。

## 核心計算層清單（[CORE]：純計算，只讀 DATA、回傳資料，禁止呼叫 render/Storage）
- computeSchedule (app.js:986)：排程引擎。回傳 {results, circular, hasCircular}。
- getProjectStages (app.js:5002)：階段彙總。回傳 stages[]。
- getEffectiveSchedule (app.js:1386)：顯示時程取值（override>actual>scheduled>planned）。回傳時程物件。
- getJOverride (app.js:1341)：取同步任務覆蓋值。只讀 DATA.tasks。回傳覆蓋物件或 null。
- isTaskBlocked (app.js:850)：前置阻擋判定。查找表由參數注入，最純。回傳 {blocked, reasons[]}。

## 現況診斷（2026-06-05）
- 五個函式全部無 render / Storage.save / localStorage 副作用 → 計算與渲染本來就分離，無交纏（當初按分層架構寫）。
- 唯一外部依賴：讀全域 DATA（只讀不寫）。屬核心層可接受的依賴，非需剝離的技術債。

## 拆檔路線（功能穩定後執行，現在只到 Level 1）
- Level 1【現在】：在 app.js 內以 [CORE] 註解標記上述函式，固化「不得加 render/Storage」紀律。零邏輯改動。
- Level 2【未來·拆檔前一刻】：把讀全域 DATA 改成參數注入，使函式成為零外部依賴純函式（需改所有呼叫端）。
- Level 3【未來·功能穩後】：把 [CORE] 函式物理搬到獨立檔（如 core/schedule.js），對應四層架構 core/ui/storage/auth。

## 未來效能優化候選（第 3 階段才碰，現在僅記錄）
- getProjectStages：全表 forEach + 每 task 呼叫 getEffectiveSchedule(內含 DATA.tasks.find) → O(n²) 隱患。
- getJOverride：DATA.tasks.find 線性查找 O(n)，高頻呼叫累積成本。
- 解法（未來）：建 id→task 的 Map 索引，把查找降到 O(1)；快取階段彙總結果。
