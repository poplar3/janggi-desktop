// Клиент UCI для Fairy-Stockfish (вариант janggi).
import { createTransport, type EngineTransport } from './transport';

export interface Score {
  /** Оценка в сантипешках с точки зрения стороны, которая ходит. */
  cp?: number;
  /** Мат через N ходов (отрицательное — мат стороне, которая ходит). */
  mate?: number;
}

export interface PvInfo {
  multipv: number;
  depth: number;
  score: Score;
  pv: string[];
  nodes?: number;
}

export interface SearchResult {
  bestmove: string | null;
  lines: PvInfo[];
}

export interface SearchOptions {
  fen: string;
  moves?: string[];
  movetime?: number;
  depth?: number;
  infinite?: boolean;
  multipv?: number;
  /** Ограничение силы по Elo; undefined — полная сила. */
  elo?: number;
  skill?: number;
  /** Число потоков. Один поток с фиксированной глубиной даёт одинаковый результат при повторе. */
  threads?: number;
  /** Очистить хеш перед поиском — тоже ради повторяемости. */
  clearHash?: boolean;
  /** Каждая строка вывода движка (быстро меняется). */
  onInfo?: (lines: PvInfo[]) => void;
  /** Вызывается, когда глубина досчитана для всех `expectedLines` вариантов. */
  onDepth?: (lines: PvInfo[]) => void;
  expectedLines?: number;
}

interface Job {
  opts: SearchOptions;
  resolve: (r: SearchResult) => void;
  lines: Map<number, PvInfo>;
  byDepth: Map<number, Map<number, PvInfo>>;
  /** Последний полностью досчитанный набор вариантов. */
  complete: PvInfo[] | null;
}

const isMobile = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/**
 * Потоков для непрерывного анализа: все ядра, кроме одного (не больше 8). На телефоне — половина ядер:
 * у них много медленных ядер, и при полной загрузке интерфейс начинает тормозить, а телефон греться.
 */
export function analysisThreads(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(8, isMobile ? Math.floor(cores / 2) : cores - 1));
}

export function parseInfo(line: string): PvInfo | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const t = line.split(/\s+/);
  const info: PvInfo = { multipv: 1, depth: 0, score: {}, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        info.depth = Number(t[++i]);
        break;
      case 'multipv':
        info.multipv = Number(t[++i]);
        break;
      case 'nodes':
        info.nodes = Number(t[++i]);
        break;
      case 'score':
        if (t[i + 1] === 'cp') info.score = { cp: Number(t[i + 2]) };
        else if (t[i + 1] === 'mate') info.score = { mate: Number(t[i + 2]) };
        i += 2;
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') return null;
        break;
      case 'pv':
        info.pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  return info;
}

export class Engine {
  private transport: EngineTransport;
  private ready: Promise<void> | null = null;
  private waiters: { test: (l: string) => boolean; resolve: () => void }[] = [];
  private job: Job | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private current: { elo?: number; skill?: number; multipv: number; threads: number } = { multipv: 1, threads: 1 };
  /** Увеличивается при каждом stop(): поиски, поставленные в очередь раньше, отменяются. */
  private generation = 0;
  name = '';

  constructor(transport: EngineTransport = createTransport()) {
    this.transport = transport;
  }

  init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        this.transport.onLine((l) => this.handle(l));
        await this.transport.start();
        this.transport.send('uci');
        await this.waitFor((l) => l === 'uciok');
        this.transport.send('setoption name UCI_Variant value janggi');
        this.transport.send('setoption name Threads value 1');
        this.transport.send(`setoption name Hash value ${isMobile ? 64 : 256}`);
        await this.isReady();
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  private handle(line: string) {
    if (line.startsWith('id name ')) this.name = line.slice(8);
    const w = this.waiters.find((x) => x.test(line));
    if (w) {
      this.waiters.splice(this.waiters.indexOf(w), 1);
      w.resolve();
    }
    const job = this.job;
    if (!job) return;
    const info = parseInfo(line);
    if (info) {
      job.lines.set(info.multipv, info);
      job.opts.onInfo?.(sortedLines(job.lines));
      let d = job.byDepth.get(info.depth);
      if (!d) job.byDepth.set(info.depth, (d = new Map()));
      d.set(info.multipv, info);
      const expected = job.opts.expectedLines ?? job.opts.multipv ?? 1;
      if (d.size >= expected) {
        job.complete = sortedLines(d);
        job.opts.onDepth?.(job.complete);
      }
    } else if (line.startsWith('bestmove')) {
      const best = line.split(/\s+/)[1];
      this.job = null;
      // Отдаём последний целиком досчитанный набор: в нём все варианты одной глубины.
      const lines = job.complete && job.complete[0]?.pv[0] === best ? job.complete : sortedLines(job.lines);
      job.resolve({ bestmove: best && best !== '(none)' ? best : null, lines });
    }
  }

  private waitFor(test: (l: string) => boolean) {
    return new Promise<void>((resolve) => this.waiters.push({ test, resolve }));
  }

