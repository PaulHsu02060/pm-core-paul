# PM-Core 開發交接文件（B-2：專案頁接分段鈕）

> 用途：新對話開場貼這份或請 Code 讀此檔。前序 B-4（sidebar 三段重組 + 報告頁分段鈕）已完成並 push。下一步 B-2。
> 產出基準：HEAD = `3e22b03`，本地與遠端一致，working tree clean。

---

## 一、角色與環境（每 session 必讀）

我是勝堯（Paul Hsu, GitHub: PaulHsu02060），冰點 BingDian Air Tech PM，PM-Core 第三代個人專案管理工具獨立開發者。

**分工**：Claude Code 負責 terminal 執行；Claude 負責邏輯審查 / diff 核准 / 架構規劃。全程繁體中文。

**系統**：純前端 no-build（index.html + app.js + style.css + localStorage + Apps Script 雲端同步），GitHub Pages（PaulHsu02060/pm-core-paul）。

**機器（本階段跨機特殊狀況）**：
- 公司桌機：C:\Users\1141103004\Desktop\pm-core-paul，無 Node.js。
- 筆電：也無 Node.js（開工時確認路徑）。
- 家裡桌機：C:\Users\user\Desktop\pm-core-paul，Node v24.16.0（唯一能跑 node --check + 測試套件）。

**本階段工作流（兩台白天都無 Node）**：
白天在公司/筆電寫 code + commit + push（碰 app.js 一律標 [unverified] WIP）→ 晚上回家裡桌機 git pull → node --check app.js + node docs/test-schedule-cases.js（56 案）→ 線上驗證 → 過了才算數，必要時補驗證 commit。

> Code cwd 預設可能不是 pm-core-paul，且每跑完一次指令 cwd 會被重設。對策：shell 指令每條前綴 cd <專案路徑>;，Read/Edit 一律絕對路徑。
> 互動驗證走本機 file://（seed.local.js 測試資料，Ctrl+Shift+R）或線上 github.io；VIEW ONLY 下 data-edit 鈕禁用、tab-btn 可點。

---

## 二、最高原則
「邏輯乾淨、單一真實來源、不重複」。抽共用 vs 複製兩份 → 選共用。核心函式只做計算，不碰 DOM、不直接存 Storage。

---

## 三、對話準則
- 少貼 code 原文解釋，白話講重點。CSS 改動先給 mockup 核准再動工。
- 不自言自語/長篇推測；要看檔案直接給 Code 撈的指令。
- 給 Code 的指令整段用文字框輸出，不給片段。
- 一次一件，逐處核 diff → 放行 → 下一處。純字串搬移可一路按；邏輯改動與 CSS 要截給我核。
- Code session 會滿，到段落提醒重開。

---

## 四、工作鐵則（違反即停）

**commit-gate（三步分開）**：① 單獨 git status 確認無機密檔（seed.local.js/config.local.js/seed.sample.js/_probe*.js）② git add 明確列檔 → 再 status ③ commit（兩段 -m，避 > /）→ push。

**測試**：每次 JS 改動跑 node --check app.js；commit 前跑 node docs/test-schedule-cases.js（56 案須全過）。
**⚠ 本階段特例**：兩台白天無 Node，B-2 碰 app.js 卻無法在 commit 前驗證 → 白天 commit 一律標 [unverified] WIP，晚上回家驗。不可在無 Node 環境硬把 B-2 commit 當已驗。

**版本號**：?v= 只升動到的檔對應行（B-2 動 app.js → 升 app.js 那行）。
**跨機**：session 開始先 git remote -v + git log -3 + git status 確認與遠端一致。
**CSS**：顏色/圓角/z-index/陰影走 :root 變數。
**改檔**：含中文用 Edit 工具，禁 PowerShell 文字回寫。
**Claude Code**：確認框永遠按 1。

---

## 五、目前進度（HEAD = 3e22b03，已 push）
- aa7a0d8 [unverified] B-1 雙視圖頁內切換（修法二）——總儀表板頁頂分段鈕（儀表板｜甘特｜月曆），三視圖同頁互切
- 724d6bd B-4 sidebar 三段重組 + 報告頁分段鈕——sidebar 三段（總儀表板/專案/其他）；報告頁頂分段鈕（專案週報｜PDCA）
- 3e22b03 docs §10 待施工清單依新優先序重排（docs + .claude 雙份同步）← 當前 HEAD

