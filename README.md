# Acelerador de Quitação

**No ar:** <https://planilha.marcotulio.pro>

Ferramenta offline do corretor para a mesa de negociação MCMV. Parte da
**simulação de aprovação da Caixa** que o correspondente envia e monta o
argumento completo para o cliente: o que o banco aprovou, como fechar a
entrada com a construtora, e quanto de juros e de tempo a amortização
estratégica economiza depois das chaves.

Cada cliente é um caso salvo só no dispositivo — nada é enviado a servidores.

O corretor abre o app num **hub** com todos os clientes cadastrados: quem está
em dia, quem pede atenção, o total acompanhado, e um botão para entregar o
controle a cada cliente.

## Fluxo (5 passos)

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
5. **O controle mês a mês** — a tela do cliente, em cinco abas:
   - *Resumo*: onde ele está, quanto da dívida já quitou, quando quita, e dois
     gráficos — a dívida caindo no ritmo dele contra o ritmo mínimo (com o mês
     atual marcado), e para onde vai cada prestação (juros vs amortização).
   - *Painel* também mostra o **patrimônio**: o valor de mercado informado menos
     a dívida, com quanto do imóvel já é do cliente. Cada real amortizado vira
     patrimônio na hora — é o argumento que fecha a conversa.
   - *Evolução* traz o **extrato ano a ano** no formato do extrato de imposto de
     renda da Caixa: quanto abateu a dívida e quanto foi juros em cada ano, e em
     que ano a amortização finalmente supera os juros.
   - *Simular*: o cliente digita um valor e vê, lado a lado, o que acontece
     reduzindo o **prazo** e reduzindo a **prestação** — com a repartição entre
     juros corridos e abatimento real, como na tela "Reduzir saldo ou quitar" do
     app da Caixa. Pode registrar o aporte no próprio controle.
   - *Meses*: o cronograma com datas reais, encadeando as parcelas da
     construtora e a prestação da Caixa pela entrega das chaves. Ele marca o
     que pagou, informa o valor real do boleto e registra os aportes que fez —
     o saldo devedor e a data de quitação se movem conforme cumpre (ou não) o
     plano.
   - *Planilha*: todas as prestações do financiamento, uma por linha, até a
     quitação, com prestação, juros, amortização, seguros, aporte e saldo.
     Exportável em CSV para o Excel.

   O corretor entrega essa tela por um link — o caso vai codificado dentro do
   próprio link e é importado no aparelho do cliente, sem servidor.

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
node testes/caso-caixa-real.mjs         # trava os números do documento oficial
node testes/motor-amortizacao.mjs       # SAC/Price, FGTS, 13º, INCC, juros de obra
node testes/cronograma.mjs              # datas, as duas fases e o controle mês a mês
node testes/verificar-anonimizacao.mjs  # varre o repo por dado pessoal
```

## Quer ajudar?

Leia o **[CONTRIBUTING.md](CONTRIBUTING.md)**. Ele traz o glossário do domínio
(dá para contribuir sem entender nada de financiamento imobiliário), o mapa da
arquitetura, os invariantes de cálculo que não podem ser quebrados e as
convenções do projeto.

Duas regras valem desde já: **nenhum dado real de cliente entra no
repositório** (ele é público) e **o app não faz nenhuma chamada de rede** — os
dados do corretor ficam só no navegador dele.

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
Netlify publica a raiz da branch principal automaticamente a cada push (o `netlify.toml`
define isso). Produção: <https://planilha.marcotulio.pro>
