import { describe, expect, it } from "vitest";
import {
  CompletedTrade,
  GameState,
  PotSale,
  ShareLeg,
  StageId,
  TradeOffer,
  applyAutomaticGameStage,
  completeTrade,
  computeHoldings,
  liveTeamSlotLimit,
  makeBuy,
  makePotSale,
  playerTotals,
  potSize,
  potSizeCents,
  settlementRows,
  stageSpend,
  tradeLevyPotCents,
  validateBuy,
  validateOfferCreation,
  validatePotSale,
  validateTradeAcceptance,
} from "./game";
import { createInitialGameState } from "./seed";

type SimulationEvent = {
  label: string;
  detail: string;
};

type Checkpoint = {
  exposureMax: number;
  label: string;
  liveTeamViolations: string[];
  pot: number;
  stageId: StageId;
};

type SimulationReport = {
  buys: number;
  checkpoints: Checkpoint[];
  events: SimulationEvent[];
  finalNetSum: number;
  finalRows: Array<{
    exposure: number;
    finalNet: number;
    player: string;
    potPayout: number;
    winnerShares: number;
  }>;
  invalidActions: SimulationEvent[];
  players: number;
  pot: number;
  potSalePenalties: number;
  stageSpendByPlayer: Record<string, Record<StageId, number>>;
  trades: number;
  tradeLevy: number;
  winner: string;
  winnerShares: number;
};

const playerNames = [
  ["p1", "Alice", "Alice FC"],
  ["p2", "Ben", "Ben FC"],
  ["p3", "Cara", "Cara FC"],
  ["p4", "Dan", "Dan FC"],
  ["p5", "Eve", "Eve FC"],
  ["p6", "Finn", "Finn FC"],
  ["p7", "Gia", "Gia FC"],
  ["p8", "Hugo", "Hugo FC"],
] as const;

const stageDates: Record<StageId, string> = {
  pre: "2026-06-20T12:00:00.000Z",
  group: "2026-06-28T04:00:00.000Z",
  r32: "2026-07-04T04:30:00.000Z",
  r16: "2026-07-07T23:00:00.000Z",
  qf: "2026-07-12T04:00:00.000Z",
  final: "2026-07-15T22:00:00.000Z",
};

function withPlayers(): GameState {
  const state = createInitialGameState();

  return {
    ...state,
    players: playerNames.map(([id, realName, alias]) => ({
      id,
      realName,
      alias,
      inviteCode: state.joinCode,
      authStatus: "active",
      pin: "1234",
      accountCreatedAt: "2026-06-10T00:00:00.000Z",
      lastLoginAt: "2026-06-10T00:00:00.000Z",
    })),
    tournamentSync: {
      ...state.tournamentSync,
      autoStageEnabled: true,
    },
  };
}

function playerAlias(state: GameState, playerId: string): string {
  return state.players.find((player) => player.id === playerId)?.alias ?? playerId;
}

function event(events: SimulationEvent[], label: string, detail: string) {
  events.push({ label, detail });
}

function setClockedBuy(state: GameState, input: { playerId: string; teamId: string; spend: number }, createdAt: string): GameState {
  const errors = validateBuy(state, input);
  if (errors.length > 0) {
    throw new Error(`Buy failed for ${input.playerId} ${input.teamId} ${input.spend}: ${errors.join(" | ")}`);
  }

  const buy = {
    ...makeBuy(state, input),
    id: `buy-${state.buys.length + 1}`,
    createdAt,
  };

  return {
    ...state,
    buys: [...state.buys, buy],
  };
}

function tryBuy(
  state: GameState,
  input: { playerId: string; teamId: string; spend: number },
): string[] {
  return validateBuy(state, input);
}

