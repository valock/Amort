# Como contribuir

Este projeto é usado ao vivo, na mesa de negociação, com um cliente olhando a
tela. Um número errado não é um bug de software: é um corretor perdendo a
credibilidade na frente de quem está decidindo a compra de uma casa. Por isso
as regras abaixo são mais rígidas do que o tamanho do projeto sugere.

Você não precisa entender de financiamento imobiliário para contribuir — o
glossário adiante cobre o necessário.

---

## Regra nº 1: nada de dado real de cliente no repositório

O repositório é público. **Nunca** faça commit de:

- nome, CPF, RG, data de nascimento, endereço, telefone ou e-mail de pessoa real;
- print de tela, PDF ou anexo com dados de um cliente;
- valores que, juntos, identifiquem uma pessoa específica.

Para exemplos, use nomes claramente fictícios ("Maria Souza") e, se precisar de
valores reais de uma simulação para travar um cálculo, use **só os valores
financeiros**, sem nada que identifique a pessoa — foi o que fizemos em
`testes/caso-caixa-real.mjs`.

Antes de commitar, rode:

```
node testes/verificar-anonimizacao.mjs
```

Ele não substitui a sua revisão: pega padrões óbvios (CPF, CEP, telefone,
e-mail), não pega um nome próprio que você digitou sem perceber.

Dados de cliente vivem **apenas no navegador do corretor** (IndexedDB). O app
não tem backend e nenhum dado sai do aparelho — isso é um requisito do produto,
não um detalhe de implementação. Não introduza chamadas de rede, analytics,
CDN ou telemetria.

---

## Glossário do domínio

O app cobre uma compra de imóvel no programa **MCMV (Minha Casa Minha Vida)**,
financiada pela **Caixa Econômica Federal**. A compra tem duas frentes que o
comprador quase sempre confunde, e que o app separa de propósito:

| Frente | Com quem | O que é |
|---|---|---|
| **Financiamento** | Caixa | A parte financiada pelo banco, paga em prestações por até 420 meses |
| **Entrada** | Construtora | O que falta, acertado direto com a construtora (sinal + parcelas + balões) |

**Composição do preço.** O valor do imóvel se divide em três partes que somam
exatamente o total:

```
valor do imóvel = financiamento (Caixa) + subsídio + entrada (construtora)
```

- **Subsídio** (ou "complemento"): dinheiro do governo/FGTS que abate o preço e
  **não volta como dívida**. Reduz a entrada que o comprador desembolsa.
- **Entrada**: o app *deriva* esse valor, nunca pede digitado — é
  `imóvel − financiamento − subsídio`.

**Termos que aparecem no código:**

- **Correspondente**: o parceiro que roda a simulação no sistema da Caixa e
  manda o PDF de aprovação para o corretor. É esse PDF que alimenta o Passo 1.
- **INCC** (Índice Nacional de Custo da Construção): corrige as parcelas pagas
  à construtora durante a obra. Encarece o parcelamento e quase nunca entra na
  conversa de venda. No app é uma **taxa estimada informada pelo usuário**, não
  o índice oficial mês a mês.
- **FGTS**: fundo obrigatório onde o empregador deposita ~8% do salário bruto
  por mês. Serve para duas coisas neste app: compor a **entrada** e, depois das
  chaves, **amortizar** o financiamento. O saque para amortização respeita um
  intervalo mínimo (o app usa 24 meses como padrão configurável).
- **13º salário**: salário extra anual, pago em dezembro. Quando as datas do
  contrato estão definidas, o app lança o aporte em **dezembro de verdade**, não
  a cada 12 meses de contrato — é o que o cliente vê no controle mês a mês.
- **SAC** (Sistema de Amortização Constante): amortização fixa, parcela
  decrescente.
- **Price** (Tabela Price): parcela fixa, amortização crescente.
- **TR** (Taxa Referencial): índice somado aos juros. Muitas vezes zero, mas o
  app deixa o campo aberto para simular cenários.
