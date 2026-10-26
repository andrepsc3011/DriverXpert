import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, forkJoin, map} from 'rxjs';
import {Lap, TelemetryPoint, SectorData} from './models';

export interface RawLapPoint {
  id: number;
  time: string;
  lat: number;
  lon: number;
  speed: number;
  alt: number;
  accX: number;
  accY: number;
  temp: number;
  dist: number;
  t: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  s7: number;
  s8: number;
  s9: number;
}

@Injectable({
  providedIn: 'root',
})
export class TrackService {
  private http = inject(HttpClient);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseRawLapData(rawInput: any, id: string, driver = 'FABIO', track = 'BRA - AUTODROMO VELOCITTA'): Lap {
    const rawPoints = Array.isArray(rawInput) ? rawInput : (rawInput?.points || []);
    
    if (!Array.isArray(rawPoints)) {
      console.error('Invalid lap data: rawPoints is not an array', rawInput);
      return {
        id, driver, track, date: '', time: '', lapTime: 0, points: [], sectors: []
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points: TelemetryPoint[] = rawPoints.map((p: any) => ({
      id: p.id || 0,
      timestamp: (p.t || 0) / 1000, // convert to seconds
      lat: p.lat || 0,
      lon: p.lon || 0,
      speed: p.speed || 0,
      alt: p.alt || 0,
      accX: p.accX || 0,
      accY: p.accY || 0,
      throttle: p.accY > 0 ? p.accY * 50 : 0,
      brake: p.accY < 0 ? Math.abs(p.accY) * 50 : 0,
      temp: p.temp || 0,
      distance: p.dist || 0,
      sectors: [p.s1, p.s2, p.s3, p.s4, p.s5, p.s6, p.s7, p.s8, p.s9].map(s => (s || 0) / 1000)
    }));

    const lastPoint = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1] : null;
    const sectors: SectorData[] = [];
    
    if (lastPoint) {
      // Find how many sectors are used (non-zero in lastPoint)
      const rawSectors = [lastPoint.s1, lastPoint.s2, lastPoint.s3, lastPoint.s4, lastPoint.s5, lastPoint.s6, lastPoint.s7, lastPoint.s8, lastPoint.s9];
      const activeSectorIndices: number[] = [];
      rawSectors.forEach((sTime, idx) => {
        if (sTime > 0) activeSectorIndices.push(idx);
      });

      let currentDist = 0;
      activeSectorIndices.forEach((sectorIdx, i) => {
        const sTime = rawSectors[sectorIdx];
        const nextSectorIdx = activeSectorIndices[i + 1];

        let endDist = 0;
        if (nextSectorIdx !== undefined) {
          // The current sector ends when the next sector starts counting (> 0)
          const nextSectorKey = `s${nextSectorIdx + 1}`;
          const transitionPoint = rawPoints.find((p: any) => (p[nextSectorKey] || 0) > 0);
          if (transitionPoint && (transitionPoint.dist || 0) > currentDist) {
            endDist = transitionPoint.dist;
          }
        }

        // Final sector or fallback if no transition point found
        if (!endDist || endDist <= currentDist) {
          if (i === activeSectorIndices.length - 1) {
            endDist = lastPoint.dist || 0;
          } else {
            const remainingCount = activeSectorIndices.length - i;
            const remainingDist = (lastPoint.dist || 0) - currentDist;
            endDist = currentDist + (remainingDist / remainingCount);
          }
        }

        sectors.push({
          number: sectorIdx + 1,
          time: sTime / 1000,
          startDistance: currentDist,
          endDistance: endDist
        });
        currentDist = endDist;
      });
    }

    // Fallback if no sectors found
    if (sectors.length === 0 && points.length > 0) {
      const totalDist = lastPoint?.dist || 0;
      sectors.push({ number: 1, time: (lastPoint?.t || 0) / 1000, startDistance: 0, endDistance: totalDist });
    }
    
    return {
      id,
      driver,
      track,
      date: '2025-06-21',
      time: rawPoints[0]?.time || '00:00:00',
      lapTime: (lastPoint?.t || 0) / 1000,
      points,
      sectors
    };
  }

  getLap(lapNumber: number): Observable<Lap> {
    return this.http.get<RawLapPoint[]>(`tracks/LAP${lapNumber}.json`).pipe(
      map((rawPoints) => this.parseRawLapData(rawPoints, `lap-${lapNumber}`))
    );
  }

  getAllLaps(): Observable<Lap[]> {
    const lapRequests = [1, 2, 3, 4, 5].map((n) => this.getLap(n));
    return forkJoin(lapRequests);
  }
}
