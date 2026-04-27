import { describe, expect, test } from "vitest";
import { EASY_STAGES, HARD_STAGES } from "./gameData";
import {
  buyShopItem,
  collectDrop,
  combineRecipe,
  createInitialState,
  enhance,
  getLeaderboardStorageKey,
  loadState,
  loadLeaderboard,
  reviveWithProtection,
  saveState,
  sellCurrent,
  STORAGE_PREFIX,
  startOverAfterFailure,
  storeCurrentOrganism,
  submitLeaderboardEntry,
  type GameState,
  type StorageLike,
} from "./gameLogic";

describe("microbe growing logic", () => {
  test("initial atp follows the selected mode", () => {
    expect(createInitialState("easy").atp).toBe(2_000);
    expect(createInitialState("hard").atp).toBe(1_000);
  });

  test("late-game balance table has boosted rates and protection costs", () => {
    expect(EASY_STAGES.slice(21, 29).map(({ successRate, protectCost }) => [successRate, protectCost])).toEqual([
      [50, 17],
      [50, 20],
      [50, 22],
      [50, 23],
      [45, 23],
      [60, 50],
      [50, 60],
      [25, 100],
    ]);
    expect(HARD_STAGES.slice(21, 29).map(({ successRate, protectCost }) => [successRate, protectCost])).toEqual([
      [40, 17],
      [37, 20],
      [37, 22],
      [35, 23],
      [45, 23],
      [60, 50],
      [50, 60],
      [25, 100],
    ]);
  });

  test("cultivation success spends atp and advances level", () => {
    const state = createInitialState("easy");
    const next = enhance(state, () => 0);

    expect(next.level).toBe(1);
    expect(next.atp).toBe(1_999);
    expect(next.screen).toBe("game");
  });

  test("cultivation failure spends atp and creates a collectable drop", () => {
    const state = { ...createInitialState("easy"), level: 10 };
    const next = enhance(state, rngSequence(0.99, 0.7));

    expect(next.level).toBe(10);
    expect(next.atp).toBe(1_978);
    expect(next.screen).toBe("failed");
    expect(next.pendingDrop).toEqual({ material: "lpxO", amount: 3 });
  });

  test("collecting a failure drop keeps the failed organism state", () => {
    const failed: GameState = {
      ...createInitialState("hard"),
      level: 14,
      screen: "failed",
      pendingDrop: { material: "adaptiveGene", amount: 2 },
    };
    const next = collectDrop(failed);

    expect(next.level).toBe(14);
    expect(next.materials.adaptiveGene).toBe(2);
    expect(next.pendingDrop).toBeNull();
    expect(next.screen).toBe("failed");
  });

  test("starting over after failure explicitly resets the current organism", () => {
    const failed: GameState = {
      ...createInitialState("hard"),
      level: 14,
      screen: "failed",
      pendingDrop: null,
    };
    const next = startOverAfterFailure(failed);

    expect(next.level).toBe(0);
    expect(next.screen).toBe("game");
  });

  test("protection revives a failed organism when tickets are sufficient", () => {
    const failed: GameState = {
      ...createInitialState("hard"),
      level: 19,
      protectTickets: 12,
      screen: "failed",
      pendingDrop: null,
    };
    const next = reviveWithProtection(failed);

    expect(next.level).toBe(19);
    expect(next.protectTickets).toBe(0);
    expect(next.screen).toBe("game");
  });

  test("protection is unavailable on no-protect stages", () => {
    const failed: GameState = {
      ...createInitialState("hard"),
      level: 3,
      protectTickets: 99,
      screen: "failed",
      pendingDrop: null,
    };
    const next = reviveWithProtection(failed);

    expect(next.level).toBe(3);
    expect(next.protectTickets).toBe(99);
    expect(next.screen).toBe("failed");
  });

  test("protection revives salmonella with 50 tickets", () => {
    const failed: GameState = {
      ...createInitialState("hard"),
      level: 26,
      protectTickets: 50,
      screen: "failed",
      pendingDrop: null,
    };
    const next = reviveWithProtection(failed);

    expect(next.level).toBe(26);
    expect(next.protectTickets).toBe(0);
    expect(next.screen).toBe("game");
  });

  test("selling returns to +0 and preserves sale prices", () => {
    const state = { ...createInitialState("easy"), level: 7, atp: 50 };
    const next = sellCurrent(state);

    expect(next.level).toBe(0);
    expect(next.atp).toBe(62);
  });

  test("storing a required organism increments storage and resets the run", () => {
    const state = { ...createInitialState("hard"), level: 19 };
    const next = storeCurrentOrganism(state);

    expect(next.level).toBe(0);
    expect(next.storedOrganisms[19]).toBe(1);
  });

  test("stored organisms are consumed by special cultivation costs", () => {
    const state = { ...createInitialState("hard"), level: 21 };
    state.storedOrganisms[19] = 1;
    const next = enhance(state, () => 0);

    expect(next.level).toBe(22);
    expect(next.storedOrganisms[19]).toBe(0);
  });

  test("materials are consumed by special cultivation costs", () => {
    const state = { ...createInitialState("easy"), level: 23 };
    state.materials.mitochondria = 8;
    const next = enhance(state, () => 0);

    expect(next.level).toBe(24);
    expect(next.materials.mitochondria).toBe(0);
  });

  test("combine recipes trade materials for protection tickets", () => {
    const state = createInitialState("hard");
    state.materials.lpxO = 5;
    const next = combineRecipe(state, "lpxo-to-protect");

    expect(next.protectTickets).toBe(2);
    expect(next.materials.lpxO).toBe(0);
  });

  test("combine recipes can create an organism", () => {
    const state = createInitialState("hard");
    state.materials.unknownGene = 3;
    const next = combineRecipe(state, "gene-to-organism");

    expect(next.level).toBe(13);
    expect(next.materials.unknownGene).toBe(0);
  });

  test("cultivation start tickets use the target stage success rate", () => {
    const state = createInitialState("easy");
    state.atp = 3_000;

    const success = buyShopItem(state, "jump-9", () => 0.84);
    const fail = buyShopItem(state, "jump-9", () => 0.85);

    expect(success.level).toBe(9);
    expect(success.atp).toBe(1_000);
    expect(fail.level).toBe(0);
  });

  test("+15 cultivation start ticket uses its shop-only boosted rate", () => {
    const state = createInitialState("easy");
    state.atp = 40_000;

    const success = buyShopItem(state, "jump-15", () => 0.64);
    const fail = buyShopItem(state, "jump-15", () => 0.65);

    expect(success.level).toBe(15);
    expect(fail.level).toBe(0);
  });

  test("bulk protection shop items add 30 and 300 tickets", () => {
    const thirtyTicketState = createInitialState("hard");
    thirtyTicketState.atp = 45_000;
    const thirtyTickets = buyShopItem(thirtyTicketState, "protect-30");

    expect(thirtyTickets.atp).toBe(0);
    expect(thirtyTickets.protectTickets).toBe(30);

    const threeHundredTicketState = createInitialState("easy");
    threeHundredTicketState.atp = 430_000;
    const threeHundredTickets = buyShopItem(threeHundredTicketState, "protect-300");

    expect(threeHundredTickets.atp).toBe(0);
    expect(threeHundredTickets.protectTickets).toBe(300);
  });

  test("state can be saved and loaded by mode with the microbe storage key", () => {
    const storage = new MemoryStorage();
    const state = createInitialState("hard");
    state.level = 12;
    state.materials.lpxO = 2;

    saveState(storage, state);
    const loaded = loadState(storage, "hard");

    expect(storage.getItem(`${STORAGE_PREFIX}hard`)).not.toBeNull();
    expect(storage.getItem("sword-enchanting-v1:hard")).toBeNull();
    expect(loaded?.level).toBe(12);
    expect(loaded?.materials.lpxO).toBe(2);
    expect(loadState(storage, "easy")).toBeNull();
  });

  test("leaderboard only accepts +24 or higher organisms", () => {
    const storage = new MemoryStorage();
    const state = { ...createInitialState("easy"), level: 23 };

    const result = submitLeaderboardEntry(storage, state, "배양자", new Date("2026-04-10T00:00:00"));

    expect(result.entry).toBeNull();
    expect(result.error).toContain("+24");
    expect(loadLeaderboard(storage, new Date("2026-04-10T00:00:00"))).toEqual([]);
  });

  test("leaderboard ranks higher levels first and earlier submissions first on ties", () => {
    const storage = new MemoryStorage();
    const firstLevel24 = { ...createInitialState("easy"), level: 24 };
    const secondLevel24 = { ...createInitialState("hard"), level: 24 };
    const laterLevel25 = { ...createInitialState("easy"), level: 25 };

    submitLeaderboardEntry(storage, firstLevel24, "첫번째", new Date("2026-04-01T00:00:00"));
    submitLeaderboardEntry(storage, secondLevel24, "두번째", new Date("2026-04-02T00:00:00"));
    submitLeaderboardEntry(storage, laterLevel25, "강한사람", new Date("2026-04-03T00:00:00"));

    const entries = loadLeaderboard(storage, new Date("2026-04-20T00:00:00"));

    expect(entries.map((entry) => entry.name)).toEqual(["강한사람", "첫번째", "두번째"]);
    expect(entries.map((entry) => entry.level)).toEqual([25, 24, 24]);
  });

  test("leaderboard uses a monthly storage key so the visible ranking resets each month", () => {
    const storage = new MemoryStorage();
    const state = { ...createInitialState("hard"), level: 29 };
    const april = new Date("2026-04-30T23:00:00");
    const may = new Date("2026-05-01T00:00:00");

    submitLeaderboardEntry(storage, state, "4월우승", april);

    expect(storage.getItem(getLeaderboardStorageKey(april))).not.toBeNull();
    expect(loadLeaderboard(storage, april)).toHaveLength(1);
    expect(loadLeaderboard(storage, may)).toEqual([]);
  });

  test("astrophage leaderboard entries are flagged for special presentation", () => {
    const storage = new MemoryStorage();
    const state = { ...createInitialState("hard"), level: 29 };

    const result = submitLeaderboardEntry(storage, state, "아스트로", new Date("2026-04-15T00:00:00"));

    expect(result.entry?.stageName).toBe("아스트로파지");
    expect(result.entry?.isAstrophage).toBe(true);
    expect(result.entries[0].isAstrophage).toBe(true);
  });
});

function rngSequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}
