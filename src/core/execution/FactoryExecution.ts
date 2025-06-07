import { consolex } from "../Consolex";
import {
  Execution,
  Game,
  Gold,
  Player,
  PlayerID,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";

export class FactoryExecution implements Execution {
  private player: Player;
  private mg: Game;
  private factory: Unit | null = null;
  private active = true;

  private goldPerTick: Gold = 500n; // 5000 gold per second at 10 ticks/sec

  constructor(
    private ownerId: PlayerID,
    private tile: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.ownerId)) {
      console.warn(`FactoryExecution: player ${this.ownerId} not found`);
      this.active = false;
      return;
    }
    this.player = mg.player(this.ownerId);
  }

  tick(ticks: number): void {
    if (this.factory === null) {
      const spawnTile = this.player.canBuild(UnitType.Factory, this.tile);
      if (spawnTile === false) {
        consolex.warn("cannot build factory");
        this.active = false;
        return;
      }
      this.factory = this.player.buildUnit(UnitType.Factory, spawnTile, {});
    }
    if (!this.factory.isActive()) {
      this.active = false;
      return;
    }

    if (this.player !== this.factory.owner()) {
      this.player = this.factory.owner();
    }

    this.player.addGold(this.goldPerTick);
    this.mg.stats().goldWork(this.player, this.goldPerTick);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
