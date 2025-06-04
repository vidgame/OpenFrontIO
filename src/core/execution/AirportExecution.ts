import { consolex } from "../Consolex";
import {
  Execution,
  Game,
  Player,
  PlayerID,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { TradePlaneExecution } from "./TradePlaneExecution";

export class AirportExecution implements Execution {
  private active = true;
  private mg: Game | null = null;
  private airport: Unit | null = null;
  private random: PseudoRandom | null = null;
  private checkOffset: number | null = null;

  constructor(
    private _owner: PlayerID,
    private tile: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    if (!mg.hasPlayer(this._owner)) {
      console.warn(`AirportExecution: player ${this._owner} not found`);
      this.active = false;
      return;
    }
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());
    this.checkOffset = mg.ticks() % 10;
  }

  tick(ticks: number): void {
    if (this.mg === null || this.random === null || this.checkOffset === null) {
      throw new Error("Not initialized");
    }
    if (this.airport === null) {
      const player = this.mg.player(this._owner);
      const spawn = player.canBuild(UnitType.Airport, this.tile);
      if (spawn === false) {
        consolex.warn(`player ${player} cannot build airport at ${this.tile}`);
        this.active = false;
        return;
      }
      this.airport = player.buildUnit(UnitType.Airport, spawn, {});
    }

    if (!this.airport.isActive()) {
      this.active = false;
      return;
    }

    if (this._owner !== this.airport.owner().id()) {
      this._owner = this.airport.owner().id();
    }

    if ((this.mg.ticks() + this.checkOffset) % 10 !== 0) {
      return;
    }

    const total = this.mg.units(UnitType.Airport).length;
    if (!this.random.chance(this.mg.config().tradeShipSpawnRate(total))) {
      return;
    }

    const airports = this.player().tradingAirports(this.airport);
    if (airports.length === 0) {
      return;
    }
    const airport = this.random.randElement(airports);
    this.mg.addExecution(
      new TradePlaneExecution(this.player().id(), this.airport, airport),
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  player(): Player {
    if (this.airport === null) throw new Error("Not initialized");
    return this.airport.owner();
  }
}
