# @zfig/yaml-loader

[![npm version](https://img.shields.io/npm/v/@zfig/yaml-loader.svg)](https://www.npmjs.com/package/@zfig/yaml-loader)

YAML file support for zfig.

## Install

```bash
npm install zfig @zfig/yaml-loader
```

## Usage

Import for side-effects to enable YAML config files:

```typescript
import "@zfig/yaml-loader";
import { resolve } from "zfig";

const config = resolve(configSchema, { configPath: "./config.yaml" });
```

## How It Works

On import, registers loaders for `.yaml` and `.yml` extensions:

```typescript
registerLoader(".yaml", loadYaml);
registerLoader(".yml", loadYaml);
```

After import, `resolve()` automatically handles YAML files.

## API

### `loadYaml(path: string)`

Parses a YAML file and returns its contents.

```typescript
import { loadYaml } from "@zfig/yaml-loader";

const data = loadYaml("./config.yaml");
// { db: { host: "localhost", port: 5432 } }
```

**Returns:**
- `Record<string, unknown>` - parsed YAML content
- `undefined` - if file doesn't exist

**Throws:**
- `ConfigError` - if YAML syntax is invalid

## Examples

### Config file

```yaml
# config.yaml
db:
  host: localhost
  port: 5432

logging:
  level: info
```

### With zfig

```typescript
import "@zfig/yaml-loader";
import { schema, field, resolve } from "zfig";
import { z } from "zod";

const configSchema = schema({
  db: {
    host: field({ type: z.string(), default: "localhost" }),
    port: field({ type: z.number(), default: 5432 }),
  },
  logging: {
    level: field({ type: z.enum(["debug", "info", "warn", "error"]) }),
  },
});

const config = resolve(configSchema, { configPath: "./config.yaml" });
```

### Direct usage

```typescript
import { loadYaml } from "@zfig/yaml-loader";

const data = loadYaml("./config.yml");
if (data) {
  console.log(data.db.host);
}
```

## License

MIT
