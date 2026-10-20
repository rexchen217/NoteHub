/* =====================================================================
   NoteMath — 轻量 LaTeX 子集渲染器（无外部依赖，纯 HTML + CSS 排版）

   覆盖范围（针对数学笔记的常用写法）：
     · 分数 \frac \dfrac \tfrac        · 根式 \sqrt{x} \sqrt[n]{x}
     · 上下标 x^{2} a_{i}              · 大型算符 \lim \sum \prod 及其上下限
     · 多行对齐 \begin{aligned}...\end{aligned}
     · 正体文本 \text{...} \mathrm{...} · 上划线 \bar{x} · 上下叠放 \overset{?}{=}
     · 定界符 \left( \right) \big( \Big[
     · 希腊字母、逻辑与集合符号、间距命令 \, \; \quad \qquad \! \
     · 未知命令按正体文本输出，保证不崩

   暴露：window.NoteMath.render(tex, display) -> HTML 字符串
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------------- 符号表 ---------------- */
  var SYM = {
    /* 希腊字母 */
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ',
    sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ',
    chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
    Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    /* 逻辑 */
    wedge: '∧', land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
    rightarrow: '→', to: '→', Rightarrow: '⇒', implies: '⟹',
    leftarrow: '←', gets: '←', Leftarrow: '⇐',
    leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⟺',
    nrightarrow: '↛', nleftarrow: '↚', nRightarrow: '⇏',
    uparrow: '↑', downarrow: '↓', updownarrow: '↕',
    oplus: '⊕', otimes: '⊗', ominus: '⊖',
    top: '⊤', bot: '⊥', therefore: '∴', because: '∵',
    /* 集合 */
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃',
    supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
    forall: '∀', exists: '∃', nexists: '∄',
    /* 关系与运算 */
    sim: '∼', simeq: '≃', approx: '≈', cong: '≅', equiv: '≡', propto: '∝',
    neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', ll: '≪', gg: '≫',
    cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
    circ: '∘', bullet: '•', oo: '∞', infty: '∞',
    cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
    partial: '∂', nabla: '∇', angle: '∠', prime: '′',
    vert: '|', lvert: '|', rvert: '|', Vert: '‖', lVert: '‖', rVert: '‖',
    backslash: '＼', square: '□', checkmark: '✓', degree: '°', percent: '%'
  };

  /* 关系符（两侧加数学间距） */
  var REL = {
    rightarrow: 1, to: 1, Rightarrow: 1, implies: 1, leftarrow: 1, gets: 1, Leftarrow: 1,
    leftrightarrow: 1, Leftrightarrow: 1, iff: 1, nrightarrow: 1, nleftarrow: 1, nRightarrow: 1,
    neq: 1, ne: 1, leq: 1, le: 1, geq: 1, ge: 1, ll: 1, gg: 1,
    sim: 1, simeq: 1, approx: 1, cong: 1, equiv: 1, propto: 1,
    in: 1, notin: 1, ni: 1, subset: 1, subseteq: 1, supset: 1, supseteq: 1,
    oplus: 1, otimes: 1, ominus: 1, pm: 1, mp: 1, times: 1, cdot: 1, div: 1,
    wedge: 1, land: 1, vee: 1, lor: 1
  };

  /* 大型算符（符号形态，可带上下限） */
  var BIGOP = {
    sum: '∑', prod: '∏', bigwedge: '⋀', bigvee: '⋁', bigcup: '⋃', bigcap: '⋂',
    coprod: '∐', int: '∫', oint: '∮', bigoplus: '⨁', bigotimes: '⨂'
  };

  /* 正体函数名 */
  var FN = {
    ln: 'ln', lg: 'lg', log: 'log', exp: 'exp', sin: 'sin', cos: 'cos', tan: 'tan',
    cot: 'cot', sec: 'sec', csc: 'csc', arcsin: 'arcsin', arccos: 'arccos',
    arctan: 'arctan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', mod: 'mod',
    det: 'det', gcd: 'gcd', deg: 'deg', dim: 'dim', ker: 'ker', Pr: 'Pr',
    lim: 'lim', limsup: 'lim sup', liminf: 'lim inf',
    max: 'max', min: 'min', sup: 'sup', inf: 'inf'
  };

  /* 上下限写成"下方/上方"的算符 */
  var LIMIT_FN = { lim: 1, limsup: 1, liminf: 1, max: 1, min: 1, sup: 1, inf: 1 };

  /* ---------------- 基础工具 ---------------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isSpace(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r'; }

  function skipSpace(s, i) { while (i < s.length && isSpace(s.charAt(i))) i++; return i; }

  /* 读取 {...}，跳过 \{ \} 这类转义，返回 { body, end } */
  function readBalanced(s, i) {
    var depth = 0, start = i + 1, k = i;
    for (; k < s.length; k++) {
      var c = s.charAt(k);
      if (c === '\\') { k++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return { body: s.slice(start, k), end: k + 1 }; }
    }
    return { body: s.slice(start), end: s.length };
  }

  var VAR_RE = /[A-Za-z]/;
  var NUM_RE = /[0-9]/;
  var OP_RE = /[=+\-<>±×÷≠≤≥∼≈≡⋅·]/;
  var PUNCT_RE = /[()\[\]|,;:!?/]/;

  /* ---------------- 单个原子 ---------------- */

  function parseOne(s, i, ctx) {
    var c = s.charAt(i);

    /* 花括号分组：只作为"单元"参与上下标，本身不产生符号 */
    if (c === '{') {
      var g = readBalanced(s, i);
      return { html: seq(g.body, ctx), end: g.end };
    }

    /* 普通字符 */
    if (c !== '\\') {
      if (NUM_RE.test(c)) {
        var j = i;
        while (j < s.length && (NUM_RE.test(s.charAt(j)) || s.charAt(j) === '.')) j++;
        return { html: '<span class="m-num">' + esc(s.slice(i, j)) + '</span>', end: j };
      }
      if (VAR_RE.test(c)) return { html: '<span class="m-var">' + esc(c) + '</span>', end: i + 1 };
      if (OP_RE.test(c)) return { html: '<span class="m-opc">' + esc(c) + '</span>', end: i + 1 };
      if (PUNCT_RE.test(c)) return { html: '<span class="m-punct">' + esc(c) + '</span>', end: i + 1 };
      if (c === '&') return { html: '', modifier: true, end: i + 1 };
      return { html: esc(c), end: i + 1 };
    }

    /* 反斜杠命令 */
    var k = i + 1;
    var name = '';
    if (VAR_RE.test(s.charAt(k))) {
      while (k < s.length && VAR_RE.test(s.charAt(k))) k++;
      name = s.slice(i + 1, k);
    } else {
      name = s.charAt(k) || '';
      k++;
    }

    switch (name) {
      /* 分数 */
      case 'frac': case 'dfrac': case 'tfrac': {
        var f1 = readArg(s, k, ctx);
        var f2 = readArg(s, f1.end, ctx);
        var fcls = name === 'dfrac' ? ' m-frac-d' : (name === 'tfrac' ? ' m-frac-t' : '');
        return {
          html: '<span class="m-frac' + fcls + '">' +
                  '<span class="m-frac-num">' + f1.html + '</span>' +
                  '<span class="m-frac-den">' + f2.html + '</span>' +
                '</span>',
          end: f2.end
        };
      }

      /* 根式 */
      case 'sqrt': {
        k = skipSpace(s, k);
        var idx = '';
        if (s.charAt(k) === '[') {
          var close = s.indexOf(']', k);
          if (close === -1) close = s.length - 1;
          idx = seq(s.slice(k + 1, close), ctx);
          k = close + 1;
        }
        var r = readArg(s, k, ctx);
        return {
          html: '<span class="m-sqrt">' +
                  (idx ? '<span class="m-sqrt-idx">' + idx + '</span>' : '') +
                  '<span class="m-sqrt-sign">√</span>' +
                  '<span class="m-sqrt-body">' + r.html + '</span>' +
                '</span>',
          end: r.end
        };
      }

      /* 正体文本 */
      case 'text': case 'textrm': case 'mathrm': case 'mathsf': case 'operatorname': {
        k = skipSpace(s, k);
        var tg = s.charAt(k) === '{' ? readBalanced(s, k) : { body: s.charAt(k), end: k + 1 };
        return { html: '<span class="m-text">' + esc(tg.body) + '</span>', end: tg.end };
      }

      /* 上划线 */
      case 'bar': case 'overline': {
        var b = readArg(s, k, ctx);
        return { html: '<span class="m-bar">' + b.html + '</span>', end: b.end };
      }

      /* 上下叠放：\overset{上}{基} */
      case 'overset': {
        var o1 = readArg(s, k, ctx);
        var o2 = readArg(s, o1.end, ctx);
        return {
          html: '<span class="m-over"><span class="m-over-top">' + o1.html + '</span>' +
                '<span class="m-over-base">' + o2.html + '</span></span>',
          end: o2.end
        };
      }

      /* 环境：\begin{aligned}...\end{aligned} */
      case 'begin': {
        k = skipSpace(s, k);
        var envArg = s.charAt(k) === '{' ? readBalanced(s, k) : { body: '', end: k };
        var env = envArg.body.replace(/[{}]/g, '').trim();
        var closer = '\\end{' + env + '}';
        var at = s.indexOf(closer, envArg.end);
        var body = at === -1 ? s.slice(envArg.end) : s.slice(envArg.end, at);
        return { html: renderEnv(env, body, ctx), end: at === -1 ? s.length : at + closer.length };
      }
      case 'end': {
        var eArg = s.charAt(skipSpace(s, k)) === '{' ? readBalanced(s, skipSpace(s, k)) : { end: k + 1 };
        return { html: '', modifier: true, end: eArg.end };
      }

      /* 定界符 */
      case 'left': case 'right': {
        k = skipSpace(s, k);
        var d = s.charAt(k);
        var skip = (d === '\\') ? 2 : 1;
        var html = (d === '.' || d === '') ? '' :
          '<span class="m-delim m-delim-1">' + esc(d) + '</span>';
        return { html: html, end: k + skip };
      }
      case 'big': case 'Big': case 'bigg': case 'Bigg': case 'bigl': case 'bigr':
      case 'Bigl': case 'Bigr': case 'biggl': case 'biggr': {
        k = skipSpace(s, k);
        var d2 = s.charAt(k);
        var size = (name === 'Big' || name === 'Bigl' || name === 'Bigr') ? ' m-delim-2'
                 : (name.indexOf('bigg') === 0 || name === 'Bigg') ? ' m-delim-3' : ' m-delim-1';
        var h2 = (d2 === '.' || d2 === '') ? '' : '<span class="m-delim' + size + '">' + esc(d2) + '</span>';
        return { html: h2, end: k + (d2 === '' ? 0 : 1) };
      }

      /* 修饰类命令：不产生可见内容 */
      case 'limits': case 'nolimits': case 'displaystyle': case 'textstyle':
      case 'quad_skip':
        return { html: '', modifier: true, end: k };

      /* 间距 */
      case 'quad': return { html: '<span class="m-sp m-sp-quad"></span>', end: k };
      case 'qquad': return { html: '<span class="m-sp m-sp-quad"></span><span class="m-sp m-sp-quad"></span>', end: k };
      case ',': return { html: '<span class="m-sp m-sp-thin"></span>', end: k };
      case ':': case ';': case '>': return { html: '<span class="m-sp m-sp-mid"></span>', end: k };
      case '!': return { html: '<span class="m-sp m-sp-neg"></span>', end: k };
      case ' ': case '\t': return { html: ' ', end: k };

      /* 换行（非 aligned 环境） */
      case '\\': return { html: '<br>', end: k };

      /* 转义字符 */
      case '{': case '}': case '$': case '&': case '%': case '#': case '_': case ' ':
        return { html: esc(name), end: k };
    }

    if (BIGOP[name]) return { html: '<span class="m-bigop" data-limits="1">' + BIGOP[name] + '</span>', end: k };
    if (FN[name]) {
      var isLim = !!LIMIT_FN[name];
      return {
        html: '<span class="m-fn' + (isLim ? ' m-lim' : '') + '"' + (isLim ? ' data-limits="1"' : '') + '>' +
              esc(FN[name]) + '</span>',
        end: k
      };
    }
    if (SYM[name] != null) {
      return { html: '<span class="m-sym' + (REL[name] ? ' m-rel' : '') + '">' + SYM[name] + '</span>', end: k };
    }

    /* 未知命令：按正体文本输出（容错，不抛异常） */
    return { html: '<span class="m-text">' + esc(name) + '</span>', end: k };
  }

  /* 读取一个参数（分组或单个原子） */
  function readArg(s, i, ctx) {
    i = skipSpace(s, i);
    if (i >= s.length) return { html: '', end: i };
    return parseOne(s, i, ctx);
  }

  /* 上下标 */
  function attachScript(base, sup, sub, ctx) {
    var under = ctx.display && base.indexOf('data-limits') !== -1;
    if (under) {
      /* 顺序：上标 → 主体 → 下标（下标在下方） */
      return '<span class="m-uo">' +
        (above(sup)) + '<span class="m-uo-base">' + base + '</span>' + (above(sub)) +
      '</span>';
    }
    if (sup && sub) {
      return '<span class="m-script"><span class="m-base">' + base + '</span>' +
        '<span class="m-ss"><span class="m-sup">' + sup + '</span>' +
        '<span class="m-sub">' + sub + '</span></span></span>';
    }
    if (sup) return '<span class="m-script"><span class="m-base">' + base + '</span><span class="m-sup">' + sup + '</span></span>';
    if (sub) return '<span class="m-script"><span class="m-base">' + base + '</span><span class="m-sub">' + sub + '</span></span>';
    return base;
  }

  function above(h) { return h ? '<span class="m-uo-side">' + h + '</span>' : ''; }

  /* ---------------- 序列 ---------------- */

  function parseSeq(src, ctx) {
    var out = [];
    var i = 0, n = src.length;

    while (i < n) {
      if (isSpace(src.charAt(i))) { i++; continue; }

      var a = parseOne(src, i, ctx);
      if (!a) { i++; continue; }
      i = a.end;

      /* \limits 这类修饰命令：其后的上下标归属前一个原子 */
      var target = a.modifier ? out.length - 1 : -1;

      /* 紧跟的上下标（可同时出现 ^ 与 _） */
      var sup = null, sub = null, has = false;
      for (;;) {
        var j = skipSpace(src, i);
        var c = src.charAt(j);
        if (c !== '^' && c !== '_') break;
        has = true;
        var arg = readArg(src, j + 1, ctx);
        i = arg.end;
        if (c === '^') { if (sup == null) sup = arg.html; }
        else { if (sub == null) sub = arg.html; }
      }

      if (!a.modifier) out.push(has ? attachScript(a.html, sup, sub, ctx) : a.html);
      else if (has && target >= 0) out[target] = attachScript(out[target], sup, sub, ctx);
    }
    return out;
  }

  function seq(src, ctx) { return parseSeq(String(src == null ? '' : src), ctx).join(''); }

  /* ---------------- 环境（aligned 等多行结构） ---------------- */

  function splitTop(s, sep) {
    var out = [], depth = 0, i = 0, start = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\') {
        if (sep === '\\\\' && s.charAt(i + 1) === '\\') {
          out.push(s.slice(start, i)); i += 2; start = i; continue;
        }
        i += 2; continue;
      }
      if (c === '{') depth++;
      else if (c === '}') { if (depth > 0) depth--; }
      else if (c === '&' && sep === '&' && depth === 0) {
        out.push(s.slice(start, i)); i++; start = i; continue;
      }
      i++;
    }
    out.push(s.slice(start));
    return out;
  }

  var ENV_MULTI = { aligned: 1, align: 1, alignedat: 1, array: 1, cases: 1,
                    matrix: 1, pmatrix: 1, bmatrix: 1, vmatrix: 1, gathered: 1 };

  function renderEnv(env, body, ctx) {
    var key = env.replace(/\d+$/, '');
    if (!ENV_MULTI[key] && !ENV_MULTI[env]) return seq(body, ctx);

    var rows = splitTop(body, '\\\\');
    var html = '<span class="m-env m-env-' + key + '">';
    for (var r = 0; r < rows.length; r++) {
      var cells = splitTop(rows[r], '&');
      var empty = true;
      for (var e = 0; e < cells.length; e++) if (cells[e].replace(/\s/g, '')) empty = false;
      if (empty) continue;
      html += '<span class="m-env-row">';
      for (var c = 0; c < cells.length; c++) {
        html += '<span class="m-env-cell">' + seq(cells[c], ctx) + '</span>';
      }
      html += '</span>';
    }
    return html + '</span>';
  }

  /* ---------------- 对外接口 ---------------- */

  function render(tex, display) {
    var source = tex == null ? '' : String(tex);
    try {
      var ctx = { display: !!display };
      var body = parseSeq(source, ctx).join('');
      return '<span class="math' + (ctx.display ? ' math-display' : '') + '">' + body + '</span>';
    } catch (e) {
      return '<span class="math math-error">' + esc(source) + '</span>';
    }
  }

  global.NoteMath = { render: render, symbols: SYM };

})(window);
