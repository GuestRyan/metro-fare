# 城市轨道交通票价查询软件（metro-fare）

输入公里数，查询一座城市或比较多座城市的**普通成人单程票规则价格**。纯离线运行，无网络请求。

## 功能

- **单城查询**：输入里程，给出票价、命中区间与完整票档表（当前档位高亮）。
- **多城对比**：一次输入，按票价从低到高排序，最低价行高亮；也可按城市名排序。
- **规则与来源**：每城展示政策原文、排除项与来源说明；原始网址保留在数据文件和导出结果中。
- **CSV 导出**：导出带 BOM 的 UTF-8 表格，含命中区间、数据依据、规则摘要、来源网址、整理日期与适用说明。
- **站数票制**：天津按站数计价，明确拒绝里程换算，不给出错误数字。

## 数据

45 座城市、349 个票档，全部来自 `src/fares.json`。原始数据为根目录《地铁票价对比.csv》。

数据带完整溯源结构：

- `meta.inputSha256`：原始 CSV 的 SHA-256，测试中有对应断言——改数据必须能追溯到具体 CSV 版本。
- 每城均有 `rule`（政策原文）、`scope`（排除项）、`note`、`region`、`sources`、`audit`。
- 来源文字统一为「从发改委或地铁公司官网获取」，**不意味着各网址内容已独立验证**。

测算边界（`meta.scope` / `meta.disclaimer`）：只收录成人单程票规则，不计算折扣、换乘补贴和另行计价服务；不代表线路可达、政策仍有效或实时售票报价。

## 架构

壳/核分离，计价引擎与 UI 完全解耦：

```text
src/fare-engine.cjs   纯函数 UMD 模块，无 DOM 依赖，可在 Node 中完整测试
src/fares.json        45 城结构化票价数据
src/app.js            UI 薄壳（innerHTML 渲染，全部插值过 escapeHtml）
src/index.html        三个 __DATA__ / __ENGINE__ / __APP__ 占位符
scripts/web.mjs       把三个源文件组装成单文件离线网页
src-tauri/            Tauri 2 壳（Windows NSIS + Android APK）
```

`src/fare-engine.cjs` 导出 7 个函数：

| 函数 | 作用 |
| --- | --- |
| `parseDistance(value)` | 解析里程，限制 0.01～500 km，返回百分之一公里整数精度 |
| `validateCity(city)` | 数据防线：票档里程与票价双严格递增、封顶价不小于已列票价 |
| `calculate(city, input)` | 单城计价，返回 `kind` / `fare` / 命中区间 / `extended` 标记 |
| `compare(cities, input, order)` | 多城对比排序（票价优先，不适用者沉尾） |
| `interval(result)` | 命中区间文案，如 `6 < 里程 <= 12 公里` |
| `csvCell(value)` | CSV 单元格转义，含公式注入防护 |
| `toCsv(rows, km, checkedOn)` | 生成带 BOM 的导出表格 |

### 计价规则

票价计算**全程使用百分之一公里整数运算**（`Math.round(km * 100)`），规避浮点误差。三种票制分流：

| 票制 | 城市数 | 行为 |
| --- | --- | --- |
| `distance` + `stepKm` | 43 | 超出已列票档后按每 `stepKm` 公里 +1 元递推 |
| `distance` + `capFare` | 2 | 政策性封顶（仅 CSV 标记为「是」的才启用） |
| `stations` | 1（天津） | 按站数计价，里程查询直接返回 `unsupported` |

边界语义：**恰好到分界点仍用该档，多出 0.01 公里才进下一档**（与「6 公里(含)内 3 元」的惯例一致）。

递推与封顶结果都标记 `extended: true`，UI 因此能区分「政策内」与「推算外延」，不把推测伪装成政策。

## 开发

需要 Node.js >= 22.12.0。

```bash
npm ci
npm test                                       # 94 个 node:test 断言
node scripts/web.mjs --serve                   # 开发服务器 http://127.0.0.1:4173
node scripts/web.mjs                           # 生成单文件离线网页到 release/web
```

Windows 桌面构建（需 Rust + Windows C/C++ 工具链 + WebView2）：

```bash
npm run desktop:build       # NSIS 安装包
npm run desktop:dev         # 开发模式
```

Android 构建：

```bash
npm run android:doctor      # 环境检查
npm run android:build       # aarch64 APK
```

页面回归测试需要 Playwright 和 Edge：

```bash
node tests/ui-smoke.cjs                        # 需先构建 release/web
PLAYWRIGHT_PATH=<模块目录> node tests/ui-smoke.cjs
QA_DIR=<输出目录> node tests/ui-smoke.cjs
```

## 测试

`tests/fare-engine.test.cjs` 是 94 个 `node:test` 断言，覆盖：

- 原始 CSV SHA-256 溯源断言；
- 全量票档端点逐一验证 + `upTo + 0.01` 进位验证（349 个票档全部）；
- 1→500 km 票价单调不减；
- 排序稳定性（不适用城市沉尾）；
- CSV 公式注入防护（以 `=` `+` `-` `@` `\t` `\r` 开头的内容加 `'` 前缀）；
- 坏票档数据被 `validateCity` 拒绝。

另有 `tests/ui-smoke.cjs`（Playwright + Edge，file:// 入口）与 `tests/ui-cases.cjs`（页面回归用例集，被 ui-smoke 引用）。

## 安全性

- 计价引擎为纯函数，无 I/O、无网络、无 `eval`。
- UI 层所有 `innerHTML` 插值都过 `escapeHtml()`，覆盖 `&` `<` `>` `\"` `'` 五字符，`String(value ?? '')` 兜住 null/undefined。
- CSV 导出对 `=` `+` `-` `@` `\t` `\r` 开头的内容加 `'` 前缀，防止表格软件执行公式。
- Tauri capabilities 仅授予 `core:default`，CSP 为 `default-src 'self'`，禁止 shell / fs / network 访问。

## 目录

```text
src/            计价引擎、数据、UI 源文件
tests/          node:test 单元测试 + Playwright 页面回归
scripts/        构建、打包脚本
src-tauri/      Tauri 2 桌面 / Android 壳
release/        发布产物与说明
build/          构建临时目录（已忽略）
```

## 许可

本项目未声明开源许可，保留所有权利。