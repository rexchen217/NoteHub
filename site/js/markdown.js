/* =====================================================================
   NoteMarkdown — 轻量 Markdown 渲染器（无外部依赖）
   支持：标题 / 段落 / 粗斜体 / 删除线 / 行内代码 / 链接 / 图片
        有序无序列表（含嵌套、任务列表）/ 引用 / 分隔线 / 表格
        行内与行间数学公式（$...$ 与 $$...$$，交给 NoteMath 渲染）
        围栏代码块（调用 NoteHighlight 做语法高亮 + 行号）
   暴露：window.NoteMarkdown.render(md) / renderInline(text) / toPlainText(md)
   ===================================================================== */
(function (global) {
  'use strict';

  var H = global.NoteHighlight;
  var M = global.NoteMath;

  function escapeHtml(s) {
    return H ? H.escapeHtml(s) : String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 行内 ---------------- */

  /* 只放行 color / font-size 两种声明，其余一律丢弃 */
  function safeStyleAttr(raw) {
    var out = [];
    String(raw || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim().toLowerCase();
      var v = decl.slice(i + 1).trim();
      if (k === 'color' && /^#[0-9a-fA-F]{3,8}$/.test(v)) out.push('color:' + v.toLowerCase());
      else if (k === 'font-size' && /^\d{1,3}(?:\.\d+)?px$/.test(v)) out.push('font-size:' + v.toLowerCase());
    });
    return out.join(';');
  }

  /* 图片 / 链接 / 强调（在转义之后执行） */
  function applyInlineMarkup(s) {
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      '<img src="$2" alt="$1" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])__([^_\n]+)__/g, '$1<strong>$2</strong>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s;
  }

  function renderInline(text) {
    if (text == null || text === '') return '';
    var s = String(text);
    var codes = [];
    var maths = [];
    var spans = [];

    // 1. 行内代码先占位（内容保留原始文本，稍后统一转义）
    s = s.replace(/`([^`\n]+)`/g, function (m, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });

    // 2. 抽取数学公式（$$ 优先），保留原始 LaTeX 交给 NoteMath 渲染
    if (M) {
      s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
        maths.push({ tex: tex, display: true });
        return '\u0001' + (maths.length - 1) + '\u0001';
      });
      s = s.replace(/\$([^$\n]+?)\$/g, function (m, tex) {
        maths.push({ tex: tex, display: false });
        return '\u0001' + (maths.length - 1) + '\u0001';
      });
    }

    // 3. 自定义样式 span 先占位（只放行白名单样式，非法的当普通文本）
    s = s.replace(/<span\s+style="([^"]*)">([\s\S]*?)<\/span>/g, function (m, raw, inner) {
      var attr = safeStyleAttr(raw);
      if (!attr) return m;
      spans.push({ attr: attr, inner: inner });
      return '\u0002' + (spans.length - 1) + '\u0002';
    });

    // 4. 整体转义，杜绝注入
    s = escapeHtml(s);

    // 5. 图片 / 链接 / 强调
    s = applyInlineMarkup(s);

    // 6. 换行
    s = s.replace(/\n/g, '<br>');

    // 7. 还原数学公式与行内代码
    function restoreCodeMath(h) {
      h = h.replace(/\u0001(\d+)\u0001/g, function (m, k) {
        var it = maths[+k];
        return it ? M.render(it.tex, it.display) : '';
      });
      return h.replace(/\u0000(\d+)\u0000/g, function (m, k) {
        return '<code class="inline">' + escapeHtml(codes[+k]) + '</code>';
      });
    }
    s = restoreCodeMath(s);

    // 8. 还原样式 span：内部文本走同一套转义与行内语法
    s = s.replace(/\u0002(\d+)\u0002/g, function (m, k) {
      var sp = spans[+k];
      if (!sp) return '';
      var body = escapeHtml(sp.inner);
      body = applyInlineMarkup(body).replace(/\n/g, '<br>');
      body = restoreCodeMath(body);
      return '<span style="' + sp.attr + '">' + body + '</span>';
    });

    return s;
  }

  /* ---------------- 代码块 ---------------- */

  function codeBlockHTML(code, lang) {
    var res = H ? H.highlight(code, lang) : { lang: 'TEXT', lines: code.split('\n') };
    var parts = [];
    for (var i = 0; i < res.lines.length; i++) {
      parts.push(
        '<div class="code-line">' +
          '<span class="code-ln">' + (i + 1) + '</span>' +
          '<span class="code-txt">' + res.lines[i] + '</span>' +
        '</div>'
      );
    }
    return '<div class="code-block">' +
      '<div class="code-head">' +
        '<span class="code-lang">' + escapeHtml(res.lang) + '</span>' +
        '<button class="code-copy" type="button" data-action="copy-code">复制</button>' +
      '</div>' +
      '<div class="code-scroll"><div class="code-lines">' + parts.join('') + '</div></div>' +
    '</div>';
  }

  /* ---------------- 块级 ---------------- */

  var RE_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.:{}-]*)\s*$/;
  var RE_HR = /^\s{0,3}(?:[-*_]\s*){3,}$/;
  var RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var RE_QUOTE = /^\s{0,3}>\s?/;
  var RE_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  var RE_TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

  function isBlockStart(line) {
    return RE_FENCE.test(line) || RE_HR.test(line) || RE_HEAD.test(line) ||
           RE_QUOTE.test(line) || RE_ITEM.test(line);
  }

  function parseList(lines, start) {
    var n = lines.length;
    var i = start;
    var head = lines[i].match(RE_ITEM);
    var baseIndent = head[1].length;

    var root = { indent: baseIndent, ordered: /\d/.test(head[2]), items: [] };
    var stack = [root];

    while (i < n) {
      var line = lines[i];
      if (/^\s*$/.test(line)) {
        // 空行：若其后一行仍属于该列表（缩进 > 基准）则继续，否则结束
        var k = i + 1;
        while (k < n && /^\s*$/.test(lines[k])) k++;
        if (k >= n) break;
        var nxt = lines[k].match(RE_ITEM);
        if (!nxt || nxt[1].length < baseIndent) break;
        i = k;
        continue;
      }

      var m = line.match(RE_ITEM);
      if (m) {
        var indent = m[1].length;
        if (indent < baseIndent) break;

        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();

        var top = stack[stack.length - 1];
        // 同一层级但列表类型（有序/无序）不同 → 结束当前列表，由上层重新开始
        if (indent === top.indent && top.ordered !== /\d/.test(m[2])) break;

        if (indent > top.indent) {
          var parentItem = top.items[top.items.length - 1];
          if (!parentItem) break;
          var lvl = { indent: indent, ordered: /\d/.test(m[2]), items: [] };
          parentItem.subs.push(lvl);
          stack.push(lvl);
          top = lvl;
        }
        top.items.push({ text: m[3], cont: [], subs: [] });
        i++;
        continue;
      }

      // 非列表行：若缩进大于基准，视为上一项的续行
      var ind = line.match(/^\s*/)[0].length;
      if (ind > baseIndent) {
        var cur = stack[stack.length - 1].items[stack[stack.length - 1].items.length - 1];
        if (!cur) break;
        cur.cont.push(line.trim());
        i++;
        continue;
      }
      break;
    }

    return { html: renderLevel(root), next: i };
  }

  function renderLevel(level) {
    var tag = level.ordered ? 'ol' : 'ul';
    var out = '<' + tag + '>';
    for (var k = 0; k < level.items.length; k++) {
      var it = level.items[k];
      var cls = '';
      var body = renderInline(it.text);

      var task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        cls = ' class="task"';
        body = '<input type="checkbox" disabled' + (task[1].toLowerCase() === 'x' ? ' checked' : '') +
               '>' + renderInline(task[2]);
      }
      for (var c = 0; c < it.cont.length; c++) {
        if (it.cont[c]) body += '<br>' + renderInline(it.cont[c]);
      }
      out += '<li' + cls + '>' + body;
      for (var s = 0; s < it.subs.length; s++) out += renderLevel(it.subs[s]);
      out += '</li>';
    }
    return out + '</' + tag + '>';
  }

  function parseTable(lines, start) {
    function cells(row) {
      var s = row.trim();
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
      return s.split('|').map(function (c) { return c.trim(); });
    }
    function alignStyle(a) { return a ? ' style="text-align:' + a + '"' : ''; }

    var head = cells(lines[start]);
    var align = cells(lines[start + 1]).map(function (c) {
      if (!/^:?-+:?$/.test(c)) return null;
      if (c.charAt(0) === ':' && c.charAt(c.length - 1) === ':') return 'center';
      if (c.charAt(c.length - 1) === ':') return 'right';
      return 'left';
    });

    var i = start + 2, rows = [];
    while (i < lines.length && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
      rows.push(cells(lines[i]));
      i++;
    }

    var html = '<table><thead><tr>';
    for (var h = 0; h < head.length; h++) {
      html += '<th' + alignStyle(align[h]) + '>' + renderInline(head[h]) + '</th>';
    }
    html += '</tr></thead>';

    if (rows.length) {
      html += '<tbody>';
      for (var r = 0; r < rows.length; r++) {
        html += '<tr>';
        var cols = Math.max(head.length, rows[r].length);
        for (var c2 = 0; c2 < cols; c2++) {
          html += '<td' + alignStyle(align[c2]) + '>' + renderInline(rows[r][c2] || '') + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody>';
    }
    return { html: html + '</table>', next: i };
  }

  function parseBlocks(lines) {
    var html = [];
    var i = 0;
    var n = lines.length;

    while (i < n) {
      var line = lines[i];

      /* 围栏代码块 */
      var fm = line.match(RE_FENCE);
      if (fm) {
        var fenceChar = fm[1].charAt(0);
        var fenceLen = fm[1].length;
        var lang = (fm[2] || '').replace(/^\{|\}$/g, '');
        var buf = [];
        i++;
        while (i < n) {
          var cm = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
          if (cm && cm[1].charAt(0) === fenceChar && cm[1].length >= fenceLen) { i++; break; }
          buf.push(lines[i]);
          i++;
        }
        html.push(codeBlockHTML(buf.join('\n'), lang));
        continue;
      }

      /* 空行 */
      if (/^\s*$/.test(line)) { i++; continue; }

      /* 分隔线 */
      if (RE_HR.test(line)) { html.push('<hr>'); i++; continue; }

      /* 标题 */
      var hm = line.match(RE_HEAD);
      if (hm) {
        var lvl = hm[1].length;
        html.push('<h' + lvl + '>' + renderInline(hm[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }

      /* 引用 */
      if (RE_QUOTE.test(line)) {
        var q = [];
        while (i < n && (RE_QUOTE.test(lines[i]) || (!/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])))) {
          q.push(lines[i].replace(RE_QUOTE, ''));
          i++;
        }
        html.push('<blockquote>' + parseBlocks(q).join('') + '</blockquote>');
        continue;
      }

      /* 表格 */
      if (line.indexOf('|') !== -1 && i + 1 < n && RE_TABLE_SEP.test(lines[i + 1])) {
        var tb = parseTable(lines, i);
        html.push(tb.html);
        i = tb.next;
        continue;
      }

      /* 列表 */
      if (RE_ITEM.test(line)) {
        var ls = parseList(lines, i);
        html.push(ls.html);
        i = ls.next;
        continue;
      }

      /* 段落 */
      var para = [line];
      i++;
      while (i < n && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      html.push('<p>' + renderInline(para.join('\n')) + '</p>');
    }

    return html;
  }

  /* ---------------- 对外接口 ---------------- */

  function render(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    if (!text.trim()) return '<p class="md-placeholder">左侧输入 Markdown，这里会实时预览。</p>';
    return parseBlocks(text.split('\n')).join('');
  }

  function toPlainText(src) {
    return String(src == null ? '' : src)
      .replace(/<\/?span\b[^>]*>/g, '')
      .replace(/```[\s\S]*?(?:```|$)/g, ' [代码块] ')
      .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' [代码块] ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' [公式] ')
      .replace(/\$[^$\n]*?\$/g, ' [公式] ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [图片] ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*([-*+]|\d{1,9}[.)])\s+/gm, '')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')
      .replace(/[*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  global.NoteMarkdown = {
    render: render,
    renderInline: renderInline,
    toPlainText: toPlainText
  };

})(window);
