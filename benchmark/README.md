# zfig Benchmark

Performance comparison of zfig against other Node.js/TypeScript config libraries.

## Libraries Tested

| Library | Description |
|---------|-------------|
| **zfig** | Zod-based config with multi-source resolution, source tracking, sensitive field redaction |
| **zod-config** | Zod-based config loader with adapters |
| **convict** | Mozilla's config library with schema validation |
| **envalid** | Environment variable validation |
| **@t3-oss/env-core** | T3 stack env validation with Zod |

## Results

### Env Only (no validation)

Simple environment variable loading without schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| zfig | 703.72K | 0.0014 | 1.00x |
| envalid | 407.68K | 0.0025 | 0.58x |
| @t3-oss/env-core | 35.09K | 0.0285 | 0.05x |

### Env + Validation

Environment variables with Zod/schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| zod-config | 3.76M | 0.0003 | 1.00x |
| zfig | 762.94K | 0.0013 | 0.20x |
| envalid | 417.17K | 0.0024 | 0.11x |
| convict | 179.63K | 0.0056 | 0.05x |
| @t3-oss/env-core | 35.38K | 0.0283 | 0.01x |

### File-Based Config

JSON file loading with nested schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| JSON.parse (baseline) | 129.46K | 0.0077 | 1.00x |
| zod-config | 111.24K | 0.0090 | 0.86x |
| zfig | 65.15K | 0.0153 | 0.50x |
| convict | 40.16K | 0.0249 | 0.31x |

### Nested Schema + File + Env

Full feature test: nested schema, file loading, and env override.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| zod-config | 106.94K | 0.0094 | 1.00x |
| zfig | 74.38K | 0.0134 | 0.70x |
| convict | 34.41K | 0.0291 | 0.32x |

## Analysis

- **zfig** is fastest in env-only scenario, beating envalid by 1.7x
- **zod-config** is fastest in validated scenarios but lacks source tracking and sensitive field features
- **zfig** provides good performance (0.70x of zod-config in full-feature scenario) while adding:
  - Multi-source resolution with priority (override > env > secretFile > file > initial > default)
  - Source tracking (`getSources()`)
  - Sensitive field redaction
  - Diagnostic events
- **convict** is feature-rich but slower due to its validation approach
- **@t3-oss/env-core** is significantly slower due to proxy-based implementation

## Running Benchmarks

```bash
cd benchmark
npm install
npm run bench
```

## Environment

- Node.js v24.12.0
- macOS Darwin 25.0.0
- tinybench v2.9.0