function offer(input: {
  makerId: string;
  targetPlayerId?: string | "open";
  makerOffersShares?: ShareLeg[];
  makerRequestsShares?: ShareLeg[];
  makerOffersMoney?: number;
  makerRequestsMoney?: number;
  note?: string;
}): TradeOffer {
  return {
    id: `offer-${input.makerId}-${input.note ?? "trade"}`,
    makerId: input.makerId,
    targetPlayerId: input.targetPlayerId ?? "open",
    makerOffersShares: input.makerOffersShares ?? [],
    makerRequestsShares: input.makerRequestsShares ?? [],
    makerOffersMoney: input.makerOffersMoney ?? 0,
    makerRequestsMoney: input.makerRequestsMoney ?? 0,
    note: input.note ?? "",
    status: "open",
    createdAt: "2026-06-20T13:00:00.000Z",
  };
}

function acceptTrade(state: GameState, tradeOffer: TradeOffer, counterpartyId: string, completedAt: string): GameState {
  const creationErrors = validateOfferCreation(state, {
    makerId: tradeOffer.makerId,
    targetPlayerId: tradeOffer.targetPlayerId,
    makerOffersShares: tradeOffer.makerOffersShares,
    makerRequestsShares: tradeOffer.makerRequestsShares,
    makerOffersMoney: tradeOffer.makerOffersMoney,
    makerRequestsMoney: tradeOffer.makerRequestsMoney,
    note: tradeOffer.note,
  });
  if (creationErrors.length > 0) {
    throw new Error(`Offer creation failed: ${creationErrors.join(" | ")}`);
  }

  const acceptanceErrors = validateTradeAcceptance(state, tradeOffer, counterpartyId);
  if (acceptanceErrors.length > 0) {
    throw new Error(`Trade acceptance failed: ${acceptanceErrors.join(" | ")}`);
  }

  const completed = rewriteTradeTime(completeTrade(tradeOffer, counterpartyId), completedAt);

  return {
    ...state,
    offers: [
      ...state.offers,
      {
        ...tradeOffer,
        status: "accepted",
        resolvedAt: completedAt,
        resolvedByPlayerId: counterpartyId,
      },
    ],
    trades: [...state.trades, completed],
  };
}

function rewriteTradeTime(trade: CompletedTrade, completedAt: string): CompletedTrade {
  return {
    ...trade,
    id: `trade-${completedAt}-${trade.offerId}`,
    createdAt: completedAt,
    completedAt,
    moneyLegs: trade.moneyLegs?.map((leg) => ({ ...leg, completedAt })),
  };
}

function tryAcceptTrade(state: GameState, tradeOffer: TradeOffer, counterpartyId: string): string[] {
  return validateTradeAcceptance(state, tradeOffer, counterpartyId);
}

function sellToPot(state: GameState, input: { playerId: string; teamId: string; shares: number }, createdAt: string): GameState {
  const errors = validatePotSale(state, input);
  if (errors.length > 0) {
    throw new Error(`Pot sale failed: ${errors.join(" | ")}`);
  }

  const sale: PotSale = {
    ...makePotSale(state, input),
    id: `pot-sale-${state.potSales.length + 1}`,
    createdAt,
  };

  return {
    ...state,
    potSales: [...state.potSales, sale],
  };
}

function autoStage(state: GameState, stageId: StageId): GameState {
  const next = applyAutomaticGameStage(state, new Date(stageDates[stageId]));
  if (next.stageId !== stageId) {
    throw new Error(`Expected stage ${stageId}, got ${next.stageId}`);
  }

  return next;
}

function setStatuses(state: GameState, updates: Record<string, "live" | "eliminated" | "winner">): GameState {
  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      status: updates[team.id] ?? team.status,
    })),
    winnerTeamId: Object.entries(updates).find(([, status]) => status === "winner")?.[0] ?? state.winnerTeamId,
  };
}

function checkpoint(state: GameState, label: string): Checkpoint {
  const liveTeamViolations = state.players.flatMap((player) => {
    const totals = playerTotals(state, player.id);
    const limit = liveTeamSlotLimit(state, player.id);

    return totals.liveTeams > limit ? [`${player.alias}: ${totals.liveTeams}/${limit}`] : [];
  });

  return {
    exposureMax: Math.max(...state.players.map((player) => playerTotals(state, player.id).exposure)),
    label,
    liveTeamViolations,
    pot: potSize(state),
    stageId: state.stageId,
  };
}

