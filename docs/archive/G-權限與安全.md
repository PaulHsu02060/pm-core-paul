# PM-Core Archive · G · 權限／安全

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

### 8f.8 施工順序（2026-06-19 大轉向定案）

開發順序定為「前端全做好 → 本地測四層 → 最後接後端」，取代原「後端先、前端後」。理由：先把前端設定介面（含白名單管理頁）做到位，後端接上時直接吃前端已設定好的資料結構，不必後端先寫死再手動填 Script Properties、改壞重跑。

**塊一：清場（純前端，先做）**
- 拔除設定頁「編輯密碼」+「忘記密碼」兩功能（已無用，memory 廢密碼殘骸）。純移除不碰後端。

**塊二：前端四層 UI 全做（localStorage 暫存 + 本地 role 切換器測）**
- Landing page 兩路（Gmail + 首登密鑰 → Admin／viewonly 按鈕），廢 index.html:32 舊 OAuth fallback。
- 白名單管理頁（Admin 設定頁管 editor／viewonly 名單，暫存 localStorage，後端接上再換來源）。
- 四層分流（改 §2144 分支，拆 admin／editor／viewonly／none）。
- enterBlockout 擋頁（none 全屏擋光）。
- isAdmin() 擴認 superadmin + badge SUPER ADMIN 多態 + isForeign 彈窗（§8f.3b）。
- 本地 role 切換器（開發測試用，能切著看四層畫面，不依賴後端；後端接上後移除或隱藏）。
- 此塊名單與身份暫存 localStorage，UI 全做完四層都能本地切看，後端接上時資料結構直接搬。

**塊三：接後端（最後，獨立 session，最高風險「改錯鎖死自己」）**
- .gs 加 SUPERADMIN_EMAIL（開發者 email）+ 首登密鑰（存後端）+ ?action=role 端點（回 role + isForeign）+ editor／viewonly 名單存 Script Properties。
- 前端名單來源從 localStorage 換成後端 fetch。
- 安全策略：用「新部署」開測試 URL（不動正式部署），前端用測試 URL 驗四層 role 全對，再切正式。
- 改 .gs 前備份可運作版本，照「管理部署一律失敗→直接新部署」教訓（§10）。

### 8f.8b 權限層隔離紀律（塊二施工地基，2026-06-19 定案）

權限/安全是獨立一層，與核心（排程引擎/資料/UI）保持單向、窄介面，未來抽成獨立檔是機械搬移而非解耦。立此紀律防重蹈耦合覆轍（前兩版合不起來、半套 id 化害 J 系列全壞的同類教訓）。

三條鐵則：

1. **權限只回答、不動手**：權限函式只回傳布林或 role 字串（如「這人能不能編輯」「他是什麼角色」），不直接碰 task／project 資料、不 render DOM、不呼叫排程引擎。判斷與執行分離。

2. **核心只透過窄門問**：核心要權限時，只能透過固定入口問——isAdmin()／_roGuard()／Auth.getRole() 等少數窄介面，不准伸手讀權限層的內部變數（如直接讀 _role 做業務分支）。禁止在排程引擎/資料層寫死 if role==='admin' 之類深度耦合。

3. **命名聚集（Auth 命名空間）**：塊二起，所有新增的權限相關函式掛進 Auth.* 命名空間（Auth.getRole／Auth.checkWhitelist／Auth.enterBlockout／Auth.bindAdmin 等）。舊散名（isAdmin/_roGuard/enterViewOnly/refreshUserBadge）暫不動、之後順手收進 Auth。物理上散在 app.js 無妨，命名一致即可，未來整個 Auth 物件搬出成獨立檔是剪下貼上、不拆線。

此紀律與 §第一部分「四層架構」對 core 層的要求同源：core 只算不碰 DOM/Storage、權限只判斷不碰資料/DOM，兩層皆「純功能、單向被呼叫」，未來拆檔皆機械搬移。塊二每個新功能依此長。

### 8f.8c 塊二完整藍圖（2026-06-19 定案，分兩批做）

塊二＝前端四層 UI 全做（localStorage 暫存、本地 role 切換器測，不依賴後端）。六項依 8f.8b 隔離紀律：新增全掛 Auth.* 命名空間、localStorage key 統一 auth_* 前綴、權限只判斷不碰核心資料。

**批一：四層骨架（①②③，做完用切換器本地測四層畫面）**

① Auth 本地 role 切換器（地基，先做）：Auth._devRole（localStorage auth_dev_role）暫存測試身份；Auth.setDevRole(role) 切 superadmin/admin/editor/viewonly/none（寫 localStorage + 設 _role + body class + refreshAll）；UI 浮動小面板（角落、開發用）。受 Auth.DEV_MODE flag 控制，後端接上後 flag 關閉、保留當 debug 工具。純前端開發工具，不碰後端。

