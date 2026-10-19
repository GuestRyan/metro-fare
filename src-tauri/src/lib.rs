// 窗口只承载本地查询页；票价计算和来源查看不需要联网。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("里程票价查询窗口未能启动");
}
