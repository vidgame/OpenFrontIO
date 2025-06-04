import { renderNumber } from "../../client/Utils";
import { consolex } from "../Consolex";
import {
  Execution,
  Game,
  MessageType,
  Player,
  PlayerID,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AirPathFinder } from "../pathfinding/PathFinding";
import { PseudoRandom } from "../PseudoRandom";

export class TradePlaneExecution implements Execution {
  private active = true;
  private mg: Game;
  private origOwner: Player;
  private tradePlane: Unit | undefined;
  private pathFinder: AirPathFinder;

  constructor(
    private _owner: PlayerID,
    private srcAirport: Unit,
    private _dstAirport: Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.origOwner = mg.player(this._owner);
    this.pathFinder = new AirPathFinder(mg, new PseudoRandom(mg.ticks()));
  }

  tick(ticks: number): void {
    if (this.tradePlane === undefined) {
      const spawn = this.origOwner.canBuild(
        UnitType.TradePlane,
        this.srcAirport.tile(),
      );
      if (spawn === false) {
        consolex.warn(`cannot build trade plane`);
        this.active = false;
        return;
      }
      this.tradePlane = this.origOwner.buildUnit(UnitType.TradePlane, spawn, {
        targetUnit: this._dstAirport,
      });
    }

    if (!this.tradePlane.isActive()) {
      this.active = false;
      return;
    }

    const result = this.pathFinder.nextTile(
      this.tradePlane.tile(),
      this._dstAirport.tile(),
    );
    if (result === true) {
      this.complete();
    } else {
      this.tradePlane.move(result);
    }
  }

  private complete() {
    this.active = false;
    this.tradePlane!.delete(false);
    const gold = this.mg
      .config()
      .tradeShipGold(
        this.mg.manhattanDist(this.srcAirport.tile(), this._dstAirport.tile()),
      );
    this.srcAirport.owner().addGold(gold);
    this._dstAirport.owner().addGold(gold);
    this.mg.displayMessage(
      `Received ${renderNumber(gold)} gold from air trade with ${this.srcAirport.owner().displayName()}`,
      MessageType.SUCCESS,
      this._dstAirport.owner().id(),
    );
    this.mg.displayMessage(
      `Received ${renderNumber(gold)} gold from air trade with ${this._dstAirport.owner().displayName()}`,
      MessageType.SUCCESS,
      this.srcAirport.owner().id(),
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  dstAirport(): TileRef {
    return this._dstAirport.tile();
  }
}
