import type { DiagnosticEvent } from "./types";

export class DiagnosticsCollector {
  private events: DiagnosticEvent[] = [];

  addConfigPath(picked: string | null, candidates: string[], reason: string): void {
    this.events.push({ type: "configPath", picked, candidates, reason });
  }

  addLoader(format: string, used: boolean, reason?: string): void {
    const event: DiagnosticEvent = { type: "loader", format, used };
    if (reason !== undefined) {
      (event as { reason?: string }).reason = reason;
    }
    this.events.push(event);
  }

  addSourceDecision(key: string, picked: string, tried: string[]): void {
    this.events.push({ type: "sourceDecision", key, picked, tried });
  }

  addNote(message: string, meta?: Record<string, unknown>): void {
    const event: DiagnosticEvent = { type: "note", message };
    if (meta !== undefined) {
      (event as { meta?: Record<string, unknown> }).meta = meta;
    }
    this.events.push(event);
  }

  getEvents(): DiagnosticEvent[] {
    return [...this.events];
  }
}
