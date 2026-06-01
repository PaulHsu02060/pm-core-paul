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
