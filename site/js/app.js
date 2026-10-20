/* =====================================================================
   NoteHub — 应用逻辑
   笔记的增删改查 / 搜索 / 标签筛选 / localStorage 持久化 / 视图切换
   ===================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'notehub.notes.v1';
  var PREF_KEY = 'notehub.pref.v1';
  var SEED_KEY = 'notehub.seeds.v1';
  var SYNC_KEY = 'notehub.sync.v1';
  var TOMB_KEY = 'notehub.tomb.v1';

  /* 正文文字样式：每条笔记独立保存 */
  var DEFAULT_FONT_SIZE = 13.5;
  var DEFAULT_FONT_COLOR = '#d4d4d4';
  var FONT_MIN = 11;
  var FONT_MAX = 30;
  var PRESET_COLORS = ['#d4d4d4', '#ffffff', '#9cdcfe', '#ce9178', '#6a9955', '#c586c0', '#dcdcaa', '#f14c4c'];

  /* ---------------- 工具 ---------------- */

  function esc(s) { return window.NoteHighlight.escapeHtml(s == null ? '' : s); }

  function uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtFull(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtShort(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function debounce(fn, wait) {
    var t = null;
    var wrapped = function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait);
    };
    wrapped.flush = function () {
      if (t) { clearTimeout(t); t = null; fn.call(null); }
    };
    wrapped.cancel = function () {
      if (t) { clearTimeout(t); t = null; }
    };
    return wrapped;
  }

  /* ---------------- 元素 ---------------- */

  var els = {
    sidebar: document.getElementById('sidebar'),
    sidebarClose: document.getElementById('sidebarClose'),
    menuBtn: document.getElementById('menuBtn'),
    overlay: document.getElementById('overlay'),

    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    newNoteBtn: document.getElementById('newNoteBtn'),
    newNoteBtnTop: document.getElementById('newNoteBtnTop'),
    emptyNewBtn: document.getElementById('emptyNewBtn'),
    tagFilter: document.getElementById('tagFilter'),
    clearFilterBtn: document.getElementById('clearFilterBtn'),
    noteList: document.getElementById('noteList'),
    noteCount: document.getElementById('noteCount'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    topbarTitle: document.getElementById('topbarTitle'),
    editor: document.getElementById('editor'),
    emptyState: document.getElementById('emptyState'),
    emptyTitle: document.getElementById('emptyTitle'),
    emptyDesc: document.getElementById('emptyDesc'),

    titleInput: document.getElementById('titleInput'),
    metaInfo: document.getElementById('metaInfo'),
    modeSwitch: document.getElementById('modeSwitch'),
    deleteBtn: document.getElementById('deleteBtn'),
    tagChips: document.getElementById('tagChips'),
    tagInput: document.getElementById('tagInput'),
    panes: document.getElementById('panes'),
    contentInput: document.getElementById('contentInput'),
    previewPane: document.getElementById('previewPane'),
    toast: document.getElementById('toast'),

    syncBar: document.getElementById('syncBar'),
    syncStatusBtn: document.getElementById('syncStatusBtn'),
    syncDot: document.getElementById('syncDot'),
    syncText: document.getElementById('syncText'),
    syncSettingsBtn: document.getElementById('syncSettingsBtn'),

    syncModal: document.getElementById('syncModal'),
    syncModalClose: document.getElementById('syncModalClose'),
    syncServerInput: document.getElementById('syncServerInput'),
    syncKeyInput: document.getElementById('syncKeyInput'),
    syncModalMsg: document.getElementById('syncModalMsg'),
    syncSaveBtn: document.getElementById('syncSaveBtn'),
    syncCancelBtn: document.getElementById('syncCancelBtn'),
    syncDisconnectBtn: document.getElementById('syncDisconnectBtn'),

    aiPolishBtn: document.getElementById('aiPolishBtn'),
    aiModal: document.getElementById('aiModal'),
    aiModalClose: document.getElementById('aiModalClose'),
    aiActions: document.getElementById('aiActions'),
    aiResult: document.getElementById('aiResult'),
    aiResultMeta: document.getElementById('aiResultMeta'),
    aiResultBody: document.getElementById('aiResultBody'),
    aiMsg: document.getElementById('aiMsg'),
    aiConfigBox: document.getElementById('aiConfigBox'),
    aiBaseUrlInput: document.getElementById('aiBaseUrlInput'),
    aiModelInput: document.getElementById('aiModelInput'),
    aiKeyInput: document.getElementById('aiKeyInput'),
    aiConfigSaveBtn: document.getElementById('aiConfigSaveBtn'),
    aiCancelBtn: document.getElementById('aiCancelBtn'),
    aiApplyBtn: document.getElementById('aiApplyBtn'),

    fontSizeRange: document.getElementById('fontSizeRange'),
    fontSizeVal: document.getElementById('fontSizeVal'),
    fontMinus: document.getElementById('fontMinus'),
    fontPlus: document.getElementById('fontPlus'),
    styleBar: document.getElementById('styleBar'),
    styleColors: document.getElementById('styleColors'),
    fontColorPicker: document.getElementById('fontColorPicker'),
    styleResetBtn: document.getElementById('styleResetBtn'),
    styleToggle: document.getElementById('styleToggle'),
    saveBtn: document.getElementById('saveBtn')
  };

  /* ---------------- 状态 ---------------- */

  var state = {
    notes: [],
    activeId: null,
    query: '',
    tag: null,
    mode: 'split',
    styleCollapsed: false
  };

  /* 编辑区当前渲染的笔记 id（避免重复重建 DOM、打断输入） */
  var editorNoteId = null;

  /* ---------------- 存储 ---------------- */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { window.localStorage.setItem(key, val); return true; }
    catch (e) { toast('本地存储不可用，改动不会被保存'); return false; }
  }

  function load() {
    var raw = safeGet(STORE_KEY);
    var list = [];
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) { list = []; }
    }
    state.notes = list.map(normalize).filter(Boolean);

    try {
      var pref = JSON.parse(safeGet(PREF_KEY) || '{}');
      if (pref && (pref.mode === 'edit' || pref.mode === 'split' || pref.mode === 'preview')) {
        state.mode = pref.mode;
      }
      if (pref && pref.styleCollapsed === true) state.styleCollapsed = true;
    } catch (e) { /* 忽略 */ }
  }

  function normalize(n) {
    if (!n || typeof n !== 'object') return null;
    var now = Date.now();
    return {
      id: typeof n.id === 'string' && n.id ? n.id : uid(),
      title: typeof n.title === 'string' ? n.title : '',
      content: typeof n.content === 'string' ? n.content : '',
      tags: Array.isArray(n.tags) ? n.tags.filter(function (t) { return typeof t === 'string' && t; }) : [],
      createdAt: typeof n.createdAt === 'number' ? n.createdAt : now,
      updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : now
    };
  }

  function persist() {
    safeSet(STORE_KEY, JSON.stringify(state.notes));
    /* 本地有改动就排队推送；同步过程中写入的远端数据不再触发回推 */
    if (!syncing.applyingRemote) syncSoon();
  }

  /* ---------------- 查询 ---------------- */

  function activeNote() {
    for (var i = 0; i < state.notes.length; i++) {
      if (state.notes[i].id === state.activeId) return state.notes[i];
    }
    return null;
  }

  function sortedNotes() {
    return state.notes.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function filteredNotes() {
    var q = state.query.trim().toLowerCase();
    return sortedNotes().filter(function (n) {
      if (state.tag && n.tags.indexOf(state.tag) === -1) return false;
      if (!q) return true;
      return n.title.toLowerCase().indexOf(q) !== -1 ||
             n.content.toLowerCase().indexOf(q) !== -1 ||
             n.tags.join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function collectTags() {
    var map = Object.create(null);
    state.notes.forEach(function (n) {
      n.tags.forEach(function (t) { map[t] = (map[t] || 0) + 1; });
    });
    return Object.keys(map).map(function (t) { return { name: t, count: map[t] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'zh'); });
  }

  /* ---------------- 渲染：侧边栏 ---------------- */

  function renderList() {
    var list = filteredNotes();
    var scrollTop = els.noteList.scrollTop;

    if (!list.length) {
      els.noteList.innerHTML = '<div class="list-empty">' +
        (state.notes.length ? '没有匹配的笔记<br>试试换个关键词或清除筛选' : '还没有笔记<br>点击「新建笔记」开始记录') +
        '</div>';
    } else {
      var html = '';
      list.forEach(function (n) {
        var snippet = window.NoteMarkdown.toPlainText(n.content).slice(0, 120) || '（空笔记）';
        var tags = n.tags.slice(0, 3).map(function (t) {
          return '<span class="mini-tag">#' + esc(t) + '</span>';
        }).join('');
        html += '<article class="note-item' + (n.id === state.activeId ? ' active' : '') +
          '" data-id="' + esc(n.id) + '">' +
            '<div class="note-item-title">' + esc(n.title || '无标题笔记') + '</div>' +
            '<div class="note-item-snippet">' + esc(snippet) + '</div>' +
            '<div class="note-item-foot">' +
              '<span class="note-item-time">' + fmtShort(n.updatedAt) + '</span>' +
              '<span class="note-item-tags">' + tags + '</span>' +
              '<button class="note-item-del" type="button" data-del="' + esc(n.id) + '" title="删除笔记" aria-label="删除笔记">✕</button>' +
            '</div>' +
          '</article>';
      });
      els.noteList.innerHTML = html;
    }

    els.noteList.scrollTop = scrollTop;
    els.noteCount.textContent = state.notes.length + ' 条笔记' +
      (list.length !== state.notes.length ? '（筛选出 ' + list.length + ' 条）' : '');
  }

  function renderTagFilter() {
    var tags = collectTags();
    state.tag = state.tag && tags.some(function (t) { return t.name === state.tag; }) ? state.tag : null;
    els.clearFilterBtn.hidden = !state.tag;

    if (!tags.length) {
      els.tagFilter.innerHTML = '<span class="tag-empty">暂无标签</span>';
      return;
    }
    var html = '';
    tags.forEach(function (t) {
      html += '<button class="tag-pill' + (t.name === state.tag ? ' active' : '') +
        '" type="button" data-tag="' + esc(t.name) + '">' +
        '<span class="tag-name">#' + esc(t.name) + '</span>' +
        '<span class="tag-count">' + t.count + '</span>' +
        '</button>';
    });
    els.tagFilter.innerHTML = html;
  }

  /* ---------------- 渲染：主区域 ---------------- */

  function renderEditor() {
    var n = activeNote();

    if (!n) {
      els.editor.hidden = true;
      els.emptyState.hidden = false;
      editorNoteId = null;
      var hasNotes = state.notes.length > 0;
      els.emptyTitle.textContent = hasNotes ? '选择一条笔记' : '还没有笔记';
      els.emptyDesc.textContent = hasNotes
        ? '从左侧列表里选择一条笔记，或者新建一条。'
        : '点击「新建笔记」开始你的第一条 Markdown 记录。';
      els.topbarTitle.textContent = '我的笔记';
      return;
    }

    els.editor.hidden = false;
    els.emptyState.hidden = true;

    if (els.titleInput.value !== n.title) els.titleInput.value = n.title;
    /* 仅在切换笔记、或外部改动且未在编辑时重建，避免打断输入 */
    var rendered = currentContent();
    if (editorNoteId !== n.id || (rendered !== n.content && document.activeElement !== els.contentInput)) {
      els.contentInput.innerHTML = mdToEditableHtml(n.content);
      editorNoteId = n.id;
      savedRange = null;
    }

    els.topbarTitle.textContent = n.title || '无标题笔记';
    renderTagChips();
    renderPreview();
    renderMeta();
    applyMode();
    updateStyleState();
  }

  function renderMeta() {
    var n = activeNote();
    if (!n) return;
    var chars = n.content.length;
    var lines = n.content ? n.content.split('\n').length : 0;
    els.metaInfo.textContent = '更新于 ' + fmtFull(n.updatedAt) + ' · ' + chars + ' 字符 · ' + lines + ' 行';
  }

  function renderPreview() {
    var n = activeNote();
    if (!n) { els.previewPane.innerHTML = ''; return; }
    els.previewPane.innerHTML = window.NoteMarkdown.render(n.content);
  }

  function renderTagChips() {
    var n = activeNote();
    if (!n) { els.tagChips.innerHTML = ''; return; }
    els.tagChips.innerHTML = n.tags.map(function (t) {
      return '<span class="tag-pill">#' + esc(t) +
        '<button type="button" data-untag="' + esc(t) + '" aria-label="移除标签">✕</button></span>';
    }).join('');
  }

  /* 窄屏判定：与 styles.css 的移动端断点保持一致（窄视口或横屏矮视口） */
  var NARROW_MQ = '(max-width: 820px), (max-height: 480px)';
  var mqNarrow = window.matchMedia ? window.matchMedia(NARROW_MQ) : null;

  function isNarrow() { return !!(mqNarrow && mqNarrow.matches); }

  function applyMode() {
    els.panes.className = 'panes mode-' + state.mode;
    /* 窄屏没有分屏视图，高亮映射到「编辑」，避免整组按钮都无选中态 */
    var shown = (isNarrow() && state.mode === 'split') ? 'edit' : state.mode;
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === shown);
    });
  }

  function renderAll() {
    renderList();
    renderTagFilter();
    renderEditor();
  }

  /* 样式栏收起 / 展开（状态记在本地偏好里，刷新后保持） */
  function applyStyleCollapsed() {
    els.styleBar.classList.toggle('collapsed', state.styleCollapsed);
    els.styleToggle.setAttribute('aria-expanded', state.styleCollapsed ? 'false' : 'true');
    els.styleToggle.title = state.styleCollapsed ? '展开样式栏' : '收起样式栏';
  }

  function toggleStyleBar() {
    state.styleCollapsed = !state.styleCollapsed;
    applyStyleCollapsed();
    persistPref();
  }

  /* ---------------- 保存 ---------------- */

  function persistPref() {
    safeSet(PREF_KEY, JSON.stringify({ mode: state.mode, styleCollapsed: state.styleCollapsed }));
  }

  function saveNow() {
    var n = activeNote();
    if (!n) return;
    var title = els.titleInput.value;
    var content = currentContent();
    if (n.title === title && n.content === content) { renderMeta(); return; }
    n.title = title;
    n.content = content;
    n.updatedAt = Date.now();
    persist();
    renderList();
    renderTagFilter();
    renderMeta();
    els.topbarTitle.textContent = n.title || '无标题笔记';
  }

  var saveSoon = debounce(saveNow, 450);
  var previewSoon = debounce(renderPreview, 160);

  /* ================= 云同步（GitHub 私有 Gist） =================
     远端文档：{ version, updatedAt, notes: [...], tombstones: [...] }
     合并规则：按 note.id 合并，updatedAt 大者胜；墓碑 deletedAt >= note.updatedAt
     则丢弃该笔记（删除不会被其它设备复活）。离线时纯本地写，联网后自动合并，
     任何失败都静默降级为本地模式，不影响记录。 */

  var SYNC_PATH = '/api/sync';
  var TOMB_TTL = 90 * 24 * 3600 * 1000;   /* 墓碑保留 90 天 */
  var PUSH_DELAY = 1500;                  /* 改动后延迟推送，避免频繁请求 */
  var PULL_STALE = 60 * 1000;             /* 回到前台时的拉取节流 */

  var sync = {
    server: '',    /* 服务器地址，留空表示用当前站点（同源） */
    key: '',       /* 同步密钥 */
    lastSync: 0,
    status: 'unconfigured',
    message: ''
  };
  var tombstones = [];
  var syncing = { busy: false, applyingRemote: false, lastPullTry: 0 };

  /* AI 润色：请求经本机服务中转，API Key 不落到浏览器 */
  var ai = { action: 'polish', result: '', busy: false, configured: false };

  var SYNC_LABEL = {
    unconfigured: '未开启云同步',
    syncing: '同步中…',
    ok: '已同步',
    error: '同步失败',
    offline: '离线，未联网'
  };

  function loadSyncConfig() {
    try {
      var c = JSON.parse(safeGet(SYNC_KEY) || '{}');
      if (c && typeof c === 'object') {
        if (typeof c.key === 'string') sync.key = c.key;
        if (typeof c.server === 'string') sync.server = c.server;
        if (typeof c.lastSync === 'number') sync.lastSync = c.lastSync;
      }
    } catch (e) { /* 忽略 */ }

    try {
      var t = JSON.parse(safeGet(TOMB_KEY) || '[]');
      if (Array.isArray(t)) {
        tombstones = t.filter(function (x) {
          return x && typeof x.id === 'string' && x.id && typeof x.deletedAt === 'number';
        });
      }
    } catch (e) { tombstones = []; }
  }

  function saveSyncConfig() {
    safeSet(SYNC_KEY, JSON.stringify({
      server: sync.server,
      key: sync.key,
      lastSync: sync.lastSync
    }));
  }

  function saveTombstones() {
    safeSet(TOMB_KEY, JSON.stringify(tombstones));
  }

  function addTombstones(ids) {
    if (!ids.length) return;
    var now = Date.now();
    var map = Object.create(null);
    tombstones.forEach(function (t) { map[t.id] = t; });
    ids.forEach(function (id) { map[id] = { id: id, deletedAt: now }; });
    var cutoff = now - TOMB_TTL;
    tombstones = Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (t) { return t.deletedAt >= cutoff; });
    saveTombstones();
  }

  /* ---------- 合并 ---------- */

  function applyRemote(remote) {
    var before = JSON.stringify(state.notes) + '|' + JSON.stringify(tombstones);

    var byId = Object.create(null);
    state.notes.forEach(function (n) { byId[n.id] = n; });

    var tb = Object.create(null);
    tombstones.forEach(function (t) { tb[t.id] = t; });
    (remote.tombstones || []).forEach(function (t) {
      if (!t || typeof t.id !== 'string' || !t.id || typeof t.deletedAt !== 'number') return;
      if (!tb[t.id] || tb[t.id].deletedAt < t.deletedAt) {
        tb[t.id] = { id: t.id, deletedAt: t.deletedAt };
      }
    });

    (remote.notes || []).forEach(function (raw) {
      var n = normalize(raw);
      if (!n) return;
      var cur = byId[n.id];
      if (!cur || n.updatedAt > cur.updatedAt) byId[n.id] = n;
    });

    var kept = [];
    Object.keys(byId).forEach(function (k) {
      var n = byId[k];
      var t = tb[n.id];
      if (t) {
        if (t.deletedAt >= n.updatedAt) return;   /* 已被删除 */
        delete tb[n.id];                          /* 笔记比墓碑新 → 视为重建 */
      }
      kept.push(n);
    });

    tombstones = Object.keys(tb).map(function (k) { return tb[k]; });
    state.notes = kept;

    return before !== JSON.stringify(state.notes) + '|' + JSON.stringify(tombstones);
  }

  /* ---------- 远端读写 ---------- */

  /* 同步接口地址：填了服务器地址就用它，否则用当前站点（同源） */
  function syncUrl() {
    var base = (sync.server || '').trim().replace(/\/+$/, '');
    if (!base) base = (location.origin && location.origin !== 'null') ? location.origin : '';
    return base + SYNC_PATH + '?key=' + encodeURIComponent(sync.key);
  }

  function describeError(err) {
    if (!err) return '未知错误';
    if (err.status === 401) return '同步密钥不正确';
    if (err.status === 403) return '服务器拒绝了请求';
    if (err.status === 404) return '服务器地址不对，或服务未启动';
    if (err.status) return 'HTTP ' + err.status;
    if (/fetch|network|Failed|load|CORS/i.test(err.message || '')) return '连不上服务器';
    return err.message || '未知错误';
  }

  function parseDoc(text) {
    var doc = JSON.parse(text || '{}');
    if (!doc || typeof doc !== 'object') throw new Error('远端数据格式异常');
    return {
      notes: Array.isArray(doc.notes) ? doc.notes : [],
      tombstones: Array.isArray(doc.tombstones) ? doc.tombstones : []
    };
  }

  function readRemote() {
    if (!sync.key) return Promise.resolve(null);
    return fetch(syncUrl(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.text();
      })
      .then(parseDoc);
  }

  function writeRemote() {
    return fetch(syncUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        notes: state.notes,
        tombstones: tombstones
      }),
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }).then(function () { /* 写入完成 */ });
  }

  /* ---------- 调度 ---------- */

  function doSync(opts) {
    opts = opts || {};
    if (!sync.key) {
      sync.status = 'unconfigured';
      renderSyncStatus();
      if (opts.manual) openSyncModal();
      return Promise.resolve(false);
    }
    if (syncing.busy) return Promise.resolve(false);
    if (navigator.onLine === false) {
      sync.status = 'offline';
      renderSyncStatus();
      if (opts.manual) toast('当前没有网络连接');
      return Promise.resolve(false);
    }

    syncing.busy = true;
    syncing.lastPullTry = Date.now();
    sync.status = 'syncing';
    renderSyncStatus();

    return readRemote().then(function (remote) {
      if (remote) {
        syncing.applyingRemote = true;
        var changed = applyRemote(remote);
        if (changed) { persist(); renderAll(); }
        saveTombstones();
        syncing.applyingRemote = false;
      }
      return writeRemote();
    }).then(function () {
      syncing.busy = false;
      sync.status = 'ok';
      sync.message = '';
      sync.lastSync = Date.now();
      saveSyncConfig();
      renderSyncStatus();
      if (opts.manual) toast('同步完成');
      return true;
    }).catch(function (err) {
      syncing.busy = false;
      syncing.applyingRemote = false;
      sync.status = (navigator.onLine === false) ? 'offline' : 'error';
      sync.message = sync.status === 'error' ? describeError(err) : '';
      renderSyncStatus();
      if (opts.manual) toast(sync.message ? '同步失败：' + sync.message : '同步失败，请稍后重试');
      return false;
    });
  }

  var syncSoon = debounce(function () {
    if (sync.key) doSync();
  }, PUSH_DELAY);

  function pullIfStale() {
    if (!sync.key || syncing.busy) return;
    if (Date.now() - syncing.lastPullTry < PULL_STALE) return;
    doSync();
  }

  /* ---------- 状态显示 ---------- */

  function fmtAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 45) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    return fmtShort(ts);
  }

  function renderSyncStatus() {
    if (!els.syncText) return;
    els.syncDot.className = 'sync-dot ' + sync.status;
    var label = SYNC_LABEL[sync.status] || '';
    if (sync.status === 'ok' && sync.lastSync) label += ' · ' + fmtAgo(sync.lastSync);
    if (sync.status === 'error' && sync.message) label = '同步失败：' + sync.message;
    els.syncText.textContent = label;
    els.syncStatusBtn.title = sync.key
      ? '点击立即同步' + (sync.lastSync ? '（上次 ' + fmtFull(sync.lastSync) + '）' : '')
      : '点击配置云同步';
  }

  /* ---------- 设置弹层 ---------- */

  function openSyncModal() {
    els.syncServerInput.value = sync.server;
    els.syncKeyInput.value = sync.key;
    els.syncModalMsg.textContent = sync.message
      ? '上次同步失败：' + sync.message
      : (sync.lastSync ? '上次同步：' + fmtFull(sync.lastSync) : '');
    els.syncModal.hidden = false;
  }

  function closeSyncModal() {
    els.syncModal.hidden = true;
    els.syncServerInput.value = '';
    els.syncKeyInput.value = '';
    els.syncModalMsg.textContent = '';
  }

  /* ---------------- 操作 ---------------- */

  function selectNote(id, opts) {
    if (state.activeId === id && (!opts || !opts.force)) return;
    saveNow();
    saveSoon.cancel();
    state.activeId = id;
    renderAll();
    if (!opts || opts.closeDrawer !== false) closeDrawer();
  }

  function createNote(seed) {
    saveNow();
    saveSoon.cancel();
    var now = Date.now();
    var n = {
      id: uid(),
      title: seed && seed.title ? seed.title : '',
      content: seed && seed.content ? seed.content : '',
      tags: seed && seed.tags ? seed.tags.slice() : [],
      createdAt: now,
      updatedAt: now
    };
    state.notes.push(n);
    state.activeId = n.id;
    state.query = '';
    state.tag = null;
    els.searchInput.value = '';
    els.searchClear.hidden = true;
    persist();
    renderAll();
    closeDrawer();
    if (!seed) els.titleInput.focus();
    return n;
  }

  function deleteNote(id) {
    var n = null;
    for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === id) n = state.notes[i];
    if (!n) return;
    var label = n.title ? '「' + n.title + '」' : '这条笔记';
    if (!window.confirm('确定要删除 ' + label + ' 吗？此操作不可撤销。')) return;

    state.notes = state.notes.filter(function (x) { return x.id !== id; });
    if (state.activeId === id) {
      var next = filteredNotes()[0];
      state.activeId = next ? next.id : null;
    }
    addTombstones([id]);
    persist();
    renderAll();
    toast('已删除');
  }

  function addTag(raw) {
    var n = activeNote();
    if (!n) return;
    var t = String(raw || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 24);
    if (!t) return;
    if (n.tags.indexOf(t) !== -1) { els.tagInput.value = ''; return; }
    if (n.tags.length >= 12) { toast('最多 12 个标签'); return; }
    n.tags.push(t);
    n.updatedAt = Date.now();
    els.tagInput.value = '';
    persist();
    renderTagChips();
    renderTagFilter();
    renderList();
    renderMeta();
  }

  function removeTag(t) {
    var n = activeNote();
    if (!n) return;
    n.tags = n.tags.filter(function (x) { return x !== t; });
    n.updatedAt = Date.now();
    persist();
    renderTagChips();
    renderTagFilter();
    renderList();
    renderMeta();
  }

  /* ---------------- 抽屉 ---------------- */

  function openDrawer() {
    els.sidebar.classList.add('open');
    els.overlay.hidden = false;
  }
  function closeDrawer() {
    els.sidebar.classList.remove('open');
    els.overlay.hidden = true;
  }

  /* ---------------- Toast ---------------- */

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    requestAnimationFrame(function () { els.toast.classList.add('show'); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
      setTimeout(function () { els.toast.hidden = true; }, 200);
    }, 1800);
  }

  /* ---------------- 复制代码 ---------------- */

  function copyText(text) {
    return new Promise(function (resolve, reject) {
      // 优先使用 execCommand：同步、在 file:// 与 http:// 下兼容性最好
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { resolve(); return; }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('copy timeout'));
        }, 1200);
        navigator.clipboard.writeText(text).then(function () {
          if (settled) return;
          settled = true; clearTimeout(timer); resolve();
        }, function (err) {
          if (settled) return;
          settled = true; clearTimeout(timer); reject(err);
        });
        return;
      }
      reject(new Error('当前环境不支持复制'));
    });
  }

  /* ---------------- AI 润色 ---------------- */

  function aiUrl(path) {
    var base = (sync.server || '').trim().replace(/\/+$/, '');
    if (!base) base = (location.origin && location.origin !== 'null') ? location.origin : '';
    return base + path + '?key=' + encodeURIComponent(sync.key);
  }

  function aiSetBusy(busy) {
    ai.busy = busy;
    Array.prototype.forEach.call(els.aiActions.querySelectorAll('button'), function (b) {
      b.disabled = busy;
    });
  }

  function loadAiConfig() {
    return fetch(aiUrl('/api/ai'), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.json();
      })
      .then(function (cfg) {
        ai.configured = !!cfg.configured;
        els.aiBaseUrlInput.value = cfg.baseUrl || '';
        els.aiModelInput.value = cfg.model || '';
        els.aiKeyInput.value = '';
        els.aiConfigBox.open = !ai.configured;
        return cfg;
      });
  }

  function openAiModal() {
    var n = activeNote();
    if (!n) { toast('先选中一条笔记'); return; }
    if (!n.content.trim()) { toast('这条笔记正文是空的，没有可润色的内容'); return; }

    els.aiModal.hidden = false;
    els.aiMsg.textContent = '';
    els.aiResult.hidden = true;
    els.aiResultBody.textContent = '';
    els.aiApplyBtn.hidden = true;
    ai.result = '';

    if (!sync.key) {
      els.aiMsg.textContent = 'AI 润色经由本机服务调用，请先在「云同步设置」里填好同步密钥。';
      return;
    }

    loadAiConfig().then(function (cfg) {
      if (!cfg.configured) {
        els.aiMsg.textContent = '还没有配置 AI 服务，展开下面的「AI 服务设置」填好接口地址、模型和 API Key。';
      }
    }).catch(function (err) {
      els.aiMsg.textContent = '读取 AI 设置失败：' + describeError(err);
    });
  }

  function closeAiModal() {
    els.aiModal.hidden = true;
    els.aiResult.hidden = true;
    els.aiResultBody.textContent = '';
    els.aiMsg.textContent = '';
    ai.result = '';
  }

  function polishErrorText(data, status) {
    switch (data && data.error) {
      case 'ai_unconfigured': return '还没有配置 AI 服务，请展开「AI 服务设置」填写。';
      case 'invalid_key': return '同步密钥不正确，请检查「云同步设置」。';
      case 'text_too_long': return '这条笔记太长了（单次最多 20000 字），可以先拆成几段再润色。';
      case 'empty_text': return '笔记正文是空的。';
      case 'upstream': return data.message || 'AI 服务调用失败。';
      default: return (data && (data.message || data.error)) || ('请求失败（HTTP ' + status + '）');
    }
  }

  function runPolish(action) {
    if (ai.busy) return;
    var n = activeNote();
    if (!n) return;
    if (!sync.key) { els.aiMsg.textContent = '请先在「云同步设置」里填好同步密钥。'; return; }

    ai.action = action;
    aiSetBusy(true);
    els.aiResult.hidden = true;
    els.aiResultBody.textContent = '';
    els.aiApplyBtn.hidden = true;
    els.aiMsg.textContent = '正在生成，请稍候…';

    fetch(aiUrl('/api/polish'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: n.content, action: action })
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
        if (!res.ok) throw new Error(polishErrorText(data, res.status));
        if (typeof data.text !== 'string' || !data.text) throw new Error('AI 没有返回内容。');
        return data.text;
      });
    }).then(function (out) {
      ai.result = out;
      els.aiResultBody.textContent = out;
      els.aiResultMeta.textContent = '改写后 ' + out.length + ' 字 · 原文 ' + n.content.length + ' 字';
      els.aiResult.hidden = false;
      els.aiMsg.textContent = '生成完成。确认无误后点「替换正文」。';
      els.aiApplyBtn.hidden = false;
    }).catch(function (err) {
      els.aiMsg.textContent = '润色失败：' + ((err && err.message) || '未知错误');
    }).then(function () {
      aiSetBusy(false);
    });
  }

  /* 用 execCommand 写入，保留浏览器原生撤销栈（Ctrl / Cmd + Z 可还原） */
  function setContentValue(text) {
    var el = els.contentInput;
    el.focus();
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    var done = false;
    try { done = document.execCommand('insertText', false, text); } catch (e) { done = false; }
    if (!done) el.innerHTML = mdToEditableHtml(text);
    var end = document.createRange();
    end.selectNodeContents(el);
    end.collapse(false);
    sel.removeAllRanges();
    sel.addRange(end);
    savedRange = null;
  }

  function applyPolish() {
    var n = activeNote();
    if (!n || !ai.result) return;
    setContentValue(ai.result);
    n.content = ai.result;
    n.updatedAt = Date.now();
    saveNow();
    renderList();
    renderPreview();
    closeAiModal();
    toast('已替换正文，按 Ctrl / Cmd + Z 可还原');
  }

  /* ---------------- 编辑区：Markdown 源 ↔ 富文本 DOM ---------------- */

  var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  var SIZE_RE = /^\d{1,3}(?:\.\d+)?px$/;

  /* 解析 <span style="…"> 的样式串，只认 color / font-size */
  function parseStyleAttr(raw) {
    var out = {};
    String(raw || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim().toLowerCase();
      var v = decl.slice(i + 1).trim();
      if (k === 'color' && COLOR_RE.test(v)) out.color = v.toLowerCase();
      else if (k === 'font-size' && SIZE_RE.test(v)) out.fontSize = v.toLowerCase();
    });
    return out;
  }

  function buildStyleAttr(style) {
    var parts = [];
    if (style.color) parts.push('color:' + style.color);
    if (style.fontSize) parts.push('font-size:' + style.fontSize);
    return parts.join(';');
  }

  function clampSize(px) {
    var v = Math.round(px * 10) / 10;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, v));
  }

  /* markdown 源 → 编辑区 HTML：只把白名单样式 span 渲染成真实样式，其余保持源码 */
  function mdToEditableHtml(md) {
    var s = String(md == null ? '' : md);
    var spans = [];
    s = s.replace(/<span\s+style="([^"]*)">([\s\S]*?)<\/span>/g, function (m, raw, inner) {
      var attr = buildStyleAttr(parseStyleAttr(raw));
      if (!attr) return m;
      spans.push({ attr: attr, inner: inner });
      return '\u0002' + (spans.length - 1) + '\u0002';
    });
    s = esc(s).replace(/\n/g, '<br>');
    s = s.replace(/\u0002(\d+)\u0002/g, function (m, k) {
      var sp = spans[+k];
      if (!sp) return '';
      return '<span style="' + sp.attr + '">' + esc(sp.inner).replace(/\n/g, '<br>') + '</span>';
    });
    return s;
  }

  /* 编辑区 DOM → markdown 源：<br>→换行，白名单 span 保留，其它标签只取文本 */
  function nodeToMd(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (tag === 'BR') return '\n';
    var inner = '';
    for (var c = node.firstChild; c; c = c.nextSibling) inner += nodeToMd(c);
    if (tag === 'SPAN') {
      var attr = buildStyleAttr(parseStyleAttr(node.getAttribute('style') || ''));
      return attr ? '<span style="' + attr + '">' + inner + '</span>' : inner;
    }
    if (tag === 'DIV' || tag === 'P') return '\n' + inner;
    return inner;
  }

  function editableToMd(el) {
    var out = '';
    for (var c = el.firstChild; c; c = c.nextSibling) out += nodeToMd(c);
    return out;
  }

  function currentContent() { return editableToMd(els.contentInput); }

  function rangeInEditor(range) {
    var c = range.commonAncestorContainer;
    return c === els.contentInput || els.contentInput.contains(c);
  }

  /* 向上找包裹选区的、带白名单样式的 <span> */
  function enclosingStyleSpan(node) {
    var el = node && node.nodeType === 1 ? node : (node ? node.parentNode : null);
    while (el && el !== els.contentInput) {
      if (el.nodeType === 1 && el.tagName === 'SPAN' &&
          buildStyleAttr(parseStyleAttr(el.getAttribute('style') || ''))) return el;
      el = el.parentNode;
    }
    return null;
  }

  function unwrapSpan(el) {
    var parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  /* 记住选区：点击样式栏会让编辑区失焦，需要靠它恢复 */
  var savedRange = null;
  function rememberSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var r = sel.getRangeAt(0);
      if (!r.collapsed && rangeInEditor(r)) savedRange = r.cloneRange();
    }
  }

  /* 在当前光标处插入纯文本（\n 转成 <br>） */
  function insertPlainText(text) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var parts = String(text).split('\n');
    var frag = document.createDocumentFragment();
    var last = null;
    for (var i = 0; i < parts.length; i++) {
      if (i) { last = document.createElement('br'); frag.appendChild(last); }
      if (parts[i]) { last = document.createTextNode(parts[i]); frag.appendChild(last); }
    }
    range.insertNode(frag);
    if (last) {
      var after = document.createRange();
      after.setStartAfter(last);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      savedRange = after.cloneRange();
    }
  }

  /* 回车：插入单个换行（<br>），序列化时还原为 \n */
  function insertLineBreak() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var br = document.createElement('br');
    range.insertNode(br);
    var after = document.createRange();
    after.setStartAfter(br);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    savedRange = after.cloneRange();
    updateStyleState();
  }

  function renderColorSwatches() {
    els.styleColors.innerHTML = PRESET_COLORS.map(function (c) {
      return '<button type="button" class="style-swatch" data-color="' + c +
        '" style="background:' + c + '" aria-label="文字颜色 ' + c + '" title="' + c + '"></button>';
    }).join('');
  }

  /* 同步样式栏（滑块 / 取色器 / 色点 / 提示）与当前选区状态 */
  function updateStyleState() {
    var sel = window.getSelection();
    var has = false, style = {};
    if (sel && sel.rangeCount && !sel.isCollapsed && rangeInEditor(sel.getRangeAt(0))) {
      var r = sel.getRangeAt(0);
      has = true;
      savedRange = r.cloneRange();
      var sp = enclosingStyleSpan(r.startContainer);
      if (sp && sp.contains(r.endContainer)) style = parseStyleAttr(sp.getAttribute('style') || '');
    }
    els.styleBar.classList.toggle('no-sel', !has);

    var size = style.fontSize ? parseFloat(style.fontSize) : DEFAULT_FONT_SIZE;
    els.fontSizeRange.value = size;
    els.fontSizeVal.textContent = size + 'px';

    var color = (style.color || DEFAULT_FONT_COLOR).toLowerCase();
    if (COLOR_RE.test(color)) els.fontColorPicker.value = color;
    Array.prototype.forEach.call(els.styleColors.querySelectorAll('[data-color]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-color') === color);
    });
  }

  /* 给选中的文字套上 / 修改样式（真实 DOM 操作，编辑区直接显示结果） */
  function applySelectionStyle(patch, silent) {
    var n = activeNote();
    if (!n) return;
    var sel = window.getSelection();
    var range = null;
    if (sel && sel.rangeCount && !sel.isCollapsed && rangeInEditor(sel.getRangeAt(0))) {
      range = sel.getRangeAt(0);
    } else if (savedRange && !savedRange.collapsed && rangeInEditor(savedRange)) {
      range = savedRange;
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    }
    if (!range || range.collapsed) {
      if (!silent) toast('请先在正文里选中要设置样式的文字');
      return;
    }

    var sp = enclosingStyleSpan(range.startContainer);
    var nr = document.createRange();

    if (sp && sp.contains(range.endContainer)) {
      /* 选区落在已有样式内 → 合并到该 span，避免嵌套 */
      var merged = parseStyleAttr(sp.getAttribute('style') || '');
      Object.keys(patch).forEach(function (k) {
        if (patch[k] == null || patch[k] === '') delete merged[k];
        else merged[k] = patch[k];
      });
      var attr = buildStyleAttr(merged);
      if (!attr) {
        unwrapSpan(sp);
        savedRange = null;
        afterStyleChange(n);
        return;
      }
      sp.setAttribute('style', attr);
      nr.selectNodeContents(sp);
    } else {
      /* 用新 span 包住选区 */
      var attr2 = buildStyleAttr(patch);
      if (!attr2) return;
      var span = document.createElement('span');
      span.setAttribute('style', attr2);
      try {
        range.surroundContents(span);
      } catch (e) {
        var frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      nr.selectNodeContents(span);
    }

    if (sel) { sel.removeAllRanges(); sel.addRange(nr); }
    savedRange = nr.cloneRange();
    afterStyleChange(n);
  }

  /* 样式变更后：同步正文、刷新列表 / 预览 / 元信息与样式栏 */
  function afterStyleChange(n) {
    n.content = currentContent();
    n.updatedAt = Date.now();
    persist();
    renderList();
    renderPreview();
    renderMeta();
    updateStyleState();
  }

  function stepFont(delta) {
    var cur = parseFloat(els.fontSizeRange.value) || DEFAULT_FONT_SIZE;
    applySelectionStyle({ fontSize: clampSize(cur + delta) + 'px' });
  }

  /* 保存按钮：立即落盘当前笔记（正文里的样式一并保存） */
  function saveCurrent() {
    var n = activeNote();
    if (!n) { toast('先选中一条笔记'); return; }
    saveSoon.cancel();
    saveNow();
    persist();
    toast('已保存');
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    /* 搜索 */
    els.searchInput.addEventListener('input', function () {
      state.query = els.searchInput.value;
      els.searchClear.hidden = !state.query;
      renderList();
    });
    els.searchClear.addEventListener('click', function () {
      els.searchInput.value = '';
      state.query = '';
      els.searchClear.hidden = true;
      renderList();
      els.searchInput.focus();
    });

    /* 新建 */
    [els.newNoteBtn, els.newNoteBtnTop, els.emptyNewBtn].forEach(function (b) {
      if (b) b.addEventListener('click', function () { createNote(); });
    });

    /* 列表：选择 / 删除 */
    els.noteList.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); deleteNote(del.getAttribute('data-del')); return; }
      var item = e.target.closest('.note-item');
      if (item) selectNote(item.getAttribute('data-id'));
    });

    /* 标签筛选 */
    els.tagFilter.addEventListener('click', function (e) {
      var pill = e.target.closest('[data-tag]');
      if (!pill) return;
      var t = pill.getAttribute('data-tag');
      state.tag = state.tag === t ? null : t;
      renderTagFilter();
      renderList();
    });
    els.clearFilterBtn.addEventListener('click', function () {
      state.tag = null;
      renderTagFilter();
      renderList();
    });

    /* 清空全部 */
    els.clearAllBtn.addEventListener('click', function () {
      if (!state.notes.length) { toast('没有笔记可以清空'); return; }
      if (!window.confirm('确定要清空全部 ' + state.notes.length + ' 条笔记吗？此操作不可撤销。')) return;
      addTombstones(state.notes.map(function (n) { return n.id; }));
      state.notes = [];
      state.activeId = null;
      persist();
      renderAll();
      toast('已清空');
    });

    /* 标题 / 正文自动保存 */
    els.titleInput.addEventListener('input', function () {
      var n = activeNote();
      if (!n) return;
      els.topbarTitle.textContent = els.titleInput.value || '无标题笔记';
      saveSoon();
    });

    els.contentInput.addEventListener('input', function () {
      saveSoon();
      previewSoon();
    });

    els.contentInput.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;   /* 输入法组字中不拦截 */
      if (e.key === 'Tab') {
        e.preventDefault();
        insertPlainText('  ');
        saveSoon();
        previewSoon();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertLineBreak();
        saveSoon();
        previewSoon();
      }
    });

    /* 粘贴：只取纯文本，避免富文本标签污染正文 */
    els.contentInput.addEventListener('paste', function (e) {
      var dt = e.clipboardData || window.clipboardData;
      if (!dt) return;
      var text = dt.getData('text/plain') || '';
      e.preventDefault();
      insertPlainText(text);
      saveSoon();
      previewSoon();
    });

    /* 选中文字的字号 / 颜色 */
    els.fontSizeRange.addEventListener('input', function () {
      applySelectionStyle({ fontSize: clampSize(parseFloat(els.fontSizeRange.value)) + 'px' }, true);
    });
    els.fontMinus.addEventListener('click', function () { stepFont(-1); });
    els.fontPlus.addEventListener('click', function () { stepFont(1); });
    els.fontColorPicker.addEventListener('input', function () {
      applySelectionStyle({ color: els.fontColorPicker.value.toLowerCase() });
    });
    els.styleColors.addEventListener('click', function (e) {
      var b = e.target.closest('[data-color]');
      if (b) applySelectionStyle({ color: b.getAttribute('data-color') });
    });
    els.styleResetBtn.addEventListener('click', function () {
      applySelectionStyle({ color: null, fontSize: null });
    });
    els.saveBtn.addEventListener('click', saveCurrent);
    els.styleToggle.addEventListener('click', toggleStyleBar);

    /* 点击样式栏前先记住选区；按钮类控件不抢焦点，保持编辑区里的选区与光标 */
    els.styleBar.addEventListener('mousedown', function (e) {
      rememberSelection();
      if (e.target.closest('button')) e.preventDefault();
    });

    /* 跟踪正文选区，实时刷新样式栏状态 */
    els.contentInput.addEventListener('focus', updateStyleState);
    els.contentInput.addEventListener('blur', function () { window.setTimeout(updateStyleState, 0); });
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (sel && sel.anchorNode && els.contentInput.contains(sel.anchorNode)) updateStyleState();
    });

    /* 标签输入 */
    els.tagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
        e.preventDefault();
        addTag(els.tagInput.value);
      } else if (e.key === 'Backspace' && !els.tagInput.value) {
        var n = activeNote();
        if (n && n.tags.length) removeTag(n.tags[n.tags.length - 1]);
      }
    });
    els.tagInput.addEventListener('blur', function () {
      if (els.tagInput.value.trim()) addTag(els.tagInput.value);
    });
    els.tagChips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-untag]');
      if (b) removeTag(b.getAttribute('data-untag'));
    });

    /* 视图模式 */
    els.modeSwitch.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      state.mode = b.getAttribute('data-mode');
      applyMode();
      persistPref();
    });

    /* 删除当前笔记 */
    els.deleteBtn.addEventListener('click', function () {
      if (state.activeId) deleteNote(state.activeId);
    });

    /* 代码块复制 */
    els.previewPane.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="copy-code"]');
      if (!btn) return;
      var block = btn.closest('.code-block');
      if (!block) return;
      var parts = [];
      Array.prototype.forEach.call(block.querySelectorAll('.code-txt'), function (el) {
        parts.push(el.textContent);
      });
      copyText(parts.join('\n')).then(function () {
        btn.textContent = '已复制';
        btn.classList.add('done');
        setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('done'); }, 1400);
      }).catch(function () {
        // 兜底：帮用户选中代码，手动 Ctrl/Cmd + C
        var lines = block.querySelector('.code-lines');
        var sel = window.getSelection();
        if (lines && sel) {
          var range = document.createRange();
          range.selectNodeContents(lines);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        toast('已选中代码，请按 Ctrl / Cmd + C 复制');
      });
    });

    /* 云同步 */
    els.syncStatusBtn.addEventListener('click', function () {
      if (!sync.key) { openSyncModal(); return; }
      doSync({ manual: true });
    });
    els.syncSettingsBtn.addEventListener('click', openSyncModal);
    els.syncModalClose.addEventListener('click', closeSyncModal);
    els.syncCancelBtn.addEventListener('click', closeSyncModal);
    els.syncModal.addEventListener('click', function (e) {
      if (e.target === els.syncModal) closeSyncModal();
    });

    els.syncSaveBtn.addEventListener('click', function () {
      var server = els.syncServerInput.value.trim().replace(/\/+$/, '');
      var key = els.syncKeyInput.value.trim();
      if (!key) { els.syncModalMsg.textContent = '请填写同步密钥'; els.syncKeyInput.focus(); return; }
      if (server && !/^https?:\/\//i.test(server)) {
        els.syncModalMsg.textContent = '服务器地址需要以 http:// 或 https:// 开头';
        return;
      }
      sync.server = server;
      sync.key = key;
      sync.message = '';
      saveSyncConfig();
      els.syncModalMsg.textContent = '正在连接服务器…';
      doSync({ manual: true }).then(function (ok) {
        if (ok) { closeSyncModal(); toast('云同步已开启'); }
        else els.syncModalMsg.textContent = sync.message ? '同步失败：' + sync.message : '同步失败，请检查服务器地址、密钥或网络';
      });
    });

    els.syncDisconnectBtn.addEventListener('click', function () {
      if (!sync.key && !sync.server) { closeSyncModal(); return; }
      if (!window.confirm('断开后本机不再与服务器同步（本地笔记和服务器上的数据都会保留）。继续？')) return;
      sync.key = '';
      sync.server = '';
      sync.lastSync = 0;
      sync.message = '';
      sync.status = 'unconfigured';
      syncSoon.cancel();
      saveSyncConfig();
      closeSyncModal();
      renderSyncStatus();
      toast('已断开云同步');
    });

    /* AI 润色 */
    els.aiPolishBtn.addEventListener('click', openAiModal);
    els.aiModalClose.addEventListener('click', closeAiModal);
    els.aiCancelBtn.addEventListener('click', closeAiModal);
    els.aiApplyBtn.addEventListener('click', applyPolish);
    els.aiModal.addEventListener('click', function (e) {
      if (e.target === els.aiModal) closeAiModal();
    });
    els.aiActions.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ai]');
      if (!b || b.disabled) return;
      Array.prototype.forEach.call(els.aiActions.querySelectorAll('button'), function (x) {
        x.classList.toggle('active', x === b);
      });
      runPolish(b.getAttribute('data-ai'));
    });
    els.aiConfigSaveBtn.addEventListener('click', function () {
      var baseUrl = els.aiBaseUrlInput.value.trim();
      var model = els.aiModelInput.value.trim();
      var apiKey = els.aiKeyInput.value.trim();

      if (!sync.key) { els.aiMsg.textContent = '请先在「云同步设置」里填好同步密钥。'; return; }
      if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
        els.aiMsg.textContent = '接口地址需要以 http:// 或 https:// 开头。';
        return;
      }
      if (!model) { els.aiMsg.textContent = '请填写模型名称。'; return; }

      els.aiMsg.textContent = '正在保存…';
      fetch(aiUrl('/api/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl, model: model, apiKey: apiKey })
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = {};
          try { data = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
          if (!res.ok) {
            if (data.error === 'missing_apikey') throw new Error('还没有保存过 API Key，这次需要填一个。');
            if (data.error === 'incomplete') throw new Error('接口地址和模型名称都要填。');
            throw new Error((data && data.error) || ('HTTP ' + res.status));
          }
          return data;
        });
      }).then(function () {
        els.aiKeyInput.value = '';
        ai.configured = true;
        els.aiConfigBox.open = false;
        els.aiMsg.textContent = 'AI 设置已保存，选一种方式试试。';
        toast('AI 设置已保存');
      }).catch(function (err) {
        els.aiMsg.textContent = '保存失败：' + ((err && err.message) || '未知错误');
      });
    });

    /* 联网状态变化：恢复时自动补同步 */
    window.addEventListener('online', function () {
      if (!sync.key) return;
      toast('网络已恢复，正在同步');
      doSync();
    });
    window.addEventListener('offline', function () {
      if (!sync.key) return;
      sync.status = 'offline';
      sync.message = '';
      renderSyncStatus();
    });

    /* 移动端抽屉 */
    els.menuBtn.addEventListener('click', openDrawer);
    els.sidebarClose.addEventListener('click', closeDrawer);
    els.overlay.addEventListener('click', closeDrawer);

    /* 抽屉左滑关闭 */
    var swipe = { x: 0, y: 0, on: false };
    els.sidebar.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { swipe.on = false; return; }
      swipe.x = e.touches[0].clientX;
      swipe.y = e.touches[0].clientY;
      swipe.on = true;
    }, { passive: true });
    els.sidebar.addEventListener('touchend', function (e) {
      if (!swipe.on) return;
      swipe.on = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - swipe.x;
      var dy = t.clientY - swipe.y;
      if (dx < -45 && Math.abs(dx) > Math.abs(dy) * 1.4) closeDrawer();
    }, { passive: true });

    /* 视口跨断点（横竖屏切换 / 窗口缩放）：抽屉复位、模式高亮重算 */
    if (mqNarrow) {
      var onNarrowChange = function () {
        if (!isNarrow()) closeDrawer();
        applyMode();
      };
      if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onNarrowChange);
      else if (mqNarrow.addListener) mqNarrow.addListener(onNarrowChange);
    }

    /* 快捷键 */
    document.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveSoon.cancel();
        saveNow();
        toast('已保存到本地');
      }
      if (e.key === 'Escape') {
        if (!els.syncModal.hidden) closeSyncModal();
        else if (!els.aiModal.hidden) closeAiModal();
        else if (els.sidebar.classList.contains('open')) closeDrawer();
        else if (document.activeElement === els.contentInput) els.contentInput.blur();
      }
    });

    /* 关闭前落盘；回到前台时按需拉取远端改动 */
    window.addEventListener('beforeunload', function () { saveNow(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveNow();
      else pullIfStale();
    });
    window.addEventListener('focus', pullIfStale);

    /* 跨标签页同步 */
    window.addEventListener('storage', function (e) {
      if (e.key !== STORE_KEY || !e.newValue) return;
      try {
        var list = JSON.parse(e.newValue);
        if (!Array.isArray(list)) return;
        state.notes = list.map(normalize).filter(Boolean);
        if (!activeNote()) state.activeId = filteredNotes()[0] ? filteredNotes()[0].id : null;
        renderAll();
        toast('已同步其他标签页的改动');
      } catch (err) { /* 忽略 */ }
    });

    /* 横向拖拽代码块（桌面端便捷操作） */
    els.previewPane.addEventListener('wheel', function (e) {
      var scroller = e.target.closest('.code-scroll');
      if (!scroller) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.shiftKey) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }

  /* ---------------- 初始数据 ---------------- */

  var DEMO_JOURNAL = [
    '# 欢迎使用 NoteHub',
    '',
    '这是一个完全运行在浏览器里的 **Markdown 笔记** 工具，数据保存在 `localStorage`，刷新页面后依然可以查看。',
    '',
    '## 快速上手',
    '',
    '- 点左上角 **新建笔记**，标题与正文会自动保存',
    '- `Ctrl / Cmd + S` 立即保存到本地',
    '- 左侧支持 **关键字搜索** 与 **标签筛选**',
    '  - 搜索会同时匹配标题、正文和标签',
    '',
    '> 提示：代码块会自动识别语言并高亮，配色接近 VS Code 深色主题。',
    '',
    '## 代码块示例',
    '',
    '```javascript',
    '// 带记忆化的斐波那契',
    'function fib(n) {',
    '  const cache = new Map();',
    '  const walk = (k) => {',
    '    if (k <= 1) return k;',
    '    if (cache.has(k)) return cache.get(k);',
    '    const v = walk(k - 1) + walk(k - 2);',
    '    cache.set(k, v);',
    '    return v;',
    '  };',
    '  return walk(n);',
    '}',
    '',
    'console.log(`fib(20) = ${fib(20)}`); // 6765',
    '```',
    '',
    '```python',
    '# 统计文件里的高频词',
    'def top_words(path, limit=5):',
    '    counts = {}',
    '    with open(path, encoding="utf-8") as f:',
    '        for line in f:',
    '            for word in line.split():',
    '                counts[word] = counts.get(word, 0) + 1',
    '    return sorted(counts.items(), key=lambda kv: -kv[1])[:limit]',
    '```',
    '',
    '```css',
    '/* 移动端：侧边栏收起为抽屉 */',
    '.sidebar {',
    '  transform: translateX(-102%);',
    '  transition: transform .24s ease;',
    '}',
    '.sidebar.open { transform: translateX(0); }',
    '```',
    '',
    '## 表格与任务清单',
    '',
    '| 功能 | 状态 | 说明 |',
    '| --- | :---: | --- |',
    '| 新建 / 编辑 / 删除 | 已完成 | 自动保存到本地 |',
    '| 搜索与标签筛选 | 已完成 | 匹配标题、正文、标签 |',
    '| 代码高亮 | 已完成 | 多语言 + 行号 + 复制 |',
    '',
    '- [x] 支持 Markdown 语法',
    '- [x] 支持标签分类',
    '- [ ] 导出为 PDF（待定）',
    '',
    '---',
    '',
    '祝记录愉快 🚀'
  ].join('\n');

  var DEMO_CHEATSHEET = [
    '# Markdown 速查',
    '',
    '## 文本样式',
    '',
    '- **粗体**、*斜体*、~~删除线~~、`行内代码`',
    '- 链接：[CommonMark 规范](https://commonmark.org)',
    '',
    '## 列表',
    '',
    '1. 有序列表第一项',
    '2. 第二项',
    '   1. 嵌套子项',
    '   2. 再来一个',
    '',
    '> 引用块：适合放摘录和提示。',
    '',
    '---',
    '',
    '## 代码',
    '',
    '```bash',
    '# 在浏览器控制台里查看本应用的数据',
    'localStorage.getItem("notehub.notes.v1")',
    '```'
  ].join('\n');

  /* 内置笔记：使用稳定 id，保证每条只注入一次（用户删除后不会再自动复活） */
  function seedNotes() {
    var list = [];
    var extra = window.NOTEHUB_SEEDS;
    if (Array.isArray(extra)) {
      extra.forEach(function (s) {
        if (s && s.id && typeof s.content === 'string') {
          list.push({ id: s.id, title: s.title || '', content: s.content, tags: s.tags || [] });
        }
      });
    }
    list.push({ id: 'seed-welcome', title: '欢迎使用 NoteHub', content: DEMO_JOURNAL, tags: ['入门', 'Markdown'] });
    list.push({ id: 'seed-cheatsheet', title: 'Markdown 速查', content: DEMO_CHEATSHEET, tags: ['速查'] });
    return list;
  }

  function injectSeeds() {
    var seen;
    try { seen = JSON.parse(safeGet(SEED_KEY) || '[]'); } catch (e) { seen = []; }
    if (!Array.isArray(seen)) seen = [];

    var list = seedNotes();
    var added = 0;
    list.forEach(function (s, i) {
      if (seen.indexOf(s.id) !== -1) return;
      seen.push(s.id);
      // 已存在同 id，或内容完全相同的笔记（旧数据）则不重复插入
      for (var k = 0; k < state.notes.length; k++) {
        var ex = state.notes[k];
        if (ex.id === s.id || (ex.title === s.title && ex.content === s.content)) return;
      }
      var ts = Date.now() - i * 60000;
      state.notes.push({
        id: s.id,
        title: s.title,
        content: s.content,
        tags: s.tags.slice(),
        createdAt: ts,
        updatedAt: ts
      });
      added++;
    });

    safeSet(SEED_KEY, JSON.stringify(seen));
    if (added) persist();
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    load();
    loadSyncConfig();
    injectSeeds();
    if (!state.activeId) {
      var first = filteredNotes()[0];
      state.activeId = first ? first.id : null;
    }
    renderColorSwatches();
    bind();
    applyMode();
    applyStyleCollapsed();
    renderAll();
    renderSyncStatus();
    if (sync.key) doSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
