/* 百年账本 · 数据包校验器
 * 用法：<script src="validate.js"></script> 后调用 LEDGER_VALIDATE(LEDGER)
 * 只做结构与语义不变量检查，不判断数据"对不对"（那要靠基期均值与人工抽检）。
 */
(function (global) {
  'use strict';

  var BASE_RE = /^(\d{4}(H1|Q[1-4])?|\d{4}-\d{2})$/;

  function decode(s, i) {
    var d = s.p[i][0], raw = s.p[i][1];
    var m = s.x0 + d;
    return { m: m, y: Math.floor(m / 12), mo: m % 12 + 1, v: raw / Math.pow(10, s.dp) };
  }

  function validate(data) {
    var errors = [], warnings = [];
    var S = (data && data.series) || [];
    var ids = Object.create(null);
    var total = 0, byCat = Object.create(null), byRegion = Object.create(null);
    var minY = Infinity, maxY = -Infinity;

    if (!data || !data.meta) errors.push('缺少 meta');
    if (!S.length) errors.push('series 为空');

    S.forEach(function (s, idx) {
      var tag = '[' + (s.id || ('#' + idx)) + '] ';
      if (!s.id) errors.push(tag + '缺少 id');
      else if (ids[s.id]) errors.push(tag + 'id 重复');
      ids[s.id] = 1;

      if (!s.p || !s.p.length) { errors.push(tag + '没有数据点'); return; }
      if (s.n !== s.p.length) errors.push(tag + 'n 与点数不一致：' + s.n + ' vs ' + s.p.length);
      if (typeof s.x0 !== 'number' || typeof s.dp !== 'number') errors.push(tag + 'x0/dp 缺失');
      if (s.dp < 0 || s.dp > 3) errors.push(tag + 'dp 越界：' + s.dp);

      for (var i = 0; i < s.p.length; i++) {
        if (!Array.isArray(s.p[i]) || s.p[i].length !== 2) { errors.push(tag + '点格式错误 @' + i); break; }
        if (typeof s.p[i][1] !== 'number' || !isFinite(s.p[i][1])) { errors.push(tag + '值非有限数 @' + i); break; }
        if (i > 0 && s.p[i][0] <= s.p[i - 1][0]) { errors.push(tag + '月序未严格递增 @' + i); break; }
      }

      var a = decode(s, 0), b = decode(s, s.p.length - 1);
      var fa = a.y + '-' + (a.mo < 10 ? '0' : '') + a.mo;
      var fb = b.y + '-' + (b.mo < 10 ? '0' : '') + b.mo;
      if (s.from !== fa) errors.push(tag + 'from 不符：' + s.from + ' vs ' + fa);
      if (s.to !== fb) errors.push(tag + 'to 不符：' + s.to + ' vs ' + fb);
      if (a.y < 1800 || b.y > 2000) errors.push(tag + '年份越界 ' + fa + '~' + fb);

      if (s.base && !BASE_RE.test(s.base)) warnings.push(tag + 'base 格式异常：' + s.base);
      if (!s.base) warnings.push(tag + '基期未注明');
      if (s.baseSource === 'chain') warnings.push(tag + '连环基期，不可跨期比较');
      if (!s.src || !s.src.file) warnings.push(tag + '缺少源文件');

      if (s.out) {
        s.out.forEach(function (i) {
          if (!(i >= 0 && i < s.p.length)) errors.push(tag + '离群索引越界：' + i);
        });
      }
      if (s.rng) {
        if (!(s.rng.length === 2 && s.rng[0] <= s.rng[1])) errors.push(tag + 'rng 非法');
      }

      total += s.p.length;
      byCat[s.cat] = (byCat[s.cat] || 0) + 1;
      byRegion[s.region] = (byRegion[s.region] || 0) + 1;
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, b.y);
    });

    if (data.meta) {
      if (data.meta.count !== S.length) errors.push('meta.count 与序列数不符');
      if (data.meta.points !== total) errors.push('meta.points 与点数合计不符：' + data.meta.points + ' vs ' + total);
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      stats: { series: S.length, points: total, byCat: byCat, byRegion: byRegion, from: minY, to: maxY }
    };
  }

  global.LEDGER_VALIDATE = validate;
})(typeof window !== 'undefined' ? window : globalThis);
