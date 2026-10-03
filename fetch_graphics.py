#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载图形推理题的配图（本地个人使用），产出 data/img/ 与 data/graphic_index.json。

⚠️ 与 import_zhenti.py 同样的限制：图片版权归原作者与原题库平台，仅供个人学习；
   data/img/ 与 data/graphic_index.json 都已 gitignore，不会进入公开仓库或站点。

用法：
  python3 fetch_graphics.py --db .db_tmp/kaogong.db --want 500 [--workers 8]
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
RAW = "https://raw.githubusercontent.com/jangviktor-web/GongkaoNaoku/master"
UA = {"User-Agent": "Mozilla/5.0 (personal study, local use)"}


def grab(path):
    """下载一张图，返回 (原路径, 相对本项目的路径) 或 None。"""
    url = RAW + urllib.parse.quote(path)
    name = os.path.basename(path)
    local = os.path.join(HERE, "data", "img", name)
    rel = "data/img/" + name
    if os.path.exists(local) and os.path.getsize(local) > 200:
        return path, rel
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read()
            if len(data) < 200:
                return None
            with open(local, "wb") as f:
                f.write(data)
            return path, rel
        except Exception:
            if attempt == 2:
                return None
            time.sleep(1.2 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, ".db_tmp", "kaogong.db"))
    ap.add_argument("--want", type=int, default=500, help="想保留多少道带图的图形推理题")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit("找不到题库文件 %s" % args.db)
    os.makedirs(os.path.join(HERE, "data", "img"), exist_ok=True)

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    # 国考优先（普遍更难），其次按试卷分组轮转保证来源分散
    rows = cur.execute("""
        select qid, img_refs, paper from questions
        where category='图形推理' and has_image=1 and qtype='single'
          and length(answer)=1 and coalesce(doubt,'')=''
        order by (case when paper like '%国家公务员%' or paper like '%国考%' or paper like '%中央机关%' then 0 else 1 end),
                 qid
    """).fetchall()
    print("图形推理候选题: %d 道" % len(rows))

    # 先按题拿出图片路径（一题一张），尽量多下载：比 want 多备一些，因为会有 404
    targets, seen = [], set()
    for qid, refs, paper in rows:
        m = re.findall(r"/90-图片/[^\"')\s<>]+", refs or "")
        if not m:
            continue
        p = m[0]
        if p in seen:
            continue
        seen.add(p)
        targets.append((qid, p, paper))
        if len(targets) >= args.want * 2:
            break
    print("待下载图片: %d 张（目标保留 %d 题）" % (len(targets), args.want))

    ok, fail = [], 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, res in enumerate(ex.map(lambda t: (t[0], t[2], grab(t[1])), targets), 1):
            qid, paper, got = res
            if got:
                ok.append({"qid": qid, "img": got[1], "paper": paper})
            else:
                fail += 1
            if i % 50 == 0 or i == len(targets):
                print("  进度 %d/%d  成功 %d  失败 %d  用时 %.0fs" % (i, len(targets), len(ok), fail, time.time() - t0))

    # 只保留前 want 道
    ok = ok[: args.want]
    out = os.path.join(HERE, "data", "graphic_index.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"meta": {"want": args.want, "kept": len(ok), "failed": fail,
                            "note": "图片版权归原作者与原题库平台，仅供个人学习，已 gitignore"},
                   "items": ok}, f, ensure_ascii=False, indent=1)
    size = sum(os.path.getsize(os.path.join(HERE, it["img"])) for it in ok)
    print("\n保留 %d 道（图片共 %.1f MB，平均 %.1f KB）" % (len(ok), size / 1048576, size / max(1, len(ok)) / 1024))
    print("索引: %s" % out)
    print("⚠️ data/img/ 与 data/graphic_index.json 仅供本机个人学习，请勿提交或部署。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
