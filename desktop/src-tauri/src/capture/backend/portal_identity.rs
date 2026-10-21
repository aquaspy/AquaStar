//! Uninstalled binaries and AppImages also need a stable portal application ID.
use std::sync::OnceLock;
pub async fn register() -> Result<(), String> {
    static REGISTERED: OnceLock<tauri::async_runtime::Mutex<bool>> = OnceLock::new();
    let mut registered = REGISTERED
        .get_or_init(|| tauri::async_runtime::Mutex::new(false))
        .lock()
        .await;
    if !*registered {
        // Host Registry resolves the ID through a desktop entry. AppImages and local
        // builds may never have been installed; provide portal metadata without
        // adding a launcher menu entry or overwriting an installed application's file.
        let applications = dirs::data_dir()
            .ok_or("Cannot locate portal application metadata")?
            .join("applications");
        std::fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
        let entry = applications.join("io.github.aquaspy.aquastar-lite.desktop");
        use std::io::Write;
        match std::fs::OpenOptions::new().write(true).create_new(true).open(entry) {
            Ok(mut file) => file.write_all(b"[Desktop Entry]\nType=Application\nName=AquaStar\nExec=true\nIcon=applications-games\nNoDisplay=true\n").map_err(|e| e.to_string())?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
            Err(e) => return Err(e.to_string()),
        }
        let mut result = Ok(());
        for attempt in 0..3 {
            result = ashpd::register_host_app(
                "io.github.aquaspy.aquastar-lite"
                    .parse()
                    .map_err(|e| format!("Invalid portal app ID: {e}"))?,
            )
            .await
            .map_err(|e| format!("Cannot register AquaStar with the desktop portal: {e}"));
            if result.is_ok() {
                break;
            }
            // The portal's desktop-file monitor may not have seen a newly created entry yet.
            if attempt < 2 {
                let _ = tauri::async_runtime::spawn_blocking(|| {
                    std::thread::sleep(std::time::Duration::from_millis(200))
                })
                .await;
            }
        }
        result?;
        *registered = true;
    }
    Ok(())
}
