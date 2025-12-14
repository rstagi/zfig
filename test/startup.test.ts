import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { createServer } from "node:http";
import fastify from "fastify";
import express from "express";
import { schema, key } from "../src/schema";
import { startup } from "../src/startup";

// Mock server implementation (callback-based)
function createMockServer() {
  const listeners: Array<() => void> = [];
  return {
    listenCalled: false,
    listenOptions: null as { port: number; host?: string } | null,
    closeCalled: false,
    listen(options: { port: number; host?: string }, cb?: () => void) {
      this.listenCalled = true;
      this.listenOptions = options;
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

// Mock server implementation (Promise-based, Fastify-style)
function createPromiseMockServer() {
  return {
    listenCalled: false,
    listenOptions: null as { port: number; host?: string } | null,
    closeCalled: false,
    listen(options: { port: number; host?: string }): Promise<string> {
      this.listenCalled = true;
      this.listenOptions = options;
      return Promise.resolve(`${options.host ?? "127.0.0.1"}:${options.port}`);
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
      expect(mockServer.listenOptions).toEqual({ port: 3000 });

      // Cleanup: simulate shutdown
      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("uses port override from options", async () => {
      const mockServer = createMockServer();
      const service = startup(configSchema, () => mockServer);

      const runPromise = service.run({ port: 8080 });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockServer.listenOptions).toEqual({ port: 8080 });

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

    it("handles Promise-based listen (Fastify-style) with host", async () => {
      const mockServer = createPromiseMockServer();
      const service = startup(configSchema, () => mockServer);
      const onReady = vi.fn();

      const runPromise = service.run({ host: "0.0.0.0", onReady });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServer.listenCalled).toBe(true);
      expect(mockServer.listenOptions).toEqual({ port: 3000, host: "0.0.0.0" });
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("rejects when Promise-based listen fails", async () => {
      const mockServer = {
        listenCalled: false,
        closeCalled: false,
        listen(_options: { port: number; host?: string }): Promise<string> {
          this.listenCalled = true;
          return Promise.reject(new Error("EADDRINUSE"));
        },
        close(cb?: (err?: Error) => void) {
          this.closeCalled = true;
          if (cb) cb();
        },
      };
      const service = startup(configSchema, () => mockServer);

      await expect(service.run({ host: "0.0.0.0" })).rejects.toThrow(
        "EADDRINUSE"
      );
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

  describe("auto-run with module option (CJS)", () => {
    it("does not auto-run when module does not match require.main", async () => {
      const mockServer = createMockServer();
      // In ESM, require.main is undefined, so any module passed won't match
      const fakeModule = { filename: "/some/other/file.js" } as NodeModule;

      startup(configSchema, () => mockServer, { module: fakeModule });

      await new Promise((r) => setTimeout(r, 10));

      // Since require.main is undefined in ESM, this should not auto-run
      expect(mockServer.listenCalled).toBe(false);
    });

    // Note: Full CJS auto-run test requires actual CJS environment
    // The implementation uses `require.main === options.module` which works in CJS
    // but require.main is undefined in ESM test environment
  });

  describe("Fastify integration", () => {
    it("works with real Fastify server via create()", async () => {
      const service = startup(configSchema, () => {
        const app = fastify();
        app.get("/ping", async () => "pong");
        return app;
      });

      const server = await service.create();
      expect(server).toBeDefined();
      await server.close();
    });

    it("works with real Fastify server via run() with host", async () => {
      const onReady = vi.fn();
      const service = startup(configSchema, () => {
        const app = fastify();
        app.get("/ping", async () => "pong");
        return app;
      });

      const runPromise = service.run({ host: "127.0.0.1", onReady });

      await new Promise((r) => setTimeout(r, 50));
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("works with real Fastify server via run() without host", async () => {
      const onReady = vi.fn();
      const service = startup(configSchema, () => {
        const app = fastify();
        app.get("/ping", async () => "pong");
        return app;
      });

      const runPromise = service.run({ onReady });

      await new Promise((r) => setTimeout(r, 50));
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });
  });

  describe("Express integration", () => {
    it("works with Express via http.createServer", async () => {
      const onReady = vi.fn();
      const service = startup(configSchema, () => {
        const app = express();
        app.get("/ping", (_req, res) => res.send("pong"));
        return createServer(app);
      });

      const runPromise = service.run({ onReady });

      await new Promise((r) => setTimeout(r, 50));
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });
  });
});
