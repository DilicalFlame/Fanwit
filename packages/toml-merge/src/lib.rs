//! Format preserving TOML writes (Section 8.7.1). The caller sends the whole desired value; we
//! edit the retained document in place so comments, key order and formatting survive and only
//! changed keys are touched. One implementation for both hosts: desktop links it, the web host
//! runs it as WebAssembly.

use serde_json::Value;
use toml_edit::{Array, ArrayOfTables, DocumentMut, InlineTable, Item, Table};

fn to_value(v: &Value) -> Option<toml_edit::Value> {
    Some(match v {
        Value::Null => return None,
        Value::Bool(b) => (*b).into(),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i.into()
            } else {
                n.as_f64().unwrap_or(0.0).into()
            }
        }
        Value::String(s) => s.as_str().into(),
        Value::Array(a) => {
            let mut arr = Array::new();
            for x in a {
                if let Some(v) = to_value(x) {
                    arr.push(v);
                }
            }
            toml_edit::Value::Array(arr)
        }
        Value::Object(o) => {
            let mut t = InlineTable::new();
            for (k, x) in o {
                if let Some(v) = to_value(x) {
                    t.insert(k, v);
                }
            }
            toml_edit::Value::InlineTable(t)
        }
    })
}

fn is_simple(o: &serde_json::Map<String, Value>) -> bool {
    o.values().all(|v| match v {
        Value::Object(_) => false,
        Value::Array(a) => a.iter().all(|x| !x.is_object() && !x.is_array()),
        _ => true,
    })
}

/// Fresh item for a value at `depth` (1 = top level key).
fn new_item(v: &Value, depth: usize) -> Option<Item> {
    match v {
        Value::Null => None,
        Value::Object(o) if depth <= 2 || !is_simple(o) => {
            let mut t = Table::new();
            merge_table(&mut t, o, depth + 1);
            Some(Item::Table(t))
        }
        Value::Array(a) if depth == 1 && !a.is_empty() && a.iter().all(|x| x.is_object()) => {
            let mut aot = ArrayOfTables::new();
            for x in a {
                let mut t = Table::new();
                merge_table(&mut t, x.as_object().unwrap(), depth + 1);
                aot.push(t);
            }
            Some(Item::ArrayOfTables(aot))
        }
        other => to_value(other).map(Item::Value),
    }
}

fn values_equal(item: &Item, v: &Value) -> bool {
    match (item.as_value(), v) {
        (Some(toml_edit::Value::String(s)), Value::String(x)) => s.value() == x,
        (Some(toml_edit::Value::Integer(i)), Value::Number(n)) => n.as_i64() == Some(*i.value()),
        (Some(toml_edit::Value::Float(f)), Value::Number(n)) => n.as_f64() == Some(*f.value()),
        (Some(toml_edit::Value::Boolean(b)), Value::Bool(x)) => b.value() == x,
        _ => false,
    }
}

fn merge_item(slot: &mut Item, v: &Value, depth: usize) {
    match (slot, v) {
        (Item::Table(t), Value::Object(o)) => merge_table(t, o, depth + 1),
        (Item::Value(toml_edit::Value::InlineTable(t)), Value::Object(o)) => {
            // keep it inline; rebuild changed keys only
            let keys: Vec<String> = t.iter().map(|(k, _)| k.to_string()).collect();
            for k in keys {
                if !o.contains_key(&k) {
                    t.remove(&k);
                }
            }
            for (k, x) in o {
                let same = t.get(k).map(|cur| values_equal(&Item::Value(cur.clone()), x)).unwrap_or(false);
                if !same {
                    if let Some(nv) = to_value(x) {
                        let decor = t.get(k).map(|c| c.decor().clone());
                        t.insert(k, nv);
                        if let (Some(d), Some(cur)) = (decor, t.get_mut(k)) {
                            *cur.decor_mut() = d;
                        }
                    }
                }
            }
        }
        (Item::ArrayOfTables(aot), Value::Array(a)) if a.iter().all(|x| x.is_object()) => {
            // update in place where possible to keep comments on surviving entries
            let n = a.len();
            while aot.len() > n {
                aot.remove(aot.len() - 1);
            }
            for (i, x) in a.iter().enumerate() {
                let o = x.as_object().unwrap();
                if let Some(t) = aot.get_mut(i) {
                    merge_table(t, o, depth + 1);
                } else {
                    let mut t = Table::new();
                    merge_table(&mut t, o, depth + 1);
                    aot.push(t);
                }
            }
        }
        (slot, v) => {
            if values_equal(slot, v) {
                return;
            }
            let decor = slot.as_value().map(|x| x.decor().clone());
            if let Some(mut item) = new_item(v, depth) {
                if let (Some(d), Some(val)) = (decor, item.as_value_mut()) {
                    *val.decor_mut() = d;
                }
                *slot = item;
            }
        }
    }
}

