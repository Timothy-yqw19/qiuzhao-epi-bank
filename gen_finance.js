#!/usr/bin/env node
/**
 * 用出题器批量产出「金融计算」题 → data/finance.json（银行综合知识常考公式题）。
 * 用法：node gen_finance.js [--n 260] [--seed 20261003]
 */
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const OUT = path.join(HERE, "data", "finance.json");

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; }

const want = arg("n", 260), seed = arg("seed", 20261003);
const sandbox = {};
new Function("window", fs.readFileSync(path.join(HERE, "app_gen.js"), "utf8"))(sandbox);
const G = sandbox.EpiGen;
if (!G) throw new Error("app_gen.js 未导出 EpiGen");

G.setRng(mulberry32(seed));
G.resetSeen();
const qs = G.refresh(want, ["金融计算"]);
if (!qs.length) { console.error("没有生成出金融计算题"); process.exit(1); }
qs.forEach((q, i) => { q.id = 700001 + i; q.source = "生成"; q.src = "gen"; q.diff = q.diff || 2; });

const bad = qs.filter((q) => q.options.length !== 4 || !q.options.some((o) => o.k === q.answer) ||
  new Set(q.options.map((o) => o.svg || o.t)).size !== 4 || !q.tip || !q.analysis);
if (bad.length) { console.error("有 %d 题结构不合格，中止", bad.length); process.exit(1); }

fs.writeFileSync(OUT, JSON.stringify({
  meta: { generator: "app_gen.js (金融计算) via gen_finance.js", seed, count: qs.length,
          note: "每题由公式算出并用另一种写法复核；答案可逐题验算。" },
  questions: qs,
}), "utf8");
console.log(`已生成 ${OUT}（${qs.length} 题，${(fs.statSync(OUT).size / 1024).toFixed(0)} KB）`);
console.log("题号:", qs[0].id, "-", qs[qs.length - 1].id);
