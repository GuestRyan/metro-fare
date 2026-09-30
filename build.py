# -*- coding: utf-8 -*-
"""构建《全国城市轨道交通票价对比》交付物：HTML / CSV / XLSX

说明（对照 8 项修改）：
  #1 嘉兴已自 data.json 删除
  #2 天津按站数票制（boundaries 存可乘站数，unit="站"）
  #3 价格区间可自定义（HTML 交互）；CSV/XLSX 增加「最高票价(元)」「最高票价可乘里程(km)」
     两列，按各城市最高票价推算与展示
  #4 计价规则完全一致的城市合并显示改为 HTML 中的「合并显示」开关（默认不合并）；
     CSV/XLSX 为静态文件，保持逐城分行（非强制合并）
  #5 文末「数据整理」板块已在 template.html 删除
  #6 文首仅保留城市总数与统计日期（template.html banner 仅剩 chips）
  #7 规则要点列宽动态自适应（HTML 去掉固定 min/max-width；XLSX 按内容自动列宽）
  #8 HTML 取消按地区分组展示（已移除 region 排序项）
  #9 新增各城市「最高票价」数据字段 max_fare（联网逐一核实）：高于该档的票价在
  #     线网中实际不存在，HTML 主表格统一显示「–」；该数值在 HTML 主表最右新增
  #     「最高票价」列列示，并同步写入 CSV/XLSX 的「最高票价(元)」「最高票价可乘里程(km)」两列。
"""
import json, csv, os, sys, unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
FARES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
# 政策性封顶：官方把最高票价写成「封顶优惠/上限」（便民让利），
# 而非按网络最远 OD 算出的自然最高。经联网核实仅沈阳（7元）、天津（5元）。
CAP_CITIES = {"沈阳", "天津"}

with open(os.path.join(BASE, "data.json"), encoding="utf-8") as f:
    data = json.load(f)
cities = data["cities"]
META = data["meta"]

# ---------------- helpers ----------------
def bnd(c, f):
    return c["boundaries"].get(str(f))

def city_max_fare(c):
    """该城市线网实际最高票价档（数据字段 max_fare；缺省时按已定义档位回退推断）"""
    m = c.get("max_fare")
    if m is not None:
        return m
    m = c["min_fare"]
    for f in range(c["min_fare"], 11):
        if bnd(c, f) is not None:
            m = f
        else:
            break
    return m

def fare_km(c, f):
    """f 元对应的可乘里程；高于该城市线网最高票价的档位不存在，返回 None"""
    if f < c["min_fare"] or f > city_max_fare(c):
        return None
    v = bnd(c, f)
    if v is not None:
        return v
    if f > 10 and c.get("beyond") and not is_capped(c):
        for k in range(10, c["min_fare"] - 1, -1):
            vv = bnd(c, k)
            if vv is not None:
                return vv + (f - k) * c["beyond"]
    return None

def is_mile(c):
    return bnd(c, c["min_fare"]) is not None

def is_capped(c):
    """线网票价封顶：最高票价不超过 10 元档"""
    return city_max_fare(c) <= 10

def max_span(c):
    top = min(city_max_fare(c), 10)
    vals = [(f, bnd(c, f)) for f in range(c["min_fare"], top + 1)]
    vals = [(f, v) for f, v in vals if v is not None]
    sp = 0
    for i in range(len(vals) - 1):
        sp = max(sp, vals[i + 1][1] - vals[i][1])
    if c.get("beyond") and city_max_fare(c) > 10:
        sp = max(sp, c["beyond"])
    return sp if vals else None

def cost10(c):
    v = fare_km(c, 10)
    return round(10.0 / v, 4) if v else None

def city_max_km(c):
    return fare_km(c, city_max_fare(c))

def text_w(s):
    """估算单元格文本在 Excel 中的大致宽度（CJK 计 2，其余计 1）"""
    s = "" if s is None else str(s)
    w = 0.0
    for ch in s:
        w += 2.0 if unicodedata.east_asian_width(ch) in ("W", "F") else 1.0
    return w

def style_header(ws, ncol, row=1):
    for i in range(1, ncol + 1):
        cell = ws.cell(row=row, column=i)
        cell.font = HFONT
        cell.fill = HFILL
        cell.alignment = CENTER
        cell.border = BD

