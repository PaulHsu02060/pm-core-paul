# PM-Core

> Personal Task Board · 個人任務管理應用程式

![Built with HTML/CSS/JS](https://img.shields.io/badge/Stack-Pure_HTML%2FJS-brightgreen)
![Storage](https://img.shields.io/badge/Storage-localStorage-blue)
![License](https://img.shields.io/badge/License-Personal_Use-orange)
![Author](https://img.shields.io/badge/Author-Your_Name-blue)

---

## 👤 作者 (Author)

**Your Name** · GitHub: [your-account](https://github.com/your-account)

> 這是一個可公開的範本（template）。請把作者、公司、專案名稱等資訊改成你自己的；
> 真實機密（Sheet ID / OAuth Client ID / email / token / 實際專案資料）請放在
> `config.local.js` 與 `seed.local.js`（已被 `.gitignore` 排除，不會進版控）。

### 🤝 共同開發

**Anthropic Claude** — AI 協作完成程式碼撰寫與架構迭代。

### 📜 開發歷程

本專案為純前端單頁應用，歷經以下階段：

1. **需求設計** — 整合 WBS、個人任務、會議時程
2. **架構規劃** — 純前端 + GitHub Pages + Google Sheet 同步
3. **功能迭代** — 智慧排程、Excel 匯入、軟刪除、歷史紀錄、雙週打掃等
4. **發佈部署** — Google OAuth 登入 + 白名單機制

### ⚠️ 授權聲明

本程式為個人作品，歡迎個人學習研究使用。引用或衍生請保留作者標示。

---

## ✨ 功能特色

| 功能 | 說明 |
|------|------|
| 🌳 **多專案管理** | 任務分專案，色彩管理，左側欄一鍵切換 |
| ⚡ **智慧排程** | 依緊急度 × Deadline 自動排出本週工作，避開會議時段 |
| 📅 **甘特圖** | 跨專案 14 天時間視覺化，含進度條與里程碑 |
| 📋 **專案週報** | 自動彙整各專案進度，含 6 種統計、列印、Excel 匯出 |
| 🔗 **Google Sheets 同步** | WBS 自動同步（每天 2 次 + 同步後自動排程） |
| ☁️ **跨裝置雲端同步** | 透過 Google Apps Script 在多裝置間同步全部資料 |
| 📝 **便利貼** | 拖曳式便利貼，記些零碎想法 |
| 📅 **定期事件** | 會議 + 打掃，含每天/每週/隔週/隔週整週等多種頻率 |
| 🗑 **軟刪除** | 刪除任務保留 14 天，可還原 |
| 📊 **歷史紀錄** | 任務跨週執行歷程一目瞭然 |
| 🔐 **Google OAuth + 白名單** | 安全的編輯權限控制 |

---

## ⚙️ 設定 / 機密分離

本專案把所有個人化／機密值抽到 config 與 seed 檔，分「假值模板（進 git）」與「真值（不進 git）」：

| 檔案 | 進 git？ | 用途 |
|------|----------|------|
| `config.js` | ✅ | 設定的**假值模板**（Sheet ID、OAuth、email、品牌名等佔位值） |
| `config.local.js` | ❌（gitignored） | 你的**真實設定**，覆蓋 `config.js` |
| `seed.sample.js` | ✅ | 範例**假種子資料**（虛構專案 / 人名 / 會議） |
| `seed.local.js` | ❌（gitignored） | 你的**真實種子資料**，優先於 `seed.sample.js` |

`index.html` 載入順序（鐵則：假先載、真後載覆蓋）：
```
config.js → config.local.js → seed.sample.js → seed.local.js → app.js
```
`.local` 檔不存在時，瀏覽器只在 console 印 404（非致命），自動沿用假值。

首次使用：複製 `config.js` → `config.local.js`、`seed.sample.js` → `seed.local.js`，填入你的真實值。

---

## 🚀 部署步驟

### 1. 部署到 GitHub Pages

#### 第一次部署

```bash
# 1. 新建一個 GitHub repo（例如 pm-core）
# 2. 把這個資料夾的所有檔案推上去：

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<你的repo>.git
git push -u origin main
```

#### 啟用 GitHub Pages

1. 進入 repo 的 **Settings → Pages**
2. **Source** 選 `Deploy from a branch`
3. **Branch** 選 `main` / `/ (root)`
4. 按 **Save**
5. 等 1-2 分鐘，網址會是：
   ```
   https://<你的帳號>.github.io/<你的repo>/
   ```

> 注意：GitHub Pages 上只有進 git 的檔（不含 `config.local.js` / `seed.local.js`），
> 所以線上版以假值/假種子運作；真值只存在你本機。

#### 為每位使用者建立獨立空間

由於本程式使用 `localStorage`，**每個人各自的資料完全獨立**（即使同一網址）。
若要更明確分開，可以建立 branch：

```bash
git checkout -b user-a
git push origin user-a
# 然後在 Pages 設定中切到對應的 branch
```

每個 branch 的資料完全隔離（透過 `pmw::${PATH_KEY}::xxx` 命名空間）。

---

### 2. 部署 Google Apps Script（WBS 同步）

> 💡 此步驟為**選擇性**，如果不需要從 Google Sheet 同步 WBS 任務，可以跳過。

#### Step 1: 打開 WBS Google Sheet
- 確認 sheet 中有對應的工作表（分頁名在 `config.local.js` 的 `WBS_SHEET_NAME` 設定）
- 欄位順序：`N | PLM階段 | 子群組 | 任務名稱 | 任務類型 | 前置任務 | 工期 | 負責人 | 預計開始日 | 預計結束日 | 實際開始日 | 實際完成日 | 進度% | 狀態`

#### Step 2: 開啟 Apps Script 編輯器

點選 **Extensions（擴充功能）→ Apps Script**

#### Step 3: 貼上程式碼

1. 把 `apps-script.gs`（以及 config 內容）**全部複製**到編輯器
2. 按 💾 儲存（Ctrl/Cmd + S）

#### Step 4: 測試

1. 上方選單選 `testGet` 函式
2. 按 ▶ 執行
3. 第一次會要求授權 → 點 **「Review Permissions」**
4. 用你的 Google 帳號登入並授權
5. 看 **Logs（檢視 → 紀錄）**，應該會看到 JSON 結果

#### Step 5: 部署為網頁應用程式

1. 右上角 **Deploy → New deployment**
2. **Type**：選擇 **Web app**
3. 設定：
   - **Description**：`PM-Core API v1`
   - **Execute as**：`Me (你自己)`
   - **Who has access**：`Anyone`（重要！這樣 API 才能讀）
4. 按 **Deploy**
5. 複製 **Web app URL**，例如：
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

#### Step 6: 設定到 App

1. 打開部署好的 App
2. 進入 **設定** 頁
3. 在 **「Apps Script URL」** 貼上剛剛複製的 URL
4. 啟用自動同步、設定同步時間（預設 09:00 + 14:00）
5. 按 **「儲存設定並立即同步」** 測試

✅ 同步成功後會看到 sidebar 出現「已同步」徽章

---

## 📖 使用指南

### 首次使用

1. 開啟網址，會跳出登入畫面
2. 用 Google 帳號登入，或設定編輯密碼（首次設定）
3. 之後拿到 URL 的人需要授權/密碼才能修改

### 新增任務

- **方式 1**：在專案頁底部「快速新增任務」輸入
- **方式 2**：點任務名稱可彈出完整編輯視窗

### 智慧排程

1. 在任一專案頁
2. 右側面板填入本週會議（截圖 / 貼上 / 手動）
3. 按 **「⚡ 產生本週智慧排程」**
4. 回總儀表板查看時程表

### 截圖辨識會議

1. 在專案頁右側「會議時程」
2. 點 「📷 截圖」上傳行事曆截圖（可一次多張）
3. 標註每張是「本週/上週/下週」
4. 按「🪄 一次解析全部」
5. 第一次會載入中文語言檔（約 1 分鐘），之後會 cache
6. 辨識完成後勾選想加入的會議，按「加入勾選」

### 專案週報

1. 點 sidebar「📋 專案週報」
2. 選擇要看的週次（±4 週可選）
3. 系統自動彙整各專案進度
4. 編輯「額外備註」（自動儲存）
5. 按「⬇ 匯出 Excel」下載完整週報

---

## 🔧 技術架構

| 項目 | 用途 |
|------|------|
| Pure HTML/CSS/JS | 無框架，直接部署 |
| `localStorage` | 本地資料儲存，branch-aware |
| [Tesseract.js v5](https://tesseract.projectnaptha.com/) | 純前端 OCR（含繁體中文） |
| [SheetJS](https://sheetjs.com/) | Excel 匯出 |
| Google Apps Script | Sheet API 中介層 |

---

## 📂 檔案結構

```
pm-core/
├── index.html              # 主入口
├── style.css               # 樣式（Soft Sage 配色）
├── app.js                  # 主程式
├── config.js               # 設定假值模板（進 git）
├── config.local.js         # 你的真實設定（不進 git）
├── seed.sample.js          # 範例假種子（進 git）
├── seed.local.js           # 你的真實種子（不進 git）
├── apps-script.gs          # Google Apps Script（WBS 唯讀 API）
├── apps-script-cloud-sync.gs  # Google Apps Script（跨裝置同步 API）
├── README.md               # 本說明文件
└── .nojekyll               # 禁用 Jekyll（GitHub Pages 必要）
```

---

## 🐛 常見問題

### Q: 重新整理頁面後資料還在嗎？
A: 是的，資料都存在瀏覽器的 localStorage 裡。除非清除瀏覽器資料才會消失。建議定期到「設定 → 資料管理」下載 JSON 備份。

### Q: 換電腦後資料會跟著嗎？
A: 不會，因為 localStorage 只在當前裝置/瀏覽器。請用「下載 JSON 備份」匯出，到新裝置「上傳還原」，或啟用跨裝置雲端同步。

### Q: 同事看到的會是我的資料嗎？
A: **不會**。每個瀏覽器的 localStorage 都是獨立的，即使同樣 URL，你看你的，他看他的。

### Q: Tesseract.js 辨識結果不準？
A: OCR 對清晰大字較準。若辨識率低於 80%，建議改用「📋 貼上」貼純文字。

### Q: Apps Script 同步失敗？
A: 檢查：
1. Web App URL 是否正確
2. 部署時「Who has access」是否設成 **Anyone**
3. Sheet 分頁名是否與 `config.local.js` 的 `WBS_SHEET_NAME` 一致
4. 開 F12 開發者工具看錯誤訊息

### Q: 可以改別的配色嗎？
A: 修改 `style.css` 開頭 `:root` 區塊的色票即可。

---

## 📄 授權

個人使用。如需商業使用請聯繫作者。
