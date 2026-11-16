import type { GameAdapter } from '../net/protocol';
import { Game } from './engine';
import { botAnswer } from './bot';
import { buildView } from './view';
import { MAX_PLAYERS, MIN_PLAYERS } from './characters';
import type { Answer, GameView, PromptReq } from './types';

export const polvoAdapter: GameAdapter<Game, GameView, Answer, PromptReq> = {
  id: 'polvo',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  create: (seats, hooks) => new Game(seats, { ask: (req) => hooks.ask(req), onChange: hooks.onChange, pause: hooks.pause }),
  run: (g) => g.run(),
  player: (g, id) => g.byId(id),
  view: buildView,
  bot: botAnswer,
  botDelay: (req) => (req.prompt.type === 'play' ? 900 + Math.random() * 600 : 700 + Math.random() * 400),
};
