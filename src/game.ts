export type StageId = "pre" | "group" | "r32" | "r16" | "qf" | "final";
export type MatchStageId = StageId | "sf" | "bronze";
export type TeamStatus = "live" | "eliminated" | "winner";
export type OfferStatus = "open" | "accepted" | "rejected" | "countered";
export type PlayerAuthStatus = "invited" | "active";
export type MatchStatus = "scheduled" | "live" | "full-time";

export type Stage = {
  id: StageId;
  label: string;
  phaseLabel: string;
  multiplier: number;
  maxSpend: number;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  group: string;
  status: TeamStatus;
  flagCode?: string;
  flagUrl?: string;
};

export type Player = {
  id: string;
  realName: string;
  alias: string;
  email?: string;
  inviteCode: string;
  authStatus: PlayerAuthStatus;
  pin?: string;
  isAdmin?: boolean;
  accountCreatedAt?: string;
  lastLoginAt?: string;
};

export type AdminAccount = {
  id: string;
  name: string;
  pin: string;
  lastLoginAt?: string;
};

export type Match = {
  id: string;
  stageId: MatchStageId;
  roundLabel: string;
  group?: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  venue: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string;
};

export type Buy = {
  id: string;
  playerId: string;
  teamId: string;
  spend: number;
  shares: number;
  stageId: StageId;
  createdAt: string;
};

export type ShareLeg = {
  teamId: string;
  shares: number;
};

export type TradeOffer = {
  id: string;
  makerId: string;
  targetPlayerId: string | "open";
  makerOffersShares: ShareLeg[];
  makerRequestsShares: ShareLeg[];
  makerOffersMoney: number;
  makerRequestsMoney: number;
  note: string;
  status: OfferStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedByPlayerId?: string;
};

export type CompletedTrade = {
  id: string;
  offerId: string;
  makerId: string;
  counterpartyId: string;
  makerOffersShares: ShareLeg[];
  makerRequestsShares: ShareLeg[];
  makerOffersMoney: number;
  makerRequestsMoney: number;
  createdAt: string;
  completedAt?: string;
  buyerId?: string;
  sellerId?: string;
  teamId?: string;
  sharesTransferred?: number;
  grossTradePrice?: number;
  tradeLevy?: number;
  sellerProceeds?: number;
  moneyLegs?: CompletedTradeMoneyLeg[];
};

export type CompletedTradeMoneyLeg = {
  buyerId: string;
  sellerId: string;
  teamId: string;
  sharesTransferred: number;
  grossTradePrice: number;
  tradeLevy: number;
  sellerProceeds: number;
  completedAt: string;
};

export type PotSale = {
  id: string;
  playerId: string;
  teamId: string;
  shares: number;
  costBasis: number;
  penalty: number;
  createdAt: string;
};

export type KnockoutSlotLock = {
  playerId: string;
  liveTeamSlots: number;
  lockedAtStageId: StageId;
  lockedAt: string;
};

export type GameState = {
  stageId: StageId;
  admins: AdminAccount[];
  joinCode: string;
  teams: Team[];
  players: Player[];
  matches: Match[];
  buys: Buy[];
  offers: TradeOffer[];
  trades: CompletedTrade[];
  potSales: PotSale[];
  knockoutSlotLocks: Record<string, KnockoutSlotLock>;
  winnerTeamId: string;
  tournamentSync: TournamentSyncConfig;
  lastUpdatedAt: string;
};

export type TournamentSyncConfig = {
  provider: "manual" | "custom-json";
  endpoint: string;
  autoRefreshEnabled: boolean;
  autoRefreshSeconds: number;
  autoStageEnabled: boolean;
  lastSyncedAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
};

export type PlayerTotals = {
  newBuys: number;
  tradePurchases: number;
  tradeSales: number;
  potSalePenalties: number;
  exposure: number;
  remainingExposure: number;
  liveTeams: number;
};

export type SettlementRow = PlayerTotals & {
  playerId: string;
  winnerShares: number;
  potPayout: number;
  finalNet: number;
};

export type BuyCapacity = {
  stageRoom: number;
  exposureRoom: number;
  liveTeamSlotsUsed: number;
  liveTeamSlotLimit: number;
  maxSpend: number;
  projectedShares: number;
  blockedReason?: string;
};

export type GroupStandingRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export const EXPOSURE_CAP = 500;
export const TRADE_LEVY_RATE = 0.075;
export const SELL_TO_POT_PENALTY_MULTIPLIER = 2;
const TRADE_LEVY_BASIS_POINTS = 750;
const BASIS_POINTS = 10000;
const CENTS_PER_DOLLAR = 100;

export const stages: Stage[] = [
  {
    id: "pre",
    label: "Before tournament",
    phaseLabel: "Pre-tournament market",
    multiplier: 48,
    maxSpend: 10,
  },
  {
    id: "group",
    label: "After group stage",
    phaseLabel: "Group stage complete",
    multiplier: 32,
    maxSpend: 20,
  },
  {
    id: "r32",
    label: "After Round of 32",
    phaseLabel: "Round of 32 complete",
    multiplier: 16,
    maxSpend: 40,
  },
  {
    id: "r16",
    label: "After Round of 16",
    phaseLabel: "Round of 16 complete",
    multiplier: 8,
    maxSpend: 80,
  },
  {
    id: "qf",
    label: "After quarter-finals",
    phaseLabel: "Semi-finals set",
    multiplier: 4,
    maxSpend: 160,
  },
  {
    id: "final",
    label: "Before final",
    phaseLabel: "Final market",
    multiplier: 2,
    maxSpend: 320,
  },
];

export type OfficialStageCutoff = {
  stageId: StageId;
  label: string;
  startsAt: string;
  source: string;
};

