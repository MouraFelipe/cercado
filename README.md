# Cercado

Versão digital, pessoal e gratuita, de um jogo de tabuleiro de cercar território (inspirado no **Wall Go**, de *The Devil's Plan*). Nome e visual próprios, com tema de madeira.

👉 **Jogar:** https://mourafelipe.github.io/cercado/

<img src="qrcode.png" width="200" alt="QR code do Cercado">

O mesmo jogo também roda publicado no Claude: https://claude.ai/artifact/NXcw7UTXHHvsGPg2AjVzHh

## Modos
- **Online com um amigo:** sala por código ou link, cada um no seu celular.
- **Contra o computador:** Fácil ou Normal.
- **2 jogadores neste aparelho:** passam o celular a cada jogada.

## Regras
1. **Começo:** cada jogador já tem 2 peças no tabuleiro e coloca mais 2 onde quiser (ordem: 1 · 2 · 2 · 1).
2. **Na sua vez:** escolha uma peça sua e ande até 2 casas na horizontal ou vertical (pode fazer curva ou ficar parado), sem atravessar muros nem peças.
3. **Depois de andar, levante um muro** em um dos lados livres da casa onde a peça parou. Muros não saem mais.
4. **Derrubador:** uma vez por partida, antes de andar, você pode derrubar um muro que encosta em uma peça sua.
5. **Fim:** quando nenhuma área tem peças dos dois jogadores juntas. Cada área fechada só com peças suas vale 1 ponto por casa; áreas sem peças não contam.
6. **Empate:** vence quem tiver a maior área única.
7. Jogador sem jogada possível passa a vez.

## Arquivos
- `docs/` é o site publicado pelo GitHub Pages (não precisa de build):
  - `index.html`: interface, sons e modo online
  - `engine.js`: regras do jogo e computador (sem interface)
  - `peerjs.min.js`: PeerJS 1.5.5, usado no online do site
- O modo online escolhe a conexão pelo lugar onde o jogo abre:
  - **no site:** PeerJS (WebRTC), sem servidor próprio;
  - **no Claude:** recurso de salas do Claude, porque lá a página não pode abrir WebSocket nem WebRTC.
- Os dois lados publicam o estado completo da partida com um número de sequência; vale sempre o mais novo.

## Testes
`tests/test_online.py` simula dois celulares jogando uma partida inteira online (sincronização, sala cheia, reconexão pelo link, jogar de novo e sala inexistente), sem internet:

```
pip install playwright && playwright install chromium
python tests/test_online.py site     # conexão do site (PeerJS simulado)
python tests/test_online.py claude   # conexão do Claude (sala simulada)
```

A versão anterior (React + TypeScript, com modo de 3 jogadores) continua no histórico do git, no commit `a846b01`.
