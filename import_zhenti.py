#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 GongkaoNaoku 的 SQLite 题库里挑选真题，转成本站题库格式（data/zhenti.json）。

⚠️ 版权：该题库声明「真题、选项、材料、配图版权归原作者与原题库平台，仅供个人学习使用」，
   其上游 ERRRC/xingcezhenti 无任何许可证。因此产出物只在本机使用，已在 .gitignore 中排除，
   **不要提交、不要部署到公开站点**。

本版相对初版的改进：
  1. 难题优先：按「题型难度 + 是否国考 + 题干长度」估一个难度分，同卷内先取高分的题，
     并让国考试卷排在前面，整体难度显著上升（不再是从全库均匀取样）；
  2. 补上原先因缺材料/配图而整列排除的三类：资料分析（带材料）、数学运算、图形推理（带图）；
  3. 每题写入 diff（1 易 / 2 中 / 3 难）与 dscore，供前端做难度筛选。

用法：
  python3 import_zhenti.py                                  # 基础版（无图无材料）
  python3 import_zhenti.py --with-graphics --with-material  # 含图形推理与资料分析
  （--with-graphics 需要先跑 fetch_graphics.py 生成 data/graphic_index.json）
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

# (模块, 题型, 源库 category 列表, 取多少题, 是否带图, 是否带材料)
TARGETS = [
    ("言语理解与表达", "逻辑填空", ["逻辑填空"], 300, False, False),
    ("言语理解与表达", "片段阅读", ["片段阅读"], 300, False, False),
    ("言语理解与表达", "语句表达", ["语句表达"], 200, False, False),
    ("判断推理", "定义判断", ["定义判断"], 300, False, False),
    ("判断推理", "类比推理", ["类比推理"], 250, False, False),
    ("判断推理", "逻辑判断", ["逻辑判断"], 250, False, False),
    ("判断推理", "图形推理", ["图形推理"], 500, True, False),
    ("数量关系", "数学运算", ["数学运算"], 240, False, False),
    ("资料分析", "资料分析", ["增长", "比重", "综合", "平均数", "其他", "倍数", "基期计算（增长类）"], 60, False, True),
    ("常识判断", "常识判断", ["人文常识", "科技常识", "法律常识", "地理国情", "经济常识"], 300, False, False),
    ("政治理论", "政治理论", ["新思想", "时事政治", "马克思主义", "毛中特"], 150, False, False),
]

# 题型基础难度（行测里公认更费脑的给高分）
DIFF_BASE = {"图形推理": 2, "资料分析": 2, "数学运算": 2, "逻辑判断": 2,
             "定义判断": 1, "片段阅读": 1, "语句表达": 1, "逻辑填空": 1,
             "类比推理": 1, "常识判断": 0, "政治理论": 0}

GUKAO = re.compile(r"国家公务员|国考|中央机关|中央、国家机关")


