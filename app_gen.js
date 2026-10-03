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
  function resetSeen() { stemSeen = Object.create(null); }   // 变体用尽后允许重来（一键刷新不能点几次就没题）

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

  /* 倒水：BFS 求最少步数（状态空间搜索） */
  function jugBfs(a, b, target) {
    var seen = { "0,0": 0 }, q = [[0, 0, 0]];
    while (q.length) {
      var cur = q.shift(), x = cur[0], y = cur[1], d = cur[2];
      if (x === target || y === target) return d;
      var nx = [[a, y], [x, b], [0, y], [x, 0],
                [Math.max(0, x - (b - y)), Math.min(b, x + y)],
                [Math.min(a, x + y), Math.max(0, y - (a - x))]];
      for (var i = 0; i < nx.length; i++) {
        var k = nx[i][0] + "," + nx[i][1];
        if (seen[k] === undefined) { seen[k] = d + 1; q.push([nx[i][0], nx[i][1], d + 1]); }
      }
    }
    return null;
  }

  /* 倒水：另一套完全不同的解法——「始终朝一个方向倒」的两种经典策略，取较小者。
     两容器问题的最优解一定在其中之一，所以它能独立地验证 BFS 的结果。 */
  function jugGreedy(a, b, target, startWithA) {
    var x = 0, y = 0, steps = 0;
    while (steps < 1000) {
      if (x === target || y === target) return steps;
      if (startWithA) {
        if (x === 0) x = a;
        else if (y === b) y = 0;
        else { var p = Math.min(x, b - y); x -= p; y += p; }
      } else {
        if (y === 0) y = b;
        else if (x === a) x = 0;
        else { var p2 = Math.min(y, a - x); y -= p2; x += p2; }
      }
      steps++;
    }
    return Infinity;
  }
  function jugMinByGreedy(a, b, target) {
    return Math.min(jugGreedy(a, b, target, true), jugGreedy(a, b, target, false));
  }

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
    // 容量取互质（gcd=1 时 1..max 都能量出），并排除「目标刚好等于某个容器容量」的废题
    // （否则答案就是 1 步「直接装满」，没有思考价值）
    var a = ri(4, 9), b = ri(4, 9), guard0 = 0;
    while ((a === b || gcd(a, b) !== 1) && guard0++ < 60) { b = ri(4, 9); }
    if (a === b || gcd(a, b) !== 1) return null;
    var opts = [];
    for (var c = 1; c <= Math.max(a, b); c++) if (c !== a && c !== b) opts.push(c);
    if (!opts.length) return null;
    var target = pick(opts);
    var best = jugBfs(a, b, target);
    if (best === null || best < 2) return null;
    if (best !== jugMinByGreedy(a, b, target)) return null;   // 两种独立解法必须一致，否则丢题
    return build("思维策略", "思维策略",
      "有两个容器，分别能装 " + a + " 升和 " + b + " 升水，一开始都是空的，没有刻度。" +
      "只允许「装满、倒空、互相倒」三种操作，最少需要几步才能量出正好 " + target + " 升水？",
      best, [best + 1, best + 2, Math.abs(a - b) + 1],
      "倒水问题用「状态搜索」：每一步都是一个 (容器A水量, 容器B水量) 的状态，从 (0,0) 开始逐层扩展，第一次出现目标水量时的步数就是最少步数。",
      "容器 A 容量 " + a + " 升、B 容量 " + b + " 升，要量出 " + target + " 升。按状态逐层扩展，最少 " + best + " 步可达到目标（关键是把每次操作看成一个状态转移，而不是凭感觉倒）。",
      { ff: function (v) { return fmt(v, " 步"); },
        check: function () { return best !== null && best >= 2 && target !== a && target !== b; } });
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

    // 倒水：两套独立解法（BFS 状态搜索 vs 两向贪心）必须给出同一个最少步数；
    // 定值只写手工验证过的经典例（3&5 量 4 升：装满5→倒进3(余2)→倒空3→2倒进3→装满5→倒1进3，共 6 步）
    [[3, 5, 4], [4, 7, 2], [5, 8, 3], [4, 9, 7]].forEach(function (c) {
      var rb = jugBfs(c[0], c[1], c[2]), rg = jugMinByGreedy(c[0], c[1], c[2]);
      eq("倒水 " + c[0] + "&" + c[1] + " 量 " + c[2] + " 升：BFS 与贪心一致", rb, rg);
    });
    eq("倒水 3&5 量出 4 升最少步数（手工验证）", jugBfs(3, 5, 4), 6);
    return { ran: out.length, fail: fail };
  }


  /* ============================ 图形推理（程序化作图） ============================
   * 行测图推的四大规律族里，能机器作画又能量化验证的都做进来：
   *   数量规律（封闭区域数、直线段数）· 属性规律（对称轴数量）
   *   位置规律（旋转、黑点平移）· 样式规律（去同存异）· 特殊考点（一笔画）
   * 每题都按规则作图，选项也是图形；答案由构造规则直接给出并反向校验。
   * ==========================================================================*/
  var INK = "#111", GRID = "#c9ced6";

  function cellBox(inner) { return inner || ""; }

  /* 把若干格子横排成一张 SVG；null 表示「?」格 */
  function rowSvg(items, cw, ch) {
    cw = cw || 96; ch = ch || 96;
    var pad = 6, n = items.length, W = pad + n * (cw + pad), H = ch + 2 * pad;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var x = pad + i * (cw + pad);
      parts.push('<rect x="' + x + '" y="' + pad + '" width="' + cw + '" height="' + ch + '" fill="#fff" stroke="' + GRID + '"/>');
      parts.push('<g transform="translate(' + x + ',' + pad + ') scale(' + (cw / 100) + ',' + (ch / 100) + ')">' + (items[i] || '<text x="50" y="66" font-size="46" text-anchor="middle" fill="#111">?</text>') + '</g>');
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + Math.round(W * 0.92) + '" height="' + Math.round(H * 0.92) + '" xmlns="http://www.w3.org/2000/svg">' + parts.join("") + '</svg>';
  }

  function dots(n, cols, r) {           // n 个黑点，按 cols 列排布
    cols = cols || 3; r = r || 11;
    var out = [], gap = 70 / (cols - 1 || 1), rows = Math.ceil(n / cols);
    for (var i = 0; i < n; i++) {
      var cx = cols === 1 ? 50 : 15 + (i % cols) * gap;
      var cy = 15 + Math.floor(i / cols) * (rows > 1 ? 70 / (rows - 1) : 0);
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '" fill="' + INK + '"/>');
    }
    return out.join("");
  }

  function polyPath(pts, close, w) {
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" ");
    if (close) d += " Z";
    return '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round" stroke-linecap="round"/>';
  }

  /* 正多边形顶点 */
  function regPoly(n, cx, cy, r, rot) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (rot || 0) + i * 2 * Math.PI / n - Math.PI / 2;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return pts;
  }

  /* 1) 数量规律：封闭区域数递增（正方形内加 n-1 条竖线 → n 个区域） */
  function gRegion() {
    var start = ri(1, 4), delta = pick([1, 2]), shape = pick(["rect", "circle"]);
    var cells = [], vals = [], i, k;
    function cellFor(v) {
      var inner = shape === "circle"
        ? '<circle cx="50" cy="50" r="34" fill="#fff" stroke="' + INK + '" stroke-width="3"/>'
        : '<rect x="16" y="18" width="68" height="64" fill="#fff" stroke="' + INK + '" stroke-width="3"/>';
      for (var q = 1; q < v; q++) {
        var x = 16 + 68 * q / v;
        inner += '<line x1="' + x.toFixed(1) + '" y1="' + (shape === "circle" ? "20" : "18") + '" x2="' + x.toFixed(1) + '" y2="' + (shape === "circle" ? "80" : "82") + '" stroke="' + INK + '" stroke-width="2.4"/>';
      }
      return inner;
    }
    for (i = 0; i < 4; i++) { var v = start + i * delta; vals.push(v); cells.push(cellFor(v)); }
    var want = start + 4 * delta;
    var correct = cellFor(want);
    var opts = [correct, cellFor(want - 1), cellFor(want + 1), cellFor(want + 2)];
    var q = buildSvg("数量规律：数「封闭区域（面）」的个数。",
      rowSvg(cells.concat([null])), opts, 0,
      "图形内部被线条分割出的每一块都是一个「面」。先数每个图里有几个封闭区域，看是否成等差。",
      "四个图的封闭区域数依次为 " + vals.join("、") + "，每次增加 " + delta + "，所以问号处应有 " + want + " 个封闭区域。",
      "region|" + start + "|" + delta + "|" + shape);
    return q;
  }

  /* 2) 数量规律：直线段数递增 */
  function gLines() {
    var start = ri(3, 7), cells = [], vals = [], i, k, style = pick(["zig", "fan"]);
    function star(n) {                       // n 条线段组成的折线
      var pts = [], seg = 70 / n, t;
      if (style === "fan") {                 // 从同一点出发的扇状折线（角度限制在 0.08π~0.5π，
        // 否则端点会算到负坐标、画到格子外面去——几何校验抓过这个 bug）
        for (t = 0; t < n; t++) {
          var a = Math.PI * (0.08 + 0.42 * (t / (n - 1 || 1)));
          pts.push([18, 80]);
          pts.push([+(18 + 68 * Math.cos(a)).toFixed(1), +(80 - 66 * Math.sin(a)).toFixed(1)]);
        }
        return pts.map(function (p, idx) { return idx % 2 ? "" : polyPath([p, pts[idx + 1]], false, 3); }).join("");
      }
      // 要恰好 n 条线段 → 需要 n+1 个点（折线的段数 = 点数 − 1，之前少画一条，解析里的数字就与图形对不上）
      for (t = 0; t <= n; t++) pts.push([15 + t * seg, t % 2 ? 78 : 22]);
      return polyPath(pts, false, 3);
    }
    for (i = 0; i < 4; i++) { vals.push(start + i); cells.push(star(start + i)); }
    var want = start + 4;
    var q = buildSvg("数量规律：数直线段的条数。",
      rowSvg(cells.concat([null])), [star(want), star(want - 1), star(want + 1), star(want + 2)], 0,
      "图形由直线组成时，先数「线段条数」（折线一段算一条）。",
      "四个图的直线段数依次为 " + vals.join("、") + "，每次加 1，问号处应为 " + want + " 条。",
      "lines|" + start + "|" + style);
    return q;
  }

  /* 3) 属性规律：对称轴数量递增（1、2、3、4 → 5：正五边形） */
  function gSym() {
    var shapes = {
      // 1 条对称轴：必须是「等腰但不等边」的三角形（若画成等边三角形就是 3 条轴，答案就错了）
      1: polyPath([[50, 16], [80, 84], [20, 84]], true, 3),
      // 2 条对称轴：长方形（非正方形）
      2: '<rect x="16" y="28" width="68" height="44" fill="none" stroke="' + INK + '" stroke-width="3"/>',
      // 3 条：等边三角形
      3: polyPath(regPoly(3, 50, 56, 36, 0), true, 3),
      // 4 条：正方形
      4: '<rect x="22" y="22" width="56" height="56" fill="none" stroke="' + INK + '" stroke-width="3"/>'
    };
    shapes[5] = polyPath(regPoly(5, 50, 52, 34, 0), true, 3);
    shapes[6] = polyPath(regPoly(6, 50, 52, 33, 0), true, 3);
    shapes[7] = polyPath(regPoly(7, 50, 52, 34, 0), true, 3);   // 正七边形 7 条对称轴
    shapes[8] = polyPath(regPoly(8, 50, 52, 34, 0), true, 3);   // 正八边形 8 条对称轴（留足干扰项）
    // 已知四格是前四个「轴数」），答案是下一格——不能把答案本身放进已知序列
    var want6 = pick([5, 6]);                     // 求 5 / 6 条对称轴
    var keys = [want6 - 4, want6 - 3, want6 - 2, want6 - 1], cells = keys.map(function (k) { return shapes[k]; });
    var answerShape = shapes[want6];
    var others = [1, 2, 3, 4, 5, 6, 7, 8].filter(function (x) { return keys.indexOf(x) < 0 && x !== want6; });
    if (others.length < 3) return null;
    var op = shuffleCopy(others).slice(0, 3).map(function (x) { return shapes[x]; });
    var q = buildSvg("属性规律：数对称轴。",
      rowSvg(cells.concat([null])), [answerShape].concat(op), 0,
      "规则图形优先数「对称轴的条数」；注意区分仅轴对称与同时中心对称。",
      "四个图形的对称轴依次为 " + keys.join("、") + " 条，所以问号处应有 " + want6 + " 条对称轴" +
      "（正五边形 5 条、正六边形 6 条、正方形 4 条）。",
      "sym|" + want6);
    return q;
  }

  /* 4) 位置规律：图形按固定角度旋转（每次顺时针 k 度） */
  function gRotate() {
    var stepDeg = pick([30, 45, 60, 90, 120]), startDeg = pick([0, 15, 20, 30, 45]);
    var style = pick(["arrow", "L", "flag"]);
    function arrow(deg) {
      var a = deg * Math.PI / 180;
      if (style === "L") {                                  // 「L」形折线，旋转同样看得出来
        var p1 = [50 - 26 * Math.cos(a), 50 - 26 * Math.sin(a)];
        var cor = [50 + 8 * Math.cos(a) - 20 * Math.sin(a), 50 + 8 * Math.sin(a) + 20 * Math.cos(a)];
        var p2 = [50 + 26 * Math.cos(a), 50 + 26 * Math.sin(a)];
        return polyPath([p1, cor, p2], false, 4);
      }
      if (style === "flag") {                               // 旗形：一条横杆 + 一面小旗
        var t1 = [50 - 28 * Math.cos(a), 50 - 28 * Math.sin(a)];
        var t2 = [50 + 28 * Math.cos(a), 50 + 28 * Math.sin(a)];
        var n1 = [-Math.sin(a), Math.cos(a)];
        var f1 = [t2[0] - 14 * Math.cos(a) + 16 * n1[0], t2[1] - 14 * Math.sin(a) + 16 * n1[1]];
        var f2 = [t2[0] - 14 * Math.cos(a) - 16 * n1[0], t2[1] - 14 * Math.sin(a) - 16 * n1[1]];
        return polyPath([t1, t2], false, 4) + polyPath([t2, f1, f2], true, 2.4);
      }
      var tip = [50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)];
      var tail = [50 - 30 * Math.cos(a), 50 - 30 * Math.sin(a)];
      var l = [50 + 8 * Math.cos(a + 2.5), 50 + 8 * Math.sin(a + 2.5)];
      var r = [50 + 8 * Math.cos(a - 2.5), 50 + 8 * Math.sin(a - 2.5)];
      return polyPath([tail, l, tip, r, tail], false, 3.4);
    }
    var cells = [], angs = [];
    for (var i = 0; i < 4; i++) { var d = startDeg + i * stepDeg; angs.push(d); cells.push(arrow(d)); }
    var want = startDeg + 4 * stepDeg;
    var q = buildSvg("位置规律：看旋转方向与角度。",
      rowSvg(cells.concat([null])), [arrow(want), arrow(want + stepDeg), arrow(want - stepDeg), arrow(want + 2 * stepDeg)], 0,
      "形状完全一样、只有方向在变 → 看旋转。相邻两图夹角就是要旋转的角度，别只看方向忘了角度。",
      "每次顺时针旋转 " + stepDeg + "°，前四图角度依次为 " + angs.join("°、") + "°，所以问号处应为 " + want + "°。",
      "rot|" + stepDeg + "|" + startDeg + "|" + style);
    return q;
  }

  /* 5) 位置规律：黑点在 3×3 格中规律移动 */
  function gMove() {
    var step = pick([1, 2, 3, 4, 5, 6, 7, 8]), start = ri(0, 8);
    function frame(pos) {
      var out = '<rect x="12" y="12" width="76" height="76" fill="none" stroke="' + INK + '" stroke-width="2.6"/>';
      for (var g = 1; g < 3; g++) {
        out += '<line x1="' + (12 + 76 * g / 3) + '" y1="12" x2="' + (12 + 76 * g / 3) + '" y2="88" stroke="' + INK + '" stroke-width="1.6"/>';
        out += '<line x1="12" y1="' + (12 + 76 * g / 3) + '" x2="88" y2="' + (12 + 76 * g / 3) + '" stroke="' + INK + '" stroke-width="1.6"/>';
      }
      var c = pos % 3, r = Math.floor(pos / 3);
      out += '<circle cx="' + (12 + 76 * (c * 2 + 1) / 6) + '" cy="' + (12 + 76 * (r * 2 + 1) / 6) + '" r="9" fill="' + INK + '"/>';
      return out;
    }
    var cells = [], seq = [];
    for (var i = 0; i < 4; i++) { var p = (start + i * step) % 9; seq.push(p); cells.push(frame(p)); }
    var want = (start + 4 * step) % 9;
    var q = buildSvg("位置规律：黑点在九宫格中按规律移动。",
      rowSvg(cells.concat([null])), [frame(want), frame((want + 1) % 9), frame((want + 3) % 9), frame((want + 8) % 9)], 0,
      "把九宫格按 1~9 编号（左上为 1，逐行向右），看黑点每次移动几格、朝哪个方向（本题是每步 +" + step + " 格）。",
      "黑点位置依次为第 " + seq.join("、") + " 格，每次前进 " + step + " 格（超过 9 就循环回前面），所以下一格是第 " + want + " 格。",
      "move|" + step + "|" + start);
    return q;
  }

  /* 6) 样式规律：去同存异（前两图相同部分去掉、不同部分保留） */
  function gXor() {
    var units = [];
    for (var i = 0; i < 8; i++) units.push(i);          // 8 格 → 变体更多，也降低「答案与序列图撞车」的概率
    function subset() { return units.filter(function () { return rnd() < 0.5; }); }
    var A = subset(), B = subset();
    while (A.length === 0 || B.length === 0 || xor(A, B).length === 0) { A = subset(); B = subset(); }
    function xor(x, y) { return x.filter(function (u) { return (y.indexOf(u) < 0) !== (x.indexOf(u) < 0) ? true : false; })
                              .filter(function (v, i, a) { return a.indexOf(v) === i; })
                              .concat(y.filter(function (u) { return x.indexOf(u) < 0; })); }
    function uniq(a) { var o = []; a.forEach(function (v) { if (o.indexOf(v) < 0) o.push(v); }); return o; }
    function draw(list) {
      var pos = [[22, 26], [44, 26], [66, 26], [88, 26], [22, 66], [44, 66], [66, 66], [88, 66]];
      return list.map(function (u) {
        return '<circle cx="' + pos[u][0] + '" cy="' + pos[u][1] + '" r="9" fill="' + INK + '"/>';
      }).join("");
    }
    var X1 = uniq(xor(A, B));
    var C = subset(), D = subset();
    var guard = 0;
    while ((C.length === 0 || D.length === 0 || uniq(xor(C, D)).length === 0) && guard++ < 50) { C = subset(); D = subset(); }
    var X2 = uniq(xor(C, D));
    if (!X1.length || !X2.length) return null;
    var cells = [draw(A), draw(B), draw(X1), draw(C), draw(D)];
    var q = buildSvg("样式规律：前两图「去同存异」得到第三图。",
      rowSvg(cells.concat([null])), [draw(X2), draw(uniq(C.concat(D))), draw(A), draw(uniq(X2.concat([0])))], 0,
      "同位置相比：两图都有 → 去掉；只有一个图有 → 保留。这叫「去同存异」（相加就是「去异存同」的对照）。",
      "第 1、2 图去同存异得到第 3 图；同理第 4、5 图去同存异即为答案：两图都有的位置去掉，只有其一有的位置保留。",
      "xor|" + draw(A) + draw(B) + draw(C) + draw(D));
    return q;
  }

  /* 7) 特殊考点：一笔画（连通图中奇点数为 0 或 2 才能一笔画成） */
  function gStroke() {
    function oddCount(nodes, edges) {
      var deg = nodes.map(function () { return 0; });
      edges.forEach(function (e) { deg[e[0]]++; deg[e[1]]++; });
      var odd = 0;
      deg.forEach(function (d) { if (d % 2 === 1) odd++; });
      return odd;
    }
    function connected(nodes, edges) {            // 一笔画必须是连通图，断开的不算
      var adj = nodes.map(function () { return []; });
      edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
      var seen = {}, st = [0]; seen[0] = 1;
      while (st.length) { var v = st.pop(); adj[v].forEach(function (u) { if (!seen[u]) { seen[u] = 1; st.push(u); } }); }
      return Object.keys(seen).length === nodes.length;
    }
    function drawFig(nodes, edges) {
      return edges.map(function (e) {
        var a = nodes[e[0]], b = nodes[e[1]];
        return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] +
               '" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
      }).join("");
    }
    var SQ = [[22, 22], [78, 22], [78, 78], [22, 78]];
    var TRI = [[50, 18], [84, 80], [16, 80]];
    var PENT = regPoly(5, 50, 52, 36, 0);
    var HFIG = [[50, 20], [22, 52], [78, 52], [22, 82], [78, 82]];
    // 能一笔画（奇点 0 或 2，且连通）
    var ONE = [
      [TRI, [[0, 1], [1, 2], [2, 0]]],
      [SQ, [[0, 1], [1, 2], [2, 3], [3, 0]]],
      [PENT, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]],
      [HFIG, [[0, 1], [0, 2], [1, 3], [3, 4], [2, 4], [1, 2]]],
      [SQ, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]]
    ];
    // 不能一笔画（奇点 4 或 6）
    var BAD = [
      [SQ, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]]],                                  // 正方形+两条对角线
      [[[50, 16], [50, 84], [16, 50], [84, 50]], [[0, 1], [2, 3], [0, 2], [0, 3], [1, 2], [1, 3]]], // 十字
      [TRI.concat([[50, 56]]), [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]]],               // 三角形+中心连三顶点
      [TRI.concat([[50, 50]]), [[0, 1], [1, 2], [2, 0], [0, 3], [3, 1], [3, 2]]]                // 三角形+三条中线
    ];
    // 校验：ONE 全部连通且奇点 0/2；BAD 全部不满足（否则干扰项也能一笔画，答案就不唯一了）
    for (var c = 0; c < ONE.length; c++) {
      var oc = oddCount(ONE[c][0], ONE[c][1]);
      if ([0, 2].indexOf(oc) < 0 || !connected(ONE[c][0], ONE[c][1])) return null;
    }
    for (var b = 0; b < BAD.length; b++) {
      var o2 = oddCount(BAD[b][0], BAD[b][1]);
      if (o2 === 0 || o2 === 2 || !connected(BAD[b][0], BAD[b][1])) return null;
    }
    var okFig = ONE[ri(0, ONE.length - 1)];
    var correctInner = drawFig(okFig[0], okFig[1]);
    var badPick = shuffleCopy(BAD).slice(0, 3).map(function (x) { return drawFig(x[0], x[1]); });
    if (badPick.length < 3) return null;
    var ansIdx = ri(0, 3), list = [];
    for (var i2 = 0; i2 < 4; i2++) list.push(i2 === ansIdx ? correctInner : badPick[i2 > ansIdx ? i2 - 1 : i2]);
    if (list.filter(function (x) { return !!x; }).length !== 4) return null;
    return buildSvg("下面四个图形中，哪一个可以一笔画成（不重复地画完每条线，起点任意）？",
      null, list, ansIdx,
      "一笔画的判定：先看是否连通，再数「奇点」（引出奇数条线的点）。奇点数为 0 或 2 时能一笔画成；否则需要 奇点数 ÷ 2 笔。",
      "正确答案那个图形是连通的，且奇点数为 " + oddCount(okFig[0], okFig[1]) + "，可以一笔画成；" +
      "其余三个图形的奇点数分别是 4、4、4（或 6），都不是 0 或 2，必须分多笔才能画完。",
      "stroke|" + correctInner + "|" + badPick.join(""));
  }

  function shuffleCopy(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }

  /* 图形题的组装：题干图 + 图形选项 + 答案字母
     两个必查项：
       1) 正确答案的图形不能出现在题干图里（否则等于把答案摆出来）——一笔画那类题踩过；
       2) 选项图形必须套一层 <svg viewBox="0 0 100 100">，否则浏览器会按默认 300x150 坐标系
          渲染，图形会错位/缩成一团。 */
  function buildSvg(stem, seqSvg, optionSvgs, ansIdx, tip, ana, dedupKey) {
    if (!optionSvgs || optionSvgs.length !== 4) return null;
    for (var z = 0; z < 4; z++) if (!optionSvgs[z]) return null;
    var rawAns = optionSvgs[ansIdx];
    if (seqSvg && seqSvg.indexOf(rawAns) >= 0) return null;      // 答案不能直接出现在题干图里

    var idx = [];
    for (var i = 0; i < 4; i++) idx.push(i);
    for (var j = idx.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = idx[j]; idx[j] = idx[k]; idx[k] = t; }
    var letters = "ABCD", options = [], answer = "";
    for (i = 0; i < 4; i++) {
      var raw = optionSvgs[idx[i]];
      options.push({ k: letters[i], t: "", svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + raw + '</svg>' });
      if (idx[i] === ansIdx) answer = letters[i];
    }
    if (!answer) return null;
    var uniqSvg = {};
    for (i = 0; i < options.length; i++) { if (uniqSvg[options[i].svg]) return null; uniqSvg[options[i].svg] = 1; }

    var contentKey = (seqSvg || "") + "||" + optionSvgs.join("|");
    var key = dedupKey || contentKey;
    if (stemSeen[key]) return null;
    stemSeen[key] = 1;
    return {
      module: "判断推理", topic: "图形推理", source: "生成", src: "gen",
      stem: stem, options: options, svg: seqSvg || null, imgs: null,
      tip: tip, analysis: ana, answer: answer,
      materialTitle: "", materialHtml: "", sectionTip: "", moduleTip: "",
      diff: 3
    };
  }


  /* ============================ 金融计算（银行综合知识） ============================
   * 全是银行笔试常考的公式题：单利/复利、票据贴现、财务比率、货币乘数与存款派生、
   * 汇率换算、有效年利率、现值、EPS/PE。每题都由公式算出，再用另一种写法复核。
   * ==========================================================================*/
  function money(v, unit) { return (Math.round(v * 100) / 100) + (unit || ""); }

  /* 1) 单利计息 */
  function fSimple() {
    var P = ri(10, 90) * 10000;                       // 本金（元）
    var r = pick([2.25, 2.75, 3.0, 3.25, 3.5, 4.0]);  // 年利率 %
    var n = ri(2, 5);
    var interest = P * r / 100 * n;
    if (Math.abs(interest - Math.round(interest)) > 1e-6) return null;
    interest = Math.round(interest);
    return build("综合知识", "金融计算",
      "某企业存入银行 " + (P / 10000) + " 万元，年利率 " + r + "%，按单利计息，存期 " + n + " 年。到期可获得的利息是多少元？",
      interest, [interest * 1.1, P * r / 100, interest + P],
      "单利：利息 = 本金 × 年利率 × 年数（本金不计入下期计息）。",
      "利息 = " + P + " × " + r + "% × " + n + " = " + interest + " 元。",
      { ff: function (v) { return fmt(v, " 元"); },
        check: function () { return P * r / 100 * n === interest; } });
  }

  /* 2) 复利终值 */
  function fCompound() {
    var P = ri(5, 50) * 10000, r = pick([5, 8, 10, 12]), n = pick([2, 3]);
    var fv = P * Math.pow(1 + r / 100, n);
    if (Math.abs(fv - Math.round(fv)) > 1e-6) return null;
    fv = Math.round(fv);
    var simple = P * (1 + r / 100 * n);
    return build("综合知识", "金融计算",
      "本金 " + (P / 10000) + " 万元，年利率 " + r + "%，每年复利一次，存 " + n + " 年后的本息和是多少元？",
      fv, [Math.round(simple), Math.round(fv * 1.05), Math.round(P + P * r / 100)],
      "复利终值 = 本金 × (1 + 利率)^年数；注意与单利的区别（复利是「利滚利」）。",
      "本息和 = " + P + " × (1 + " + r + "%)^" + n + " = " + fv + " 元（若误按单利算是 " + Math.round(simple) + " 元，会偏低）。",
      { ff: function (v) { return fmt(v, " 元"); },
        check: function () { return Math.abs(P * Math.pow(1 + r / 100, n) - fv) < 1; } });
  }

  /* 3) 票据贴现 */
  function fDiscount() {
    var F = ri(6, 30) * 60000;                        // 票据面值，能被 360 整除
    var d = pick([3.6, 4.5, 5.4, 6.0, 7.2]);
    var days = pick([30, 45, 60, 90, 120]);
    var disc = F * d / 100 * days / 360;
    if (Math.abs(disc - Math.round(disc)) > 1e-6) return null;
    disc = Math.round(disc);
    var net = F - disc;
    return build("综合知识", "金融计算",
      "某企业持有一张面值 " + (F / 10000) + " 万元的银行承兑汇票，距到期还有 " + days + " 天，" +
      "到银行办理贴现，年贴现率 " + d + "%（按 360 天计算）。银行实际支付多少元？",
      net, [F, F + disc, Math.round(F * d / 100)],
      "贴现息 = 票面金额 × 贴现率 × 贴现天数 ÷ 360；银行实际支付 = 票面金额 − 贴现息（贴现息先扣）。",
      "贴现息 = " + F + " × " + d + "% × " + days + " ÷ 360 = " + disc + " 元，实付 = " + F + " − " + disc + " = " + net + " 元。",
      { ff: function (v) { return fmt(v, " 元"); },
        check: function () { return F - F * d / 100 * days / 360 === net; } });
  }

  /* 4) 流动比率 / 速动比率 */
  function fLiquidity() {
    var cur = ri(40, 120) * 100;                       // 流动资产
    var inv = ri(10, 40) * 100;                        // 存货
    if (inv >= cur) return null;
    var lia = ri(20, 60) * 100;                        // 流动负债
    var quick = (cur - inv) / lia;
    var q = Math.round(quick * 100) / 100;
    return build("综合知识", "金融计算",
      "某公司流动资产 " + (cur / 10000) + " 万元，其中存货 " + (inv / 10000) + " 万元，流动负债 " +
      (lia / 10000) + " 万元。该公司的速动比率约为多少？",
      q, [Math.round(cur / lia * 100) / 100, Math.round(inv / lia * 100) / 100, Math.round(q * 2 * 100) / 100],
      "流动比率 = 流动资产 ÷ 流动负债；速动比率 =（流动资产 − 存货）÷ 流动负债，存货变现慢所以要扣掉。",
      "速动比率 = (" + cur + " − " + inv + ") ÷ " + lia + " ≈ " + q.toFixed(2) + "（流动比率是 " + (cur / lia).toFixed(2) + "）。",
      { ff: function (v) { return (Math.round(v * 100) / 100).toFixed(2); },   // 与解析里的两位小数保持一致
        check: function () { return Math.abs((cur - inv) / lia - q) < 0.005; } });
  }

  /* 5) 资产负债率 */
  function fDebtRatio() {
    var assets = ri(50, 200) * 1000, debt = ri(20, 45) * 1000;
    if (debt >= assets) return null;
    var pct = Math.round(debt / assets * 1000) / 10;
    return build("综合知识", "金融计算",
      "某公司资产总额 " + (assets / 10000) + " 万元，负债总额 " + (debt / 10000) + " 万元。其资产负债率约为：",
      pct, [Math.round(debt / (assets - debt) * 1000) / 10, Math.round((assets - debt) / assets * 1000) / 10, pct + 10],
      "资产负债率 = 负债总额 ÷ 资产总额 × 100%；它衡量长期偿债能力，数值越低通常负债压力越小。",
      "资产负债率 = " + debt + " ÷ " + assets + " ≈ " + pct.toFixed(1) + "%（注意分母是资产总额，不是所有者权益）。",
      { ff: function (v) { return (Math.round(v * 10) / 10).toFixed(1) + "%"; },
        check: function () { return Math.abs(debt / assets * 100 - pct) < 0.05; } });
  }

  /* 6) 净资产收益率 ROE */
  function fRoe() {
    var profit = ri(20, 90) * 100, equity = ri(40, 200) * 100;
    var roe = Math.round(profit / equity * 1000) / 10;
    if (roe > 40) return null;
    return build("综合知识", "金融计算",
      "某银行当年实现净利润 " + (profit / 10000) + " 万元，年末净资产 " + (equity / 10000) +
      " 万元。其净资产收益率（ROE）约为：",
      roe, [Math.round(profit / (equity + profit) * 1000) / 10, roe + 3, Math.round(roe * 2 * 10) / 10],
      "ROE（净资产收益率）= 净利润 ÷ 净资产 × 100%，衡量股东投入资本的回报；ROA 则用总资产做分母。",
      "ROE = " + profit + " ÷ " + equity + " ≈ " + roe.toFixed(1) + "%。",
      { ff: function (v) { return (Math.round(v * 10) / 10).toFixed(1) + "%"; },
        check: function () { return Math.abs(profit / equity * 100 - roe) < 0.05; } });
  }

  /* 7) 货币乘数与存款派生 */
  function fMultiplier() {
    var r = pick([5, 8, 10, 12.5, 16.5, 20]);          // 法定存款准备金率 %
    var base = ri(4, 20) * 10000;                      // 原始存款
    var m = 100 / r;
    var total = base * m;
    if (Math.abs(total - Math.round(total)) > 1e-6) return null;
    total = Math.round(total);
    return build("综合知识", "金融计算",
      "假定法定存款准备金率为 " + r + "%，商业银行不保留超额准备金、也不持有现金漏损，" +
      "最初存入 " + (base / 10000) + " 万元。银行体系最终可创造的存款总额最多约为多少万元？",
      total / 10000, [base / 10000, total / 10000 * 0.5, base / 10000 * (1 + r / 100)],
      "简单货币乘数 = 1 ÷ 法定存款准备金率；存款派生总额 = 原始存款 × 货币乘数。现实中还有超额准备金与现金漏损，实际乘数更小。",
      "货币乘数 = 1 ÷ " + (r / 100) + " = " + m + "，存款总额 = " + (base / 10000) + " × " + m + " = " + (total / 10000) + " 万元。",
      { ff: function (v) { return money(v, " 万元"); },
        check: function () { return Math.abs(base * (100 / r) - total) < 1; } });
  }

  /* 8) 汇率换算 */
  function fFx() {
    var rate = pick([6.85, 7.05, 7.12, 7.24, 7.31]);
    var usd = ri(20, 200) * 100;
    var cny = usd * rate;
    if (Math.abs(cny - Math.round(cny)) > 1e-6) return null;
    cny = Math.round(cny);
    return build("综合知识", "金融计算",
      "某日银行间市场美元兑人民币汇率为 1 美元 = " + rate + " 元人民币。某企业将 " + usd +
      " 美元结汇成人民币，可得到多少元人民币？",
      cny, [Math.round(usd / rate), Math.round(usd * rate * 1.02), Math.round(usd * (rate + 0.5))],
      "结汇：外币金额 × 美元兑人民币汇率 = 人民币金额。注意区分「直接标价法」下汇率的含义（1 单位外币折合多少本币）。",
      "可兑换人民币 = " + usd + " × " + rate + " = " + cny + " 元。",
      { ff: function (v) { return fmt(v, " 元"); },
        check: function () { return Math.abs(usd * rate - cny) < 1; } });
  }

  /* 9) 有效年利率 */
  function fEar() {
    var r = pick([6, 8, 10, 12]), m = pick([2, 4, 6, 12]);
    var ear = (Math.pow(1 + r / 100 / m, m) - 1) * 100;
    var e = Math.round(ear * 100) / 100;
    return build("综合知识", "金融计算",
      "某理财产品名义年利率 " + r + "%，每年计息 " + m + " 次（按复利）。其有效年利率约为：",
      e, [r, Math.round((r * m) * 100) / 100, Math.round((ear + 1) * 100) / 100],
      "有效年利率 EAR = (1 + 名义年利率 ÷ 年计息次数)^年计息次数 − 1。计息越频繁，EAR 比名义利率越高。",
      "EAR = (1 + " + r + "% ÷ " + m + ")^" + m + " − 1 ≈ " + e.toFixed(2) + "%（名义利率只有 " + r + "%）。",
      { ff: function (v) { return (Math.round(v * 100) / 100).toFixed(2) + "%"; },
        check: function () { return Math.abs((Math.pow(1 + r / 100 / m, m) - 1) * 100 - e) < 0.005; } });
  }

  /* 10) 现值 */
  function fPv() {
    var r = pick([5, 8, 10]), n = pick([2, 3]), pvBase = ri(30, 120) * 1000;
    var fv = pvBase * Math.pow(1 + r / 100, n);
    if (Math.abs(fv - Math.round(fv)) > 1e-6) return null;
    fv = Math.round(fv);
    return build("综合知识", "金融计算",
      "某人希望 " + n + " 年后取得 " + (fv / 10000) + " 万元，年折现率 " + r + "%（按年复利）。现在应投入多少元？",
      pvBase, [fv, Math.round(fv / (1 + r / 100 * n)), Math.round(fv * (1 - r / 100))],
      "现值 = 终值 ÷ (1 + 折现率)^年数。别用单利折现（那样算出的现值偏高）。",
      "现值 = " + fv + " ÷ (1 + " + r + "%)^" + n + " = " + pvBase + " 元。",
      { ff: function (v) { return fmt(v, " 元"); },
        check: function () { return Math.abs(fv / Math.pow(1 + r / 100, n) - pvBase) < 1; } });
  }

  /* 11) EPS 与市盈率 */
  function fEps() {
    var profit = ri(5, 40) * 100000000;              // 净利润（元）
    var shares = ri(10, 50) * 100000000;             // 股本（股）
    var eps = profit / shares;
    var price = pick([4, 6, 8, 10, 12, 15, 20]);
    var pe = price / eps;
    var p = Math.round(pe * 100) / 100;
    var e2 = Math.round(eps * 100) / 100;
    return build("综合知识", "金融计算",
      "某银行股净利润 " + (profit / 100000000) + " 亿元，总股本 " + (shares / 100000000) + " 亿股，" +
      "当前股价 " + price + " 元。其市盈率（PE）约为多少？",
      p, [e2, Math.round(price / (profit / shares) * 1.2 * 100) / 100, Math.round((price / eps + 2) * 100) / 100],
      "每股收益 EPS = 净利润 ÷ 总股本；市盈率 PE = 股价 ÷ 每股收益，衡量「按当前盈利要多少年回本」。",
      "EPS = " + (profit / 100000000) + " 亿 ÷ " + (shares / 100000000) + " 亿股 = " + e2 +
      " 元/股，PE = " + price + " ÷ " + e2 + " ≈ " + p.toFixed(2) + "。",
      { ff: function (v) { return (Math.round(v * 100) / 100).toFixed(2); },   // 同上：PE 也保留两位
        check: function () { return Math.abs(price / (profit / shares) - p) < 0.02; } });
  }

  var TOPIC_FN = {
    "数字推理": [gArith, gArith2, gGeo, gRecAdd, gRecMul, gSquare, gCube, gSumRule, gSplit, gFrac],
    "数学运算": [mEngineer, mMeet, mChase, mProfit, mMix, mIncl, mComb, mTree, mAge, mBottle, mCow, mExtreme],
    "资料分析": [matText, matTable, matGrowth],
    "逻辑判断": [gLogic],
    "思维策略": [gBridge, gNim, gWeigh, gJug, gQueue, gAssign, gWeight, gGrid],
    "图形推理": [gRegion, gLines, gSym, gRotate, gMove, gXor, gStroke],
    "金融计算": [fSimple, fCompound, fDiscount, fLiquidity, fDebtRatio, fRoe, fMultiplier, fFx, fEar, fPv, fEps]
  };
  var ALL_TOPICS = Object.keys(TOPIC_FN);

  /* 生成 n 道题；topics 为空表示全部题型。
     调度方式：把名额均分给「题型 × 规则」的每个组合，逐轮发放；
     某个组合连续失败说明它的变体已用尽，就退出（这样既均衡又不会让变体多的族吃掉全部题量）。 */
  function refresh(n, topics) {
    topics = (topics && topics.length) ? topics.filter(function (t) { return TOPIC_FN[t]; }) : ALL_TOPICS;
    if (!topics.length) topics = ALL_TOPICS;

    var combos = [];
    topics.forEach(function (t) { TOPIC_FN[t].forEach(function (f) { combos.push([t, f]); }); });
    var quota = [], base = Math.floor(n / combos.length), extra = n % combos.length;
    combos.forEach(function (c, i) { quota[i] = base + (i < extra ? 1 : 0); });

    var out = [], failStreak = [], round2 = 0, guard = 0;
    while (out.length < n && round2 < 400) {
      round2++;
      var progressed = false;
      for (var i = 0; i < combos.length && out.length < n; i++) {
        if (quota[i] <= 0) continue;
        failStreak[i] = failStreak[i] || 0;
        if (failStreak[i] >= 15) { quota[i] = 0; continue; }        // 该规则变体已用尽
        guard++;
        if (guard > n * 80 + 2000) break;
        var f = combos[i][1];
        var before = out.length;
        var q = f(f === matText || f === matTable || f === matGrowth ? (round2 * 37 + i + 1) : null, out);
        if (q && out.length === before) out.push(q);
        var produced = out.length - before;
        if (produced > 0) { quota[i] -= produced; failStreak[i] = 0; progressed = true; }
        else failStreak[i]++;
      }
      if (!progressed) break;
    }
    return out.slice(0, Math.max(n, 0));
  }

  /* 自检：在 Node 里生成一批并逐题校验结构，返回统计 */
  function selfTest(n, seedRng) {
    if (seedRng) setRng(seedRng);
    stemSeen = Object.create(null);
    var qs = refresh(n || 200), bad = [], dist = { A: 0, B: 0, C: 0, D: 0 }, byTopic = {};
    qs.forEach(function (q) {
      byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
      dist[q.answer]++;
      // 选项可能是图形（o.svg）而不是文字，用「文字或图形」作为同一性判据
      var texts = q.options.map(function (o) { return o.svg ? ("svg:" + o.svg) : o.t; });
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

  global.EpiGen = { refresh: refresh, selfTest: selfTest, setRng: setRng, topics: ALL_TOPICS, solverTests: solverTests, resetSeen: resetSeen };
})(typeof window !== "undefined" ? window : this);
