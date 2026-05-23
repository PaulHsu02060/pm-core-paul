# PM-Workspace

> Personal Task Board · 個人任務管理應用程式

![Built with HTML/CSS/JS](https://img.shields.io/badge/Stack-Pure_HTML%2FJS-brightgreen)
![Storage](https://img.shields.io/badge/Storage-localStorage-blue)
![License](https://img.shields.io/badge/License-Personal_Use-orange)

純前端網頁應用，沒有後端，沒有資料庫，部署到 GitHub Pages 即可使用。

## ✨ 功能特色

| 功能 | 說明 |
|------|------|
| 🌳 **多專案管理** | 任務分專案，色彩管理，左側欄一鍵切換 |
| ⚡ **智慧排程** | 依緊急度 × Deadline 自動排出本週工作，避開會議時段 |
| 📅 **甘特圖** | 跨專案 14 天時間視覺化，含進度條與里程碑 |
| 📋 **專案週報** | 自動彙整各專案進度，含 6 種統計、列印、Excel 匯出 |
| 🔗 **Google Sheets 同步** | J 系列 WBS 自動同步（每天 2 次 + 同步後自動排程） |
| 📷 **截圖辨識會議** | 用 Tesseract.js 純前端 OCR，免費辨識行事曆截圖 |
| 📝 **便利貼** | 拖曳式便利貼，記些零碎想法 |
| 🔒 **編輯密碼** | 防君子不防小人，避免誤改 |

---

## 🚀 部署步驟

### 1. 部署到 GitHub Pages

#### 第一次部署

```bash
# 1. 新建一個 GitHub repo（例如 pm-workspace）
# 2. 把這個資料夾的所有檔案推上去：

git init
git add .
git commit -m "Initial PM-Workspace"
git branch -M main
git remote add origin https://github.com/<你的帳號>/pm-workspace.git
git push -u origin main
```

#### 啟用 GitHub Pages

1. 進入 repo 的 **Settings → Pages**
2. **Source** 選 `Deploy from a branch`
3. **Branch** 選 `main` / `/ (root)`
4. 按 **Save**
5. 等 1-2 分鐘，網址會是：
   ```
   https://<你的帳號>.github.io/pm-workspace/
   ```

#### 為每位同事建立獨立空間

由於 PM-Workspace 使用 `localStorage`，**每個人各自的資料完全獨立**（即使同一網址）。
若要更明確分開，可以建立 branch：

```bash
git checkout -b colleague-john
git push origin colleague-john
# 然後在 Pages 設定中切到對應的 branch
```

每個 branch 的資料完全隔離（透過 `pmw::${PATH_KEY}::xxx` 命名空間）。

---

### 2. 部署 Google Apps Script（J 系列同步）

> 💡 此步驟為**選擇性**，如果不需要從 Google Sheet 同步 J 系列任務，可以跳過。

#### Step 1: 打開 J 系列 WBS Google Sheet
- 確認 sheet 中有名為 **「J系列整合WBS」** 的工作表
- 欄位順序：`N | PLM階段 | 子群組 | 任務名稱 | 任務類型 | 前置任務 | 工期 | 負責人 | 預計開始日 | 預計結束日 | 實際開始日 | 實際完成日 | 進度% | 狀態`

#### Step 2: 開啟 Apps Script 編輯器

點選 **Extensions（擴充功能）→ Apps Script**

#### Step 3: 貼上程式碼

1. 把 `apps-script.gs` 的內容**全部複製**到編輯器（取代預設的 `myFunction`）
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
   - **Description**：`PM-Workspace API v1`
   - **Execute as**：`Me (你自己)`
   - **Who has access**：`Anyone`（重要！這樣 API 才能讀）
4. 按 **Deploy**
5. 複製 **Web app URL**，例如：
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

#### Step 6: 設定到 PM-Workspace

1. 打開部署好的 PM-Workspace
2. 進入 **設定** 頁
3. 在 **「Apps Script URL」** 貼上剛剛複製的 URL
4. 啟用自動同步、設定同步時間（預設 09:00 + 14:00）
5. 按 **「儲存設定並立即同步」** 測試

✅ 同步成功後會看到 sidebar 出現「J系列 已同步」徽章

---

## 📖 使用指南

### 首次使用

1. 開啟網址，會跳出登入畫面
2. 輸入想要的編輯密碼（首次設定）→ 按「登入並編輯」
3. 之後拿到 URL 的人需要這個密碼才能修改

### 新增任務

- **方式 1**：在專案頁底部「快速新增任務」輸入
- **方式 2**：點任務名稱可彈出完整編輯視窗

### 智慧排程

1. 在「J系列 WBS」或其他專案頁
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
pm-workspace/
├── index.html         # 主入口
├── style.css          # 樣式（Soft Sage 配色）
├── app.js             # 主程式
├── apps-script.gs     # Google Apps Script 程式碼
├── README.md          # 本說明文件
└── .nojekyll          # 禁用 Jekyll（GitHub Pages 必要）
```

---

## 🐛 常見問題

### Q: 重新整理頁面後資料還在嗎？
A: 是的，資料都存在瀏覽器的 localStorage 裡。除非清除瀏覽器資料才會消失。建議定期到「設定 → 資料管理」下載 JSON 備份。

### Q: 換電腦後資料會跟著嗎？
A: 不會，因為 localStorage 只在當前裝置/瀏覽器。請用「下載 JSON 備份」匯出，到新裝置「上傳還原」。

### Q: 同事看到的會是我的資料嗎？
A: **不會**。每個瀏覽器的 localStorage 都是獨立的，即使同樣 URL，你看你的，他看他的。

### Q: Tesseract.js 辨識結果不準？
A: OCR 對清晰大字較準。若辨識率低於 80%，建議改用「📋 貼上」貼純文字。

### Q: Apps Script 同步失敗？
A: 檢查：
1. Web App URL 是否正確
2. 部署時「Who has access」是否設成 **Anyone**
3. Sheet 是否名為「J系列整合WBS」
4. 開 F12 開發者工具看錯誤訊息

### Q: 可以改別的配色嗎？
A: 修改 `style.css` 開頭 `:root` 區塊的色票即可。

---

## 📄 授權

個人使用。如需商業使用請聯繫作者。
