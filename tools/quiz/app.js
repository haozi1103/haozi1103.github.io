/* =====================================
   Quiz Learning System v1.0 — Core Engine
   ===================================== */

const QuizEngine = (() => {
  'use strict';

  // =====================================
  // 配置
  // =====================================
  const STORAGE_PREFIX = 'quiz_';
  const HEATMAP_KEY = STORAGE_PREFIX + 'heatmap';
  const WRONG_PREFIX = STORAGE_PREFIX + 'wrong_';
  const CUSTOM_PREFIX = STORAGE_PREFIX + 'custom_';
  const CUSTOM_INDEX = STORAGE_PREFIX + 'custom_index';
  const RECORD_PREFIX = STORAGE_PREFIX + 'record_';

  // =====================================
  // 题库管理
  // =====================================
  const LIBRARIES = {};  // { libName: [questions] }

  async function loadLibrary(libName) {
    // 已缓存
    if (LIBRARIES[libName]) return LIBRARIES[libName];

    // 1) 先查自定义题库（localStorage）
    const custom = loadCustomLibrary(libName);
    if (custom) {
      LIBRARIES[libName] = custom;
      return custom;
    }

    // 2) 再查静态 JSON
    try {
      const resp = await fetch(`data/${libName}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      LIBRARIES[libName] = data;
      return data;
    } catch (err) {
      console.error(`[QuizEngine] Failed to load library "${libName}":`, err);
      return null;
    }
  }

  function getLibrary(libName) {
    return LIBRARIES[libName] || null;
  }

  // =====================================
  // 预置题库列表
  // =====================================
  function getBuiltinLibraries() {
    return [
      { id: 'math', title: '数学', desc: '高等数学基础题', color: '#58a6ff', builtin: true },
      { id: 'cnc', title: '数控技术', desc: '数控编程与操作', color: '#3fb950', builtin: true },
      { id: 'mech', title: '机械设计', desc: '机械原理与设计', color: '#d29922', builtin: true }
    ];
  }

  // =====================================
  // 自定义题库（localStorage 持久化）
  // =====================================

  /** 标准化题目：字母答案 → 数字索引 */
  function normalizeQuestion(q) {
    const opt = q.options || [];
    let ans = q.answer;

    // 字母答案 → 数字
    if (typeof ans === 'string' && /^[A-F]$/i.test(ans)) {
      const letters = 'ABCDEF';
      ans = letters.indexOf(ans.toUpperCase());
    }
    // 数字字符串 → 数字
    if (typeof ans === 'string' && /^\d+$/.test(ans)) {
      ans = parseInt(ans, 10);
    }
    // 越界保护
    if (typeof ans !== 'number' || ans < 0 || ans >= opt.length) {
      ans = 0;
    }

    return {
      id: q.id,
      question: q.question,
      options: opt,
      answer: ans
    };
  }
  function getCustomIndex() {
    try {
      const raw = localStorage.getItem(CUSTOM_INDEX);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCustomIndex(list) {
    localStorage.setItem(CUSTOM_INDEX, JSON.stringify(list));
  }

  function getCustomKey(name) { return CUSTOM_PREFIX + name; }

  function saveCustomLibrary(name, questions) {
    // 标准化题目
    const normalized = questions.map(normalizeQuestion);
    // 生成唯一 id
    const id = 'custom_' + Date.now();
    const meta = { id, name, createdAt: new Date().toISOString(), count: normalized.length };

    // 存题目
    localStorage.setItem(getCustomKey(id), JSON.stringify(normalized));

    // 更新索引
    const index = getCustomIndex();
    // 如果同名覆盖
    const existing = index.findIndex(item => item.name === name);
    if (existing >= 0) {
      localStorage.removeItem(getCustomKey(index[existing].id));
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    saveCustomIndex(index);

    // 清除缓存，下次 loadLibrary 会重新读取
    delete LIBRARIES[id];
    return id;
  }

  function loadCustomLibrary(id) {
    try {
      const raw = localStorage.getItem(getCustomKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function deleteCustomLibrary(id) {
    localStorage.removeItem(getCustomKey(id));
    const index = getCustomIndex().filter(item => item.id !== id);
    saveCustomIndex(index);
    delete LIBRARIES[id];
  }

  function getCustomLibraryList() {
    return getCustomIndex().map(item => ({
      id: item.id,
      title: item.name,
      desc: `自定义题库 · ${item.count} 题`,
      color: '#d29922',
      builtin: false,
      custom: true
    }));
  }

  // 合并的题库列表（预置 + 自定义）
  function getLibraryList() {
    return [...getBuiltinLibraries(), ...getCustomLibraryList()];
  }

  // =====================================
  // 错题系统
  // =====================================
  function getWrongKey(libName) { return WRONG_PREFIX + libName; }

  function getWrongQuestions(libName) {
    try {
      const raw = localStorage.getItem(getWrongKey(libName));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function addWrongQuestion(libName, question) {
    const wrong = getWrongQuestions(libName);
    // 去重
    if (!wrong.some(q => q.id === question.id)) {
      wrong.push(question);
      localStorage.setItem(getWrongKey(libName), JSON.stringify(wrong));
    }
  }

  function removeWrongQuestion(libName, questionId) {
    let wrong = getWrongQuestions(libName);
    wrong = wrong.filter(q => q.id !== questionId);
    localStorage.setItem(getWrongKey(libName), JSON.stringify(wrong));
  }

  function clearWrongQuestions(libName) {
    localStorage.removeItem(getWrongKey(libName));
  }

  function getTotalWrongCount() {
    let count = 0;
    for (const lib of getLibraryList()) {
      count += getWrongQuestions(lib.id).length;
    }
    return count;
  }

  // =====================================
  // 热力图系统
  // =====================================
  function getHeatmapData() {
    try {
      const raw = localStorage.getItem(HEATMAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function recordStudy(libName) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const heatmap = getHeatmapData();
    if (!heatmap[today]) heatmap[today] = {};
    if (!heatmap[today][libName]) heatmap[today][libName] = 0;
    heatmap[today][libName]++;
    // Also record a global count
    if (!heatmap[today]['_total']) heatmap[today]['_total'] = 0;
    heatmap[today]['_total']++;
    localStorage.setItem(HEATMAP_KEY, JSON.stringify(heatmap));
  }

  function getHeatmapForLib(libName) {
    const heatmap = getHeatmapData();
    const result = {};
    for (const [date, libs] of Object.entries(heatmap)) {
      if (libName && libs[libName]) {
        result[date] = libs[libName];
      } else if (!libName && libs._total) {
        result[date] = libs._total;
      }
    }
    return result;
  }

  /**
   * 生成 GitHub 风格热力图数据
   * 返回 7 行 × N 列的数组
   */
  function buildHeatmapGrid(libName, weeks = 26) {
    const data = getHeatmapForLib(libName);
    const today = new Date();
    const grid = [];
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    // 计算起始日期（weeks * 7 天前）
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - weeks * 7 + 1);
    // 调整到周日
    const startDay = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDay);

    // 生成月份标签
    const monthLabels = [];
    let currentMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + w * 7 + 3); // 中间一天
      const month = d.getMonth();
      if (month !== currentMonth) {
        monthLabels.push({
          week: w, label: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]
        });
        currentMonth = month;
      }
    }

    // 构建网格 (7 rows × weeks cols)
    for (let row = 0; row < 7; row++) {
      const rowData = [];
      for (let col = 0; col < weeks; col++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + col * 7 + row);
        const key = date.toISOString().split('T')[0];
        const count = data[key] || 0;
        rowData.push({ date: key, count, level: getHeatmapLevel(count) });
      }
      grid.push(rowData);
    }

    return { grid, monthLabels, dayLabels };
  }

  function getHeatmapLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  }

  // =====================================
  // 统计系统
  // =====================================
  function computeStats(libName) {
    const lib = getLibrary(libName);
    const wrong = getWrongQuestions(libName);
    const totalQuestions = lib ? lib.length : 0;
    const wrongCount = wrong.length;
    const correctCount = totalQuestions - wrongCount;
    const accuracy = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    // 连续学习天数 (基于全局热力图)
    const heatmap = getHeatmapData();
    const dates = Object.keys(heatmap).sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date(today);
    for (const dateStr of dates) {
      const d = new Date(dateStr + 'T00:00:00');
      if (d.toISOString().split('T')[0] === checkDate.toISOString().split('T')[0]) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    return { totalQuestions, wrongCount, correctCount, accuracy, streak };
  }

  // =====================================
  // 题目队列
  // =====================================
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // =====================================
  // 题库信息
  // =====================================
  function getLibraryInfo(libName) {
    const list = getLibraryList();
    return list.find(l => l.id === libName) || { id: libName, title: libName, desc: '', color: '#0969da' };
  }

  // =====================================
  // 题目作答记录 (per-question tracking)
  // =====================================
  function getRecordKey(libName) { return RECORD_PREFIX + libName; }

  /** 获取某题库的作答记录: { qId: { correct: bool, selected: number, answered: true } } */
  function getQuestionRecord(libName) {
    try {
      const raw = localStorage.getItem(getRecordKey(libName));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  /** 记录某题作答结果 */
  function setQuestionRecord(libName, qId, correct, selected) {
    const records = getQuestionRecord(libName);
    records[qId] = { correct, selected, answered: true };
    localStorage.setItem(getRecordKey(libName), JSON.stringify(records));
  }

  /** 清除某题库的所有作答记录 */
  function clearQuestionRecord(libName) {
    localStorage.removeItem(getRecordKey(libName));
  }

  /** 获取某题库的作答统计 */
  function getRecordStats(libName) {
    const records = getQuestionRecord(libName);
    let correct = 0, wrong = 0;
    for (const qId in records) {
      if (records[qId].answered) {
        if (records[qId].correct) correct++;
        else wrong++;
      }
    }
    return { correct, wrong, total: correct + wrong };
  }

  // =====================================
  // 公开 API
  // =====================================
  return {
    loadLibrary,
    getLibrary,
    getLibraryList,
    getLibraryInfo,
    getBuiltinLibraries,

    // 自定义题库
    saveCustomLibrary,
    deleteCustomLibrary,
    getCustomLibraryList,

    // 错题
    getWrongQuestions,
    addWrongQuestion,
    removeWrongQuestion,
    clearWrongQuestions,
    getTotalWrongCount,

    // 热力图
    recordStudy,
    getHeatmapData,
    getHeatmapForLib,
    buildHeatmapGrid,
    getHeatmapLevel,

    // 统计
    computeStats,

    // 题目记录
    getQuestionRecord,
    setQuestionRecord,
    clearQuestionRecord,
    getRecordStats,

    // 工具
    shuffleArray,
    normalizeQuestion,
  };
})();
