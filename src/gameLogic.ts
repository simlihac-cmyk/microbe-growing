import {
  COMBINE_RECIPES,
  INITIAL_ATP,
  MATERIAL_IDS,
  SHOP_ITEMS,
  STAGES,
  STORED_ORGANISM_LEVELS,
  type CombineRecipe,
  type EnhanceCost,
  type MaterialId,
  type Mode,
  type OrganismStage,
  type ShopItem,
  type StoredOrganismLevel,
} from "./gameData";

export type Screen = "title" | "game" | "shop" | "inventory" | "combine" | "materials" | "failed" | "rankSubmit";

export interface PendingDrop {
  material: MaterialId;
  amount: number;
}

export interface GameState {
  mode: Mode;
  level: number;
  atp: number;
  protectTickets: number;
  materials: Record<MaterialId, number>;
  storedOrganisms: Record<StoredOrganismLevel, number>;
  pendingDrop: PendingDrop | null;
  message: string;
  screen: Screen;
}

export type Rng = () => number;

export const STORAGE_PREFIX = "microbe-growing-v1:";
export const LEADERBOARD_PREFIX = "microbe-growing-leaderboard-v1:";

export interface LeaderboardEntry {
  id: string;
  name: string;
  level: number;
  stageName: string;
  mode: Mode;
  submittedAt: number;
  monthKey: string;
  isAstrophage: boolean;
}

export interface LeaderboardSubmitResult {
  entry: LeaderboardEntry | null;
  entries: LeaderboardEntry[];
  error: string | null;
}

export function createInitialState(mode: Mode): GameState {
  return {
    mode,
    level: 0,
    atp: INITIAL_ATP[mode],
    protectTickets: 0,
    materials: createEmptyMaterials(),
    storedOrganisms: createEmptyStoredOrganisms(),
    pendingDrop: null,
    message: `${mode === "easy" ? "이지" : "하드"}모드 배양 시작`,
    screen: "game",
  };
}

export function getStage(state: GameState): OrganismStage {
  return STAGES[state.mode][state.level];
}

export function getStageByMode(mode: Mode, level: number): OrganismStage {
  return STAGES[mode][level];
}

export function enhance(state: GameState, rng: Rng = Math.random): GameState {
  if (state.screen === "failed") {
    return withMessage(state, "소멸한 미생물을 먼저 처리하세요.");
  }

  const stage = getStage(state);
  if (stage.successRate === null || stage.cost.kind === "none") {
    return withMessage(state, "이미 최종 단계입니다.");
  }

  if (!canPayCost(state, stage.cost)) {
    return withMessage(state, `배양 재료가 부족합니다: ${formatCost(stage.cost)}`);
  }

  const next = payCost(copyState(state), stage.cost);
  const roll = rng() * 100;
  if (roll < stage.successRate) {
    const nextLevel = Math.min(next.level + 1, STAGES[next.mode].length - 1);
    next.level = nextLevel;
    next.pendingDrop = null;
    next.screen = "game";
    next.message =
      nextLevel === 29
        ? "+29 아스트로파지 완성!"
        : `배양 성공! +${nextLevel} ${getStageByMode(next.mode, nextLevel).name}`;
    return next;
  }

  next.screen = "failed";
  next.pendingDrop = stage.drop ? { material: stage.drop, amount: randomDropAmount(rng) } : null;
  next.message = `배양 실패! +${stage.level} ${stage.name} 소멸`;
  return next;
}

export function sellCurrent(state: GameState): GameState {
  if (state.screen === "failed") {
    return withMessage(state, "소멸한 미생물은 판매할 수 없습니다.");
  }

  const stage = getStage(state);
  if (stage.salePrice === null) {
    return withMessage(state, "판매할 수 없는 미생물입니다.");
  }

  const next = resetRun(copyState(state));
  next.atp = roundOne(next.atp + stage.salePrice);
  next.message = `+${stage.level} ${stage.name} 판매 완료`;
  return next;
}

export function storeCurrentOrganism(state: GameState): GameState {
  const stage = getStage(state);
  if (!isStoredOrganismLevel(stage.level) || !stage.storable || state.screen === "failed") {
    return withMessage(state, "보관할 수 없는 미생물입니다.");
  }

  const next = resetRun(copyState(state));
  next.storedOrganisms[stage.level] += 1;
  next.message = `${stage.name} 1마리 보관 완료`;
  return next;
}

