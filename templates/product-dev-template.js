var PRODUCT_DEV_TEMPLATE =
{
  "templateId": "product-dev-v1",
  "templateName": "產品開發範本",
  "description": "硬體產品 NPI 標準流程範本（Prototype → EVT → DVT → Safety → PP → MP）",
  "version": "1.0",
  "stageDefaults": [
    {
      "stage": "Prototype",
      "stageNameCN": "原型規劃",
      "order": 1
    },
    {
      "stage": "EVT",
      "stageNameCN": "工程驗證",
      "order": 2
    },
    {
      "stage": "DVT",
      "stageNameCN": "設計驗證",
      "order": 3
    },
    {
      "stage": "Safety",
      "stageNameCN": "安規認證",
      "order": 4
    },
    {
      "stage": "PP",
      "stageNameCN": "試產",
      "order": 5
    },
    {
      "stage": "MP",
      "stageNameCN": "量產",
      "order": 6
    }
  ],
  "roles": [
    "PM",
    "ME",
    "EE",
    "FW",
    "開發課",
    "品保",
    "採購",
    "生管"
  ],
  "cases": [
    {
      "variant": "主案",
      "stages": [
        "Prototype",
        "EVT",
        "DVT",
        "Safety",
        "PP",
        "MP"
      ],
      "modules": [
        {
          "stage": "Prototype",
          "stageNameCN": "原型規劃",
          "tasks": [
            {
              "tplId": "t19",
              "n": 19,
              "name": "專案計畫書（含損益）",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 15,
              "predecessor": "",
              "deliverable": "計畫書",
              "role": ""
            },
            {
              "tplId": "t1",
              "n": 1,
              "name": "需求規格訂定 — 結構件打樣",
              "type": "任務",
              "subgroup": "系統",
              "durationDays": 15,
              "predecessor": "",
              "deliverable": "結構打樣件",
              "role": ""
            },
            {
              "tplId": "t2",
              "n": 2,
              "name": "系統部件驗證 — 功能+環境測試",
              "type": "任務",
              "subgroup": "系統",
              "durationDays": 12,
              "predecessor": "1",
              "deliverable": "測試報告",
              "role": ""
            },
            {
              "tplId": "t3",
              "n": 3,
              "name": "系統部件選型 — 測項檢討會議",
              "type": "任務",
              "subgroup": "系統",
              "durationDays": 2,
              "predecessor": "2FS+2",
              "deliverable": "會議紀錄",
              "role": ""
            },
            {
              "tplId": "t4",
              "n": 4,
              "name": "機構訂定 — 結構驗證+設計調整",
              "type": "任務",
              "subgroup": "機構",
              "durationDays": 4,
              "predecessor": "3FS+3",
              "deliverable": "結構驗證報告",
              "role": ""
            },
            {
              "tplId": "t5",
              "n": 5,
              "name": "設計評審 DR（BOM 初期討論）",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 2,
              "predecessor": "4FS+3",
              "deliverable": "評審紀錄／BOM初版",
              "role": ""
            }
          ]
        },
        {
          "stage": "EVT",
          "stageNameCN": "工程驗證",
          "tasks": [
            {
              "tplId": "t6",
              "n": 6,
              "name": "主要零組件到料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 8,
              "predecessor": "5",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t7",
              "n": 7,
              "name": "控制模組樣品到料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 12,
              "predecessor": "5",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t8",
              "n": 8,
              "name": "樣機改機",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 2,
              "predecessor": "6,7",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t9",
              "n": 9,
              "name": "結構板金件打樣",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 8,
              "predecessor": "8",
              "deliverable": "結構板金件",
              "role": ""
            },
            {
              "tplId": "t10",
              "n": 10,
              "name": "EVT 設計評審會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 4,
              "predecessor": "8,9",
              "deliverable": "評審紀錄",
              "role": ""
            },
            {
              "tplId": "t11",
              "n": 11,
              "name": "備料 BOM",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 10,
              "predecessor": "10FS+10",
              "deliverable": "BOM定版",
              "role": ""
            },
            {
              "tplId": "t12",
              "n": 12,
              "name": "性能試驗 — 機種型號內測",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 56,
              "predecessor": "8",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t13",
              "n": 13,
              "name": "性能試驗 — 機種型號內測",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 5,
              "predecessor": "12",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t14",
              "n": 14,
              "name": "EVT 試驗報告彙整",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 5,
              "predecessor": "12,13",
              "deliverable": "彙整報告",
              "role": ""
            },
            {
              "tplId": "t15",
              "n": 15,
              "name": "BOM＋不良事例＋部品認定",
              "type": "任務",
              "subgroup": "報告",
              "durationDays": 6,
              "predecessor": "14",
              "deliverable": "BOM／不良事例／部品認定",
              "role": ""
            },
            {
              "tplId": "t16",
              "n": 16,
              "name": "DVT 移行會前會",
              "type": "任務",
              "subgroup": "會議",
              "durationDays": 2,
              "predecessor": "14,15",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t17",
              "n": 17,
              "name": "DVT 移行會議＋審議簽核",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 3,
              "predecessor": "15,16",
              "deliverable": "移行審議報告",
              "role": ""
            },
            {
              "tplId": "t18",
              "n": 18,
              "name": "軟體協議文件提供",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 8,
              "predecessor": "",
              "deliverable": "軟體協議文件",
              "role": ""
            },
            {
              "tplId": "t20",
              "n": 20,
              "name": "供應商 EMI 測試報告",
              "type": "任務",
              "subgroup": "電性驗證",
              "durationDays": 15,
              "predecessor": "13",
              "deliverable": "EMI報告",
              "role": ""
            },
            {
              "tplId": "t21",
              "n": 21,
              "name": "性能試驗 — 機種型號內測",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 6,
              "predecessor": "12",
              "deliverable": "性能試驗報告",
              "role": ""
            }
          ]
        },
        {
          "stage": "DVT",
          "stageNameCN": "設計驗證",
          "tasks": [
            {
              "tplId": "t22",
              "n": 22,
              "name": "DVT 樣機備料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 43,
              "predecessor": "17",
              "deliverable": "備料清單",
              "role": ""
            },
            {
              "tplId": "t23",
              "n": 23,
              "name": "DVT 樣機組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 5,
              "predecessor": "22",
              "deliverable": "組立完成品",
              "role": ""
            },
            {
              "tplId": "t24",
              "n": 24,
              "name": "DVT 內部評審（設計＋性能數據）",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 2,
              "predecessor": "23",
              "deliverable": "評審紀錄（內部）",
              "role": ""
            },
            {
              "tplId": "t25",
              "n": 25,
              "name": "DVT 全廠評審（含服務）",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 5,
              "predecessor": "24",
              "deliverable": "評審紀錄／BOM表",
              "role": ""
            },
            {
              "tplId": "t26",
              "n": 26,
              "name": "性能試驗（全機型）",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 40,
              "predecessor": "23",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t27",
              "n": 27,
              "name": "溫升試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 15,
              "predecessor": "26",
              "deliverable": "溫升報告",
              "role": ""
            },
            {
              "tplId": "t28",
              "n": 28,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 5,
              "predecessor": "26",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t29",
              "n": 29,
              "name": "安規試驗（耐壓／絕緣／接地）",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 10,
              "predecessor": "26",
              "deliverable": "安規報告",
              "role": ""
            },
            {
              "tplId": "t30",
              "n": 30,
              "name": "EMC／EMI 試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 10,
              "predecessor": "26",
              "deliverable": "EMC／EMI報告",
              "role": ""
            },
            {
              "tplId": "t31",
              "n": 31,
              "name": "實驗室報告彙整",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 4,
              "predecessor": "26,27,28,29,30",
              "deliverable": "實驗室報告（全）",
              "role": ""
            },
            {
              "tplId": "t32",
              "n": 32,
              "name": "PP 移行會議＋審議簽核",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 4,
              "predecessor": "33FS+2",
              "deliverable": "移行審議報告",
              "role": ""
            },
            {
              "tplId": "t33",
              "n": 33,
              "name": "長交期物料備料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 90,
              "predecessor": "17",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t34",
              "n": 34,
              "name": "部品承認送審申請",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 50,
              "predecessor": "33FS+1",
              "deliverable": "部品承認書",
              "role": ""
            }
          ]
        },
        {
          "stage": "Safety",
          "stageNameCN": "安規認證",
          "tasks": [
            {
              "tplId": "t35",
              "n": 35,
              "name": "認證計畫送出",
              "type": "任務",
              "subgroup": "樣機",
              "durationDays": 1,
              "predecessor": "11",
              "deliverable": "認證計畫書",
              "role": ""
            },
            {
              "tplId": "t36",
              "n": 36,
              "name": "認證樣品安排（各規格一組）",
              "type": "任務",
              "subgroup": "送測",
              "durationDays": 8,
              "predecessor": "24FS+3",
              "deliverable": "認證樣品",
              "role": ""
            },
            {
              "tplId": "t37",
              "n": 37,
              "name": "EMI＋安規測試物料",
              "type": "任務",
              "subgroup": "送測",
              "durationDays": 8,
              "predecessor": "36",
              "deliverable": "單體測試物料",
              "role": ""
            },
            {
              "tplId": "t38",
              "n": 38,
              "name": "認證文件資料準備",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 20,
              "predecessor": "37",
              "deliverable": "認證文件",
              "role": ""
            },
            {
              "tplId": "t39",
              "n": 39,
              "name": "法規登錄（提出→取得）",
              "type": "任務",
              "subgroup": "強制認證",
              "durationDays": 20,
              "predecessor": "76",
              "deliverable": "法規登錄證書",
              "role": ""
            },
            {
              "tplId": "t40",
              "n": 40,
              "name": "能效標章（提出→取得）",
              "type": "任務",
              "subgroup": "強制認證",
              "durationDays": 20,
              "predecessor": "39FS+5",
              "deliverable": "能效標章",
              "role": ""
            },
            {
              "tplId": "t41",
              "n": 41,
              "name": "產地標章（提出→廠驗→取得）",
              "type": "任務",
              "subgroup": "強制認證",
              "durationDays": 50,
              "predecessor": "40",
              "deliverable": "產地標章",
              "role": ""
            },
            {
              "tplId": "t42",
              "n": 42,
              "name": "環保標章（提出→取得）",
              "type": "任務",
              "subgroup": "自願認證",
              "durationDays": 60,
              "predecessor": "40FS+15",
              "deliverable": "環保標章",
              "role": ""
            },
            {
              "tplId": "t43",
              "n": 43,
              "name": "節能標章（提出→取得）",
              "type": "任務",
              "subgroup": "自願認證",
              "durationDays": 60,
              "predecessor": "41",
              "deliverable": "節能標章",
              "role": ""
            },
            {
              "tplId": "t75",
              "n": 75,
              "name": "商檢測試",
              "type": "任務",
              "subgroup": "送測",
              "durationDays": 90,
              "predecessor": "36,37",
              "deliverable": "商檢測試數據",
              "role": ""
            },
            {
              "tplId": "t76",
              "n": 76,
              "name": "測試報告",
              "type": "任務",
              "subgroup": "報告",
              "durationDays": 14,
              "predecessor": "75",
              "deliverable": "商檢測試報告",
              "role": ""
            }
          ]
        },
        {
          "stage": "PP",
          "stageNameCN": "試產",
          "tasks": [
            {
              "tplId": "t44",
              "n": 44,
              "name": "PP 備料",
              "type": "里程碑",
              "subgroup": "備料",
              "durationDays": 7,
              "predecessor": "33",
              "deliverable": "齊料里程碑",
              "role": ""
            },
            {
              "tplId": "t45",
              "n": 45,
              "name": "PP 樣機組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 5,
              "predecessor": "44FS+1",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t46",
              "n": 46,
              "name": "PP 設計評審會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 4,
              "predecessor": "45FS+1",
              "deliverable": "評審紀錄",
              "role": ""
            },
            {
              "tplId": "t47",
              "n": 47,
              "name": "性能試驗（全機型）",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 28,
              "predecessor": "46FS+1",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t48",
              "n": 48,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 6,
              "predecessor": "47FS+1",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t49",
              "n": 49,
              "name": "MP 移行會議＋審議簽核",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 9,
              "predecessor": "47,48",
              "deliverable": "移行審議報告",
              "role": ""
            }
          ]
        },
        {
          "stage": "MP",
          "stageNameCN": "量產",
          "tasks": [
            {
              "tplId": "t50",
              "n": 50,
              "name": "MP 備料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 9,
              "predecessor": "33",
              "deliverable": "備料清單",
              "role": ""
            },
            {
              "tplId": "t51",
              "n": 51,
              "name": "MP 組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 8,
              "predecessor": "49,50",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t52",
              "n": 52,
              "name": "性能試驗（全機型）",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 24,
              "predecessor": "51FS+1",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t53",
              "n": 53,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 6,
              "predecessor": "52FS+1",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t54",
              "n": 54,
              "name": "量產放行通知",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 1,
              "predecessor": "52,53",
              "deliverable": "量產放行通知",
              "role": ""
            }
          ]
        }
      ]
    },
    {
      "variant": "另案",
      "stages": [
        "EVT",
        "PP",
        "MP"
      ],
      "modules": [
        {
          "stage": "EVT",
          "stageNameCN": "工程驗證",
          "tasks": [
            {
              "tplId": "t55",
              "n": 55,
              "name": "主要零組件齊料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 10,
              "predecessor": "",
              "deliverable": "齊料確認",
              "role": ""
            },
            {
              "tplId": "t56",
              "n": 56,
              "name": "樣機組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 10,
              "predecessor": "55FS+1",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t57",
              "n": 57,
              "name": "EVT 設計評審會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 3,
              "predecessor": "56FS+1",
              "deliverable": "評審紀錄",
              "role": ""
            },
            {
              "tplId": "t58",
              "n": 58,
              "name": "性能試驗內測",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 25,
              "predecessor": "57FS+1",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t59",
              "n": 59,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 10,
              "predecessor": "58FS+1",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t60",
              "n": 60,
              "name": "安規／EMC 試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 15,
              "predecessor": "58",
              "deliverable": "安規／EMC報告",
              "role": ""
            },
            {
              "tplId": "t61",
              "n": 61,
              "name": "EVT 報告彙整＋BOM",
              "type": "任務",
              "subgroup": "文件",
              "durationDays": 12,
              "predecessor": "58,59,60",
              "deliverable": "彙整報告／BOM",
              "role": ""
            },
            {
              "tplId": "t62",
              "n": 62,
              "name": "PP 移行會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 5,
              "predecessor": "61FS+2",
              "deliverable": "移行審議報告",
              "role": ""
            }
          ]
        },
        {
          "stage": "PP",
          "stageNameCN": "試產",
          "tasks": [
            {
              "tplId": "t63",
              "n": 63,
              "name": "PP 備料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 10,
              "predecessor": "62",
              "deliverable": "備料清單",
              "role": ""
            },
            {
              "tplId": "t64",
              "n": 64,
              "name": "PP 樣機組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 7,
              "predecessor": "63FS+1",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t65",
              "n": 65,
              "name": "PP 設計評審會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 4,
              "predecessor": "64FS+1",
              "deliverable": "評審紀錄",
              "role": ""
            },
            {
              "tplId": "t66",
              "n": 66,
              "name": "性能試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 20,
              "predecessor": "65FS+1",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t67",
              "n": 67,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 7,
              "predecessor": "66FS+1",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t68",
              "n": 68,
              "name": "MP 移行會議",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 5,
              "predecessor": "66,67",
              "deliverable": "移行審議報告",
              "role": ""
            }
          ]
        },
        {
          "stage": "MP",
          "stageNameCN": "量產",
          "tasks": [
            {
              "tplId": "t69",
              "n": 69,
              "name": "MP 備料",
              "type": "任務",
              "subgroup": "備料",
              "durationDays": 10,
              "predecessor": "68FS+1",
              "deliverable": "備料清單",
              "role": ""
            },
            {
              "tplId": "t70",
              "n": 70,
              "name": "物料 IQC 檢驗",
              "type": "任務",
              "subgroup": "IQC",
              "durationDays": 7,
              "predecessor": "69FS+1",
              "deliverable": "IQC報告",
              "role": ""
            },
            {
              "tplId": "t71",
              "n": 71,
              "name": "MP 組立",
              "type": "任務",
              "subgroup": "組立",
              "durationDays": 7,
              "predecessor": "70FS+1",
              "deliverable": "",
              "role": ""
            },
            {
              "tplId": "t72",
              "n": 72,
              "name": "性能試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 20,
              "predecessor": "71FS+1",
              "deliverable": "性能試驗報告",
              "role": ""
            },
            {
              "tplId": "t73",
              "n": 73,
              "name": "噪音試驗",
              "type": "任務",
              "subgroup": "試驗",
              "durationDays": 7,
              "predecessor": "72FS+1",
              "deliverable": "噪音報告",
              "role": ""
            },
            {
              "tplId": "t74",
              "n": 74,
              "name": "量產放行通知",
              "type": "里程碑",
              "subgroup": "會議",
              "durationDays": 1,
              "predecessor": "72,73",
              "deliverable": "量產放行通知",
              "role": ""
            }
          ]
        }
      ]
    }
  ],
  "_note": "範本骨架。套用時：tplId 系統重產、predecessor 序號 translate 成新 id、角色對應實際負責人、各案別各自填開始/結束日與排程方向。"
}
;
