import {
  Execution,
  Game,
  isUnit,
  OwnerComp,
  Unit,
  UnitParams,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AirPathFinder } from "../pathfinding/PathFinding";
import { PseudoRandom } from "../PseudoRandom";
import { ShellExecution } from "./ShellExecution";

export class WarPlaneExecution implements Execution {
  private random: PseudoRandom;
  private plane: Unit;
  private mg: Game;
  private pathfinder: AirPathFinder;
  private lastShellAttack = 0;
  private alreadySentShell = new Set<Unit>();

  constructor(
    private input: (UnitParams<UnitType.WarPlane> & OwnerComp) | Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());
    this.pathfinder = new AirPathFinder(mg, this.random);
    if (isUnit(this.input)) {
      this.plane = this.input;
    } else {
      const spawn = this.input.owner.canBuild(
        UnitType.WarPlane,
        this.input.patrolTile,
      );
      if (spawn === false) {
        console.warn(
          `Failed to spawn warplane for ${this.input.owner.name()} at ${this.input.patrolTile}`,
        );
        return;
      }
      this.plane = this.input.owner.buildUnit(
        UnitType.WarPlane,
        spawn,
        this.input,
      );
    }
  }

  tick(ticks: number): void {
    if (this.plane.health() <= 0) {
      this.plane.delete();
      return;
    }
    const hasAirport = this.plane.owner().units(UnitType.Airport).length > 0;
    if (hasAirport) {
      this.plane.modifyHealth(1);
    }

    this.plane.setTargetUnit(this.findTargetUnit());

    this.patrol();

    if (this.plane.targetUnit() !== undefined) {
      this.shootTarget();
      return;
    }
  }

  private findTargetUnit(): Unit | undefined {
    const units = this.mg.nearbyUnits(
      this.plane.tile()!,
      this.mg.config().warshipTargettingRange(),
      [UnitType.TradePlane, UnitType.WarPlane],
    );
    const potential: { unit: Unit; distSquared: number }[] = [];
    for (const { unit, distSquared } of units) {
      if (
        unit.owner() === this.plane.owner() ||
        unit === this.plane ||
        unit.owner().isFriendly(this.plane.owner()) ||
        this.alreadySentShell.has(unit)
      ) {
        continue;
      }
      potential.push({ unit, distSquared });
    }
    potential.sort((a, b) => a.distSquared - b.distSquared);
    return potential[0]?.unit;
  }

  private shootTarget() {
    const rate = this.mg.config().warshipShellAttackRate();
    if (this.mg.ticks() - this.lastShellAttack > rate) {
      this.lastShellAttack = this.mg.ticks();
      this.mg.addExecution(
        new ShellExecution(
          this.plane.tile(),
          this.plane.owner(),
          this.plane,
          this.plane.targetUnit()!,
        ),
      );
      if (!this.plane.targetUnit()!.hasHealth()) {
        this.alreadySentShell.add(this.plane.targetUnit()!);
        this.plane.setTargetUnit(undefined);
        return;
      }
    }
  }

  private patrol() {
    if (this.plane.targetTile() === undefined) {
      this.plane.setTargetTile(this.randomTile());
      if (this.plane.targetTile() === undefined) {
        return;
      }
    }

    for (let i = 0; i < 2; i++) {
      const result = this.pathfinder.nextTile(
        this.plane.tile(),
        this.plane.targetTile()!,
      );
      if (result === true) {
        this.plane.setTargetTile(undefined);
        this.plane.move(this.plane.tile());
        break;
      } else {
        this.plane.move(result);
      }
    }
  }

  isActive(): boolean {
    return this.plane?.isActive();
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private randomTile(): TileRef | undefined {
    const range = this.mg.config().warshipPatrolRange();
    for (let i = 0; i < 50; i++) {
      const x =
        this.mg.x(this.plane.patrolTile()!) +
        this.random.nextInt(-range / 2, range / 2);
      const y =
        this.mg.y(this.plane.patrolTile()!) +
        this.random.nextInt(-range / 2, range / 2);
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      return this.mg.ref(x, y);
    }
    return undefined;
  }
}
