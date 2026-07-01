# PM-Core Archive · D · 工作日曆

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

> ↪ 原 §之二.9 落地／施工歷史
**施工分段（每段獨立 commit）：**
1. ✅ 解析純函式 parseCalendarPaste(text) → {holidays, workOverrides, skipped, error?}（彈性表頭版，commit 61117e6→3d61155）
2. ✅ 解析測試：§5 測試 16 案（標準/亂序/無類型欄/英文表頭/無表頭報錯/補班），42 案全綠
3. ✅ 設定頁 UI（排程 tab 貼上→解析→預覽→確認→年份分組清單，commit 8a7d2dd）
4. ✅ 持久化（DATA.calendars 進 localStorage + 雲端 blob，download 防坑，commit b10c457）
5. ✅ 驗收（2026-06-14）：貼公司行事曆→公休進系統→重匯修正版 Excel→重算→74 筆零不一致、#54=2027-01-29、#120=2027-03-30（FF 全改 FS、序號連續、前置重映射）

**✅ 五步閉環完成（2026-06-14）。解析升級為彈性表頭（吃任何公司行事曆，不限欄序、需含表頭）。**
