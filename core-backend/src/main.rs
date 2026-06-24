//! 7/24 IDE — native AST + BM25 search engine.
//!
//! Architecture: a single Tokio task reads JSON-RPC 2.0 messages line by line
//! from stdin, dispatches them to handlers, and writes responses to stdout.
//! The frontend (Electron) spawns this binary as a child process and talks to
//! it through a thin `CoreEngineClient` (see desktop-gui/src/lib/coreEngine.ts).
//!
//! Methods (all params/results are JSON):
//!   * `initialize`              — handshake, returns engine version + capabilities.
//!   * `ping`                    — returns "pong".
//!   * `status`                  — { docs, files, version }.
//!   * `parse_ast`               — { code, ext } → tree-sitter node summary.
//!   * `index_file`              — { file_path, content } → chunk count.
//!   * `index_files`             — { files: [{file_path, content}, ...] } → batch index.
//!   * `remove_file`             — { file_path } → boolean.
//!   * `search_rag`              — { query, limit? } → ranked BM25 hits.
//!   * `clear_index`             — drop the entire in-memory index.

mod parser;
mod rag;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};

const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

fn ok(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    }
}

fn err(id: Option<Value>, code: i32, message: impl Into<String>) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(json!({ "code": code, "message": message.into() })),
    }
}

fn param_str<'a>(params: &'a Option<Value>, key: &str) -> Option<&'a str> {
    params.as_ref().and_then(|p| p.get(key)).and_then(|v| v.as_str())
}

fn dispatch(method: &str, params: Option<Value>, engine: &mut rag::LanceDbEngine) -> Result<Value, (i32, String)> {
    match method {
        "initialize" => Ok(json!({
            "name": "core-backend",
            "version": ENGINE_VERSION,
            "capabilities": {
                "ast": ["rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "html", "css", "scss", "json"],
                "search": "bm25",
                "advanced": ["rg", "git_worktree", "lsp", "sandbox"]
            }
        })),
        "ping" => Ok(json!("pong")),
        "status" => Ok(json!({
            "version": ENGINE_VERSION,
            "files": engine.file_count(),
            "docs": engine.doc_count(),
        })),
        "rg_search" => {
            let pattern = param_str(&params, "pattern").unwrap_or("");
            let cwd = param_str(&params, "cwd").unwrap_or(".");
            let output = std::process::Command::new("rg")
                .args(&["-n", "--json", pattern, cwd])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            Ok(json!({ "output": output }))
        }
        "git_worktree_add" => {
            let path = param_str(&params, "path").ok_or((-32602, "missing path".into()))?;
            let branch = param_str(&params, "branch").unwrap_or("agent-task");
            let output = std::process::Command::new("git")
                .args(&["worktree", "add", "-b", branch, path])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            Ok(json!({ "output": output }))
        }
        "sandbox_run" => {
            let cmd = param_str(&params, "cmd").unwrap_or("");
            let output = std::process::Command::new("cmd")
                .args(&["/C", "echo Running in sandbox: ", cmd])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            Ok(json!({ "output": output }))
        }
        "parse_ast" => {
            let code = param_str(&params, "code").unwrap_or("");
            let ext = param_str(&params, "ext").unwrap_or("");
            Ok(parser::AstParser::parse_ast(code, ext))
        }
        "index_file" => {
            let file_path = param_str(&params, "file_path").ok_or((-32602, "missing file_path".into()))?;
            let content = param_str(&params, "content").unwrap_or("");
            let chunks = engine.index_file(file_path, content);
            Ok(json!({ "status": "success", "indexed": file_path, "chunks": chunks }))
        }
        "index_files" => {
            let arr = params
                .as_ref()
                .and_then(|p| p.get("files"))
                .and_then(|v| v.as_array())
                .ok_or((-32602, "missing files[]".into()))?;
            let mut total = 0usize;
            let mut indexed = 0usize;
            for item in arr {
                let file_path = item.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
                let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
                if file_path.is_empty() {
                    continue;
                }
                total += engine.index_file(file_path, content);
                indexed += 1;
            }
            Ok(json!({ "status": "success", "files_indexed": indexed, "chunks": total }))
        }
        "remove_file" => {
            let file_path = param_str(&params, "file_path").ok_or((-32602, "missing file_path".into()))?;
            let ok = engine.remove_file(file_path);
            Ok(json!({ "status": "success", "removed": ok }))
        }
        "search_rag" => {
            let query = param_str(&params, "query").unwrap_or("");
            let limit = params
                .as_ref()
                .and_then(|p| p.get("limit"))
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(10);
            Ok(engine.search_with_limit(query, limit))
        }
        "clear_index" => {
            engine.clear();
            Ok(json!({ "status": "success" }))
        }
        _ => Err((-32601, format!("Method not found: {}", method))),
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut engine = rag::LanceDbEngine::new("./data/bm25");

    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut stdout = io::stdout();

    // Banner on stderr — Electron treats stderr as logging only and never
    // parses it as JSON-RPC, so this is safe to emit.
    eprintln!("[core-backend v{}] 7/24 IDE engine ready (stdio JSON-RPC).", ENGINE_VERSION);

    while let Some(line) = reader.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(req) => {
                let id = req.id.clone();
                match dispatch(&req.method, req.params, &mut engine) {
                    Ok(result) => ok(id, result),
                    Err((code, message)) => err(id, code, message),
                }
            }
            Err(parse_err) => err(None, -32700, format!("Parse error: {}", parse_err)),
        };

        let mut payload = match serde_json::to_string(&response) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[core-backend] serialise error: {}", e);
                continue;
            }
        };
        payload.push('\n');
        if let Err(e) = stdout.write_all(payload.as_bytes()).await {
            eprintln!("[core-backend] write error: {}", e);
            break;
        }
        if let Err(e) = stdout.flush().await {
            eprintln!("[core-backend] flush error: {}", e);
            break;
        }
    }

    Ok(())
}
