import type { GameAdapter } from '../net/protocol';
import { VillaGame } from './engine';
import { botAnswer, botDelay } from './bot';
import { buildView } from './view';
import { MAX_PLAYERS, MIN_PLAYERS, MODES, MODE_IDS } from './rules';
import type { Answer, GameView, Mode, PromptReq } from './types';

export const villaAdapter: GameAdapter<VillaGame, GameView, Answer, PromptReq> = {
  id: 'villa',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  options: [
    {
      id: 'mode',
      label: 'Modo de juego',
      default: 'rapida',
      choices: MODE_IDS.map((m) => ({ id: m, label: MODES[m].name, hint: MODES[m].text })),
    },
  ],
  create: (seats, hooks, options) =>
    new VillaGame(seats, { ask: hooks.ask, cancel: hooks.cancel, onChange: hooks.onChange, pause: hooks.pause, mode: (options?.mode as Mode) ?? 'rapida' }),
  run: (g) => g.run(),
  player: (g, id) => g.byId(id),
  view: buildView,
  bot: botAnswer,
  botDelay,
};
