import type { PlatformAdapter } from "./types";

export class PlatformRegistry {
  private adapters: PlatformAdapter[] = [];

  register(a: PlatformAdapter): void {
    this.adapters.push(a);
  }

  async startAll(): Promise<void> {
    let ok = 0;
    for (const a of this.adapters) {
      try {
        await a.start();
        ok++;
      } catch (e) {
        console.error(`Gagal start adapter ${a.platform}:`, e);
      }
    }
    if (ok === 0) {
      console.error("Tidak ada adapter yang berhasil start. Keluar.");
      process.exit(1);
    }
  }

  async stopAll(): Promise<void> {
    for (const a of this.adapters) await a.stop().catch(() => {});
  }
}