export const officialStageCutoffs: OfficialStageCutoff[] = [
  {
    stageId: "group",
    label: "Group stage complete",
    startsAt: "2026-06-28T04:00:00.000Z",
    source: "Last group kick-offs are 22:00 ET on 27 June; group matches use a two-hour finish buffer.",
  },
  {
    stageId: "r32",
    label: "Round of 32 complete",
    startsAt: "2026-07-04T04:30:00.000Z",
    source: "Last Round of 32 kick-off is 21:30 ET on 3 July; knockout matches use a three-hour finish buffer.",
  },
  {
    stageId: "r16",
    label: "Round of 16 complete",
    startsAt: "2026-07-07T23:00:00.000Z",
    source: "Last Round of 16 kick-off is 16:00 ET on 7 July; knockout matches use a three-hour finish buffer.",
  },
  {
    stageId: "qf",
    label: "Quarter-finals complete",
    startsAt: "2026-07-12T04:00:00.000Z",
    source: "Last quarter-final kick-off is 21:00 ET on 11 July; knockout matches use a three-hour finish buffer.",
  },
  {
    stageId: "final",
    label: "Semi-finals complete",
    startsAt: "2026-07-15T22:00:00.000Z",
    source: "Last semi-final kick-off is 15:00 ET on 15 July; knockout matches use a three-hour finish buffer.",
  },
];

export function getStage(stageId: StageId): Stage {
  return stages.find((stage) => stage.id === stageId) ?? stages[0];
}

export function officialStageForDate(now = new Date()): StageId {
  const nowMs = now.getTime();

  return officialStageCutoffs.reduce<StageId>(
    (stageId, cutoff) => (nowMs >= new Date(cutoff.startsAt).getTime() ? cutoff.stageId : stageId),
    "pre",
  );
}

