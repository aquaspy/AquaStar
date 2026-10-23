fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let object = out.join("capture_feedback.o");
        let archive = out.join("libaquastar_capture_feedback.a");
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
            "aarch64" => "arm64",
            "x86_64" => "x86_64",
            arch => panic!("Unsupported macOS capture feedback architecture: {arch}"),
        };
        let status = std::process::Command::new("xcrun")
            .args(["clang", "-arch", arch, "-mmacosx-version-min=12.3", "-fobjc-arc", "-fblocks", "-O2", "-c", "src/capture/feedback_macos.m", "-o"])
            .arg(&object)
            .status()
            .expect("Xcode command line tools are required for macOS capture feedback");
        assert!(status.success(), "Failed to build macOS capture feedback");
        let status = std::process::Command::new("xcrun")
            .args(["ar", "crs"])
            .arg(&archive)
            .arg(&object)
            .status()
            .expect("Failed to archive macOS capture feedback");
        assert!(status.success(), "Failed to archive macOS capture feedback");
        println!("cargo:rerun-if-changed=src/capture/feedback_macos.m");
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=aquastar_capture_feedback");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
    }
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
    .expect("Tauri ACL build");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("examples/windows.manifest.xml");
        println!("cargo:rerun-if-changed=examples/windows.manifest.xml");
        println!("cargo:rustc-link-arg-examples=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-examples=/MANIFESTINPUT:{}", manifest.display());
    }
}
