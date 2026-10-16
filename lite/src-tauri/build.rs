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
    tauri_build::build()
}