fn merge_table(t: &mut Table, o: &serde_json::Map<String, Value>, depth: usize) {
    let existing: Vec<String> = t.iter().map(|(k, _)| k.to_string()).collect();
    for k in existing {
        if !o.contains_key(&k) || o[&k].is_null() {
            t.remove(&k);
        }
    }
    for (k, v) in o {
        if v.is_null() {
            continue;
        }
        if t.contains_key(k) {
            merge_item(&mut t[k.as_str()], v, depth);
        } else if let Some(item) = new_item(v, depth) {
            t.insert(k, item);
        }
    }
}

/// Merge `value` into the TOML text, returning the new text.
pub fn merge_text(existing: &str, value: &Value) -> Result<String, String> {
    let mut doc: DocumentMut = if existing.trim().is_empty() {
        DocumentMut::new()
    } else {
        existing.parse().unwrap_or_else(|_| DocumentMut::new())
    };
    let Value::Object(o) = value else { return Err("TOML root must be a table".into()) };
    merge_table(doc.as_table_mut(), o, 1);
    Ok(doc.to_string())
}

// ----- WebAssembly ABI: JSON in, JSON out, no bindgen -----

/// Reserve `len` bytes for the input; the caller writes UTF-8 JSON there.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Input `{"text": "...", "value": {...}}`; output `{"ok": "..."}` or `{"err": "..."}`, returned
/// as `ptr << 32 | len` (free it with dealloc).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn merge(ptr: *mut u8, len: usize) -> u64 {
    let input = Vec::from_raw_parts(ptr, len, len);
    let out = match serde_json::from_slice::<Value>(&input) {
        Ok(v) => match merge_text(v["text"].as_str().unwrap_or(""), &v["value"]) {
            Ok(t) => serde_json::json!({ "ok": t }),
            Err(e) => serde_json::json!({ "err": e }),
        },
        Err(e) => serde_json::json!({ "err": e.to_string() }),
    };
    let mut bytes = out.to_string().into_bytes();
    bytes.shrink_to_fit();
    let (p, n) = (bytes.as_mut_ptr(), bytes.len());
    std::mem::forget(bytes);
    ((p as u64) << 32) | n as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_comments_and_only_changes_keys() {
        let src = "# Live layout\nversion = 1\n\n[window.main.regions]\nsidebar = { node = \"side\", size = \"280px\", visible = true } # left\n\n[node.center] # main area\ntype = \"split\"\nsizes = [0.6, 0.4]\n";
        let v = json!({
            "version": 1,
            "window": { "main": { "regions": { "sidebar": { "node": "side", "size": "300px", "visible": true } } } },
            "node": { "center": { "type": "split", "sizes": [0.5, 0.5] }, "docs": { "type": "tabs", "panes": ["a"] } }
        });
        let out = merge_text(src, &v).unwrap();
        assert!(out.contains("# Live layout"));
        assert!(out.contains("# left"));
        assert!(out.contains("# main area"));
        assert!(out.contains("size = \"300px\""));
        assert!(out.contains("[node.docs]"));
        assert!(out.contains("sizes = [0.5, 0.5]"));
    }

    #[test]
    fn removes_missing_keys_and_writes_array_of_tables() {
        let out = merge_text("a = 1\nb = 2\n", &json!({ "a": 1, "bind": [{ "key": "mod+e", "command": "x" }] })).unwrap();
        assert!(!out.contains("b = 2"));
        assert!(out.contains("[[bind]]"));
    }
}
