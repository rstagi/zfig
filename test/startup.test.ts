import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { schema, key } from "../src/schema";
import { startup } from "../src/startup";

// Mock server implementation
function createMockServer() {
  const listeners: Array<() => void> = [];
  return {
    listenCalled: false,
    listenPort: null as number | null,
    closeCalled: false,
    listen(port: number, cb?: () => void) {
      this.listenCalled = true;
      this.listenPort = port;
      if (cb) listeners.push(cb);
      // Simulate async ready
      setTimeout(() => listeners.forEach((l) => l()), 0);
    },
    close(cb?: (err?: Error) => void) {
      this.closeCalled = true;
      if (cb) cb();
    },
  };
}

describe("startup()", () => {
  const configSchema = schema({
    port: key({ type: z.number(), env: "PORT", default: 3000 }),
    host: key({ type: z.string(), env: "HOST", default: "localhost" }),
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("create()", () => {
    it("returns server without calling listen", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);

      const server = await service.create();

      expect(server).toBe(mockServer);
      expect(mockServer.listenCalled).toBe(false);
    });

    it("passes validated config to factory", async () => {
      const mockServer = createMockServer();
      let receivedConfig: unknown;

      const service = startup(configSchema, (config) => {
        receivedConfig = config;
        return mockServer;
      });

      await service.create();

      expect(receivedConfig).toEqual({ port: 3000, host: "localhost" });
    });

    it("supports config overrides", async () => {
      const mockServer = createMockServer();
      let receivedConfig: unknown;

      const service = startup(configSchema, (config) => {
        receivedConfig = config;
        return mockServer;
      });

      await service.create({ port: 8080 });

      expect(receivedConfig).toEqual({ port: 8080, host: "localhost" });
    });

    it("supports async factory", async () => {
      const mockServer = createMockServer();

      const service = startup(configSchema, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return mockServer;
      });

      const server = await service.create();

      expect(server).toBe(mockServer);
    });

    it("respects env vars in config resolution", async () => {
      vi.stubEnv("HOST", "0.0.0.0");

      const mockServer = createMockServer();
      let receivedConfig: unknown;

      const service = startup(configSchema, (config) => {
        receivedConfig = config;
        return mockServer;
      });

      await service.create();

      // PORT uses default (env vars are strings, so only testing HOST here)
      expect(receivedConfig).toEqual({ port: 3000, host: "0.0.0.0" });
    });
  });

  describe("run()", () => {
    it("calls listen with port from config", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);

      const runPromise = service.run();

      // Wait for listen to be called
      await new Promise((r) => setTimeout(r, 10));

      expect(mockServer.listenCalled).toBe(true);
      expect(mockServer.listenPort).toBe(3000);

      // Cleanup: simulate shutdown
      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("uses port override from options", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);

      const runPromise = service.run({ port: 8080 });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockServer.listenPort).toBe(8080);

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("calls onReady callback after listen", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);
      const onReady = vi.fn();

      const runPromise = service.run({ onReady });

      await new Promise((r) => setTimeout(r, 20));

      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("gracefully shuts down on SIGTERM", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);
      const onShutdown = vi.fn();

      const runPromise = service.run({ onShutdown });

      await new Promise((r) => setTimeout(r, 10));

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;

      expect(mockServer.closeCalled).toBe(true);
      expect(onShutdown).toHaveBeenCalledOnce();
    });

    it("gracefully shuts down on SIGINT", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);

      const runPromise = service.run();

      await new Promise((r) => setTimeout(r, 10));

      process.emit("SIGINT", "SIGINT");
      await runPromise;

      expect(mockServer.closeCalled).toBe(true);
    });
  });

  describe("auto-run with meta option", () => {
    it("does not auto-run when meta not provided", async () => {
      const mockServer = createMockServer();
      startup(configSchema, () => mockServer);

      await new Promise((r) => setTimeout(r, 10));

      // Server should not have started
      expect(mockServer.listenCalled).toBe(false);
    });

    it("does not auto-run when meta.url does not match main module", async () => {
      const mockServer = createMockServer();
      const fakeMeta = { url: "file:///some/other/file.ts" } as ImportMeta;

      startup(configSchema, () => mockServer, { meta: fakeMeta });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockServer.listenCalled).toBe(false);
    });

    it("auto-runs when meta.url matches process.argv[1]", async () => {
      const mockServer = createMockServer();
      // Create a meta that matches current process.argv[1]
      const mainPath = process.argv[1];
      const fakeMeta = { url: `file://${mainPath}` } as ImportMeta;

      startup(configSchema, () => mockServer, { meta: fakeMeta });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServer.listenCalled).toBe(true);

      // Cleanup
      process.emit("SIGTERM", "SIGTERM");
      await new Promise((r) => setTimeout(r, 10));
    });
  });
});
