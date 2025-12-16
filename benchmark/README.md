# confts Benchmark

Performance comparison of confts against other Node.js/TypeScript config libraries.

## Libraries Tested

| Library | Description |
|---------|-------------|
| **confts** | Zod-based config with multi-source resolution, source tracking, sensitive field redaction |
| **zod-config** | Zod-based config loader with adapters |
| **convict** | Mozilla's config library with schema validation |
| **envalid** | Environment variable validation |
| **@t3-oss/env-core** | T3 stack env validation with Zod |

## Results

### Env Only (no validation)

Simple environment variable loading without schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| confts | 713.10K | 0.0014 | 1.00x |
| envalid | 419.53K | 0.0024 | 0.59x |
| @t3-oss/env-core | 35.98K | 0.0278 | 0.05x |

### Env + Validation

Environment variables with Zod/schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| zod-config | 3.81M | 0.0003 | 1.00x |
| confts | 766.09K | 0.0013 | 0.20x |
| envalid | 414.65K | 0.0024 | 0.11x |
| convict | 182.89K | 0.0055 | 0.05x |
| @t3-oss/env-core | 35.67K | 0.0280 | 0.01x |

### File-Based Config

JSON file loading with nested schema validation.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| JSON.parse (baseline) | 130.10K | 0.0077 | 1.00x |
| zod-config | 111.31K | 0.0090 | 0.86x |
| confts | 65.39K | 0.0153 | 0.50x |
| convict | 40.32K | 0.0248 | 0.31x |

### Nested Schema + File + Env

Full feature test: nested schema, file loading, and env override.

| Library | ops/sec | mean (ms) | relative |
|---------|---------|-----------|----------|
| zod-config | 105.79K | 0.0095 | 1.00x |
| confts | 74.89K | 0.0134 | 0.71x |
| convict | 34.13K | 0.0293 | 0.32x |

## Analysis

- **confts** is fastest in env-only scenario, beating envalid by 1.7x
- **zod-config** is fastest in validated scenarios but lacks source tracking and sensitive field features
- **confts** provides good performance (0.71x of zod-config in full-feature scenario) while adding:
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
