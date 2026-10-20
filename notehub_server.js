/* =====================================================================
   NoteHub 同步服务（零依赖 Node）
   1) 分发站点静态文件 —— 手机浏览器直接访问
   2) GET / POST /api/sync —— 读写本机 %USERPROFILE%\NoteHub\data.json
   3) GET / POST /api/ai   —— 读写 AI 配置（%USERPROFILE%\NoteHub\ai.json）
   4) POST /api/polish     —— 代理调用 AI，润色笔记正文

   用法：  node notehub_server.js [端口] [站点目录]
   首次启动会在 %USERPROFILE%\NoteHub\key.txt 生成同步密钥并打印出来。
   公网暴露：  cloudflared tunnel --url http://localhost:8080
   ===================================================================== */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');

var PORT = parseInt(process.argv[2], 10) || 8080;
var ROOT = path.resolve(process.argv[3] || path.join(__dirname, 'site'));

var DATA_DIR = path.join(os.homedir() || process.env.USERPROFILE || '.', 'NoteHub');
var DATA_FILE = path.join(DATA_DIR, 'data.json');
var KEY_FILE = path.join(DATA_DIR, 'key.txt');

var AI_FILE = path.join(DATA_DIR, 'ai.json');

var MAX_BODY = 8 * 1024 * 1024;   /* 单次写入上限 8MB */
var MAX_TEXT = 20000;             /* AI 润色单次处理的最大字数 */
var AI_TIMEOUT = 60000;           /* 单次 AI 请求超时（毫秒） */
var EMPTY_DOC = '{"version":1,"updatedAt":0,"notes":[],"tombstones":[]}';

/* ---------------- 同步密钥 ---------------- */

function loadKey() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    var k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (k) return k;
  } catch (e) { /* 首次运行，下面新建 */ }
  var k = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(KEY_FILE, k + '\n', 'utf8');
  return k;
}

var SYNC_KEY = loadKey();

/* ---------------- 数据读写 ---------------- */

function readDoc() {
  try { return fs.readFileSync(DATA_FILE, 'utf8'); }
  catch (e) { return EMPTY_DOC; }
}

function writeDoc(text) {
  var tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');

  /* 覆盖前轮换备份：当前版本存为 bak.1，最多保留 5 份历史快照 */
  try {
    if (fs.existsSync(DATA_FILE)) {
      for (var i = 4; i >= 1; i--) {
        var from = DATA_FILE + '.bak.' + i;
        var to = DATA_FILE + '.bak.' + (i + 1);
        if (fs.existsSync(from)) {
          try { fs.unlinkSync(to); } catch (e) { /* 忽略 */ }
          fs.renameSync(from, to);
        }
      }
      fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak.1');
    }
  } catch (e) { /* 备份失败不影响主流程 */ }

  fs.renameSync(tmp, DATA_FILE);   /* 先写临时文件再改名，避免写坏 */
}

/* ---------------- AI 润色 ---------------- */

function loadAi() {
  try { return JSON.parse(fs.readFileSync(AI_FILE, 'utf8')) || {}; }
  catch (e) { return {}; }
}

function saveAi(cfg) {
  fs.writeFileSync(AI_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

var AI_SYSTEM = '你是中文写作助手。只输出改写后的 Markdown 正文，不要任何解释、前言或结束语，' +
  '也不要用代码围栏把整篇内容包起来。严格保留原有的 Markdown 结构（标题层级、列表、表格）' +
  '与代码块内容不变。';

var AI_ACTIONS = {
  polish: '请润色下面的 Markdown 笔记：让语言更通顺、准确、专业，修正错别字和标点。保持原意、原有结构和大致篇幅。',
  concise: '请精简下面的 Markdown 笔记：删掉冗余和重复的表达，保留全部关键信息。',
  expand: '请扩写下面的 Markdown 笔记：在不改变原意的前提下补充细节、举例或说明，让内容更充实。',
  formal: '请把下面的 Markdown 笔记改写为更正式、规范的书面表达。'
};

/* 有些模型会用 ``` 把整篇内容包起来，这里去掉最外层的围栏 */
function stripFence(s) {
  var m = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/.exec(s);
  return m ? m[1] : s;
}

function callAI(cfg, action, content) {
  var url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  var prompt = AI_ACTIONS[action] || AI_ACTIONS.polish;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: prompt + '\n\n---\n\n' + content }
      ]
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT)
  }).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) {
        var msg = 'AI 服务返回 ' + res.status;
        try {
          var j = JSON.parse(text);
          if (j && j.error && j.error.message) msg += '：' + j.error.message;
        } catch (e) { /* 非 JSON 错误体 */ }
        throw new Error(msg);
      }
      var data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error('AI 服务返回了无法解析的内容'); }
      var choice = data && data.choices && data.choices[0];
      var out = choice && choice.message && choice.message.content;
      if (typeof out !== 'string' || !out.trim()) throw new Error('AI 没有返回任何内容');
      return stripFence(out.trim());
    });
  });
}

/* ---------------- 静态文件 ---------------- */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(res, pathname) {
  var rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  var file = path.join(ROOT, path.normalize(rel).replace(/^[\\/]+/, ''));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}

/* ---------------- 请求处理 ---------------- */

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function allowed(req, url) {
  var k = url.searchParams.get('key') || req.headers['x-sync-key'] || '';
  return !!k && k === SYNC_KEY;
}

