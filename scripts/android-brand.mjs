/**
 * 把 Tauri 自动生成的 `src-tauri/gen/android` 工程改造成本项目发布需要的形态。
 *
 *   node scripts/android-brand.mjs
 *
 * 为什么需要：`gen/android` 是 `tauri android init` 的**生成物**，重新 init 会被覆盖；
 * 而生成出来的模板**不含 release 签名配置**，直接 `android build` 会产出**未签名 APK**。
 * 把「必须手工改的地方」固化成幂等脚本，init 之后跑一次即可。
 *
 * ⚠️ Tauri 生成时已按 tauri.conf.json 自动填好了这些，**不需要**再改：
 *   namespace / applicationId = com.metrofare.app、app_name、minSdk = 24、
 *   compileSdk/targetSdk = 36、AndroidManifest 的 theme 引用、主题名 Theme.metro_fare。
 * 这里只补生成器没做的事。
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './runtime.mjs';

const ANDROID = path.join(root, 'src-tauri/gen/android');
const APP = path.join(ANDROID, 'app/src/main');
const GRADLE = path.join(ANDROID, 'app/build.gradle.kts');

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

/** 在文件里替换若干对字符串；返回是否有变化。 */
function replaceIn(file, pairs) {
  const text = read(file);
  if (text === null) { console.warn('跳过（不存在）：' + path.relative(root, file)); return false; }
  let next = text, changed = false;
  for (const [from, to] of pairs) {
    if (next.includes(from)) { next = next.split(from).join(to); changed = true; }
  }
  if (changed) writeFileSync(file, next, { encoding: 'utf8' });
  return changed;
}

const results = [];

// ── ① 补 release 签名配置 ────────────────────────────────────────────────
// 生成器不带 signingConfigs，release 构建会产出未签名 APK（Gradle 不会报错，
// 装的时候才发现）。这里注入一段读环境变量的 signingConfig。
const SIGNING_MARK = 'metro-fare: signing config';
const SIGNING_BLOCK = `
    // ⚠️ ${SIGNING_MARK} —— 由 scripts/android-brand.mjs 注入，重新 init 后需重跑。
    // 密钥口令只走环境变量（scripts/android.mjs 负责注入），绝不入库。
    // 未设置 METRO_FARE_ANDROID_KEYSTORE 时 signingConfig 为 null，
    // release APK 会是**未签名**的 —— 仅用于本机验证，不要对外分发。
    val metroFareKeystore = System.getenv("METRO_FARE_ANDROID_KEYSTORE")
    signingConfigs {
        if (!metroFareKeystore.isNullOrBlank()) {
            create("configured") {
                storeFile = file(metroFareKeystore)
                storePassword = System.getenv("METRO_FARE_ANDROID_STORE_PASSWORD")
                keyAlias = System.getenv("METRO_FARE_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("METRO_FARE_ANDROID_KEY_PASSWORD")
            }
        }
    }
`;

