/**
 * 桌面端（Windows）构建与发布。
 *
 *   node scripts/desktop.mjs dev    [Tauri 参数]              开发模式
 *   node scripts/desktop.mjs build  [--installer] [Tauri 参数] 出 exe（可选 NSIS 安装包）
 *
 * 默认产出**便携版单文件 exe**（`--no-bundle`）。要 NSIS 安装包加 `--installer`。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { root, execute, buildEnvironment, publishArtifact } from './runtime.mjs';

try {
  const [command = 'dev', ...rawArgs] = process.argv.slice(2);
  if (!['dev', 'build'].includes(command)) {
    throw new Error('用法: node scripts/desktop.mjs dev|build [--installer] [Tauri 参数]');
  }
  const wantInstaller = rawArgs.includes('--installer');
  const passthrough = rawArgs.filter((value) => value !== '--installer');

  const env = buildEnvironment();
  // NSIS 解压走 rename，临时目录要和 useLocalToolsDir 的缓存同盘（都在 D 盘）。
  if (process.platform === 'win32') {
    const temporary = path.join(root, 'build/tauri/tmp');
    mkdirSync(temporary, { recursive: true });
    env.TEMP = env.TMP = temporary;
  }

  // `--no-bundle` 是 tauri CLI 自己的选项，必须排在 `--` 之前，否则 cargo 认不出。
  const cliArgs = [...passthrough];
  if (!wantInstaller) {
    const separator = cliArgs.indexOf('--');
    if (separator >= 0) cliArgs.splice(separator, 0, '--no-bundle');
    else cliArgs.push('--no-bundle');
  }

  // cargo / tauri 必须在 src-tauri 目录内运行，否则 .cargo/config.toml 不生效。
  execute(
    process.execPath,
    [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), command, ...cliArgs],
    { env, cwd: command === 'dev' ? root : path.join(root, 'src-tauri') },
  );
  if (command !== 'build') process.exit(0);

  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const outDir = path.join(root, 'release/windows');
  mkdirSync(outDir, { recursive: true });
  const note = (name) => '地铁票价对比 ' + version + ' ' + name
    + '\n需要 WebView2 运行时（Windows 10/11 已预装）。\n';

  const exe = path.join(root, 'src-tauri/target/release/metro-fare.exe');
  if (!existsSync(exe)) throw new Error('未找到 release 可执行文件：' + exe);
  const info = publishArtifact(exe, path.join(outDir, '地铁票价对比.exe'), note('便携版'));
  console.log('已发布 地铁票价对比.exe (' + (info.size / 1024 / 1024).toFixed(2) + ' MB, sha256 已记录)');

  // ⚠️ **必须**把 target/release 下与 exe 同目录的 DLL 一并拷进 release/windows。
  // 本项目经 mingw（GNU）工具链链接，`WebView2Loader.dll` 是**运行时依赖**而非残留物：
  // 缺了它启动即退出，退出码 0xC0000135（STATUS_DLL_NOT_FOUND，十进制 -1073741515）。
  // （FxxkBox 用的是 MSVC 工具链 + 静态 WebView2 导入库，情况相反，那里要删；
  //   这里**不要**照搬它的清理逻辑。）
  for (const entry of readdirSync(path.dirname(exe))) {
    if (entry.toLowerCase().endsWith('.dll')) {
      copyFileSync(path.join(path.dirname(exe), entry), path.join(outDir, entry));
      console.log('已随包发布依赖 ' + entry);
    }
  }

  if (wantInstaller) {
    const bundleDir = path.join(root, 'src-tauri/target/release/bundle/nsis');
    const setup = existsSync(bundleDir) ? readdirSync(bundleDir).find((name) => name.endsWith('-setup.exe')) : undefined;
    if (!setup) throw new Error('未找到 NSIS 安装包，请先带 --installer 且确保 bundle.targets 含 nsis。');
    publishArtifact(path.join(bundleDir, setup), path.join(outDir, setup), note('NSIS 安装包'));
    console.log('已发布安装包 ' + setup);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
