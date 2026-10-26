import { ChangeDetectionStrategy, Component, inject, OnInit, signal, computed, PLATFORM_ID, AfterViewInit, ElementRef, effect, viewChild, untracked } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TelemetryService } from './telemetry.service';
import { TrackService } from './track.service';
import { I18nService } from './i18n.service';
import { ThemeService } from './theme.service';
import { DirectoryStorageService, FileEntryItem } from './directory-storage.service';
import { AuthService } from './auth.service';
import { Lap, TelemetryPoint, SectorData, SessionItem, TreeDateNode, TreeTrackNode, TreeDriverNode, SessionFileItem, SelectorOption, DeltaSegment, DeltaComparisonData, RealtimeDeltaSnapshot, DeltaPoint, CornerData, CornerMetrics } from './models';

import type * as L_TYPES from 'leaflet';

// Using a WeakMap to store non-serializable D3 objects and instances
// to prevent serialization/cloning errors.
interface ChartInstance {
  svg: any;
  x: any;
  y: any;
  field: string;
  width: number;
  height: number;
  focusLine: any;
  focusCircles: any[];
  focusLabels: any[];
  xAxis: any;
  currentXScale: any;
  laps: Lap[];
  lineGenerator?: any;
  paths?: any[];
  updateZoom: (transform: any) => void;
  customUpdate?: (dist: number) => void;
  customHide?: () => void;
}

const APP_INTERNAL_STATE = new WeakMap<App, {
  d3: any;
  chartInstances: ChartInstance[];
  gCircleSvg: any;
  leafletMap?: L_TYPES.Map;
  leafletL?: typeof L_TYPES;
  baseLayers?: {
    esri: L_TYPES.TileLayer;
    osm: L_TYPES.TileLayer;
  };
  traceLayerGroup?: L_TYPES.LayerGroup;
  markersLayerGroup?: L_TYPES.LayerGroup;
  extremaLayerGroup?: L_TYPES.LayerGroup;
}>();

