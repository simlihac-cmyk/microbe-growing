import "./styles.css";
import {
  COMBINE_RECIPES,
  MATERIAL_ICON,
  MATERIAL_IDS,
  MATERIAL_LABEL,
  MODE_LABEL,
  SHOP_ITEMS,
  STAGES,
  STORED_ORGANISM_LABEL,
  STORED_ORGANISM_LEVELS,
  type Mode,
} from "./gameData";
import {
  buyShopItem,
  canSubmitLeaderboard,
  collectDrop,
  combineRecipe,
  createInitialState,
  enhance,
  formatAmount,
  formatCost,
  getMonthKey,
  getProtectReward,
  getRecipeRequirement,
  getStage,
  loadState,
  reviveWithProtection,
  saveState,
  sellCurrent,
  setScreen,
  LEADERBOARD_PREFIX,
  startOverAfterFailure,
  STORAGE_PREFIX,
  storeCurrentOrganism,
  type GameState,
  type LeaderboardEntry,
} from "./gameLogic";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app is missing");
const app = root;
const TITLE_TEXT = "미생물 키우기";
const RESET_MODE_CONFIRM_MESSAGE = "현재 모드 진행을 초기화할까요?\n저장된 진행과 랭킹 도전 기록이 삭제됩니다.";
const titleMicrobeLevel = Math.floor(Math.random() * 30);
const DEFAULT_MICROBE_SIZES = "(max-width: 960px) 66vw, 470px";
const TITLE_MICROBE_SIZES = "(max-width: 960px) 58vw, 430px";
const RANKING_RUN_PREFIX = "microbe-growing-ranking-run-v1:";
const DISCOVERY_STORAGE_KEY = "microbe-growing-discovery-v1:max-level";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const ANDROID_APK_PATH = "/downloads/microbe-growing-debug.apk";
const IS_ANDROID_APP = import.meta.env.VITE_ANDROID_APP === "true";
const ADSENSE_CLIENT_ID = normalizeAdsenseClientId(
  import.meta.env.VITE_ADSENSE_CLIENT_ID ?? import.meta.env.VITE_ADSENSE_PUBLISHER_ID ?? "pub-1148471265184249",
);
const ADSENSE_BOTTOM_SLOT = readEnvString(import.meta.env.VITE_ADSENSE_BOTTOM_SLOT);

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let state: GameState | null = null;
let isTitleHelpOpen = false;
let isLeaderboardOpen = false;
let isCodexOpen = false;
let leaderboardEntries: LeaderboardEntry[] = [];
let leaderboardMonth = getMonthKey();
let leaderboardError: string | null = null;
let leaderboardLoading = false;
let discoveredMaxLevel = loadDiscoveredMaxLevel();

clearLegacyLocalLeaderboard();
persistDiscoveredMaxLevel();
render();
void refreshLeaderboard();

app.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const value = target.dataset.value;

  if (action === "select-mode" && isMode(value)) {
    state = loadState(localStorage, value) ?? createInitialState(value);
    state.screen = "game";
    recordDiscovery(state.level);
    persist();
    render();
    void syncRankingRun(state);
    return;
  }

  if (action === "toggle-help") {
    isTitleHelpOpen = !isTitleHelpOpen;
    if (isTitleHelpOpen) {
      isLeaderboardOpen = false;
      isCodexOpen = false;
    }
    render();
    return;
  }

  if (action === "toggle-ranking") {
    isLeaderboardOpen = !isLeaderboardOpen;
    if (isLeaderboardOpen) {
      isTitleHelpOpen = false;
      isCodexOpen = false;
    }
    render();
    if (isLeaderboardOpen) void refreshLeaderboard(true);
    return;
  }

  if (action === "toggle-codex") {
    isCodexOpen = !isCodexOpen;
    if (isCodexOpen) {
      isTitleHelpOpen = false;
      isLeaderboardOpen = false;
    }
    render();
    return;
  }

  if (action === "refresh-ranking") {
    void refreshLeaderboard(true);
    render();
    return;
  }

  if (!state || !action) return;

  switch (action) {
    case "enhance":
      state = enhance(state);
      break;
    case "sell":
      state = sellCurrent(state);
      break;
    case "store":
      state = storeCurrentOrganism(state);
      break;
    case "revive":
      state = reviveWithProtection(state);
      break;
    case "collect-drop":
      state = collectDrop(state);
      break;
    case "start-over":
      state = startOverAfterFailure(state);
      break;
    case "screen":
      if (isScreenValue(value)) state = setScreen(state, value);
      break;
    case "open-rank-submit":
      state = canSubmitLeaderboard(state)
        ? setScreen(state, "rankSubmit")
        : { ...state, message: "+24 이상부터 랭킹에 등록할 수 있습니다." };
      break;
    case "submit-ranking": {
      const name = app.querySelector<HTMLInputElement>("#rank-name")?.value ?? "";
      const submittingState = state;
      state = { ...state, message: "랭킹 등록 중..." };
      render();
      const result = await submitLeaderboardToServer(submittingState, name);
      if (result.error) {
        state = { ...submittingState, screen: "rankSubmit", message: result.error };
        break;
      }
      localStorage.removeItem(`${STORAGE_PREFIX}${submittingState.mode}`);
      clearRankingRun(submittingState.mode);
      state = null;
      isTitleHelpOpen = false;
      isLeaderboardOpen = true;
      isCodexOpen = false;
      render();
      return;
    }
    case "buy":
      if (value) state = buyShopItem(state, value);
      break;
    case "combine":
      if (value) state = combineRecipe(state, value);
      break;
    case "reset-mode":
      if (!window.confirm(RESET_MODE_CONFIRM_MESSAGE)) return;
      {
        const resetMode = state.mode;
        clearRankingRun(resetMode);
        state = createInitialState(resetMode);
        localStorage.removeItem(`${STORAGE_PREFIX}${resetMode}`);
      }
      break;
  }

  if (state) recordDiscovery(state.level);
  persist();
  render();
  if (state) void syncRankingRun(state);
});

