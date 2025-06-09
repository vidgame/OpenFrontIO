import {
  Execution,
  Game,
  Player,
  PlayerID,
  PlayerType,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { NukeExecution } from "./NukeExecution";

interface Assignment {
  plane: Unit;
  target: TileRef;
  prev: TileRef | undefined;
  dropped: boolean;
}

export class RedAirExecution implements Execution {
  private mg: Game | null = null;
  private player: Player | null = null;
  private assignments: Assignment[] = [];
  private active = true;

  constructor(
    private readonly playerID: PlayerID,
    private readonly targetID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.playerID)) {
      console.warn(`RedAirExecution: player ${this.playerID} not found`);
      this.active = false;
      return;
    }
    this.player = mg.player(this.playerID);
    if (this.player.type() !== PlayerType.Human) {
      this.active = false;
      return;
    }

    const planes = this.availablePlanes();
    if (planes.length === 0) {
      this.active = false;
      return;
    }

    const cost = BigInt(planes.length) * 750_000n;
    if (this.player.gold() < cost) {
      console.warn("RedAirExecution: insufficient gold");
      this.active = false;
      return;
    }
    this.player.removeGold(cost);

    const targetPlayer = mg.hasPlayer(this.targetID)
      ? mg.player(this.targetID)
      : null;
    if (!targetPlayer || targetPlayer === this.player) {
      this.active = false;
      return;
    }

    const targets = this.chooseTargets(planes.length, targetPlayer);
    if (targets.length === 0) {
      this.active = false;
      return;
    }

    for (let i = 0; i < planes.length; i++) {
      const plane = planes[i];
      const target = targets[i];
      const prev = plane.patrolTile();
      plane.setPatrolTile(target);
      plane.setTargetTile(target);
      plane.setLastBombTick(ticks);
      this.assignments.push({ plane, target, prev, dropped: false });
    }
  }

  private availablePlanes(): Unit[] {
    if (!this.player || !this.mg) return [];
    const cd = this.mg.config().planeBombCooldown();
    return this.player.units(UnitType.WarPlane).filter((p) => {
      if (p.isInCooldown()) return false;
      const last = p.lastBombTick();
      return last === null || this.mg!.ticks() - last >= cd;
    });
  }

  private chooseTargets(num: number, enemy: Player): TileRef[] {
    if (!this.mg || !this.player) return [];
    const buildingTypes = [
      UnitType.City,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.Factory,
      UnitType.Airport,
      UnitType.SAMLauncher,
    ];
    const enemies = [enemy];
    const candidates: { tile: TileRef; score: number }[] = [];
    const radius = this.mg.config().nukeMagnitudes(UnitType.AtomBomb).outer;
    for (const enemy of enemies) {
      for (const unit of enemy.units(...buildingTypes)) {
        const around = this.mg
          .nearbyUnits(unit.tile(), radius, buildingTypes)
          .filter(
            ({ unit }) =>
              unit.owner() !== this.player &&
              !unit.owner().isFriendly(this.player!),
          );
        candidates.push({ tile: unit.tile(), score: around.length });
      }
    }
    if (candidates.length === 0) return [];
    candidates.sort((a, b) => b.score - a.score);
    const minDist = radius * 1.5;
    const minDist2 = minDist * minDist;
    const targets: TileRef[] = [];
    for (const cand of candidates) {
      if (targets.length >= num) break;
      const close = targets.some(
        (t) => this.mg!.euclideanDistSquared(t, cand.tile) < minDist2,
      );
      if (!close) targets.push(cand.tile);
    }
    if (targets.length === 0) targets.push(candidates[0].tile);
    while (targets.length < num) {
      targets.push(targets[targets.length % candidates.length]);
    }
    return targets.slice(0, num);
  }

  tick(ticks: number): void {
    if (!this.active || !this.mg || !this.player) return;
    let remaining = false;
    for (const a of this.assignments) {
      if (!a.plane.isActive()) continue;
      if (!a.dropped) {
        a.plane.setLastBombTick(this.mg.ticks());
      }
      if (!a.dropped && a.plane.tile() === a.target) {
        this.mg.addExecution(
          new NukeExecution(
            UnitType.PlaneBomb,
            this.player.id(),
            a.target,
            a.plane.tile(),
          ),
        );
        a.plane.setLastBombTick(this.mg.ticks());
        a.plane.launch();
        a.dropped = true;
        if (a.prev !== undefined) {
          a.plane.setPatrolTile(a.prev);
        }
        a.plane.setTargetTile(undefined);
      }
      if (!a.dropped) remaining = true;
    }
    if (!remaining) this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
