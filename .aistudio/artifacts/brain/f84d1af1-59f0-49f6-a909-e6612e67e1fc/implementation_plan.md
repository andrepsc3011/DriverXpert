# Unificação das Abas: Mapa de Pista & Heatmap (Comparativo de 2 Voltas)

Conforme solicitado, as abas **MAPA DE SATÉLITE** e **SKILL-HEATMAP** foram unificadas em uma única aba: **Mapa de Pista & Heatmap** (5 abas no total da aplicação).

### O que foi implementado:

1. **Remoção da Barra Lateral Multi-Voltas**:
   - Eliminada a coluna lateral de seleção de todas as voltas com caixas de marcação na aba de mapa.
   - O mapa de satélite agora ocupa **100% da largura** da área de trabalho, maximizando o espaço visual e imersão para o analista e piloto.

2. **Comparativo Focado em Duas Voltas**:
   - **Volta de Referência (REF)**: Seletor com tempo da volta, ranking e indicador com seletor de cor da linha de trajetória (padrão: ciano `#00e5ff`).
   - **Inverter Voltas (`swap_horiz`)**: Botão rápido para trocar instantaneamente a volta de referência pela volta de comparação.
   - **Volta de Comparação (COMP)**: Seletor com tempo da volta e ranking.
   - **Atalho "2 Melhores Voltas" (`auto_awesome`)**: Botão para selecionar diretamente as duas voltas mais rápidas da sessão com um clique.

3. **Alternador de Camadas (Layer Mode Switcher)**:
   - **Delta de Eficiência ($\Delta v$)**: Heatmap contínuo de ganho/perda de velocidade em relação à volta de referência (+5 a -5 km/h, do verde ao vermelho), sobreposto com a trajetória de referência.
   - **Velocidade Absoluta**: Heatmap de velocidade física do veículo (Pico / Média / Frenagem) com marcadores de velocidade máxima e mínima nos pontos de frenagem e tangência, sobreposto com o traçado de referência.

4. **Player de Telemetria Integrado na Barra Superior**:
   - Controles de Play/Pause, velocidade de reprodução (0.5x, 1x, 2x, 5x) e barra de progresso (scrubber).
   - Marcadores de sincronização simultânea na pista (`REF` e `COMP`) para animação lado a lado dos dois carros.

5. **Legendas Dinâmicas no Canto Inferior Esquerdo**:
   - Alternam automaticamente de acordo com o modo ativo (escala de Delta de Eficiência ou escala de Velocidade Absoluta com indicador da linha de referência).

6. **Internacionalização (PT/EN)**:
   - Todas as chaves e o Manual do Usuário (Capítulo 6) foram atualizados para refletir a aba unificada em Português e Inglês.