function persist(): void {
  if (state) saveState(localStorage, state);
}

function clearLegacyLocalLeaderboard(): void {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
    (key): key is string => key?.startsWith(LEADERBOARD_PREFIX) ?? false,
  );

  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

function loadDiscoveredMaxLevel(): number {
  let maxLevel = readStoredDiscoveryLevel();
  for (const mode of ["easy", "hard"] as const) {
    const savedState = loadState(localStorage, mode);
    if (savedState) maxLevel = Math.max(maxLevel, savedState.level);
  }
  return clampStageLevel(maxLevel);
}

function readStoredDiscoveryLevel(): number {
  const value = Number.parseInt(localStorage.getItem(DISCOVERY_STORAGE_KEY) ?? "", 10);
  return Number.isInteger(value) ? value : 0;
}

function recordDiscovery(level: number): void {
  const nextLevel = clampStageLevel(level);
  if (nextLevel <= discoveredMaxLevel) return;
  discoveredMaxLevel = nextLevel;
  persistDiscoveredMaxLevel();
}

function persistDiscoveredMaxLevel(): void {
  localStorage.setItem(DISCOVERY_STORAGE_KEY, String(discoveredMaxLevel));
}

function clampStageLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(STAGES.easy.length - 1, Math.floor(level)));
}

async function refreshLeaderboard(showLoading = false): Promise<void> {
  if (showLoading) {
    leaderboardLoading = true;
    leaderboardError = null;
    render();
  }

  try {
    const response = await fetch(apiUrl("/api/leaderboard"), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const payload = await readApiPayload(response);

    if (!response.ok) {
      throw new Error(getApiError(payload) ?? "랭킹을 불러오지 못했습니다.");
    }

    applyLeaderboardPayload(payload);
    leaderboardError = null;
  } catch {
    leaderboardError = "서버 랭킹을 불러오지 못했습니다.";
  } finally {
    leaderboardLoading = false;
    render();
  }
}

async function submitLeaderboardToServer(
  current: GameState,
  name: string,
): Promise<{ error: string | null }> {
  try {
    const rankingRun = await syncRankingRun(current);
    if (!rankingRun.runId) {
      return { error: rankingRun.error ?? "랭킹 검증 서버에 연결하지 못했습니다." };
    }

    const response = await fetch(apiUrl("/api/leaderboard"), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name,
        mode: current.mode,
        level: current.level,
        runId: rankingRun.runId,
      }),
    });
    const payload = await readApiPayload(response);

    if (!response.ok) {
      return { error: getApiError(payload) ?? "랭킹 등록에 실패했습니다." };
    }

    applyLeaderboardPayload(payload);
    leaderboardError = null;
    return { error: null };
  } catch {
    return { error: "서버 랭킹에 연결하지 못했습니다." };
  }
}

type RankingRunSyncResult = { runId: string | null; error: string | null };
type RankingRunCheckpointResult = { ok: boolean; error: string | null };

