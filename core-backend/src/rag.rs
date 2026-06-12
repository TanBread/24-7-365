//! In-memory BM25 search index over indexed file chunks.
//!
//! The original scaffold used a naive `String::contains` search. This module
//! replaces it with a real BM25 ranker that:
//!   * tokenises code-aware (alphanumeric + underscore, lowercased)
//!   * keeps an inverted index for sub-second querying over thousands of files
//!   * splits each file into windows of N lines so matches reference precise
//!     locations
//!
//! No external embedding model or vector DB is required — keeping the binary
//! small (~5 MB) and start-up instant. The frontend can use the returned line
//! ranges to open the right region in Monaco.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Length of one indexable chunk, in lines.
const CHUNK_LINES: usize = 40;

/// BM25 term-frequency saturation parameter.
const BM25_K1: f32 = 1.2;
/// BM25 length-normalisation parameter.
const BM25_B: f32 = 0.75;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VectorDocument {
    pub file_path: String,
    pub chunk_content: String,
    pub line_start: usize,
    pub line_end: usize,
}

/// A document with the precomputed token bag used for BM25 ranking.
struct IndexedDoc {
    meta: VectorDocument,
    /// Term -> count in this document.
    term_freq: HashMap<String, u32>,
    /// Total number of tokens in this document (used for length norm).
    length: u32,
}

pub struct LanceDbEngine {
    pub db_path: String,
    docs: Vec<IndexedDoc>,
    /// Term -> number of documents containing it (for IDF).
    doc_freq: HashMap<String, u32>,
    /// Sum of all document lengths, for the average.
    total_len: u64,
    /// Path -> list of doc indices belonging to that file (for fast eviction).
    by_path: HashMap<String, Vec<usize>>,
}

impl LanceDbEngine {
    pub fn new(db_path: &str) -> Self {
        LanceDbEngine {
            db_path: db_path.to_string(),
            docs: Vec::new(),
            doc_freq: HashMap::new(),
            total_len: 0,
            by_path: HashMap::new(),
        }
    }

    /// Replace any existing chunks for this file with new ones derived from
    /// the supplied content.
    pub fn index_file(&mut self, file_path: &str, content: &str) -> usize {
        // Drop previous chunks for this path, if any.
        self.remove_file_internal(file_path);

        let lines: Vec<&str> = content.lines().collect();
        if lines.is_empty() {
            return 0;
        }

        let mut count = 0usize;
        let mut start = 0usize;
        while start < lines.len() {
            let end = (start + CHUNK_LINES).min(lines.len());
            let chunk_text = lines[start..end].join("\n");
            // Skip blank chunks
            if chunk_text.trim().is_empty() {
                start = end;
                continue;
            }

            let tokens = tokenize(&chunk_text);
            if tokens.is_empty() {
                start = end;
                continue;
            }

            let mut tf: HashMap<String, u32> = HashMap::new();
            for t in &tokens {
                *tf.entry(t.clone()).or_insert(0) += 1;
            }
            let length = tokens.len() as u32;

            let doc_idx = self.docs.len();
            self.docs.push(IndexedDoc {
                meta: VectorDocument {
                    file_path: file_path.to_string(),
                    chunk_content: chunk_text,
                    line_start: start + 1,
                    line_end: end,
                },
                term_freq: tf.clone(),
                length,
            });
            for term in tf.keys() {
                *self.doc_freq.entry(term.clone()).or_insert(0) += 1;
            }
            self.total_len += length as u64;
            self.by_path
                .entry(file_path.to_string())
                .or_default()
                .push(doc_idx);

            count += 1;
            start = end;
        }
        count
    }

    /// Backwards-compatible alias used by the original JSON-RPC contract.
    pub fn add_chunk(&mut self, file_path: &str, content: &str, _line_start: usize) -> usize {
        self.index_file(file_path, content)
    }

    pub fn remove_file(&mut self, file_path: &str) -> bool {
        self.remove_file_internal(file_path)
    }

    fn remove_file_internal(&mut self, file_path: &str) -> bool {
        let indices = match self.by_path.remove(file_path) {
            Some(v) => v,
            None => return false,
        };

        // Subtract this file's contribution to corpus stats. We tombstone the
        // docs in place (cheap) and rebuild on next clear_index() — keeps the
        // BM25 averages roughly correct without compaction.
        for idx in indices {
            let doc = &self.docs[idx];
            self.total_len = self.total_len.saturating_sub(doc.length as u64);
            for term in doc.term_freq.keys() {
                if let Some(c) = self.doc_freq.get_mut(term) {
                    if *c > 0 {
                        *c -= 1;
                    }
                }
            }
            // Replace with an empty stub so the index stays stable.
            self.docs[idx] = IndexedDoc {
                meta: VectorDocument {
                    file_path: String::new(),
                    chunk_content: String::new(),
                    line_start: 0,
                    line_end: 0,
                },
                term_freq: HashMap::new(),
                length: 0,
            };
        }
        true
    }

