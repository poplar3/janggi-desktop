import type { Color, Setup } from './core/rules';
import type { PieceStyle } from './ui/pieces';

export interface GameConfig {
  mode: 'human' | 'bot';
  /** За кого играет человек в партии с ботом. */
  humanColor: Color;
  level: number;
  choSetup: Setup;
  hanSetup: Setup;
  pieceStyle: PieceStyle;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'bot',
  humanColor: 'w',
  level: 3,
  choSetup: 'NBBN',
  hanSetup: 'NBBN',
  pieceStyle: 'icons',
};

const KEY = 'janggi.config.v1';

export function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // нет доступа к хранилищу — используем значения по умолчанию
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(c: GameConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // не критично
  }
}

export interface Prefs {
  /** Оценивать каждый ход во время игры. */
  evalMoves: boolean;
}

const PREFS_KEY = 'janggi.prefs.v1';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { evalMoves: true, ...JSON.parse(raw) };
  } catch {
    // нет доступа к хранилищу
  }
  return { evalMoves: true };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // не критично
  }
}
