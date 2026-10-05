//! SQLite for every scope (Section 12.5): bundled SQLite with JSON1 and FTS5, WAL journal,
//! busy timeout, one connection per database file guarded by a mutex (single writer), and
//! owner namespacing enforced with SQLite's authorizer for runtime plugins.

use super::{err, Result, State};
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct DbState {
    next: AtomicU32,
    by_path: Mutex<HashMap<String, u32>>,
    conns: Mutex<HashMap<u32, Arc<Mutex<Connection>>>>,
}

fn param(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn column(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::from(b.to_vec()),
    }
}

/// Allow only tables prefixed `<owner>__` (plus migration bookkeeping and schema reads).
fn guard(owner: String) -> impl for<'r> FnMut(AuthContext<'r>) -> Authorization + Send + 'static {
    let prefix = format!("{owner}__");
    move |ctx: AuthContext<'_>| {
        let ok = |t: &str| t.starts_with(&prefix) || t == "_fanwit_migrations" || t.starts_with("sqlite_");
        let allowed = match ctx.action {
            AuthAction::CreateTable { table_name }
            | AuthAction::DropTable { table_name }
            | AuthAction::Insert { table_name }
            | AuthAction::Delete { table_name }
            | AuthAction::Read { table_name, .. }
            | AuthAction::Update { table_name, .. }
            | AuthAction::CreateIndex { table_name, .. }
            | AuthAction::DropIndex { table_name, .. }
            | AuthAction::AlterTable { table_name, .. }
            | AuthAction::CreateTrigger { table_name, .. }
            | AuthAction::DropTrigger { table_name, .. }
            | AuthAction::CreateVtable { table_name, .. }
            | AuthAction::DropVtable { table_name, .. }
            | AuthAction::Analyze { table_name } => ok(table_name),
            AuthAction::CreateView { view_name } | AuthAction::DropView { view_name } => ok(view_name),
            AuthAction::Pragma { pragma_name, .. } => matches!(pragma_name, "table_info" | "table_xinfo" | "index_list" | "index_info" | "foreign_key_list"),
            AuthAction::Attach { .. } | AuthAction::Detach { .. } => false,
            _ => true,
        };
        if allowed { Authorization::Allow } else { Authorization::Deny }
    }
}

fn conn(state: &State, handle: u32) -> Result<Arc<Mutex<Connection>>> {
    state.db.conns.lock().unwrap().get(&handle).cloned().ok_or_else(|| format!("Database handle {handle} is not open"))
}

