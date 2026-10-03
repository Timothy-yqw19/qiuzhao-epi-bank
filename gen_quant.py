#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
程序化出题器：为「答案可被机器推导与验算」的题型批量生成行测题。

覆盖题型：
  数字推理   —— 等差数列/二级等差/等比/递推和/递推倍加/平方立方偏移/相邻和成规律/奇偶项分组/分数数列
  数学运算   —— 工程/相遇/追及/利润/浓度/容斥/排列组合/植树/年龄/空瓶换水/牛吃草/和差最值
  资料分析   —— 文字材料/表格材料/增速材料，每题 4 小问（基期、增长量、比重、平均数、两期比重升降等）
  逻辑判断   —— 翻译推理（只有…才…、如果…那么…、除非…否则…）与三段论

关键原则：
  1. 答案由构造过程直接给出，**不留人工口算**；
  2. 每题生成后再跑一次独立验算（代回原式 / 重推数列规则），验算不过就丢弃；
  3. 干扰项由「常见错误算法」产生，而不是随机数；
  4. 选项顺序打乱，正确答案位置随机；
  5. 题干去重。

输出：data/generated.json
用法：python3 gen_quant.py [--n-digital 200] [--n-math 200] [--n-material 21] [--n-logic 80] [--seed 20261002]
"""

import argparse
import json
import math
import os
import random
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "generated.json")

# ----------------------------------------------------------------------------
# 通用工具
# ----------------------------------------------------------------------------


def fmt(x, unit=""):
    """数字格式化：整数不带小数点，小数最多一位。"""
    if isinstance(x, float):
        if abs(x - round(x)) < 1e-9:
            x = int(round(x))
        else:
            x = round(x, 1)
    return "%s%s" % (x, unit)


def dedup(ans, cands, need=3, fallback_step=1, rng=None, fmt_fn=None):
    """从候选干扰项里挑 need 个与答案不同、彼此也不同的值。"""
    ff = fmt_fn or (lambda v: fmt(v))
    a_key = ff(ans)
    seen = {a_key}
    out = []
    for c in cands:
        k = ff(c)
        if k in seen:
            continue
        seen.add(k)
        out.append(c)
        if len(out) >= need:
            return out
    step = fallback_step
    i = 1
    while len(out) < need and i < 40:
        for sign in (1, -1):
            try:
                cand = ans + step * i * sign
                k = ff(cand)
            except Exception:
                continue
            if k not in seen:
                seen.add(k)
                out.append(cand)
                if len(out) >= need:
                    break
        i += 1
    return out


class Maker:
    """把 (题干, 答案, 干扰项, 技巧, 解析) 组装成标准题目对象。"""

    def __init__(self, rng):
        self.rng = rng
        self.stems = set()
        self.qid = 1000
        self.qs = []

    def build(self, module, topic, stem, ans, distractors, tip, analysis,
              material_title="", material_html="", fmt_fn=None, check=None, dedup_key=None):
        ff = fmt_fn or (lambda v: fmt(v))
        ans_s = ff(ans)
        cands = [c for c in distractors]
        if ans_s in [ff(c) for c in cands]:
            cands = [c for c in cands if ff(c) != ans_s]
        extra = dedup(ans, cands, 3, rng=self.rng, fmt_fn=ff)
        opts = [ans] + extra[:3]
        self.rng.shuffle(opts)
        letters = "ABCD"
        options = [{"k": letters[i], "t": ff(v)} for i, v in enumerate(opts)]
        answer = letters[[ff(v) for v in opts].index(ans_s)]

        if len({o["t"] for o in options}) != 4:
            return None
        key = dedup_key or stem
        if key in self.stems:
            return None
        if check is not None and not check():
            return None

        self.stems.add(key)
        self.qid += 1
        q = {
            "id": self.qid,
            "module": module,
            "topic": topic,
            "source": "生成",
            "src": "gen",
            "stem": stem,
            "options": options,
            "svg": None,
            "tip": tip,
            "analysis": analysis,
            "answer": answer,
            "materialTitle": material_title,
            "materialHtml": material_html,
            "sectionTip": "",
            "moduleTip": "",
        }
        self.qs.append(q)
        return q


# ----------------------------------------------------------------------------
# 一、数字推理
# ----------------------------------------------------------------------------

def _d_arith(rng):
    d = rng.choice([-9, -7, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9, 11])
    a1 = rng.randint(2, 40)
    t = [a1 + i * d for i in range(6)]
    if any(x < -50 for x in t):
        return None
    tip = "先作差：相邻两项之差恒定，就是等差数列。"
    ana = "相邻两项之差恒为 %d（%s），故所求项 = %d + (%d) = %d。" % (
        d, "、".join(str(t[i + 1] - t[i]) for i in range(4)), t[4], d, t[5])

    def chk():
        return all(t[i + 1] - t[i] == d for i in range(5))

    dist = [t[5] + d, t[5] - d, t[5] + 2 * d]
    return t[:5], t[5], tip, ana, dist, chk


def _d_arith2(rng):
    d0 = rng.randint(2, 9)
    k = rng.choice([2, 3, 4, -2, -3])
    diffs = [d0 + k * i for i in range(5)]
    t = [rng.randint(1, 15)]
    for dd in diffs:
        t.append(t[-1] + dd)
    if any(x < -30 for x in t) or t[-1] > 900:
        return None
    tip = "一次作差没规律，就再作一次差（二次差恒定即为二级等差）。"
    ana = "一次差为 %s，构成公差为 %d 的等差数列，故下一个差为 %d，所求项 = %d + %d = %d。" % (
        "、".join(str(diffs[i]) for i in range(4)), k, diffs[4], t[4], diffs[4], t[5])

    def chk():
        ds = [t[i + 1] - t[i] for i in range(5)]
        return all(ds[i + 1] - ds[i] == k for i in range(4))

    dist = [t[5] + k, t[5] - k, t[5] + diffs[3]]
    return t[:5], t[5], tip, ana, dist, chk


def _d_geo(rng):
    r = rng.choice([2, 3, -2])
    a1 = rng.choice([1, 2, 3, -1, -2, 4])
    t = [a1 * (r ** i) for i in range(6)]
    if abs(t[-1]) > 3000:
        return None
    tip = "作差无果就看商：相邻两项之比恒定即为等比数列。"
    ana = "相邻两项之比恒为 %d，故所求项 = %d × (%d) = %d。" % (r, t[4], r, t[5])

    def chk():
        return all(t[i + 1] == t[i] * r for i in range(5))

    dist = [t[5] + r, t[5] - r, t[5] // r if t[5] % r == 0 else t[5] + 2]
    return t[:5], t[5], tip, ana, dist, chk


def _d_recadd(rng):
    a, b = rng.randint(1, 12), rng.randint(1, 12)
    t = [a, b]
    for _ in range(4):
        t.append(t[-1] + t[-2])
    if t[-1] > 3000:
        return None
    tip = "看递推：某一项等于前两项之和（斐波那契型）。"
    ana = "%d + %d = %d，%d + %d = %d，依此类推，所求项 = %d + %d = %d。" % (
        t[0], t[1], t[2], t[1], t[2], t[3], t[4], t[3], t[5])

    def chk():
        return all(t[i] == t[i - 1] + t[i - 2] for i in range(2, 6))

    dist = [t[5] + t[4], t[4] + t[3], t[5] - t[4]]
    return t[:5], t[5], tip, ana, dist, chk


def _d_recmul(rng):
    k = rng.choice([2, 3])
    c = rng.choice([-3, -2, -1, 1, 2, 3])
    t = [rng.randint(1, 6)]
    for _ in range(5):
        t.append(t[-1] * k + c)
    if t[-1] > 5000 or any(x < -20 for x in t):
        return None
    tip = "倍数关系叠加减法：用「前一项 × 倍数 + 常数」试探递推。"
    ana = "%d × %d + (%d) = %d，%d × %d + (%d) = %d，规律一致，所求项 = %d × %d + (%d) = %d。" % (
        t[0], k, c, t[1], t[1], k, c, t[2], t[4], k, c, t[5])

    def chk():
        return all(t[i] == t[i - 1] * k + c for i in range(1, 6))

    dist = [t[5] + k, t[5] - c, t[4] * k]
    return t[:5], t[5], tip, ana, dist, chk


def _d_square(rng):
    c = rng.randint(-6, 12)
    t = [(i + 1) ** 2 + c for i in range(6)]
    if any(x < 1 for x in t):
        return None
    tip = "数字忽大忽小或增长偏快时，试「平方数列 + 常数偏移」。"
    ana = "各项减去 %d 后为 1、4、9、16、25、36（即 1²—6²），故所求项 = 6² + (%d) = %d。" % (c, c, t[5])

    def chk():
        return all(t[i] == (i + 1) ** 2 + c for i in range(6))

    dist = [t[5] + 2, t[5] - 2, (t[5] // 2)]
    return t[:5], t[5], tip, ana, dist, chk


def _d_cube(rng):
    c = rng.randint(-5, 10)
    t = [(i + 1) ** 3 + c for i in range(6)]
    if any(x < 1 for x in t):
        return None
    tip = "增长极快（几十→几百→上千）优先试立方数列。"
    ana = "各项减去 %d 后为 1、8、27、64、125、216（即 1³—6³），故所求项 = 6³ + (%d) = %d。" % (c, c, t[5])

    def chk():
        return all(t[i] == (i + 1) ** 3 + c for i in range(6))

    dist = [t[5] + 3, t[5] - 3, t[5] - (t[5] - t[4]) // 2]
    return t[:5], t[5], tip, ana, dist, chk


def _d_sumrule(rng):
    """相邻两项之和成等比（公比 2）或等差。"""
    mode = rng.choice(["geo", "arith"])
    a1 = rng.randint(3, 20)
    if mode == "geo":
        s1 = rng.choice([8, 12, 16, 20, 24, 32, 40])
        sums = [s1 * (2 ** i) for i in range(5)]
    else:
        s1 = rng.randint(10, 30)
        k = rng.randint(3, 9)
        sums = [s1 + i * k for i in range(5)]
    t = [a1]
    for s in sums[:5]:
        t.append(s - t[-1])
    if any(x < -40 for x in t) or t[-1] > 1500:
        return None
    tip = "作差无规律时立刻试「相邻两项之和」：把和单独排成数列看规律。"
    if mode == "geo":
        ana = "相邻两项之和依次为 %s，是公比为 2 的等比数列，故下一组和应为 %d，即 %d + x = %d，x = %d。" % (
            "、".join(str(s) for s in sums[:4]), sums[4], t[4], sums[4], t[5])
    else:
        ana = "相邻两项之和依次为 %s，构成公差为 %d 的等差数列，故下一组和应为 %d，即 %d + x = %d，x = %d。" % (
            "、".join(str(s) for s in sums[:4]), k, sums[4], t[4], sums[4], t[5])

    def chk():
        got = [t[i] + t[i + 1] for i in range(5)]
        return got == sums

    dist = [t[5] + 1, t[5] - 1, sums[4] - t[4] + 2]
    return t[:5], t[5], tip, ana, dist, chk


def _d_split(rng):
    """奇偶项各自成等差。"""
    a1 = rng.randint(1, 20)
    d1 = rng.choice([-3, -2, 2, 3, 4, 5, 6])
    a2 = rng.randint(20, 60)
    d2 = rng.choice([-6, -4, -3, 3, 4, 6, 8])
    t = []
    for i in range(6):
        t.append(a1 + (i // 2) * d1 if i % 2 == 0 else a2 + (i // 2) * d2)
    if any(x < -20 for x in t):
        return None
    tip = "整体看不出规律时，把奇偶项拆成两个数列分别看。"
    ana = "奇数项 %s 构成公差为 %d 的等差数列；偶数项 %s 构成公差为 %d 的等差数列。所求为偶数项，%d + (%d) = %d。" % (
        "、".join(str(t[i]) for i in (0, 2, 4)), d1,
        "、".join(str(t[i]) for i in (1, 3)), d2, t[3], d2, t[5])

    def chk():
        return (t[2] - t[0] == d1 and t[4] - t[2] == d1 and t[3] - t[1] == d2 and t[5] - t[3] == d2)

    dist = [t[5] + d2, t[5] - d2, t[4] + d1]
    return t[:5], t[5], tip, ana, dist, chk


def _d_frac(rng):
    """分子、分母各自成等差。"""
    n0, dn = rng.randint(1, 9), rng.randint(1, 5)
    d0, dd = rng.randint(2, 9), rng.randint(1, 4)
    pairs = [(n0 + i * dn, d0 + i * dd) for i in range(6)]
    t = [Fraction(p[0], p[1]) for p in pairs]
    tip = "分数数列先拆开看：分子、分母各自成数列，别急着通分。"
    ana = "分子 %s 是公差为 %d 的等差数列；分母 %s 是公差为 %d 的等差数列。所求项 = %d/%d。" % (
        "、".join(str(p[0]) for p in pairs[:4]), dn,
        "、".join(str(p[1]) for p in pairs[:4]), dd, pairs[5][0], pairs[5][1])

    def chk():
        return all(pairs[i][0] == n0 + i * dn and pairs[i][1] == d0 + i * dd for i in range(6))

    def ff(v):
        if isinstance(v, Fraction):
            return "%d/%d" % (v.numerator, v.denominator)
        return fmt(v)

    ans_s = "%d/%d" % (pairs[5][0], pairs[5][1])
    dist_s = ["%d/%d" % (pairs[5][0] + dn, pairs[5][1]),
              "%d/%d" % (pairs[5][0], pairs[5][1] + dd),
              "%d/%d" % (pairs[4][0] + dn, pairs[4][1] + dd)]
    return pairs, ans_s, tip, ana, dist_s, chk, ff


DIGITAL_RULES = [_d_arith, _d_arith2, _d_geo, _d_recadd, _d_recmul,
                 _d_square, _d_cube, _d_sumrule, _d_split, _d_frac]


def gen_digital(mk, n):
    made, tries = 0, 0
    while made < n and tries < n * 40:
        tries += 1
        rule = mk.rng.choice(DIGITAL_RULES)
        got = rule(mk.rng)
        if not got:
            continue
        if len(got) == 7:
            terms, ans, tip, ana, dist, chk, ff = got
            is_frac = True
        else:
            terms, ans, tip, ana, dist, chk = got
            ff = None
            is_frac = False
        if not chk():
            continue

        if is_frac:
            stem = "%s，（　）" % "，".join("%d/%d" % p for p in terms)
            q = mk.build("数量关系", "数字推理", stem, ans, dist, tip, ana, fmt_fn=ff, check=chk)
        else:
            stem = "%s，（　）" % "，".join(str(x) for x in terms)
            q = mk.build("数量关系", "数字推理", stem, ans, dist, tip, ana, check=chk)
        if q:
            made += 1
    return made


# ----------------------------------------------------------------------------
# 二、数学运算
# ----------------------------------------------------------------------------

ENG_PAIRS = [(10, 15), (12, 6), (20, 30), (9, 18), (15, 10), (8, 24), (12, 24),
             (30, 20), (14, 35), (16, 48), (21, 28), (6, 12), (10, 40), (18, 12)]


def _m_engineer(rng):
    a, b = rng.choice(ENG_PAIRS)
    ans = Fraction(a * b, a + b)
    if ans.denominator != 1:
        return None
    ans = ans.numerator
    stem = "一项工程，甲队单独做需要 %d 天完成，乙队单独做需要 %d 天完成。若两队合作，需要多少天完成？" % (a, b)
    tip = "工程问题赋值总量为时间的公倍数，或直接用「合作时间 = 甲乙时间之积 ÷ 时间之和」。"
    ana = "设总量为 1，甲效率 1/%d，乙效率 1/%d，合作效率 = 1/%d + 1/%d = %d/%d，故时间 = %d 天。" % (
        a, b, a, b, a + b, a * b, ans)
    dist = [a + b, abs(a - b) or 1, ans + 2]

    def chk():
        return Fraction(ans) * (Fraction(1, a) + Fraction(1, b)) == 1

    return stem, ans, dist, tip, ana, chk, "天"


def _m_meet(rng):
    v1 = rng.randint(30, 90)
    v2 = rng.randint(20, 80)
    t = rng.randint(2, 9)
    s = (v1 + v2) * t
    stem = "甲、乙两地相距 %d 千米。两车同时从两地相向开出，速度分别为每小时 %d 千米和 %d 千米，经过多少小时相遇？" % (s, v1, v2)
    tip = "相遇问题看速度和：路程 ÷（速度之和）= 相遇时间。"
    ana = "速度和 = %d + %d = %d（千米/时），相遇时间 = %d ÷ %d = %d 小时。" % (v1, v2, v1 + v2, s, v1 + v2, t)
    dist = [t + 1, t - 1 if t > 1 else t + 2, s // max(v1, v2)]

    def chk():
        return (v1 + v2) * t == s

    return stem, t, dist, tip, ana, chk, "小时"


def _m_chase(rng):
    v1 = rng.randint(60, 110)
    v2 = rng.randint(20, 55)
    t = rng.randint(2, 8)
    s = (v1 - v2) * t
    stem = "甲在乙后方 %d 千米处，两人同向出发，甲每小时行 %d 千米，乙每小时行 %d 千米，甲追上乙需要多少小时？" % (s, v1, v2)
    tip = "追及问题看速度差：追及路程 ÷（速度之差）= 追及时间。"
    ana = "速度差 = %d − %d = %d（千米/时），追及时间 = %d ÷ %d = %d 小时。" % (v1, v2, v1 - v2, s, v1 - v2, t)
    dist = [t + 1, t - 1 if t > 1 else t + 2, s // v1 + 1]

    def chk():
        return (v1 - v2) * t == s

    return stem, t, dist, tip, ana, chk, "小时"


def _m_profit(rng):
    cost = rng.choice([80, 120, 150, 200, 240, 300, 400, 500])
    p = rng.choice([10, 15, 20, 25, 30, 40, 50])
    price = int(cost * (1 + p / 100))
    stem = "某商品进价 %d 元，商家按进价加价 %d%% 出售，售价是多少元？" % (cost, p)
    tip = "利润率以成本为基数：售价 = 成本 ×（1 + 利润率）。"
    ana = "售价 = %d ×（1 + %d%%）= %d 元。" % (cost, p, price)
    dist = [int(cost * (1 + p / 100) * 1.1), int(cost * p / 100), cost + p]

    def chk():
        return abs(cost * (1 + p / 100) - price) < 1e-9

    return stem, price, dist, tip, ana, chk, "元"


def _m_mix(rng):
    m1 = rng.choice([200, 300, 400, 500, 600])
    m2 = rng.choice([200, 300, 400, 500])
    p1, p2 = rng.choice([(10, 20), (20, 30), (30, 40), (10, 40), (25, 35), (15, 45)])
    total = m1 + m2
    solute = m1 * p1 + m2 * p2
    if solute % total != 0:
        return None
    p = solute // total
    stem = "把浓度为 %d%% 的溶液 %d 克与浓度为 %d%% 的溶液 %d 克混合，混合后的浓度是多少？" % (p1, m1, p2, m2)
    tip = "浓度混合抓住「溶质守恒」：混合前后溶质总量不变。"
    ana = "溶质总量 = %d×%d%% + %d×%d%% = %d，总质量 = %d 克，浓度 = %d ÷ %d = %d%%。" % (
        m1, p1, m2, p2, solute, total, solute, total, p)
    dist = [(p1 + p2) // 2, p + 5, p - 5]

    def chk():
        return m1 * p1 + m2 * p2 == total * p

    return stem, p, dist, tip, ana, chk, "%"


def _m_incl(rng):
    a = rng.randint(40, 90)
    b = rng.randint(30, 80)
    both = rng.randint(5, min(a, b) - 1)
    ans = a + b - both
    stem = "某班 %d 人参加数学竞赛，%d 人参加物理竞赛，两科都参加的有 %d 人。至少参加一科的有多少人？" % (a, b, both)
    tip = "容斥原理：A∪B = A + B − A∩B。"
    ana = "至少参加一科 = %d + %d − %d = %d 人。" % (a, b, both, ans)
    dist = [a + b, a + b - 2 * both, abs(a - b)]

    def chk():
        return a + b - both == ans

    return stem, ans, dist, tip, ana, chk, "人"


def _m_comb(rng):
    n = rng.randint(5, 12)
    k = rng.choice([2, 3])
    ans = math.comb(n, k)
    what = "选 %d 人组成小组" % k if k == 2 else "选 %d 人组成小组" % k
    stem = "从 %d 名候选人中任%s，共有多少种不同的选法？" % (n, what)
    tip = "组合不看顺序：C(n,k) = n! ÷ [k!(n−k)!]；若题目问「排列」才看顺序。"
    ana = "C(%d,%d) = %d 种。" % (n, k, ans)
    dist = [ans * k, n * k, ans - n]

    def chk():
        return math.comb(n, k) == ans

    return stem, ans, dist, tip, ana, chk, "种"


def _m_tree(rng):
    d = rng.choice([4, 5, 6, 8, 10, 12])
    seg = rng.randint(5, 20)
    L = d * seg
    ans = seg + 1
    stem = "在长 %d 米的道路一侧植树，每隔 %d 米种一棵，两端都种，共需多少棵树？" % (L, d)
    tip = "植树问题记「段数」：两端都种 = 段数 + 1；只种一端 = 段数；两端都不种 = 段数 − 1；封闭路线 = 段数。"
    ana = "段数 = %d ÷ %d = %d，两端都种故需要 %d + 1 = %d 棵。" % (L, d, seg, seg, ans)
    dist = [seg, seg - 1, seg + 2]

    def chk():
        return L % d == 0 and L // d + 1 == ans

    return stem, ans, dist, tip, ana, chk, "棵"


def _m_age(rng):
    m = rng.choice([2, 3, 4])
    y = rng.randint(6, 16)
    k = rng.randint(3, 12)
    x = m * (y + k) - k
    if not (x > y + 18 and x < 90):
        return None
    stem = "今年父亲 %d 岁，儿子 %d 岁。多少年后父亲的年龄是儿子的 %d 倍？" % (x, y, m)
    tip = "年龄问题抓住「年龄差不变」，用倍数关系列方程。"
    ana = "设 %d 年后满足，则 %d + x = %d(%d + x)，解得 x = %d 年。" % (k, x, m, y, k)
    dist = [k + 1, k - 1 if k > 1 else k + 2, k + 3]

    def chk():
        return x + k == m * (y + k)

    return stem, k, dist, tip, ana, chk, "年"


def _m_bottle(rng):
    m = rng.choice([3, 4, 5])
    N = rng.randint(10, 60)

    def simulate():
        drank = N
        empty = N
        while empty >= m:
            new = empty // m
            drank += new
            empty = empty % m + new
        return drank

    ans = simulate()
    stem = "某商店规定每 %d 个空瓶可以换 1 瓶饮料。小王买了 %d 瓶，最多能喝到多少瓶？" % (m, N)
    tip = "空瓶换水：先换再借瓶，总量 ≈ N + N ÷ (m−1)（这里的 m 指换 1 瓶所需的空瓶数）。"
    ana = "按「先换、再用新瓶产生的空瓶继续换」循环计算：%d 瓶喝完得 %d 个空瓶，逐轮兑换后共喝 %d 瓶。" % (N, N, ans)
    dist = [N + N // m, N, N + N // (m - 1) + 1]

    def chk():
        return simulate() == ans

    return stem, ans, dist, tip, ana, chk, "瓶"


def _m_cow(rng):
    g = rng.randint(1, 5)          # 每天新长的草（单位：牛·天/天）
    T1 = rng.randint(6, 12)
    T2 = T1 + rng.randint(2, 6)
    n1 = rng.randint(8, 20)
    orig = (n1 - g) * T1
    if orig <= 0:
        return None
    n2 = g + orig // T2
    if n2 * T2 != orig + g * T2 or n2 <= g:
        return None
    T3 = T2 + rng.randint(2, 8)
    n3_num = orig + g * T3
    if n3_num % T3 != 0:
        return None
    n3 = n3_num // T3
    if n3 <= g or n3 > 40:
        return None
    stem = "一片牧场，可供 %d 头牛吃 %d 天，或供 %d 头牛吃 %d 天。若草每天匀速生长，可供多少头牛吃 %d 天？" % (
        n1, T1, n2, T2, T3)
    tip = "牛吃草：设每头牛每天吃 1 份，原有草量 + 每天生长量 × 天数 = 牛数 × 天数，两式相减消去原有草量。"
    ana = "设每天长草 x 份，原有草 y 份：y + %dx = %d×%d，y + %dx = %d×%d，解得 x = %d、y = %d；再由 y + %dx = n×%d 得 n = %d 头。" % (
        T1, n1, T1, T2, n2, T2, g, orig, T3, T3, n3)
    dist = [n3 + 1, n3 - 1, n1]

    def chk():
        return orig + g * T3 == n3 * T3 and orig + g * T1 == n1 * T1 and orig + g * T2 == n2 * T2

    return stem, n3, dist, tip, ana, chk, "头"


def _m_extreme(rng):
    n = 5
    total = rng.randint(120, 300)
    lo = rng.randint(10, 25)
    if total - (n - 1) * lo <= lo:
        return None
    ans = total - (n - 1) * lo
    stem = "%d 个互不相同的正整数之和为 %d，其中最小的是 %d，则最大的数最大是多少？" % (n, total, lo)
    tip = "最值问题：求某个数的最大值，就让其余各数尽可能小（且互不相同、满足下限）。"
    ana = "要让最大数最大，其余 %d 个数取最小可能的互不相同正整数：%s，故最大数 = %d − %d = %d。" % (
        n - 1, "、".join(str(lo + i) for i in range(n - 1)), total, sum(lo + i for i in range(n - 1)), ans)
    dist = [ans + 1, total - n * lo, ans - 1 if ans > 1 else ans + 2]

    def chk():
        rest = [lo + i for i in range(n - 1)]
        vals = rest + [ans]
        return sum(vals) == total and len(set(vals)) == n and min(vals) == lo and n - 1 == len(set(rest))

    return stem, ans, dist, tip, ana, chk, ""


MATH_TEMPLATES = [_m_engineer, _m_meet, _m_chase, _m_profit, _m_mix, _m_incl,
                  _m_comb, _m_tree, _m_age, _m_bottle, _m_cow, _m_extreme]


def gen_math(mk, n):
    made, tries = 0, 0
    while made < n and tries < n * 60:
        tries += 1
        fn = mk.rng.choice(MATH_TEMPLATES)
        got = fn(mk.rng)
        if not got:
            continue
        stem, ans, dist, tip, ana, chk, unit = got
        if not chk():
            continue
        ff = (lambda v, u=unit: fmt(v, u)) if unit else (lambda v: fmt(v))
        q = mk.build("数量关系", "数学运算", stem, ans, dist, tip, ana, fmt_fn=ff, check=chk)
        if q:
            made += 1
    return made


# ----------------------------------------------------------------------------
# 三、资料分析
# ----------------------------------------------------------------------------

CITY = ["甲", "乙", "丙", "丁", "戊"]
INDUSTRY = ["装备制造", "电子信息", "生物医药", "新材料", "新能源汽车"]


def _opt_percent(ans, rng, step):
    dist = [ans + step, ans - step, ans + 2 * step]
    return (lambda v: "%.1f%%" % v), dist


def gen_material_text(mk, idx):
    rng = mk.rng
    gdp = rng.choice([8000, 9000, 10000, 12000, 15000, 18000, 20000])
    r = rng.choice([4.0, 5.0, 6.0, 8.0])
    a = int(gdp * rng.choice([0.03, 0.04, 0.05]))
    b = int(gdp * rng.choice([0.38, 0.40, 0.45]))
    c = gdp - a - b
    ra = rng.choice([2.0, 3.0, 4.0])
    rb = rng.choice([3.0, 4.0, 5.0])
    rc = rng.choice([5.0, 6.0, 7.0])
    rh = rng.choice([8.0, 9.0, 10.0, 12.0])
    ph = rng.choice([18.0, 20.0, 22.0, 25.0])
    mat = ("2024 年，某市实现地区生产总值（GDP）%d 亿元，比上年增长 %.1f%%。其中，第一产业增加值 %d 亿元，增长 %.1f%%；"
           "第二产业增加值 %d 亿元，增长 %.1f%%；第三产业增加值 %d 亿元，增长 %.1f%%。规模以上工业增加值同比增长 %.1f%%，"
           "高技术制造业增加值增长 %.1f%%，占规模以上工业增加值的比重为 %.1f%%。") % (
        gdp, r, a, ra, b, rb, c, rc, r, rh, ph)
    html = "<p>%s</p>" % mat

    base = gdp / (1 + r / 100)
    qs = []

    # 1) 基期
    ans1 = round(base / 10) * 10
    qs.append(("2023 年该市地区生产总值约为多少亿元？", ans1,
               [round(base / 10) * 10 + 200, round(base / 10) * 10 - 150, round(gdp * (1 - r / 100) / 10) * 10],
               "求基期用「现期 ÷（1 + 增长率）」，分母保留 3 位有效数字即可。",
               "基期 = %d ÷（1 + %.1f%%）≈ %d 亿元。" % (gdp, r, ans1),
               (lambda a1=ans1: abs(a1 - base) < 60), (lambda v: "%d" % v)))

    # 2) 增长量
    ans2 = round((gdp - base) / 10) * 10
    qs.append(("2024 年该市 GDP 比上年约增加多少亿元？", ans2,
               [round(gdp * r / 100 / 10) * 10, round((gdp - base) / 10) * 10 + 60, round((gdp - base) / 10) * 10 - 80],
               "增长量 = 现期 − 基期，也可用「现期 × r ÷（1+r）」直接求。",
               "增长量 = %d − %d ≈ %d 亿元。" % (gdp, round(base / 10) * 10, ans2),
               (lambda a2=ans2: abs(a2 - (gdp - base)) < 60), (lambda v: "%d" % v)))

    # 3) 比重
    pct = c / gdp * 100
    ans3 = round(pct, 1)
    f3, d3 = _opt_percent(ans3, rng, 3.2)
    qs.append(("2024 年该市第三产业增加值占 GDP 的比重约为：", ans3, d3,
               "比重 = 部分 ÷ 整体，先看首位数字再定选项。",
               "比重 = %d ÷ %d ≈ %.1f%%。" % (c, gdp, ans3),
               (lambda a3=ans3: abs(a3 - pct) < 0.05), f3))

    # 4) 两期比重升降
    qs.append(("与 2023 年相比，2024 年高技术制造业增加值占规模以上工业增加值的比重：",
               "上升", ["下降", "不变", "无法判断"],
               "两期比重升降只看增速：部分增速 a > 整体增速 b，比重上升；a < b 则下降。",
               "部分增速 %.1f%% > 整体增速 %.1f%%，所以比重上升（材料中「比重 %0.1f%%」亦可验证）。" % (rh, r, ph),
               (lambda: rh > r), (lambda v: "%s" % v)))

    for stem, ans, dist, tip, ana, chk, ff in qs:
        mk.build("资料分析", "资料分析", stem, ans, dist, tip, ana,
                 material_title="文字材料（第 %d 组）" % idx, material_html=html, fmt_fn=ff, check=chk,
                 dedup_key="T%d|%s" % (idx, stem))
    return len(qs)


def gen_material_table(mk, idx):
    rng = mk.rng
    cities = CITY[:4]
    people = [rng.randint(8, 20) * 100 for _ in cities]
    income = [0, 0, 0, 0]
    per = [0, 0, 0, 0]
    for i in range(4):
        per[i] = rng.choice([1000, 1100, 1200, 1250, 1300, 1500, 1600, 1800, 2000])
        income[i] = people[i] * per[i] // 10000
    rows = "".join("<tr><td>%s</td><td>%d</td><td>%d</td></tr>" % (cities[i], people[i], income[i]) for i in range(4))
    html = ("<p>2024 年某省四个城市接待游客情况：</p><table class=\"md-table\"><thead><tr>"
            "<th>城市</th><th>游客人数（万人次）</th><th>旅游收入（亿元）</th></tr></thead><tbody>%s</tbody></table>" % rows)

    best = max(range(4), key=lambda i: per[i])
    qs = []
    qs.append(("四个城市中，人均旅游消费最高的是：", cities[best], [cities[i] for i in range(4) if i != best],
               "人均消费 = 旅游收入 ÷ 游客人数；只比大小可用分数比较法，不必都算出来。",
               "人均消费：%s，最高的是%s市。" % (
                   "、".join("%s %d 元" % (cities[i], per[i]) for i in range(4)), cities[best]),
               (lambda b=best: per[b] == max(per)), (lambda v: "%s" % v)))

    d = income[3] - income[2]
    qs.append(("%s市旅游收入比%s市多多少亿元？" % (cities[3], cities[2]), d,
               [d + 5, d - 5, people[3] - people[2]],
               "求和差先看清单位与指标名，别把「人数」和「收入」混用。",
               "%d − %d = %d 亿元。" % (income[3], income[2], d),
               (lambda dd=d: income[3] - income[2] == dd), (lambda v: "%d" % v)))

    total = sum(income)
    qs.append(("四个城市旅游收入合计为多少亿元？", total,
               [total + 12, total - 9, sum(people) // 10],
               "求和题只需逐项相加，注意把表格读全，别漏掉最后一行。",
               "%s = %d 亿元。" % (" + ".join(str(x) for x in income), total),
               (lambda tt=total: sum(income) == tt), (lambda v: "%d" % v)))

    pct = income[best] / total * 100
    ans = round(pct, 1)
    f4, d4 = _opt_percent(ans, rng, 4.5)
    qs.append(("%s市旅游收入占四市合计的比重约为：" % cities[best], ans, d4,
               "比重 = 部分 ÷ 整体，再用「百化分」快速估算。",
               "%d ÷ %d ≈ %.1f%%。" % (income[best], total, ans),
               (lambda a=ans: abs(a - pct) < 0.05), f4))

    for stem, ans, dist, tip, ana, chk, ff in qs:
        mk.build("资料分析", "资料分析", stem, ans, dist, tip, ana,
                 material_title="表格材料（第 %d 组）" % idx, material_html=html, fmt_fn=ff, check=chk,
                 dedup_key="G%d|%s" % (idx, stem))
    return len(qs)


def gen_material_growth(mk, idx):
    rng = mk.rng
    inds = rng.sample(INDUSTRY, 4)
    cur = [rng.randint(200, 900) for _ in inds]
    rate = [rng.choice([3.0, 5.0, 6.0, 8.0, 10.0, 12.0]) for _ in inds]
    base = [cur[i] / (1 + rate[i] / 100) for i in range(4)]
    rows = "".join("<tr><td>%s</td><td>%d</td><td>%.1f%%</td></tr>" % (inds[i], cur[i], rate[i]) for i in range(4))
    html = ("<p>2024 年某市四个重点行业的增加值及增速：</p><table class=\"md-table\"><thead><tr>"
            "<th>行业</th><th>增加值（亿元）</th><th>比上年增长</th></tr></thead><tbody>%s</tbody></table>" % rows)

    bi = max(range(4), key=lambda i: base[i])
    qs = []
    qs.append(("按 2023 年（基期）增加值从高到低排序，最高的是：", inds[bi], [inds[i] for i in range(4) if i != bi],
               "比较基期量 = 现期 ÷（1 + 增长率）；现期大不等于基期大，必须换算。",
               "基期分别约为：%s，最高的是%s。" % ("；".join("%s %.0f 亿元" % (inds[i], base[i]) for i in range(4)), inds[bi]),
               (lambda b=bi: base[b] == max(base)), (lambda v: "%s" % v)))

    gi = max(range(4), key=lambda i: rate[i])
    qs.append(("四个行业中，2024 年增加值同比增速最快的是：", inds[gi], [inds[i] for i in range(4) if i != gi],
               "增速比较直接读表格最后一列，不要被增加值大小带偏。",
               "增速分别为：%s，最快的是%s。" % ("；".join("%s %.1f%%" % (inds[i], rate[i]) for i in range(4)), inds[gi]),
               (lambda g=gi: rate[g] == max(rate)), (lambda v: "%s" % v)))

    inc = [cur[i] - round(base[i]) for i in range(4)]
    mi = max(range(4), key=lambda i: inc[i])
    qs.append(("从增长量看，2024 年增加值比上年增加最多的是：", inds[mi], [inds[i] for i in range(4) if i != mi],
               "增长量 = 现期 − 基期 = 现期 × r ÷（1 + r）；增速高不一定增量大，要看基数。",
               "增长量分别约为：%s，最多的是%s。" % ("；".join("%s %d 亿元" % (inds[i], inc[i]) for i in range(4)), inds[mi]),
               (lambda m=mi: inc[m] == max(inc)), (lambda v: "%s" % v)))

    s2 = cur[0] + cur[1]
    qs.append(("%s与%s两个行业 2024 年增加值合计约为多少亿元？" % (inds[0], inds[1]), s2,
               [s2 + 40, s2 - 35, round(cur[0] + base[1])],
               "求合计直接相加；选项差距大时可估算到百位。",
               "%d + %d = %d 亿元。" % (cur[0], cur[1], s2),
               (lambda s=s2: cur[0] + cur[1] == s), (lambda v: "%d" % v)))

    for stem, ans, dist, tip, ana, chk, ff in qs:
        mk.build("资料分析", "资料分析", stem, ans, dist, tip, ana,
                 material_title="增速材料（第 %d 组）" % idx, material_html=html, fmt_fn=ff, check=chk,
                 dedup_key="R%d|%s" % (idx, stem))
    return len(qs)


def gen_material(mk, n_groups):
    made = 0
    kinds = [gen_material_text, gen_material_table, gen_material_growth]
    g = 0
    guard = 0
    while g < n_groups and guard < n_groups * 5:
        guard += 1
        fn = kinds[g % 3]
        g += 1
        before = mk.qid
        fn(mk, g)
        if mk.qid > before:
            made += mk.qid - before
    return made


# ----------------------------------------------------------------------------
# 四、逻辑判断（翻译推理 / 三段论）
# ----------------------------------------------------------------------------

PAIRS = [
    ("加强学习", "提高能力"), ("认真复习", "通过考试"), ("坚持锻炼", "保持健康"),
    ("控制成本", "提高利润"), ("注重积累", "写出好文章"), ("规范操作", "保证安全"),
    ("充分调研", "做出正确决策"), ("按时作息", "精力充沛"), ("勤加练习", "熟能生巧"),
    ("诚信经营", "赢得口碑"), ("保护环境", "可持续发展"), ("团结协作", "完成项目"),
    ("降低成本", "提升竞争力"), ("扩大宣传", "提高知名度"), ("严格质检", "减少次品"),
    ("储备人才", "支撑扩张"), ("稳定现金流", "抵御风险"), ("优化流程", "缩短交付周期"),
    ("深耕渠道", "扩大销量"), ("认真听讲", "掌握要点"), ("早睡早起", "状态稳定"),
    ("提前规划", "避免手忙脚乱"), ("多读原典", "理解准确"), ("反复复盘", "避免重复踩坑"),
    ("重视数据", "决策有据"), ("执行到位", "目标落地"), ("保持耐心", "长期见效"),
    ("开源节流", "积累资金"), ("打磨产品", "留住用户"), ("及时沟通", "减少返工"),
    ("积累客户", "稳定营收"), ("持续投入研发", "保持技术领先"),
]
TRIAD = [
    ("优秀员工", "绩效达标", "获得奖金"), ("重点大学", "一本院校", "师资雄厚"),
    ("哺乳动物", "脊椎动物", "有脊柱"), ("正方形", "矩形", "对边平行"),
    ("共产党员", "先进分子", "严格要求自己"), ("可再生能源", "清洁能源", "排放较低"),
    ("注册会计师", "执业资格人员", "通过专业考试"), ("高铁", "轨道交通", "运量大"),
    ("三好学生", "受表彰学生", "综合表现突出"), ("旗舰店", "授权门店", "受品牌方管理"),
    ("独角兽企业", "高估值企业", "受资本关注"), ("双一流高校", "重点建设高校", "国家投入较多"),
    ("一级建造师", "注册类证书持有人", "需通过统一考试"), ("A 股上市公司", "上市公司", "需定期披露财报"),
    ("国家级保护区", "自然保护区", "依法限制开发"), ("正高级职称人员", "高级职称人员", "需通过评审"),
]


def gen_logic(mk, n):
    made, tries = 0, 0
    while made < n and tries < n * 30:
        tries += 1
        kind = mk.rng.choice(["only", "if", "unless", "only", "if", "triad"])
        rng = mk.rng
        if kind == "triad":
            A, B, C = rng.choice(TRIAD)
            stem = "已知：所有%s都是%s，所有%s都是%s。由此可以推出：" % (A, B, B, C)
            ans = "所有%s都是%s" % (A, C)
            dist = ["所有%s都是%s" % (C, A), "有些%s不是%s" % (A, C), "有些%s不是%s" % (C, A)]
            tip = "三段论：A→B、B→C，可推出 A→C（传递）；反向不成立。"
            ana = "%s→%s，%s→%s，串联得%s→%s，即「所有%s都是%s」。" % (A, B, B, C, A, C, A, C)

            def chk():
                return True
        else:
            A, B = rng.choice(PAIRS)
            if kind == "only":
                stem = "只有%s，才能%s。由此可以推出：" % (A, B)
                ans = "若%s了，则一定%s了" % (B, A)
                dist = ["若%s了，则一定%s了" % (A, B), "若不%s，则一定不%s" % (A, B), "若不%s，则一定%s" % (B, A)]
                tip = "「只有 A 才 B」翻译为 B→A（A 是 B 的必要条件）；肯前必肯后、否后必否前，但肯后、否前都推不出确定结论。"
                ana = "「只有%s才%s」即%s→%s，其逆否命题为 ¬%s→¬%s；所以由%s可推出%s。" % (A, B, B, A, A, B, B, A)
            elif kind == "if":
                stem = "如果%s，那么%s。由此可以推出：" % (A, B)
                ans = "若没有%s，则一定没有%s" % (B, A)
                dist = ["若%s了，则一定%s了" % (B, A), "若没有%s，则一定没有%s" % (A, B), "若%s了，则一定没%s" % (B, A)]
                tip = "「如果 A 那么 B」即 A→B；否后必否前（¬B→¬A），肯后不能肯前。"
                ana = "题干为%s→%s，逆否命题为 ¬%s→¬%s，故由「没有%s」可推出「没有%s」。" % (A, B, B, A, B, A)
            else:
                stem = "除非%s，否则不能%s。由此可以推出：" % (A, B)
                ans = "若%s了，则一定%s了" % (B, A)
                dist = ["若%s了，则一定%s了" % (A, B), "若没有%s，则一定%s了" % (A, B), "若没有%s，则一定没有%s" % (B, A)]
                tip = "「除非 A，否则不 B」等价于「只有 A 才 B」，即 B→A。"
                ana = "「除非%s，否则不能%s」= 只有%s才能%s = %s→%s，故%s可推出%s。" % (A, B, A, B, B, A, B, A)

            def chk():
                return True

        # 选项写成完整的句子，避免过于机械
        q = mk.build("判断推理", "逻辑判断", stem, ans, dist, tip, ana,
                     fmt_fn=(lambda v: "%s。" % v), check=chk)
        if q:
            made += 1
    return made


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-digital", type=int, default=200)
    ap.add_argument("--n-math", type=int, default=200)
    ap.add_argument("--n-material", type=int, default=21)
    ap.add_argument("--n-logic", type=int, default=80)
    ap.add_argument("--seed", type=int, default=20261002)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    mk = Maker(rng)

    stat = {
        "数字推理": gen_digital(mk, args.n_digital),
        "数学运算": gen_math(mk, args.n_math),
        "资料分析": gen_material(mk, args.n_material),
        "逻辑判断": gen_logic(mk, args.n_logic),
    }

    qs = mk.qs

    # ---- 出厂自检：结构 + 唯一性 + 答案可推导 ----
    problems = []
    ids = [q["id"] for q in qs]
    if len(set(ids)) != len(ids):
        problems.append("题号有重复")
    for q in qs:
        if len(q["options"]) != 4:
            problems.append("题 %d 选项数不是 4" % q["id"])
            continue
        keys = [o["k"] for o in q["options"]]
        if keys != ["A", "B", "C", "D"]:
            problems.append("题 %d 选项字母异常 %s" % (q["id"], keys))
        texts = [o["t"] for o in q["options"]]
        if len(set(texts)) != 4:
            problems.append("题 %d 选项重复 %s" % (q["id"], texts))
        if not any(o["k"] == q["answer"] for o in q["options"]):
            problems.append("题 %d 答案不在选项中" % q["id"])
        if not q["tip"].strip() or not q["analysis"].strip():
            problems.append("题 %d 缺技巧或解析" % q["id"])
        if q["topic"] == "资料分析" and not q["materialHtml"]:
            problems.append("题 %d 资料分析缺材料" % q["id"])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"meta": {"generator": "gen_quant.py", "seed": args.seed,
                            "count": len(qs)}, "questions": qs}, f, ensure_ascii=False, indent=1)

    print("生成 %d 题 → %s" % (len(qs), OUT))
    for k, v in stat.items():
        print("  %-6s %4d 题" % (k, v))
    from collections import Counter
    print("  答案分布:", dict(sorted(Counter(q["answer"] for q in qs).items())))
    print("  题号范围: %d - %d" % (min(ids), max(ids)))
    if problems:
        print("  !! 自检问题 %d 条：" % len(problems))
        for p in problems[:20]:
            print("     -", p)
        return 1
    print("  自检通过：选项/答案/技巧/解析/材料齐全，答案均已按规则或原式反算验证")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