- **MIP / DFI**: seguros obrigatórios (morte e invalidez / danos ao imóvel).
  Junto com a tarifa de administração, compõem a diferença entre "amortização +
  juros" e a prestação que o cliente realmente paga.
- **Juros de obra** (ou "evolução de obra"): quando o imóvel ainda está em
  construção, o banco libera o valor financiado em parcelas para a construtora
  e cobra juros sobre o que já foi liberado, antes de a amortização começar.
- **Comprometimento de renda**: teto (tipicamente 30%) de quanto a prestação
  pode consumir da renda bruta. A Caixa dimensiona o financiamento *de trás
  para frente* a partir desse teto — é por isso que os valores aprovados vêm
  com centavos quebrados.

**Atenção:** parâmetros regulatórios (teto de renda, intervalo de saque do
FGTS, regras de subsídio) mudam com o tempo e por programa. Eles são
configuráveis ou estimados de propósito. Não os transforme em constante fixa
enterrada no código.

---

## Invariantes que você não deve quebrar

Cada um destes já foi validado contra um documento oficial da Caixa e está
coberto por teste. Se um teste em `testes/` falhar, o app está errado — não o
teste.

1. **Taxa mensal = juros nominais anuais ÷ 12.** É a convenção da Caixa, não
   equivalência geométrica. A prova está no próprio documento oficial: ele
   imprime "Juros Nominais 4,5000% a.a." ao lado de "Juros Efetivos 4,5940%
   a.a.", e `(1 + 0,045/12)^12 − 1 = 4,5940%`. Usar
   `(1 + anual)^(1/12) − 1` devolve 4,5000% e não fecha com o papel.
   Ver `js/calc/caixa.js`.

2. **A "1ª Prestação" do documento é o encargo total**, não amortização +
   juros. O app calcula a parcela base e trata a diferença como seguros +
   tarifa, para o valor exibido bater com o que o cliente tem em mãos.

3. **Aportes extraordinários reduzem o PRAZO, não a parcela.** A parcela (Price)
   ou a amortização periódica (SAC) é fixada uma vez a partir do financiamento
   original; o aporte só derruba o saldo devedor a mais, e o prazo cai como
   consequência. Essa é a estratégia central do produto.

4. **Só conte aportes que a simulação realmente aplicou.** A lista de aportes é
   gerada para o prazo original, então inclui saques de FGTS de anos
   *posteriores* à quitação. Somar a lista inteira infla o esforço do cliente e
   enfraquece o argumento. Ver `totalAportesAplicados` em `js/calc/cenarios.js`.

5. **Estimativa tem que estar rotulada como estimativa** na interface. INCC,
   juros de obra e acúmulo de FGTS (que ignora o rendimento do fundo) são
   projeções. O corretor precisa poder dizer isso ao cliente.

6. **Aportes projetados saem de um lugar só**: `montarAportes` em
   `js/calc/cenarios.js`. A tela de Resultado e o controle mês a mês consomem
   a mesma função — se cada uma montasse a sua lista, as duas mostrariam
   economias diferentes para o mesmo caso.

7. **No controle mês a mês, o que o cliente registrou sempre vale.** Um aporte
   registrado conta mesmo que o contrato ainda não tenha começado. Um aporte
   que o plano previa, em mês já vencido e que o cliente não registrou, é
   descartado — o controle tem de empurrar a quitação para frente em vez de
   fingir que foi cumprido. E o rótulo "o plano previa" nunca pode ecoar o
   valor que o próprio cliente acabou de digitar. Ver `simularComRealidade` e
   `aportePlanejado` em `js/calc/cronograma.js`.

---

## Arquitetura

Site estático, sem build, sem dependências de runtime. Basta servir a pasta.

