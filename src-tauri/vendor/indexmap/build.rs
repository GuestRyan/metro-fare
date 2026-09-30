// ⚠️ 本文件是对 crates.io 上 indexmap 1.9.3 的**本地补丁**，不要用上游版本覆盖。
//
// 上游原版：
//     match std::env::var_os("CARGO_FEATURE_STD") {
//         Some(_) => autocfg::emit("has_std"),
//         None => autocfg::new().emit_sysroot_crate("std"),
//     }
//
// 为什么必须打补丁（README §12.7 有完整记录）：
//   `None` 分支靠 autocfg 探测 sysroot 里有没有 std。在新版 rustc（本机 1.98.1）上
//   这个探测失败，于是即使调用方显式开了 `std` feature，也可能命中
//   `#![no_std]` 那份定义：
//       #[cfg(not(has_std))] pub struct IndexMap<K, V, S> { ... }
//   该定义**没有 `S = RandomState` 默认参数**，导致 schemars 0.8.22 的
//       pub type Map<K, V> = indexmap::IndexMap<K, V>;
//   报 error[E0107]（supplied 2 / expected 3 generic arguments）编译失败。
//
// 本项目的构建目标（Windows / Android）都一定有 std，所以直接无条件发出
// `has_std` 是安全的，也正是下游所期望的。
fn main() {
    // 让 rustc 知道 `has_std` 是我们自己定义的合法 cfg，
    // 否则每个用到它的地方都会刷 unexpected_cfgs 警告。
    println!("cargo:rustc-check-cfg=cfg(has_std)");
    // 无条件声明 has_std：本项目所有目标平台都有 std。
    autocfg::emit("has_std");
    autocfg::rerun_path("build.rs");
}
