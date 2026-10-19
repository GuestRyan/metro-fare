fn main() {
    // 版本号在上一级，改版时也要重新生成 Windows 文件属性。
    println!("cargo:rerun-if-changed=../package.json");
    tauri_build::build()
}
