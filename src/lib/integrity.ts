// Data check (Administration): finds records that are inconsistent or incomplete.
import { L } from './i18n'
import { allImages, calcOf, instruments, missingRates, portfolioMap, trades } from './repo'
import { settings } from './settings'
import { listImageFiles } from './images'
import type { Trade } from './types'

export interface Issue {
  id: string
  level: 'error' | 'warn' | 'info'
  title: string
  detail: string
  tradeIds: string[]
}

export function checkRecords(): Issue[] {
  const out: Issue[] = []
  const pm = portfolioMap()
  const list = trades()
  const add = (id: string, level: Issue['level'], title: string, detail: string, ts: Trade[]) => ts.length && out.push({ id, level, title, detail, tradeIds: ts.map((t) => t.id) })
  const calc = new Map(list.map((t) => [t.id, calcOf(t)]))
  add('noexit', 'error', L('Fechadas sem saída ou resultado', 'Closed without exit or result'), L('Não entram nas estatísticas até receberem preço de saída (e quantidade) ou o resultado manual.', 'Left out of statistics until they get an exit price (and quantity) or a manual result.'), list.filter((t) => t.status === 'closed' && calc.get(t.id)!.net === null))
  add('time', 'error', L('Saída antes da entrada', 'Exit before entry'), L('Datas trocadas distorcem a duração e o calendário.', 'Swapped dates distort hold time and the calendar.'), list.filter((t) => (calc.get(t.id)!.holdMinutes ?? 0) < 0))
  add('stopside', 'warn', L('Stop ou alvo do lado errado', 'Stop or target on the wrong side'), L('O risco e o R:R calculados ficam incorretos.', 'Calculated risk and R:R will be wrong.'), list.filter((t) => calc.get(t.id)!.issues.some((i) => /Stop-loss is|Take-profit is/.test(i))))
  add('qty', 'error', L('Quantidade inválida', 'Invalid quantity'), L('Quantidade zero ou negativa.', 'Zero or negative quantity.'), list.filter((t) => t.quantity !== null && t.quantity <= 0))
  add('fx', 'warn', L('Resultado em outra moeda sem câmbio', 'Result in another currency without FX rate'), L('O resultado está na moeda de cotação do ativo e é somado como se fosse a moeda da carteira.', "The result is in the asset's quote currency but is added as if it were the portfolio currency."), list.filter((t) => !!calc.get(t.id)!.fx.warning && t.status !== 'planned'))
  add('stale', 'warn', L(`Abertas há mais de ${settings().staleOpenDays} dias`, `Open for more than ${settings().staleOpenDays} days`), L('Esqueceu de fechar? Operações abertas não entram no resultado realizado.', 'Forgot to close them? Open trades are not part of realized results.'), list.filter((t) => t.status === 'open' && t.entry_at && (Date.now() - Date.parse(t.entry_at)) / 86400000 > settings().staleOpenDays))
  add('nostop', 'info', L('Abertas sem stop-loss', 'Open without stop-loss'), L('Sem stop (ou risco manual) não há como medir risco nem R.', 'Without a stop (or manual risk) risk and R cannot be measured.'), list.filter((t) => t.status === 'open' && t.stop_loss === null && t.risk_amount === null))
  add('archived', 'warn', L('Abertas em carteiras arquivadas', 'Open in archived portfolios'), L('Feche ou cancele essas operações.', 'Close or cancel these trades.'), list.filter((t) => t.status === 'open' && pm[t.portfolio_id]?.status === 'archived'))
  add('beforestart', 'info', L('Antes da data de início da carteira', "Before the portfolio's start date"), L('O gráfico de saldo começa na data de início; ajuste a data da carteira ou da operação.', 'The balance chart starts on the start date; adjust the portfolio or trade date.'), list.filter((t) => { const p = pm[t.portfolio_id]; const d = (t.exit_at ?? t.entry_at ?? '').slice(0, 10); return !!p && !!d && d < p.start_date }))
  const seen = new Map<string, Trade[]>()
  for (const t of list) {
    if (!t.entry_at) continue
    const k = `${t.portfolio_id}|${t.symbol}|${t.entry_at}|${t.entry_price}|${t.quantity}`
    seen.set(k, [...(seen.get(k) ?? []), t])
  }
  add('dup', 'warn', L('Possíveis duplicadas', 'Possible duplicates'), L('Mesma carteira, ativo, horário, preço e quantidade.', 'Same portfolio, symbol, time, price and quantity.'), [...seen.values()].filter((g) => g.length > 1).flat())
  const mr = missingRates()
  if (mr.length) out.push({ id: 'rates', level: 'warn', title: L('Cotações de moeda ausentes', 'Missing currency rates'), detail: L(`Sem cotação para ${mr.join(', ')} → ${settings().currency}. Essas carteiras ficam fora dos totais consolidados.`, `No rate for ${mr.join(', ')} → ${settings().currency}. These portfolios are left out of consolidated totals.`), tradeIds: [] })
  const used = new Set(list.map((t) => t.instrument_id))
  const unused = instruments().filter((i) => !used.has(i.id))
  if (unused.length) out.push({ id: 'unusedins', level: 'info', title: L('Ativos do catálogo sem operações', 'Catalog assets without trades'), detail: unused.map((i) => i.symbol).join(', '), tradeIds: [] })
  return out
}

/** Screenshot records without a file, and stored files no record points to. */
export async function checkImages(): Promise<{ missing: { id: string; trade_id: string; name: string }[]; orphans: string[] }> {
  const files = new Set(await listImageFiles())
  const imgs = allImages()
  const referenced = new Set(imgs.map((i) => i.file))
  return {
    missing: imgs.filter((i) => !files.has(i.file)).map((i) => ({ id: i.id, trade_id: i.trade_id, name: i.name })),
    orphans: [...files].filter((f) => !referenced.has(f))
  }
}