def strip_html(h):
    s = h or ""
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p\s*>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'"), ("&mdash;", "—"), ("&hellip;", "…")]:
        s = s.replace(a, b)
    s = re.sub(r"[ \t\u3000]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def norm_key(s):
    return re.sub(r"[^\u4e00-\u9fa5A-Za-z0-9]", "", s or "")


def diff_of(cat, paper, stem):
    """难度估计（非官方标注）：题型基础 + 国考加成 + 长题干加成。"""
    s = DIFF_BASE.get(cat, 1)
    if GUKAO.search(paper or ""):
        s += 1
    if len(stem) >= 150:
        s += 1
    return s, (3 if s >= 4 else 2 if s >= 2 else 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, ".db_tmp", "kaogong.db"))
    ap.add_argument("--out", default=os.path.join(HERE, "data", "zhenti.json"))
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--with-graphics", action="store_true", help="加入带图的图形推理")
    ap.add_argument("--with-material", action="store_true", help="加入带材料的资料分析")
    ap.add_argument("--no-hard-bias", action="store_true", help="关掉难题优先（默认开启）")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit("找不到题库文件 %s\n先克隆 GongkaoNaoku 并运行 assemble_db.py，或用 --db 指定。" % args.db)

    con = sqlite3.connect(args.db)
    cur = con.cursor()

    graphic = {}
    gpath = os.path.join(HERE, "data", "graphic_index.json")
    if args.with_graphics:
        if not os.path.exists(gpath):
            raise SystemExit("要带图请先跑：python3 fetch_graphics.py --want 500")
        with open(gpath, encoding="utf-8") as f:
            for it in json.load(f)["items"]:
                graphic[str(it["qid"])] = it["img"]
        print("图形推理图片索引: %d 张" % len(graphic))

    print("拉取候选题…")
    cur.execute("""
        select qid, module, category, stem, options, answer, analysis, reasoning, fastest,
               paper, year, region, material, has_image, material_ref, doubt
        from questions
        where qtype='single' and length(answer)=1
    """)
    rows = cur.fetchall()
    print("候选总数: %d" % len(rows))

    buckets = defaultdict(list)
    skipped = defaultdict(int)
    for (qid, module, cat, stem, opts, ans, analysis, reasoning, fastest,
         paper, year, region, material, has_image, mref, doubt) in rows:
        if cat == "图形推理":
            if not (args.with_graphics and str(qid) in graphic):
                skipped["图形推理未下载到图"] += 1
                continue
        elif has_image:
            skipped["需要配图"] += 1
            continue
        if (material or "").strip() or (mref or "").strip():
            if not (args.with_material and module == "资料分析" and "<img" not in (material or "")):
                skipped["需要材料"] += 1
                continue
        if (doubt or "").strip():
            skipped["存疑待复核"] += 1
            continue
        try:
            o = json.loads(opts or "[]")
        except Exception:
            skipped["选项JSON损坏"] += 1
            continue
        keys = [x.get("key") for x in o]
        texts = [strip_html(x.get("label") or x.get("html") or "") for x in o]
        st = strip_html(stem)
        if len(keys) != 4 or keys != ["A", "B", "C", "D"]:
            skipped["选项不是四个ABCD"] += 1
            continue
        if not all(texts) or len(set(texts)) != 4:
            skipped["选项为空或重复"] += 1
            continue
        if ans not in keys:
            skipped["答案不在选项内"] += 1
            continue
        if len(st) < 8:
            skipped["题干过短"] += 1
            continue
        if "***" in st:
            skipped["题干含脱敏星号"] += 1
            continue
        ana = strip_html(reasoning) or strip_html(analysis)
        if len(ana) < 15:
            skipped["解析过短或缺失"] += 1
            continue
        marked = [x.get("key") for x in o if x.get("is_answer")]
        if marked and marked != [ans]:
            skipped["is_answer 与 answer 冲突"] += 1
            continue

        score, diff = diff_of(cat, paper, st)
        mat_html = material if (module == "资料分析" and args.with_material) else ""
        buckets[cat].append({
            "stem": st,
            "options": [{"k": k, "t": t} for k, t in zip(keys, texts)],
            "answer": ans,
            "tip": strip_html(fastest) if (fastest and len(strip_html(fastest)) >= 12) else "",
            "analysis": ana,
            "paper": (paper or "").strip(),
            "year": (year or "").strip(),
            "region": (region or "").strip(),
            "img": graphic.get(str(qid), ""),
            "materialTitle": ("资料（%s）" % ((paper or "")[:26] or "真题")) if mat_html else "",
            "materialHtml": mat_html,
            "dscore": score, "diff": diff,
            "guokao": 1 if GUKAO.search(paper or "") else 0,
        })

    out_qs, seen = [], set()
    qid_out = 300000
    report = []
    hard_bias = not args.no_hard_bias
    for module, topic, cats, cap, need_img, need_mat in TARGETS:
        cap = max(10, int(cap * args.scale))
        by_paper = defaultdict(list)
        for cat in cats:
            items = buckets.get(cat, [])
            if need_img:
                items = [x for x in items if x["img"]]
            if need_mat:
                items = [x for x in items if x["materialHtml"]]
            for it in items:
                by_paper[it["paper"] or "未知来源"].append(it)
        # 国考卷优先；同卷内按难度分从高到低（难题优先）
        if hard_bias:
            for p in by_paper:
                by_paper[p].sort(key=lambda x: (-x["dscore"], -len(x["stem"])))
        gk_papers = [p for p in by_paper if max(x["guokao"] for x in by_paper[p])]
        other_papers = [p for p in by_paper if p not in set(gk_papers)]
        gk_papers.sort(key=lambda p: (-len(by_paper[p]), p))
        other_papers.sort(key=lambda p: (-len(by_paper[p]), p))
        quota_gk = int(cap * 0.4)
        papers = gk_papers + other_papers          # 国考卷排前面
        order_gk = set(gk_papers)
        def emit(it):
            """把一条候选写进结果，返回是否成功（题干/图片重复则丢弃）。"""
            nonlocal qid_out
            key = ("img:" + it["img"]) if it.get("img") else norm_key(it["stem"])
            if key in seen:
                return False
            seen.add(key)
            qid_out += 1
            out_qs.append({
                "id": qid_out,
                "module": module, "topic": topic,
                "source": "真题", "src": "zhenti",
                "origin": (it["year"] + " " + it["region"]).strip() or it["paper"][:28],
                "paper": it["paper"][:46],
                "diff": it["diff"], "dscore": it["dscore"],
                "stem": it["stem"],
                "options": it["options"],
                "img": it["img"] or None,
                "svg": None,
                "tip": it["tip"], "analysis": it["analysis"],
                "answer": it["answer"],
                "materialTitle": it["materialTitle"], "materialHtml": it["materialHtml"],
                "sectionTip": "", "moduleTip": "",
            })
            return True

        def drain(paper_list, need):
            """在给定试卷集合里轮转取题（每卷一次一条），保证来源分散。"""
            got, guard = 0, 0
            while got < need and guard < 20000:
                guard += 1
                progressed = False
                for p in paper_list:
                    if got >= need:
                        break
                    lst = by_paper[p]
                    if not lst:
                        continue
                    progressed = True
                    if emit(lst.pop(0)):
                        got += 1
                if not progressed:
                    break
            return got

        # 先按配额取国考卷（普遍更难），再用全部试卷补满
        taken = drain(gk_papers, max(0, min(quota_gk, cap)))
        taken += drain(papers, cap - taken)
        report.append((module, topic, taken, cap))

    # 难度按本库内相对排名重新分档（前 1/3 难、中 1/3、后 1/3 易），保证「只练难题」有足够题量
    if out_qs:
        for q in out_qs:
            q["_s"] = q["dscore"] + (len(q["stem"]) / 1000.0) + (0.5 if q.get("img") else 0) + (0.5 if q.get("materialHtml") else 0)
        ordered = sorted(out_qs, key=lambda q: q["_s"])
        n = len(ordered)
        lo, hi = n // 3, 2 * n // 3
        for i, q in enumerate(ordered):
            q["diff"] = 3 if i >= hi else (2 if i >= lo else 1)
            q.pop("_s", None)

    dist = defaultdict(int)
    gk = 0
    for q in out_qs:
        dist[q["diff"]] += 1
        if GUKAO.search(q["paper"]):
            gk += 1

    data = {
        "meta": {
            "source": "GongkaoNaoku (SQLite 题库) —— 原题来自 ERRRC/xingcezhenti",
            "licenseNote": "原题、选项、材料、配图版权归原作者与原题库平台，仅供个人学习使用；本文件已排除出 git 仓库，不得再分发。",
            "difficultyNote": "diff 为按「题型 + 是否国考 + 题干长度」估计的相对难度（1 易 / 2 中 / 3 难），非官方标注。",
            "count": len(out_qs),
            "withGraphics": bool(args.with_graphics),
            "withMaterial": bool(args.with_material),
            "hardBias": hard_bias,
        },
        "questions": out_qs,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print("\n导入结果（%.1f MB）→ %s" % (os.path.getsize(args.out) / 1048576, args.out))
    for module, topic, taken, cap in report:
        print("  %-14s %-10s %4d / %d" % (module, topic, taken, cap))
    print("  合计 %d 题 | 国考占 %d | 难度分布 易%d/中%d/难%d | 带图 %d | 带材料 %d" % (
        len(out_qs), gk, dist[1], dist[2], dist[3],
        sum(1 for q in out_qs if q["img"]), sum(1 for q in out_qs if q["materialHtml"])))
    if skipped:
        print("  跳过统计:", dict(sorted(skipped.items(), key=lambda x: -x[1])[:8]))
    print("\n⚠️ 仅供本机个人学习：已在 .gitignore 中，请勿提交或部署到公开站点。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
