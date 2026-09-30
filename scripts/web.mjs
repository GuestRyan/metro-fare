/**
 * 生成 Tauri 前端产物 `release/web/`。
 *
 * 本项目**不引入 Vite/React**：页面本体是 `build.py` 用 `template.html` + `data.json`
 * 注入出的自包含单文件 `地铁票价对比.html`。这里做两件事：
 *
 *   1. 跑 `build.py`，保证 HTML/CSV/XLSX 三个产物是最新的；
 *   2. 把 HTML 拷成 `release/web/index.html`（Tauri 的 `frontendDist` 要求入口名为
 *      `index.html`），同时把原始单文件也拷一份，方便直接双击查看。
 *
 * 注意：`frontendDist = ../release/web` 必须保持**子目录**形态，写 `release/` 本身
 * 会被 `emptyOutDir` 类逻辑抹掉 exe/apk/manifest。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, runBuild } from './runtime.mjs';

const HTML = '地铁票价对比.html';
const WEB = path.join(root, 'release/web');

function main() {
  const serve = process.argv.includes('--serve');
  if (!serve || !existsSync(path.join(root, HTML))) {
    console.log('构建数据管线（build.py）…');
    runBuild();
  }

  const source = path.join(root, HTML);
  if (!existsSync(source)) throw new Error('缺少生成物 ' + HTML + '，请先跑 build.py。');

  mkdirSync(WEB, { recursive: true });
  copyFileSync(source, path.join(WEB, 'index.html'));
  // 原始文件名再留一份，方便在 release/web 里直接双击。
  copyFileSync(source, path.join(WEB, HTML));
  writeFileSync(path.join(WEB, '.gitkeep'), '');

  const kb = (readFileSync(source).length / 1024).toFixed(1);
  console.log('前端产物 -> release/web/  (' + kb + ' KB, 自包含单文件)');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
