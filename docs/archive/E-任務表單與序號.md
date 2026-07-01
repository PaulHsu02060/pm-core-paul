# PM-Core Archive · E · 任務表單／序號

> 已完成功能的落地紀錄／施工歷史／退役草稿（此功能群）。非現役 spec——現役規格看 `../pm-core-architecture.md`，全文地圖看 `../architecture-INDEX.md`。
> ⚠ 內含拆檔前 monolith `app.js` 行號，已失效、僅供歷史對照；找 code 以函式名為錨（見主檔 §18.7.2）。

---

### 6.4 前置任務結構化（✅ 已做，2026-06-15 commit1）

取代舊自由文字 `1FF,2FS+2`（沒人會填）。

> 實作註（commit1）：原設計模糊搜尋輸入因 datalist value 帶不了乾淨 id（顯示文字≠task.id），改 <select> value=task.id；代價是失去打字搜尋，靠 optgroup 階段分組 + 階段窗縮短候選彌補。

- 結構化「一列一條」：搜尋任務（模糊）+ 關係下拉（白話）+ lag（預設隱藏，點「+延遲」展開）
- 關係白話：完成才能開始(FS) / 同時開始(SS) / 同時完成(FF) / 開始才能完成(SF)
- `?` + 範例：`16FS`=等#16完成才開始 / `16FS+2`=完成後再隔2工作天 / `16SS`=同天開始 / `16FF`=同天完成 / `16SF`=#16開始後才能完成
- 候選清單限制（已放寬）：列 `measureType !== 'hours'` 的任務（工期制＝WBS＋手動專案任務都可當前置，不再限有 wbs 編號）；階段窗過濾（前 1-2 階段＋同階段之前）見 §9 S5。
- 改結構化後不需 parsePredecessors 格式檢查。

> ↪ 原 §6.5c 落地／施工歷史
**【§6.5 落地紀錄 2026-06-25（五塊全完成，t.end 全檔絕跡）】**

- 塊一 t.end 衍生化主線（commit 8036d52→d37391f）：App.recalcTaskTimeFields 三欄連動（改開始/工期→現算 addWorkdays(有效開始日,dur-1) 寫 tf-end 顯示）；App.bindTaskTimeListeners 改 document 事件委派（_taskTimeDelegated 只綁一次，因自動態 tf-start 不在 DOM，個別綁不到）；App.readEffStart（tf-start.value 優先、否則讀隱藏欄 tf-effstart=getEffectiveSchedule(t).start）解決自動態錨點空；recalc guard 移除 !startEl；getEffectiveSchedule dispEnd 衍生兜底（actual||scheduled||planned 全空→現算 addWorkdays(dispStart,max(1,dur)-1)）；save 端 readDurationField（start+end 都有→deriveDurationFromEnd 反推工期，存 durationDays 不存 t.end）。實測通過：手填錨點任務改工期→視窗內即時跳+存檔外層即時變+重開不空。
- 塊二刀① isTaskBlocked（commit e70b407）：衝突檢查改讀 getEffectiveSchedule(task/dep) 衍生 start/end，移除原 dep.end 空補算窄修補丁（衍生兜底已涵蓋），FF/SF 不再讀 undefined；清過時 bug 註解。回歸 test-schedule-cases 160/0。
- 塊三 負工期確認 modal（commit 500eda2）：B 案 #confirmOverlay 獨立第二層 overlay（z-confirm:520 疊 modal 500 上），App.confirmModal 公版渲染至此不炸底層任務表單；saveTask/saveNewTask 加 _skipNegCheck 旗標分流，負工期（readEffStart 統一口徑、排除 milestone）跳「工期為負數，系統照您輸入儲存」modal，確認→saveXxx(...,true) 強制存、取消留表單，取代舊「擋死 toast」guard。
- 塊四 負工期列表標紅（commit 15583e6）：buildTaskRowHtml 加 _negDur 判定（end<start||dur≤0，排除 milestone），整列 neg-dur 淡紅底（--rose-l）、區間欄拆專屬 task-range class（避免污染截止欄 task-deadline）標 --rose-ink、hover data-tip。
- 塊1.5 移除 J 同步 task.end 死寫（commit 1be7bb3）：J 同步原寫 task.end=latest.planEnd（更新+新建兩處），塊一砍 t.end 後全檔零讀取，移除；J 完成日靠 plannedEnd（原始計畫）+衍生兜底承接。
- t.end 全檔絕跡（grep "task.end ="/"t.end =" 皆 0）。單一真實來源＝開始日+工期，完成日全程衍生不儲存。實際完成 actualEnd 留資料層（事實、排程錨）。

