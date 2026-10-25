export interface LapResume {
  nLap: number;
  t: number;
  s1: number;
  s2: number;
  s3: number;
  maxSpeed: number;
  tdistance: number;
  [key: string]: unknown;
}

export interface BestLapResume {
  btime: number;
  bnLap: number;
  maxSpeed: number;
  tdistance: number;
}

export interface ResumeData {
  bestLap: BestLapResume;
  laps: LapResume[];
}

export interface TelemetryPoint {
  id: number;
  timestamp: number; // mapped from 't'
  lat: number;
  lon: number;
  speed: number;
  alt: number;
  accX: number; // Lateral G
  accY: number; // Longitudinal G
  throttle: number;
  brake: number;
  temp: number;
  distance: number; // mapped from 'dist'
  sectors: number[]; // s1-s9
}

export interface SectorData {
  number: number;
  time: number;
  startDistance: number;
  endDistance: number;
}

export interface Lap {
  id: string;
  driver: string;
  track: string;
  date: string;
  time: string;
  lapTime: number; // seconds
  points: TelemetryPoint[];
  sectors: SectorData[];
  isBest?: boolean;
  isIdeal?: boolean;
}

/**
 * Metadata extracted from file paths
 * e.g. /profiles/FABIO/AUTODROMO DE GOIANIA/2024-08-24/09-31-00/LAP1.json
 */
export interface ParsedProfilePath {
  driver: string;
  track: string;
  date: string;
  time: string;
  fileName: string;
  relativePath: string;
}

export interface SessionFileItem {
  name: string;
  file?: File;
  lapId?: string;
  lapNumber?: number;
  lapTime?: number;
  isResume?: boolean;
  isBest?: boolean;
}

/**
 * Session Item Model
 * Represents a single session (at the Time level: HH-mm-ss)
 */
export interface SessionItem {
  id: string; // Composite key: `${driver}___${track}___${date}___${time}`
  driver: string;
  track: string;
  date: string;
  time: string;
  lapFiles: File[];
  resumeFile?: File;
  otherFiles?: File[];
  fileItems?: SessionFileItem[];
  laps: Lap[];
  resumeData?: ResumeData | null;
  bestLapTime?: number;
  lapCount?: number;
  isLoaded: boolean;
  expanded?: boolean;
}

/**
 * Hierarchical Tree Nodes (Piloto -> Pista -> Data -> Horário)
 */
export interface TreeDateNode {
  date: string;
  sessions: SessionItem[];
  expanded: boolean;
}

export interface TreeTrackNode {
  track: string;
  dates: TreeDateNode[];
  expanded: boolean;
}

export interface TreeDriverNode {
  driver: string;
  tracks: TreeTrackNode[];
  expanded: boolean;
}

/**
 * Active Session Selection State
 */
export interface SessionSelectorState {
  activeDriver: string;
  activeTrack: string;
  activeDate: string;
  activeTime: string;
  activeSessionId: string;
}

/**
 * Cascading Dropdown Selector Option
 */
export interface SelectorOption<T = string> {
  value: T;
  label: string;
  count?: number;
  badge?: string;
}

/**
 * Overall Hierarchy Summary
 */
export interface SessionHierarchySummary {
  totalDrivers: number;
  totalTracks: number;
  totalDates: number;
  totalSessions: number;
  totalLaps: number;
  overallBestLapTime?: number;
}

/**
 * Delta Bar Chart & Real-Time Comparison Models
 */
export interface DeltaSegment {
  index: number;
  startDistance: number;
  endDistance: number;
  midDistance: number;
  refTime: number;
  compTime: number;
  deltaSeg: number; // compTime - refTime: < 0 is Gained (faster), > 0 is Lost (slower)
  cumulativeDelta: number; // running delta at endDistance
  refSpeed: number;
  compSpeed: number;
  deltaSpeed: number;
  status: 'gained' | 'lost' | 'even';
}

export interface DeltaPoint {
  distance: number;
  cumulativeDelta: number;
  refTime: number;
  compTime: number;
  refSpeed: number;
  compSpeed: number;
  deltaSpeed: number;
}

export interface DeltaComparisonData {
  refLap: Lap;
  compLap: Lap;
  totalDistance: number;
  netTimeDelta: number;
  segments: DeltaSegment[];
  continuousPoints: DeltaPoint[];
  maxGain: { distance: number; delta: number; segmentIndex: number };
  maxLoss: { distance: number; delta: number; segmentIndex: number };
  gainedSegmentsCount: number;
  lostSegmentsCount: number;
}

export interface RealtimeDeltaSnapshot {
  distance: number;
  refLapName: string;
  compLapName: string;
  deltaTime: number;
  deltaSpeed: number;
  refSpeed: number;
  compSpeed: number;
  status: 'gained' | 'lost' | 'level';
  segmentIndex: number;
  segmentDelta: number;
}

/**
 * Driver Coaching & Corner Breakdown Models
 */
export interface CornerData {
  number: number;
  name: string;
  entryDistance: number;
  apexDistance: number;
  exitDistance: number;
  entryLat: number;
  entryLon: number;
  apexLat: number;
  apexLon: number;
  exitLat: number;
  exitLon: number;
  turnDirection: 'left' | 'right';
  minSpeed: number;
}

export interface CornerMetrics {
  corner: CornerData;
  refBrakeDist: number;
  compBrakeDist: number;
  deltaBrakeMeters: number;     // negative = comp braked earlier; positive = braked later
  refEntrySpeed: number;
  compEntrySpeed: number;
  deltaEntrySpeed: number;
  refApexSpeed: number;
  compApexSpeed: number;
  deltaApexSpeed: number;
  refExitSpeed: number;
  compExitSpeed: number;
  deltaExitSpeed: number;
  refCornerTime: number;
  compCornerTime: number;
  deltaCornerTime: number;      // negative = comp faster; positive = comp slower
  opportunityScore: number;    // time loss (positive seconds) that can be gained
  coachingCue: string;         // Actionable driving recommendation
  status: 'faster' | 'slower' | 'even';
}

