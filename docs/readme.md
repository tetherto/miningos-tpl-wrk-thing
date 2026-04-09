# OpenRPC specification generation

This document describes how the OpenRPC specification is generated from the codebase.

## Overview

The API specification is generated directly from JSDoc annotations in the source code, ensuring the documentation stays in sync with the implementation.

```
JSDoc in JS ──► TypeScript ──► JSON Schema ──► OpenRPC
                 (tsc)      (ts-json-schema-generator)
```

## Pipeline

### Step 1: JSDoc annotations (source of truth)

Type definitions are written as JSDoc `@typedef` in [`workers/lib/types.js`](../workers/lib/types.js):

```javascript
/**
 * Parameters for registerThing RPC method
 * @typedef {Object} RegisterThingParams
 * @property {string} [id] - Device ID (auto-generated if not provided)
 * @property {ThingOpts} opts - Device connection options (required)
 * @property {ThingInfo} [info] - Device metadata
 */
```

RPC methods are annotated in [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js):

```javascript
/**
 * Creates a new thing (device) in the system.
 * @param {Object} req - Request parameters
 * @param {string} [req.id] - Device ID
 * @param {Object} req.opts - Device connection options (required)
 * @returns {Promise<number>} Returns 1 on success
 * @throws {Error} ERR_SLAVE_BLOCK - Operation blocked on slave nodes
 */
async registerThing(req) { ... }
```

### Step 2: TypeScript declaration generation

The TypeScript compiler converts JSDoc to `.d.ts` files:

```bash
tsc workers/lib/types.js --declaration --allowJs --emitDeclarationOnly --outDir docs/types
```

This produces [`docs/types/types.d.ts`](types/types.d.ts) with TypeScript interfaces.

### Step 3: JSON schema extraction

`ts-json-schema-generator` extracts JSON Schema from the TypeScript declarations:

```bash
ts-json-schema-generator -p types/types.d.ts -t RegisterThingParams --no-top-ref
```

This produces JSON Schema with full type information, descriptions, and required fields.

### Step 4: OpenRPC assembly

The generator script ([`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js)) combines all schemas into a valid OpenRPC document:

- Maps each RPC method to its parameter type
- Fixes `$ref` paths from JSON Schema format (`#/definitions/`) to OpenRPC format (`#/components/schemas/`)
- Assembles the final [`openrpc.json`](openrpc.json)

### Step 5: Validation

`@open-rpc/schema-utils-js` validates the generated spec against the OpenRPC meta-schema.

## Tooling

| Tool | Purpose |
|------|---------|
| `typescript` | Converts JSDoc to `.d.ts` declarations |
| `ts-json-schema-generator` | Extracts JSON Schema from TypeScript |
| `@open-rpc/schema-utils-js` | Validates OpenRPC documents |

## Commands

```bash
# Generate the OpenRPC spec
npm run openrpc:generate

# Validate the spec
npm run openrpc:validate
```

## Files

| File | Description |
|------|-------------|
| [`workers/lib/types.js`](../workers/lib/types.js) | JSDoc type definitions (source of truth) |
| [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js) | RPC method implementations with JSDoc |
| [`jsconfig.json`](../jsconfig.json) | TypeScript config for JSDoc support |
| [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js) | Generation pipeline script |
| [`scripts/validate-openrpc.js`](../scripts/validate-openrpc.js) | Validation script |
| [`docs/types/types.d.ts`](types/types.d.ts) | Generated TypeScript declarations |
| [`docs/openrpc.json`](openrpc.json) | Generated OpenRPC specification |

## CI integration

The GitHub workflow ([`.github/workflows/openrpc.yml`](../.github/workflows/openrpc.yml)) automatically regenerates the spec on every push to `main`:

1. Runs `npm run openrpc:generate`
2. Runs `npm run openrpc:validate`
3. Commits and pushes updated spec if changed

This means developers don't need to manually run the generator—just update the JSDoc and merge to `main`.

## Adding/modifying methods

1. Add JSDoc `@typedef` for parameters in [`workers/lib/types.js`](../workers/lib/types.js)
2. Add JSDoc annotations to the method in [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js)
3. Add the method-to-type mapping in [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js) (`PARAM_MAP`)
4. Merge to `main`—CI will regenerate and commit [`openrpc.json`](openrpc.json) automatically

## Why this approach?

- **Single source of truth**: Documentation lives in the code
- **IDE support**: JSDoc provides autocomplete and hover documentation
- **Standard tooling**: Uses TypeScript and established npm packages
- **Enforceable**: CI fails if spec is out of date
- **No manual spec writing**: Types are extracted automatically
