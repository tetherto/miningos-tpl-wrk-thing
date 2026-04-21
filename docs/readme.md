# OpenRPC specification generation

This document describes how the OpenRPC specification is generated from the codebase.

## Quick reference

The generated API specification:

- [`openrpc.json`](openrpc.json) - OpenRPC specification

To regenerate after code changes:

```bash
npm run openrpc:generate
npm run openrpc:validate
```

## Overview

The API specification is generated directly from JSDoc annotations in the source code, ensuring documentation stays in sync with the implementation.

```
JSDoc ──► TypeScript ──► JSON Schema ──► OpenRPC
          (tsc)      (ts-json-schema)
```

The generated `openrpc.json` is a standard OpenRPC document that can be consumed by documentation systems to produce user-facing API docs.

## Generation pipeline

### Step 1: JSDoc annotations (source of truth)

Every RPC method has two named typedefs in [`workers/lib/types.js`](../workers/lib/types.js) — one for its request shape and one for its response shape — following the naming convention `<Method>Params` and `<Method>Result`:

```javascript
/**
 * Parameters for registerThing RPC method
 * @typedef {Object} RegisterThingParams
 * @property {string} [id] - Device ID (auto-generated if not provided)
 * @property {ThingOpts} opts - Device connection options (required)
 * @property {ThingInfo} [info] - Device metadata
 */

/**
 * Result for `registerThing` RPC method. Returns 1 on success.
 * @typedef {number} RegisterThingResult
 */
```

`Result` typedefs are almost always thin aliases. Reuse existing entity typedefs (`Thing`, `Rack`, `LogEntry`, `ReplicaConf`, ...) wherever possible:

```javascript
/** @typedef {Rack} GetRackResult */
/** @typedef {Thing[]} ListThingsResult */
/** @typedef {LogEntry[]} TailLogResult */
/** @typedef {HistoricalAlert[] | HistoricalInfoChange[]} GetHistoricalLogsResult */
```

For methods whose response shape is legitimately caller-dependent (`queryThing` dispatches to a controller; `saveWrkSettings` passes through to a facility), use the explicit any escape hatch with a description explaining why:

```javascript
/**
 * Polymorphic: the `method` parameter dispatches to a controller method on
 * the target thing, so the response shape depends entirely on that controller.
 * Intentionally untyped.
 * @typedef {*} QueryThingResult
 */
```

RPC methods are annotated in [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js) with `@param`, `@returns`, and `@throws`:

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

The handler's `@returns` is for IDE / reader consumption; the OpenRPC result schema is generated from the named `<Method>Result` typedef, not the `@returns` tag.

> Steps 2–4 below are what the `npm run openrpc:generate` command runs under the hood. 
> You don't invoke `tsc` or `ts-json-schema-generator` yourself — the generator script does that. 
> The raw commands are shown for reference so you can reason about failures.

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

- Maps each RPC method to BOTH its parameter type (`PARAM_MAP`) and its result type (`RESULT_MAP`)
- Fixes `$ref` paths from JSON Schema format (`#/definitions/`) to OpenRPC format (`#/components/schemas/`)
- Assembles the final [`openrpc.json`](openrpc.json)

The generator **fails hard** (exit 1) if any method is missing a `RESULT_MAP` entry, or if its `<Method>Result` typedef cannot be extracted by `ts-json-schema-generator`. This is intentional: a silent `{}` result schema is worse than a broken build, because consumers downstream (docs site, client generators) cannot tell the difference between "intentionally polymorphic" and "developer forgot to annotate". Use `@typedef {*} <Method>Result` with a description to declare polymorphism explicitly.

Union result typedefs (e.g. `HistoricalAlert[] | HistoricalInfoChange[]`) are emitted as `anyOf` in the resulting schema — semantically valid OpenRPC and handled by standard tooling.

Run the full generation pipeline (steps 2–4) with:

```bash
npm run openrpc:generate
```

This refreshes [`docs/openrpc.json`](openrpc.json) in place. Commit the result alongside the code change that triggered it.

### Step 5: Validation

`@open-rpc/schema-utils-js` validates the generated spec against the OpenRPC meta-schema:

```bash
npm run openrpc:validate
```

This catches structural errors, missing required fields, and schema violations.

## Files

| File | Description |
|------|-------------|
| [`workers/lib/types.js`](../workers/lib/types.js) | JSDoc type definitions (source of truth) |
| [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js) | RPC method implementations with JSDoc |
| [`tsconfig.json`](../tsconfig.json) | TypeScript config for JSDoc support |
| [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js) | Generation pipeline script |
| [`scripts/validate-openrpc.js`](../scripts/validate-openrpc.js) | Validation script |
| [`docs/types/types.d.ts`](types/types.d.ts) | Generated TypeScript declarations |
| [`docs/openrpc.json`](openrpc.json) | Generated OpenRPC specification |

## Tooling

| Tool | Purpose |
|------|---------|
| `typescript` | Converts JSDoc to `.d.ts` declarations |
| `ts-json-schema-generator` | Extracts JSON Schema from TypeScript |
| `@open-rpc/schema-utils-js` | Validates OpenRPC documents |

## Adding or modifying methods

1. In [`workers/lib/types.js`](../workers/lib/types.js), add the request typedef `<Method>Params` (and any nested typedefs it references).
2. In the same file, add the response typedef `<Method>Result`. Prefer aliasing an existing entity typedef (`Thing`, `Rack`, `LogEntry`, ...) over re-declaring the shape. For intentionally polymorphic methods, use `@typedef {*} <Method>Result` and include a description explaining why.
3. In [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js), annotate the handler with `@param` / `@returns` / `@throws` — this is for IDE and human readers; the spec itself is generated from the named typedefs above.
4. Register the method in `RPC_METHODS` in [`workers/lib/constants.js`](../workers/lib/constants.js).
5. Add entries to BOTH `PARAM_MAP` and `RESULT_MAP` in [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js). The generator fails CI if either is missing.
6. Run `npm run openrpc:generate && npm run openrpc:validate` locally.
7. Commit source changes alongside the refreshed [`openrpc.json`](openrpc.json) in the same PR — the drift check in [`.github/workflows/openrpc.yml`](../.github/workflows/openrpc.yml) will otherwise block the merge.
8. Notify the documentation site maintainers that the spec has been updated.

## Why this approach?

- **Single source of truth**: Documentation lives in the code
- **IDE support**: JSDoc provides autocomplete and hover documentation
- **Standard tooling**: Uses TypeScript and established npm packages
- **Enforceable**: CI fails if spec is invalid
- **No manual spec writing**: Types are extracted automatically
- **Portable**: The OpenRPC JSON can be consumed by any documentation system

## CI integration

The GitHub workflow ([`.github/workflows/openrpc.yml`](../.github/workflows/openrpc.yml)) regenerates and validates the spec on PRs to `main`:

1. Run `npm run openrpc:generate`
2. Run `npm run openrpc:validate`
3. Check that `docs/openrpc.json` matches the committed version

The PR fails if validation fails or if the generated spec differs from what's committed.

## Notes

- The workflow for who regenerates and commits the spec after code changes is to be determined
- Consider using union typedefs for error sets (e.g., `ThingOperationErrors`) to reduce repetition in `@throws` annotations