export function reviveWithProtection(state: GameState): GameState {
  if (state.screen !== "failed") {
    return withMessage(state, "되살릴 미생물이 없습니다.");
  }

  const stage = getStage(state);
  if (stage.protectCost === null) {
    return withMessage(state, "이 단계는 방지권으로 되살릴 수 없습니다.");
  }

  if (state.protectTickets < stage.protectCost) {
    return withMessage(state, `방지권이 ${stage.protectCost}개 필요합니다.`);
  }

  const next = copyState(state);
  next.protectTickets -= stage.protectCost;
  next.pendingDrop = null;
  next.screen = "game";
  next.message = `방지권 ${stage.protectCost}개를 사용해 되살렸습니다.`;
  return next;
}

export function collectDrop(state: GameState): GameState {
  if (state.screen !== "failed") {
    return withMessage(state, "주울 물질이 없습니다.");
  }

  const next = copyState(state);
  const drop = state.pendingDrop;
  if (drop) {
    next.materials[drop.material] += drop.amount;
    next.pendingDrop = null;
    next.screen = "failed";
    next.message = `${drop.amount}개를 수거했습니다.`;
  } else {
    next.message = "수거할 물질이 없습니다.";
  }
  return next;
}

export function startOverAfterFailure(state: GameState): GameState {
  if (state.screen !== "failed") {
    return withMessage(state, "처음으로 돌아갈 소멸 상태가 아닙니다.");
  }

  const next = resetRun(copyState(state));
  next.message = "처음부터 다시 배양합니다.";
  return next;
}

export function buyShopItem(state: GameState, itemId: string, rng: Rng = Math.random): GameState {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) return withMessage(state, "없는 상점 아이템입니다.");
  if (state.level !== 0 || state.screen === "failed") {
    return withMessage(state, "상점은 +0 상태에서만 이용할 수 있습니다.");
  }

  const price = item.prices[state.mode];
  if (state.atp < price) {
    return withMessage(state, "atp가 부족합니다.");
  }

  const next = copyState(state);
  next.atp = roundOne(next.atp - price);
  next.screen = "shop";

  if (item.reward.kind === "protect") {
    next.protectTickets += item.reward.amount;
    next.message = `방지권 ${item.reward.amount}개 구매 완료`;
    return next;
  }

  const target = getStageByMode(state.mode, item.reward.level);
  const chance = item.reward.successRates[state.mode];
  if (rng() * 100 < chance) {
    next.level = item.reward.level;
    next.screen = "game";
    next.message = `배양 시작 성공! +${target.level} ${target.name}`;
  } else {
    next.level = 0;
    next.message = `${item.label} 실패`;
  }
  return next;
}

export function combineRecipe(state: GameState, recipeId: string): GameState {
  const recipe = COMBINE_RECIPES.find((candidate) => candidate.id === recipeId);
  if (!recipe) return withMessage(state, "없는 조합식입니다.");
  if (state.screen === "failed") return withMessage(state, "소멸한 미생물을 먼저 처리하세요.");

  const required = getRecipeRequirement(recipe, state.mode);
  if (state.materials[recipe.material] < required) {
    return withMessage(state, "재료가 부족합니다.");
  }

  const next = copyState(state);
  next.materials[recipe.material] -= required;

  if (recipe.reward.kind === "protect") {
    next.protectTickets += getProtectReward(recipe, state.mode);
    next.screen = "combine";
    next.message = `${recipe.label} 교환 완료`;
    return next;
  }

  next.level = recipe.reward.level;
  next.pendingDrop = null;
  next.screen = "game";
  next.message = `+${recipe.reward.level} ${getStageByMode(state.mode, recipe.reward.level).name} 교환 완료`;
  return next;
}

export function setScreen(state: GameState, screen: Screen): GameState {
  return { ...copyState(state), screen };
}

export function resetGame(mode: Mode): GameState {
  return createInitialState(mode);
}

export function canPayCost(state: GameState, cost: EnhanceCost): boolean {
  switch (cost.kind) {
    case "atp":
      return state.atp >= cost.amount;
    case "material":
      return state.materials[cost.material] >= cost.amount;
    case "storedOrganism":
      return state.storedOrganisms[cost.level] >= cost.amount;
    case "free":
      return true;
    case "none":
      return false;
  }
}

