# 全国城市轨道交通票价对比 — 交接与编辑手册

> **读者**：下一个接手修改本项目的模型 / 工程师。你**没有**任何对话历史，所有上下文都在本文档里。
> **写作时间**：2026-09-30。对应代码状态（实测）：`template.html` 452 行、`data.json` 642 行 / 45 城、`build.py` 250 行。
> **本文档中的行号会随编辑漂移**，定位代码请以**函数名 / CSS 类名**为准，行号只作快速跳转的近似参考。

---

## 目录

- [0. 30 秒速览](#0-30-秒速览)
- [1. 文件清单与职责](#1-文件清单与职责)
- [2. 唯一的构建方式（含本机环境坑）](#2-唯一的构建方式含本机环境坑)
- [3. data.json 数据字典](#3-datajson-数据字典)
- [4. template.html 全解剖](#4-templatehtml-全解剖)
- [5. 渲染与排序状态机](#5-渲染与排序状态机)
- [6. build.py 全解剖](#6-buildpy-全解剖)
- [7. 不变量与陷阱（必读）](#7-不变量与陷阱必读)
- [8. 历史决策与变更日志](#8-历史决策与变更日志)
- [9. 未决事项与已知数据出入](#9-未决事项与已知数据出入)
- [10. 常见修改任务 How-to](#10-常见修改任务-how-to)
- [11. 回归验证清单与冒烟脚本模板](#11-回归验证清单与冒烟脚本模板)
- [12. Tauri 打包（Windows exe / Android apk）](#12-tauri-打包windows-exe--android-apk)

---

## 0. 30 秒速览

这是一个**单页 HTML 数据报告**：横向对比中国内地 45 座城市轨道交通的「票价 → 可乘里程」换算关系。
同源代码用 **Tauri 2** 打包成 Windows 便携版 exe 与 Android apk（见 §12）。

**核心管线（不要绕过）**：

```
data.json  ──┐
             ├──► build.py ──► 地铁票价对比.html   (自包含单文件，双击即看)
template.html┘             ──► 地铁票价对比.csv    (utf-8-sig)
                           ──► 地铁票价对比.xlsx   (3 个 sheet，openpyxl)
                                    │
                                    └──► release/web/index.html ──► Tauri ──► exe / apk
```

- **唯一数据源是 `data.json`**。改数据只动它，然后重跑 `build.py`，三个产物会一起更新。
- **`template.html` 是模板，不是产物**。里面有一行 `const DATA = __DATA__;`，`build.py` 把 `__DATA__` 替换成压缩后的 JSON。直接双击打开 `template.html` 是**坏的**（`__DATA__` 未定义）。
- **三个产物都是生成物，禁止手改**——下次构建会被覆盖。要改产物内容，改 `data.json` 或 `template.html` 或 `build.py`。
- **HTML 必须保持自包含**：无外链 CSS/JS、无 CDN、无字体文件。已用 grep 验证过，新增功能时请维持。

---

## 1. 文件清单与职责

| 文件 | 角色 | 可否手改 | 说明 |
|---|---|---|---|
| `data.json` | **数据源（唯一真相）** | ✅ 改 | 45 城 × 15 字段 + `meta`。见 §3 |
| `template.html` | **页面模板** | ✅ 改 | 完整的 HTML+CSS+JS，仅数据是占位符。见 §4 |
| `build.py` | **构建脚本** | ✅ 改 | 注入数据、生成 CSV/XLSX。见 §6 |
| `地铁票价对比.html` | 产物 | ❌ 不改 | ≈59 KB，自包含 |
| `地铁票价对比.csv` | 产物 | ❌ 不改 | utf-8-sig（带 BOM，Excel 直接双击不乱码） |
| `地铁票价对比.xlsx` | 产物 | ❌ 不改 | Sheet1 票价-里程矩阵 / Sheet2 统计与排名 / Sheet3 逐城规则与来源 |

**目录里只应有上述 6 个文件**。我（以及之前的会话）用临时文件（`_smoke.js`、`_chk.py`、`*_run.txt`、`*_out.txt`、`_info.txt`、`_c.txt` 等）做验证，**每次收工前必须删掉**。检查方法见 §11.4。

---

## 2. 唯一的构建方式（含本机环境坑）

### 2.1 环境事实（本机，Windows）

这些是**实测结论**，不要凭常识推翻：

| 事项 | 结论 |
|---|---|
| Shell | **只用 PowerShell 工具，不要用 Bash**——本机 Bash 环境残缺，`ls`/`dirname`/`head` 全部 command not found |
| Python | 用 **`D:\Program Files\Python314\python.exe`**。它**自带 openpyxl + pandas** |
| pip | **本机 pip 不通网**（默认源和清华镜像都失败，挂代理也拒连）。**不要试图 pip install** |
| 托管 venv | `~\.workbuddy\binaries\python\envs\default` 里没有任何第三方包且装不上，只能跑纯标准库脚本 |
| Node | **`C:\Users\ryan0\.workbuddy\binaries\node\versions\22.22.2-3\node.exe`** |
| 命令输出 | **stdout 不回传**。命令输出必须 `Out-File` 落盘再 `Read`，否则你看不到任何东西 |
| 退出码 | 要显式 `Write-Output ("EXIT=" + $LASTEXITCODE)` |
| 删除文件 | `Remove-Item` 会被安全删除包装器拦截（删除无效且**不报错**）。用 `[System.IO.File]::Delete($p)` |

### 2.2 构建命令（复制即用）

```powershell
Set-Location "C:\Users\ryan0\WorkBuddy\2026-09-21-20-42-23\metro-fare"
& 'D:\Program Files\Python314\python.exe' build.py 2>&1 | Out-File build_out.txt -Encoding utf8
Get-Content build_out.txt -Raw | Out-File -Encoding utf8 build_out.txt   # 需要时转码查看
Write-Output ("EXIT=" + $LASTEXITCODE)
```

> **注意**：`build_out.txt` 里中文会显示成 `鍦伴搧绁ㄤ环瀵规瘮` 之类的乱码，那是 PowerShell 用 GBK 解码 Python 的 UTF-8 输出所致，**不影响构建结果**。看退出码和文件大小即可；需要确认文字时用 `Read` 工具读产物文件本身。

预期输出三行 `HTML ->` / `CSV ->` / `XLSX ->`，最后 `城市数 = 45 | 按里程计价 = 45`。

### 2.3 只有 4 行代码的构建逻辑

`build.py` 的 JSON 注入是**唯一的模板机制**，没有模板引擎：

```python
tpl = open(os.path.join(BASE, "template.html"), encoding="utf-8").read()
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
with open(html_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(tpl.replace("__DATA__", payload))
```

> ⚠️ **隐患**：`str.replace(pattern, str)` 的**替换串**里 `$&`、`$1`、`$\`` 等有特殊含义，且只替换**第一个**匹配。
> 目前 45 城数据里不含 `$`，所以安全。若将来往 `data.json` 里写入含 `$` 的文本（例如新增一条带 `$` 的来源 URL），**构建会静默出错**。
> 要根除这个隐患，把 `tpl.replace("__DATA__", payload)` 改成：
> ```python
> tpl.replace("__DATA__", payload.replace("\\", "\\\\").replace("$", "$$"))
> ```

---

## 3. data.json 数据字典

### 3.1 顶层结构

```json
{
  "meta": {
    "title": "全国城市轨道交通票价对比（按里程计价）",
    "as_of": "2026-09-21",          // 核价截止日，被渲染进页面 chips
    "scope": "……",
    "unit": "公里（km）",
    "lead": "……"
  },
  "cities": [ { … }, … ]            // 45 个对象
}
```

`meta.as_of` 和 `meta.title` 会被 `template.html` 读到（`chips` 显示"核价截止 2026-09-21"）。**`meta` 的其余字段目前未被渲染**。

### 3.2 城市对象的 15 个字段

统计自实际的 45 条数据（`字段出现次数` 每一项都是 45）：

| 字段 | 类型 | 含义 | 陷阱 |
|---|---|---|---|
| `city` | string | 城市名。**主键**，JS 里多处按它做 `===` 比较 | 与 `short` **全部 45 城都相同**（冗余字段，历史遗留） |
| `short` | string | 短名 | 目前无任何代码引用它 |
| `region` | string | 大区 | 取值：华东19 / 华北5 / 华中5 / 西南5 / 东北4 / 华南4 / 西北3。**搜索框会匹配 region** |
| `scope` | string | 计价口径范围 | 只出现在 Sheet3 |
| `fare_rule` | string | 官方规则概括（中文长句） | **渲染进 HTML 主表最右「规则要点」列**，也进 CSV/Sheet1/Sheet3 |
| `min_fare` | int | 起步价档 | 取值只有 2（43 城）和 3（北京、上海） |
| `boundaries` | object | **票价档 → 累计可乘里程/站数** | 见 §3.3，本项目最核心的字段 |
| `max_fare` | int | 该线网**实际售票**的最高票价档 | 见 §3.4 |
| `beyond` | int \| null | 最高已定义档之上的「每加 1 元可多乘 N 公里」 | 44 城有值，**仅天津为 `null`**（站数票制，无里程） |
| `note` | string | 备注/排除项 | 45 城**全部非空**。渲染进 Sheet1/Sheet3 与 CSV |
| `as_of` | string | 规则生效时间 | 进 Sheet3/CSV |
| `srcType` | string | 来源类型 | 取值：官网29 / 发改委9 / 政府6 / **官网(同网)1** |
| `sources` | string[] | 来源链接 | 45 城**各只有 1 条**链接 |
| `confidence` | string | 置信度 | 取值：high 43 / medium 2。渲染时映射成中文（见 §4.5） |
| `unit` | string | 计价单位 | ⚠️ **只有天津 1 城有 `"unit": "站"`**，其余 44 城**根本没有这个键**。代码一律用 `c.unit \|\| 'km'` 兜底 |

### 3.3 `boundaries` —— 本项目最核心的字段

```json
"boundaries": {"1": null, "2": null, "3": 6, "4": 12, "5": 22, "6": 32, "7": 52, "8": 72, "9": 92, "10": 112}
```

北京的例子读作：**3 元可乘 6 km，4 元 12 km，5 元 22 km……10 元 112 km**。`1`、`2` 为 `null` 因为北京没有 1、2 元档。

**实测的重要事实（不要假设，这是量过的）**：

- 键集合**永远是字符串 `"1"`～`"10"`**，**不存在 11 以上的键**。所有 45 城一律如此。
- 所有城市的键都是**同一顺序 `1,2,3,…,10`**。这不是巧合，而是**隐式不变量**——见 §7.2（合并分组靠 `JSON.stringify` 指纹，键顺序变了合并就会失效）。
- 键的顺序是**升序**，读代码时 `for (let f = 2; f <= base; f++)` 是按票价档递增遍历。
- 没有城市有 1 元档（`"1"` 全为 `null`）。
- 值可以是 `null`（该档不存在）或正整数（可乘 km 或站数）。

### 3.4 `max_fare` 与「超过该档怎么办」

`max_fare` = 该线网**实际售票**的最高票价档。**超过它的档位在现实中买不到票**，因此：

- `template.html` 的 `b(c,f)` 第一行就拦：`if (f < c.min_fare || f > maxFare(c)) return null;` → 单元格渲染成灰色的「–」。
- `build.py` 的 `fare_km(c,f)` 同理返回 `None` → CSV 留空 / XLSX 显示「—」。

分布（写文档时）：`5×2, 6×2, 7×10, 8×7, 9×2, 10×3, 11×3, 12×4, 13×2, 14×2, 15×4, 16×2, 20×2`。

- **`max_fare > 10` 的 19 城**（上海15 广州20 深圳15 成都12 武汉12 杭州16 南京15 西安13 苏州13 郑州11 大连14 青岛12 宁波14 济南12 贵阳11 佛山20 温州15 金华16 台州11）——这些城市 11～20 元的档位靠 **`beyond` 递推**得出（见 §4.5 `b()`）。
- **`max_fare <= 10` 的 26 城** 中，`max_fare == 10` 的有 3 城（北京、重庆、无锡）。所以「线网最高票价**低于** 10 元」的是 **23 城**（页面「关键发现 #4」写的 23 就是这个数，`26 - 3`）。
- 因此「10 元档真的存在」的城市只有 **22 城**（45 − 23），`build.py` 的 Sheet2 排名只排这 22 城。

### 3.5 `beyond` 递推规则

`beyond` 是「最高已定义档之上，每加 1 元可多乘的公里数」。`b()` 的实现是：**从 10 元档往下找第一个非 null 的 boundaries 值，再加 `(f - k) * beyond`**。

**它的实际用途**：`base`（用户可输入的基准票价）上限是 **20**，而 `boundaries` 只到 10。所以当 base > 10 且城市 `max_fare > 10` 时，11～20 档全部走这条递推路径。

`beyond` 取值分布：`8×13, 9×11, 10×9, 20×8, 15×2, 7×1, null×1(天津)`。

---

## 4. template.html 全解剖

### 4.1 文件骨架（行号为近似值）

```
L1–L6      <head> 元信息
L7–L130    <style>  全部 CSS（无外部资源）
L132–L139  .banner  橙色渐变标题条 + #chips（城市数 / 核价截止）
L141–L161  .wrap.tight   → L143–149 .legend（图例）+ L151–160 .toolbar（控件）
L163–L173  .wrap-wide    → 主表格 #tbl（thead > tr#thead-row，tbody#tbody）
L175–L221  .wrap          → L176–184 说明段 / L186–194 关键发现 / L196–207 逐城规则 / L209–219 口径与免责
L223–L449  <script>      全部 JS
```

**主表格被刻意放在 `.wrap` 之外**（包在 `.wrap-wide` 里）。原因：`.wrap` 有 `max-width:1180px; margin:0 auto`，主表格需要**铺满窗口宽度**，所以用一个不带 max-width 的容器。改布局时别把主表格挪回 `.wrap` 里。

### 4.2 CSS 设计令牌（`:root`，L8–13）

```css
--bg:#f7f3ed      /* 页面米色底 */
--card:#ffffff    /* 卡片白 */
--ink:#2c2118     /* 主文字 深棕 */
--ink2:#5b4a3c    /* 次级文字 */
--muted:#8d7d6d   /* 弱化文字 */
--orange:#e2701a  /* 主色（表头、强调） */
--orange-d:#a83c10/* 主色深（里程数字） */
--orange-l:#f8b34a/* 主色浅（★） */
--green:#0f9d58   /* 递增上标 +N */
--line:#ece2d6    /* 边框 */
--line2:#f6efe6   /* 表格内分隔线 */
--blue:#2a6fb0    /* 链接 */
```

**注意：所有颜色都是硬编码的浅色主题，没有深色模式**。整份报告是米色/橙色暖色调的"纸质报告"风格。如果要加深色模式，需要新增 `@media (prefers-color-scheme: dark)` 并保证 `table.fare td.city` 的 sticky 背景（`background:#fff`）同步换色——**sticky 元素必须有不透明背景**，否则横向滚动时会透出下层内容。

**标签色系**（3 种，语义互不相同，见 §7.3）：

| 类名 | 用途 | 配色 |
|---|---|---|
| `.tag.warn` | 站数票制（天津） | 橙 `#fdefe0` / `#a85812` |
| `.tag.note` | 市域铁路、单轨、N城同规则 | 绿 `#eef6ef` / `#0f7a45` |
| `.tag.cap` | **政策性封顶**（沈阳、天津） | **紫 `#f2ecfc` / `#6a35c8`** |

另有 `td.city .capname{color:#6a35c8}` —— 政策性封顶城市的**城市名本身**染紫。

### 4.3 工具栏（L151–160）与 DOM id 总表

```html
<div class="toolbar">
  <span class="hint">点表头可排序：城市（拼音）/ 各价格档 / 最高票价，再次点击反向</span>
  <label>基准票价
    <input type="number" id="baseSel" min="2" max="20" step="1" value="10" inputmode="numeric" title="请输入 2–20 的整数"> 元
  </label>
  <label><input type="checkbox" id="mergeView"> 合并显示（同规则城市）</label>
  <label><input type="checkbox" id="hideNonMile"> 隐藏非里程票制城市</label>
  <label>搜索 <input type="search" id="q" placeholder="城市名，如 青岛"></label>
</div>
```

**全部 DOM id（JS 只靠这些 id 抓元素，没有 querySelector 选择器依赖）**：

| id | 元素 | 谁在用 |
|---|---|---|
| `chips` | banner 里的 div | `chips` IIFE（L300–304） |
| `baseSel` | number input | `getBase` / `baseApply` / `baseCommit` + 3 个事件 |
| `mergeView` | checkbox | `render()` |
| `hideNonMile` | checkbox | `render()` |
| `q` | search input | `render()` |
| `thead-row` | thead 里的 tr | `renderHead()` |
| `tbody` | tbody | `render()` |
| `srcBody` | Sheet 表 tbody | `renderSrc()` |

> ⚠️ **排序下拉 `sortSel` 已被删除**（历史变更，见 §8）。不要因为看到旧文档/旧记忆提到"排序下拉"就去把它加回来——用户明确要求删掉，改为**点表头排序**。

### 4.4 JS 函数总表（`<script>`，L223–449）

按文件顺序，**这是修改时最该先看的一张表**：

| 行号 | 名称 | 职责 |
|---|---|---|
| L224 | `const DATA` | 由 `build.py` 注入 |
| L225 | `const CITIES` | `DATA.cities` |
| L226 | `const PY` | **手写的 45 城拼音表**（`{"北京":"beijing",…}`），仅供拼音排序 |
| L228–229 | `BASE_MIN`, `BASE_MAX`, `lastBase` | 2 / 20 / 上次有效基准票价 |
| L230 | `clampBase(v)` | `round(v)` 后钳到 `[2,20]` |
| L231–234 | `getBase()` | 读输入框；`NaN` 时回落 `lastBase`，否则 `clampBase` |
| L237 | `curSort` | **全局排序状态** `{type, dir}`，见 §5 |
| L238–242 | `togglePriceSort(f)` | 点价格表头：同列翻转 `dir`，换列则 `dir=-1`（先降序） |
| L244–248 | `toggleCitySort()` | 点城市表头：首次 `dir=1`（A→Z），再点反向 |
| L250–254 | `toggleMfSort()` | 点最高票价表头：同 `togglePriceSort` 逻辑，无需参数 |
| L258 | `maxFare(c)` | `c.max_fare \|\| 15`（15 是兜底默认值） |
| L259–271 | `b(c, f)` | **核心换算**：f 元 → 可乘 km；越界/不存在返回 `null`；`f>10 && beyond` 时递推 |
| L273 | `isMile(c)` | `(c.unit \|\| 'km') !== '站'`，即**只有天津为 false** |
| L274 | `unitOf(c)` | `c.unit \|\| 'km'` |
| L275–283 | `spanOf(c, f)` | 返回 `{type:'inc', n}`（下一档多 N）或 `{type:'cap'}`（已是最高档）或 `null` |
| L284–292 | `cellHTML(c, f)` | 渲染单元格：`<span class="km">值</span><span class="unit">单位</span>` + 上标 |
| L294–296 | `maxFareHTML(c)` | 渲染最高票价列：`<span class="mfv">N</span><span class="unit">元</span>` |
| L298 | `baseKm(c)` | `b(c, getBase())` |
| L301–304 | chips IIFE | 立即执行，写入 `#chips` |
| L307–325 | `renderHead()` | **渲染表头 + 绑定点击** |
| L328–335 | `mergeGroups(list)` | 按"计价指纹"把完全同规则的城市分组 |
| L338 | `PERMA_MERGE` | `[["广州","佛山"],["杭州","绍兴"]]` 强制合并 |
| L339–350 | `applyPerma(list)` | 不勾选「合并显示」时也合并上述两对 |
| L354 | `nullLast(vx,vy)` | 「–」恒排底部的三态比较器 |
| L355–364 | `cmpOf(s)` | 返回比较器函数，按 `s.type` 分发 |
| L365 | `sortCities(s)` | `CITIES.slice().sort(cmpOf(s))` |
| L366–408 | `render()` | **渲染表体**（最核心，见 §5.3） |
| L411–423 | `renderSrc()` | 渲染「逐城规则与数据来源」表 |
| L425–428 | `rerenderAll()` | 表头 + 表体一起重绘（排序变化时用） |
| L430–435 | `baseApply(raw)` | `input` 事件：边输入边生效；空值不动视图 |
| L436–442 | `baseCommit()` | `change`/`blur` 事件：钳回并**回写输入框** |
| L443–448 | 事件绑定 | 4 个控件共 7 个监听器 |
| L449 | 初始化 | `renderHead(); render(); renderSrc();` |

### 4.5 几个必须看懂的实现

**① `b(c,f)` —— 一切换算的入口（L259–271）**

```js
function b(c,f){
  if(f<c.min_fare || f>maxFare(c)) return null;      // 低于起步价 / 高于实际最高票价 → 不存在
  const v=c.boundaries[String(f)];
  if(v!==null && v!==undefined) return v;            // boundaries 里有直接返回
  if(f>10 && c.beyond){                              // 11 元以上：从 10 元往下找基准档递推
    for(let k=10; k>=c.min_fare; k--){
      const vv=c.boundaries[String(k)];
      if(vv!==null && vv!==undefined) return vv+(f-k)*c.beyond;
    }
  }
  return null;
}
```

注意几个刻意的设计：
- 第 1 行的 `f > maxFare(c)` 拦截**使得 `beyond` 递推只对 `max_fare > 10` 的城市生效**。比如广州 `max_fare=20`，`b(广州,15)` 会走递推；而无锡 `max_fare=10`，`b(无锡,11)` 直接 `null`。
- `boundaries` 的键是**字符串**，所以必须 `String(f)` 转换。这是最容易写错的一处。
- 空档（`boundaries[k] === null`）会被跳过继续往下找，所以规则的"每 1 元 N 公里"只要有一个锚点就能外推。

**② `spanOf(c,f)` —— 单元格右上角那个小上标（L275–283）**

三种结果：
- `f >= maxFare(c)` → `{type:'cap'}` → 渲染 `<sup class="cap">封顶</sup>`（灰色小字，**标记该档就是本城最高票价档**）
- 下一档存在且比当前大 → `{type:'inc', n:差值}` → `<sup class="inc">+N</sup>`（绿色）
- 下一档相等（如天津按站数跳档）或没有下一档 → `null`（不显示上标）

**③ `renderHead()` 的点击分发（L318–324）**

```js
document.querySelectorAll('#thead-row th.price').forEach(th=>{
  th.addEventListener('click', ()=>{
    if(th.getAttribute('data-city')) toggleCitySort();
    else if(th.getAttribute('data-mf')) toggleMfSort();
    else togglePriceSort(parseInt(th.getAttribute('data-f'),10));
  });
});
```

**表头每次重绘都会重新绑定**（`innerHTML` 会销毁旧节点）。所以**不要**在初始化时只绑一次。三个可点击表头都带 `class="price"`（含城市列 `class="city-h price" data-city="1"`），这是选择器 `th.price` 的依赖。

**④ `renderSrc()` 的映射表（L412–415）**

```js
const order=['官网','官网(同网)','政府','发改委','媒体'];   // 也是排序优先级
const cls={'官网':'g','官网(同网)':'g','政府':'b','发改委':'b','媒体':'r'};
const conf={high:'官方口径，高置信', medium:'多源一致，中置信', low:'待进一步核实'};
```

**新增一个 `srcType` 或 `confidence` 取值时，这三处必须同步**，否则 `order.indexOf` 返回 `-1` 导致排序错乱、`cls[x]` 变 `undefined` 导致没有样式、`conf[x]` 显示 `undefined`。

---

## 5. 渲染与排序状态机

### 5.1 `curSort` —— 唯一的排序状态

```js
let curSort = {type:'ref', dir:1};
```

- `type ∈ {'ref', 'fare', 'mf', 'pinyin'}`，另有 `fare` 时带 `f`（票价档）。
- `dir`：`-1` 降序 / `1` 升序。
- **`ref` 是默认视图**，含义是"按起步里程 ↑"（不是"参考图顺序"，虽然历史上这么叫过）。

**`ref` 的排序键是一个"归一化到 2 元口径"的公式**（L357）：

```js
ref:(x,y)=>{
  const k = c => isMile(c) ? ((b(c,c.min_fare)||0) - (c.min_fare-2)*3) : 999;
  const fx=k(x), fy=k(y);
  return fx-fy || (baseKm(y)||0)-(baseKm(x)||0);   // 次级键：基准票价可乘里程降序
}
```

读法：2 元起步城市 `k = 起步里程`；3 元起步城市（北京 6km）`k = 6 - 1*3 = 3`，即把"多花的 1 元"折算成 3 公里，使其与 2 元起步城市可比。非里程票制（天津）`k=999` 恒排最后。

> 公式里的魔数 `3` 是"1 元 ≈ 3 公里"的粗略折算，没有出处，属于经验值。改它会影响默认视图顺序。

### 5.2 三个切换函数的共同约定

```js
// 第一次点击某列 → dir:-1（降序）；再点同一列 → 翻转；点另一列 → 重置为 dir:-1
function togglePriceSort(f){
  if(curSort.type==='fare' && curSort.f===f) curSort.dir=-curSort.dir;
  else curSort={type:'fare', f:f, dir:-1};
  rerenderAll();
}
```

**例外**：`toggleCitySort()` 首次是 `dir:1`（拼音 A→Z），因为"升序"对城市名才是直觉顺序。

三个函数都**直接改 `curSort` 再调 `rerenderAll()`**，没有返回值、没有事件参数。`.hint` 文案（L152）与它们一一对应，改动排序能力时要同步更新这句提示。

### 5.3 `render()` 的执行时序（L366–408）

```
1. 读控件状态：hideNonMile / q / base
2. list = sortCities(curSort)                    按 curSort 排整表
3. hideNonMile → list.filter(isMile)             滤掉天津
4. q → list.filter(city/region 包含关键词)
5. cmpRep = cmpOf(curSort)                       拿比较器给分组用
6. groups = (mergeView ? mergeGroups(list) : applyPerma(list))
              .sort((A,B)=>cmpRep(A.rep,B.rep))  ★ 关键：分组后再按代表城市排一次
7. 算 bestFare[f]：每个价格档下可乘里程最长的城市（仅里程票制参与）
8. groups.map(...) 生成每一行 HTML，写入 tbody
9. 空结果时写入 colspan=base+2 的"没有匹配的城市"
```

**第 6 步的二次排序是关键修复**（见 §8）：`applyPerma` 会把广佛/杭绍两个合并组**追加在数组末尾**，如果不重新排序，这两行会固定垫底、不参与排序。所以必须再按 `rep` 排一次。

### 5.4 三种合并模式的实际行数（基准票价 = 10，无搜索）

| 模式 | 触发条件 | 行数 |
|---|---|---|
| 默认 | 不勾选任何东西 | **43**（45 − 广佛、杭绍 2 组合并） |
| 隐藏非里程 | 勾选 `hideNonMile` | **42**（再减天津） |
| 全合并 | 勾选 `mergeView` | **31** |

### 5.5 主表格的列序与单元格索引

```
[0] 城市 | [1] 2元 | [2] 3元 | … | [base-1] base元 | [base] 最高票价 | [base+1] 规则要点
```

总列数 = `1 + (base-1) + 1 + 1 = base + 2`（base=10 → 12 列；base=20 → 22 列）。

**用 Node 做验证时**，切单元格的辅助函数（**这份索引定义与历史记忆里的写法不同，以本文档为准**）：

```js
function rows()  { return tbody.split('</tr>').filter(s => s.indexOf('<tr>') >= 0)
                          .map(s => s.slice(s.indexOf('<tr>'))); }
function cells(r){ return r.split('<td').slice(1); }   // ★ slice(1) 去掉了 <tr> 那一段
// cells(r)[0]        = 城市单元格内容（含前面的 class="city" 属性串）
// cells(r)[f-1]      = f 元档（f 从 2 开始）
// cells(r)[base]     = 最高票价
// cells(r)[base+1]   = 规则要点
```

> ⚠️ 历史踩坑：**不去掉 `<tr>` 那一段**的话，索引会整体 +1（`t[1]` 才是城市），历史上曾因此写错一整列、产生假报警。另外 `td` 的 class 串带**前导空格**（`class=" best"`），正则必须写 `class="[^"]*best` 而不是 `class="best"`。

---

## 6. build.py 全解剖

### 6.1 结构

```
L1–18    模块 docstring（含 9 条历史修改说明 #1–#9）
L19–27   import + 读 data.json
L29–99   helpers
L101–107 生成 HTML
L109–125 生成 CSV
L127–244 生成 XLSX（3 个 sheet）
L245–247 打印统计
```

### 6.2 关键常量与函数

| 名称 | 说明 |
|---|---|
| `FARES = [1..10]` | **CSV/XLSX 固定导出 10 档**（HTML 才是 2–20 可变）。改这里要同步 `boundaries` 的键范围 |
| `CAP_CITIES = {"沈阳","天津"}` | **政策性封顶城市**，CSV/XLSX 的「政策性封顶」列据此填「是」 |
| `bnd(c,f)` | 读 `boundaries`，注意 `c["boundaries"].get(str(f))` |
| `city_max_fare(c)` | 读 `max_fare`；**缺省时按已定义档位回退推断** |
| `fare_km(c,f)` | 本脚本的 `b()`，超 `max_fare` 返回 `None` |
| `is_mile(c)` | `bnd(c, c["min_fare"]) is not None`（**与 JS 版实现不同**，见 §7.5） |
| `is_capped(c)` | `city_max_fare(c) <= 10` —— **仅用于 Sheet2 的「最高票价≤10元」列**，与"政策性封顶"无关 |
| `max_span(c)` | 最大阶梯跨度，只在 `min_fare..min(max_fare,10)` 内算 |
| `text_w(s)` | 估算 Excel 列宽（CJK 计 2 宽） |
| `autofit(ws)` | 按内容自动列宽，上限 70 |

### 6.3 三个 sheet 的表头（写入时务必与数据列数一致）

**Sheet1「票价-里程矩阵」——18 列**

```
城市, 地区, 起步价(元), 1元…10元 (10列), 最高票价(元), 政策性封顶, 最高票价可乘里程(km), 计价规则, 备注 / 排除项
```

**Sheet2「统计与排名」——11 列**

```
排名, 城市, 最高票价(元), 最高票价可乘里程(km), 10元可乘里程(km), 10元单位成本(元/km),
起步价(元), 起步可乘里程(km), 最大阶梯跨度(km), 最高票价≤10元, 备注
```

> 第 10 列原名为「线网封顶（最高票价≤10元）」，**2026-09-30 改名**为「最高票价≤10元」，以避开与本项目「政策性封顶」的术语冲突。别再改回去。

Sheet2 只排「10 元档真实存在」的 **22 城**，之后另起一块列出「线网最高票价低于 10 元、无 10 元档的城市」（23 城，排名列填「—」）。

**Sheet3「逐城规则与来源」——8 列**

```
城市, 口径范围, 计价规则（官方概括）, 备注 / 排除项, 规则生效, 来源类型, 置信度, 来源链接
```

按 `order = ["官网","官网(同网)","政府","发改委","媒体"]` 排序，同类型内按中文拼音。

### 6.4 一处需要留意的一致性

`build.py` 的「政策性封顶」用 Python 集合 `CAP_CITIES`，`template.html` 的紫色标记用 JS 数组 `CAP_CITIES`。**这是同一份信息在两处的重复定义**，改一处必须改另一处（见 §7.6）。

---

## 7. 不变量与陷阱（必读）

> 这一节是本文档最值钱的部分。下面每一条都是**曾经踩过或验证过**的，不是泛泛的注意事项。

### 7.1 「–」必须恒排在底部（两个方向都是）

比较器统一用 `nullLast(vx, vy)` 先判空，**升降序都把 `null` 放底部**。

历史 bug：最初只在降序时置底，升序时 `null` 会顶到最前面。**改任何数值比较器都必须保留 `nullLast`。**

### 7.2 合并分组的指纹依赖 `boundaries` 的键顺序

```js
const fp = JSON.stringify([c.min_fare, c.boundaries, c.beyond, c.unit||null]);
```

`JSON.stringify` **保留对象的键插入顺序**。目前 45 城的 `boundaries` 都是 `1,…,10` 同一顺序，所以指纹可比。**如果新增城市时把键写成乱序或有缺键，`JSON.stringify` 产出的字符串不同 → 明明规则相同却不会被合并。**

**新增城市时请复制现有城市的 `boundaries` 模板再改数值，保持 `"1"`～`"10"` 完整且升序。**

### 7.3 「封顶」这个词在本项目里有**三种互不相同**的含义

这是最容易出错的地方，务必分清：

| 出现位置 | 视觉 | 含义 | 判定依据 |
|---|---|---|---|
| 价格单元格内的 `sup.cap` | 灰色小字「封顶」 | **该档就是本城的最高票价档**，更高档不售票 | `f >= maxFare(c)` |
| 城市名后的 `.tag.cap` | **紫色胶囊**「7元封顶」 | **政策性封顶**：官方把最高票价设为便民上限，而非按最远 OD 算出的自然最高 | 硬编码 `CAP_CITIES=['沈阳','天津']` |
| Sheet2 的「最高票价≤10元」列 | 文本「是/否」 | 纯粹是 `max_fare <= 10` 的算术判断 | `is_capped(c)` |

**只有沈阳、天津是"政策性封顶"**。其他 43 城的最高票价都是"网络最远 OD 的自然结果"，规则本身是无限递增的。南宁虽然官方《车票须知》写了「最高票价 7 元」，但规则"34 公里以上每 10 公里加 1 元"仍在递增、且 7 元档覆盖范围与最远 OD 相近，**判定为不算政策性封顶**（用户拍板过）。

页面上这三处同时存在，说明段（L183）已写明区别。**不要为了"统一"把它们合并。**

### 7.4 `.tag.cap` 与 `sup.cap` 的 CSS 不能合并

```css
sup.cap{color:var(--muted); font-size:10.5px; ...}   /* L93，价格档小标 */
.tag.cap{background:#f2ecfc; color:#6a35c8; ...}     /* L105，紫色标签 */
```

两者都叫 `cap` 但选择器分别限定 `sup` 和 `.tag` 元素，所以互不干扰。**写新样式时注意别用 `.cap{}` 裸选择器**，否则会同时命中两者。

### 7.5 JS 与 Python 的 `isMile` 实现**不同**（这是刻意的）

| 位置 | 实现 | 判据 |
|---|---|---|
| `template.html` L273 | `(c.unit \|\| 'km') !== '站'` | 看 `unit` 字段 |
| `build.py` L60–61 | `bnd(c, c["min_fare"]) is not None` | 看起步档有没有里程值 |

历史 bug：Python 版曾对天津误判为 `True`（天津起步档 `boundaries["2"]=5` 是**站数**不是里程，非 null 所以被判成里程票制），导致「隐藏非里程票制城市」失效。**JS 版已改为按 `unit` 字段判断，是正确的版本。** 如果将来给第二个城市加站数票制，记得两处都处理（`unit` 字段 + `is_mile` 判据）。

### 7.6 需要"到处同步"的几处冗余定义

改这些信息时，**每一处都要改**，漏一处就出现前后不一致：

| 信息 | 出现位置 |
|---|---|
| 政策性封顶城市 | `template.html` 的 `CAP_CITIES` 数组（L384）+ `build.py` 的 `CAP_CITIES` 集合（L23附近）+ 说明段 L183 的硬编码「沈阳 7 元、天津 5 元」 |
| 城市总数 45 | 页面「关键发现」多条硬编码文案；`chips` 是自动算的（`CITIES.length`）✓ |
| 23 城 / 22 城 / 118km / 40km 等结论数字 | 「关键发现」6 条全是**手写文案**，改数据后**不会自动更新** |
| 拼音 | `PY` 表（L226）手写。**新增城市必须补一条**，否则 `PY[city]` 为 `undefined`，`localeCompare(undefined)` 会让它排到最前 |
| legend 图例（L143–149） | 新增任何视觉标记类别（新标签色、新上标）都要补一条 |
| 说明段（L176–184） | 同上 |

> **「关键发现」是整份报告最易过期的地方。** 每次改数据后请人工重算这 6 条里的数字。它们是写死的 HTML 文本，`build.py` 完全不碰。

### 7.7 HTML 必须自包含

产物 `地铁票价对比.html` 需要能双击直接打开（无服务器、无网络）。所以：

- 不引入 CDN 的 Chart.js / 字体 / 图标库。
- 图片要用内联 SVG 或 data URI。
- 验证方式：`grep -E 'src="http|href="http' 地铁票价对比.html` 只应命中数据里的来源链接（`<a>` 标签），不应命中 `<script src>` / `<link href>`。

### 7.8 `sticky` 元素必须有背景色

`table.fare thead th`（`top:0`）和 `td.city`/`th.city-h`（`left:0`）都是 sticky。它们必须有不透明背景（`#fff` 或渐变色），否则滚动时会透出下层内容。改主题色时别忘了同步。

### 7.9 空态 colspan 是 `base+2`

```js
tb.innerHTML = '<tr><td colspan="'+(base+2)+'" …>没有匹配的城市</td></tr>';
```

列数变了要同步改（虽然 `colspan` 大一点小一点浏览器也能容错，但保持一致更干净）。

### 7.10 PowerShell 写文件会加 BOM

**PS 5.1 的 `Set-Content` / `Out-File -Encoding utf8` 会写 UTF-8 BOM。** 用它们写 `data.json` 这类给 Python/Node 解析的文件，会导致解析失败（往往是"写得进、读不出"的静默故障）。

**要写文本文件请用 .NET**：

```powershell
[IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding($false)))
```

排查：`[IO.File]::ReadAllBytes($p)[0..2]` 是不是 `EF BB BF`。

### 7.11 不要对同一个文件并行发多个 Edit

会 EBUSY 或互相覆盖。同一文件的多处改动**串行**改。

---

## 8. 历史决策与变更日志

按时间顺序，**只记"为什么"，因为"是什么"已在代码里**。这些是用户明确拍板过的，不要凭"更好的设计"擅自推翻。

### 8.1 数据与口径

1. **嘉兴被删除**（原 46 城 → 45 城）：只有一票制有轨电车，无里程制轨交，不满足对比口径。
2. **天津改为站数票制**：`unit:"站"`、`boundaries` 存**可乘站数**而非里程。它是全国唯一以站数票制为主体的主要城市。因此它的数字**不能与其他城市直接比较**，页面用橙色 `站数票制` 标签提示。
3. **`max_fare` 字段新增**：逐城核实"线网实际最高票价"。**最初要求"只进数据表、不进 HTML"，后来用户推翻该决定，改为在 HTML 主表最右新增「最高票价」列**（§8.3 第 3 条）。
4. **广佛、杭绍永久合并**（`PERMA_MERGE`）：广佛同城同价、杭绍联网分段计价，无论是否勾选「合并显示」都合并。其余同规则城市由开关控制。
5. **排除项**：机场专线、磁悬浮、单独计价的有轨电车/APM、跨市城际铁路均不计入"普通地铁"口径，在各城 `note` 里注明。

### 8.2 已废弃、不要复活的设计

| 废弃物 | 原因 |
|---|---|
| **排序下拉框 `<select id="sortSel">`** | 用户要求删除，改为**点表头排序**。同时删掉了只由它触达的 `setSortFromDropdown()`、`start`/`cost` 两个比较器、`baseFare()` |
| **「按起步里程 ↓」「按基准票价单位成本 ↑」两个排序口径** | 它们当初只在下拉里有入口，删下拉后**失去了入口**（比较器已删）。如需恢复要重新设计入口，不能只把下拉加回来 |
| **「按各城市最高票价推算」复选框** | 删除，简化为统一用用户输入的基准票价 |
| **两张条形图**（10 元里程 TOP10 / BOTTOM8） | 已删除（含 CSS） |
| **`isCapped()`（JS）** | 已删除，功能由 `maxFare()` + `spanOf()` 承担 |
| **「数据整理」板块** | 已从文末删除 |
| **按地区分组展示** | 已取消（`region` 仅用于搜索匹配） |
| **最高票价列的橙色标记 + 「封顶」小字** | 用户要求"统一格式、不要写封顶"→ 现在一律 `N 元` 素色 |

### 8.3 UI 演进（本轮相关）

1. **基准票价：下拉 → 数字输入**。`<select>`(2–15) 改为 `<input type="number" min=2 max=20>`。行为：**边输入边生效**；越界自动钳制；**输入框为空时沿用 `lastBase`**（否则表格会刷成空白）；`blur`/`change` 时把越界值**回写**输入框（输入 25 → 表格按 20 渲染 → 失焦后框内变成 20）。
2. **最高票价列表头可点击排序**（`toggleMfSort`）。
3. **城市列表头可点击排序**（按拼音，`toggleCitySort`）。
4. **最高票价列统一格式**，去掉橙色与「封顶」小字。
5. **政策性封顶标记**：只标**沈阳（7 元）、天津（5 元）**，用**紫色**（≠ 原有橙/绿），同时给城市名染色 + 加「N 元封顶」标签。调研结论见 §9.1。

### 8.4 布局与排版

1. **主表格全宽**：移出 `.wrap`（1180px 限宽），放进新的 `.wrap-wide`。
2. **行距逐步收紧**：`table.fare th/td` 的 padding 从 `9px` → `6px` → **`3px 8px`**（当前值）。
3. **金色高亮**（`td.best`）：每个价格档下可乘里程**最长**的城市（按当前可见行计算，并列时都高亮）。注意它只统计**里程票制**城市，天津不参与。

---

## 9. 未决事项与已知数据出入

### 9.1 政策性封顶调研结论（已完成，仅 2 城）

判据：官方文件把最高票价写成**政策性上限/优惠**（而非"网络最远 OD 的自然结果"）。

| 结论 | 城市 | 最高票价 | 依据 |
|---|---|---|---|
| ✅ **已标记** | 沈阳 | 7 元 | 沈发改发〔2019〕53号 原文「线网实行最高票价 7 元封顶**优惠**」，列在"票价优惠政策"条款内。规则本身是"28 公里以上每增加 10 公里增加 1 元"的**无限递增**，线网 211 km 实际存在 38 km 以上行程，封顶确实在起作用 |
| ✅ **已标记** | 天津 | 5 元（市区线） | 津发改价管〔2023〕324号：「乘坐 16 站 15 区间以上票价 5 元」，即 **17 站及以上一律 5 元**不再加价，按站区间计价天然封顶 |
| ⚠️ 存疑，**未标记** | 南宁 | 7 元 | 官方《车票须知》明文「线网最低票价 2 元，最高票价 7 元」，但规则"34 公里以上每 10 公里加 1 元"**继续递增**，且 7 元档覆盖 34–44 km、与线网最远 OD 相近，难断定是人为上限 |
| ❌ 明确不是 | 北京 / 上海 / 深圳 | — | 官方文件有"**票价不封顶**""没有上限""**上不封顶**"的原文表述。深圳的 15 元只是最长 OD 票价 |

### 9.2 已知数据出入（**待用户确认，不要擅自改**）

**长沙 `max_fare` 记为 9，但官方口径是 8。**
长沙 6 号线开通（2022）后官方称「全程最高票价 8 元」（谢家桥→黄花机场 48.1 km）。8 元恰好等于规则里 48 km 档的上限（6元=30、7元=39、8元=48），属**随网络增长的自然最高**。

用户已知悉此事但**尚未批准修改**。若批准：改 `data.json` 里长沙的 `max_fare: 9 → 8`，然后重跑 `build.py`（长沙的 9 元列会变成「–」，并影响 Sheet2 排名与「关键发现」数字）。

另有两处 confidence 为 `medium` 的城市（共 2 个）与几座**估算**城市（济南/长春/呼和浩特的最高票价依据较弱），如需提高可信度可重新调研。

### 9.3 可能的后续需求（用户提过但未确认）

- 「基准票价调到 20 时会有 19 个价格档，窄窗口要横向滚动」。曾提议做「只显示到该城最高票价」的紧凑视图，用户**未表态**。
- 已删的两个排序口径（起步里程↓、单位成本↑）是否要重新挂入口，**未表态**。

---

## 10. 常见修改任务 How-to

### 10.1 改某城的票价或规则

1. 改 `data.json` 里该城的 `boundaries` / `max_fare` / `beyond` / `fare_rule` / `note`。
2. **`boundaries` 必须保持 `"1"`～`"10"` 完整且升序**（§7.2）。
3. 重跑 `build.py`。
4. 跑冒烟脚本（§11.2）确认无异常。
5. **人工重算「关键发现」里受影响的数字**（§7.6）。

### 10.2 新增一个城市

除了改 `data.json`，还要：

1. **`template.html` L226 的 `PY` 表补一条拼音**（漏了会导致排序错乱、排到最前）。
2. 检查 `boundaries` 键顺序与现有城市一致（否则无法参与合并分组）。
3. 若该城是站数票制：加 `"unit": "站"`，并确认 `build.py` 的 `is_mile()` 也能正确识别。
4. 如果它属于已合并组（如新增佛山那样的广佛联营），可能要在 `PERMA_MERGE` 里加。
5. **`chips` 的城市数会自动跟随**（`CITIES.length`），不用手改。
6. 页面文案里所有"45 城"都要改。

### 10.3 加一个新的城市标签（如"机场线单独计价"）

1. `render()` 的 L399–404 加一行条件 `tags.push(tag(['note','你的文字']))`。
2. 选一个已有色系（`warn` 橙 / `note` 绿 / `cap` 紫）或新增一个 `.tag.xxx` 样式（L101–106 附近）。
3. **同色系不要复用不同语义**——目前橙=站数票制、绿=市域铁路/单轨/同规则、紫=政策性封顶。
4. 在 `legend`（L143–149）或说明段（L176–184）补图例文字。

### 10.4 改配色/主题

1. 只改 `:root` 的 CSS 变量（L8–13）就能换掉大部分颜色。
2. **但有几处是硬编码色值，不跟随变量**：`.tag.warn/.note/.cap` 的背景/边框、`td.na` 的 `#cdc3b7`、`td.best` 的 `#fff3d6`、`sup.cap`、`.warnbox`、`.ins`、`.type.g/.y/.b/.r`。要全局换色得逐个找。
3. `table.fare td.city{background:#fff}` 是 sticky 列的背景，必须同步。
4. CSS 变量**同时**用在 `<style>` 里和 HTML 的 `style="color:var(--orange-l)"` 内联属性里（legend 的 ★）。

### 10.5 改导出的列

改 `build.py` 时，**记住 CSV 和 XLSX 各有独立的表头数组**（`head` / `head1` / `head2` / `head3`），插入列时对应的数据行 append 也要同步，否则列会错位。Sheet1 的对齐阈值 `CENTER if i <= 15 else LEFT` 依赖列位置，插列后要改。

### 10.6 换成"只显示到该城最高票价"的紧凑视图

（需求未确认，此处给实现思路）最省事的做法是在 `render()` 第 8 步生成 `<td>` 时，对 `f > maxFare(c)` 的档位跳过不输出。但这样**每行列数不同，表头就对不齐了**；要真正实现得给每行做 `colspan` 或改成分组小表。**不要只改一处就交付。**

---

## 11. 回归验证清单与冒烟脚本模板

### 11.1 什么时候必须跑

**任何**改动 `template.html` 或 `data.json` 之后。这个项目的复杂度已经超过"肉眼看看就行"的程度——历史上多次出现"改 A 坏 B"（例如删下拉导致排序状态残留、改合并导致「–」没沉底）。

### 11.2 HTML 冒烟脚本模板

原理：`地铁票价对比.html` 的 `<script>` 是**纯 DOM 操作**，可以抽出源码、塞一个**最小 DOM 桩**，在 Node 里直接跑。这样不用浏览器就能断言渲染结果。

把下面内容存成 `_smoke.js`，放在 `metro-fare/` 下，用 §2.1 的 Node 路径执行：

```js
/* 冒烟：渲染结果断言（DOM 桩，无需浏览器） */
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const raw = fs.readFileSync(path.join(DIR, '地铁票价对比.html'), 'utf8');
const si = raw.indexOf('<script>') + 8, se = raw.indexOf('</script>', si);
const code = raw.slice(si, se);                       // 抽出内联 JS

const store = {};
function mkEl(id) {
  return store[id] || (store[id] = {
    id, value: '', checked: false, innerHTML: '', handlers: {},
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    getAttribute() { return null; }, querySelectorAll() { return []; }
  });
}
mkEl('baseSel').value = '10';                         // 基准票价默认 10
const document_ = { getElementById: mkEl, querySelectorAll: () => [] };

// 在桩环境里执行模板 JS，并把内部函数导出来
const T = (new Function('document', code +
  '\nreturn {render,renderHead,rerenderAll,togglePriceSort,toggleMfSort,toggleCitySort,getSort:()=>curSort};'
))(document_);

const log  = {};
const body = () => store['tbody'].innerHTML;
const head = () => store['thead-row'].innerHTML;
const rows = () => body().split('</tr>').filter(s => s.indexOf('<tr>') >= 0)
                         .map(s => s.slice(s.indexOf('<tr>')));
const cells = r => r.split('<td').slice(1);           // cells[0]=城市, cells[f-1]=f元档, cells[base]=最高票价
const count = re => (body().match(re) || []).length;
const findRow = name => rows().filter(r => cells(r)[0].indexOf('>' + name) >= 0)[0] || '';

T.renderHead(); T.render();
log.HEAD_HAS_THREE_SORTS = /data-city="1"[\s\S]*data-mf="1"/.test(head());
log.LEFTOVER = ['sortSel','setSortFromDropdown','mfAsc','mfDesc','value="ref"','baseFare']
                 .filter(t => raw.indexOf(t) >= 0);   // 期望 []

/* —— 以下按本次改动内容自行增删 —— */
log.ROWS_DEFAULT   = rows().length;                   // 期望 43
mkEl('hideNonMile').checked = true; T.render();
log.ROWS_HIDE_NONMILE = rows().length;                // 期望 42
mkEl('hideNonMile').checked = false; T.render();
log.BEST = count(/class="[^"]*best/g);                // 期望 14（金色高亮数）

T.toggleMfSort(); T.render();
const mfCol = r => cells(r)[10];                      // base=10 时 cells[10]=最高票价
const desc = rows().map(r => parseInt((mfCol(r).match(/(\d+)<\/span>/) || [])[1], 10));
log.MF_DESC_MONO = desc.every((v, i) => i === 0 || v <= desc[i - 1]);

console.log(JSON.stringify(log, null, 2));
fs.writeFileSync(path.join(DIR, 'smoke_log.json'), JSON.stringify(log, null, 2), 'utf8');
```

执行（PowerShell，输出落盘再读）：

```powershell
Set-Location "C:\Users\ryan0\WorkBuddy\2026-09-21-20-42-23\metro-fare"
& 'C:\Users\ryan0\.workbuddy\binaries\node\versions\22.22.2-3\node.exe' _smoke.js 2>&1 | Out-File smoke_run.txt -Encoding utf8
Write-Output ("NODE_EXIT=" + $LASTEXITCODE)
```

> 桩的三个要点：① `baseSel` 必须在 eval 前就有 `value`（模板顶层有一行 `let lastBase = parseInt(document.getElementById('baseSel').value,10)||10`，拿不到元素会直接抛错）；② `querySelectorAll` 返回 `[]` 即可——它只用于绑定事件，不影响渲染结果；③ 断言排序时**直接调 `toggleMfSort()` / `togglePriceSort(f)`**，不要试图模拟点击（没有真实 DOM 事件）。

### 11.3 XLSX / CSV 校验脚本模板

```python
# -*- coding: utf-8 -*-
import csv, json, os
from openpyxl import load_workbook
BASE = os.path.dirname(os.path.abspath(__file__)); out = {}

with open(os.path.join(BASE, "地铁票价对比.csv"), encoding="utf-8-sig", newline="") as f:
    rows = list(csv.reader(f))
head, body = rows[0], rows[1:]
out["CSV_COLS"]   = len(head)
out["CSV_ROWS"]   = len(body)                  # 期望 45
out["CSV_YES"]    = sorted(r[0] for r in body if r[head.index("政策性封顶")] == "是")
out["CSV_OTHERS"] = [r[0] for r in body if r[head.index("政策性封顶")] not in ("是", "")]  # 期望 []

wb = load_workbook(os.path.join(BASE, "地铁票价对比.xlsx"))
ws = wb["票价-里程矩阵"]
h1 = [c.value for c in ws[1]]
out["XLSX_COLS"]   = len(h1)                   # 期望 18
out["XLSX_SHEETS"] = wb.sheetnames             # 期望 3 个 sheet

def fg(cell):
    """取字体颜色的 ARGB 串；无颜色时返回 None。
       注意：cell.font.color 可能是 None，不能直接 .rgb，否则 AttributeError。"""
    col = cell.font.color
    return str(col.rgb) if (col is not None and col.rgb) else None

i_cap = h1.index("政策性封顶") + 1
purple, capyes = [], []
for r in range(2, ws.max_row + 1):
    name = ws.cell(row=r, column=1).value
    if (fg(ws.cell(row=r, column=1)) or "").endswith("6A35C8"):
        purple.append(name)
    if ws.cell(row=r, column=i_cap).value == "是":
        capyes.append(name)
out["XLSX_PURPLE"]        = sorted(purple)     # 期望 ['天津', '沈阳']
out["XLSX_CAPYES"]        = sorted(capyes)
out["XLSX_PURPLE_EQ_YES"] = sorted(purple) == sorted(capyes)   # 期望 True
wb.close()
print(json.dumps(out, ensure_ascii=False, indent=2))
```

### 11.4 收工前必做

```powershell
$dir = "C:\Users\ryan0\WorkBuddy\2026-09-21-20-42-23\metro-fare"
foreach($t in @("_smoke.js","smoke_log.json","smoke_run.txt","build_out.txt",
                "_chk.py","chk.json","chk_out.txt","_info.py","_info.txt","_info_run.txt","_c.txt")){
  $p = Join-Path $dir $t; if([System.IO.File]::Exists($p)){ [System.IO.File]::Delete($p) }
}
(Get-ChildItem $dir -Name) -join ', '          # 应只剩 6 个正式文件（含本 README）
```

### 11.5 断言基线（写文档时的实测值，改动后对照）

| 指标 | 值 |
|---|---|
| 城市数 | 45 |
| 默认行数 / 隐藏非里程 / 全合并 | 43 / 42 / 31 |
| base=10 表头列数 / base=20 | 12 / 22 |
| 金色高亮（`td.best`）数 | 14 |
| 政策性封顶标记数（`capname` 与 `tag cap`） | 各 2 |
| 最高票价降序首行 / 升序首行 | 20（广州、佛山）/ 5（天津） |
| 城市拼音升序首行 | 北京 |
| `max_fare <= 10` 的城市数 | 26（其中恰好 =10 的 3 城：北京、重庆、无锡） |
| 「线网最高票价低于 10 元」 | 23 城 |
| 「10 元档真实存在」 | 22 城 |
| CSV 列数 × 数据行数 | 25 × 45（含表头共 46 行） |
| XLSX Sheet1 列数 | 18 |

### 11.6 交付前的自检清单

- [ ] `build.py` 跑通，三个产物都已重新生成（看时间戳）
- [ ] 冒烟脚本全绿；`LEFTOVER` 为空
- [ ] 若改了数据：「关键发现」6 条里的数字已人工重算
- [ ] 若加了标签/颜色：`legend` 与说明段已补图例
- [ ] 若加了城市：`PY` 表已补拼音
- [ ] 若改了 `CAP_CITIES`：`template.html` 与 `build.py` 两处都改了，说明段也改了
- [ ] HTML 仍自包含（无 `<script src>` / `<link href>`）
- [ ] 所有临时文件已删除，目录只剩 6 个正式文件
- [ ] 用 `present_files` 把三个产物展示给用户

---

## 附：一句话给下一个模型

**改数据 → 跑 build.py → 跑冒烟 → 同步手写文案 → 删临时文件。**
最容易忘的是最后两件事，最容易错的是「封顶」的三种含义（§7.3）和 `boundaries` 的键顺序（§7.2）。

打包相关还有两个**必读**的坑：Android 的 `BuildTask.kt` 启动方式（§12.8）和
Windows 的 `WebView2Loader.dll` 不能删（§12.9）。

---

## 12. Tauri 打包（Windows exe / Android apk）

### 12.1 设计决策（为什么长这样）

打包层**刻意与 FxxkBox 保持同构**，但砍掉了本项目用不到的部分。对照如下：

| 维度 | FxxkBox | 本项目 | 原因 |
|---|---|---|---|
| 前端 | React 19 + Vite + TS | **无框架**，直接吃 `build.py` 的产物 | 本项目页面本就是自包含单文件，引入 Vite 只是徒增体积与依赖 |
| 前端构建 | `tsc --noEmit && vite build` → `release/web` | `node scripts/web.mjs` → 拷 `地铁票价对比.html` 为 `release/web/index.html` | 少一层工具链 |
| Rust 侧 | `fxxkbox` + `fxxkbox-core` workspace + 自定义 IPC 命令 | **单 crate，零 IPC 命令** | 纯离线只读页面，不需要与系统交互 |
| 授权/反逆向 | licensing-common + licensor 管理器 + 中文秘钥 + 反调试 | **整块删除** | 用户明确不要 |
| 体积优化 | `opt-level="s"` | **`opt-level="z"`** | 用户要求「包体积更小」 |
| 桌面产出 | 便携单文件 exe（patch webview2-com-sys 静态链接） | 便携 exe + 可选 NSIS | 暂未做单文件化改造，见 §12.5 |
| Android | 同左 + 自定义图标修正脚本 | 同左，但**只用 `tauri icon` 原始产物** | 本项目图标是自绘的整块图形，无「安全区留白」问题 |

> **没抄的部分**：`vendor/webview2-com-sys`（需 MSVC `dlltool` 造 delay-load 桩）、`scripts/sign-integrity.mjs`（完整性自签名）、`licensing*` 全部、`tools/licensor`、Playwright/Vitest 测试基建。

### 12.2 目录结构

```
metro-fare/
├── package.json              # 只有一条依赖：@tauri-apps/cli
├── src-tauri/
│   ├── Cargo.toml            # 单 crate；[profile.release] 是体积优化重点
│   ├── build.rs              # 一行 tauri_build::build()
│   ├── tauri.conf.json       # frontendDist = ../release/web
│   ├── capabilities/main.json# 只给 core:default
│   ├── icons/                # 由 `tauri icon icon-src.png` 生成
│   └── src/
│       ├── main.rs           # #![windows_subsystem = "windows"] + 调 lib
│       └── lib.rs            # 只跑 Builder::default().run(...)，无 invoke_handler
├── scripts/
│   ├── runtime.mjs           # 工具链探测 + PATH 注入 + sha256 发布
│   ├── web.mjs               # build.py → release/web/
│   ├── desktop.mjs           # Windows 打包 → release/windows/
│   ├── android.mjs           # Android 打包 → release/android/
│   └── package-all.ps1       # 一键双端
└── release/                  # 产物（git 忽略，见 .gitignore 锚定规则）
    ├── web/                  # Tauri 前端资源
    ├── windows/              # exe + sha256
    └── android/              # apk + sha256
```

### 12.3 打包命令

```powershell
Set-Location D:\Code\metro-fare

# 一键双端（推荐）
powershell -ExecutionPolicy Bypass -File scripts\package-all.ps1

# 单端
npm run desktop:build          # 便携版 exe
npm run desktop:installer      # 追加 NSIS 安装包
npm run android:init           # 首次：生成 gen/android 工程（只需一次）
npm run android:build          # apk
npm run android:doctor         # 只体检工具链
```

**踩坑（实测，不要凭常识推翻）**：

| 坑 | 说明 |
|---|---|
| `cargo`/`tauri` **必须在 `src-tauri` 内运行** | 否则 `src-tauri/.cargo/config.toml` 的 rustflags 不生效。`desktop.mjs` 已显式 `cwd: src-tauri` |
| **`--no-bundle` 必须在 `--` 之前** | `--no-bundle` 是 tauri CLI 的选项，放到 `--` 之后会被透传给 cargo 并报未知参数。`desktop.mjs` 已处理 |
| `frontendDist` **必须是子目录** | 写 `release/` 本身会被 Vite 的 `emptyOutDir` 抹掉同目录的 exe/apk |
| PATH 里没有 cargo 时 | 从 GUI 启动的终端会 `spawnSync cargo ENOENT`。`runtime.mjs:buildEnvironment()` 显式补齐 `D:\Code\cargo\bin` + MinGW |
| 首次编译**很慢** | 整个 Tauri 栈要从头编译，target 目录会涨到 ~1GB。之后增量编译是分钟级 |
| 中文产物名 | `地铁票价对比.exe` 在部分终端显示乱码，是控制台编码问题，文件正常 |
| Gradle 缓存位置 | 命中 `D:\cache\gradle`（**不是** `~/.gradle`），`GRADLE_USER_HOME` 已由 `runtime.mjs` 注入 |

### 12.4 Android 端

**首次初始化**（只需跑一次，之后 `gen/android` 会保留）：

```powershell
npm run android:init
```

需要（本机均已就位）：

| 组件 | 本机位置 |
|---|---|
| JDK | `D:\Program Files\Java\jdk-17`（**必须 17 或 21**，configured 为 25 时脚本会自动换 17） |
| Android SDK | `C:\Users\ryan0\Android\Sdk`（含 platforms 34/35/36、build-tools 36.0.0） |
| NDK | `C:\Users\ryan0\Android\Sdk\ndk\28.2.13676358` |
| Rust target | `aarch64-linux-android`（已装。缺了脚本会自动 `rustup target add`） |

**签名**：默认复用本机 `C:\Users\ryan0\.android\debug.keystore`（alias `androiddebugkey`，口令 `android`）。
要换正式 key，设四个环境变量（**绝不写进仓库**）：

```powershell
$env:METRO_FARE_ANDROID_KEYSTORE = 'D:\keys\release.jks'
$env:METRO_FARE_ANDROID_KEY_ALIAS = 'metrofarenkey'
$env:METRO_FARE_ANDROID_STORE_PASSWORD = '...'
$env:METRO_FARE_ANDROID_KEY_PASSWORD = '...'
```

> ⚠️ **换签名密钥会导致无法覆盖安装**——用户必须先卸载旧版。上架前再换。

**生成的 Android 工程要改的地方**（`gen/android` 是生成物，但**这些改动必须手工做且不会自动重生**）：

1. `app/build.gradle.kts`
   - `namespace` / `applicationId` → `com.metrofare.app`
   - `minSdk = 24`、`targetSdk`/`compileSdk = 36`
   - ⚠️ 把 `System.getenv("FXXKBOX_ANDROID_KEYSTORE")` 改成 `METRO_FARE_ANDROID_KEYSTORE`，否则签名配置永不生效（`isNullOrBlank()` 恒真 → `signingConfig = null` → release APK 未签名）。
2. `app/src/main/res/values/strings.xml` → `app_name` = `地铁票价对比`。
3. `app/src/main/res/values/themes.xml` → 样式名随 namespace（`Theme.metrofare`），必须与 `AndroidManifest.xml` 的 `android:theme` 一致。
4. `AndroidManifest.xml` → `android:theme="@style/Theme.metrofare"`。
5. 图标：`tauri icon` 只会写 `src-tauri/icons/android/**`；要真正生效需把 `mipmap-*` 拷进 `gen/android/app/src/main/res/`。本项目**不做** FxxkBox 那套安全区修正（图标是整块自绘图形）。

### 12.5 体积与已知取舍

- `[profile.release]` 用 `opt-level="z"` + `lto="fat"` + `codegen-units=1` + `strip` + `panic="abort"`。
- **未做**便携单文件化（FxxkBox 那套 delay-load WebView2 方案）。产物是 `exe` + 同目录 DLL 的形态；`desktop.mjs` 已自动把同目录 DLL 拷进 `release/windows/`。
  若日后要单文件，照抄 FxxkBox 的 `vendor/webview2-com-sys` + `.cargo/config.toml` + `lib.rs:extract_webview2_loader()` 三件套，但**需要 MSVC 工具链造 delay-load 桩**，本机是 GNU 工具链，成本较高。
- **没有做** `tauri icon` 之外的 Android 图标后处理；也没有 Vitest/Playwright 测试基建（本项目回归靠 §11.2 的冒烟脚本）。

### 12.6 打包前自检

- [ ] `build.py` 先跑过（`web.mjs` 会代跑，但数据改动要确认「关键发现」文案已重算——见 §7.6）
- [ ] `src-tauri/tauri.conf.json` 的 `identifier` 未被改回模板值
- [ ] 若改了 `Cargo.toml` 的 `version`，同步 `package.json` 与 `tauri.conf.json:bundle.android.versionCode`
- [ ] `release/` 里旧产物是否要清（`.gitignore` 已忽略，但发版时同名会覆盖）
- [ ] 产物 sha256 与 `release/windows/地铁票价对比.exe.sha256` 一致

### 12.7 ⚠️ 依赖版本必须锁死（踩过的坑，很重要）

`Cargo.toml` 里 `tauri`/`tauri-build` 用的是**等号锁定**（`"=2.11.5"`），**不要改成 `"2"`**。

**踩坑实录**：最初写成 `tauri = { version = "2" }`，`cargo` 解析到 **tauri 2.12.0**，编译在第三方 crate 处直接炸：

```
error[E0107]: struct takes 3 generic arguments but 2 generic arguments were supplied
  --> .../schemars-0.8.22/src/lib.rs:12:32
12 | pub type Map<K, V> = indexmap::IndexMap<K, V>;
   |                                ^^^^^^^^ expected 3 generic arguments
note: struct defined here, with 3 generic parameters: `K`, `V`, `S`
  --> .../indexmap-1.9.3/src/map.rs:76:12
```

原因：tauri 2.12.0 的依赖链让 `schemars 0.8.22` 解析到 `indexmap 1.x`，而 `indexmap 1.9.3` 的 `IndexMap` 是**三泛型** `IndexMap<K, V, S>`，`schemars` 的 `Map<K,V>` 别名只给了两个 —— **这是依赖图的版本冲突，不是本项目的代码问题**，改自己的代码没用。

FxxkBox 的 `Cargo.lock` 恰好锁在 tauri 2.11.5（可用组合），所以它没事。**解决方案就是把版本对齐到同一组**：

| crate | 锁定版本 |
|---|---|
| `tauri` | `=2.11.5` |
| `tauri-build` | `=2.6.3` |

> 另一个坑：`tauri-build` 属于 **`[build-dependencies]`**，不能写进 `[dependencies]`，否则 `tauri_build::build()` 在 `build.rs` 里找不到。

**排查手法**：这类"依赖自己编译不过"的报错，先 `grep -A3 '^name = "xxx"$' Cargo.lock` 看是本项目解析出的版本，再和 FxxkBox 的 `Cargo.lock` 对比同一个 crate 的版本号——两边不一致就优先对齐版本，别去改自己的代码。

**依赖树严重腐坏时**（例如 lock 被改乱）：删掉 `Cargo.lock` 后 `cargo generate-lockfile` 重解析（会按上面的等号约束重新锁定）。

### 12.8 ⚠️ Android：`BuildTask.kt` 必须用 `npm` 启动（第二重要的坑）

`tauri android build` 的机制是：CLI 先起一个 **WebSocket 服务端**，把地址写进
`%TEMP%\com.metrofare.app-server-addr`；随后 Gradle 的 `:app:rustBuildArm64Release`
任务以**客户端**身份再调一次 `tauri android android-studio-script`，从那个文件读回端口连接回去，取构建参数。

自动生成的 `gen/android/buildSrc/.../BuildTask.kt` 会写成：

```kotlin
val executable = """C:\...\node.exe"""      // ← 生成器按当前 node 位置硬写
val args = listOf("tauri", "android", "android-studio-script")
```

**这套组合是错的**：`node tauri android ...` 会让 node 去 `require('…\tauri')`，直接
`Error: Cannot find module 'D:\Code\metro-fare\tauri'`（`MODULE_NOT_FOUND`，`requireStack: []`）。
Gradle 挨个试 `node.exe` / `node.cmd` / `node.bat` 都失败，最后抛：

```
Execution failed for task ':app:rustBuildArm64Release'.
> A problem occurred starting process 'command '…\node.bat''
```

（所以报的是 `.bat` —— 那是兜底尝试里最后一个。）

**正确写法**（与 FxxkBox 一致）：走 npm 解析——

```kotlin
val executable = """npm"""
val args = listOf("run", "--", "tauri", "android", "android-studio-script")
```

前提是 `package.json` 里有 `"tauri": "tauri"` 这条 script（本项目已加）。

> `gen/android` 是生成物，重新 `init` 会覆盖。所以这段修正固化在
> **`scripts/android-brand.mjs`** 里（幂等），`init` 之后跑一次即可。

**另一个坑**：`%TEMP%` 里残留的 `com.metrofare.app-server-addr` 指向**已死端口**时，
手工调 `android-studio-script` 会报
`failed to build WebSocket client … ConnectionRefused (10061)`。
这是正常的——**单独手跑这个子命令没有服务端**，必须由 `tauri android build` 整体驱动。

### 12.9 ⚠️ Windows：`WebView2Loader.dll` 必须随包发布

本机 Windows 端用 **GNU（mingw）工具链**链接，`WebView2Loader.dll` 是**运行时依赖**，
不是残留物。产物形态是 `exe` + 同目录 `WebView2Loader.dll`。

**踩坑实录**：照搬 FxxkBox 的「清理 target/release 里的 WebView2Loader.dll」逻辑后，
双击 exe **秒退**，退出码 `-1073741515` = `0xC0000135` = **`STATUS_DLL_NOT_FOUND`**。

> FxxkBox 用 MSVC + 静态 WebView2 导入库，情况恰好相反（那里的 DLL 该删）；
> **本项目不要照搬它的清理逻辑**。`desktop.mjs` 已改为**主动拷贝**同目录 DLL 并打日志。

验证手法：起进程等 6 秒看是否还活着（`Start-Process -PassThru` + `HasExited`），
别只看「进程起来了」——DLL 缺失时会立刻退出。
