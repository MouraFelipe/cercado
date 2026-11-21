# Cercado

Versão digital, pessoal e gratuita, de um jogo de tabuleiro de cercar território (regras do **Wall Go**, de *The Devil's Plan*). Nome e visual próprios.

👉 **Jogar:** https://mourafelipe.github.io/cercado/

<img src="qrcode.png" width="200" alt="QR code do Cercado">

## Modos
- **Online:** sala privada por código ou link, 2 ou 3 jogadores, cada um no seu aparelho.
- **Contra o computador:** você contra a IA (Fácil ou Normal).
- **Local:** 2 ou 3 jogadores no mesmo aparelho.

## Regras
**Confirmadas** (várias fontes concordam)
- Tabuleiro 7×7, paredes nas linhas entre as casas; a borda do tabuleiro já conta como parede.
- Ordem sorteada. Cada jogador tem 2 peças: a 1ª é posicionada na ordem e a 2ª na ordem inversa.
- Na vez: mover uma peça na horizontal/vertical, sem atravessar paredes ou peças e sem parar em casa ocupada; depois, construir 1 parede num lado livre da casa onde a peça parou.
- Fim: quando toda área fechada tem peças de um jogador só. Território = casas das áreas só com peças suas; áreas vazias não contam.
- Vence o maior território; empate → maior área única.
- 3 jogadores: cada um pode derrubar 1 parede por partida, na sua vez. Com 2 jogadores, não existe.

**Ajustáveis** (sem confirmação oficial; padrão entre parênteses)
- Distância do movimento: 0–2 casas ou 1–2 (0–2)
- Curva no movimento de 2 casas (permitida)
- Peças com 2 jogadores: 2 cada ou 4 com 2 já no tabuleiro (2 cada)
- Derrubar parede: qualquer parede encostada numa peça sua, antes de mover

**Não identificadas** (comportamento adotado)
- Jogador sem jogada possível: passa a vez.
- Limite de 90 s por jogada: não implementado (não se sabe o que acontece quando o tempo acaba).

## Desenvolvimento
- React + TypeScript + SVG (Vite). Online via PeerJS (WebRTC), sem servidor próprio.
- `src/engine/rules.ts`: motor de regras (independente da interface)
- `src/engine/ai.ts`: IA (busca de 2 níveis + avaliação de território/controle)
- `src/engine/rules.test.ts`: testes automáticos
- `npm install` · `npm test` · `npm run dev` · `npm run build` (gera `docs/`, publicado pelo GitHub Pages)
