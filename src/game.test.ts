import { describe, expect, it } from "vitest";
import {
  CompletedTrade,
  GameState,
  TradeOffer,
  applyAutomaticGameStage,
  completeTrade,
  computeHoldings,
  liveTeamSlotLimit,
  makePotSale,
  playerTotals,
  potSalePenaltyPotCents,
  potSalePreview,
  potSize,
  settlementRows,
  setGameStage,
  officialStageForDate,
  tradeLevyPotCents,
  validateBuy,
  validatePotSale,
  validateTradeAcceptance,
} from "./game";
import { stageIdFromType } from "./tournamentApi";

function baseState(): GameState {
  return {
    stageId: "pre",
    admins: [],
    joinCode: "TEST",
    teams: [
      {
        id: "mexico",
        name: "Mexico",
        code: "MEX",
        group: "A",
        status: "live",
        flagCode: "mx",
      },
      {
        id: "brazil",
        name: "Brazil",
        code: "BRA",
        group: "C",
        status: "live",
        flagCode: "br",
      },
      {
        id: "germany",
        name: "Germany",
        code: "GER",
        group: "E",
        status: "live",
        flagCode: "de",
      },
    ],
    players: [
      {
        id: "seller",
        realName: "Seller",
        alias: "Seller FC",
        inviteCode: "TEST",
        authStatus: "active",
      },
      {
        id: "buyer",
        realName: "Buyer",
        alias: "Buyer FC",
        inviteCode: "TEST",
        authStatus: "active",
      },
    ],
    matches: [],
    buys: [
      {
        id: "buy-seller",
        playerId: "seller",
        teamId: "mexico",
        spend: 10,
        shares: 480,
        stageId: "pre",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    offers: [],
    trades: [],
    potSales: [],
    knockoutSlotLocks: {},
    winnerTeamId: "",
    tournamentSync: {
      provider: "manual",
      endpoint: "",
      autoRefreshEnabled: false,
      autoRefreshSeconds: 120,
      autoStageEnabled: true,
    },
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function sellOffer(price: number, shares = 240): TradeOffer {
  return createTradeOffer({
    makerId: "seller",
    makerOffersShares: [{ teamId: "mexico", shares }],
    makerRequestsMoney: price,
  });
}

function createTradeOffer(input: Partial<TradeOffer> & { makerId: string }): TradeOffer {
  return {
    id: "offer",
    makerId: input.makerId,
    targetPlayerId: input.targetPlayerId ?? "open",
    makerOffersShares: input.makerOffersShares ?? [],
    makerRequestsShares: input.makerRequestsShares ?? [],
    makerOffersMoney: input.makerOffersMoney ?? 0,
    makerRequestsMoney: input.makerRequestsMoney ?? 0,
    note: "",
    status: "open",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("trade levy", () => {
  it("splits a $100 trade into buyer gross, pot levy, and seller proceeds", () => {
    const trade = completeTrade(sellOffer(100), "buyer");
    const leg = trade.moneyLegs?.[0];
    const state = { ...baseState(), trades: [trade] };

    expect(leg?.grossTradePrice).toBe(10000);
    expect(leg?.tradeLevy).toBe(750);
    expect(leg?.sellerProceeds).toBe(9250);
    expect(tradeLevyPotCents(state)).toBe(750);
    expect(potSize(state)).toBe(17.5);
  });

  it("splits a $40 trade into a $3 levy and $37 seller proceeds", () => {
    const trade = completeTrade(sellOffer(40), "buyer");
    const leg = trade.moneyLegs?.[0];
    const state = { ...baseState(), trades: [trade] };

    expect(leg?.grossTradePrice).toBe(4000);
    expect(leg?.tradeLevy).toBe(300);
    expect(leg?.sellerProceeds).toBe(3700);
    expect(tradeLevyPotCents(state)).toBe(300);
    expect(potSize(state)).toBe(13);
  });

  it("uses gross purchases and seller proceeds for exposure", () => {
    const tradePurchase = completedTradeFixture({
      buyerId: "buyer",
      sellerId: "seller",
      grossTradePrice: 8000,
      tradeLevy: 600,
      sellerProceeds: 7400,
    });
    const tradeSale = completedTradeFixture({
      buyerId: "seller",
      sellerId: "buyer",
      grossTradePrice: 4000,
      tradeLevy: 300,
      sellerProceeds: 3700,
    });
    const state = {
      ...baseState(),
      buys: [
        {
          id: "buy-buyer",
          playerId: "buyer",
          teamId: "mexico",
          spend: 100,
          shares: 4800,
          stageId: "pre" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      trades: [tradePurchase, tradeSale],
    };

    expect(playerTotals(state, "buyer").exposure).toBe(143);
  });

  it("blocks a trade when buyer gross price would exceed the game limit", () => {
    const state = {
      ...baseState(),
      buys: [
        ...baseState().buys,
        {
          id: "buy-buyer",
          playerId: "buyer",
          teamId: "mexico",
          spend: 490,
          shares: 23520,
          stageId: "pre" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    expect(validateTradeAcceptance(state, sellOffer(20), "buyer")).toContain(
      "The accepting trader would go over the $500 game limit.",
    );
  });

  it("uses seller proceeds, not gross sale price, in final settlement", () => {
    const trade = completeTrade(sellOffer(100), "buyer");
    const state = { ...baseState(), trades: [trade] };
    const sellerRow = settlementRows(state).find((row) => row.playerId === "seller");

    expect(sellerRow?.tradeSales).toBe(92.5);
    expect(sellerRow?.finalNet).toBe(82.5);
  });
});

describe("knockout slot locks", () => {
  it("removes open slots when the game enters the post-group knockout market", () => {
    const locked = setGameStage(baseState(), "group");

    expect(liveTeamSlotLimit(locked, "seller")).toBe(1);
    expect(validateBuy(locked, { playerId: "seller", teamId: "brazil", spend: 1 })).toContain(
      "This buy would exceed this player's live-team limit of 1.",
    );
  });

  it("lets a player replace a sold-out live team only within their locked slot count", () => {
    const twoTeamState = {
      ...baseState(),
      buys: [
        ...baseState().buys,
        {
          id: "buy-seller-brazil",
          playerId: "seller",
          teamId: "brazil",
          spend: 10,
          shares: 480,
          stageId: "pre" as const,
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    };
    const locked = setGameStage(twoTeamState, "group");
    const sale = makePotSale(locked, { playerId: "seller", teamId: "brazil", shares: 480 });
    const afterSale = { ...locked, potSales: [sale] };

    expect(liveTeamSlotLimit(afterSale, "seller")).toBe(2);
    expect(computeHoldings(afterSale).seller.brazil).toBeUndefined();
    expect(validateBuy(afterSale, { playerId: "seller", teamId: "germany", spend: 1 })).toEqual([]);
  });
});

describe("official schedule stage automation", () => {
  it("advances stages from official round-end cutoffs", () => {
    expect(officialStageForDate(new Date("2026-06-28T03:59:59.000Z"))).toBe("pre");
    expect(officialStageForDate(new Date("2026-06-28T04:00:00.000Z"))).toBe("group");
    expect(officialStageForDate(new Date("2026-07-04T04:30:00.000Z"))).toBe("r32");
    expect(officialStageForDate(new Date("2026-07-07T23:00:00.000Z"))).toBe("r16");
    expect(officialStageForDate(new Date("2026-07-12T04:00:00.000Z"))).toBe("qf");
    expect(officialStageForDate(new Date("2026-07-15T22:00:00.000Z"))).toBe("final");
  });

  it("locks open slots when the official group-stage cutoff passes", () => {
    const state = applyAutomaticGameStage(baseState(), new Date("2026-06-28T04:00:00.000Z"));

    expect(state.stageId).toBe("group");
    expect(liveTeamSlotLimit(state, "seller")).toBe(1);
  });

  it("does not change the stage when automation is disabled", () => {
    const state = applyAutomaticGameStage(
      {
        ...baseState(),
        tournamentSync: {
          ...baseState().tournamentSync,
          autoStageEnabled: false,
        },
      },
      new Date("2026-07-15T22:00:00.000Z"),
    );

    expect(state.stageId).toBe("pre");
  });
});

describe("tournament round mapping", () => {
  it("does not treat semi-finals or bronze finals as the tournament final", () => {
    expect(stageIdFromType("Semi-finals")).toBe("sf");
    expect(stageIdFromType("Bronze final")).toBe("bronze");
    expect(stageIdFromType("Final")).toBe("final");
  });
});

describe("sell to pot", () => {
  it("charges double the surrendered share cost basis into the pot", () => {
    const preview = potSalePreview(baseState(), { playerId: "seller", teamId: "mexico", shares: 240 });
    const sale = makePotSale(baseState(), { playerId: "seller", teamId: "mexico", shares: 240 });
    const state = { ...baseState(), potSales: [sale] };
    const totals = playerTotals(state, "seller");

    expect(preview.costBasis).toBe(500);
    expect(preview.penalty).toBe(1000);
    expect(potSalePenaltyPotCents(state)).toBe(1000);
    expect(potSize(state)).toBe(20);
    expect(computeHoldings(state).seller.mexico).toBe(240);
    expect(totals.potSalePenalties).toBe(10);
    expect(totals.exposure).toBe(20);
  });

  it("blocks a pot sale when the penalty would exceed the game limit", () => {
    const state = {
      ...baseState(),
      buys: [
        {
          id: "buy-seller-expensive",
          playerId: "seller",
          teamId: "mexico",
          spend: 490,
          shares: 1,
          stageId: "pre" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    expect(validatePotSale(state, { playerId: "seller", teamId: "mexico", shares: 1 })).toContain(
      "This sale would put this player at $1,470, above the $500 game limit.",
    );
  });

  it("subtracts pot sale penalties in final settlement", () => {
    const sale = makePotSale(baseState(), { playerId: "seller", teamId: "mexico", shares: 240 });
    const state = { ...baseState(), potSales: [sale] };
    const sellerRow = settlementRows(state).find((row) => row.playerId === "seller");

    expect(sellerRow?.potSalePenalties).toBe(10);
    expect(sellerRow?.finalNet).toBe(-20);
  });
});

function completedTradeFixture({
  buyerId,
  sellerId,
  grossTradePrice,
  tradeLevy,
  sellerProceeds,
}: {
  buyerId: string;
  sellerId: string;
  grossTradePrice: number;
  tradeLevy: number;
  sellerProceeds: number;
}): CompletedTrade {
  return {
    id: `${buyerId}-${sellerId}-${grossTradePrice}`,
    offerId: "offer",
    makerId: sellerId,
    counterpartyId: buyerId,
    makerOffersShares: [{ teamId: "mexico", shares: 100 }],
    makerRequestsShares: [],
    makerOffersMoney: 0,
    makerRequestsMoney: grossTradePrice / 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    buyerId,
    sellerId,
    teamId: "mexico",
    sharesTransferred: 100,
    grossTradePrice,
    tradeLevy,
    sellerProceeds,
    moneyLegs: [
      {
        buyerId,
        sellerId,
        teamId: "mexico",
        sharesTransferred: 100,
        grossTradePrice,
        tradeLevy,
        sellerProceeds,
        completedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}
