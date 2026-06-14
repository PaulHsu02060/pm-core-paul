# 任務表單版型設計 — M2 定案版

> 本文件為 M2 任務表單改造的**單一真實來源**。施工前每段必讀,定案後不憑記憶改動。
> 最後更新:2026-06-06(家裡桌機,基準 HEAD `cc0533d`)

---

## 0. 背景與原則

- 表單由共用 builder `App.buildTaskFormHtml(task, mode)`(app.js:3217)產生,新增(`'new'`)/編輯(`'edit'`)共用同一份。**單一真實來源,禁止複製兩份。**
- 儲存函式維持兩個(`saveNewTask` / `saveTask`),不合併;只在「跨模式可能讀到不存在欄位」處加 null 防呆(仿 `tf-pdcaGroup` 的 `if(pgEl)`)。
- locked 版(synced 唯讀檢視)**不套本設計**,維持原樣。
- 驗證訊息 house style:`U.toast('⚠️請填XXX', 'warning')` + 直接 `return`。

---

## 1. 欄位與排序(新增任務)

| 順序 | 欄位 | 必填 | 元件 | 備註 |
|---|---|---|---|---|
| 1 | 專案 | ✅ | select | 原「所屬專案」改名「專案」,移到最上 |
| 2 | 任務名稱 | ✅ | text | |
| 3 | 說明 | — | textarea | 選填 |
| 4a | 擔當 | ✅ | text | |
| 4b | 類型 | ✅ | select | 帶 ? 說明三選一(任務/里程碑/群組) |
| 5a | 階段 | ✅ | text + datalist | 原「PLM階段」改名「階段」 |
| 5b | 子群組 | — | text + datalist | 選填 |
| 6a | 緊急程度 | — | select | 自動算可覆蓋,帶 ? |
| 6b | 狀態 | — | select(反灰唯讀) | 衍生,帶 ? 說明規則 |
| 7 | 前置任務 | — | 結構化(見 §3) | lag 預設隱藏可點開 |
| 8a | 預計開始 | ✅ | date | |
| 8b | 工期 | — | number | 與 8a 填完自動算 8c |
| 8c | 預計完成 | — | date | 自動算(可被覆蓋),非必填 |
| 9 | Deadline | — | date | 新增欄位;空則取預計完成;可從 Excel 匯入 |
| 10 | 需拉高層 HL | — | checkbox + textarea | 見 §4 |
| 11 | 實際執行區 | — | 反向摺疊(見 §5) | 新增收起 / 編輯展開 |

**移除欄位:** 分類(category)、處理方式(method)。

**欄位大小:** 所有 input/select 高度統一 38px(前置任務列內 36px),並排欄位等寬對齊,不忽大忽小。

**必填驗證(6 個):** 專案、任務名稱、擔當、類型、階段、預計開始。
- 現況:系統目前只擋任務名稱(`saveNewTask:3334`)。其餘 5 個為**本次新增**驗證,照 `U.toast + return` 模式逐一加。

---

## 2. 類型(taskType)說明

三選一,帶 ? hover 註解:

- **任務** — 有工期、要排程的實際工作項目
- **里程碑** — 時間點標記(工期 0),如審查、交付節點
- **群組** — 純分類用的母項,不參與排程計算

里程碑/群組的 `category` 給空(一欄一語意)。

---

## 3. 前置任務(結構化輸入,取代自由文字語法) ✅ 已做(2026-06-15,commit1:實作為 select 下拉,非模糊搜尋輸入)

**問題:** 現況要使用者打 `1FF,2FS+2` 這種語法,沒人會填。

**設計:** 結構化「一列一條前置」:
- 預設兩格:**搜尋任務(下拉/模糊搜尋)** + **關係(下拉,白話)**
- **延遲(lag)預設隱藏**,點「+ 延遲」連結才展開第三格
- 按「+」加入,加好的前置顯示成一列(可刪)
- 可加多條

**關係下拉(白話 + 代碼):**
- 完成才能開始 (FS)
- 同時開始 (SS)
- 同時完成 (FF)
- 開始才能完成 (SF)

**? hover 註解 + 下方範例(列具體值):**
- `16FS` → 等 #16 完成,本項才開始(最常用)
- `16FS+2` → #16 完成後,再隔 2 個工作天才開始
- `16SS` → 與 #16 同一天開始
- `16FF` → 與 #16 同一天完成
- `16SF` → #16 開始後,本項才能完成(少用)

**候選清單限制(已放寬,2026-06-15 S5):** 前置候選列 `measureType !== 'hours'` 的任務(工期制＝WBS＋手動專案任務都可當前置,不再限有 WBS 編號;S5c 已放寬 topoSort 入列條件)。階段窗過濾:前 1-2 階段＋同階段之前。

**驗證:** 改結構化後使用者用選的,不再打自由文字,故**不需** `parsePredecessors` 格式檢查。

