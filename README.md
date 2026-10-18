# $mart Trader 1.0 (Desktop — Windows e Mac)

Diário de trading, carteiras e análise de performance, no mesmo visual do **$mart** (Smart Finance).
Electron + React + TypeScript, com banco SQLite local (sql.js). Interface em Português e English.

## Como usar

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências (só na primeira vez) |
| `npm run dev` | abre o app desktop em modo desenvolvimento |
| `npm run web` | abre só a interface no navegador (http://localhost:5174), com dados no IndexedDB |
| `npm run dist` | gera o instalador Windows em `release/` |
| `npm run dist:mac` | gera o app Mac — **só roda num Mac** |
| `npm test` | testa os cálculos (P&L, R, contratos, drawdown, períodos) |
| `npm run typecheck` | verificação de tipos |
| `npm run icon` | regenera o ícone a partir de `build/logo.svg` |

Os dados do app instalado ficam em `%APPDATA%\Smart Trader\data\trader.sqlite`, com os prints em `data\screenshots` e um backup automático por dia (últimos 30) em `data\backups`.

## Seções

- **Dashboard** — patrimônio, P&L realizado e não realizado, retorno, taxa de acerto, profit factor, payoff, expectativa, drawdown máximo, comparação com o período anterior, evolução do saldo (diário/semanal/mensal), calendário de resultados, sessões, sentimento, horários, disciplina do plano e R:R planejado × executado. Todos os widgets vêm dos registros e levam às operações correspondentes. Widgets e ordem configuráveis.
- **Carteiras** — nome, descrição, tipo de conta, corretora, moeda, saldo inicial, data de início e meta. Depósitos, saques, taxas e ajustes ficam separados do resultado. Cartões com saldo líquido/bruto, taxas, retorno e progresso da meta; status ativa / bloqueada / arquivada (meta atingida e quebrada são calculados). Tela de detalhe com gráfico, alocação, posições abertas, movimentações e estatísticas.
- **Operações** — diário completo: ativo (com logo), classe, direção, estratégia, carteira, entrada/saída (data, hora, preço), quantidade, multiplicador do contrato, stop, alvo, risco (R$ e %), R:R planejado e executado, taxas, resultado bruto/líquido, retorno, status (planejada, aberta, fechada, cancelada), sessão, sentimento, "seguiu o plano", erros, tags e notas. Também aceita só o resultado (sem preços), como no app de referência.
  - **Prints de entrada e saída**: várias imagens por lado (PNG/JPG/WEBP até 10 MB), arrastar, clicar ou colar (Ctrl+V), prévia antes de salvar, remover/substituir, ampliar com zoom. Os prints de entrada continuam quando a operação é fechada; dá para acrescentar prints e notas de revisão depois.
  - Lista com filtros (carteira, ativo, resultado, status, período, estratégia, direção, classe, sessão, sentimento, tag), ordenação, paginação, visão de calendário, duplicar, editar, excluir (Ctrl+Z desfaz) e exportar CSV.
- **Análises** — acerto/erro, P&L, ganho e perda médios, maiores, profit factor, R:R, expectativa, drawdown, sequências, duração; P&L acumulado, P&L por período, vitórias × derrotas, distribuição de R e performance por ativo, estratégia, carteira, direção, classe, sessão, sentimento, tag, erro, dia da semana, hora e mês. Clicar em barras e linhas abre as operações.
- **Ferramentas** — tamanho de posição (com pips e contratos), gestão de risco com cenários de stop/alvo e taxa de acerto mínima, calculadora de P&L, diário & relatórios (resumo por período/carteira/estratégia, revisão de notas e prints, CSV e PDF) e busca de ativos com cotação.
- **Administração** — registros (carteiras, movimentações, catálogo de ativos, histórico de atividades, informações do sistema), estratégias, sessões, sentimentos, erros e tags, padrões para novas operações, importação de CSV com validação linha a linha (colunas em PT ou EN, `,` ou `;`), exportação (operações, carteiras com saldos, movimentações, relatório), backup/restauração e verificação de dados (inconsistências, duplicadas, câmbio ausente, prints sem arquivo).
- **Configurações** — perfil, tema claro/escuro/sistema, idioma, formatos de data, hora e números, casas decimais, exibição da moeda, moeda preferida e câmbio, padrões de trading, widgets e gráficos, lembretes, integrações e senha. Salvar/descartar/restaurar padrões.

## Cálculos

`src/lib/calc.ts` (testado em `scripts/test-calc.ts`):

- `resultado bruto = (saída − entrada) × direção × quantidade × multiplicador × câmbio`; `líquido = bruto − taxas`.
- Multiplicador = quanto vale 1,0 de movimento por unidade: 1 (ações, cripto), 100.000 por lote (forex), R$0,20/pt (WIN), R$10/pt (WDO), $50/pt (ES), $2/pt (MNQ)… Contratos conhecidos são reconhecidos pelo símbolo (`WINZ25`, `ESH6`, `MNQ`).
- Forex: pares cuja base ou cotação é a moeda da carteira são convertidos sozinhos (USDJPY numa conta em USD usa 1/preço). Outros pedem o câmbio e ficam sinalizados até lá.
- Risco = |entrada − stop| × unidades (ou risco manual). R = líquido ÷ risco. R:R planejado = |alvo − entrada| ÷ |entrada − stop|.
- Taxa de acerto = vitórias ÷ (vitórias + derrotas); breakeven fica de fora (tolerância configurável).
- Saldo = inicial + depósitos − saques ± ajustes + resultados fechados. Patrimônio = saldo + não realizado (operações abertas com preço atual).
- Carteiras em moedas diferentes são somadas na moeda preferida com as cotações de Configurações › Moeda & câmbio; sem cotação, ficam fora do total com aviso.

## Dados de mercado

Opcionais — o registro e a análise funcionam 100% offline. As chamadas rodam no processo principal do Electron (ou no servidor do Vite em `npm run web`), então nenhuma chave fica no navegador.

| Provedor | Uso | Observação |
|---|---|---|
| Yahoo Finance | busca e cotação de ações, ETFs, forex, índices, futuros; câmbio | fonte não oficial; pode atrasar 15–20 min |
| CoinGecko | busca, logos e preço de cripto | API pública com limite de requisições |
| Finnhub | busca, logos de empresas, cotação | opcional, com chave (salva criptografada pelo sistema) |

Toda cotação mostra a fonte, a hora informada pelo provedor e se está atrasada. Se o provedor falhar, aparece "Indisponível" — nenhum preço é inventado. Logos são guardados no catálogo local.

## Estrutura

```
electron/       processo principal (janela, arquivo do banco, backups, prints, PDF, dados de mercado)
server/         dados de mercado e chaves (usado pelo Electron e pelo `npm run web`)
src/lib/        banco, cálculos, estatísticas, repositório, CSV, verificação
src/pages/      Dashboard, Carteiras, Operações, Análises, Ferramentas, Administração, Configurações
src/components/ formulário de operação, prints, lightbox, gráficos, barra lateral, UI
scripts/        testes e gerador de ícone
```

O visual (paletas por seção, ícones 3D, cabeçalhos com cena isométrica) vem do $mart: `src/styles.css` e `src/theme.css` são os mesmos arquivos; o específico de trading está em `src/app.css`.
