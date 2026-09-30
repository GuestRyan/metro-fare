# 地铁票价对比 — 发布目录

本目录存放打包产物，**内容不入版本库**（`.gitignore` 用锚定规则 `/release/*` 忽略，只保留本说明与 `web/.gitkeep`）。

```
release/
├── web/                      # Tauri 前端资源（index.html + 原始单文件）
├── windows/                  # Windows 便携版 exe / NSIS 安装包 + sha256
├── android/                  # Android APK + sha256
└── README.md                 # 本文件
```

## 一键打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-all.ps1
# 只要桌面端：      -DesktopOnly
# 只要桌面端+安装包：-DesktopOnly -Installer
# 跳过某一端：      -SkipWindows / -SkipAndroid
```

## 单独打包

```powershell
npm run desktop:build          # 便携版 exe
npm run desktop:installer      # 追加 NSIS 安装包
npm run android:build          # 需先 npm run android:init
```

## 产物命名

- Windows：`release/windows/地铁票价对比.exe`
- Android：`release/android/地铁票价对比.apk`

每个产物旁都有同名 `.sha256` 文本文件。

> ⚠️ 目录中的**中文文件名**在部分终端下会显示成乱码，那是控制台编码问题，文件本身正常。
