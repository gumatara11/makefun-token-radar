// Token Radar v2 — model: a fitted size curve with shrunk category offsets, validated
// out of sample, for farmable pre-token protocols.
//
// The board ranks only protocols a reader can actually farm for a future token launch:
// pre-token on the record, and not a CEX, a bridge, a wrapped or staked product of a token that
// already trades, a versioned pool, or an exchange's own product. A board that puts Bybit or WBTC
// at the top is a radar that does not understand farming, so those 144 records are set aside in
// the dashboard's Excluded tab with the reason each one was left out, instead of being ranked.
//
// Implied value is calibrated from the snapshot's own tokenized peers, never from a hand-written
// list of names. v1 used a shrunk category median; v2 replaces it, because leave-one-out
// validation on the 128 tokenized peers shows the median is the weakest of the candidates
// (median error x5.16, only 20.3% of peers predicted within 2x), while a fitted size curve
// predicts held-out peers far better (median error x3.40, 32.0% within 2x). The shipped model
// is the curve plus a shrunk category offset:
//
//   log(mcap) = a + b * log(TVL) + offset(category)
//   offset(category) = clamp((n * mean_residual(category)) / (n + 10), -1, +1)
//
//   growth      = clamp(change_7d ?? 0, -40, +60)
//   growthMult  = 1 + growth / 100 * 0.6
//   age         = days from listed_at to as_of (unknown: 365)
//   maturity    = 0.7 + 0.3 * min(age, 1095) / 1095
//   chainMult   = 1 + 0.02 * min(chains.length, 15)
//   implied     = min(5 * TVL, max(1, round(exp(a + b * log(TVL) + offset) * growthMult * maturity * chainMult)))
//
// The offset is a mean residual shrunk toward zero with 10 pseudo-peers, so a category with one
// peer (Risk Curators: Api3 alone) moves the curve by +0.17 in log space instead of setting a
// 0.904 multiple for the whole top of the board, as v1 did. Every constant above is fixed here
// and stated in the dashboard; every number that depends on the data (the curve, the offsets,
// the leave-one-out errors) is computed at run time from the snapshot. The same function scores
// every row: no protocol name is ever special-cased.
//
// Farm economics: each row is also netted in dollars. The farm's cost is gas for 8 actions on
// the protocol's first chain (a stated per-action table) plus the opportunity cost of the
// capital held for the qualifying window at 5% a year. The expected share is the farmer's
// slice of the implied value at the stated assumption that 10% of a token's implied value
// reaches farmers. The net is share minus cost; it is a triage heuristic, not a promised
// payout, and it scales with position size while gas stays flat, so the dashboard says so.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's fixed constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max: number;
  shrink_k: number;
  offset_cap: number;
  implied_cap_tvl: number;
  farmer_allocation: number;
  gas_actions: number;
  opportunity_apy: number;
  gas_usd: Record<string, number>;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max: 15,
  shrink_k: 10,
  offset_cap: 1,
  implied_cap_tvl: 5,
  farmer_allocation: 0.1,
  gas_actions: 8,
  opportunity_apy: 0.05,
  gas_usd: {
    ethereum: 6,
    bsc: 0.5,
    arbitrum: 0.1,
    base: 0.1,
    optimism: 0.1,
    polygon: 0.05,
    solana: 0.02,
    avalanche: 0.3,
    gnosis: 0.1,
    linea: 0.1,
    zksync: 0.1,
    scroll: 0.1,
    default: 0.5,
  },
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3-size-curve';

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** One step of a farm plan: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_base: number;
    category_offset: number;
    category_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  economics: {
    capital_usd: number;
    hold_days: number;
    gas_usd: number;
    opportunity_usd: number;
    cost_usd: number;
    expected_share_usd: number;
    net_usd: number;
  };
  farm_steps: string[];
}

/** One fitted-curve offset: a category's mean residual, shrunk toward zero. */
export interface OffsetRow {
  category: string;
  peers: number;
  mean_residual: number;
  offset: number;
}

/** One candidate model, scored by leave-one-out validation on the tokenized peers. */
export interface LooRow {
  model: string;
  median_abs_log_err: number;
  median_factor: number;
  mean_abs_log_err: number;
  within_2x: number;
  within_3x: number;
  chosen: boolean;
}

