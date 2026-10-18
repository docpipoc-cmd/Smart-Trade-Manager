// npm test — checks the trade math and statistics.
import { computeTrade, knownSpec, positionSize, pnl, riskRows, fxFor, pipSize } from '../src/lib/calc.ts'
import { summarize, drawdown, periodRange, previousRange, balanceSeries, bucketOf, type Row } from '../src/lib/stats.ts'
import type { Trade, Portfolio } from '../src/lib/types.ts'

let fails = 0
let n = 0
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps
function ok(cond: boolean, msg: string) {
  n++
  if (!cond) {
    fails++
    console.log('  ✗ ' + msg)
  }
}

const base: Trade = {
  id: 't', portfolio_id: 'p', instrument_id: null, symbol: 'AAPL', asset_name: null, asset_class: 'stock', direction: 'long',
  strategy_id: null, session_id: null, sentiment_id: null, status: 'closed', entry_at: '2026-10-01T10:00', exit_at: '2026-10-01T15:30',
  entry_price: 100, exit_price: 110, quantity: 10, multiplier: 1, fx_rate: null, stop_loss: 95, take_profit: 115, risk_amount: null,
  fees: 2, manual_pnl: null, planned_rr: null, followed_plan: 1, is_be: 0, mark_price: null, mark_at: null, mark_source: null, notes: null,
  created_at: '2026-10-01', updated_at: '2026-10-01'
}
const T = (o: Partial<Trade>): Trade => ({ ...base, ...o })

// stock long
let c = computeTrade(base, 'USD')
ok(near(c.gross, 100), 'long gross 100')
ok(near(c.net, 98), 'net after fees 98')
ok(near(c.risk, 50), 'risk 50')
ok(near(c.reward, 150), 'reward 150')
ok(near(c.plannedRR, 3), 'planned RR 3')
ok(near(c.rMultiple, 98 / 50), 'R multiple')
ok(near(c.returnPct, 9.8), 'return % 9.8')
ok(c.outcome === 'win', 'win')
ok(c.holdMinutes === 330, 'hold 330 min')
ok(c.issues.length === 0, 'no issues: ' + c.issues.join(';'))

// short
c = computeTrade(T({ direction: 'short', entry_price: 50, exit_price: 45, stop_loss: 52, take_profit: 40, quantity: 100, fees: 0 }), 'USD')
ok(near(c.gross, 500), 'short gross 500')
ok(near(c.risk, 200), 'short risk 200')
ok(c.issues.length === 0, 'short no issues')
c = computeTrade(T({ direction: 'short', stop_loss: 90 }), 'USD')
ok(c.issues.some((i) => i.includes('Stop-loss')), 'short stop on wrong side flagged')

// B3 mini index: WIN, 0.2 BRL/pt, 2 contracts, +350 pts short
const win = knownSpec('WINZ25', 'futures')
ok(!!win && win.multiplier === 0.2, 'WIN spec 0.2')
ok(knownSpec('WIN$N', 'futures')?.multiplier === 0.2, 'WIN$N root')
ok(knownSpec('MNQZ5', 'futures')?.multiplier === 2, 'MNQ beats NQ')
ok(knownSpec('ESH6', 'futures')?.multiplier === 50, 'ES spec')
c = computeTrade(T({ symbol: 'WINZ25', asset_class: 'futures', direction: 'short', entry_price: 128350, exit_price: 128000, quantity: 2, multiplier: 0.2, stop_loss: 128500, take_profit: 127900, fees: 1.5 }), 'BRL', { quoteCurrency: 'BRL' })
ok(near(c.gross, 140), 'WIN short 350 pts × 2 × 0.2 = 140')
ok(near(c.net, 138.5), 'WIN net')

// forex EURUSD 0.5 lot, +20 pips, USD account
c = computeTrade(T({ symbol: 'EURUSD', asset_class: 'forex', entry_price: 1.085, exit_price: 1.087, quantity: 0.5, multiplier: 100000, stop_loss: 1.084, take_profit: 1.088, fees: 0 }), 'USD')
ok(near(c.gross, 100, 1e-6), 'EURUSD 20 pips × 0.5 lot = $100')
// USDJPY with USD account: converted by 1/exit
c = computeTrade(T({ symbol: 'USDJPY', asset_class: 'forex', entry_price: 150, exit_price: 151, quantity: 1, multiplier: 100000, stop_loss: 149, take_profit: 152, fees: 0 }), 'USD')
ok(near(c.gross, (1 * 100000) / 151, 1e-6), 'USDJPY auto-converted to USD')
ok(c.fx.warning === null, 'no fx warning for USDJPY/USD')
// GBPJPY in USD account → warning, uses fx_rate when provided
c = computeTrade(T({ symbol: 'GBPJPY', asset_class: 'forex', entry_price: 190, exit_price: 191, quantity: 1, multiplier: 100000, stop_loss: 189, take_profit: 192, fees: 0 }), 'USD')
ok(!!c.fx.warning, 'GBPJPY fx warning')
c = computeTrade(T({ symbol: 'GBPJPY', asset_class: 'forex', entry_price: 190, exit_price: 191, quantity: 1, multiplier: 100000, stop_loss: 189, take_profit: 192, fees: 0, fx_rate: 0.0066 }), 'USD')
ok(near(c.gross, 660), 'GBPJPY with manual fx 0.0066')
ok(fxFor({ symbol: 'EURUSD', asset_class: 'forex', fx_rate: null }, 'EUR', 1.1).rate === 1 / 1.1, 'EURUSD for EUR account')
ok(pipSize('USDJPY') === 0.01 && pipSize('EURUSD') === 0.0001, 'pip sizes')

