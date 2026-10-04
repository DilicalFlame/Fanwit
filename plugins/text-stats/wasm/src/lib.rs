//! Text statistics in Rust, compiled to WebAssembly. It runs in the plugin's Web Worker, so
//! even a long note is analysed off the main thread.

use fanwit_plugin::{json, Host, Plugin, Value};
use std::collections::HashMap;

#[derive(Default, Clone, Copy, PartialEq, Debug)]
pub struct Stats {
    pub words: usize,
    pub sentences: usize,
    pub syllables: usize,
}

impl Stats {
    /// Flesch reading ease: 0 (hard) to 100 (easy).
    pub fn flesch(&self) -> f64 {
        if self.words == 0 {
            return 0.0;
        }
        let w = self.words as f64;
        (206.835 - 1.015 * (w / self.sentences.max(1) as f64) - 84.6 * (self.syllables as f64 / w)).clamp(0.0, 100.0)
    }
}

/// Vowel groups, minus a silent trailing "e"; at least one per word.
fn syllables(word: &str) -> usize {
    let w: Vec<char> = word.to_lowercase().chars().filter(|c| c.is_alphabetic()).collect();
    let vowel = |c: char| "aeiouy".contains(c);
    let mut n = 0;
    let mut prev = false;
    for &c in &w {
        let v = vowel(c);
        if v && !prev {
            n += 1;
        }
        prev = v;
    }
    if w.len() > 2 && w.ends_with(&['e']) && !vowel(w[w.len() - 2]) && n > 1 {
        n -= 1;
    }
    n.max(1)
}

pub fn analyse(text: &str) -> Stats {
    // skip markdown syntax lines that are not prose
    let prose: String = text.lines().filter(|l| !l.trim_start().starts_with("```")).collect::<Vec<_>>().join("\n");
    let words: Vec<&str> = prose.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).collect();
    let sentences = prose.split(['.', '!', '?']).filter(|s| s.chars().any(char::is_alphanumeric)).count();
    Stats { words: words.len(), sentences, syllables: words.iter().map(|w| syllables(w)).sum() }
}

#[derive(Default)]
struct TextStats {
    last: Stats,
    /// latest stats per note, so switching back to an open note shows its numbers again
    by_path: HashMap<String, Stats>,
    active: Option<String>,
}

impl TextStats {
    fn show(&self, host: &mut Host) {
        let s = self.last;
        match self.active {
            Some(_) => host.status("textStats.item", &format!("Ease {:.0}", s.flesch()), &format!("{} words, {} sentences, {} syllables (Rust, WebAssembly). Right click for details.", s.words, s.sentences, s.syllables)),
            // not in a note: hide rather than show the previous note's numbers
            None => host.status("textStats.item", "", ""),
        };
    }
}

impl Plugin for TextStats {
    fn activate(&mut self, host: &mut Host, _settings: &Value) {
        host.on_event("notes:changed");
        host.on_event("layout:activePane");
        host.handle("textStats.show");
    }

    fn event(&mut self, host: &mut Host, name: &str, payload: &Value) {
        let path = payload.get("path").and_then(Value::as_str).map(str::to_string);
        match name {
            "notes:changed" => {
                let stats = analyse(payload.get("text").and_then(Value::as_str).unwrap_or(""));
                if let Some(p) = &path {
                    self.by_path.insert(p.clone(), stats);
                }
                // layout:activePane alone says which note is in front
                if self.active.is_some() && self.active == path {
                    self.last = stats;
                }
            }
            "layout:activePane" => {
                let note = payload.get("view").and_then(Value::as_str) == Some("notes.editor");
                self.active = if note { path } else { None };
                if let Some(s) = self.active.as_ref().and_then(|p| self.by_path.get(p)) {
                    self.last = *s;
                }
            }
            _ => return,
        }
        self.show(host);
    }

    fn invoke(&mut self, host: &mut Host, _command: &str, _args: &Value) -> Result<Value, String> {
        let s = self.last;
        let grade = match s.flesch() as u32 {
            90.. => "very easy",
            70..=89 => "easy",
            50..=69 => "plain",
            30..=49 => "difficult",
            _ => "very difficult",
        };
        host.toast(&format!("Reading ease {:.0} ({grade}): {} words in {} sentences.", s.flesch(), s.words, s.sentences));
        Ok(json!({ "words": s.words, "sentences": s.sentences, "syllables": s.syllables, "flesch": s.flesch() }))
    }
}

fanwit_plugin::export_wasm!(TextStats);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_and_scores() {
        let s = analyse("The cat sat on the mat. It was happy!");
        assert_eq!((s.words, s.sentences), (9, 2));
        assert!(s.flesch() > 90.0);
        assert_eq!(syllables("reading"), 2);
        assert_eq!(syllables("make"), 1);
        assert_eq!(analyse("").flesch(), 0.0);
    }
}
