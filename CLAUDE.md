# Instruções para agentes de IA neste repositório

Leia `CONTRIBUTING.md` antes de mexer em qualquer coisa — ele traz o glossário
do domínio (MCMV, INCC, FGTS, SAC/Price), o mapa da arquitetura e os
invariantes de cálculo. O que está aqui são as regras que não podem ser
esquecidas em nenhuma sessão.

## Anonimização é obrigatória

O repositório é **público**. Nunca escreva em arquivo, commit, mensagem de
commit, PR ou comentário:

- nome, CPF, data de nascimento, endereço, telefone, e-mail ou cidade de
  pessoa real;
- conteúdo de PDF, print ou anexo enviado pelo usuário com dados de cliente.

O usuário vai anexar documentos reais de aprovação (simulações da Caixa) para
guiar o trabalho. **Use os valores financeiros, descarte a identidade.** Ao
gravar um caso real como teste de regressão, mantenha só os números e diga
explicitamente que está anonimizado, como em `testes/caso-caixa-real.mjs`.

Em exemplos e placeholders, use nomes claramente fictícios ou texto genérico
("Nome do cliente"), nunca o nome de um cliente do usuário.

Rode `node testes/verificar-anonimizacao.mjs` antes de commitar. Ele pega
padrões (CPF, CEP, telefone, e-mail, datas), **não pega nomes próprios** —
revise o diff você mesmo.

## O repositório é escrito para outras pessoas ajudarem

Código, comentários, commits e documentação em **português**. Escreva assumindo
um desenvolvedor competente que não conhece nada de financiamento imobiliário
brasileiro: explique a origem da regra de negócio, não a sintaxe.

Comentário bom explica *por que*, citando a fonte: qual campo do documento da
Caixa, qual convenção do banco, qual regra do programa. Comentário que repete o
código em português é ruído.

Mensagens de commit descrevem a mudança e o motivo, sem jargão interno e sem
referência a ferramentas ou modelos de IA.

## Correção antes de conveniência

Este app roda ao vivo na frente de um cliente decidindo a compra de uma casa.
Um número errado custa a credibilidade do corretor.

- Toda mudança em `js/calc/` precisa de teste em `testes/`.
- Se um teste falhar, presuma que o app está errado, não o teste. Os testes
  estão ancorados em documentos oficiais da Caixa.
- Não invente parâmetro regulatório. Se não souber a regra (teto de renda,
  intervalo de saque do FGTS, subsídio), deixe configurável, marque como
  estimativa na interface e diga isso ao usuário.
- Estimativa precisa aparecer rotulada como estimativa na tela.

## Restrições técnicas

- Sem build, sem framework, sem backend. Módulos ES servidos direto.
- **Zero rede em produção**: nada de CDN, analytics ou telemetria. O app tem de
  funcionar offline e os dados do cliente não saem do aparelho. Biblioteca nova
  vai embarcada em `assets/vendor/`.
- Arquivo novo precisa entrar no `APP_SHELL` do `sw.js`, senão quebra offline.
- Mudança no formato dos dados salvos exige incrementar `versaoModelo` em
  `js/state.js` **com passo de migração** — há corretores com casos salvos no
  aparelho.
- Números digitados pelo usuário passam por `parseNum` (`js/format.js`), nunca
  por `Number()` direto.

## Deploy

Netlify publica a raiz da branch principal automaticamente a cada push.
Produção: <https://planilha.marcotulio.pro>. Não há ambiente de staging — o que
for para a branch principal vai para o ar.