/// Run `f` with the authorizer installed for `owner` (if any), removing it afterwards.
fn with_guard<T>(c: &Connection, owner: Option<String>, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    if let Some(o) = owner.clone() {
        c.authorizer(Some(guard(o))).map_err(err)?;
    }
    let r = f(c);
    if owner.is_some() {
        c.authorizer(None::<fn(AuthContext<'_>) -> Authorization>).map_err(err)?;
    }
    r.map_err(denied)
}

/// SQLite says "not authorized" for denied statements and "access to x is prohibited" for denied reads.
fn denied(e: String) -> String {
    if e.contains("not authorized") || e.contains("is prohibited") {
        format!("PERMISSION_DENIED: {e}. Plugins may only use tables prefixed with their id.")
    } else {
        e
    }
}

#[tauri::command]
pub fn fw_db_open(state: tauri::State<State>, path: String) -> Result<u32> {
    let p = state.sandbox.check(&path)?;
    let key = super::to_front(&p);
    if let Some(h) = state.db.by_path.lock().unwrap().get(&key) {
        return Ok(*h);
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    let c = Connection::open(&p).map_err(err)?;
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;").map_err(err)?;
    c.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
    let h = state.db.next.fetch_add(1, Ordering::Relaxed) + 1;
    state.db.conns.lock().unwrap().insert(h, Arc::new(Mutex::new(c)));
    state.db.by_path.lock().unwrap().insert(key, h);
    Ok(h)
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    changes: usize,
    #[serde(rename = "lastId")]
    last_id: i64,
}

#[tauri::command]
pub async fn fw_db_exec(state: tauri::State<'_, State>, handle: u32, sql: String, params: Vec<Value>, owner: Option<String>, readonly: bool) -> Result<ExecResult> {
    let c = conn(&state, handle)?;
    tauri::async_runtime::spawn_blocking(move || {
        let c = c.lock().unwrap();
        with_guard(&c, owner, |c| {
            let mut stmt = c.prepare(&sql).map_err(err)?;
            if readonly && !stmt.readonly() {
                return Err("Writes are disabled here (enable developer mode to allow them)".into());
            }
            let ps: Vec<SqlValue> = params.iter().map(param).collect();
            let changes = stmt.execute(rusqlite::params_from_iter(ps)).map_err(err)?;
            Ok(ExecResult { changes, last_id: c.last_insert_rowid() })
        })
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub async fn fw_db_query(state: tauri::State<'_, State>, handle: u32, sql: String, params: Vec<Value>, owner: Option<String>, readonly: bool) -> Result<Vec<Map<String, Value>>> {
    let c = conn(&state, handle)?;
    tauri::async_runtime::spawn_blocking(move || {
        let c = c.lock().unwrap();
        with_guard(&c, owner, |c| {
            let mut stmt = c.prepare(&sql).map_err(err)?;
            if readonly && !stmt.readonly() {
                return Err("Writes are disabled here (enable developer mode to allow them)".into());
            }
            let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let ps: Vec<SqlValue> = params.iter().map(param).collect();
            let mut rows = stmt.query(rusqlite::params_from_iter(ps)).map_err(err)?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().map_err(err)? {
                let mut m = Map::new();
                for (i, n) in names.iter().enumerate() {
                    m.insert(n.clone(), column(row.get_ref(i).map_err(err)?));
                }
                out.push(m);
            }
            Ok(out)
        })
    })
    .await
    .map_err(err)?
}

#[derive(Deserialize)]
pub struct Statement {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[tauri::command]
pub async fn fw_db_batch(state: tauri::State<'_, State>, handle: u32, statements: Vec<Statement>, owner: Option<String>) -> Result<()> {
    let c = conn(&state, handle)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = c.lock().unwrap();
        if let Some(o) = owner.clone() {
            c.authorizer(Some(guard(o))).map_err(err)?;
        }
        let r = (|| {
            let tx = c.transaction().map_err(err)?;
            for s in &statements {
                let ps: Vec<SqlValue> = s.params.iter().map(param).collect();
                tx.execute(&s.sql, rusqlite::params_from_iter(ps)).map_err(err)?;
            }
            tx.commit().map_err(err)
        })();
        if owner.is_some() {
            c.authorizer(None::<fn(AuthContext<'_>) -> Authorization>).map_err(err)?;
        }
        r.map_err(denied)
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub fn fw_db_close(state: tauri::State<State>, handle: u32) -> Result<()> {
    state.db.conns.lock().unwrap().remove(&handle);
    state.db.by_path.lock().unwrap().retain(|_, h| *h != handle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plugin_only_reaches_tables_with_its_prefix() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE notes__items (id INTEGER); INSERT INTO notes__items VALUES (1);").unwrap();
        let run = |sql: &str| with_guard(&c, Some("timer".into()), |c| c.execute_batch(sql).map_err(err));
        assert!(run("CREATE TABLE timer__laps (ms INTEGER); INSERT INTO timer__laps VALUES (5);").is_ok());
        let denied = run("SELECT * FROM notes__items").unwrap_err();
        assert!(denied.starts_with("PERMISSION_DENIED"), "{denied}");
        assert!(run("ATTACH DATABASE ':memory:' AS other").is_err(), "no attaching other files");
        // the authorizer is removed afterwards: the app itself reads everything
        assert!(c.execute_batch("SELECT * FROM notes__items").is_ok());
    }
}
