# Acelerador de Quitação

Ferramenta offline do corretor para a mesa de negociação: prova matematicamente
a economia de juros e organiza o fluxo de pagamento do cliente, com foco em
Minha Casa Minha Vida (MCMV). Cada cliente é um caso salvo só no dispositivo —
nada é enviado a servidores.

**Fluxo:** 3 telas —
1. **O Fechamento** (pré-chaves): sinal, parcelas à construtora (corrigidas
   pelo INCC estimado) e evolução de obra (juros progressivos do valor
   financiado com o banco durante a construção).
2. **A Estratégia** (pós-chaves): prazo, taxa e sistema (SAC/Price) do
   financiamento, mais o "arsenal" do cliente — FGTS (8% do salário bruto,
   saque bienal), 13º salário e aportes avulsos, todos abatendo o **prazo**
   final, não a parcela.
3. **O Choque de Realidade**: resumo do que se paga até as chaves, economia
   total de juros, tempo poupado e dois gráficos comparando o cenário cru com
   o estratégico (saldo devedor e juros acumulados).

## Stack
Site estático — HTML/CSS/JS em módulos ES, sem build. `assets/vendor/` traz o
Chart.js embarcado (sem CDN, funciona offline). Persistência por cliente via
IndexedDB no próprio navegador. Instalável como PWA (manifest + service
worker cache-first).

## Deploy
Publicado no **Netlify** a partir da branch principal (o `netlify.toml`
publica a raiz do repositório).

## Rodando localmente
```
python3 -m http.server 8000
```
e abra `http://localhost:8000/index.html`.
