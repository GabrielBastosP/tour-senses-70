# Senses Jardim Satélite · Tipo 70 m² — tour 3D

Tour interativo do apartamento tipo 70 m² do Senses (Av. Andrômeda, 867 · Jardim Satélite · São José dos Campos).

- **Planta 3D**: gire e aproxime a planta mobiliada.
- **Fachada**: o prédio inteiro no entorno real do bairro, com a unidade destacada no 6º andar.
- **Caminhar**: ande livremente pelo apartamento (WASD/mouse ou joystick no celular) e acenda/apague as luzes de cada ambiente.
- **Elevador**: entre na cabine pelo hall (ou use o botão Elevador) e escolha a planta de 37, 40, 41, 70, 73 ou 84 m², o lazer ou o rooftop.
- **Todas as plantas e áreas comuns mobiliadas em 3D** (móveis, luzes por ambiente, cortinas, porta e hall do elevador), a partir das plantas humanizadas e da implantação, com as perspectivas nos pontos de interesse.
- Iluminação de manhã, fim de tarde e noite.

- **Tour 360° renderizado** (`tour360.html`): 11 panoramas fotorrealistas em 4K, renderizados por traçado de raios (path tracing) a partir do mesmo modelo, com navegação por pontos, planta com posição e giroscópio no celular.

Abra o `index.html` (tour 3D) ou o `tour360.html` (tour 360°) pelo GitHub Pages.

Para renderizar de novo: abra `index.html?render=1` num navegador com placa de vídeo e rode `RT.batch()` no console; os panoramas e os guias de albedo/normal são baixados e depois passam pelo denoiser (Intel Open Image Denoise).

Imagens de referência e planta: material de divulgação do empreendimento. Entorno: dados © colaboradores do OpenStreetMap (ODbL). Modelo 3D ilustrativo, sem valor de projeto.