**待線上驗（不急）**：B-1 + B-4 都還沒上 github.io 線上驗，找時間一起看——①三視圖互切 ②sidebar 三段 ③報告｜PDCA 分段鈕（含 PDCA 空專案路徑）。

---

## 六、開發優先序（§10 已重排）
1. 第一優先 B 系列收尾（地基）：B-2 專案頁接分段鈕、B-3 renderMonth 月曆解耦
2. 第二優先 核心：專案 Task By Stage 三視圖（看板/Gantt/清單，參考舊版 WBS），先出設計文件，依賴 B-2
3. 第三優先 UI 微調（純 CSS）：分段鈕放大配色、週報對齊
4. 第四優先 整理：設定頁 v2

> 純 CSS 項（第 3 群）無 Node 也能做，可當白天安全活穿插；但 B-2/B-3 是地基，優先推進。

---

## 七、B-2 任務：專案頁接分段鈕（範圍＝單專案）

**目標**：專案頁（page-project）頂部放分段鈕「Dashboard ｜ Gantt ｜ 月曆」，比照 B-1 總儀表板頁內切換，但範圍是單專案（只顯示 task.project === currentProjectId 的 task）。

**架構定案（§N.3/N.4，動工前對齊）**：
- 專案頁分段鈕：Dashboard ｜ Gantt ｜ 月曆（單專案範圍）。
- Gantt/月曆共用同一套 render 元件：總儀表板用全專案範圍、專案頁用單專案範圍，差別只在傳入 task 子集。禁止複製兩份。
- B-1 已把 renderGantt/renderMonth 參數化吃 targetId；B-2 再讓它們吃「範圍」（renderGantt 已有 ganttProjectFilter 機制）。

**B-1 已建好、B-2 沿用（基準行號，可能微移）**：
- currentView(~1635)、switchView(~1867)、buildViewTabsHtml()(~1937)
- renderGantt(targetId)(~4095，已參數化)、renderMonth(targetId)(~4344，已參數化)
- showPage(~1835，含 titles 物件)

**B-2 預估步驟（動工前逐項撈現況，一次一件核 diff）**：
1. 撈現況：grep 專案頁怎麼 render（renderProject/page-project 寫入點）、currentProjectId 狀態在哪、ganttProjectFilter 現在怎麼設。先 survey 再動。
2. 設計分段鈕：專案頁需要自己的 view 狀態（projectView）還是沿用 currentView？切換時 Gantt/月曆傳「單專案範圍」+ targetId。與 Claude 討論定案再動 app.js。
3. renderGantt 接單專案範圍：傳 Set([currentProjectId]) 當 filter + targetId。
4. renderMonth 接單專案範圍：可能需 B-3（月曆解耦）先做或一起帶。撈完現況再判斷拆不拆。
5. 本機驗證（家裡桌機）：node --check + 測試 56/56 + Ctrl+Shift+R 看分段鈕能切、範圍正確。
6. commit-gate。

> ⚠ 動工前提醒：renderMonth 是否已能吃單專案範圍未確認（B-3 才解耦）。若 B-2 卡在月曆範圍，先把 Dashboard/Gantt 兩顆接好、月曆頁簽留白（§N.5：頁簽要在、頁面可空），月曆範圍歸 B-3。先撈 renderMonth 現況再決定 B-2 範圍。

---

## 八、B-2 之後排隊（§10）
- B-3 renderMonth 月曆解耦（單專案 task/meeting 篩選）
- 核心：專案 Task By Stage 三視圖（參考舊版 WBS，需先出設計文件）
- UI 微調（純 CSS，無 Node 可做）：分段鈕放大配色、週報對齊
- 設定頁 v2

---

## 九、架構文件
docs/pm-core-architecture.md 與 .claude/pm-core-architecture.md 雙份同步（已逐 byte 確認一致）。導航架構第九部分、待施工清單第十部分。.claude/CLAUDE.md（Code 入口）、docs/AGENT_GATE.md（硬性 checklist）。

---

## 十、開場自檢（新 session 先做）
1. cd <本機 pm-core-paul 路徑>; git remote -v; git log -3 --oneline; git status
2. 確認 HEAD = 3e22b03（或更新）、remote 指向 pm-core-paul、working tree clean、cwd 正確
3. 確認本機有無 Node（node --version）→ 決定今天能否做 commit 前驗證
4. 乾淨後，撈 B-2 §七步驟 1 的專案頁 render 現況，開始 B-2
