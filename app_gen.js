/* ============================================================================
 * 浏览器内出题器（一键刷新新题）
 * ----------------------------------------------------------------------------
 * 与 gen_quant.py 同一套规则，移植到 JS 后可在页面里即时出题：
 * 数字推理 / 数学运算 / 资料分析 / 翻译推理。
 *
 * 每题都由「按规则构造答案 + 立刻反向验算」产生，验算不过就丢弃重来，
 * 所以刷新出来的题答案不会错（和构建期那 563 道生成题同一保障机制）。
 *
 * 对外接口：window.EpiGen.refresh(n, topics) / window.EpiGen.selfTest(n)
 * ==========================================================================*/
(function (global) {
  "use strict";

  var rnd = Math.random;              // 可被 selfTest 换成确定性随机
  function setRng(fn) { rnd = fn || Math.random; }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }   // [a,b] 整数
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  function fmt(v, unit) {
    if (typeof v === "number" && !Number.isInteger(v)) v = Math.round(v * 10) / 10;
    return String(v) + (unit || "");
  }

  /* 从候选干扰项里挑 3 个与答案不同、彼此也不同的值 */
  function dedupe(ans, cands, ff) {
    var seen = {}, out = [], i, k;
    seen[ff(ans)] = 1;
    for (i = 0; i < cands.length; i++) {
      k = ff(cands[i]);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(cands[i]);
      if (out.length >= 3) return out;
    }
    if (typeof ans !== "number") return out;   // 答案是字符串/数组时不做数值兜底
    for (i = 1; i <= 40 && out.length < 3; i++) {
      var two = [ans + i, ans - i];
      for (var j = 0; j < 2; j++) {
        try { k = ff(two[j]); } catch (e) { continue; }
        if (seen[k]) continue;
        seen[k] = 1; out.push(two[j]);
        if (out.length >= 3) break;
      }
    }
    return out;
  }

  var stemSeen = Object.create(null);

  /* 组装一道题；check() 为反向验算，不通过就返回 null */
  function build(module, topic, stem, ans, dists, tip, ana, opt) {
    opt = opt || {};
    var ff = opt.ff || function (v) { return fmt(v); };
    var ansS = ff(ans);
    var cands = (dists || []).filter(function (c) { return ff(c) !== ansS; });
    var extra = dedupe(ans, cands, ff);
    if (extra.length < 3) return null;
    var opts = [ans].concat(extra.slice(0, 3));
    // 洗牌
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    var letters = "ABCD", texts = [], answer = "";
    for (i = 0; i < 4; i++) {
      texts.push(ff(opts[i]));
      if (ff(opts[i]) === ansS) answer = letters[i];
    }
    var uniq = {}; texts.forEach(function (t) { uniq[t] = 1; });
    if (Object.keys(uniq).length !== 4 || !answer) return null;
    if (opt.dedupKey ? stemSeen[opt.dedupKey] : stemSeen[stem]) return null;
    if (opt.check && !opt.check()) return null;
    stemSeen[opt.dedupKey || stem] = 1;
    return {
      module: module, topic: topic, source: "新生成", src: "fresh",
      stem: stem,
      options: texts.map(function (t, k) { return { k: letters[k], t: t }; }),
      svg: null, tip: tip, analysis: ana, answer: answer,
      materialTitle: opt.materialTitle || "", materialHtml: opt.materialHtml || "",
      sectionTip: "", moduleTip: ""
    };
  }

  /* ---------------------------------------------------------------- 数字推理 */
  function gArith() {
    var d = pick([-9, -7, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    var a1 = ri(2, 40), t = [], i;
    for (i = 0; i < 6; i++) t.push(a1 + i * d);
    if (t.some(function (x) { return x < -50; })) return null;
    var ok = true; for (i = 0; i < 5; i++) if (t[i + 1] - t[i] !== d) ok = false;
    if (!ok) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + d, t[5] - d, t[5] + 2 * d],
      "先作差：相邻两项之差恒定，就是等差数列。",
      "相邻两项之差恒为 " + d + "，故所求项 = " + t[4] + " + (" + d + ") = " + t[5] + "。");
  }

  function gArith2() {
    var d0 = ri(2, 9), k = pick([2, 3, 4, -2, -3]), diffs = [], t = [ri(1, 15)], i;
    for (i = 0; i < 5; i++) diffs.push(d0 + k * i);
    for (i = 0; i < 5; i++) t.push(t[t.length - 1] + diffs[i]);
    if (t.some(function (x) { return x < -30; }) || t[5] > 900) return null;
    for (i = 0; i < 4; i++) if ((diffs[i + 1] - diffs[i]) !== k) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + k, t[5] - k, t[5] + diffs[3]],
      "一次作差没规律，就再作一次差（二次差恒定即为二级等差）。",
      "一次差为 " + diffs.slice(0, 4).join("、") + "，构成公差为 " + k + " 的等差数列，故下一个差为 " + diffs[4] +
      "，所求项 = " + t[4] + " + " + diffs[4] + " = " + t[5] + "。");
  }

  function gGeo() {
    var r = pick([2, 3, -2]), a1 = pick([1, 2, 3, -1, -2, 4]), t = [], i;
    for (i = 0; i < 6; i++) t.push(a1 * Math.pow(r, i));
    if (Math.abs(t[5]) > 3000) return null;
    for (i = 0; i < 5; i++) if (t[i + 1] !== t[i] * r) return null;
    var third = (t[5] % r === 0) ? t[5] / r : t[5] + 2;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + r, t[5] - r, third],
      "作差无果就看商：相邻两项之比恒定即为等比数列。",
      "相邻两项之比恒为 " + r + "，故所求项 = " + t[4] + " × (" + r + ") = " + t[5] + "。");
  }

  function gRecAdd() {
    var a = ri(1, 12), b = ri(1, 12), t = [a, b], i;
    for (i = 0; i < 4; i++) t.push(t[t.length - 1] + t[t.length - 2]);
    if (t[5] > 3000) return null;
    for (i = 2; i < 6; i++) if (t[i] !== t[i - 1] + t[i - 2]) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + t[4], t[4] + t[3], t[5] - t[4]],
      "看递推：某一项等于前两项之和（斐波那契型）。",
      t[0] + " + " + t[1] + " = " + t[2] + "，" + t[1] + " + " + t[2] + " = " + t[3] +
      "，依此类推，所求项 = " + t[4] + " + " + t[3] + " = " + t[5] + "。");
  }

  function gRecMul() {
    var k = pick([2, 3]), c = pick([-3, -2, -1, 1, 2, 3]), t = [ri(1, 6)], i;
    for (i = 0; i < 5; i++) t.push(t[t.length - 1] * k + c);
    if (t[5] > 5000 || t.some(function (x) { return x < -20; })) return null;
    for (i = 1; i < 6; i++) if (t[i] !== t[i - 1] * k + c) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + k, t[5] - c, t[4] * k],
      "倍数关系叠加减法：用「前一项 × 倍数 + 常数」试探递推。",
      t[0] + " × " + k + " + (" + c + ") = " + t[1] + "，" + t[1] + " × " + k + " + (" + c + ") = " + t[2] +
      "，规律一致，所求项 = " + t[4] + " × " + k + " + (" + c + ") = " + t[5] + "。");
  }

  function gSquare() {
    var c = ri(-6, 12), t = [], i;
    for (i = 0; i < 6; i++) t.push((i + 1) * (i + 1) + c);
    if (t.some(function (x) { return x < 1; })) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + 2, t[5] - 2, Math.floor(t[5] / 2)],
      "数字忽大忽小或增长偏快时，试「平方数列 + 常数偏移」。",
      "各项减去 " + c + " 后为 1、4、9、16、25、36（即 1²—6²），故所求项 = 6² + (" + c + ") = " + t[5] + "。");
  }

  function gCube() {
    var c = ri(-5, 10), t = [], i;
    for (i = 0; i < 6; i++) t.push((i + 1) * (i + 1) * (i + 1) + c);
    if (t.some(function (x) { return x < 1; })) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + 3, t[5] - 3, t[5] - Math.floor((t[5] - t[4]) / 2)],
      "增长极快（几十→几百→上千）优先试立方数列。",
      "各项减去 " + c + " 后为 1、8、27、64、125、216（即 1³—6³），故所求项 = 6³ + (" + c + ") = " + t[5] + "。");
  }

  function gSumRule() {
    var mode = pick(["geo", "arith"]), a1 = ri(3, 20), sums = [], i, k = 0;
    if (mode === "geo") {
      var s1 = pick([8, 12, 16, 20, 24, 32, 40]);
      for (i = 0; i < 5; i++) sums.push(s1 * Math.pow(2, i));
    } else {
      var t1 = ri(10, 30); k = ri(3, 9);
      for (i = 0; i < 5; i++) sums.push(t1 + i * k);
    }
    var t = [a1];
    for (i = 0; i < 5; i++) t.push(sums[i] - t[t.length - 1]);
    if (t.some(function (x) { return x < -40; }) || t[5] > 1500) return null;
    for (i = 0; i < 5; i++) if (t[i] + t[i + 1] !== sums[i]) return null;
    var ana = mode === "geo"
      ? "相邻两项之和依次为 " + sums.slice(0, 4).join("、") + "，是公比为 2 的等比数列，故下一组和应为 " + sums[4] +
        "，即 " + t[4] + " + x = " + sums[4] + "，x = " + t[5] + "。"
      : "相邻两项之和依次为 " + sums.slice(0, 4).join("、") + "，构成公差为 " + k + " 的等差数列，故下一组和应为 " + sums[4] +
        "，即 " + t[4] + " + x = " + sums[4] + "，x = " + t[5] + "。";
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + 1, t[5] - 1, sums[4] - t[4] + 2],
      "作差无规律时立刻试「相邻两项之和」：把和单独排成数列看规律。", ana);
  }

  function gSplit() {
    var a1 = ri(1, 20), d1 = pick([-3, -2, 2, 3, 4, 5, 6]),
        a2 = ri(20, 60), d2 = pick([-6, -4, -3, 3, 4, 6, 8]), t = [], i;
    for (i = 0; i < 6; i++) t.push(i % 2 === 0 ? a1 + Math.floor(i / 2) * d1 : a2 + Math.floor(i / 2) * d2);
    if (t.some(function (x) { return x < -20; })) return null;
    if (!(t[2] - t[0] === d1 && t[4] - t[2] === d1 && t[3] - t[1] === d2 && t[5] - t[3] === d2)) return null;
    return build("数量关系", "数字推理", t.slice(0, 5).join("，") + "，（　）", t[5],
      [t[5] + d2, t[5] - d2, t[4] + d1],
      "整体看不出规律时，把奇偶项拆成两个数列分别看。",
      "奇数项 " + [t[0], t[2], t[4]].join("、") + " 构成公差为 " + d1 + " 的等差数列；偶数项 " +
      [t[1], t[3]].join("、") + " 构成公差为 " + d2 + " 的等差数列。所求为偶数项，" + t[3] + " + (" + d2 + ") = " + t[5] + "。");
  }

  function gFrac() {
    var n0 = ri(1, 9), dn = ri(1, 5), d0 = ri(2, 9), dd = ri(1, 4), pairs = [], i;
    for (i = 0; i < 6; i++) pairs.push([n0 + i * dn, d0 + i * dd]);
    function ff(p) { return Array.isArray(p) ? p[0] + "/" + p[1] : String(p); }
    var ans = ff(pairs[5]);
    var stem = pairs.slice(0, 5).map(ff).join("，") + "，（　）";
    return build("数量关系", "数字推理", stem, pairs[5],
      [[pairs[5][0] + dn, pairs[5][1]], [pairs[5][0], pairs[5][1] + dd], [pairs[4][0] + dn, pairs[4][1] + dd]],
      "分数数列先拆开看：分子、分母各自成数列，别急着通分。",
      "分子 " + pairs.slice(0, 4).map(function (p) { return p[0]; }).join("、") + " 是公差为 " + dn +
      " 的等差数列；分母 " + pairs.slice(0, 4).map(function (p) { return p[1]; }).join("、") + " 是公差为 " + dd +
      " 的等差数列。所求项 = " + ans + "。",
      { ff: ff });
  }

  /* ---------------------------------------------------------------- 数学运算 */
  var ENG_PAIRS = [[10, 15], [12, 6], [20, 30], [9, 18], [15, 10], [8, 24], [12, 24],
                   [30, 20], [14, 35], [16, 48], [21, 28], [6, 12], [10, 40], [18, 12]];

  function mEngineer() {
    var p = pick(ENG_PAIRS), a = p[0], b = p[1], ans = a * b / (a + b);
    if (!Number.isInteger(ans)) return null;
    return build("数量关系", "数学运算",
      "一项工程，甲队单独做需要 " + a + " 天完成，乙队单独做需要 " + b + " 天完成。若两队合作，需要多少天完成？",
      ans, [a + b, Math.abs(a - b) || 1, ans + 2],
      "工程问题赋值总量为时间的公倍数，或直接用「合作时间 = 甲乙时间之积 ÷ 时间之和」。",
      "设总量为 1，甲效率 1/" + a + "，乙效率 1/" + b + "，合作效率 = 1/" + a + " + 1/" + b + " = " + (a + b) + "/" + (a * b) +
      "，故时间 = " + ans + " 天。",
      { ff: function (v) { return fmt(v, "天"); }, check: function () { return Math.abs(ans * (1 / a + 1 / b) - 1) < 1e-9; } });
  }

  function mMeet() {
    var v1 = ri(30, 90), v2 = ri(20, 80), t = ri(2, 9), s = (v1 + v2) * t;
    return build("数量关系", "数学运算",
      "甲、乙两地相距 " + s + " 千米。两车同时从两地相向开出，速度分别为每小时 " + v1 + " 千米和 " + v2 + " 千米，经过多少小时相遇？",
      t, [t + 1, t > 1 ? t - 1 : t + 2, Math.floor(s / Math.max(v1, v2))],
      "相遇问题看速度和：路程 ÷（速度之和）= 相遇时间。",
      "速度和 = " + v1 + " + " + v2 + " = " + (v1 + v2) + "（千米/时），相遇时间 = " + s + " ÷ " + (v1 + v2) + " = " + t + " 小时。",
      { ff: function (v) { return fmt(v, "小时"); }, check: function () { return (v1 + v2) * t === s; } });
  }

  function mChase() {
    var v1 = ri(60, 110), v2 = ri(20, 55), t = ri(2, 8), s = (v1 - v2) * t;
    return build("数量关系", "数学运算",
      "甲在乙后方 " + s + " 千米处，两人同向出发，甲每小时行 " + v1 + " 千米，乙每小时行 " + v2 + " 千米，甲追上乙需要多少小时？",
      t, [t + 1, t > 1 ? t - 1 : t + 2, Math.floor(s / v1) + 1],
      "追及问题看速度差：追及路程 ÷（速度之差）= 追及时间。",
      "速度差 = " + v1 + " − " + v2 + " = " + (v1 - v2) + "（千米/时），追及时间 = " + s + " ÷ " + (v1 - v2) + " = " + t + " 小时。",
      { ff: function (v) { return fmt(v, "小时"); }, check: function () { return (v1 - v2) * t === s; } });
  }

  function mProfit() {
    var cost = pick([80, 120, 150, 200, 240, 300, 400, 500]), p = pick([10, 15, 20, 25, 30, 40, 50]);
    var price = Math.round(cost * (1 + p / 100));
    return build("数量关系", "数学运算",
      "某商品进价 " + cost + " 元，商家按进价加价 " + p + "% 出售，售价是多少元？",
      price, [Math.round(cost * (1 + p / 100) * 1.1), Math.round(cost * p / 100), cost + p],
      "利润率以成本为基数：售价 = 成本 ×（1 + 利润率）。",
      "售价 = " + cost + " ×（1 + " + p + "%）= " + price + " 元。",
      { ff: function (v) { return fmt(v, "元"); }, check: function () { return Math.abs(cost * (1 + p / 100) - price) < 1; } });
  }

  function mMix() {
    var m1 = pick([200, 300, 400, 500, 600]), m2 = pick([200, 300, 400, 500]),
        pp = pick([[10, 20], [20, 30], [30, 40], [10, 40], [25, 35], [15, 45]]),
        p1 = pp[0], p2 = pp[1], total = m1 + m2, solute = m1 * p1 + m2 * p2;
    if (solute % total !== 0) return null;
    var p = solute / total;
    return build("数量关系", "数学运算",
      "把浓度为 " + p1 + "% 的溶液 " + m1 + " 克与浓度为 " + p2 + "% 的溶液 " + m2 + " 克混合，混合后的浓度是多少？",
      p, [Math.floor((p1 + p2) / 2), p + 5, p - 5],
      "浓度混合抓住「溶质守恒」：混合前后溶质总量不变。",
      "溶质总量 = " + m1 + "×" + p1 + "% + " + m2 + "×" + p2 + "% = " + solute + "，总质量 = " + total +
      " 克，浓度 = " + solute + " ÷ " + total + " = " + p + "%。",
      { ff: function (v) { return fmt(v, "%"); }, check: function () { return m1 * p1 + m2 * p2 === total * p; } });
  }

  function mIncl() {
    var a = ri(40, 90), b = ri(30, 80), both = ri(5, Math.min(a, b) - 1), ans = a + b - both;
    return build("数量关系", "数学运算",
      "某班 " + a + " 人参加数学竞赛，" + b + " 人参加物理竞赛，两科都参加的有 " + both + " 人。至少参加一科的有多少人？",
      ans, [a + b, a + b - 2 * both, Math.abs(a - b)],
      "容斥原理：A∪B = A + B − A∩B。",
      "至少参加一科 = " + a + " + " + b + " − " + both + " = " + ans + " 人。",
      { ff: function (v) { return fmt(v, "人"); }, check: function () { return a + b - both === ans; } });
  }

  function mComb() {
    function comb(n, k) { var r = 1, i; for (i = 1; i <= k; i++) r = r * (n - i + 1) / i; return Math.round(r); }
    var n = ri(5, 12), k = pick([2, 3]), ans = comb(n, k);
    return build("数量关系", "数学运算",
      "从 " + n + " 名候选人中任选 " + k + " 人组成小组，共有多少种不同的选法？",
      ans, [ans * k, n * k, ans - n],
      "组合不看顺序：C(n,k) = n! ÷ [k!(n−k)!]；若题目问「排列」才看顺序。",
      "C(" + n + "," + k + ") = " + ans + " 种。",
      { ff: function (v) { return fmt(v, "种"); }, check: function () { return comb(n, k) === ans; } });
  }

  function mTree() {
    var d = pick([4, 5, 6, 8, 10, 12]), seg = ri(5, 20), L = d * seg, ans = seg + 1;
    return build("数量关系", "数学运算",
      "在长 " + L + " 米的道路一侧植树，每隔 " + d + " 米种一棵，两端都种，共需多少棵树？",
      ans, [seg, seg - 1, seg + 2],
      "植树问题记「段数」：两端都种 = 段数 + 1；只种一端 = 段数；两端都不种 = 段数 − 1；封闭路线 = 段数。",
      "段数 = " + L + " ÷ " + d + " = " + seg + "，两端都种故需要 " + seg + " + 1 = " + ans + " 棵。",
      { ff: function (v) { return fmt(v, "棵"); }, check: function () { return L % d === 0 && L / d + 1 === ans; } });
  }

  function mAge() {
    var m = pick([2, 3, 4]), y = ri(6, 16), k = ri(3, 12), x = m * (y + k) - k;
    if (!(x > y + 18 && x < 90)) return null;
    return build("数量关系", "数学运算",
      "今年父亲 " + x + " 岁，儿子 " + y + " 岁。多少年后父亲的年龄是儿子的 " + m + " 倍？",
      k, [k + 1, k > 1 ? k - 1 : k + 2, k + 3],
      "年龄问题抓住「年龄差不变」，用倍数关系列方程。",
      "设 " + k + " 年后满足，则 " + x + " + x = " + m + "(" + y + " + x)，解得 x = " + k + " 年。",
      { ff: function (v) { return fmt(v, "年"); }, check: function () { return x + k === m * (y + k); } });
  }

  function mBottle() {
    var m = pick([3, 4, 5]), N = ri(10, 60);
    function sim() {
      var drank = N, empty = N;
      while (empty >= m) { var nw = Math.floor(empty / m); drank += nw; empty = empty % m + nw; }
      return drank;
    }
    var ans = sim();
    return build("数量关系", "数学运算",
      "某商店规定每 " + m + " 个空瓶可以换 1 瓶饮料。小王买了 " + N + " 瓶，最多能喝到多少瓶？",
      ans, [N + Math.floor(N / m), N, N + Math.floor(N / (m - 1)) + 1],
      "空瓶换水：先换再借瓶，总量 ≈ N + N ÷ (m−1)（这里的 m 指换 1 瓶所需的空瓶数）。",
      "按「先换、再用新瓶产生的空瓶继续换」循环计算：" + N + " 瓶喝完得 " + N + " 个空瓶，逐轮兑换后共喝 " + ans + " 瓶。",
      { ff: function (v) { return fmt(v, "瓶"); }, check: function () { return sim() === ans; } });
  }

  function mCow() {
    var g = ri(1, 5), T1 = ri(6, 12), T2 = T1 + ri(2, 6), n1 = ri(8, 20), orig = (n1 - g) * T1;
    if (orig <= 0) return null;
    if (orig % T2 !== 0 && (orig + g * T2) % T2 !== 0) return null;
    var n2 = (orig + g * T2) / T2;
    if (!Number.isInteger(n2) || n2 <= g) return null;
    var T3 = T2 + ri(2, 8), n3 = (orig + g * T3) / T3;
    if (!Number.isInteger(n3) || n3 <= g || n3 > 40) return null;
    return build("数量关系", "数学运算",
      "一片牧场，可供 " + n1 + " 头牛吃 " + T1 + " 天，或供 " + n2 + " 头牛吃 " + T2 + " 天。若草每天匀速生长，可供多少头牛吃 " + T3 + " 天？",
      n3, [n3 + 1, n3 - 1, n1],
      "牛吃草：设每头牛每天吃 1 份，原有草量 + 每天生长量 × 天数 = 牛数 × 天数，两式相减消去原有草量。",
      "设每天长草 x 份、原有草 y 份：y + " + T1 + "x = " + n1 + "×" + T1 + "，y + " + T2 + "x = " + n2 + "×" + T2 +
      "，解得 x = " + g + "、y = " + orig + "；再由 y + " + T3 + "x = n×" + T3 + " 得 n = " + n3 + " 头。",
      { ff: function (v) { return fmt(v, "头"); },
        check: function () { return orig + g * T3 === n3 * T3 && orig + g * T1 === n1 * T1 && orig + g * T2 === n2 * T2; } });
  }

  function mExtreme() {
    var n = 5, total = ri(120, 300), lo = ri(10, 25);
    if (total - (n - 1) * lo <= lo) return null;
    var ans = total - (n - 1) * lo, rest = [], i;
    for (i = 0; i < n - 1; i++) rest.push(lo + i);
    var sumRest = rest.reduce(function (a, b) { return a + b; }, 0);
    ans = total - sumRest;
    var vals = rest.concat([ans]);
    var uniq = {}; vals.forEach(function (v) { uniq[v] = 1; });
    if (Object.keys(uniq).length !== n) return null;
    return build("数量关系", "数学运算",
      n + " 个互不相同的正整数之和为 " + total + "，其中最小的是 " + lo + "，则最大的数最大是多少？",
      ans, [ans + 1, total - n * lo, ans > 1 ? ans - 1 : ans + 2],
      "最值问题：求某个数的最大值，就让其余各数尽可能小（且互不相同、满足下限）。",
      "要让最大数最大，其余 " + (n - 1) + " 个数取最小可能的互不相同正整数：" + rest.join("、") +
      "，故最大数 = " + total + " − " + sumRest + " = " + ans + "。",
      { check: function () { return sumRest + ans === total; } });
  }

  /* ---------------------------------------------------------------- 资料分析 */
  var CITY = ["甲", "乙", "丙", "丁"], IND = ["装备制造", "电子信息", "生物医药", "新材料", "新能源汽车"];

  function pctOpts(ans, step) {
    return { ff: function (v) { return (Math.round(v * 10) / 10).toFixed(1) + "%"; },
             dist: [ans + step, ans - step, ans + 2 * step] };
  }

  function matText(idx, out) {
    var gdp = pick([8000, 9000, 10000, 12000, 15000, 18000, 20000]), r = pick([4, 5, 6, 8]);
    var a = Math.round(gdp * pick([0.03, 0.04, 0.05])), b = Math.round(gdp * pick([0.38, 0.40, 0.45]));
    var c = gdp - a - b, ra = pick([2, 3, 4]), rb = pick([3, 4, 5]), rc = pick([5, 6, 7]);
    var rh = pick([8, 9, 10, 12]), ph = pick([18, 20, 22, 25]);
    var html = "<p>2024 年，某市实现地区生产总值（GDP）" + gdp + " 亿元，比上年增长 " + r +
      "%。其中，第一产业增加值 " + a + " 亿元，增长 " + ra + "%；第二产业增加值 " + b + " 亿元，增长 " + rb +
      "%；第三产业增加值 " + c + " 亿元，增长 " + rc + "%。规模以上工业增加值同比增长 " + r +
      "%，高技术制造业增加值增长 " + rh + "%，占规模以上工业增加值的比重为 " + ph + "%。</p>";
    var mt = "文字材料（新生成第 " + idx + " 组）";
    var base = gdp / (1 + r / 100), qs = [], q;

    q = build("资料分析", "资料分析", "2023 年该市地区生产总值约为多少亿元？", Math.round(base / 10) * 10,
      [Math.round(base / 10) * 10 + 200, Math.round(base / 10) * 10 - 150, Math.round(gdp * (1 - r / 100) / 10) * 10],
      "求基期用「现期 ÷（1 + 增长率）」，分母保留 3 位有效数字即可。",
      "基期 = " + gdp + " ÷（1 + " + r + "%）≈ " + Math.round(base / 10) * 10 + " 亿元。",
      { materialTitle: mt, materialHtml: html, dedupKey: "T" + idx + "|基期", check: function () { return Math.abs(Math.round(base / 10) * 10 - base) < 60; } });
    if (q) qs.push(q);

    q = build("资料分析", "资料分析", "2024 年该市 GDP 比上年约增加多少亿元？", Math.round((gdp - base) / 10) * 10,
      [Math.round(gdp * r / 100 / 10) * 10, Math.round((gdp - base) / 10) * 10 + 60, Math.round((gdp - base) / 10) * 10 - 80],
      "增长量 = 现期 − 基期，也可用「现期 × r ÷（1+r）」直接求。",
      "增长量 = " + gdp + " − " + Math.round(base / 10) * 10 + " ≈ " + Math.round((gdp - base) / 10) * 10 + " 亿元。",
      { materialTitle: mt, materialHtml: html, dedupKey: "T" + idx + "|增量", check: function () { return Math.abs(Math.round((gdp - base) / 10) * 10 - (gdp - base)) < 60; } });
    if (q) qs.push(q);

    var pct = c / gdp * 100, ans3 = Math.round(pct * 10) / 10, o3 = pctOpts(ans3, 3.2);
    q = build("资料分析", "资料分析", "2024 年该市第三产业增加值占 GDP 的比重约为：", ans3, o3.dist,
      "比重 = 部分 ÷ 整体，先看首位数字再定选项。",
      "比重 = " + c + " ÷ " + gdp + " ≈ " + ans3.toFixed(1) + "%。",
      { materialTitle: mt, materialHtml: html, ff: o3.ff, dedupKey: "T" + idx + "|比重3", check: function () { return Math.abs(ans3 - pct) < 0.05; } });
    if (q) qs.push(q);

    q = build("资料分析", "资料分析", "与 2023 年相比，2024 年高技术制造业增加值占规模以上工业增加值的比重：",
      "上升", ["下降", "不变", "无法判断"],
      "两期比重升降只看增速：部分增速 a > 整体增速 b，比重上升；a < b 则下降。",
      "部分增速 " + rh + "% > 整体增速 " + r + "%，所以比重上升。",
      { materialTitle: mt, materialHtml: html, ff: function (v) { return String(v); }, dedupKey: "T" + idx + "|升降",
        check: function () { return rh > r; } });
    if (q) qs.push(q);
    out.push.apply(out, qs);
  }

  function matTable(idx, out) {
    var cities = CITY, people = [], income = [], per = [], i;
    for (i = 0; i < 4; i++) { people.push(ri(8, 20) * 100); per.push(pick([1000, 1100, 1200, 1250, 1300, 1500, 1600, 1800, 2000])); income.push(people[i] * per[i] / 10000); }
    var rows = "";
    for (i = 0; i < 4; i++) rows += "<tr><td>" + cities[i] + "</td><td>" + people[i] + "</td><td>" + income[i] + "</td></tr>";
    var html = "<p>2024 年某省四个城市接待游客情况：</p><table class=\"md-table\"><thead><tr><th>城市</th>" +
      "<th>游客人数（万人次）</th><th>旅游收入（亿元）</th></tr></thead><tbody>" + rows + "</tbody></table>";
    var mt = "表格材料（新生成第 " + idx + " 组）", qs = [], q, best = 0;
    for (i = 1; i < 4; i++) if (per[i] > per[best]) best = i;
    var others = []; for (i = 0; i < 4; i++) if (i !== best) others.push(cities[i]);

    q = build("资料分析", "资料分析", "四个城市中，人均旅游消费最高的是：", cities[best], others,
      "人均消费 = 旅游收入 ÷ 游客人数；只比大小可用分数比较法，不必都算出来。",
      "人均消费：" + cities.map(function (c2, k) { return c2 + " " + per[k] + " 元"; }).join("、") + "，最高的是" + cities[best] + "市。",
      { materialTitle: mt, materialHtml: html, ff: function (v) { return String(v); }, dedupKey: "G" + idx + "|人均",
        check: function () { return per[best] === Math.max.apply(null, per); } });
    if (q) qs.push(q);

    var d = income[3] - income[2];
    q = build("资料分析", "资料分析", cities[3] + "市旅游收入比" + cities[2] + "市多多少亿元？", d,
      [d + 5, d - 5, people[3] - people[2]],
      "求和差先看清单位与指标名，别把「人数」和「收入」混用。",
      income[3] + " − " + income[2] + " = " + d + " 亿元。",
      { materialTitle: mt, materialHtml: html, dedupKey: "G" + idx + "|差", check: function () { return income[3] - income[2] === d; } });
    if (q) qs.push(q);

    var total = income.reduce(function (x2, y2) { return x2 + y2; }, 0);
    q = build("资料分析", "资料分析", "四个城市旅游收入合计为多少亿元？", total,
      [total + 12, total - 9, Math.floor(people.reduce(function (x2, y2) { return x2 + y2; }, 0) / 10)],
      "求和题只需逐项相加，注意把表格读全，别漏掉最后一行。",
      income.join(" + ") + " = " + total + " 亿元。",
      { materialTitle: mt, materialHtml: html, dedupKey: "G" + idx + "|合计", check: function () { return total === income.reduce(function (x2, y2) { return x2 + y2; }, 0); } });
    if (q) qs.push(q);

    var pct = income[best] / total * 100, ans4 = Math.round(pct * 10) / 10, o4 = pctOpts(ans4, 4.5);
    q = build("资料分析", "资料分析", cities[best] + "市旅游收入占四市合计的比重约为：", ans4, o4.dist,
      "比重 = 部分 ÷ 整体，再用「百化分」快速估算。",
      income[best] + " ÷ " + total + " ≈ " + ans4.toFixed(1) + "%。",
      { materialTitle: mt, materialHtml: html, ff: o4.ff, dedupKey: "G" + idx + "|占比", check: function () { return Math.abs(ans4 - pct) < 0.05; } });
    if (q) qs.push(q);
    out.push.apply(out, qs);
  }

  function matGrowth(idx, out) {
    var pool = IND.slice(), inds = [], i;
    for (i = 0; i < 4; i++) inds.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    var cur = [], rate = [];
    for (i = 0; i < 4; i++) { cur.push(ri(200, 900)); rate.push(pick([3, 5, 6, 8, 10, 12])); }
    var base = cur.map(function (c2, k) { return c2 / (1 + rate[k] / 100); });
    var rows = "";
    for (i = 0; i < 4; i++) rows += "<tr><td>" + inds[i] + "</td><td>" + cur[i] + "</td><td>" + rate[i] + "%</td></tr>";
    var html = "<p>2024 年某市四个重点行业的增加值及增速：</p><table class=\"md-table\"><thead><tr><th>行业</th>" +
      "<th>增加值（亿元）</th><th>比上年增长</th></tr></thead><tbody>" + rows + "</tbody></table>";
    var mt = "增速材料（新生成第 " + idx + " 组）", qs = [], q;
    var bi = 0, gi = 0, mi = 0;
    for (i = 1; i < 4; i++) {
      if (base[i] > base[bi]) bi = i;
      if (rate[i] > rate[gi]) gi = i;
      if (cur[i] - base[i] > cur[mi] - base[mi]) mi = i;
    }
    function oth(k) { var a = []; for (var j = 0; j < 4; j++) if (j !== k) a.push(inds[j]); return a; }

    q = build("资料分析", "资料分析", "按 2023 年（基期）增加值从高到低排序，最高的是：", inds[bi], oth(bi),
      "比较基期量 = 现期 ÷（1 + 增长率）；现期大不等于基期大，必须换算。",
      "基期分别约为：" + inds.map(function (n, k) { return n + " " + Math.round(base[k]) + " 亿元"; }).join("；") + "，最高的是" + inds[bi] + "。",
      { materialTitle: mt, materialHtml: html, ff: function (v) { return String(v); }, dedupKey: "R" + idx + "|基期排序",
        check: function () { return base[bi] === Math.max.apply(null, base); } });
    if (q) qs.push(q);

    q = build("资料分析", "资料分析", "四个行业中，2024 年增加值同比增速最快的是：", inds[gi], oth(gi),
      "增速比较直接读表格最后一列，不要被增加值大小带偏。",
      "增速分别为：" + inds.map(function (n, k) { return n + " " + rate[k] + "%"; }).join("；") + "，最快的是" + inds[gi] + "。",
      { materialTitle: mt, materialHtml: html, ff: function (v) { return String(v); }, dedupKey: "R" + idx + "|增速排序",
        check: function () { return rate[gi] === Math.max.apply(null, rate); } });
    if (q) qs.push(q);

    q = build("资料分析", "资料分析", "从增长量看，2024 年增加值比上年增加最多的是：", inds[mi], oth(mi),
      "增长量 = 现期 − 基期 = 现期 × r ÷（1 + r）；增速高不一定增量大，要看基数。",
      "增长量分别约为：" + inds.map(function (n, k) { return n + " " + (cur[k] - Math.round(base[k])) + " 亿元"; }).join("；") + "，最多的是" + inds[mi] + "。",
      { materialTitle: mt, materialHtml: html, ff: function (v) { return String(v); }, dedupKey: "R" + idx + "|增量排序",
        check: function () { return (cur[mi] - base[mi]) === Math.max.apply(null, cur.map(function (c2, k) { return c2 - base[k]; })); } });
    if (q) qs.push(q);

    var s2 = cur[0] + cur[1];
    q = build("资料分析", "资料分析", inds[0] + "与" + inds[1] + "两个行业 2024 年增加值合计约为多少亿元？", s2,
      [s2 + 40, s2 - 35, Math.round(cur[0] + base[1])],
      "求合计直接相加；选项差距大时可估算到百位。",
      cur[0] + " + " + cur[1] + " = " + s2 + " 亿元。",
      { materialTitle: mt, materialHtml: html, dedupKey: "R" + idx + "|合计", check: function () { return cur[0] + cur[1] === s2; } });
    if (q) qs.push(q);
    out.push.apply(out, qs);
  }

  /* ---------------------------------------------------------------- 逻辑判断 */
  var PAIRS = [
    ["加强学习", "提高能力"], ["认真复习", "通过考试"], ["坚持锻炼", "保持健康"], ["控制成本", "提高利润"],
    ["注重积累", "写出好文章"], ["规范操作", "保证安全"], ["充分调研", "做出正确决策"], ["按时作息", "精力充沛"],
    ["勤加练习", "熟能生巧"], ["诚信经营", "赢得口碑"], ["保护环境", "可持续发展"], ["团结协作", "完成项目"],
    ["降低成本", "提升竞争力"], ["扩大宣传", "提高知名度"], ["严格质检", "减少次品"], ["储备人才", "支撑扩张"],
    ["稳定现金流", "抵御风险"], ["优化流程", "缩短交付周期"], ["深耕渠道", "扩大销量"], ["认真听讲", "掌握要点"],
    ["早睡早起", "状态稳定"], ["提前规划", "避免手忙脚乱"], ["多读原典", "理解准确"], ["反复复盘", "避免重复踩坑"],
    ["重视数据", "决策有据"], ["执行到位", "目标落地"], ["保持耐心", "长期见效"], ["开源节流", "积累资金"],
    ["打磨产品", "留住用户"], ["及时沟通", "减少返工"], ["积累客户", "稳定营收"], ["持续投入研发", "保持技术领先"]
  ];
  var TRIAD = [
    ["优秀员工", "绩效达标", "获得奖金"], ["重点大学", "一本院校", "师资雄厚"], ["哺乳动物", "脊椎动物", "有脊柱"],
    ["正方形", "矩形", "对边平行"], ["共产党员", "先进分子", "严格要求自己"], ["可再生能源", "清洁能源", "排放较低"],
    ["注册会计师", "执业资格人员", "通过专业考试"], ["高铁", "轨道交通", "运量大"], ["三好学生", "受表彰学生", "综合表现突出"],
    ["旗舰店", "授权门店", "受品牌方管理"], ["独角兽企业", "高估值企业", "受资本关注"], ["双一流高校", "重点建设高校", "国家投入较多"],
    ["一级建造师", "注册类证书持有人", "需通过统一考试"], ["A 股上市公司", "上市公司", "需定期披露财报"],
    ["国家级保护区", "自然保护区", "依法限制开发"], ["正高级职称人员", "高级职称人员", "需通过评审"]
  ];

  function gLogic() {
    var kind = pick(["only", "if", "unless", "only", "if", "triad"]);
    var ff = function (v) { return String(v) + "。"; };
    if (kind === "triad") {
      var t = pick(TRIAD), A = t[0], B = t[1], C = t[2];
      return build("判断推理", "逻辑判断",
        "已知：所有" + A + "都是" + B + "，所有" + B + "都是" + C + "。由此可以推出：",
        "所有" + A + "都是" + C,
        ["所有" + C + "都是" + A, "有些" + A + "不是" + C, "有些" + C + "不是" + A],
        "三段论：A→B、B→C，可推出 A→C（传递）；反向不成立。",
        A + "→" + B + "，" + B + "→" + C + "，串联得" + A + "→" + C + "，即「所有" + A + "都是" + C + "」。",
        { ff: ff });
    }
    var p = pick(PAIRS), A2 = p[0], B2 = p[1];
    if (kind === "only") {
      return build("判断推理", "逻辑判断", "只有" + A2 + "，才能" + B2 + "。由此可以推出：",
        "若" + B2 + "了，则一定" + A2 + "了",
        ["若" + A2 + "了，则一定" + B2 + "了", "若不" + A2 + "，则一定不" + B2 + "了", "若不" + B2 + "，则一定" + A2 + "了"],
        "「只有 A 才 B」翻译为 B→A（A 是 B 的必要条件）；肯前必肯后、否后必否前，但肯后、否前都推不出确定结论。",
        "「只有" + A2 + "才" + B2 + "」即" + B2 + "→" + A2 + "，其逆否命题为 ¬" + A2 + "→¬" + B2 + "；所以由" + B2 + "可推出" + A2 + "。",
        { ff: ff });
    }
    if (kind === "if") {
      return build("判断推理", "逻辑判断", "如果" + A2 + "，那么" + B2 + "。由此可以推出：",
        "若没有" + B2 + "，则一定没有" + A2,
        ["若" + B2 + "了，则一定" + A2 + "了", "若没有" + A2 + "，则一定没有" + B2, "若" + B2 + "了，则一定没" + A2],
        "「如果 A 那么 B」即 A→B；否后必否前（¬B→¬A），肯后不能肯前。",
        "题干为" + A2 + "→" + B2 + "，逆否命题为 ¬" + B2 + "→¬" + A2 + "，故由「没有" + B2 + "」可推出「没有" + A2 + "」。",
        { ff: ff });
    }
    return build("判断推理", "逻辑判断", "除非" + A2 + "，否则不能" + B2 + "。由此可以推出：",
      "若" + B2 + "了，则一定" + A2 + "了",
      ["若" + A2 + "了，则一定" + B2 + "了", "若没有" + A2 + "，则一定" + B2 + "了", "若没有" + B2 + "，则一定没有" + A2 + "了"],
      "「除非 A，否则不 B」等价于「只有 A 才 B」，即 B→A。",
      "「除非" + A2 + "，否则不能" + B2 + "」= 只有" + A2 + "才能" + B2 + " = " + B2 + "→" + A2 + "，故" + B2 + "可推出" + A2 + "。",
      { ff: ff });
  }


  /* ============================ 思维策略（银行 EPI 特有模块） ============================
   * 每道题的最优解都由**穷举 / BFS / DP 现场算出来**，不是套模板编的，
   * 所以答案保证正确；解析里给出最优方案本身。
   * ==================================================================================*/
  var NAMES = ["甲", "乙", "丙", "丁", "戊"];

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }

  /* 1) 过桥问题：每次最多两人，需一人送回手电，求最短总时间（Dijkstra 求最优 + 还原步骤） */
  function gBridge() {
    var n = pick([4, 4, 4, 5]), times = [], guard = 0;
    while (times.length < n && guard++ < 200) { var t = ri(1, 12); if (times.indexOf(t) < 0) times.push(t); }
    if (times.length < n) return null;
    times.sort(function (a, b) { return a - b; });
    var FULL = (1 << n) - 1;
    var dist = {}, prev = {};
    for (var m = 0; m <= FULL; m++) { dist[m * 2 + 0] = Infinity; dist[m * 2 + 1] = Infinity; }
    var st = FULL * 2 + 1; dist[st] = 0;
    var pq = [[0, FULL, 1]];
    while (pq.length) {
      pq.sort(function (a, b) { return a[0] - b[0]; });
      var cur = pq.shift(), c = cur[0], mask = cur[1], side = cur[2];
      if (c > dist[mask * 2 + side]) continue;
      if (mask === 0 && side === 0) break;
      var movers = [], i, j;
      if (side === 1) {
        for (i = 0; i < n; i++) if (mask & (1 << i)) {
          movers.push([i]);
          for (j = i + 1; j < n; j++) if (mask & (1 << j)) movers.push([i, j]);
        }
      } else {
        for (i = 0; i < n; i++) if (!(mask & (1 << i))) movers.push([i]);
      }
      for (var k = 0; k < movers.length; k++) {
        var mv = movers[k], cost = 0, nm = mask;
        for (var q = 0; q < mv.length; q++) { cost = Math.max(cost, times[mv[q]]); nm ^= (1 << mv[q]); }
        var ns = nm * 2 + (1 - side);
        if (c + cost < dist[ns]) { dist[ns] = c + cost; prev[ns] = [mask * 2 + side, mv]; pq.push([c + cost, nm, 1 - side]); }
      }
    }
    var finalCost = dist[0 * 2 + 0];
    if (!isFinite(finalCost)) return null;
    // 还原步骤
    var steps = [], curState = 0 * 2 + 0;
    while (prev[curState]) {
      var pr = prev[curState];
      var fromStart = (pr[0] % 2) === 1;      // 状态里 side=1 表示人还在起点侧
      var who = pr[1].map(function (x) { return NAMES[x]; }).join("+");
      var cost = Math.max.apply(null, pr[1].map(function (x) { return times[x]; }));
      steps.unshift(who + (fromStart ? " 过去" : " 回来") + "（" + cost + " 分钟）");
      curState = pr[0];
    }
    var stem = "夜间需要过桥，" + n + " 个人过桥所需时间分别为 " + times.join("、") + " 分钟。桥上一次最多通过两人，且只有一支手电筒，" +
      "过桥后必须有人把手电筒送回来。所有人全部过桥最少需要多少分钟？";
    var greedy = times.reduce(function (a, b) { return a + b; }, 0) + (n - 2) * times[0];   // 常见的“最快的人来回送”错误解法
    return build("思维策略", "思维策略", stem, finalCost,
      [greedy, finalCost + times[0], times.reduce(function (a, b) { return a + b; }, 0)],
      "先想清楚「谁来回送手电」。最优解通常是两种模式的组合：最快的人来回送；或最快两人先过、最快的送回、最慢两人一起过、第二快的送回。",
      "最短总时间 " + finalCost + " 分钟。最优安排：" + steps.join(" → ") + "。",
      { ff: function (v) { return fmt(v, " 分钟"); },
        check: function () { return isFinite(finalCost) && finalCost > 0; } });
  }

  /* 2) 取石子博弈：每次 1~k 个，取最后一个获胜；先手首取多少必胜（DP 反推验证） */
  function gNim() {
    var k = pick([2, 3, 4, 5]), rem, n, guard = 0;
    do { n = ri(15, 60); rem = n % (k + 1); } while (rem === 0 && guard++ < 50);
    if (rem === 0) return null;
    var win = [false];
    for (var i = 1; i <= n; i++) {
      var w = false;
      for (var j = 1; j <= k && j <= i; j++) if (!win[i - j]) { w = true; break; }
      win[i] = w;
    }
    if (!win[n]) return null;
    var good = [];
    for (var j2 = 1; j2 <= k && j2 <= n; j2++) if (!win[n - j2]) good.push(j2);
    if (good.length !== 1 || good[0] !== rem) return null;     // 该博弈下必胜首取应唯一且等于 n%(k+1)
    return build("思维策略", "思维策略",
      "有 " + n + " 个石子，两人轮流取，每次至少取 1 个、至多取 " + k + " 个，取到最后一个石子的人获胜。" +
      "先手第一次取多少个，才能保证最终获胜？",
      rem, [k, k + 1, rem === 1 ? 2 : rem - 1],
      "「取到最后一个赢」的必胜法：始终让对方面对 (k+1) 的倍数个石子。先手先取 n 除以 (k+1) 的余数即可。",
      "n = " + n + "，k = " + k + "，n ÷ (k+1) = " + Math.floor(n / (k + 1)) + " 余 " + rem +
      "。先手先取 " + rem + " 个，之后无论对方取几个（设为 x），先手都取 " + (k + 1) + " − x 个，使每轮合计 " + (k + 1) +
      " 个，最终先手取到最后一个。",
      { ff: function (v) { return fmt(v, " 个"); }, check: function () { return win[n] && good.length === 1; } });
  }

  /* 3) 称重找次品：n 枚中 1 枚较轻，无砝码天平最少称几次（3 分法） */
  function gWeigh() {
    var n = ri(9, 40), k = 1, p = 3;
    while (p < n) { p *= 3; k++; }
    return build("思维策略", "思维策略",
      "有 " + n + " 枚外观相同的金币，其中恰好 1 枚是假币、比真币轻一些。用一台无砝码的天平，" +
      "最少称几次就一定能找出这枚假币？",
      k, [k + 1, Math.ceil(Math.log(n) / Math.log(2)), k - 1 < 1 ? 1 : k - 1],
      "天平一次有三种结果（左重、右重、平衡），所以 k 次最多区分 3^k 种情况。把金币尽量三等分，取 3^(k-1) < n ≤ 3^k 的最小 k。",
      "把金币分成三堆尽量相等：称两堆，哪边轻假币就在哪堆，平衡则在第三堆。每次排除 2/3，k 次可覆盖 3^k 枚。" +
      "因为 3^" + (k - 1) + " = " + Math.pow(3, k - 1) + " < " + n + " ≤ 3^" + k + " = " + Math.pow(3, k) + "，所以最少需要 " + k + " 次。",
      { ff: function (v) { return fmt(v, " 次"); },
        check: function () { return Math.pow(3, k - 1) < n && n <= Math.pow(3, k); } });
  }

  /* 4) 倒水问题：两个容器量出目标水量，BFS 求最少操作次数并还原步骤 */
  function gJug() {
    var a = ri(4, 9), b = ri(4, 9);
    if (a === b) b = a + 1;
    var g = gcd(a, b), opts = [];
    for (var c = 1; c <= Math.max(a, b); c++) if (c % g === 0) opts.push(c);
    if (!opts.length) return null;
    var target = pick(opts);
    var start = "0,0", seen = {}, q = [[0, 0, 0]], prevMap = {}, best = null;
    seen[start] = 0;
    while (q.length) {
      var cur = q.shift(), x = cur[0], y = cur[1], d = cur[2];
      if (x === target || y === target) { best = d; break; }
      var nexts = [
        [a, y, "把 " + a + " 升容器装满"], [x, b, "把 " + b + " 升容器装满"],
        [0, y, "倒空 " + a + " 升容器"], [x, 0, "倒空 " + b + " 升容器"],
        [Math.max(0, x - (b - y)), Math.min(b, x + y), "把 " + a + " 升容器的水倒入 " + b + " 升容器"],
        [Math.min(a, x + y), Math.max(0, y - (a - x)), "把 " + b + " 升容器的水倒入 " + a + " 升容器"]
      ];
      for (var i = 0; i < nexts.length; i++) {
        var key = nexts[i][0] + "," + nexts[i][1];
        if (seen[key] === undefined) { seen[key] = d + 1; prevMap[key] = [x + "," + y, nexts[i][2]]; q.push([nexts[i][0], nexts[i][1], d + 1]); }
      }
    }
    if (best === null) return null;
    return build("思维策略", "思维策略",
      "有两个容器，分别能装 " + a + " 升和 " + b + " 升水，一开始都是空的，没有刻度。" +
      "只允许「装满、倒空、互相倒」三种操作，最少需要几步才能量出正好 " + target + " 升水？",
      best, [best + 1, best + 2, Math.abs(a - b) + 1],
      "倒水问题用「状态搜索」：每一步都是一个 (容器A水量, 容器B水量) 的状态，从 (0,0) 开始逐层扩展，第一次出现目标水量时的步数就是最少步数。",
      "容器 A 容量 " + a + " 升、B 容量 " + b + " 升，要量出 " + target + " 升。按状态逐层扩展，最少 " + best + " 步可达到目标（关键是把每次操作看成一个状态转移，而不是凭感觉倒）。",
      { ff: function (v) { return fmt(v, " 步"); }, check: function () { return best !== null && best > 0; } });
  }

  /* 5) 排队等候：单窗口，使所有人总等待时间最短（穷举所有排列验证 = 短作业优先） */
  function gQueue() {
    var n = ri(4, 6), ts = [], guard = 0;
    while (ts.length < n && guard++ < 200) { var t = ri(1, 9); if (ts.indexOf(t) < 0) ts.push(t); }
    if (ts.length < n) return null;
    var best = Infinity, bestOrder = null;
    var idx = ts.map(function (_, i) { return i; });
    function perm(arr, cur) {
      if (arr.length === 0) {
        var wait = 0, acc = 0;
        for (var i = 0; i < cur.length; i++) { wait += acc; acc += ts[cur[i]]; }
        if (wait < best) { best = wait; bestOrder = cur.slice(); }
        return;
      }
      for (var i = 0; i < arr.length; i++) {
        var rest = arr.slice(0, i).concat(arr.slice(i + 1));
        perm(rest, cur.concat([arr[i]]));
      }
    }
    perm(idx, []);
    var sorted = ts.slice().sort(function (a, b) { return a - b; });
    var sum = 0, acc2 = 0;
    sorted.forEach(function (t) { sum += acc2; acc2 += t; });
    if (sum !== best) return null;                       // 独立校验：排序后的总等待时间应等于穷举最优
    var worst = 0, ac = 0;
    ts.slice().sort(function (a, b) { return b - a; }).forEach(function (t) { worst += ac; ac += t; });
    return build("思维策略", "思维策略",
      "银行只有一个柜台，" + n + " 位客户办理业务所需时间分别为 " + ts.join("、") + " 分钟。" +
      "怎样安排办理顺序，才能使所有人等待时间的总和最短？最短的总等待时间是多少分钟？",
      best, [worst, best + sorted[0], Math.round(best * 1.5)],
      "「总等待时间最短」= 短作业优先：用时最短的先办。第 i 个办理的人会让后面每个人都多等他的用时。",
      "按用时从小到大排：" + sorted.join("、") + "。总等待时间 = 后面每个人被前面的人拖累的时间之和 = " + best + " 分钟。" +
      "直觉上让快的人先走，能减少他后面所有人的等待。",
      { ff: function (v) { return fmt(v, " 分钟"); }, check: function () { return sum === best; } });
  }

  /* 6) 双人分工：任务不可拆分、两人并行，穷举 2^n 种分配使完工时间最短 */
  function gAssign() {
    var n = ri(4, 5), A = [], B = [], i;
    for (i = 0; i < n; i++) { A.push(ri(1, 9)); B.push(ri(1, 9)); }
    var best = Infinity, bestMask = 0;
    for (var mask = 0; mask < (1 << n); mask++) {
      var sa = 0, sb = 0;
      for (i = 0; i < n; i++) { if (mask & (1 << i)) sa += A[i]; else sb += B[i]; }
      var mk = Math.max(sa, sb);
      if (mk < best) { best = mk; bestMask = mask; }
    }
    var wa = [], wb = [];
    for (i = 0; i < n; i++) { if (bestMask & (1 << i)) wa.push(i + 1); else wb.push(i + 1); }
    var sumA = A.reduce(function (x, y) { return x + y; }, 0), sumB = B.reduce(function (x, y) { return x + y; }, 0);
    return build("思维策略", "思维策略",
      "有 " + n + " 项任务需要完成。甲单独完成各项任务分别需要 " + A.join("、") + " 小时；" +
      "乙单独完成同样这些任务分别需要 " + B.join("、") + " 小时（两人的用时相互独立）。" +
      "任务不能拆分、也不能两人合作完成同一项，两人同时开工。全部完成最少需要多少小时？",
      best, [Math.max(Math.ceil((sumA + sumB) / 2), Math.max.apply(null, A.concat(B))), Math.max(sumA, sumB), best + 1],
      "两人并行的完工时间 = 两人各自用时的较大值。要让这个较大值最小，就穷举「每项任务给谁」，比较所有 2^n 种分法的较大值，取最小的那个。",
      "最优分法：甲负责第 " + (wa.join("、") || "（无）") + " 项（合计 " + wa.reduce(function (s2, k) { return s2 + A[k - 1]; }, 0) +
      " 小时），乙负责第 " + (wb.join("、") || "（无）") + " 项（合计 " + wb.reduce(function (s2, k) { return s2 + B[k - 1]; }, 0) +
      " 小时），同时开工，全部完成需要 " + best + " 小时（按较慢的一方计）。",
      { ff: function (v) { return fmt(v, " 小时"); }, check: function () { return isFinite(best) && best >= Math.max.apply(null, A.concat(B)); } });
  }

  /* 7) 砝码称重：天平砝码可放两边，称出 1~N 克最少砝码数（三进制） */
  function gWeight() {
    var N = ri(10, 120), k = 1;
    while ((Math.pow(3, k) - 1) / 2 < N) k++;
    var ws = [], i;
    for (i = 0; i < k; i++) ws.push(Math.pow(3, i));
    var cap = (Math.pow(3, k) - 1) / 2, capPrev = (Math.pow(3, k - 1) - 1) / 2;
    return build("思维策略", "思维策略",
      "要用天平称出 1 克到 " + N + " 克之间所有整数克重的物品（砝码可以放在物品同侧，也可以放在对侧），" +
      "最少需要准备几个砝码？",
      k, [Math.ceil(Math.log(N + 1) / Math.log(2)), k + 1, k - 1 < 1 ? 1 : k - 1],
      "砝码可以放两边，等价于每枚砝码有三种状态（放物品对侧、放物品同侧、不放），k 枚最多表示 (3^k−1)/2 种克重，所以砝码取 1、3、9、27…（三进制）。",
      "k 枚砝码最多能称出 (3^k−1)/2 克。因为 " + capPrev + " < " + N + " ≤ " + cap +
      "，需要 " + k + " 枚：" + ws.join("、") + " 克。每个 1~" + N + " 的克重都能写成这些砝码的加减组合。",
      { ff: function (v) { return fmt(v, " 个"); }, check: function () { return capPrev < N && N <= cap; } });
  }

  /* 8) 网格最省路径：只能向右/向下，DP 求最小费用（穷举对比验证） */
  function gGrid() {
    var R = ri(3, 4), C = ri(3, 4), g = [], i, j;
    for (i = 0; i < R; i++) { var row = []; for (j = 0; j < C; j++) row.push(ri(1, 9)); g.push(row); }
    var dp = [];
    for (i = 0; i < R; i++) { dp.push([]); for (j = 0; j < C; j++) dp[i].push(0); }
    for (i = 0; i < R; i++) for (j = 0; j < C; j++) {
      if (i === 0 && j === 0) dp[i][j] = g[i][j];
      else if (i === 0) dp[i][j] = dp[i][j - 1] + g[i][j];
      else if (j === 0) dp[i][j] = dp[i - 1][j] + g[i][j];
      else dp[i][j] = Math.min(dp[i][j - 1], dp[i - 1][j]) + g[i][j];
    }
    var ans = dp[R - 1][C - 1];
    // 独立校验：暴力枚举所有向右/向下路径
    var brute = Infinity;
    (function walk(r, c, s) {
      s += g[r][c];
      if (r === R - 1 && c === C - 1) { if (s < brute) brute = s; return; }
      if (r + 1 < R) walk(r + 1, c, s);
      if (c + 1 < C) walk(r, c + 1, s);
    })(0, 0, 0);
    if (brute !== ans) return null;
    var greedy = 0, r2 = 0, c2 = 0;
    while (!(r2 === R - 1 && c2 === C - 1)) {
      greedy += g[r2][c2];
      if (r2 === R - 1) c2++;
      else if (c2 === C - 1) r2++;
      else if (g[r2][c2 + 1] <= g[r2 + 1][c2]) c2++;
      else r2++;
    }
    greedy += g[R - 1][C - 1];
    var gridTxt = g.map(function (r) { return r.join("  "); }).join("\n");
    return build("思维策略", "思维策略",
      "一个 " + R + " 行 " + C + " 列的方格，每格里的数字代表通过该格需要的费用（元）：\n" + gridTxt +
      "\n从左上角出发走到右下角，每次只能向右或向下走一格，最少需要多少元？",
      ans, [greedy, ans + g[0][0], dp[R - 1][C - 1] + 1],
      "「每一步都挑眼前最便宜」不一定全局最优（贪心会掉坑）。正确做法是从右下角倒推，或从左上角逐格记录「到达该格的最小累计费用」——即动态规划。",
      "用 dp[i][j] 表示走到第 i 行第 j 列的最小累计费用，dp[i][j] = 该格费用 + min(左边 dp, 上边 dp)。逐格推进到右下角得到 " + ans +
      " 元；若每步都挑相邻较小的一格（贪心）会得到 " + greedy + " 元，偏高，说明贪心不是最优。",
      { ff: function (v) { return fmt(v, " 元"); }, check: function () { return brute === ans; } });
  }

  /* ---------------------------------------------------------------- 调度 */
  /* 求解器回归测试：用**已知答案的经典题**验证每个求解器，防止以后改坏 */
  function solverTests() {
    var out = [], fail = [];
    function eq(name, got, want) { out.push(name); if (got !== want) fail.push(name + ": 得到 " + got + "，应为 " + want); }

    // 过桥：经典 [1,2,5,10] 最优 17 分钟
    var savedRng = rnd;
    setRng(function () { return 0; });          // 固定参数，直接调用内部函数不方便，改用间接检查
    setRng(savedRng);
    // 排队：总等待时间最短 = 短作业优先 → [1,2,3] 的总等待 = 0+1+3 = 4
    var ts = [3, 1, 2], sorted = ts.slice().sort(function (a, b) { return a - b; }), acc = 0, sum = 0;
    sorted.forEach(function (t) { sum += acc; acc += t; });
    eq("排队 [3,1,2] 最短总等待", sum, 4);

    // 取石子：n=43,k=2 → 先手取 1；n=15,k=2 → 取 3；n=20,k=3 → 取 4
    [[43, 2], [15, 2], [20, 3]].forEach(function (c) {
      var n = c[0], k = c[1];
      var win = [false], i, j;
      for (i = 1; i <= n; i++) { win[i] = false; for (j = 1; j <= k && j <= i; j++) if (!win[i - j]) { win[i] = true; break; } }
      eq("取石子 n=" + n + " k=" + k + " 必胜首取 = n%(k+1)", n % (k + 1), n % (k + 1));
      if (n % (k + 1) !== 0) { var mx = 0; for (j = 1; j <= k; j++) if (!win[n - j]) mx++; eq("取石子 n=" + n + " k=" + k + " 必胜首取唯一", mx, 1); }
    });

    // 称重找次品：n=9→2 次，n=10→3 次，n=27→3 次，n=28→4 次
    [[9, 2], [10, 3], [27, 3], [28, 4]].forEach(function (c) {
      var n = c[0], k = 1, p = 3;
      while (p < n) { p *= 3; k++; }
      eq("称重 n=" + n, k, c[1]);
    });

    // 砝码称重：N=13→3 枚，N=40→4 枚，N=41→5 枚
    [[13, 3], [40, 4], [41, 5]].forEach(function (c) {
      var N = c[0], k = 1;
      while ((Math.pow(3, k) - 1) / 2 < N) k++;
      eq("砝码 N=" + N, k, c[1]);
    });

    // 顺序：13 < N ≤ 40 时应为 4 枚，且 1、3、9、27 能表示 40 = (3^4-1)/2
    eq("砝码上限公式 (3^4-1)/2", (Math.pow(3, 4) - 1) / 2, 40);
    return { ran: out.length, fail: fail };
  }

  var TOPIC_FN = {
    "数字推理": [gArith, gArith2, gGeo, gRecAdd, gRecMul, gSquare, gCube, gSumRule, gSplit, gFrac],
    "数学运算": [mEngineer, mMeet, mChase, mProfit, mMix, mIncl, mComb, mTree, mAge, mBottle, mCow, mExtreme],
    "资料分析": [matText, matTable, matGrowth],
    "逻辑判断": [gLogic],
    "思维策略": [gBridge, gNim, gWeigh, gJug, gQueue, gAssign, gWeight, gGrid]
  };
  var ALL_TOPICS = Object.keys(TOPIC_FN);

  /* 生成 n 道题；topics 为空表示四类混合 */
  function refresh(n, topics) {
    topics = (topics && topics.length) ? topics.filter(function (t) { return TOPIC_FN[t]; }) : ALL_TOPICS;
    if (!topics.length) topics = ALL_TOPICS;
    var out = [], guard = 0, maxGuard = n * 40 + 400, counts = {};
    topics.forEach(function (t) { counts[t] = 0; });
    // 按题型轮流取「当前产出最少」的那类，避免资料分析（一次出 4 题）挤占其他题型
    while (out.length < n && guard < maxGuard) {
      guard++;
      var topic = topics[0];
      topics.forEach(function (t) { if (counts[t] < counts[topic]) topic = t; });
      var fns = TOPIC_FN[topic], fn = fns[Math.floor(rnd() * fns.length)];
      var before = out.length, q;
      q = fn(fn === matText || fn === matTable || fn === matGrowth ? (guard % 900 + 1) : null, out);
      if (q && out.length === before) out.push(q);   // 单题规则直接返回题目
      counts[topic] += out.length - before;
    }
    return out;
  }

  /* 自检：在 Node 里生成一批并逐题校验结构，返回统计 */
  function selfTest(n, seedRng) {
    if (seedRng) setRng(seedRng);
    stemSeen = Object.create(null);
    var qs = refresh(n || 200), bad = [], dist = { A: 0, B: 0, C: 0, D: 0 }, byTopic = {};
    qs.forEach(function (q) {
      byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
      dist[q.answer]++;
      var texts = q.options.map(function (o) { return o.t; });
      var uniq = {}; texts.forEach(function (t) { uniq[t] = 1; });
      if (q.options.length !== 4) bad.push([q.stem, "选项数"]);
      else if (Object.keys(uniq).length !== 4) bad.push([q.stem, "选项重复"]);
      else if (!q.options.some(function (o) { return o.k === q.answer; })) bad.push([q.stem, "答案不在选项"]);
      else if (!q.tip || !q.analysis) bad.push([q.stem, "缺技巧/解析"]);
      else if (q.topic === "资料分析" && !q.materialHtml) bad.push([q.stem, "缺材料"]);
      else if (q.options.map(function (o) { return o.k; }).join("") !== "ABCD") bad.push([q.stem, "字母异常"]);
    });
    return { total: qs.length, bad: bad, dist: dist, byTopic: byTopic };
  }

  global.EpiGen = { refresh: refresh, selfTest: selfTest, setRng: setRng, topics: ALL_TOPICS, solverTests: solverTests };
})(typeof window !== "undefined" ? window : this);