### 6.7 HL + 實際執行（已完成）

- HL：單一布林 `riskHL` 勾選 → 展開 `riskIssue` 文字欄。
- 實際執行：CSS 反向摺疊（new 收起、edit 展開，DOM 永遠在避免裸讀炸），內含實際開始/完成 + 交付物（`deliverable` 文字 + `deliverableLink` 連結）。原生檔案上傳未做（無檔案後端，未來接雲端 storage）。

### 6.8 釘子視覺 toggle（2026-06-13 已完成，commit `6a89be4`）

> ⚠️ **已廢除（2026-06-13）**：Task 層個別錨定移除。個別任務本就應跟前置連動，釘住反而違反連動；錨定的正確位置在 **Template 層（正推／逆推）**，非個別 Task。已移除 📌 `task-anchor` UI（task-row + header 第 2 欄 + grid 11→10 欄）、`App.setAnchor` 函式、`.task-anchor`/`.anchor-badge` CSS。`t.pinned` 孤兒欄位保留（無人讀、不顯示）。下方為原設計記錄，僅供歷史參照。

任務列釘子改為視覺 toggle，取代舊版空殼（點了跳 toast「開發中」）：

- 引入 **Tabler icons webfont**（CDN，鎖版本 `3.44.0`：`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.44.0/dist/tabler-icons.min.css`）。系統原本無 icon 字體、全靠 emoji，emoji 無法 CSS 染色 toggle。免費 Tabler webfont 只有 outline 線性版（無 filled）。
- **未釘**：灰色直立釘子 `ti-pin`（吃 `.task-anchor` 的 `--ink4`）。
- **已釘**：sage 圓底 badge 包 `ti-pinned`（斜插釘）+「已釘」文字（`.anchor-badge`，圓底 `--sage-100` + 文字 `--sage-700`）。形狀（直立↔斜插）+ 顏色雙重區分，比純顏色明顯。
- `setAnchor`：擋 `t.locked`（比照 toggleTaskDone）→ toggle `t.pinned` → Storage.save → refreshAll。不跳成功 toast（icon 變色即回饋）。
- **未做（下一階段）**：釘子聯算——釘住觸發 override / 下游級聯重排，依 §4.3/§4.4 錨點機制，與排程錨點一起做。目前只做視覺 toggle + 持久化。

### 6.9 任務列中間插入（2026-06-13 已完成，commit `416f970`）

解決「任務只能加在最後、不能從中間插入」：