export function formatCost(cost: EnhanceCost): string {
  switch (cost.kind) {
    case "atp":
      return `${formatAmount(cost.amount)} atp`;
    case "material":
      return `${cost.amount}개`;
    case "storedOrganism":
      return `${cost.amount}마리`;
    case "free":
      return "무료";
    case "none":
      return "-";
  }
}

export function formatAmount(value: number): string {
  const rounded = roundOne(value);
  return Number.isInteger(rounded) ? rounded.toLocaleString("ko-KR") : rounded.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function getRecipeRequirement(recipe: CombineRecipe, mode: Mode): number {
  return mode === "easy" ? recipe.easyAmount : recipe.hardAmount;
}

export function getProtectReward(recipe: CombineRecipe, mode: Mode): number {
  if (recipe.reward.kind !== "protect") return 0;
  if (mode === "easy" && recipe.reward.easyAmount !== undefined) return recipe.reward.easyAmount;
  if (mode === "hard" && recipe.reward.hardAmount !== undefined) return recipe.reward.hardAmount;
  return recipe.reward.amount;
}

export function getShopItem(itemId: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === itemId);
}

export function canSubmitLeaderboard(state: GameState): boolean {
  return state.screen !== "failed" && state.level >= 24;
}

export function getMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function getLeaderboardStorageKey(date = new Date()): string {
  return `${LEADERBOARD_PREFIX}${getMonthKey(date)}`;
}

export function loadLeaderboard(storage: StorageLike, date = new Date()): LeaderboardEntry[] {
  const raw = storage.getItem(getLeaderboardStorageKey(date));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortLeaderboard(parsed.map(normalizeLeaderboardEntry).filter((entry): entry is LeaderboardEntry => entry !== null));
  } catch {
    return [];
  }
}

export function submitLeaderboardEntry(
  storage: StorageLike,
  state: GameState,
  rawName: string,
  date = new Date(),
): LeaderboardSubmitResult {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 12);
  const entries = loadLeaderboard(storage, date);

  if (!canSubmitLeaderboard(state)) {
    return { entry: null, entries, error: "+24 이상 미생물만 랭킹에 등록할 수 있습니다." };
  }

  if (!name) {
    return { entry: null, entries, error: "이름을 입력하세요." };
  }

  const stage = getStage(state);
  const monthKey = getMonthKey(date);
  const entry: LeaderboardEntry = {
    id: `${date.getTime()}-${entries.length}`,
    name,
    level: state.level,
    stageName: stage.name,
    mode: state.mode,
    submittedAt: date.getTime(),
    monthKey,
    isAstrophage: state.level === 29,
  };
  const nextEntries = sortLeaderboard([...entries, entry]);
  storage.setItem(getLeaderboardStorageKey(date), JSON.stringify(nextEntries));

  return { entry, entries: nextEntries, error: null };
}

export function saveState(storage: StorageLike, state: GameState): void {
  storage.setItem(`${STORAGE_PREFIX}${state.mode}`, JSON.stringify(state));
}

