[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gumatara11/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gumatara11/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# makefun-token-radar

A token launch radar: it ranks the farmable pre-token protocols in a DefiLlama snapshot by an implied token value, and shows a reader how to farm each one before a token launches.

## What it does

- **Farmable only.** The board ranks protocols that record no token and are not a CEX, a bridge, a wrapped or staked product, a versioned pool, or an exchange product. The 144 pre-token records the filter leaves out are shown in the dashboard's Excluded tab with the reason each was left out.
- **Size-curve model.** The implied value starts on a size curve fitted to the snapshot's own tokenized peers — `log(mcap) = a + b x log(TVL)` — plus a category offset: each category's mean residual from the curve, shrunk toward zero with 10 pseudo-peers and clamped to ±1 in log space, so a category with one peer cannot set the whole board. Growth, age with no token, and chain breadth adjust it. The model was chosen by leave-one-out validation over the 128 tokenized peers: the curve with offsets (k=10) misses a held-out peer by a factor of x3.74 at the median, with the smallest mean error and the most peers within 3x, against x5.16 for the shrunk median the earlier version used. The dashboard shows the full six-model comparison, the fitted curve against a scatter of the peers, and every category offset.
- **Farm plans, netted in dollars.** Every row carries six concrete steps with cost and time, derived from the protocol's category, chains, TVL and age — the same derivation runs in `main.ts` and in the dashboard, and the two are checked against each other. Each row is also netted: gas for 8 actions on its first chain plus the opportunity cost of the capital held, against the expected share of the implied value at the stated assumption that 10% of a token's implied value reaches farmers. The net is a triage heuristic, not a promised payout, and the dashboard says so.
- **Dashboard.** Search, category / chain / minimum-TVL filters, sortable columns (including the Net column), three tabs (Pre-token / Live token / Excluded), and a detail view per protocol with a valuation waterfall, the three closest tokenized comparables, a farm-economics block, and the farm plan.

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
