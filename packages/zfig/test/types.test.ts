import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import { schema, field } from "../src/schema";
import { resolve } from "../src/resolve";
import type { InferSchema } from "../src/types";

describe("type inference", () => {
  describe("literal types", () => {
    it("infers literal string", () => {
      const s = schema({ version: "1.0" });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ version: "1.0" }>();
    });

    it("infers literal number", () => {
      const s = schema({ port: 3000 });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ port: 3000 }>();
    });

    it("infers literal boolean", () => {
      const s = schema({ debug: true });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ debug: true }>();
    });
  });

  describe("field() types", () => {
    it("infers string from z.string()", () => {
      const s = schema({ host: field({ type: z.string() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ host: string }>();
    });

    it("infers number from z.number()", () => {
      const s = schema({ port: field({ type: z.number() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ port: number }>();
    });

    it("infers boolean from z.boolean()", () => {
      const s = schema({ enabled: field({ type: z.boolean() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ enabled: boolean }>();
    });

    it("infers optional from z.string().optional()", () => {
      const s = schema({ name: field({ type: z.string().optional() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        name: string | undefined;
      }>();
    });

    it("infers array from z.array()", () => {
      const s = schema({ tags: field({ type: z.array(z.string()) }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ tags: string[] }>();
    });
  });

  describe("nested objects", () => {
    it("infers nested object types", () => {
      const s = schema({
        db: {
          host: field({ type: z.string() }),
          port: field({ type: z.number() }),
        },
      });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        db: { host: string; port: number };
      }>();
    });

    it("infers deeply nested types", () => {
      const s = schema({
        app: {
          db: {
            connection: {
              host: field({ type: z.string() }),
            },
          },
        },
      });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        app: { db: { connection: { host: string } } };
      }>();
    });

    it("infers mixed literals and keys in nested objects", () => {
      const s = schema({
        api: {
          url: field({ type: z.string() }),
          timeout: 5000,
        },
      });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        api: { url: string; timeout: 5000 };
      }>();
    });
  });

  describe("resolve() return type", () => {
    it("returns correctly typed config", () => {
      const s = schema({
        host: field({ type: z.string() }),
        port: field({ type: z.number() }),
      });
      type ResolveResult = ReturnType<typeof resolve<typeof s>>;
      expectTypeOf<ResolveResult>().toMatchTypeOf<{ host: string; port: number }>();
    });

    it("exposes helper methods on resolved config (type-only test)", () => {
      const s = schema({
        host: field({ type: z.string(), default: "localhost" }),
      });

      // This function tests types at compile time
      // If the methods aren't on the type, tsc will fail
      function typeTest(config: ReturnType<typeof resolve<typeof s>>) {
        const _sourceStr: string = config.toSourceString();
        const _diagnostics = config.getDiagnostics();
        const _debugObj = config.toDebugObject();
        const _debugObjWithDiag = config.toDebugObject({ includeDiagnostics: true });
      }

      // Dummy assertion to make test pass at runtime
      expect(typeTest).toBeDefined();
    });
  });
});
