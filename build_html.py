#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用 data/questions.json + app_template.html 生成单文件题库 index.html。

- 全部题目、SVG 配图、附录内联进 HTML，零外部依赖，双击即可离线使用。
- 生成后请跑 verify_bank.js 做结构与逻辑校验。
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "questions.json")
GEN = os.path.join(HERE, "data", "generated.json")
TPL = os.path.join(HERE, "app_template.html")
OUT = os.path.join(HERE, "index.html")


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

    ids = [q["id"] for q in orig + gen]
    assert len(set(ids)) == len(ids), "题号冲突：原题与生成题 id 重叠"

    bank = {"meta": dict(data["meta"], origCount=len(orig), genCount=len(gen),
                         count=len(orig) + len(gen)),
            "questions": orig + gen}
    appendix = {k: md_block(v) for k, v in data["appendix"].items()}

    html = tpl.replace("/*__BANK__*/", js_json(bank))
    html = html.replace("/*__APPENDIX__*/", js_json(appendix))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print("已生成 %s（%.1f KB，共 %d 题 = 原题 %d + 生成 %d，配图 %d 张）" % (
        OUT, size / 1024, len(orig) + len(gen), len(orig), len(gen),
        sum(1 for q in orig + gen if q.get("svg"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