```
index.html         Passo 1 — aprovação da Caixa (+ lista de clientes salvos)
entrada.html       Passo 2 — entrada com a construtora e datas do contrato
estrategia.html    Passo 3 — FGTS, 13º e aportes avulsos
resultados.html    Passo 4 — economia, tempo poupado, gráficos e envio do link
cronograma.html    Passo 5 — controle mês a mês (a tela do cliente)

js/calc/           Matemática pura. Sem DOM, sem estado global.
  caixa.js           Derivações do documento oficial + convenção de taxa
  amortizacao.js     Motor SAC/Price com aportes que abatem prazo
  entrada.js         Montagem da entrada (série mensal + balões, INCC)
  incc.js            Correção composta pelo INCC
  evolucaoObra.js    Juros de obra sobre o saldo liberado
  fgts.js            Acúmulo e saque bienal do FGTS, 13º salário
  cenarios.js        Fonte única dos aportes projetados + cenários comparados
  calendario.js      Mês do contrato <-> mês do calendário (só aqui há datas)
  cronograma.js      Compromisso de cada mês e reação do saldo à realidade

js/screens/        Uma por tela. Liga o DOM ao js/calc. Sem matemática aqui.
js/state.js        Modelo do cliente + migração entre versões do modelo
js/storage.js      IndexedDB (persistência local)
js/compartilhar.js Caso codificado no # da URL, para enviar ao cliente
js/ui.js           Widgets compartilhados (campos, listas, avisos)
js/nav.js          Stepper dos passos
js/format.js       Formatação e parsing de números em português
js/charts.js       Wrapper sobre o Chart.js embarcado

testes/            Scripts em Node, sem framework
assets/vendor/     Chart.js embarcado (sem CDN — o app roda offline)
```

**Onde mexer:**

- Mudou uma regra de cálculo? `js/calc/` + um teste em `testes/`.
- Mudou um campo de tela? O `.html` correspondente + `js/screens/`.
- Mudou o formato dos dados salvos? `js/state.js`, e **incremente
  `versaoModelo` com um passo de migração** — há corretores com casos salvos no
  aparelho que não podem perder o trabalho.
- Adicionou um arquivo? Inclua na lista `APP_SHELL` do `sw.js`, senão ele não
  fica disponível offline.

---

## Convenções

- **Idioma:** código, comentários e commits em português. O domínio é
  brasileiro e os termos (INCC, FGTS, subsídio) não têm tradução útil.
- **Comentário explica *por que*, não *o que*.** O código já diz o que faz. Nos
  módulos de cálculo, comente a origem da regra — que campo do documento, que
  convenção do banco.
- **Nada de dependência nova sem necessidade real.** Se precisar de uma
  biblioteca, ela tem que ser embarcada em `assets/vendor/` (o app funciona sem
  internet, e CDN quebra isso).
- **Entrada de números:** use `parseNum` de `js/format.js`, nunca
  `Number(input.value)`. O corretor digita e cola no formato brasileiro
  ("R$ 165.810,07"). Campos de dinheiro e campos de taxa interpretam
  `"260.000"` de formas diferentes de propósito — `ligarCampo` cuida disso via
  o parâmetro `escala`.
- **Interface pensada para ser lida a um metro de distância**, com um cliente
  do outro lado da mesa: tipografia grande, `inputmode` correto para abrir o
  teclado numérico, e os números que importam em destaque.

---

## Rodando e testando

```
python3 -m http.server 8000     # e abra http://localhost:8000
```

```
node testes/caso-caixa-real.mjs        # trava os números do documento oficial
node testes/motor-amortizacao.mjs      # SAC/Price, FGTS, 13º, INCC, juros de obra
node testes/cronograma.mjs             # datas, as duas fases e o controle mês a mês
node testes/verificar-anonimizacao.mjs # varre o repo por dado pessoal
```

Não há framework de teste: são scripts Node que imprimem `OK`/`FALHA` e saem
com código diferente de zero se algo quebrar.

**Antes de abrir um PR:** rode os quatro scripts e teste o fluxo dos 5 passos no
navegador (criar cliente → preencher → voltar pelo stepper e conferir que os
dados persistiram → gerar o link e abri-lo numa janela anônima, que simula o
aparelho do cliente).

## Deploy

Netlify, a partir da branch principal, publicando a raiz do repositório
(`netlify.toml`). Em produção: <https://planilha.marcotulio.pro>.