export function applyAutomaticGameStage(state: GameState, now = new Date()): GameState {
  if (state.tournamentSync.autoStageEnabled === false) return state;

  const stageId = officialStageForDate(now);
  if (stageId === state.stageId) return ensureKnockoutSlotLocks(state);

  return setGameStage(state, stageId);
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

export function getTeam(state: GameState, teamId: string): Team | undefined {
  return state.teams.find((team) => team.id === teamId);
}

export function teamFlagSrc(team?: Team): string {
  if (!team) return "";
  if (team.flagUrl) return team.flagUrl;
  if (!team.flagCode) return "";

  if (team.flagCode.includes("-")) {
    return `https://flagcdn.com/${team.flagCode}.svg`;
  }

  return `https://flagcdn.com/w40/${team.flagCode}.png`;
}

export function currency(value: number): string {
  const rounded = Math.round(value * 100) / 100;

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(rounded);
}

export function dollarsToCents(value: number): number {
  return Math.round(value * CENTS_PER_DOLLAR);
}

export function centsToDollars(cents: number): number {
  return cents / CENTS_PER_DOLLAR;
}

export function currencyFromCents(cents: number): string {
  return currency(centsToDollars(cents));
}

export function calculateTradeLevy(grossTradePrice: number): {
  tradeLevy: number;
  sellerProceeds: number;
} {
  // The listed trade price is the buyer's total price. The levy is carved out
  // of that gross amount: 7.5% to the pot, 92.5% to the seller.
  const tradeLevy = Math.round((grossTradePrice * TRADE_LEVY_BASIS_POINTS) / BASIS_POINTS);

  return {
    tradeLevy,
    sellerProceeds: grossTradePrice - tradeLevy,
  };
}

export function wholeNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function nowId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function newSharePurchasePotCents(state: GameState): number {
  return state.buys.reduce((sum, buy) => sum + dollarsToCents(buy.spend), 0);
}

export function tradeLevyPotCents(state: GameState): number {
  return state.trades.reduce(
    (sum, trade) =>
      sum +
      completedTradeMoneyLegs(trade).reduce(
        (tradeSum, leg) => tradeSum + leg.tradeLevy,
        0,
      ),
    0,
  );
}

export function potSalePenaltyPotCents(state: GameState): number {
  return (state.potSales ?? []).reduce((sum, sale) => sum + sale.penalty, 0);
}

export function potSizeCents(state: GameState): number {
  return newSharePurchasePotCents(state) + tradeLevyPotCents(state) + potSalePenaltyPotCents(state);
}

export function potSize(state: GameState): number {
  return centsToDollars(potSizeCents(state));
}

export function computeHoldings(state: GameState): Record<string, Record<string, number>> {
  const holdings: Record<string, Record<string, number>> = {};

  state.players.forEach((player) => {
    holdings[player.id] = {};
  });

  const add = (playerId: string, teamId: string, shares: number) => {
    holdings[playerId] ??= {};
    holdings[playerId][teamId] = (holdings[playerId][teamId] ?? 0) + shares;

    if (holdings[playerId][teamId] === 0) {
      delete holdings[playerId][teamId];
    }
  };

  state.buys.forEach((buy) => {
    add(buy.playerId, buy.teamId, buy.shares);
  });

  state.trades.forEach((trade) => {
    trade.makerOffersShares.forEach((leg) => {
      add(trade.makerId, leg.teamId, -leg.shares);
      add(trade.counterpartyId, leg.teamId, leg.shares);
    });

    trade.makerRequestsShares.forEach((leg) => {
      add(trade.counterpartyId, leg.teamId, -leg.shares);
      add(trade.makerId, leg.teamId, leg.shares);
    });
  });

  (state.potSales ?? []).forEach((sale) => {
    add(sale.playerId, sale.teamId, -sale.shares);
  });

  return holdings;
}

export function liveTeamCount(
  state: GameState,
  playerHoldings: Record<string, number>,
): number {
  return Object.entries(playerHoldings).filter(([teamId, shares]) => {
    if (shares <= 0) return false;
    const team = getTeam(state, teamId);
    return team?.status === "live" || team?.status === "winner";
  }).length;
}

export function isKnockoutSlotLockStage(stageId: StageId): boolean {
  return stageId !== "pre";
}

export function ensureKnockoutSlotLocks(state: GameState, lockedAt = new Date().toISOString()): GameState {
  if (!isKnockoutSlotLockStage(state.stageId)) return state;

  const holdings = computeHoldings(state);
  const knockoutSlotLocks = { ...(state.knockoutSlotLocks ?? {}) };
  let changed = false;

  state.players.forEach((player) => {
    if (knockoutSlotLocks[player.id]) return;

    knockoutSlotLocks[player.id] = {
      playerId: player.id,
      liveTeamSlots: Math.min(2, liveTeamCount(state, holdings[player.id] ?? {})),
      lockedAtStageId: state.stageId,
      lockedAt,
    };
    changed = true;
  });

  return changed ? { ...state, knockoutSlotLocks } : state;
}

export function setGameStage(state: GameState, stageId: StageId): GameState {
  if (!isKnockoutSlotLockStage(stageId)) {
    return {
      ...state,
      stageId,
      knockoutSlotLocks: {},
    };
  }

  const enteringKnockoutLock = !isKnockoutSlotLockStage(state.stageId);

  return ensureKnockoutSlotLocks({
    ...state,
    stageId,
    knockoutSlotLocks: enteringKnockoutLock ? {} : state.knockoutSlotLocks ?? {},
  });
}

export function liveTeamSlotLimit(state: GameState, playerId: string): number {
  if (!isKnockoutSlotLockStage(state.stageId)) return 2;

  const lock = state.knockoutSlotLocks?.[playerId];
  if (lock) return Math.max(0, Math.min(2, lock.liveTeamSlots));

  const holdings = computeHoldings(state)[playerId] ?? {};
  return Math.min(2, liveTeamCount(state, holdings));
}

export function buildTradeMoneyLegs(
  offer: TradeOffer,
  counterpartyId: string,
  completedAt = new Date().toISOString(),
): CompletedTradeMoneyLeg[] {
  const legs: CompletedTradeMoneyLeg[] = [];
  const addLegs = ({
    buyerId,
    sellerId,
    shareLegs,
    grossTradePrice,
  }: {
    buyerId: string;
    sellerId: string;
    shareLegs: ShareLeg[];
    grossTradePrice: number;
  }) => {
    const grossTradePriceCents = dollarsToCents(grossTradePrice);
    if (grossTradePriceCents <= 0 || shareLegs.length === 0) return;

    const totalShares = shareLegs.reduce((sum, leg) => sum + leg.shares, 0);
    let allocatedGross = 0;

    shareLegs.forEach((shareLeg, index) => {
      const isLast = index === shareLegs.length - 1;
      const legGrossTradePrice = isLast
        ? grossTradePriceCents - allocatedGross
        : Math.round((grossTradePriceCents * shareLeg.shares) / totalShares);
      allocatedGross += legGrossTradePrice;
      const { tradeLevy, sellerProceeds } = calculateTradeLevy(legGrossTradePrice);

      legs.push({
        buyerId,
        sellerId,
        teamId: shareLeg.teamId,
        sharesTransferred: shareLeg.shares,
        grossTradePrice: legGrossTradePrice,
        tradeLevy,
        sellerProceeds,
        completedAt,
      });
    });
  };

  addLegs({
    buyerId: counterpartyId,
    sellerId: offer.makerId,
    shareLegs: offer.makerOffersShares,
    grossTradePrice: offer.makerRequestsMoney,
  });
  addLegs({
    buyerId: offer.makerId,
    sellerId: counterpartyId,
    shareLegs: offer.makerRequestsShares,
    grossTradePrice: offer.makerOffersMoney,
  });

  return legs;
}

export function completedTradeMoneyLegs(trade: CompletedTrade): CompletedTradeMoneyLeg[] {
  if (trade.moneyLegs?.length) return trade.moneyLegs;

  const completedAt = trade.completedAt ?? trade.createdAt;

  if (trade.buyerId && trade.sellerId && trade.teamId && trade.grossTradePrice !== undefined) {
    const tradeLevy =
      trade.tradeLevy ?? calculateTradeLevy(trade.grossTradePrice).tradeLevy;
    return [
      {
        buyerId: trade.buyerId,
        sellerId: trade.sellerId,
        teamId: trade.teamId,
        sharesTransferred: trade.sharesTransferred ?? 0,
        grossTradePrice: trade.grossTradePrice,
        tradeLevy,
        sellerProceeds:
          trade.sellerProceeds ?? trade.grossTradePrice - tradeLevy,
        completedAt,
      },
    ];
  }

  const pseudoOffer: TradeOffer = {
    id: trade.offerId,
    makerId: trade.makerId,
    targetPlayerId: trade.counterpartyId,
    makerOffersShares: trade.makerOffersShares,
    makerRequestsShares: trade.makerRequestsShares,
    makerOffersMoney: trade.makerOffersMoney,
    makerRequestsMoney: trade.makerRequestsMoney,
    note: "",
    status: "accepted",
    createdAt: trade.createdAt,
  };

  return buildTradeMoneyLegs(pseudoOffer, trade.counterpartyId, completedAt);
}

type HoldingCostLot = {
  shares: number;
  costBasis: number;
};

function addCostLot(
  lots: Record<string, Record<string, HoldingCostLot[]>>,
  playerId: string,
  teamId: string,
  shares: number,
  costBasis: number,
) {
  if (shares <= 0) return;

  lots[playerId] ??= {};
  lots[playerId][teamId] ??= [];
  lots[playerId][teamId].push({ shares, costBasis });
}

function removeSharesFromCostLots(
  lots: Record<string, Record<string, HoldingCostLot[]>>,
  playerId: string,
  teamId: string,
  shares: number,
): number {
  const teamLots = lots[playerId]?.[teamId] ?? [];
  let remainingShares = shares;
  let removedBasis = 0;

  while (remainingShares > 0 && teamLots.length > 0) {
    const lot = teamLots[0];
    const sharesFromLot = Math.min(lot.shares, remainingShares);
    const basisFromLot =
      sharesFromLot === lot.shares
        ? lot.costBasis
        : Math.round((lot.costBasis * sharesFromLot) / lot.shares);

    removedBasis += basisFromLot;
    lot.shares -= sharesFromLot;
    lot.costBasis -= basisFromLot;
    remainingShares -= sharesFromLot;

    if (lot.shares <= 0) teamLots.shift();
  }

  if (teamLots.length === 0 && lots[playerId]) {
    delete lots[playerId][teamId];
  }

  return removedBasis;
}

function allocateCents(totalCents: number, shares: number, totalShares: number, allocatedBefore: number, isLast: boolean): number {
  if (totalCents <= 0 || totalShares <= 0) return 0;
  return isLast ? totalCents - allocatedBefore : Math.round((totalCents * shares) / totalShares);
}

export function holdingCostLots(state: GameState): Record<string, Record<string, HoldingCostLot[]>> {
  const lots: Record<string, Record<string, HoldingCostLot[]>> = {};
  const events: Array<{
    createdAt: string;
    priority: number;
    index: number;
    apply: () => void;
  }> = [];

  state.players.forEach((player) => {
    lots[player.id] = {};
  });

  state.buys.forEach((buy, index) => {
    events.push({
      createdAt: buy.createdAt,
      priority: 0,
      index,
      apply: () => addCostLot(lots, buy.playerId, buy.teamId, buy.shares, dollarsToCents(buy.spend)),
    });
  });

  state.trades.forEach((trade, index) => {
    events.push({
      createdAt: trade.completedAt ?? trade.createdAt,
      priority: 1,
      index,
      apply: () => {
        const moneyPaidByPlayerTeam: Record<string, Record<string, number>> = {};

        completedTradeMoneyLegs(trade).forEach((leg) => {
          moneyPaidByPlayerTeam[leg.buyerId] ??= {};
          moneyPaidByPlayerTeam[leg.buyerId][leg.teamId] =
            (moneyPaidByPlayerTeam[leg.buyerId][leg.teamId] ?? 0) + leg.grossTradePrice;
        });

        const makerRemovedBasis = trade.makerOffersShares.reduce(
          (sum, leg) => sum + removeSharesFromCostLots(lots, trade.makerId, leg.teamId, leg.shares),
          0,
        );
        const counterpartyRemovedBasis = trade.makerRequestsShares.reduce(
          (sum, leg) => sum + removeSharesFromCostLots(lots, trade.counterpartyId, leg.teamId, leg.shares),
          0,
        );

        addIncomingTradeLots({
          lots,
          playerId: trade.counterpartyId,
          incomingLegs: trade.makerOffersShares,
          moneyPaidByTeam: moneyPaidByPlayerTeam[trade.counterpartyId] ?? {},
          swappedBasis: counterpartyRemovedBasis,
        });
        addIncomingTradeLots({
          lots,
          playerId: trade.makerId,
          incomingLegs: trade.makerRequestsShares,
          moneyPaidByTeam: moneyPaidByPlayerTeam[trade.makerId] ?? {},
          swappedBasis: makerRemovedBasis,
        });
      },
    });
  });

  (state.potSales ?? []).forEach((sale, index) => {
    events.push({
      createdAt: sale.createdAt,
      priority: 2,
      index,
      apply: () => {
        removeSharesFromCostLots(lots, sale.playerId, sale.teamId, sale.shares);
      },
    });
  });

  events
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.priority - right.priority ||
        left.index - right.index,
    )
    .forEach((event) => event.apply());

  return lots;
}

