/* =====================================================================
   NoteHighlight — 轻量级语法高亮器（无外部依赖）
   色板对应 VS Code 默认深色主题 Dark+
   暴露：window.NoteHighlight.highlight(code, lang) -> { lang, lines[] }
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------------- 工具 ---------------- */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return ESC[c]; });
  }

  // "a b c" -> { a:1, b:1, c:1 }
  function S(str) {
    var o = Object.create(null);
    String(str).split(/\s+/).forEach(function (w) { if (w) o[w] = 1; });
    return o;
  }

  function span(type, text) {
    if (!text) return '';
    if (type === 'plain') return esc(text);
    return '<span class="tk-' + type + '">' + esc(text) + '</span>';
  }

  /* ---------------- 通用分词器 ---------------- */

  var RE_NUM = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/;
  var RE_ID_START = /[A-Za-z_$]/;
  var RE_ID = /[A-Za-z0-9_$]/;
  var TWO_CHAR_OPS = /^(?:=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\*\*|\+\+|--|\+=|-=|\*=|\/=|%=|::|->|\.\.|\|>|<<|>>)/;

  function isCallAhead(code, i, n) {
    var k = i;
    while (k < n && (code.charAt(k) === ' ' || code.charAt(k) === '\t')) k++;
    return code.charAt(k) === '(';
  }

  function nextSignificant(code, i, n) {
    var k = i;
    while (k < n && /\s/.test(code.charAt(k))) k++;
    return code.charAt(k);
  }

  function tokenizeGeneric(code, L) {
    var out = [];
    var i = 0, n = code.length;
    var prev = '';        // 上一个有效字符
    var prevWord = '';    // 上一个标识符

    while (i < n) {
      var ch = code.charAt(i);

      /* 空白 */
      if (/\s/.test(ch)) {
        var ws = i;
        while (ws < n && /\s/.test(code.charAt(ws))) ws++;
        out.push({ t: 'plain', v: code.slice(i, ws) });
        i = ws;
        continue;
      }

      /* 块注释 */
      if (L.blockComment && code.startsWith(L.blockComment[0], i)) {
        var bcEnd = code.indexOf(L.blockComment[1], i + L.blockComment[0].length);
        var bcStop = bcEnd === -1 ? n : bcEnd + L.blockComment[1].length;
        out.push({ t: 'comment', v: code.slice(i, bcStop) });
        i = bcStop;
        prev = '/';
        continue;
      }

      /* 行注释 */
      if (L.lineComments) {
        var lc = null;
        for (var a = 0; a < L.lineComments.length; a++) {
          if (code.startsWith(L.lineComments[a], i)) { lc = L.lineComments[a]; break; }
        }
        if (lc) {
          var nl = code.indexOf('\n', i);
          var lcStop = nl === -1 ? n : nl;
          out.push({ t: 'comment', v: code.slice(i, lcStop) });
          i = lcStop;
          continue;
        }
      }

      /* 字符串 */
      if (L.strings && L.strings.indexOf(ch) !== -1) {
        var q = ch;
        var triple = !!L.tripleQuotes && code.substr(i, 3) === q + q + q;
        var closer = triple ? q + q + q : q;
        var nlQuotes = L.nlQuotes || '`';
        var j = i + closer.length;
        while (j < n) {
          var c = code.charAt(j);
          if (c === '\\') { j += 2; continue; }
          if (code.startsWith(closer, j)) { j += closer.length; break; }
          if (!triple && c === '\n' && nlQuotes.indexOf(q) === -1) break; // 未闭合的单行字符串
          j++;
        }
        if (j > n) j = n;
        var strVal = code.slice(i, j);
        // JSON / 对象字面量：后接 ':' 的字符串视为键名
        if (L.keyStrings && nextSignificant(code, j, n) === ':') {
          out.push({ t: 'property', v: strVal });
        } else {
          out.push({ t: 'string', v: strVal });
        }
        i = j;
        prev = q;
        continue;
      }

      /* 数字 */
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code.charAt(i + 1)))) {
        var m = code.slice(i).match(RE_NUM);
        var numVal = m ? m[0] : ch;
        // 语言后缀（1f / 10u / 3n / 1_000）
        var suf = code.slice(i + numVal.length).match(/^(?:[uUlLfFnN]|_?(?:u8|i8|u16|i16|u32|i32|u64|i64|f32|f64|usize|isize))/);
        if (suf && L.numSuffix !== false) numVal += suf[0];
        out.push({ t: 'number', v: numVal });
        i += numVal.length;
        prev = numVal.charAt(numVal.length - 1);
        continue;
      }

      /* 装饰器 @foo */
      if (ch === '@' && L.decorators) {
        var dj = i + 1;
        while (dj < n && /[A-Za-z0-9_$.]/.test(code.charAt(dj))) dj++;
        out.push({ t: 'decorator', v: code.slice(i, dj) });
        i = dj;
        continue;
      }

      /* 标识符 / 关键字 */
      if (RE_ID_START.test(ch)) {
        var ij = i + 1;
        while (ij < n && RE_ID.test(code.charAt(ij))) ij++;
        var w = code.slice(i, ij);
        i = ij;

        var type;
        if (L.kw[w]) type = 'keyword';
        else if (L.ctl && L.ctl[w]) type = 'control';
        else if (L.consts && L.consts[w]) type = 'constant';
        else if (L.globals && L.globals[w]) type = 'property';
        else if (L.types && L.types[w]) type = 'type';
        else if (L.fns && L.fns[w]) type = 'function';
        else if (isCallAhead(code, i, n)) type = 'function';
        else if (prev === '.') type = 'property';
        else if (nextSignificant(code, i, n) === ':' && prev !== '?') type = 'property';
        else if (/^[A-Z][A-Z0-9_]*$/.test(w) && w.length > 1) {
          var nxt = nextSignificant(code, i, n);
          type = (nxt === '=' || nxt === ':' || nxt === ',') ? 'constant' : 'type';
        } else if (L.upperIsType !== false && /^[A-Z][A-Za-z0-9_]*$/.test(w)) type = 'type';
        else if (L.vars) type = 'property';
        else type = 'plain';

        out.push({ t: type, v: w });
        prev = w.charAt(w.length - 1);
        prevWord = w;
        continue;
      }

      /* 括号 / 标点 */
      if ('(){}[]'.indexOf(ch) !== -1) {
        out.push({ t: 'punct', v: ch });
        i++; prev = ch;
        continue;
      }
      if (ch === ',' || ch === ';') {
        out.push({ t: 'punct', v: ch });
        i++; prev = ch;
        continue;
      }

      /* 多字符运算符 */
      var two = code.substr(i, 2);
      if (TWO_CHAR_OPS.test(two)) {
        var t2 = (two === '=>' || two === '->') ? 'keyword' : 'operator';
        out.push({ t: t2, v: two });
        i += 2; prev = two.charAt(1);
        continue;
      }

      out.push({ t: 'operator', v: ch });
      i++; prev = ch;
    }

    return out;
  }

  /* ---------------- HTML / XML ---------------- */

  function tokenizeHTML(code, L) {
    var out = [];
    var i = 0, n = code.length;
    var plainRun = '';
    function flushPlain() { if (plainRun) { pushText(plainRun); plainRun = ''; } }

    function pushText(text) {
      // 实体高亮
      var parts = text.split(/(&[a-zA-Z#0-9]+;)/);
      for (var k = 0; k < parts.length; k++) {
        if (!parts[k]) continue;
        if (k % 2 === 1) out.push({ t: 'constant', v: parts[k] });
        else out.push({ t: 'plain', v: parts[k] });
      }
    }

    while (i < n) {
      if (code.startsWith('<!--', i)) {
        flushPlain();
        var ce = code.indexOf('-->', i + 4);
        var cs = ce === -1 ? n : ce + 3;
        out.push({ t: 'comment', v: code.slice(i, cs) });
        i = cs;
        continue;
      }
      if (code.charAt(i) === '<') {
        var gt = code.indexOf('>', i);
        if (gt === -1) { plainRun += code.slice(i); i = n; break; }
        flushPlain();
        var tagSrc = code.slice(i, gt + 1);
        var tm = tagSrc.match(/^(<\/?)([A-Za-z][\w:.-]*)([\s\S]*?)(\/?>)$/);
        if (!tm) {
          out.push({ t: 'tag', v: tagSrc });
        } else {
          var tagName = tm[2];
          out.push({ t: 'punct', v: tm[1] });
          out.push({ t: 'tag', v: tagName });
          pushAttrs(tm[3]);
          out.push({ t: 'punct', v: tm[4] });
        }
        i = gt + 1;

        // <script> / <style> 内部内容按 JS / CSS 高亮
        var lower = tagName ? tagName.toLowerCase() : '';
        if (lower === 'script' || lower === 'style') {
          var rest = code.slice(i);
          var closeIdx = rest.search(new RegExp('</' + lower, 'i'));
          var inner = closeIdx === -1 ? rest : rest.slice(0, closeIdx);
          var sub = lower === 'script'
            ? tokenizeGeneric(inner, LANGS.javascript)
            : tokenizeCSS(inner);
          for (var s = 0; s < sub.length; s++) out.push(sub[s]);

          if (closeIdx === -1) { i = n; break; }
          code = rest.slice(closeIdx);
          i = 0;
          n = code.length;

          var cgt = code.indexOf('>');
          if (cgt !== -1) {
            out.push({ t: 'punct', v: '</' });
            out.push({ t: 'tag', v: code.slice(2, cgt) });
            out.push({ t: 'punct', v: '>' });
            i = cgt + 1;
          }
        }
        continue;
      }
      var lt = code.indexOf('<', i);
      var stop = lt === -1 ? n : lt;
      plainRun += code.slice(i, stop);
      i = stop;
      if (i >= n) break;
    }
    flushPlain();

    function pushAttrs(src) {
      var re = /([A-Za-z_:@#][-A-Za-z0-9_:.@$]*)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s"'=<>`]+)?/g;
      var m2, last = 0;
      while ((m2 = re.exec(src))) {
        if (m2.index > last) out.push({ t: 'plain', v: src.slice(last, m2.index) });
        out.push({ t: 'attr', v: m2[1] });
        if (m2[2]) {
          out.push({ t: 'operator', v: m2[2] });
          if (m2[3]) out.push({ t: 'string', v: m2[3] });
        }
        last = re.lastIndex;
      }
      if (last < src.length) out.push({ t: 'plain', v: src.slice(last) });
    }

    return out;
  }

  /* ---------------- CSS ---------------- */

  function tokenizeCSS(code) {
    var out = [], i = 0, n = code.length, depth = 0, mode = 'sel', buf = '';

    function flush(type) {
      if (buf) { out.push({ t: type, v: buf }); buf = ''; }
    }
    function isValueCtx() { return depth > 0 && mode === 'val'; }

    while (i < n) {
      var ch = code.charAt(i);

      if (code.startsWith('/*', i)) {
        flush(isValueCtx() ? 'string' : 'selector');
        var e = code.indexOf('*/', i + 2);
        e = e === -1 ? n : e + 2;
        out.push({ t: 'comment', v: code.slice(i, e) });
        i = e;
        continue;
      }

      if (ch === '"' || ch === "'") {
        flush(isValueCtx() ? 'string' : 'selector');
        var j = i + 1;
        while (j < n) {
          var c = code.charAt(j);
          if (c === '\\') { j += 2; continue; }
          if (c === ch) { j++; break; }
          if (c === '\n') break;
          j++;
        }
        if (j > n) j = n;
        out.push({ t: 'string', v: code.slice(i, j) });
        i = j;
        continue;
      }

      if (/^\s$/.test(ch)) {
        if (!buf) { out.push({ t: 'plain', v: ch }); i++; continue; }
        buf += ch; i++;
        continue;
      }

      if (ch === '{') {
        flush(isValueCtx() ? 'string' : 'selector');
        out.push({ t: 'punct', v: '{' });
        i++; depth++; mode = 'prop';
        continue;
      }
      if (ch === '}') {
        flush(isValueCtx() ? 'string' : 'property');
        out.push({ t: 'punct', v: '}' });
        i++; if (depth > 0) depth--; mode = 'sel';
        continue;
      }
      if (ch === ';') {
        flush(isValueCtx() ? 'string' : 'property');
        out.push({ t: 'punct', v: ';' });
        i++; if (depth > 0) mode = 'prop';
        continue;
      }
      if (ch === ':' && depth > 0 && mode === 'prop' && buf.trim()) {
        flush('property');
        out.push({ t: 'punct', v: ':' });
        i++; mode = 'val';
        continue;
      }

      if (depth === 0) {
        if (ch === '@') {
          flush('selector');
          var aj = i + 1;
          while (aj < n && /[\w-]/.test(code.charAt(aj))) aj++;
          out.push({ t: 'control', v: code.slice(i, aj) });
          i = aj;
          continue;
        }
        if (ch === ',') {
          flush('selector');
          out.push({ t: 'punct', v: ',' });
          i++;
          continue;
        }
        buf += ch; i++;
        continue;
      }

      if (mode === 'prop') { buf += ch; i++; continue; }

      // 值上下文
      if (ch === '!') {
        flush('string');
        var imp = code.slice(i).match(/^!\s*important/);
        out.push({ t: 'keyword', v: imp ? imp[0] : '!' });
        i += (imp ? imp[0].length : 1);
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code.charAt(i + 1)))) {
        flush('string');
        var nm = code.slice(i).match(/^(?:\d*\.?\d+)(?:[a-zA-Z%]+)?/);
        out.push({ t: 'number', v: nm ? nm[0] : ch });
        i += (nm ? nm[0].length : 1);
        continue;
      }
      if (ch === '#') {
        flush('string');
        var hx = code.slice(i).match(/^#[0-9a-fA-F]{3,8}/);
        if (hx) { out.push({ t: 'number', v: hx[0] }); i += hx[0].length; continue; }
        out.push({ t: 'operator', v: '#' }); i++; continue;
      }
      if (/[A-Za-z_$-]/.test(ch)) {
        var wj = i;
        while (wj < n && /[\w$-]/.test(code.charAt(wj))) wj++;
        var word = code.slice(i, wj);
        if (code.charAt(wj) === '(') {
          flush('string');
          out.push({ t: 'function', v: word });
          i = wj;
          continue;
        }
        buf += word; i = wj;
        continue;
      }

      buf += ch; i++;
    }
    flush(isValueCtx() ? 'string' : 'selector');
    return out;
  }

  /* ---------------- YAML ---------------- */

  function tokenizeYAML(code) {
    var out = [];
    var lines = code.split('\n');

    function pushValue(v) {
      if (!v) return;
      var ci = -1;
      for (var k = 0; k < v.length; k++) {
        if (v.charAt(k) === '#' && (k === 0 || /\s/.test(v.charAt(k - 1)))) { ci = k; break; }
      }
      var main = ci === -1 ? v : v.slice(0, ci);
      var cmt = ci === -1 ? '' : v.slice(ci);
      var t = main.trim();
      if (!t) out.push({ t: 'plain', v: main });
      else if (/^(true|false|null|yes|no|on|off|~)$/i.test(t)) out.push({ t: 'constant', v: main });
      else if (/^-?[\d._]+$/.test(t)) out.push({ t: 'number', v: main });
      else out.push({ t: 'string', v: main });
      if (cmt) out.push({ t: 'comment', v: cmt });
    }

    lines.forEach(function (line, idx) {
      if (idx) out.push({ t: 'plain', v: '\n' });
      var lead = line.match(/^(\s*)(-\s+)?/);
      if (lead[0]) out.push({ t: 'plain', v: lead[0] });
      var rest = line.slice(lead[0].length);

      if (/^#/.test(rest)) { out.push({ t: 'comment', v: rest }); return; }
      if (/^---\s*$/.test(rest) || /^\.\.\.\s*$/.test(rest)) {
        out.push({ t: 'punct', v: rest });
        return;
      }
      var km = rest.match(/^([^:#\s][^:#]*)(:)(\s*)([\s\S]*)$/);
      if (km) {
        out.push({ t: 'property', v: km[1] });
        out.push({ t: 'punct', v: ':' });
        out.push({ t: 'plain', v: km[3] });
        pushValue(km[4]);
        return;
      }
      pushValue(rest);
    });
    return out;
  }

  /* ---------------- Markdown（代码块内的 Markdown） ---------------- */

  function tokenizeMarkdown(code) {
    var out = [];
    var lines = code.split('\n');

    function inline(text) {
      var re = /(`[^`]*`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\([^)]*\))/g;
      var last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) out.push({ t: 'plain', v: text.slice(last, m.index) });
        if (m[1]) out.push({ t: 'string', v: m[1] });
        else if (m[2]) out.push({ t: 'keyword', v: m[2] });
        else out.push({ t: 'property', v: m[3] });
        last = re.lastIndex;
      }
      if (last < text.length) out.push({ t: 'plain', v: text.slice(last) });
    }

    lines.forEach(function (line, idx) {
      if (idx) out.push({ t: 'plain', v: '\n' });
      var hm = line.match(/^(\s{0,3}#{1,6}\s+)(.*)$/);
      if (hm) { out.push({ t: 'punct', v: hm[1] }); out.push({ t: 'keyword', v: hm[2] }); return; }
      var um = line.match(/^(\s*)([-*+]\s+|\d+\.\s+)(.*)$/);
      if (um) {
        out.push({ t: 'plain', v: um[1] });
        out.push({ t: 'operator', v: um[2] });
        inline(um[3]);
        return;
      }
      var qm = line.match(/^(\s*>\s?)(.*)$/);
      if (qm) { out.push({ t: 'comment', v: qm[1] }); inline(qm[2]); return; }
      inline(line);
    });
    return out;
  }

  /* ---------------- 语言配置 ---------------- */

  var JS_TYPES = 'String Number Boolean Object Array Function Promise Map Set WeakMap WeakSet Symbol BigInt JSON Math Date RegExp Error TypeError SyntaxError AbortController URL FormData File Blob Event CustomEvent HTMLElement Node Element';

  var js = {
    name: 'JavaScript',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`'],
    nlQuotes: '`',
    kw: S('const let var function class extends new this super import export from default async await yield typeof instanceof in of delete void static get set as of'),
    ctl: S('if else for while do switch case break continue return try catch finally throw debugger with'),
    consts: S('true false null undefined NaN Infinity'),
    types: S(JS_TYPES),
    globals: S('console document window globalThis process require module exports arguments localStorage sessionStorage fetch setTimeout setInterval clearTimeout clearInterval queueMicrotask structuredClone navigator location history alert')
  };

  var LANGS = Object.create(null);

  function def(ids, cfg) { ids.forEach(function (id) { LANGS[id] = cfg; }); }

  def(['js', 'javascript', 'jsx', 'mjs', 'cjs', 'node'], js);

  def(['ts', 'typescript', 'tsx'], {
    name: 'TypeScript',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`'],
    nlQuotes: '`',
    kw: S('const let var function class extends new this super import export from default async await yield typeof instanceof in of delete void static get set as namespace declare abstract implements interface type enum readonly public private protected override satisfies keyof infer is assert'),
    ctl: S('if else for while do switch case break continue return try catch finally throw debugger with'),
    consts: S('true false null undefined NaN Infinity'),
    types: S(JS_TYPES + ' any unknown never unknown string number boolean symbol object bigint void Partial Required Readonly Record Pick Omit Exclude Extract ReturnType Awaited'),
    globals: js.globals
  });

  def(['py', 'python', 'python3'], {
    name: 'Python',
    lineComments: ['#'],
    strings: ['"', "'"],
    tripleQuotes: true,
    decorators: true,
    kw: S('def class lambda import from as with global nonlocal None True False and or not is in async await del pass raise'),
    ctl: S('if elif else for while try except finally return yield break continue assert match case'),
    consts: S('None True False NotImplemented Ellipsis'),
    types: S('str int float bool list dict set tuple bytes bytearray type object Exception ValueError TypeError KeyError IndexError RuntimeError'),
    fns: S('print len range enumerate zip map filter sum min max abs round sorted reversed any all isinstance issubclass getattr setattr hasattr open input format repr id iter next super self cls property staticmethod classmethod')
  });

  def(['html', 'xml', 'svg', 'vue', 'htm'], { name: 'HTML' });
  def(['css', 'scss', 'less'], { name: 'CSS' });

  def(['json', 'jsonc'], {
    name: 'JSON',
    strings: ['"'],
    keyStrings: true,
    kw: S(''),
    consts: S('true false null'),
    numSuffix: false
  });

  def(['yaml', 'yml'], { name: 'YAML' });

  def(['bash', 'sh', 'shell', 'zsh', 'console', 'terminal'], {
    name: 'Shell',
    lineComments: ['#'],
    strings: ['"', "'"],
    kw: S('if then else elif fi for while until do done case esac function return export local readonly in select time'),
    ctl: S('break continue exit shift'),
    consts: S('true false'),
    fns: S('echo cd ls pwd cat grep sed awk mkdir rmdir rm cp mv touch chmod chown ln find xargs sort uniq head tail wc cut tr diff curl wget git npm npx yarn pnpm node python python3 pip docker kubectl apt brew sudo tar zip unzip ssh scp ps kill top df du env which man jq print curl'),
    vars: true
  });

  def(['sql', 'mysql', 'postgres', 'postgresql', 'sqlite'], {
    name: 'SQL',
    lineComments: ['--'],
    blockComment: ['/*', '*/'],
    strings: ["'", '"'],
    kw: S('select from where group by order having join inner left right full outer cross on as insert into values update set delete create table view index database schema drop alter add column primary key foreign references unique not null default constraint distinct union all limit offset top exists case when then else end asc desc with recursive returning begin commit rollback transaction grant revoke'),
    consts: S('null true false'),
    types: S('int integer varchar text char boolean date timestamp datetime decimal numeric float double serial bigint'),
    fns: S('count sum avg min max coalesce cast now round upper lower length substring concat trim date_part extract row_number rank over')
  });

  def(['java'], {
    name: 'Java',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'"],
    kw: S('class interface enum extends implements new this super import package public private protected static final abstract synchronized volatile transient native void strictfp record sealed permits var'),
    ctl: S('if else for while do switch case break continue return try catch finally throw throws instanceof assert default yield'),
    consts: S('true false null'),
    types: S('String Integer Long Double Float Boolean Character Object List Map Set ArrayList HashMap HashSet Optional Stream System Math Integer Exception RuntimeException Thread')
  });

  def(['c', 'h', 'cpp', 'c++', 'cc', 'hpp', 'cxx'], {
    name: 'C / C++',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'"],
    kw: S('int long short char float double void bool signed unsigned const static struct class union enum namespace template typename typedef using public private protected virtual override final inline extern mutable new delete this auto constexpr noexcept friend operator explicit'),
    ctl: S('if else for while do switch case break continue return goto try catch throw sizeof'),
    consts: S('true false nullptr NULL'),
    types: S('size_t string vector map set unordered_map unordered_set pair shared_ptr unique_ptr weak_ptr istream ostream ostringstream stringstream FILE uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t'),
    globals: S('std cout cin endl printf malloc free memcpy memset')
  });

  def(['cs', 'csharp', 'c#'], {
    name: 'C#',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'"],
    kw: S('using namespace class interface struct enum record public private protected internal static readonly const virtual override abstract sealed partial async await new this base var get set init event delegate void ref out params in'),
    ctl: S('if else for foreach while do switch case break continue return try catch finally throw when yield lock goto is as typeof nameof'),
    consts: S('true false null'),
    types: S('string int long double float decimal bool char object byte short uint ulong List Dictionary IEnumerable Task Action Func Exception Console Math DateTime'),
    globals: S('Console Math DateTime')
  });

  def(['go', 'golang'], {
    name: 'Go',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`'],
    nlQuotes: '`',
    decorators: true,
    kw: S('package import func type struct interface map chan var const goto defer go range select return'),
    ctl: S('if else for switch case break continue default fallthrough'),
    consts: S('true false nil iota'),
    types: S('string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 bool byte rune error any interface{}'),
    globals: S('fmt println print make new len cap append copy delete panic recover close')
  });

  def(['rs', 'rust'], {
    name: 'Rust',
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    strings: ['"'],
    kw: S('fn let mut const static struct enum trait impl pub use mod crate super self Self as where dyn ref move async await unsafe extern box in'),
    ctl: S('if else match loop while for break continue return'),
    consts: S('true false None Some Ok Err'),
    types: S('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc HashMap HashSet Self'),
    globals: S('println print format vec assert panic'),
    decorators: true
  });

  def(['php'], {
    name: 'PHP',
    lineComments: ['//', '#'],
    blockComment: ['/*', '*/'],
    strings: ['"', "'"],
    kw: S('function class interface trait extends implements new public private protected static final abstract const use namespace global echo print return require require_once include include_once as instanceof clone'),
    ctl: S('if else elseif endif for foreach while do switch case break continue try catch finally throw match yield'),
    consts: S('true false null TRUE FALSE NULL'),
    types: S('int float string bool array object callable iterable void mixed self static'),
    vars: true
  });

  def(['rb', 'ruby'], {
    name: 'Ruby',
    lineComments: ['#'],
    blockComment: ['=begin', '=end'],
    strings: ['"', "'"],
    kw: S('def end class module require require_relative include extend attr_accessor attr_reader attr_writer new self nil true false and or not then do lambda proc yield begin rescue ensure raise return'),
    ctl: S('if elsif else unless while until for break next redo retry case when catch throw'),
    consts: S('nil true false'),
    types: S('String Integer Float Array Hash Symbol Range Proc IO Struct'),
    vars: true
  });

  def(['md', 'markdown'], { name: 'Markdown' });
  def(['text', 'txt', 'plain', 'plaintext', 'log', 'diff', 'ini', 'toml', 'conf', 'env', 'properties', 'dockerfile', 'makefile'], { name: 'Plain Text' });

  // ini / toml 复用 YAML 风格
  LANGS.ini = { name: 'INI', mode: 'yaml' };
  LANGS.toml = { name: 'TOML', mode: 'yaml' };
  LANGS.conf = { name: 'Config', mode: 'yaml' };
  LANGS.env = { name: 'ENV', mode: 'yaml' };
  LANGS.properties = { name: 'Properties', mode: 'yaml' };

  function tokenize(code, L) {
    if (!L) return [{ t: 'plain', v: code }];
    if (L.mode === 'yaml') return tokenizeYAML(code);
    switch (L.name) {
      case 'HTML': return tokenizeHTML(code, LANGS.javascript);
      case 'CSS': return tokenizeCSS(code);
      case 'YAML': return tokenizeYAML(code);
      case 'Markdown': return tokenizeMarkdown(code);
      case 'Plain Text': return [{ t: 'plain', v: code }];
      default: return tokenizeGeneric(code, L);
    }
  }

  function resolve(lang) {
    if (!lang) return null;
    var key = String(lang).trim().toLowerCase();
    return LANGS[key] || null;
  }

  /* ---------------- 对外接口 ---------------- */

  function highlight(code, lang) {
    var L = resolve(lang);
    var src = String(code == null ? '' : code);
    if (src.charAt(src.length - 1) === '\n') src = src.slice(0, -1);

    var tokens = tokenize(src, L);
    var lines = [], cur = '';

    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      var parts = Math.max(1, tk.v.split('\n').length) > 1 ? tk.v.split('\n') : [tk.v];
      for (var k = 0; k < parts.length; k++) {
        if (k > 0) { lines.push(cur); cur = ''; }
        if (parts[k]) cur += span(tk.t, parts[k]);
      }
    }
    lines.push(cur);

    return {
      lang: L ? L.name : (lang ? String(lang) : 'TEXT'),
      known: !!L,
      lines: lines
    };
  }

  global.NoteHighlight = {
    highlight: highlight,
    escapeHtml: esc,
    has: function (lang) { return !!resolve(lang); },
    languages: function () { return Object.keys(LANGS).sort(); }
  };

})(window);