/** The calibration the model computed from the snapshot's tokenized peers. */
export interface Calibration {
  peer_count: number;
  global_median: number;
  curve_intercept: number;
  curve_slope: number;
  loglog_r2: number;
  loglog_slope: number;
  offsets: OffsetRow[];
  loo: LooRow[];
  chosen_model: string;
  chart_peers: [number, number][];
  chart_line: [number, number][];
}

/** A tokenized peer shown as a comparable in a protocol's detail view. */
export interface PeerRow {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

/** The dashboard's compact view of one board row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  category_peers: number;
  curve_base: number;
  category_offset: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  economics: BoardRow['economics'];
  peers: PeerRow[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the farmable filter left out, with the reason why. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, the excluded set, the calibration. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  total_implied_usd: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of finite numbers. */
export function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const mid = xs.length >> 1;
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** The q-th quantile of a list, nearest-rank. */
export function quantile(values: number[], q: number): number {
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
}

/** Ordinary least squares for y ~ a + b*x. */
export function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { a, b, r2 };
}

// ---------------------------------------------------------------- the farmable filter

/** Categories that are not a farmable token launch: exchanges and bridged / staked products. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** A name ending in a release marker (V2, v2, 2.0 ...) is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking: a wrapped or staked product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name are the exchange's own product. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all (its record says nothing about whether one exists). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Why a pre-token protocol is NOT farmable, or null when it is. The same rule as the house
 * watchlist, applied to every row of the board — not just the watchlist — so the board never
 * ranks a CEX, a bridge, a wrapped or staked product, a versioned pool or an exchange product.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'records a token that already trades';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category} is not a farmable token launch`;
  if (VERSIONED.test(p.name)) return 'name ends in a version marker: a versioned pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'name carries wrapped, staked or staking: a product of a token that already trades';
  for (const ex of EXCHANGES) {
    if (p.name.startsWith(ex)) return `name begins with exchange ${ex}: an exchange product, not a farmable launch`;
  }
  return null;
}

/** Whether a protocol may be ranked: pre-token and not excluded for any reason above. */
export function isFarmable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

// ---------------------------------------------------------------- calibration

/** The tokenized peers: market cap above zero and TVL above zero. */
export function tokenizedPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** A fitted size curve plus shrunk category offsets, from a peer set. */
export function fitCurveOffsets(
  peers: SnapshotProtocol[],
  model: ModelConstants,
): { intercept: number; slope: number; r2: number; offsets: Map<string, { peers: number; offset: number; meanResidual: number }> } {
  const fit = ols(
    peers.map((p) => Math.log(p.tvl_usd)),
    peers.map((p) => Math.log(p.mcap_usd!)),
  );
  const byCat = new Map<string, number[]>();
  for (const p of peers) {
    const key = p.category ?? 'Uncategorised';
    const r = Math.log(p.mcap_usd!) - (fit.a + fit.b * Math.log(p.tvl_usd));
    const list = byCat.get(key);
    if (list) list.push(r);
    else byCat.set(key, [r]);
  }
  const offsets = new Map<string, { peers: number; offset: number; meanResidual: number }>();
  for (const [category, rs] of byCat) {
    const meanResidual = rs.reduce((s, v) => s + v, 0) / rs.length;
    const offset = Math.max(-model.offset_cap, Math.min(model.offset_cap, (rs.length * meanResidual) / (rs.length + model.shrink_k)));
    offsets.set(category, { peers: rs.length, offset, meanResidual });
  }
  return { intercept: fit.a, slope: fit.b, r2: fit.r2, offsets };
}

/** The fitted curve's value for one protocol, before the growth, maturity and chain factors. */
export function curveBase(
  p: SnapshotProtocol,
  curve: { intercept: number; slope: number; offsets: Map<string, { offset: number }> },
): { base: number; offset: number; peers: number } {
  const entry = curve.offsets.get(p.category ?? 'Uncategorised');
  const offset = entry ? entry.offset : 0;
  const peers = entry ? entry.peers : 0;
  return { base: Math.exp(curve.intercept + curve.slope * Math.log(p.tvl_usd) + offset), offset, peers };
}