export function loadState(storage: StorageLike, mode: Mode): GameState | null {
  const raw = storage.getItem(`${STORAGE_PREFIX}${mode}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return normalizeState(parsed, mode);
  } catch {
    return null;
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function normalizeState(parsed: Partial<GameState>, mode: Mode): GameState {
  const initial = createInitialState(mode);
  const level =
    typeof parsed.level === "number" && parsed.level >= 0 && parsed.level < STAGES[mode].length
      ? Math.floor(parsed.level)
      : initial.level;

  return {
    mode,
    level,
    atp: typeof parsed.atp === "number" && parsed.atp >= 0 ? roundOne(parsed.atp) : initial.atp,
    protectTickets:
      typeof parsed.protectTickets === "number" && parsed.protectTickets >= 0
        ? Math.floor(parsed.protectTickets)
        : initial.protectTickets,
    materials: normalizeMaterials(parsed.materials),
    storedOrganisms: normalizeStoredOrganisms(parsed.storedOrganisms),
    pendingDrop: normalizePendingDrop(parsed.pendingDrop),
    message: typeof parsed.message === "string" ? parsed.message : initial.message,
    screen: isScreen(parsed.screen) ? parsed.screen : "game",
  };
}

function payCost(state: GameState, cost: EnhanceCost): GameState {
  switch (cost.kind) {
    case "atp":
      state.atp = roundOne(state.atp - cost.amount);
      return state;
    case "material":
      state.materials[cost.material] -= cost.amount;
      return state;
    case "storedOrganism":
      state.storedOrganisms[cost.level] -= cost.amount;
      return state;
    case "free":
    case "none":
      return state;
  }
}

function resetRun(state: GameState): GameState {
  state.level = 0;
  state.pendingDrop = null;
  state.screen = "game";
  return state;
}

function withMessage(state: GameState, message: string): GameState {
  return { ...copyState(state), message };
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    materials: { ...state.materials },
    storedOrganisms: { ...state.storedOrganisms },
    pendingDrop: state.pendingDrop ? { ...state.pendingDrop } : null,
  };
}

function createEmptyMaterials(): Record<MaterialId, number> {
  return MATERIAL_IDS.reduce(
    (acc, materialId) => {
      acc[materialId] = 0;
      return acc;
    },
    {} as Record<MaterialId, number>,
  );
}

function createEmptyStoredOrganisms(): Record<StoredOrganismLevel, number> {
  return STORED_ORGANISM_LEVELS.reduce(
    (acc, level) => {
      acc[level] = 0;
      return acc;
    },
    {} as Record<StoredOrganismLevel, number>,
  );
}

function normalizeMaterials(input: unknown): Record<MaterialId, number> {
  const output = createEmptyMaterials();
  if (!input || typeof input !== "object") return output;

  for (const materialId of MATERIAL_IDS) {
    const value = (input as Partial<Record<MaterialId, unknown>>)[materialId];
    output[materialId] = typeof value === "number" && value >= 0 ? Math.floor(value) : 0;
  }
  return output;
}

function normalizeStoredOrganisms(input: unknown): Record<StoredOrganismLevel, number> {
  const output = createEmptyStoredOrganisms();
  if (!input || typeof input !== "object") return output;

  for (const level of STORED_ORGANISM_LEVELS) {
    const value = (input as Partial<Record<StoredOrganismLevel, unknown>>)[level];
    output[level] = typeof value === "number" && value >= 0 ? Math.floor(value) : 0;
  }
  return output;
}

function normalizePendingDrop(input: unknown): PendingDrop | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<PendingDrop>;
  if (!candidate.material || !MATERIAL_IDS.includes(candidate.material)) return null;
  if (typeof candidate.amount !== "number" || candidate.amount <= 0) return null;
  return { material: candidate.material, amount: Math.floor(candidate.amount) };
}

function randomDropAmount(rng: Rng): number {
  return 1 + Math.floor(rng() * 3);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function isStoredOrganismLevel(level: number): level is StoredOrganismLevel {
  return STORED_ORGANISM_LEVELS.includes(level as StoredOrganismLevel);
}

function isScreen(screen: unknown): screen is Screen {
  return (
    screen === "title" ||
    screen === "game" ||
    screen === "shop" ||
    screen === "inventory" ||
    screen === "combine" ||
    screen === "materials" ||
    screen === "failed" ||
    screen === "rankSubmit"
  );
}

function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((left, right) => {
    if (right.level !== left.level) return right.level - left.level;
    return left.submittedAt - right.submittedAt;
  });
}

function normalizeLeaderboardEntry(input: unknown): LeaderboardEntry | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<LeaderboardEntry>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  if (typeof candidate.level !== "number" || candidate.level < 24 || candidate.level > 29) return null;
  if (typeof candidate.stageName !== "string") return null;
  if (candidate.mode !== "easy" && candidate.mode !== "hard") return null;
  if (typeof candidate.submittedAt !== "number") return null;
  if (typeof candidate.monthKey !== "string") return null;
  return {
    id: typeof candidate.id === "string" ? candidate.id : `${candidate.submittedAt}-${candidate.name}`,
    name: candidate.name,
    level: Math.floor(candidate.level),
    stageName: candidate.stageName,
    mode: candidate.mode,
    submittedAt: candidate.submittedAt,
    monthKey: candidate.monthKey,
    isAstrophage: candidate.level === 29 || candidate.isAstrophage === true,
  };
}
