#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把《行测题型题库与技巧.md》解析成结构化题库数据。

输入（只读）：
  /Users/wangsheng/Documents/ChatGPT/New project/秋招行测题库/行测题型题库与技巧.md
  /Users/wangsheng/Documents/ChatGPT/New project/秋招行测题库/figs/q1xx.svg

输出：
  data/questions.json   —— 134 题结构化数据 + 附录 + 模块提示
  parse_report.txt      —— 解析告警（缺选项、缺解析、答案不在选项内等）

只做解析与校验，不改动源文件。
"""

import json
import os
import re
import sys

SRC_DIR_ORIG = "/Users/wangsheng/Documents/ChatGPT/New project/秋招行测题库"
_HERE = os.path.dirname(os.path.abspath(__file__))
# 优先用本目录下的源快照（自包含可重建），没有就回退到原始题库目录
if os.path.exists(os.path.join(_HERE, "source", "行测题型题库与技巧.md")):
    SRC_DIR = os.path.join(_HERE, "source")
else:
    SRC_DIR = SRC_DIR_ORIG
SRC_MD = os.path.join(SRC_DIR, "行测题型题库与技巧.md")
FIG_DIR = os.path.join(SRC_DIR, "figs")

OUT_DIR = os.path.join(_HERE, "data")

Q_RE = re.compile(r"^\*\*(\d+)\.\*\*(.*)$")
OPT_LINE_RE = re.compile(r"^([A-E])[\.．]\s*(.*)$")


def clean_heading(h):
    """'3.4 图形推理（11 题，配图）' -> '图形推理'"""
    h = re.sub(r"^\d+\.\d+\s*", "", h)
    h = re.sub(r"（[^）]*题[^）]*）", "", h)
    return h.strip()


def md_inline(s):
    """极小的行内转换：先转义 HTML，再把 **粗体** / `代码` 变成标签。"""
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def md_table_to_html(lines):
    """把 markdown 表格行转成 <table>。"""
    rows = []
    for line in lines:
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) or c == "" for c in cells):
            continue  # 分隔行
        rows.append(cells)
    if not rows:
        return ""
    head, body = rows[0], rows[1:]
    out = ['<table class="md-table"><thead><tr>']
    out += ["<th>%s</th>" % md_inline(c) for c in head]
    out += ["</tr></thead><tbody>"]
    for r in body:
        out.append("<tr>" + "".join("<td>%s</td>" % md_inline(c) for c in r) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def render_material(lines):
    """材料区：段落 + 表格，转 HTML。"""
    html, buf, table_buf = [], [], []

    def flush_para():
        if buf:
            txt = " ".join(x.strip() for x in buf if x.strip())
            if txt:
                html.append("<p>%s</p>" % md_inline(txt))
            buf.clear()

    def flush_table():
        if table_buf:
            html.append(md_table_to_html(table_buf))
            table_buf.clear()

    for line in lines:
        if line.strip().startswith("|"):
            flush_para()
            table_buf.append(line)
        elif not line.strip():
            flush_para()
            flush_table()
        else:
            flush_table()
            buf.append(line)
    flush_para()
    flush_table()
    return "".join(html)


def parse_options(opt_lines):
    """兼容两种排布：竖排（每行一个）与横排（一行 2 个，用全角空格分隔）。"""
    opts = []
    for line in opt_lines:
        # 全角空格是源文件里分隔同行选项的分隔符
        for seg in re.split(r"[\u3000]+", line):
            seg = seg.strip()
            if not seg:
                continue
            m = OPT_LINE_RE.match(seg)
            if m:
                opts.append([m.group(1), m.group(2).strip()])
            elif opts:
                opts[-1][1] = (opts[-1][1] + " " + seg).strip()
    return opts


def split_answer_letter(ans, opts):
    letters = [o[0] for o in opts]
    return ans if ans in letters else ans


def parse():
    with open(SRC_MD, encoding="utf-8") as f:
        lines = f.read().split("\n")

    questions = []
    module = topic = ""
    module_tip = ""
    section_tip = ""
    material = ""
    material_ctx = None
    pending_tip = []
    warns = []

    i = 0
    n_lines = len(lines)
    while i < n_lines:
        line = lines[i]

        # ---- 模块标题 ----
        m = re.match(r"^##\s+(.+)$", line)
        if m:
            head = m.group(1).strip()
            if head.startswith("模块"):
                module = re.sub(r"^模块[一二三四五六七八九十]+\s*", "", head)
                module = re.sub(r"（[^）]*）", "", module).strip()
                topic = ""
                material = ""
                material_ctx = None
                j = i + 1
                mtips = []
                while j < n_lines and (lines[j].strip() == "" or lines[j].strip().startswith(">")):
                    if lines[j].strip().startswith(">"):
                        mtips.append(lines[j].strip()[1:].strip())
                    j += 1
                module_tip = " ".join(mtips)
                i = j
                continue
            elif head.startswith("附录"):
                module = "附录"
            i += 1
            continue

        # ---- 题型 / 材料标题 ----
        m = re.match(r"^###\s+(.+)$", line)
        if m:
            head = m.group(1).strip()
            pending_tip = []
            if head.startswith("材料"):
                material = head
                j = i + 1
                mat_lines = []
                while j < n_lines and not Q_RE.match(lines[j]) and not lines[j].startswith("##"):
                    if lines[j].startswith(">"):
                        pending_tip.append(lines[j][1:].strip())
                    else:
                        mat_lines.append(lines[j])
                    j += 1
                material_html = render_material(mat_lines)
                section_tip = " ".join([t for t in pending_tip if t])
                # 材料挂在每个题上，后面统一取
                material_ctx = (head, material_html)
                i = j
                continue
            else:
                topic = clean_heading(head)
                material_ctx = None
                j = i + 1
                tips = []
                while j < n_lines and (lines[j].strip() == "" or lines[j].strip().startswith(">")):
                    if lines[j].strip().startswith(">"):
                        tips.append(lines[j].strip()[1:].strip())
                    j += 1
                section_tip = " ".join(tips)
                i = j
                continue
            i += 1
            continue

        # ---- 题目 ----
        m = Q_RE.match(line)
        if m:
            qid = int(m.group(1))
            stem_lines = [m.group(2).strip()]
            img = None
            j = i + 1
            # 题干：直到出现选项行
            while j < n_lines:
                cur = lines[j]
                if OPT_LINE_RE.match(cur.strip()):
                    break
                if Q_RE.match(cur) or cur.startswith("#"):
                    break
                mm = re.match(r"^!\[[^\]]*\]\(<?([^)>]+)>?\)\s*$", cur.strip())
                if mm:
                    img = mm.group(1)
                elif cur.strip().startswith(">"):
                    break
                else:
                    stem_lines.append(cur)
                j += 1
            # 选项
            opt_lines = []
            while j < n_lines:
                cur = lines[j]
                if not cur.strip():
                    break
                if cur.strip().startswith(">") or Q_RE.match(cur) or cur.startswith("#"):
                    break
                opt_lines.append(cur.strip())
                j += 1
            opts = parse_options(opt_lines)
            # 技巧 / 解析 / 答案
            tip, analysis, ans = "", "", ""
            while j < n_lines:
                cur = lines[j].strip()
                if Q_RE.match(cur) or cur.startswith("#"):
                    break
                if cur.startswith(">"):
                    body = cur[1:].strip()
                    if body.startswith("**技巧**"):
                        tip = re.sub(r"^\*\*技巧\*\*：?", "", body).strip()
                    elif body.startswith("**解析**"):
                        analysis = re.sub(r"^\*\*解析\*\*：?", "", body).strip()
                    else:
                        am = re.search(r"\*\*答案：([A-E])\*\*", body)
                        if am:
                            ans = am.group(1)
                j += 1

            stem = "\n".join([s for s in stem_lines if s.strip() != ""]).strip()
            src_tag = ""
            tm = re.match(r"^（(真题|仿真|回忆版)）\s*", stem)
            if tm:
                src_tag = tm.group(1)
                stem = stem[tm.end():].strip()

            # 校验
            letters = [o[0] for o in opts]
            if letters != ["A", "B", "C", "D"]:
                warns.append("题 %d：选项字母异常 %s" % (qid, letters))
            if not ans:
                warns.append("题 %d：缺答案" % qid)
            elif ans not in letters:
                warns.append("题 %d：答案 %s 不在选项 %s 中" % (qid, ans, letters))
            if not tip:
                warns.append("题 %d：缺技巧" % qid)
            if not analysis:
                warns.append("题 %d：缺解析" % qid)

            svg = None
            if img:
                # 源 md 里的图是绝对路径；优先取本目录 figs/ 下的同名文件，保证快照自包含
                local = os.path.join(FIG_DIR, os.path.basename(img))
                if os.path.exists(local):
                    svg_path = local
                else:
                    svg_path = img if os.path.isabs(img) else os.path.join(SRC_DIR, img)
                if os.path.exists(svg_path):
                    with open(svg_path, encoding="utf-8") as f:
                        svg = f.read().strip()
                else:
                    warns.append("题 %d：配图缺失 %s" % (qid, img))

            questions.append({
                "id": qid,
                "module": module,
                "topic": topic or module,
                "source": src_tag,
                "stem": stem,
                "options": [{"k": k, "t": t} for k, t in opts],
                "svg": svg,
                "tip": tip,
                "analysis": analysis,
                "answer": ans,
                "materialTitle": material_ctx[0] if material_ctx else "",
                "materialHtml": material_ctx[1] if material_ctx else "",
                "sectionTip": section_tip if material_ctx is None else "",
                "moduleTip": module_tip,
            })
            i = j
            continue

        i += 1

    questions.sort(key=lambda q: q["id"])

    # 手写那批里，图形推理是最基础的一档（只有 11 道、每题一个规律）；
    # 标成「易」以便在难度筛选里和程序作图/真题区分开，别让人以为整库图推就这水平。
    for q in questions:
        if q["topic"] == "图形推理":
            q["diff"] = 1
        else:
            q.setdefault("diff", 0)
    return questions, warns


def main():
    questions, warns = parse()
    os.makedirs(OUT_DIR, exist_ok=True)

    # 题型通用提示（每个题型标题后的 > 引用）
    with open(SRC_MD, encoding="utf-8") as f:
        md = f.read()

    appendix = {}
    for name, pat in [("A", r"## 附录 A[^\n]*\n(.*?)(?=\n## )"),
                      ("B", r"## 附录 B[^\n]*\n(.*?)(?=\n## )"),
                      ("C", r"## 附录 C[^\n]*\n(.*?)(?=\n## )")]:
        m = re.search(pat, md, re.S)
        appendix[name] = m.group(1).strip() if m else ""

    data = {
        "meta": {
            "title": "秋招行测题型题库与技巧（134 题）",
            "count": len(questions),
            "source": SRC_MD,
        },
        "questions": questions,
        "appendix": appendix,
    }
    with open(os.path.join(OUT_DIR, "questions.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    with open(os.path.join(os.path.dirname(OUT_DIR), "parse_report.txt"), "w", encoding="utf-8") as f:
        f.write("题量: %d\n" % len(questions))
        mods = {}
        for q in questions:
            mods.setdefault((q["module"], q["topic"]), []).append(q["id"])
        for (mod, top), ids in mods.items():
            f.write("%s / %s : %d 题 (%d-%d)\n" % (mod, top, len(ids), ids[0], ids[-1]))
        f.write("\n告警 %d 条:\n" % len(warns))
        for w in warns:
            f.write("  - %s\n" % w)

    print("题量:", len(questions))
    print("告警:", len(warns))
    for w in warns:
        print("  -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
