use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Adobe's standalone projector trailer. The movie is appended to a copy of the
/// player, then this magic and the movie length, both little-endian.
pub const MAGIC: u32 = 0xFA123456;

/// Loads Loader4 in the remote sandbox. `Security.allowDomain` lets that movie
/// script the projector shell. The stage is the game's 960×550.
const LOADER: &[u8] = include_bytes!("aqw_loader.swf");

pub fn append_projector(player: &[u8], swf: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(player.len() + swf.len() + 8);
    out.extend_from_slice(player);
    out.extend_from_slice(swf);
    out.extend_from_slice(&MAGIC.to_le_bytes());
    out.extend_from_slice(&(swf.len() as u32).to_le_bytes());
    out
}

pub fn is_embedded(exe: &Path) -> bool {
    exe.ancestors()
        .any(|path| path.file_name().and_then(|name| name.to_str()) == Some("flash-projector"))
}

/// Linux returns the bundled player. Its GTK build does not read this trailer
/// (the `0xFA123456` check runs against the ELF header, and the window stays the
/// empty 640×520 shell). Windows and macOS get a copy under app data.
pub fn place(source_exe: &Path, players_dir: &Path) -> Result<PathBuf, String> {
    if cfg!(any(windows, target_os = "macos")) {
        write_projector(source_exe, &players_dir.join("flash-projector"), LOADER)
            .map_err(|err| format!("could not build the Flash projector: {err}"))
    } else {
        Ok(source_exe.to_path_buf())
    }
}

pub fn write_projector(source_exe: &Path, dest_root: &Path, swf: &[u8]) -> io::Result<PathBuf> {
    let source_bytes = fs::read(source_exe)?;
    let stamp = stamp_of(&source_bytes, swf);
    let dest_exe = dest_exe(source_exe, dest_root);
    let stamp_path = dest_root.join(".stamp");
    if fs::read_to_string(&stamp_path).ok().as_deref() == Some(stamp.as_str()) && dest_exe.is_file()
    {
        return Ok(dest_exe);
    }
    if dest_root.exists() {
        fs::remove_dir_all(dest_root)?;
    }
    if let Some(bundle) = app_bundle(source_exe) {
        copy_tree(bundle, &dest_root.join(bundle.file_name().unwrap()))?;
    } else {
        fs::create_dir_all(dest_root)?;
        fs::copy(source_exe, &dest_exe)?;
    }
    // macOS 11 and later rejects a Mach-O whose signature does not match the
    // bytes on disk. Resigning after the append moves __LINKEDIT and drops
    // the trailer, so the signature comes off first.
    unsign_copied_player(&dest_exe)?;
    let player = fs::read(&dest_exe)?;
    fs::write(&dest_exe, append_projector(&player, swf))?;
    set_executable(&dest_exe)?;
    fs::write(&stamp_path, stamp)?;
    Ok(dest_exe)
}

#[cfg(target_os = "macos")]
const PROJECTOR_STAMP_LAYOUT: u8 = 2;

fn stamp_of(player: &[u8], swf: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(player);
    hasher.update(swf);
    #[cfg(target_os = "macos")]
    hasher.update([PROJECTOR_STAMP_LAYOUT]);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_macho(bytes: &[u8]) -> bool {
    matches!(
        bytes.get(..4),
        Some([0xFE, 0xED, 0xFA, 0xCE])
            | Some([0xFE, 0xED, 0xFA, 0xCF])
            | Some([0xCE, 0xFA, 0xED, 0xFE])
            | Some([0xCF, 0xFA, 0xED, 0xFE])
            | Some([0xCA, 0xFE, 0xBA, 0xBE])
            | Some([0xBE, 0xBA, 0xFE, 0xCA])
    )
}

fn signature_target(exe: &Path) -> &Path {
    app_bundle(exe).unwrap_or(exe)
}

fn unsign_copied_player(exe: &Path) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let bytes = fs::read(exe)?;
        if !is_macho(&bytes) {
            return Ok(());
        }
        let status = std::process::Command::new("codesign")
            .arg("--remove-signature")
            .arg(signature_target(exe))
            .status()?;
        if status.success() {
            return Ok(());
        }
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("codesign --remove-signature exited {status}"),
        ));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = exe;
        Ok(())
    }
}

