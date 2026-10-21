//! A small fontconfig for WebKitGTK on Linux.
//!
//! On a desktop with ~3200 fonts (2380 of them Noto), WebKitGTK 2.50 and 2.52
//! keep `WebKitWebProcess` at 100% CPU and never leave `about:blank`, which
//! looks like a blank white window. A config that does not list
//! `/usr/share/fonts` lets the page commit within about a second.
//!
//! Fontconfig only takes whole directories, and distro font directories can hold
//! thousands of files (Arch puts every TTF in `/usr/share/fonts/TTF`). So the
//! allow-listed files are symlinked into one private directory and only that
//! directory is listed.

use std::path::{Path, PathBuf};

/// Directories searched (not recursively) on Debian/Ubuntu, Fedora and Arch.
pub const SEARCH_DIRS: &[&str] = &[
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/dejavu-sans-fonts",
    "/usr/share/fonts/dejavu-serif-fonts",
    "/usr/share/fonts/dejavu-sans-mono-fonts",
    "/usr/share/fonts/TTF",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/liberation2",
    "/usr/share/fonts/liberation",
    "/usr/share/fonts/liberation-sans-fonts",
    "/usr/share/fonts/liberation-serif-fonts",
    "/usr/share/fonts/liberation-mono-fonts",
    "/usr/share/fonts/truetype/noto",
    "/usr/share/fonts/opentype/noto",
    "/usr/share/fonts/noto",
    "/usr/share/fonts/noto-cjk",
    "/usr/share/fonts/google-noto-sans-cjk-fonts",
    "/usr/share/fonts/google-noto-cjk",
    "/usr/share/fonts/google-noto-color-emoji-fonts",
    "/usr/share/fonts/google-noto-emoji",
    "/usr/share/fonts/google-noto-vf",
    "/usr/share/fonts/google-noto",
    "/usr/share/fonts/google-noto-sans-thai-fonts",
];

/// File-name prefixes that are allowed in. Regular and bold only, so a
/// directory with every Noto weight still contributes a handful of files.
const ALLOWED_PREFIXES: &[&str] = &[
    "DejaVuSans.",
    "DejaVuSans-Bold.",
    "DejaVuSerif.",
    "DejaVuSerif-Bold.",
    "DejaVuSansMono.",
    "DejaVuSansMono-Bold.",
    "LiberationSans-Regular.",
    "LiberationSans-Bold.",
    "LiberationSerif-Regular.",
    "LiberationSerif-Bold.",
    "LiberationMono-Regular.",
    "LiberationMono-Bold.",
    "NotoSans-Regular.",
    "NotoSans-Bold.",
    "NotoSans[",
    "NotoSerif-Regular.",
    "NotoSerif-Bold.",
    "NotoSerif[",
    "NotoSansMono-Regular.",
    "NotoSansCJK-Regular.",
    "NotoSansCJK-Bold.",
    "NotoSansCJKsc-Regular.",
    "NotoSansCJKjp-Regular.",
    "NotoSansCJKkr-Regular.",
    "NotoSansThai-Regular.",
    "NotoSansThai[",
    "NotoColorEmoji.",
];

const FONT_EXTS: &[&str] = &["ttf", "otf", "ttc"];

/// Alias rules from the system config that add no `<dir>`. `50-user.conf` is
/// left out on purpose: it adds `~/.fonts` and `~/.local/share/fonts`, which
/// can be just as large as the system font root.
const SYSTEM_RULES: &[&str] = &[
    "10-hinting-slight.conf",
    "10-sub-pixel-rgb.conf",
    "11-lcdfilter-default.conf",
    "30-metric-aliases.conf",
    "40-nonlatin.conf",
    "45-latin.conf",
    "49-sansserif.conf",
    "60-latin.conf",
    "65-nonlatin.conf",
    "90-synthetic.conf",
];

pub const MAX_FONTS: usize = 48;

pub fn is_allowed(name: &str) -> bool {
    let ext_ok = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| FONT_EXTS.contains(&e.to_ascii_lowercase().as_str()));
    ext_ok && ALLOWED_PREFIXES.iter().any(|p| name.starts_with(p))
}

/// Allow-listed font files in `dirs`, first match per file name wins.
pub fn select_fonts(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut picked: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        let mut names: Vec<_> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(is_allowed))
            .collect();
        names.sort();
        for path in names {
            if picked.len() >= MAX_FONTS {
                return picked;
            }
            if !picked.iter().any(|p| p.file_name() == path.file_name()) {
                picked.push(path);
            }
        }
    }
    picked
}

