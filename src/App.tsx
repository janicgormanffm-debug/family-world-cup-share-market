import {
  AlertTriangle,
  CalendarDays,
  Check,
  CircleDollarSign,
  Eye,
  EyeOff,
  HandCoins,
  Info,
  Landmark,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Buy,
  EXPOSURE_CAP,
  GameState,
  Match,
  Player,
  ShareLeg,
  StageId,
  SELL_TO_POT_PENALTY_MULTIPLIER,
  Team,
  TeamStatus,
  TRADE_LEVY_RATE,
  TradeOffer,
  applyAutomaticGameStage,
  buyCapacityForTeam,
  completeTrade,
  completedTradeMoneyLegs,
  computeHoldings,
  currency,
  currencyFromCents,
  describeShareLegs,
  ensureKnockoutSlotLocks,
  getPlayer,
  getStage,
  getTeam,
  groupStandings,
  isKnockoutSlotLockStage,
  liveTeamSlotLimit,
  makePotSale,
  makeBuy,
  matchesForTeams,
  mergeLegs,
  nowId,
  officialStageCutoffs,
  playerTotals,
  potSalePreview,
  potSize,
  settlementRows,
  setGameStage,
  slugify,
  stageSpend,
  stages,
  startingStatus,
  teamFlagSrc,
  tradePreview,
  validateBuy,
  validateOfferCreation,
  validatePotSale,
  validateTradeAcceptance,
  wholeNumber,
} from "./game";
import { createInitialGameState, seedAdmins, seedMatches, seedPlayers, seedTeams } from "./seed";
import { applyTournamentSync, fetchWorldCup26Feed } from "./tournamentApi";

type Tab = "my" | "dashboard" | "tournament" | "buy" | "market" | "settlement" | "admin" | "rules";
type Session =
  | { role: "guest" }
  | { role: "player"; playerId: string }
  | { role: "admin"; adminId: string };

const storageKey = "family-world-cup-share-market-v1";
const sessionKey = "family-world-cup-session-v2";
const legacySeedPlayerIds = new Set([
  "player-dad",
  "player-mum",
  "player-alex",
  "player-sam",
  "player-jess",
  "player-nana",
]);

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return applyAutomaticGameStage(createInitialGameState());
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed.players || !parsed.teams || !parsed.buys || !parsed.trades) {
      return createInitialGameState();
    }

    return applyAutomaticGameStage(migrateState(parsed));
  } catch {
    return createInitialGameState();
  }
}

function migrateState(state: GameState): GameState {
  const hadOnlyLegacySeedPlayers =
    !state.admins &&
    (state.players ?? []).length > 0 &&
    state.players.every((player) => legacySeedPlayerIds.has(player.id)) &&
    state.buys.length === 0 &&
    state.trades.length === 0 &&
    state.offers.length === 0;

  const migrated: GameState = {
    ...state,
    admins: state.admins ?? seedAdmins,
    joinCode: state.joinCode ?? "FAMILY-2026",
    teams: state.teams.map((team) => {
      const seeded = seedTeams.find((seedTeam) => seedTeam.id === team.id);
      return { ...seeded, ...team };
    }),
    players: hadOnlyLegacySeedPlayers ? [] : state.players.map((player, index) => {
      const seeded = seedPlayers.find((seedPlayer) => seedPlayer.id === player.id);
      return {
        ...seeded,
        ...player,
        inviteCode: player.inviteCode ?? seeded?.inviteCode ?? `INVITE-${index + 1}`,
        authStatus: player.authStatus ?? seeded?.authStatus ?? "invited",
      };
    }),
    matches: state.matches ?? seedMatches,
    potSales: state.potSales ?? [],
    knockoutSlotLocks: state.knockoutSlotLocks ?? {},
    tournamentSync: state.tournamentSync
      ? {
          ...state.tournamentSync,
          autoRefreshEnabled: state.tournamentSync.autoRefreshEnabled ?? true,
          autoRefreshSeconds: state.tournamentSync.autoRefreshSeconds ?? 120,
          autoStageEnabled: state.tournamentSync.autoStageEnabled ?? true,
        }
      : {
          provider: "custom-json",
          endpoint: "https://worldcup26.ir",
          autoRefreshEnabled: true,
          autoRefreshSeconds: 120,
          autoStageEnabled: true,
          lastSyncStatus: "Seed data loaded",
        },
  };

  return applyAutomaticGameStage(ensureKnockoutSlotLocks(migrated));
}

function saveState(state: GameState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function upsertUpdatedAt(state: GameState): GameState {
  return { ...state, lastUpdatedAt: new Date().toISOString() };
}

function loadSession(state: GameState): Session {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return { role: "guest" };

    const parsed = JSON.parse(raw) as Session;
    if (parsed.role === "admin" && state.admins.some((admin) => admin.id === parsed.adminId)) {
      return parsed;
    }

    if (parsed.role === "player" && state.players.some((player) => player.id === parsed.playerId)) {
      return parsed;
    }
  } catch {
    return { role: "guest" };
  }

  return { role: "guest" };
}

function saveSession(session: Session) {
  if (session.role === "guest") {
    localStorage.removeItem(sessionKey);
  } else {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }
}