/* 读取请求体，超限直接 413 */
function readBody(req, res, onText) {
  var chunks = [], size = 0, tooBig = false;
  req.on('data', function (c) {
    size += c.length;
    if (size > MAX_BODY) { tooBig = true; req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', function () {
    if (tooBig) { sendJson(res, 413, { error: 'payload_too_large' }); return; }
    onText(Buffer.concat(chunks).toString('utf8'));
  });
}

var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://localhost');
  var pathname = url.pathname;

  /* 单文件版（file://）也能跨域调用，鉴权靠密钥 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Key');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (pathname === '/api/sync') {
    if (!allowed(req, url)) { sendJson(res, 401, { error: 'invalid_key' }); return; }

    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(readDoc());
      return;
    }

    if (req.method === 'POST') {
      readBody(req, res, function (text) {
        try {
          var doc = JSON.parse(text);
          if (!doc || typeof doc !== 'object' || !Array.isArray(doc.notes)) throw new Error('bad');
        } catch (e) {
          sendJson(res, 400, { error: 'invalid_json' });
          return;
        }
        writeDoc(JSON.stringify(doc));
        sendJson(res, 200, { ok: true, updatedAt: Date.now() });
      });
      return;
    }

    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  /* AI 配置：读只回配置项（不含密钥），写需带同步密钥 */
  if (pathname === '/api/ai') {
    if (!allowed(req, url)) { sendJson(res, 401, { error: 'invalid_key' }); return; }

    if (req.method === 'GET') {
      var cur = loadAi();
      sendJson(res, 200, {
        configured: !!(cur.baseUrl && cur.apiKey && cur.model),
        baseUrl: cur.baseUrl || '',
        model: cur.model || ''
      });
      return;
    }

    if (req.method === 'POST') {
      readBody(req, res, function (text) {
        var incoming;
        try { incoming = JSON.parse(text); }
        catch (e) { sendJson(res, 400, { error: 'invalid_json' }); return; }

        var cfg = loadAi();
        if (typeof incoming.baseUrl === 'string') cfg.baseUrl = incoming.baseUrl.trim().replace(/\/+$/, '');
        if (typeof incoming.model === 'string') cfg.model = incoming.model.trim();
        /* API Key 留空表示沿用已保存的，避免每次都要重填 */
        if (typeof incoming.apiKey === 'string' && incoming.apiKey.trim()) cfg.apiKey = incoming.apiKey.trim();

        if (!cfg.baseUrl || !cfg.model) { sendJson(res, 400, { error: 'incomplete' }); return; }
        if (!cfg.apiKey) { sendJson(res, 400, { error: 'missing_apikey' }); return; }

        saveAi(cfg);
        sendJson(res, 200, { ok: true, configured: true, baseUrl: cfg.baseUrl, model: cfg.model });
      });
      return;
    }

    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  /* AI 润色：服务端代理调用，密钥不出本机 */
  if (pathname === '/api/polish') {
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'method_not_allowed' }); return; }
    if (!allowed(req, url)) { sendJson(res, 401, { error: 'invalid_key' }); return; }

    readBody(req, res, function (text) {
      var body;
      try { body = JSON.parse(text); }
      catch (e) { sendJson(res, 400, { error: 'invalid_json' }); return; }

      var content = typeof body.text === 'string' ? body.text : '';
      var action = typeof body.action === 'string' ? body.action : 'polish';
      if (!content.trim()) { sendJson(res, 400, { error: 'empty_text' }); return; }
      if (content.length > MAX_TEXT) { sendJson(res, 413, { error: 'text_too_long' }); return; }

      var cfg = loadAi();
      if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
        sendJson(res, 400, { error: 'ai_unconfigured' });
        return;
      }

      callAI(cfg, action, content).then(function (out) {
        sendJson(res, 200, { text: out });
      }).catch(function (err) {
        sendJson(res, 502, { error: 'upstream', message: String((err && err.message) || err) });
      });
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') { serveStatic(res, pathname); return; }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

/* 监听并就绪后回调：打印访问信息，把真实端口交给调用方 */
function onListen(port, cb) {
  var ips = [];
  var ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (a) {
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
    });
  });

  console.log('');
  console.log('  NoteHub 同步服务已启动');
  console.log('  ------------------------------------------------------------');
  console.log('  站点目录 : ' + ROOT);
  console.log('  数据文件 : ' + DATA_FILE);
  console.log('  同步密钥 : ' + SYNC_KEY);
  console.log('  本机访问 : http://localhost:' + port + '/');
  ips.forEach(function (ip) {
    console.log('  局域网   : http://' + ip + ':' + port + '/');
  });
  console.log('  公网访问 : cloudflared tunnel --url http://localhost:' + port);
  console.log('  ------------------------------------------------------------');
  console.log('');

  if (typeof cb === 'function') cb(port);
}

/* 供 Electron 等宿主内嵌调用；port 传 0 表示交给系统分配空闲端口，root 可覆盖站点目录 */
function start(port, cb, root) {
  var p = (typeof port === 'number') ? port : PORT;
  if (root) ROOT = path.resolve(root);
  server.listen(p, function () { onListen(server.address().port, cb); });
  return server;
}

if (require.main === module) { start(); }

module.exports = {
  start: start,
  server: server,
  key: SYNC_KEY,
  dataFile: DATA_FILE,
  aiFile: AI_FILE
};