const LAP_COLORS = [
  '#00e5ff', // Cyan
  '#ff3e3e', // Red
  '#00e676', // Green
  '#ffea00', // Yellow
  '#d500f9', // Purple
  '#2979ff', // Blue
  '#ff9100', // Orange
  '#f50057', // Pink
  '#1de9b6', // Teal
  '#3d5afe', // Indigo
  '#76ff03', // Light Green
  '#ff3d00'  // Deep Orange
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit, AfterViewInit {
  telemetryService = inject(TelemetryService);
  trackService = inject(TrackService);
  platformId = inject(PLATFORM_ID);
  i18nService = inject(I18nService);
  themeService = inject(ThemeService);
  dirStorageService = inject(DirectoryStorageService);
  authService = inject(AuthService);

  // Authentication & Login Modal State
  loginUsername = signal<string>('');
  loginPassword = signal<string>('');
  loginRememberMe = signal<boolean>(false);
  loginErrorMessage = signal<string>('');
  loginIsSubmitting = signal<boolean>(false);
  loginShowPassword = signal<boolean>(false);

  toggleLoginPasswordVisibility(): void {
    this.loginShowPassword.update(v => !v);
  }

  onLoginUsernameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.loginUsername.set(target.value);
      this.loginErrorMessage.set('');
    }
  }

  onLoginPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.loginPassword.set(target.value);
      this.loginErrorMessage.set('');
    }
  }

  onLoginRememberChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.loginRememberMe.set(target.checked);
    }
  }

  fillDemoCredentials(user: string, pass: string): void {
    this.loginUsername.set(user);
    this.loginPassword.set(pass);
    this.loginErrorMessage.set('');
  }

  handleLoginSubmit(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    this.loginErrorMessage.set('');
    this.loginIsSubmitting.set(true);

    // Minor delay for slick feedback
    setTimeout(() => {
      const result = this.authService.login(
        this.loginUsername(),
        this.loginPassword()
      );
      this.loginIsSubmitting.set(false);
      if (!result.success) {
        this.loginErrorMessage.set(result.error || 'Credenciais inválidas.');
      } else {
        this.loginPassword.set('');
        this.loginErrorMessage.set('');
      }
    }, 250);
  }

  handleLogout(): void {
    this.authService.logout();
    this.loginPassword.set('');
    this.loginErrorMessage.set('');
  }

  onLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = '/logo.png';
    }
  }

  // Settings & Manual Modal State
  isSettingsModalOpen = signal<boolean>(false);
  settingsActiveTab = signal<'settings' | 'manual'>('settings');
  activeManualSection = signal<string>('sessions');

  activeManualSectionData = computed(() => {
    const sections = this.i18nService.manualSections();
    const activeId = this.activeManualSection();
    return sections.find(s => s.id === activeId) || sections[0];
  });

  openSettingsModal(tab: 'settings' | 'manual' = 'settings') {
    this.settingsActiveTab.set(tab);
    this.isSettingsModalOpen.set(true);
  }

  closeSettingsModal() {
    this.isSettingsModalOpen.set(false);
  }

  setSettingsTab(tab: 'settings' | 'manual') {
    this.settingsActiveTab.set(tab);
  }

  setActiveManualSection(id: string) {
    this.activeManualSection.set(id);
  }

  setLanguage(lang: 'pt' | 'en') {
    this.i18nService.setLanguage(lang);
  }

  setTheme(theme: 'dark' | 'light') {
    this.themeService.setTheme(theme);
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  t(key: string): string {
    return this.i18nService.t(key);
  }
  
  private speedChartContainer = viewChild<ElementRef>('speedChart');
  private latAccelChartContainer = viewChild<ElementRef>('latAccelChart');
  private longAccelChartContainer = viewChild<ElementRef>('longAccelChart');
  private altitudeChartContainer = viewChild<ElementRef>('altitudeChart');
  private timeDeltaChartContainer = viewChild<ElementRef>('timeDeltaChart');
  private brakingChartContainer = viewChild<ElementRef>('brakingChart');
  private gCircleContainer = viewChild<ElementRef>('gCircleContainer');
  private deltaTabChartContainer = viewChild<ElementRef>('deltaTabChart');
  private deltaSpeedChartContainer = viewChild<ElementRef>('deltaSpeedChart');
  private leafletMapContainer = viewChild<ElementRef>('leafletMapContainer');
  private dirPickerInput = viewChild<ElementRef<HTMLInputElement>>('dirPickerInput');

  chartOrder = signal<string[]>(['speed', 'braking', 'latAccel', 'longAccel', 'altitude']);
  collapsedCharts = signal<string[]>([]);
  private draggedChart = signal<string | null>(null);
  lapColorOverrides = signal<Record<string, string>>({});
  
  // Profile Tree & Session State
  allSessions = signal<SessionItem[]>([]);
  profileTree = signal<TreeDriverNode[]>([]);
  activeSessionKey = signal<string>('');
  activeSession = signal<SessionItem | null>(null);
  treeCollapsed = signal<boolean>(false);
  lapsSectionCollapsed = signal<boolean>(false);
  currentSessionDriver = signal<string>('FABIO');
  currentSessionTrack = signal<string>('AUTODROMO DE GOIANIA');
  currentSessionDate = signal<string>('2024-08-24');
  currentSessionTime = signal<string>('09-31-00');
  isImportingFolder = signal<boolean>(false);
  importProgressText = signal<string>('');
  linkedDirectoryName = signal<string | null>(null);
  directoryNeedsPermission = signal<boolean>(false);
  isSyncingDirectory = signal<boolean>(false);
  directorySyncStatusMessage = signal<string>('');

  totalSessionsCount = computed(() => {
    let count = 0;
    for (const d of this.profileTree()) {
      for (const t of d.tracks) {
        for (const dt of t.dates) {
          count += dt.sessions.length;
        }
      }
    }
    return count;
  });

  totalDriversCount = computed(() => this.profileTree().length);

  availableDrivers = computed<SelectorOption[]>(() => {
    return this.profileTree().map(d => ({
      value: d.driver,
      label: d.driver,
      count: d.tracks.length
    }));
  });

  availableTracks = computed<SelectorOption[]>(() => {
    const currentD = this.currentSessionDriver();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    if (!dNode) return [];
    return dNode.tracks.map(t => ({
      value: t.track,
      label: t.track,
      count: t.dates.length
    }));
  });

  availableDates = computed<SelectorOption[]>(() => {
    const currentD = this.currentSessionDriver();
    const currentT = this.currentSessionTrack();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    const tNode = dNode?.tracks.find(t => t.track === currentT);
    if (!tNode) return [];
    return tNode.dates.map(dt => ({
      value: dt.date,
      label: dt.date,
      count: dt.sessions.length
    }));
  });

  availableTimes = computed<SelectorOption[]>(() => {
    const currentD = this.currentSessionDriver();
    const currentT = this.currentSessionTrack();
    const currentDt = this.currentSessionDate();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    const tNode = dNode?.tracks.find(t => t.track === currentT);
    const dateNode = tNode?.dates.find(dt => dt.date === currentDt);
    if (!dateNode) return [];
    return dateNode.sessions.map(s => ({
      value: s.time,
      label: s.time,
      count: s.lapCount || s.lapFiles.length,
      badge: s.bestLapTime ? this.formatTime(s.bestLapTime) : undefined
    }));
  });

  async onDriverSelect(driver: string) {
    const dNode = this.profileTree().find(d => d.driver === driver);
    if (!dNode || dNode.tracks.length === 0) return;
    // Prefer matching current track if the driver has sessions at that track
    const currentT = this.currentSessionTrack();
    const track = dNode.tracks.find(t => t.track === currentT) || dNode.tracks[0];
    const currentDt = this.currentSessionDate();
    const date = track.dates.find(dt => dt.date === currentDt) || track.dates[0];
    const currentTm = this.currentSessionTime();
    const session = date?.sessions.find(s => s.time === currentTm) || date?.sessions[0];
    if (session) {
      await this.selectSession(session);
      this.setTab('resume');
    }
  }

  async onTrackSelect(track: string) {
    const currentD = this.currentSessionDriver();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    const tNode = dNode?.tracks.find(t => t.track === track);
    if (!tNode || tNode.dates.length === 0) return;
    const currentDt = this.currentSessionDate();
    const date = tNode.dates.find(dt => dt.date === currentDt) || tNode.dates[0];
    const currentTm = this.currentSessionTime();
    const session = date?.sessions.find(s => s.time === currentTm) || date?.sessions[0];
    if (session) {
      await this.selectSession(session);
      this.setTab('resume');
    }
  }

  async onDateSelect(date: string) {
    const currentD = this.currentSessionDriver();
    const currentT = this.currentSessionTrack();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    const tNode = dNode?.tracks.find(t => t.track === currentT);
    const dateNode = tNode?.dates.find(dt => dt.date === date);
    if (!dateNode || dateNode.sessions.length === 0) return;
    const currentTm = this.currentSessionTime();
    const session = dateNode.sessions.find(s => s.time === currentTm) || dateNode.sessions[0];
    if (session) {
      await this.selectSession(session);
      this.setTab('resume');
    }
  }

  async onTimeSelect(time: string) {
    const currentD = this.currentSessionDriver();
    const currentT = this.currentSessionTrack();
    const currentDt = this.currentSessionDate();
    const dNode = this.profileTree().find(d => d.driver === currentD);
    const tNode = dNode?.tracks.find(t => t.track === currentT);
    const dateNode = tNode?.dates.find(dt => dt.date === currentDt);
    const session = dateNode?.sessions.find(s => s.time === time);
    if (session) {
      await this.selectSession(session);
    }
  }

  async onDriverSelectChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    if (val) await this.onDriverSelect(val);
  }

  async onTrackSelectChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    if (val) await this.onTrackSelect(val);
  }

  async onDateSelectChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    if (val) await this.onDateSelect(val);
  }

  async onTimeSelectChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    if (val) await this.onTimeSelect(val);
  }

  selectAllLaps() {
    this.selectedLapIds.set(this.filteredLaps().map(l => l.id));
  }

  selectOnlyBestLap() {
    const best = this.bestLap();
    if (best) {
      this.selectedLapIds.set([best.id]);
    }
  }

  clearLapSelection() {
    this.selectedLapIds.set([]);
  }

  setDeltaReferenceLap(lapId: string) {
    this.deltaReferenceLapId.set(lapId);
    if (this.deltaComparisonLapId() === lapId) {
      const other = this.filteredLaps().find(l => l.id !== lapId);
      if (other) this.deltaComparisonLapId.set(other.id);
    }
    if (!this.selectedLapIds().includes(lapId)) {
      this.selectedLapIds.update(ids => [...ids, lapId]);
    }
    setTimeout(() => {
      if (this.activeTab() === 'delta') this.renderDeltaTab();
      else this.renderCharts();
    }, 50);
  }

  setDeltaComparisonLap(lapId: string) {
    this.deltaComparisonLapId.set(lapId);
    if (this.deltaReferenceLapId() === lapId) {
      const other = this.filteredLaps().find(l => l.id !== lapId);
      if (other) this.deltaReferenceLapId.set(other.id);
    }
    if (!this.selectedLapIds().includes(lapId)) {
      this.selectedLapIds.update(ids => [...ids, lapId]);
    }
    setTimeout(() => {
      if (this.activeTab() === 'delta') this.renderDeltaTab();
      else this.renderCharts();
    }, 50);
  }

  swapDeltaLaps() {
    const pair = this.deltaLapsPair();
    if (!pair) return;
    const oldRef = pair.refLap.id;
    const oldComp = pair.compLap.id;
    this.deltaReferenceLapId.set(oldComp);
    this.deltaComparisonLapId.set(oldRef);
    setTimeout(() => {
      if (this.activeTab() === 'delta') this.renderDeltaTab();
      else this.renderCharts();
    }, 50);
  }

  selectFastestTwoLaps() {
    const valid = this.getValidRacingLaps();
    const laps = valid.length >= 2 ? [...valid].sort((a, b) => a.lapTime - b.lapTime) : [...this.filteredLaps()].sort((a, b) => a.lapTime - b.lapTime);
    if (laps.length >= 2) {
      this.selectedLapIds.set([laps[0].id, laps[1].id]);
      this.deltaReferenceLapId.set(laps[0].id);
      this.deltaComparisonLapId.set(laps[1].id);
      setTimeout(() => {
        if (this.activeTab() === 'delta') this.renderDeltaTab();
        else this.renderCharts();
      }, 50);
    }
  }

  setDeltaBarResolution(resolution: number) {
    this.deltaBarResolution.set(resolution);
    setTimeout(() => {
      if (this.activeTab() === 'delta') this.renderDeltaTab();
      else this.renderCharts();
    }, 50);
  }

  toggleDeltaCurve() {
    this.deltaShowCurve.update(v => !v);
    setTimeout(() => {
      if (this.activeTab() === 'delta') this.renderDeltaTab();
      else this.renderCharts();
    }, 50);
  }

  /**
   * Robust statistical filtering to discard false/corrupted recordings
   * (e.g. milliseconds or few seconds, or with few GPS points) and identify valid racing laps.
   * Laps well below or above the normal racing window are marked as paradas (P).
   */
  getValidRacingLaps(lapsToFilter?: Lap[]): Lap[] {
    const laps = lapsToFilter || this.filteredLaps();
    if (!laps || laps.length === 0) return [];

    const realLaps = laps.filter(l => !l.id?.includes('Virtual') && !l.id?.includes('IDEAL') && l.lapTime > 0);
    if (realLaps.length === 0) return laps;

    // Minimum reasonable lap duration on a circuit is >= 15 seconds with at least 20 GPS points
    const candidates = realLaps.filter(l => l.lapTime >= 15 && (!l.points || l.points.length >= 20));
    const source = candidates.length > 0 ? candidates : realLaps.filter(l => l.lapTime >= 10);
    if (source.length === 0) return realLaps;

    const sortedTimes = source.map(l => l.lapTime).sort((a, b) => a - b);
    const median = sortedTimes[Math.floor(sortedTimes.length / 2)];

    // Minimum valid racing time: at least 60% of median and at least 15s
    const minLapTime = Math.max(15, median * 0.60);
    // Maximum valid racing time: at most 40% slower than median (pit stops / paradas)
    const maxLapTime = median * 1.40;

    const valid = source.filter(l => l.lapTime >= minLapTime && l.lapTime <= maxLapTime);
    return valid.length > 0 ? valid : source;
  }

  isLapParada(lap: Lap): boolean {
    if (!lap || lap.id?.includes('Virtual') || lap.id?.includes('IDEAL')) return false;
    // Any lap under 15 seconds or with fewer than 20 points is automatically an invalid blip / parada
    if (lap.lapTime < 15 || (lap.points && lap.points.length < 20)) return true;

    const realLaps = this.filteredLaps().filter(l => !l.id?.includes('Virtual') && !l.id?.includes('IDEAL') && l.lapTime > 0);
    if (realLaps.length <= 1) return lap.lapTime < 15;

    const candidates = realLaps.filter(l => l.lapTime >= 15 && (!l.points || l.points.length >= 20));
    if (candidates.length === 0) return lap.lapTime < 10;

    const sortedTimes = candidates.map(l => l.lapTime).sort((a, b) => a - b);
    const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const minThreshold = Math.max(15, median * 0.60);
    const maxThreshold = median * 1.40;

    return lap.lapTime < minThreshold || lap.lapTime > maxThreshold;
  }

  bestValidLap = computed<Lap | null>(() => {
    const valid = this.getValidRacingLaps().filter(l => l.id !== 'LAP-IDEAL');
    if (valid.length > 0) {
      const sorted = [...valid].sort((a, b) => a.lapTime - b.lapTime);
      const withPoints = sorted.find(l => l.points && l.points.length >= 20);
      if (withPoints) return withPoints;
      return sorted[0];
    }
    const realLaps = this.filteredLaps().filter(l => !l.id?.includes('Virtual') && l.id !== 'LAP-IDEAL' && l.lapTime >= 15);
    const sortedReal = [...realLaps].sort((a, b) => a.lapTime - b.lapTime);
    const withPoints = sortedReal.find(l => l.points && l.points.length >= 20);
    return withPoints || sortedReal[0] || this.filteredLaps().find(l => l.id !== 'LAP-IDEAL') || this.filteredLaps()[0] || null;
  });

  bestLap = computed<Lap | null>(() => {
    return this.bestValidLap();
  });

  getSortedFastestRacingLaps(lapsToFilter?: Lap[]): Lap[] {
    const rawLaps = lapsToFilter || this.filteredLaps();
    const laps = rawLaps.filter(l => !l.id?.includes('Virtual') && l.id !== 'LAP-IDEAL');
    if (!laps || laps.length === 0) return [];
    const valid = this.getValidRacingLaps(laps);
    const withPoints = valid.filter(l => l.points && l.points.length >= 20);
    const pool = withPoints.length >= 2 
      ? withPoints 
      : (valid.length >= 2 ? valid : laps.filter(l => l.points && l.points.length >= 10));
    const finalPool = pool.length > 0 ? pool : laps;
    return [...finalPool].sort((a, b) => a.lapTime - b.lapTime);
  }

  bestTwoLaps = computed<{ bestLapId: string | null; secondBestLapId: string | null }>(() => {
    const sorted = this.getSortedFastestRacingLaps();
    return {
      bestLapId: sorted[0]?.id || null,
      secondBestLapId: sorted.length > 1 ? sorted[1].id : (sorted[0]?.id || null),
    };
  });

  sortedFilteredLaps = computed(() => {
    const laps = [...this.filteredLaps()];
    return laps.sort((a, b) => {
      if (a.id === 'LAP-IDEAL' || a.id?.includes('IDEAL')) return -1;
      if (b.id === 'LAP-IDEAL' || b.id?.includes('IDEAL')) return 1;
      const numA = this.extractLapNumber(a.id);
      const numB = this.extractLapNumber(b.id);
      if (numA !== numB) return numA - numB;
      return a.id.localeCompare(b.id);
    });
  });

  getLapRank(lapId: string): number {
    const { bestLapId, secondBestLapId } = this.bestTwoLaps();
    if (lapId === bestLapId) return 1;
    if (lapId === secondBestLapId) return 2;
    return 0;
  }

  getLapOptionLabel(lap: Lap): string {
    if (lap.id === 'LAP-IDEAL' || lap.id?.includes('IDEAL')) {
      const isPt = this.i18nService.currentLang() === 'pt';
      const time = this.formatLapTimeShort(lap.lapTime);
      return `⭐ ${isPt ? 'VOLTA IDEAL' : 'IDEAL LAP'} (${time})`;
    }
    const rank = this.getLapRank(lap.id);
    const name = this.getLapDisplayName(lap);
    const time = this.formatLapTimeShort(lap.lapTime);
    const isPt = this.i18nService.currentLang() === 'pt';
    if (rank === 1) {
      return `⚡ ${name} (${time}) - 1ª ${isPt ? 'MELHOR' : 'BEST'}`;
    }
    if (rank === 2) {
      return `★ ${name} (${time}) - 2ª ${isPt ? 'MELHOR' : 'BEST'}`;
    }
    return `${name} (${time})`;
  }

  getLapDisplayName(lap: Lap): string {
    if (!lap) return '';
    if (lap.id === 'LAP-IDEAL' || lap.id?.includes('IDEAL')) {
      return this.i18nService.currentLang() === 'pt' ? 'VOLTA IDEAL' : 'IDEAL LAP';
    }
    if (lap.id?.includes('Virtual')) {
      return this.getLapNumber(lap.id);
    }
    const lapNumStr = this.getLapNumber(lap.id);
    const cleanNum = lapNumStr ? lapNumStr.replace('#', '').trim() : '';
    if (cleanNum && !isNaN(Number(cleanNum))) {
      return `LAP ${cleanNum}`;
    }
    const num = this.extractLapNumber(lap.id);
    return num > 0 ? `LAP ${num}` : (lap.id || 'LAP');
  }

  formatLapTimeShort(sec: number): string {
    if (!sec || isNaN(sec)) return '--:--.---';
    const min = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec * 1000) % 1000);
    return `${min}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  private getInterpolatedPoint(points: TelemetryPoint[], dist: number): { time: number; speed: number; accX: number; accY: number } {
    if (!points || points.length === 0) {
      return { time: 0, speed: 0, accX: 0, accY: 0 };
    }
    if (dist <= points[0].distance) {
      return { time: points[0].timestamp, speed: points[0].speed, accX: points[0].accX, accY: points[0].accY };
    }
    const last = points[points.length - 1];
    if (dist >= last.distance) {
      return { time: last.timestamp, speed: last.speed, accX: last.accX, accY: last.accY };
    }

    let low = 0;
    let high = points.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (points[mid].distance < dist) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const idx = Math.max(0, Math.min(points.length - 2, high));
    const p0 = points[idx];
    const p1 = points[idx + 1] || p0;
    const span = p1.distance - p0.distance;
    const fraction = span > 0.0001 ? Math.max(0, Math.min(1, (dist - p0.distance) / span)) : 0;

    return {
      time: p0.timestamp + fraction * (p1.timestamp - p0.timestamp),
      speed: p0.speed + fraction * (p1.speed - p0.speed),
      accX: p0.accX + fraction * (p1.accX - p0.accX),
      accY: p0.accY + fraction * (p1.accY - p0.accY)
    };
  }

  isSessionModalOpen = signal<boolean>(false);
  sessionSearchQuery = signal<string>('');

  allSessionsList = computed<SessionItem[]>(() => {
    const list: SessionItem[] = [];
    for (const d of this.profileTree()) {
      for (const t of d.tracks) {
        for (const dt of t.dates) {
          for (const s of dt.sessions) {
            list.push(s);
          }
        }
      }
    }
    return list;
  });

  filteredSessionsList = computed<SessionItem[]>(() => {
    const q = this.sessionSearchQuery().trim().toLowerCase();
    const list = this.allSessionsList();
    if (!q) return list;
    return list.filter(s =>
      s.driver.toLowerCase().includes(q) ||
      s.track.toLowerCase().includes(q) ||
      s.date.toLowerCase().includes(q) ||
      s.time.toLowerCase().includes(q)
    );
  });

  openSessionModal() {
    this.isSessionModalOpen.set(true);
  }

  closeSessionModal() {
    this.isSessionModalOpen.set(false);
  }

  onSessionSearchChange(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.sessionSearchQuery.set(val || '');
  }

  onSelectSessionFromModal(session: SessionItem) {
    this.selectSession(session);
    this.setTab('resume');
    this.closeSessionModal();
  }


  lapStatuses = computed(() => {
    const laps = this.filteredLaps();
    const data = this.resumeData();
    const stats = this.sessionStats();
    const best = this.bestValidLap();
    const worstId = this.worstLapId();
    const statuses: Record<string, any> = {};
    
    laps.forEach((lap: Lap) => {
      if (lap.id === 'LAP-IDEAL' || lap.id?.includes('IDEAL')) {
        statuses[lap.id] = { resumeLap: null, isOutlier: false, isBest: false, isWorst: false, isParada: false, isIdeal: true };
        return;
      }
      const isParada = this.isLapParada(lap);
      const lapNum = this.extractLapNumber(lap.id);
      const resumeLap = data?.laps?.find((l) => l.nLap === lapNum);
      const isOutlier = isParada || (resumeLap && (resumeLap.t > (stats?.outlierThreshold || 999999) || resumeLap.t < (stats?.minValidThreshold || 0)));
      const isBest = best ? lap.id === best.id : (resumeLap && !isOutlier && resumeLap.t === stats?.bestLapTime);
      const isWorst = !isOutlier && (worstId ? lap.id === worstId : (resumeLap && resumeLap.t === stats?.worstLapTime));
      statuses[lap.id] = { resumeLap, isOutlier, isBest, isWorst, isParada, isIdeal: false };
    });
    
    return statuses;
  });

  laps = this.telemetryService.laps;
  selectedLapIds = this.telemetryService.selectedLapIds;
  
  filteredLaps = computed(() => {
    const laps = this.laps().filter((l: Lap) => l.id.toUpperCase().includes('LAP'));
    return [...laps].sort((a: Lap, b: Lap) => {
      if (a.id === 'LAP-IDEAL' || a.id?.includes('IDEAL')) return -1;
      if (b.id === 'LAP-IDEAL' || b.id?.includes('IDEAL')) return 1;
      const extractNum = (id: string) => {
        const parts = id.split('-');
        const lastPart = parts[parts.length - 1];
        const match = lastPart.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };
      return extractNum(a.id) - extractNum(b.id);
    });
  });

  // Synchronization and State
  private hoveredDistance = signal<number | null>(null);
  private sharedZoomTransform = signal<any>(null);

  bestLapId = computed(() => {
    return this.bestValidLap()?.id || null;
  });

  worstLapId = computed(() => {
    const valid = this.getValidRacingLaps();
    if (valid.length === 0) return null;
    return [...valid].sort((a, b) => b.lapTime - a.lapTime)[0]?.id || null;
  });

  selectedLaps = computed(() => 
    this.laps().filter((l: Lap) => this.selectedLapIds().includes(l.id))
  );

  maxDistance = computed(() => {
    const active = this.activeTab();
    let laps = this.selectedLaps();
    
    if (active === 'map' || active === 'heatmap') {
      const refId = this.referenceLapId();
      const compId = this.comparisonLapId();
      const allLaps = this.laps();
      const hLaps: Lap[] = [];
      if (refId) {
        const l = allLaps.find((lap: Lap) => lap.id === refId);
        if (l) hLaps.push(l);
      }
      if (compId && compId !== refId) {
        const l = allLaps.find((lap: Lap) => lap.id === compId);
        if (l) hLaps.push(l);
      }
      if (hLaps.length > 0) laps = hLaps;
    }

    if (laps.length === 0) return 1000;
    return Math.max(...laps.map((l: Lap) => (l.points && l.points.length > 0) ? l.points[l.points.length - 1].distance : 0));
  });

  // Selector Draggable State
  selectorMinimized = signal(false);
  selectorPosition = signal({ x: 16, y: 16 });
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  // Global Playback State (Map & Charts)
  isPlaying = signal(false);
  playbackTime = signal(0);
  playbackSpeed = signal(1);

  // Skill-Heatmap Individual Player
  heatmapIsPlaying = signal(false);
  heatmapPlaybackTime = signal(0);
  heatmapPlaybackSpeed = signal(1);

  // Detailed Telemetry Individual Player
  chartsIsPlaying = signal(false);
  chartsPlaybackTime = signal(0);
  chartsPlaybackSpeed = signal(1);

  maxLapTime = computed(() => {
    const active = this.activeTab();
    if (active === 'map' || active === 'heatmap') {
      const refId = this.referenceLapId();
      const compId = this.comparisonLapId();
      const allLaps = this.laps();
      const laps: Lap[] = [];
      if (refId) {
        const l = allLaps.find((lap: Lap) => lap.id === refId);
        if (l) laps.push(l);
      }
      if (compId && compId !== refId) {
        const l = allLaps.find((lap: Lap) => lap.id === compId);
        if (l) laps.push(l);
      }
      if (laps.length > 0) return Math.max(...laps.map((l: Lap) => l.lapTime || 0));
    }
    const laps = this.selectedLaps();
    if (laps.length === 0) return 0;
    return Math.max(...laps.map((l: Lap) => l.lapTime || 0));
  });

  heatmapMaxLapTime = computed(() => {
    const refId = this.referenceLapId();
    const compId = this.comparisonLapId();
    const allLaps = this.laps();
    const laps: Lap[] = [];
    if (refId) {
      const l = allLaps.find((lap: Lap) => lap.id === refId);
      if (l) laps.push(l);
    }
    if (compId && compId !== refId) {
      const l = allLaps.find((lap: Lap) => lap.id === compId);
      if (l) laps.push(l);
    }
    if (laps.length === 0) return 0;
    return Math.max(...laps.map((l: Lap) => l.lapTime || 0));
  });

  currentPlayerIsPlaying = computed(() => 
    this.activeTab() === 'heatmap' ? this.heatmapIsPlaying() : this.isPlaying()
  );
  currentPlayerTime = computed(() => 
    this.activeTab() === 'heatmap' ? this.heatmapPlaybackTime() : this.playbackTime()
  );
  currentPlayerMaxTime = computed(() => 
    this.activeTab() === 'heatmap' ? this.heatmapMaxLapTime() : this.maxLapTime()
  );
  currentPlayerPlaybackSpeed = computed(() => 
    this.activeTab() === 'heatmap' ? this.heatmapPlaybackSpeed() : this.playbackSpeed()
  );

  activeTab = signal<'resume' | 'charts' | 'delta' | 'coaching' | 'map' | 'heatmap'>('resume');
  mapDisplayMode = signal<'delta' | 'speed'>('delta');
  refTrajectoryColor = signal<string>('#00e5ff');

  setMapDisplayMode(mode: 'delta' | 'speed') {
    this.mapDisplayMode.set(mode);
  }

  setMapReferenceLap(lapId: string) {
    if (!lapId || lapId === 'NONE') {
      this.referenceLapId.set(null);
      return;
    }
    this.referenceLapId.set(lapId);
    if (this.comparisonLapId() === lapId) {
      this.comparisonLapId.set(null);
    }
  }

  setMapComparisonLap(lapId: string) {
    if (!lapId || lapId === 'NONE') {
      this.comparisonLapId.set(null);
      return;
    }
    this.comparisonLapId.set(lapId);
    if (this.referenceLapId() === lapId) {
      this.referenceLapId.set(null);
    }
  }

  swapMapLaps() {
    const ref = this.referenceLapId();
    const comp = this.comparisonLapId();
    this.referenceLapId.set(comp);
    this.comparisonLapId.set(ref);
  }

  selectFastestTwoMapLaps() {
    const valid = this.getValidRacingLaps().filter(l => l.id !== 'LAP-IDEAL');
    const laps = valid.length >= 2 ? [...valid].sort((a, b) => a.lapTime - b.lapTime) : [...this.filteredLaps()].filter(l => l.id !== 'LAP-IDEAL').sort((a, b) => a.lapTime - b.lapTime);
    if (laps.length >= 2) {
      this.referenceLapId.set(laps[0].id);
      this.comparisonLapId.set(laps[1].id);
    }
  }

  isMapFastestTwoSelected = computed<boolean>(() => {
    const valid = this.getValidRacingLaps().filter(l => l.id !== 'LAP-IDEAL');
    const laps = valid.length >= 2 ? [...valid].sort((a, b) => a.lapTime - b.lapTime) : [...this.filteredLaps()].filter(l => l.id !== 'LAP-IDEAL').sort((a, b) => a.lapTime - b.lapTime);
    if (laps.length < 2) return false;
    return this.referenceLapId() === laps[0].id && this.comparisonLapId() === laps[1].id;
  });

  setRefTrajectoryColor(color: string) {
    if (color) {
      this.refTrajectoryColor.set(color);
    }
  }

  resumeSubTab = signal<'official' | 'mini'>('official');

  setResumeSubTab(tab: 'official' | 'mini') {
    this.resumeSubTab.set(tab);
  }
  sidebarCollapsed = signal(false);
  mapSidebarCollapsed = signal(false);
  private d3Ready = signal(false);

  // Skill-Heatmap State
  referenceLapId = signal<string | null>(null);
  comparisonLapId = signal<string | null>(null);

  // Delta Bar Chart & Time Difference Comparison State
  deltaReferenceLapId = signal<string | null>(null);
  deltaComparisonLapId = signal<string | null>(null);
  deltaBarResolution = signal<number>(36);
  deltaShowCurve = signal<boolean>(true);
  deltaIsPlaying = signal<boolean>(false);
  deltaPlaybackTime = signal<number>(0);
  deltaPlaybackSpeed = signal<number>(1);

  deltaLapsPair = computed<{ refLap: Lap; compLap: Lap } | null>(() => {
    const selected = this.selectedLaps();
    const all = this.filteredLaps();
    const pool = selected.length >= 2 ? selected : (selected.length === 1 ? all : all);
    if (pool.length < 2) return null;

    let refId = this.deltaReferenceLapId();
    let compId = this.deltaComparisonLapId();

    if (!refId || !pool.some(l => l.id === refId)) {
      refId = pool[0].id;
    }
    if (!compId || !pool.some(l => l.id === compId) || compId === refId) {
      const other = pool.find(l => l.id !== refId);
      compId = other ? other.id : pool[1].id;
    }

    const refLap = pool.find(l => l.id === refId) || pool[0];
    const compLap = pool.find(l => l.id === compId) || pool[1];

    if (!refLap || !compLap || refLap.id === compLap.id) return null;
    return { refLap, compLap };
  });

  deltaComparisonData = computed<DeltaComparisonData | null>(() => {
    const pair = this.deltaLapsPair();
    if (!pair) return null;
    const { refLap, compLap } = pair;
    if (!refLap.points?.length || !compLap.points?.length) return null;

    const refLastDist = refLap.points[refLap.points.length - 1].distance;
    const compLastDist = compLap.points[compLap.points.length - 1].distance;
    const totalDistance = Math.min(refLastDist, compLastDist);
    if (totalDistance <= 0) return null;

    const numSegments = this.deltaBarResolution();
    const segments: DeltaSegment[] = [];
    const segSpan = totalDistance / numSegments;

    let maxGain = { distance: 0, delta: 0, segmentIndex: 0 };
    let maxLoss = { distance: 0, delta: 0, segmentIndex: 0 };
    let gainedCount = 0;
    let lostCount = 0;

    for (let i = 0; i < numSegments; i++) {
      const startDist = i * segSpan;
      const endDist = (i + 1) * segSpan;
      const midDist = (startDist + endDist) / 2;

      const pRefStart = this.getInterpolatedPoint(refLap.points, startDist);
      const pRefEnd = this.getInterpolatedPoint(refLap.points, endDist);
      const pCompStart = this.getInterpolatedPoint(compLap.points, startDist);
      const pCompEnd = this.getInterpolatedPoint(compLap.points, endDist);

      const refSegTime = pRefEnd.time - pRefStart.time;
      const compSegTime = pCompEnd.time - pCompStart.time;
      const deltaSeg = compSegTime - refSegTime;
      const cumulativeDelta = pCompEnd.time - pRefEnd.time;

      const refSpeed = (pRefStart.speed + pRefEnd.speed) / 2;
      const compSpeed = (pCompStart.speed + pCompEnd.speed) / 2;
      const deltaSpeed = compSpeed - refSpeed;

      const status: 'gained' | 'lost' | 'even' = deltaSeg < -0.005 ? 'gained' : (deltaSeg > 0.005 ? 'lost' : 'even');
      if (status === 'gained') gainedCount++;
      if (status === 'lost') lostCount++;

      if (deltaSeg < maxGain.delta) {
        maxGain = { distance: midDist, delta: deltaSeg, segmentIndex: i };
      }
      if (deltaSeg > maxLoss.delta) {
        maxLoss = { distance: midDist, delta: deltaSeg, segmentIndex: i };
      }

      segments.push({
        index: i,
        startDistance: startDist,
        endDistance: endDist,
        midDistance: midDist,
        refTime: refSegTime,
        compTime: compSegTime,
        deltaSeg,
        cumulativeDelta,
        refSpeed,
        compSpeed,
        deltaSpeed,
        status
      });
    }

    const continuousPoints: DeltaPoint[] = [];
    const numPoints = 160;
    let peakCumulativeGain = { distance: 0, delta: 0, segmentIndex: 0 };
    let peakCumulativeLoss = { distance: 0, delta: 0, segmentIndex: 0 };

    for (let k = 0; k <= numPoints; k++) {
      const d = (k / numPoints) * totalDistance;
      const pRef = this.getInterpolatedPoint(refLap.points, d);
      const pComp = this.getInterpolatedPoint(compLap.points, d);
      const cumDelta = pComp.time - pRef.time;
      const segIdx = Math.min(numSegments - 1, Math.floor((d / totalDistance) * numSegments));
      if (cumDelta < peakCumulativeGain.delta) {
        peakCumulativeGain = { distance: Math.round(d), delta: cumDelta, segmentIndex: segIdx };
      }
      if (cumDelta > peakCumulativeLoss.delta) {
        peakCumulativeLoss = { distance: Math.round(d), delta: cumDelta, segmentIndex: segIdx };
      }
      continuousPoints.push({
        distance: d,
        cumulativeDelta: cumDelta,
        refTime: pRef.time,
        compTime: pComp.time,
        refSpeed: pRef.speed,
        compSpeed: pComp.speed,
        deltaSpeed: pComp.speed - pRef.speed
      });
    }

    const netTimeDelta = compLap.lapTime - refLap.lapTime;
    const resolvedMaxGain = peakCumulativeGain.delta < maxGain.delta ? peakCumulativeGain : maxGain;
    const resolvedMaxLoss = peakCumulativeLoss.delta > maxLoss.delta ? peakCumulativeLoss : maxLoss;

    return {
      refLap,
      compLap,
      totalDistance,
      netTimeDelta,
      segments,
      continuousPoints,
      maxGain: resolvedMaxGain,
      maxLoss: resolvedMaxLoss,
      gainedSegmentsCount: gainedCount,
      lostSegmentsCount: lostCount
    };
  });

  realtimeDeltaSnapshot = computed<RealtimeDeltaSnapshot | null>(() => {
    const pair = this.deltaLapsPair();
    if (!pair) return null;
    const { refLap, compLap } = pair;
    if (!refLap.points?.length || !compLap.points?.length) return null;

    let dist = this.hoveredDistance();
    if (dist === null) {
      if (this.chartsIsPlaying()) {
        const t = this.chartsPlaybackTime();
        const primaryLap = this.selectedLaps()[0] || refLap;
        const pt = this.getPointAtTime(primaryLap, t);
        if (pt) dist = pt.distance;
      }
    }
    if (dist === null) dist = 0;

    const pRef = this.getInterpolatedPoint(refLap.points, dist);
    const pComp = this.getInterpolatedPoint(compLap.points, dist);
    const deltaTime = pComp.time - pRef.time;
    const deltaSpeed = pComp.speed - pRef.speed;

    const data = this.deltaComparisonData();
    let segmentIndex = 0;
    let segmentDelta = 0;
    if (data && data.segments.length > 0) {
      const seg = data.segments.find(s => dist! >= s.startDistance && dist! <= s.endDistance) || data.segments[0];
      segmentIndex = seg.index;
      segmentDelta = seg.deltaSeg;
    }

    const status: 'gained' | 'lost' | 'level' = deltaTime < -0.01 ? 'gained' : (deltaTime > 0.01 ? 'lost' : 'level');

    return {
      distance: Math.round(dist),
      refLapName: this.getLapDisplayName(refLap),
      compLapName: this.getLapDisplayName(compLap),
      deltaTime,
      deltaSpeed,
      refSpeed: pRef.speed,
      compSpeed: pComp.speed,
      status,
      segmentIndex,
      segmentDelta
    };
  });

  deltaTrackLayoutData = computed(() => {
    const pair = this.deltaLapsPair();
    if (!pair) return null;
    const { refLap, compLap } = pair;
    if (!refLap.points?.length || !compLap.points?.length) return null;

    const refPoints = refLap.points.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
    const compPoints = compLap.points.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
    if (refPoints.length < 5) return null;

    const allPoints = compPoints.length > 5 ? [...refPoints, ...compPoints] : refPoints;
    const lats = allPoints.map(p => p.lat);
    const lons = allPoints.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const width = 560;
    const height = 340;
    const padding = 28;

    const meanLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(meanLatRad);

    const spanLon = (maxLon - minLon) * cosLat || 1e-6;
    const spanLat = maxLat - minLat || 1e-6;

    const scaleX = (width - 2 * padding) / spanLon;
    const scaleY = (height - 2 * padding) / spanLat;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - spanLon * scale) / 2;
    const offsetY = (height - spanLat * scale) / 2;

    const project = (lat: number, lon: number) => {
      const x = offsetX + (lon - minLon) * cosLat * scale;
      const y = height - (offsetY + (lat - minLat) * scale);
      return { x, y };
    };

    // Full Track Path (Reference Trajectory)
    const refFullPath = refPoints.map((p, idx) => {
      const pt = project(p.lat, p.lon);
      return `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }).join(' ') + (refPoints.length > 20 ? ' Z' : '');

    // Full Comparison Track Path
    const compFullPath = compPoints.length > 5 ? (compPoints.map((p, idx) => {
      const pt = project(p.lat, p.lon);
      return `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }).join(' ') + (compPoints.length > 20 ? ' Z' : '')) : '';

    // Start/Finish point
    const startPt = project(refPoints[0].lat, refPoints[0].lon);

    // Delta Colored Segments (following comparison lap points if available)
    const compData = this.deltaComparisonData();
    const coloredSegments: {
      d: string;
      color: string;
      deltaSeg: number;
      status: 'gained' | 'lost' | 'even';
      startDist: number;
      endDist: number;
    }[] = [];

    const targetPoints = compPoints.length > 20 ? compPoints : refPoints;
    if (compData && compData.segments) {
      compData.segments.forEach(seg => {
        const segPoints = targetPoints.filter(p => p.distance >= seg.startDistance && p.distance <= seg.endDistance);
        if (segPoints.length >= 2) {
          const pathStr = segPoints.map((p, i) => {
            const pt = project(p.lat, p.lon);
            return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
          }).join(' ');

          const color = seg.deltaSeg < -0.005 ? '#00e676' : (seg.deltaSeg > 0.005 ? '#ff3e3e' : '#94a3b8');
          coloredSegments.push({
            d: pathStr,
            color,
            deltaSeg: seg.deltaSeg,
            status: seg.status,
            startDist: seg.startDistance,
            endDist: seg.endDistance
          });
        }
      });
    }

    // Sector Transition Markers
    const sectorMarkers: { number: number; x: number; y: number }[] = [];
    if (refLap.sectors && refLap.sectors.length > 0) {
      refLap.sectors.forEach(sec => {
        if (sec.endDistance > 0 && sec.endDistance < (compData?.totalDistance || 999999)) {
          let closestPt = refPoints[0];
          let minD = Infinity;
          for (const p of refPoints) {
            const diff = Math.abs(p.distance - sec.endDistance);
            if (diff < minD) {
              minD = diff;
              closestPt = p;
            }
          }
          const pt = project(closestPt.lat, closestPt.lon);
          sectorMarkers.push({
            number: sec.number,
            x: pt.x,
            y: pt.y
          });
        }
      });
    }

    // Active Cursor Marker on Track
    const curDist = this.hoveredDistance();
    let cursorMarker: { x: number; y: number; distance: number; delta: number; speed: number; deltaSpeed: number } | null = null;
    if (curDist !== null) {
      let closestPt = targetPoints[0];
      let minDiff = Infinity;
      for (const p of targetPoints) {
        const diff = Math.abs(p.distance - curDist);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = p;
        }
      }
      const pt = project(closestPt.lat, closestPt.lon);
      const interpRef = this.getInterpolatedPoint(refLap.points, curDist);
      const interpComp = this.getInterpolatedPoint(compLap.points, curDist);

      cursorMarker = {
        x: pt.x,
        y: pt.y,
        distance: curDist,
        delta: interpComp.time - interpRef.time,
        speed: interpComp.speed,
        deltaSpeed: interpComp.speed - interpRef.speed
      };
    }

    return {
      width,
      height,
      fullPath: refFullPath,
      refFullPath,
      compFullPath,
      refLapName: this.getLapDisplayName(refLap),
      compLapName: this.getLapDisplayName(compLap),
      startPt,
      coloredSegments,
      sectorMarkers,
      cursorMarker,
      points: targetPoints,
      project
    };
  });

  onDeltaTrackMouseMove(event: MouseEvent) {
    const layout = this.deltaTrackLayoutData();
    if (!layout || !layout.points.length) return;

    const svgElement = event.currentTarget as SVGSVGElement;
    const rect = svgElement.getBoundingClientRect();
    const mouseSvgX = ((event.clientX - rect.left) / rect.width) * layout.width;
    const mouseSvgY = ((event.clientY - rect.top) / rect.height) * layout.height;

    let closestPoint = layout.points[0];
    let minDistanceSq = Infinity;

    for (const p of layout.points) {
      const pt = layout.project(p.lat, p.lon);
      const distSq = (pt.x - mouseSvgX) ** 2 + (pt.y - mouseSvgY) ** 2;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPoint = p;
      }
    }

    if (closestPoint) {
      this.hoveredDistance.set(closestPoint.distance);
    }
  }

  onDeltaTrackMouseLeave() {
    this.hoveredDistance.set(null);
  }

  // ==========================================
  // CORNER COACHING STATE & ENGINE
  // ==========================================
  coachingReferenceLapId = signal<string | null>(null);
  coachingComparisonLapId = signal<string | null>(null);
  selectedCornerIndex = signal<number>(0);
  hasUserManuallySelectedCoachingLaps = signal<boolean>(false);

  setCoachingReferenceLap(lapId: string) {
    this.hasUserManuallySelectedCoachingLaps.set(true);
    this.coachingReferenceLapId.set(lapId);
  }

  setCoachingComparisonLap(lapId: string) {
    this.hasUserManuallySelectedCoachingLaps.set(true);
    this.coachingComparisonLapId.set(lapId);
  }

  setSelectedCornerIndex(index: number) {
    this.selectedCornerIndex.set(index);
  }

  swapCoachingLaps() {
    this.hasUserManuallySelectedCoachingLaps.set(true);
    const pair = this.coachingLapsPair();
    if (!pair) return;
    this.coachingReferenceLapId.set(pair.compLap.id);
    this.coachingComparisonLapId.set(pair.refLap.id);
  }

  selectFastestTwoCoachingLaps() {
    const sorted = this.getSortedFastestRacingLaps();
    if (sorted.length >= 2) {
      this.coachingReferenceLapId.set(sorted[0].id);
      this.coachingComparisonLapId.set(sorted[1].id);
      this.selectedCornerIndex.set(0);
    } else if (sorted.length === 1) {
      this.coachingReferenceLapId.set(sorted[0].id);
      this.coachingComparisonLapId.set(sorted[0].id);
      this.selectedCornerIndex.set(0);
    }
  }

  isCoachingFastestTwoSelected = computed<boolean>(() => {
    const pair = this.coachingLapsPair();
    if (!pair) return false;
    const { bestLapId, secondBestLapId } = this.bestTwoLaps();
    if (!bestLapId || !secondBestLapId || bestLapId === secondBestLapId) return false;
    return (pair.refLap.id === bestLapId && pair.compLap.id === secondBestLapId) ||
           (pair.refLap.id === secondBestLapId && pair.compLap.id === bestLapId);
  });

  coachingLapsPair = computed<{ refLap: Lap; compLap: Lap } | null>(() => {
    const pool = this.filteredLaps();
    if (pool.length === 0) return null;

    let refId = this.coachingReferenceLapId();
    let compId = this.coachingComparisonLapId();

    const best = this.bestTwoLaps();

    // Default refId if not set or invalid for current session pool
    if (!refId || !pool.some(l => l.id === refId)) {
      refId = (best.bestLapId && pool.some(l => l.id === best.bestLapId))
        ? best.bestLapId
        : pool[0].id;
    }

    // Default compId if not set or invalid for current session pool
    if (!compId || !pool.some(l => l.id === compId)) {
      if (best.secondBestLapId && pool.some(l => l.id === best.secondBestLapId)) {
        compId = best.secondBestLapId;
      } else if (pool.length > 1) {
        const other = pool.find(l => l.id !== refId);
        compId = other ? other.id : pool[1].id;
      } else {
        compId = refId;
      }
    }

    const refLap = pool.find(l => l.id === refId) || pool[0];
    const compLap = pool.find(l => l.id === compId) || pool[0];

    if (!refLap || !compLap) return null;
    return { refLap, compLap };
  });

  detectedCorners = computed<CornerData[]>(() => {
    // Anchor corner detection to the best valid real racing lap to maintain fixed, accurate corner numbers and distances
    const targetLap = this.bestValidLap() || (this.filteredLaps().find(l => l.id !== 'LAP-IDEAL' && !l.id?.includes('Virtual')) || this.filteredLaps()[0] || null);
    if (!targetLap || !targetLap.points || targetLap.points.length < 30) return [];

    const validPoints = targetLap.points.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
    if (validPoints.length < 30) return [];

    // Find speed minima using the existing alternating extrema algorithm
    const extrema = this.findSegmentExtrema(validPoints);
    const minima = extrema.filter(e => !e.isMax);

    if (minima.length === 0) return [];

    const corners: CornerData[] = [];
    let cornerNumber = 1;

    for (const apexPt of minima) {
      const apexDist = apexPt.distance;

      // Find approach & braking start by looking backwards from apex
      const extremaIdx = extrema.indexOf(apexPt);
      let prevMaxDist = 0;
      for (let j = extremaIdx - 1; j >= 0; j--) {
        if (extrema[j].isMax) {
          prevMaxDist = extrema[j].distance;
          break;
        }
      }
      const minBackDist = prevMaxDist > 0 ? Math.max(prevMaxDist + 15, apexDist - 160) : Math.max(0, apexDist - 140);
      
      const approachPoints = validPoints.filter(p => p.distance >= minBackDist && p.distance <= apexDist);
      let entryPt = approachPoints[0] || apexPt;

      if (approachPoints.length > 2) {
        const peakSpeedInApproach = Math.max(...approachPoints.map(p => p.speed));
        const brakePoint = approachPoints.find(p => p.accY < -0.35 || p.speed <= peakSpeedInApproach * 0.95);
        if (brakePoint) {
          entryPt = brakePoint;
        }
      }

      // Find exit & full throttle point by looking forwards from apex
      let nextMaxDist = apexDist + 200;
      for (let j = extremaIdx + 1; j < extrema.length; j++) {
        if (extrema[j].isMax) {
          nextMaxDist = extrema[j].distance;
          break;
        }
      }
      const maxForwardDist = Math.min(nextMaxDist - 10, apexDist + 140);
      const exitPoints = validPoints.filter(p => p.distance >= apexDist && p.distance <= maxForwardDist);
      let exitPt = exitPoints[exitPoints.length - 1] || apexPt;

      if (exitPoints.length > 2) {
        const peakSpeedInExit = Math.max(...exitPoints.map(p => p.speed));
        const targetExitSpeed = apexPt.speed + (peakSpeedInExit - apexPt.speed) * 0.85;
        const reachedSpeedPt = exitPoints.find(p => p.speed >= targetExitSpeed);
        if (reachedSpeedPt) {
          exitPt = reachedSpeedPt;
        }
      }

      // Turn direction based on lateral acceleration around apex
      const apexWindow = validPoints.filter(p => Math.abs(p.distance - apexDist) <= 25);
      const avgAccX = apexWindow.length > 0 ? (apexWindow.reduce((acc, p) => acc + p.accX, 0) / apexWindow.length) : 0;
      const turnDirection: 'left' | 'right' = avgAccX > 0 ? 'right' : 'left';

      corners.push({
        number: cornerNumber++,
        name: `Curva ${cornerNumber - 1}`,
        entryDistance: Math.round(entryPt.distance),
        apexDistance: Math.round(apexDist),
        exitDistance: Math.round(exitPt.distance),
        entryLat: entryPt.lat,
        entryLon: entryPt.lon,
        apexLat: apexPt.lat,
        apexLon: apexPt.lon,
        exitLat: exitPt.lat,
        exitLon: exitPt.lon,
        turnDirection,
        minSpeed: Math.round(apexPt.speed)
      });
    }

    return corners;
  });

  cornersAnalysis = computed<CornerMetrics[]>(() => {
    const pair = this.coachingLapsPair();
    const corners = this.detectedCorners();
    if (!pair || corners.length === 0) return [];

    const { refLap, compLap } = pair;
    if (!refLap.points?.length || !compLap.points?.length) return [];

    const isSameLap = refLap.id === compLap.id;
    const isPt = this.i18nService.currentLang() === 'pt';

    return corners.map(corner => {
      // Reference metrics
      const refEntry = this.getInterpolatedPoint(refLap.points, corner.entryDistance);
      const refApex = this.getInterpolatedPoint(refLap.points, corner.apexDistance);
      const refExit = this.getInterpolatedPoint(refLap.points, corner.exitDistance);
      const refCornerTime = Math.max(0.05, refExit.time - refEntry.time);

      const refApproachSlice = refLap.points.filter(p => p.distance >= corner.entryDistance - 50 && p.distance <= corner.apexDistance);
      const refBrakePt = refApproachSlice.find(p => p.accY < -0.35);
      const refBrakeDist = Math.round(refBrakePt ? refBrakePt.distance : corner.entryDistance);

      if (isSameLap) {
        return {
          corner,
          refBrakeDist,
          compBrakeDist: refBrakeDist,
          deltaBrakeMeters: 0,
          refEntrySpeed: Math.round(refEntry.speed),
          compEntrySpeed: Math.round(refEntry.speed),
          deltaEntrySpeed: 0,
          refApexSpeed: Math.round(refApex.speed),
          compApexSpeed: Math.round(refApex.speed),
          deltaApexSpeed: 0,
          refExitSpeed: Math.round(refExit.speed),
          compExitSpeed: Math.round(refExit.speed),
          deltaExitSpeed: 0,
          refCornerTime,
          compCornerTime: refCornerTime,
          deltaCornerTime: 0,
          opportunityScore: 0,
          coachingCue: isPt
            ? `Volta de referência e comparação idênticas (${this.getLapDisplayName(refLap)}). Todas as métricas de delta são zero. Selecione outra volta para comparar frenagem, contorno e saída.`
            : `Reference and comparison laps are identical (${this.getLapDisplayName(refLap)}). All delta metrics are zero. Select another lap to compare braking, apex and exit.`,
          status: 'even' as const
        };
      }

      // Comparison metrics
      const compEntry = this.getInterpolatedPoint(compLap.points, corner.entryDistance);
      const compApex = this.getInterpolatedPoint(compLap.points, corner.apexDistance);
      const compExit = this.getInterpolatedPoint(compLap.points, corner.exitDistance);
      const compCornerTime = Math.max(0.05, compExit.time - compEntry.time);

      const compApproachSlice = compLap.points.filter(p => p.distance >= corner.entryDistance - 50 && p.distance <= corner.apexDistance);
      const compBrakePt = compApproachSlice.find(p => p.accY < -0.35);
      const compBrakeDist = Math.round(compBrakePt ? compBrakePt.distance : corner.entryDistance);

      // Deltas
      const deltaBrakeMeters = compBrakeDist - refBrakeDist;
      const deltaEntrySpeed = compEntry.speed - refEntry.speed;
      const deltaApexSpeed = compApex.speed - refApex.speed;
      const deltaExitSpeed = compExit.speed - refExit.speed;
      const deltaCornerTime = compCornerTime - refCornerTime;
      const opportunityScore = Math.max(0, deltaCornerTime);

      const status: 'faster' | 'slower' | 'even' = deltaCornerTime < -0.015 ? 'faster' : (deltaCornerTime > 0.015 ? 'slower' : 'even');

      // Automated Driving Coach Cue generator
      let coachingCue = '';
      if (deltaCornerTime > 0.04) {
        if (deltaBrakeMeters < -12 && deltaApexSpeed < -2) {
          coachingCue = isPt
            ? `Freando ${Math.abs(deltaBrakeMeters)}m antes da referência. Retarde a frenagem para carregar mais +${Math.abs(Math.round(deltaApexSpeed))} km/h no ápice.`
            : `Braking ${Math.abs(deltaBrakeMeters)}m earlier than reference. Delay braking to carry +${Math.abs(Math.round(deltaApexSpeed))} km/h more into the apex.`;
        } else if (deltaApexSpeed >= 0 && deltaExitSpeed < -4) {
          coachingCue = isPt
            ? `Boa velocidade de ápice, mas saída lenta (-${Math.abs(Math.round(deltaExitSpeed))} km/h). Antecipe a aceleração plena ao desesterçar.`
            : `Good apex speed, but slower exit drive (-${Math.abs(Math.round(deltaExitSpeed))} km/h). Apply full throttle earlier when unwinding the steering wheel.`;
        } else if (deltaBrakeMeters > 15 && deltaApexSpeed < -4) {
          coachingCue = isPt
            ? `Freada muito tardia (+${deltaBrakeMeters}m) sobrecarregou a entrada e derrubou o apex. Antecipe a desaceleração para posicionar o carro.`
            : `Braked too late (+${deltaBrakeMeters}m), overloading the entry and sacrificing apex speed. Brake slightly earlier to position the car smoothly.`;
        } else if (deltaApexSpeed < -4) {
          coachingCue = isPt
            ? `Apex ${Math.abs(Math.round(deltaApexSpeed))} km/h abaixo da referência. Confie na aderência lateral e aumente a velocidade no meio da curva.`
            : `Apex ${Math.abs(Math.round(deltaApexSpeed))} km/h below reference. Trust lateral grip and carry more speed through mid-corner.`;
        } else {
          coachingCue = isPt
            ? `Tempo perdido de +${deltaCornerTime.toFixed(3)}s. Abra o traçado de entrada para otimizar o arco de contorno e saída.`
            : `Lost time of +${deltaCornerTime.toFixed(3)}s. Widen the entry line to optimize the corner arc and exit drive.`;
        }
      } else if (deltaCornerTime <= -0.04) {
        coachingCue = isPt
          ? `Excelente execução! Curva completada ${Math.abs(deltaCornerTime).toFixed(3)}s mais rápida que a referência com ótimo contorno (+${Math.round(deltaApexSpeed)} km/h).`
          : `Outstanding execution! Corner completed ${Math.abs(deltaCornerTime).toFixed(3)}s faster than reference with strong apex speed (+${Math.round(deltaApexSpeed)} km/h).`;
      } else {
        coachingCue = isPt
          ? `Traçado consistente e ritmo equilibrado em relação à referência (diferença menor que 0.04s).`
          : `Consistent line and balanced pace compared to reference (less than 0.04s delta).`;
      }

      return {
        corner,
        refBrakeDist,
        compBrakeDist,
        deltaBrakeMeters,
        refEntrySpeed: Math.round(refEntry.speed),
        compEntrySpeed: Math.round(compEntry.speed),
        deltaEntrySpeed: Math.round(deltaEntrySpeed * 10) / 10,
        refApexSpeed: Math.round(refApex.speed),
        compApexSpeed: Math.round(compApex.speed),
        deltaApexSpeed: Math.round(deltaApexSpeed * 10) / 10,
        refExitSpeed: Math.round(refExit.speed),
        compExitSpeed: Math.round(compExit.speed),
        deltaExitSpeed: Math.round(deltaExitSpeed * 10) / 10,
        refCornerTime,
        compCornerTime,
        deltaCornerTime,
        opportunityScore,
        coachingCue,
        status
      };
    });
  });

  topOpportunities = computed<CornerMetrics[]>(() => {
    const pair = this.coachingLapsPair();
    if (!pair || pair.refLap.id === pair.compLap.id) return [];

    const analysis = this.cornersAnalysis();
    return [...analysis]
      .filter(m => m.opportunityScore > 0.02)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 3);
  });

  selectedCornerMetrics = computed<CornerMetrics | null>(() => {
    const list = this.cornersAnalysis();
    if (list.length === 0) return null;
    const idx = this.selectedCornerIndex();
    if (idx < 0 || idx >= list.length) return list[0];
    return list[idx];
  });

  selectedCornerTelemetry = computed(() => {
    const metrics = this.selectedCornerMetrics();
    const pair = this.coachingLapsPair();
    if (!metrics || !pair) return null;

    const { refLap, compLap } = pair;
    const startDist = Math.max(0, metrics.corner.entryDistance - 40);
    const endDist = metrics.corner.exitDistance + 40;
    const spanDist = endDist - startDist || 1;

    const refPoints = (refLap.points || []).filter(p => p.distance >= startDist && p.distance <= endDist);
    const compPoints = (compLap.points || []).filter(p => p.distance >= startDist && p.distance <= endDist);
    if (refPoints.length < 2) return null;

    const width = 560;
    const height = 200;
    const padding = { top: 20, right: 25, bottom: 25, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allSpeeds = [...refPoints.map(p => p.speed), ...compPoints.map(p => p.speed)];
    const minSpeed = Math.max(0, Math.min(...allSpeeds) - 8);
    const maxSpeed = Math.max(...allSpeeds) + 8;
    const speedSpan = maxSpeed - minSpeed || 1;

    const scaleX = (d: number) => padding.left + ((d - startDist) / spanDist) * chartW;
    const scaleY = (s: number) => padding.top + chartH - ((s - minSpeed) / speedSpan) * chartH;

    const refPath = refPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.distance).toFixed(1)},${scaleY(p.speed).toFixed(1)}`).join(' ');
    const compPath = compPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.distance).toFixed(1)},${scaleY(p.speed).toFixed(1)}`).join(' ');

    const brakeLineX = scaleX(metrics.corner.entryDistance);
    const apexLineX = scaleX(metrics.corner.apexDistance);
    const exitLineX = scaleX(metrics.corner.exitDistance);

    return {
      width,
      height,
      startDist: Math.round(startDist),
      endDist: Math.round(endDist),
      minSpeed: Math.round(minSpeed),
      maxSpeed: Math.round(maxSpeed),
      refPath,
      compPath,
      brakeLineX,
      apexLineX,
      exitLineX
    };
  });

  coachingMinimapData = computed(() => {
    const layout = this.deltaTrackLayoutData();
    const metrics = this.selectedCornerMetrics();
    const corners = this.cornersAnalysis();
    if (!layout) return null;

    const project = layout.project;

    // Corner markers on the track
    const cornerMarkers = corners.map(c => {
      const pt = project(c.corner.apexLat, c.corner.apexLon);
      return {
        number: c.corner.number,
        name: c.corner.name,
        x: pt.x,
        y: pt.y,
        status: c.status,
        deltaCornerTime: c.deltaCornerTime,
        isSelected: metrics?.corner.number === c.corner.number
      };
    });

    let selectedHighlightPath = '';
    let brakeMarker: { x: number; y: number } | null = null;
    let apexMarker: { x: number; y: number } | null = null;
    let exitMarker: { x: number; y: number } | null = null;

    if (metrics) {
      const pair = this.coachingLapsPair();
      const points = pair?.refLap.points || [];
      const cornerPts = points.filter(p => p.distance >= metrics.corner.entryDistance && p.distance <= metrics.corner.exitDistance);
      if (cornerPts.length >= 2) {
        selectedHighlightPath = cornerPts.map((p, i) => {
          const pt = project(p.lat, p.lon);
          return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        }).join(' ');
      }
      brakeMarker = project(metrics.corner.entryLat, metrics.corner.entryLon);
      apexMarker = project(metrics.corner.apexLat, metrics.corner.apexLon);
      exitMarker = project(metrics.corner.exitLat, metrics.corner.exitLon);
    }

    return {
      width: layout.width,
      height: layout.height,
      fullPath: layout.refFullPath,
      selectedHighlightPath,
      cornerMarkers,
      brakeMarker,
      apexMarker,
      exitMarker
    };
  });

  coachingOverallScore = computed(() => {
    const pair = this.coachingLapsPair();
    const analysis = this.cornersAnalysis();
    if (!pair || analysis.length === 0) return null;

    const isSameLap = pair.refLap.id === pair.compLap.id;
    const totalCorners = analysis.length;
    const fasterCorners = isSameLap ? 0 : analysis.filter(c => c.status === 'faster').length;
    const slowerCorners = isSameLap ? 0 : analysis.filter(c => c.status === 'slower').length;
    const totalPotentialGain = isSameLap ? 0 : analysis.reduce((acc, c) => acc + c.opportunityScore, 0);
    const netCornerDelta = isSameLap ? 0 : analysis.reduce((acc, c) => acc + c.deltaCornerTime, 0);

    // Consistency / Corner score: 100% when same lap, or 100 minus penalty for lost time
    const cornerScore = isSameLap ? 100 : Math.max(0, Math.min(100, Math.round(100 - (totalPotentialGain * 18))));

    return {
      totalCorners,
      fasterCorners,
      slowerCorners,
      totalPotentialGain,
      netCornerDelta,
      cornerScore,
      isSameLap
    };
  });

  resumeData = this.telemetryService.resumeData;

  sessionStats = computed(() => {
    const data = this.resumeData();
    if (!data || !data.laps || data.laps.length === 0) return null;

    // Filter reasonable candidate laps to compute median (exclude non-physical milliseconds / few seconds)
    // In milliseconds, valid circuit laps are >= 20000ms (20s)
    const validCandidateLaps = data.laps.filter((l: { t: number }) => l.t >= 20000);
    const sourceLaps = validCandidateLaps.length > 0 ? validCandidateLaps : data.laps.filter((l: { t: number }) => l.t > 5000);
    if (sourceLaps.length === 0) return null;

    // Detect outliers (pit stops / false short recordings)
    const sortedTimes = [...sourceLaps].map((l: { t: number }) => l.t).sort((a: number, b: number) => a - b);
    const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
    
    // minValidThreshold: at least 65% of median and at least 20s (20000ms)
    const minValidThreshold = Math.max(20000, median * 0.65);
    // outlierThreshold: at most 30% slower than median (pit stops)
    const outlierThreshold = median * 1.30;

    const normalLaps = data.laps.filter((l: { t: number }) => l.t >= minValidThreshold && l.t <= outlierThreshold);
    if (normalLaps.length === 0) return null;

    const bestLapTime = Math.min(...normalLaps.map((l: { t: number }) => l.t));
    const worstLapTime = Math.max(...normalLaps.map((l: { t: number }) => l.t));

    const bestS1 = Math.min(...normalLaps.map((l: { s1: number }) => l.s1).filter((s: number) => s > 0));
    const bestS2 = Math.min(...normalLaps.map((l: { s2: number }) => l.s2).filter((s: number) => s > 0));
    const bestS3 = Math.min(...normalLaps.map((l: { s3: number }) => l.s3).filter((s: number) => s > 0));

    const worstS1 = Math.max(...normalLaps.map((l: { s1: number }) => l.s1).filter((s: number) => s > 0));
    const worstS2 = Math.max(...normalLaps.map((l: { s2: number }) => l.s2).filter((s: number) => s > 0));
    const worstS3 = Math.max(...normalLaps.map((l: { s3: number }) => l.s3).filter((s: number) => s > 0));

    const idealLap = bestS1 + bestS2 + bestS3;
    const potentialGain = bestLapTime - idealLap;

    // Consistency score (0-100)
    const avg = normalLaps.reduce((acc: number, l: { t: number }) => acc + l.t, 0) / normalLaps.length;
    const variance = normalLaps.reduce((acc: number, l: { t: number }) => acc + Math.pow(l.t - avg, 2), 0) / normalLaps.length;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.max(0, Math.min(100, 100 - (stdDev / avg * 1000)));

    return {
      bestLapTime,
      worstLapTime,
      bestS1,
      bestS2,
      bestS3,
      worstS1,
      worstS2,
      worstS3,
      idealLap,
      potentialGain,
      consistency,
      minValidThreshold,
      outlierThreshold,
      totalLaps: data.laps.length,
      normalLapsCount: normalLaps.length
    };
  });

  // Mini Sectors Analysis
  miniSectorDistance = signal(200);

  private interpolateTimeAtDistance(points: TelemetryPoint[], distance: number): number | null {
    if (!points || points.length === 0) return null;
    if (distance <= points[0].distance) return points[0].timestamp;
    if (distance >= points[points.length - 1].distance) return points[points.length - 1].timestamp;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (distance >= p1.distance && distance <= p2.distance) {
        const distRange = p2.distance - p1.distance;
        if (distRange === 0) return p1.timestamp;
        const t = (distance - p1.distance) / distRange;
        return p1.timestamp + t * (p2.timestamp - p1.timestamp);
      }
    }
    return null;
  }

  referenceTrackLength = computed(() => {
    const allLaps = this.filteredLaps();
    const statuses = this.lapStatuses();
    const laps = allLaps.filter(l => !statuses[l.id]?.isOutlier);
    if (laps.length === 0) return 0;
    return Math.max(...laps.map(l => (l.points && l.points.length > 0) ? l.points[l.points.length - 1].distance : 0));
  });

  miniSectorBoundaries = computed(() => {
    const length = this.referenceTrackLength();
    const step = this.miniSectorDistance();
    if (length <= 0) return [];
    
    const boundaries = [];
    for (let d = 0; d < length; d += step) {
      boundaries.push(d);
    }
    if (boundaries[boundaries.length - 1] !== length) {
      boundaries.push(length);
    }
    return boundaries;
  });

  miniSectorData = computed(() => {
    const allLaps = this.filteredLaps();
    const statuses = this.lapStatuses();
    // Exclude laps marked as outliers
    const laps = allLaps.filter(l => !statuses[l.id]?.isOutlier);
    
    const boundaries = this.miniSectorBoundaries();
    if (laps.length === 0 || boundaries.length < 2) return { segments: [], laps: [] };

    const segments = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startDist = boundaries[i];
      const endDist = boundaries[i + 1];
      
      const segmentLaps = laps.map(lap => {
        const startTime = this.interpolateTimeAtDistance(lap.points, startDist);
        const endTime = this.interpolateTimeAtDistance(lap.points, endDist);
        const time = (startTime !== null && endTime !== null) ? (endTime - startTime) : null;
        return { lapId: lap.id, time };
      });

      const validTimes = segmentLaps.map(l => l.time).filter((t): t is number => t !== null && t > 0);
      const best = validTimes.length > 0 ? Math.min(...validTimes) : null;
      const worst = validTimes.length > 0 ? Math.max(...validTimes) : null;

      segments.push({
        index: i + 1,
        startDistance: startDist,
        endDistance: endDist,
        best,
        worst,
        laps: segmentLaps
      });
    }

    return { segments, laps };
  });

  miniSectorIdealTime = computed(() => {
    const data = this.miniSectorData();
    return data.segments.reduce((acc, seg) => acc + (seg.best || 0), 0);
  });

  private interpolatePointAtDistance(points: TelemetryPoint[], distance: number): TelemetryPoint | null {
    if (!points || points.length === 0) return null;
    if (distance <= points[0].distance) return { ...points[0], distance };
    if (distance >= points[points.length - 1].distance) return { ...points[points.length - 1], distance };

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (distance >= p1.distance && distance <= p2.distance) {
        const distRange = p2.distance - p1.distance;
        if (distRange === 0) return { ...p1, distance };
        const t = (distance - p1.distance) / distRange;
        
        return {
          id: p1.id,
          timestamp: p1.timestamp + t * (p2.timestamp - p1.timestamp),
          distance: distance,
          speed: p1.speed + t * (p2.speed - p1.speed),
          lat: p1.lat + t * (p2.lat - p1.lat),
          lon: p1.lon + t * (p2.lon - p1.lon),
          alt: p1.alt + t * (p2.alt - p1.alt),
          accX: p1.accX + t * (p2.accX - p1.accX),
          accY: p1.accY + t * (p2.accY - p1.accY),
          throttle: p1.throttle + t * (p2.throttle - p1.throttle),
          brake: p1.brake + t * (p2.brake - p1.brake),
          temp: p1.temp + t * (p2.temp - p1.temp),
          sectors: p1.sectors
        };
      }
    }
    return null;
  }

  generateVirtualMiniLap() {
    const miniData = this.miniSectorData();
    if (miniData.segments.length === 0) return;

    const allLaps = this.laps();
    const virtualPoints: TelemetryPoint[] = [];
    let currentTime = 0;

    miniData.segments.forEach((segment) => {
      if (segment.best === null) return;

      const bestLapId = segment.laps.find(l => l.time === segment.best)?.lapId;
      if (!bestLapId) return;

      const lap = allLaps.find(l => l.id === bestLapId);
      if (!lap) return;

      const startDist = segment.startDistance;
      const endDist = segment.endDistance;

      // Extract points
      const pStart = this.interpolatePointAtDistance(lap.points, startDist);
      const midPoints = lap.points.filter(p => p.distance > startDist && p.distance < endDist);
      const pEnd = this.interpolatePointAtDistance(lap.points, endDist);

      const segmentPoints: TelemetryPoint[] = [];
      if (pStart) segmentPoints.push(pStart);
      segmentPoints.push(...midPoints);
      if (pEnd) segmentPoints.push(pEnd);
      
      if (segmentPoints.length === 0) return;

      const startTimeOffset = pStart?.timestamp ?? segmentPoints[0].timestamp;
      
      const adjusted = segmentPoints.map(p => ({
        ...p,
        timestamp: currentTime + (p.timestamp - startTimeOffset)
      }));

      // Avoid duplicate points at segment boundaries
      if (virtualPoints.length > 0 && adjusted.length > 0) {
        const last = virtualPoints[virtualPoints.length - 1];
        const first = adjusted[0];
        if (Math.abs(last.distance - first.distance) < 0.001) {
          virtualPoints.pop();
        }
      }

      virtualPoints.push(...adjusted);
      currentTime += segment.best;
    });

    if (virtualPoints.length === 0) return;

    const sectorSize = this.miniSectorDistance();
    const virtualLap: Lap = {
      id: `LAP-Virtual-${Date.now()}-${sectorSize}m`,
      driver: `Virtual ${sectorSize}m`,
      track: allLaps[0]?.track || 'Unknown',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      lapTime: currentTime,
      points: virtualPoints,
      sectors: [],
      isBest: true
    };

    this.telemetryService.addLap(virtualLap);
    this.telemetryService.selectedLapIds.update(prev => [...prev, virtualLap.id]);
  }

  updateMiniSectorDistance(event: Event) {
    const val = (event.target as HTMLInputElement).valueAsNumber;
    if (!isNaN(val) && val >= 10) {
      this.miniSectorDistance.set(val);
    }
  }

  formatSegTime(seconds: number | null): string {
    if (seconds === null) return '—';
    return seconds.toFixed(3) + 's';
  }

  // Resizing signals
  mapHeight = signal(600);
  chartHeight = signal(600);

  mapCenter = signal<{ lat: number; lng: number }>({ lat: -22.8447, lng: -46.7761 });
  mapTileLayer = signal<'esri' | 'osm'>('esri');

  setMapTileLayer(layer: 'esri' | 'osm') {
    this.mapTileLayer.set(layer);
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.leafletMap || !state.baseLayers) return;

    const { leafletMap, baseLayers } = state;
    if (leafletMap.hasLayer(baseLayers.esri)) leafletMap.removeLayer(baseLayers.esri);
    if (leafletMap.hasLayer(baseLayers.osm)) leafletMap.removeLayer(baseLayers.osm);

    if (layer === 'osm') baseLayers.osm.addTo(leafletMap);
    else baseLayers.esri.addTo(leafletMap);
  }

  async initOrUpdateLeafletMap() {
    if (!isPlatformBrowser(this.platformId)) return;
    const containerRef = this.leafletMapContainer();
    if (!containerRef || !containerRef.nativeElement) return;
    const container = containerRef.nativeElement;

    let state = APP_INTERNAL_STATE.get(this);
    if (!state) {
      state = { d3: null, chartInstances: [], gCircleSvg: null };
      APP_INTERNAL_STATE.set(this, state);
    }

    if (!state.leafletL) {
      const leafletModule = await import('leaflet');
      const mod = leafletModule as unknown as { default?: typeof L_TYPES };
      state.leafletL = mod.default || (leafletModule as unknown as typeof L_TYPES);
    }
    const L = state.leafletL as typeof L_TYPES;

    if (!state.leafletMap) {
      const map = L.map(container, {
        center: [-22.8447, -46.7761],
        zoom: 15,
        zoomControl: true,
        attributionControl: false
      });

      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      // 1. Esri World Imagery (Satellite) - default
      const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri &bull; Earthstar &bull; GIS Community'
      });

      // 2. OpenStreetMap Standard (Padrão Ruas)
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });

      state.baseLayers = { esri: esriLayer, osm: osmLayer };

      const current = this.mapTileLayer();
      if (current === 'osm') osmLayer.addTo(map);
      else esriLayer.addTo(map);

      state.traceLayerGroup = L.layerGroup().addTo(map);
      state.extremaLayerGroup = L.layerGroup().addTo(map);
      state.markersLayerGroup = L.layerGroup().addTo(map);

      state.leafletMap = map;
    }

    state.leafletMap?.invalidateSize();
    this.renderLeafletTraces();
    this.renderLeafletExtrema();
    this.renderLeafletSyncMarkers();
    this.centerLeafletMap();
  }

  renderLeafletTraces() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.leafletMap || !state.traceLayerGroup || !state.leafletL) return;
    const L = state.leafletL as typeof L_TYPES;
    const group = state.traceLayerGroup;
    group.clearLayers();

    const traces = this.lapTracePaths();
    traces.forEach(t => {
      if (t.path && t.path.length >= 2) {
        const latlngs: L_TYPES.LatLngExpression[] = t.path.map((p: { lat: number; lng: number }) => [p.lat, p.lng]);
        L.polyline(latlngs, {
          color: t.options?.strokeColor || '#00e5ff',
          weight: t.options?.strokeWeight || 4,
          opacity: t.options?.strokeOpacity || 0.9,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1
        }).addTo(group);
      }
    });
  }

  renderLeafletExtrema() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.leafletMap || !state.extremaLayerGroup || !state.leafletL) return;
    const L = state.leafletL as typeof L_TYPES;
    const group = state.extremaLayerGroup;
    group.clearLayers();

    const extrema = this.extremeMarkers();
    extrema.forEach(item => {
      const isMax = item.options?.isMax ?? true;
      const label = item.options?.labelText || item.options?.label?.text || '';
      const color = isMax ? '#00e676' : '#ff3e3e';
      const icon = L.divIcon({
        className: 'custom-extrema-marker',
        html: `
          <div style="transform: translate(-50%, -100%); display: inline-flex; flex-direction: column; align-items: center; pointer-events: none;">
            <div style="background: rgba(10, 14, 22, 0.94); border: 1.5px solid ${color}; border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 9px; font-weight: 800; color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.6); white-space: nowrap;">
              ${label}
            </div>
            <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid ${color};"></div>
          </div>
        `,
        iconSize: [0, 0]
      });
      L.marker([item.position.lat, item.position.lng], { icon, interactive: false }).addTo(group);
    });
  }

  renderLeafletSyncMarkers() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.leafletMap || !state.markersLayerGroup || !state.leafletL) return;
    const L = state.leafletL as typeof L_TYPES;
    const group = state.markersLayerGroup;
    group.clearLayers();

    const markers = this.syncMarkers();
    markers.forEach(m => {
      if (!m || !m.position) return;
      const color = m.color || '#00e5ff';
      const label = m.label || '';
      const icon = L.divIcon({
        className: 'custom-sync-marker',
        html: `
          <div style="transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; pointer-events: none;">
            <div style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; position: relative;">
              <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: ${color}; opacity: 0.3; animation: pulse 2s infinite;"></div>
              <div style="width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 0 10px ${color};"></div>
            </div>
            ${label ? `<div style="background: rgba(0,0,0,0.85); border: 1px solid ${color}; border-radius: 4px; padding: 1px 4px; font-size: 8px; font-weight: 900; font-family: monospace; color: #fff; margin-top: 2px; white-space: nowrap;">${label}</div>` : ''}
          </div>
        `,
        iconSize: [0, 0]
      });
      L.marker([m.position.lat, m.position.lng], { icon, interactive: false }).addTo(group);
    });
  }

  centerLeafletMap() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.leafletMap || !state.leafletL) return;
    const L = state.leafletL as typeof L_TYPES;
    const map = state.leafletMap;

    let lapsToCenter: Lap[] = [];
    const active = this.activeTab();
    if (active === 'map' || active === 'heatmap') {
      const refId = this.referenceLapId();
      const compId = this.comparisonLapId();
      const all = this.filteredLaps();
      if (refId) {
        const l = all.find(x => x.id === refId);
        if (l) lapsToCenter.push(l);
      }
      if (compId && compId !== refId) {
        const l = all.find(x => x.id === compId);
        if (l) lapsToCenter.push(l);
      }
      if (lapsToCenter.length === 0) lapsToCenter = all;
    } else {
      const laps = this.selectedLaps();
      lapsToCenter = laps.length > 0 ? laps : this.filteredLaps();
    }

    if (lapsToCenter.length > 0) {
      const bounds = L.latLngBounds([]);
      lapsToCenter.forEach(lap => {
        (lap.points || []).forEach(p => {
          if (!isNaN(p.lat) && !isNaN(p.lon)) {
            bounds.extend([p.lat, p.lon]);
          }
        });
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }

  lapTracePaths = computed(() => {
    const active = this.activeTab();

    if (active === 'map' || active === 'heatmap') {
      const refId = this.referenceLapId();
      const compId = this.comparisonLapId();
      const allLaps = this.laps();
      const refLap = refId ? allLaps.find((l: Lap) => l.id === refId) : null;
      const compLap = compId ? allLaps.find((l: Lap) => l.id === compId) : null;

      // Delta Mode: only when BOTH laps are selected and distinct
      if (this.mapDisplayMode() === 'delta' && refLap && compLap && refLap.id !== compLap.id) {
        return this.calculateSkillHeatmap();
      }

      // Speed Heatmap Mode (or fallback if only 1 lap selected in delta mode):
      const targetLap = compLap || refLap;
      if (!targetLap || !targetLap.points || targetLap.points.length < 2) return [];

      const segments: any[] = [];

      // 1. Reference lap trajectory path (if both are selected and ref is different)
      if (refLap && compLap && refLap.id !== compLap.id && refLap.points) {
        const refPoints = refLap.points.filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon));
        if (refPoints.length >= 2) {
          segments.push({
            path: refPoints.map((p: TelemetryPoint) => ({ lat: p.lat, lng: p.lon })),
            options: {
              strokeColor: this.refTrajectoryColor(),
              strokeOpacity: 0.85,
              strokeWeight: 4
            }
          });
        }
      }

      // 2. Target lap speed heatmap segments
      const points = targetLap.points.filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon));
      if (points.length >= 2) {
        const speeds = points.map(p => p.speed);
        const maxSpeed = Math.max(...speeds) || 1;
        const minSpeed = Math.min(...speeds) || 0;
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i+1];
          const avgSpeed = (p1.speed + p2.speed) / 2;
          segments.push({
            path: [{ lat: p1.lat, lng: p1.lon }, { lat: p2.lat, lng: p2.lon }],
            options: {
              strokeColor: this.getSpeedColor(avgSpeed, maxSpeed, minSpeed),
              strokeOpacity: 1,
              strokeWeight: 5
            }
          });
        }
      }

      return segments;
    }

    const laps = this.selectedLaps();
    return laps.map((lap: Lap) => {
      const path = (lap.points || [])
        .filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon))
        .map((p: TelemetryPoint) => ({ lat: p.lat, lng: p.lon }));
      
      const lapIndex = this.laps().findIndex((l: Lap) => l.id === lap.id);
      
      return {
        path,
        options: {
          strokeColor: LAP_COLORS[lapIndex % LAP_COLORS.length],
          strokeOpacity: 0.8,
          strokeWeight: 3
        }
      };
    });
  });

  extremeMarkers = computed(() => {
    const active = this.activeTab();
    if (active !== 'map' && active !== 'heatmap') return [];
    if (this.mapDisplayMode() !== 'speed') return []; // Clean delta mode

    const refId = this.referenceLapId();
    const compId = this.comparisonLapId();
    const allLaps = this.laps();
    const refLap = refId ? allLaps.find(l => l.id === refId) : null;
    const compLap = compId ? allLaps.find(l => l.id === compId) : null;

    const primaryLap = compLap || refLap;
    if (!primaryLap || !primaryLap.points || primaryLap.points.length < 20) return [];

    const points = primaryLap.points.filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon));
    if (points.length < 20) return [];

    const extrema = this.findSegmentExtrema(points);
    const hasBothLaps = !!(refLap && compLap && refLap.id !== compLap.id && refLap.points?.length && compLap.points?.length);

    return extrema.map((p: TelemetryPoint & { isMax: boolean }) => {
      let labelText = '';
      let boxWidth = 36;

      if (hasBothLaps) {
        const pRef = this.findClosestPointByDistance(refLap!.points, p.distance);
        const pComp = this.findClosestPointByDistance(compLap!.points, p.distance);
        const refSpeed = pRef ? Math.round(pRef.speed) : (primaryLap === refLap ? Math.round(p.speed) : 0);
        const compSpeed = pComp ? Math.round(pComp.speed) : (primaryLap === compLap ? Math.round(p.speed) : 0);
        labelText = `R:${refSpeed} | C:${compSpeed}`;
        boxWidth = 72;
      } else {
        const speed = Math.round(p.speed);
        labelText = `${speed}`;
        boxWidth = 34;
      }

      const halfW = boxWidth / 2;

      return {
        position: { lat: p.lat, lng: p.lon },
        options: {
          isMax: p.isMax,
          labelText: labelText,
          label: {
            text: labelText,
            color: '#ffffff',
            fontSize: hasBothLaps ? '8.5px' : '9.5px',
            fontWeight: '900'
          },
          icon: {
            path: `M -${halfW} -9 L ${halfW} -9 L ${halfW} 9 L -${halfW} 9 Z`,
            fillColor: p.isMax ? '#059669' : '#dc2626',
            fillOpacity: 0.95,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1,
            labelOrigin: { x: 0, y: 0 } as any
          },
          zIndex: 100
        }
      };
    });
  });

  private findSegmentExtrema(points: TelemetryPoint[]): (TelemetryPoint & { isMax: boolean })[] {
    if (points.length < 20) return [];
    const result: (TelemetryPoint & { isMax: boolean })[] = [];
    
    // Smoothing to reduce noise
    const windowSize = 5; 
    const smoothed = points.map((p, i) => {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(points.length, i + windowSize);
      const slice = points.slice(start, end);
      return slice.reduce((acc, curr) => acc + curr.speed, 0) / slice.length;
    });

    for (let i = windowSize; i < points.length - windowSize; i++) {
      const curr = smoothed[i];
      
      let isMax = true;
      let isMin = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (smoothed[j] > curr) isMax = false;
        if (smoothed[j] < curr) isMin = false;
      }

      if (isMax || isMin) {
        let plateauStart = i;
        let plateauEnd = i;
        while (plateauStart > 0 && smoothed[plateauStart - 1] === curr) plateauStart--;
        while (plateauEnd < smoothed.length - 1 && smoothed[plateauEnd + 1] === curr) plateauEnd++;
        
        const plateauMiddle = Math.floor((plateauStart + plateauEnd) / 2);
        if (i !== plateauMiddle) continue;

        const lastExtremum = result[result.length - 1];
        const distFromLast = lastExtremum ? points[i].distance - lastExtremum.distance : Infinity;
        
        // Use a 40m threshold as base, alternating logic will prune further
        if (distFromLast > 40) {
          result.push({ ...points[i], isMax: isMax });
        } else if (lastExtremum) {
          if (isMax && lastExtremum.isMax && points[i].speed > lastExtremum.speed) {
            result[result.length - 1] = { ...points[i], isMax: true };
          } else if (isMin && !lastExtremum.isMax && points[i].speed < lastExtremum.speed) {
            result[result.length - 1] = { ...points[i], isMax: false };
          }
        }
      }
    }

    // Enforce alternating Max -> Min -> Max...
    if (result.length < 2) return result;
    
    const alternating: (TelemetryPoint & { isMax: boolean })[] = [];
    let current = result[0];
    
    for (let i = 1; i < result.length; i++) {
      const next = result[i];
      if (current.isMax === next.isMax) {
        // Same type, pick the more extreme one
        if (current.isMax) {
          if (next.speed > current.speed) current = next;
        } else {
          if (next.speed < current.speed) current = next;
        }
      } else {
        // Different type, store current and move to next
        alternating.push(current);
        current = next;
      }
    }
    alternating.push(current);
    
    return alternating;
  }

  private calculateSkillHeatmap(): any[] {
    const refId = this.referenceLapId();
    const compId = this.comparisonLapId();
    if (!refId || !compId) return [];

    const refLap = this.laps().find((l: Lap) => l.id === refId);
    const compLap = this.laps().find((l: Lap) => l.id === compId);
    if (!refLap || !compLap || !refLap.points || !compLap.points) return [];

    const segments: any[] = [];
    const refPoints = refLap.points.filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon));
    const compPoints = compLap.points.filter((p: TelemetryPoint) => !isNaN(p.lat) && !isNaN(p.lon));

    // Add the reference lap trajectory in the single customizable color (default: Cyan #00e5ff)
    segments.push({
      path: refPoints.map((p: TelemetryPoint) => ({ lat: p.lat, lng: p.lon })),
      options: {
        strokeColor: this.refTrajectoryColor(),
        strokeOpacity: 0.95,
        strokeWeight: 4
      }
    });

    for (let i = 0; i < compPoints.length - 1; i++) {
      const p1 = compPoints[i];
      const p2 = compPoints[i+1];
      
      // Synchronize spatially: find closest point on reference lap by distance
      const refP = this.findClosestPointByDistance(refPoints, p1.distance);
      if (!refP) continue;

      const delta = p1.speed - refP.speed;
      segments.push({
        path: [{ lat: p1.lat, lng: p1.lon }, { lat: p2.lat, lng: p2.lon }],
        options: {
          strokeColor: this.getDeltaColor(delta),
          strokeOpacity: 1,
          strokeWeight: 5
        }
      });
    }
    return segments;
  }

  private findClosestPointByDistance(points: TelemetryPoint[], dist: number): TelemetryPoint | null {
    let low = 0;
    let high = points.length - 1;
    let closest = points[0];
    let minDiff = Math.abs(points[0].distance - dist);

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const diff = Math.abs(points[mid].distance - dist);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[mid];
      }
      if (points[mid].distance < dist) low = mid + 1;
      else if (points[mid].distance > dist) high = mid - 1;
      else return points[mid];
    }
    return closest;
  }

  private getDeltaColor(delta: number): string {
    // Delta is ref - comp
    // Positive (ref faster) -> Green/Cyan
    // Negative (comp faster) -> Red
    // Near zero -> White/Yellow
    if (delta > 5) return '#00e676'; // Strong advantage (Green)
    if (delta > 2) return '#00e5ff'; // Advantage (Cyan)
    if (delta > -2) return '#ffea00'; // Tie (Yellow)
    if (delta > -5) return '#ff9100'; // Disadvantage (Orange)
    return '#ff3e3e'; // Strong disadvantage (Red)
  }

  formatMs(ms: number): string {
    if (!ms) return '00:00:00.000';
    const hrs = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const msec = Math.floor(ms % 1000);
    return `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${msec.toString().padStart(3, '0')}`;
  }

  private getSpeedColor(speed: number, maxSpeed: number, minSpeed = 0): string {
    const range = maxSpeed - minSpeed;
    const ratio = range > 0 ? (speed - minSpeed) / range : 0.5;
    
    // Red (Slow) -> Yellow -> Green (Fast) heatmap
    if (ratio < 0.25) return '#ff3e3e'; // Slow (Red)
    if (ratio < 0.5) return '#ffea00'; // Medium (Yellow)
    if (ratio < 0.75) return '#76ff03'; // Fast (Light Green)
    return '#00e676'; // Max (Green)
  }

  syncMarkers = computed(() => {
    const dist = this.hoveredDistance();
    const active = this.activeTab();
    const allLaps = this.laps();
    
    // Get the correct playback state based on active tab
    const time = active === 'charts' ? this.chartsPlaybackTime() : 
                 active === 'delta' ? this.deltaPlaybackTime() : 
                 this.playbackTime();
    const isPlaying = active === 'charts' ? this.chartsIsPlaying() : 
                      active === 'delta' ? this.deltaIsPlaying() : 
                      this.isPlaying();
    
    let laps: Lap[] = [];

    if (active === 'map' || active === 'heatmap') {
      const refId = this.referenceLapId();
      const compId = this.comparisonLapId();
      
      if (refId) {
        const lap = allLaps.find(l => l.id === refId);
        if (lap) laps.push(lap);
      }
      if (compId && compId !== refId) {
        const lap = allLaps.find(l => l.id === compId);
        if (lap) laps.push(lap);
      }
    } else {
      laps = this.selectedLaps();
    }
    
    if (laps.length === 0) return [];
    
    return laps.map((lap) => {
      if (!lap.points || lap.points.length === 0) return null;
      
      let closest: TelemetryPoint | null = null;
      
      // Use tab-specific playback state
      if (isPlaying || (time > 0 && dist === null)) {
        closest = this.getPointAtTime(lap, time);
      } else if (dist !== null) {
        closest = this.getPointAtDistance(lap, dist);
      }

      if (!closest) return null;
      
      const isRef = lap.id === this.referenceLapId();
      const isComp = lap.id === this.comparisonLapId();
      const lapIndex = this.laps().findIndex(l => l.id === lap.id);
      const color = (active === 'map' || active === 'heatmap')
        ? (isRef ? this.refTrajectoryColor() : '#ff3e3e')
        : LAP_COLORS[lapIndex % LAP_COLORS.length];
      
      const svg = `
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="14" fill="${color}" fill-opacity="0.2">
            <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="20" cy="20" r="6" fill="${color}" stroke="white" stroke-width="1.5" />
          <circle cx="20" cy="20" r="2" fill="white" />
        </svg>
      `.trim();
      
      const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
      
      return {
        position: { lat: closest.lat, lng: closest.lon },
        color: color,
        label: isRef && (active === 'map' || active === 'heatmap') ? 'REF' : 
               isComp && (active === 'map' || active === 'heatmap') ? 'COMP' : 
               `Lap ${this.laps().findIndex(l => l.id === lap.id) + 1}`,
        icon: dataUrl
      };
    }).filter(m => m !== null);
  });

  private getPointAtTime(lap: Lap, time: number): TelemetryPoint | null {
    if (!lap.points || lap.points.length === 0) return null;
    let closest = lap.points[0];
    let minDiff = Math.abs(lap.points[0].timestamp - time);
    for (const p of lap.points) {
      const diff = Math.abs(p.timestamp - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      } else if (p.timestamp > time + 0.5) break;
    }
    return closest;
  }

  private getPointAtDistance(lap: Lap, dist: number): TelemetryPoint | null {
    if (!lap.points || lap.points.length === 0) return null;
    let closest = lap.points[0];
    let minDiff = Math.abs(lap.points[0].distance - dist);
    for (const p of lap.points) {
      const diff = Math.abs(p.distance - dist);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      } else if (p.distance > dist + 10) break;
    }
    return closest;
  }

  constructor() {
    effect(() => {
      if (isPlatformBrowser(this.platformId) && this.d3Ready()) {
        this.selectedLaps(); // Explicitly track dependency
        const tab = this.activeTab(); // Explicitly track dependency
        this.themeService.isDark(); // Track theme changes for real-time palette update
        if (tab === 'charts') {
          setTimeout(() => this.renderCharts(), 20);
        } else if (tab === 'delta') {
          setTimeout(() => this.renderDeltaTab(), 20);
        }
      }
    });

    // Auto-initialize heatmap, delta, and corner coaching laps
    effect(() => {
      const allLaps = this.filteredLaps();
      if (allLaps.length > 0) {
        untracked(() => {
          // Set Reference to first lap if not set
          if (!this.referenceLapId()) {
            this.referenceLapId.set(allLaps[0].id);
          }
          if (!this.deltaReferenceLapId()) {
            this.deltaReferenceLapId.set(allLaps[0].id);
          }
          
          // Set Comparison to second lap if available and not set (or if it's currently the same as reference)
          if (allLaps.length > 1) {
            if (!this.comparisonLapId() || this.comparisonLapId() === allLaps[0].id) {
              this.comparisonLapId.set(allLaps[1].id);
            }
            if (!this.deltaComparisonLapId() || this.deltaComparisonLapId() === allLaps[0].id) {
              this.deltaComparisonLapId.set(allLaps[1].id);
            }
          } else if (!this.comparisonLapId()) {
            // Fallback for single lap
            this.comparisonLapId.set(allLaps[0].id);
            this.deltaComparisonLapId.set(allLaps[0].id);
          }

          // Corner Coaching: Auto-initialize with the TWO BEST / FASTEST laps
          if (!this.hasUserManuallySelectedCoachingLaps()) {
            const sortedFastest = this.getSortedFastestRacingLaps(allLaps);
            if (sortedFastest.length >= 2) {
              this.coachingReferenceLapId.set(sortedFastest[0].id);
              this.coachingComparisonLapId.set(sortedFastest[1].id);
            } else if (sortedFastest.length === 1) {
              this.coachingReferenceLapId.set(sortedFastest[0].id);
              this.coachingComparisonLapId.set(sortedFastest[0].id);
            }
          }
        });
      }
    });

    // Center map on the first lap when data is loaded
    effect(() => {
      const allLaps = this.laps();
      if (allLaps.length > 0 && allLaps[0].points && allLaps[0].points.length > 0) {
        const points = allLaps[0].points.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
        if (points.length > 0) {
          const lats = points.map(p => p.lat);
          const lons = points.map(p => p.lon);
          this.mapCenter.set({
            lat: (Math.min(...lats) + Math.max(...lats)) / 2,
            lng: (Math.min(...lons) + Math.max(...lons)) / 2
          });
        }
      }
    });

    // Playback loop
    if (isPlatformBrowser(this.platformId)) {
      setInterval(() => {
        // Global Player
        if (this.isPlaying()) {
          const delta = 0.1 * this.playbackSpeed();
          this.playbackTime.update(t => {
            const next = t + delta;
            const max = this.maxLapTime();
            if (next >= max) {
              this.isPlaying.set(false);
              return max;
            }
            return next;
          });
        }
        
        // Heatmap Individual Player
        if (this.heatmapIsPlaying()) {
          const delta = 0.1 * this.heatmapPlaybackSpeed();
          this.heatmapPlaybackTime.update(t => {
            const next = t + delta;
            const max = this.heatmapMaxLapTime();
            if (next >= max) {
              this.heatmapIsPlaying.set(false);
              return max;
            }
            return next;
          });
        }

        // Charts Individual Player
        if (this.chartsIsPlaying()) {
          const delta = 0.1 * this.chartsPlaybackSpeed();
          this.chartsPlaybackTime.update(t => {
            const next = t + delta;
            const max = this.maxLapTime();
            if (next >= max) {
              this.chartsIsPlaying.set(false);
              return max;
            }
            return next;
          });
        }
      }, 100);
    }

    // Sync charts with playback
    effect(() => {
      const active = this.activeTab();
      const time = active === 'charts' ? this.chartsPlaybackTime() : 
                   active === 'heatmap' ? this.heatmapPlaybackTime() : 
                   this.playbackTime();
      
      const isPlaying = active === 'charts' ? this.chartsIsPlaying() :
                        active === 'heatmap' ? this.heatmapIsPlaying() :
                        this.isPlaying();

      const laps = active === 'heatmap' ? 
                   this.laps().filter(l => l.id === this.referenceLapId() || l.id === this.comparisonLapId()) :
                   this.selectedLaps();
                   
      if (isPlaying && laps.length > 0) {
        const primaryLap = laps[0];
        const p = this.getPointAtTime(primaryLap, time);
        if (p) {
          this.hoveredDistance.set(p.distance);
        }
      }
    });

    // Centralized synchronization effects
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const dist = this.hoveredDistance();
      const state = APP_INTERNAL_STATE.get(this);
      if (!state) return;

      if (dist === null) {
        state.chartInstances.forEach(inst => {
          if (inst.focusLine) inst.focusLine.style('display', 'none');
          if (inst.focusCircles) inst.focusCircles.forEach((c: any) => c.style('display', 'none'));
          if (inst.focusLabels) inst.focusLabels.forEach((l: any) => l.style('display', 'none'));
          if (inst.customHide) inst.customHide();
        });
        if (state.gCircleSvg) state.gCircleSvg.style('display', 'none');
        return;
      }

      state.chartInstances.forEach(inst => {
        const mouseX = inst.currentXScale(dist);
        if (mouseX < 0 || mouseX > inst.width) {
          inst.focusLine.style('display', 'none');
          if (inst.focusCircles) inst.focusCircles.forEach((c: any) => c.style('display', 'none'));
          if (inst.focusLabels) inst.focusLabels.forEach((l: any) => l.style('display', 'none'));
          if (inst.customHide) inst.customHide();
        } else {
          inst.focusLine.attr('x1', mouseX).attr('x2', mouseX).style('display', null);
          if (inst.customUpdate) {
            inst.customUpdate(dist);
            return;
          }
          
          const labelData: any[] = [];
          
          inst.laps.forEach((lap: any, i: number) => {
            if (!lap.points || lap.points.length === 0) return;
            const bisect = state.d3.bisector((d: any) => d.distance).left;
            const idx = bisect(lap.points, dist);
            const p = lap.points[idx] || lap.points[lap.points.length - 1];
            if (p) {
              const val = inst.field === 'braking' ? Math.max(0, -p.accY) : p[inst.field] as number;
              
              if (inst.focusCircles[i]) {
                inst.focusCircles[i].attr('cx', inst.currentXScale(p.distance)).attr('cy', inst.y(val)).style('display', null);
              }
              
              labelData.push({
                index: i,
                y: inst.y(val),
                val: val,
                x: inst.currentXScale(p.distance)
              });
            }
          });

          // Prevent Label Overlap
          labelData.sort((a, b) => a.y - b.y);
          const minGap = 14;
          for (let k = 1; k < labelData.length; k++) {
            if (labelData[k].y < labelData[k - 1].y + minGap) {
              labelData[k].y = labelData[k - 1].y + minGap;
            }
          }

          labelData.forEach(ld => {
            inst.focusLabels[ld.index]
              .attr('x', ld.x + 8)
              .attr('y', ld.y + 4)
              .text(inst.field === 'timestamp' ? this.formatMs(ld.val * 1000) : `${ld.val.toFixed(inst.field === 'speed' ? 1 : 2)}`)
              .style('display', null);
          });
        }
      });

      if (state.gCircleSvg && this.selectedLaps().length > 0 && state.d3) {
        const lap = this.selectedLaps()[0];
        const bisect = state.d3.bisector((d: any) => d.distance).left;
        const idx = bisect(lap.points, dist);
        const p = lap.points[idx] || lap.points[lap.points.length - 1];
        const container = this.gCircleContainer();
        if (p && container) {
          const radius = Math.min(container.nativeElement.clientWidth, container.nativeElement.clientHeight) / 2 - 10;
          const scale = state.d3.scaleLinear().domain([-2.5, 2.5]).range([-radius, radius]);
          state.gCircleSvg.attr('cx', scale(p.accX))
            .attr('cy', scale(-p.accY))
            .style('display', null);
        }
      }
    });

    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const transform = this.sharedZoomTransform();
      const state = APP_INTERNAL_STATE.get(this);
      if (transform && state && state.d3) {
        const t = state.d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k);
        state.chartInstances.forEach(inst => inst.updateZoom(t));
      }
    });

    // Auto-update Leaflet map when active tab is map/heatmap or traces change
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const active = this.activeTab();
      if (active === 'map' || active === 'heatmap') {
        this.lapTracePaths();
        this.extremeMarkers();
        setTimeout(() => {
          this.initOrUpdateLeafletMap();
        }, 60);
      }
    });

    // Auto-update playback vehicle markers in Leaflet
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const active = this.activeTab();
      if (active === 'map' || active === 'heatmap') {
        this.syncMarkers();
        this.renderLeafletSyncMarkers();
      }
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.trackService.getAllLaps().subscribe(laps => {
        laps.forEach(lap => this.telemetryService.addLap(lap));
        if (laps.length >= 2) {
          this.selectedLapIds.set([laps[0].id, laps[1].id]);
        }

        const validLaps = this.getValidRacingLaps(laps);
        const bestTime = validLaps.length > 0 ? Math.min(...validLaps.map(l => l.lapTime)) : Math.min(...laps.map(l => l.lapTime));

        // Initialize Corner Coaching with the two best laps
        const sortedFastest = this.getSortedFastestRacingLaps(laps);
        if (sortedFastest.length >= 2) {
          this.coachingReferenceLapId.set(sortedFastest[0].id);
          this.coachingComparisonLapId.set(sortedFastest[1].id);
        } else if (sortedFastest.length === 1) {
          this.coachingReferenceLapId.set(sortedFastest[0].id);
          this.coachingComparisonLapId.set(sortedFastest[0].id);
        }

        const defaultSession: SessionItem = {
          id: 'FABIO___AUTODROMO DE GOIANIA___2024-08-24___09-31-00',
          driver: 'FABIO',
          track: 'AUTODROMO DE GOIANIA',
          date: '2024-08-24',
          time: '09-31-00',
          lapFiles: [],
          laps: laps,
          resumeData: this.telemetryService.resumeData(),
          bestLapTime: bestTime,
          lapCount: laps.length,
          isLoaded: true
        };

        this.ensureSessionIdealLap(defaultSession);
        this.telemetryService.laps.set(defaultSession.laps);

        this.allSessions.set([defaultSession]);
        this.profileTree.set(this.buildProfileTree([defaultSession]));
        this.activeSessionKey.set(defaultSession.id);
        this.activeSession.set(defaultSession);
        this.currentSessionDriver.set(defaultSession.driver);
        this.currentSessionTrack.set(defaultSession.track);
        this.currentSessionDate.set(defaultSession.date);
        this.currentSessionTime.set(defaultSession.time);
        this.setTab('resume');

        // Automatically load persistent linked directory if previously configured
        this.checkAndAutoLoadLinkedDirectory();
      });
    }
  }

  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      const d3 = await import('d3');
      APP_INTERNAL_STATE.set(this, { d3, chartInstances: [], gCircleSvg: null });
      this.d3Ready.set(true);
      setTimeout(() => this.renderCharts(), 100);
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
    setTimeout(() => {
      this.renderCharts();
      const state = APP_INTERNAL_STATE.get(this);
      if (state && state.leafletMap) state.leafletMap.invalidateSize();
    }, 300);
  }

  toggleMapSidebar() {
    this.mapSidebarCollapsed.update(v => !v);
    setTimeout(() => {
      const state = APP_INTERNAL_STATE.get(this);
      if (state && state.leafletMap) state.leafletMap.invalidateSize();
    }, 200);
  }

  adjustMapHeight(delta: number) {
    this.mapHeight.update(h => Math.max(300, Math.min(1000, h + delta)));
    setTimeout(() => {
      const state = APP_INTERNAL_STATE.get(this);
      if (state && state.leafletMap) state.leafletMap.invalidateSize();
    }, 100);
  }

  adjustChartHeight(delta: number) {
    this.chartHeight.update(h => Math.max(300, Math.min(1000, h + delta)));
    setTimeout(() => this.renderCharts(), 100);
  }

  setTab(tab: 'resume' | 'map' | 'charts' | 'heatmap' | 'delta' | 'coaching') {
    if (tab === 'heatmap') {
      this.activeTab.set('map');
      this.mapDisplayMode.set('delta');
    } else {
      this.activeTab.set(tab);
    }
    if (tab === 'map' || tab === 'heatmap') {
      setTimeout(() => {
        this.initOrUpdateLeafletMap();
      }, 80);
    } else if (tab === 'coaching') {
      const pair = this.coachingLapsPair();
      const hasInvalidOrSame = !pair || pair.refLap.id === pair.compLap.id;
      if (!this.hasUserManuallySelectedCoachingLaps() || (hasInvalidOrSame && this.filteredLaps().length >= 2)) {
        this.selectFastestTwoCoachingLaps();
      }
    } else if (tab === 'charts') {
      setTimeout(() => {
        this.renderCharts();
      }, 80);
    } else if (tab === 'delta') {
      setTimeout(() => {
        this.renderDeltaTab();
      }, 80);
    }
  }

  renderDeltaTab() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.d3) return;

    const laps = this.selectedLaps();
    const container = this.deltaTabChartContainer();
    if (container) {
      this.drawDeltaBarChart(container, laps);
    } else {
      setTimeout(() => {
        const retry = this.deltaTabChartContainer();
        if (retry) {
          this.drawDeltaBarChart(retry, laps);
        }
      }, 70);
    }
  }

  private renderCharts() {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.d3) return;
    
    const laps = this.selectedLaps();
    
    if (laps.length === 0) {
      // Clear all charts if no laps selected
      [
        this.speedChartContainer(),
        this.latAccelChartContainer(),
        this.longAccelChartContainer(),
        this.altitudeChartContainer(),
        this.timeDeltaChartContainer(),
        this.brakingChartContainer(),
        this.gCircleContainer()
      ].forEach(container => {
        if (container) state.d3.select(container.nativeElement).selectAll('*').remove();
      });
      state.chartInstances = [];
      return;
    }
    
    state.chartInstances = [];

    const speed = this.speedChartContainer();
    if (speed && !this.collapsedCharts().includes('speed')) {
      this.drawD3Chart(speed, laps, 'speed', [0, 240]);
    }

    const lat = this.latAccelChartContainer();
    if (lat && !this.collapsedCharts().includes('latAccel')) {
      this.drawD3Chart(lat, laps, 'accX', [-2, 2]);
    }

    const long = this.longAccelChartContainer();
    if (long && !this.collapsedCharts().includes('longAccel')) {
      this.drawD3Chart(long, laps, 'accY', [-2, 2]);
    }
    
    const alt = this.altitudeChartContainer();
    if (alt && !this.collapsedCharts().includes('altitude')) {
      const allAltPoints = laps.flatMap(l => l.points || []).map(p => p.alt || 0);
      const minAlt = Math.min(...allAltPoints);
      const maxAlt = Math.max(...allAltPoints);
      this.drawD3Chart(alt, laps, 'alt' as any, [minAlt - 5, maxAlt + 5]);
    }

    const braking = this.brakingChartContainer();
    if (braking && !this.collapsedCharts().includes('braking')) {
      this.drawBrakingChart(braking, laps);
    }
    
    this.drawGCircle(laps);
  }

  onChartDragStart(event: DragEvent, chartId: string) {
    this.draggedChart.set(chartId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', chartId);
    }
  }

  onChartDragOver(event: DragEvent, chartId: string) {
    event.preventDefault();
    const dragged = this.draggedChart();
    if (dragged && dragged !== chartId) {
      const currentOrder = this.chartOrder();
      const fromIndex = currentOrder.indexOf(dragged);
      const toIndex = currentOrder.indexOf(chartId);
      
      const newOrder = [...currentOrder];
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, dragged);
      
      this.chartOrder.set(newOrder);
    }
  }

  onChartDragEnd() {
    this.draggedChart.set(null);
    setTimeout(() => this.renderCharts(), 50);
  }

  toggleChartCollapse(chartId: string) {
    const isExpanding = this.collapsedCharts().includes(chartId);
    this.collapsedCharts.update(prev => 
      prev.includes(chartId) ? prev.filter(id => id !== chartId) : [...prev, chartId]
    );
    if (isExpanding) {
      setTimeout(() => this.renderCharts(), 40);
      setTimeout(() => this.renderCharts(), 320);
    }
  }

  private drawGCircle(laps: Lap[]) {
    const state = APP_INTERNAL_STATE.get(this);
    const container = this.gCircleContainer();
    if (!state || !state.d3 || !container) return;
    const element = container.nativeElement;
    state.d3.select(element).selectAll('*').remove();
    const size = Math.min(element.clientWidth, element.clientHeight);
    if (size <= 0) return;
    const margin = 10;
    const radius = size / 2 - margin;
    
    const svg = state.d3.select(element).append('svg')
      .attr('width', size)
      .attr('height', size)
      .append('g')
      .attr('transform', `translate(${size/2},${size/2})`);
    
    const scale = state.d3.scaleLinear().domain([-2.5, 2.5]).range([-radius, radius]);
    
    const isDark = this.themeService.isDark();
    // Grid circles
    [1, 2].forEach(g => {
      svg.append('circle')
        .attr('r', Math.abs(scale(g)))
        .attr('fill', 'none')
        .attr('stroke', isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.25)')
        .attr('stroke-width', 1);
    });

    laps.forEach((lap, i) => {
      svg.selectAll(`.dot-lap-${i}`)
        .data(lap.points.filter((_, idx) => idx % 5 === 0)) // Downsample
        .enter()
        .append('circle')
        .attr('cx', (d: any) => scale(d.accX))
        .attr('cy', (d: any) => scale(-d.accY))
        .attr('r', 1)
        .attr('fill', this.getLapColor(lap.id))
        .attr('opacity', 0.4);
    });

    state.gCircleSvg = svg.append('circle')
      .attr('r', 4.5)
      .attr('fill', '#00e5ff')
      .attr('stroke', isDark ? '#ffffff' : '#0f172a')
      .attr('stroke-width', 1.5)
      .style('display', 'none');
  }

  private drawBrakingChart(container: ElementRef, laps: Lap[]) {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.d3) return;
    const element = container.nativeElement;
    const margin = { top: 25, right: 15, bottom: 25, left: 40 };
    const clientW = element.clientWidth || (element.parentElement?.clientWidth ? element.parentElement.clientWidth - 16 : 0);
    const clientH = element.clientHeight || (element.parentElement?.clientHeight ? element.parentElement.clientHeight - 44 : 0);
    const width = clientW - margin.left - margin.right;
    const height = clientH - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) return;

    state.d3.select(element).selectAll('*').remove();

    const svg = state.d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxDist = this.maxDistance();
    const x = state.d3.scaleLinear().domain([0, maxDist]).range([0, width]);
    const y = state.d3.scaleLinear().domain([0, 3]).range([height, 0]); // Braking Gs usually 0-2.5

    svg.append('g').attr('opacity', 0.1).call(state.d3.axisLeft(y).tickSize(-width).tickFormat(() => ''));
    
    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(state.d3.axisBottom(x).ticks(5).tickFormat((d: any) => `${d}m`))
      .attr('font-size', '9px')
      .attr('color', 'rgba(255,255,255,0.4)');

    svg.append('g')
      .call(state.d3.axisLeft(y).ticks(5))
      .attr('font-size', '9px')
      .attr('color', 'rgba(255,255,255,0.4)');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 12)
      .attr('x', -height / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-weight', 'bold')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .text('Decel (G)');

    const lineGenerator = (scaleX: any) => state.d3.line()
      .x((d: any) => scaleX(d.distance))
      .y((d: any) => y(Math.max(0, -d.accY)))
      .curve(state.d3.curveMonotoneX);

    laps.forEach((lap) => {
      if (!lap.points || lap.points.length === 0) return;
      
      svg.append('path')
        .datum(lap.points)
        .attr('class', 'lap-path')
        .attr('fill', 'none')
        .attr('stroke', this.getLapColor(lap.id))
        .attr('stroke-width', 2)
        .attr('d', lineGenerator(x));

      // Highlight peak braking zones
      if (this.selectedLapIds().includes(lap.id)) {
        svg.selectAll(`.peak-braking-${lap.id}`)
          .data(lap.points.filter(p => p.accY < -1.5))
          .enter()
          .append('circle')
          .attr('cx', (d: any) => x(d.distance))
          .attr('cy', (d: any) => y(-d.accY))
          .attr('r', 3)
          .attr('fill', this.getLapColor(lap.id))
          .attr('opacity', 0.5);
      }
    });

    const focusLine = svg.append('line')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', 'rgba(255,255,255,0.5)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .style('display', 'none');

    const focusCircles = laps.map((lap) => svg.append('circle')
      .attr('r', 4)
      .attr('fill', this.getLapColor(lap.id))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('display', 'none'));

    const focusLabels = laps.map((lap) => svg.append('text')
      .attr('font-size', '10px')
      .attr('font-weight', 'black')
      .attr('fill', this.getLapColor(lap.id))
      .attr('stroke', 'rgba(0,0,0,0.8)')
      .attr('stroke-width', '2px')
      .attr('paint-order', 'stroke')
      .style('display', 'none'));

    const overlay = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');

    overlay.on('mousemove', (event: MouseEvent) => {
      const [mouseX] = state.d3.pointer(event);
      const dist = x.invert(mouseX);
      this.hoveredDistance.set(dist);
    });

    overlay.on('mouseleave', () => {
      this.hoveredDistance.set(null);
    });

    const chartState: ChartInstance = {
      svg, x, y, field: 'braking', width, height, 
      focusLine, 
      focusCircles, 
      focusLabels, 
      xAxis: null, 
      currentXScale: x,
      laps,
      updateZoom: (transform: any) => {
        const newX = transform.rescaleX(x);
        chartState.currentXScale = newX;
        // Update line paths
        svg.selectAll('.lap-path').attr('d', (d: TelemetryPoint[]) => lineGenerator(newX)(d));
      }
    };
    state.chartInstances.push(chartState);
  }

  private drawDeltaBarChart(container: ElementRef, laps: Lap[]) {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.d3) return;
    const element = container.nativeElement;
    state.d3.select(element).selectAll('*').remove();

    const isDark = this.themeService.isDark();
    const data = this.deltaComparisonData();
    if (!data) {
      // Empty state when fewer than 2 laps
      const emptyDiv = state.d3.select(element)
        .append('div')
        .attr('class', `w-full h-full flex flex-col items-center justify-center text-center p-4 rounded border transition-colors ${
          isDark ? 'bg-[#0a0c10]/80 border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
        }`);
      emptyDiv.append('div')
        .attr('class', 'text-brand-cyan text-xs font-mono font-bold uppercase tracking-wider mb-1')
        .text('Delta Time Analysis');
      emptyDiv.append('div')
        .attr('class', `text-[10px] max-w-sm mb-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`)
        .text('Selecione pelo menos duas voltas para calcular o delta de tempo em tempo real e visualizar onde o tempo é ganho ou perdido ao longo da pista.');
      emptyDiv.append('button')
        .attr('type', 'button')
        .attr('class', 'px-3 py-1.5 bg-brand-cyan/20 hover:bg-brand-cyan/30 text-brand-cyan border border-brand-cyan/40 rounded text-[10px] font-bold uppercase cursor-pointer transition-colors shadow-sm')
        .text('Comparar as 2 Melhores Voltas')
        .on('click', () => {
          this.selectFastestTwoLaps();
        });
      return;
    }

    const margin = { top: 30, right: 25, bottom: 24, left: 45 };
    const clientW = element.clientWidth || (element.parentElement ? element.parentElement.clientWidth : 750);
    const clientH = element.clientHeight || 320;
    const width = Math.max(300, clientW - margin.left - margin.right);
    const height = Math.max(160, clientH - margin.top - margin.bottom);

    const svg = state.d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxDist = data.totalDistance;
    const x = state.d3.scaleLinear().domain([0, maxDist]).range([0, width]);

    // Calculate Y domain symmetric around zero
    const maxDeltaAbs = Math.max(0.06, ...data.segments.map(s => Math.abs(s.deltaSeg)));
    const yMax = Math.min(2.5, Math.ceil(maxDeltaAbs * 20) / 20);
    const y = state.d3.scaleLinear().domain([-yMax, yMax]).range([height, 0]);
    const zeroY = y(0);

    // Subtle background tint zones:
    // Top zone (y > 0): Time Lost (Red tint)
    // Bottom zone (y < 0): Time Gained (Green tint)
    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', zeroY)
      .attr('fill', isDark ? 'rgba(255, 62, 62, 0.04)' : 'rgba(239, 68, 68, 0.06)');

    svg.append('rect')
      .attr('x', 0)
      .attr('y', zeroY)
      .attr('width', width)
      .attr('height', height - zeroY)
      .attr('fill', isDark ? 'rgba(0, 230, 118, 0.04)' : 'rgba(16, 185, 129, 0.06)');

    // Subtle horizontal grid lines
    const gridGroup = svg.append('g').attr('opacity', isDark ? 0.1 : 0.4);
    gridGroup.call(state.d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(() => ''));
    gridGroup.selectAll('.tick line').attr('stroke', isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1');

    // Baseline (Zero difference)
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', zeroY)
      .attr('y2', zeroY)
      .attr('stroke', isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.4)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3');

    // Baseline watermark text
    svg.append('text')
      .attr('x', width - 6)
      .attr('y', zeroY - 4)
      .attr('text-anchor', 'end')
      .attr('font-size', '8px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? 'rgba(255, 255, 255, 0.3)' : '#64748b')
      .text('0.00s REF BASELINE');

    // Zone indicators
    svg.append('text')
      .attr('x', 6)
      .attr('y', 12)
      .attr('font-size', '8px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('letter-spacing', '0.06em')
      .attr('fill', isDark ? '#ff5252' : '#dc2626')
      .text('▲ TIME LOST (SLOWER)');

    svg.append('text')
      .attr('x', 6)
      .attr('y', height - 6)
      .attr('font-size', '8px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('letter-spacing', '0.06em')
      .attr('fill', isDark ? '#00e676' : '#16a34a')
      .text('▼ TIME GAINED (FASTER)');

    // Sector divider lines
    if (data.refLap.sectors && data.refLap.sectors.length > 0) {
      data.refLap.sectors.forEach(sec => {
        if (sec.endDistance > 0 && sec.endDistance < maxDist) {
          const secX = x(sec.endDistance);
          svg.append('line')
            .attr('x1', secX)
            .attr('x2', secX)
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2,4');

          svg.append('text')
            .attr('x', secX + 4)
            .attr('y', 12)
            .attr('font-size', '8px')
            .attr('font-family', 'monospace')
            .attr('font-weight', 'bold')
            .attr('fill', isDark ? 'rgba(255, 255, 255, 0.4)' : '#64748b')
            .text(`S${sec.number}`);
        }
      });
    }

    // X Axis
    const xAxis = svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(state.d3.axisBottom(x).ticks(6).tickFormat((d: number) => `${Math.round(d)}m`))
      .attr('font-size', '9px')
      .attr('color', isDark ? 'rgba(255,255,255,0.4)' : '#475569');

    // Y Axis
    svg.append('g')
      .call(state.d3.axisLeft(y).ticks(5).tickFormat((d: number) => `${d > 0 ? '+' : ''}${d.toFixed(2)}s`))
      .attr('font-size', '9px')
      .attr('color', isDark ? 'rgba(255,255,255,0.4)' : '#475569');

    // Y Axis Unit Label
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 12)
      .attr('x', -height / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? 'rgba(255,255,255,0.6)' : '#334155')
      .text('Δt (s)');

    // Delta Bars Group
    const barsGroup = svg.append('g').attr('class', 'delta-bars');
    const barsData = data.segments;

    const bars = barsGroup.selectAll('.delta-bar')
      .data(barsData)
      .enter()
      .append('rect')
      .attr('class', 'delta-bar')
      .attr('x', (d: DeltaSegment) => x(d.startDistance) + 0.5)
      .attr('width', (d: DeltaSegment) => Math.max(2, x(d.endDistance) - x(d.startDistance) - 1))
      .attr('y', (d: DeltaSegment) => {
        return d.deltaSeg >= 0 ? y(d.deltaSeg) : zeroY;
      })
      .attr('height', (d: DeltaSegment) => {
        const h = Math.abs(y(d.deltaSeg) - zeroY);
        return Math.max(1.5, h);
      })
      .attr('fill', (d: DeltaSegment) => {
        return d.deltaSeg < -0.005 ? '#00e676' : (d.deltaSeg > 0.005 ? '#ff3e3e' : (isDark ? '#ffffff' : '#94a3b8'));
      })
      .attr('opacity', 0.85)
      .attr('rx', 2)
      .attr('ry', 2)
      .style('cursor', 'pointer');

    // Overlay Cumulative Line Curve if enabled
    let cumulativePath: any = null;
    let lineGenerator: any = null;
    if (this.deltaShowCurve()) {
      lineGenerator = (scaleX: any) => state.d3.line()
        .x((d: any) => scaleX(d.distance))
        .y((d: any) => Math.max(0, Math.min(height, y(d.cumulativeDelta))))
        .curve(state.d3.curveMonotoneX);

      cumulativePath = svg.append('path')
        .datum(data.continuousPoints)
        .attr('fill', 'none')
        .attr('stroke', '#00e5ff')
        .attr('stroke-width', 2.5)
        .attr('filter', 'drop-shadow(0 0 5px rgba(0,229,255,0.5))')
        .attr('d', lineGenerator(x));
    }

    // Active Cursor / Synchronized Needle
    const focusLine = svg.append('line')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', isDark ? '#ffffff' : '#0f172a')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,3')
      .style('display', 'none')
      .style('pointer-events', 'none');

    const focusPoint = svg.append('circle')
      .attr('r', 5)
      .attr('fill', '#00e5ff')
      .attr('stroke', isDark ? '#ffffff' : '#0f172a')
      .attr('stroke-width', 2)
      .style('display', 'none')
      .style('pointer-events', 'none');

    // Floating Tooltip Tag
    const tooltipGroup = svg.append('g')
      .attr('class', 'delta-tooltip')
      .style('display', 'none')
      .style('pointer-events', 'none');

    tooltipGroup.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', isDark ? 'rgba(10, 14, 20, 0.94)' : 'rgba(255, 255, 255, 0.98)')
      .attr('stroke', isDark ? 'rgba(255, 255, 255, 0.25)' : '#cbd5e1')
      .attr('stroke-width', 1)
      .attr('height', 36)
      .attr('width', 135);

    const tooltipText1 = tooltipGroup.append('text')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? '#ffffff' : '#0f172a')
      .attr('x', 8)
      .attr('y', 14);

    const tooltipText2 = tooltipGroup.append('text')
      .attr('font-size', '8.5px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? '#00e5ff' : '#0284c7')
      .attr('x', 8)
      .attr('y', 28);

    // Register ChartInstance in state
    const chartState: ChartInstance = {
      svg,
      x,
      y,
      field: 'timeDelta',
      width,
      height,
      focusLine,
      focusCircles: [focusPoint],
      focusLabels: [],
      xAxis,
      currentXScale: x,
      laps,
      lineGenerator,
      paths: cumulativePath ? [cumulativePath] : [],
      updateZoom: (transform: any) => {
        const newX = transform.rescaleX(x);
        chartState.currentXScale = newX;
        chartState.xAxis.call(state.d3.axisBottom(newX).ticks(6).tickFormat((d: number) => `${Math.round(d)}m`));

        // Update bars
        bars
          .attr('x', (d: DeltaSegment) => newX(d.startDistance) + 0.5)
          .attr('width', (d: DeltaSegment) => Math.max(1, newX(d.endDistance) - newX(d.startDistance) - 1));

        // Update cumulative line
        if (cumulativePath && lineGenerator) {
          cumulativePath.attr('d', lineGenerator(newX));
        }
      },
      customUpdate: (dist: number) => {
        const mouseX = chartState.currentXScale(dist);
        if (mouseX < 0 || mouseX > width) {
          focusLine.style('display', 'none');
          focusPoint.style('display', 'none');
          tooltipGroup.style('display', 'none');
          bars.attr('opacity', 0.85).attr('stroke', null);
          return;
        }

        focusLine.attr('x1', mouseX).attr('x2', mouseX).style('display', null);

        // Highlight active segment bar
        const activeSeg = barsData.find(s => dist >= s.startDistance && dist <= s.endDistance);
        bars.each(function(this: SVGRectElement, d: DeltaSegment) {
          const isCurrent = activeSeg && activeSeg.index === d.index;
          state.d3.select(this)
            .attr('opacity', isCurrent ? 1 : 0.65)
            .attr('stroke', isCurrent ? '#ffffff' : null)
            .attr('stroke-width', isCurrent ? 1.5 : 0);
        });

        // Compute instant delta for cursor point
        const pRef = this.getInterpolatedPoint(data.refLap.points, dist);
        const pComp = this.getInterpolatedPoint(data.compLap.points, dist);
        const curDelta = pComp.time - pRef.time;
        const curDeltaSpeed = pComp.speed - pRef.speed;

        const curY = Math.max(0, Math.min(height, y(curDelta)));
        focusPoint
          .attr('cx', mouseX)
          .attr('cy', curY)
          .attr('fill', curDelta < 0 ? '#00e676' : '#ff3e3e')
          .style('display', null);

        // Position tooltip
        const tipX = mouseX + 145 > width ? mouseX - 142 : mouseX + 8;
        const tipY = Math.max(4, Math.min(height - 40, curY - 18));
        tooltipGroup.attr('transform', `translate(${tipX}, ${tipY})`).style('display', null);

        const deltaFormatted = `${curDelta >= 0 ? '+' : ''}${curDelta.toFixed(3)}s`;
        const segFormatted = activeSeg ? `Seg: ${activeSeg.deltaSeg >= 0 ? '+' : ''}${activeSeg.deltaSeg.toFixed(3)}s` : '';
        tooltipText1.text(`${Math.round(dist)}m | Δt: ${deltaFormatted}`);
        tooltipText1.attr('fill', curDelta < 0 ? '#00e676' : '#ff3e3e');
        tooltipText2.text(`Δv: ${curDeltaSpeed >= 0 ? '+' : ''}${curDeltaSpeed.toFixed(1)}km/h | ${segFormatted}`);
      },
      customHide: () => {
        focusLine.style('display', 'none');
        focusPoint.style('display', 'none');
        tooltipGroup.style('display', 'none');
        bars.attr('opacity', 0.85).attr('stroke', null);
      }
    };

    state.chartInstances = state.chartInstances.filter(inst => inst.field !== 'timeDelta');
    state.chartInstances.push(chartState);

    // Mouse listener on transparent overlay
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('mousemove', (event: any) => {
        const [mX] = state.d3.pointer(event);
        const dist = chartState.currentXScale.invert(mX);
        this.hoveredDistance.set(Math.max(0, Math.min(maxDist, dist)));
      })
      .on('mouseleave', () => this.hoveredDistance.set(null));

    // Shared Zoom
    const zoom = state.d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[0, 0], [width, height]])
      .on('zoom', (event: any) => {
        const t = event.transform;
        this.sharedZoomTransform.set({ k: t.k, x: t.x, y: t.y });
      });

    (state.d3.select(element).select('svg') as any).call(zoom);
  }

  private drawD3Chart(container: ElementRef, laps: Lap[], field: keyof TelemetryPoint, yDomain: [number, number]) {
    const state = APP_INTERNAL_STATE.get(this);
    if (!state || !state.d3) return;
    const element = container.nativeElement;
    const margin = { top: 25, right: 15, bottom: 25, left: 40 };
    const clientW = element.clientWidth || (element.parentElement?.clientWidth ? element.parentElement.clientWidth - 16 : 0);
    const clientH = element.clientHeight || (element.parentElement?.clientHeight ? element.parentElement.clientHeight - 44 : 0);
    const width = clientW - margin.left - margin.right;
    const height = clientH - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) return;

    state.d3.select(element).selectAll('*').remove();

    const svg = state.d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxDist = this.maxDistance();
    const x = state.d3.scaleLinear().domain([0, maxDist]).range([0, width]);
    const isDark = this.themeService.isDark();
    const y = state.d3.scaleLinear().domain(yDomain).range([height, 0]);

    const gridGroup = svg.append('g').attr('opacity', isDark ? 0.1 : 0.4);
    gridGroup.call(state.d3.axisLeft(y).tickSize(-width).tickFormat(() => ''));
    gridGroup.selectAll('.tick line').attr('stroke', isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1');
    
    const xAxis = svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(state.d3.axisBottom(x).ticks(5).tickFormat((d: any) => `${d}m`))
      .attr('font-size', '9px')
      .attr('color', isDark ? 'rgba(255,255,255,0.4)' : '#475569');

    svg.append('g')
      .call(state.d3.axisLeft(y).ticks(5))
      .attr('font-size', '9px')
      .attr('color', isDark ? 'rgba(255,255,255,0.4)' : '#475569');

    // Y Axis Label (Unit)
    const unit = field === 'speed' ? 'km/h' : 
                 field === 'alt' ? 'm' : 
                 field === 'timestamp' ? 't' : 'G';
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 12)
      .attr('x', -height / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? 'rgba(255,255,255,0.6)' : '#334155')
      .text(unit);

    const lineGenerator = (scaleX: any) => state.d3.line().x((d: any) => scaleX(d.distance)).y((d: any) => y(d[field] as number)).curve(state.d3.curveMonotoneX);

    const paths = laps.map((lap) => {
      if (!lap.points || lap.points.length === 0) return null;
      return svg.append('path')
        .datum(lap.points)
        .attr('fill', 'none')
        .attr('stroke', this.getLapColor(lap.id))
        .attr('stroke-width', 2)
        .attr('d', lineGenerator(x));
    }).filter(p => p !== null);

    const focusLine = svg.append('line').attr('y1', 0).attr('y2', height).attr('stroke', isDark ? 'rgba(255,255,255,0.4)' : '#334155').attr('stroke-width', 1).attr('stroke-dasharray', '3,3').style('display', 'none');
    const focusCircles = laps.map((lap) => svg.append('circle').attr('r', 4).attr('fill', this.getLapColor(lap.id)).attr('stroke', '#fff').attr('stroke-width', 1).style('display', 'none'));
    const focusLabels = laps.map((lap) => svg.append('text')
      .attr('font-size', '10px')
      .attr('font-weight', 'black')
      .attr('fill', this.getLapColor(lap.id))
      .attr('stroke', 'rgba(0,0,0,0.8)')
      .attr('stroke-width', '2px')
      .attr('paint-order', 'stroke')
      .style('display', 'none'));

    const chartState: ChartInstance = {
      svg, x, y, field, width, height, focusLine, focusCircles, focusLabels, xAxis, lineGenerator, laps, paths,
      currentXScale: x,
      updateZoom: (transform: any) => {
        const newX = transform.rescaleX(x);
        chartState.currentXScale = newX;
        chartState.xAxis.call(state.d3.axisBottom(newX).ticks(5).tickFormat((d: number) => `${d}m`));
        if (chartState.paths) {
          chartState.paths.forEach((p: any) => p!.attr('d', (d: TelemetryPoint[]) => lineGenerator(newX)(d)));
        }
      }
    };
    state.chartInstances.push(chartState);

    // Handle mouse events to update global hoveredDistance
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'transparent').style('pointer-events', 'all')
      .on('mousemove', (event: any) => {
        const [mouseX] = state.d3.pointer(event);
        const dist = chartState.currentXScale.invert(mouseX);
        this.hoveredDistance.set(dist);
      })
      .on('mouseleave', () => this.hoveredDistance.set(null));

    const zoom = state.d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[0, 0], [width, height]])
      .on('zoom', (event: any) => {
        const t = event.transform;
        this.sharedZoomTransform.set({ k: t.k, x: t.x, y: t.y });
      });

    (state.d3.select(element).select('svg') as any).call(zoom);
  }

  private syncZoom() {
    // This is now handled via the sharedZoomTransform signal in constructor
  }

  toggleLap(id: string) {
    this.selectedLapIds.update(ids => 
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  togglePlayback() {
    const active = this.activeTab();
    if (active === 'heatmap') {
      const current = this.heatmapPlaybackTime();
      const max = this.heatmapMaxLapTime();
      if (current >= max - 0.1) {
        this.heatmapPlaybackTime.set(0);
        this.heatmapIsPlaying.set(true);
      } else {
        this.heatmapIsPlaying.update(v => !v);
      }
    } else {
      const current = this.playbackTime();
      const max = this.maxLapTime();
      if (current >= max - 0.1) {
        this.playbackTime.set(0);
        this.isPlaying.set(true);
      } else {
        this.isPlaying.update(v => !v);
      }
    }
  }

  onPlaybackSeek(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (this.activeTab() === 'heatmap') {
      this.heatmapPlaybackTime.set(val);
      this.heatmapIsPlaying.set(false);
    } else {
      this.playbackTime.set(val);
      this.isPlaying.set(false);
    }
  }

  setPlaybackSpeed(speed: any) {
    const val = typeof speed === 'string' ? parseFloat(speed) : speed;
    if (this.activeTab() === 'heatmap') {
      this.heatmapPlaybackSpeed.set(val);
    } else {
      this.playbackSpeed.set(val);
    }
  }

  toggleTreeSection() {
    this.treeCollapsed.update(v => !v);
  }

  toggleLapsSection() {
    this.lapsSectionCollapsed.update(v => !v);
  }

  toggleDriverNode(driverNode: TreeDriverNode, event: MouseEvent) {
    event.stopPropagation();
    driverNode.expanded = !driverNode.expanded;
  }

  toggleTrackNode(trackNode: TreeTrackNode, event: MouseEvent) {
    event.stopPropagation();
    trackNode.expanded = !trackNode.expanded;
  }

  toggleDateNode(dateNode: TreeDateNode, event: MouseEvent) {
    event.stopPropagation();
    dateNode.expanded = !dateNode.expanded;
  }

  toggleSessionNode(session: SessionItem, event: MouseEvent) {
    event.stopPropagation();
    session.expanded = !session.expanded;
  }

  selectFileFromTree(session: SessionItem, fileItem: SessionFileItem, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (this.activeSessionKey() !== session.id) {
      this.selectSession(session);
    }
    if (fileItem.isResume) {
      this.setTab('resume');
    } else if (fileItem.lapId) {
      if (!this.selectedLapIds().includes(fileItem.lapId)) {
        this.selectedLapIds.update(ids => [...ids, fileItem.lapId!]);
      }
      this.setTab('charts');
    }
  }

  extractLapNumber(idOrName: string): number {
    if (!idOrName) return 0;
    if (idOrName.includes('Virtual')) return 99999;

    // Split by common delimiters and check from the end (filename/lap number is at the end)
    const parts = idOrName.split(/[-_/\\.]+/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.toLowerCase() === 'json') continue;
      const match = part.match(/\d+/);
      if (match) {
        return parseInt(match[0], 10);
      }
    }

    const lapMatch = idOrName.match(/lap[_\-\s]*(\d+)/i);
    if (lapMatch && lapMatch[1]) {
      return parseInt(lapMatch[1], 10);
    }

    const allNumbers = idOrName.match(/\d+/g);
    if (allNumbers && allNumbers.length > 0) {
      return parseInt(allNumbers[allNumbers.length - 1], 10);
    }
    return 0;
  }

  buildFileItemsForSession(session: SessionItem): SessionFileItem[] {
    const items: SessionFileItem[] = [];

    // Laps that are already loaded
    if (session.laps && session.laps.length > 0) {
      for (const lap of session.laps) {
        const lapNum = this.extractLapNumber(lap.id);
        const fileName = (session.lapFiles || []).find(f => {
          const num = parseInt(f.name.replace(/\D/g, ''), 10);
          return num === lapNum;
        })?.name || (lap.id.includes('LAP') ? `${lap.id.split('-').pop()}.json` : `${lap.id}.json`);

        items.push({
          name: fileName,
          lapId: lap.id,
          lapNumber: lapNum,
          lapTime: lap.lapTime,
          isBest: lap.isBest || (session.bestLapTime === lap.lapTime)
        });
      }
    } else if (session.lapFiles && session.lapFiles.length > 0) {
      for (const file of session.lapFiles) {
        const lapNum = parseInt(file.name.replace(/\D/g, ''), 10) || undefined;
        items.push({
          name: file.name,
          file,
          lapNumber: lapNum
        });
      }
    }

    if (session.resumeFile || session.resumeData) {
      items.push({
        name: session.resumeFile?.name || 'resume.json',
        file: session.resumeFile,
        isResume: true
      });
    }

    if (session.otherFiles && session.otherFiles.length > 0) {
      for (const file of session.otherFiles) {
        items.push({
          name: file.name,
          file
        });
      }
    }

    items.sort((a, b) => {
      if (a.isResume) return 1;
      if (b.isResume) return -1;
      const numA = a.lapNumber ?? 9999;
      const numB = b.lapNumber ?? 9999;
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  buildProfileTree(sessions: SessionItem[]): TreeDriverNode[] {
    const driverMap = new Map<string, Map<string, Map<string, SessionItem[]>>>();

    for (const session of sessions) {
      if (!driverMap.has(session.driver)) {
        driverMap.set(session.driver, new Map());
      }
      const trackMap = driverMap.get(session.driver)!;
      if (!trackMap.has(session.track)) {
        trackMap.set(session.track, new Map());
      }
      const dateMap = trackMap.get(session.track)!;
      if (!dateMap.has(session.date)) {
        dateMap.set(session.date, []);
      }
      session.fileItems = this.buildFileItemsForSession(session);
      dateMap.get(session.date)!.push(session);
    }

    const result: TreeDriverNode[] = [];

    for (const [driver, trackMap] of driverMap.entries()) {
      const tracks: TreeTrackNode[] = [];
      for (const [track, dateMap] of trackMap.entries()) {
        const dates: TreeDateNode[] = [];
        for (const [date, sessionList] of dateMap.entries()) {
          sessionList.sort((a, b) => a.time.localeCompare(b.time));
          dates.push({
            date,
            sessions: sessionList,
            expanded: true
          });
        }
        dates.sort((a, b) => b.date.localeCompare(a.date));
        tracks.push({
          track,
          dates,
          expanded: true
        });
      }
      tracks.sort((a, b) => a.track.localeCompare(b.track));
      result.push({
        driver,
        tracks,
        expanded: true
      });
    }

    result.sort((a, b) => a.driver.localeCompare(b.driver));
    return result;
  }

  parseFilePath(file: File, customPath?: string): { driver: string; track: string; date: string; time: string; fileName: string; relativePath: string } {
    const rawPath = customPath || file.webkitRelativePath || ((file as unknown as { filepath?: string }).filepath || '') || file.name || '';
    const normalized = rawPath.replace(/\\+/g, '/').replace(/\/+/g, '/');
    const parts: string[] = normalized.split('/').filter((p: string) => p && p.trim().length > 0);

    let driver = 'PILOTO';
    let track = 'PISTA';
    let date = 'DATA';
    let time = 'HORA';
    let fileName = file.name;

    // Check if 'profiles', 'perfis', or 'perfil' exists in parts
    const profilesIdx = parts.findIndex((p: string) => {
      const lower = p.toLowerCase();
      return lower === 'profiles' || lower === 'perfis' || lower === 'perfil';
    });

    if (profilesIdx !== -1) {
      // Direct children of profiles: [driver, track, date, time, ...files]
      const after = parts.slice(profilesIdx + 1);
      if (after.length >= 5) {
        driver = after[0];
        track = after[1];
        date = after[2];
        time = after[3];
        fileName = after.slice(4).join('/');
      } else if (after.length === 4) {
        driver = after[0];
        track = after[1];
        date = after[2];
        time = 'SESSION';
        fileName = after[3];
      } else if (after.length === 3) {
        driver = after[0];
        track = after[1];
        date = 'DEFAULT';
        time = 'SESSION';
        fileName = after[2];
      } else if (after.length === 2) {
        driver = after[0];
        track = 'DEFAULT';
        date = 'DEFAULT';
        time = 'SESSION';
        fileName = after[1];
      }
    } else {
      // profiles not in path, use parent directory structure: [driver, track, date, time, file]
      const dirParts = parts.slice(0, parts.length - 1);
      if (dirParts.length >= 4) {
        driver = dirParts[dirParts.length - 4];
        track = dirParts[dirParts.length - 3];
        date = dirParts[dirParts.length - 2];
        time = dirParts[dirParts.length - 1];
      } else if (dirParts.length === 3) {
        driver = dirParts[0];
        track = dirParts[1];
        date = dirParts[2];
        time = 'SESSION';
      } else if (dirParts.length === 2) {
        driver = dirParts[0];
        track = dirParts[1];
        date = 'DEFAULT';
        time = 'SESSION';
      } else if (dirParts.length === 1) {
        driver = dirParts[0];
        track = 'DEFAULT';
        date = 'DEFAULT';
        time = 'SESSION';
      }
      if (parts.length > 0) {
        fileName = parts[parts.length - 1];
      }
    }

    return { driver, track, date, time, fileName, relativePath: normalized };
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }

  buildIdealLap(session: SessionItem): Lap | null {
    if (!session || !session.laps || session.laps.length === 0) return null;

    // Filter out existing LAP-IDEAL or virtual laps to extract real racing laps
    const realLaps = session.laps.filter(l => l.id !== 'LAP-IDEAL' && !l.id?.includes('Virtual'));
    if (realLaps.length === 0) return null;

    const validLaps = this.getValidRacingLaps(realLaps);
    const candidateLaps = validLaps.length > 0 ? validLaps : realLaps;
    if (candidateLaps.length === 0) return null;

    // Check if session has resumeData with s1, s2, s3
    const resume = session.resumeData;
    let idealTimeSec = 0;
    let bestS1Sec = 0;
    let bestS2Sec = 0;
    let bestS3Sec = 0;
    let lapForS1: Lap | null = null;
    let lapForS2: Lap | null = null;
    let lapForS3: Lap | null = null;

    if (resume?.laps && resume.laps.length > 0) {
      // Find normal laps in resumeData to match Session Summary
      const validCandidateLaps = resume.laps.filter((l: any) => l.t >= 20000);
      const sourceLaps = validCandidateLaps.length > 0 ? validCandidateLaps : resume.laps.filter((l: any) => l.t > 5000);
      const sortedTimes = [...sourceLaps].map((l: any) => l.t).sort((a: number, b: number) => a - b);
      const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
      const minValid = Math.max(20000, median * 0.65);
      const maxValid = median * 1.30;
      const normalLaps = resume.laps.filter((l: any) => l.t >= minValid && l.t <= maxValid);
      const pool = normalLaps.length > 0 ? normalLaps : resume.laps;

      const s1Times = pool.map((l: any) => l.s1).filter((s: number) => s > 0);
      const s2Times = pool.map((l: any) => l.s2).filter((s: number) => s > 0);
      const s3Times = pool.map((l: any) => l.s3).filter((s: number) => s > 0);

      const bestS1Ms = s1Times.length > 0 ? Math.min(...s1Times) : 0;
      const bestS2Ms = s2Times.length > 0 ? Math.min(...s2Times) : 0;
      const bestS3Ms = s3Times.length > 0 ? Math.min(...s3Times) : 0;

      if (bestS1Ms > 0 && bestS2Ms > 0 && bestS3Ms > 0) {
        bestS1Sec = bestS1Ms / 1000;
        bestS2Sec = bestS2Ms / 1000;
        bestS3Sec = bestS3Ms / 1000;
        idealTimeSec = (bestS1Ms + bestS2Ms + bestS3Ms) / 1000;

        const lapItem1 = pool.find((l: any) => l.s1 === bestS1Ms);
        const lapItem2 = pool.find((l: any) => l.s2 === bestS2Ms);
        const lapItem3 = pool.find((l: any) => l.s3 === bestS3Ms);

        if (lapItem1) lapForS1 = candidateLaps.find(l => this.extractLapNumber(l.id) === lapItem1.nLap) || null;
        if (lapItem2) lapForS2 = candidateLaps.find(l => this.extractLapNumber(l.id) === lapItem2.nLap) || null;
        if (lapItem3) lapForS3 = candidateLaps.find(l => this.extractLapNumber(l.id) === lapItem3.nLap) || null;
      }
    }

    // Fallback if no resumeData: check lap.sectors
    if (!lapForS1 || !lapForS2 || !lapForS3 || idealTimeSec <= 0) {
      const lapsWithSectors = candidateLaps.filter(l => l.sectors && l.sectors.length >= 3);
      if (lapsWithSectors.length > 0) {
        const s1Laps = [...lapsWithSectors].sort((a, b) => (a.sectors[0]?.time || 999) - (b.sectors[0]?.time || 999));
        const s2Laps = [...lapsWithSectors].sort((a, b) => (a.sectors[1]?.time || 999) - (b.sectors[1]?.time || 999));
        const s3Laps = [...lapsWithSectors].sort((a, b) => (a.sectors[2]?.time || 999) - (b.sectors[2]?.time || 999));
        lapForS1 = s1Laps[0];
        lapForS2 = s2Laps[0];
        lapForS3 = s3Laps[0];
        bestS1Sec = lapForS1.sectors[0]?.time || 0;
        bestS2Sec = lapForS2.sectors[1]?.time || 0;
        bestS3Sec = lapForS3.sectors[2]?.time || 0;
        idealTimeSec = bestS1Sec + bestS2Sec + bestS3Sec;
      }
    }

    // Default reference lap with points
    const bestOverall = [...candidateLaps].sort((a, b) => a.lapTime - b.lapTime).find(l => l.points && l.points.length >= 20) || candidateLaps[0];
    if (!bestOverall || !bestOverall.points || bestOverall.points.length < 20) return null;

    if (!lapForS1) lapForS1 = bestOverall;
    if (!lapForS2) lapForS2 = bestOverall;
    if (!lapForS3) lapForS3 = bestOverall;

    // Sector distance boundaries
    let s1EndDist = 0;
    let s2EndDist = 0;
    const totalDist = bestOverall.points[bestOverall.points.length - 1].distance;

    // Check if bestOverall or any candidate lap has realistic, distinct sector boundaries
    const refWithSectors = candidateLaps.find(l => 
      l.sectors && l.sectors.length >= 3 && 
      l.sectors[0].endDistance > 50 && 
      l.sectors[1].endDistance > l.sectors[0].endDistance + 50 &&
      l.sectors[1].endDistance < totalDist - 50
    );

    if (refWithSectors && refWithSectors.sectors.length >= 3) {
      s1EndDist = refWithSectors.sectors[0].endDistance;
      s2EndDist = refWithSectors.sectors[1].endDistance;
    } else {
      // If explicit sector distances aren't directly available, derive them from bestOverall's sector times:
      let s1TimeBest = 0;
      let s2TimeBest = 0;
      const bestLapNum = this.extractLapNumber(bestOverall.id);
      const resumeBest = resume?.laps?.find((l: any) => l.nLap === bestLapNum);
      if (resumeBest && resumeBest.s1 > 0 && resumeBest.s2 > 0) {
        s1TimeBest = resumeBest.s1 / 1000;
        s2TimeBest = resumeBest.s2 / 1000;
      } else if (bestOverall.sectors && bestOverall.sectors.length >= 3) {
        s1TimeBest = bestOverall.sectors[0].time;
        s2TimeBest = bestOverall.sectors[1].time;
      }

      if (s1TimeBest > 0 && s2TimeBest > 0) {
        const ptS1 = bestOverall.points.find(p => p.timestamp >= s1TimeBest);
        const ptS2 = bestOverall.points.find(p => p.timestamp >= s1TimeBest + s2TimeBest);
        s1EndDist = ptS1 ? ptS1.distance : totalDist * 0.333;
        s2EndDist = ptS2 ? ptS2.distance : totalDist * 0.667;
      } else {
        s1EndDist = totalDist * 0.333;
        s2EndDist = totalDist * 0.667;
      }
    }

    if (idealTimeSec <= 0) {
      idealTimeSec = bestOverall.lapTime;
      bestS1Sec = idealTimeSec * 0.333;
      bestS2Sec = idealTimeSec * 0.334;
      bestS3Sec = idealTimeSec * 0.333;
    }

    // Assemble continuous points across the 3 sectors anchored on bestOverall's unbroken trajectory
    const virtualPoints: TelemetryPoint[] = [];

    for (const p of bestOverall.points) {
      const d = p.distance;
      let targetStartT = 0;
      let targetDuration = bestS1Sec;
      let secStartDist = 0;
      let secEndDist = s1EndDist;
      let donorLap = lapForS1 || bestOverall;

      if (d > s1EndDist && d <= s2EndDist) {
        targetStartT = bestS1Sec;
        targetDuration = bestS2Sec;
        secStartDist = s1EndDist;
        secEndDist = s2EndDist;
        donorLap = lapForS2 || bestOverall;
      } else if (d > s2EndDist) {
        targetStartT = bestS1Sec + bestS2Sec;
        targetDuration = bestS3Sec;
        secStartDist = s2EndDist;
        secEndDist = totalDist;
        donorLap = lapForS3 || bestOverall;
      }

      const secSpanDist = Math.max(1, secEndDist - secStartDist);
      const distFraction = Math.max(0, Math.min(1, (d - secStartDist) / secSpanDist));

      let timeFraction = distFraction;
      let donorPt: any = null;

      if (donorLap && donorLap.points && donorLap.points.length >= 10) {
        donorPt = this.getInterpolatedPoint(donorLap.points, d);
        const donorStartPt = this.getInterpolatedPoint(donorLap.points, secStartDist);
        const donorEndPt = this.getInterpolatedPoint(donorLap.points, secEndDist);
        const donorDuration = donorEndPt.time - donorStartPt.time;
        if (donorDuration > 0.05) {
          timeFraction = Math.max(0, Math.min(1, (donorPt.time - donorStartPt.time) / donorDuration));
        }
      }

      const pointTime = targetStartT + (timeFraction * targetDuration);
      const donorSpeed = donorPt ? donorPt.speed : p.speed;
      const speed = Math.max(p.speed, donorSpeed > 0 ? donorSpeed : p.speed);
      const accX = donorPt ? donorPt.accX : p.accX;
      const accY = donorPt ? donorPt.accY : p.accY;

      virtualPoints.push({
        id: p.id,
        timestamp: pointTime,
        distance: p.distance,
        lat: p.lat,
        lon: p.lon,
        alt: p.alt,
        speed: Math.round(speed * 10) / 10,
        accX: accX,
        accY: accY,
        throttle: accY > 0 ? accY * 50 : p.throttle,
        brake: accY < 0 ? Math.abs(accY) * 50 : p.brake,
        temp: p.temp,
        sectors: p.sectors
      });
    }

    const idealSectors: SectorData[] = [
      { number: 1, time: bestS1Sec, startDistance: 0, endDistance: s1EndDist },
      { number: 2, time: bestS2Sec, startDistance: s1EndDist, endDistance: s2EndDist },
      { number: 3, time: bestS3Sec, startDistance: s2EndDist, endDistance: totalDist }
    ];

    return {
      id: 'LAP-IDEAL',
      driver: session.driver,
      track: session.track,
      date: session.date,
      time: session.time,
      lapTime: idealTimeSec,
      points: virtualPoints,
      sectors: idealSectors,
      isIdeal: true,
      isBest: true
    };
  }

  ensureSessionIdealLap(session: SessionItem) {
    if (!session || !session.laps || session.laps.length === 0) return;
    const realLaps = session.laps.filter(l => l.id !== 'LAP-IDEAL' && !l.id?.includes('Virtual'));
    if (realLaps.length === 0) return;

    const idealLap = this.buildIdealLap(session);
    if (!idealLap) return;

    // Place newly generated LAP-IDEAL at the top of the session laps
    session.laps = [idealLap, ...realLaps];
  }

  async loadSession(session: SessionItem): Promise<void> {
    if (session.isLoaded && session.laps.length > 0) {
      return;
    }

    if (session.resumeFile) {
      try {
        const text = await this.readFileAsText(session.resumeFile);
        session.resumeData = JSON.parse(text);
      } catch (err) {
        console.error("Error parsing resume file for session:", session.id, err);
      }
    }

    const sortedFiles = [...session.lapFiles].sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    });

    const parsedLaps: Lap[] = [];
    for (const file of sortedFiles) {
      try {
        const text = await this.readFileAsText(file);
        const rawPoints = JSON.parse(text);
        const lapId = `LAP-${session.driver}-${session.time}-${file.name.replace(/\.json$/i, "")}`;
        const lap = this.trackService.parseRawLapData(rawPoints, lapId, session.driver, session.track);
        lap.date = session.date;
        lap.time = session.time;
        parsedLaps.push(lap);
      } catch (err) {
        console.error("Error parsing lap file:", file.name, err);
      }
    }

    session.laps = parsedLaps;
    session.lapCount = parsedLaps.length;
    if (parsedLaps.length > 0) {
      const validLaps = this.getValidRacingLaps(parsedLaps);
      const candidates = validLaps.length > 0 ? validLaps : parsedLaps;
      const best = candidates.reduce((min, l) => l.lapTime < min.lapTime ? l : min, candidates[0]);
      session.bestLapTime = best.lapTime;
      for (const lap of session.laps) {
        lap.isBest = (lap.id === best.id);
      }
    }
    // Generate Volta Ideal for this session
    this.ensureSessionIdealLap(session);
    session.isLoaded = true;
    session.fileItems = this.buildFileItemsForSession(session);
  }

  async selectSession(session: SessionItem) {
    if (!session.isLoaded || !session.laps || session.laps.length === 0) {
      await this.loadSession(session);
      this.profileTree.set(this.buildProfileTree(this.allSessions()));
      const dir = this.linkedDirectoryName() || 'PROFILES';
      await this.dirStorageService.saveCachedSessions(this.allSessions(), dir);
    }

    this.ensureSessionIdealLap(session);
    session.expanded = true;
    this.activeSessionKey.set(session.id);
    this.activeSession.set(session);
    this.currentSessionDriver.set(session.driver);
    this.currentSessionTrack.set(session.track);
    this.currentSessionDate.set(session.date);
    this.currentSessionTime.set(session.time);

    this.telemetryService.laps.set(session.laps);
    this.telemetryService.resumeData.set(session.resumeData || null);

    if (session.laps.length > 0) {
      const sortedCandidates = this.getSortedFastestRacingLaps(session.laps);
      const bestLap = sortedCandidates[0] || session.laps[0];
      const secondLap = sortedCandidates.length > 1 ? sortedCandidates[1] : session.laps.find(l => l.id !== bestLap.id);
      this.selectedLapIds.set(secondLap ? [bestLap.id, secondLap.id] : [bestLap.id]);
      this.referenceLapId.set(bestLap.id);
      this.comparisonLapId.set(secondLap ? secondLap.id : bestLap.id);
      this.deltaReferenceLapId.set(bestLap.id);
      this.deltaComparisonLapId.set(secondLap ? secondLap.id : bestLap.id);
      this.coachingReferenceLapId.set(bestLap.id);
      this.coachingComparisonLapId.set(secondLap ? secondLap.id : bestLap.id);
      this.hasUserManuallySelectedCoachingLaps.set(false);
      this.selectedCornerIndex.set(0);

      const pointsSource = bestLap.points && bestLap.points.length > 0 ? bestLap.points : session.laps[0].points;
      const validPoints = (pointsSource || []).filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
      if (validPoints.length > 0) {
        const avgLat = validPoints.reduce((acc, p) => acc + p.lat, 0) / validPoints.length;
        const avgLng = validPoints.reduce((acc, p) => acc + p.lon, 0) / validPoints.length;
        this.mapCenter.set({ lat: avgLat, lng: avgLng });
      }
    } else {
      this.selectedLapIds.set([]);
      this.referenceLapId.set(null);
      this.comparisonLapId.set(null);
    }

    if (session.resumeData && this.activeTab() === "resume") {
      this.setTab("resume");
    }
    setTimeout(() => {
      this.renderCharts();
    }, 50);
  }

  async handleFileUpload(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    const files = element.files;
    if (!files || files.length === 0) return;

    const fileList: FileEntryItem[] = Array.from(files).map(file => ({
      file,
      relativePath: file.webkitRelativePath || file.name
    }));

    await this.processImportedFileEntries(fileList);
    element.value = "";
  }

  triggerFolderInput() {
    const input = this.dirPickerInput()?.nativeElement;
    if (input) {
      input.click();
    }
  }

  async defineDirectory() {
    // If inside an iframe (such as AI Studio preview), browsers block window.showDirectoryPicker
    // with SecurityError. We detect this and seamlessly use the directory folder input!
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe || !this.dirStorageService.isSupported()) {
      this.triggerFolderInput();
      return;
    }

    try {
      const windowWithPicker = window as unknown as { showDirectoryPicker?: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle> };
      if (!windowWithPicker.showDirectoryPicker) {
        this.triggerFolderInput();
        return;
      }
      const handle = await windowWithPicker.showDirectoryPicker({ mode: 'read' });
      if (!handle) return;
      await this.dirStorageService.saveDirectoryHandle(handle);
      this.linkedDirectoryName.set(handle.name);
      this.directoryNeedsPermission.set(false);
      await this.loadFromDirectoryHandle(handle);
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      if (errorObj?.name === 'SecurityError') {
        this.triggerFolderInput();
      } else if (errorObj?.name !== 'AbortError') {
        console.error('Error selecting directory:', err);
        this.triggerFolderInput();
      }
    }
  }

  async handleDirectoryInputSelected(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    const files = element.files;
    if (!files || files.length === 0) return;

    // Detect folder name from first file's path
    const firstPath = files[0].webkitRelativePath || '';
    const pathParts = firstPath.split(/[/\\]/).filter(p => p.trim().length > 0);
    const folderName = pathParts.length > 1 ? pathParts[0] : (pathParts[0] || 'Pasta de Telemetria');
    this.linkedDirectoryName.set(folderName);

    const fileList: FileEntryItem[] = Array.from(files).map(file => ({
      file,
      relativePath: file.webkitRelativePath || file.name
    }));

    await this.processImportedFileEntries(fileList);
    element.value = '';
  }

  async syncLinkedDirectory() {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe || !this.dirStorageService.isSupported()) {
      this.triggerFolderInput();
      return;
    }
    const handle = await this.dirStorageService.getDirectoryHandle();
    if (!handle) {
      this.triggerFolderInput();
      return;
    }
    const hasPerm = await this.dirStorageService.verifyPermission(handle, true);
    if (hasPerm) {
      this.directoryNeedsPermission.set(false);
      await this.loadFromDirectoryHandle(handle);
    } else {
      this.directoryNeedsPermission.set(true);
    }
  }

  async disconnectDirectory() {
    await this.dirStorageService.clearDirectoryHandle();
    await this.dirStorageService.clearCachedSessions();
    this.linkedDirectoryName.set(null);
    this.directoryNeedsPermission.set(false);
    this.directorySyncStatusMessage.set('');
  }

  async authorizeAndSyncDirectory() {
    const handle = await this.dirStorageService.getDirectoryHandle();
    if (!handle) return;
    const hasPerm = await this.dirStorageService.verifyPermission(handle, true);
    if (hasPerm) {
      this.directoryNeedsPermission.set(false);
      await this.loadFromDirectoryHandle(handle);
    }
  }

  async checkAndAutoLoadLinkedDirectory() {
    try {
      // 1. Check if we have cached sessions in IndexedDB from a previous directory import
      const cached = await this.dirStorageService.getCachedSessions();
      if (cached && cached.sessions && cached.sessions.length > 0) {
        const restoredSessions = cached.sessions as SessionItem[];
        for (const s of restoredSessions) {
          s.fileItems = this.buildFileItemsForSession(s);
          this.ensureSessionIdealLap(s);
        }
        this.allSessions.set(restoredSessions);
        const tree = this.buildProfileTree(restoredSessions);
        this.profileTree.set(tree);
        if (cached.dirName) {
          this.linkedDirectoryName.set(cached.dirName);
        }

        const initialDriverNode = tree[0];
        const initialTrackNode = initialDriverNode?.tracks[0];
        const initialDateNode = initialTrackNode?.dates[0];
        const initialSession = initialDateNode?.sessions[0] || restoredSessions[0];

        if (initialSession) {
          initialSession.expanded = true;
          await this.selectSession(initialSession);
          this.setTab('resume');
        }

        const isPt = this.i18nService.currentLang() === 'pt';
        this.directorySyncStatusMessage.set(
          isPt 
            ? `✓ Carregado automaticamente (${restoredSessions.length} sessões salvas)`
            : `✓ Automatically loaded (${restoredSessions.length} saved sessions)`
        );
        return;
      }

      // 2. If no cached sessions, check if a directory handle was saved and has permission
      if (this.dirStorageService.isSupported()) {
        const savedName = this.dirStorageService.getSavedDirectoryName();
        if (savedName) {
          this.linkedDirectoryName.set(savedName);
          const handle = await this.dirStorageService.getDirectoryHandle();
          if (handle) {
            const hasPerm = await this.dirStorageService.verifyPermission(handle, false);
            if (hasPerm) {
              await this.loadFromDirectoryHandle(handle);
            } else {
              this.directoryNeedsPermission.set(true);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error during auto-load of linked directory:', err);
    }
  }

  async loadFromDirectoryHandle(handle: FileSystemDirectoryHandle) {
    this.isSyncingDirectory.set(true);
    this.isImportingFolder.set(true);
    this.importProgressText.set(`Lendo pasta vinculada "${handle.name}"...`);
    try {
      const entries = await this.dirStorageService.scanDirectoryHandle(handle);
      if (entries.length > 0) {
        await this.processImportedFileEntries(entries);
        const isPt = this.i18nService.currentLang() === 'pt';
        this.directorySyncStatusMessage.set(
          isPt 
            ? `✓ Sincronizado com sucesso (${this.totalSessionsCount()} sessões carregadas)`
            : `✓ Successfully synced (${this.totalSessionsCount()} sessions loaded)`
        );
      } else {
        const isPt = this.i18nService.currentLang() === 'pt';
        this.directorySyncStatusMessage.set(
          isPt ? 'Nenhum arquivo JSON de telemetria encontrado na pasta.' : 'No telemetry JSON files found in folder.'
        );
      }
    } catch (err) {
      console.error('Error loading files from directory handle:', err);
    } finally {
      this.isSyncingDirectory.set(false);
      this.isImportingFolder.set(false);
      this.importProgressText.set('');
    }
  }

  async processImportedFileEntries(fileList: FileEntryItem[]) {
    this.isImportingFolder.set(true);
    this.importProgressText.set("Lendo diretório de perfis...");

    const sessionMap = new Map<string, {
      driver: string;
      track: string;
      date: string;
      time: string;
      lapFiles: File[];
      resumeFile?: File;
      otherFiles: File[];
    }>();

    for (const item of fileList) {
      const file = item.file;
      const { driver, track, date, time } = this.parseFilePath(file, item.relativePath);
      const sessionKey = `${driver}___${track}___${date}___${time}`;

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          driver,
          track,
          date,
          time,
          lapFiles: [],
          otherFiles: []
        });
      }

      const s = sessionMap.get(sessionKey)!;
      const lowerName = file.name.toLowerCase();
      if (lowerName === "resume.json") {
        s.resumeFile = file;
      } else if (lowerName.endsWith(".json")) {
        s.lapFiles.push(file);
      } else {
        s.otherFiles.push(file);
      }
    }

    const newSessions: SessionItem[] = [];
    let processed = 0;
    const totalSessions = sessionMap.size;

    for (const [key, group] of sessionMap.entries()) {
      processed++;
      this.importProgressText.set(`Processando sessão ${processed}/${totalSessions}: ${group.driver} - ${group.track}...`);

      group.lapFiles.sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });

      const sessionItem: SessionItem = {
        id: key,
        driver: group.driver,
        track: group.track,
        date: group.date,
        time: group.time,
        lapFiles: group.lapFiles,
        resumeFile: group.resumeFile,
        otherFiles: group.otherFiles,
        laps: [],
        resumeData: null,
        lapCount: group.lapFiles.length,
        isLoaded: false,
        expanded: false
      };

      // Pre-load all sessions so laps, counts, and best lap times are parsed immediately
      if (group.lapFiles.length > 0 || group.resumeFile) {
        await this.loadSession(sessionItem);
      } else {
        sessionItem.fileItems = this.buildFileItemsForSession(sessionItem);
      }

      newSessions.push(sessionItem);
    }

    if (newSessions.length > 0) {
      // Remove initial placeholder demo session if real files are loaded
      const existingReal = this.allSessions().filter(s => s.id !== 'FABIO___AUTODROMO DE GOIANIA___2024-08-24___09-31-00');
      const sessionMapMerged = new Map<string, SessionItem>();
      for (const s of existingReal) sessionMapMerged.set(s.id, s);
      for (const s of newSessions) sessionMapMerged.set(s.id, s);
      const merged = Array.from(sessionMapMerged.values());

      this.allSessions.set(merged);
      const tree = this.buildProfileTree(merged);
      this.profileTree.set(tree);

      // CRITICAL: Initialize with the EXACT first session defined by the hierarchy tree
      // (tree[0].driver -> tracks[0].track -> dates[0].date -> sessions[0])
      // This guarantees that the driver, track, date, time in the selector match the screens & charts
      const initialDriverNode = tree[0];
      const initialTrackNode = initialDriverNode?.tracks[0];
      const initialDateNode = initialTrackNode?.dates[0];
      const initialSession = initialDateNode?.sessions[0] || newSessions[0];

      if (initialSession) {
        initialSession.expanded = true;
        await this.selectSession(initialSession);
        this.setTab('resume');
      }

      const dirToSave = this.linkedDirectoryName() || 'PROFILES';
      if (!this.linkedDirectoryName()) {
        this.linkedDirectoryName.set(dirToSave);
      }
      await this.dirStorageService.saveCachedSessions(merged, dirToSave);
    }

    this.isImportingFolder.set(false);
    this.importProgressText.set("");
  }

  trackMarker = computed(() => {
    const dist = this.hoveredDistance();
    if (dist === null) return null;
    const lap = this.bestValidLap();
    if (!lap || !lap.points || lap.points.length === 0) return null;

    const points = lap.points.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
    if (points.length === 0) return null;

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const width = 300;
    const height = 200;
    const padding = 20;
    
    const scaleX = (width - 2 * padding) / (maxLon - minLon || 1);
    const scaleY = (height - 2 * padding) / (maxLat - minLat || 1);
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (width - (maxLon - minLon) * scale) / 2;
    const offsetY = (height - (maxLat - minLat) * scale) / 2;

    // Find closest point
    let closest = points[0];
    let minDiff = Infinity;
    for (const p of points) {
      const diff = Math.abs(p.distance - dist);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }

    const x = offsetX + (closest.lon - minLon) * scale;
    const y = height - (offsetY + (closest.lat - minLat) * scale);
    return { x, y };
  });

  getLapNumber(lapId: string): string {
    if (!lapId) return '';
    
    if (lapId === 'LAP-IDEAL' || lapId.includes('IDEAL')) {
      return this.i18nService.currentLang() === 'pt' ? '⭐ VOLTA IDEAL' : '⭐ IDEAL LAP';
    }

    // Handle Virtual laps specifically for cleaner UI
    if (lapId.includes('Virtual-')) {
      const parts = lapId.split('-');
      const name = parts[parts.length - 1]; // e.g. "200m"
      return `# Virtual ${name}`;
    }

    const parts = lapId.split('-');
    const lastPart = parts[parts.length - 1]; // e.g. "LAP22" or "lap22"
    const num = lastPart.replace(/lap|\.json/gi, '');
    return num ? `# ${num}` : lapId;
  }

  getLapColor(lapId: string): string {
    if (lapId === 'LAP-IDEAL' || lapId?.includes('IDEAL')) {
      return '#c084fc'; // Purple for theoretical ideal lap
    }
    const override = this.lapColorOverrides()[lapId];
    if (override) return override;
    const idx = this.laps().findIndex(l => l.id === lapId);
    return LAP_COLORS[idx % LAP_COLORS.length];
  }

  onLapColorChange(lapId: string, event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.lapColorOverrides.update(prev => ({ ...prev, [lapId]: color }));
    // Force re-render of charts to use new color
    setTimeout(() => this.renderCharts(), 50);
  }

  // Draggable Handlers
  startDragging(event: MouseEvent) {
    this.isDragging = true;
    const pos = this.selectorPosition();
    this.dragOffset = {
      x: event.clientX - pos.x,
      y: event.clientY - pos.y
    };
    
    // Add global listeners to handle movement outside the element
    const moveSub = (e: MouseEvent) => {
      if (this.isDragging) {
        this.selectorPosition.set({
          x: e.clientX - this.dragOffset.x,
          y: e.clientY - this.dragOffset.y
        });
      }
    };
    
    const upSub = () => {
      this.isDragging = false;
      window.removeEventListener('mousemove', moveSub);
      window.removeEventListener('mouseup', upSub);
    };
    
    window.addEventListener('mousemove', moveSub);
    window.addEventListener('mouseup', upSub);
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
  }

  getPoints(lap: Lap, field: 'speed' | 'throttle' | 'brake'): string {
    if (!lap.points) return '';
    const width = 500;
    const height = 100;
    const maxVal = field === 'speed' ? 300 : 100;
    
    // Find max distance across all laps to normalize X axis
    const maxDist = Math.max(...this.laps().map(l => (l.points && l.points.length > 0) ? l.points[l.points.length - 1].distance : 0));
    
    return lap.points.map((p) => {
      const x = (p.distance / (maxDist || 1)) * width;
      const val = p[field as keyof typeof p] as number;
      const y = height - (val / maxVal) * height;
      return `${x},${y}`;
    }).join(' ');
  }

  trackPath = computed(() => {
    const lap = this.bestValidLap();
    if (!lap || !lap.points || lap.points.length === 0) return '';
    
    const points = lap.points.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
    if (points.length === 0) return '';
    
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const width = 300;
    const height = 200;
    const padding = 20;
    
    const scaleX = (width - 2 * padding) / (maxLon - minLon || 1);
    const scaleY = (height - 2 * padding) / (maxLat - minLat || 1);
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (width - (maxLon - minLon) * scale) / 2;
    const offsetY = (height - (maxLat - minLat) * scale) / 2;
    
    return points.map((p, i) => {
      const x = offsetX + (p.lon - minLon) * scale;
      const y = height - (offsetY + (p.lat - minLat) * scale);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
  });

  getTrackPoint(p: TelemetryPoint): {x: number, y: number} {
    const lap = this.bestValidLap();
    if (!lap || !lap.points || isNaN(p.lat) || isNaN(p.lon)) return {x: 0, y: 0};
    
    const points = lap.points.filter(pt => !isNaN(pt.lat) && !isNaN(pt.lon) && (pt.lat !== 0 || pt.lon !== 0));
    if (points.length === 0) return {x: 0, y: 0};
    
    const lats = points.map(pt => pt.lat);
    const lons = points.map(pt => pt.lon);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const width = 300;
    const height = 200;
    const padding = 20;
    
    const scaleX = (width - 2 * padding) / (maxLon - minLon || 1);
    const scaleY = (height - 2 * padding) / (maxLat - minLat || 1);
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (width - (maxLon - minLon) * scale) / 2;
    const offsetY = (height - (maxLat - minLat) * scale) / 2;
    
    const x = offsetX + (p.lon - minLon) * scale;
    const y = height - (offsetY + (p.lat - minLat) * scale);
    
    return {x, y};
  }
}
