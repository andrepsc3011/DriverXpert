import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  username: string;
  role: 'admin' | 'pilot' | 'viewer';
  displayName: string;
}

export interface AuthSession {
  user: AuthUser;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

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
    // Always start unauthenticated when auth is enabled so user and password are ALWAYS requested on page load
    if (!this.isAuthEnabled()) {
      this.isAuthenticated.set(true);
    } else {
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
    }
  }

  login(usernameInput: string, passwordInput: string): { success: boolean; error?: string } {
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

    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    return { success: true };
  }

  logout(): void {
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
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
    }
  }
}
