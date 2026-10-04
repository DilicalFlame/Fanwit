//! The `fanwit-plugin:` scheme for plugin iframes (Chapter 14). The frontend hands over a
//! plugin's page files with `fw_plugin_serve`; they are served from memory at `/<id>/<path>`, so
//! built in plugins (bundled into the app, not on disk) and installed ones load the same way.
//! Every response carries a CSP that allows only the plugin's own files: no network, no IPC.

use super::{Result, State};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::http::{Request, Response, StatusCode};

pub const SCHEME: &str = "fanwit-plugin";
const ORIGINS: &str = "fanwit-plugin: http://fanwit-plugin.localhost";

#[derive(Default)]
pub struct PluginFiles {
    served: Mutex<HashMap<String, HashMap<String, Vec<u8>>>>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

#[tauri::command]
pub fn fw_plugin_serve(state: tauri::State<State>, id: String, files: HashMap<String, Vec<u8>>) -> Result<()> {
    if !valid_id(&id) {
        return Err(format!("invalid plugin id {id:?}"));
    }
    if files.keys().any(|p| p.contains("..") || p.starts_with('/')) {
        return Err("plugin file paths must be relative".into());
    }
    state.plugin_files.served.lock().unwrap().insert(id, files);
    Ok(())
}

#[tauri::command]
pub fn fw_plugin_unserve(state: tauri::State<State>, id: String) -> Result<()> {
    state.plugin_files.served.lock().unwrap().remove(&id);
    Ok(())
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "wasm" => "application/wasm",
        _ => "text/plain; charset=utf-8",
    }
}

pub fn csp() -> String {
    format!("default-src 'none'; script-src {ORIGINS}; style-src {ORIGINS} 'unsafe-inline'; img-src {ORIGINS} data: blob:; font-src {ORIGINS} data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'")
}

/// Look up `/<id>/<path>` among the served files.
pub fn respond(files: &PluginFiles, uri_path: &str) -> Response<Vec<u8>> {
    let path = uri_path.trim_start_matches('/');
    let (id, rest) = path.split_once('/').unwrap_or((path, ""));
    let rest = if rest.is_empty() { "index.html" } else { rest };
    let body = files.served.lock().unwrap().get(id).and_then(|f| f.get(rest).cloned());
    let builder = Response::builder().header("Content-Security-Policy", csp()).header("X-Content-Type-Options", "nosniff").header("Cache-Control", "no-store");
    match body {
        Some(b) => builder.header("Content-Type", content_type(rest)).body(b),
        None => builder.status(StatusCode::NOT_FOUND).body(b"not found".to_vec()),
    }
    .unwrap()
}

pub fn handle<R: tauri::Runtime>(ctx: tauri::UriSchemeContext<'_, R>, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    use tauri::Manager;
    let state = ctx.app_handle().state::<State>();
    respond(&state.plugin_files, req.uri().path())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_only_registered_files_with_a_strict_csp() {
        let f = PluginFiles::default();
        f.served.lock().unwrap().insert("sketch-pad".into(), HashMap::from([("ui.html".into(), b"<p>hi</p>".to_vec())]));
        let ok = respond(&f, "/sketch-pad/ui.html");
        assert_eq!(ok.status(), StatusCode::OK);
        assert!(ok.headers()["Content-Security-Policy"].to_str().unwrap().contains("connect-src 'none'"));
        assert_eq!(respond(&f, "/sketch-pad/../other/ui.html").status(), StatusCode::NOT_FOUND);
        assert_eq!(respond(&f, "/other/ui.html").status(), StatusCode::NOT_FOUND);
        assert!(valid_id("word-count") && !valid_id("../x") && !valid_id("A"));
    }
}
