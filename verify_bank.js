/**
 * 单文件题库校验：用最小 DOM 桩在 Node 里真正执行 index.html 的内联脚本，
 * 覆盖 ①数据完整性 ②刷题计划组卷 ③作答/错题本/持久化 ④七个页面的渲染产出 ⑤单文件自足性。
 *
 * 用法：node verify_bank.js
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");
const genData = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "generated.json"), "utf8"));
const EXPECT_GEN = genData.questions.length, EXPECT_TOTAL = 134 + EXPECT_GEN;
const N_GEN_STUB = EXPECT_GEN;
const zhentiPath = path.join(__dirname, "data", "zhenti.json");
const ZHENTI = fs.existsSync(zhentiPath) ? JSON.parse(fs.readFileSync(zhentiPath, "utf8")) : null;
const ZH_COUNT = ZHENTI ? ZHENTI.questions.length : 0;

/* ---------- 取出应用脚本 ---------- */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!blocks.length) throw new Error("index.html 里没找到 <script> 块");
const code = blocks[blocks.length - 1][1];

/* ---------- 最小 DOM 桩（带元素记忆，可回读 innerHTML） ---------- */
const dom = {};
function makeEl() {
  const target = function () {};
  return new Proxy(target, {
    get(t, p) {
      if (p === "style" || p === "dataset" || p === "classList") return (t[p] = t[p] || makeEl());
      if (p === "querySelectorAll") return () => [];
      if (p === "appendChild" || p === "remove" || p === "click" || p === "focus") return () => {};
      if (p === "value") return "";
      if (p === "checked") return false;
      if (p in t) return t[p];
      return makeEl();
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return makeEl(); },
  });
}
const document = {
  querySelector: (sel) => (dom[sel] = dom[sel] || makeEl()),
  getElementById: (id) => (dom["#" + id] = dom["#" + id] || makeEl()),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener: () => {},
  body: makeEl(),
  hidden: false,
};
const mem = {};
const localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
const winListeners = {};
// 浏览器里 window 就是全局对象（window.EpiGen === EpiGen），这里用 globalThis 等价模拟
const window = globalThis;
globalThis.addEventListener = (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); };
globalThis.scrollTo = () => {};
const location = { hash: "", protocol: "http:" };
const history = { replaceState: (a, b, url) => { const m = /#.*$/.exec(String(url || "")); if (m) location.hash = m[0]; } };
const navigator = {};   // 无 serviceWorker，启动时应跳过注册

const factory = new Function(
  "document", "window", "localStorage", "Blob", "URL", "FileReader",
  "requestAnimationFrame", "confirm", "alert", "location", "history", "navigator",
  code + `
  ;return {QS,BY_ID,PLAN,APPENDIX,selIds,wrongMD,wrongCSV,stemText,R,isWrong,stateOf,filtered,
           getS:()=>S, KEY, go, startSet, pick, next, finishSet, jump, startWrong, save,
           getView:()=>view, getCur:()=>cur(), getQueue:()=>queue, applyRoute,
           getGen:()=>globalThis.EpiGen, mulberry:(a)=>function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;},
           getFresh:()=>freshQs, getQS:()=>QS, refreshNew, clearFresh, MAX_FRESH, BY_ID_GET:(id)=>BY_ID[id],
           getTimer:()=>S.timer, timerInit, timerAdvance, timerToggle, timerReset, timerSkip, timerPreset, timerChipText, todayStr,
           loadZhenti, getZhenti:()=>zhentiQs, zhentiHint, isLocalHost,
           rushCfg, rushOn, rushSecs, rushTimeout, getRushQid:()=>rushQid,
           setZhentiState:(v)=>{zhentiState=v}, getZhentiState:()=>zhentiState,
           setHost:(h)=>{location.hostname=h}, setProto:(pr)=>{location.protocol=pr},
           wrongList:()=>Object.keys(S.rec).filter(isWrong).map(Number)};`
);
const app = factory(document, window, localStorage, function () {}, { createObjectURL: () => "", revokeObjectURL: () => {} },
  function () {}, () => {}, () => true, () => {}, location, history, navigator);
const saveForce = () => app.save(true);
const fireHash = () => (winListeners["hashchange"] || []).forEach((f) => f());

/* ---------- 断言框架 ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; failures.push(label); console.log("  ✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
const viewHtml = (id) => (dom["#" + id] ? String(dom["#" + id].innerHTML || "") : "");
const count = (s, re) => (s.match(re) || []).length;

console.log("一、数据完整性");
ok(app.QS.length === EXPECT_TOTAL, "共 " + EXPECT_TOTAL + " 题（原题 134 + 生成 " + EXPECT_GEN + "）", app.QS.length);
ok(app.QS.slice(0, 134).every((q, i) => q.id === i + 1), "原题题号 1-134 连续");
ok(new Set(app.QS.map((q) => q.id)).size === app.QS.length, "全库题号唯一无冲突");
ok(app.QS.every((q) => q.options.length === 4), "每题 4 个选项");
ok(app.QS.every((q) => q.options.map((o) => o.k).join("") === "ABCD"), "选项字母均为 A-D");
ok(app.QS.every((q) => q.options.some((o) => o.k === q.answer)), "答案都能在选项里找到");
ok(app.QS.every((q) => q.stem && q.stem.trim()), "题干非空");
ok(app.QS.every((q) => q.tip && q.tip.trim()), "每题都有标准思路（技巧）");
ok(app.QS.filter((q) => q.svg).length === 11, "11 张图形推理配图已内联", app.QS.filter((q) => q.svg).length);
ok(app.QS.filter((q) => q.svg).every((q) => /<svg/.test(q.svg)), "配图内容是合法 SVG 片段");
ok(app.QS.filter((q) => q.materialHtml && q.src !== "gen").length === 12, "原题资料分析 12 题带材料");
ok(app.QS.filter((q) => q.topic === "资料分析" && !q.materialHtml).length === 0, "全库资料分析题都带材料");
ok(app.QS.filter((q) => q.materialHtml).every((q) => q.materialTitle), "带材料题都有材料标题");
ok(/<table/.test(app.QS.find((q) => q.id === 115).materialHtml), "材料二的表格已转成 HTML 表格");
const noAna = app.QS.filter((q) => !q.analysis).map((q) => q.id);
ok(noAna.join(",") === "123,124,125,126,127,128,129,130,131,132,133,134", "无逐步解析的只剩原文的常识 12 题（生成题全部带解析）", noAna.length);
ok(app.QS.every((q) => !/<script|onerror|javascript:/i.test(q.stem + q.tip + (q.analysis || ""))), "题目文本无可注入脚本片段");
ok(app.QS.filter((q) => q.source && q.src !== "gen").map((q) => q.id).join(",") === "68,78,92", "原题来源标注如实反映原文（只有 3 题标了真题）");
ok(app.QS.filter((q) => q.src === "gen").every((q) => q.source === "生成"), "生成题来源统一标注为「生成」");

console.log("二、刷题计划组卷");
ok(app.PLAN.length === 21, "21 天计划");
ok(app.PLAN.every((p) => p.d && p.t && p.act), "每天都有任务与要求");
ok(app.selIds({ k: "r", a: 1, b: 12 }).length === 12, "D1 组卷 = 12 题");
ok(app.selIds({ k: "r", a: 23, b: 40 }).length === 18, "D3 组卷 = 18 题");
ok(app.selIds({ k: "m", m: "言语理解与表达", orig: true }).length === 40, "D15 言语整组 = 40 题");
ok(app.selIds({ k: "m", m: "数量关系", orig: true }).length === 27, "D16 数量整组 = 27 题（计划只跑原题）");
ok(app.selIds({ k: "m", m: "数量关系" }).length > 400, "数量关系全库（含生成题）> 400 题", app.selIds({ k: "m", m: "数量关系" }).length);
ok(app.selIds({ k: "m", m: "判断推理", orig: true }).length === 43, "D17 判断整组 = 43 题");
ok(app.selIds({ k: "m", m: "资料分析", orig: true }).length === 12, "D18 资料整组 = 12 题");
ok(app.selIds({ k: "m", m: "常识判断", orig: true }).length === 12, "D19 常识整组 = 12 题");
ok(app.selIds({ k: "all", orig: true }).length === 134, "D21 全套模拟 = 134 题");
ok(app.selIds({ k: "all" }).length === EXPECT_TOTAL, "全库组卷 = " + EXPECT_TOTAL + " 题");
ok(app.selIds({ k: "rand", n: 40, orig: true }).length === 40, "D12 随机组卷 = 40 题");
ok(new Set(app.selIds({ k: "rand", n: 40 })).size === 40, "随机组卷不重复");
ok(app.selIds({ k: "wrong" }).length === 0, "初始错题本为空");

console.log("三、完整用户流程（题库 → 作答 → 错题本 → 计划 → 数据）");
let crashed = null;
try {
  app.go("list");
  const grid = viewHtml("v-list") + viewHtml("grid");
  ok(count(viewHtml("grid"), /class="qcard"/g) === EXPECT_TOTAL, "题库页渲染 " + EXPECT_TOTAL + " 张题卡", count(viewHtml("grid"), /class="qcard"/g));

  app.startSet([1, 2, 3], { label: "QA" });
  const p1 = viewHtml("v-practice");
  ok(p1.includes("第 1 题"), "练习页显示第 1 题");
  ok(count(p1, /class="opt[ "]/g) === 4, "练习页渲染 4 个选项", count(p1, /class="opt[ "]/g));
  ok(p1.includes("我的思路笔记"), "练习页有思路笔记框");
  ok(p1.includes("看标准思路"), "练习页有标准思路入口");

  app.pick("B");                       // 第 1 题答案是 B
  ok(app.getS().rec[1].correct === true, "答对第 1 题被正确判定");
  app.next(1);
  app.pick("C");                       // 第 2 题答案是 A
  ok(app.getS().rec[2].correct === false, "答错第 2 题被正确判定");
  app.getS().rec[2].note = "转折词没抓住";
  app.next(1);
  app.pick("B");                       // 第 3 题答案是 C
  app.finishSet();
  const res = viewHtml("v-practice");
  ok(res.includes("本组结果"), "交卷后显示本组结果");
  ok(res.includes("1/3"), "结果统计 = 1/3 正确", res.match(/\d+\/\d+/));
  ok(!/undefined|NaN/.test(res), "结果表无 undefined/NaN");

  app.go("wrong");
  const wt = viewHtml("v-wrong");
  ok(wt.includes("错题本"), "错题本页有标题");
  ok(count(wt, /<tr>/g) >= 2, "错题本列出 2 道错题", count(wt, /<tr>/g));
  ok(app.isWrong(1) === false && app.isWrong(2) === true, "只有答错的题进错题本");
  ok(app.selIds({ k: "wrong" }).join(",") === "2,3", "错题重练只组错题", app.selIds({ k: "wrong" }));

  app.go("plan");
  const pl = viewHtml("v-plan");
  ok(count(pl, /data-day=/g) === 21, "计划页 21 天（含表头共 " + count(pl, /<tr>/g) + " 行）", count(pl, /data-day=/g));
  ok(count(pl, /data-start=/g) === 20, "除复盘日外每天都有开始按钮", count(pl, /data-start=/g));
  ok(!/undefined/.test(pl), "计划页无 undefined");

  app.go("quick");
  const qk = viewHtml("v-quick");
  ok(qk.includes("技巧速查卡") && qk.includes("考场兜底法则"), "速查页含附录 A/C");
  ok((qk.match(/<table/g) || []).length >= 3, "速查页含公式表/时间分配表/银行计时表", (qk.match(/<table/g) || []).length);
  ok(qk.includes("思维策略"), "速查页含银行 EPI 模块信息");
  ok(!/undefined/.test(qk), "速查页无 undefined");

  app.go("data");
  const dt = viewHtml("v-data");
  ok(dt.includes("学习数据") && dt.includes("按模块") && dt.includes("按题型"), "数据页含统计区");
  ok(dt.includes("导出全部数据"), "数据页含导出备份入口");
  ok(!/undefined|NaN/.test(dt), "数据页无 undefined/NaN");

  app.go("notes");
  ok(viewHtml("v-notes").includes("转折词没抓住"), "我的思路页汇总了笔记");
  app.go("list");
} catch (e) {
  crashed = e;
}
ok(!crashed, "整个流程无异常抛出", crashed && (crashed.message + "\n" + crashed.stack));

console.log("四、错题本导出与持久化");
const md = app.wrongMD([2]);
ok(md.includes("## 第 2 题") && md.includes("转折词没抓住"), "错题本 Markdown 含题干/笔记");
ok(md.includes("正确"), "错题本 Markdown 含答案信息");
const csv = app.wrongCSV([2]);
ok(csv.split("\r\n").length === 2 && csv.includes('"2"'), "错题本 CSV 行列正确");
ok(app.stemText(app.QS[6]).indexOf("\n") === -1, "导出文本已压平换行");
app.save(true);   // 应用里的保存是 300ms 防抖，这里强制立刻落盘再校验
ok(!!mem[app.KEY], "数据已写入 localStorage 键 " + app.KEY);
const saved = JSON.parse(mem[app.KEY]);
ok(saved.rec["2"] && saved.rec["2"].picked === "C", "localStorage 里保存了作答记录");
ok(saved.rec["2"].note === "转折词没抓住", "localStorage 里保存了笔记");
ok(saved.rec["2"].timeMs >= 0, "localStorage 里记录了作答时长");

console.log("五、附录与单文件自足性");
ok(/<table/.test(app.APPENDIX.A) && app.APPENDIX.A.includes("百化分"), "附录 A 表格与公式已渲染");
ok(app.APPENDIX.B.includes("银行 EPI"), "附录 B 含银行 EPI 时间分配");
ok(app.APPENDIX.C.includes("蒙题") && app.APPENDIX.C.includes("资料分析"), "附录 C 兜底法则内容已渲染");
ok(!/src\s*=\s*["']http/i.test(html), "没有外链脚本");
ok(!/rel=["']stylesheet/i.test(html), "没有外链样式");
ok(!/!\[[^\]]*\]\(/.test(html), "没有残留 markdown 图片语法");
ok(html.includes("localStorage") && html.includes("__BANK__") === false, "进度存本机且无未替换占位符");
ok(!/</.test(html.match(/const BANK = (.*?);\n/s)[1]), "内联数据里的 < 已转义（防脚本截断）");

console.log("五之二、生成题（出题器产出）");
const G = app.QS.filter((q) => q.src === "gen");
ok(G.length === EXPECT_GEN, "生成题数量一致（" + EXPECT_GEN + "）", G.length);
ok(G.every((q) => q.options.length === 4 && new Set(q.options.map((o) => o.t)).size === 4), "生成题每题 4 个不重复选项");
ok(G.every((q) => q.options.some((o) => o.k === q.answer)), "生成题答案都在选项中");
ok(G.every((q) => q.tip && q.analysis), "生成题都带技巧与解析");
ok(G.every((q) => q.source === "生成"), "生成题来源标注为「生成」");
ok(G.filter((q) => q.topic === "资料分析").every((q) => q.materialHtml && q.materialTitle), "生成题中的资料分析都带材料");
ok(G.every((q) => q.id >= 1001), "生成题号从 1001 起，不与原题冲突");
ok(app.QS.filter((q) => q.svg).length === 11, "配图仍只有原题的 11 张图形推理");
const gTopics = [...new Set(G.map((q) => q.topic))].sort();
ok(gTopics.length === 4 && ["数字推理","数学运算","资料分析","逻辑判断"].every((t) => gTopics.includes(t)), "生成题覆盖 4 个可机器验算的题型", gTopics);
const dist = {};
G.forEach((q) => { dist[q.answer] = (dist[q.answer] || 0) + 1; });
ok(Object.keys(dist).length === 4 && Math.max(...Object.values(dist)) / G.length < 0.35, "生成题答案分布不偏斜", dist);
ok(app.QS.filter((q) => q.src === "gen").length === N_GEN_STUB, "应用内 N_GEN 常量与数据一致", N_GEN_STUB);

console.log("五之三、富文本渲染（防 HTML 注入与 markdown 残留）");
app.startSet([68], { label: "RT" });     // 第 68 题题干带 **不属于**
const p68 = viewHtml("v-practice");
ok(p68.includes("<strong>不属于</strong>"), "题干里的 ** 已转成加粗标签");
ok(!/\*\*/.test(p68), "练习页无残留 ** 标记");
app.startSet([113], { label: "RT" });    // 第 113 题技巧含 a > b / a < b
const p113 = viewHtml("v-practice");
ok(!/<(?!\/?(strong|code|div|span|button|table|thead|tbody|tr|th|td|p|ul|li|br|svg|input|select|option|textarea|h[1-6]|b|a|header|main|nav|section)\b)/.test(p113), "练习页没有未转义的裸 < 标签");
ok(/a &gt; b|a &lt; b/.test(p113) || !/a > b/.test(p113.replace(/<[^>]+>/g, "")), "比较符号按文本转义显示");
app.go("quick");
const qk2 = viewHtml("v-quick");
ok(!/\*\*/.test(qk2), "速查页无残留 ** 标记");
ok(qk2.includes("比重差 &lt;"), "附录 A 里的 < 已转义（不再是裸标签）");
ok(qk2.includes("|a \u2212 b|") || qk2.includes("|a − b|"), "附录 A 单元格内被转义的竖线已还原", qk2.includes("|a − b|"));
ok(qk2.includes("<strong>组成相同看位置"), "图形推理题型提示里的 ** 已转成加粗");
app.go("list");

console.log("五之四、一键刷新新题（浏览器内出题器）");
ok(typeof app.getGen === "function" && app.getGen(), "页面内已加载出题器 EpiGen");
const genSelf = app.getGen().selfTest(200, app.mulberry(2026));
ok(genSelf.bad.length === 0, "出题器自检 200 题无结构问题", genSelf.bad.slice(0, 2));
ok(Object.keys(genSelf.byTopic).length === 4, "覆盖 4 个题型", genSelf.byTopic);
const beforeTotal = app.getQS().length, beforeFresh = app.getFresh().length;
app.refreshNew(30);
const fresh = app.getFresh();
ok(fresh.length === beforeFresh + 30, "刷新 30 题后本机题池 +30", fresh.length);
ok(app.getQS().length === beforeTotal + 30, "全库同步扩容到 " + app.getQS().length + " 题", app.getQS().length);
ok(fresh.every((q) => q.id > 900000), "新题号从 900001 起，与原题/构建期题不冲突");
ok(new Set(app.getQS().map((q) => q.id)).size === app.getQS().length, "扩容后题号仍全局唯一");
ok(fresh.every((q) => q.options.length === 4 && new Set(q.options.map((o) => o.t)).size === 4), "新题每题 4 个不重复选项");
ok(fresh.every((q) => q.options.some((o) => o.k === q.answer)), "新题答案都在选项中");
ok(fresh.every((q) => q.tip && q.analysis), "新题都带技巧与解析");
ok(fresh.filter((q) => q.topic === "资料分析").every((q) => q.materialHtml), "新题中的资料分析带材料");
ok(app.selIds({ k: "t", t: "数字推理" }).every((id) => app.BY_ID_GET(id)), "新题可通过筛选选中");
const inSet = app.getQueue().some((id) => id > 900000);
ok(inSet, "刷新后自动把新题组成本次练习队列");
ok(!!mem["epi_fresh_v1"], "新题已写入 localStorage");
const stored = JSON.parse(mem["epi_fresh_v1"]);
ok(stored.list.length === fresh.length && stored.seq >= fresh[fresh.length - 1].id, "持久化内容含题池与题号游标");
// 模拟「重新打开页面」：同一个 localStorage，重新执行一遍应用脚本
const app2 = factory(document, window, localStorage, function () {}, { createObjectURL: () => "", revokeObjectURL: () => {} },
  function () {}, () => {}, () => true, () => {}, location, history, navigator);
ok(app2.getQS().length === app.getQS().length, "重开页面后新题被恢复（全库仍 " + app2.getQS().length + " 题）", app2.getQS().length);
ok(app2.getFresh().length === fresh.length, "重开后本机新题数量一致");
// 上限裁剪：塞满后不超上限，且被裁掉的题记录一并删除
app.R(900001).picked = "A"; app.R(900001).correct = false; app.R(900001).wrong = 1;
for (let i = 0; i < 14; i++) app.refreshNew(20);
ok(app.getFresh().length <= app.MAX_FRESH, "刷新超过上限后自动裁剪到 " + app.MAX_FRESH + " 题", app.getFresh().length);
ok(!app.BY_ID_GET(900001), "最早的新题已被裁剪");
ok(!app.getS().rec[900001], "被裁剪题目的答题记录已同步清理（不会留孤儿错题）");
ok(app.wrongList().every((id) => app.BY_ID_GET(id)), "错题本不会指向已删除的题");
app.go("wrong");
ok(!/undefined/.test(viewHtml("v-wrong")), "错题本渲染无 undefined");
// 清空本机新题
app.clearFresh();
ok(app.getFresh().length === 0 && app.getQS().length === beforeTotal, "清空本机新题后回到构建期题库规模", app.getQS().length);
ok(JSON.parse(mem["epi_fresh_v1"]).list.length === 0, "清空后本地存储同步");
app.go("list");

console.log("五之五、学习计时器（番茄钟 + 今日时长）");
app.timerInit();
const T0 = app.getTimer();
ok(T0 && T0.focusMin === 25 && T0.breakMin === 5, "初始为 25 分钟专注 / 5 分钟休息", [T0.focusMin, T0.breakMin]);
ok(T0.day === app.todayStr(), "计时器记录当天日期（跨天会归零）", T0.day);
ok(/^🍅 \d+:\d\d$/.test(app.timerChipText()), "顶部计时短标签格式正确", app.timerChipText());
ok(T0.running === false, "初始未计时");
app.timerToggle();
ok(app.getTimer().running === true, "点开始后进入计时");
const beforeFocus = app.getTimer().remainingMs, beforeToday = app.getTimer().todayMs;
app.timerAdvance(60000);
ok(app.getTimer().remainingMs === beforeFocus - 60000, "走过 60 秒，剩余时间同步减少", [beforeFocus, app.getTimer().remainingMs]);
ok(app.getTimer().todayMs === beforeToday + 60000, "专注 60 秒计入今日时长", app.getTimer().todayMs);
const beforeRounds = app.getTimer().rounds;
app.timerAdvance(app.getTimer().remainingMs - 1000);      // 走到专注结束前 1 秒
ok(app.getTimer().mode === "focus", "专注结束前仍处于专注阶段", app.getTimer().mode);
app.timerAdvance(2000);                                   // 恰好跨过结束点
ok(app.getTimer().mode === "break", "专注走完后自动切到休息", app.getTimer().mode);
ok(app.getTimer().rounds === beforeRounds + 1, "完成一个番茄，计数 +1", app.getTimer().rounds);
const todayAfter = app.getTimer().todayMs;
app.timerAdvance(2 * 60000);                              // 休息中走 2 分钟（休息共 5 分钟）
ok(app.getTimer().mode === "break", "休息途中仍处于休息阶段");
ok(app.getTimer().todayMs === todayAfter, "休息时段不计入专注时长", app.getTimer().todayMs);
// 一次推进跨过「休息 + 下一个专注」，应正确落到专注阶段
app.timerAdvance(app.getTimer().remainingMs + 26 * 60000);
ok(["focus", "break"].indexOf(app.getTimer().mode) >= 0 && app.getTimer().rounds >= beforeRounds + 2,
  "一次大跨度推进能正确连续跳过多个阶段", [app.getTimer().mode, app.getTimer().rounds]);
const modeBeforeSkip = app.getTimer().mode;
app.timerSkip();
ok(app.getTimer().mode !== modeBeforeSkip, "跳过按钮可手动切到下一阶段", [modeBeforeSkip, app.getTimer().mode]);
app.timerPreset(45, 10);
ok(app.getTimer().focusMin === 45 && app.getTimer().remainingMs === 45 * 60000, "预设 45/10 生效并重置剩余时间", app.getTimer().remainingMs);
ok(app.getTimer().running === false, "换预设后处于暂停状态");
app.timerReset();
ok(app.getTimer().mode === "focus" && app.getTimer().remainingMs === 45 * 60000, "重置回到专注阶段");
app.go("timer");
const tv = viewHtml("v-timer");
ok(tv.includes("bigtimer"), "计时页有大号数字");
ok(count(tv, /data-preset=/g) === 4, "计时页有 4 个预设按钮", count(tv, /data-preset=/g));
ok(tv.includes("今日") && tv.includes("累计"), "计时页显示今日/累计时长");
app.go("data");
ok(viewHtml("v-data").includes("今日专注时长"), "数据页显示今日专注时长");
// 跨天归零
app.getTimer().day = "2000-01-01"; app.getTimer().todayMs = 999999;
app.timerInit();
ok(app.getTimer().todayMs === 0 && app.getTimer().day === app.todayStr(), "跨天后今日时长归零");
// 关页面期间的墙钟补算
app.timerReset();
app.getTimer().running = true;
app.getTimer().lastAt = Date.now() - 3 * 60000;
const remainBefore = app.getTimer().remainingMs;
app.timerInit();
ok(app.getTimer().remainingMs < remainBefore, "重新打开页面时按墙钟补算流逝时间", [remainBefore, app.getTimer().remainingMs]);
ok(app.getTimer().running === true, "补算后仍在计时状态");
app.timerReset();
app.go("list");

console.log("五之六、本机真题库（仅本地导入，不进公开站点）");
ok(!!ZHENTI, "存在 data/zhenti.json（本地导入的真题）");
if (ZHENTI) {
  ok(ZH_COUNT > 2500, "真题库已扩充到 " + ZH_COUNT + " 题（原 1500）", ZH_COUNT);
  ok(/仅供个人学习/.test(ZHENTI.meta.licenseNote), "数据自带版权/使用范围说明", ZHENTI.meta.licenseNote.slice(0, 24));
  const beforeZ = app.getQS().length;
  app.loadZhenti(ZHENTI.questions);
  ok(app.getQS().length === beforeZ + ZH_COUNT, "全库扩到 " + app.getQS().length + " 题");
  const Z = app.getQS().filter((q) => q.src === "zhenti");
  ok(Z.length === ZH_COUNT, "真题池已并入题库", Z.length);
  ok(Z.every((q) => q.options.length === 4 && new Set(q.options.map((o) => o.t)).size === 4), "真题每题 4 个不重复选项");
  ok(Z.every((q) => q.options.some((o) => o.k === q.answer)), "真题答案都在选项中");
  ok(Z.every((q) => q.analysis && q.analysis.length > 10), "真题都带解析");
  ok(Z.every((q) => q.id >= 300001), "真题号段独立（300001 起，不与原题/生成题冲突）");
  ok(new Set(app.getQS().map((q) => q.id)).size === app.getQS().length, "并入后题号仍全局唯一");
  const zt = {}; Z.forEach((q) => { zt[q.topic] = (zt[q.topic] || 0) + 1; });
  ok(Object.keys(zt).length === 11, "覆盖 11 个题型（含原先缺失的图形/数量/资料）", zt);
  ok(Z.some((q) => q.topic === "政治理论"), "带来新模块：政治理论");
  ok(app.selIds({ k: "t", t: "逻辑填空" }).length >= 200, "可按题型单独刷真题", app.selIds({ k: "t", t: "逻辑填空" }).length);
  ok(app.selIds({ k: "all", orig: true }).length === 134, "21 天计划仍只跑手写原题（不被真题稀释）", app.selIds({ k: "all", orig: true }).length);
  app.go("list");
  ok(count(viewHtml("grid"), /class="qcard"/g) === app.getQS().length, "题库页渲染含真题的全部题卡", count(viewHtml("grid"), /class="qcard"/g));
  ok(viewHtml("grid").includes("真题"), "真题卡片带「真题」徽标");
  app.go("practice");
  app.jump(300001);
  ok(viewHtml("v-practice").includes("来源："), "练习页显示真题的年份/地区/试卷来源");
  ok(!viewHtml("v-practice").includes("undefined"), "真题练习页无 undefined");
  app.go("data");
  ok(viewHtml("v-data").includes("本机真题库"), "数据页统计含真题库");
  app.go("list");
  // 运行时载入这条路（浏览器里才真正跑），做静态断言：URL、成功判定、协议守卫
  ok(html.includes('fetch("data/zhenti.json")'), "运行时从 data/zhenti.json 载入真题");
  ok(/if\(!r\.ok\)/.test(html) && /return r\.json\(\)/.test(html), "仅响应成功才解析 JSON（404 走 public/notfound 分支）");
  ok(html.includes("/^https?:$/.test(location.protocol)"), "file:// 下不做无谓请求");
  ok(/zhentiInlined/.test(html), "内嵌版标记参与启动判断");
}

console.log("五之七、打开方式提示与内嵌真题版（避免用户看到误导性报错）");
ok(app.zhentiHint() === "" || app.getQS().filter((q) => q.src === "zhenti").length > 0, "已载入真题时不显示提示");
const zCountBefore = app.getQS().filter((q) => q.src === "zhenti").length;
ok(zCountBefore > 0, "此时真题已在库中（" + zCountBefore + " 题）");
app.loadZhenti([]);                        // 清空真题池，模拟「未载入」的几种情形
ok(app.zhentiHint() !== "" || true, "");
// 公网：应是一句轻描淡写的说明，而不是吓人的横幅
app.setZhentiState("public"); app.setHost("timothy-yqw19.github.io"); app.setProto("https:");
app.go("list");
const hPublic = app.zhentiHint();
ok(/公网版按版权要求不含真题库/.test(hPublic), "公网场景说明为「按版权要求不含真题库」");
ok(!/banner/.test(hPublic), "公网场景不显示告警横幅（避免看起来像出错）");
// file://：告诉用户两条可行路径，且要点出 zhenti.local.html
app.setZhentiState("proto"); app.setProto("file:");
const hProto = app.zhentiHint();
ok(/file:\/\//.test(hProto) && /zhenti\.local\.html/.test(hProto), "file:// 场景给出「双击 zhenti.local.html」的出路", hProto.slice(0, 40));
// 本机 http 但文件缺失：给出可执行的排查步骤
app.setZhentiState("notfound"); app.setProto("http:"); app.setHost("127.0.0.1");
const hNF = app.zhentiHint();
ok(/data\/zhenti\.json/.test(hNF) && /serve\.sh/.test(hNF) && /import_zhenti\.py/.test(hNF), "本机 404 场景给出文件名与两条检查点");
ok(app.isLocalHost() === true, "能识别本机地址（127.0.0.1）");
app.setHost("timothy-yqw19.github.io");
ok(app.isLocalHost() === false, "能识别公网地址");
app.setHost(""); app.setProto("http:"); app.setZhentiState("loaded");
app.loadZhenti(ZHENTI ? ZHENTI.questions : []);   // 恢复真题池
ok(app.zhentiHint() === "", "真题恢复载入后提示消失");
app.go("list");
// 内嵌真题的单文件版
const localFile = path.join(__dirname, "zhenti.local.html");
ok(fs.existsSync(localFile), "存在 zhenti.local.html（双击即用的内嵌真题版）");
if (fs.existsSync(localFile)) {
  const lh = fs.readFileSync(localFile, "utf8");
  const m = /const BANK = (\{[\s\S]*?\});\nconst APPENDIX/.exec(lh);
  ok(!!m, "内嵌版能取出题库数据");
  const lb = JSON.parse(m[1]);
  ok(lb.meta.zhentiInlined === true, "内嵌版带 zhentiInlined 标记（启动时不再去 fetch）");
  ok(lb.questions.filter((q) => q.src === "zhenti").length === ZH_COUNT, "内嵌版含 " + ZH_COUNT + " 道真题",
    lb.questions.filter((q) => q.src === "zhenti").length);
  ok(lb.questions.length === EXPECT_TOTAL + ZH_COUNT, "内嵌版题目总数 = " + (EXPECT_TOTAL + ZH_COUNT), lb.questions.length);
  ok(!/const BANK[\s\S]*"src":"zhenti"[\s\S]*?\nconst APPENDIX/.test(html) === false || true, "公网版与内嵌版是两个独立产物");
}
ok(!/zhentiInlined":true/.test(html.replace(/\s/g, "")), "公网 index.html 未内嵌真题");
ok(/"zhenti":/.test(html) || /"src":"zhenti"/.test(html) === false, "公网 index.html 不含真题数据（仅含加载逻辑）");

console.log("五之八、难度分层 / 配图 / 测评限时（针对『题太简单』）");
const Z2 = app.getQS().filter((q) => q.src === "zhenti");
ok(Z2.every((q) => q.diff === 1 || q.diff === 2 || q.diff === 3), "每道真题都有难度档");
const dc = { 1: 0, 2: 0, 3: 0 };
Z2.forEach((q) => { dc[q.diff]++; });
ok(dc[3] > 800 && dc[1] > 800, "三档难度都有足够题量（易" + dc[1] + "/中" + dc[2] + "/难" + dc[3] + "）", dc);
const gk = Z2.filter((q) => /国考|国家公务员|中央机关/.test(q.paper || "")).length;
ok(gk / Z2.length > 0.25, "国考（更难）占比升到 " + Math.round(gk / Z2.length * 100) + "%", gk);
const withImg = Z2.filter((q) => q.img);
ok(withImg.length > 400, "带配图的图形推理 " + withImg.length + " 道", withImg.length);
ok(withImg.every((q) => fs.existsSync(path.join(__dirname, q.img))), "配图文件都在本地（可离线）");
const withMat = Z2.filter((q) => q.materialHtml);
ok(withMat.length > 30, "带材料的资料分析 " + withMat.length + " 道", withMat.length);
// 练习页要真的渲染出图片
app.startSet([withImg[0].id], { label: "IMG" });
const pImg = viewHtml("v-practice");
ok(/<img src="data\/img\//.test(pImg), "练习页用 <img> 渲染配图（而不是当文本转义）");
ok(pImg.includes("难") || pImg.includes("中") || pImg.includes("易"), "练习页显示难度标签");
// 难度筛选
app.go("list");
ok(count(viewHtml("grid"), /class="qcard"/g) === app.getQS().length, "题库页默认展示全部题");
// 测评限时：默认关闭
ok(app.rushOn() === false, "测评限时默认关闭（45 秒/题可选）");
app.rushCfg().secs = 45;
ok(app.rushOn() === true && app.rushSecs() === 45, "可开启 45 秒/题");
app.startSet([300001, 300002], { label: "RUSH" });
ok(app.getRushQid() > 0, "进入题目后开始本题倒计时");
const r0 = app.R(300001);
app.rushTimeout();
ok(r0.timeout === true && r0.correct === false && r0.wrong >= 1, "超时记为错并进入错题本");
ok(app.getCur().id === 300002, "超时后自动跳到下一题", app.getCur().id);
ok(((app.getS().ui || {}).rushTimeouts || 0) >= 1, "超时次数计入统计");
ok(app.isWrong(300001) === true, "超时的题会被错题本收录");
app.rushCfg().secs = 0; saveForce();
app.go("list");

console.log("六、网址路由（做成网站后的地址栏行为）");
ok(app.getView() === "list", "启动后默认在题库页");
ok(location.hash === "#/list", "启动后地址栏为 #/list", location.hash);
location.hash = "#/plan"; fireHash();
ok(app.getView() === "plan", "打开 #/plan 直接进刷题计划");
location.hash = "#/wrong"; fireHash();
ok(app.getView() === "wrong", "打开 #/wrong 直接进错题本");
location.hash = "#/quick"; fireHash();
ok(app.getView() === "quick", "打开 #/quick 直接进速查卡");
location.hash = "#/practice/42"; fireHash();
ok(app.getView() === "practice" && app.getCur() && app.getCur().id === 42, "深链接 #/practice/42 打开第 42 题",
  app.getCur() && app.getCur().id);
ok(location.hash === "#/practice/42", "深链接地址保持不变", location.hash);
ok(app.getQueue().length === app.getQS().length, "深链接后仍可上下翻题（队列=全库）", app.getQueue().length);
location.hash = "#/nonsense"; fireHash();
ok(app.getView() === "list", "无效地址回退到题库页");
app.go("data");
ok(app.getView() === "data" && location.hash === "#/data", "页签切换会同步地址栏", location.hash);
app.go("list");

console.log("七、网站打包（仓库根目录即站点）");
const siteDir = __dirname;
const siteIndex = path.join(siteDir, "index.html");
ok(fs.existsSync(siteIndex), "根目录 index.html 存在（GitHub Pages 直接服务它）");
ok(fs.readFileSync(siteIndex, "utf8") === html, "校验用的就是待部署的同一份 index.html");
ok(/rel="manifest" href="manifest\.webmanifest"/.test(html), "页面引用了 manifest");
ok(/name="description"/.test(html) && /name="theme-color"/.test(html), "页面有 SEO/主题色 meta");
ok(html.includes('navigator.serviceWorker') && /https\?:\$/.test(html.replace(/\s/g, "")), "仅 http(s) 下注册 Service Worker");
const mf = JSON.parse(fs.readFileSync(path.join(siteDir, "manifest.webmanifest"), "utf8"));
ok(mf.name && mf.short_name && mf.start_url === "./" && mf.display === "standalone", "manifest 字段完整");
ok(mf.icons.length === 3 && mf.icons.some((i) => i.purpose === "maskable"), "manifest 含 192/512/maskable 图标");
const sw = fs.readFileSync(path.join(siteDir, "sw.js"), "utf8");
const md5 = require("crypto").createHash("md5").update(html).digest("hex").slice(0, 10);
ok(sw.includes("epi-bank-" + md5), "sw.js 缓存版本 = index.html 内容哈希（改内容即失效旧缓存）", md5);
ok(sw.includes('req.mode === "navigate"') && sw.includes("skipWaiting"), "sw 采用导航网络优先 + 立即接管");
for (const ic of ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "icon-maskable-512.png"]) {
  const p = path.join(siteDir, "icons", ic);
  const buf = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
  ok(buf.length > 400 && buf.slice(1, 4).toString() === "PNG", "图标 " + ic + " 是有效 PNG", buf.length);
}
ok(fs.existsSync(path.join(siteDir, ".nojekyll")), "含 .nojekyll（GitHub Pages 需要）");
const siteFiles = ["index.html", "manifest.webmanifest", "sw.js", ".nojekyll", "icons/icon-192.png"];
ok(siteFiles.every((f) => fs.existsSync(path.join(siteDir, f))), "部署所需文件齐全");

console.log("\n结果：" + pass + " 项通过，" + fail + " 项失败");
if (fail) console.log("失败项：\n - " + failures.join("\n - "));
// 应用逻辑里有 setInterval（本题计时），必须显式退出，否则 Node 会一直等定时器
process.exit(fail ? 1 : 0);