const gradleText = read(GRADLE);
if (gradleText === null) {
  console.warn('跳过（不存在）：' + path.relative(root, GRADLE));
} else if (gradleText.includes(SIGNING_MARK)) {
  results.push(['签名配置', false]);
} else {
  // 插在 defaultConfig 块结束之后、buildTypes 之前。
  const anchor = '    buildTypes {';
  if (!gradleText.includes(anchor)) throw new Error('在 build.gradle.kts 里没找到 buildTypes 锚点，请人工检查。');
  let next = gradleText.replace(anchor, SIGNING_BLOCK.trimEnd() + '\n\n' + anchor);
  // release 块里挂上 signingConfig。用正则匹配 `getByName("release") {` 之后的
  // 第一处 `isMinifyEnabled`，避免依赖具体缩进（生成器版本间缩进会变）。
  const before = next;
  next = next.replace(
    /(getByName\("release"\)\s*\{\s*\n)(\s*)/,
    '$1$2signingConfig = signingConfigs.findByName("configured")\n$2',
  );
  if (next === before) throw new Error('未能给 release 块挂上 signingConfig，请人工检查 build.gradle.kts。');
  writeFileSync(GRADLE, next, { encoding: 'utf8' });
  results.push(['签名配置', true]);
}

// ── ② Gradle wrapper 版本对齐 ────────────────────────────────────────────
// ⚠️ 生成器写的是 gradle-8.14.3-bin，但本机 **只缓存了 8.14-all**，
// 而 build.gradle 里 Gradle 需要连 services.gradle.org 下载（本机不通，超时失败）。
// 对齐到已缓存的 8.14-all 即可离线构建（-all 是 -bin 的超集）。
const WRAPPER = path.join(ANDROID, 'gradle/wrapper/gradle-wrapper.properties');
results.push(['Gradle wrapper -> 8.14-all', replaceIn(WRAPPER, [
  ['gradle-8.14.3-bin.zip', 'gradle-8.14-all.zip'],
])]);

// ── ③ BuildTask.kt：把 node 启动方式改成 npm ─────────────────────────────
// ⚠️ **这是 APK 构建最容易卡住的地方。**
// Tauri 生成的 BuildTask.kt 会写死 executable = "…\node.exe"（或 node），
// 参数为 ["tauri", "android", "android-studio-script"]。这套组合要求 node 本身
// 能解析出 `tauri` —— 也就是当 node 是**包管理器 shim** 时才成立；用真实
// node.exe 跑会直接 `Cannot find module '…\tauri'`（MODULE_NOT_FOUND），
// 表现为 Gradle 报：
//     Execution failed for task ':app:rustBuildArm64Release'.
//     > A problem occurred starting process 'command '…\node.bat''
// （node.bat 是它挨个试 .exe/.cmd/.bat 兜底后的最后一个，所以报的是 .bat）
// 正确姿势（与 FxxkBox 一致）：executable = "npm"，
// args = ["run", "--", "tauri", "android", "android-studio-script", …]，
// 由 npm 去 node_modules/.bin 里解析 tauri。package.json 里需有 "tauri": "tauri"。
const BUILD_TASK = path.join(ANDROID, 'buildSrc/src/main/java/com/metrofare/app/kotlin/BuildTask.kt');
const EXEC_MARK = 'metro-fare: npm launcher';
{
  const taskText = read(BUILD_TASK);
  if (taskText === null) {
    results.push(['BuildTask 启动方式 -> npm', false]);
  } else {
    let next = taskText, changed = false;
    // executable = """..."""  →  """npm"""
    const execRe = /val executable = """[^"]*"""/;
    if (execRe.test(next)) { next = next.replace(execRe, 'val executable = """npm"""'); changed = true; }
    // args = listOf("tauri", ...)  →  listOf("run", "--", "tauri", ...)
    const ARGS_FROM = 'val args = listOf("tauri", "android", "android-studio-script");';
    const ARGS_TO = 'val args = listOf("run", "--", "tauri", "android", "android-studio-script"); // ' + EXEC_MARK;
    if (next.includes(ARGS_FROM)) { next = next.replace(ARGS_FROM, ARGS_TO); changed = true; }
    if (changed) writeFileSync(BUILD_TASK, next, { encoding: 'utf8' });
    results.push(['BuildTask 启动方式 -> npm', changed]);
  }
}

// ── ④ 图标：tauri icon 写到 src-tauri/icons/android，拷进工程 res/ 才生效 ──
const iconSrc = path.join(root, 'src-tauri/icons/android');
if (existsSync(iconSrc)) {
  cpSync(iconSrc, path.join(APP, 'res'), { recursive: true });
  results.push(['图标 -> res/mipmap-*', true]);
} else {
  results.push(['图标 -> res/mipmap-*', false]);
}

console.log('\nAndroid 工程改造结果：');
for (const [what, changed] of results) console.log('  ' + (changed ? '✔ 已更新  ' : '· 无需改  ') + what);
console.log('\n提示：重新 `npm run android:init` 生成工程后，请再跑一次本脚本。');
