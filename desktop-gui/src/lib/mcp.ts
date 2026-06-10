import * as childProcess from 'child_process';
import * as readline from 'readline';

export class McpClient {
  private child: childProcess.ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private idCounter = 1;
  private pendingRequests = new Map<number | string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  public isReady = false;

  constructor(
    public name: string,
    public command: string,
    public args: string[],
    public env?: Record<string, string>
  ) {}

  async start() {
    return new Promise<void>((resolve, reject) => {
      try {
        const runEnv = { ...process.env, ...(this.env || {}) };
        this.child = childProcess.spawn(this.command, this.args, {
          env: runEnv,
          shell: true, // crucial for command resolution on Windows
          windowsHide: true,
        });

        this.child.on('error', (err) => {
          console.error(`[MCP:${this.name}] error spawning:`, err);
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
      this.child.kill();
      this.child = null;
    }
    this.isReady = false;
    this.pendingRequests.clear();
  }

  async request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        return reject(new Error(`MCP server "${this.name}" is not running`));
      }
      const id = this.idCounter++;
      this.pendingRequests.set(id, { resolve, reject });
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n';
      this.child.stdin.write(payload);
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
