# PM-Core 工作規則

純靜態單頁應用(no build step):`index.html` + `app.js` + `style.css`,資料存瀏覽器 localStorage,
報表/匯出皆在 client 端產生。三台機器各自 `clone`,以 Git + GitHub 同步。

## 發版 / 快取 SOP(必守)

`index.html` 以 `<script src="app.js?v=...">`、`<link href="style.css?v=...">` 帶版本號做 cache-busting。
瀏覽器對沒帶版本號的本地資源會死命快取——曾因此踩坑(改了 app.js 卻一直跑到舊版)。

**每次 push 改動 `app.js` 或 `style.css` 前,務必同步遞增 `index.html` 的 `?v=` 版本號:**

- 格式 `YYYYMMDD-N`(例:`20260530-1`)。
- 同一天多次發版,後綴 `-1`、`-2`… 遞增;跨天則重置日期、後綴回 `-1`。
- `app.js` 與 `style.css` 兩條版本號一起更新(同一個值即可)。

漏改版本號 = 使用者吃到舊快取看不到新功能。改 code 與改版本號是同一次 commit 的兩半,不可只改一半。

## Commit-Gate(必守)

任何 commit 前,先**單獨**跑 `git status` 給使用者看完整狀態,等使用者確認後才動 git:

- `add` → `commit` → `push` 三步**分開執行**,禁止用 `&&` 或 `;` 串接。
- `git add` 只列明確檔名,禁止 `git add -A` / `git add .`——避免把本機檔案掃進去。
- 禁止 `git push --force`。
- commit message 由使用者提供或經使用者確認後才用。

## 跨機 / 本機機密檔鐵則

三台機器各自 clone,以 Git + GitHub 同步:

- 開工前先 `git pull`,收工前把改動 commit + push,不留未同步的工作。
- `config.local.js`、`seed.local.js` 是各機本地檔(機密/種子資料),**不入版控、不讀取、不出現在任何 commit**。git status 看到它們時要警示,絕不 add。

## CSS 鐵則(防寫死)

- 顏色、z-index 等設計值**不寫死**在規則裡,一律進 `:root` 變數再引用(hex 只允許出現在 `:root` 定義處)。
- 新增顏色先檢查既有變數能否複用;不能才開新的語意變數(含 `-l` 淺底、`-ink` 深字等成對命名慣例)。
- 收斂既有寫死值時做**等值重構**,不順手改色。

## 改檔紀律

- 改檔一律用 Edit/Write 工具,**禁止用 PowerShell 文字回寫**(`Set-Content`/`Out-File` 等)——PowerShell 5.1 預設編碼會把中文寫成亂碼。
- 只改使用者指定的範圍,不順手動其他行。
