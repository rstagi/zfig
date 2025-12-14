export type FileLoader = (path: string) => Record<string, unknown> | undefined;

const loaders: Map<string, FileLoader> = new Map();

export function registerLoader(extension: string, loader: FileLoader): void {
  loaders.set(extension.toLowerCase(), loader);
}

export function getLoader(extension: string): FileLoader | undefined {
  return loaders.get(extension.toLowerCase());
}

export function getSupportedExtensions(): string[] {
  return Array.from(loaders.keys());
}

export function clearLoaders(): void {
  loaders.clear();
}
