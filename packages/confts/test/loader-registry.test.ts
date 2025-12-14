import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLoader,
  getLoader,
  getSupportedExtensions,
  clearLoaders,
  type FileLoader,
} from "../src/loader-registry";

describe("loader-registry", () => {
  beforeEach(() => {
    clearLoaders();
  });

  describe("registerLoader", () => {
    it("registers a loader for an extension", () => {
      const mockLoader: FileLoader = () => ({ test: true });
      registerLoader(".yaml", mockLoader);

      expect(getLoader(".yaml")).toBe(mockLoader);
    });

    it("normalizes extension to lowercase", () => {
      const mockLoader: FileLoader = () => ({ test: true });
      registerLoader(".YAML", mockLoader);

      expect(getLoader(".yaml")).toBe(mockLoader);
    });

    it("overwrites existing loader for same extension", () => {
      const loader1: FileLoader = () => ({ v: 1 });
      const loader2: FileLoader = () => ({ v: 2 });

      registerLoader(".yaml", loader1);
      registerLoader(".yaml", loader2);

      expect(getLoader(".yaml")).toBe(loader2);
    });
  });

  describe("getLoader", () => {
    it("returns undefined for unregistered extension", () => {
      expect(getLoader(".unknown")).toBeUndefined();
    });

    it("normalizes extension lookup to lowercase", () => {
      const mockLoader: FileLoader = () => ({ test: true });
      registerLoader(".yaml", mockLoader);

      expect(getLoader(".YAML")).toBe(mockLoader);
    });
  });

  describe("getSupportedExtensions", () => {
    it("returns empty array when no loaders registered", () => {
      expect(getSupportedExtensions()).toEqual([]);
    });

    it("returns all registered extensions", () => {
      const mockLoader: FileLoader = () => ({});
      registerLoader(".yaml", mockLoader);
      registerLoader(".yml", mockLoader);
      registerLoader(".json", mockLoader);

      const extensions = getSupportedExtensions();
      expect(extensions).toHaveLength(3);
      expect(extensions).toContain(".yaml");
      expect(extensions).toContain(".yml");
      expect(extensions).toContain(".json");
    });
  });

  describe("clearLoaders", () => {
    it("removes all registered loaders", () => {
      const mockLoader: FileLoader = () => ({});
      registerLoader(".yaml", mockLoader);
      registerLoader(".json", mockLoader);

      clearLoaders();

      expect(getSupportedExtensions()).toEqual([]);
      expect(getLoader(".yaml")).toBeUndefined();
    });
  });
});