# ---------------- 1. HTML ----------------
tpl = open(os.path.join(BASE, "template.html"), encoding="utf-8").read()
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
html_path = os.path.join(BASE, "地铁票价对比.html")
with open(html_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(tpl.replace("__DATA__", payload))
print("HTML ->", html_path, os.path.getsize(html_path), "bytes")

# ---------------- 2. CSV ----------------
csv_path = os.path.join(BASE, "地铁票价对比.csv")
head = ["城市", "地区", "起步价(元)"] + [f"{f}元可乘(km)" for f in FARES] \
       + ["最高票价(元)", "政策性封顶", "最高票价可乘里程(km)", "10元单位成本(元/km)", "10元可乘里程(km)",
          "最大阶梯跨度(km)", "计价规则", "备注/排除项", "规则生效", "来源类型", "置信度", "来源链接"]
with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(head)
    for c in cities:
        mf = city_max_fare(c)
        row = [c["city"], c["region"], c["min_fare"]]
        row += [fare_km(c, f) if fare_km(c, f) is not None else "" for f in FARES]
        row += [mf, "是" if c["city"] in CAP_CITIES else "",
                city_max_km(c) or "", cost10(c) or "", fare_km(c, 10) or "", max_span(c) or "",
                c["fare_rule"], c["note"], c["as_of"], c["srcType"],
                c["confidence"], " ; ".join(c["sources"])]
        w.writerow(row)
print("CSV  ->", csv_path)

# ---------------- 3. XLSX ----------------
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("openpyxl 不可用，跳过 xlsx")
    sys.exit(0)

wb = Workbook()
ORANGE = "E2701A"
DARK = "A83C10"
LIGHT = "FDF6EF"
GREEN = "0F9D58"
thin = Side(style="thin", color="ECE2D6")
BD = Border(left=thin, right=thin, top=thin, bottom=thin)
HFONT = Font(bold=True, color="FFFFFF", size=11)
HFILL = PatternFill("solid", fgColor=ORANGE)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

def autofit(ws, cap=70):
    widths = {}
    for row in ws.iter_rows():
        for cell in row:
            if cell.value is None:
                continue
            widths[cell.column] = max(widths.get(cell.column, 0), text_w(cell.value))
    for col, w in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = min(w + 2, cap)

# --- Sheet 1: 票价-里程矩阵（逐城分行，不强制合并；列宽按内容自适应） ---
ws = wb.active
ws.title = "票价-里程矩阵"
head1 = ["城市", "地区", "起步价(元)"] + [f"{f}元" for f in FARES] \
        + ["最高票价(元)", "政策性封顶", "最高票价可乘里程(km)", "计价规则", "备注 / 排除项"]
ws.append(head1)
for c in cities:
    mf = city_max_fare(c)
    ws.append([c["city"], c["region"], c["min_fare"]]
              + [(fare_km(c, f) if fare_km(c, f) is not None else "—") for f in FARES]
              + [mf, "是" if c["city"] in CAP_CITIES else "", city_max_km(c) or "—", c["fare_rule"], c["note"]])
style_header(ws, len(head1))
for r in range(2, ws.max_row + 1):
    for i in range(1, len(head1) + 1):
        cell = ws.cell(row=r, column=i)
        cell.border = BD
        cell.alignment = CENTER if i <= 15 else LEFT
        if i == 1:
            # 政策性封顶城市（沈阳、天津）用紫色字体标记
            cell.font = Font(bold=True, color="6A35C8") if cell.value in CAP_CITIES else Font(bold=True)
        if 4 <= i <= 3 + len(FARES) and cell.value == "—":
            cell.font = Font(color="C0B5A8")
        # 起步价档高亮
        if i == 3 + ws.cell(row=r, column=3).value:
            cell.fill = PatternFill("solid", fgColor="FFF1E0")
            cell.font = Font(bold=True, color=DARK)
ws.freeze_panes = "D2"
autofit(ws)

# --- Sheet 2: 统计与排名 ---
ws2 = wb.create_sheet("统计与排名")
head2 = ["排名", "城市", "最高票价(元)", "最高票价可乘里程(km)", "10元可乘里程(km)",
         "10元单位成本(元/km)", "起步价(元)", "起步可乘里程(km)", "最大阶梯跨度(km)",
         "最高票价≤10元", "备注"]
ws2.append(head2)
ranked = sorted([c for c in cities if fare_km(c, 10)], key=lambda c: -fare_km(c, 10))
for i, c in enumerate(ranked, 1):
    mf = city_max_fare(c)
    ws2.append([i, c["city"], mf, city_max_km(c), fare_km(c, 10), cost10(c), c["min_fare"],
                fare_km(c, c["min_fare"]), max_span(c), "是" if is_capped(c) else "否", c["note"]])
style_header(ws2, len(head2))
for r in range(2, ws2.max_row + 1):
    for i in range(1, len(head2) + 1):
        cell = ws2.cell(row=r, column=i)
        cell.border = BD
        cell.alignment = LEFT if i == 11 else CENTER
        if i == 4:
            cell.number_format = "0.000"
        if i == 2:
            cell.font = Font(bold=True)
    ws2.cell(row=r, column=3).font = Font(bold=True, color=DARK)
ws2.freeze_panes = "A2"
autofit(ws2)

# 附加：线网最高票价低于 10 元、无 10 元档的城市
ws2.append([])
ws2.append(["线网最高票价低于 10 元、无 10 元档的城市（不参与 10 元口径排名）"])
ws2.cell(row=ws2.max_row, column=1).font = Font(bold=True, color=DARK)
for c in cities:
    if not fare_km(c, 10):
        ws2.append(["—", c["city"], city_max_fare(c), city_max_km(c), "—", "—", c["min_fare"],
                    fare_km(c, c["min_fare"]), max_span(c), "是" if is_capped(c) else "否",
                    c["fare_rule"] + (" | " + c["note"] if c["note"] else "")])

# --- Sheet 3: 逐城规则与来源 ---
ws3 = wb.create_sheet("逐城规则与来源")
head3 = ["城市", "口径范围", "计价规则（官方概括）", "备注 / 排除项", "规则生效", "来源类型", "置信度", "来源链接"]
ws3.append(head3)
order = ["官网", "官网(同网)", "政府", "发改委", "媒体"]
for c in sorted(cities, key=lambda c: (order.index(c["srcType"]), c["city"])):
    ws3.append([c["city"], c["scope"], c["fare_rule"], c["note"], c["as_of"],
                c["srcType"], c["confidence"], "\n".join(c["sources"])])
style_header(ws3, len(head3))
for r in range(2, ws3.max_row + 1):
    for i in range(1, len(head3) + 1):
        cell = ws3.cell(row=r, column=i)
        cell.border = BD
        cell.alignment = LEFT
        if i in (6, 7):
            cell.alignment = CENTER
        if i == 1:
            cell.font = Font(bold=True)
ws3.freeze_panes = "B2"
autofit(ws3)

xlsx_path = os.path.join(BASE, "地铁票价对比.xlsx")
wb.save(xlsx_path)
print("XLSX ->", xlsx_path)
print("城市数 =", len(cities), "| 按里程计价 =", sum(1 for c in cities if is_mile(c)))