async function syncRankingRun(current: GameState): Promise<RankingRunSyncResult> {
  const existingRunId = getRankingRun(current.mode);
  if (existingRunId) {
    const existingCheckpoint = await checkpointRankingRun(existingRunId, current);
    if (existingCheckpoint.ok) return { runId: existingRunId, error: null };
    clearRankingRun(current.mode);
  }

  const rankingRun = await ensureRankingRun(current.mode);
  if (!rankingRun.runId) return rankingRun;
  const checkpoint = await checkpointRankingRun(rankingRun.runId, current);
  if (checkpoint.ok) return rankingRun;

  clearRankingRun(current.mode);
  const replacementRun = await ensureRankingRun(current.mode);
  if (!replacementRun.runId) return replacementRun;
  const replacementCheckpoint = await checkpointRankingRun(replacementRun.runId, current);
  return replacementCheckpoint.ok
    ? replacementRun
    : { runId: null, error: replacementCheckpoint.error ?? checkpoint.error };
}

async function ensureRankingRun(mode: Mode): Promise<RankingRunSyncResult> {
  try {
    const response = await fetch(apiUrl("/api/ranking-run"), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        mode,
        runId: getRankingRun(mode),
      }),
    });
    const payload = await readApiPayload(response);

    if (!response.ok) {
      return { runId: null, error: getApiError(payload) ?? "랭킹 검증 서버에 연결하지 못했습니다." };
    }
    const runId = getPayloadRunId(payload);
    if (!runId) return { runId: null, error: "랭킹 검증 서버 응답이 올바르지 않습니다." };

    localStorage.setItem(getRankingRunStorageKey(mode), runId);
    return { runId, error: null };
  } catch {
    return { runId: null, error: "랭킹 검증 서버에 연결하지 못했습니다." };
  }
}

async function checkpointRankingRun(runId: string, current: GameState): Promise<RankingRunCheckpointResult> {
  try {
    const response = await fetch(apiUrl("/api/ranking-run"), {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        runId,
        mode: current.mode,
        level: current.level,
      }),
    });
    const payload = await readApiPayload(response);

    return { ok: response.ok, error: response.ok ? null : getApiError(payload) };
  } catch {
    return { ok: false, error: "랭킹 검증 서버에 연결하지 못했습니다." };
  }
}

async function readApiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function getPayloadRunId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const runId = (payload as { runId?: unknown }).runId;
  return typeof runId === "string" && runId ? runId : null;
}

function getRankingRun(mode: Mode): string | null {
  return localStorage.getItem(getRankingRunStorageKey(mode));
}

function clearRankingRun(mode: Mode): void {
  localStorage.removeItem(getRankingRunStorageKey(mode));
}

function getRankingRunStorageKey(mode: Mode): string {
  return `${RANKING_RUN_PREFIX}${mode}`;
}

function applyLeaderboardPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;

  const monthKey = (payload as { monthKey?: unknown }).monthKey;
  const entries = (payload as { entries?: unknown }).entries;

  leaderboardMonth = typeof monthKey === "string" ? monthKey : leaderboardMonth;
  leaderboardEntries = normalizeLeaderboardEntries(entries);
}

function getApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function normalizeLeaderboardEntries(value: unknown): LeaderboardEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): LeaderboardEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<LeaderboardEntry>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.level !== "number" ||
        typeof candidate.stageName !== "string" ||
        (candidate.mode !== "easy" && candidate.mode !== "hard") ||
        typeof candidate.submittedAt !== "number" ||
        typeof candidate.monthKey !== "string"
      ) {
        return null;
      }

      return {
        id: candidate.id,
        name: candidate.name,
        level: Math.floor(candidate.level),
        stageName: candidate.stageName,
        mode: candidate.mode,
        submittedAt: candidate.submittedAt,
        monthKey: candidate.monthKey,
        isAstrophage: candidate.isAstrophage === true || candidate.level === 29,
      };
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null);
}

function render(): void {
  app.innerHTML = state ? renderGame(state) : renderTitle();
  queueAdsenseUnits();
}