function addIncomingTradeLots({
  lots,
  playerId,
  incomingLegs,
  moneyPaidByTeam,
  swappedBasis,
}: {
  lots: Record<string, Record<string, HoldingCostLot[]>>;
  playerId: string;
  incomingLegs: ShareLeg[];
  moneyPaidByTeam: Record<string, number>;
  swappedBasis: number;
}) {
  const totalShares = incomingLegs.reduce((sum, leg) => sum + leg.shares, 0);
  let allocatedSwapBasis = 0;

  incomingLegs.forEach((leg, index) => {
    const isLast = index === incomingLegs.length - 1;
    const swapBasisForLeg = allocateCents(
      swappedBasis,
      leg.shares,
      totalShares,
      allocatedSwapBasis,
      isLast,
    );
    allocatedSwapBasis += swapBasisForLeg;

    addCostLot(
      lots,
      playerId,
      leg.teamId,
      leg.shares,
      (moneyPaidByTeam[leg.teamId] ?? 0) + swapBasisForLeg,
    );
  });
}

export function costBasisForSharesCents(
  state: GameState,
  playerId: string,
  teamId: string,
  shares: number,
): number {
  const lots = cloneState(holdingCostLots(state));

  return removeSharesFromCostLots(lots, playerId, teamId, shares);
}

export function potSalePreview(
  state: GameState,
  input: { playerId: string; teamId: string; shares: number },
): {
  costBasis: number;
  penalty: number;
  potAfterSale: number;
  exposureAfterSale: number;
} {
  const costBasis = costBasisForSharesCents(state, input.playerId, input.teamId, input.shares);
  const penalty = costBasis * SELL_TO_POT_PENALTY_MULTIPLIER;

  return {
    costBasis,
    penalty,
    potAfterSale: centsToDollars(potSizeCents(state) + penalty),
    exposureAfterSale: centsToDollars(
      dollarsToCents(playerTotals(state, input.playerId).exposure) + penalty,
    ),
  };
}

