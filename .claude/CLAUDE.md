# PM-Core — Claude Code 開工須讀

每次 session 開始，動任何 code 前，**先讀以下兩份文件並遵守**：

1. `docs/AGENT_GATE.md` — 執行閘門（commit-gate、一次一件、貼原文等硬性規則，每步必守）
2. `docs/pm-core-architecture.md` — 系統架構主文件（雙視圖模型、排程引擎、任務表單、匯入器、待施工清單、工作鐵則）

這兩份是 PM-Core 的單一真實來源。定案內容不憑記憶改動；新需求若與架構文件衝突，先跟使用者確認、更新文件，再動 code。

開工標準流程：`git pull` → `git log` 確認與遠端同步 → 讀上述兩份 → 一次一件、逐處核 diff。
