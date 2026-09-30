import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const windows = process.platform === 'win32';
export const executable = (name) => name + (windows ? '.exe' : '');

/** 本机把 Rust/Gradle 缓存放在 D 盘，只有真实存在时才作为兜底。 */
export function toolchainDefaults() {
  return { RUSTUP_HOME: 'D:\\Code\\rustup', CARGO_HOME: 'D:\\Code\\cargo', GRADLE_USER_HOME: 'D:\\cache\\gradle' };
}

/** 找出真正含 cargo/rustup 的 bin 目录（尊重已有 CARGO_HOME，再按常见位置兜底）。 */
export function cargoBinDirs(env = process.env) {
  const candidates = [
    env.CARGO_HOME && path.join(env.CARGO_HOME, 'bin'),
    env.RUSTUP_HOME && path.join(env.RUSTUP_HOME, '..', 'cargo', 'bin'),
    path.join(root, 'build', 'cargo', 'bin'),
    'D:\\Code\\cargo\\bin',
    path.join(os.homedir(), '.cargo', 'bin'),
  ];
  return [...new Set(candidates.filter(Boolean))]
    .filter((dir) => existsSync(path.join(dir, executable('cargo'))) || existsSync(path.join(dir, executable('rustup'))));
}

/**
 * 构建子进程需要的环境变量。从 GUI / 非交互终端启动时 PATH 里往往没有 cargo，
 * 这里显式补齐，保证一键打包与手工在终端里跑得到同样的结果。
 */
export function buildEnvironment() {
  const env = { ...process.env };
  for (const [key, fallback] of Object.entries(toolchainDefaults())) {
    if (!env[key] && existsSync(fallback)) env[key] = fallback;
  }
  const bins = cargoBinDirs(env);
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
  if (bins.length) env[pathKey] = [...bins, env[pathKey] || ''].filter(Boolean).join(path.delimiter);
  if (windows) {
    env.ProgramData ||= env.ALLUSERSPROFILE || path.join(env.SystemDrive || 'C:', 'ProgramData');
    // MinGW 的 windres/dlltool 不在 PATH 时 Tauri 的资源编译会失败。
    const mingw = 'D:\\Program Files (x86)\\mingw64\\bin';
    if (existsSync(mingw) && !String(env[pathKey]).split(path.delimiter).includes(mingw)) {
      env[pathKey] = [mingw, env[pathKey]].filter(Boolean).join(path.delimiter);
    }
  }
  return env;
}

export function execute(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + ' failed with exit code ' + result.status);
}

/** 跑 Python 构建管线（build.py），先生成 地铁票价对比.html 等交付物。 */
export function runBuild() {
  const python = process.env.METRO_FARE_PYTHON
    || ['D:\\Program Files\\Python314\\python.exe']
      .find((candidate) => existsSync(candidate))
    || 'python';
  execute(python, [path.join(root, 'build.py')]);
  return python;
}

/** 给已就位的产物写一份 sha256 旁证文件。 */
export function writeChecksum(file, description) {
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  writeFileSync(file + '.sha256', description + 'SHA256 ' + digest + '\n');
  return { digest, size: statSync(file).size };
}

/**
 * 拷贝产物到发布位置并落一份 sha256 旁证文件。
 * source 与 target 相同会先截断再读，等于把文件清空，调用方必须先保证两者不同。
 */
export function publishArtifact(source, target, description) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  return { target, ...writeChecksum(target, description) };
}