② Auth 四層分流 + enterBlockout：改 §2144 那道，admin/editor→編輯、viewonly→enterViewOnly、none→Auth.enterBlockout()。Auth.enterBlockout() 全屏擋頁覆蓋，顯示「您沒有檢視權限，請聯絡管理員」，不留 PII、不顯示任何專案內容。擋頁只 render 自己（符合隔離紀律：權限可 render 自己的擋頁，不碰 task/project 資料）。

③ badge superadmin 多態：refreshUserBadge 統一邏輯加 superadmin→「SUPER ADMIN」；isAdmin() 擴認 _role==='admin'||_role==='superadmin'；isForeign 彈窗（§8f.3b）先留介面，本地切換器可手動觸發測。

**批二：名單 + 登入（④⑤，做完測名單管理 + 兩路登入）**

④ Auth 白名單管理頁（改來源）：editor/viewonly 兩名單 localStorage 暫存（auth_editor_list / auth_viewonly_list）；設定頁「編輯權限」tab 改雙名單管理 UI（加/刪 email），僅 Admin 可見；Auth.checkWhitelist(email) 回 editor/viewonly/none（純判斷，後端接上換 fetch）；現有 allowedEmails（CFG 來源）改讀 localStorage。

⑤ Landing page 兩路（最後，牽動最多）：改 loginOverlay 為①「登入並成為管理員」（Gmail + 首登密鑰輸入）②「以檢視模式進入」；廢 index.html:32 舊 OAuth fallback 後門；首登密鑰本地先用假值（後端接上換真）；舊 loginPwMode 密碼登入此時一起拔（B 組退場，新登入上線才拔、不留空窗）。

**分批理由**：①②③是「能獨立驗證的完整骨架」（四層畫面切得出來即對），④⑤是「另一個完整功能」（名單+登入）。兩個各自完整子塊，非把單一功能拆碎（符合開發節奏鐵則）。

### 14.5 分階段執行（每階段獨立 commit、線上實測、可回滾）

**階段 1（後端，獨立 session、最高風險）— doPost 改 JWT**
- doPost 寫入路：CHECK_TOKEN → JWT+role。
- 建新部署（保留舊部署當回滾退路），測試 URL 驗：editor/admin 帶 id_token 能寫、viewonly/none 擋。驗過才往下，不切正式、不動前端。
- 回滾：前端仍用舊部署（token 制）照常。
- ✅ 已驗（2026-06-22）：後端無憑證寫入擋、superadmin 帶憑證寫入 ok。

**階段 2（前端）— upload 改帶 id_token**
- upload：token → id_token；加未登入守衛。前端指向階段1新部署，線上實測：登入能寫、未登入不狂打。
- ✅ 已驗（2026-06-22）：真登入 auto-upload 成功、無憑證靜默跳過。

**階段 3（後端+前端）— doGet 綁登入**
- doGet 資料路：公開 → JWT+role。download 帶 id_token + 未登入守衛。
- 線上實測：白名單內登入能看、外人/未登入看不到。
- ⚠ 相容：此後「同事看資料也要登入+白名單」（定案接受）。
- ✅ 已驗（2026-06-22）：無憑證讀擋（Missing id_token）、superadmin 帶憑證讀 ok、登入後自動拉雲端。

**階段 4 — URL 收斂進 config.js**
- cloudSyncUrl + ROLE_CHECK_URL 合一，URL 進 config.js（公開、不含機密，token 已廢）。
- 驗：新裝置不設定、登入即讀寫。
- ✅ 已驗（2026-06-22）：URL 收斂 BACKEND_URL、設定頁/F12 讀寫走單一部署正常。

**階段 5 — 廢 token 殘骸**
- 清 14.4 token 全清單（前端 + 後端 ENABLE_TOKEN/CHECK_TOKEN）；config.local.js 清 SYNC_TOKEN。
- 驗：全套無 token、讀寫正常。
- ✅ 已驗（2026-06-22）：token UI/死碼清除、設定頁無 token 欄、讀寫照常、cloudTestConnection 改 id_token。

**階段 6 — 跨裝置/多角色實測**
- SuperAdmin/Editor/Viewonly/外人 各帳號實測讀寫權限正確。
- 公司+家裡+github.io，無需設 token、登入即用。
- ✅ 已驗（2026-06-22）：superadmin 讀寫/admin 名單管理、editor/viewonly、外人擋，跨裝置線上驗通。