export function tradeExposureChangesCents(
  offer: TradeOffer,
  counterpartyId: string,
): Record<string, number> {
  const changes: Record<string, number> = {};

  buildTradeMoneyLegs(offer, counterpartyId).forEach((leg) => {
    changes[leg.buyerId] = (changes[leg.buyerId] ?? 0) + leg.grossTradePrice;
    changes[leg.sellerId] = (changes[leg.sellerId] ?? 0) - leg.sellerProceeds;
  });

  return changes;
}

export function tradePreview(
  state: GameState,
  offer: TradeOffer,
  counterpartyId: string,
): {
  moneyLegs: CompletedTradeMoneyLeg[];
  potAfterTrade: number;
  exposureAfterByPlayerId: Record<string, number>;
} {
  const moneyLegs = buildTradeMoneyLegs(offer, counterpartyId);
  const exposureChanges = tradeExposureChangesCents(offer, counterpartyId);
  const exposureAfterByPlayerId: Record<string, number> = {};

  Object.entries(exposureChanges).forEach(([playerId, changeCents]) => {
    exposureAfterByPlayerId[playerId] =
      centsToDollars(dollarsToCents(playerTotals(state, playerId).exposure) + changeCents);
  });

  return {
    moneyLegs,
    potAfterTrade: centsToDollars(
      potSizeCents(state) + moneyLegs.reduce((sum, leg) => sum + leg.tradeLevy, 0),
    ),
    exposureAfterByPlayerId,
  };
}

export function playerTotals(state: GameState, playerId: string): PlayerTotals {
  const holdings = computeHoldings(state)[playerId] ?? {};
  const newBuysCents = state.buys
    .filter((buy) => buy.playerId === playerId)
    .reduce((sum, buy) => sum + dollarsToCents(buy.spend), 0);
  let tradePurchasesCents = 0;
  let tradeSalesCents = 0;
  const potSalePenaltiesCents = (state.potSales ?? [])
    .filter((sale) => sale.playerId === playerId)
    .reduce((sum, sale) => sum + sale.penalty, 0);

  state.trades.forEach((trade) => {
    completedTradeMoneyLegs(trade).forEach((leg) => {
      if (leg.buyerId === playerId) tradePurchasesCents += leg.grossTradePrice;
      if (leg.sellerId === playerId) tradeSalesCents += leg.sellerProceeds;
    });
  });

  const exposureCents = newBuysCents + tradePurchasesCents + potSalePenaltiesCents - tradeSalesCents;

  return {
    newBuys: centsToDollars(newBuysCents),
    tradePurchases: centsToDollars(tradePurchasesCents),
    tradeSales: centsToDollars(tradeSalesCents),
    potSalePenalties: centsToDollars(potSalePenaltiesCents),
    exposure: centsToDollars(exposureCents),
    remainingExposure: EXPOSURE_CAP - centsToDollars(exposureCents),
    liveTeams: liveTeamCount(state, holdings),
  };
}

export function stageSpend(state: GameState, playerId: string, stageId: StageId): number {
  return state.buys
    .filter((buy) => buy.playerId === playerId && buy.stageId === stageId)
    .reduce((sum, buy) => sum + buy.spend, 0);
}

export function buyCapacityForTeam(
  state: GameState,
  playerId: string,
  teamId: string,
): BuyCapacity {
  const stage = getStage(state.stageId);
  const team = getTeam(state, teamId);
  const totals = playerTotals(state, playerId);
  const stageRoom = Math.max(stage.maxSpend - stageSpend(state, playerId, stage.id), 0);
  const exposureRoom = Math.max(EXPOSURE_CAP - totals.exposure, 0);
  const baseMaxSpend = Math.min(stageRoom, exposureRoom);
  const slotLimit = liveTeamSlotLimit(state, playerId);

  if (!team) {
    return {
      stageRoom,
      exposureRoom,
      liveTeamSlotsUsed: totals.liveTeams,
      liveTeamSlotLimit: slotLimit,
      maxSpend: 0,
      projectedShares: 0,
      blockedReason: "Select a valid team.",
    };
  }

  if (team.status !== "live" && team.status !== "winner") {
    return {
      stageRoom,
      exposureRoom,
      liveTeamSlotsUsed: totals.liveTeams,
      liveTeamSlotLimit: slotLimit,
      maxSpend: 0,
      projectedShares: 0,
      blockedReason: `${team.name} is not live.`,
    };
  }

  const holdings = cloneState(computeHoldings(state)[playerId] ?? {});
  holdings[teamId] = (holdings[teamId] ?? 0) + 1;

  const liveTeamsAfterBuy = liveTeamCount(state, holdings);
  if (liveTeamsAfterBuy > slotLimit) {
    return {
      stageRoom,
      exposureRoom,
      liveTeamSlotsUsed: totals.liveTeams,
      liveTeamSlotLimit: slotLimit,
      maxSpend: 0,
      projectedShares: 0,
      blockedReason: `Your live-team limit is ${slotLimit}. Sell a live team to the pot before buying another.`,
    };
  }

  if (stage.id === "pre") {
    const preTeams = new Set(
      state.buys
        .filter((buy) => buy.playerId === playerId && buy.stageId === "pre")
        .map((buy) => buy.teamId),
    );
    preTeams.add(teamId);

    if (preTeams.size > 2) {
      return {
        stageRoom,
        exposureRoom,
        liveTeamSlotsUsed: totals.liveTeams,
        liveTeamSlotLimit: slotLimit,
        maxSpend: 0,
        projectedShares: 0,
        blockedReason: "Starting buys can cover at most two teams.",
      };
    }
  }

  const blockedReason =
    baseMaxSpend <= 0
      ? stageRoom <= 0
        ? "This buying window is used up."
        : `You have used your ${currency(EXPOSURE_CAP)} game limit.`
      : undefined;

  return {
    stageRoom,
    exposureRoom,
    liveTeamSlotsUsed: liveTeamsAfterBuy,
    liveTeamSlotLimit: slotLimit,
    maxSpend: baseMaxSpend,
    projectedShares: baseMaxSpend * stage.multiplier,
    blockedReason,
  };
}

