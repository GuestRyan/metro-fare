/**
 * Android 端构建与发布。
 *
 *   node scripts/android.mjs init                 生成 gen/android 工程
 *   node scripts/android.mjs dev                  推到设备/模拟器调试
 *   node scripts/android.mjs build --apk --target aarch64
 *   node scripts/android.mjs doctor               只体检工具链，不做任何改动
 *
 * 签名：默认复用本机已有的 debug.keystore（alias androiddebugkey）。
 * 想换正式 key，设 METRO_FARE_ANDROID_KEYSTORE / _KEY_ALIAS / _STORE_PASSWORD / _KEY_PASSWORD。
 *
 * ⚠️ 换签名密钥会导致**无法覆盖安装**，上架前再换。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, execute, publishArtifact, cargoBinDirs } from './runtime.mjs';

const windows = process.platform === 'win32';
const exeName = (name) => name + (windows ? '.exe' : '');
const hasJava = (home) => home && existsSync(path.join(home, 'bin', exeName('javac')));
const children = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name));
  } catch { return []; }
};
const firstDirectory = (paths, marker) => paths.filter(Boolean).find((value) => existsSync(path.join(value, marker)));

/**
 * 取 JDK 主版本号。
 *
 * ⚠️ **不要用 `java -version` 解析**：它把版本写进 **stderr**，而且在中文 Windows
 * 上 PowerShell 包一层后首行会被吞掉，跨行截断后正则匹配不到，导致明明装了 JDK 17
 * 也报「未找到 JDK 17 或 21」。
 * 最可靠的是直接读 JDK 自带的 `release` 文件（形如 `JAVA_VERSION="17.0.11"`）。
 * 兜底用 `javac -version`（写 **stdout**，不受 stderr 问题影响）。
 */