function renderTitle(): string {
  const titleMicrobeName = STAGES.easy[titleMicrobeLevel].name;

  return `
    <main class="shell">
      <section class="game-stage title-stage" aria-label="미생물 키우기 시작 화면">
        <div class="title-copy">
          <h1 class="title-logo wobbly-title" aria-label="${TITLE_TEXT}">${renderWobblyText(TITLE_TEXT)}</h1>
          <p class="version">V1.0.2</p>
        </div>
        <div class="title-microbe" aria-hidden="true">
          ${renderMicrobePicture(titleMicrobeLevel, "", TITLE_MICROBE_SIZES)}
        </div>
        <div class="title-panel">
          <div class="title-stats">
            <span>ATPlab</span>
            <span>${titleMicrobeName}</span>
          </div>
          <div class="mode-list">
            ${renderModeButton("easy", "이지모드")}
            ${renderModeButton("hard", "하드모드")}
          </div>
          <button class="help-button" type="button" data-action="toggle-help">
            ${isTitleHelpOpen ? "설명 닫기" : "게임 설명"}
          </button>
          <button class="help-button ranking-toggle" type="button" data-action="toggle-ranking">
            ${isLeaderboardOpen ? "랭킹 닫기" : "랭킹 보기"}
          </button>
          <button class="help-button codex-toggle" type="button" data-action="toggle-codex">
            ${isCodexOpen ? "도감 닫기" : "미생물 도감"}
          </button>
          ${
            IS_ANDROID_APP
              ? ""
              : `<a class="help-button android-download" href="${ANDROID_APK_PATH}" download>안드로이드 앱 다운로드</a>`
          }
        </div>
        ${isTitleHelpOpen ? renderTitleHelp() : ""}
        ${isLeaderboardOpen ? renderLeaderboardPanel("title") : ""}
        ${isCodexOpen ? renderCodexPanel() : ""}
      </section>
      ${renderOutsideGameChrome()}
    </main>
  `;
}

function renderTitleHelp(): string {
  return `
    <aside class="title-help" aria-label="게임 설명">
      <button class="help-close" type="button" data-action="toggle-help" aria-label="게임 설명 닫기">×</button>
      <h2>게임 설명</h2>
      <p class="help-lead">배양 버튼을 눌러 미생물을 키우고, 실패와 재료를 관리해서 +29까지 도전하는 게임입니다.</p>
      <ul class="help-list">
        <li><strong>1. 시작</strong><span>이지모드나 하드모드를 고른 뒤 가운데 배양 버튼을 누릅니다.</span></li>
        <li><strong>2. 성장</strong><span>성공하면 +단계가 올라가고, 단계가 높을수록 성공률이 낮아집니다.</span></li>
        <li><strong>3. 실패</strong><span>실패하면 미생물이 소멸합니다. 나온 물질은 먼저 수거하세요.</span></li>
        <li><strong>4. 복구</strong><span>방지권이 충분하면 실패한 미생물을 되살릴 수 있습니다.</span></li>
        <li><strong>5. 돈벌기</strong><span>안전하게 멈추고 싶으면 판매해서 atp를 벌고 다시 시작합니다.</span></li>
        <li><strong>6. 후반</strong><span>+19, +21, +22 미생물은 보관해두면 후반 배양 재료가 됩니다.</span></li>
        <li><strong>7. 조합</strong><span>실패로 얻은 물질은 조합소에서 방지권이나 특수 미생물로 바꿉니다.</span></li>
        <li><strong>목표</strong><span>+29 아스트로파지를 만들고 월간 랭킹에 이름을 올리세요.</span></li>
      </ul>
    </aside>
  `;
}

function renderModeButton(mode: Mode, label: string): string {
  return `
    <button class="mode-button" type="button" data-action="select-mode" data-value="${mode}">
      <span>${label}</span>
      <span class="round-button small" aria-hidden="true"><span></span></span>
    </button>
  `;
}

function renderCodexPanel(): string {
  return `
    <aside class="title-codex" aria-label="미생물 도감">
      <button class="help-close codex-close" type="button" data-action="toggle-codex" aria-label="미생물 도감 닫기">×</button>
      <div class="codex-heading">
        <h2>미생물 도감</h2>
        <p>최고 도달 +${discoveredMaxLevel}</p>
      </div>
      <div class="codex-grid">
        ${STAGES.easy.map((stage) => renderCodexTile(stage.level, stage.name, stage.level <= discoveredMaxLevel)).join("")}
      </div>
    </aside>
  `;
}

function renderCodexTile(level: number, name: string, unlocked: boolean): string {
  return `
    <article class="codex-tile ${unlocked ? "unlocked" : "locked"}">
      <div class="codex-art">
        ${unlocked ? renderMicrobePicture(level, `+${level} ${name}`, "(max-width: 960px) 26vw, 140px") : '<span aria-hidden="true">?</span>'}
      </div>
      <div class="codex-label">
        <strong>+${level}</strong>
        <span>${unlocked ? name : "?"}</span>
      </div>
    </article>
  `;
}

function renderGame(current: GameState): string {
  if (current.screen === "shop") return renderShop(current);
  if (current.screen === "inventory") return renderInventory(current);
  if (current.screen === "combine") return renderCombine(current);
  if (current.screen === "materials") return renderMaterials(current);
  if (current.screen === "failed") return renderFailed(current);
  if (current.screen === "rankSubmit") return renderRankSubmit(current);
  return renderMainGame(current);
}