export function validateWholeMoney(value: number, label: string): string[] {
  if (!Number.isInteger(value) || value < 0) {
    return [`${label} must be whole dollars.`];
  }

  return [];
}

export function validateShareLegs(
  state: GameState,
  legs: ShareLeg[],
  label: string,
): string[] {
  const errors: string[] = [];

  legs.forEach((leg) => {
    const team = getTeam(state, leg.teamId);

    if (!team) {
      errors.push(`${label} includes an unknown team.`);
    } else if (team.status !== "live" && team.status !== "winner") {
      errors.push(`${team.name} is not live, so it cannot be traded.`);
    }

    if (!Number.isInteger(leg.shares) || leg.shares <= 0) {
      errors.push(`${label} shares must be whole positive numbers.`);
    }
  });

  return errors;
}

export function hasEnoughShares(
  holdings: Record<string, number>,
  legs: ShareLeg[],
): boolean {
  return legs.every((leg) => (holdings[leg.teamId] ?? 0) >= leg.shares);
}

export function mergeLegs(legs: ShareLeg[]): ShareLeg[] {
  const byTeam = new Map<string, number>();

  legs.forEach((leg) => {
    if (!leg.teamId || !Number.isFinite(leg.shares) || leg.shares <= 0) return;
    byTeam.set(leg.teamId, (byTeam.get(leg.teamId) ?? 0) + leg.shares);
  });

  return [...byTeam.entries()].map(([teamId, shares]) => ({ teamId, shares }));
}

export function applyTradeToHoldings(
  state: GameState,
  makerId: string,
  counterpartyId: string,
  makerOffersShares: ShareLeg[],
  makerRequestsShares: ShareLeg[],
): Record<string, Record<string, number>> {
  const holdings = cloneState(computeHoldings(state));
  const add = (playerId: string, teamId: string, shares: number) => {
    holdings[playerId] ??= {};
    holdings[playerId][teamId] = (holdings[playerId][teamId] ?? 0) + shares;

    if (holdings[playerId][teamId] === 0) {
      delete holdings[playerId][teamId];
    }
  };

  makerOffersShares.forEach((leg) => {
    add(makerId, leg.teamId, -leg.shares);
    add(counterpartyId, leg.teamId, leg.shares);
  });

  makerRequestsShares.forEach((leg) => {
    add(counterpartyId, leg.teamId, -leg.shares);
    add(makerId, leg.teamId, leg.shares);
  });

  return holdings;
}

export function validateBuy(
  state: GameState,
  input: { playerId: string; teamId: string; spend: number },
): string[] {
  const errors: string[] = [];
  const stage = getStage(state.stageId);
  const player = getPlayer(state, input.playerId);
  const team = getTeam(state, input.teamId);

  if (!player) errors.push("Select a valid player.");

  if (!team) {
    errors.push("Select a valid team.");
  } else if (team.status !== "live" && team.status !== "winner") {
    errors.push(`${team.name} is not live, so new shares cannot be bought.`);
  }

  if (!Number.isInteger(input.spend) || input.spend <= 0) {
    errors.push("Spend must be a positive whole dollar amount.");
  }

  const used = stageSpend(state, input.playerId, stage.id);
  if (used + input.spend > stage.maxSpend) {
    errors.push(
      `${stage.label} allows ${currency(stage.maxSpend)} of new buys per player; this player has ${currency(
        stage.maxSpend - used,
      )} left.`,
    );
  }

  if (stage.id === "pre") {
    const preTeams = new Set(
      state.buys
        .filter((buy) => buy.playerId === input.playerId && buy.stageId === "pre")
        .map((buy) => buy.teamId),
    );

    if (input.teamId) preTeams.add(input.teamId);

    if (preTeams.size > 2) {
      errors.push("The starting buy can be spread across one or two teams only.");
    }
  }

  const currentHoldings = computeHoldings(state)[input.playerId] ?? {};
  const prospectiveHoldings = cloneState(currentHoldings);
  prospectiveHoldings[input.teamId] =
    (prospectiveHoldings[input.teamId] ?? 0) + input.spend * stage.multiplier;

  const slotLimit = liveTeamSlotLimit(state, input.playerId);
  if (liveTeamCount(state, prospectiveHoldings) > slotLimit) {
    errors.push(`This buy would exceed this player's live-team limit of ${slotLimit}.`);
  }

  const nextExposure = playerTotals(state, input.playerId).exposure + input.spend;
  if (nextExposure > EXPOSURE_CAP) {
    errors.push(
      `This buy would put this player at ${currency(nextExposure)}, above the ${currency(
        EXPOSURE_CAP,
      )} game limit.`,
    );
  }

  return errors;
}

export function makeBuy(
  state: GameState,
  input: { playerId: string; teamId: string; spend: number },
): Buy {
  const stage = getStage(state.stageId);

  return {
    id: nowId("buy"),
    playerId: input.playerId,
    teamId: input.teamId,
    spend: input.spend,
    shares: input.spend * stage.multiplier,
    stageId: stage.id,
    createdAt: new Date().toISOString(),
  };
}

