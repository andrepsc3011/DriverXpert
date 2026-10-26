import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppLang = 'pt' | 'en';

export interface ManualSection {
  id: string;
  icon: string;
  title: string;
  badge?: string;
  summary: string;
  items: {
    name: string;
    description: string;
    tip?: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private platformId = inject(PLATFORM_ID);

  currentLang = signal<AppLang>('pt');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const saved = localStorage.getItem('applet_lang') as AppLang;
        if (saved === 'pt' || saved === 'en') {
          this.currentLang.set(saved);
        }
      } catch {
        // fallback
      }
    }
  }

  setLanguage(lang: AppLang) {
    this.currentLang.set(lang);
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem('applet_lang', lang);
      } catch {
        // storage disabled
      }
    }
  }

  private translationsPt: Record<string, string> = {
    // App Header
    'app.title': 'DRIVER XPERT',
    'app.subtitle': 'Telemetria & Assistente',
    'app.driver': 'Piloto',
    'app.track': 'Pista',
    'app.date': 'Data',
    'app.time': 'Horário',
    'app.catalog': 'Catálogo',
    'app.catalog.title': 'Catálogo Completo de Sessões',
    'app.importData': 'Importar Dados',
    'app.settings': 'Configurações & Manual',
    'app.searchSession': 'Buscar por piloto, pista, data...',
    'app.totalSessions': 'Sessões',
    'app.totalDrivers': 'Pilotos',
    'app.sessionsCount': 'sessões registradas',
    'app.close': 'Fechar',

    // Main Tabs
    'tab.resume': 'Resumo da Sessão',
    'tab.charts': 'Telemetria Detalhada',
    'tab.delta': 'Análise de Delta',
    'tab.coaching': 'Assistente de Desempenho',
    'tab.map': 'Mapa de Pista & Heatmap',

    // Tab Tooltips
    'tab.resume.desc': 'Resumo geral de desempenho, melhores parciais e tempos',
    'tab.charts.desc': 'Gráficos sincronizados de velocidade, frenagem, forças G e altitude',
    'tab.delta.desc': 'Comparação direta curva a curva de ganho e perda de tempo',
    'tab.coaching.desc': 'Assistente de desempenho com diagnóstico técnico de curvas, freada e aceleração',
    'tab.map.desc': 'Visão de satélite com comparação de duas voltas, mapa térmico e delta de eficiência',

    // Session Resume Cards
    'resume.bestPersonal': 'Melhor Volta',
    'resume.idealLap': 'Volta Ideal',
    'resume.consistency': 'Consistência',
    'resume.topSpeed': 'Velocidade Máxima',
    'resume.potentialGain': 'Ganho Potencial',
    'resume.basedOn': 'Baseado em',
    'resume.laps': 'voltas',
    'resume.lap': 'Volta',
    'resume.officialSubtab': 'Voltas Oficiais',
    'resume.miniSubtab': 'Mini Setores',
    'resume.noResumeData': 'Sem Dados de Resumo',
    'resume.noResumeDataDesc': 'Carregue arquivos de telemetria ou RESUME.json para ver o resumo completo.',
    
    // Laps Table
    'table.lap': 'Volta',
    'table.time': 'Tempo',
    'table.s1': 'Setor 1',
    'table.s2': 'Setor 2',
    'table.s3': 'Setor 3',
    'table.speed': 'V. Máx',
    'table.status': 'Status',
    'table.bestBadge': 'MELHOR',
    'table.worstBadge': 'LENTA',
    'table.paradaBadge': 'PARADA',
    'table.outlierBadge': 'ANÔMALA',
    'table.normalBadge': 'NORMAL',
    'table.theoreticalBest': 'Melhor Teórico',
    'table.theoreticalBestDesc': 'Soma de todos os melhores mini setores',
    'table.sectorSize': 'Tamanho do Setor:',
    'table.generateVirtualLap': 'Gerar Volta Virtual',

    // Detailed Telemetry
    'charts.syncedChannels': 'Canais Sincronizados',
    'charts.liveLink': 'Sincronismo Ativo',
    'charts.scrollToZoom': 'Role o mouse para Zoom',
    'charts.speed': 'Velocidade',
    'charts.braking': 'Frenagem & G Long.',
    'charts.latAccel': 'Aceleração Lateral (G)',
    'charts.longAccel': 'Aceleração Long. (G)',
    'charts.altitude': 'Altitude (m)',
    'charts.gCircle': 'Diagrama G-G (G-Circle)',
    'charts.lapsTitle': 'Voltas',
    'charts.selectAll': 'Todas',
    'charts.selectBest': 'Melhor',
    'charts.clear': 'Limpar',
    'charts.virtualBest': 'Melhor Virtual',
    'charts.collapse': 'Recolher / Expandir barra lateral',

    // Delta Tab
    'delta.title': 'Comparação de Delta Temporal',
    'delta.subtitle': 'Diferença de tempo e velocidade entre duas voltas ao longo do traçado',
    'delta.refLap': 'Volta de Referência (Base)',
    'delta.compLap': 'Volta de Comparação',
    'delta.swap': 'Inverter Voltas',
    'delta.resolution': 'Resolução:',
    'delta.bars': 'barras',
    'delta.toggleCurve': 'Curva Contínua',
    'delta.maxGain': 'Maior Ganho',
    'delta.maxLoss': 'Maior Perda',
    'delta.netDelta': 'Delta Líquido',
    'delta.gainedSegments': 'Trechos com Ganho',
    'delta.lostSegments': 'Trechos com Perda',
    'delta.timeGained': 'Tempo Ganho',
    'delta.timeLost': 'Tempo Perdido',
    'delta.legendFaster': 'Comp mais Rápida (Ganho)',
    'delta.legendSlower': 'Comp mais Lenta (Perda)',
    'delta.cursorDistance': 'Distância:',
    'delta.cursorDelta': 'Diferença de Tempo:',
    'delta.cursorDeltaSpeed': 'Diferença de Velocidade:',

    // Corner Coaching
    'coaching.refLabel': 'Ref (Base):',
    'coaching.compLabel': 'Comp:',
    'coaching.swapTitle': 'Inverter Voltas (Base ⇄ Comparação)',
    'coaching.best2Laps': 'Melhores 2 Voltas',
    'coaching.best2Active': 'Melhores Voltas Ativas',
    'coaching.cornerScore': 'Pontuação de Curvas:',
    'coaching.deltaCorners': 'Δ Curvas:',
    'coaching.gained': 'Ganhas',
    'coaching.lost': 'Perdidas',
    'coaching.identicalLaps': 'Voltas Idênticas (Delta Zero)',
    'coaching.identicalLapsDesc': 'A volta de Referência e Comparação são idênticas. Todas as métricas de delta são zero. Selecione outra volta para comparar.',
    'coaching.compare2Best': 'Comparar 2 Melhores Voltas',
    'coaching.opportunitiesTitle': 'Oportunidades do Assistente',
    'coaching.opportunitiesSub': '3 Maiores Ganhos de Tempo Identificados',
    'coaching.inspectCard': 'Clique para inspecionar no mapa',
    'coaching.inspect': 'Inspecionar →',
    'coaching.circuitCorners': 'Curvas do Circuito',
    'coaching.brakePoint': 'Ponto de Freada',
    'coaching.entrySpeed': 'V. Entrada',
    'coaching.apexSpeed': 'V. Apex (Mín)',
    'coaching.exitSpeed': 'V. Saída',
    'coaching.cornerTime': 'Tempo Curva:',
    'coaching.drivingCoachTip': 'Dica do Assistente de Desempenho',
    'coaching.speedProfile': 'Perfil de Velocidade na Curva (Entrada ➔ Apex ➔ Saída)',
    'coaching.turnLeft': 'Curva à Esquerda',
    'coaching.turnRight': 'Curva à Direita',
    'coaching.before': 'Antes',
    'coaching.after': 'Depois',
    'coaching.fasterBadge': 'Mais Rápido',
    'coaching.slowerBadge': 'Mais Lento',
    'coaching.evenBadge': 'Equivalente',

    // Satellite Map & Skill-Heatmap
    'map.refColor': 'Cor da Trajetória',
    'map.playback': 'Reprodução',
    'map.speedLabel': 'Velocidade:',
    'map.timeLabel': 'Tempo:',
    'map.legendPeak': 'Pico',
    'map.legendMid': 'Média',
    'map.legendBraking': 'Frenagem',
    'map.modeDelta': 'Delta de Eficiência (Δv)',
    'map.modeSpeed': 'Velocidade Absoluta',
    'map.best2Laps': '2 Melhores Voltas',
    'map.swapLaps': 'Inverter Voltas (Base ⇄ Comp)',

    // Settings & Manual Pop-up
    'settings.title': 'Configurações do Sistema & Manual',
    'settings.subtitle': 'Personalize o aplicativo, alterne idioma e tema, e consulte o manual completo.',
    'settings.tabSettings': 'Preferências',
    'settings.tabManual': 'Manual do Usuário',
    'settings.languageSection': 'Idioma da Interface',
    'settings.languageDesc': 'Escolha o idioma de exibição do sistema.',
    'settings.themeSection': 'Tema Visual',
    'settings.themeDesc': 'Alterne entre o visual de alta tecnologia escuro ou o modo claro de alta luminosidade.',
    'settings.themeDark': 'Modo Escuro (Cockpit)',
    'settings.themeLight': 'Modo Claro (High Contrast)',
    'settings.version': 'Versão da Aplicação: 2.5 Pro Telemetry',

    // Diretório Persistente / Auto-Carregamento
    'settings.dirSection': 'Diretório de Telemetria (Carregamento Automático)',
    'settings.dirDesc': 'Defina uma pasta local do computador para o aplicativo carregar todas as sessões e voltas automaticamente ao abrir, sem precisar importar arquivos toda vez.',
    'settings.dirBtnDefine': 'Definir Diretório',
    'settings.dirBtnChange': 'Alterar Diretório',
    'settings.dirBtnSync': 'Sincronizar Pasta',
    'settings.dirBtnDisconnect': 'Desvincular Pasta',
    'settings.dirLinked': 'Diretório Vinculado',
    'settings.dirNotLinked': 'Nenhum diretório vinculado permanentemente. O app carrega a sessão de demonstração inicial até que uma pasta seja vinculada.',
    'settings.dirNotSupported': 'A API de Sistema de Arquivos não é suportada neste navegador. Use o botão Importar Dados tradicional ou utilize o Google Chrome / Microsoft Edge.',
    'settings.dirPermissionPrompt': 'Acesso à pasta requer confirmação de segurança do navegador.',
    'settings.dirAuthorizeBtn': 'Autorizar Leitura da Pasta',

    // Login & Autenticação
    'auth.title': 'DRIVER XPERT',
    'auth.subtitle': 'Telemetria Automotiva & Engenharia de Pista',
    'auth.badge': 'Acesso Protegido',
    'auth.loginPrompt': 'Faça login com suas credenciais de piloto ou equipe para acessar o sistema.',
    'auth.user': 'Usuário / Piloto',
    'auth.userPlaceholder': 'Digite seu usuário',
    'auth.password': 'Senha de Acesso',
    'auth.passwordPlaceholder': '••••••••',
    'auth.remember': 'Manter conectado neste dispositivo',
    'auth.loginBtn': 'Entrar no Sistema',
    'auth.loggingIn': 'Acessando Cockpit...',
    'auth.activeSession': 'Sessão Ativa',
    'auth.loggedAs': 'Conectado como',
    'auth.logout': 'Sair / Bloquear'
  };

  private translationsEn: Record<string, string> = {
    // App Header
    'app.title': 'DRIVER XPERT',
    'app.subtitle': 'Telemetry & Performance Assistant',
    'app.driver': 'Driver',
    'app.track': 'Track',
    'app.date': 'Date',
    'app.time': 'Time',
    'app.catalog': 'Catalog',
    'app.catalog.title': 'Complete Sessions Catalog',
    'app.importData': 'Import Data',
    'app.settings': 'Settings & Manual',
    'app.searchSession': 'Search by driver, track, date...',
    'app.totalSessions': 'Sessions',
    'app.totalDrivers': 'Drivers',
    'app.sessionsCount': 'recorded sessions',
    'app.close': 'Close',

    // Main Tabs
    'tab.resume': 'Session Resume',
    'tab.charts': 'Detailed Telemetry',
    'tab.delta': 'Delta Analysis',
    'tab.coaching': 'Performance Assistant',
    'tab.map': 'Track Map & Heatmap',

    // Tab Tooltips
    'tab.resume.desc': 'Overall performance summary, best sector splits and lap times',
    'tab.charts.desc': 'Synchronized channels for speed, braking, G-forces and elevation',
    'tab.delta.desc': 'Turn-by-turn direct comparison of lap time gains and losses',
    'tab.coaching.desc': 'Performance assistant with corner-by-corner analysis of braking, apex and exit',
    'tab.map.desc': 'Satellite track map with 2-lap comparison, speed heatmap and efficiency delta',

    // Session Resume Cards
    'resume.bestPersonal': 'Best Personal',
    'resume.idealLap': 'Ideal Lap',
    'resume.consistency': 'Consistency',
    'resume.topSpeed': 'Top Speed',
    'resume.potentialGain': 'Potential Gain',
    'resume.basedOn': 'Based on',
    'resume.laps': 'laps',
    'resume.lap': 'Lap',
    'resume.officialSubtab': 'Official Laps',
    'resume.miniSubtab': 'Mini Sectors',
    'resume.noResumeData': 'No Resume Data',
    'resume.noResumeDataDesc': 'Please upload telemetry files or RESUME.json to see session summary.',

    // Laps Table
    'table.lap': 'Lap',
    'table.time': 'Time',
    'table.s1': 'Sector 1',
    'table.s2': 'Sector 2',
    'table.s3': 'Sector 3',
    'table.speed': 'Top Speed',
    'table.status': 'Status',
    'table.bestBadge': 'BEST',
    'table.worstBadge': 'SLOW',
    'table.paradaBadge': 'PIT STOP',
    'table.outlierBadge': 'OUTLIER',
    'table.normalBadge': 'NORMAL',
    'table.theoreticalBest': 'Theoretical Best',
    'table.theoreticalBestDesc': 'Sum of all best mini sectors',
    'table.sectorSize': 'Sector Size:',
    'table.generateVirtualLap': 'Generate Virtual Lap',

    // Detailed Telemetry
    'charts.syncedChannels': 'Synced Channels',
    'charts.liveLink': 'Live Link Active',
    'charts.scrollToZoom': 'Scroll to Zoom',
    'charts.speed': 'Speed',
    'charts.braking': 'Braking & Long. G',
    'charts.latAccel': 'Lateral G-Force (G)',
    'charts.longAccel': 'Longitudinal G-Force (G)',
    'charts.altitude': 'Altitude (m)',
    'charts.gCircle': 'G-G Diagram (G-Circle)',
    'charts.lapsTitle': 'Laps',
    'charts.selectAll': 'All',
    'charts.selectBest': 'Best',
    'charts.clear': 'Clear',
    'charts.virtualBest': 'Virtual Best',
    'charts.collapse': 'Collapse / Expand Sidebar',

    // Delta Tab
    'delta.title': 'Time Delta Comparison',
    'delta.subtitle': 'Time and speed differences between two laps throughout the circuit',
    'delta.refLap': 'Reference Lap (Base)',
    'delta.compLap': 'Comparison Lap',
    'delta.swap': 'Swap Laps',
    'delta.resolution': 'Resolution:',
    'delta.bars': 'bars',
    'delta.toggleCurve': 'Continuous Curve',
    'delta.maxGain': 'Peak Gain',
    'delta.maxLoss': 'Peak Loss',
    'delta.netDelta': 'Net Delta',
    'delta.gainedSegments': 'Gained Segments',
    'delta.lostSegments': 'Lost Segments',
    'delta.timeGained': 'Time Gained',
    'delta.timeLost': 'Time Lost',
    'delta.legendFaster': 'Comp Faster (Gain)',
    'delta.legendSlower': 'Comp Slower (Loss)',
    'delta.cursorDistance': 'Distance:',
    'delta.cursorDelta': 'Time Delta:',
    'delta.cursorDeltaSpeed': 'Speed Delta:',

    // Corner Coaching
    'coaching.refLabel': 'Ref (Base):',
    'coaching.compLabel': 'Comp:',
    'coaching.swapTitle': 'Swap Laps (Base ⇄ Comparison)',
    'coaching.best2Laps': 'Top 2 Laps',
    'coaching.best2Active': 'Top 2 Laps Active',
    'coaching.cornerScore': 'Corner Score:',
    'coaching.deltaCorners': 'Δ Corners:',
    'coaching.gained': 'Gained',
    'coaching.lost': 'Lost',
    'coaching.identicalLaps': 'Identical Laps Selected (Zero Delta)',
    'coaching.identicalLapsDesc': 'Reference and Comparison laps are identical. All delta metrics are zero. Select another lap to compare.',
    'coaching.compare2Best': 'Compare 2 Fastest Laps',
    'coaching.opportunitiesTitle': 'Assistant Opportunities',
    'coaching.opportunitiesSub': 'Top 3 Identified Lap Time Opportunities',
    'coaching.inspectCard': 'Click card to inspect on track',
    'coaching.inspect': 'Inspect →',
    'coaching.circuitCorners': 'Circuit Corners',
    'coaching.brakePoint': 'Braking Point',
    'coaching.entrySpeed': 'Entry Speed',
    'coaching.apexSpeed': 'Apex Speed (Min)',
    'coaching.exitSpeed': 'Exit Speed',
    'coaching.cornerTime': 'Corner Time:',
    'coaching.drivingCoachTip': 'Performance Assistant Recommendation',
    'coaching.speedProfile': 'Corner Speed Profile (Entry ➔ Apex ➔ Exit)',
    'coaching.turnLeft': 'Left Turn',
    'coaching.turnRight': 'Right Turn',
    'coaching.before': 'Earlier',
    'coaching.after': 'Later',
    'coaching.fasterBadge': 'Faster',
    'coaching.slowerBadge': 'Slower',
    'coaching.evenBadge': 'Equal',

    // Satellite Map & Skill-Heatmap
    'map.refColor': 'Trajectory Color',
    'map.playback': 'Playback',
    'map.speedLabel': 'Speed:',
    'map.timeLabel': 'Time:',
    'map.legendPeak': 'Peak',
    'map.legendMid': 'Mid',
    'map.legendBraking': 'Braking',
    'map.modeDelta': 'Efficiency Delta (Δv)',
    'map.modeSpeed': 'Absolute Speed',
    'map.best2Laps': 'Top 2 Laps',
    'map.swapLaps': 'Swap Laps (Base ⇄ Comp)',

    // Settings & Manual Pop-up
    'settings.title': 'System Settings & User Manual',
    'settings.subtitle': 'Customize the application, switch language and theme, and explore the complete manual.',
    'settings.tabSettings': 'Preferences',
    'settings.tabManual': 'User Manual',
    'settings.languageSection': 'Interface Language',
    'settings.languageDesc': 'Choose your preferred language for the application.',
    'settings.themeSection': 'Visual Theme',
    'settings.themeDesc': 'Toggle between the high-tech dark cockpit theme or clean high-contrast light mode.',
    'settings.themeDark': 'Dark Mode (Cockpit)',
    'settings.themeLight': 'Light Mode (High Contrast)',
    'settings.version': 'Application Version: 2.5 Pro Telemetry',

    // Persistent Directory / Auto-Load
    'settings.dirSection': 'Telemetry Directory (Auto-Load)',
    'settings.dirDesc': 'Define a local computer folder for the application to load all sessions and laps automatically on startup, without having to import files every time.',
    'settings.dirBtnDefine': 'Define Directory',
    'settings.dirBtnChange': 'Change Directory',
    'settings.dirBtnSync': 'Sync Folder',
    'settings.dirBtnDisconnect': 'Disconnect Folder',
    'settings.dirLinked': 'Linked Directory',
    'settings.dirNotLinked': 'No persistent directory linked. The app loads the initial demo session until a folder is linked.',
    'settings.dirNotSupported': 'The File System Access API is not supported in this browser. Please use standard Import Data or use Google Chrome / Microsoft Edge.',
    'settings.dirPermissionPrompt': 'Folder access requires browser security authorization.',
    'settings.dirAuthorizeBtn': 'Authorize Folder Read Access',

    // Login & Authentication
    'auth.title': 'DRIVER XPERT',
    'auth.subtitle': 'Automotive Telemetry & Track Engineering',
    'auth.badge': 'Protected Access',
    'auth.loginPrompt': 'Sign in with your driver or crew credentials to enter the system.',
    'auth.user': 'Username / Driver',
    'auth.userPlaceholder': 'Enter your username',
    'auth.password': 'Access Password',
    'auth.passwordPlaceholder': '••••••••',
    'auth.remember': 'Keep signed in on this device',
    'auth.loginBtn': 'Enter Cockpit',
    'auth.loggingIn': 'Entering Cockpit...',
    'auth.activeSession': 'Active Session',
    'auth.loggedAs': 'Signed in as',
    'auth.logout': 'Sign Out / Lock'
  };

  t(key: string): string {
    const lang = this.currentLang();
    const dict = lang === 'pt' ? this.translationsPt : this.translationsEn;
    return dict[key] || this.translationsPt[key] || key;
  }

  manualSections = computed<ManualSection[]>(() => {
    const isPt = this.currentLang() === 'pt';

    if (isPt) {
      return [
        {
          id: 'sessions',
          icon: 'folder_open',
          title: '1. Gestão de Sessões & Importação',
          badge: 'Navegação',
          summary: 'Como navegar entre pilotos, pistas, datas e importar dados de telemetria.',
          items: [
            {
              name: 'Seletores em Cascata (Cabeçalho)',
              description: 'Localizados no topo do aplicativo, permitem filtrar instantaneamente o Piloto, Autódromo/Pista, Data do Treino e Horário da Sessão. A troca de qualquer seletor atualiza todos os gráficos e telas instantaneamente.',
              tip: 'Use o botão "Catálogo" (ícone de grade) para pesquisar sessões por nome de piloto ou circuito com facilidade.'
            },
            {
              name: 'Importar Dados (Botão Superior)',
              description: 'Permite carregar pastas inteiras de perfis ou arquivos JSON gravados pelo registrador de dados do carro. O sistema organiza automaticamente arquivos de volta (LAP1.json, LAP2.json...) e o arquivo de resumo (RESUME.json).',
              tip: 'Você pode selecionar uma pasta raiz contendo múltiplos pilotos e treinos simultâneos.'
            },
            {
              name: 'Catálogo Completo de Sessões',
              description: 'Abre uma janela modal que lista todas as sessões carregadas, exibindo o piloto, a pista, o melhor tempo registrado e a quantidade de voltas completadas.'
            },
            {
              name: 'Definir Diretório Automático (Configurações)',
              description: 'No menu Configurações (ícone de engrenagem), você pode vincular uma pasta de telemetria local uma única vez. O aplicativo memoriza o diretório e recarrega os arquivos automaticamente toda vez que for aberto, sem precisar selecionar arquivos manualmente.',
              tip: 'Use o botão de sincronização no cabeçalho ou nas configurações se novos arquivos de volta forem adicionados enquanto o app estiver aberto.'
            }
          ]
        },
        {
          id: 'resume',
          icon: 'summarize',
          title: '2. Aba: Resumo da Sessão (Session Resume)',
          badge: 'Visão Geral',
          summary: 'Métricas executivas de performance, consistência e análise de setores.',
          items: [
            {
              name: 'Cards de Performance Superior',
              description: '• Melhor Volta Pessoal: Tempo da volta mais rápida válida do treino.\n• Volta Ideal (Ideal Lap): Soma dos melhores setores parciais (S1 + S2 + S3).\n• Consistência (%): Índice matemático de estabilidade do ritmo do piloto.\n• Velocidade Máxima: Pico de velocidade em km/h atingido na sessão.'
            },
            {
              name: 'Tabela Oficial de Voltas',
              description: 'Apresenta todas as voltas cronometradas da sessão com parciais S1, S2, S3 e velocidade máxima. O sistema identifica automaticamente a melhor volta (verde), a mais lenta (vermelho), paradas no box e voltas de desaceleração (outliers).'
            },
            {
              name: 'Mini Setores (Segmentos Métricos)',
              description: 'Divide o traçado do autódromo em segmentos fixos (ex: 200m). Para cada segmento, identifica qual volta completou o trecho mais rápido, possibilitando a geração de uma "Volta Virtual Perfeita" somando cada micro-setor ótimo.'
            }
          ]
        },
        {
          id: 'charts',
          icon: 'query_stats',
          title: '3. Aba: Telemetria Detalhada dos Canais',
          badge: 'Análise D3',
          summary: 'Gráficos científicos sincronizados por distância métrica e diagrama de aceleração.',
          items: [
            {
              name: 'Canais Sincronizados por Distância (Eixo X)',
              description: '• Velocidade (km/h): Traçado de aceleração e velocidade final nas retas.\n• Frenagem & G Longitudinal: Desaceleração em frenagens fortes e tração.\n• G Lateral: Força de apoio nas curvas (curvas para esquerda e direita).\n• Altitude (m): Relevo, subidas e descidas do circuito.',
              tip: 'Passe o cursor sobre qualquer gráfico para visualizar o ponto sincronizado exato em todos os canais e no mapa de satélite.'
            },
            {
              name: 'Diagrama G-G (G-Circle)',
              description: 'Representa a elipse de atrito e aderência dos pneus. Permite avaliar o uso combinado de freio com volante (trail braking) e a capacidade do piloto de explorar o limite de aderência do veículo.'
            },
            {
              name: 'Player de Reprodução & Zoom',
              description: 'Permite dar play na volta com velocidades ajustáveis (0.5x, 1x, 2x, 5x) e usar o scroll do mouse para dar zoom em trechos específicos do circuito.'
            },
            {
              name: 'Barra Lateral de Voltas (Voltas)',
              description: 'Permite selecionar múltiplas voltas simultâneas para sobreposição nos gráficos com cores distintas, ou ativar a volta virtual ótima calculada.'
            }
          ]
        },
        {
          id: 'delta',
          icon: 'compare_arrows',
          title: '4. Aba: Análise de Delta Temporal (Delta Analysis)',
          badge: 'Comparativo',
          summary: 'Entenda exatamente onde você ganhou ou perdeu centésimos de segundo.',
          items: [
            {
              name: 'Gráfico de Barras de Delta',
              description: 'Compara duas voltas (Referência vs Comparação) dividindo a volta em barras (resolução configurável). Barras verdes indicam trechos em que a volta de comparação foi mais rápida; barras vermelhas indicam perda de tempo.',
              tip: 'Use o botão de alternar resolução para visualizar desde setores macro até micro-comparações métricas.'
            },
            {
              name: 'Curva Contínua de Delta Temporal',
              description: 'Uma linha contínua que mostra o avanço cumulativo da diferença de tempo (em segundos). Se a curva sobe, o piloto está perdendo tempo; se a curva desce, está recuperando tempo.'
            },
            {
              name: 'Traçado Interativo com Mapa Delta',
              description: 'Desenha a pista completa com os segmentos pintados em verde e vermelho. Passando o mouse sobre a pista, você vê instantaneamente a diferença de tempo e de velocidade naquele ponto exato.'
            }
          ]
        },
        {
          id: 'coaching',
          icon: 'sports_score',
          title: '5. Aba: Assistente de Desempenho (Análise de Curvas)',
          badge: 'Assistente',
          summary: 'Diagnóstico automatizado de curvas com pontos de freada, ápice e velocidade de saída.',
          items: [
            {
              name: 'Inicialização Automática com as 2 Melhores Voltas',
              description: 'Ao entrar no Assistente de Desempenho, o sistema inicializa automaticamente a 1ª Melhor Volta como Referência e a 2ª Melhor Volta como Comparação, garantindo uma comparação realista entre as duas melhores passagens do piloto.',
              tip: 'O botão "Melhores 2 Voltas" pisca com indicador ativo e permite restaurar esse modo ideal a qualquer momento.'
            },
            {
              name: 'Métricas dos 4 Pilares da Curva',
              description: 'Para cada curva detectada:\n1. Ponto de Freada (metros antes ou depois da referência);\n2. Velocidade de Entrada (km/h);\n3. Velocidade no Apex / Ápice (velocidade mínima de contorno);\n4. Velocidade de Saída (km/h na retomada plena de aceleração).'
            },
            {
              name: 'Dicas do Assistente de Desempenho',
              description: 'Instruções técnicas objetivas geradas pelo sistema, apontando se o piloto freou muito antes, sobrecarregou a entrada, perdeu velocidade no ápice ou demorou a acelerar na saída.'
            },
            {
              name: 'Ribbon de Oportunidades (Top 3 Ganhos)',
              description: 'Destaca os 3 pontos da pista onde o piloto tem o maior potencial de ganho de tempo imediato. Clicar em um card foca automaticamente os dados e o traçado daquela curva.'
            }
          ]
        },
        {
          id: 'map',
          icon: 'satellite_alt',
          title: '6. Aba: Mapa de Pista & Heatmap Unificado',
          badge: 'Satélite & GPS',
          summary: 'Trajetórias por satélite com comparação de duas voltas e alternância entre mapa térmico de velocidade e delta de eficiência.',
          items: [
            {
              name: 'Comparação de Duas Voltas (Referência vs Comparação)',
              description: 'Exibe a volta base e a volta de comparação diretamente sobre as fotos aéreas de satélite, com atalho para as duas melhores voltas e inversão com um clique.'
            },
            {
              name: 'Camada de Velocidade Absoluta',
              description: 'Coloração em gradiente da velocidade física do carro (verde para pico, amarelo para média, vermelho para frenagens), identificando pontos de máxima e mínima.'
            },
            {
              name: 'Camada de Delta de Eficiência (Δv)',
              description: 'Pinta o circuito com a diferença relativa de velocidade entre as duas voltas (+5 km/h a -5 km/h) e sobrepõe a trajetória de referência em cor sólida personalizável.'
            },
            {
              name: 'Player Unificado & HUD do Veículo',
              description: 'Controle de reprodução (Play, Pause, velocidades de 0.5x a 5x) com avanço do carrinho e telemetria instantânea sincronizada na pista.'
            }
          ]
        },
        {
          id: 'preferences',
          icon: 'tune',
          title: '7. Personalização, Idiomas e Temas',
          badge: 'Preferências',
          summary: 'Alterne idioma e temas visual de acordo com seu ambiente de uso.',
          items: [
            {
              name: 'Seleção de Idioma (Português-BR / English)',
              description: 'Alterne instantaneamente todos os menus, métricas, tabelas, gráficos e dicas de pilotagem entre Português do Brasil e Inglês com salvamento automático de preferência.'
            },
            {
              name: 'Tema Escuro (Cockpit Esportivo)',
              description: 'Desenvolvido para ambientes fechados e uso em boxes/garagens, com fundo de fibra de carbono grafite e alto contraste para canais de telemetria coloridos.'
            },
            {
              name: 'Tema Claro (High Contrast Daylight)',
              description: 'Desenvolvido para leitura sob luz solar direta em pit lanes ou tendas de autódromo, com fundo claro neutro e legendas de máxima legibilidade.'
            }
          ]
        }
      ];
    } else {
      return [
        {
          id: 'sessions',
          icon: 'folder_open',
          title: '1. Session Management & Data Import',
          badge: 'Navigation',
          summary: 'How to navigate drivers, tracks, dates, and import telemetry logs.',
          items: [
            {
              name: 'Cascading Selectors (Header)',
              description: 'Located at the top header, they let you filter Driver, Track/Circuit, Date, and Session Time instantly. Changing any selector updates all charts and screens in real-time.',
              tip: 'Use the "Catalog" button (grid icon) to search sessions by driver name or circuit with ease.'
            },
            {
              name: 'Import Data (Top Button)',
              description: 'Allows loading entire profile folders or JSON files recorded by vehicle data loggers. The app automatically recognizes lap files (LAP1.json, LAP2.json...) and summary files (RESUME.json).',
              tip: 'You can select a root folder containing multiple drivers and track sessions at once.'
            },
            {
              name: 'Complete Sessions Catalog',
              description: 'Opens a modal window listing all loaded sessions, showing driver, track, best lap time recorded, and total completed laps.'
            },
            {
              name: 'Automatic Telemetry Directory (Settings)',
              description: 'In the Settings menu (gear icon), you can link a local telemetry folder once. The application stores the directory reference and automatically loads the files on every visit without having to import files manually.',
              tip: 'Use the sync button in the header or in settings if new session files are recorded while the app is running.'
            }
          ]
        },
        {
          id: 'resume',
          icon: 'summarize',
          title: '2. Tab: Session Resume',
          badge: 'Overview',
          summary: 'Executive performance metrics, consistency scoring, and sector split analysis.',
          items: [
            {
              name: 'Top Performance Cards',
              description: '• Best Personal Lap: Fastest valid lap time of the session.\n• Ideal Lap: Sum of all personal best sector splits (S1 + S2 + S3).\n• Consistency (%): Mathematical stability score of driver pace.\n• Top Speed: Maximum velocity reached in km/h.'
            },
            {
              name: 'Official Laps Table',
              description: 'Displays all timed laps with S1, S2, S3 splits and top speed. The system automatically tags the best lap (green), slowest lap (red), pit stops, and out-of-rhythm outlier laps.'
            },
            {
              name: 'Mini Sectors (Metric Segments)',
              description: 'Divides the circuit into fixed distance intervals (e.g. 200m). For each segment, it pinpoints which lap was quickest, allowing the generation of a theoretical "Virtual Best Lap".'
            }
          ]
        },
        {
          id: 'charts',
          icon: 'query_stats',
          title: '3. Tab: Detailed Telemetry Channels',
          badge: 'D3 Analysis',
          summary: 'Synchronized scientific graphs aligned by track distance and friction ellipse.',
          items: [
            {
              name: 'Synchronized Distance Channels (X-Axis)',
              description: '• Speed (km/h): Acceleration traces and straight-line top speeds.\n• Braking & Long. G: Deceleration during hard braking and corner exit traction.\n• Lateral G: Cornering grip forces (left vs right turns).\n• Altitude (m): Elevation profile, climbs and downhills.',
              tip: 'Hover over any chart to inspect synchronized crosshair markers across all channels and the satellite map.'
            },
            {
              name: 'G-G Friction Diagram (G-Circle)',
              description: 'Visualizes the tyre friction circle and cornering grip envelope. Helps evaluate trail braking and how well the driver exploits vehicle grip limits.'
            },
            {
              name: 'Playback Player & Zooming',
              description: 'Allows playing the lap with adjustable playback speeds (0.5x, 1x, 2x, 5x) and using mouse wheel to zoom into specific corners.'
            },
            {
              name: 'Laps Sidebar',
              description: 'Allows selecting multiple laps simultaneously for overlay chart analysis with distinct colors, or toggling the virtual best lap.'
            }
          ]
        },
        {
          id: 'delta',
          icon: 'compare_arrows',
          title: '4. Tab: Time Delta Analysis',
          badge: 'Comparison',
          summary: 'Discover precisely where hundredths of a second were won or lost.',
          items: [
            {
              name: 'Delta Bar Chart',
              description: 'Compares two laps (Reference vs Comparison) divided into discrete bars. Green bars indicate segments where the comparison lap was faster; red bars indicate lost time.',
              tip: 'Use the resolution dropdown to toggle between broad sector views and high-density metric intervals.'
            },
            {
              name: 'Continuous Cumulative Time Curve',
              description: 'A smooth curve showing cumulative time gap (in seconds). An upward slope indicates time loss; a downward slope indicates time gain.'
            },
            {
              name: 'Interactive Delta Track Map',
              description: 'Renders the circuit map colored by delta gains (green) and losses (red). Hovering over the track reveals exact time and speed differentials.'
            }
          ]
        },
        {
          id: 'coaching',
          icon: 'sports_score',
          title: '5. Tab: Performance Assistant (Turn Analysis)',
          badge: 'Assistant',
          summary: 'Automated corner breakdown with braking points, apex speed, and exit velocity.',
          items: [
            {
              name: 'Auto-Initialization with Top 2 Laps',
              description: 'When opening Performance Assistant, the system automatically selects the #1 Best Lap as Reference and the #2 Best Lap as Comparison, providing the ultimate benchmark comparison.',
              tip: 'The "Top 2 Laps" button highlights with an active pulse indicator and allows restoring this mode anytime.'
            },
            {
              name: '4 Corner Pillars Metrics',
              description: 'For every detected corner:\n1. Braking Point (meters earlier or later);\n2. Entry Speed (km/h);\n3. Apex Speed (minimum cornering speed);\n4. Exit Speed (km/h at throttle pickup).'
            },
            {
              name: 'Performance Assistant Recommendations',
              description: 'Objective performance cues highlighting whether the driver braked too early, overslowed the car, carried too little apex speed, or delayed throttle application.'
            },
            {
              name: 'Top 3 Opportunities Ribbon',
              description: 'Highlights the 3 biggest time-loss corners on the track. Clicking any card immediately focuses on that corner telemetry trace and map position.'
            }
          ]
        },
        {
          id: 'map',
          icon: 'satellite_alt',
          title: '6. Tab: Unified Track Map & Heatmap',
          badge: 'Satellite & GPS',
          summary: 'High-definition satellite map with 2-lap comparison, toggling between speed heatmap and efficiency delta.',
          items: [
            {
              name: 'Two-Lap Comparison (Reference vs Comparison)',
              description: 'Compares the benchmark lap against the target lap directly on top of satellite imagery, with swap and top 2 laps shortcuts.'
            },
            {
              name: 'Absolute Speed Layer',
              description: 'Colors the circuit by vehicle speed gradient (green for peak velocity, yellow for mid speed, red for braking), highlighting top and lowest speed points.'
            },
            {
              name: 'Efficiency Delta Layer (Δv)',
              description: 'Paints the track with the speed differential between the two laps (+5 km/h to -5 km/h) and overlays the reference lap trajectory with custom color.'
            },
            {
              name: 'Unified Player & Live HUD',
              description: 'Playback console (Play, Pause, speeds 0.5x to 5x) with vehicle marker moving along the circuit showing synchronized telemetry.'
            }
          ]
        },
        {
          id: 'preferences',
          icon: 'tune',
          title: '7. Preferences, Languages & Themes',
          badge: 'Settings',
          summary: 'Switch languages and visual themes according to your environment.',
          items: [
            {
              name: 'Language Selection (Português-BR / English)',
              description: 'Seamlessly toggle all interface elements, charts, tables, cards, and coaching cues between Brazilian Portuguese and English.'
            },
            {
              name: 'Dark Mode (Racing Cockpit)',
              description: 'Optimized for pit garages and indoor environments with a sleek carbon dark palette and vibrant telemetry accents.'
            },
            {
              name: 'Light Mode (High Contrast Daylight)',
              description: 'Optimized for outdoor sunlight on pit walls, featuring crisp contrast and high legibility.'
            }
          ]
        }
      ];
    }
  });
}
