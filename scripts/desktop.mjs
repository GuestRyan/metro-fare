import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root, execute, buildEnvironment, publishArtifact } from './runtime.mjs';

try {
  const [command = 'dev', ...args] = process.argv.slice(2);
  if (!['dev', 'build'].includes(command)) throw new Error('用法：node scripts/desktop.mjs dev|build [--installer]');
  const installer = args.includes('--installer');
  const cliArgs = args.filter(value => value !== '--installer');
  const env = buildEnvironment();
  if (process.platform === 'win32') {
    const temp = path.join(root, 'build/tauri/tmp');
    mkdirSync(temp, { recursive: true });
    env.TEMP = env.TMP = temp;
  }
  if (!installer && command === 'build') {
    const separator = cliArgs.indexOf('--');
    if (separator < 0) cliArgs.push('--no-bundle');
    else cliArgs.splice(separator, 0, '--no-bundle');
  }
  execute(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), command, ...cliArgs],
    { env, cwd: command === 'dev' ? root : path.join(root, 'src-tauri') });
  if (command === 'build') {
    const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    const output = path.join(root, 'release/windows');
    const target = path.join(root, 'src-tauri/target/release');
    const exe = path.join(target, 'metro-fare.exe');
    if (!existsSync(exe)) throw new Error('没有找到编译后的程序：' + exe);
    const info = publishArtifact(exe, path.join(output, '里程票价查询.exe'), '里程票价查询 ' + version + '\n');
    // GNU 工具链的程序还需要同目录的 WebView2Loader.dll，不能只复制 exe。
    for (const file of readdirSync(target).filter(file => file.toLowerCase().endsWith('.dll'))) {
      copyFileSync(path.join(target, file), path.join(output, file));
    }
    if (installer) {
      const dir = path.join(target, 'bundle/nsis');
      const setup = readdirSync(dir).find(name => name.endsWith('-setup.exe'));
      if (!setup) throw new Error('没有找到 NSIS 安装包');
      publishArtifact(path.join(dir, setup), path.join(output, setup), '里程票价查询 ' + version + '\n');
    }
    console.log('已发布里程票价查询 ' + version + '，' + info.size + ' 字节');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
