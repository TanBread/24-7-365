use serde::{Serialize, Deserialize};
use serde_json::{json, Value};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VectorDocument {
    pub file_path: String,
    pub chunk_content: String,
    pub line_start: usize,
}

pub struct LanceDbEngine {
    pub db_path: String,
    pub documents: Vec<VectorDocument>,
}

impl LanceDbEngine {
    pub fn new(db_path: &str) -> Self {
        LanceDbEngine {
            db_path: db_path.to_string(),
            documents: Vec::new(),
        }
    }

    /// Indexes a file chunk. In production, this computes embeddings using a local sentence-transformer:
    /// ```rust
    /// let embedding = model.encode(chunk_content)?;
    /// lancedb_table.add(vec![Record { vector: embedding, content: chunk_content }]).await?;
    /// ```
    pub fn add_chunk(&mut self, file_path: &str, content: &str, line_start: usize) {
        self.documents.push(VectorDocument {
            file_path: file_path.to_string(),
            chunk_content: content.to_string(),
            line_start,
        });
    }

    /// Searches for documents similar to a query.
    pub fn search(&self, query: &str) -> Value {
        // Basic keyword match to simulate embedding similarity search
        let mut matches = Vec::new();
        let query_lower = query.to_lowercase();
        
        for doc in &self.documents {
            if doc.chunk_content.to_lowercase().contains(&query_lower) || doc.file_path.to_lowercase().contains(&query_lower) {
                matches.push(doc.clone());
            }
        }

        // Return up to 3 matches
        matches.truncate(3);

        json!({
            "status": "success",
            "query": query,
            "results_count": matches.len(),
            "results": matches
        })
    }
}