function renderMainGame(current: GameState): string {
  const stage = getStage(current);
  const nextMaterialTip = getNextMaterialTip(current.level);
  const leftAction = getLeftAction(current);
  const rightAction = current.level === 0 ? { action: "screen", value: "shop", label: "상점가기" } : null;
  const canEnhance = stage.successRate !== null;

  return `
    <main class="shell">
      <section class="game-stage play-stage" aria-label="미생물 키우기 게임 화면">
        ${renderTopBar(current, leftAction, rightAction)}
        <div class="cost-panel">
          <p>배양비용:${formatDisplayCost(stage.cost)}</p>
          <p>판매가격:${stage.salePrice === null ? "-" : `${formatAmount(stage.salePrice)} atp`}</p>
          ${nextMaterialTip ? `<p class="tip">TIP<br>${nextMaterialTip}</p>` : ""}
        </div>
        <div class="organism-wrap" aria-hidden="true">${renderMicrobePlaceholder(stage.level)}</div>
        <div class="stage-actions">
          ${
            current.level === 0
              ? '<span class="stage-action-button sell-button sell-placeholder" aria-hidden="true">판매</span>'
              : '<button class="stage-action-button sell-button" type="button" data-action="sell" aria-label="판매하기">판매</button>'
          }
          <button class="stage-action-button enhance-button" type="button" data-action="enhance" aria-label="배양하기" ${canEnhance ? "" : "disabled"}>배양</button>
        </div>
        ${
          canSubmitLeaderboard(current)
            ? '<button class="rank-submit-button" type="button" data-action="open-rank-submit">랭킹 등록</button>'
            : ""
        }
        <div class="organism-name">+${stage.level} ${stage.name}</div>
        <div class="status-left">
          ${renderStoredAndTicketSummary(current)}
        </div>
        <div class="success-rate">성공률 ${stage.successRate === null ? "-" : `${stage.successRate}%`}</div>
        <div class="atp">${formatAmount(current.atp)} atp</div>
        <div class="message">${escapeHtml(current.message)}</div>
      </section>
      ${renderOutsideGameChrome()}
    </main>
  `;
}

function renderRankSubmit(current: GameState): string {
  const stage = getStage(current);
  const isAstrophage = current.level === 29;

  return `
    <main class="shell">
      <section class="game-stage panel-stage rank-stage ${isAstrophage ? "astrophage-stage" : ""}" aria-label="랭킹 등록 화면">
        ${renderTopTitle(current)}
        <div class="rank-submit-card ${isAstrophage ? "astrophage-card" : ""}">
          <div class="rank-submit-art">${renderMicrobePlaceholder(current.level)}</div>
          <div class="rank-submit-copy">
            <h2>${isAstrophage ? "아스트로파지 달성!" : "랭킹 등록"}</h2>
            <p>+${current.level} ${stage.name}</p>
            <label for="rank-name">이름</label>
            <input id="rank-name" class="rank-name-input" type="text" maxlength="12" autocomplete="off" placeholder="12자 이내" autofocus />
            <div class="rank-submit-actions">
              <button class="text-button" type="button" data-action="submit-ranking">등록하기</button>
              <button class="text-button ghost" type="button" data-action="screen" data-value="game">돌아가기</button>
            </div>
            <p class="rank-note">등록하면 현재 모드 진행이 초기화되고 첫 화면으로 돌아갑니다.</p>
          </div>
        </div>
        <div class="message">${escapeHtml(current.message)}</div>
      </section>
      ${renderOutsideGameChrome()}
    </main>
  `;
}

function renderFailed(current: GameState): string {
  const stage = getStage(current);
  const drop = current.pendingDrop;
  const canRevive = stage.protectCost !== null && current.protectTickets >= stage.protectCost;

  return `
    <main class="shell">
      <section class="game-stage failed-stage" aria-label="배양 실패 화면">
        ${renderTopTitle(current)}
        <div class="failure-copy">
          <h2>배양 실패</h2>
          <p>+${stage.level} ${stage.name} 소멸함</p>
          ${
            drop
              ? `
                <div class="failure-drop">
                  <img class="material-icon" src="${MATERIAL_ICON[drop.material]}" alt="" draggable="false" />
                  <span>${MATERIAL_LABEL[drop.material]} ${drop.amount}개 발생</span>
                </div>
              `
              : '<div class="failure-drop empty">남은 물질이 없습니다.</div>'
          }
        </div>
        <div class="failure-actions">
          ${
            drop
              ? '<button class="text-button" type="button" data-action="collect-drop">수거하기</button>'
              : '<div class="failure-placeholder">수거할 물질 없음</div>'
          }
          <button class="circle-labeled" type="button" data-action="revive" ${canRevive ? "" : "disabled"}>
            <span>방지권 사용${stage.protectCost === null ? " 불가" : ` (${stage.protectCost}개)`}</span>
          </button>
        </div>
        ${
          drop
            ? ""
            : '<div class="failure-reset"><button class="text-button danger" type="button" data-action="start-over">처음부터 다시</button></div>'
        }
        <div class="status-left">
          <p>방지권:${current.protectTickets}</p>
        </div>
        <div class="atp">${formatAmount(current.atp)} atp</div>
        <div class="message">${escapeHtml(current.message)}</div>
      </section>
      ${renderOutsideGameChrome()}
    </main>
  `;
}