    pub fn clear(&mut self) {
        self.docs.clear();
        self.doc_freq.clear();
        self.total_len = 0;
        self.by_path.clear();
    }

    pub fn doc_count(&self) -> usize {
        self.docs.iter().filter(|d| d.length > 0).count()
    }

    pub fn file_count(&self) -> usize {
        self.by_path.len()
    }

    /// Search the index using BM25 ranking. Returns up to `limit` matches.
    pub fn search(&self, query: &str) -> Value {
        self.search_with_limit(query, 10)
    }

    pub fn search_with_limit(&self, query: &str, limit: usize) -> Value {
        let q_terms = tokenize(query);
        if q_terms.is_empty() {
            return json!({
                "status": "success",
                "query": query,
                "results_count": 0,
                "results": []
            });
        }

        let n = self.doc_count() as f32;
        if n < 1.0 {
            return json!({
                "status": "success",
                "query": query,
                "results_count": 0,
                "results": []
            });
        }
        let avgdl = (self.total_len as f32) / n;

        let mut scored: Vec<(f32, usize)> = Vec::new();

        for (idx, doc) in self.docs.iter().enumerate() {
            if doc.length == 0 {
                continue; // tombstoned
            }
            let mut score = 0.0f32;
            for term in &q_terms {
                let tf = match doc.term_freq.get(term) {
                    Some(v) => *v as f32,
                    None => continue,
                };
                let df = *self.doc_freq.get(term).unwrap_or(&0) as f32;
                if df < 0.5 {
                    continue;
                }
                // Robertson-Spärck-Jones IDF (clamped >= 0).
                let idf = (((n - df + 0.5) / (df + 0.5)) + 1.0).ln();
                let dl = doc.length as f32;
                let denom = tf + BM25_K1 * (1.0 - BM25_B + BM25_B * dl / avgdl.max(1.0));
                score += idf * (tf * (BM25_K1 + 1.0)) / denom.max(0.0001);
            }
            // A small bonus when the query string also appears verbatim in the
            // chunk — this rescues short identifier searches that BM25 alone
            // can rank low.
            if score > 0.0 {
                let q_lower = query.to_lowercase();
                if doc.meta.chunk_content.to_lowercase().contains(&q_lower) {
                    score *= 1.25;
                }
                if doc.meta.file_path.to_lowercase().contains(&q_lower) {
                    score *= 1.10;
                }
            }
            if score > 0.0 {
                scored.push((score, idx));
            }
        }

        // Sort by descending score then ascending file order for stable output.
        scored.sort_by(|a, b| {
            b.0.partial_cmp(&a.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.1.cmp(&b.1))
        });

        let limit = limit.min(scored.len());
        let mut results = Vec::with_capacity(limit);
        for (score, idx) in scored.into_iter().take(limit) {
            let d = &self.docs[idx].meta;
            results.push(json!({
                "file_path": d.file_path,
                "line_start": d.line_start,
                "line_end": d.line_end,
                "chunk_content": d.chunk_content,
                "score": score,
            }));
        }

        json!({
            "status": "success",
            "query": query,
            "results_count": results.len(),
            "results": results
        })
    }
}

/// Code-aware tokeniser: keeps alphanumerics and underscore, splits on
/// everything else, lowercases, drops 1-character tokens (except digits).
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::with_capacity(text.len() / 6);
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            current.extend(ch.to_lowercase());
        } else if !current.is_empty() {
            if current.len() > 1 || current.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                tokens.push(std::mem::take(&mut current));
            } else {
                current.clear();
            }
        }
    }
    if !current.is_empty() && (current.len() > 1 || current.chars().next().map_or(false, |c| c.is_ascii_digit())) {
        tokens.push(current);
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_relevant_chunk_first() {
        let mut e = LanceDbEngine::new("test");
        e.index_file("a.ts", "function login(user) { return user.id }");
        e.index_file("b.ts", "function logout() { /* noop */ }");
        e.index_file("c.ts", "// just a comment about cats and dogs");
        let r = e.search("login user");
        let arr = r["results"].as_array().unwrap();
        assert!(!arr.is_empty());
        assert_eq!(arr[0]["file_path"], "a.ts");
    }

    #[test]
    fn empty_query_returns_zero() {
        let mut e = LanceDbEngine::new("test");
        e.index_file("a.ts", "function login() {}");
        let r = e.search("");
        assert_eq!(r["results_count"], 0);
    }

    #[test]
    fn reindex_replaces_old_chunks() {
        let mut e = LanceDbEngine::new("test");
        e.index_file("a.ts", "old code with login");
        e.index_file("a.ts", "completely different content");
        let r = e.search("login");
        assert_eq!(r["results_count"], 0);
    }
}
