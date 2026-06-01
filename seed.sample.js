// seed.sample.js — 範例種子資料（會進 git，全假值模板）。
// SEED_SAMPLE：結構/欄位/陣列形狀與 seed.local.js 的 SEED_LOCAL 完全平行，內容全為虛構範例，無任何真實個資。
// 真值請放 seed.local.js（不進 git）。app.js 透過 SEED() 讀取（SEED_LOCAL 優先，否則 SEED_SAMPLE）。
var SEED_SAMPLE = {
  recurringMeetings: [
    { id: 'rm_1', category: 'meeting', frequency: 'weekly', day: 2, start: '07:50', end: '10:00', title: '範例週會一', startDate: '', endDate: '', enabled: true },
    { id: 'rm_2', category: 'meeting', frequency: 'weekly', day: 2, start: '13:00', end: '14:00', title: '範例週會二', startDate: '', endDate: '', enabled: true },
    { id: 'rm_3', category: 'meeting', frequency: 'weekly', day: 3, start: '09:00', end: '10:00', title: '範例專案A週會', startDate: '', endDate: '', enabled: true },
    { id: 'rm_4', category: 'cleaning', frequency: 'biweekly-allday', start: '07:50', end: '08:20', title: '定期打掃（早）', startDate: '2020-01-06', endDate: '', enabled: true },
    { id: 'rm_5', category: 'cleaning', frequency: 'biweekly', day: 5, start: '16:30', end: '17:00', title: '定期打掃（晚）', startDate: '2020-01-06', endDate: '', enabled: true },
  ],
  cleaningDefaults: [
    { id: 'rm_cl_1', category: 'cleaning', frequency: 'biweekly-allday', start: '07:50', end: '08:20', title: '定期打掃（早）', startDate: '2020-01-06', endDate: '', enabled: true },
    { id: 'rm_cl_2', category: 'cleaning', frequency: 'biweekly', day: 5, start: '16:30', end: '17:00', title: '定期打掃（晚）', startDate: '2020-01-06', endDate: '', enabled: true }
  ],
  INIT: {
    '範例專案A': {
      startDate: '2020-01-01', targetDate: '2021-06-30',
      summary: '（範例摘要）專案A多流程並行中，部分項目待外部確認。',
      groups: {
        '範例工項A1': { level: 'high', owner: '王小明、陳大華', recoveryMethod: '（範例）待對方提供資料後處理' },
        '範例工項A2': { level: 'high', owner: '陳大華', recoveryMethod: '（範例）內部討論後召開檢討會' },
        '範例工項A3': { level: 'high', owner: '李美麗、王小明', recoveryMethod: '（範例）提供圖檔後一週內完成報價' },
        '範例工項A4': { level: 'high', owner: '李美麗', recoveryMethod: '（範例）完成開模後上線' },
      },
    },
    '範例專案B': {
      startDate: '2020-02-01', targetDate: '2020-09-01',
      summary: '（範例摘要）專案B模具完成，規格資料跟催中，預計如期上市。',
      groups: {
        '範例工項B1': { level: 'high', owner: '張志強、林淑芬', recoveryMethod: '（範例）跟催廠商提供規格書' },
        '範例工項B2': { level: 'low', owner: '黃建宏', recoveryMethod: '（範例）模具已修復完畢' },
        '範例工項B3': { level: 'med', owner: '吳雅婷', recoveryMethod: '' },
        '範例工項B4': { level: 'low', owner: '王小明', recoveryMethod: '（範例）按排程執行' },
      },
    },
    '範例專案C': {
      startDate: '', targetDate: '',
      summary: '（範例摘要）專案C量試備料中，整體時程待補。',
      groups: {
        '範例工項C1': { level: 'med', owner: '陳大華', recoveryMethod: '（範例）備料完成', recoveryDate: '2020-05-30' },
        '範例工項C2': { level: 'med', owner: '陳大華', recoveryMethod: '（範例）規格修正' },
      },
    },
    '範例專案D': {
      startDate: '', targetDate: '',
      summary: '（範例摘要）專案D等待外部廠商提供樣品與軟體。',
      groups: {
        '範例工項D1': { level: 'high', owner: '李美麗、外部廠商', recoveryMethod: '（範例）對方未如期提供，再次跟催', recoveryDate: '2020-06-02' },
        '範例工項D2': { level: 'med', owner: '外部廠商', recoveryMethod: '（範例）提供測試樣品給客戶' },
      },
    },
    '範例專案E': {
      startDate: '', targetDate: '2020-04-30',
      summary: '（範例摘要）專案E技術文件持續更新，認證需求文件陸續補齊。',
      groups: {
        '範例工項E1': { level: 'med', owner: '張志強、林淑芬', recoveryMethod: '（範例）技術手冊依進度更新' },
        '範例工項E2': { level: 'med', owner: '林淑芬、黃建宏', recoveryMethod: '（範例）完成認證需求文件', recoveryDate: '2020-04-30' },
      },
    },
    '範例專案F': {
      startDate: '', targetDate: '',
      summary: '（範例摘要）專案F規格整併立案，預計完成變更通知書。',
      groups: {
        '範例工項F1': { level: 'med', owner: '吳雅婷、王小明', recoveryMethod: '（範例）目標期限內完成變更通知書', recoveryDate: '2020-05-29' },
        '範例工項F2': { level: 'med', owner: '吳雅婷', recoveryMethod: '（範例）區段執行回覽' },
        '範例工項F3': { level: 'low', owner: '吳雅婷', recoveryMethod: '（範例）未完成項目持續收集檢討', recoveryDate: '2020-09-30' },
      },
    },
  },
  KEYWORDS: {
    '範例專案A': [
      ['範例工項A1', ['範例詞1', '範例詞2', '範例詞3']],
      ['範例工項A2', ['範例詞1', '範例詞2', '範例詞3', '範例詞4', '範例詞5', '範例詞6', '範例詞7', '範例詞8']],
      ['範例工項A3', ['範例詞1', '範例詞2', '範例詞3', '範例詞4', '範例詞5', '範例詞6', '範例詞7', '範例詞8', '範例詞9']],
      ['範例工項A4', ['範例詞1', '範例詞2', '範例詞3', '範例詞4']],
    ],
    '範例專案B': [
      ['範例工項B1', ['範例詞1', '範例詞2']],
      ['範例工項B2', ['範例詞1', '範例詞2', '範例詞3', '範例詞4', '範例詞5', '範例詞6', '範例詞7']],
      ['範例工項B3', ['範例詞1', '範例詞2', '範例詞3']],
      ['範例工項B4', ['範例詞1', '範例詞2']],
    ],
    '範例專案C': [
      ['範例工項C1', ['範例詞1', '範例詞2', '範例詞3', '範例詞4', '範例詞5', '範例詞6']],
      ['範例工項C2', ['範例詞1', '範例詞2', '範例詞3', '範例詞4', '範例詞5', '範例詞6', '範例詞7']],
    ],
    '範例專案D': [
      ['範例工項D1', ['範例詞1', '範例詞2', '範例詞3', '範例詞4']],
      ['範例工項D2', ['範例詞1', '範例詞2']],
    ],
    '範例專案E': [
      ['範例工項E1', ['範例詞1', '範例詞2', '範例詞3']],
      ['範例工項E2', ['範例詞1', '範例詞2']],
    ],
    // 範例專案F：task 數 0，無歸類表
  },
  projAliases: [
    { includes: ['專案A'], name: '範例專案A' },
    { includes: ['專案D'], name: '範例專案D' },
    { includes: ['專案B', '範例B'], name: '範例專案B' },
    { includes: ['專案C', '範例C', 'C型'], name: '範例專案C' },
    { includes: ['專案E'], name: '範例專案E' },
    { includes: ['專案G', 'G2'], name: '範例專案G' },
  ],
  projColors: [
    { includes: ['專案A'], color: '#4A7C5C' },
    { includes: ['專案D'], color: '#C4633E' },
    { includes: ['專案B'], color: '#5C7A8B' },
    { includes: ['專案C'], color: '#8B5E73' },
    { includes: ['專案E'], color: '#C4956C' },
    { includes: ['專案G'], color: '#B8504D' },
  ],
  projMerges: [
    { keep: '範例專案B', drop: '範例專案B-舊' },
    { keep: '範例專案C', drop: '範例專案C-舊' },
  ],
  projDeletes: [
    { name: '範例專案G' },
  ],
  projEnsure: [
    { name: '範例專案F', colorPool: ['#5DCAA5', '#7F77DD', '#E0729B', '#54A0C7', '#C99A3C'] },
  ],
};
