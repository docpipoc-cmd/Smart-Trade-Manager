import { useState } from 'react'
import { Field, Modal, NumInput, Seg, Swatches, useApp, useForm, PortfolioSelect } from './ui'
import { cashFlows, portfolio, portfolios, saveCashFlow, savePortfolio, deleteCashFlow } from '../lib/repo'
import { settings as _s, saveSettings } from '../lib/settings'
import { CURRENCIES, money, todayIso } from '../lib/format'
import { L } from '../lib/i18n'
import type { AccountType, CashFlowKind, Portfolio } from '../lib/types'
import { I } from './icons'

export const ACCOUNT_TYPES: [AccountType, () => string][] = [
  ['live', () => L('Conta real', 'Live account')],
  ['demo', () => L('Demo / simulador', 'Demo / simulator')],
  ['prop', () => L('Mesa proprietária', 'Prop firm')],
  ['paper', () => 'Paper trading'],
  ['other', () => L('Outra', 'Other')]
]
export const accountTypeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x[0] === t)?.[1]() ?? t

export function PortfolioModal({ id, onClose }: { id: string | null; onClose(): void }) {
  const app = useApp()
  const cur = id ? portfolio(id) : undefined
  const [v, set] = useForm<Partial<Portfolio>>(
    cur ?? { name: '', currency: _s().currency, initial_balance: 0, goal: null, description: '', account_type: 'live', broker: '', color: '#f7931a', status: 'active', start_date: todayIso() }
  )
  const [tried, setTried] = useState(false)
  const nameErr = !v.name?.trim() ? L('Informe um nome', 'Enter a name') : null
  const balErr = v.initial_balance === null || v.initial_balance === undefined || v.initial_balance < 0 ? L('Saldo inicial não pode ser negativo', 'Initial balance cannot be negative') : null
  const goalErr = v.goal !== null && v.goal !== undefined && v.goal <= 0 ? L('A meta deve ser maior que zero', 'Goal must be greater than zero') : null

  const save = () => {
    setTried(true)
    if (nameErr || balErr || goalErr) return
    const first = !id && portfolios().length === 0
    const nid = savePortfolio({ ...v, name: v.name!, id: id ?? undefined })
    // First portfolio: its currency becomes the preferred one so consolidated totals need no FX rate yet
    if (first) saveSettings({ ..._s(), currency: v.currency ?? _s().currency, defaultPortfolioId: nid })
    app.toast(id ? L('Carteira atualizada', 'Portfolio updated') : L('Carteira criada', 'Portfolio created'), 'ok')
    onClose()
    if (!id) app.nav('portfolios', { portfolioId: nid })
  }

  return (
    <Modal
      title={id ? L('Editar carteira', 'Edit portfolio') : L('Criar nova carteira', 'Create new portfolio')}
      sub={L('Separe estratégias, corretoras, contas ou classes de ativos.', 'Separate strategies, brokers, accounts or asset classes.')}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="btn" onClick={onClose}>
            {L('Cancelar', 'Cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            <I.ok /> {id ? L('Salvar alterações', 'Save changes') : L('Criar carteira', 'Create portfolio')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={L('Nome da carteira', 'Portfolio name')} className="full" error={tried ? nameErr : null}>
          <input className="input" autoFocus placeholder={L('Ex: Day Trade, Swing Trade, B3…', 'e.g. Day Trade, Swing, Crypto…')} value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={L('Moeda base', 'Base currency')}>
          <select className="select" value={v.currency} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label={L('Tipo de conta', 'Account type')}>
          <select className="select" value={v.account_type} onChange={(e) => set('account_type', e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`${L('Saldo inicial', 'Initial balance')} (${v.currency})`} error={tried ? balErr : null}>
          <NumInput value={v.initial_balance} onChange={(x) => set('initial_balance', x ?? 0)} placeholder="0.00" />
        </Field>
        <Field label={L('Data de início', 'Start date')} help={L('O saldo inicial conta a partir deste dia nos gráficos de evolução.', 'The initial balance counts from this day in the balance charts.')}>
          <input className="input" type="date" value={v.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label={`${L('Meta', 'Goal')} (${v.currency}) — ${L('opcional', 'optional')}`} help={L('Saldo que você quer atingir. O progresso aparece no cartão da carteira.', 'Balance you want to reach. Progress shows on the portfolio card.')} error={tried ? goalErr : null}>
          <NumInput value={v.goal} onChange={(x) => set('goal', x)} placeholder={L('Ex: 10000', 'e.g. 10000')} />
        </Field>
        <Field label={L('Corretora / exchange', 'Broker / exchange')}>
          <input className="input" placeholder={L('Ex: XP, Binance, IC Markets', 'e.g. Interactive Brokers, Binance')} value={v.broker ?? ''} onChange={(e) => set('broker', e.target.value)} />
        </Field>
        <Field label={L('Descrição — opcional', 'Description — optional')} className="full">
          <textarea className="input" rows={2} placeholder={L('Ex: Carteira para day trade em cripto…', 'e.g. Crypto day-trading account…')} value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={L('Cor', 'Color')}>
          <Swatches value={v.color ?? '#f7931a'} onChange={(c) => set('color', c)} />
        </Field>
        {id && (
          <Field label="Status" help={L('Bloqueada: não aceita novas operações. Arquivada: some das listas, mas os dados ficam.', 'Locked: no new trades. Archived: hidden from lists, data is kept.')}>
            <Seg
              value={v.status ?? 'active'}
              onChange={(s) => set('status', s)}
              options={[
                ['active', L('Ativa', 'Active')],
                ['locked', L('Bloqueada', 'Locked')],
                ['archived', L('Arquivada', 'Archived')]
              ]}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}

export const FLOW_KINDS: [CashFlowKind, () => string][] = [
  ['deposit', () => L('Depósito', 'Deposit')],
  ['withdrawal', () => L('Saque', 'Withdrawal')],
  ['fee', () => L('Taxa / custo da conta', 'Account fee / cost')],
  ['income', () => L('Rendimento / juros / dividendo', 'Interest / dividend / rebate')],
  ['adjustment', () => L('Ajuste (±)', 'Adjustment (±)')]
]
export const flowLabel = (k: string) => FLOW_KINDS.find((x) => x[0] === k)?.[1]() ?? k

export function CashFlowModal({ id, portfolioId, kind, onClose }: { id?: string; portfolioId?: string; kind?: string; onClose(): void }) {
  const app = useApp()
  const cur = id ? cashFlows().find((f) => f.id === id) : undefined
  const [pid, setPid] = useState(cur?.portfolio_id ?? portfolioId ?? '')
  const [k, setK] = useState<CashFlowKind>((cur?.kind ?? kind ?? 'deposit') as CashFlowKind)
  const [amount, setAmount] = useState<number | null>(cur?.amount ?? null)
  const [date, setDate] = useState(cur?.date ?? todayIso())
  const [note, setNote] = useState(cur?.note ?? '')
  const [tried, setTried] = useState(false)
  const p = portfolio(pid)
  const amtErr = amount === null || amount === 0 ? L('Informe o valor', 'Enter the amount') : k !== 'adjustment' && amount < 0 ? L('Use um valor positivo', 'Use a positive amount') : null
  const save = () => {
    setTried(true)
    if (!pid || amtErr || !date) return
    saveCashFlow({ id, portfolio_id: pid, kind: k, amount: amount!, date, note: note || null })
    app.toast(L('Movimentação salva', 'Cash movement saved'), 'ok')
    onClose()
  }
  return (
    <Modal
      title={id ? L('Editar movimentação', 'Edit cash movement') : L('Depósito, saque ou ajuste', 'Deposit, withdrawal or adjustment')}
      sub={L('Movimentações de caixa ficam separadas do resultado das operações.', 'Cash movements are tracked separately from trading results.')}
      onClose={onClose}
      foot={
        <>
          {id && (
            <button
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (await app.confirm({ title: L('Excluir movimentação?', 'Delete cash movement?'), message: `${flowLabel(k)} · ${money(amount, p?.currency)}`, ok: L('Excluir', 'Delete'), danger: true })) {
                  deleteCashFlow(id)
                  onClose()
                }
              }}
            >
              <I.trash /> {L('Excluir', 'Delete')}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {L('Cancelar', 'Cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            {L('Salvar', 'Save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={L('Carteira', 'Portfolio')} className="full" error={tried && !pid ? L('Escolha a carteira', 'Pick a portfolio') : null}>
          <PortfolioSelect value={pid} onChange={setPid} />
        </Field>
        <Field label={L('Tipo', 'Type')} className="full">
          <select className="select" value={k} onChange={(e) => setK(e.target.value as CashFlowKind)}>
            {FLOW_KINDS.map(([x, l]) => (
              <option key={x} value={x}>
                {l()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`${L('Valor', 'Amount')}${p ? ` (${p.currency})` : ''}`} error={tried ? amtErr : null} hint={k === 'adjustment' ? L('Negativo reduz o saldo.', 'Negative reduces the balance.') : undefined}>
          <NumInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label={L('Data', 'Date')}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={L('Observação', 'Note')} className="full">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
