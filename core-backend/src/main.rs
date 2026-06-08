mod parser;
mod rag;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize LanceDB vector simulation engine
    let mut rag_engine = rag::LanceDbEngine::new("./data/lancedb");

    // Standard I/O pipelines
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut stdout = io::stdout();

    // Log startup indicator to stderr so Electron doesn't treat it as JSON-RPC
    eprintln!("[Rust Core] 7/24 IDE Engine started successfully.");

    while let Some(line) = reader.next_line().await? {
        let request: Result<JsonRpcRequest, _> = serde_json::from_str(&line);

        let response = match request {
            Ok(req) => {
                let id = req.id;
                let result = match req.method.as_str() {
                    "ping" => Some(json!("pong")),
                    "parse_ast" => {
                        let code = req.params.as_ref()
                            .and_then(|p| p.get("code"))
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        Some(parser::AstParser::parse_ast(code))
                    }
                    "index_file" => {
                        let file_path = req.params.as_ref()
                            .and_then(|p| p.get("file_path"))
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        let content = req.params.as_ref()
                            .and_then(|p| p.get("content"))
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        rag_engine.add_chunk(file_path, content, 1);
                        Some(json!({ "status": "success", "indexed": file_path }))
                    }
                    "search_rag" => {
                        let query = req.params.as_ref()
                            .and_then(|p| p.get("query"))
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        Some(rag_engine.search(query))
                    }
                    _ => None,
                };

                if let Some(res) = result {
                    JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id,
                        result: Some(res),
                        error: None,
                    }
                } else {
                    JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id,
                        result: None,
                        error: Some(json!({ "code": -32601, "message": "Method not found" })),
                    }
                }
            }
            Err(err) => {
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: None,
                    result: None,
                    error: Some(json!({ "code": -32700, "message": format!("Parse error: {}", err) })),
                }
            }
        };

        // Write response line to stdout and flush immediately
        let response_str = serde_json::to_string(&response)? + "\n";
        stdout.write_all(response_str.as_bytes()).await?;
        stdout.flush().await?;
    }

    Ok(())
}