function App() {
  const [state, setState] = useState<GameState>(() => loadState());
  const [tab, setTab] = useState<Tab>("my");
  const [revealIdentities, setRevealIdentities] = useState(false);
  const [session, setSession] = useState<Session>(() => loadSession(loadState()));
  const isAdminEntry = new URLSearchParams(window.location.search).get("admin") === "1";

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (session.role === "guest" && !["my", "tournament", "rules"].includes(tab)) {
      setTab("my");
    }

    if (session.role === "player" && ["admin", "settlement"].includes(tab)) {
      setTab("my");
    }

    if (session.role === "admin" && ["buy", "market"].includes(tab)) {
      setTab("my");
    }
  }, [session.role, tab]);

  const holdings = useMemo(() => computeHoldings(state), [state]);
  const stage = getStage(state.stageId);
  const pot = potSize(state);
  const openOffers = state.offers.filter((offer) => offer.status === "open");
  const currentPlayer = session.role === "player" ? getPlayer(state, session.playerId) : undefined;
  const currentAdmin =
    session.role === "admin" ? state.admins.find((admin) => admin.id === session.adminId) : undefined;
  const isAdmin = session.role === "admin";
  const signedInName = currentAdmin?.name ?? currentPlayer?.alias ?? "";
  const signedInRole = currentAdmin ? "Admin" : "Trader";

  const updateState = (updater: (current: GameState) => GameState) => {
    setState((current) => upsertUpdatedAt(applyAutomaticGameStage(ensureKnockoutSlotLocks(updater(current)))));
  };

  useEffect(() => {
    if (state.tournamentSync.autoStageEnabled === false) return;

    const syncStage = () => {
      setState((current) => {
        const next = applyAutomaticGameStage(current);
        return next === current ? current : upsertUpdatedAt(next);
      });
    };

    syncStage();
    const interval = window.setInterval(syncStage, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [state.tournamentSync.autoStageEnabled]);

  useEffect(() => {
    if (!state.tournamentSync.autoRefreshEnabled || state.tournamentSync.provider === "manual") {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const refreshSeconds = Math.max(state.tournamentSync.autoRefreshSeconds || 120, 30);

    const sync = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const result = await fetchWorldCup26Feed(state.tournamentSync.endpoint || "https://worldcup26.ir");
        if (cancelled) return;

        setState((current) => upsertUpdatedAt(applyAutomaticGameStage(applyTournamentSync(current, result))));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Tournament sync failed.";
        setState((current) =>
          upsertUpdatedAt({
            ...current,
            tournamentSync: {
              ...current.tournamentSync,
              lastSyncError: message,
              lastSyncStatus: "Auto refresh failed",
            },
          }),
        );
      } finally {
        inFlight = false;
      }
    };

    sync();
    const interval = window.setInterval(sync, refreshSeconds * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    state.tournamentSync.autoRefreshEnabled,
    state.tournamentSync.autoRefreshSeconds,
    state.tournamentSync.endpoint,
    state.tournamentSync.provider,
  ]);

  if (session.role === "guest") {
    return (
      <main className="app-shell auth-only-shell">
        <section className="auth-brand-panel">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <Trophy size={24} />
            </div>
            <div>
              <h1>Family World Cup Share Market</h1>
              <p>{isAdminEntry ? "Admin entry" : "Private family game"}</p>
            </div>
          </div>
        </section>

        {tab === "rules" ? (
          <RulesPage onBack={() => setTab("my")} />
        ) : (
          <AuthPanel adminEntry={isAdminEntry} state={state} updateState={updateState} setSession={setSession} />
        )}
        <AppFooter setTab={setTab} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Trophy size={24} />
          </div>
          <div>
            <h1>Family World Cup Share Market</h1>
            <p>{stage.label}</p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="app-context-strip" aria-label="Game status">
            <ContextChip
              explain="New share buys go into the pot. A small part of each trade also goes into the pot."
              label="Pot"
              value={currency(pot)}
            />
            <ContextChip
              explain="Each $1 you buy creates this many shares. Earlier buys create more shares."
              label="Shares per $1"
              value={`x${stage.multiplier}`}
            />
            <ContextChip
              explain="The most each player can buy in this buying window."
              label="Buy limit"
              value={currency(stage.maxSpend)}
            />
            <ContextChip label="Offers" value={String(openOffers.length)} />
          </div>
          <div className="account-chip">
            <span>
              <ShieldCheck size={15} /> {signedInRole}: <b>{signedInName}</b>
            </span>
            <button
              aria-label="Log out"
              className="icon-button account-logout"
              title="Log out"
              type="button"
              onClick={() => setSession({ role: "guest" })}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Game sections">
        <TabButton active={tab === "my"} onClick={() => setTab("my")}>
          {isAdmin ? "Home" : "My Money"}
        </TabButton>
        {currentPlayer && (
          <>
            <TabButton active={tab === "buy"} onClick={() => setTab("buy")}>
              Buy
            </TabButton>
            <TabButton active={tab === "market"} onClick={() => setTab("market")}>
              Trade
            </TabButton>
            <TabButton active={tab === "tournament"} onClick={() => setTab("tournament")}>
              Scores
            </TabButton>
            <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
              Family
            </TabButton>
          </>
        )}
        {isAdmin && (
          <>
            <TabButton active={tab === "admin"} onClick={() => setTab("admin")}>
              Admin
            </TabButton>
            <TabButton active={tab === "tournament"} onClick={() => setTab("tournament")}>
              Scores
            </TabButton>
            <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
              Family
            </TabButton>
            <TabButton active={tab === "settlement"} onClick={() => setTab("settlement")}>
              Settlement
            </TabButton>
          </>
        )}
      </nav>

      {tab === "my" && currentPlayer && <MyDashboard state={state} currentPlayer={currentPlayer} setTab={setTab} />}
      {tab === "my" && isAdmin && (
        <AdminHome state={state} setTab={setTab} />
      )}
      {tab === "my" && !currentPlayer && !isAdmin && (
        <AuthPanel adminEntry={isAdminEntry} state={state} updateState={updateState} setSession={setSession} />
      )}
      {tab === "dashboard" && (
        <Dashboard
          state={state}
          holdings={holdings}
          revealIdentities={revealIdentities}
          setRevealIdentities={setRevealIdentities}
        />
      )}
      {tab === "tournament" && <Tournament isAdmin={isAdmin} state={state} updateState={updateState} />}
      {tab === "buy" && (
        <BuyShares
          currentPlayerId={currentPlayer?.id ?? ""}
          state={state}
          updateState={updateState}
        />
      )}
      {tab === "market" && currentPlayer && (
        <MarketBoard currentPlayerId={currentPlayer.id} state={state} updateState={updateState} />
      )}
      {tab === "settlement" && isAdmin && <Settlement state={state} updateState={updateState} />}
      {tab === "admin" && isAdmin && <Admin state={state} updateState={updateState} />}
      {tab === "rules" && <RulesPage onBack={() => setTab("my")} />}

      <AppFooter setTab={setTab} />
    </main>
  );
}

function AppFooter({ setTab }: { setTab: (tab: Tab) => void }) {
  return (
    <footer className="app-footer">
      <button className="footer-link" type="button" onClick={() => setTab("rules")}>
        Game rules
      </button>
    </footer>
  );
}

function ContextChip({
  explain,
  label,
  value,
}: {
  explain?: string;
  label: string;
  value: string;
}) {
  return (
    <span className="context-chip">
      <small>
        {label}
        {explain && <InfoTooltip text={explain} />}
      </small>
      <b>{value}</b>
    </span>
  );
}

function Metric({
  explain,
  icon,
  label,
  value,
}: {
  explain?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span>
        <b>{value}</b>
        <small>
          {label}
          {explain && <InfoTooltip text={explain} />}
        </small>
      </span>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="info-tooltip" aria-label={text} tabIndex={0}>
      <Info size={13} />
      <span className="tooltip-bubble">{text}</span>
    </span>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "tab active" : "tab"} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function AuthPanel({
  adminEntry,
  state,
  updateState,
  setSession,
}: {
  adminEntry: boolean;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
  setSession: (session: Session) => void;
}) {
  const [joinCode, setJoinCode] = useState(
    new URLSearchParams(window.location.search).get("join") ?? "",
  );
  const [realName, setRealName] = useState("");
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (adminEntry) {
      const admin = state.admins[0];

      if (!admin || admin.pin !== pin.trim()) {
        setError("Admin PIN does not match.");
        return;
      }

      updateState((current) => ({
        ...current,
        admins: current.admins.map((candidate) =>
          candidate.id === admin.id ? { ...candidate, lastLoginAt: new Date().toISOString() } : candidate,
        ),
      }));
      setSession({ role: "admin", adminId: admin.id });
      return;
    }

    const existingPlayer = state.players.find(
      (candidate) => candidate.alias.toLowerCase() === alias.trim().toLowerCase(),
    );

    if (joinCode.trim().toLowerCase() !== state.joinCode.toLowerCase()) {
      setError("That join code does not match this game.");
      return;
    }

    if (existingPlayer?.pin && existingPlayer.pin !== pin.trim()) {
      setError("That PIN does not match this trader.");
      return;
    }

    if (!pin.trim() || pin.trim().length < 4) {
      setError("Choose a PIN of at least four characters.");
      return;
    }

    if (existingPlayer) {
      updateState((current) => ({
        ...current,
        players: current.players.map((candidate) =>
          candidate.id === existingPlayer.id
            ? { ...candidate, lastLoginAt: new Date().toISOString() }
            : candidate,
        ),
      }));
      setSession({ role: "player", playerId: existingPlayer.id });
      return;
    }

    if (!alias.trim()) {
      setError("Choose the trader alias everyone will see.");
      return;
    }

    if (!realName.trim()) {
      setError("Enter your real name for the admin record.");
      return;
    }

    const playerId = nowId("player");
    const now = new Date().toISOString();

    updateState((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          id: playerId,
          realName: realName.trim(),
          alias: alias.trim(),
          inviteCode: state.joinCode,
          authStatus: "active",
          pin: pin.trim(),
          accountCreatedAt: now,
          lastLoginAt: now,
        },
      ],
    }));
    setSession({ role: "player", playerId });
  };

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <div className="panel-heading">
          <div>
            <h2>{adminEntry ? "Admin Login" : "Join the Market"}</h2>
            <p>{adminEntry ? "Game control" : "Create your tournament login"}</p>
          </div>
          <StatusPill tone="gold">Private game</StatusPill>
        </div>
        <form className="form-stack" onSubmit={submit}>
          {!adminEntry && (
            <>
              <label>
                Join code
                <input
                  autoComplete="one-time-code"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                />
              </label>
              <label>
                Real name
                <input value={realName} onChange={(event) => setRealName(event.target.value)} />
              </label>
              <label>
                Alias
                <input value={alias} onChange={(event) => setAlias(event.target.value)} />
              </label>
            </>
          )}
          <label>
            {adminEntry ? "Admin PIN" : "PIN"}
            <input
              autoComplete="new-password"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </label>
          {error && <ValidationList errors={[error]} />}
          <button className="primary-button" type="submit">
            {adminEntry ? <LogIn size={18} /> : <UserPlus size={18} />}
            {adminEntry ? "Log In" : "Create Login"}
          </button>
        </form>
      </div>
    </section>
  );
}

function AdminHome({ state, setTab }: { state: GameState; setTab: (tab: Tab) => void }) {
  const liveMatches = state.matches.filter((match) => match.status === "live").length;
  const baseLink = `${window.location.origin}${window.location.pathname}`;
  const joinLink = `${baseLink}?join=${state.joinCode}`;
  const adminLink = `${baseLink}?admin=1`;

  return (
    <section className="content-grid my-grid">
      <section className="panel hero-panel">
        <div className="panel-heading">
          <div>
            <h2>Game Admin</h2>
            <p>Private tournament control</p>
          </div>
          <StatusPill tone="gold">{state.players.length} players</StatusPill>
        </div>
        <div className="rule-strip">
          <RuleTile label="Players joined" value={String(state.players.length)} />
          <RuleTile label="Open offers" value={String(state.offers.filter((offer) => offer.status === "open").length)} />
          <RuleTile label="Live matches" value={String(liveMatches)} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Next Actions</h2>
            <p>Admin tools</p>
          </div>
        </div>
        <div className="admin-action-list">
          <button className="primary-button" type="button" onClick={() => setTab("admin")}>
            <UserPlus size={18} /> Share Join Link
          </button>
          <button className="secondary-button" type="button" onClick={() => setTab("tournament")}>
            <RefreshCcw size={18} /> Check Feed
          </button>
          <button className="ghost-button" type="button" onClick={() => setTab("settlement")}>
            <Landmark size={18} /> Settlement
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Private Links</h2>
            <p>Player and admin entry</p>
          </div>
        </div>
        <small className="field-note">Family join link</small>
        <code className="invite-code full-width">{joinLink}</code>
        <small className="field-note stacked">Admin link</small>
        <code className="invite-code full-width">{adminLink}</code>
      </section>
    </section>
  );
}

