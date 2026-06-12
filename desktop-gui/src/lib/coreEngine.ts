// ═══════════════════════════════════════════════════════════════
// Native core-backend client (JSON-RPC over stdio).
//
// Spawns the optional Rust binary at `core-backend(.exe)` and exposes a thin
// promise-based API for AST parsing and BM25 search. Designed to fail soft:
// if the binary is missing or crashes, callers should fall back to the
// existing TypeScript implementations (compressCodeContext / TS search_code).
// ═══════════════════════════════════════════════════════════════

import * as childProcess from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

export interface CoreCapabilities {
  name: string;
  version: string;
  capabilities: {
    ast: string[];
    search: string;
  };
}

export interface CoreStatus {
  version: string;
  files: number;
  docs: number;
}

export interface CoreAstNode {
  name: string;
  node_type: string;
  line_start: number;
  line_end: number;
}

export interface CoreAstResult {
  status: 'success' | 'skipped' | 'error';
  language: string;
  nodes_count: number;
  nodes: CoreAstNode[];
  reason?: string;
}

export interface CoreSearchHit {
  file_path: string;
  line_start: number;
  line_end: number;
  chunk_content: string;
  score: number;
}

export interface CoreSearchResult {
  status: 'success';
  query: string;
  results_count: number;
  results: CoreSearchHit[];
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Resolves the path to the bundled `core-backend` binary.
 *
 * Lookup order (the first existing one wins):
 *   1. `process.resourcesPath/core-backend(.exe)` (production: extraResources)
 *   2. `<dist>/core-backend(.exe)` (built and copied by build.js)
 *   3. `<repo>/core-backend/target/release/core-backend(.exe)` (cargo dev)
 */
export function findCoreBinary(distDir: string, resourcesPath?: string): string | null {
  const exe = process.platform === 'win32' ? 'core-backend.exe' : 'core-backend';
  const candidates = [
    resourcesPath ? path.join(resourcesPath, exe) : '',
    path.join(distDir, exe),
    path.join(distDir, '..', '..', 'core-backend', 'target', 'release', exe),
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

interface PendingRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class CoreEngineClient {
  private child: childProcess.ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private idCounter = 1;
  private pending = new Map<number, PendingRequest>();
  private capabilities: CoreCapabilities | null = null;
  private startPromise: Promise<void> | null = null;
  private startError: Error | null = null;

  constructor(private binaryPath: string) {}

  /** Whether the child process is alive and the handshake has completed. */
  get isReady(): boolean {
    return !!this.child && !!this.capabilities;
  }

  get version(): string | null {
    return this.capabilities?.version ?? null;
  }

  get supportedAstLanguages(): string[] {
    return this.capabilities?.capabilities.ast ?? [];
  }

  /**
   * Spawn the binary and complete the JSON-RPC handshake.
   * Subsequent calls return the same promise so concurrent callers wait once.
   */
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      try {
        if (!fs.existsSync(this.binaryPath)) {
          throw new Error(`core-backend binary not found at ${this.binaryPath}`);
        }
        this.child = childProcess.spawn(this.binaryPath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });

        this.child.on('error', (err) => {
          this.startError = err;
          this.failPending(err);
        });

        this.child.on('close', (code) => {
          this.failPending(new Error(`core-backend exited with code ${code}`));
          this.child = null;
          this.capabilities = null;
        });

        if (this.child.stderr) {
          this.child.stderr.on('data', (data) => {
            // Forward stderr to logs but never treat as JSON.
            console.warn(`[core-backend] ${String(data).trim()}`);
          });
        }

        if (!this.child.stdout) {
          throw new Error('core-backend stdout unavailable');
        }
        this.rl = readline.createInterface({ input: this.child.stdout, terminal: false });
        this.rl.on('line', (line) => this.handleLine(line));

        // Initialise — also gives us the version + capabilities.
        const caps = (await this.request('initialize', {})) as CoreCapabilities;
        this.capabilities = caps;
      } catch (e: any) {
        this.startError = e;
        await this.stop();
        throw e;
      }
    })();
    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.failPending(new Error('core-backend stopping'));
    try { this.rl?.close(); } catch {}
    try { this.child?.kill(); } catch {}
    this.child = null;
    this.rl = null;
    this.capabilities = null;
    this.startPromise = null;
  }

  private failPending(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private handleLine(line: string) {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      console.warn('[core-backend] non-JSON line:', line);
      return;
    }
    if (typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'core-backend error'));
    } else {
      pending.resolve(msg.result);
    }
  }

  /** Low-level: send a JSON-RPC request and await a typed response. */
  request<T = any>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        return reject(new Error('core-backend not running'));
      }
      const id = this.idCounter++;
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`core-backend request "${method}" timed out`));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as any, reject, timer });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.child.stdin.write(payload);
    });
  }

  // ── Typed convenience helpers ─────────────────────────────────────────────

  status(): Promise<CoreStatus> {
    return this.request<CoreStatus>('status', {});
  }

  parseAst(code: string, ext: string): Promise<CoreAstResult> {
    return this.request<CoreAstResult>('parse_ast', { code, ext });
  }

  indexFile(filePath: string, content: string): Promise<{ status: string; chunks: number }> {
    return this.request('index_file', { file_path: filePath, content });
  }

  indexFiles(files: { file_path: string; content: string }[]): Promise<{ files_indexed: number; chunks: number }> {
    return this.request('index_files', { files });
  }

  removeFile(filePath: string): Promise<{ status: string; removed: boolean }> {
    return this.request('remove_file', { file_path: filePath });
  }

  searchRag(query: string, limit = 20): Promise<CoreSearchResult> {
    return this.request<CoreSearchResult>('search_rag', { query, limit });
  }

  clearIndex(): Promise<{ status: string }> {
    return this.request('clear_index', {});
  }
}