---

## 4. 需拉高層 HL + 風險議題

- 單一布林勾選框「需拉高層(HL)」,帶 ? 說明「勾選表示此風險需升級到高層關注」
- 勾選 → 展開文字欄填風險內容(`riskIssue`)
- 沒勾 → 文字欄收起
- 資料:布林 `riskHL` + 文字 `riskIssue`

---

## 5. 實際執行區(反向摺疊)

- **新增模式:預設收起**(多數是規劃未來任務,還沒發生;臨時做完想記再展開)
- **編輯模式:預設展開**(單子已開立、回填實際進度是常態)
- 內含:
  - 實際開始(`actualStart`)
  - 實際完成(`actualEnd`)
  - **交付物回填**:文字(`deliverable`)+ 連結(`deliverableLink`,貼 Google Drive 等雲端連結)
- 交付物語意:**執行後回填**(該工作交付了什麼)。原生檔案上傳本次不做(架構無檔案後端;未來獨立規劃接雲端 storage)。

---

## 6. 預計完成日自動計算

- 公式:`預計完成 = addWorkdays(預計開始, 工期 - 1)`
- `addWorkdays` = 既有引擎,跳國定假日 + 公司行事曆
- 預計開始 + 工期填完 → 自動帶出預計完成
- 自動算的值可被手動覆蓋

---

## 7. Deadline 與逾期口徑

- **Deadline = 新增欄位**,手填截止日
- **fallback:** 取用時 `deadline || plannedEnd`(沒填 deadline 就退回預計完成)
- **逾期判定改口徑:** `(deadline || plannedEnd) < today 且 status !== 'done'`(擱置 hold 排除)
  - 現況逾期讀 `sch.end < today`,散落 4 處(:2245/2562/2963/4552)→ **統一改,獨立 commit,不可漏**

---

## 8. 狀態(status)衍生規則

四值:`pending`(未開始)/ `wip`(進行中)/ `done`(已完成)/ `hold`(擱置中)。

**自動推導(實際日期優先於狀態欄):**
- 有實際完成日(actualEnd)→ 強制「已完成」
- 有實際開始(actualStart,無完成)→ 強制「進行中」
- 皆無 → 看狀態欄
- 逾期非狀態,即時推導(見 §7)

UI:狀態欄反灰唯讀,? hover 說明上述規則。

---

## 9. 匯入器資料對映(現況,已查證)

`parseWbsExcel`(:6378)+ `performWbsImport`(:6444)已將 Excel 幾乎所有欄位寫入 task:

| Excel欄 | → task 屬性 |
|---|---|
| A 序號 | wbs |
| B 階段 | stage |
| C 子群組 | subgroup |
| D 任務名 | name |
| E 類型 | taskType(+ category lossy 過渡) |
| F 前置 | predecessor ✅ |
| G 工期 | durationDays ✅ |
| H 負責人 | owner + dept |
| I 預計開始 | plannedStart ✅ |
| J 預計完成 | plannedEnd |
| K/L 實際開始/完成 | actualStart/End |
| M 進度 | progress |
| N 狀態 | status |
| O/P 必交付/交付物 | mustDeliver/deliverable |
| Q 風險議題 | riskIssue |
| R 備註 | note |
| U/V 已交付/連結 | delivered/deliverableLink |
| **(新增)** | **deadline ← 本次要補讀一欄** |

**兩個 caveat:**
1. 匯入器刻意把 `start`/`end` 留空字串(只寫 planned),防 `getEffectiveSchedule` 誤判手填錨點。日期顯示走 planned/actual 四層。
2. **重新匯入整碗覆蓋**:`performWbsImport` 先清空該專案任務再重建。匯入後在 PM-Core 本地的編輯,下次重匯會被 Excel 覆蓋。工作流:真實來源是 Excel 的任務,改 Excel 重匯;PM-Core 表單編輯適合手動新建任務。

---

## 10. 施工注意(非純 UI,高風險項)

按風險排序,每項獨立 commit,逐一核 diff → 線上驗證 → commit:

1. **移除 category** → 行事曆配色改讀 `taskType`(連動風險,小心)
2. **逾期口徑統一** → 4 處改讀 `deadline || plannedEnd`(不可漏)
3. **匯入器補 deadline 欄** → `parseWbsExcel` + `performWbsImport` 兩處,**測試檔副本同步**
4. **預計完成自動算** → 接 `addWorkdays`
5. **必填驗證** → 6 欄,`U.toast + return` 模式
6. **前置結構化 UI** → 最複雜,即時搜尋過濾
7. **HL / 交付物 / 反向摺疊** → builder 內塞區塊

**鐵則提醒:** 含中文檔用 Edit 工具(禁 PowerShell 回寫);`?v=` 只升動到的檔;commit-gate 三步分開;測試檔核心函式副本要同步;未線上驗證標 `[unverified]`。
