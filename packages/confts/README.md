# confts

[![npm version](https://img.shields.io/npm/v/confts.svg)](https://www.npmjs.com/package/confts)

Dev-friendly TypeScript config library wrapping Zod with multi-source value resolution.

## Install

```bash
npm install confts zod
```

## Schema & Field

### `schema(definition)`

Creates a type-safe config schema from a definition object.

```typescript
import { schema, field } from "confts";
import { z } from "zod";

const config = schema({
  appName: "my-app",                    // literal value
  port: field({ type: z.number() }),    // field config
  db: {                                 // nested object
    host: field({ type: z.string() }),
  },
});
```

Definition values can be:
- **Literals** - strings, numbers, booleans (become `z.literal()`)
- **Field configs** - created with `field()`
- **Nested objects** - recursively processed
- **Raw Zod types** - passed through directly

### `field(config)`

Marks a config field with resolution metadata.

```typescript
field({
  type: z.string(),           // required - Zod type validator
  env: "DB_HOST",             // env var name
  secretFile: "db-password",  // path to secret file
  sensitive: true,            // redact in logs/errors
  default: "localhost",       // fallback value
  doc: "Database hostname",   // description (becomes .describe())
})
```

## Field Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | `ZodType` | **Required.** Zod schema for validation |
| `env` | `string` | Environment variable name |
| `secretFile` | `string` | Path to file containing secret value |
| `sensitive` | `boolean` | Redact value in toString/errors/debug |
| `default` | `unknown` | Default value if no source provides one |
| `doc` | `string` | Documentation (converted to Zod `.describe()`) |

## Literals & Nesting

**Literals** become `z.literal()` types:

```typescript
schema({
  version: "1.0",     // z.literal("1.0")
  port: 3000,         // z.literal(3000)
  debug: true,        // z.literal(true)
});
```

**Nesting** supports arbitrary depth:

```typescript
schema({
  db: {
    primary: {
      host: field({ type: z.string() }),
      port: field({ type: z.number() }),
    },
    replica: {
      host: field({ type: z.string() }),
    },
  },
});
```

## Composable Schemas

Schemas can be nested inside other schemas. Metadata is preserved.

```typescript
const dbSchema = schema({
  host: field({ type: z.string(), env: "DB_HOST" }),
  port: field({ type: z.number(), default: 5432 }),
});

const appSchema = schema({
  db: dbSchema,
  name: field({ type: z.string() }),
});

// dbSchema metadata accessible via appSchema.shape.db.shape.host.meta()
```

## Config Files

### Using `resolve()`

```typescript
import { resolve } from "confts";

const config = resolve(configSchema, {
  configPath: "./config.json",
});
```

### CONFIG_PATH Environment Variable

If `configPath` not provided, `resolve()` reads from `CONFIG_PATH` env var:

```bash
CONFIG_PATH=./config.json node app.js
```

### JSON Support

JSON is supported by default:

```json
{
  "db": {
    "host": "localhost",
    "port": 5432
  }
}
```

### YAML Support

Install `@confts/yaml-loader` for YAML support:

```bash
npm install @confts/yaml-loader
```

```typescript
import "@confts/yaml-loader"; // side-effect import registers loader
import { resolve } from "confts";

const config = resolve(configSchema, { configPath: "./config.yaml" });
```

## Type Coercion

Use `z.coerce.*` for automatic type conversion from env vars:

```typescript
schema({
  port: field({ type: z.coerce.number(), env: "PORT" }),      // "8080" → 8080
  debug: field({ type: z.coerce.boolean(), env: "DEBUG" }),   // "true" → true
});
```

## Debugging

### Source Tracking

```typescript
import { resolve, getSources } from "confts";

const config = resolve(configSchema);

// Get source for each value
getSources(config);
// { "db.host": "env:DB_HOST", "db.port": "default", "appName": "literal" }

// As JSON string
config.toSourceString();
// '{"db.host":"env:DB_HOST","db.port":"default"}'
```

### Debug Object

```typescript
config.toDebugObject();
// {
//   config: {
//     "db": {
//        "host": { value: "localhost", source: "env:DB_HOST" },
//        "port": { value: 5432, source: "default" }
//     }
//   }
// }

config.toDebugObject({ includeDiagnostics: true });
// includes diagnostics array with resolution events, see below
```

### Diagnostics

```typescript
import { getDiagnostics } from "confts";

getDiagnostics(config);
// [
//   { type: "configPath", path: "./config.json", reason: "provided in options" },
//   { type: "loader", extension: ".json" },
//   { type: "sourceDecision", key: "db.host", source: "env:DB_HOST", tried: [...] }
// ]
```

Diagnostic event types:
- `configPath` - which config file was selected and why
- `loader` - which file format loader was used
- `sourceDecision` - which source provided each value
- `note` - additional info messages

## Sensitive Values

Mark fields as sensitive to prevent accidental exposure:

```typescript
schema({
  apiKey: field({
    type: z.string(),
    env: "API_KEY",
    sensitive: true,
  }),
});

const config = resolve(configSchema);

config.toString();
// '{"apiKey":"[REDACTED]"}'

config.toDebugObject();
// { config: { apiKey: { value: "[REDACTED]", source: "env:API_KEY" } } }
```

Sensitive values are redacted in:
- `toString()` output
- `toDebugObject()` output
- Error messages

## Loader Registry

Register custom loaders for different file formats:

```typescript
import { registerLoader, getLoader, getSupportedExtensions, clearLoaders } from "confts";

// Register a loader
registerLoader(".toml", (path) => {
  const content = fs.readFileSync(path, "utf-8");
  return toml.parse(content);
});

// Get loader for extension
const loader = getLoader(".toml");

// List supported extensions
getSupportedExtensions(); // [".json", ".toml"]

// Clear all loaders
clearLoaders();
```

Loader signature:
```typescript
type FileLoader = (path: string) => Record<string, unknown> | undefined;
```

Return `undefined` if file doesn't exist. Throw on parse errors.

## Error Handling

`ConfigError` is thrown when resolution fails:

```typescript
import { ConfigError } from "confts";

try {
  const config = resolve(configSchema);
} catch (e) {
  if (e instanceof ConfigError) {
    console.log(e.message);   // error description
    console.log(e.path);      // "db.host" (dot-notation path)
    console.log(e.sensitive); // true if value should be redacted
  }
}
```

Thrown when:
- Required field has no value from any source
- Zod validation fails
- Config file has invalid JSON/YAML
- File extension has no registered loader

## Troubleshooting

### Missing required config

```
ConfigError: Missing required config value at path "db.password"
```

Provide value via env var, secret file, config file, or default.

### Type validation failed

```
ConfigError: Validation failed at path "port": Expected number, received string
```

Use `z.coerce.number()` for env vars that need type conversion.

### Unsupported file extension

```
ConfigError: No loader registered for extension ".yaml"
```

Install and import `@confts/yaml-loader` for YAML support.

### Config file not found

Check `configPath` option or `CONFIG_PATH` env var. JSON loader returns `undefined` for missing files (no error).

### Secrets not loading

- Check `secretFile` path is correct
- Default secrets base path is `/secrets`
- Use `secretsPath` option in resolve to change base path

## Advanced Usage

All Zod features work in field types - `.coerce`, `.nonempty()`, `.min()`, `.transform()`, etc. Validation is fully delegated to Zod, so you can use any schema features. The only exception is `.meta()` which confts uses internally for field metadata and will be overridden.

```typescript
schema({
  port: field({ type: z.coerce.number().min(1).max(65535), env: "PORT" }),
  tags: field({ type: z.array(z.string()).nonempty(), default: ["default"] }),
  email: field({ type: z.string().email(), env: "ADMIN_EMAIL" }),
});
```

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `schema(definition)` | Create config schema |
| `field(config)` | Create field with metadata |
| `resolve(schema, options?)` | Resolve values with file loading |
| `resolveValues(schema, options?)` | Resolve values without file loading |
| `getSources(config)` | Get source map from resolved config |
| `getDiagnostics(config)` | Get diagnostic events from resolved config |

### Loader Registry

| Function | Description |
|----------|-------------|
| `registerLoader(ext, loader)` | Register file loader for extension |
| `getLoader(ext)` | Get loader for extension |
| `getSupportedExtensions()` | List registered extensions |
| `clearLoaders()` | Remove all loaders |

### Error Class

| Class | Description |
|-------|-------------|
| `ConfigError` | Error with `path` and `sensitive` properties |

### Resolve Options

```typescript
resolve(schema, {
  configPath?: string,           // path to config file
  env?: Record<string, string>,  // env vars (default: process.env)
  secretsPath?: string,          // base path for secrets (default: "/secrets")
  initialValues?: object,        // base values
  override?: object,             // override all sources
});
```

## Performance

confts is designed for startup-time config loading where correctness and debuggability matter more than raw speed. That said, it performs well:

| Scenario | confts | vs zod-config | vs convict | vs @t3-oss/env-core |
|----------|--------|---------------|------------|---------------------|
| Env only | 704K ops/sec | - | - | **20x faster** |
| Env + validation | 763K ops/sec | 0.20x | **4.2x faster** | **22x faster** |
| File + nested | 74K ops/sec | 0.70x | **2.2x faster** | - |

Key points:
- **Fastest** for simple env-only loading (1.7x faster than envalid)
- Multi-source resolution adds overhead vs single-source libs
- 74K ops/sec = ~13μs per resolve - plenty fast for startup config

See [benchmark/](../../benchmark/) for full comparison.

## License

MIT
