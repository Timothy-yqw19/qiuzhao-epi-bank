#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 GongkaoNaoku 的 SQLite 题库里挑选「纯文字单选真题」，转成本站题库格式。

⚠️ 重要：本脚本产出的 data/zhenti.json 已在 .gitignore 中排除，**只在本机使用，不要提交、不要上传**。
原因：该题库项目的免责声明写明「真题、选项、材料、配图版权归原作者及原题库平台，仅供个人学习使用」，
其上游 ERRRC/xingcezhenti 未提供任何许可证；再分发（尤其放进公开仓库/公开站点）不是它授权的用法。
本脚本只做格式转换，方便你本机个人练习。

用法：
  python3 import_zhenti.py [--db .db_tmp/kaogong.db] [--out data/zhenti.json] [--scale 1.0]
  数据库获取：git clone https://gitee.com/jangviktor/GongkaoNaoku.git 后 python3 assemble_db.py，
  或下载仓库里的 kaogong.db.part-* 分卷后按顺序拼接。
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

# 目标：补上本站「无法机器生成」的题型；(模块, 题型, 源库 category 列表, 取多少题)
TARGETS = [
    ("言语理解与表达", "逻辑填空", ["逻辑填空"], 200),
    ("言语理解与表达", "片段阅读", ["片段阅读"], 200),
    ("言语理解与表达", "语句表达", ["语句表达"], 150),
    ("判断推理", "定义判断", ["定义判断"], 200),
    ("判断推理", "类比推理", ["类比推理"], 200),
    ("判断推理", "逻辑判断", ["逻辑判断"], 150),
    ("常识判断", "常识判断", ["人文常识", "科技常识", "法律常识", "地理国情", "经济常识"], 250),
    ("政治理论", "政治理论", ["新思想", "时事政治", "马克思主义", "毛中特"], 150),
]


def strip_html(h):
    """去标签、还原实体、保留段落换行。"""
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
    """去重键：只留汉字数字字母。"""
    return re.sub(r"[^\u4e00-\u9fa5A-Za-z0-9]", "", s or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, ".db_tmp", "kaogong.db"))
    ap.add_argument("--out", default=os.path.join(HERE, "data", "zhenti.json"))
    ap.add_argument("--scale", type=float, default=1.0, help="取题量缩放，0.5 就是取一半")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit("找不到题库文件 %s\n请先克隆 GongkaoNaoku 并运行 assemble_db.py，或用 --db 指定路径。" % args.db)

    con = sqlite3.connect(args.db)
    cur = con.cursor()

    # 一次拉齐候选：纯文字、单选、无材料、非存疑
    cur.execute("""
        select category, stem, options, answer, analysis, reasoning, fastest, kadian,
               paper, year, region
        from questions
        where has_image = 0
          and qtype = 'single'
          and length(answer) = 1
          and coalesce(material,'') = '' and coalesce(material_ref,'') = ''
          and coalesce(doubt,'') = ''
          and stem not like '%<img%'
    """)
    rows = cur.fetchall()
    print("候选（纯文字/单选/无材料/非存疑）: %d 条" % len(rows))

    # 按 category 分桶
    buckets = defaultdict(list)
    skipped = defaultdict(int)
    for (cat, stem, opts, ans, analysis, reasoning, fastest, kadian, paper, year, region) in rows:
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
        # 交叉验证：选项里的 is_answer 标记必须与 answer 一致
        marked = [x.get("key") for x in o if x.get("is_answer")]
        if marked and marked != [ans]:
            skipped["is_answer 与 answer 冲突"] += 1
            continue
        buckets[cat].append({
            "stem": st,
            "options": [{"k": k, "t": t} for k, t in zip(keys, texts)],
            "answer": ans,
            # 只保留源库真正的「快速解法」（⚡ 那种）；kadian 常常只是题型名，当技巧没意义
            "tip": strip_html(fastest) if (fastest and len(strip_html(fastest)) >= 12) else "",
            "analysis": ana,
            "paper": (paper or "").strip(),
            "year": (year or "").strip(),
            "region": (region or "").strip(),
        })

    out_qs = []
    qid = 300000
    seen = set()
    report = []
    for module, topic, cats, cap in TARGETS:
        cap = max(10, int(cap * args.scale))
        # 按试卷分组，轮转取题，保证年份/地区分散而不是全来自一份卷子
        by_paper = defaultdict(list)
        for cat in cats:
            for item in buckets.get(cat, []):
                by_paper[item["paper"] or "未知来源"].append(item)
        papers = sorted(by_paper.keys(), key=lambda p: (-(len(by_paper[p])), p))
        taken, guard = 0, 0
        while taken < cap and guard < 10000:
            guard += 1
            progressed = False
            for p in papers:
                if taken >= cap:
                    break
                lst = by_paper[p]
                if not lst:
                    continue
                item = lst.pop(0)
                progressed = True
                key = norm_key(item["stem"])
                if key in seen:
                    continue
                seen.add(key)
                qid += 1
                out_qs.append({
                    "id": qid,
                    "module": module,
                    "topic": topic,
                    "source": "真题",
                    "src": "zhenti",
                    "origin": (item["year"] + " " + item["region"]).strip() or item["paper"][:28],
                    "paper": item["paper"][:46],
                    "stem": item["stem"],
                    "options": item["options"],
                    "svg": None,
                    "tip": item["tip"],
                    "analysis": item["analysis"],
                    "answer": item["answer"],
                    "materialTitle": "", "materialHtml": "",
                    "sectionTip": "", "moduleTip": "",
                })
                taken += 1
            if not progressed:
                break
        report.append((module, topic, taken, cap))

    data = {
        "meta": {
            "source": "GongkaoNaoku (SQLite 题库) —— 原题来自 ERRRC/xingcezhenti",
            "licenseNote": "原题、选项、材料、配图版权归原作者及原题库平台，仅供个人学习使用；本文件已排除出 git 仓库，不得再分发。",
            "importedFrom": os.path.basename(args.db),
            "count": len(out_qs),
        },
        "questions": out_qs,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out)
    print("\n导入结果（%.1f MB）→ %s" % (size / 1048576, args.out))
    for module, topic, taken, cap in report:
        print("  %-14s %-10s %4d / %d" % (module, topic, taken, cap))
    print("  合计 %d 题" % len(out_qs))
    if skipped:
        print("  跳过统计:", dict(skipped))
    print("\n⚠️ 该文件仅供本机个人学习：已在 .gitignore 中，请勿提交或部署到公开站点。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
