// PM-Core 標準版專案模板（公司標準開發 WBS，67 筆 5 階段）
// 2026-06-16 由標準 WBS Excel 轉出。主案+另案同源（另案預設全 5 階段，user 自行刪減）。
// 階段碼=中文（設計/手工機/性試機/量試機/量產機），碼=顯示名一致。里程碑 durationDays=0。
// 四繳付欄（mustDeliver/deliverableType/requiredTask/mustIssue）不在範本層，套用時走預設兜底。
var PRODUCT_DEV_TEMPLATE = {
  templateId: "product-dev-v1",
  templateName: "標準版（公司標準開發流程）",
  description: "公司標準產品開發 WBS，5 階段完整流程：設計→手工機→性試機→量試機→量產機",
  version: "2026-06-16",
  stageDefaults: [
    { "stage": "設計", "stageNameCN": "設計", "order": 1 },
    { "stage": "手工機", "stageNameCN": "手工機", "order": 2 },
    { "stage": "性試機", "stageNameCN": "性試機", "order": 3 },
    { "stage": "量試機", "stageNameCN": "量試機", "order": 4 },
    { "stage": "量產機", "stageNameCN": "量產機", "order": 5 }
  ],
  roles: [ "系統工程師", "結構工程師", "硬體工程師", "韌體工程師", "馬達驅動工程師", "機構工程師", "採購", "生產", "品保", "品管", "PM" ],
  cases: [
    { "variant": "主案", "stages": ["設計","手工機","性試機","量試機","量產機"], "modules": [
        { "stage": "設計", "stageNameCN": "設計", "tasks": [
            { "tplId": "t1", "n": 1, "name": "周邊/規格訂定", "type": "任務", "subgroup": "系統", "durationDays": 10, "predecessor": "", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t2", "n": 2, "name": "系統部件選型", "type": "任務", "subgroup": "系統", "durationDays": 5, "predecessor": "1FF", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t3", "n": 3, "name": "機能訂定", "type": "任務", "subgroup": "系統", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t4", "n": 4, "name": "大架構草圖", "type": "任務", "subgroup": "外觀/結構", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t5", "n": 5, "name": "細部發展", "type": "任務", "subgroup": "外觀/結構", "durationDays": 25, "predecessor": "4FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t6", "n": 6, "name": "試作圖面產出", "type": "任務", "subgroup": "外觀/結構", "durationDays": 5, "predecessor": "5FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t7", "n": 7, "name": "電路設計", "type": "任務", "subgroup": "HW", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t8", "n": 8, "name": "LAYOUT", "type": "任務", "subgroup": "HW", "durationDays": 15, "predecessor": "5FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t9", "n": 9, "name": "外注BOM產出", "type": "任務", "subgroup": "HW", "durationDays": 5, "predecessor": "8FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t10", "n": 10, "name": "機能流程規劃", "type": "任務", "subgroup": "FW", "durationDays": 10, "predecessor": "3FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t11", "n": 11, "name": "底層發展", "type": "任務", "subgroup": "FW", "durationDays": 15, "predecessor": "10FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t12", "n": 12, "name": "邏輯流程發展", "type": "任務", "subgroup": "FW", "durationDays": 20, "predecessor": "11FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t13", "n": 13, "name": "手工機圖面/BOM發外注", "type": "任務", "subgroup": "", "durationDays": 7, "predecessor": "6,9", "deliverable": "", "role": "採購" }
        ] },
        { "stage": "手工機", "stageNameCN": "手工機", "tasks": [
            { "tplId": "t14", "n": 14, "name": "模型製作", "type": "任務", "subgroup": "組立", "durationDays": 15, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t15", "n": 15, "name": "樣品製作", "type": "任務", "subgroup": "組立", "durationDays": 20, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t16", "n": 16, "name": "HW打件", "type": "任務", "subgroup": "組立", "durationDays": 25, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t17", "n": 17, "name": "手工機組裝", "type": "任務", "subgroup": "組立", "durationDays": 3, "predecessor": "14,15,16", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t18", "n": 18, "name": "HW驗證", "type": "任務", "subgroup": "制御", "durationDays": 10, "predecessor": "16FS+3", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t19", "n": 19, "name": "驅動調教", "type": "任務", "subgroup": "制御", "durationDays": 10, "predecessor": "18", "deliverable": "", "role": "馬達驅動工程師" },
            { "tplId": "t20", "n": 20, "name": "FW DEBUG", "type": "任務", "subgroup": "制御", "durationDays": 15, "predecessor": "18", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t21", "n": 21, "name": "EMC/EMI/EMS測試", "type": "任務", "subgroup": "制御", "durationDays": 5, "predecessor": "24FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t22", "n": 22, "name": "乾風量測試", "type": "任務", "subgroup": "試驗", "durationDays": 2, "predecessor": "19FS+2", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t23", "n": 23, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 10, "predecessor": "22", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t24", "n": 24, "name": "溫昇試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "23", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t25", "n": 25, "name": "噪音調教", "type": "任務", "subgroup": "試驗", "durationDays": 10, "predecessor": "24", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t26", "n": 26, "name": "試作BOM發行", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "25FS+10", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t27", "n": 27, "name": "長材備料BOM發行", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "26FF", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t28", "n": 28, "name": "試作圖面發行", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "26FF", "deliverable": "", "role": "結構工程師" }
        ] },
        { "stage": "性試機", "stageNameCN": "性試機", "tasks": [
            { "tplId": "t29", "n": 29, "name": "詢價/發注", "type": "任務", "subgroup": "模具製作", "durationDays": 15, "predecessor": "28FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t30", "n": 30, "name": "試模", "type": "任務", "subgroup": "模具製作", "durationDays": 15, "predecessor": "29FS+50", "deliverable": "", "role": "採購" },
            { "tplId": "t31", "n": 31, "name": "驗收", "type": "任務", "subgroup": "模具製作", "durationDays": 20, "predecessor": "34FS+20", "deliverable": "", "role": "採購" },
            { "tplId": "t32", "n": 32, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "30FS+10", "deliverable": "", "role": "PM" },
            { "tplId": "t33", "n": 33, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "32FS+10", "deliverable": "", "role": "生產" },
            { "tplId": "t34", "n": 34, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 1, "predecessor": "33FS+3", "deliverable": "", "role": "PM" },
            { "tplId": "t35", "n": 35, "name": "包裝試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "34", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t36", "n": 36, "name": "注水試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "35FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t37", "n": 37, "name": "燃燒試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "36FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t38", "n": 38, "name": "強風逆轉試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "37FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t39", "n": 39, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "34FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t40", "n": 40, "name": "銅管應力測試", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "39FS+2", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t41", "n": 41, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "40FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t42", "n": 42, "name": "長期運轉機提出", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "39,40,41", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t43", "n": 43, "name": "商檢機送測", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "39FS+3", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t44", "n": 44, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "35,36,37,38,39,40,41", "deliverable": "", "role": "PM" },
            { "tplId": "t45", "n": 45, "name": "正式BOM發行", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "44FS+5", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t46", "n": 46, "name": "正式圖面發行", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "45FF", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t47", "n": 47, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 25, "predecessor": "46FS+3", "deliverable": "", "role": "採購" }
        ] },
        { "stage": "量試機", "stageNameCN": "量試機", "tasks": [
            { "tplId": "t48", "n": 48, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "47FS+10", "deliverable": "", "role": "品保" },
            { "tplId": "t49", "n": 49, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "48FS+10", "deliverable": "", "role": "生產" },
            { "tplId": "t50", "n": 50, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "49FS+3", "deliverable": "", "role": "品保" },
            { "tplId": "t51", "n": 51, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "50FS+2", "deliverable": "", "role": "品保" },
            { "tplId": "t52", "n": 52, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "51FS+1", "deliverable": "", "role": "品保" },
            { "tplId": "t53", "n": 53, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "51,52", "deliverable": "", "role": "PM" },
            { "tplId": "t54", "n": 54, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "53FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t55", "n": 55, "name": "商品登錄", "type": "任務", "subgroup": "", "durationDays": 80, "predecessor": "43", "deliverable": "", "role": "品管" },
            { "tplId": "t56", "n": 56, "name": "分級標章", "type": "任務", "subgroup": "", "durationDays": 30, "predecessor": "55FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t57", "n": 57, "name": "環保標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "55FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t58", "n": 58, "name": "節能標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "56FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t59", "n": 59, "name": "MIT標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "55FS+15", "deliverable": "", "role": "品管" }
        ] },
        { "stage": "量產機", "stageNameCN": "量產機", "tasks": [
            { "tplId": "t60", "n": 60, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "55,56,57,58,59", "deliverable": "", "role": "品保" },
            { "tplId": "t61", "n": 61, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "60", "deliverable": "", "role": "生產" },
            { "tplId": "t62", "n": 62, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "61FS+3", "deliverable": "", "role": "品保" },
            { "tplId": "t63", "n": 63, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "62FS+2", "deliverable": "", "role": "品保" },
            { "tplId": "t64", "n": 64, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "63FS+1", "deliverable": "", "role": "品保" },
            { "tplId": "t65", "n": 65, "name": "可販", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "63,64", "deliverable": "", "role": "品保" },
            { "tplId": "t66", "n": 66, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "63,64", "deliverable": "", "role": "PM" },
            { "tplId": "t67", "n": 67, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 5, "predecessor": "66FS+3", "deliverable": "", "role": "採購" }
        ] }
    ] },
    { "variant": "另案", "stages": ["設計","手工機","性試機","量試機","量產機"], "modules": [
        { "stage": "設計", "stageNameCN": "設計", "tasks": [
            { "tplId": "t1", "n": 1, "name": "周邊/規格訂定", "type": "任務", "subgroup": "系統", "durationDays": 10, "predecessor": "", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t2", "n": 2, "name": "系統部件選型", "type": "任務", "subgroup": "系統", "durationDays": 5, "predecessor": "1FF", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t3", "n": 3, "name": "機能訂定", "type": "任務", "subgroup": "系統", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t4", "n": 4, "name": "大架構草圖", "type": "任務", "subgroup": "外觀/結構", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t5", "n": 5, "name": "細部發展", "type": "任務", "subgroup": "外觀/結構", "durationDays": 25, "predecessor": "4FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t6", "n": 6, "name": "試作圖面產出", "type": "任務", "subgroup": "外觀/結構", "durationDays": 5, "predecessor": "5FS+5", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t7", "n": 7, "name": "電路設計", "type": "任務", "subgroup": "HW", "durationDays": 15, "predecessor": "1FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t8", "n": 8, "name": "LAYOUT", "type": "任務", "subgroup": "HW", "durationDays": 15, "predecessor": "5FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t9", "n": 9, "name": "外注BOM產出", "type": "任務", "subgroup": "HW", "durationDays": 5, "predecessor": "8FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t10", "n": 10, "name": "機能流程規劃", "type": "任務", "subgroup": "FW", "durationDays": 10, "predecessor": "3FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t11", "n": 11, "name": "底層發展", "type": "任務", "subgroup": "FW", "durationDays": 15, "predecessor": "10FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t12", "n": 12, "name": "邏輯流程發展", "type": "任務", "subgroup": "FW", "durationDays": 20, "predecessor": "11FS+5", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t13", "n": 13, "name": "手工機圖面/BOM發外注", "type": "任務", "subgroup": "", "durationDays": 7, "predecessor": "6,9", "deliverable": "", "role": "採購" }
        ] },
        { "stage": "手工機", "stageNameCN": "手工機", "tasks": [
            { "tplId": "t14", "n": 14, "name": "模型製作", "type": "任務", "subgroup": "組立", "durationDays": 15, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t15", "n": 15, "name": "樣品製作", "type": "任務", "subgroup": "組立", "durationDays": 20, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t16", "n": 16, "name": "HW打件", "type": "任務", "subgroup": "組立", "durationDays": 25, "predecessor": "13FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t17", "n": 17, "name": "手工機組裝", "type": "任務", "subgroup": "組立", "durationDays": 3, "predecessor": "14,15,16", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t18", "n": 18, "name": "HW驗證", "type": "任務", "subgroup": "制御", "durationDays": 10, "predecessor": "16FS+3", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t19", "n": 19, "name": "驅動調教", "type": "任務", "subgroup": "制御", "durationDays": 10, "predecessor": "18", "deliverable": "", "role": "馬達驅動工程師" },
            { "tplId": "t20", "n": 20, "name": "FW DEBUG", "type": "任務", "subgroup": "制御", "durationDays": 15, "predecessor": "18", "deliverable": "", "role": "韌體工程師" },
            { "tplId": "t21", "n": 21, "name": "EMC/EMI/EMS測試", "type": "任務", "subgroup": "制御", "durationDays": 5, "predecessor": "24FS+5", "deliverable": "", "role": "硬體工程師" },
            { "tplId": "t22", "n": 22, "name": "乾風量測試", "type": "任務", "subgroup": "試驗", "durationDays": 2, "predecessor": "19FS+2", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t23", "n": 23, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 10, "predecessor": "22", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t24", "n": 24, "name": "溫昇試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "23", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t25", "n": 25, "name": "噪音調教", "type": "任務", "subgroup": "試驗", "durationDays": 10, "predecessor": "24", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t26", "n": 26, "name": "試作BOM發行", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "25FS+10", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t27", "n": 27, "name": "長材備料BOM發行", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "26FF", "deliverable": "", "role": "結構工程師" },
            { "tplId": "t28", "n": 28, "name": "試作圖面發行", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "26FF", "deliverable": "", "role": "結構工程師" }
        ] },
        { "stage": "性試機", "stageNameCN": "性試機", "tasks": [
            { "tplId": "t29", "n": 29, "name": "詢價/發注", "type": "任務", "subgroup": "模具製作", "durationDays": 15, "predecessor": "28FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t30", "n": 30, "name": "試模", "type": "任務", "subgroup": "模具製作", "durationDays": 15, "predecessor": "29FS+50", "deliverable": "", "role": "採購" },
            { "tplId": "t31", "n": 31, "name": "驗收", "type": "任務", "subgroup": "模具製作", "durationDays": 20, "predecessor": "34FS+20", "deliverable": "", "role": "採購" },
            { "tplId": "t32", "n": 32, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "30FS+10", "deliverable": "", "role": "PM" },
            { "tplId": "t33", "n": 33, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "32FS+10", "deliverable": "", "role": "生產" },
            { "tplId": "t34", "n": 34, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 1, "predecessor": "33FS+3", "deliverable": "", "role": "PM" },
            { "tplId": "t35", "n": 35, "name": "包裝試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "34", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t36", "n": 36, "name": "注水試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "35FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t37", "n": 37, "name": "燃燒試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "36FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t38", "n": 38, "name": "強風逆轉試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "37FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t39", "n": 39, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "34FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t40", "n": 40, "name": "銅管應力測試", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "39FS+2", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t41", "n": 41, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "40FS+1", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t42", "n": 42, "name": "長期運轉機提出", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "39,40,41", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t43", "n": 43, "name": "商檢機送測", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "39FS+3", "deliverable": "", "role": "系統工程師" },
            { "tplId": "t44", "n": 44, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "35,36,37,38,39,40,41", "deliverable": "", "role": "PM" },
            { "tplId": "t45", "n": 45, "name": "正式BOM發行", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "44FS+5", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t46", "n": 46, "name": "正式圖面發行", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "45FF", "deliverable": "", "role": "機構工程師" },
            { "tplId": "t47", "n": 47, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 25, "predecessor": "46FS+3", "deliverable": "", "role": "採購" }
        ] },
        { "stage": "量試機", "stageNameCN": "量試機", "tasks": [
            { "tplId": "t48", "n": 48, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "47FS+10", "deliverable": "", "role": "品保" },
            { "tplId": "t49", "n": 49, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "48FS+10", "deliverable": "", "role": "生產" },
            { "tplId": "t50", "n": 50, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "49FS+3", "deliverable": "", "role": "品保" },
            { "tplId": "t51", "n": 51, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "50FS+2", "deliverable": "", "role": "品保" },
            { "tplId": "t52", "n": 52, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 3, "predecessor": "51FS+1", "deliverable": "", "role": "品保" },
            { "tplId": "t53", "n": 53, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 15, "predecessor": "51,52", "deliverable": "", "role": "PM" },
            { "tplId": "t54", "n": 54, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "53FS+3", "deliverable": "", "role": "採購" },
            { "tplId": "t55", "n": 55, "name": "商品登錄", "type": "任務", "subgroup": "", "durationDays": 80, "predecessor": "43", "deliverable": "", "role": "品管" },
            { "tplId": "t56", "n": 56, "name": "分級標章", "type": "任務", "subgroup": "", "durationDays": 30, "predecessor": "55FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t57", "n": 57, "name": "環保標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "55FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t58", "n": 58, "name": "節能標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "56FS+5", "deliverable": "", "role": "品管" },
            { "tplId": "t59", "n": 59, "name": "MIT標章", "type": "任務", "subgroup": "", "durationDays": 50, "predecessor": "55FS+15", "deliverable": "", "role": "品管" }
        ] },
        { "stage": "量產機", "stageNameCN": "量產機", "tasks": [
            { "tplId": "t60", "n": 60, "name": "移行", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "55,56,57,58,59", "deliverable": "", "role": "品保" },
            { "tplId": "t61", "n": 61, "name": "組立", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "60", "deliverable": "", "role": "生產" },
            { "tplId": "t62", "n": 62, "name": "DR", "type": "任務", "subgroup": "", "durationDays": 2, "predecessor": "61FS+3", "deliverable": "", "role": "品保" },
            { "tplId": "t63", "n": 63, "name": "性能試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "62FS+2", "deliverable": "", "role": "品保" },
            { "tplId": "t64", "n": 64, "name": "噪音試驗", "type": "任務", "subgroup": "試驗", "durationDays": 5, "predecessor": "63FS+1", "deliverable": "", "role": "品保" },
            { "tplId": "t65", "n": 65, "name": "可販", "type": "里程碑", "subgroup": "", "durationDays": 0, "predecessor": "63,64", "deliverable": "", "role": "品保" },
            { "tplId": "t66", "n": 66, "name": "設計變更點提出", "type": "任務", "subgroup": "", "durationDays": 10, "predecessor": "63,64", "deliverable": "", "role": "PM" },
            { "tplId": "t67", "n": 67, "name": "部品認定完成", "type": "任務", "subgroup": "", "durationDays": 5, "predecessor": "66FS+3", "deliverable": "", "role": "採購" }
        ] }
    ] }
  ],
  _note: "標準版模板；簡易版（舊 J 系列 Prototype/EVT/DVT 內容）以後另開。另案與主案同源，預設全 5 階段，建專案時 user 自行刪減不需要的階段。"
};
