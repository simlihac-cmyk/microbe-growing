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
const titleMicrobeLevel = Math.floor(Math.random() * 30);

let state: GameState | null = null;
let isTitleHelpOpen = false;
let isLeaderboardOpen = false;
let leaderboardEntries: LeaderboardEntry[] = [];
let leaderboardMonth = getMonthKey();
let leaderboardError: string | null = null;
let leaderboardLoading = false;

clearLegacyLocalLeaderboard();
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
    persist();
    render();
    return;
  }

  if (action === "toggle-help") {
    isTitleHelpOpen = !isTitleHelpOpen;
    if (isTitleHelpOpen) isLeaderboardOpen = false;
    render();
    return;
  }

  if (action === "toggle-ranking") {
    isLeaderboardOpen = !isLeaderboardOpen;
    if (isLeaderboardOpen) isTitleHelpOpen = false;
    render();
    if (isLeaderboardOpen) void refreshLeaderboard(true);
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
      localStorage.removeItem(`${STORAGE_PREFIX}easy`);
      localStorage.removeItem(`${STORAGE_PREFIX}hard`);
      state = null;
      isTitleHelpOpen = false;
      isLeaderboardOpen = true;
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
      state = createInitialState(state.mode);
      localStorage.removeItem(`${STORAGE_PREFIX}${state.mode}`);
      break;
  }

  persist();
  render();
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

async function refreshLeaderboard(showLoading = false): Promise<void> {
  if (showLoading) {
    leaderboardLoading = true;
    leaderboardError = null;
    render();
  }

  try {
    const response = await fetch("/api/leaderboard", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json()) as unknown;

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
    const response = await fetch("/api/leaderboard", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name,
        mode: current.mode,
        level: current.level,
      }),
    });
    const payload = (await response.json()) as unknown;

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
}

function renderTitle(): string {
  const titleMicrobeName = STAGES.easy[titleMicrobeLevel].name;

  return `
    <main class="shell">
      <section class="game-stage title-stage" aria-label="미생물 키우기 시작 화면">
        <div class="title-copy">
          <h1 class="title-logo wobbly-title" aria-label="${TITLE_TEXT}">${renderWobblyText(TITLE_TEXT)}</h1>
          <p class="version">V1.0.0</p>
        </div>
        <div class="title-microbe" aria-hidden="true">
          <img src="/microbes/${titleMicrobeLevel}.png" alt="" draggable="false" />
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
        </div>
        ${isTitleHelpOpen ? renderTitleHelp() : ""}
        ${isLeaderboardOpen ? renderLeaderboardPanel("title") : ""}
      </section>
    </main>
  `;
}

function renderTitleHelp(): string {
  return `
    <aside class="title-help" aria-label="게임 설명">
      <button class="help-close" type="button" data-action="toggle-help" aria-label="게임 설명 닫기">×</button>
      <h2>게임 설명</h2>
      <p class="help-lead">미생물을 배양해서 더 높은 단계로 성장시키는 게임입니다.</p>
      <ul class="help-list">
        <li><strong>배양</strong><span>atp나 특수 재료를 사용해 다음 단계에 도전합니다.</span></li>
        <li><strong>실패</strong><span>미생물이 소멸하고, 생긴 물질은 수거해서 조합소에서 씁니다.</span></li>
        <li><strong>방지권</strong><span>조건이 맞으면 소멸한 미생물을 되살릴 수 있습니다.</span></li>
        <li><strong>보관</strong><span>특정 단계 미생물은 보관해 이후 배양 재료로 사용합니다.</span></li>
        <li><strong>목표</strong><span>+29 아스트로파지를 만들고 월간 랭킹에 이름을 올립니다.</span></li>
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
  const rightAction = current.level === 0 ? { action: "screen", value: "shop", label: "상점가기" } : { action: "sell", label: "판매하기" };
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
        <button class="round-button enhance-button" type="button" data-action="enhance" aria-label="배양하기" ${canEnhance ? "" : "disabled"}>
          <span></span>
          <strong>배양</strong>
        </button>
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
            <p class="rank-note">등록하면 현재 진행이 초기화되고 첫 화면으로 돌아갑니다.</p>
          </div>
        </div>
        <div class="message">${escapeHtml(current.message)}</div>
      </section>
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
    </main>
  `;
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
  rightAction: { action: string; value?: string; label: string },
): string {
  return `
    ${leftAction ? renderCircleTextButton(leftAction, "top-left") : ""}
    ${renderTopTitle(current)}
    ${renderCircleTextButton(rightAction, "top-right")}
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
  return `
    <img class="organism-image" src="/microbes/${level}.png" alt="+${level} 미생물" draggable="false" />
  `;
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
