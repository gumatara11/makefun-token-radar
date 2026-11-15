[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gumatara11/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gumatara11/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# makefun-token-radar

A token launch radar: it ranks the farmable pre-token protocols in a DefiLlama snapshot by an implied token value, and shows a reader how to farm each one before a token launches.

## What it does

- **Farmable only.** The board ranks protocols that record no token and are not a CEX, a bridge, a wrapped or staked product, a versioned pool, or an exchange product. The 144 pre-token records the filter leaves out are shown in the dashboard's Excluded tab with the reason each was left out.
- **Shrunk-median model.** The implied value is TVL times a category multiple calibrated from the snapshot's own tokenized peers (median market-cap/TVL in the category, shrunk toward the global median), adjusted for 7-day growth, age with no token, and chain breadth. The log-log power law is *not* used: its R-squared is about 0.19 on this snapshot, too weak to support a fitted curve, and the dashboard says so.
- **Farm plans.** Every row carries six concrete steps with cost and time, derived from the protocol's category, chains, TVL and age — the same derivation runs in `main.ts` and in the dashboard, and the two are checked against each other.
- **Dashboard.** Search, category / chain / minimum-TVL filters, sortable columns, three tabs (Pre-token / Live token / Excluded), and a detail view per protocol with a valuation waterfall, the three closest tokenized comparables, and the farm plan.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. The program reads the snapshot, writes `out/board.json`, `out/dashboard/z-data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Two runs over the same snapshot write byte-identical files.

## Repository

- Owner: [gumatara11](https://github.com/gumatara11)
- Repo: `makefun-token-radar`
- Competition: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)

Referral code: `rzwabah1`
