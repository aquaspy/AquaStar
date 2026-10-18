#[path = "../src/menu_visibility.rs"]
mod menu_visibility;
#[path = "../src/extensions/runtime.rs"]
mod runtime;

use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Mutex};
use tauri::Manager;

struct Results(Mutex<BTreeMap<String, Value>>);
struct MenuChecks(Mutex<Vec<Value>>);

fn menu_check(name: &str, passed: bool) -> Value {
    json!({"name":name,"passed":passed,"extra":""})
}

async fn dispatch_extension(
    app: tauri::AppHandle,
    id: String,
    method: String,
    args: Value,
) -> Result<Value, String> {
    eprintln!("probe API: {id} {method}");
    if method == "host.info" && args.get("seeded") == Some(&Value::Bool(true)) {
        #[cfg(not(target_os = "macos"))]
        {
            let seed = app
                .webview_windows()
                .into_values()
                .next()
                .ok_or("Seed window missing")?;
            let visibility = app.state::<menu_visibility::Visibility>();
            let mut checks = app
                .state::<MenuChecks>()
                .0
                .lock()
                .map_err(|_| "Menu checks unavailable")?
                .clone();
            checks.push(menu_check(
                "existing native menu hidden by default",
                !seed.is_menu_visible().map_err(|error| error.to_string())?,
            ));
            visibility.set(true);
            menu_visibility::apply(&app)?;
            checks.push(menu_check(
                "existing native menu can be shown",
                seed.is_menu_visible().map_err(|error| error.to_string())?,
            ));
            visibility.set(false);
            menu_visibility::apply(&app)?;
            checks.push(menu_check(
                "existing native menu can be hidden again",
                !seed.is_menu_visible().map_err(|error| error.to_string())?,
            ));
            *app.state::<MenuChecks>()
                .0
                .lock()
                .map_err(|_| "Menu checks unavailable")? = checks;
        }
        let base = std::path::PathBuf::from(std::env::var("AQUASTAR_PROBE_PACKAGES").unwrap());
        for plugin in ["probe-one", "probe-two"] {
            runtime::open_tool(&app, plugin, "test", &base.join(plugin), "index.html")?;
        }
    }
    if method == "host.info" && args.get("results").is_some() {
        let state = app.state::<Results>();
        let mut all = state.0.lock().unwrap();
        let mut result = args["results"].clone();
        let tests = result["tests"]
            .as_array_mut()
            .ok_or("Probe tests missing")?;
        #[cfg(not(target_os = "macos"))]
        {
            if id == "probe-one" {
                tests.extend(
                    app.state::<MenuChecks>()
                        .0
                        .lock()
                        .map_err(|_| "Menu checks unavailable")?
                        .clone(),
                );
            }
            let visible = app
                .webview_windows()
                .into_values()
                .filter(|window| {
                    // The caller's loaded test tool carries this exact plugin ID in its title.
                    window.title().is_ok_and(|title| title.ends_with(&id))
                })
                .map(|window| window.is_menu_visible().map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            tests.push(menu_check(
                "new native menus inherit hidden state",
                !visible.is_empty() && visible.iter().all(|value| !value),
            ));
        }
        #[cfg(target_os = "macos")]
        tests.push(json!({"name":"macOS system menu policy","passed":true,"extra":"System menu retained; per-window menu visibility assertions skipped on macOS"}));
        result["ok"] = Value::Bool(tests.iter().all(|test| test["passed"] == true));
        all.insert(id.clone(), result);
        let path = std::env::var("AQUASTAR_PROBE_REPORT").unwrap();
        std::fs::write(path, serde_json::to_vec_pretty(&*all).unwrap()).unwrap();
        if all.len() == 2 {
            let passed = all.values().all(|result| result["ok"] == true);
            app.exit(if passed { 0 } else { 1 });
        }
    }
    Ok(json!({"pluginId":id,"apiVersion":1}))
}

#[tauri::command]
fn get_inventory() -> Value {
    json!({"secret":"must never be available"})
}

#[tauri::command]
fn play() -> Value {
    json!({"secret":"must never launch"})
}

#[tauri::command]
fn probe_secret() -> Value {
    json!({"secret":"unlisted command must remain inaccessible"})
}

fn main() {
    eprintln!("Starting native extension isolation probe");
    let base = std::path::PathBuf::from(std::env::var("AQUASTAR_PROBE_PACKAGES").unwrap());
    let mut context = tauri::generate_context!();
    context.config_mut().identifier =
        format!("io.github.aquaspy.extension-probe-{}", std::process::id());
    context.config_mut().app.windows.clear();
    runtime::configure(
        tauri::Builder::default(),
        vec![
            runtime::PluginSource {
                id: "probe-one".into(),
                root: base.join("probe-one"),
            },
            runtime::PluginSource {
                id: "probe-two".into(),
                root: base.join("probe-two"),
            },
        ],
    )
    .on_page_load(|webview, payload| {
        menu_visibility::apply_to_window(webview);
        eprintln!(
            "probe page: {} {:?} {}",
            webview.label(),
            payload.event(),
            payload.url()
        );
    })
    .manage(Results(Mutex::new(BTreeMap::new())))
    .manage(MenuChecks(Mutex::new(Vec::new())))
    .manage(menu_visibility::Visibility::default())
    .invoke_handler(tauri::generate_handler![
        runtime::extension_invoke,
        get_inventory,
        play,
        probe_secret
    ])
    .setup(move |app| {
        let submenu = tauri::menu::SubmenuBuilder::new(app, "Probe")
            .text("probe-action", "Probe action")
            .build()?;
        let menu = tauri::menu::MenuBuilder::new(app).item(&submenu).build()?;
        app.set_menu(menu)?;
        menu_visibility::apply(app.handle())?;
        if let Some(main) = app.get_webview_window("main") {
            main.hide()?;
        }
        runtime::open_tool(
            app.handle(),
            "probe-one",
            "seed",
            &base.join("probe-one"),
            "seed.html",
        )?;
        Ok(())
    })
    .run(context)
    .expect("native runtime probe");
}
