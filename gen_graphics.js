#!/usr/bin/env node
/**
 * 用出题器批量产出「图形推理」题（图形由 SVG 现场绘制，选项也是图形），写成 data/graphics.json。
 * 目的：公网版（不含真题库）也能练到真正的行测图推，而不是只有手写的那几道基础题。
 *
 * 用法：node gen_graphics.js [--n 160] [--seed 20261003]
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = path.join(HERE, "data", "graphics.json");

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

const want = arg("n", 160);
const seed = arg("seed", 20261003);

const sandbox = {};
new Function("window", fs.readFileSync(path.join(HERE, "app_gen.js"), "utf8"))(sandbox);
const G = sandbox.EpiGen;
if (!G || !G.refresh) throw new Error("app_gen.js 未导出 EpiGen");

const t = G.solverTests();
if (t.fail.length) { console.error("求解器回归未通过：\n  " + t.fail.join("\n  ")); process.exit(1); }

G.setRng(mulberry32(seed));
G.resetSeen();
const qs = G.refresh(want, ["图形推理"]);
if (!qs.length) { console.error("没有生成出图形推理题"); process.exit(1); }

qs.forEach((q, i) => {
  q.id = 600001 + i;          // 原题 1-134 / 生成 1001+ / 真题 300001+ / 思维策略 500001+ / 本机新题 900001+
  q.source = "生成";
  q.src = "gen";
  q.diff = q.diff || 3;
});

const bad = qs.filter((q) =>
  q.options.length !== 4 ||
  !q.options.some((o) => o.k === q.answer) ||
  new Set(q.options.map((o) => o.svg || o.t)).size !== 4 ||
  q.options.some((o) => !o.svg && !o.t) ||
  !q.tip || !q.analysis
);
if (bad.length) { console.error("有 %d 题结构不合格，中止", bad.length); process.exit(1); }

const byStem = {};
qs.forEach((q) => { const k = q.stem.slice(0, 6); byStem[k] = (byStem[k] || 0) + 1; });
fs.writeFileSync(OUT, JSON.stringify({
  meta: {
    generator: "app_gen.js (图形推理作图器) via gen_graphics.js",
    seed: seed, count: qs.length,
    note: "图形由程序按规律绘制、选项也是图形；答案由构造规则给出并做唯一性校验。",
  },
  questions: qs,
}), "utf8");
console.log(`已生成 ${OUT}（${qs.length} 题，${(fs.statSync(OUT).size / 1024).toFixed(0)} KB）`);
console.log("题号:", qs[0].id, "-", qs[qs.length - 1].id);
console.log("规律分布:", JSON.stringify(byStem));
