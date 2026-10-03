mod constants;
mod fanwit;
mod gen_identity;
mod utils;

#[allow(unused_imports)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let argv: Vec<String> = std::env::args().collect();
    let launch = fanwit::cli::LaunchArgs::parse(&argv);

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // must be the first plugin: a second launch forwards argv here and exits
        builder = builder
            .plugin(tauri_plugin_single_instance::init(fanwit::cli::on_second_instance))
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--headless"])));
    }
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(utils::logger::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(fanwit::State::new(launch))
        .invoke_handler(tauri::generate_handler![
            fanwit::app::fw_app_info,
            fanwit::app::fw_process_alive,
            fanwit::app::fw_secret_get,
            fanwit::app::fw_secret_set,
            fanwit::fs::fw_dirs,
            fanwit::fs::fw_fs_read_text,
            fanwit::fs::fw_fs_read,
            fanwit::fs::fw_fs_write_text,
            fanwit::fs::fw_fs_write,
            fanwit::fs::fw_fs_exists,
            fanwit::fs::fw_fs_stat,
            fanwit::fs::fw_fs_list,
            fanwit::fs::fw_fs_mkdir,
            fanwit::fs::fw_fs_remove,
            fanwit::fs::fw_fs_rename,
            fanwit::fs::fw_fs_trash,
            fanwit::fs::fw_fs_allow_root,
            fanwit::fs::fw_fs_pick_folder,
            fanwit::fs::fw_fs_watch,
            fanwit::fs::fw_fs_unwatch,
            fanwit::toml::fw_toml_merge,
            fanwit::toml::fw_toml_merge_text,
            fanwit::db::fw_db_open,
            fanwit::db::fw_db_exec,
            fanwit::db::fw_db_query,
            fanwit::db::fw_db_batch,
            fanwit::db::fw_db_close,
            fanwit::windows::fw_win_open,
            fanwit::windows::fw_win_feedback,
            fanwit::windows::fw_win_list,
            fanwit::windows::fw_win_system_menu,
            fanwit::cli::fw_cli_ready,
            fanwit::cli::fw_cli_send,
            fanwit::cli::fw_take_launch_paths,
            fanwit::install::fw_installer_lab_load,
            fanwit::install::fw_installer_lab_plan,
        ])
        .setup(|app| {
            fanwit::app::setup(app).map_err(|e| e.into())
        })
        .on_window_event(fanwit::windows::on_window_event)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: reopen the main window on dock click
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(w) = _app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        });
}
