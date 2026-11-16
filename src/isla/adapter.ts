import type { GameAdapter } from '../net/protocol';
import { IslaGame } from './engine';
import { botAnswer, botDelay } from './bot';
import { buildView } from './view';
import { MAX_PLAYERS, MIN_PLAYERS } from './rules';
import type { Answer, GameView, PromptReq } from './types';

export const islaAdapter: GameAdapter<IslaGame, GameView, Answer, PromptReq> = {
  id: 'isla',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  create: (seats, hooks) => new IslaGame(seats, { ask: hooks.ask, cancel: hooks.cancel, onChange: hooks.onChange, pause: hooks.pause }),
  run: (g) => g.run(),
  player: (g, id) => g.byId(id),
  view: buildView,
  bot: botAnswer,
  botDelay,
};
