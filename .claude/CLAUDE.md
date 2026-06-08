# PM-Core — Claude Code 開工須讀

## Session 啟動鐵則（每次開檔第一步）

開始任何工作前，先跑 `git remote -v` 確認 remote 指向 `PaulHsu02060/pm-core-paul`。
若 remote 不是 pm-core-paul（例如跑到 wbs-webapp 或其他專案），**立即停止**，
告訴使用者「目前不在 pm-core-paul repo，請確認 Claude Code 的開啟目錄」，不要在錯的專案動工。
確認在 pm-core-paul 後，`git log -3` 確認 HEAD 與 origin/main 一致，不一致先 pull。

每次 session 開始，動任何 code 前，**先讀以下兩份文件並遵守**：

1. `docs/AGENT_GATE.md` — 執行閘門（commit-gate、一次一件、貼原文等硬性規則，每步必守）
2. `docs/pm-core-architecture.md` — 系統架構主文件（雙視圖模型、排程引擎、任務表單、匯入器、待施工清單、工作鐵則）

這兩份是 PM-Core 的單一真實來源。定案內容不憑記憶改動；新需求若與架構文件衝突，先跟使用者確認、更新文件，再動 code。

開工標準流程：`git pull` → `git log` 確認與遠端同步 → 讀上述兩份 → 一次一件、逐處核 diff。

改動分級與關鍵字（每個任務動工前）：Claude 先給「改動清單」，逐處標明 ①位置（行號）②關鍵字（一個可辨識的詞，讓使用者按完自行核對按到哪處）③分級——機械式變更（加參數／包條件／字串搬移）註明「可直接按 1」；有判斷風險者（邏輯分支／文案語意／可能誤傷既有行為）註明「截 diff 審核」。使用者只在風險處停下核對，機械處對照關鍵字一路放行。
