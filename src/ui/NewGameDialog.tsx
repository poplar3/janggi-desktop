import { useState } from 'react';
import { SETUPS, type Color, type Setup } from '../core/rules';
import { BOT_LEVELS } from '../engine/engine';
import type { GameConfig } from '../settings';
import { Modal } from './Modal';
import { PieceIcon, SIDE_NAMES, type PieceStyle } from './pieces';

interface Props {
  initial: GameConfig;
  onStart: (c: GameConfig) => void;
  onClose?: () => void;
}

function SetupPicker({ color, value, style, onChange }: { color: Color; value: Setup; style: PieceStyle; onChange: (s: Setup) => void }) {
  return (
    <div className="setup-picker">
      {SETUPS.map((s) => {
        const pieces = s.id.split('').map((t) => (color === 'w' ? t : t.toLowerCase()));
        return (
          <button key={s.id} className={`setup-option${value === s.id ? ' active' : ''}`} onClick={() => onChange(s.id)} title={s.ru}>
            <span className="setup-pieces">
              {pieces.slice(0, 2).map((p, i) => <PieceIcon key={i} piece={p} style={style} size={26} />)}
              <span className="setup-gap">…</span>
              {pieces.slice(2).map((p, i) => <PieceIcon key={i + 2} piece={p} style={style} size={26} />)}
            </span>
            <span className="setup-name">{s.ko}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NewGameDialog({ initial, onStart, onClose }: Props) {
  const [c, setC] = useState<GameConfig>(initial);
  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => setC((x) => ({ ...x, [k]: v }));

  return (
    <Modal
      title="Новая партия"
      onClose={onClose}
      wide
      footer={
        <>
          {onClose && (
            <button className="btn" onClick={onClose}>
              Отмена
            </button>
          )}
          <button className="btn primary" onClick={() => onStart(c)}>
            Начать партию
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Вид фигур</label>
          <div className="segmented">
            {(['icons', 'hanja'] as const).map((s) => (
              <button key={s} className={c.pieceStyle === s ? 'active' : ''} onClick={() => set('pieceStyle', s)}>
                <span className="style-preview">
                  {['R', 'N', 'C', 'k'].map((p) => <PieceIcon key={p} piece={p} style={s} size={30} />)}
                </span>
                {s === 'icons' ? 'Европейские иконки' : 'Традиционные иероглифы'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Соперник</label>
          <div className="segmented">
            <button className={c.mode === 'bot' ? 'active' : ''} onClick={() => set('mode', 'bot')}>
              Компьютер
            </button>
            <button className={c.mode === 'human' ? 'active' : ''} onClick={() => set('mode', 'human')}>
              Два игрока за одним компьютером
            </button>
          </div>
        </div>

        {c.mode === 'bot' && (
          <>
            <div className="field">
              <label>Вы играете за</label>
              <div className="segmented">
                {(['w', 'b'] as const).map((col) => (
                  <button key={col} className={c.humanColor === col ? 'active' : ''} onClick={() => set('humanColor', col)}>
                    <PieceIcon piece={col === 'w' ? 'K' : 'k'} style={c.pieceStyle} size={26} /> {SIDE_NAMES[col]}
                    {col === 'w' ? ' (ходит первым)' : ' (+1,5 очка)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Сила компьютера</label>
              <select value={c.level} onChange={(e) => set('level', Number(e.target.value))}>
                {BOT_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id}. {l.name} — {l.rank}
                    {l.elo ? `, ≈${l.elo} Elo` : l.id === 1 ? ', < 500 Elo' : ''}
                  </option>
                ))}
              </select>
              <p className="hint">
                Уровни идут от новичка (18 급) до полной силы движка. Корейские разряды: 급 (кып) — ученические, от
                18 до 1; 단 (дан) — мастерские. Elo приблизительный.
              </p>
            </div>
          </>
        )}

        <div className="field">
          <label>Расстановка Чо (상차림)</label>
          <SetupPicker color="w" value={c.choSetup} style={c.pieceStyle} onChange={(s) => set('choSetup', s)} />
        </div>
        <div className="field">
          <label>Расстановка Хана</label>
          <SetupPicker color="b" value={c.hanSetup} style={c.pieceStyle} onChange={(s) => set('hanSetup', s)} />
          <p className="hint">Слева направо — так, как игрок видит свою первую линию.</p>
        </div>
      </div>
    </Modal>
  );
}
