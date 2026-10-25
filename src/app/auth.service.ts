import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface AuthUser {
  username: string;
  role: 'admin' | 'pilot' | 'viewer';
  displayName: string;
}

export interface AuthSession {
  user: AuthUser;
  timestamp: number;
}

const STORAGE_KEY = 'dx_auth_session_v1';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Master switch to enable or disable the login screen.
   * When later building a desktop executable (e.g. Node.js / Electron / Tauri)
   * where login is not needed, simply change this to false.
   */
  readonly isAuthEnabled = signal<boolean>(true);

  readonly isAuthenticated = signal<boolean>(false);
  readonly currentUser = signal<AuthUser | null>(null);

  // Pre-configured allowed accounts for the static GitHub Pages deployment
  private readonly allowedUsers: Record<string, { pass: string; role: 'admin' | 'pilot'; name: string }> = {
    'admin': { pass: 'driverxpert', role: 'admin', name: 'Administrador' },
    'piloto': { pass: 'telemetria', role: 'pilot', name: 'Piloto Telemetria' },
    'demo': { pass: 'demo', role: 'pilot', name: 'Piloto Convidado' }
  };

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.isAuthenticated.set(true);
      return;
    }

    // If authentication is disabled, mark as authenticated directly
    if (!this.isAuthEnabled()) {
      this.isAuthenticated.set(true);
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as AuthSession;
        if (session && session.user && session.timestamp) {
          // Check expiration (optional 30 days)
          const now = Date.now();
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (now - session.timestamp < thirtyDays) {
            this.currentUser.set(session.user);
            this.isAuthenticated.set(true);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore auth session:', e);
    }

    this.isAuthenticated.set(false);
    this.currentUser.set(null);
  }

  login(usernameInput: string, passwordInput: string, remember = true): { success: boolean; error?: string } {
    const username = (usernameInput || '').trim().toLowerCase();
    const password = (passwordInput || '').trim();

    if (!username || !password) {
      return { success: false, error: 'Por favor, informe o usuário e a senha.' };
    }

    const account = this.allowedUsers[username];
    if (!account || account.pass !== password) {
      return { success: false, error: 'Credenciais inválidas. Verifique seu usuário e senha.' };
    }

    const user: AuthUser = {
      username,
      role: account.role,
      displayName: account.name
    };

    const session: AuthSession = {
      user,
      timestamp: Date.now()
    };

    if (isPlatformBrowser(this.platformId)) {
      try {
        const payload = JSON.stringify(session);
        if (remember) {
          localStorage.setItem(STORAGE_KEY, payload);
          sessionStorage.removeItem(STORAGE_KEY);
        } else {
          sessionStorage.setItem(STORAGE_KEY, payload);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn('Could not store auth session:', e);
      }
    }

    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    return { success: true };
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('Could not remove auth session:', e);
      }
    }
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  /**
   * Helper to quickly toggle or disable auth when switching to offline desktop mode
   */
  setAuthEnabled(enabled: boolean): void {
    this.isAuthEnabled.set(enabled);
    if (!enabled) {
      this.isAuthenticated.set(true);
    } else {
      this.restoreSession();
    }
  }
}
