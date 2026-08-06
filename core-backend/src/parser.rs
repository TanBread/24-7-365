//! Tree-sitter based AST extractor.
//!
//! Given a piece of source code and an extension hint, returns a flat list of
//! "interesting" AST nodes (functions, methods, classes, structs, imports,
//! interfaces) with their positions in the file. The frontend uses this to
//! show structural overviews and to fold function bodies in agent context.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tree_sitter::{Language, Node, Parser, Query, QueryCursor};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AstNode {
    pub name: String,
    /// One of: function, method, class, struct, interface, type, import, enum, variable.
    pub node_type: String,
    pub line_start: usize,
    pub line_end: usize,
}

/// Resolves a tree-sitter language object from a file extension. Returns
/// `(language, query_source)` where `query_source` is a tree-sitter query
/// that captures the structural nodes we care about.
fn language_for_ext(ext: &str) -> Option<(Language, &'static str)> {
    match ext {
        "rs" => Some((
            tree_sitter_rust::language(),
            r#"
            (function_item        name: (identifier) @name) @function
            (struct_item          name: (type_identifier) @name) @struct
            (enum_item            name: (type_identifier) @name) @enum
            (trait_item           name: (type_identifier) @name) @interface
            (impl_item            type: (type_identifier) @name) @class
            (mod_item             name: (identifier) @name) @class
            (use_declaration) @import
            (const_item           name: (identifier) @name) @variable
            (static_item          name: (identifier) @name) @variable
            "#,
        )),
        "ts" | "tsx" => Some((
            tree_sitter_typescript::language_typescript(),
            COMMON_TS_QUERY,
        )),
        "js" | "jsx" | "mjs" | "cjs" => Some((
            tree_sitter_javascript::language(),
            r#"
            (function_declaration  name: (identifier) @name) @function
            (method_definition     name: (property_identifier) @name) @method
            (class_declaration     name: (identifier) @name) @class
            (lexical_declaration   (variable_declarator
                name: (identifier) @name
                value: [(arrow_function) (function_expression)])) @function
            (variable_declaration  (variable_declarator
                name: (identifier) @name
                value: [(arrow_function) (function_expression)])) @function
            (import_statement) @import
            "#,
        )),
        "py" => Some((
            tree_sitter_python::language(),
            r#"
            (function_definition name: (identifier) @name) @function
            (class_definition    name: (identifier) @name) @class
            (import_statement) @import
            (import_from_statement) @import
            "#,
        )),
        "html" | "htm" => Some((
            tree_sitter_html::language(),
            // HTML has no real "nodes" — we only surface element tags so the
            // agent can use it for rough orientation.
            r#"
            (element (start_tag (tag_name) @name)) @function
            "#,
        )),
        "css" | "scss" | "sass" => Some((
            tree_sitter_css::language(),
            r#"
            (rule_set (selectors) @name) @function
            "#,
        )),
        "json" => Some((tree_sitter_json::language(), "")),
        _ => None,
    }
}

// TypeScript needs a dedicated query because it adds interfaces/types and
// reuses many JS productions under different node names.
const COMMON_TS_QUERY: &str = r#"
(function_declaration   name: (identifier) @name) @function
(method_definition      name: (property_identifier) @name) @method
(class_declaration      name: (type_identifier) @name) @class
(interface_declaration  name: (type_identifier) @name) @interface
(type_alias_declaration name: (type_identifier) @name) @type
(enum_declaration       name: (identifier) @name) @enum
(lexical_declaration    (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)])) @function
(variable_declaration   (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)])) @function
(import_statement) @import
"#;

fn capture_to_node_type(name: &str) -> &'static str {
    match name {
        "function" => "function",
        "method" => "method",
        "class" => "class",
        "struct" => "struct",
        "interface" => "interface",
        "type" => "type",
        "enum" => "enum",
        "import" => "import",
        "variable" => "variable",
        _ => "node",
    }
}

fn node_text<'a>(node: Node<'_>, source: &'a str) -> &'a str {
    let start = node.start_byte();
    let end = node.end_byte();
    if end <= source.len() {
        &source[start..end]
    } else {
        ""
    }
}

fn line_start(node: Node<'_>) -> usize {
    node.start_position().row + 1
}

fn line_end(node: Node<'_>) -> usize {
    node.end_position().row + 1
}

pub struct AstParser;