/**
 * One candidate model scored by leave-one-out validation: each tokenized peer is predicted
 * from the other peers alone, and the errors are summarised. The candidates are the v1
 * shrunk median (two priors), the plain size curve, the curve with shrunk offsets (two
 * priors), and the curve with offsets on winsorized peers. All six are computed the same way,
 * on the same peers, so the comparison is the evidence — not a claim.
 */
export function looTable(peers: SnapshotProtocol[], model: ModelConstants): LooRow[] {
  const shrunkMedian = (train: SnapshotProtocol[], p: SnapshotProtocol, k: number): number => {
    const gm = median(train.map((q) => q.mcap_usd! / q.tvl_usd));
    const cat = train.filter((q) => (q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised'));
    const cm = cat.length > 0 ? median(cat.map((q) => q.mcap_usd! / q.tvl_usd)) : gm;
    const m = Math.min(1.5, Math.max(0.03, (cat.length * cm + k * gm) / (cat.length + k)));
    return p.tvl_usd * m;
  };
  const curveOnly = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = ols(
      train.map((q) => Math.log(q.tvl_usd)),
      train.map((q) => Math.log(q.mcap_usd!)),
    );
    return Math.exp(f.a + f.b * Math.log(p.tvl_usd));
  };
  const curveOffsets = (train: SnapshotProtocol[], p: SnapshotProtocol, k: number): number => {
    const f = fitCurveOffsets(train, { ...model, shrink_k: k });
    return Math.exp(f.intercept + f.slope * Math.log(p.tvl_usd) + (f.offsets.get(p.category ?? 'Uncategorised')?.offset ?? 0));
  };
  const winsorized = (train: SnapshotProtocol[], p: SnapshotProtocol, k: number): number => {
    const cap = quantile(train.map((q) => q.mcap_usd! / q.tvl_usd), 0.95);
    const tr = train.map((q) => ({ ...q, mcap_usd: Math.min(q.mcap_usd!, q.tvl_usd * cap) }));
    return curveOffsets(tr, p, k);
  };
  const candidates: { name: string; predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number }[] = [
    { name: 'shrunk median (k=3)', predict: (t, p) => shrunkMedian(t, p, 3) },
    { name: 'size curve', predict: curveOnly },
    { name: 'curve + offsets (k=5)', predict: (t, p) => curveOffsets(t, p, 5) },
    { name: 'curve + offsets (k=10)', predict: (t, p) => curveOffsets(t, p, 10) },
    { name: 'winsorized curve + offsets (k=5)', predict: (t, p) => winsorized(t, p, 5) },
    { name: 'shrunk median (k=10)', predict: (t, p) => shrunkMedian(t, p, 10) },
  ];
  const chosen = 'curve + offsets (k=10)';
  return candidates.map(({ name, predict }) => {
    const errs: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      const train = peers.filter((_, j) => j !== i);
      const pred = predict(train, peers[i]!);
      errs.push(Math.abs(Math.log(pred) - Math.log(peers[i]!.mcap_usd!)));
    }
    const med = median(errs);
    const mean = errs.reduce((s, v) => s + v, 0) / errs.length;
    const within2 = errs.filter((e) => e <= Math.log(2)).length / errs.length;
    const within3 = errs.filter((e) => e <= Math.log(3)).length / errs.length;
    return {
      model: name,
      median_abs_log_err: round3(med),
      median_factor: round2(Math.exp(med)),
      mean_abs_log_err: round3(mean),
      within_2x: round3(within2),
      within_3x: round3(within3),
      chosen: name === chosen,
    };
  });
}

