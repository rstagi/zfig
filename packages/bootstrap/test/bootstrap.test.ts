import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { createServer } from "node:http";
import fastify from "fastify";
import express from "express";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { schema, field, ConfigError } from "confts";
import { bootstrap } from "../src";

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

describe("bootstrap()", () => {
  const configSchema = schema({
    port: field({ type: z.number(), env: "PORT", default: 3000 }),
    host: field({ type: z.string(), env: "HOST", default: "localhost" }),
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("function overloads", () => {
    it("works with (schema, factory) signature", async () => {
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, () => mockServer);
      const { server } = await service.create();
      expect(server).toBe(mockServer);
    });

    it("works with (schema, options, factory) signature", async () => {
      const mockServer = createMockServer();
      let receivedConfig: unknown;
      const service = bootstrap(configSchema, { initialValues: { port: 9999 } }, (config) => {
        receivedConfig = config;
        return mockServer;
      });
      await service.create();
      expect(receivedConfig).toEqual({ port: 9999, host: "localhost" });
    });

    it("options.override has highest priority", async () => {
      const mockServer = createMockServer();
      let receivedConfig: unknown;
      const service = bootstrap(configSchema, { initialValues: { port: 8080 }, override: { port: 5555 } }, (config) => {
        receivedConfig = config;
        return mockServer;
      });
      await service.create();
      expect(receivedConfig).toEqual({ port: 5555, host: "localhost" });
    });

    it("options.configPath loads config file (JSON)", async () => {
      const configDir = mkdtempSync(join(tmpdir(), "confts-startup-"));
      writeFileSync(join(configDir, "config.json"), JSON.stringify({ port: 7777, host: "config-host" }));
      try {
        const mockServer = createMockServer();
        let receivedConfig: unknown;
        const service = bootstrap(configSchema, { configPath: join(configDir, "config.json"), env: {} }, (config) => {
          receivedConfig = config;
          return mockServer;
        });
        await service.create();
        expect(receivedConfig).toEqual({ port: 7777, host: "config-host" });
      } finally {
        rmSync(configDir, { recursive: true });
      }
    });
  });

  describe("create()", () => {
    it("returns server without calling listen", async () => {
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, () => mockServer);

      const { server } = await service.create();

      expect(server).toBe(mockServer);
      expect(mockServer.listenCalled).toBe(false);
    });

    it("passes validated config to factory", async () => {
      const mockServer = createMockServer();
      let receivedConfig: unknown;

      const service = bootstrap(configSchema, (config) => {
        receivedConfig = config;
        return mockServer;
      });

      await service.create();

      expect(receivedConfig).toEqual({ port: 3000, host: "localhost" });
    });

    it("supports async factory", async () => {
      const mockServer = createMockServer();

      const service = bootstrap(configSchema, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return mockServer;
      });

      const { server } = await service.create();

      expect(server).toBe(mockServer);
    });
  });

  describe("run()", () => {
    it("calls listen with port from config", async () => {
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, () => mockServer);

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
      const service = bootstrap(configSchema, () => mockServer);

      const runPromise = service.run({ port: 8080 });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockServer.listenOptions).toEqual({ port: 8080 });

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("calls onReady callback after listen", async () => {
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, () => mockServer);
      const onReady = vi.fn();

      const runPromise = service.run({ onReady });

      await new Promise((r) => setTimeout(r, 20));

      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("gracefully shuts down on SIGTERM", async () => {
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, () => mockServer);
      const onShutdown = vi.fn();

      const runPromise = service.run({ onShutdown });

      await new Promise((r) => setTimeout(r, 10));

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;

      expect(mockServer.closeCalled).toBe(true);
      expect(onShutdown).toHaveBeenCalledOnce();
    });

    it("handles Promise-based listen (Fastify-style) with host", async () => {
      const mockServer = createPromiseMockServer();
      const service = bootstrap(configSchema, () => mockServer);
      const onReady = vi.fn();

      const runPromise = service.run({ host: "0.0.0.0", onReady });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServer.listenCalled).toBe(true);
      expect(mockServer.listenOptions).toEqual({ port: 3000, host: "0.0.0.0" });
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });
  });

  describe("loader registry integration", () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "confts-bootstrap-"));
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true });
    });

    it("throws clear error for YAML without yaml-loader", async () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(configPath, "port: 8080\nhost: yaml-host");
      const mockServer = createMockServer();
      const service = bootstrap(configSchema, { configPath, env: {} }, () => mockServer);
      await expect(service.create()).rejects.toThrow(/yaml-loader/i);
    });

    it("works with JSON config file", async () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, '{"port": 9090, "host": "json-host"}');
      const mockServer = createMockServer();
      let receivedConfig: unknown;
      const service = bootstrap(configSchema, { configPath, env: {} }, (config) => {
        receivedConfig = config;
        return mockServer;
      });
      await service.create();
      expect(receivedConfig).toEqual({ port: 9090, host: "json-host" });
    });
  });

  describe("Fastify integration", () => {
    it("works with real Fastify server via create()", async () => {
      const service = bootstrap(configSchema, () => {
        const app = fastify();
        app.get("/ping", async () => "pong");
        return app;
      });

      const { server } = await service.create();
      expect(server).toBeDefined();
      await server.close();
    });
  });

  describe("Express integration", () => {
    it("works with Express via http.createServer", async () => {
      const onReady = vi.fn();
      const service = bootstrap(configSchema, () => {
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

  describe("autorun", () => {
    it("does not auto-run when enabled: false", () => {
      const mockServer = createMockServer();
      bootstrap(configSchema, { autorun: { enabled: false } }, () => mockServer);

      expect(mockServer.listenCalled).toBe(false);
    });

    it("does not auto-run when autorun not provided", () => {
      const mockServer = createMockServer();
      bootstrap(configSchema, {}, () => mockServer);

      expect(mockServer.listenCalled).toBe(false);
    });

    it("merges static runOptions into defaults", async () => {
      const mockServer = createMockServer();
      const onReady = vi.fn();
      const service = bootstrap(configSchema, () => mockServer);

      const runPromise = service.run({ port: 5000, host: "0.0.0.0", onReady });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServer.listenOptions).toEqual({ port: 5000, host: "0.0.0.0" });
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });

    it("supports runOptions as config-aware function", async () => {
      const portSchema = schema({
        serverPort: field({ type: z.number(), default: 4444 }),
      });
      const mockServer = createMockServer();
      const onReady = vi.fn();
      const service = bootstrap(portSchema, () => mockServer);

      const runPromise = service.run({
        port: 4444,
        onReady,
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServer.listenOptions).toEqual({ port: 4444 });
      expect(onReady).toHaveBeenCalledOnce();

      process.emit("SIGTERM", "SIGTERM");
      await runPromise;
    });
  });

  describe("onError", () => {
    it("receives ConfigError with diagnostics on config failure", async () => {
      const requiredSchema = schema({
        port: field({ type: z.number(), default: 3000 }),
        apiKey: field({ type: z.string() }), // required, no default
      });
      const mockServer = createMockServer();
      const onError = vi.fn();

      const service = bootstrap(requiredSchema, { onError, env: {} }, () => mockServer);

      await expect(service.create()).rejects.toThrow(ConfigError);
      expect(onError).toHaveBeenCalledOnce();
      const err = onError.mock.calls[0][0] as ConfigError;
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.diagnostics).toBeDefined();
      expect(err.diagnostics!.some((d) => d.type === "sourceDecision" && d.key === "port")).toBe(true);
    });

    it("receives factory errors too", async () => {
      const onError = vi.fn();
      const factoryError = new Error("factory failed");

      const service = bootstrap(configSchema, { onError }, () => {
        throw factoryError;
      });

      await expect(service.create()).rejects.toThrow("factory failed");
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(factoryError);
    });
  });
});