export function validatePotSale(
  state: GameState,
  input: { playerId: string; teamId: string; shares: number },
): string[] {
  const errors: string[] = [];
  const player = getPlayer(state, input.playerId);
  const team = getTeam(state, input.teamId);
  const holdings = computeHoldings(state)[input.playerId] ?? {};
  const ownedShares = holdings[input.teamId] ?? 0;

  if (!player) errors.push("Select a valid trader.");

  if (!team) {
    errors.push("Select a valid team.");
  } else if (team.status !== "live" && team.status !== "winner") {
    errors.push(`${team.name} is not live, so it cannot free a live-team slot.`);
  }

  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    errors.push("Shares must be a positive whole number.");
  } else if (input.shares > ownedShares) {
    errors.push(`This trader only holds ${wholeNumber(Math.max(ownedShares, 0))} shares of this team.`);
  }

  if (errors.length > 0) return errors;

  const preview = potSalePreview(state, input);

  if (preview.costBasis <= 0) {
    errors.push("These shares do not have a recorded original cost, so they cannot be sold to the pot.");
  }

  if (preview.exposureAfterSale > EXPOSURE_CAP) {
    errors.push(
      `This sale would put this player at ${currency(preview.exposureAfterSale)}, above the ${currency(
        EXPOSURE_CAP,
      )} game limit.`,
    );
  }

  return errors;
}

export function makePotSale(
  state: GameState,
  input: { playerId: string; teamId: string; shares: number },
): PotSale {
  const preview = potSalePreview(state, input);

  return {
    id: nowId("pot-sale"),
    playerId: input.playerId,
    teamId: input.teamId,
    shares: input.shares,
    costBasis: preview.costBasis,
    penalty: preview.penalty,
    createdAt: new Date().toISOString(),
  };
}

export function validateOfferCreation(
  state: GameState,
  offer: Omit<TradeOffer, "id" | "status" | "createdAt">,
): string[] {
  const errors: string[] = [];
  const maker = getPlayer(state, offer.makerId);
  const target =
    offer.targetPlayerId === "open" ? undefined : getPlayer(state, offer.targetPlayerId);
  const makerHoldings = computeHoldings(state)[offer.makerId] ?? {};

  if (!maker) errors.push("Select a valid offering trader.");
  if (offer.targetPlayerId !== "open" && !target) errors.push("Select a valid target trader.");
  if (offer.targetPlayerId === offer.makerId) errors.push("A trader cannot trade with themselves.");

  errors.push(...validateWholeMoney(offer.makerOffersMoney, "Money offered"));
  errors.push(...validateWholeMoney(offer.makerRequestsMoney, "Money requested"));
  errors.push(...validateShareLegs(state, offer.makerOffersShares, "Offered side"));
  errors.push(...validateShareLegs(state, offer.makerRequestsShares, "Requested side"));

  if (
    offer.makerOffersMoney === 0 &&
    offer.makerRequestsMoney === 0 &&
    offer.makerOffersShares.length === 0 &&
    offer.makerRequestsShares.length === 0
  ) {
    errors.push("An offer needs at least one money or share term.");
  }

  if (!hasEnoughShares(makerHoldings, offer.makerOffersShares)) {
    errors.push("The offering trader does not own enough of the shares they are offering.");
  }

  if (offer.makerRequestsMoney > 0 && offer.makerOffersShares.length === 0) {
    errors.push("Requested money needs shares on the offered side.");
  }

  if (offer.makerOffersMoney > 0 && offer.makerRequestsShares.length === 0) {
    errors.push("Offered money needs shares on the requested side.");
  }

  const makerExposureChangeCents =
    dollarsToCents(offer.makerOffersMoney) -
    calculateTradeLevy(dollarsToCents(offer.makerRequestsMoney)).sellerProceeds;
  const makerNextExposure =
    playerTotals(state, offer.makerId).exposure + centsToDollars(makerExposureChangeCents);

  if (makerNextExposure > EXPOSURE_CAP) {
    errors.push(
      `The offering trader would go over the ${currency(EXPOSURE_CAP)} game limit if this is accepted.`,
    );
  }

  return errors;
}

export function validateTradeAcceptance(
  state: GameState,
  offer: TradeOffer,
  counterpartyId: string,
): string[] {
  const errors: string[] = [];
  const counterparty = getPlayer(state, counterpartyId);

  if (offer.status !== "open") errors.push("This offer is not open.");
  if (!counterparty) errors.push("Select a valid accepting trader.");
  if (offer.makerId === counterpartyId) errors.push("A trader cannot accept their own offer.");
  if (offer.targetPlayerId !== "open" && offer.targetPlayerId !== counterpartyId) {
    errors.push("This offer is directed to another trader.");
  }

  errors.push(...validateShareLegs(state, offer.makerOffersShares, "Offered side"));
  errors.push(...validateShareLegs(state, offer.makerRequestsShares, "Requested side"));

  const holdings = computeHoldings(state);
  if (!hasEnoughShares(holdings[offer.makerId] ?? {}, offer.makerOffersShares)) {
    errors.push("The offering trader no longer owns enough shares.");
  }
  if (!hasEnoughShares(holdings[counterpartyId] ?? {}, offer.makerRequestsShares)) {
    errors.push("The accepting trader does not own enough requested shares.");
  }

  const nextHoldings = applyTradeToHoldings(
    state,
    offer.makerId,
    counterpartyId,
    offer.makerOffersShares,
    offer.makerRequestsShares,
  );

  const makerSlotLimit = liveTeamSlotLimit(state, offer.makerId);
  if (liveTeamCount(state, nextHoldings[offer.makerId] ?? {}) > makerSlotLimit) {
    errors.push(`The offering trader would exceed their live-team limit of ${makerSlotLimit}.`);
  }

  const counterpartySlotLimit = liveTeamSlotLimit(state, counterpartyId);
  if (liveTeamCount(state, nextHoldings[counterpartyId] ?? {}) > counterpartySlotLimit) {
    errors.push(`The accepting trader would exceed their live-team limit of ${counterpartySlotLimit}.`);
  }

  const exposureChanges = tradeExposureChangesCents(offer, counterpartyId);
  const makerNextExposure =
    playerTotals(state, offer.makerId).exposure +
    centsToDollars(exposureChanges[offer.makerId] ?? 0);
  const counterpartyNextExposure =
    playerTotals(state, counterpartyId).exposure +
    centsToDollars(exposureChanges[counterpartyId] ?? 0);

  if (makerNextExposure > EXPOSURE_CAP) {
    errors.push(`The offering trader would go over the ${currency(EXPOSURE_CAP)} game limit.`);
  }

  if (counterpartyNextExposure > EXPOSURE_CAP) {
    errors.push(`The accepting trader would go over the ${currency(EXPOSURE_CAP)} game limit.`);
  }

  return errors;
}

