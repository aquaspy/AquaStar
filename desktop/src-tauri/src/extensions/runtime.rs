use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const SDK: &str = include_str!("sdk.js");
const MAX_ASSET: u64 = 32 * 1024 * 1024;

fn content_security_policy(scheme: &str) -> String {
    let source = format!("{scheme}: https://{scheme}.localhost");
    format!("default-src 'none'; script-src 'self' {source}; style-src 'self' {source} 'unsafe-inline'; img-src 'self' {source} data:; font-src 'self' {source}; media-src 'self' {source}; connect-src ipc: https://ipc.localhost; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
}

#[derive(Clone)]
pub struct PluginSource {
    pub id: String,
    pub root: PathBuf,
}

#[derive(Clone)]
struct Caller {
    plugin_id: String,
    scheme: String,
    root: PathBuf,
}

#[derive(Default)]
pub struct Runtime {
    sources: HashMap<String, PluginSource>,
    callers: Mutex<HashMap<String, Caller>>,
}

fn scheme(id: &str) -> String {
    let digest = format!("{:x}", Sha256::digest(id.as_bytes()));
    format!("aquastar-ext-{}", &digest[..32])
}

fn label(plugin_id: &str, tool_id: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(plugin_id.as_bytes());
    digest.update([0]);
    digest.update(tool_id.as_bytes());
    format!("extension-{:x}", digest.finalize())
}

fn origin_matches(url: &tauri::Url, scheme: &str) -> bool {
    if cfg!(target_os = "windows") {
        url.scheme() == "https"
            && url.host_str() == Some(format!("{scheme}.localhost").as_str())
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
    } else {
        url.scheme() == scheme
            && url.host_str() == Some("localhost")
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
    }
}

fn protocol_origin_matches(url: &tauri::Url, scheme: &str) -> bool {
    url.scheme() == scheme
        && url.host_str() == Some("localhost")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

fn relative_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.contains(['\\', '\0', ':']) {
        return Err("invalid extension asset path".into());
    }
    let path = Path::new(raw);
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("extension assets must stay inside their package".into());
    }
    Ok(path.to_owned())
}

fn decode_path(raw: &str) -> Result<String, String> {
    let bytes = raw.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let pair = bytes.get(i + 1..i + 3).ok_or("bad URL encoding")?;
            let pair = std::str::from_utf8(pair).map_err(|_| "bad URL encoding")?;
            decoded.push(u8::from_str_radix(pair, 16).map_err(|_| "bad URL encoding")?);
            i += 3;
        } else {
            decoded.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| "invalid extension asset name".into())
}

fn asset_path(root: &Path, raw: &str) -> Result<PathBuf, String> {
    let relative = relative_path(&decode_path(raw)?)?;
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "extension asset not found")?;
    if !target.starts_with(root) || !target.is_file() {
        return Err("extension asset is outside its package".into());
    }
    if std::fs::metadata(&target).map_err(|e| e.to_string())?.len() > MAX_ASSET {
        return Err("extension asset is too large".into());
    }
    Ok(target)
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

pub fn configure(
    mut builder: tauri::Builder<tauri::Wry>,
    sources: Vec<PluginSource>,
) -> tauri::Builder<tauri::Wry> {
    let mut runtime = Runtime::default();
    for source in sources {
        let registered_scheme = scheme(&source.id);
        let expected_id = source.id.clone();
        runtime.sources.insert(source.id.clone(), source);
        builder =
            builder.register_uri_scheme_protocol(registered_scheme.clone(), move |ctx, request| {
                let result = (|| -> Result<(Vec<u8>, &'static str), String> {
                    if request.method() != tauri::http::Method::GET {
                        return Err("only asset reads are allowed".into());
                    }
                    let url: tauri::Url = request
                        .uri()
                        .to_string()
                        .parse()
                        .map_err(|_| "invalid extension URL")?;
                    if !protocol_origin_matches(&url, &registered_scheme) {
                        return Err("incorrect extension origin".into());
                    }
                    let state = ctx.app_handle().state::<Runtime>();
                    let caller = state
                        .callers
                        .lock()
                        .map_err(|_| "extension runtime unavailable")?
                        .get(ctx.webview_label())
                        .cloned()
                        .ok_or("unknown extension caller")?;
                    if caller.plugin_id != expected_id || caller.scheme != registered_scheme {
                        return Err("extension package access denied".into());
                    }
                    let path = asset_path(
                        &caller.root,
                        url.path().strip_prefix('/').unwrap_or(url.path()),
                    )?;
                    let body = std::fs::read(&path).map_err(|_| "extension asset unavailable")?;
                    Ok((body, content_type(&path)))
                })();
                let (status, body, mime) = match result {
                    Ok((body, mime)) => (200, body, mime),
                    Err(error) => {
                        #[cfg(debug_assertions)]
                        eprintln!("extension asset denied: {error}");
                        let _ = error;
                        (
                            403,
                            b"Extension asset unavailable".to_vec(),
                            "text/plain; charset=utf-8",
                        )
                    }
                };
                tauri::http::Response::builder()
                    .status(status)
                    .header("Content-Type", mime)
                    .header(
                        "Content-Security-Policy",
                        content_security_policy(&registered_scheme),
                    )
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Cache-Control", "no-store")
                    .header("Referrer-Policy", "no-referrer")
                    .body(body)
                    .unwrap()
            });
    }
    builder.manage(runtime)
}

