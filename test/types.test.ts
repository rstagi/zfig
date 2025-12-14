import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import { schema, key } from "../src/schema";
import { parse } from "../src/parser";
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

  describe("key() types", () => {
    it("infers string from z.string()", () => {
      const s = schema({ host: key({ type: z.string() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ host: string }>();
    });

    it("infers number from z.number()", () => {
      const s = schema({ port: key({ type: z.number() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ port: number }>();
    });

    it("infers boolean from z.boolean()", () => {
      const s = schema({ enabled: key({ type: z.boolean() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ enabled: boolean }>();
    });

    it("infers optional from z.string().optional()", () => {
      const s = schema({ name: key({ type: z.string().optional() }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        name: string | undefined;
      }>();
    });

    it("infers array from z.array()", () => {
      const s = schema({ tags: key({ type: z.array(z.string()) }) });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{ tags: string[] }>();
    });
  });

  describe("nested objects", () => {
    it("infers nested object types", () => {
      const s = schema({
        db: {
          host: key({ type: z.string() }),
          port: key({ type: z.number() }),
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
              host: key({ type: z.string() }),
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
          url: key({ type: z.string() }),
          timeout: 5000,
        },
      });
      expectTypeOf<InferSchema<typeof s>>().toMatchTypeOf<{
        api: { url: string; timeout: 5000 };
      }>();
    });
  });

  describe("parse() return type", () => {
    it("returns correctly typed config", () => {
      const s = schema({
        host: key({ type: z.string() }),
        port: key({ type: z.number() }),
      });
      type ParseResult = ReturnType<typeof parse<typeof s>>;
      expectTypeOf<ParseResult>().toMatchTypeOf<{ host: string; port: number }>();
    });
  });
});
