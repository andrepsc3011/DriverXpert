import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme = 'dark' | 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  
  theme = signal<AppTheme>('dark');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const saved = localStorage.getItem('applet_theme') as AppTheme;
        if (saved === 'dark' || saved === 'light') {
          this.theme.set(saved);
        } else {
          // Check system preference
          if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            // keep dark as default for racing cockpit, but allow light
          }
        }
      } catch {
        // fallback
      }
    }
  }

  setTheme(t: AppTheme) {
    this.theme.set(t);
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem('applet_theme', t);
      } catch {
        // storage disabled or quota exceeded
      }
    }
  }

  toggleTheme() {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  isDark(): boolean {
    return this.theme() === 'dark';
  }
}