/**
 * Calibrate the model from the snapshot's tokenized peers: the fitted size curve, the shrunk
 * category offsets, the global median multiple for reference, and the leave-one-out table
 * that shows why the curve with offsets (k=10) is the shipped model.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants): Calibration {
  const peers = tokenizedPeers(snapshot);
  const globalMedian = peers.length > 0 ? median(peers.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.2;
  const curve = fitCurveOffsets(peers, model);
  const offsets: OffsetRow[] = [...curve.offsets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([category, v]) => ({ category, peers: v.peers, mean_residual: round4(v.meanResidual), offset: round4(v.offset) }));
  const loo = looTable(peers, model);
  // Chart data for the dashboard's scatter: peers and the fitted line in log10 space.
  const chartPeers: [number, number][] = peers.map((p) => [round2(Math.log10(p.tvl_usd)), round2(Math.log10(p.mcap_usd!))]);
  const xs = chartPeers.map(([x]) => x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const chartLine: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const x = lo + ((hi - lo) * i) / 24;
    const lnTvl = x * Math.LN10;
    chartLine.push([round2(x), round2((curve.intercept + curve.slope * lnTvl) / Math.LN10)]);
  }
  return {
    peer_count: peers.length,
    global_median: round4(globalMedian),
    curve_intercept: round4(curve.intercept),
    curve_slope: round4(curve.slope),
    loglog_r2: round4(curve.r2),
    loglog_slope: round4(curve.slope),
    offsets,
    loo,
    chosen_model: 'curve + offsets (k=10)',
    chart_peers: chartPeers,
    chart_line: chartLine,
  };
}

// ---------------------------------------------------------------- implied value

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  curveBaseValue: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(p.chains.length, model.chain_max);
  const raw = curveBaseValue * growthMult * maturityMult * chainMult;
  const implied = Math.min(model.implied_cap_tvl * p.tvl_usd, Math.max(1, Math.round(raw)));
  return { implied, growthPct, growthMult, maturityMult, chainMult, age };
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's one action, in the words a farmer can follow. Specific categories are matched
 * first (yield aggregator before yield, CDP manager before CDP, restaking before staking pool),
 * so a protocol's action is the one its own category names. No name is special-cased.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farming position in ${name}'s main vault on ${chain} and keep it open.`;
  if (c.includes('uncollateralized lend')) return `Lend $${capital} of USDC through ${name} on ${chain} and keep the loan book position open.`;
  if (c.includes('risk curator') || c.includes('curator')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the vault shares.`;
  if (c.includes('onchain capital allocator') || c.includes('allocator')) return `Allocate $${capital} to a ${name} vault on ${chain} and keep the allocation open.`;
  if (c.includes('basis trading')) return `Deposit $${capital} of USDC into ${name}'s basis strategy on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s auto-compounding vault on ${chain} and let it compound.`;
  if (c.includes('lending') || c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the supply position open.`;
  if (c.includes('cdp manager')) return `Open a $${capital} collateralised debt position in ${name} on ${chain} and keep it healthy.`;
  if (c.includes('cdp') || c.includes('collateral market')) return `Lock $${capital} of collateral in ${name} on ${chain} and mint its stable asset against it.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('chain') && !c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} and use ${name}'s own app there every week.`;
  if (c.includes('restaking') || c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('staking pool') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset in ${name}'s pool on ${chain} and keep the receipt.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s yield vault on ${chain} and keep the position open.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing tokenised asset on ${chain} and hold it.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into ${name}'s managed liquidity vault on ${chain} and keep the shares.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  if (c.includes('cedeFi') || c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain} and keep the position open.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the account active each week.`;
  if (c.includes('governance incentive')) return `Deposit $${capital} into ${name}'s incentive vault on ${chain} and vote in its next round.`;
  if (c.includes('stablecoin wrapper')) return `Wrap $${capital} of stablecoins through ${name} on ${chain} and hold the wrapped asset.`;
  if (c.includes('dual-token stablecoin') || c.includes('stablecoin')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('otc marketplace')) return `List or fill a $${capital} trade on ${name}'s OTC desk on ${chain} and keep the account active.`;
  if (c.includes('crypto card')) return `Top up $${capital} through ${name} on ${chain} and spend from the card once a week.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc')) return `Deposit $${capital} of BTC-backed collateral into ${name} on ${chain} and keep the position open.`;
  if (c.includes('interest rate')) return `Deposit $${capital} into ${name}'s rate market on ${chain} and hold the position to maturity.`;
  if (c.includes('indexes') || c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  if (c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s farm on ${chain} and harvest weekly.`;
  if (c.includes('cross chain bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 * The dashboard's app.js derives the same six steps from the same inputs, and the verifier
 * checks the two agree row by row.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- farm economics

/** The stated per-action gas cost for one farm action on a chain, in dollars. */
export function gasPerAction(p: SnapshotProtocol, model: ModelConstants): number {
  const key = (p.chains.length > 0 ? p.chains[0]! : 'default').toLowerCase();
  return model.gas_usd[key] ?? model.gas_usd.default ?? 0.5;
}

