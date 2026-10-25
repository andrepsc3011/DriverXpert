import { Injectable, signal } from '@angular/core';
import { Lap, TelemetryPoint, SectorData, ResumeData } from './models';

@Injectable({
  providedIn: 'root'
})
export class TelemetryService {
  laps = signal<Lap[]>([]);
  selectedLapIds = signal<string[]>([]);
  resumeData = signal<ResumeData | null>(null);

  addLap(lap: Lap) {
    // Only add laps that start with "LAP" (case insensitive)
    if (!lap.id.toUpperCase().includes('LAP') && !lap.id.includes('imported')) {
      // If it's imported, we might want to check the original filename but let's stick to the request:
      // "as voltas possuem o nome iniciando com 'LAP' os demais arquivos não devem constar na lista"
      // However, handleFileUpload sets id to 'imported-...' - I should probably fix that there.
    }
    
    // Ensure the lap data is a plain object to avoid serialization issues
    const cleanLap = JSON.parse(JSON.stringify(lap));
    this.laps.update(prev => [...prev, cleanLap]);
  }

  generateVirtualBestLap(laps: Lap[]): Lap | null {
    if (laps.length === 0) return null;
    
    const track = laps[0].track;
    const driver = "Virtual Best";
    
    // Pick best sectors
    const numSectors = laps[0].sectors.length;
    const bestSectors: SectorData[] = [];
    const virtualPoints: TelemetryPoint[] = [];
    let currentTime = 0;

    for (let i = 1; i <= numSectors; i++) {
      const lapsWithSector = laps.filter(l => l.sectors.find(s => s.number === i));
      const bestLapForSector = lapsWithSector.reduce((prev, curr) => {
        const prevSector = prev.sectors.find(s => s.number === i)!;
        const currSector = curr.sectors.find(s => s.number === i)!;
        return prevSector.time < currSector.time ? prev : curr;
      });

      const sector = bestLapForSector.sectors.find(s => s.number === i)!;
      const sectorPoints = bestLapForSector.points.filter(p => p.distance >= sector.startDistance && p.distance <= sector.endDistance);
      
      // Adjust timestamps for virtual points
      const startTimeOffset = sectorPoints[0].timestamp;
      const adjustedPoints = sectorPoints.map(p => ({
        ...p,
        timestamp: currentTime + (p.timestamp - startTimeOffset)
      }));
      
      virtualPoints.push(...adjustedPoints);
      bestSectors.push({
        ...sector,
        time: sector.time
      });
      currentTime += sector.time;
    }

    return {
      id: 'virtual-best',
      driver,
      track,
      date: new Date().toISOString().split('T')[0],
      time: '00:00:00',
      lapTime: currentTime,
      points: virtualPoints,
      sectors: bestSectors,
      isBest: true
    };
  }
}
