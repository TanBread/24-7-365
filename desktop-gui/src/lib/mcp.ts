import * as childProcess from 'child_process';
import * as readline from 'readline';

const MCP_REQUEST_TIMEOUT_MS = 60_000;

export class McpClient {
  private child: childProcess.ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private idCounter = 1;
  private pendingRequests = new Map<number | string, { resolve: (val: any) => void; reject: (err: any) => void; timer: ReturnType<typeof setTimeout> }>();
  public isReady = false;

  constructor(
    public name: string,
    public command: string,
    public args: string[],
    public env?: Record<string, string>
  ) {}

  /** Reject every in-flight request with the given error and clear timers. */
  private failAllPending(err: Error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      try { pending.reject(err); } catch { /* ignore */ }
    }
    this.pendingRequests.clear();
  }

  async start() {
    return new Promise<void>((resolve, reject) => {
      try {
        const runEnv = { ...process.env, ...(this.env || {}) };
        this.child = childProcess.spawn(this.command, this.args, {
          env: runEnv,
          shell: false,
          windowsHide: true,
        });

        this.child.on('error', (err) => {
          console.error(`[MCP:${this.name}] error spawning:`, err);
          this.failAllPending(err instanceof Error ? err : new Error(String(err)));
          reject(err);
        });

        if (this.child.stdout) {
          this.rl = readline.createInterface({
            input: this.child.stdout,
            terminal: false,
          });

          this.rl.on('line', (line) => {
            try {
              const msg = JSON.parse(line);
              if (msg.id !== undefined) {
                const pending = this.pendingRequests.get(msg.id);
                if (pending) {
                  this.pendingRequests.delete(msg.id);
                  clearTimeout(pending.timer);
                  if (msg.error) {
                    pending.reject(msg.error);
                  } else {
                    pending.resolve(msg.result);
                  }
                }
              }
            } catch (err) {
              console.warn(`[MCP:${this.name}] Failed to parse stdout line:`, line, err);
            }
          });
        }

        if (this.child.stderr) {
          this.child.stderr.on('data', (data) => {
            console.warn(`[MCP:${this.name}] stderr:`, data.toString());
          });
        }

        this.child.on('close', (code) => {
          console.log(`[MCP:${this.name}] closed with code:`, code);
          this.isReady = false;
          // Release any awaiters so the agent step doesn't hang forever.
          this.failAllPending(new Error(`MCP server "${this.name}" exited (code ${code})`));
        });

        // Start initialization handshake
        this.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: '7-24-IDE', version: '1.2.0' }
        }).then((res) => {
          this.isReady = true;
          this.notify('notifications/initialized', {});
          resolve();
        }).catch((err) => {
          console.error(`[MCP:${this.name}] Initialization failed:`, err);
          reject(err);
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  async stop() {
    if (this.child) {
      const pid = this.child.pid;
      try {
        // On Windows with shell:true the child is a cmd wrapper — kill the
        // whole process tree, otherwise the actual MCP server leaks.
        if (process.platform === 'win32' && pid) {
          childProcess.execFile('taskkill', ['/pid', String(pid), '/t', '/f']);
        } else {
          this.child.kill();
        }
      } catch (err) {
        console.warn(`[MCP:${this.name}] failed to kill process:`, err);
      }
      this.child = null;
    }
    try { this.rl?.close(); } catch { /* ignore */ }
    this.rl = null;
    this.isReady = false;
    this.failAllPending(new Error(`MCP server "${this.name}" stopped`));
  }

  async request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        return reject(new Error(`MCP server "${this.name}" is not running`));
      }
      const id = this.idCounter++;
      const timer = setTimeout(() => {
        if (this.pendingRequests.delete(id)) {
          reject(new Error(`MCP server "${this.name}" request "${method}" timed out`));
        }
      }, MCP_REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(id, { resolve, reject, timer });
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n';
      try {
        this.child.stdin.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  notify(method: string, params: any) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) return;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    }) + '\n';
    this.child.stdin.write(payload);
  }
}