export function completeTrade(
  offer: TradeOffer,
  counterpartyId: string,
): CompletedTrade {
  const completedAt = new Date().toISOString();
  const moneyLegs = buildTradeMoneyLegs(offer, counterpartyId, completedAt);
  const primaryMoneyLeg = moneyLegs[0];

  return {
    id: nowId("trade"),
    offerId: offer.id,
    makerId: offer.makerId,
    counterpartyId,
    makerOffersShares: offer.makerOffersShares,
    makerRequestsShares: offer.makerRequestsShares,
    makerOffersMoney: offer.makerOffersMoney,
    makerRequestsMoney: offer.makerRequestsMoney,
    createdAt: completedAt,
    completedAt,
    buyerId: primaryMoneyLeg?.buyerId,
    sellerId: primaryMoneyLeg?.sellerId,
    teamId: primaryMoneyLeg?.teamId,
    sharesTransferred: primaryMoneyLeg?.sharesTransferred,
    grossTradePrice: primaryMoneyLeg?.grossTradePrice,
    tradeLevy: primaryMoneyLeg?.tradeLevy,
    sellerProceeds: primaryMoneyLeg?.sellerProceeds,
    moneyLegs,
  };
}

export function settlementRows(state: GameState): SettlementRow[] {
  const holdings = computeHoldings(state);
  const pot = potSize(state);
  const totalWinnerShares = state.winnerTeamId
    ? state.players.reduce(
        (sum, player) => sum + Math.max(holdings[player.id]?.[state.winnerTeamId] ?? 0, 0),
        0,
      )
    : 0;

  return state.players.map((player) => {
    const totals = playerTotals(state, player.id);
    const winnerShares = state.winnerTeamId
      ? Math.max(holdings[player.id]?.[state.winnerTeamId] ?? 0, 0)
      : 0;
    const potPayout =
      state.winnerTeamId && totalWinnerShares > 0 ? (pot * winnerShares) / totalWinnerShares : 0;

    return {
      playerId: player.id,
      winnerShares,
      potPayout,
      finalNet:
        potPayout +
        totals.tradeSales -
        totals.newBuys -
        totals.tradePurchases -
        totals.potSalePenalties,
      ...totals,
    };
  });
}

export function describeShareLegs(state: GameState, legs: ShareLeg[]): string {
  if (legs.length === 0) return "";

  return legs
    .map((leg) => `${wholeNumber(leg.shares)} ${getTeam(state, leg.teamId)?.name ?? "team"}`)
    .join(" + ");
}

export function startingStatus(state: GameState): Record<string, { spend: number; complete: boolean }> {
  return Object.fromEntries(
    state.players.map((player) => {
      const spend = stageSpend(state, player.id, "pre");
      return [player.id, { spend, complete: spend === 10 }];
    }),
  );
}

export function groupStandings(state: GameState): Record<string, GroupStandingRow[]> {
  const groups = [...new Set(state.teams.map((team) => team.group))].sort();
  const initialRows = Object.fromEntries(
    state.teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      } satisfies GroupStandingRow,
    ]),
  );

  state.matches
    .filter(
      (match) =>
        match.stageId === "group" &&
        match.status === "full-time" &&
        Number.isInteger(match.homeScore) &&
        Number.isInteger(match.awayScore),
    )
    .forEach((match) => {
      const home = initialRows[match.homeTeamId];
      const away = initialRows[match.awayTeamId];
      if (!home || !away || match.homeScore === undefined || match.awayScore === undefined) return;

      home.played += 1;
      away.played += 1;
      home.goalsFor += match.homeScore;
      home.goalsAgainst += match.awayScore;
      away.goalsFor += match.awayScore;
      away.goalsAgainst += match.homeScore;

      if (match.homeScore > match.awayScore) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (match.homeScore < match.awayScore) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    });

  Object.values(initialRows).forEach((row) => {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  });

  return Object.fromEntries(
    groups.map((group) => [
      group,
      state.teams
        .filter((team) => team.group === group)
        .map((team) => initialRows[team.id])
        .sort((a, b) => {
          const teamA = getTeam(state, a.teamId);
          const teamB = getTeam(state, b.teamId);

          return (
            b.points - a.points ||
            b.goalDifference - a.goalDifference ||
            b.goalsFor - a.goalsFor ||
            (teamA?.name ?? "").localeCompare(teamB?.name ?? "")
          );
        }),
    ]),
  );
}

export function matchesForTeams(state: GameState, teamIds: string[]): Match[] {
  const ids = new Set(teamIds);

  return state.matches
    .filter((match) => ids.has(match.homeTeamId) || ids.has(match.awayTeamId))
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}
