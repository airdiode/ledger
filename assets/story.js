/* 百年账本 · 产品原型 v0.1
   主线：物价 → 购买力。只用生活费指数，不做「实际工资」（数据不存在）。
*/
(function () {
  'use strict';

  var D = window.LEDGER;
  if (!D) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">数据未加载。</p>'); return; }

  /* ---------- 数据整理 ---------- */
  var CANON = [
    [/^总/, '总指数'],
    [/^食物|^食品/, '食物'],
    [/^衣|^服/, '衣着'],
    [/^房/, '房租'],
    [/^燃料/, '燃料'],
    [/^杂/, '杂项']
  ];
  function canon(g) {
    for (var i = 0; i < CANON.length; i++) if (CANON[i][0].test(g)) return CANON[i][1];
    return g;
  }
  var GROUPS = ['总指数', '食物', '衣着', '房租', '燃料', '杂项'];

  var life = D.series.filter(function (s) { return s.cat === '生活费指数'; });
  var best = {};                      // key: city|canon  -> series（取最长）
  life.forEach(function (s) {
    var k = s.region + '|' + canon(s.group);
    if (!best[k] || best[k].n < s.n) best[k] = s;
  });

  var cities = [];
  Object.keys(best).forEach(function (k) {
    var c = k.split('|')[0];
    if (k.split('|')[1] === '总指数' && cities.indexOf(c) < 0) cities.push(c);
  });
  // 只保留分项齐全的城市，县级/单分项序列不上主界面
  cities = cities.filter(function (c) {
    return GROUPS.filter(function (g) { return !!best[c + '|' + g]; }).length >= 3;
  });
  var CITY_ORDER = ['上海', '北平', '天津', '南京', '南宁'];
  cities.sort(function (a, b) {
    return (CITY_ORDER.indexOf(a) + 1 || 99) - (CITY_ORDER.indexOf(b) + 1 || 99);
  });

  var COLOR = { '上海': '#7A3B3B', '北平': '#574581', '天津': '#8A5A2B', '南京': '#1F5F6B', '南宁': '#3F6B45' };
  var DASH = { '上海': '', '北平': '6 4', '天津': '2 3', '南京': '3 3', '南宁': '1 0' };

  /* ---------- 工具 ---------- */
  function pts(s) {
    var sc = Math.pow(10, s.dp);
    return s.p.map(function (p) { return { m: s.x0 + p[0], v: p[1] / sc }; });
  }
  function yOf(m) { return Math.floor(m / 12); }
  function moOf(m) { return m % 12 + 1; }
  function nearest(P, m) {
    if (!P.length) return null;
    var lo = 0, hi = P.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (P[mid].m < m) lo = mid + 1; else hi = mid; }
    var a = P[Math.max(0, lo - 1)], b = P[lo];
    return Math.abs(a.m - m) <= Math.abs(b.m - m) ? a : b;
  }
  function wrap(s, w) {
    var out = [], line = '';
    s.split('').forEach(function (ch) {
      if (line.length >= w) { out.push(line); line = ''; }
      line += ch;
    });
    if (line) out.push(line);
    return out;
  }

  /* ---------- 状态 ---------- */
  var state = { city: cities[0], group: '总指数', year: 0, pin: false };

  function cur() { return best[state.city + '|' + state.group] || null; }
  function groupsOf(city) {
    return GROUPS.filter(function (g) { return !!best[city + '|' + g]; });
  }

  /* ---------- 图元 ---------- */
  function niceTicks(lo, hi, n) {
    var span = hi - lo;
    if (!(span > 0)) return [lo];
    var raw = span / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag, step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var start = Math.ceil(lo / step) * step, out = [];
    for (var v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  function robustDomain(seriesList, frac) {
    var all = [];
    seriesList.forEach(function (s) { all = all.concat(s.P.map(function (p) { return p.v; })); });
    all.sort(function (a, b) { return a - b; });
    if (all.length < 8) return [all[0], all[all.length - 1]];
    var f = frac == null ? 0.02 : frac;
    return [all[Math.floor(all.length * f)], all[Math.min(all.length - 1, Math.ceil(all.length * (1 - f))) ]];
  }

  var CLIP_N = 0;

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function drawLine(host, seriesList, opt) {
    opt = opt || {};
    var W = Math.max(280, host.clientWidth);
    var H = opt.height || 380;
    var padL = opt.padL == null ? 46 : opt.padL;
    var padR = opt.padR == null ? (opt.endLabels ? 76 : 16) : opt.padR;
    // 事件标签只在宽屏显示；窄屏不留标签的空白
    var showEvLabels = W >= 700;
    var padT = (opt.events && opt.events.length && showEvLabels) ? 52 : 14;
    var padB = opt.showX === false ? 12 : 30;

    var all = [];
    seriesList.forEach(function (s) { all = all.concat(s.P); });
    var x0 = Math.min.apply(null, all.map(function (p) { return p.m; }));
    var x1 = Math.max.apply(null, all.map(function (p) { return p.m; }));
    // 刻度只由「未被标记为疑误」的点决定：否则单个错值会把整条曲线压平
    var clean = [];
    seriesList.forEach(function (s) {
      var skip = {};
      (s.out || []).forEach(function (i) { skip[i] = 1; });
      s.P.forEach(function (p, i) { if (!skip[i]) clean.push(p.v); });
    });
    clean.sort(function (a, b) { return a - b; });
    var d;
    if (opt.robust === 0 || clean.length < 8) {
      d = [clean[0], clean[clean.length - 1]];
    } else {
      d = [clean[Math.floor(clean.length * 0.02)],
           clean[Math.min(clean.length - 1, Math.ceil(clean.length * 0.98))]];
    }
    var lo = d[0], hi = d[1];
    if (!(hi > lo)) { hi = lo + 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    if (opt.minZero && lo < 0) lo = 0;

    function X(m) { return padL + (W - padL - padR) * (x1 === x0 ? 0.5 : (m - x0) / (x1 - x0)); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo)); }

    host.innerHTML = '';
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
      role: 'img', 'aria-label': opt.label || ''
    });
    var title = svgEl('title', {});
    title.textContent = opt.label || '';
    svg.appendChild(title);

    var cid = 'clip' + (++CLIP_N);
    var defs = svgEl('defs', {});
    var cp = svgEl('clipPath', { id: cid });
    cp.appendChild(svgEl('rect', {
      x: padL, y: padT, width: Math.max(0, W - padL - padR), height: Math.max(0, H - padT - padB)
    }));
    defs.appendChild(cp);
    svg.appendChild(defs);
    var plot = svgEl('g', { 'clip-path': 'url(#' + cid + ')' });
    svg.appendChild(plot);

    // 分段底色：标出「加速期」
    if (opt.band) {
      var bm = /^(\d{4})-(\d{2})$/.exec(opt.band.from);
      if (bm) {
        var bx = X((+bm[1]) * 12 + (+bm[2]) - 1);
        if (bx < W - padR) {
          svg.appendChild(svgEl('rect', {
            x: bx, y: padT, width: Math.max(0, W - padR - bx), height: H - padT - padB,
            fill: 'rgba(43,43,40,.045)'
          }));
          var bl = svgEl('text', {
            x: bx + 6, y: H - padB - 7, 'font-size': 10.5, fill: '#737068', 'letter-spacing': '.06em'
          });
          bl.textContent = opt.band.label || '';
          svg.appendChild(bl);
        }
      }
    }

    // y 网格 + 刻度
    var tickVals = niceTicks(lo, hi, 4);
    tickVals.forEach(function (v) {
      var y = Y(v);
      svg.appendChild(svgEl('line', {
        x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'rgba(43,43,40,.08)', 'stroke-width': 1
      }));
      var t = svgEl('text', {
        x: padL - 10, y: y + 3.5, 'text-anchor': 'end',
        'font-size': 10.5, fill: '#737068', 'letter-spacing': '.08em'
      });
      t.textContent = v.toFixed(0);
      svg.appendChild(t);
    });

    // x 刻度：每 2 年
    if (opt.showX !== false) {
      var y0 = yOf(x0), y1 = yOf(x1), step = (y1 - y0) > 18 ? 5 : (y1 - y0) > 8 ? 2 : 1;
      for (var yy = y0; yy <= y1; yy++) {
        if (yy % step !== 0) continue;
        var m = yy * 12, x = X(m);
        if (x < padL - 1 || x > W - padR + 1) continue;
        svg.appendChild(svgEl('line', {
          x1: x, x2: x, y1: H - padB, y2: H - padB + 4, stroke: 'rgba(43,43,40,.18)', 'stroke-width': 1
        }));
        var tx = svgEl('text', {
          x: x, y: H - padB + 18, 'text-anchor': 'middle',
          'font-size': 10.5, fill: '#737068', 'letter-spacing': '.12em'
        });
        tx.textContent = yy;
        svg.appendChild(tx);
      }
    }

    // 同期历史事件：竖线 + 交错标签，仅作时间参照
    if (opt.events && opt.events.length) {
      var evs = opt.events
        .map(function (e) {
          var mm = /^(\d{4})-(\d{2})$/.exec(e.d);
          if (!mm) return null;
          return { m: (+mm[1]) * 12 + (+mm[2]) - 1, n: e.n, t: e.t, d: e.d };
        })
        .filter(function (e) { return e && e.m >= x0 && e.m <= x1; })
        .sort(function (a, b) { return a.m - b.m; });

      var rowX = [-1e9, -1e9];
      var showLabels = showEvLabels;
      evs.forEach(function (e) {
        var x = X(e.m);
        var g = svgEl('g', {});
        var ti = svgEl('title', {});
        ti.textContent = e.d + ' ' + e.n + '——' + e.t + '（同期事件，非因果）';
        g.appendChild(ti);
        g.appendChild(svgEl('line', {
          x1: x, x2: x, y1: padT - 4, y2: H - padB,
          stroke: 'rgba(43,43,40,.20)', 'stroke-width': 1, 'stroke-dasharray': '2 3'
        }));
        if (showLabels) {
          var row = (x - rowX[0] > 76) ? 0 : (x - rowX[1] > 76 ? 1 : -1);
          if (row >= 0) {
            rowX[row] = x;
            var tx = svgEl('text', {
              x: x, y: padT - (row === 0 ? 30 : 15), 'text-anchor': 'middle',
              'font-size': 10.5, fill: '#737068', 'letter-spacing': '.04em'
            });
            tx.textContent = e.n;
            g.appendChild(tx);
          }
        }
        svg.appendChild(g);
      });
    }

    // 线（断档即断开）
    seriesList.forEach(function (s) {
      var segs = [], curSeg = [];
      var skipP = {};
      (s.out || []).forEach(function (i) { skipP[i] = 1; });
      s.P.forEach(function (p, i) {
        // 疑误值不参与连线：线在此断开，位置由边缘空心圈标出
        if (skipP[i]) { if (curSeg.length > 1) segs.push(curSeg); curSeg = []; return; }
        if (i > 0 && p.m - s.P[i - 1].m > 1) { if (curSeg.length > 1) segs.push(curSeg); curSeg = []; }
        curSeg.push(X(p.m).toFixed(1) + ',' + Y(p.v).toFixed(1));
      });
      if (curSeg.length > 1) segs.push(curSeg);
      segs.forEach(function (seg) {
        plot.appendChild(svgEl('polyline', {
          points: seg.join(' '), fill: 'none', stroke: s.color,
          'stroke-width': 1.25, 'stroke-dasharray': s.dash || 'none',
          'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
      });
      // 断档端点：空心
      s.P.forEach(function (p, i) {
        var brk = (i > 0 && p.m - s.P[i - 1].m > 1) || (i < s.P.length - 1 && s.P[i + 1].m - p.m > 1);
        if (brk) plot.appendChild(svgEl('circle', {
          cx: X(p.m), cy: Y(p.v), r: 2.6, fill: '#FBF9F4', stroke: s.color, 'stroke-width': 1
        }));
      });
      // 疑误值：空心虚线圈；超出刻度时钳到边缘并标注真实值
      (s.out || []).forEach(function (oi) {
        var p = s.P[oi];
        if (!p) return;
        var x = X(p.m);
        var yTrue = Y(p.v);
        var y = Math.max(padT + 4, Math.min(H - padB - 4, yTrue));
        var g = svgEl('g', {});
        var ti = svgEl('title', {});
        ti.textContent = yOf(p.m) + '.' + moOf(p.m) + '　值 ' + p.v +
          (yTrue !== y ? '（超出刻度）' : '') + '——源表疑似小数点错位，原值保留';
        g.appendChild(ti);
        g.appendChild(svgEl('circle', {
          cx: x, cy: y, r: 3.4, fill: '#FBF9F4', stroke: '#8C3B3B',
          'stroke-width': 1, 'stroke-dasharray': '2 2'
        }));
        if (yTrue !== y) {
          var dir = yTrue < y ? -1 : 1;   // 上方超出 / 下方超出
          g.appendChild(svgEl('path', {
            d: 'M' + (x - 3) + ' ' + (y + dir * 3) + 'L' + x + ' ' + (y + dir * 7) +
               'L' + (x + 3) + ' ' + (y + dir * 3),
            fill: 'none', stroke: '#8C3B3B', 'stroke-width': 1
          }));
        }
        plot.appendChild(g);
      });

      // 末端标注（简单避让：按钮按 y 排序后逐个下推）
      if (opt.endLabels && s.P.length) {
        var last = s.P[s.P.length - 1];
        s._lx = X(last.m) + 6;
        s._ly = Y(last.v) + 3.5;
      }
    });

    if (opt.yLabel) {
      var yl = svgEl('text', {
        x: padL - 10, y: padT - 4, 'text-anchor': 'start',
        'font-size': 10.5, fill: '#737068', 'letter-spacing': '.12em'
      });
      yl.textContent = opt.yLabel;
      svg.appendChild(yl);
    }

    if (opt.endLabels) {
      var labs = seriesList.filter(function (x) { return x._ly != null; })
        .sort(function (a, b) { return a._ly - b._ly; });
      for (var li2 = 1; li2 < labs.length; li2++) {
        if (labs[li2]._ly - labs[li2 - 1]._ly < 13) labs[li2]._ly = labs[li2 - 1]._ly + 13;
      }
      labs.forEach(function (x) {
        var el = svgEl('text', {
          x: x._lx, y: x._ly, 'font-size': 11.5, fill: x.color, 'letter-spacing': '.06em'
        });
        el.textContent = x.label;
        svg.appendChild(el);
      });
    }

    host.appendChild(svg);
    return { X: X, Y: Y, W: W, H: H, padL: padL, padR: padR, padT: padT, padB: padB, x0: x0, x1: x1, lo: lo, hi: hi, svg: svg };
  }

  /* ---------- 城市/分项 chips ---------- */
  function renderCities() {
    var host = document.getElementById('cities');
    host.innerHTML = '';
    cities.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.setAttribute('aria-pressed', String(c === state.city));
      b.onclick = function () {
        state.city = c;
        var gs = groupsOf(c);
        if (gs.indexOf(state.group) < 0) state.group = '总指数';
        syncYearRange();
        renderAll();
      };
      host.appendChild(b);
    });
  }

  function renderGroups() {
    var host = document.getElementById('groups');
    host.innerHTML = '';
    var avail = groupsOf(state.city);
    GROUPS.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = g;
      var has = avail.indexOf(g) >= 0;
      b.disabled = !has;
      b.setAttribute('aria-pressed', String(g === state.group && has));
      if (has) {
        b.onclick = function () {
          state.group = g;
          syncYearRange();
          renderAll();
        };
      }
      host.appendChild(b);
    });
  }

  /* ---------- 年份滑杆 ---------- */
  var yearInput = document.getElementById('year');
  function syncYearRange() {
    var s = cur();
    if (!s) return;
    var P = pts(s);
    var lo = yOf(P[0].m), hi = yOf(P[P.length - 1].m);
    yearInput.min = lo; yearInput.max = hi;
    if (state.year < lo || state.year > hi) state.year = Math.round((lo + hi) / 2);
    yearInput.value = state.year;
    var ticks = document.getElementById('yearticks');
    var n = 5, out = '';
    for (var i = 0; i < n; i++) out += '<span>' + Math.round(lo + (hi - lo) * i / (n - 1)) + '</span>';
    ticks.innerHTML = out;
  }
  yearInput.addEventListener('input', function () {
    state.year = parseInt(yearInput.value, 10);
    renderHero();
    renderReadout();
  });

  /* ---------- 主图 ---------- */
  var heroHost = document.getElementById('hero');
  var heroGeo = null;

  function seriesForHero() {
    var s = cur();
    if (!s) return [];
    return [{
      P: pts(s), color: COLOR[state.city] || '#7A3B3B', dash: '',
      rng: s.rng, label: state.city, src: s, out: s.out || []
    }];
  }

  function renderHero() {
    var list = seriesForHero();
    if (!list.length) { heroHost.innerHTML = ''; return; }
    var s = list[0].src;
    var titleTxt = state.city + ' · ' + state.group + '指数';
    document.getElementById('chart-title').textContent = titleTxt;
    document.getElementById('base-note').textContent = s.base
      ? ('基期 ' + s.base + ' = 100' +
         (s.bv && s.bv !== 100 ? '（源表作 =' + s.bv + '，已换算）' : ''))
      : '基期未注明（源表未列出）';

    var outN = (s.out || []).length;
    var noteEl = document.getElementById('outlier-note');
    if (noteEl) {
      if (outN) {
        var vals = s.out.map(function (i) { return s.p[i][1] / Math.pow(10, s.dp); });
        noteEl.hidden = false;
        noteEl.innerHTML = '○ ' + outN + ' 个源表疑误值（' +
          vals.slice(0, 3).map(function (v) { return v.toFixed(v >= 100 ? 0 : 1); }).join('、') +
          (vals.length > 3 ? ' 等' : '') +
          '）：疑似小数点错位，<b>原值保留、未参与刻度计算</b>，空心圈标出位置。';
      } else {
        noteEl.hidden = true;
        noteEl.textContent = '';
      }
    }

    heroGeo = drawLine(heroHost, list, {
      height: 380, yLabel: '指数（基期 = 100）', robust: 0,
      events: (window.LEDGER_EVENTS || []),
      band: { from: '1937-07', label: '1937.7 之后：年均 40%' },
      label: titleTxt + '，' + s.from + ' 至 ' + s.to + '，基期 ' + (s.base || '未注明') + '=100',
      minZero: false
    });

    // 游标
    var P = list[0].P;
    var target = state.year * 12;
    var p = nearest(P, target);
    if (!p) return;
    var X = heroGeo.X, Y = heroGeo.Y, svg = heroGeo.svg;
    svg.appendChild(svgEl('line', {
      x1: X(p.m), x2: X(p.m), y1: heroGeo.padT, y2: heroGeo.H - heroGeo.padB,
      stroke: 'rgba(43,43,40,.18)', 'stroke-width': 1
    }));
    svg.appendChild(svgEl('circle', {
      cx: X(p.m), cy: Y(p.v), r: 3.5, fill: '#FBF9F4',
      stroke: COLOR[state.city], 'stroke-width': 1.5
    }));
    var lab = svgEl('text', {
      x: X(p.m) + 8, y: Math.max(heroGeo.padT + 10, Y(p.v) - 10),
      'font-size': 12.5, fill: '#2B2B28', 'letter-spacing': '.04em'
    });
    lab.textContent = yOf(p.m) + ' 年 ' + moOf(p.m) + ' 月 · ' + p.v.toFixed(1);
    svg.appendChild(lab);
  }

  /* ---------- 读数 ---------- */
  function renderReadout() {
    var s = cur();
    var host = document.getElementById('readout');
    if (!s) { host.innerHTML = ''; return; }
    var P = pts(s);
    var p = nearest(P, state.year * 12);
    if (!p) { host.innerHTML = ''; return; }

    var hasBase = !!s.base;
    var pp = hasBase ? 100 / p.v : null;

    // 同比（与 12 个月前最近点）
    var prev = nearest(P, p.m - 12);
    var yoy = (prev && prev.m !== p.m && Math.abs(prev.m - p.m) >= 11) ? (p.v / prev.v - 1) * 100 : null;

    var html = '';
    html += '<div><div class="big">' + p.v.toFixed(1) +
            '<small>指数 · 基期 ' + (s.base || '未注明') + '</small></div></div>';

    if (hasBase) {
      html += '<div class="fact">这一年的一块钱<br><b>≈ 基期年的 ' + pp.toFixed(2) + ' 元</b></div>';
    } else {
      html += '<div class="fact warn">源表未注明基期<br>无法换算成「多少钱」</div>';
    }
    html += '<div class="fact">与一年前相比<br><b>' +
      (yoy === null ? '—（无相邻年份数据）' : (yoy >= 0 ? '涨 ' : '跌 ') + Math.abs(yoy).toFixed(1) + '%') +
      '</b></div>';
    html += '<div class="fact">时间<br><b>' + yOf(p.m) + ' 年 ' + moOf(p.m) + ' 月</b></div>';

    host.innerHTML = html;
  }

  /* ---------- 城市对比 ---------- */
  function renderCompare() {
    var REF_YEAR = 1931;
    // 只比共同可比区间：1931–1937（此后各城断裂或进入战时通胀，不可同图比较）
    var XMIN = 1931 * 12, XMAX = 1937 * 12 + 11;
    var list = [], legend = document.getElementById('cmp-legend');
    legend.innerHTML = '';

    ['上海', '北平', '南京', '南宁'].forEach(function (c) {
      var s = best[c + '|总指数'];
      if (!s) return;
      var P = pts(s).filter(function (p) { return p.m >= XMIN && p.m <= XMAX; });
      if (!P.length) return;
      var ref = nearest(P, REF_YEAR * 12);
      if (!ref) return;
      var scaled = P.map(function (p) { return { m: p.m, v: p.v / ref.v * 100 }; });
      list.push({
        P: scaled, color: COLOR[c], dash: DASH[c], label: c,
        rng: [ref.v > 0 ? Math.min.apply(null, scaled.map(function (p) { return p.v; })) : 0,
              Math.max.apply(null, scaled.map(function (p) { return p.v; }))]
      });
      var li = document.createElement('li');
      li.innerHTML =
        '<svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" ' +
        'stroke="' + COLOR[c] + '" stroke-width="1.25" stroke-dasharray="' + (DASH[c] || 'none') + '"/></svg>' +
        c + ' <span style="color:#737068">（源基期 ' + (s.base || '未注明') + '）</span>';
      legend.appendChild(li);
    });

    if (!list.length) return;
    // 统一 y 域，保证可比
    var lo = Infinity, hi = -Infinity;
    list.forEach(function (s) {
      s.P.forEach(function (p) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
    });
    list.forEach(function (s) { s.rng = [lo, hi]; });

    drawLine(document.getElementById('compare'), list, {
      height: 232, endLabels: true, robust: 0,
      label: '四城生活费总指数，以 1931 年 = 100 换算后比较'
    });
  }

  /* ---------- 小倍数 ---------- */
  function renderMultiples() {
    var host = document.getElementById('multiples');
    host.innerHTML = '';
    GROUPS.slice(1).forEach(function (g) {
      var s = best[state.city + '|' + g];
      var cell = document.createElement('div');
      cell.className = 'cell' + (s ? '' : ' off');
      if (!s) {
        cell.innerHTML = '<div style="height:72px"></div><p class="t">' + g +
          '</p><p class="m">该城无此分项</p>';
        host.appendChild(cell);
        return;
      }
      var P = pts(s);
      var W = 220, H = 72, pad = 4;
      var xs = P.map(function (p) { return p.m; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var lo = s.rng ? s.rng[0] : Math.min.apply(null, P.map(function (p) { return p.v; }));
      var hi = s.rng ? s.rng[1] : Math.max.apply(null, P.map(function (p) { return p.v; }));
      function X(m) { return pad + (W - 2 * pad) * (x1 === x0 ? .5 : (m - x0) / (x1 - x0)); }
      function Y(v) { return pad + (H - 2 * pad) * (1 - Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))); }
      var segs = [], curSeg = [];
      P.forEach(function (p, i) {
        if (i > 0 && p.m - P[i - 1].m > 1) { if (curSeg.length > 1) segs.push(curSeg); curSeg = []; }
        curSeg.push(X(p.m).toFixed(1) + ',' + Y(p.v).toFixed(1));
      });
      if (curSeg.length > 1) segs.push(curSeg);
      var paths = segs.map(function (seg) {
        return '<polyline fill="none" stroke="' + (COLOR[state.city] || '#AC8750') +
          '" stroke-width="0.9" points="' + seg.join(' ') + '"/>';
      }).join('');
      // 用「首末年平均值」而不是首末单月，和正文口径一致
      function yearMean(list) {
        var acc = {}, n = {};
        list.forEach(function (p) {
          var y = yOf(p.m);
          acc[y] = (acc[y] || 0) + p.v; n[y] = (n[y] || 0) + 1;
        });
        var ys = Object.keys(acc).map(Number).sort(function (a, b) { return a - b; });
        return { y0: ys[0], y1: ys[ys.length - 1], a: acc[ys[0]] / n[ys[0]], b: acc[ys[ys.length - 1]] / n[ys[ys.length - 1]] };
      }
      var ym = yearMean(P);
      var ratio = ym.a > 0 ? ym.b / ym.a : NaN;
      var chg = isFinite(ratio)
        ? (ratio >= 1 ? '×' + ratio.toFixed(1) : '÷' + (1 / ratio).toFixed(1))
        : '—';
      cell.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
        state.city + g + '指数走势">' + paths + '</svg>' +
        '<p class="t">' + g + (g === state.group ? ' ●' : '') + '</p>' +
        '<p class="m">' + ym.y0 + '–' + ym.y1 + ' · ' + chg + '</p>';
      host.appendChild(cell);
    });
  }

  /* ---------- 汇总渲染 ---------- */
  function renderAll() {
    renderCities();
    renderGroups();
    syncYearRange();
    renderHero();
    renderReadout();
    renderCompare();
    renderMultiples();
    renderBasket();
    renderEventList();
  }

  /* ---------- 购物篮 ---------- */
  var B = window.LEDGER_BASKET;
  var bidx = 0;
  var bq = /[?&]basket=(\d+)/.exec(location.search);
  if (bq) bidx = Math.min(parseInt(bq[1], 10) || 0, (B ? B.snapshots.length - 1 : 0));

  function renderBasketChips() {
    var host = document.getElementById('baskets');
    if (!host || !B) return;
    host.innerHTML = '';
    B.snapshots.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.year + ' · ' + s.city;
      b.setAttribute('aria-pressed', String(i === bidx));
      b.onclick = function () { bidx = i; renderBasket(); };
      host.appendChild(b);
    });
  }

  function renderBasket() {
    if (!B) return;
    var s = B.snapshots[bidx];
    renderBasketChips();

    document.getElementById('basket-meta').textContent =
      s.city + ' · ' + s.year + ' 年 · 计价货币：' + s.currency + ' · 该年可算商品 ' + s.n + ' 项';

    // 按品类顺序（米面盐油肉糖燃料布），斤在前、尺在后
    function fmtQty(v) {
      return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    }

    var items = s.staples.filter(function (x) { return x.dim === '斤'; })
      .concat(s.staples.filter(function (x) { return x.dim !== '斤'; }));
    var maxLog = 0;
    items.forEach(function (it) { maxLog = Math.max(maxLog, Math.log10(1 + (it.om || it.o))); });

    var host = document.getElementById('basket-list');
    host.innerHTML = items.map(function (it) {
      var qty = it.om ? (fmtQty(it.o) + '–' + fmtQty(it.om)) : fmtQty(it.o);
      var w = maxLog > 0 ? (Math.log10(1 + (it.om || it.o)) / maxLog * 100) : 0;
      return '<div class="brow">' +
        '<div class="nm">' + it.n + '<i>' + it.cat + '</i></div>' +
        '<div class="barwrap"><div class="bar" style="width:' + w.toFixed(1) + '%;' +
        (it.dim === '尺' ? 'background:#1F5F6B' : '') + '"></div></div>' +
        '<div class="qt">' + qty + '<small>' + it.dim + '</small></div>' +
        '</div>';
    }).join('');

    document.getElementById('basket-note').textContent = s.multiCounty
      ? '数字为各州县「一元可买」的最小值与最大值；条形按对数比例，只示量级。木柴按长度计，不与按重量的项目比较。来源：' + s.source + '。'
      : '来源：' + s.source + '。条形按对数比例，只示量级；斤与尺分开排列，颜色区分量纲。';
  }

  /* ---------- 事件清单（把 hover 才有的说明变成常显可达） ---------- */
  function renderEventList() {
    var host = document.getElementById('event-detail');
    if (!host || !window.LEDGER_EVENTS) return;
    host.innerHTML = window.LEDGER_EVENTS.map(function (e) {
      return '<li><span class="ed">' + e.d.replace('-', '.') + '</span>' +
        '<span class="en">' + e.n + '</span>' +
        '<span class="et">' + e.t + '</span></li>';
    }).join('');
  }

  /* ---------- 尺寸变化 ---------- */
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { renderHero(); renderCompare(); }, 120);
  });

  /* ---------- 启动 ---------- */
  var start = cur();
  if (start) {
    var P0 = pts(start);
    var y0 = yOf(P0[0].m), y1 = yOf(P0[P0.length - 1].m);
    state.year = (1937 >= y0 && 1937 <= y1) ? 1937 : Math.round((y0 + y1) / 2);
  } else {
    state.year = 1930;
  }
  renderAll();

  if (location.search.indexOf('diag') >= 0) {
    setTimeout(function () {
      var out = [];
      document.querySelectorAll('body *').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 || r.width > window.innerWidth + 1) {
          out.push(el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') +
                   ' w=' + Math.round(r.width) + ' right=' + Math.round(r.right));
        }
      });
      var pre = document.createElement('pre');
      pre.id = 'diag';
      pre.textContent = 'vw=' + window.innerWidth + ' scrollW=' + document.documentElement.scrollWidth + ' scrollH=' + document.documentElement.scrollHeight + '\n' +
                        out.slice(0, 14).join('\n');
      document.body.appendChild(pre);
    }, 900);
  }

  // 供验收脚本读取
  window.__APP__ = { cities: cities, state: state, seriesCount: D.series.length };
})();