// manual result (no prices), break-even
c = computeTrade(T({ entry_price: null, exit_price: null, manual_pnl: 750, fees: 0 }), 'BRL')
ok(near(c.net, 750), 'manual pnl used')
c = computeTrade(T({ exit_price: 100.2, fees: 0 }), 'USD', { beTolerance: 5 })
ok(c.outcome === 'be', 'within BE tolerance')
c = computeTrade(T({ is_be: 1 }), 'USD')
ok(c.outcome === 'be', 'flagged BE')
c = computeTrade(T({ status: 'open', exit_price: null, mark_price: 104, fees: 1 }), 'USD')
ok(near(c.unrealized, 39), 'unrealized 4×10 − 1')
ok(c.net === null, 'open trade has no net')
c = computeTrade(T({ status: 'closed', exit_price: null, manual_pnl: null }), 'USD')
ok(c.net === null && c.issues.length > 0, 'closed without exit flagged')

// calculators
const ps = positionSize({ balance: 10000, riskPct: 1, entry: 50, stop: 48, multiplier: 1, step: 1 })!
ok(ps.size === 50 && near(ps.actualRisk, 100) && near(ps.capital, 2500) && ps.direction === 'long', 'position size 50 shares')
const psFx = positionSize({ balance: 10000, riskPct: 2, entry: 1.085, stop: 1.083, multiplier: 100000, step: 0.01 })!
ok(near(psFx.size, 1), 'forex 20 pip stop, $200 risk → 1.00 lot')
ok(positionSize({ balance: 10000, riskPct: 1, entry: 50, stop: 50, multiplier: 1 }) === null, 'zero stop distance → null')
const p = pnl({ direction: 'short', entry: 20, exit: 18, quantity: 100, multiplier: 1, fees: 5 })
ok(near(p.gross, 200) && near(p.net, 195) && near(p.returnPct, 9.75), 'pnl calc short')
const rr = riskRows({ direction: 'long', entry: 100, quantity: 10, multiplier: 1, equity: 10000 }, [{ stop: 95, target: 110 }, { stop: 105, target: 110 }])
ok(near(rr[0].rr, 2) && near(rr[0].riskPct, 0.5) && near(rr[0].breakevenWinRate, 100 / 3), 'risk scenario 1:2')
ok(!rr[1].valid, 'invalid scenario flagged')

// statistics
const mk = (net: number, day: string, dir: 'long' | 'short' = 'long'): Row => {
  const t = T({ entry_price: null, exit_price: null, manual_pnl: net, fees: 0, exit_at: day + 'T12:00', entry_at: day + 'T10:00', direction: dir, stop_loss: null, take_profit: null })
  return { t, c: computeTrade(t, 'USD'), conv: 1 }
}
const rows = [mk(100, '2026-10-01'), mk(-50, '2026-10-02'), mk(-30, '2026-10-03', 'short'), mk(200, '2026-10-04'), mk(0, '2026-10-05')]
const s = summarize(rows, 1000)
ok(s.closed === 5 && s.wins === 2 && s.losses === 2 && s.be === 1, 'counts')
ok(near(s.winRate, 50), 'win rate excludes BE')
ok(near(s.net, 220), 'net 220')
ok(near(s.profitFactor, 300 / 80), 'profit factor')
ok(near(s.avgWin, 150) && near(s.avgLoss, -40), 'averages')
ok(near(s.payoff, 3.75), 'payoff')
ok(near(s.expectancy, 44), 'expectancy')
ok(near(s.maxDrawdown, 80), 'max drawdown 80')
ok(near(s.maxDrawdownPct, (80 / 1100) * 100), 'max drawdown %')
ok(s.short.n === 1 && s.short.losses === 1, 'short side')
ok(s.worstStreak === 2, 'losing streak 2')
ok(drawdown([10, -5, -10, 30]).abs === 15, 'drawdown helper')

const pf: Portfolio = { id: 'p', name: 'P', description: null, account_type: 'live', broker: null, currency: 'USD', initial_balance: 1000, goal: null, color: '#000', status: 'active', start_date: '2026-09-30', created_at: '2026-09-30' }
const ser = balanceSeries([pf], [{ id: 'f', portfolio_id: 'p', kind: 'deposit', amount: 500, date: '2026-10-02', note: null }], rows, () => 1, { from: null, to: null }, 'day')
ok(near(ser.points[ser.points.length - 1].balance, 1720), 'final balance 1000 + 500 + 220')
ok(near(ser.points[ser.points.length - 1].cumPnl, 220), 'cum pnl 220')
const ser2 = balanceSeries([pf], [], rows, () => 1, { from: '2026-10-03', to: null }, 'day')
ok(near(ser2.startBalance, 1050), 'start balance before range')
ok(bucketOf('2026-10-18', 'week') === '2026-10-12', 'week starts Monday')

const now = new Date(2026, 9, 18)
const r30 = periodRange('30d', undefined, now)
ok(r30.from === '2026-09-19' && r30.to === '2026-10-18', '30 days range')
ok(JSON.stringify(previousRange(r30)) === JSON.stringify({ from: '2026-08-20', to: '2026-09-18' }), 'previous range')
ok(periodRange('lastMonth', undefined, now).from === '2026-09-01' && periodRange('lastMonth', undefined, now).to === '2026-09-30', 'last month')

console.log(fails ? `${fails} of ${n} checks failed` : `all ${n} checks passed`)
process.exit(fails ? 1 : 0)