function renderShop(current: GameState): string {
  return renderPanel(
    current,
    "상점",
    "atp를 다 쓰면 배양 비용을 낼 수 없습니다.",
    `
      <div class="shop-resource-bar" aria-label="상점 보유 자원">
        <div class="shop-resource atp-resource">
          <span>보유 ATP</span>
          <strong>${formatAmount(current.atp)} atp</strong>
        </div>
        <div class="shop-resource">
          <span>방지권</span>
          <strong>${current.protectTickets}개</strong>
        </div>
      </div>
      <div class="grid-list">
        ${SHOP_ITEMS.map((item) => {
          const price = item.prices[current.mode];
          const chance = item.reward.kind === "jump" ? item.reward.successRates[current.mode] : null;
          return `
            <article class="shop-row">
              <div>
                <h3>${item.label}</h3>
                <p>${item.description}${chance === null ? "" : ` · 성공률 ${chance}%`}</p>
              </div>
              <button class="text-button" type="button" data-action="buy" data-value="${item.id}" ${current.atp >= price ? "" : "disabled"}>
                ${formatAmount(price)} atp
              </button>
            </article>
          `;
        }).join("")}
      </div>
    `,
  );
}

function renderInventory(current: GameState): string {
  return renderPanel(
    current,
    "아이템창",
    "보관한 미생물",
    `
      <div class="inventory-grid">
        ${STORED_ORGANISM_LEVELS.map((level) => `
          <article class="inventory-tile">
            <div class="mini-organism">${renderMicrobePlaceholder(level)}</div>
            <strong>+${level} ${STORED_ORGANISM_LABEL[level]}</strong>
            <span>${current.storedOrganisms[level]}마리</span>
          </article>
        `).join("")}
      </div>
      <button class="text-button ghost" type="button" data-action="screen" data-value="materials">잡템창가기</button>
    `,
  );
}

function renderCombine(current: GameState): string {
  return renderPanel(
    current,
    "조합소",
    "수거한 물질을 방지권이나 미생물로 교환",
    `
      <button class="text-button ghost panel-side-action" type="button" data-action="screen" data-value="materials">잡템창가기</button>
      <div class="grid-list combine-list">
        ${COMBINE_RECIPES.map((recipe) => {
          const required = getRecipeRequirement(recipe, current.mode);
          const owned = current.materials[recipe.material];
          const reward =
            recipe.reward.kind === "protect"
              ? `방지권 ${getProtectReward(recipe, current.mode)}개`
              : `+${recipe.reward.level} ${STAGES[current.mode][recipe.reward.level].name}`;
          return `
            <article class="shop-row">
              <img class="material-icon small" src="${MATERIAL_ICON[recipe.material]}" alt="" draggable="false" />
              <div>
                <h3>${recipe.label}</h3>
                <p>${MATERIAL_LABEL[recipe.material]} ${required}개 → ${reward}</p>
              </div>
              <button class="text-button" type="button" data-action="combine" data-value="${recipe.id}" ${owned >= required ? "" : "disabled"}>
                보유 ${owned}
              </button>
            </article>
          `;
        }).join("")}
      </div>
    `,
  );
}

function renderMaterials(current: GameState): string {
  return renderPanel(
    current,
    "잡템창",
    "실패 후 수거한 물질",
    `
      <div class="material-grid">
        ${MATERIAL_IDS.map((materialId) => `
          <article>
            <img class="material-icon" src="${MATERIAL_ICON[materialId]}" alt="" draggable="false" />
            <strong>${MATERIAL_LABEL[materialId]}</strong>
            <span>${current.materials[materialId]}개</span>
          </article>
        `).join("")}
      </div>
    `,
  );
}

