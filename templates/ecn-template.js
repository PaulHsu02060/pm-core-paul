// PM-Core 設變案（ECN）瘦骨架範本（§19.9，2026-07-02）
// 6 階段基礎骨架＋條件任務；S/M/L＝同骨架的「條件任務開關（sizes）＋工期檔位」，非三張獨立範本。
// 任務層新欄：sizes（'SML'/'ML'/'L' 該任務出現的分級）、effortRatio（投入比例%，§19.4）、
//   taskAttr（baseline/conditional，§19.9）、predBySize（分級不同前置時覆寫 predecessor，_ecnTplForSize 解析）。
// PM 常駐協調任務不入範本（工期＝全案跨度需排程後才知），落地時由 _stage2Commit ECN 分支動態生成（isPmCoord）。
// sizeMeta：各分級的階段集合＋PM 常駐 Effort%（S15/M20/L40，§19.4 Model Y）。
var ECN_TEMPLATE = {
  templateId: "ecn-v1",
  templateName: "設變案（ECN 瘦骨架）",
  description: "工程設變 6 階段瘦骨架：立案評估→設計變更→部品認定→驗證測試→客戶決策→生效結案；S/M/L 條件開關",
  version: "2026-07-02",
  stageDefaults: [
    { "stage": "立案評估", "stageNameCN": "立案評估", "order": 1 },
    { "stage": "設計變更", "stageNameCN": "設計變更", "order": 2 },
    { "stage": "部品認定", "stageNameCN": "部品認定", "order": 3 },
    { "stage": "驗證測試", "stageNameCN": "驗證測試", "order": 4 },
    { "stage": "DR 審核", "stageNameCN": "DR 審核", "order": 5 },
    { "stage": "客戶決策", "stageNameCN": "客戶決策", "order": 6 },
    { "stage": "生效結案", "stageNameCN": "生效結案", "order": 7 }
  ],
  roles: [ "PM", "RD", "品保", "採購", "生管PMC", "業務", "DCC" ],
  sizeMeta: {
    "S": { "pmEffort": 15, "stages": ["立案評估", "設計變更", "生效結案"] },
    "M": { "pmEffort": 20, "stages": ["立案評估", "設計變更", "部品認定", "驗證測試", "客戶決策", "生效結案"] },
    "L": { "pmEffort": 40, "stages": ["立案評估", "設計變更", "部品認定", "驗證測試", "DR 審核", "客戶決策", "生效結案"] }
  },
  cases: [
    { "variant": "主案", "stages": ["立案評估","設計變更","部品認定","驗證測試","DR 審核","客戶決策","生效結案"], "modules": [
        { "stage": "立案評估", "stageNameCN": "立案評估", "tasks": [
            { "tplId": "e1", "n": 1, "name": "設變影響範圍初評（BOM/庫存/模具/認證）", "type": "任務", "subgroup": "", "durationDays": 3, "predecessor": "", "deliverable": "", "role": "RD", "sizes": "SML", "effortRatio": 60, "taskAttr": "baseline" },
            { "tplId": "e2", "n": 2, "name": "舊料庫存盤點與生效日推估", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "", "deliverable": "", "role": "生管PMC", "sizes": "SML", "effortRatio": 30, "taskAttr": "baseline" }
        ] },
        { "stage": "設計變更", "stageNameCN": "設計變更", "tasks": [
            { "tplId": "e3", "n": 3, "name": "圖面與 BOM 表初步修改", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "1", "deliverable": "", "role": "RD", "sizes": "SML", "effortRatio": 70, "taskAttr": "baseline" }
        ] },
        { "stage": "部品認定", "stageNameCN": "部品認定", "tasks": [
            { "tplId": "e10", "n": 10, "name": "改模發包＋開模 T0 樣品", "type": "任務", "subgroup": "", "durationDays": 20, "predecessor": "3", "deliverable": "", "role": "採購", "sizes": "L", "effortRatio": 10, "taskAttr": "conditional" },
            { "tplId": "e4", "n": 4, "name": "供應商打樣與品質承認", "type": "任務", "subgroup": "", "durationDays": 7, "predecessor": "3", "predBySize": { "M": "3", "L": "10" }, "deliverable": "", "role": "品保", "sizes": "ML", "effortRatio": 15, "taskAttr": "baseline" }
        ] },
        { "stage": "驗證測試", "stageNameCN": "驗證測試", "tasks": [
            { "tplId": "e5", "n": 5, "name": "廠內試裝與干涉/安規驗證", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "4", "deliverable": "", "role": "品保", "sizes": "ML", "effortRatio": 60, "taskAttr": "baseline" },
            { "tplId": "e6", "n": 6, "name": "設計審查 DR（拉現場親手組樣機）", "type": "任務", "subgroup": "", "durationDays": 1, "predecessor": "5", "deliverable": "", "role": "PM", "sizes": "M", "effortRatio": 40, "taskAttr": "conditional" },
            { "tplId": "e11", "n": 11, "name": "信賴性測試", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "5", "deliverable": "", "role": "品保", "sizes": "L", "effortRatio": 15, "taskAttr": "conditional" },
            { "tplId": "e12", "n": 12, "name": "重新認證（安規/EMC）", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "5", "deliverable": "", "role": "品保", "sizes": "L", "effortRatio": 15, "taskAttr": "conditional" }
        ] },
        { "stage": "DR 審核", "stageNameCN": "DR 審核", "tasks": [
            { "tplId": "e13", "n": 13, "name": "設計審查 DR（跨部門樣機組裝）", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "5,11,12", "deliverable": "", "role": "PM", "sizes": "L", "effortRatio": 30, "taskAttr": "conditional" }
        ] },
        { "stage": "客戶決策", "stageNameCN": "客戶決策", "tasks": [
            { "tplId": "e7", "n": 7, "name": "客戶承認與成本接受度", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "5", "predBySize": { "M": "6", "L": "13" }, "deliverable": "", "role": "業務", "sizes": "ML", "effortRatio": 20, "taskAttr": "baseline" }
        ] },
        { "stage": "生效結案", "stageNameCN": "生效結案", "tasks": [
            { "tplId": "e8", "n": 8, "name": "BOM 切換與技術文件發行（Fan-out 全子機種）", "type": "任務", "subgroup": "", "durationDays": 3, "predecessor": "3", "predBySize": { "M": "7", "L": "7" }, "deliverable": "", "role": "DCC", "sizes": "SML", "effortRatio": 50, "taskAttr": "baseline" },
            { "tplId": "e9", "n": 9, "name": "設變效益覆核（成本差異）", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "8", "deliverable": "", "role": "PM", "sizes": "SML", "effortRatio": 30, "taskAttr": "conditional" }
        ] }
    ] },
    { "variant": "另案", "stages": ["立案評估","設計變更","部品認定","驗證測試","DR 審核","客戶決策","生效結案"], "modules": [
        { "stage": "立案評估", "stageNameCN": "立案評估", "tasks": [
            { "tplId": "e1", "n": 1, "name": "設變影響範圍初評（BOM/庫存/模具/認證）", "type": "任務", "subgroup": "", "durationDays": 3, "predecessor": "", "deliverable": "", "role": "RD", "sizes": "SML", "effortRatio": 60, "taskAttr": "baseline" },
            { "tplId": "e2", "n": 2, "name": "舊料庫存盤點與生效日推估", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "", "deliverable": "", "role": "生管PMC", "sizes": "SML", "effortRatio": 30, "taskAttr": "baseline" }
        ] },
        { "stage": "設計變更", "stageNameCN": "設計變更", "tasks": [
            { "tplId": "e3", "n": 3, "name": "圖面與 BOM 表初步修改", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "1", "deliverable": "", "role": "RD", "sizes": "SML", "effortRatio": 70, "taskAttr": "baseline" }
        ] },
        { "stage": "部品認定", "stageNameCN": "部品認定", "tasks": [
            { "tplId": "e10", "n": 10, "name": "改模發包＋開模 T0 樣品", "type": "任務", "subgroup": "", "durationDays": 20, "predecessor": "3", "deliverable": "", "role": "採購", "sizes": "L", "effortRatio": 10, "taskAttr": "conditional" },
            { "tplId": "e4", "n": 4, "name": "供應商打樣與品質承認", "type": "任務", "subgroup": "", "durationDays": 7, "predecessor": "3", "predBySize": { "M": "3", "L": "10" }, "deliverable": "", "role": "品保", "sizes": "ML", "effortRatio": 15, "taskAttr": "baseline" }
        ] },
        { "stage": "驗證測試", "stageNameCN": "驗證測試", "tasks": [
            { "tplId": "e5", "n": 5, "name": "廠內試裝與干涉/安規驗證", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "4", "deliverable": "", "role": "品保", "sizes": "ML", "effortRatio": 60, "taskAttr": "baseline" },
            { "tplId": "e6", "n": 6, "name": "設計審查 DR（拉現場親手組樣機）", "type": "任務", "subgroup": "", "durationDays": 1, "predecessor": "5", "deliverable": "", "role": "PM", "sizes": "M", "effortRatio": 40, "taskAttr": "conditional" },
            { "tplId": "e11", "n": 11, "name": "信賴性測試", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "5", "deliverable": "", "role": "品保", "sizes": "L", "effortRatio": 15, "taskAttr": "conditional" },
            { "tplId": "e12", "n": 12, "name": "重新認證（安規/EMC）", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "5", "deliverable": "", "role": "品保", "sizes": "L", "effortRatio": 15, "taskAttr": "conditional" }
        ] },
        { "stage": "DR 審核", "stageNameCN": "DR 審核", "tasks": [
            { "tplId": "e13", "n": 13, "name": "設計審查 DR（跨部門樣機組裝）", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "5,11,12", "deliverable": "", "role": "PM", "sizes": "L", "effortRatio": 30, "taskAttr": "conditional" }
        ] },
        { "stage": "客戶決策", "stageNameCN": "客戶決策", "tasks": [
            { "tplId": "e7", "n": 7, "name": "客戶承認與成本接受度", "type": "任務", "subgroup": "", "durationDays": 4, "predecessor": "5", "predBySize": { "M": "6", "L": "13" }, "deliverable": "", "role": "業務", "sizes": "ML", "effortRatio": 20, "taskAttr": "baseline" }
        ] },
        { "stage": "生效結案", "stageNameCN": "生效結案", "tasks": [
            { "tplId": "e8", "n": 8, "name": "BOM 切換與技術文件發行（Fan-out 全子機種）", "type": "任務", "subgroup": "", "durationDays": 3, "predecessor": "3", "predBySize": { "M": "7", "L": "7" }, "deliverable": "", "role": "DCC", "sizes": "SML", "effortRatio": 50, "taskAttr": "baseline" },
            { "tplId": "e9", "n": 9, "name": "設變效益覆核（成本差異）", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "8", "deliverable": "", "role": "PM", "sizes": "SML", "effortRatio": 30, "taskAttr": "conditional" }
        ] }
    ] }
  ]
};
