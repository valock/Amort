# Acelerador de Quitação

Ferramenta offline do corretor para a mesa de negociação MCMV. Parte da
**simulação de aprovação da Caixa** que o correspondente envia e monta o
argumento completo para o cliente: o que o banco aprovou, como fechar a
entrada com a construtora, e quanto de juros e de tempo a amortização
estratégica economiza depois das chaves.

Cada cliente é um caso salvo só no dispositivo — nada é enviado a servidores.

## Fluxo (4 passos)

1. **O que a Caixa aprovou** — campos com os mesmos nomes do documento oficial
   (valor de compra e venda, financiamento, subsídio, prazo, 1ª prestação,
   juros nominais, renda bruta). O app confere os números entre si e deriva a
   **entrada a acertar com a construtora**.
2. **A entrada com a construtora** — sinal, FGTS usado na entrada, série de
   parcelas mensais e balões. Mostra o custo extra do INCC, o esforço mensal
   contra a renda do cliente e avisa quando o parcelamento não é sustentável.
3. **A estratégia** — FGTS acumulado (saque bienal), 13º salário e aportes
   avulsos, todos abatendo o **prazo** e não a parcela.
4. **O resultado** — economia de juros, tempo poupado, seguros evitados e dois
   gráficos comparando o cenário sem amortizar com o estratégico.

## Precisão dos cálculos

Os números são ancorados num documento real da Caixa, e o conjunto de testes
em `testes/caso-caixa-real.mjs` trava isso:

- **Taxa mensal = juros nominais ÷ 12** (convenção da Caixa). A prova está no
  próprio documento: "Juros Nominais 4,5000% a.a." junto de "Juros Efetivos
  4,5940% a.a." — e `(1 + 0,045/12)^12 − 1 = 4,5940%`. Equivalência geométrica
  devolveria 4,5000% e não fecharia com o papel.
- **A "1ª Prestação" do documento é o encargo total**, não só amortização +
  juros. No caso real, Price puro dá R$ 784,71 e o documento diz R$ 817,26; a
  diferença de R$ 32,55 é seguro MIP/DFI e tarifa. O app extrai isso do próprio
  documento para a parcela exibida bater com o que o cliente tem na mão.
- **Entrada = compra e venda − financiamento − subsídio**, que reproduz o
  "Valor da Entrada" impresso.
- Correção de INCC composta, juros de obra sobre saldo liberado, e aportes
  extraordinários que reduzem prazo mantendo a parcela.

Estimativas são sinalizadas como tais na interface (INCC, juros de obra,
acúmulo de FGTS sem rendimento do fundo).

## Rodando os testes

```
cd testes
node caso-caixa-real.mjs
node motor-amortizacao.mjs
```

## Stack
Site estático — HTML/CSS/JS em módulos ES, sem build. `assets/vendor/` traz o
Chart.js embarcado (sem CDN, funciona offline). Persistência por cliente via
IndexedDB. Instalável como PWA (manifest + service worker cache-first).

## Rodando localmente
```
python3 -m http.server 8000
```
e abra `http://localhost:8000/index.html`.

## Deploy
Publicado no **Netlify** a partir da branch principal (o `netlify.toml`
publica a raiz do repositório).
