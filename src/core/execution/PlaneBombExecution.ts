import {
  Execution,
  Game,
  Player,
  PlayerID,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { NukeExecution } from "./NukeExecution";

export class PlaneBombExecution implements Execution {
  private mg: Game | null = null;
  private player: Player | null = null;
  private plane: Unit | null = null;
  private active = true;
  private bombDropped = false;
  private prevPatrolTile: TileRef | undefined;

  constructor(
    private readonly playerID: PlayerID,
    private readonly target: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.playerID)) {
      console.warn(`PlaneBombExecution: player ${this.playerID} not found`);
      this.active = false;
      return;
    }
    this.player = mg.player(this.playerID);
    const planes = this.player
      .units(UnitType.WarPlane)
      .sort(
        (a, b) =>
          mg.manhattanDist(a.tile(), this.target) -
          mg.manhattanDist(b.tile(), this.target),
      );
    this.plane = planes[0] ?? null;
    if (!this.plane) {
      console.warn("PlaneBombExecution: no war plane available");
      this.active = false;
      return;
    }

    // Save the previous patrol tile so it can be restored after the run
    this.prevPatrolTile = this.plane.patrolTile();
    // Move directly towards the target tile
    this.plane.setPatrolTile(this.target);
    this.plane.setTargetTile(this.target);
  }

  tick(ticks: number): void {
    if (!this.active || !this.mg || !this.player || !this.plane) {
      return;
    }
    if (!this.plane.isActive()) {
      this.active = false;
      return;
    }
    if (!this.bombDropped && this.plane.tile() === this.target) {
      this.mg.addExecution(
        new NukeExecution(
          UnitType.PlaneBomb,
          this.player.id(),
          this.target,
          this.plane.tile(),
        ),
      );
      this.bombDropped = true;
      if (this.prevPatrolTile !== undefined) {
        this.plane.setPatrolTile(this.prevPatrolTile);
      }
      this.plane.setTargetTile(undefined);
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
