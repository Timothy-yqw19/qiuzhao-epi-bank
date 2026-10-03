#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载图形推理题的配图（本地个人使用），产出 data/img/ 与 data/graphic_index.json。

⚠️ 与 import_zhenti.py 同样的限制：图片版权归原作者与原题库平台，仅供个人学习；
   data/img/ 与 data/graphic_index.json 都已 gitignore，不会进入公开仓库或站点。

两个踩过的坑（都写在代码注释里，改之前先看）：
  1. raw.githubusercontent.com 在高并发下会返回 **404**（不是 429），看起来像"图不存在"；
     用 3 并发 + 退避重试即可，必要时回退到上游 ERRRC/xingcezhenti 的 .png 版。
  2. questions.img_refs 是**逗号分隔的多个路径**，不是 JSON。图形推理题通常需要 1—3 张图
     （题干图 + 选项图），必须**整题的图全都下到**才收，否则题目残缺、没法做。

用法：python3 fetch_graphics.py --want 1200 [--workers 3]
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_GK = "https://raw.githubusercontent.com/jangviktor-web/GongkaoNaoku/master"
RAW_ER = "https://raw.githubusercontent.com/ERRRC/xingcezhenti/main"
UA = {"User-Agent": "Mozilla/5.0 (personal study, local use)"}
MAX_IMGS = 4          # 超过这个张数的题不要（多为材料套图，不适合单题呈现）

_HAVE = {}            # basename(无扩展名) -> 实际文件名
_SRC = {}             # 统计 webp/png 各下了多少


def scan_have():
    d = os.path.join(HERE, "data", "img")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if os.path.getsize(os.path.join(d, f)) > 200:
            _HAVE[os.path.splitext(f)[0]] = f


def split_refs(refs):
    """img_refs 是逗号分隔的路径串 → 干净的路径列表。"""
    if not refs:
        return []
    out = []
    for p in str(refs).split(","):
        p = p.strip().strip('"').strip("'").strip()
        if p.startswith("/90-图片/"):
            out.append(p)
    return out


def _save(url, name):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=12) as r:
        data = r.read()
    if len(data) < 200:
        return None
    ext = os.path.splitext(url.split("?")[0])[1] or ".webp"
    fn = name + ext
    with open(os.path.join(HERE, "data", "img", fn), "wb") as f:
        f.write(data)
    _HAVE[name] = fn
    _SRC[ext] = _SRC.get(ext, 0) + 1
    return "data/img/" + fn


def grab_one(ref):
    """下载单张图；返回相对路径或 None。已下过则直接命中缓存。"""
    stem = os.path.splitext(ref.lstrip("/"))[0]        # 90-图片/题目图/xxx
    name = os.path.basename(stem)
    if name in _HAVE:
        return "data/img/" + _HAVE[name]
    urls = [RAW_GK + "/" + urllib.parse.quote(stem + ".webp"),
            RAW_ER + "/" + urllib.parse.quote(stem + ".png")]
    for attempt in range(3):
        for u in urls:
            try:
                rel = _save(u, name)
                if rel:
                    return rel
            except Exception:
                pass
        time.sleep(0.5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, ".db_tmp", "kaogong.db"))
    ap.add_argument("--want", type=int, default=1200, help="想保留多少道图齐全的图形推理题")
    ap.add_argument("--workers", type=int, default=3, help="并发别调高：高并发会被 raw 返回 404")
    args = ap.parse_args()

    scan_have()
    print("本地已有图片: %d 张" % len(_HAVE))
    if not os.path.exists(args.db):
        raise SystemExit("找不到题库文件 %s" % args.db)

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    rows = cur.execute("""
        select qid, img_refs, paper from questions
        where category='图形推理' and has_image=1 and qtype='single'
          and length(answer)=1 and coalesce(doubt,'')=''
        order by (case when paper like '%国家公务员%' or paper like '%国考%' or paper like '%中央机关%' then 0 else 1 end),
                 qid
    """).fetchall()

    tasks = []
    for qid, refs, paper in rows:
        imgs = split_refs(refs)
        if not imgs or len(imgs) > MAX_IMGS:
            continue
        tasks.append({"qid": qid, "refs": imgs, "paper": paper or ""})
    print("图形推理候选: %d 道（每题 1-%d 张图，共 %d 张待取）" % (
        len(tasks), MAX_IMGS, len({r for t in tasks for r in t["refs"]})))

    # 先把所有唯一图片下完（多题共用一张图只下一遍）
    uniq = sorted({r for t in tasks for r in t["refs"]})
    print("开始下载 %d 张唯一图片…" % len(uniq))
    done, t0 = 0, time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for _ in ex.map(grab_one, uniq):
            done += 1
            if done % 100 == 0 or done == len(uniq):
                print("  进度 %d/%d  用时 %.0fs  已入库 %d 张" % (done, len(uniq), time.time() - t0, len(_HAVE)))

    kept = []
    for t in tasks:
        rels = []
        for r in t["refs"]:
            name = os.path.splitext(os.path.basename(r.lstrip("/")))[0]
            if name in _HAVE:
                rels.append("data/img/" + _HAVE[name])
            else:
                rels = None
                break
        if rels:
            kept.append({"qid": t["qid"], "imgs": rels, "paper": t["paper"]})
        if len(kept) >= args.want:
            break

    out = os.path.join(HERE, "data", "graphic_index.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"meta": {"want": args.want, "kept": len(kept), "candidates": len(tasks),
                            "note": "图片版权归原作者与原题库平台，仅供个人学习，已 gitignore"},
                   "items": kept}, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(HERE, p)) for it in kept for p in it["imgs"])
    n_img = sum(len(it["imgs"]) for it in kept)
    print("\n图片来源分布: %s" % _SRC)
    print("保留 %d 道题（%d 张图，共 %.1f MB，平均 %.1f KB/张）" % (
        len(kept), n_img, total / 1048576, total / max(1, n_img) / 1024))
    print("索引: %s" % out)
    print("⚠️ data/img/ 与 data/graphic_index.json 仅供本机个人学习，请勿提交或部署。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
