#!/usr/bin/env node
/**
 * 用浏览器内出题器（app_gen.js）批量产出「思维策略」题，写成 data/strategy.json。
 *
 * 为什么用 Node 跑浏览器代码：出题器同时要服务「一键刷新」（浏览器里跑）和
 * 「构建期题库」（这里跑），只维护一份实现就不会出现两边规则不一致。
 *
 * 用法：node gen_strategy.js [--n 400] [--seed 20261003]
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const GEN = path.join(HERE, "app_gen.js");
const OUT = path.join(HERE, "data", "strategy.json");

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
}

const want = arg("n", 400);
const seed = arg("seed", 20261003);

const sandbox = {};
new Function("window", fs.readFileSync(GEN, "utf8"))(sandbox);
const G = sandbox.EpiGen;
if (!G || !G.refresh) throw new Error("app_gen.js 未导出 EpiGen");

const t = G.solverTests();
if (t.fail.length) {
  console.error("求解器回归未通过，拒绝出题：\n  " + t.fail.join("\n  "));
  process.exit(1);
}
console.log("求解器回归 %d 项通过" % t.ran);

G.setRng(mulberry32(seed));
const qs = G.refresh(want, ["思维策略"]);
if (qs.length < want) console.warn("只生成出 %d / %d 题（去重后偏少）", qs.length, want);

// 统一成构建期生成题的形态，并给一个独立题号段（原题 1-134 / 生成 1001+ / 真题 300001+ / 本机刷新 900001+）
qs.forEach((q, i) => {
  q.id = 500001 + i;
  q.source = "生成";
  q.src = "gen";
  q.diff = 3;                       // 思维策略是银行 EPI 里公认最费的模块，统一标难
});

const byTopic = {};
qs.forEach((q) => { byTopic[q.topic] = (byTopic[q.topic] || 0) + 1; });
const bad = qs.filter((q) => q.options.length !== 4 || !q.options.some((o) => o.k === q.answer) || !q.tip || !q.analysis);
if (bad.length) {
  console.error("有 %d 题结构不合格，中止", bad.length);
  process.exit(1);
}

const data = {
  meta: {
    generator: "app_gen.js (思维策略) via gen_strategy.js",
    seed: seed,
    count: qs.length,
    note: "每题最优解由穷举/BFS/DP 现场求出并二次校验；这是银行 EPI 特有的思维策略模块，公考题库里没有。",
  },
  questions: qs,
};
fs.writeFileSync(OUT, JSON.stringify(data), "utf8");
console.log(`已生成 ${OUT}（${qs.length} 题，${(fs.statSync(OUT).size / 1024).toFixed(0)} KB）`);
console.log("题号: %d - %d", qs[0].id, qs[qs.length - 1].id);
console.log("题型分布:", JSON.stringify(byTopic));