impl AstParser {
    /// Parse the given code with the grammar matching `ext` (e.g. "ts", "rs").
    /// Returns a JSON object: { status, language, nodes_count, nodes: [{name, node_type, line_start, line_end}] }
    /// Falls back to a "skipped" status with empty nodes for unsupported languages
    /// so the frontend can confidently switch on `status`.
    pub fn parse_ast(code: &str, ext: &str) -> Value {
        let (language, query_src) = match language_for_ext(ext) {
            Some(pair) => pair,
            None => {
                return json!({
                    "status": "skipped",
                    "reason": format!("unsupported extension: {}", ext),
                    "language": ext,
                    "nodes_count": 0,
                    "nodes": []
                });
            }
        };

        let mut parser = Parser::new();
        if parser.set_language(&language).is_err() {
            return json!({
                "status": "error",
                "reason": "failed to set language",
                "language": ext,
                "nodes_count": 0,
                "nodes": []
            });
        }

        let tree = match parser.parse(code, None) {
            Some(t) => t,
            None => {
                return json!({
                    "status": "error",
                    "reason": "tree-sitter returned no tree",
                    "language": ext,
                    "nodes_count": 0,
                    "nodes": []
                });
            }
        };

        // Empty grammar query (e.g. JSON) — return tree shape only.
        if query_src.is_empty() {
            return json!({
                "status": "success",
                "language": ext,
                "nodes_count": 0,
                "nodes": []
            });
        }

        let query = match Query::new(&language, query_src) {
            Ok(q) => q,
            Err(e) => {
                return json!({
                    "status": "error",
                    "reason": format!("query compile failed: {}", e),
                    "language": ext,
                    "nodes_count": 0,
                    "nodes": []
                });
            }
        };

        let mut cursor = QueryCursor::new();
        let bytes = code.as_bytes();
        let mut nodes: Vec<AstNode> = Vec::new();

        for m in cursor.matches(&query, tree.root_node(), bytes) {
            // Each match has at most two captures: one for the parent node
            // (e.g. @function) and one for the @name identifier.
            let mut parent_node: Option<Node> = None;
            let mut parent_name: &str = "node";
            let mut name_text: Option<String> = None;

            for cap in m.captures {
                let cap_name = query.capture_names()[cap.index as usize];
                if cap_name == "name" {
                    name_text = Some(node_text(cap.node, code).trim().to_string());
                } else {
                    parent_node = Some(cap.node);
                    parent_name = cap_name;
                }
            }

            let parent = match parent_node {
                Some(n) => n,
                None => continue,
            };

            // Imports and similar nodes don't have a separate @name capture —
            // surface their literal text (truncated) instead.
            let final_name = name_text.unwrap_or_else(|| {
                let snippet = node_text(parent, code).trim();
                if snippet.len() > 80 {
                    // Truncate by characters, not bytes — a byte slice can
                    // land inside a multi-byte UTF-8 char and panic.
                    let truncated: String = snippet.chars().take(80).collect();
                    format!("{}…", truncated)
                } else {
                    snippet.to_string()
                }
            });

            nodes.push(AstNode {
                name: final_name,
                node_type: capture_to_node_type(parent_name).to_string(),
                line_start: line_start(parent),
                line_end: line_end(parent),
            });
        }

        // Order by source position.
        nodes.sort_by_key(|n| (n.line_start, n.line_end));

        json!({
            "status": "success",
            "language": ext,
            "nodes_count": nodes.len(),
            "nodes": nodes
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rust() {
        let code = r#"
use std::io;

pub fn hello() -> i32 { 42 }

struct Point { x: i32, y: i32 }
"#;
        let v = AstParser::parse_ast(code, "rs");
        assert_eq!(v["status"], "success");
        let nodes = v["nodes"].as_array().unwrap();
        assert!(nodes.iter().any(|n| n["name"] == "hello" && n["node_type"] == "function"));
        assert!(nodes.iter().any(|n| n["name"] == "Point" && n["node_type"] == "struct"));
    }

    #[test]
    fn parses_ts() {
        let code = r#"
import { foo } from './foo';
export interface Greeter { hello(): string }
export function greet(name: string): string { return `hi ${name}`; }
const cb = (x: number) => x + 1;
"#;
        let v = AstParser::parse_ast(code, "ts");
        let nodes = v["nodes"].as_array().unwrap();
        assert!(nodes.iter().any(|n| n["name"] == "Greeter"));
        assert!(nodes.iter().any(|n| n["name"] == "greet"));
        assert!(nodes.iter().any(|n| n["name"] == "cb"));
    }

    #[test]
    fn skips_unknown_extension() {
        let v = AstParser::parse_ast("hello world", "txt");
        assert_eq!(v["status"], "skipped");
    }
}
