#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用 data/questions.json + app_template.html 生成单文件题库 index.html。

- 全部题目、SVG 配图、附录内联进 HTML，零外部依赖，双击即可离线使用。
- 生成后请跑 verify_bank.js 做结构与逻辑校验。
"""

import json
import sys
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "questions.json")
GEN = os.path.join(HERE, "data", "generated.json")
STRAT = os.path.join(HERE, "data", "strategy.json")
GRAF = os.path.join(HERE, "data", "graphics.json")
FIN  = os.path.join(HERE, "data", "finance.json")
FACTS= os.path.join(HERE, "data", "bankfacts.json")
TPL = os.path.join(HERE, "app_template.html")
GENJS = os.path.join(HERE, "app_gen.js")
OUT = os.path.join(HERE, "index.html")
ZHENTI = os.path.join(HERE, "data", "zhenti.json")
OUT_ZHENTI = os.path.join(HERE, "zhenti.local.html")   # 内嵌真题的单文件版（已 gitignore，仅本机）


def md_inline(s):
    # 先转义 HTML，再转 markdown，避免原文里的 < > & 破坏版面或注入标签
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def md_block(md):
    """附录用的小型 markdown 渲染：表格 / 列表 / 粗体标题 / 段落。"""
    lines = md.split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        st = line.strip()

        # 表格
        if st.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            # markdown 用 \| 表示单元格内的竖线，切分前先换成占位符
            rows = [[c.strip().replace("\x00", "|") for c in r.replace("\\|", "\x00").strip("|").split("|")]
                    for r in block]
            rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) or c == "" for c in r)]
            if rows:
                out.append('<table class="md-table"><thead><tr>')
                out.extend("<th>%s</th>" % md_inline(c) for c in rows[0])
                out.append("</tr></thead><tbody>")
                for r in rows[1:]:
                    out.append("<tr>" + "".join("<td>%s</td>" % md_inline(c) for c in r) + "</tr>")
                out.append("</tbody></table>")
            continue

        # 列表
        if re.match(r"^[-*]\s+", st):
            items = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i].strip()):
                items.append(re.sub(r"^[-*]\s+", "", lines[i].strip()))
                i += 1
            out.append('<ul class="tight">' + "".join("<li>%s</li>" % md_inline(x) for x in items) + "</ul>")
            continue

        # 整行加粗 -> 小标题
        m = re.fullmatch(r"\*\*(.+?)\*\*", st)
        if m:
            out.append("<h3>%s</h3>" % md_inline(m.group(1)))
            i += 1
            continue

        if not st:
            i += 1
            continue

        out.append("<p>%s</p>" % md_inline(st))
        i += 1
    return "".join(out)


def js_json(obj):
    """JSON -> 可安全内联进 <script> 的 JS 字面量（转义 < 防 </script>）。"""
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return s.replace("<", "\\u003c")


def main():
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    with open(TPL, encoding="utf-8") as f:
        tpl = f.read()

    orig = data["questions"]
    for q in orig:
        q.setdefault("src", "orig")

    gen = []
    if os.path.exists(GEN):
        with open(GEN, encoding="utf-8") as f:
            gen = json.load(f)["questions"]
        for q in gen:
            q["src"] = "gen"

    strat = []
    if os.path.exists(STRAT):                     # 思维策略（银行 EPI 特有模块）
        with open(STRAT, encoding="utf-8") as f:
            strat = json.load(f)["questions"]
        for q in strat:
            q["src"] = "gen"

    graf = []
    if os.path.exists(GRAF):                      # 图形推理（SVG 作图，选项也是图形）
        with open(GRAF, encoding="utf-8") as f:
            graf = json.load(f)["questions"]
        for q in graf:
            q["src"] = "gen"

    extra = []                                   # 金融计算 / 银行常识（综合知识）
    for path_ in (FIN, FACTS):
        if os.path.exists(path_):
            with open(path_, encoding="utf-8") as f:
                part = json.load(f)["questions"]
            for q in part:
                q["src"] = "gen"
            extra += part

    ids = [q["id"] for q in orig + gen + strat + graf + extra]
    assert len(set(ids)) == len(ids), "题号冲突：原题与生成题 id 重叠"

    with_zhenti = "--with-zhenti" in sys.argv
    zhenti = []
    if with_zhenti:
        if not os.path.exists(ZHENTI):
            raise SystemExit("要内嵌真题请先跑 import_zhenti.py 生成 data/zhenti.json")
        with open(ZHENTI, encoding="utf-8") as f:
            zhenti = json.load(f)["questions"]

    bank = {"meta": dict(data["meta"], origCount=len(orig), genCount=len(gen),
                         zhentiCount=len(zhenti), zhentiInlined=bool(zhenti),
                         stratCount=len(strat), grafCount=len(graf), extraCount=len(extra),
                         count=len(orig) + len(gen) + len(strat) + len(graf) + len(extra) + len(zhenti)),
            "questions": orig + gen + strat + graf + extra + zhenti}
    appendix = {k: md_block(v) for k, v in data["appendix"].items()}

    with open(GENJS, encoding="utf-8") as f:
        genjs = f.read()

    html = tpl.replace("/*__BANK__*/", js_json(bank))
    html = html.replace("/*__APPENDIX__*/", js_json(appendix))
    html = html.replace("/*__GEN__*/", genjs)

    target = OUT_ZHENTI if with_zhenti else OUT
    with open(target, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(target)
    if with_zhenti:
        print("已生成 %s（%.1f MB，共 %d 题 = 原题 %d + 生成 %d（含思维策略 %d）+ 真题 %d）—— 双击即可，无需起服务"
              % (OUT_ZHENTI, size / 1048576, len(orig) + len(gen) + len(strat) + len(graf) + len(extra) + len(zhenti),
                 len(orig), len(gen) + len(strat) + len(graf) + len(extra), len(strat) + len(graf) + len(extra), len(zhenti)))
    else:
        print("已生成 %s（%.1f KB，共 %d 题 = 原题 %d + 生成 %d（含思维策略 %d），配图 %d 张）" % (
            OUT, size / 1024, len(orig) + len(gen) + len(strat) + len(graf) + len(extra), len(orig),
            len(gen) + len(strat) + len(graf) + len(extra), len(strat) + len(graf) + len(extra),
            sum(1 for q in orig + gen if q.get("svg"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
