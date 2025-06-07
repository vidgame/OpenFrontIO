import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { constructionExecution } from "./util/utils";

let game: Game;
let player: Player;

beforeEach(async () => {
  game = await setup("Plains", { instantBuild: true });
  const info = new PlayerInfo(
    "fr",
    "factory dude",
    PlayerType.Human,
    null,
    "p1",
  );
  game.addPlayer(info);
  const spawnTile = game.ref(1, 1);
  game.addExecution(new SpawnExecution(game.player(info.id).info(), spawnTile));
  while (game.inSpawnPhase()) {
    game.executeNextTick();
  }
  player = game.player(info.id);
  player.addGold(5_000_000n);
});

test("factory cost scales with number owned", () => {
  const unitInfo = game.config().unitInfo(UnitType.Factory);

  expect(unitInfo.cost(player)).toBe(0n);
  constructionExecution(game, player.id(), 1, 1, UnitType.Factory);
  expect(unitInfo.cost(player)).toBe(250_000n);
  constructionExecution(game, player.id(), 1, 1, UnitType.Factory);
  expect(unitInfo.cost(player)).toBe(500_000n);
  constructionExecution(game, player.id(), 1, 1, UnitType.Factory);
  expect(unitInfo.cost(player)).toBe(1_000_000n);
  constructionExecution(game, player.id(), 1, 1, UnitType.Factory);
  expect(unitInfo.cost(player)).toBe(1_000_000n);
});
