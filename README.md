# Family World Cup Share Market

A local React prototype for a private family World Cup share market.

## Run

```bash
npm install
npm run dev
```

## Implemented

- Stage multipliers and per-player buying caps.
- Automatic buying-window advancement from official FIFA round-end times, with admin override.
- Starting buy limit of $10 across one or two teams.
- Two-live-team maximum.
- Knockout slot lock: open live-team slots are removed once the game reaches the post-group knockout market.
- Whole-dollar and whole-share validation.
- $500 exposure cap.
- Sell-to-pot penalty exit: surrendered shares are removed and the player pays 2x their cost basis into the pot.
- Public alias-based holdings board.
- Admin identity map, stage control, team status control, winner selection, JSON export.
- Player-only join screen, with admin login separated behind `?admin=1`.
- Market board with open/directed offers and acceptance validation.
- Marketplace share map showing team-level share distribution and player holdings.
- Directed bids for another player's shares, even when those shares were not listed for sale.
- 7.5% trade levy: trade prices are gross buyer prices, with 7.5% going to the pot and 92.5% credited to the seller.
- End-of-game settlement using pot payout plus trade obligations.
- Browser persistence through `localStorage`.

## Later Database Tables

- `players`: real identity, alias, admin-visible metadata.
- `teams`: name, group, status.
- `buys`: player, team, stage, spend, shares.
- `trade_offers`: maker, target, share legs, money terms, status.
- `completed_trades`: accepted trade terms and counterparties.
- `game_settings`: current stage, winner team, identity reveal flag.

The seed team list is based on the 2026 World Cup groups published by U.S. Soccer on May 14, 2026.