pub fn open_tool(
    app: &tauri::AppHandle,
    plugin_id: &str,
    tool_id: &str,
    root: &Path,
    entry: &str,
) -> Result<(), String> {
    let state = app.state::<Runtime>();
    let source = state
        .sources
        .get(plugin_id)
        .ok_or("extension is not active; restart AquaStar")?;
    let root = root
        .canonicalize()
        .map_err(|_| "extension package unavailable")?;
    if source
        .root
        .canonicalize()
        .map_err(|_| "extension package unavailable")?
        != root
    {
        return Err("incorrect extension package".into());
    }
    let entry = relative_path(entry)?;
    asset_path(&root, entry.to_str().ok_or("invalid tool path")?)?;
    let label = label(plugin_id, tool_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    let scheme = scheme(plugin_id);
    let base = format!("{scheme}://localhost/");
    let mut url: tauri::Url = base.parse().map_err(|_| "invalid extension origin")?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "invalid extension path")?;
        segments.pop_if_empty();
        for part in entry.components() {
            segments.push(part.as_os_str().to_str().ok_or("invalid extension path")?);
        }
    }
    state
        .callers
        .lock()
        .map_err(|_| "extension runtime unavailable")?
        .insert(
            label.clone(),
            Caller {
                plugin_id: plugin_id.into(),
                scheme: scheme.clone(),
                root,
            },
        );
    let close_app = app.clone();
    let close_label = label.clone();
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::CustomProtocol(url))
        .title(format!("AquaStar — {plugin_id}"))
        .inner_size(900.0, 700.0)
        .incognito(true)
        .use_https_scheme(true)
        .devtools(false)
        .initialization_script(SDK)
        .on_navigation(move |url| origin_matches(url, &scheme))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny);
    let builder = builder.data_directory(
        app.path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("extension-webviews")
            .join(&label),
    );
    match builder.build() {
        Ok(window) => {
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    if let Ok(mut callers) = close_app.state::<Runtime>().callers.lock() {
                        callers.remove(&close_label);
                    }
                }
            });
            Ok(())
        }
        Err(error) => {
            if let Ok(mut callers) = state.callers.lock() {
                callers.remove(&label);
            }
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub async fn extension_invoke(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    method: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let caller = app
        .state::<Runtime>()
        .callers
        .lock()
        .map_err(|_| "extension runtime unavailable")?
        .get(webview.label())
        .cloned()
        .ok_or("unknown extension caller")?;
    if !origin_matches(&webview.url().map_err(|e| e.to_string())?, &caller.scheme) {
        return Err("extension origin denied".into());
    }
    if !matches!(
        method.as_str(),
        "storage.get"
            | "storage.set"
            | "storage.remove"
            | "net.fetch"
            | "actions.run"
            | "host.info"
    ) {
        return Err("unknown extension API method".into());
    }
    super::dispatch_extension(app, caller.plugin_id, method, args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_reject_traversal_and_platform_escapes() {
        for path in [
            "../secret",
            "/secret",
            "a/../../secret",
            "C:/secret",
            "a\\secret",
            "a\0secret",
            "",
        ] {
            assert!(relative_path(path).is_err(), "{path:?}");
        }
        assert!(asset_path(Path::new("/unused"), "%2e%2e/secret").is_err());
        assert!(asset_path(Path::new("/unused"), "..%5csecret").is_err());
        assert!(decode_path("bad%xx").is_err());
        assert!(decode_path("bad%").is_err());
        assert_eq!(
            relative_path("tools/index.html").unwrap(),
            PathBuf::from("tools/index.html")
        );
    }

    #[test]
    fn identities_and_origins_are_separate() {
        assert_ne!(scheme("one"), scheme("two"));
        assert_ne!(label("a", "bc"), label("ab", "c"));
        let own = scheme("one");
        assert!(own.len() <= 63);
        assert!(format!("{own}://localhost/index.html")
            .parse::<tauri::http::Uri>()
            .is_ok());
        let base = if cfg!(target_os = "windows") {
            format!("https://{own}.localhost/index.html")
        } else {
            format!("{own}://localhost/index.html")
        };
        assert!(origin_matches(&base.parse().unwrap(), &own));
        for foreign in [
            "https://example.com",
            "tauri://localhost",
            "file:///tmp/plugin.html",
            "https://aquastar-ext-one.localhost.evil.com",
        ] {
            assert!(!origin_matches(&foreign.parse().unwrap(), &own));
        }
        assert!(protocol_origin_matches(
            &format!("{own}://localhost/tool.html").parse().unwrap(),
            &own
        ));
        assert!(!protocol_origin_matches(
            &format!("{own}://foreign/tool.html").parse().unwrap(),
            &own
        ));
    }

    #[test]
    fn assets_cannot_follow_links_outside_the_package() {
        let base =
            std::env::temp_dir().join(format!("aquastar-runtime-assets-{}", std::process::id()));
        let root = base.join("package");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("index.html"), b"safe").unwrap();
        std::fs::write(base.join("private.txt"), b"private").unwrap();
        let canonical = root.canonicalize().unwrap();
        assert_eq!(
            asset_path(&canonical, "index.html").unwrap(),
            canonical.join("index.html")
        );
        assert!(asset_path(&canonical, "../private.txt").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(base.join("private.txt"), root.join("escape.txt")).unwrap();
            assert!(asset_path(&canonical, "escape.txt").is_err());
        }
        std::fs::remove_dir_all(base).unwrap();
    }
}
