# Full Tournament Simulation Report

Date: 2026-06-13

## Scope

I simulated a full 8-player family game through the actual game logic in `src/game.ts`:

- 8 players joined from the shared invite model.
- Players bought opening shares across live teams.
- Players made open trades and directed bids.
- The market auto-advanced through the official round cutoff dates.
- Knockout slot locking was exercised.
- One player sold shares back to the pot using the 2x cost-basis penalty.
- Teams were eliminated through the tournament.
- Argentina was set as the winner.
- Final settlement was calculated from pot payout, new buys, gross trade purchases, seller proceeds, and pot-sale penalties.

## Simulation Result

The full simulation passed.

- Players: 8
- New buys: 34
- Completed trades: 3
- Sell-to-pot actions: 1
- Final pot: $1753.50
- Trade levy collected: $13.50
- Sell-to-pot penalties collected: $60.00
- Winner: Argentina
- Winning shares held: 5120
- Final net sum across all players: $0.00

## Stage Checkpoints

| Checkpoint | Stage | Pot | Max exposure | Slot violations |
| --- | --- | ---: | ---: | ---: |
| After pre-market buying and trades | pre | $87.50 | $70.00 | 0 |
| After automatic post-group stage | group | $87.50 | $70.00 | 0 |
| After group window and pot sale | group | $307.50 | $90.00 | 0 |
| After Round-of-32 market | r32 | $433.50 | $150.00 | 0 |
| After Round-of-16 market | r16 | $913.50 | $230.00 | 0 |
| After quarter-final market | qf | $1273.50 | $350.00 | 0 |
| Before final settlement | final | $1753.50 | $410.00 | 0 |

## Rules Deliberately Tested

These invalid actions were correctly blocked:

- Cara attempted another pre-market buy after already using the pre-market allowance and two-team start rule.
- Finn tried to accept Argentina shares after his open slot had been removed at knockout lock time while he still held Netherlands.
- Dan tried to accept a $100 Argentina trade at $410 exposure; the app blocked it because it would exceed the $500 exposure cap.

## Stage Spend By Player

| Player | Pre | Group | R32 | R16 | QF | Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Alice FC | $10.00 | $20.00 | $0.00 | $80.00 | $0.00 | $120.00 |
| Ben FC | $10.00 | $20.00 | $0.00 | $0.00 | $0.00 | $120.00 |
| Cara FC | $10.00 | $20.00 | $0.00 | $80.00 | $120.00 | $0.00 |
| Dan FC | $10.00 | $20.00 | $0.00 | $80.00 | $120.00 | $120.00 |
| Eve FC | $10.00 | $20.00 | $40.00 | $80.00 | $120.00 | $0.00 |
| Finn FC | $10.00 | $20.00 | $40.00 | $80.00 | $0.00 | $120.00 |
| Gia FC | $10.00 | $20.00 | $0.00 | $0.00 | $0.00 | $0.00 |
| Hugo FC | $10.00 | $20.00 | $40.00 | $80.00 | $0.00 | $0.00 |

## Final Settlement

| Player | Exposure | Winner shares | Pot payout | Final net |
| --- | ---: | ---: | ---: | ---: |
| Alice FC | $119.00 | 1700 | $582.22 | $463.22 |
| Ben FC | $190.00 | 340 | $116.44 | -$73.56 |
| Cara FC | $174.50 | 480 | $164.39 | -$10.11 |
| Dan FC | $410.00 | 0 | $0.00 | -$410.00 |
| Eve FC | $350.00 | 1320 | $452.07 | $102.07 |
| Finn FC | $270.00 | 0 | $0.00 | -$270.00 |
| Gia FC | $30.00 | 0 | $0.00 | -$30.00 |
| Hugo FC | $210.00 | 1280 | $438.38 | $228.38 |

## Findings

No blocking game-logic bugs were found in this simulation. The main accounting invariants held:

- Pot accounting balanced.
- Final net across players summed to zero.
- Trade levy money went into the pot.
- Seller trade income used seller proceeds after levy.
- Buyer exposure used gross trade price.
- Sell-to-pot penalty fed the pot and freed the player's slot.
- Knockout slot locks prevented late slot hoarding.
- The $500 exposure cap blocked an invalid late trade.

## Remaining Risks Before Lovable

This simulation is deterministic and code-level. It does not yet prove:

- Database transaction safety when two people accept/bid at the same time.
- Live API edge cases, such as delayed match updates, abandoned matches, or provider schema changes.
- Full browser UI workflows across mobile and desktop.
- Authentication/session behavior in the eventual Lovable database setup.

Before deployment, the biggest next checks are database transaction tests for trades/bids and a small set of browser tests for the player dashboard, marketplace, admin page, and rules page.
