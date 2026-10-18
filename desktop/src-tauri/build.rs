fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let so = out.join("libaquastar_flash_gtk.so");
        let status = std::process::Command::new("gcc")
            .args(["-shared", "-fPIC", "-O2", "src/players/flash_gtk.c", "-o"])
            .arg(&so)
            .arg("-ldl")
            .status()
            .expect("gcc is required to build the Flash chrome helper");
        if !status.success() {
            panic!("gcc failed to build libaquastar_flash_gtk.so");
        }
        println!("cargo:rerun-if-changed=src/players/flash_gtk.c");
    }
    // Keep the application ACL exhaustive as command handlers are added.
    let source = include_str!("src/main.rs");
    let handlers = source
        .split_once("tauri::generate_handler![")
        .expect("command registry")
        .1
        .split_once("])")
        .expect("command registry end")
        .0;
    let commands: Vec<&str> = handlers
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|name| name.rsplit("::").next().unwrap())
        .collect();
    let commands = Box::leak(commands.into_boxed_slice());
    println!("cargo:rerun-if-changed=src/main.rs");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("Tauri ACL build")
}
