# WBS Excel 匯入器規格（J系列_WBS_主檔）

## 目的
把 J 系列 WBS Excel（從 Google Sheet 下載）一次匯入 PM-Core，成為正式可編輯任務（非唯讀、非 synced）。匯完 Sheet 功成身退，資料主權歸 PM-Core。獨立新函式 importWbsExcel，不改既有 parseExcelImport（那是週報10欄匯入，保留）。

## 來源結構（已用真實檔核對）
- 單一專案：專案資訊分頁寫死「J 系列 壁掛分離式變頻冷暖空調」
- 任務在「J系列整合WBS」分頁，93 筆有效（D欄任務名非空），999 列其餘為空列要過濾
- 前置在 F 欄，存 WBS 序號（如 2FS+2、118,119）

## 欄位對應（22欄 A~V，已核對表頭）
A:N序號→記為 wbs 序號（id 對照用）/ B:PLM階段→stage / C:子群組→subgroup / D:任務名→name（必填，空跳過）/ E:類型→category（任務/里程碑/群組映射）/ F:前置(N)→predecessor（原樣存序號字串，不轉換）/ G:工期→durationDays / H:負責人→owner / I:預計開始→plannedStart / J:預計結束→plannedEnd / K:實際開始→actualStart / L:實際完成→actualEnd / M:進度%→progress / N:狀態→status（mapStatus）/ O:必須繳付→mustDeliver / P:繳付物說明→deliverable / Q:風險議題→riskIssue（HL議題來源）/ R:備註→note / S:最後更新→忽略 / T:版本號→忽略 / U:已交付→delivered / V:繳付連結→deliverableLink

## 已定案決策
1. task id：系統自動發（亂數/時間戳），另存 wbs 序號欄位當對照。
2. 前置：**【已更新 2026-06-13，§8b.7】前置 id 化已完成——匯入時序號→id 翻譯，predecessor 改存 task.id（# 分隔關係）。** 原規格「維持存 WBS 序號、本次不做 id 化」為當時決策、留歷史。
3. 重複匯入：清空舊 J 任務整批重灌（甲）。第一次不影響。
4. 專案資訊分頁：只讀專案名稱（單一專案 J 系列）。性試/量試/量產/可販日不在此讀——那是 infobar 即時算（getProjectStages + 任務名比對），匯入器不灌日期。
5. 任務關聯分頁：本次不碰（那是補充關聯記錄，非排程前置）。
6. 缺損容忍：只有任務名必填，其他全空不報錯。

## 已查證（2026-06-05）：前置比對用 wbs 序號，不是 task id
證據：topoSortTasks 用 String(t.wbs) 當 key（:918）、computeSchedule 用 nodes.has(String(p.dep))（:1009）、isTaskBlocked lookup 按 wbs 查（:857-865）。結論：predecessor 存序號即可，不需兩階段 id 翻譯。

## 回家執行順序
0. git pull 確認 cc0efb7
1. node docs/test-schedule-cases.js 驗 DELAYED bug（擱最久，最優先）
2. 查 parsePredecessors 用序號還是id
3. 照本規格實作 importWbsExcel + 匯入入口
4. node 驗：93筆齊、前置 2FS+2/118,119 對得上序號、階段/類型/風險議題正確。資訊條驗證：匯入後 getProjectStages 算得出性試/量試/量產階段 latestEnd、任務名含可販的完成日，infobar 即時顯示（不靠匯入灌日期）
5. 全對 → commit

## 後續關聯工作（未來，非本次）
- WBS 清單頁（唯讀檢視版）：93筆排成WBS表格，好一覽與檢視 → 匯入後做
- WBS 清單頁（可編輯+插入+前置id化）→ 跟核心資料模型升級一起做
