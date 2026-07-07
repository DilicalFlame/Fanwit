use super::super::constants;

use chrono::Local;
use colored::Colorize;
use log::LevelFilter;
use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_log::{Builder, RotationStrategy, Target, TargetKind};

/// Extracts and normalizes metadata tags from incoming log arguments.
///
/// Parses the custom `[FRONTEND_LOC:file:line]` tag injected by the Svelte frontend,
/// or defaults to the standard Rust backend module paths. It also normalizes
/// OS-specific path separators.
pub fn extract_clean_metadata<'a>(
    message: &std::fmt::Arguments<'a>,
    record: &log::Record,
) -> (String, String, String) {
    let mut file = record.file().unwrap_or("unknown").to_string();
    let mut line = record.line().unwrap_or(0).to_string();

    let raw_message = message.to_string();
    let mut clean_message = raw_message.clone();

    // intercept frontend location tags
    if let Some(start) = raw_message.find("[FRONTEND_LOC:") {
        if let Some(end) = raw_message[start..].find("] ") {
            let loc_str = &raw_message[start + 14..start + end];

            if let Some(colon_idx) = loc_str.rfind(':') {
                file = loc_str[..colon_idx].to_string();
                line = loc_str[colon_idx + 1..].to_string();
            } else {
                file = loc_str.to_string();
                line = "?".to_string();
            }
            clean_message = raw_message[start + end + 2..].to_string();
        }
    } else if file.starts_with("webview::") {
        file = "frontend".to_string();
    } else {
        file = format!("{}", file);
    }

    // normalize paths for the host OS (e.g., Windows vs Unix)
    let os_separator = std::path::MAIN_SEPARATOR.to_string();
    file = file
        .replace("/", &os_separator)
        .replace("\\", &os_separator);

    (file, line, clean_message)
}

/// Initializes and configures the Tauri logging plugin.
///
/// Sets up a multi-target logging architecture:
/// 1. A highly vibrant, scannable stdout for the terminal.
/// 2. A clean, plain-text log file rotated locally on disk.
/// 3. Webview passthrough for browser devtools.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    // enforce ANSI colors explicitly even when piped by Tauri CLI subprocesses
    colored::control::set_override(true);

    #[cfg(windows)]
    let _ = colored::control::set_virtual_terminal(true);

    // determine global log level based on build profile
    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Trace
    } else {
        LevelFilter::Info
    };

    // build and route the plugin instance
    Builder::new()
        .rotation_strategy(RotationStrategy::KeepAll)
        .level(log_level)
        .clear_format()
        .max_file_size(constants::MAX_LOG_FILE_SIZE)
        .targets([
            // TARGET 1: Terminal Console (High Contrast Colors)
            Target::new(TargetKind::Stdout).format(|out, message, record| {
                let time = Local::now().format("%H:%M:%S").to_string();
                let (file, line, clean_message) = extract_clean_metadata(message, record);

                let (level_tag, message_colored) = match record.level() {
                    log::Level::Error => (
                        " ERROR ".black().on_bright_red().bold(),
                        clean_message.red().bold(),
                    ),
                    log::Level::Warn => (
                        " WARN ".black().on_bright_yellow().bold(),
                        clean_message.yellow(),
                    ),
                    log::Level::Info => (
                        " INFO ".black().on_bright_green().bold(),
                        clean_message.normal(),
                    ),
                    log::Level::Debug => (
                        " DEBUG ".black().on_bright_blue().bold(),
                        clean_message.bright_blue(),
                    ),
                    log::Level::Trace => (
                        " TRACE ".black().on_bright_magenta().bold(),
                        clean_message.bright_magenta().italic(),
                    ),
                };

                if cfg!(debug_assertions) {
                    out.finish(format_args!(
                        "{} [{}:{}] [{}] {}",
                        time.truecolor(128, 128, 128),
                        file.bright_cyan(),
                        line.bright_yellow(),
                        level_tag,
                        message_colored
                    ))
                } else {
                    out.finish(format_args!(
                        "{} [{}] {}",
                        time.truecolor(128, 128, 128),
                        level_tag,
                        message_colored
                    ))
                }
            }),
            // TARGET 2: Local App File Log (Plain Text)
            Target::new(TargetKind::LogDir {
                file_name: Some("fanwit.log".to_string()),
            })
            .format(|out, message, record| {
                let time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let (file, line, clean_message) = extract_clean_metadata(message, record);
                let level_str = record.level().to_string();

                if cfg!(debug_assertions) {
                    out.finish(format_args!(
                        "{} [{}:{}] [{}] {}",
                        time, file, line, level_str, clean_message
                    ))
                } else {
                    out.finish(format_args!("{} [{}] {}", time, level_str, clean_message))
                }
            }),
            // TARGET 3: Webview Console Passthrough
            Target::new(TargetKind::Webview),
        ])
        .build()
}