fn xml_text(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

pub fn fonts_conf(font_dir: &Path, cache_dir: &Path, rules_dir: &Path) -> String {
    let includes: String = SYSTEM_RULES
        .iter()
        .map(|r| {
            format!(
                "  <include ignore_missing=\"yes\">{}</include>\n",
                xml_text(&rules_dir.join(r).to_string_lossy())
            )
        })
        .collect();
    format!(
        "<?xml version=\"1.0\"?>\n<!DOCTYPE fontconfig SYSTEM \"fonts.dtd\">\n<fontconfig>\n  <dir>{}</dir>\n  <cachedir>{}</cachedir>\n{includes}</fontconfig>\n",
        xml_text(&font_dir.to_string_lossy()),
        xml_text(&cache_dir.to_string_lossy()),
    )
}

/// Builds `<base>/fonts` (symlinks), `<base>/fontconfig-cache` and
/// `<base>/fonts.conf`. Safe to run on every start.
pub fn install(base: &Path, dirs: &[PathBuf], rules_dir: &Path) -> std::io::Result<(PathBuf, usize)> {
    let font_dir = base.join("fonts");
    let cache = base.join("fontconfig-cache");
    std::fs::create_dir_all(&cache)?;
    if font_dir.exists() {
        std::fs::remove_dir_all(&font_dir)?;
    }
    std::fs::create_dir_all(&font_dir)?;
    let fonts = select_fonts(dirs);
    for f in &fonts {
        if let Some(name) = f.file_name() {
            std::os::unix::fs::symlink(f, font_dir.join(name))?;
        }
    }
    let conf_path = base.join("fonts.conf");
    let conf = fonts_conf(&font_dir, &cache, rules_dir);
    if std::fs::read_to_string(&conf_path).ok().as_deref() != Some(conf.as_str()) {
        std::fs::write(&conf_path, conf)?;
    }
    Ok((conf_path, fonts.len()))
}

/// `$XDG_CACHE_HOME` or `~/.cache`, else a per-user directory under the temp
/// dir that is created 0700 and must be owned by us.
pub fn base_dir() -> std::io::Result<PathBuf> {
    let home_cache = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .filter(|p| p.is_absolute())
                .map(|h| h.join(".cache"))
        });
    if let Some(c) = home_cache {
        return Ok(c.join("aquastar-lite"));
    }
    private_temp_dir(&std::env::temp_dir())
}

pub fn private_temp_dir(tmp: &Path) -> std::io::Result<PathBuf> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
    let uid = std::fs::metadata("/proc/self")?.uid();
    let dir = tmp.join(format!("aquastar-lite-{uid}"));
    match std::fs::DirBuilder::new().mode(0o700).create(&dir) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => return Err(e),
    }
    let meta = std::fs::symlink_metadata(&dir)?;
    if !meta.is_dir() || meta.uid() != uid || meta.permissions().mode() & 0o077 != 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            format!("{} is not a private directory", dir.display()),
        ));
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("aqlite-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn touch(dir: &Path, names: &[&str]) {
        for n in names {
            std::fs::write(dir.join(n), b"").unwrap();
        }
    }

    #[test]
    fn picks_allowed_files_from_a_large_arch_style_dir() {
        let root = scratch("arch");
        let ttf = root.join("TTF");
        std::fs::create_dir_all(&ttf).unwrap();
        touch(&ttf, &["DejaVuSans.ttf", "DejaVuSans-Oblique.ttf", "LiberationMono-Regular.ttf", "Roboto-Regular.ttf"]);
        for i in 0..500 {
            touch(&ttf, &[&format!("NotoSansOldItalic{i}-Regular.ttf")]);
        }
        let cjk = root.join("noto-cjk");
        std::fs::create_dir_all(&cjk).unwrap();
        touch(&cjk, &["NotoSansCJK-Regular.ttc", "NotoSerifCJK-Regular.ttc"]);
        let got: Vec<String> = select_fonts(&[ttf, cjk])
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(got, ["DejaVuSans.ttf", "LiberationMono-Regular.ttf", "NotoSansCJK-Regular.ttc"]);
    }

    #[test]
    fn same_file_name_in_two_dirs_is_linked_once() {
        let root = scratch("dupe");
        let (a, b) = (root.join("a"), root.join("b"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        touch(&a, &["NotoColorEmoji.ttf"]);
        touch(&b, &["NotoColorEmoji.ttf", "NotoSansThai-Regular.ttf"]);
        let got = select_fonts(&[a.clone(), b.clone()]);
        assert_eq!(got, vec![a.join("NotoColorEmoji.ttf"), b.join("NotoSansThai-Regular.ttf")]);
    }

    #[test]
    fn conf_lists_only_the_private_dir_and_rule_files() {
        let conf = fonts_conf(Path::new("/c/a&b/fonts"), Path::new("/c/cache"), Path::new("/etc/fonts/conf.d"));
        assert_eq!(conf.matches("<dir>").count(), 1);
        assert!(conf.contains("<dir>/c/a&amp;b/fonts</dir>"));
        assert!(conf.contains("<cachedir>/c/cache</cachedir>"));
        assert!(conf.contains("<include ignore_missing=\"yes\">/etc/fonts/conf.d/65-nonlatin.conf</include>"));
        assert!(!conf.contains("50-user.conf"));
        assert!(!conf.contains("/usr/share/fonts"));
    }

    #[test]
    fn install_links_fonts_and_is_idempotent() {
        let root = scratch("install");
        let src = root.join("src");
        std::fs::create_dir_all(&src).unwrap();
        touch(&src, &["DejaVuSans.ttf", "NotoColorEmoji.ttf", "Other.ttf"]);
        let base = root.join("base");
        let first = install(&base, &[src.clone()], Path::new("/etc/fonts/conf.d")).unwrap();
        let second = install(&base, &[src.clone()], Path::new("/etc/fonts/conf.d")).unwrap();
        assert_eq!(first, (base.join("fonts.conf"), 2));
        assert_eq!(second, first);
        let mut linked: Vec<_> = std::fs::read_dir(base.join("fonts"))
            .unwrap()
            .map(|e| std::fs::read_link(e.unwrap().path()).unwrap())
            .collect();
        linked.sort();
        assert_eq!(linked, vec![src.join("DejaVuSans.ttf"), src.join("NotoColorEmoji.ttf")]);
    }

    #[test]
    fn temp_fallback_is_private_and_rejects_a_foreign_dir() {
        let tmp = scratch("tmp");
        let dir = private_temp_dir(&tmp).unwrap();
        assert!(dir.starts_with(&tmp));
        assert_eq!(private_temp_dir(&tmp).unwrap(), dir);
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).unwrap();
        assert!(private_temp_dir(&tmp).is_err());
    }
}
