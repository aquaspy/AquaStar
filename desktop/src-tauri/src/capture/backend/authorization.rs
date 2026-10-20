//! Portal restore tokens are private and bound to the original live player process.
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};
#[derive(Serialize, Deserialize, PartialEq, Eq)]
struct Owner {
    pid: u32,
    boot: String,
    started: String,
}
#[derive(Serialize, Deserialize)]
struct Grant {
    owner: Owner,
    token: String,
}
fn owner(pid: u32) -> Option<Owner> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    Some(Owner {
        pid,
        boot: fs::read_to_string("/proc/sys/kernel/random/boot_id").ok()?,
        started: stat
            .rsplit_once(')')?
            .1
            .split_whitespace()
            .nth(19)?
            .to_owned(),
    })
}
fn temporary(path: &Path) -> std::path::PathBuf {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    path.with_extension(format!(
        "{}-{}.pending",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ))
}
pub fn take(path: &Path, pid: u32) -> Option<String> {
    // Atomically claim a single-use token before another capture can consume it.
    let claimed = temporary(path);
    fs::rename(path, &claimed).ok()?;
    let bytes = fs::read(&claimed);
    let _ = fs::remove_file(claimed);
    let grant: Grant = serde_json::from_slice(&bytes.ok()?).ok()?;
    (grant.owner == owner(pid)?).then_some(grant.token)
}
pub fn save(path: &Path, pid: u32, token: &str) -> Result<(), String> {
    use std::os::unix::fs::OpenOptionsExt;
    let owner = owner(pid).ok_or("The original game process has closed.")?;
    fs::create_dir_all(path.parent().ok_or("Invalid authorization path")?)
        .map_err(|e| e.to_string())?;
    let temporary = temporary(path);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        file.write_all(
            &serde_json::to_vec(&Grant {
                owner,
                token: token.to_owned(),
            })
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn token_is_private_single_use_and_bound_to_process() {
        use std::os::unix::fs::PermissionsExt;
        let root =
            std::env::temp_dir().join(format!("aquastar-portal-grant-{}", std::process::id()));
        let path = root.join("grant.json");
        let pid = std::process::id();
        save(&path, pid, "test-token").unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(take(&path, pid + 1).is_none());
        save(&path, pid, "test-token").unwrap();
        assert_eq!(take(&path, pid).as_deref(), Some("test-token"));
        assert!(take(&path, pid).is_none());
        save(&path, pid, "test-token").unwrap();
        let mut grant: Grant = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        grant.owner.started = "different-process-start-time".into();
        fs::write(&path, serde_json::to_vec(&grant).unwrap()).unwrap();
        assert!(take(&path, pid).is_none());
        fs::remove_dir(root).unwrap();
    }
}
