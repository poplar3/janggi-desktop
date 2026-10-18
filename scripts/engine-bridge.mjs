// Мост WebSocket ↔ движок для разработки интерфейса в обычном браузере.
// Использование: FAIRY_STOCKFISH=<путь> node scripts/engine-bridge.mjs
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { WebSocketServer } from 'ws';

const path = process.env.FAIRY_STOCKFISH ?? new URL('../src-tauri/engine/fairy-stockfish', import.meta.url).pathname;
const wss = new WebSocketServer({ port: Number(process.env.PORT ?? 5174) });
wss.on('connection', (ws) => {
  const proc = spawn(path, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  createInterface({ input: proc.stdout }).on('line', (l) => ws.send(l));
  ws.on('message', (m) => proc.stdin.write(String(m) + '\n'));
  ws.on('close', () => proc.kill());
});
console.log(`Мост к движку ${path} на ws://localhost:${wss.options.port}`);