function MyDashboard({
  state,
  currentPlayer,
  setTab,
}: {
  state: GameState;
  currentPlayer: Player;
  setTab: (tab: Tab) => void;
}) {
  const holdings = computeHoldings(state)[currentPlayer.id] ?? {};
  const allHoldings = Object.entries(holdings)
    .filter(([, shares]) => shares > 0)
    .sort(([leftTeamId], [rightTeamId]) => {
      const left = getTeam(state, leftTeamId);
      const right = getTeam(state, rightTeamId);
      const rank = (team?: Team) => (team?.status === "winner" ? 0 : team?.status === "live" ? 1 : 2);

      return rank(left) - rank(right) || (left?.name ?? "").localeCompare(right?.name ?? "");
    });
  const liveHoldings = allHoldings.filter(([teamId, shares]) => {
    const team = getTeam(state, teamId);
    return shares > 0 && (team?.status === "live" || team?.status === "winner");
  });
  const followedMatches = matchesForTeams(
    state,
    liveHoldings.map(([teamId]) => teamId),
  ).slice(0, 6);
  const totals = playerTotals(state, currentPlayer.id);
  const stage = getStage(state.stageId);
  const usedInStage = stageSpend(state, currentPlayer.id, state.stageId);
  const stageRoom = Math.max(stage.maxSpend - usedInStage, 0);
  const capRoom = Math.max(totals.remainingExposure, 0);
  const availableNow = Math.min(stageRoom, capRoom);
  const moneyOwed = totals.newBuys + totals.tradePurchases + totals.potSalePenalties;
  const beforeWinnerPayout = totals.tradeSales - moneyOwed;
  const totalShares = allHoldings.reduce((sum, [, shares]) => sum + shares, 0);
  const liveShares = liveHoldings.reduce((sum, [, shares]) => sum + shares, 0);
  const slotLimit = liveTeamSlotLimit(state, currentPlayer.id);
  const slotLocked = isKnockoutSlotLockStage(state.stageId);

  return (
    <section className="content-grid my-grid simple-dashboard">
      <section className="panel dashboard-summary-panel">
        <div className="panel-heading">
          <div>
            <h2>{currentPlayer.alias}</h2>
            <p>Money position</p>
          </div>
          <StatusPill tone={totals.liveTeams <= slotLimit ? "good" : "bad"}>
            {totals.liveTeams}/{slotLimit} live teams
          </StatusPill>
        </div>

        <div className="money-summary-grid">
          <MoneyCard
            detail={`${currency(capRoom)} left before your $500 limit`}
            explain="This is how much more you can spend right now. It checks both this buying window and your $500 total limit."
            label="Can still spend now"
            tone="primary"
            value={currency(availableNow)}
          />
          <MoneyCard
            detail={`${currency(totals.newBuys)} new buys + ${currency(totals.tradePurchases)} trades + ${currency(totals.potSalePenalties)} sell-to-pot costs`}
            explain="This is the money you have put into the game so far."
            label="You owe"
            tone={moneyOwed > 0 ? "debit" : "neutral"}
            value={currency(moneyOwed)}
          />
          <MoneyCard
            detail="From selling shares to other players"
            explain="When you sell shares, you receive 92.5% of the trade price. The other 7.5% goes into the pot."
            label="You get from sales"
            tone="credit"
            value={currency(totals.tradeSales)}
          />
          <MoneyCard
            detail="Before the winner payout is added"
            explain="This is sale money minus what you have spent so far. The final winner payout comes later."
            label="Balance so far"
            tone={beforeWinnerPayout >= 0 ? "credit" : "debit"}
            value={currency(beforeWinnerPayout)}
          />
        </div>
      </section>

      <section className="panel dashboard-actions-panel">
        <div className="panel-heading">
          <div>
            <h2>Next moves</h2>
            <p>{stage.phaseLabel}</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="primary-button" type="button" onClick={() => setTab("buy")}>
            <Plus size={18} /> Buy
          </button>
          <button className="secondary-button" type="button" onClick={() => setTab("market")}>
            <HandCoins size={18} /> Trade
          </button>
          <button className="ghost-button" type="button" onClick={() => setTab("tournament")}>
            <CalendarDays size={16} /> Scores
          </button>
        </div>
        <div className="window-facts">
          <div>
            <span>This window left</span>
            <b>{currency(stageRoom)}</b>
          </div>
          <div>
            <span>
              Shares per $1
              <InfoTooltip text="$10 at x48 creates 480 shares. Later rounds give fewer shares per $1." />
            </span>
            <b>x{stage.multiplier}</b>
          </div>
          <div>
            <span>Limit used</span>
            <b>
              {currency(totals.exposure)} / {currency(EXPOSURE_CAP)}
            </b>
          </div>
          <div>
            <span>Team slots</span>
            <b>{slotLocked ? "Locked" : "Open"} · {totals.liveTeams}/{slotLimit}</b>
          </div>
        </div>
      </section>

      <section className="panel shares-overview-panel">
        <div className="panel-heading">
          <div>
            <h2>Shares Held</h2>
            <p>{wholeNumber(totalShares)} total shares</p>
          </div>
          <StatusPill tone={liveShares > 0 ? "good" : "warn"}>{wholeNumber(liveShares)} live shares</StatusPill>
        </div>

        <div className="share-summary-strip">
          <RuleTile label="Live teams" value={`${totals.liveTeams}/${slotLimit}`} />
          <RuleTile label="Total teams held" value={String(allHoldings.length)} />
          <RuleTile label="Limit used" value={currency(totals.exposure)} />
        </div>

        <div className="share-row-list">
          {allHoldings.length === 0 && <span className="empty-state compact">No shares yet.</span>}
          {allHoldings.map(([teamId, shares]) => {
            const team = getTeam(state, teamId);
            return (
              <div className="share-row" key={teamId}>
                <span className="share-team">
                  <TeamCode team={team} />
                  <span>
                    <b>{team?.name}</b>
                    <small>{team?.group ? `Group ${team.group}` : "Tournament"}</small>
                  </span>
                </span>
                <span className="share-count">
                  <b>{wholeNumber(shares)}</b>
                  <small>shares</small>
                </span>
                <StatusPill tone={team?.status === "winner" ? "gold" : team?.status === "live" ? "good" : "bad"}>
                  {team?.status ?? "unknown"}
                </StatusPill>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel matches-panel">
        <div className="panel-heading">
          <div>
            <h2>Your Teams’ Matches</h2>
            <p>Synced scores</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => setTab("tournament")}>
            <CalendarDays size={16} /> All
          </button>
        </div>
        <MatchList state={state} matches={followedMatches} emptyText="Buy or trade into a team to track its matches here." />
      </section>
    </section>
  );
}

function MoneyCard({
  detail,
  explain,
  label,
  tone,
  value,
}: {
  detail: string;
  explain?: string;
  label: string;
  tone: "primary" | "credit" | "debit" | "neutral";
  value: string;
}) {
  return (
    <div className={`money-card ${tone}`}>
      <small>
        {label}
        {explain && <InfoTooltip text={explain} />}
      </small>
      <b>{value}</b>
      <span>{detail}</span>
    </div>
  );
}

function QuickBuyCard({
  state,
  playerId,
  updateState,
}: {
  state: GameState;
  playerId: string;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const firstLiveTeam = state.teams.find((team) => team.status === "live" || team.status === "winner");
  const [teamId, setTeamId] = useState(firstLiveTeam?.id ?? "");
  const [spend, setSpend] = useState("1");
  const [errors, setErrors] = useState<string[]>([]);
  const stage = getStage(state.stageId);
  const capacity = buyCapacityForTeam(state, playerId, teamId);
  const shares = Number.isFinite(Number(spend)) ? Number(spend) * stage.multiplier : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { playerId, teamId, spend: Number(spend) };
    const validation = validateBuy(state, input);
    setErrors(validation);
    if (validation.length > 0) return;

    updateState((current) => ({ ...current, buys: [...current.buys, makeBuy(current, input)] }));
    setErrors([]);
  };

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Buy Shares</h2>
          <p>{stage.label}</p>
        </div>
        <StatusPill tone={capacity.maxSpend > 0 ? "good" : "warn"}>
          Max {currency(capacity.maxSpend)}
        </StatusPill>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            {state.teams
              .filter((team) => team.status === "live" || team.status === "winner")
              .map((team) => (
                <option key={team.id} value={team.id}>
                  Group {team.group} - {team.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Spend
          <input
            min="1"
            step="1"
            type="number"
            value={spend}
            onChange={(event) => setSpend(event.target.value)}
          />
        </label>
        <div className="limit-grid">
          <LimitBar label="This window left" max={stage.maxSpend} value={capacity.stageRoom} />
          <LimitBar label="$500 limit left" max={EXPOSURE_CAP} value={capacity.exposureRoom} />
        </div>
        <div className="preview-bar">
          <span>
            <b>{wholeNumber(Math.max(shares, 0))}</b> shares
            <InfoTooltip text="Your shares equal dollars spent times the current shares-per-$1 rate." />
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => setSpend(String(Math.max(capacity.maxSpend, 1)))}
            disabled={capacity.maxSpend <= 0}
          >
            Use max
          </button>
        </div>
        {capacity.blockedReason && <ValidationList errors={[capacity.blockedReason]} />}
        <ValidationList errors={errors} />
        <button className="primary-button" type="submit">
          <Plus size={18} /> Record Buy
        </button>
      </form>
    </>
  );
}

function RuleTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-tile">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}

function RulesPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="content-grid rules-grid">
      <section className="panel wide-panel rules-hero-panel">
        <div className="panel-heading">
          <div>
            <h2>Game Rules</h2>
            <p>How the family share market works</p>
          </div>
          <button className="ghost-button" type="button" onClick={onBack}>
            Back
          </button>
        </div>
        <div className="rule-strip">
          <RuleTile label="Spending limit per player" value={currency(EXPOSURE_CAP)} />
          <RuleTile label="Live-team limit" value="2 teams" />
          <RuleTile label="Trade fee to pot" value={`${(TRADE_LEVY_RATE * 100).toFixed(1)}%`} />
        </div>
      </section>

      <section className="panel rules-panel">
        <h3>1. Aim</h3>
        <p>
          Buy and trade shares in World Cup teams. At the end, the shared pot is paid to the people holding shares in
          the winning team.
        </p>
      </section>

      <section className="panel rules-panel">
        <h3>2. Buying New Shares</h3>
        <ul>
          <li>When you buy new shares, your money goes straight into the shared pot.</li>
          <li>The app tells you how many shares each $1 buys in the current window.</li>
          <li>The starting buy is {currency(10)} and can be split across one or two teams only.</li>
          <li>New shares can only be bought in live teams.</li>
        </ul>
      </section>

      <section className="panel rules-panel">
        <h3>3. Buying Windows</h3>
        <p>The app moves buying windows automatically from official FIFA round-end times.</p>
        <div className="rules-stage-list">
          {stages.map((stage) => (
            <div key={stage.id}>
              <span>{stage.label}</span>
              <b>
                x{stage.multiplier} · {currency(stage.maxSpend)} max
              </b>
            </div>
          ))}
        </div>
      </section>

      <section className="panel rules-panel">
        <h3>4. Team Slots</h3>
        <ul>
          <li>Before knockouts, each player can hold up to two live teams.</li>
          <li>You may keep an open live-team slot before knockouts.</li>
          <li>After the group stage, unused live-team slots disappear.</li>
          <li>Eliminated teams stop counting as live-team slots, but their shares do not win the pot.</li>
        </ul>
      </section>

      <section className="panel rules-panel">
        <h3>5. Trading</h3>
        <ul>
          <li>Trades transfer existing shares. No new shares are created.</li>
          <li>Listed trade prices are the total amount paid by the buyer.</li>
          <li>
            {(TRADE_LEVY_RATE * 100).toFixed(1)}% of each trade goes into the pot; the seller gets{" "}
            {(100 - TRADE_LEVY_RATE * 100).toFixed(1)}% of the listed price.
          </li>
          <li>Players can post open offers or bid directly for another player’s shares.</li>
        </ul>
      </section>

      <section className="panel rules-panel">
        <h3>6. Selling Back To The Pot</h3>
        <ul>
          <li>You can surrender live-team shares to free a slot.</li>
          <li>
            The cost is {SELL_TO_POT_PENALTY_MULTIPLIER}x what those shares cost you. That money goes into the pot.
          </li>
          <li>This is intentionally expensive, so switching teams has a real cost.</li>
        </ul>
      </section>

      <section className="panel rules-panel">
        <h3>7. The $500 Limit</h3>
        <p>
          Each player can have at most {currency(EXPOSURE_CAP)} at risk. New buys, trades, and sell-back costs add to
          that amount. Money you receive from selling shares reduces it.
        </p>
      </section>

      <section className="panel rules-panel">
        <h3>8. End Of Game Money</h3>
        <p>
          At the end, the pot is split between the people holding shares in the winning team. Your final result is:
          winner payout plus share-sale money, minus what you spent on buys, trades, and sell-backs.
        </p>
      </section>

      <section className="panel rules-panel">
        <h3>9. Tournament Updates</h3>
        <ul>
          <li>Scores, fixtures, teams, and team status refresh automatically from the tournament feed.</li>
          <li>Buying windows auto-advance from the official schedule, with admin override available if needed.</li>
          <li>If the feed is wrong or delayed, the admin view can be used to correct the game state.</li>
        </ul>
      </section>
    </section>
  );
}

function Dashboard({
  state,
  holdings,
  revealIdentities,
  setRevealIdentities,
}: {
  state: GameState;
  holdings: Record<string, Record<string, number>>;
  revealIdentities: boolean;
  setRevealIdentities: (value: boolean) => void;
}) {
  const start = startingStatus(state);
  const liveTeams = state.teams.filter((team) => team.status === "live").length;
  const eliminatedTeams = state.teams.filter((team) => team.status === "eliminated").length;
  const winner = state.winnerTeamId ? getTeam(state, state.winnerTeamId) : undefined;

  return (
    <section className="content-grid dashboard-grid">
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Trader Holdings</h2>
            <p>{liveTeams} live teams, {eliminatedTeams} eliminated</p>
          </div>
          <button
            className="icon-button"
            onClick={() => setRevealIdentities(!revealIdentities)}
            title={revealIdentities ? "Hide real identities" : "Reveal real identities"}
            type="button"
          >
            {revealIdentities ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trader</th>
                <th>Live teams</th>
                <th>Holdings</th>
                <th>Limit used</th>
                <th>Starting buy</th>
              </tr>
            </thead>
            <tbody>
              {state.players.map((player) => {
                const totals = playerTotals(state, player.id);
                const slotLimit = liveTeamSlotLimit(state, player.id);
                const playerHoldings = holdings[player.id] ?? {};
                const liveHoldings = Object.entries(playerHoldings)
                  .filter(([teamId, shares]) => {
                    const team = getTeam(state, teamId);
                    return shares > 0 && (team?.status === "live" || team?.status === "winner");
                  })
                  .sort(([a], [b]) => (getTeam(state, a)?.name ?? "").localeCompare(getTeam(state, b)?.name ?? ""));

                return (
                  <tr key={player.id}>
                    <td>
                      <TraderName player={player} revealIdentities={revealIdentities} />
                    </td>
                    <td>
                      <StatusPill tone={totals.liveTeams <= slotLimit ? "good" : "bad"}>
                        {totals.liveTeams}/{slotLimit}
                      </StatusPill>
                    </td>
                    <td>
                      <div className="holding-list">
                        {liveHoldings.length === 0 && <span className="muted">No live shares</span>}
                        {liveHoldings.map(([teamId, shares]) => {
                          const team = getTeam(state, teamId);
                          return (
                            <span className="holding-chip" key={teamId}>
                              <TeamCode team={team} /> {team?.name}: {wholeNumber(shares)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <b>{currency(totals.exposure)}</b>
                      <small className="cell-note">{currency(totals.remainingExposure)} left</small>
                    </td>
                    <td>
                      <StatusPill tone={start[player.id]?.complete ? "good" : "warn"}>
                        {currency(start[player.id]?.spend ?? 0)} / $10
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Team Totals</h2>
            <p>Current share count</p>
          </div>
          {winner && (
            <StatusPill tone="gold">
              Winner: {winner.name}
            </StatusPill>
          )}
        </div>
        <TeamTotals state={state} holdings={holdings} />
      </section>
    </section>
  );
}

function Tournament({
  isAdmin,
  state,
  updateState,
}: {
  isAdmin: boolean;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const standings = groupStandings(state);
  const liveMatches = state.matches.filter((match) => match.status === "live");
  const recentMatches = state.matches
    .filter((match) => match.status === "full-time")
    .slice()
    .reverse()
    .slice(0, 8);
  const upcomingMatches = state.matches
    .filter((match) => match.status === "scheduled")
    .slice()
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
    .slice(0, 8);

  const sync = async () => {
    setSyncing(true);
    setSyncError("");

    try {
      const result = await fetchWorldCup26Feed(state.tournamentSync.endpoint || "https://worldcup26.ir");
      updateState((current) => applyTournamentSync(current, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tournament sync failed.";
      setSyncError(message);
      updateState((current) => ({
        ...current,
        tournamentSync: {
          ...current.tournamentSync,
          lastSyncError: message,
          lastSyncStatus: "Sync failed",
        },
      }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="content-grid tournament-grid">
      <section className="panel wide-panel tournament-summary-panel">
        <div className="panel-heading">
          <div>
            <h2>Tournament</h2>
            <p>Scores, fixtures, and standings</p>
          </div>
          <StatusPill tone={liveMatches.length > 0 ? "gold" : "good"}>
            {liveMatches.length > 0 ? `${liveMatches.length} live` : "Ready"}
          </StatusPill>
        </div>
        <div className="rule-strip">
          <RuleTile label="Live now" value={String(liveMatches.length)} />
          <RuleTile label="Next fixtures" value={String(upcomingMatches.length)} />
          <RuleTile label="Recent scores" value={String(recentMatches.length)} />
          <RuleTile label="Teams tracked" value={String(state.teams.length)} />
        </div>
        <div className="tournament-summary-actions">
          <small>
            {state.tournamentSync.lastSyncedAt
              ? `Updated ${new Date(state.tournamentSync.lastSyncedAt).toLocaleTimeString()}`
              : "Scores update automatically"}
          </small>
          {isAdmin && (
            <button className="ghost-button" type="button" onClick={sync} disabled={syncing}>
              <RefreshCcw size={18} /> {syncing ? "Refreshing" : "Refresh Scores"}
            </button>
          )}
        </div>
        {(syncError || state.tournamentSync.lastSyncError) && (
          <ValidationList errors={[syncError || state.tournamentSync.lastSyncError || "Sync failed"]} />
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Live Now</h2>
            <p>In-play matches</p>
          </div>
        </div>
        <MatchList state={state} matches={liveMatches} emptyText="No live matches right now." />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Next Matches</h2>
            <p>Upcoming fixtures</p>
          </div>
        </div>
        <MatchList state={state} matches={upcomingMatches} emptyText="No upcoming fixtures loaded." />
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent Scores</h2>
            <p>Latest completed games</p>
          </div>
        </div>
        <MatchList state={state} matches={recentMatches} emptyText="No scores loaded yet." />
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Group Standings</h2>
            <p>Calculated from completed group matches</p>
          </div>
        </div>
        <div className="standings-grid">
          {Object.entries(standings).map(([group, rows]) => (
            <div className="standing-card" key={group}>
              <h3>Group {group}</h3>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>P</th>
                    <th>GD</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const team = getTeam(state, row.teamId);
                    return (
                      <tr key={row.teamId}>
                        <td>
                          <TeamCode team={team} /> {team?.name}
                        </td>
                        <td>{row.played}</td>
                        <td>{row.goalDifference}</td>
                        <td>
                          <b>{row.points}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function BuyShares({
  currentPlayerId,
  state,
  updateState,
}: {
  currentPlayerId: string;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const [playerId, setPlayerId] = useState(currentPlayerId || state.players[0]?.id || "");
  const [teamId, setTeamId] = useState(state.teams.find((team) => team.status === "live")?.id ?? "");
  const [spend, setSpend] = useState("10");
  const [errors, setErrors] = useState<string[]>([]);
  const stage = getStage(state.stageId);
  const selectedSpend = Number(spend);
  const shares = Number.isFinite(selectedSpend) ? selectedSpend * stage.multiplier : 0;
  const selectedPlayer = getPlayer(state, playerId);
  const totals = playerId ? playerTotals(state, playerId) : undefined;
  const used = playerId ? stageSpend(state, playerId, state.stageId) : 0;
  const capacity = playerId ? buyCapacityForTeam(state, playerId, teamId) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { playerId, teamId, spend: Number(spend) };
    const validation = validateBuy(state, input);
    setErrors(validation);
    if (validation.length > 0) return;

    updateState((current) => ({ ...current, buys: [...current.buys, makeBuy(current, input)] }));
    setErrors([]);
  };

  return (
    <section className="content-grid buy-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Buy New Shares</h2>
            <p>{stage.label}</p>
          </div>
          <StatusPill tone="gold">
            x{stage.multiplier}
            <InfoTooltip text="$10 at x48 creates 480 shares. Later rounds give fewer shares per $1." />
          </StatusPill>
        </div>

        <form className="form-stack" onSubmit={submit}>
          <label>
            Trader
            <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
              {state.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.alias}
                </option>
              ))}
            </select>
          </label>

          <label>
            Team
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              {state.teams
                .filter((team) => team.status === "live" || team.status === "winner")
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    Group {team.group} - {team.name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Spend
            <input
              min="1"
              step="1"
              type="number"
              value={spend}
              onChange={(event) => setSpend(event.target.value)}
            />
          </label>

          <div className="preview-bar">
            <span>
              Creates <b>{wholeNumber(Math.max(shares, 0))}</b> shares
            </span>
            <span>
              This window left <b>{currency(stage.maxSpend - used)}</b>
            </span>
            {capacity && (
              <span>
                Team slots <b>{capacity.liveTeamSlotsUsed}/{capacity.liveTeamSlotLimit}</b>
              </span>
            )}
          </div>

          {capacity && (
            <div className="limit-panel">
              <div className="limit-header">
                <b>Available now: {currency(capacity.maxSpend)}</b>
                <button
                  className="text-button"
                  disabled={capacity.maxSpend <= 0}
                  type="button"
                  onClick={() => setSpend(String(Math.max(capacity.maxSpend, 1)))}
                >
                  Use max
                </button>
              </div>
              <LimitBar label="This window left" max={stage.maxSpend} value={capacity.stageRoom} />
              <LimitBar label="$500 limit left" max={EXPOSURE_CAP} value={capacity.exposureRoom} />
              <div className="preview-bar compact-preview">
                <span>Live-team limit</span>
                <b>{capacity.liveTeamSlotsUsed}/{capacity.liveTeamSlotLimit}</b>
              </div>
              {capacity.blockedReason && <ValidationList errors={[capacity.blockedReason]} />}
            </div>
          )}

          <ValidationList errors={errors} />

          <button className="primary-button" type="submit">
            <Plus size={18} /> Record Buy
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your Money</h2>
            <p>{selectedPlayer?.alias ?? "Select trader"}</p>
          </div>
          <StatusPill tone={(totals?.remainingExposure ?? 0) >= 0 ? "good" : "bad"}>
            {currency(totals?.remainingExposure ?? EXPOSURE_CAP)} left
          </StatusPill>
        </div>
        <LedgerSummary state={state} playerId={playerId} />
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent Buys</h2>
            <p>Latest first</p>
          </div>
        </div>
        <ActivityTable state={state} buys={state.buys.slice().reverse().slice(0, 12)} />
      </section>
    </section>
  );
}

function MarketBoard({
  currentPlayerId,
  state,
  updateState,
}: {
  currentPlayerId: string;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string[]>>({});
  const [targetPlayerId, setTargetPlayerId] = useState<string | "open">("open");
  const [makerOffersTeamId, setMakerOffersTeamId] = useState("");
  const [makerOffersShares, setMakerOffersShares] = useState("");
  const [makerRequestsTeamId, setMakerRequestsTeamId] = useState("");
  const [makerRequestsShares, setMakerRequestsShares] = useState("");
  const [makerOffersMoney, setMakerOffersMoney] = useState("0");
  const [makerRequestsMoney, setMakerRequestsMoney] = useState("0");
  const [note, setNote] = useState("");

  const liveTeams = state.teams.filter((team) => team.status === "live" || team.status === "winner");

  const createOffer = (event: FormEvent) => {
    event.preventDefault();
    const offerShape = {
      makerId: currentPlayerId,
      targetPlayerId,
      makerOffersShares: parseLeg(makerOffersTeamId, makerOffersShares),
      makerRequestsShares: parseLeg(makerRequestsTeamId, makerRequestsShares),
      makerOffersMoney: Number(makerOffersMoney),
      makerRequestsMoney: Number(makerRequestsMoney),
      note,
      resolvedAt: undefined,
      resolvedByPlayerId: undefined,
    };
    const validation = validateOfferCreation(state, offerShape);
    setErrors(validation);
    if (validation.length > 0) return;

    const newOffer: TradeOffer = {
      ...offerShape,
      id: nowId("offer"),
      status: "open",
      createdAt: new Date().toISOString(),
    };

    updateState((current) => ({ ...current, offers: [newOffer, ...current.offers] }));
    setErrors([]);
    setMakerOffersTeamId("");
    setMakerOffersShares("");
    setMakerRequestsTeamId("");
    setMakerRequestsShares("");
    setMakerOffersMoney("0");
    setMakerRequestsMoney("0");
    setNote("");
  };

  const acceptOffer = (offer: TradeOffer, counterpartyId: string) => {
    const validation = validateTradeAcceptance(state, offer, counterpartyId);
    setAcceptErrors((current) => ({ ...current, [offer.id]: validation }));
    if (validation.length > 0) return;

    updateState((current) => ({
      ...current,
      offers: current.offers.map((item) =>
        item.id === offer.id
          ? {
              ...item,
              status: "accepted",
              resolvedAt: new Date().toISOString(),
              resolvedByPlayerId: counterpartyId,
            }
          : item,
      ),
      trades: [...current.trades, completeTrade(offer, counterpartyId)],
    }));
  };

  const rejectOffer = (offer: TradeOffer) => {
    updateState((current) => ({
      ...current,
      offers: current.offers.map((item) =>
        item.id === offer.id
          ? { ...item, status: "rejected", resolvedAt: new Date().toISOString() }
          : item,
      ),
    }));
  };

  return (
    <section className="content-grid market-grid">
      <section className="panel market-map-panel">
        <div className="panel-heading">
          <div>
            <h2>Share Map</h2>
            <p>Who owns what right now</p>
          </div>
          <StatusPill tone="gold">{state.trades.length} trades</StatusPill>
        </div>
        <MarketOwnershipOverview state={state} />
      </section>

      <section className="panel market-bid-panel">
        <BidForSharesPanel currentPlayerId={currentPlayerId} state={state} updateState={updateState} />
      </section>

      <section className="panel market-offer-panel">
        <div className="panel-heading">
          <div>
            <h2>Post Your Offer</h2>
            <p>Offer terms</p>
          </div>
        </div>

        <form className="form-stack" onSubmit={createOffer}>
          <label>
            Who can accept?
            <select
              value={targetPlayerId}
              onChange={(event) => setTargetPlayerId(event.target.value)}
            >
              <option value="open">Anyone</option>
              {state.players
                .filter((player) => player.id !== currentPlayerId)
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.alias}
                  </option>
                ))}
            </select>
          </label>

          <fieldset>
            <legend>You offer</legend>
            <div className="form-row">
              <select
                value={makerOffersTeamId}
                onChange={(event) => setMakerOffersTeamId(event.target.value)}
              >
                <option value="">No shares</option>
                {liveTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                min="1"
                placeholder="Shares"
                step="1"
                type="number"
                value={makerOffersShares}
                onChange={(event) => setMakerOffersShares(event.target.value)}
              />
            </div>
            <input
              min="0"
              step="1"
              type="number"
              value={makerOffersMoney}
              onChange={(event) => setMakerOffersMoney(event.target.value)}
              aria-label="Money offered"
            />
          </fieldset>

          <fieldset>
            <legend>You want</legend>
            <div className="form-row">
              <select
                value={makerRequestsTeamId}
                onChange={(event) => setMakerRequestsTeamId(event.target.value)}
              >
                <option value="">No shares</option>
                {liveTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                min="1"
                placeholder="Shares"
                step="1"
                type="number"
                value={makerRequestsShares}
                onChange={(event) => setMakerRequestsShares(event.target.value)}
              />
            </div>
            <input
              min="0"
              step="1"
              type="number"
              value={makerRequestsMoney}
              onChange={(event) => setMakerRequestsMoney(event.target.value)}
              aria-label="Money requested"
            />
          </fieldset>

          <label>
            Note
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          <ValidationList errors={errors} />

          <button className="primary-button" type="submit">
            <Save size={18} /> Post Offer
          </button>
        </form>
      </section>

      <section className="panel market-pot-panel">
        <SellToPotPanel currentPlayerId={currentPlayerId} state={state} updateState={updateState} />
      </section>

      <section className="panel wide-panel market-offers-panel">
        <div className="panel-heading">
          <div>
            <h2>Open Market</h2>
            <p>
              {state.offers.filter((offer) => offer.status === "open").length} active offers · The listed price is
              the buyer's full price.
            </p>
          </div>
        </div>
        <div className="offer-list">
          {state.offers.filter((offer) => offer.status === "open").length === 0 && (
            <div className="empty-state">No open offers.</div>
          )}
          {state.offers
            .filter((offer) => offer.status === "open")
            .map((offer) => (
              <OfferCard
                acceptErrors={acceptErrors[offer.id] ?? []}
                currentPlayerId={currentPlayerId}
                key={offer.id}
                offer={offer}
                state={state}
                onAccept={acceptOffer}
                onReject={rejectOffer}
              />
            ))}
        </div>
      </section>

      <section className="panel wide-panel market-history-panel">
        <div className="panel-heading">
          <div>
            <h2>Completed Trades</h2>
            <p>Finished player-to-player deals</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Shares</th>
                <th>Buyer paid</th>
                <th>Went to pot</th>
                <th>Seller got</th>
              </tr>
            </thead>
            <tbody>
              {state.trades
                .slice()
                .reverse()
                .flatMap((trade) =>
                  completedTradeMoneyLegs(trade).map((leg, index) => {
                    const team = getTeam(state, leg.teamId);
                    return (
                      <tr key={`${trade.id}-${index}`}>
                        <td>{new Date(leg.completedAt).toLocaleString()}</td>
                        <td>{getPlayer(state, leg.buyerId)?.alias}</td>
                        <td>{getPlayer(state, leg.sellerId)?.alias}</td>
                        <td>
                          {wholeNumber(leg.sharesTransferred)} {team?.name}
                        </td>
                        <td>{currencyFromCents(leg.grossTradePrice)}</td>
                        <td>{currencyFromCents(leg.tradeLevy)}</td>
                        <td>{currencyFromCents(leg.sellerProceeds)}</td>
                      </tr>
                    );
                  }),
                )}
              {state.trades.length === 0 && (
                <tr>
                  <td colSpan={7}>No completed trades.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wide-panel market-history-panel">
        <div className="panel-heading">
          <div>
            <h2>Pot Sales</h2>
            <p>Shares sold back to free a slot</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Trader</th>
                <th>Team</th>
                <th>Shares</th>
                <th>Original cost</th>
                <th>Paid to pot</th>
              </tr>
            </thead>
            <tbody>
              {(state.potSales ?? [])
                .slice()
                .reverse()
                .map((sale) => (
                  <tr key={sale.id}>
                    <td>{new Date(sale.createdAt).toLocaleString()}</td>
                    <td>{getPlayer(state, sale.playerId)?.alias}</td>
                    <td>{getTeam(state, sale.teamId)?.name}</td>
                    <td>{wholeNumber(sale.shares)}</td>
                    <td>{currencyFromCents(sale.costBasis)}</td>
                    <td>{currencyFromCents(sale.penalty)}</td>
                  </tr>
                ))}
              {(state.potSales ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>No shares have been sold to the pot.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function MarketOwnershipOverview({ state }: { state: GameState }) {
  const holdings = computeHoldings(state);
  const teamRows = state.teams
    .map((team) => {
      const owners = state.players
        .map((player, index) => ({
          color: ownerColor(index),
          player,
          shares: Math.max(holdings[player.id]?.[team.id] ?? 0, 0),
        }))
        .filter((owner) => owner.shares > 0)
        .sort((left, right) => right.shares - left.shares || left.player.alias.localeCompare(right.player.alias));
      const totalShares = owners.reduce((sum, owner) => sum + owner.shares, 0);

      return { owners, team, totalShares };
    })
    .filter((row) => row.totalShares > 0)
    .sort((left, right) => right.totalShares - left.totalShares || left.team.name.localeCompare(right.team.name));
  const playerRows = state.players
    .map((player) => {
      const ownedTeams = Object.entries(holdings[player.id] ?? {})
        .filter(([, shares]) => shares > 0)
        .map(([teamId, shares]) => ({ shares, team: getTeam(state, teamId) }))
        .filter((row): row is { shares: number; team: Team } => Boolean(row.team))
        .sort((left, right) => right.shares - left.shares || left.team.name.localeCompare(right.team.name));

      return {
        ownedTeams,
        player,
        totalShares: ownedTeams.reduce((sum, row) => sum + row.shares, 0),
      };
    })
    .filter((row) => row.totalShares > 0)
    .sort((left, right) => right.totalShares - left.totalShares || left.player.alias.localeCompare(right.player.alias));

  if (teamRows.length === 0) {
    return <div className="empty-state compact">No shares have been bought yet.</div>;
  }

  return (
    <div className="market-overview-grid">
      <div className="ownership-section">
        <h3>Share Distribution</h3>
        <div className="distribution-list">
          {teamRows.map(({ owners, team, totalShares }) => (
            <article className="distribution-card" key={team.id}>
              <div className="distribution-head">
                <span>
                  <TeamCode team={team} /> {team.name}
                </span>
                <b>{wholeNumber(totalShares)}</b>
              </div>
              <div className="distribution-bar" aria-label={`${team.name} share distribution`}>
                {owners.map((owner) => (
                  <span
                    key={owner.player.id}
                    style={{
                      backgroundColor: owner.color,
                      width: `${Math.max((owner.shares / totalShares) * 100, 4)}%`,
                    }}
                    title={`${owner.player.alias}: ${wholeNumber(owner.shares)} shares`}
                  />
                ))}
              </div>
              <div className="owner-chip-list">
                {owners.map((owner) => (
                  <span className="owner-chip" key={owner.player.id}>
                    <i style={{ backgroundColor: owner.color }} />
                    {owner.player.alias} · {wholeNumber(owner.shares)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="ownership-section">
        <h3>Player Holdings</h3>
        <div className="player-holding-list">
          {playerRows.map(({ ownedTeams, player, totalShares }) => (
            <article className="player-holding-card" key={player.id}>
              <div>
                <b>{player.alias}</b>
                <small>{wholeNumber(totalShares)} total shares</small>
              </div>
              <div className="holding-list">
                {ownedTeams.map(({ shares, team }) => (
                  <span className="holding-chip" key={team.id}>
                    <TeamCode team={team} /> {wholeNumber(shares)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function BidForSharesPanel({
  currentPlayerId,
  state,
  updateState,
}: {
  currentPlayerId: string;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const holdings = computeHoldings(state);
  const currentPlayer = getPlayer(state, currentPlayerId);
  const bidTargets = useMemo(
    () =>
      state.players
        .filter((player) => player.id !== currentPlayerId)
        .map((player) => {
          const ownedTeams = Object.entries(holdings[player.id] ?? {})
            .filter(([teamId, shares]) => {
              const team = getTeam(state, teamId);
              return shares > 0 && (team?.status === "live" || team?.status === "winner");
            })
            .sort(([leftTeamId], [rightTeamId]) =>
              (getTeam(state, leftTeamId)?.name ?? "").localeCompare(getTeam(state, rightTeamId)?.name ?? ""),
            );

          return { ownedTeams, player };
        })
        .filter((target) => target.ownedTeams.length > 0),
    [currentPlayerId, holdings, state],
  );
  const [targetPlayerId, setTargetPlayerId] = useState(bidTargets[0]?.player.id ?? "");
  const target = bidTargets.find((candidate) => candidate.player.id === targetPlayerId);
  const [teamId, setTeamId] = useState(target?.ownedTeams[0]?.[0] ?? "");
  const [shares, setShares] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const selectedShares = Number(shares);
  const selectedPrice = Number(bidPrice);
  const ownedShares = target ? target.ownedTeams.find(([candidateTeamId]) => candidateTeamId === teamId)?.[1] ?? 0 : 0;
  const bidOffer: TradeOffer | undefined =
    targetPlayerId && teamId && Number.isInteger(selectedShares) && selectedShares > 0 && Number.isInteger(selectedPrice)
      ? {
          id: "bid-preview",
          makerId: currentPlayerId,
          targetPlayerId,
          makerOffersShares: [],
          makerRequestsShares: [{ teamId, shares: selectedShares }],
          makerOffersMoney: selectedPrice,
          makerRequestsMoney: 0,
          note: "",
          status: "open",
          createdAt: new Date().toISOString(),
        }
      : undefined;
  const preview = bidOffer ? tradePreview(state, bidOffer, targetPlayerId) : undefined;

  useEffect(() => {
    if (target) return;
    setTargetPlayerId(bidTargets[0]?.player.id ?? "");
  }, [bidTargets, target]);

  useEffect(() => {
    if (target?.ownedTeams.some(([candidateTeamId]) => candidateTeamId === teamId)) return;
    setTeamId(target?.ownedTeams[0]?.[0] ?? "");
    setShares("");
  }, [target, teamId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const shareCount = Number(shares);
    const price = Number(bidPrice);
    const offerShape = {
      makerId: currentPlayerId,
      targetPlayerId,
      makerOffersShares: [],
      makerRequestsShares: parseLeg(teamId, shares),
      makerOffersMoney: price,
      makerRequestsMoney: 0,
      note: `Bid from ${currentPlayer?.alias ?? "trader"}`,
      resolvedAt: undefined,
      resolvedByPlayerId: undefined,
    };
    const validation = [
      ...validateOfferCreation(state, offerShape),
      ...(!targetPlayerId ? ["Choose whose shares you want to bid for."] : []),
      ...(!Number.isInteger(price) || price <= 0 ? ["Bid price must be a positive whole dollar amount."] : []),
      ...(Number.isInteger(shareCount) && shareCount > ownedShares
        ? [`${target?.player.alias ?? "That trader"} only holds ${wholeNumber(ownedShares)} shares of this team.`]
        : []),
    ];
    setErrors(validation);
    if (validation.length > 0) return;

    const newOffer: TradeOffer = {
      ...offerShape,
      id: nowId("offer"),
      status: "open",
      createdAt: new Date().toISOString(),
    };

    updateState((current) => ({ ...current, offers: [newOffer, ...current.offers] }));
    setErrors([]);
    setShares("");
    setBidPrice("");
  };

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Bid For Shares</h2>
          <p>Ask an owner to sell</p>
        </div>
        <StatusPill tone="gold">Directed bid</StatusPill>
      </div>

      <form className="form-stack" onSubmit={submit}>
        <label>
          Owner
          <select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value)}>
            {bidTargets.length === 0 && <option value="">No owned shares yet</option>}
            {bidTargets.map(({ player }) => (
              <option key={player.id} value={player.id}>
                {player.alias}
              </option>
            ))}
          </select>
        </label>

        <label>
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            {target?.ownedTeams.map(([candidateTeamId, candidateShares]) => {
              const team = getTeam(state, candidateTeamId);
              return (
                <option key={candidateTeamId} value={candidateTeamId}>
                  {team?.name} · {wholeNumber(candidateShares)} shares
                </option>
              );
            })}
          </select>
        </label>

        <div className="form-row">
          <label>
            Shares
            <input
              min="1"
              step="1"
              type="number"
              value={shares}
              onChange={(event) => setShares(event.target.value)}
            />
          </label>
          <label>
            Bid price
            <input
              min="1"
              step="1"
              type="number"
              value={bidPrice}
              onChange={(event) => setBidPrice(event.target.value)}
            />
          </label>
        </div>

        <div className="preview-bar">
          <span>
            Owner holds <b>{wholeNumber(ownedShares)}</b>
          </span>
          <button
            className="text-button"
            disabled={ownedShares <= 0}
            type="button"
            onClick={() => setShares(String(ownedShares))}
          >
            Use max
          </button>
        </div>

        {preview && preview.moneyLegs.length > 0 && (
          <div className="trade-preview">
            {preview.moneyLegs.map((leg) => (
              <div className="trade-preview-grid" key={`${leg.buyerId}-${leg.sellerId}-${leg.teamId}`}>
                <span>You bid</span>
                <b>{currencyFromCents(leg.grossTradePrice)}</b>
                <span>Goes to pot if accepted</span>
                <b>{currencyFromCents(leg.tradeLevy)}</b>
                <span>Owner receives</span>
                <b>{currencyFromCents(leg.sellerProceeds)}</b>
                <span>You receive</span>
                <b>{wholeNumber(leg.sharesTransferred)} shares</b>
                <span>Your limit used after</span>
                <b>{currency(preview.exposureAfterByPlayerId[currentPlayerId] ?? 0)} / {currency(EXPOSURE_CAP)}</b>
              </div>
            ))}
          </div>
        )}

        <ValidationList errors={errors} />

        <button className="primary-button" type="submit" disabled={bidTargets.length === 0}>
          <CircleDollarSign size={18} /> Post Bid
        </button>
      </form>
    </>
  );
}

function ownerColor(index: number): string {
  const colors = ["#1f8a61", "#244c9a", "#b45309", "#7c3aed", "#b42318", "#0f766e", "#6d5b2f", "#475569"];
  return colors[index % colors.length];
}

function SellToPotPanel({
  currentPlayerId,
  state,
  updateState,
}: {
  currentPlayerId: string;
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const holdings = computeHoldings(state)[currentPlayerId] ?? {};
  const sellableTeams = Object.entries(holdings)
    .filter(([teamId, shares]) => {
      const team = getTeam(state, teamId);
      return shares > 0 && (team?.status === "live" || team?.status === "winner");
    })
    .sort(([leftTeamId], [rightTeamId]) =>
      (getTeam(state, leftTeamId)?.name ?? "").localeCompare(getTeam(state, rightTeamId)?.name ?? ""),
    );
  const [teamId, setTeamId] = useState(sellableTeams[0]?.[0] ?? "");
  const [shares, setShares] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const selectedShares = Number(shares);
  const ownedShares = holdings[teamId] ?? 0;
  const preview =
    currentPlayerId && teamId && Number.isInteger(selectedShares) && selectedShares > 0
      ? potSalePreview(state, { playerId: currentPlayerId, teamId, shares: selectedShares })
      : undefined;

  useEffect(() => {
    if (sellableTeams.some(([candidateTeamId]) => candidateTeamId === teamId)) return;
    setTeamId(sellableTeams[0]?.[0] ?? "");
    setShares("");
  }, [sellableTeams, teamId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { playerId: currentPlayerId, teamId, shares: Number(shares) };
    const validation = validatePotSale(state, input);
    setErrors(validation);
    if (validation.length > 0) return;

    updateState((current) => ({
      ...current,
      potSales: [...(current.potSales ?? []), makePotSale(current, input)],
    }));
    setErrors([]);
    setShares("");
  };

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Sell To Pot</h2>
          <p>Costs {SELL_TO_POT_PENALTY_MULTIPLIER}x what you paid</p>
        </div>
        <StatusPill tone="warn">Penalty exit</StatusPill>
      </div>

      <form className="form-stack" onSubmit={submit}>
        <label>
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            {sellableTeams.length === 0 && <option value="">No live shares</option>}
            {sellableTeams.map(([candidateTeamId, candidateShares]) => {
              const team = getTeam(state, candidateTeamId);
              return (
                <option key={candidateTeamId} value={candidateTeamId}>
                  {team?.name} - {wholeNumber(candidateShares)} shares
                </option>
              );
            })}
          </select>
        </label>

        <label>
          Shares to surrender
          <input
            min="1"
            step="1"
            type="number"
            value={shares}
            onChange={(event) => setShares(event.target.value)}
          />
        </label>

        <div className="preview-bar">
          <span>
            Held <b>{wholeNumber(ownedShares)}</b>
          </span>
          <button
            className="text-button"
            disabled={ownedShares <= 0}
            type="button"
            onClick={() => setShares(String(ownedShares))}
          >
            Use max
          </button>
        </div>

        {preview && (
          <div className="trade-preview">
            <div className="trade-preview-grid">
              <span>Shares surrendered</span>
              <b>{wholeNumber(selectedShares)}</b>
              <span>Original cost</span>
              <b>{currencyFromCents(preview.costBasis)}</b>
              <span>Paid to pot</span>
              <b>{currencyFromCents(preview.penalty)}</b>
              <span>Pot after sale</span>
              <b>{currency(preview.potAfterSale)}</b>
              <span>Your limit used after sale</span>
              <b>{currency(preview.exposureAfterSale)} / {currency(EXPOSURE_CAP)}</b>
              <span>Shares left</span>
              <b>{wholeNumber(Math.max(ownedShares - selectedShares, 0))}</b>
            </div>
          </div>
        )}

        <ValidationList errors={errors} />

        <button className="primary-button" type="submit" disabled={sellableTeams.length === 0}>
          <Landmark size={18} /> Sell To Pot
        </button>
      </form>
    </>
  );
}

function OfferCard({
  state,
  offer,
  currentPlayerId,
  onAccept,
  onReject,
  acceptErrors,
}: {
  state: GameState;
  offer: TradeOffer;
  currentPlayerId: string;
  onAccept: (offer: TradeOffer, counterpartyId: string) => void;
  onReject: (offer: TradeOffer) => void;
  acceptErrors: string[];
}) {
  const maker = getPlayer(state, offer.makerId);
  const target =
    offer.targetPlayerId === "open" ? "Anyone can accept" : getPlayer(state, offer.targetPlayerId)?.alias;
  const canAccept =
    currentPlayerId !== offer.makerId &&
    (offer.targetPlayerId === "open" || offer.targetPlayerId === currentPlayerId);
  const canReject = currentPlayerId === offer.makerId || offer.targetPlayerId === currentPlayerId;
  const preview = canAccept ? tradePreview(state, offer, currentPlayerId) : undefined;

  return (
    <article className="offer-card">
      <div className="offer-main">
        <div>
          <b>{maker?.alias}</b>
          <small>{target}</small>
        </div>
        <p>{describeOffer(state, offer)}</p>
        <small className="cell-note">
          The shown price is the buyer's full price. Seller gets{" "}
          {(100 - TRADE_LEVY_RATE * 100).toFixed(1)}%; {(TRADE_LEVY_RATE * 100).toFixed(1)}% goes to the pot.
        </small>
        {offer.note && <small className="cell-note">{offer.note}</small>}
        {preview && preview.moneyLegs.length > 0 && (
          <div className="trade-preview">
            {preview.moneyLegs.map((leg) => {
              const buyer = getPlayer(state, leg.buyerId);
              const seller = getPlayer(state, leg.sellerId);
              const team = getTeam(state, leg.teamId);
              const buyerExposure = preview.exposureAfterByPlayerId[leg.buyerId] ?? 0;
              const sellerExposure = preview.exposureAfterByPlayerId[leg.sellerId] ?? 0;

              return (
                <div className="trade-preview-grid" key={`${leg.buyerId}-${leg.sellerId}-${leg.teamId}`}>
                  <span>Total price</span>
                  <b>{currencyFromCents(leg.grossTradePrice)}</b>
                  <span>Goes to pot</span>
                  <b>{currencyFromCents(leg.tradeLevy)}</b>
                  <span>Seller receives</span>
                  <b>{currencyFromCents(leg.sellerProceeds)}</b>
                  <span>Buyer pays</span>
                  <b>{currencyFromCents(leg.grossTradePrice)}</b>
                  <span>Buyer receives</span>
                  <b>
                    {wholeNumber(leg.sharesTransferred)} {team?.name ?? "shares"}
                  </b>
                  <span>Pot after trade</span>
                  <b>{currency(preview.potAfterTrade)}</b>
                  <span>{buyer?.alias ?? "Buyer"} limit used</span>
                  <b>{currency(buyerExposure)} / {currency(EXPOSURE_CAP)}</b>
                  <span>{seller?.alias ?? "Seller"} limit used</span>
                  <b>{currency(sellerExposure)} / {currency(EXPOSURE_CAP)}</b>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="offer-actions">
        {canAccept && (
          <button className="secondary-button" type="button" onClick={() => onAccept(offer, currentPlayerId)}>
            <Check size={16} /> Accept
          </button>
        )}
        {canReject && (
          <button className="ghost-button" type="button" onClick={() => onReject(offer)}>
            <X size={16} /> {currentPlayerId === offer.makerId ? "Cancel" : "Reject"}
          </button>
        )}
        {!canAccept && !canReject && (
          <span className="muted">
            {offer.targetPlayerId === "open" ? "Waiting for another player." : `Waiting for ${target}.`}
          </span>
        )}
      </div>
      <ValidationList errors={acceptErrors} />
    </article>
  );
}

function Settlement({
  state,
  updateState,
}: {
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const rows = settlementRows(state);
  const winner = state.winnerTeamId ? getTeam(state, state.winnerTeamId) : undefined;
  const totalWinnerShares = rows.reduce((sum, row) => sum + row.winnerShares, 0);

  return (
    <section className="content-grid settlement-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Winner</h2>
            <p>Choose who won</p>
          </div>
          {winner && <StatusPill tone="gold">{winner.name}</StatusPill>}
        </div>
        <label className="form-stack">
          Winning team
          <select
            value={state.winnerTeamId}
            onChange={(event) => {
              const winnerTeamId = event.target.value;
              updateState((current) => ({
                ...current,
                winnerTeamId,
                teams: current.teams.map((team) => ({
                  ...team,
                  status:
                    winnerTeamId && team.id === winnerTeamId
                      ? "winner"
                      : team.status === "winner"
                        ? "live"
                        : team.status,
                })),
              }));
            }}
          >
            <option value="">No winner selected</option>
            {state.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <div className="settlement-callout">
          <b>{currency(potSize(state))}</b>
          <span>{totalWinnerShares > 0 ? `${wholeNumber(totalWinnerShares)} winner shares` : "Family fund if no shareholder"}</span>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Final Money Result</h2>
            <p>Winner payout plus sale money, minus what each player spent</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trader</th>
                <th>Winner shares</th>
                <th>Winner payout</th>
                <th>Money from sales</th>
                <th>New shares bought</th>
                <th>Trades bought</th>
                <th>Sold back to pot</th>
                <th>Final result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const player = getPlayer(state, row.playerId);
                return (
                  <tr key={row.playerId}>
                    <td>{player?.alias}</td>
                    <td>{wholeNumber(row.winnerShares)}</td>
                    <td>{currency(row.potPayout)}</td>
                    <td>{currency(row.tradeSales)}</td>
                    <td>{currency(row.newBuys)}</td>
                    <td>{currency(row.tradePurchases)}</td>
                    <td>{currency(row.potSalePenalties)}</td>
                    <td>
                      <b className={row.finalNet >= 0 ? "positive" : "negative"}>
                        {currency(row.finalNet)}
                      </b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Admin({
  state,
  updateState,
}: {
  state: GameState;
  updateState: (updater: (state: GameState) => GameState) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamGroup, setTeamGroup] = useState("A");
  const baseLink = `${window.location.origin}${window.location.pathname}`;
  const joinLink = `${baseLink}?join=${state.joinCode}`;
  const adminLink = `${baseLink}?admin=1`;

  const addTeam = (event: FormEvent) => {
    event.preventDefault();
    if (!teamName.trim()) return;

    const name = teamName.trim();
    const newTeam: Team = {
      id: slugify(name) || nowId("team"),
      name,
      code: teamCode.trim().toUpperCase().slice(0, 4) || name.slice(0, 3).toUpperCase(),
      group: teamGroup.trim().toUpperCase().slice(0, 2) || "-",
      status: "live",
    };

    updateState((current) => ({ ...current, teams: [...current.teams, newTeam] }));
    setTeamName("");
    setTeamCode("");
  };

  const updateTeamStatus = (teamId: string, status: TeamStatus) => {
    updateState((current) => ({
      ...current,
      winnerTeamId: status === "winner" ? teamId : current.winnerTeamId === teamId ? "" : current.winnerTeamId,
      teams: current.teams.map((team) =>
        team.id === teamId
          ? { ...team, status }
          : status === "winner" && team.status === "winner"
            ? { ...team, status: "live" }
            : team,
      ),
    }));
  };

  const resetGame = () => {
    updateState(() => createInitialGameState());
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "family-world-cup-share-market.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="content-grid admin-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Game Control</h2>
            <p>Current buying window</p>
          </div>
        </div>
        <div className="form-stack">
          <label className="checkbox-row">
            <input
              checked={state.tournamentSync.autoStageEnabled}
              type="checkbox"
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  tournamentSync: {
                    ...current.tournamentSync,
                    autoStageEnabled: event.target.checked,
                  },
                }))
              }
            />
            Auto-advance buying window from official round end times
          </label>
          <label>
            Stage
            <select
              disabled={state.tournamentSync.autoStageEnabled}
              value={state.stageId}
              onChange={(event) =>
                updateState((current) =>
                  setGameStage(
                    {
                      ...current,
                      tournamentSync: {
                        ...current.tournamentSync,
                        autoStageEnabled: false,
                      },
                    },
                    event.target.value as StageId,
                  ),
                )
              }
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label} - x{stage.multiplier} - {currency(stage.maxSpend)}
                </option>
              ))}
            </select>
          </label>
          <div className="schedule-note">
            <b>{state.tournamentSync.autoStageEnabled ? "Automatic schedule is on" : "Manual stage override is on"}</b>
            <span>
              Next automated cutoffs:{" "}
              {officialStageCutoffs
                .filter((cutoff) => new Date(cutoff.startsAt).getTime() > Date.now())
                .slice(0, 2)
                .map((cutoff) => `${cutoff.label} ${new Date(cutoff.startsAt).toLocaleString()}`)
                .join(" · ") || "No more market cutoffs."}
            </span>
          </div>
          <label>
            Tournament feed
            <input
              value={state.tournamentSync.endpoint}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  tournamentSync: {
                    ...current.tournamentSync,
                    provider: "custom-json",
                    endpoint: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Auto refresh seconds
            <input
              min="30"
              step="30"
              type="number"
              value={state.tournamentSync.autoRefreshSeconds}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  tournamentSync: {
                    ...current.tournamentSync,
                    autoRefreshSeconds: Math.max(Number(event.target.value) || 120, 30),
                  },
                }))
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              checked={state.tournamentSync.autoRefreshEnabled}
              type="checkbox"
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  tournamentSync: {
                    ...current.tournamentSync,
                    autoRefreshEnabled: event.target.checked,
                  },
                }))
              }
            />
            Auto refresh scores
          </label>
          <button className="secondary-button" type="button" onClick={exportJson}>
            <Save size={18} /> Export JSON
          </button>
          <button className="ghost-button danger" type="button" onClick={resetGame}>
            <RefreshCcw size={18} /> Reset Prototype
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Private Links</h2>
            <p>Share only the family link</p>
          </div>
        </div>
        <div className="form-stack">
          <label>
            Join code
            <input
              value={state.joinCode}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  joinCode: event.target.value.trim() || "FAMILY-2026",
                }))
              }
            />
          </label>
          <small className="field-note">Family join link</small>
          <code className="invite-code full-width">{joinLink}</code>
          <small className="field-note">Admin link</small>
          <code className="invite-code full-width">{adminLink}</code>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Add Team</h2>
            <p>Seeded from 2026 groups</p>
          </div>
        </div>
        <form className="form-stack" onSubmit={addTeam}>
          <label>
            Team
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
          </label>
          <div className="form-row">
            <label>
              Code
              <input value={teamCode} onChange={(event) => setTeamCode(event.target.value)} />
            </label>
            <label>
              Group
              <input value={teamGroup} onChange={(event) => setTeamGroup(event.target.value)} />
            </label>
          </div>
          <button className="primary-button" type="submit">
            <Plus size={18} /> Add Team
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Teams</h2>
            <p>Status control</p>
          </div>
        </div>
        <div className="team-admin-grid">
          {state.teams.map((team) => (
            <div className="team-admin-row" key={team.id}>
              <span>
                <TeamCode team={team} /> Group {team.group} - {team.name}
              </span>
              <select value={team.status} onChange={(event) => updateTeamStatus(team.id, event.target.value as TeamStatus)}>
                <option value="live">Live</option>
                <option value="eliminated">Eliminated</option>
                <option value="winner">Winner</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <h2>Identity Map</h2>
            <p>Joined accounts</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Real name</th>
                <th>Alias</th>
                <th>Joined</th>
                <th>Account</th>
                <th>Limit used</th>
              </tr>
            </thead>
            <tbody>
              {state.players.map((player) => {
                const totals = playerTotals(state, player.id);
                return (
                  <tr key={player.id}>
                    <td>{player.realName}</td>
                    <td>{player.alias}</td>
                    <td>{player.accountCreatedAt ? new Date(player.accountCreatedAt).toLocaleString() : "-"}</td>
                    <td>
                      <StatusPill tone={player.authStatus === "active" ? "good" : "warn"}>
                        {player.authStatus}
                      </StatusPill>
                    </td>
                    <td>{currency(totals.exposure)}</td>
                  </tr>
                );
              })}
              {state.players.length === 0 && (
                <tr>
                  <td colSpan={5}>No family members have joined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function TeamTotals({
  state,
  holdings,
}: {
  state: GameState;
  holdings: Record<string, Record<string, number>>;
}) {
  const rows = state.teams
    .map((team) => ({
      team,
      shares: state.players.reduce((sum, player) => sum + Math.max(holdings[player.id]?.[team.id] ?? 0, 0), 0),
    }))
    .filter((row) => row.shares > 0 || row.team.status !== "live")
    .sort((a, b) => b.shares - a.shares || a.team.name.localeCompare(b.team.name));

  if (rows.length === 0) {
    return <div className="empty-state">No shares yet.</div>;
  }

  return (
    <div className="team-total-list">
      {rows.map(({ team, shares }) => (
        <div className="team-total-row" key={team.id}>
          <span>
            <TeamCode team={team} /> {team.name}
            <small>Group {team.group}</small>
          </span>
          <span>
            <b>{wholeNumber(shares)}</b>
            <StatusPill tone={team.status === "live" ? "good" : team.status === "winner" ? "gold" : "bad"}>
              {team.status}
            </StatusPill>
          </span>
        </div>
      ))}
    </div>
  );
}

function LedgerSummary({ state, playerId }: { state: GameState; playerId: string }) {
  const totals = playerTotals(state, playerId);
  const slotLimit = liveTeamSlotLimit(state, playerId);
  const holdings = computeHoldings(state)[playerId] ?? {};
  const liveHoldings = Object.entries(holdings).filter(([teamId, shares]) => {
    const team = getTeam(state, teamId);
    return shares > 0 && (team?.status === "live" || team?.status === "winner");
  });

  return (
    <div className="ledger-grid">
      <Metric icon={<Landmark size={18} />} label="New shares bought" value={currency(totals.newBuys)} />
      <Metric icon={<HandCoins size={18} />} label="Trades bought" value={currency(totals.tradePurchases)} />
      <Metric icon={<ShieldCheck size={18} />} label="Money from sales" value={currency(totals.tradeSales)} />
      <Metric icon={<AlertTriangle size={18} />} label="Sold back to pot" value={currency(totals.potSalePenalties)} />
      <Metric
        explain="How much of your $500 game limit is currently used."
        icon={<AlertTriangle size={18} />}
        label="Limit used"
        value={currency(totals.exposure)}
      />
      <Metric icon={<Users size={18} />} label="Live-team slots" value={`${totals.liveTeams}/${slotLimit}`} />
      <div className="holding-list ledger-holdings">
        {liveHoldings.length === 0 && <span className="muted">No live shares</span>}
        {liveHoldings.map(([teamId, shares]) => {
          const team = getTeam(state, teamId);
          return (
            <span className="holding-chip" key={teamId}>
              <TeamCode team={team} /> {team?.name}: {wholeNumber(shares)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ActivityTable({ state, buys }: { state: GameState; buys: Buy[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Trader</th>
            <th>Team</th>
            <th>Spend</th>
            <th>Shares</th>
            <th>Window</th>
          </tr>
        </thead>
        <tbody>
          {buys.map((buy) => (
            <tr key={buy.id}>
              <td>{new Date(buy.createdAt).toLocaleString()}</td>
              <td>{getPlayer(state, buy.playerId)?.alias}</td>
              <td>{getTeam(state, buy.teamId)?.name}</td>
              <td>{currency(buy.spend)}</td>
              <td>{wholeNumber(buy.shares)}</td>
              <td>{getStage(buy.stageId).label}</td>
            </tr>
          ))}
          {buys.length === 0 && (
            <tr>
              <td colSpan={6}>No buys recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MatchList({
  state,
  matches,
  emptyText,
}: {
  state: GameState;
  matches: Match[];
  emptyText: string;
}) {
  if (matches.length === 0) {
    return <div className="empty-state compact">{emptyText}</div>;
  }

  return (
    <div className="match-list">
      {matches.map((match) => {
        const homeTeam = getTeam(state, match.homeTeamId);
        const awayTeam = getTeam(state, match.awayTeamId);

        return (
          <article className={`match-card ${match.status}`} key={match.id}>
            <div className="match-meta">
              <span>{match.roundLabel}</span>
              <StatusPill tone={match.status === "live" ? "gold" : match.status === "full-time" ? "good" : "warn"}>
                {match.status}
              </StatusPill>
            </div>
            <div className="score-row">
              <span>
                <TeamCode team={homeTeam} /> {homeTeam?.name}
              </span>
              <b>{formatScore(match.homeScore)}</b>
            </div>
            <div className="score-row">
              <span>
                <TeamCode team={awayTeam} /> {awayTeam?.name}
              </span>
              <b>{formatScore(match.awayScore)}</b>
            </div>
            <small>
              {new Date(match.kickoffAt).toLocaleString()} · {match.venue}
            </small>
          </article>
        );
      })}
    </div>
  );
}

function LimitBar({ label, max, value }: { label: string; max: number; value: number }) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className="limit-bar">
      <div>
        <span>{label}</span>
        <b>{currency(value)}</b>
      </div>
      <div className="limit-track">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function formatScore(score?: number): string {
  return score === undefined ? "-" : String(score);
}

function TeamCode({ team }: { team?: Team }) {
  const flagSrc = teamFlagSrc(team);

  return (
    <span className="team-code">
      {flagSrc && <img alt="" src={flagSrc} />}
      {team?.code ?? "---"}
    </span>
  );
}

function TraderName({
  player,
  revealIdentities,
}: {
  player: Player;
  revealIdentities: boolean;
}) {
  return (
    <span className="trader-name">
      <b>{player.alias}</b>
      {revealIdentities && <small>{player.realName}</small>}
    </span>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn" | "bad" | "gold";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function ValidationList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="validation-box">
      {errors.map((error) => (
        <div key={error}>
          <AlertTriangle size={15} /> {error}
        </div>
      ))}
    </div>
  );
}

function parseLeg(teamId: string, shares: string): ShareLeg[] {
  if (!teamId || !shares) return [];

  return mergeLegs([{ teamId, shares: Number(shares) }]);
}

function describeOffer(state: GameState, offer: TradeOffer): string {
  const offered = [
    describeShareLegs(state, offer.makerOffersShares),
    offer.makerOffersMoney > 0 ? currency(offer.makerOffersMoney) : "",
  ]
    .filter(Boolean)
    .join(" + ");
  const requested = [
    describeShareLegs(state, offer.makerRequestsShares),
    offer.makerRequestsMoney > 0 ? currency(offer.makerRequestsMoney) : "",
  ]
    .filter(Boolean)
    .join(" + ");

  return `${offered || "Nothing"} for ${requested || "nothing"}`;
}

function describeTradeTerms(
  state: GameState,
  trade: {
    makerOffersShares: ShareLeg[];
    makerRequestsShares: ShareLeg[];
    makerOffersMoney: number;
    makerRequestsMoney: number;
  },
): string {
  const pseudoOffer: TradeOffer = {
    id: "",
    makerId: "",
    targetPlayerId: "open",
    status: "accepted",
    createdAt: "",
    note: "",
    makerOffersShares: trade.makerOffersShares,
    makerRequestsShares: trade.makerRequestsShares,
    makerOffersMoney: trade.makerOffersMoney,
    makerRequestsMoney: trade.makerRequestsMoney,
  };

  return describeOffer(state, pseudoOffer);
}

export default App;