function javaMajor(home) {
  if (!hasJava(home)) return 0;
  const release = path.join(home, 'release');
  if (existsSync(release)) {
    const matched = readFileSync(release, 'utf8').match(/JAVA_VERSION="(?:1\.)?(\d+)/);
    if (matched) return Number(matched[1]);
  }
  const result = spawnSync(path.join(home, 'bin', exeName('javac')), ['-version'], { encoding: 'utf8', windowsHide: true });
  const text = (result.stdout || '') + (result.stderr || '');
  return Number(text.match(/javac\s+(?:1\.)?(\d+)/)?.[1] || text.match(/version "(?:1\.)?(\d+)/)?.[1] || 0);
}

/** 找 JDK 17 或 21 —— 更高版本 Gradle/AGP 会报错。 */
function javaHome() {
  if (process.env.METRO_FARE_JAVA_HOME) {
    if (![17, 21].includes(javaMajor(process.env.METRO_FARE_JAVA_HOME))) {
      throw new Error('METRO_FARE_JAVA_HOME 必须指向 JDK 17 或 21。');
    }
    return process.env.METRO_FARE_JAVA_HOME;
  }
  const configured = process.env.JAVA_HOME;
  if ([17, 21].includes(javaMajor(configured))) return configured;
  const homes = [
    ...(configured ? children(path.dirname(configured)) : []),
    ...children(path.join(path.parse(root).root, 'Program Files', 'Java')),
    ...children(path.join(process.env.ProgramFiles || 'C:/Program Files', 'Java')),
    ...children(path.join(process.env.ProgramFiles || 'C:/Program Files', 'Eclipse Adoptium')),
    ...children('/usr/lib/jvm'),
    ...children('/Library/Java/JavaVirtualMachines').map((value) => path.join(value, 'Contents/Home')),
  ];
  const found = [...new Set(homes)]
    .sort((a, b) => Number(/17/.test(b)) - Number(/17/.test(a)))
    .find((home) => [17, 21].includes(javaMajor(home)));
  if (!found) throw new Error('未找到 JDK 17 或 21。请设 METRO_FARE_JAVA_HOME（不会改动全局 JAVA_HOME）。');
  if (javaMajor(found) !== 17 && javaMajor(configured) !== found) {
    console.warn('⚠️ 未使用 JDK 17，改用 ' + found + '（' + javaMajor(found) + '）');
  }
  return found;
}

function androidEnvironment() {
  const sdk = firstDirectory([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(root, 'build/android/toolchain/android-sdk'),
    path.join(process.env.LOCALAPPDATA || os.homedir(), 'Android/Sdk'),
    path.join(os.homedir(), 'Android/Sdk'),
    path.join(os.homedir(), 'Android/sdk'),
    path.join(os.homedir(), 'Library/Android/sdk'),
  ], 'platform-tools');
  if (!sdk) throw new Error('未找到 Android SDK。请装 Android Studio + SDK/NDK，或设 ANDROID_HOME。');

  const ndk = firstDirectory([
    process.env.NDK_HOME,
    process.env.ANDROID_NDK_HOME,
    ...children(path.join(sdk, 'ndk')).sort((a, b) => path.basename(b).localeCompare(path.basename(a), undefined, { numeric: true })),
  ], 'source.properties');
  if (!ndk) throw new Error('未找到 Android NDK。请用 SDK Manager 装一个，或设 NDK_HOME。');

  const java = javaHome();
  const env = {
    ...process.env,
    JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, NDK_HOME: ndk, ANDROID_NDK_HOME: ndk,
  };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
  // Rust/Cargo 可能装在 D 盘（不在 %USERPROFILE%\.cargo），所以要显式补 PATH，
  // 否则 `npm run android:build` 会以 spawnSync rustup ENOENT 失败。
  const rustupNames = ['rustup', 'rustup.exe'];
  const cargoBins = cargoBinDirs(env).filter((candidate) => rustupNames.some((name) => existsSync(path.join(candidate, name))));
  env[pathKey] = [
    path.join(java, 'bin'),
    path.join(sdk, 'platform-tools'),
    ...cargoBins,
    path.join(env.SystemDrive || 'C:', 'Program Files (x86)', 'mingw64', 'bin'),
    env[pathKey] || '',
  ].filter(Boolean).join(path.delimiter);
  if (windows) env.ProgramData ||= env.ALLUSERSPROFILE || path.join(env.SystemDrive || 'C:', 'ProgramData');

  const rustup = cargoBins.map((dir) => path.join(dir, exeName('rustup'))).find((candidate) => existsSync(candidate)) || 'rustup';
  console.log('Android SDK:', sdk);
  console.log('Android NDK:', ndk);
  console.log('Java:', java);
  console.log('Rust bin:', cargoBins.join(', ') || '(未找到)');
  console.log('Rustup:', rustup);
  return { env };
}

function signingEnvironment(env) {
  const custom = env.METRO_FARE_ANDROID_KEYSTORE;
  if (custom) {
    for (const key of ['METRO_FARE_ANDROID_KEY_ALIAS', 'METRO_FARE_ANDROID_STORE_PASSWORD', 'METRO_FARE_ANDROID_KEY_PASSWORD']) {
      if (!env[key]) throw new Error('自定义签名缺少 ' + key + '。密钥口令只能走环境变量，不要提交到仓库。');
    }
    if (!existsSync(custom)) throw new Error('配置的 Android keystore 不存在。');
    env.METRO_FARE_ANDROID_KEYSTORE = path.resolve(custom);
    return env;
  }
  // 退回本机已有的 debug.keystore —— 能装能测，无需额外建 key。
  const legacy = [
    path.join(env.METRO_FARE_ANDROID_BUILD_HOME || path.join(root, 'build/android/home'), '.android/debug.keystore'),
    path.join(os.homedir(), '.android', 'debug.keystore'),
  ].find((candidate) => existsSync(candidate));
  if (!legacy) {
    throw new Error('未找到任何 Android 签名密钥。请设 METRO_FARE_ANDROID_KEYSTORE 及三个口令变量。');
  }
  env.METRO_FARE_ANDROID_KEYSTORE = legacy;
  env.METRO_FARE_ANDROID_KEY_ALIAS = 'androiddebugkey';
  env.METRO_FARE_ANDROID_STORE_PASSWORD = 'android';
  env.METRO_FARE_ANDROID_KEY_PASSWORD = 'android';
  console.warn('⚠️ 使用本机 DEBUG 签名（androiddebugkey）。正式分发请换独立 release key —— 换 key 会导致无法覆盖安装。');
  return env;
}

/**
 * 取当前默认工具链已安装的 target 列表。
 *
 * ⚠️ **刻意不调用 `rustup target list`**。实测本机用 Node 的 `spawnSync`
 * （直连 / `shell:true` / 各种 env 组合都试过）执行 `D:\Code\cargo\bin\rustup.exe`
 * 一律返回 `EBUSY`——同一个 exe 从 PowerShell 里跑完全正常。这是环境级限制，
 * 不是脚本写法问题。
 *
 * 绕开办法：直接读 rustup 的目录布局 —— 每个已安装 target 会在
 * `<RUSTUP_HOME>/toolchains/<toolchain>/lib/rustlib/<target>/` 下有一个目录。
 * 纯文件系统操作，不依赖任何子进程。
 */
function installedTargets(env) {
  const rustupHome = env.RUSTUP_HOME || path.join(os.homedir(), '.rustup');
  const toolchains = children(path.join(rustupHome, 'toolchains'));
  const found = new Set();
  for (const toolchain of toolchains) {
    const rustlib = path.join(toolchain, 'lib', 'rustlib');
    for (const entry of children(rustlib)) {
      // 过滤掉 components/etc/src 等非 target 目录。
      if (/^(?:[a-z0-9_]+-)+[a-z0-9_]+$/.test(path.basename(entry))) {
        found.add(path.basename(entry));
      }
    }
  }
  return [...found];
}

function ensureTargets(args, command, env) {
  const names = { aarch64: 'aarch64-linux-android', armv7: 'armv7-linux-androideabi', i686: 'i686-linux-android', x86_64: 'x86_64-linux-android' };
  const selected = args.flatMap((argument, index) => argument === '--target' || argument === '-t'
    ? (args[index + 1] || '').split(',')
    : argument.startsWith('--target=') ? argument.slice(9).split(',') : []);
  const targets = selected.length ? selected : command === 'dev' ? ['aarch64', 'x86_64'] : ['aarch64'];
  for (const name of targets) if (!names[name]) throw new Error('不支持的 Android target：' + name);

  const installed = installedTargets(env);
  const missing = targets.map((name) => names[name]).filter((target) => !installed.includes(target));
  if (!missing.length) return;
  // 缺 target 时必须真的装，此时只能调 rustup。若本机 spawn 被拦，
  // 给出**可手工执行**的命令，而不是抛一个看不懂的 EBUSY。
  console.warn('缺少 Rust target：' + missing.join(', ') + '，尝试安装…');
  const result = spawnSync('rustup', ['target', 'add', ...missing], { env, encoding: 'utf8', windowsHide: true, shell: windows });
  if (result.error || result.status !== 0) {
    throw new Error(
      '无法自动安装 Rust target（' + (result.error?.code || ('exit ' + result.status)) + '）。\n'
      + '请手动执行：\n    rustup target add ' + missing.join(' '),
    );
  }
  console.log('已安装：' + missing.join(', '));
}

function findApk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.apk')) return full;
    if (entry.isDirectory()) { const found = findApk(full); if (found) return found; }
  }
  return undefined;
}

try {
  const [command = 'build', ...args] = process.argv.slice(2);
  if (!['init', 'dev', 'build', 'doctor'].includes(command)) {
    throw new Error('用法: node scripts/android.mjs init|dev|build|doctor [Tauri 参数]');
  }
  const { env } = androidEnvironment();
  if (command !== 'doctor') ensureTargets(args, command, env);

  const project = path.join(root, 'src-tauri/gen/android');
  const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');

  if (command === 'init') {
    if (existsSync(path.join(project, 'app/build.gradle.kts'))) {
      console.log('Android 工程已存在，保留其签名与兼容性配置。');
    } else {
      // ⚠️ android init 必须在 src-tauri 内运行吗？不需要；但工程会落到 src-tauri/gen/android。
      execute(process.execPath, [cli, 'android', 'init', '--ci', '--skip-targets-install', ...args], { env });
    }
  } else if (command === 'doctor') {
    console.log('Android 工具链可用。未改动任何全局环境变量。');
  } else {
    if (!existsSync(path.join(project, 'app/build.gradle.kts'))) throw new Error('请先跑 npm run android:init。');
    if (command === 'build') signingEnvironment(env);
    execute(process.execPath, [cli, 'android', command, ...args], { env });
    if (command === 'build') {
      const outputs = path.join(project, 'app/build/outputs/apk');
      if (!existsSync(outputs)) throw new Error('APK 输出目录不存在：' + outputs);
      const apk = findApk(outputs);
      if (!apk) throw new Error('在 ' + outputs + ' 下未找到 APK。');
      const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
      const info = publishArtifact(
        apk,
        path.join(root, 'release/android/地铁票价对比.apk'),
        '地铁票价对比 ' + version + ' Android APK (arm64-v8a)\n',
      );
      console.log('已发布 release/android/地铁票价对比.apk ('
        + (info.size / 1024 / 1024).toFixed(2) + ' MB, sha256 ' + info.digest.slice(0, 16) + '…)');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
