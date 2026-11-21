# Cercado

Jogo de estratégia para 2 jogadores: mova suas peças, levante muros e cerque o maior território.

👉 **Jogar:** https://mourafelipe.github.io/cercado/

## Modos
- **Online com um amigo:** um cria a sala e manda o código (ou o link); cada um joga no seu celular.
- **Contra o computador:** níveis Fácil e Normal.
- **2 jogadores no mesmo aparelho.**

## Regras
1. Tabuleiro 7×7. Cada jogador começa com 2 peças e coloca mais 2 (ordem 1 · 2 · 2 · 1).
2. Na vez: ande com uma peça até 2 casas (horizontal/vertical, pode fazer curva ou ficar parado), sem atravessar muros ou peças.
3. Depois de andar, levante um muro em um lado livre da casa onde a peça parou.
4. 🔨 Uma vez por partida, antes de andar, dá para derrubar um muro que encosta numa peça sua.
5. Quando nenhuma área tiver peças dos dois jogadores juntas, o jogo acaba: cada área só com peças suas vale 1 ponto por casa. Empate: vence a maior área única.

## Arquivos
- `engine.js`: regras e computador
- `index.html`: interface e modo online
- `peerjs.min.js`: conexão entre os dois celulares (PeerJS, licença MIT)
