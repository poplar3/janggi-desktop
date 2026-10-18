// Канал связи с движком: в приложении — через Tauri, в браузере (разработка) — через WebSocket-мост.

export interface EngineTransport {
  start(): Promise<void>;
  send(line: string): void;
  onLine(cb: (line: string) => void): void;
}

type TauriInternals = { invoke: unknown };
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, TauriInternals>);

class TauriTransport implements EngineTransport {
  private listeners: ((l: string) => void)[] = [];
  private invoke!: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

  async start() {
    const core = await import('@tauri-apps/api/core');
    const event = await import('@tauri-apps/api/event');
    this.invoke = core.invoke;
    await event.listen<string>('engine-line', (e) => this.listeners.forEach((cb) => cb(e.payload)));
    await this.invoke('engine_start');
  }

  send(line: string) {
    void this.invoke('engine_send', { line });
  }

  onLine(cb: (line: string) => void) {
    this.listeners.push(cb);
  }
}

class WebSocketTransport implements EngineTransport {
  private ws!: WebSocket;
  private listeners: ((l: string) => void)[] = [];

  start() {
    return new Promise<void>((resolve, reject) => {
      const url = import.meta.env.VITE_ENGINE_WS ?? 'ws://localhost:5174';
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`Мост к движку недоступен (${url}). Запустите npm run engine-bridge`));
      this.ws.onmessage = (e) => String(e.data).split('\n').forEach((l) => l && this.listeners.forEach((cb) => cb(l)));
    });
  }

  send(line: string) {
    this.ws.send(line);
  }

  onLine(cb: (line: string) => void) {
    this.listeners.push(cb);
  }
}

export function createTransport(): EngineTransport {
  return isTauri() ? new TauriTransport() : new WebSocketTransport();
}