fn app_bundle(exe: &Path) -> Option<&Path> {
    exe.ancestors()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
}

fn dest_exe(source: &Path, dest_root: &Path) -> PathBuf {
    if let Some(bundle) = app_bundle(source) {
        let relative = source.strip_prefix(bundle).expect("exe is inside its .app");
        dest_root.join(bundle.file_name().unwrap()).join(relative)
    } else {
        dest_root.join(source.file_name().unwrap())
    }
}

fn copy_tree(src: &Path, dst: &Path) -> io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst)?;
        Ok(())
    }
}

fn set_executable(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macho_magic_is_a_projector_and_a_payload_is_not() {
        assert!(is_macho(&[0xCF, 0xFA, 0xED, 0xFE]));
        assert!(is_macho(&[0xCE, 0xFA, 0xED, 0xFE]));
        assert!(is_macho(&[0xCA, 0xFE, 0xBA, 0xBE]));
        assert!(!is_macho(b"player-bytes"));
        assert!(!is_macho(b"MZ\x90\x00"));
    }

    #[test]
    fn signature_removal_targets_the_app_bundle() {
        let exe = Path::new("/tmp/Flash Player.app/Contents/MacOS/Flash Player");
        assert_eq!(signature_target(exe), Path::new("/tmp/Flash Player.app"));
        assert_eq!(
            signature_target(Path::new("/tmp/flashplayer_32_sa.exe")),
            Path::new("/tmp/flashplayer_32_sa.exe")
        );
    }

    #[test]
    fn trailer_is_magic_then_length_after_the_movie() {
        let player = b"PLAYER";
        let swf = b"FWS-movie";
        let out = append_projector(player, swf);
        assert!(out.starts_with(player));
        assert_eq!(&out[player.len()..player.len() + swf.len()], swf);
        let tail = &out[out.len() - 8..];
        assert_eq!(u32::from_le_bytes(tail[0..4].try_into().unwrap()), MAGIC);
        assert_eq!(
            u32::from_le_bytes(tail[4..8].try_into().unwrap()),
            swf.len() as u32
        );
    }

    #[test]
    fn the_loader_names_the_aqw_movie() {
        assert!(LOADER.starts_with(b"CWS") || LOADER.starts_with(b"FWS"));
        let text = inflate_strings(LOADER);
        assert!(text.contains("https://game.aq.com/game/gamefiles/Loader4.swf?ver=b"));
    }

    #[test]
    fn a_copy_gets_the_trailer_and_the_source_does_not() {
        let dir = std::env::temp_dir().join(format!("aquastar-projector-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let src_dir = dir.join("src");
        let app = src_dir.join("Flash Player.app");
        let exe = app.join("Contents").join("MacOS").join("Flash Player");
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(app.join("Contents").join("Info.plist"), b"bundle").unwrap();
        fs::write(&exe, b"player-bytes").unwrap();
        let dest = dir.join("flash-projector");
        let built = write_projector(&exe, &dest, b"SWF").unwrap();
        assert!(is_embedded(&built));
        assert_eq!(fs::read(&exe).unwrap(), b"player-bytes");
        let plist = built.parent().unwrap().parent().unwrap().join("Info.plist");
        assert_eq!(fs::read(plist).unwrap(), b"bundle");
        let body = fs::read(&built).unwrap();
        assert!(body.starts_with(b"player-bytes"));
        assert_eq!(&body[body.len() - 4..], &(3u32).to_le_bytes());
        let again = write_projector(&exe, &dest, b"SWF").unwrap();
        assert_eq!(fs::read(again).unwrap(), body);
        let _ = fs::remove_dir_all(&dir);
    }

    fn inflate_strings(bytes: &[u8]) -> String {
        if bytes.starts_with(b"CWS") {
            let inflated = inflate::inflate_bytes(&bytes[8..]).expect("loader swf");
            String::from_utf8_lossy(&inflated).into_owned()
        } else {
            String::from_utf8_lossy(bytes).into_owned()
        }
    }
}

mod inflate {
    use std::io::Read;

    pub fn inflate_bytes(bytes: &[u8]) -> std::io::Result<Vec<u8>> {
        let mut decoder = flate2::read::ZlibDecoder::new(bytes);
        let mut out = Vec::new();
        decoder.read_to_end(&mut out)?;
        Ok(out)
    }
}