function renderPanel(current: GameState, title: string, subtitle: string, body: string): string {
  return `
    <main class="shell">
      <section class="game-stage panel-stage" aria-label="${title}">
        ${renderTopTitle(current)}
        <div class="panel-heading">
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        ${body}
        <div class="panel-footer">
          <button class="text-button" type="button" data-action="screen" data-value="game">돌아가기</button>
          <button class="text-button danger" type="button" data-action="reset-mode">현재 모드 초기화</button>
        </div>
        <div class="message">${escapeHtml(current.message)}</div>
      </section>
      ${renderOutsideGameChrome()}
    </main>
  `;
}

function renderOutsideGameChrome(): string {
  return `
    ${renderAdsenseBanner()}
    <footer class="site-links" aria-label="사이트 정보">
      <a href="https://monosaccharide180.com/" target="_blank" rel="noopener noreferrer">미생물의 똑똑한 하루</a>
      <a href="/policy/privacy/">개인정보처리방침</a>
      <a href="/policy/terms/">이용약관</a>
      <a href="/policy/disclosure/">광고/제휴 고지</a>
      <a href="/contact/">문의</a>
    </footer>
  `;
}

function renderAdsenseBanner(): string {
  if (IS_ANDROID_APP || !ADSENSE_CLIENT_ID || !ADSENSE_BOTTOM_SLOT) return "";

  return `
    <aside class="outside-game-ad" aria-label="광고">
      <ins
        class="adsbygoogle"
        style="display:block"
        data-ad-client="${ADSENSE_CLIENT_ID}"
        data-ad-slot="${escapeHtml(ADSENSE_BOTTOM_SLOT)}"
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </aside>
  `;
}

function queueAdsenseUnits(): void {
  if (IS_ANDROID_APP || !ADSENSE_CLIENT_ID || !ADSENSE_BOTTOM_SLOT) return;

  app.querySelectorAll<HTMLElement>("ins.adsbygoogle").forEach((unit) => {
    if (unit.dataset.microbeAdsenseQueued === "true") return;
    unit.dataset.microbeAdsenseQueued = "true";

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      unit.dataset.microbeAdsenseQueued = "false";
    }
  });
}

function renderLeaderboardPanel(context: "title" | "game"): string {
  const entries = leaderboardEntries;
  const month = leaderboardMonth;
  const easyEntries = entries.filter((entry) => entry.mode === "easy");
  const hardEntries = entries.filter((entry) => entry.mode === "hard");

  return `
    <aside class="${context === "title" ? "title-ranking" : "ranking-panel"}" aria-label="월간 랭킹">
      <button class="help-close ranking-close" type="button" data-action="toggle-ranking" aria-label="월간 랭킹 닫기">×</button>
      <h2>월간 랭킹</h2>
      <p class="ranking-month">${month}</p>
      ${
        leaderboardLoading
          ? '<p class="empty-ranking">랭킹을 불러오는 중입니다.</p>'
          : leaderboardError
            ? `<p class="empty-ranking">${escapeHtml(leaderboardError)}</p>`
            : entries.length === 0
          ? '<p class="empty-ranking">아직 등록된 미생물이 없습니다.</p>'
          : `
            <div class="ranking-sections">
              ${renderLeaderboardModeSection("easy", easyEntries)}
              ${renderLeaderboardModeSection("hard", hardEntries)}
            </div>
          `
      }
    </aside>
  `;
}

function renderLeaderboardModeSection(mode: Mode, entries: LeaderboardEntry[]): string {
  return `
    <section class="ranking-section" aria-label="${MODE_LABEL[mode]} 랭킹">
      <div class="ranking-section-title">
        <h3>${MODE_LABEL[mode]}</h3>
        <span>${entries.length}명</span>
      </div>
      ${
        entries.length === 0
          ? '<p class="empty-ranking mode-empty">아직 등록자가 없습니다.</p>'
          : `<ol class="ranking-list">${entries.map(renderLeaderboardEntry).join("")}</ol>`
      }
    </section>
  `;
}

function renderLeaderboardEntry(entry: LeaderboardEntry, index: number): string {
  const medalClass = index === 0 ? " gold-medal" : index === 1 ? " silver-medal" : index === 2 ? " bronze-medal" : "";
  return `
    <li class="ranking-entry ${index < 3 ? "podium-entry" : ""} ${entry.isAstrophage ? "astrophage-entry" : ""}">
      <span class="ranking-place${medalClass ? ` ranking-medal${medalClass}` : ""}">${index + 1}</span>
      <span class="ranking-name">${escapeHtml(entry.name)}</span>
      <span class="ranking-stage">+${entry.level} ${entry.stageName}</span>
    </li>
  `;
}