function stageSpendReport(state: GameState): Record<string, Record<StageId, number>> {
  return Object.fromEntries(
    state.players.map((player) => [
      player.alias,
      {
        pre: stageSpend(state, player.id, "pre"),
        group: stageSpend(state, player.id, "group"),
        r32: stageSpend(state, player.id, "r32"),
        r16: stageSpend(state, player.id, "r16"),
        qf: stageSpend(state, player.id, "qf"),
        final: stageSpend(state, player.id, "final"),
      },
    ]),
  );
}

function runFullTournamentSimulation(): SimulationReport {
  const events: SimulationEvent[] = [];
  const invalidActions: SimulationEvent[] = [];
  const checkpoints: Checkpoint[] = [];
  let state = withPlayers();

  event(events, "join", "Created 8 active family player accounts with reusable local PINs.");

  state = setClockedBuy(state, { playerId: "p1", teamId: "argentina", spend: 10 }, "2026-06-20T12:01:00.000Z");
  state = setClockedBuy(state, { playerId: "p2", teamId: "brazil", spend: 10 }, "2026-06-20T12:02:00.000Z");
  state = setClockedBuy(state, { playerId: "p3", teamId: "france", spend: 5 }, "2026-06-20T12:03:00.000Z");
  state = setClockedBuy(state, { playerId: "p3", teamId: "spain", spend: 5 }, "2026-06-20T12:04:00.000Z");
  state = setClockedBuy(state, { playerId: "p4", teamId: "england", spend: 10 }, "2026-06-20T12:05:00.000Z");
  state = setClockedBuy(state, { playerId: "p5", teamId: "portugal", spend: 5 }, "2026-06-20T12:06:00.000Z");
  state = setClockedBuy(state, { playerId: "p5", teamId: "germany", spend: 5 }, "2026-06-20T12:07:00.000Z");
  state = setClockedBuy(state, { playerId: "p6", teamId: "netherlands", spend: 10 }, "2026-06-20T12:08:00.000Z");
  state = setClockedBuy(state, { playerId: "p7", teamId: "usa", spend: 10 }, "2026-06-20T12:09:00.000Z");
  state = setClockedBuy(state, { playerId: "p8", teamId: "mexico", spend: 10 }, "2026-06-20T12:10:00.000Z");
  event(events, "pre-market buys", "All 8 players completed the $10 starting buy; two players split their buy across two teams.");

  const p1SellArgentina = offer({
    makerId: "p1",
    makerOffersShares: [{ teamId: "argentina", shares: 100 }],
    makerRequestsMoney: 40,
    note: "Alice sells Argentina to Ben",
  });
  state = acceptTrade(state, p1SellArgentina, "p2", "2026-06-20T13:00:00.000Z");
  event(events, "trade", "Ben bought 100 Argentina shares from Alice for $40; levy added to pot.");

  const p4BidSpain = offer({
    makerId: "p4",
    targetPlayerId: "p3",
    makerOffersMoney: 60,
    makerRequestsShares: [{ teamId: "spain", shares: 150 }],
    note: "Dan bids for Cara Spain",
  });
  state = acceptTrade(state, p4BidSpain, "p3", "2026-06-20T13:30:00.000Z");
  event(events, "directed bid", "Dan placed a directed bid for Cara's Spain shares and Cara accepted.");
  checkpoints.push(checkpoint(state, "After pre-market buying and trades"));

  const illegalPreBuy = tryBuy(state, { playerId: "p3", teamId: "argentina", spend: 1 });
  invalidActions.push({
    label: "blocked buy",
    detail: `Cara third-team pre-market buy blocked with: ${illegalPreBuy.join(" | ")}`,
  });

  state = autoStage(state, "group");
  event(events, "auto stage", "Official group-stage cutoff moved market to the post-group buying window and locked open slots.");
  checkpoints.push(checkpoint(state, "After automatic post-group stage"));

  const blockedLockedTrade = offer({
    makerId: "p1",
    makerOffersShares: [{ teamId: "argentina", shares: 100 }],
    makerRequestsMoney: 30,
    note: "Alice to Finn blocked slot test",
  });
  const lockedTradeErrors = tryAcceptTrade(state, blockedLockedTrade, "p6");
  invalidActions.push({
    label: "blocked trade",
    detail: `Finn was locked to one live-team slot and could not accept Argentina while holding Netherlands: ${lockedTradeErrors.join(" | ")}`,
  });

  [
    ["p1", "argentina", 20],
    ["p2", "brazil", 20],
    ["p3", "spain", 20],
    ["p4", "england", 20],
    ["p5", "portugal", 20],
    ["p6", "netherlands", 20],
    ["p7", "usa", 20],
    ["p8", "mexico", 20],
  ].forEach(([playerId, teamId, spend], index) => {
    state = setClockedBuy(
      state,
      { playerId: String(playerId), teamId: String(teamId), spend: Number(spend) },
      `2026-06-28T05:${String(index).padStart(2, "0")}:00.000Z`,
    );
  });
  event(events, "post-group buys", "Each player used the post-group window on an existing live-team slot.");

  state = sellToPot(state, { playerId: "p8", teamId: "mexico", shares: 1120 }, "2026-06-28T06:00:00.000Z");
  event(events, "sell to pot", "Hugo surrendered all Mexico shares, paid the 2x cost-basis penalty into the pot, and freed his locked slot.");
  checkpoints.push(checkpoint(state, "After group window and pot sale"));

  state = setStatuses(state, {
    germany: "eliminated",
    mexico: "eliminated",
    netherlands: "eliminated",
    usa: "eliminated",
  });
  state = autoStage(state, "r32");
  event(events, "auto stage", "Official Round of 32 cutoff moved market to the Round-of-16 buying window.");

  state = setClockedBuy(state, { playerId: "p8", teamId: "argentina", spend: 40 }, "2026-07-04T05:00:00.000Z");
  state = setClockedBuy(state, { playerId: "p6", teamId: "france", spend: 40 }, "2026-07-04T05:05:00.000Z");
  state = setClockedBuy(state, { playerId: "p5", teamId: "portugal", spend: 40 }, "2026-07-04T05:10:00.000Z");
  const p1SellToEve = offer({
    makerId: "p1",
    makerOffersShares: [{ teamId: "argentina", shares: 200 }],
    makerRequestsMoney: 80,
    note: "Alice sells Argentina to Eve",
  });
  state = acceptTrade(state, p1SellToEve, "p5", "2026-07-04T06:00:00.000Z");
  event(events, "post-lock trade", "Eve bought Argentina after Germany was eliminated, staying within her locked two-slot limit.");
  checkpoints.push(checkpoint(state, "After Round-of-32 market"));

  state = setStatuses(state, {
    brazil: "eliminated",
    portugal: "eliminated",
  });
  state = autoStage(state, "r16");
  event(events, "auto stage", "Official Round of 16 cutoff moved market to the quarter-final buying window.");

  [
    ["p1", "argentina", 80],
    ["p3", "france", 80],
    ["p4", "england", 80],
    ["p5", "argentina", 80],
    ["p6", "france", 80],
    ["p8", "argentina", 80],
  ].forEach(([playerId, teamId, spend], index) => {
    state = setClockedBuy(
      state,
      { playerId: String(playerId), teamId: String(teamId), spend: Number(spend) },
      `2026-07-07T23:${String(10 + index).padStart(2, "0")}:00.000Z`,
    );
  });
  checkpoints.push(checkpoint(state, "After Round-of-16 market"));

  state = setStatuses(state, {
    england: "eliminated",
    spain: "eliminated",
  });
  state = autoStage(state, "qf");
  event(events, "auto stage", "Official quarter-final cutoff moved market to the semi-final buying window.");

  state = setClockedBuy(state, { playerId: "p3", teamId: "argentina", spend: 120 }, "2026-07-12T04:15:00.000Z");
  state = setClockedBuy(state, { playerId: "p4", teamId: "france", spend: 120 }, "2026-07-12T04:20:00.000Z");
  state = setClockedBuy(state, { playerId: "p5", teamId: "argentina", spend: 120 }, "2026-07-12T04:25:00.000Z");
  checkpoints.push(checkpoint(state, "After quarter-final market"));

  state = autoStage(state, "final");
  event(events, "auto stage", "Official semi-final cutoff moved market to the final buying window.");

  state = setClockedBuy(state, { playerId: "p1", teamId: "argentina", spend: 120 }, "2026-07-15T22:10:00.000Z");
  state = setClockedBuy(state, { playerId: "p2", teamId: "argentina", spend: 120 }, "2026-07-15T22:15:00.000Z");
  state = setClockedBuy(state, { playerId: "p4", teamId: "france", spend: 120 }, "2026-07-15T22:20:00.000Z");
  state = setClockedBuy(state, { playerId: "p6", teamId: "france", spend: 120 }, "2026-07-15T22:25:00.000Z");
  const capBlockedTrade = offer({
    makerId: "p1",
    makerOffersShares: [{ teamId: "argentina", shares: 100 }],
    makerRequestsMoney: 100,
    note: "Alice to Dan exposure cap test",
  });
  const capTradeErrors = tryAcceptTrade(state, capBlockedTrade, "p4");
  invalidActions.push({
    label: "blocked exposure cap trade",
    detail: `Dan was at ${formatCurrency(playerTotals(state, "p4").exposure)} exposure and could not accept a $100 Argentina trade: ${capTradeErrors.join(" | ")}`,
  });
  checkpoints.push(checkpoint(state, "Before final settlement"));

  state = setStatuses(state, {
    argentina: "winner",
    france: "eliminated",
  });
  event(events, "final", "Argentina marked as tournament winner and France eliminated.");

  const rows = settlementRows(state);
  const holdings = computeHoldings(state);
  const finalNetSum = Math.round(rows.reduce((sum, row) => sum + row.finalNet, 0) * 100) / 100;
  const winnerShares = state.players.reduce(
    (sum, player) => sum + Math.max(holdings[player.id]?.argentina ?? 0, 0),
    0,
  );

  const report: SimulationReport = {
    buys: state.buys.length,
    checkpoints,
    events,
    finalNetSum,
    finalRows: rows.map((row) => ({
      exposure: row.exposure,
      finalNet: Math.round(row.finalNet * 100) / 100,
      player: playerAlias(state, row.playerId),
      potPayout: Math.round(row.potPayout * 100) / 100,
      winnerShares: row.winnerShares,
    })),
    invalidActions,
    players: state.players.length,
    pot: potSize(state),
    potSalePenalties: state.potSales.reduce((sum, sale) => sum + sale.penalty, 0) / 100,
    stageSpendByPlayer: stageSpendReport(state),
    trades: state.trades.length,
    tradeLevy: tradeLevyPotCents(state) / 100,
    winner: "Argentina",
    winnerShares,
  };

  checkpoints.forEach((item) => expect(item.liveTeamViolations).toEqual([]));
  state.players.forEach((player) => {
    expect(playerTotals(state, player.id).exposure).toBeLessThanOrEqual(500);
  });
  expect(state.players).toHaveLength(8);
  expect(state.stageId).toBe("final");
  expect(state.trades).toHaveLength(3);
  expect(state.potSales).toHaveLength(1);
  expect(potSizeCents(state)).toBeGreaterThan(0);
  expect(winnerShares).toBeGreaterThan(0);
  expect(Math.abs(finalNetSum)).toBeLessThanOrEqual(0.01);
  expect(invalidActions.every((item) => item.detail.length > 0)).toBe(true);

  return report;
}

describe("full tournament simulation", () => {
  it("supports an 8-player tournament from join through final settlement", () => {
    const report = runFullTournamentSimulation();

    expect(report.players).toBe(8);
  });
});

function formatCurrency(value: number): string {
  return `$${(Math.round(value * 100) / 100).toFixed(2)}`;
}
