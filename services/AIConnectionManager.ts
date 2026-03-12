export class AIConnectionManager {
  private static instance: AIConnectionManager;
  private keys: string[] = [];
  private currentIndex: number = 0;
  private quarantinedKeys: Set<string> = new Set();
  private deadKeys: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): AIConnectionManager {
    if (!AIConnectionManager.instance) {
      AIConnectionManager.instance = new AIConnectionManager();
    }
    return AIConnectionManager.instance;
  }

  public setKeys(keys: string[]) {
    if (JSON.stringify(this.keys) !== JSON.stringify(keys)) {
      this.keys = keys;
      this.currentIndex = 0;
      this.quarantinedKeys.clear();
      this.deadKeys.clear();
    }
  }

  public getKey(): string {
    if (this.keys.length === 0) {
      throw new Error("No API keys available.");
    }

    let attempts = 0;
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;

      if (!this.quarantinedKeys.has(key) && !this.deadKeys.has(key)) {
        return key;
      }
      attempts++;
    }

    throw new Error("All API keys are currently quarantined or dead.");
  }

  public reportError(key: string, status: number) {
    if (status === 429 || status === 503) {
      this.quarantinedKeys.add(key);
      setTimeout(() => {
        this.quarantinedKeys.delete(key);
      }, 60000); // 60 seconds cooldown
    } else if (status === 401 || status === 403 || status === 404) {
      this.deadKeys.add(key);
      throw new Error(`Fatal Auth Error (${status})`); // Fail-fast trigger
    }
  }
}

export const connectionManager = AIConnectionManager.getInstance();
