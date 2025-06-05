import { Execution, Game, Player, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";

export class MoveWarPlaneExecution implements Execution {
  constructor(
    private readonly owner: Player,
    private readonly unitId: number,
    private readonly position: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    const plane = this.owner
      .units(UnitType.WarPlane)
      .find((u) => u.id() === this.unitId);
    if (!plane) {
      console.warn("MoveWarPlaneExecution: warplane not found");
      return;
    }
    if (!plane.isActive()) {
      console.warn("MoveWarPlaneExecution: warplane is not active");
      return;
    }
    plane.setPatrolTile(this.position);
    plane.setTargetTile(undefined);
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
