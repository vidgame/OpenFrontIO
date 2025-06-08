import { consolex } from "../Consolex";
import {
  Cell,
  Difficulty,
  Execution,
  Game,
  Gold,
  Nation,
  Player,
  PlayerID,
  PlayerType,
  Relation,
  TerrainType,
  Tick,
  Unit,
  UnitType,
} from "../game/Game";
import { euclDistFN, manhattanDistFN, TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { calculateBoundingBox, flattenedEmojiTable, simpleHash } from "../Util";
import { ConstructionExecution } from "./ConstructionExecution";
import { EmojiExecution } from "./EmojiExecution";
import { NukeExecution } from "./NukeExecution";
import { SpawnExecution } from "./SpawnExecution";
import { TransportShipExecution } from "./TransportShipExecution";
import { closestTwoTiles } from "./Util";
import { BotBehavior } from "./utils/BotBehavior";

export class FakeHumanExecution implements Execution {
  private firstMove = true;
  private active = true;
  private random: PseudoRandom;
  private behavior: BotBehavior | null = null;
  private mg: Game;
  private player: Player | null = null;

  private attackRate: number;
  private attackTick: number;
  private triggerRatio: number;
  private reserveRatio: number;

  private lastEmojiSent = new Map<Player, Tick>();
  private lastNukeSent: [Tick, TileRef][] = [];
  private embargoMalusApplied = new Set<PlayerID>();
  private heckleEmoji: number[];
  // Radius used to evaluate SAM launcher coverage
  private readonly SAM_SEARCH_RADIUS = 80;

  constructor(
    gameID: GameID,
    private nation: Nation,
  ) {
    this.random = new PseudoRandom(
      simpleHash(nation.playerInfo.id) + simpleHash(gameID),
    );
    // Bots act more frequently to launch missiles often
    this.attackRate = this.random.nextInt(20, 40);
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(60, 90) / 100;
    this.reserveRatio = this.random.nextInt(30, 60) / 100;
    this.heckleEmoji = ["🤡", "😡"].map((e) => flattenedEmojiTable.indexOf(e));
  }

  init(mg: Game) {
    this.mg = mg;
    if (this.random.chance(10)) {
      // this.isTraitor = true
    }
  }

  private updateRelationsFromEmbargos() {
    const player = this.player;
    if (player === null) return;
    const others = this.mg.players().filter((p) => p.id() !== player.id());

    others.forEach((other: Player) => {
      const embargoMalus = -20;
      if (
        other.hasEmbargoAgainst(player) &&
        !this.embargoMalusApplied.has(other.id())
      ) {
        player.updateRelation(other, embargoMalus);
        this.embargoMalusApplied.add(other.id());
      } else if (
        !other.hasEmbargoAgainst(player) &&
        this.embargoMalusApplied.has(other.id())
      ) {
        player.updateRelation(other, -embargoMalus);
        this.embargoMalusApplied.delete(other.id());
      }
    });
  }

  private handleEmbargoesToHostileNations() {
    const player = this.player;
    if (player === null) return;
    const others = this.mg.players().filter((p) => p.id() !== player.id());

    others.forEach((other: Player) => {
      /* When player is hostile starts embargo. Do not stop until neutral again */
      if (
        player.relation(other) <= Relation.Hostile &&
        !player.hasEmbargoAgainst(other)
      ) {
        player.addEmbargo(other.id(), false);
      } else if (
        player.relation(other) >= Relation.Neutral &&
        player.hasEmbargoAgainst(other)
      ) {
        player.stopEmbargo(other.id());
      }
    });
  }

  tick(ticks: number) {
    if (ticks % this.attackRate !== this.attackTick) return;

    if (this.mg.inSpawnPhase()) {
      const rl = this.randomLand();
      if (rl === null) {
        consolex.warn(`cannot spawn ${this.nation.playerInfo.name}`);
        return;
      }
      this.mg.addExecution(new SpawnExecution(this.nation.playerInfo, rl));
      return;
    }

    if (this.player === null) {
      this.player =
        this.mg.players().find((p) => p.id() === this.nation.playerInfo.id) ??
        null;
      if (this.player === null) {
        return;
      }
    }

    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }

    if (this.behavior === null) {
      // Player is unavailable during init()
      this.behavior = new BotBehavior(
        this.random,
        this.mg,
        this.player,
        this.triggerRatio,
        this.reserveRatio,
      );
    }

    if (this.firstMove) {
      this.firstMove = false;
      this.behavior.sendAttack(this.mg.terraNullius());
      return;
    }

    if (
      this.player.troops() > 100_000 &&
      this.player.targetTroopRatio() > 0.7
    ) {
      this.player.setTargetTroopRatio(0.7);
    }

    this.updateRelationsFromEmbargos();
    this.behavior.handleAllianceRequests();
    this.handleEnemies();
    this.handleUnits();
    this.handleEmbargoesToHostileNations();
    this.maybeAttack();
  }

  private maybeAttack() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }
    const enemyborder = Array.from(this.player.borderTiles())
      .flatMap((t) => this.mg.neighbors(t))
      .filter(
        (t) =>
          this.mg.isLand(t) && this.mg.ownerID(t) !== this.player?.smallID(),
      );

    if (enemyborder.length === 0) {
      if (this.random.chance(10)) {
        this.sendBoatRandomly();
      }
      return;
    }
    if (this.random.chance(20)) {
      this.sendBoatRandomly();
      return;
    }

    const enemiesWithTN = enemyborder.map((t) =>
      this.mg.playerBySmallID(this.mg.ownerID(t)),
    );
    if (enemiesWithTN.filter((o) => !o.isPlayer()).length > 0) {
      this.behavior.sendAttack(this.mg.terraNullius());
      return;
    }

    const enemies = enemiesWithTN
      .filter((o) => o.isPlayer())
      .sort((a, b) => a.troops() - b.troops());

    // 5% chance to send a random alliance request
    if (this.random.chance(20)) {
      const toAlly = this.random.randElement(enemies);
      if (this.player.canSendAllianceRequest(toAlly)) {
        this.player.createAllianceRequest(toAlly);
        return;
      }
    }

    // 50-50 attack weakest player vs random player
    const toAttack = this.random.chance(2)
      ? enemies[0]
      : this.random.randElement(enemies);
    if (this.shouldAttack(toAttack)) {
      this.behavior.sendAttack(toAttack);
    }
  }

  private shouldAttack(other: Player): boolean {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) {
      return false;
    }
    if (this.player.isFriendly(other)) {
      if (this.shouldDiscourageAttack(other)) {
        return this.random.chance(200);
      }
      return this.random.chance(50);
    } else {
      if (this.shouldDiscourageAttack(other)) {
        return this.random.chance(4);
      }
      return true;
    }
  }

  private shouldDiscourageAttack(other: Player) {
    if (other.isTraitor()) {
      return false;
    }
    const difficulty = this.mg.config().gameConfig().difficulty;
    if (
      difficulty === Difficulty.Hard ||
      difficulty === Difficulty.Impossible
    ) {
      return false;
    }
    if (other.type() !== PlayerType.Human) {
      return false;
    }
    // Only discourage attacks on Humans who are not traitors on easy or medium difficulty.
    return true;
  }

  handleEnemies() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }
    this.behavior.forgetOldEnemies();
    this.behavior.assistAllies();
    const enemy = this.behavior.selectEnemy();
    if (!enemy) return;
    this.maybeSendEmoji(enemy);
    this.maybeSendPlaneBomb(enemy);
    this.maybeSendNuke(enemy);
    if (this.player.sharesBorderWith(enemy)) {
      this.behavior.sendAttack(enemy);
    } else {
      this.maybeSendBoatAttack(enemy);
    }
  }

  private maybeSendEmoji(enemy: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (enemy.type() !== PlayerType.Human) return;
    const lastSent = this.lastEmojiSent.get(enemy) ?? -300;
    if (this.mg.ticks() - lastSent <= 300) return;
    this.lastEmojiSent.set(enemy, this.mg.ticks());
    this.mg.addExecution(
      new EmojiExecution(
        this.player.id(),
        enemy.id(),
        this.random.randElement(this.heckleEmoji),
      ),
    );
  }

  private maybeSendNuke(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    const silos = this.player.units(UnitType.MissileSilo);
    if (
      silos.length === 0 ||
      this.player.gold() < this.cost(UnitType.AtomBomb) ||
      other.type() === PlayerType.Bot ||
      this.player.isOnSameTeam(other)
    ) {
      return;
    }

    const structures = other.units(
      UnitType.City,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.SAMLauncher,
    );
    const sams = other.units(UnitType.SAMLauncher);
    const structureTiles = structures.map((u) => u.tile());
    const randomTiles: (TileRef | null)[] = new Array(10);
    for (let i = 0; i < randomTiles.length; i++) {
      randomTiles[i] = this.randTerritoryTile(other);
    }
    const allTiles = randomTiles.concat(structureTiles);

    type Candidate = {
      tile: TileRef;
      value: number;
      type: UnitType.AtomBomb | UnitType.HydrogenBomb;
    };
    let best: Candidate | null = null;
    this.removeOldNukeEvents();
    outer: for (const tile of new Set(allTiles)) {
      if (tile === null) continue;
      for (const t of this.mg.bfs(tile, manhattanDistFN(tile, 15))) {
        // Make sure we nuke at least 15 tiles in border
        if (this.mg.owner(t) !== other) {
          continue outer;
        }
      }
      if (!this.player.canBuild(UnitType.AtomBomb, tile)) continue;
      const value = this.nukeTileScore(tile, silos, structures);
      if (best === null || value > best.value) {
        best = { tile, value, type: UnitType.AtomBomb };
      }

      if (this.player.gold() >= this.cost(UnitType.HydrogenBomb)) {
        const ratio = this.landRatio(
          tile,
          this.mg.config().nukeMagnitudes(UnitType.HydrogenBomb).outer,
        );
        const preferHydrogen =
          ratio >= 0.5 ||
          (sams.length === 0 && other.troops() > this.player.troops());
        if (preferHydrogen) {
          const val =
            value *
            (sams.length === 0 && other.troops() > this.player.troops()
              ? 1.5
              : 1);
          if (best === null || val > best.value) {
            best = { tile, value: val, type: UnitType.HydrogenBomb };
          }
        }
      }
    }
    if (best !== null) {
      const enough = this.player.gold() >= this.cost(best.type);
      if (enough) {
        this.sendNuke(best.tile, best.type);
      } else if (this.player.gold() >= this.cost(UnitType.AtomBomb)) {
        this.sendNuke(best.tile, UnitType.AtomBomb);
      }
    }
  }

  private maybeSendPlaneBomb(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    const player = this.player;

    if (player.isOnSameTeam(other)) return;

    const planes = player
      .units(UnitType.WarPlane)
      .filter((p) => !p.isInCooldown());
    if (planes.length === 0) return;

    const maxBombs = Math.min(
      planes.length,
      Math.floor(Number(player.gold()) / Number(this.cost(UnitType.PlaneBomb))),
    );
    if (maxBombs === 0) return;

    const strongEnemy = other.troops() > player.troops();
    if (!this.random.chance(strongEnemy ? 90 : 60)) return;

    const sams = other.units(UnitType.SAMLauncher);
    const structures = other.units(
      UnitType.City,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.SAMLauncher,
    );

    const candidateTiles: TileRef[] = [];
    for (const u of structures) {
      candidateTiles.push(u.tile());
    }
    for (let i = 0; i < 10; i++) {
      const rand = this.randTerritoryTile(other);
      if (rand) candidateTiles.push(rand);
    }

    const silos = player.units(UnitType.MissileSilo);
    const scored = Array.from(new Set(candidateTiles))
      .map((tile) => ({
        tile,
        score: this.nukeTileScore(tile, silos, structures),
      }))
      .filter(({ tile }) => player.canBuild(UnitType.PlaneBomb, tile))
      .sort((a, b) => b.score - a.score);

    const bombLimit = strongEnemy ? maxBombs : Math.min(maxBombs, 3);
    for (const { tile } of scored.slice(0, bombLimit)) {
      this.mg.addExecution(
        new ConstructionExecution(player.id(), tile, UnitType.PlaneBomb),
      );
    }
  }

  private removeOldNukeEvents() {
    const maxAge = 500;
    const tick = this.mg.ticks();
    while (
      this.lastNukeSent.length > 0 &&
      this.lastNukeSent[0][0] + maxAge < tick
    ) {
      this.lastNukeSent.shift();
    }
  }

  private sendNuke(
    tile: TileRef,
    type: UnitType.AtomBomb | UnitType.HydrogenBomb,
  ) {
    if (this.player === null) throw new Error("not initialized");
    const tick = this.mg.ticks();
    this.lastNukeSent.push([tick, tile]);
    this.mg.addExecution(new NukeExecution(type, this.player.id(), tile));
  }

  private landRatio(tile: TileRef, radius: number): number {
    let land = 0;
    let total = 0;
    const dist = euclDistFN(tile, radius, false);
    for (const t of this.mg.bfs(tile, dist)) {
      total++;
      if (this.mg.isLand(t)) land++;
    }
    return land / Math.max(1, total);
  }

  private nukeTileScore(tile: TileRef, silos: Unit[], targets: Unit[]): number {
    // Potential damage in a 25-tile radius
    const dist = euclDistFN(tile, 25, false);
    let tileValue = targets
      .filter((unit) => dist(this.mg, unit.tile()))
      .map((unit) => {
        switch (unit.type()) {
          case UnitType.City:
            return 25_000;
          case UnitType.DefensePost:
            return 5_000;
          case UnitType.MissileSilo:
            return 50_000;
          case UnitType.Port:
            return 10_000;
          case UnitType.SAMLauncher:
            return 12_000;
          default:
            return 0;
        }
      })
      .reduce((prev, cur) => prev + cur, 0);

    // Prefer tiles that are closer to a silo
    if (silos.length > 0) {
      const siloTiles = silos.map((u) => u.tile());
      const result = closestTwoTiles(this.mg, siloTiles, [tile]);
      if (result !== null) {
        const { x: closestSilo } = result;
        const distanceSquared = this.mg.euclideanDistSquared(tile, closestSilo);
        const distanceToClosestSilo = Math.sqrt(distanceSquared);
        tileValue -= distanceToClosestSilo * 30;
      }
    }

    // Don't target near recent targets
    tileValue -= this.lastNukeSent
      .filter(([_tick, t]) => dist(this.mg, t))
      .map(() => 1_000_000)
      .reduce((prev, cur) => prev + cur, 0);

    return tileValue;
  }

  private maybeSendBoatAttack(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) return;
    const closest = closestTwoTiles(
      this.mg,
      Array.from(this.player.borderTiles()).filter((t) =>
        this.mg.isOceanShore(t),
      ),
      Array.from(other.borderTiles()).filter((t) => this.mg.isOceanShore(t)),
    );
    if (closest === null) {
      return;
    }
    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        other.id(),
        closest.y,
        this.player.troops() / 5,
        null,
      ),
    );
  }

  private handleUnits() {
    const player = this.player;
    if (player === null) return;
    const ports = player.units(UnitType.Port);
    if (ports.length === 0 && player.gold() > this.cost(UnitType.Port)) {
      const oceanTiles = Array.from(player.borderTiles()).filter((t) =>
        this.mg.isOceanShore(t),
      );
      if (oceanTiles.length > 0) {
        const buildTile = this.random.randElement(oceanTiles);
        this.mg.addExecution(
          new ConstructionExecution(player.id(), buildTile, UnitType.Port),
        );
      }
      return;
    }
    this.maybeSpawnStructure(UnitType.City, 2);
    this.maybeSpawnStructure(UnitType.Factory, 1);
    this.maybeSpawnStructure(UnitType.Airport, 1);
    if (this.maybeSpawnWarship()) {
      return;
    }
    this.maybeSpawnStructure(UnitType.MissileSilo, 1);
    this.maybeSpawnSAMLauncher();
    this.maybeSpawnWarPlane();
  }

  private maybeSpawnStructure(type: UnitType, maxNum: number) {
    if (this.player === null) throw new Error("not initialized");
    const units = this.player.units(type);
    if (units.length >= maxNum) {
      return;
    }
    if (this.player.gold() < this.cost(type)) {
      return;
    }
    const tile = this.randTerritoryTile(this.player);
    if (tile === null) {
      return;
    }
    if (!this.player.canBuild(type, tile)) {
      return;
    }
    this.mg.addExecution(
      new ConstructionExecution(this.player.id(), tile, type),
    );
  }

  private maybeSpawnWarship(): boolean {
    if (this.player === null) throw new Error("not initialized");
    if (!this.random.chance(50)) {
      return false;
    }
    const ports = this.player.units(UnitType.Port);
    const ships = this.player.units(UnitType.Warship);
    if (
      ports.length > 0 &&
      ships.length === 0 &&
      this.player.gold() > this.cost(UnitType.Warship)
    ) {
      const port = this.random.randElement(ports);
      const targetTile = this.warshipSpawnTile(port.tile());
      if (targetTile === null) {
        return false;
      }
      if (!this.player.canBuild(UnitType.Warship, targetTile)) {
        consolex.warn("cannot spawn destroyer");
        return false;
      }
      this.mg.addExecution(
        new ConstructionExecution(
          this.player.id(),
          targetTile,
          UnitType.Warship,
        ),
      );
      return true;
    }
    return false;
  }

  private maybeSpawnWarPlane(): void {
    if (this.player === null) throw new Error("not initialized");
    const airports = this.player.units(UnitType.Airport);
    if (airports.length === 0) return;

    const planes = this.player.units(UnitType.WarPlane);
    let allowed = this.maxWarPlanes();

    const neighbors = this.player
      .neighbors()
      .filter((n) => n.isPlayer() && !this.player!.isFriendly(n)) as Player[];
    const strongEnemy = neighbors.some(
      (n) => n.troops() > this.player!.troops(),
    );
    const atWar = neighbors.some(
      (n) =>
        this.player!.outgoingAttacks().some((a) => a.target() === n) ||
        this.player!.incomingAttacks().some((a) => a.attacker() === n),
    );
    if (atWar && strongEnemy) {
      allowed = Math.ceil(allowed * 1.5);
    } else if (
      neighbors.length > 0 &&
      neighbors.every((n) => this.player!.troops() >= n.troops() * 1.5)
    ) {
      allowed = Math.max(0, allowed - 1);
    }

    if (planes.length >= allowed) return;

    const spawnChance = strongEnemy ? 80 : 40;
    if (!this.random.chance(spawnChance)) return;

    if (this.player.gold() < this.cost(UnitType.WarPlane)) return;

    const tile = this.randTerritoryTile(this.player);
    if (tile === null) return;
    if (!this.player.canBuild(UnitType.WarPlane, tile)) return;

    this.mg.addExecution(
      new ConstructionExecution(this.player.id(), tile, UnitType.WarPlane),
    );
  }

  private maxWarPlanes(): number {
    if (this.player === null) throw new Error("not initialized");
    // Allow one war plane for every 100k troops
    return Math.floor(this.player.troops() / 100_000);
  }

  private randTerritoryTile(p: Player): TileRef | null {
    const boundingBox = calculateBoundingBox(this.mg, p.borderTiles());
    for (let i = 0; i < 100; i++) {
      const randX = this.random.nextInt(boundingBox.min.x, boundingBox.max.x);
      const randY = this.random.nextInt(boundingBox.min.y, boundingBox.max.y);
      if (!this.mg.isOnMap(new Cell(randX, randY))) {
        continue;
      }
      const randTile = this.mg.ref(randX, randY);
      if (this.mg.owner(randTile) === p) {
        return randTile;
      }
    }
    return null;
  }

  private warshipSpawnTile(portTile: TileRef): TileRef | null {
    const radius = 250;
    for (let attempts = 0; attempts < 50; attempts++) {
      const randX = this.random.nextInt(
        this.mg.x(portTile) - radius,
        this.mg.x(portTile) + radius,
      );
      const randY = this.random.nextInt(
        this.mg.y(portTile) - radius,
        this.mg.y(portTile) + radius,
      );
      if (!this.mg.isValidCoord(randX, randY)) {
        continue;
      }
      const tile = this.mg.ref(randX, randY);
      if (!this.mg.isOcean(tile)) {
        continue;
      }
      return tile;
    }
    return null;
  }

  private cost(type: UnitType): Gold {
    if (this.player === null) throw new Error("not initialized");
    return this.mg.unitInfo(type).cost(this.player);
  }

  sendBoatRandomly() {
    if (this.player === null) throw new Error("not initialized");
    const oceanShore = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    if (oceanShore.length === 0) {
      return;
    }

    const src = this.random.randElement(oceanShore);
    const dst = this.randOceanShoreTile(src, 150);
    if (dst === null) {
      return;
    }

    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        this.mg.owner(dst).id(),
        dst,
        this.player.troops() / 5,
        null,
      ),
    );
  }

  randomLand(): TileRef | null {
    const delta = 25;
    let tries = 0;
    while (tries < 50) {
      tries++;
      const cell = this.nation.spawnCell;
      const x = this.random.nextInt(cell.x - delta, cell.x + delta);
      const y = this.random.nextInt(cell.y - delta, cell.y + delta);
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      const tile = this.mg.ref(x, y);
      if (this.mg.isLand(tile) && !this.mg.hasOwner(tile)) {
        if (
          this.mg.terrainType(tile) === TerrainType.Mountain &&
          this.random.chance(2)
        ) {
          continue;
        }
        return tile;
      }
    }
    return null;
  }

  private randOceanShoreTile(tile: TileRef, dist: number): TileRef | null {
    if (this.player === null) throw new Error("not initialized");
    const x = this.mg.x(tile);
    const y = this.mg.y(tile);
    for (let i = 0; i < 500; i++) {
      const randX = this.random.nextInt(x - dist, x + dist);
      const randY = this.random.nextInt(y - dist, y + dist);
      if (!this.mg.isValidCoord(randX, randY)) {
        continue;
      }
      const randTile = this.mg.ref(randX, randY);
      if (!this.mg.isOceanShore(randTile)) {
        continue;
      }
      const owner = this.mg.owner(randTile);
      if (!owner.isPlayer()) {
        return randTile;
      }
      if (!owner.isFriendly(this.player)) {
        return randTile;
      }
    }
    return null;
  }

  private structureValue(unit: Unit): number {
    switch (unit.type()) {
      case UnitType.City:
        return 25_000;
      case UnitType.DefensePost:
        return 5_000;
      case UnitType.MissileSilo:
        return 50_000;
      case UnitType.Port:
        return 10_000;
      case UnitType.SAMLauncher:
        return 12_000;
      case UnitType.Factory:
        return 15_000;
      case UnitType.Airport:
        return 20_000;
      default:
        return 0;
    }
  }

  private samPlacementScore(
    tile: TileRef,
    sams: Unit[],
    structures: Unit[],
  ): number {
    const dist = euclDistFN(tile, this.SAM_SEARCH_RADIUS, false);
    let value = structures
      .filter((u) => dist(this.mg, u.tile()))
      .map((u) => this.structureValue(u))
      .reduce((p, c) => p + c, 0);
    if (sams.some((s) => dist(this.mg, s.tile()))) {
      value *= 0.5;
    }
    return value;
  }

  private maybeSpawnSAMLauncher(): void {
    if (this.player === null) throw new Error("not initialized");
    const player = this.player;
    if (player.gold() < this.cost(UnitType.SAMLauncher)) return;

    const sams = player.units(UnitType.SAMLauncher);
    const structures = player.units(
      UnitType.City,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.Factory,
      UnitType.Airport,
    );

    const candidates: { tile: TileRef; score: number }[] = [];
    for (const tile of player.tiles()) {
      if (!player.canBuild(UnitType.SAMLauncher, tile)) continue;
      const score = this.samPlacementScore(tile, sams, structures);
      candidates.push({ tile, score });
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best.score <= 0) return;
    this.mg.addExecution(
      new ConstructionExecution(player.id(), best.tile, UnitType.SAMLauncher),
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