  private isReady() {
    this.transport.send('isready');
    return this.waitFor((l) => l === 'readyok');
  }

  /** Останавливает текущий поиск (результат придёт в его промис). */
  stop() {
    this.generation++;
    if (this.job) this.transport.send('stop');
  }

  /** Запускает поиск. Поиски выполняются по очереди; новый поиск не прерывает старый — вызовите stop(). */
  search(opts: SearchOptions): Promise<SearchResult> {
    const gen = this.generation;
    const run = async (): Promise<SearchResult> => {
      await this.init();
      if (gen !== this.generation) return { bestmove: null, lines: [] };
      const multipv = opts.multipv ?? 1;
      if (opts.elo !== this.current.elo || opts.skill !== this.current.skill) {
        this.transport.send(`setoption name UCI_LimitStrength value ${opts.elo !== undefined}`);
        if (opts.elo !== undefined) this.transport.send(`setoption name UCI_Elo value ${opts.elo}`);
        this.transport.send(`setoption name Skill Level value ${opts.skill ?? 20}`);
      }
      if (multipv !== this.current.multipv) this.transport.send(`setoption name MultiPV value ${multipv}`);
      const threads = opts.threads ?? 1;
      if (threads !== this.current.threads) this.transport.send(`setoption name Threads value ${threads}`);
      if (opts.clearHash) this.transport.send('setoption name Clear Hash');
      this.current = { elo: opts.elo, skill: opts.skill, multipv, threads };
      await this.isReady();
      if (gen !== this.generation) return { bestmove: null, lines: [] };
      const moves = opts.moves?.length ? ` moves ${opts.moves.join(' ')}` : '';
      this.transport.send(`position fen ${opts.fen}${moves}`);
      const go = opts.infinite
        ? 'go infinite'
        : opts.depth
          ? `go depth ${opts.depth}`
          : `go movetime ${opts.movetime ?? 1000}`;
      return new Promise<SearchResult>((resolve) => {
        this.job = { opts, resolve, lines: new Map(), byDepth: new Map(), complete: null };
        this.transport.send(go);
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

function sortedLines(m: Map<number, PvInfo>): PvInfo[] {
  return [...m.values()].sort((a, b) => a.multipv - b.multipv);
}

let shared: Engine | null = null;
export function getEngine(): Engine {
  if (!shared) shared = new Engine();
  return shared;
}

// ---------- Уровни бота ----------

export interface BotLevel {
  id: number;
  name: string;
  /** Корейский разряд (급 — кю, 단 — дан). */
  rank: string;
  elo?: number;
  skill?: number;
  movetime: number;
  /** Думать на всех ядрах (только для уровня без ограничений: на ограниченных сила задана Elo). */
  allThreads?: boolean;
}

/**
 * Лестница уровней: от новичка до полной силы движка.
 * Elo — приблизительный (ограничение силы Fairy-Stockfish откалибровано по шахматам),
 * корейские разряды указаны по соответствию рейтинга.
 */
export const BOT_LEVELS: BotLevel[] = [
  { id: 1, name: 'Новичок', rank: '18 급', skill: -10, movetime: 200 },
  { id: 2, name: 'Начинающий', rank: '15 급', elo: 750, movetime: 300 },
  { id: 3, name: 'Любитель', rank: '10 급', elo: 1000, movetime: 400 },
  { id: 4, name: 'Клубный игрок', rank: '5 급', elo: 1250, movetime: 500 },
  { id: 5, name: 'Сильный любитель', rank: '1 급', elo: 1500, movetime: 700 },
  { id: 6, name: 'Кандидат', rank: '1 단', elo: 1800, movetime: 1000 },
  { id: 7, name: 'Мастер', rank: '3 단', elo: 2100, movetime: 1500 },
  { id: 8, name: 'Эксперт', rank: '5 단', elo: 2400, movetime: 2000 },
  { id: 9, name: 'Профессионал', rank: '7 단', elo: 2700, movetime: 3000 },
  { id: 10, name: 'Максимум', rank: 'без ограничений', movetime: 5000, allThreads: true },
];

/** Оценка с точки зрения Чо (положительная — перевес Чо). */
export function scoreForCho(score: Score, sideToMove: 'w' | 'b'): Score {
  const k = sideToMove === 'w' ? 1 : -1;
  return score.mate !== undefined ? { mate: score.mate * k } : { cp: (score.cp ?? 0) * k };
}

export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    const n = Math.abs(score.mate);
    return `${score.mate > 0 ? 'Чо' : 'Хан'}: мат в ${n} ход${n === 1 ? '' : n < 5 ? 'а' : 'ов'}`;
  }
  const v = (score.cp ?? 0) / 100;
  if (Math.abs(v) < 0.2) return 'Равная позиция';
  return `${v > 0 ? 'Чо' : 'Хан'} +${Math.abs(v).toFixed(1).replace('.', ',')}`;
}
