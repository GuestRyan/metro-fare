//! 全国城市轨道交通票价对比 —— Tauri 2 壳。
//!
//! 本应用是**纯离线数据报告**：页面由 `build.py` 生成的自包含 HTML 提供，
//! 不需要任何 IPC 命令、不需要访问文件系统或网络。因此这里不注册
//! `invoke_handler`，`capabilities/main.json` 也只授予 `core:default`。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("地铁票价对比 无法启动原生应用");
}
