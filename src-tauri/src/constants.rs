use log::LevelFilter;

// Log constants
/// Log file size: 5MB = 5 * 1024 * 1024 = 5242880 Bytes
pub const MAX_LOG_FILE_SIZE: u128 = 5_242_880;
pub const LOG_LEVEL_DEV: LevelFilter = LevelFilter::Trace;
pub const LOG_LEVEL_PROD: LevelFilter = LevelFilter::Info;
/// Rotated log files kept on disk (D3: KeepAll grew without bound).
pub const LOG_FILES_KEPT: usize = 5;