function renderTopBar(
  current: GameState,
  leftAction: { action: string; value?: string; label: string } | null,
  rightAction: { action: string; value?: string; label: string } | null,
): string {
  return `
    ${leftAction ? renderCircleTextButton(leftAction, "top-left") : ""}
    ${renderTopTitle(current)}
    ${rightAction ? renderCircleTextButton(rightAction, "top-right") : ""}
  `;
}

function renderTopTitle(current: GameState): string {
  return `
    <div class="top-title">
      <span class="top-title-text wobbly-title" aria-label="${TITLE_TEXT}">${renderWobblyText(TITLE_TEXT)}</span>
      <small>${MODE_LABEL[current.mode]}</small>
    </div>
  `;
}

function renderWobblyText(value: string): string {
  return [...value]
    .map((letter, index) => {
      const content = letter === " " ? "&nbsp;" : escapeHtml(letter);
      return `<span class="wobbly-letter wobble-${index % 8}" aria-hidden="true">${content}</span>`;
    })
    .join("");
}

function renderCircleTextButton(button: { action: string; value?: string; label: string }, className: string): string {
  const value = button.value ? ` data-value="${button.value}"` : "";
  return `
    <button class="circle-labeled ${className}" type="button" data-action="${button.action}"${value}>
      <span>${button.label}</span>
      <span class="round-button small" aria-hidden="true"><span></span></span>
    </button>
  `;
}

function getLeftAction(current: GameState): { action: string; value?: string; label: string } | null {
  const stage = getStage(current);
  if (stage.storable) return { action: "store", label: "미생물 보관하기" };
  if (current.level === 0) return { action: "screen", value: "inventory", label: "아이템창가기" };
  if (current.level === 1) return { action: "screen", value: "combine", label: "조합소가기" };
  return null;
}

function renderStoredAndTicketSummary(current: GameState): string {
  const pieces = [`방지권:${current.protectTickets}`, `고속증식:${current.storedOrganisms[19]}`];
  if (current.storedOrganisms[21] > 0 || current.level >= 21) pieces.push(`강독성:${current.storedOrganisms[21]}`);
  if (current.storedOrganisms[22] > 0 || current.level >= 22) pieces.push(`돌연변이:${current.storedOrganisms[22]}`);
  return pieces.map((piece) => `<p>${piece}</p>`).join("");
}

function getNextMaterialTip(level: number): string {
  if (level === 20) return "이후 배양에는<br>고속증식 세균 1마리가 필요합니다.";
  if (level === 21) return "다음 배양재료는<br>강독성 세균 2마리입니다.";
  if (level === 22) return "이후 배양재료는<br>미토콘드리아입니다.";
  if (level === 23) return "다음 배양재료는<br>돌연변이 세균 1마리입니다.";
  if (level === 24) return "다음 배양재료는<br>숙주의 영양분 15개입니다.";
  if (level === 26) return "다음 배양재료는<br>미확인 물질 2개입니다.";
  return "";
}

function formatDisplayCost(cost: ReturnType<typeof getStage>["cost"]): string {
  if (cost.kind === "material") return `${MATERIAL_LABEL[cost.material]} ${cost.amount}개`;
  if (cost.kind === "storedOrganism") return `${STORED_ORGANISM_LABEL[cost.level]} ${cost.amount}마리`;
  return formatCost(cost);
}

function renderMicrobePlaceholder(level: number): string {
  return renderMicrobePicture(level, `+${level} 미생물`, DEFAULT_MICROBE_SIZES);
}

function renderMicrobePicture(level: number, alt: string, sizes: string): string {
  const optimizedPath = `/microbes-optimized/${level}`;

  return `
    <picture class="microbe-picture">
      <source type="image/avif" srcset="${optimizedPath}-512.avif 512w, ${optimizedPath}-1024.avif 1024w" sizes="${sizes}" />
      <source type="image/webp" srcset="${optimizedPath}-512.webp 512w, ${optimizedPath}-1024.webp 1024w" sizes="${sizes}" />
      <img class="organism-image" src="/microbes/${level}.png" alt="${alt}" draggable="false" decoding="async" />
    </picture>
  `;
}

function readEnvString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAdsenseClientId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("ca-pub-")) return trimmed;
  if (trimmed.startsWith("pub-")) return `ca-${trimmed}`;
  if (/^\d+$/.test(trimmed)) return `ca-pub-${trimmed}`;
  return "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function isMode(value: string | undefined): value is Mode {
  return value === "easy" || value === "hard";
}

function isScreenValue(value: string | undefined): value is GameState["screen"] {
  return (
    value === "game" ||
    value === "shop" ||
    value === "inventory" ||
    value === "combine" ||
    value === "materials" ||
    value === "failed" ||
    value === "rankSubmit"
  );
}