- **列交界 hover➕**：滑鼠移到兩列交界，該列下緣分隔線變 sage 變粗（`.row-insert::before` 2px `--sage-600` 圓角線壓在列下緣）+ 浮出圓形➕。點➕開新增表單，填完插在該列下面。
- **末尾不放**：`:last-child .row-insert` 隱藏，最後一列下面無➕（加到最後走既有「+新增任務」按鈕）。`.row-insert` 預設 `display:none`，只在 `#activeTaskList` 內開 → done 清單／其他用 buildTaskRowHtml 處不冒➕。
- **插入位置用 id 反查、非渲染序**：`visibleActive[i]` 是 preview-limit 切過的子集，渲染序 i ≠ DATA.tasks 真實 index。點➕設 `App._insertAfterId = 該列 t.id`，saveNewTask 用 `DATA.tasks.findIndex(x => x.id === _insertAfterId)` 反查真實位置 splice 插其後。closeModal 清 `_insertAfterId`（取消/X/Esc 都清，防殘留誤插）。
- ➕ 用 `pointer-events:none` 不擋列點擊（列本身仍可點開編輯），只按鈕可點。z-index 走 `--z-sticky`、`.task-row` 加 `position:relative` 不建立新堆疊脈絡。
- **本案是「位置插入」純位置層**，不綁前置依賴 id 化（§8b.5 層次二已 revert）。「依賴不錯位」的根本解需 id 化重做（見 §9 待辦）。
- 【更新 2026-06-18，commit `80fad1b`（二刀-B step1，日期序世界）】列間➕ 改為**自動接前置落位**：點某列下緣➕ → `_insertAfterId=該列 id` → `saveNewTask` 在**表單前置為空時**自動帶入 `_insertAfterId#FS`（沿用 `serializePredecessors` id#格式）→ `applySchedule` 算日期 → 依日期序落到參考列後。**有手填前置則不覆蓋。**
- ⚠ `splice(_i+1)` 保留但作用退化＝「同 `dispStart` 任務的 tiebreak」（同日期 `orderTasksByDispStart` 用 decorate-index 保陣列序）。**看似死碼、實則同日排序靠它，勿刪。**

---

### 8b.7 前置 id 化實作完成紀錄（2026-06-13）

走「資料端先帶 id、引擎最後切」的安全順序，每步線上可用、無中途爆炸：
- S1（862a926）：翻譯純函式 buildWbsToIdMap + translatePredToId（純函式不碰 DOM/Storage）
- S3（1578185）：WBS 匯入 performWbsImport 第二輪翻 predecessor 序號→id
- S4（1465876）：J 同步 syncJSeries 每次同步當下翻譯（方案 P，不靠 one-shot 旗標，避開上次爆炸根因）
- S2a（a9c9627）：translatePredToId 輸出加 # 分隔符（id#FS）根除邊界歧義；parsePredecessors 雙格式相容（有#走 id、無#走舊序號）
- S2b-1（cfd445f）：引擎節點 key wbs→id（topoSort/computeSchedule/isTaskBlocked，生產+測試副本一字不差）
- S2b-2（733e0e6）：測試端 runSchedule/runApply wrapper（fixture 維持序號、入口翻譯）
- S2b-3（c7214ca）：§3 runTopo wrapper，90 案全綠（當時 86，後補 SS/FF/SF lag 至 90）

關鍵設計：predecessor 存 task.id（永久身分）、wbs 保留供顯示/追溯、# 分隔符避免 id 與 type 撞、翻譯對已翻 id 冪等（就地翻安全）。

✅ S5 已完成（2026-06-15，commit1）：手動表單 serializePredecessors 已接 id 化（讀 select.value=id、吐 id#關係lag，對齊 translatePredToId）。三路徑（WBS 匯入、J 同步、手動表單）全 id 化、線上可用。詳見 §9 S5。

### 8b.8 待辦列 done 改造（2026-06-15，commit `2243ae9`）

承 §8b.4 序統一，重整待辦列 done 呈現：
- **不濾 done 回主列**：done 任務原位顯示（灰字刪除線，既有 `.task-row.done`），序同源 `orderedProjectTasks`（含 done 佔號、排除 deleted），外層待辦列與前置下拉同號。
- **頂部摺疊 toggle bar**：「已完成 N」bar 放欄位表頭下方（非底部）；收合隱藏 done 列、展開原位顯示；`toggleDoneVisible` 以 `renderProject` 重繪；F 配色（sage 左粗綠條 + sage-100 底 + 深字，走變數）。
- **預覽切第 15 個未完成**：掃 ordered 累計未完成到 15 為止（done 不佔預覽額度，夾在中間者原位保留）。
- **工期制免自動清除**：`cleanOldDoneTasks` 加 `measureType !== 'hours'` 豁免——工期制（WBS／手動專案任務）done 永不自動刪，只清時段制雜事；移除誤導 tip。詳見踩坑手冊「坑 3」。

---