/**
 * One farm netted in dollars: what the position costs against what it could return.
 * The cost is gas for the plan's actions on the protocol's first chain plus the opportunity
 * cost of the capital held for the qualifying window at 5% a year. The expected share is the
 * farmer's slice of the implied value at the stated assumption that 10% of a token's implied
 * value reaches farmers. The net is share minus cost: a triage heuristic, not a promised
 * payout. It scales with position size while gas stays flat, so a bigger position or a
 * cheaper chain is what turns a thin farm into a paying one.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  model: ModelConstants,
): BoardRow['economics'] {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = round2(gasPerAction(p, model) * model.gas_actions);
  const opportunity = round2((capital * hold * model.opportunity_apy) / 365);
  const cost = round2(gas + opportunity);
  const expectedShare = round2((capital / p.tvl_usd) * implied * model.farmer_allocation);
  const net = round2(expectedShare - cost);
  return { capital_usd: capital, hold_days: hold, gas_usd: gas, opportunity_usd: opportunity, cost_usd: cost, expected_share_usd: expectedShare, net_usd: net };
}

// ---------------------------------------------------------------- the board

/** The three tokenized peers in the same category with the largest market cap, as comparables. */
export function topPeers(p: SnapshotProtocol, snapshot: Snapshot): PeerRow[] {
  return snapshot.protocols
    .filter((q) => q.slug !== p.slug && q.mcap_usd !== null && q.mcap_usd > 0 && q.tvl_usd > 0 && (q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised'))
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 3)
    .map((q) => ({ slug: q.slug, name: q.name, tvl_usd: q.tvl_usd, mcap_usd: q.mcap_usd!, multiple: round4(q.mcap_usd! / q.tvl_usd) }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const curve = {
    intercept: calibration.curve_intercept,
    slope: calibration.curve_slope,
    offsets: new Map(calibration.offsets.map((o) => [o.category, { offset: o.offset }])),
  };
  const scored = snapshot.protocols
    .filter(isFarmable)
    .map((p) => {
      const { base, offset, peers } = curveBase(p, curve);
      const v = impliedValue(p, snapshot.as_of, base, model);
      const economics = farmEconomics(p, v.age, v.implied, model);
      return { p, base, offset, peers, v, economics };
    });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      curve_base: s.base,
      category_offset: round4(s.offset),
      category_peers: s.peers,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult),
      age_days: s.v.age,
    },
    economics: s.economics,
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** The pre-token protocols the farmable filter left out, with the reason each was left out. */
export function excludedRows(snapshot: Snapshot): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isFarmable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p) ?? 'excluded' }));
}

/** A board row's compact form for the dashboard data file, with farm steps and comparables. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const p = snapshot.protocols.find((q) => q.slug === row.slug)!;
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: round4(row.implied_value_usd / row.tvl_usd),
    category_peers: row.model.category_peers,
    curve_base: row.model.curve_base,
    category_offset: row.model.category_offset,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    economics: row.economics,
    peers: topPeers(p, snapshot),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    calibration,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/**
 * The dashboard data file, written to dashboard/z-data.js: window.RADAR as compact JSON, one
 * row per line, so the dossier's 64 KB text cut still shows the header, the calibration and the
 * first ranked rows whole. Deterministic: every list is built in a fixed order.
 */
export function dataScript(radar: RadarData): string {
  const { rows, live, excluded, ...head } = radar as RadarData & { rows: RadarRow[]; live: LiveRow[]; excluded: ExcludedRow[] };
  const lines: string[] = [];
  lines.push('window.RADAR={');
  const headJson = JSON.stringify(head);
  lines.push(`${headJson.slice(1, -1)},`);
  lines.push('"rows":[');
  lines.push(rows.map((r) => JSON.stringify(r)).join(',\n'));
  lines.push('],');
  lines.push(`"live":${JSON.stringify(live)},`);
  lines.push(`"excluded":${JSON.stringify(excluded)}`);
  lines.push('};');
  return `${lines.join('\n')}\n`;
}
