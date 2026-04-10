# OpenRPC specification generation

This document describes how the OpenRPC specification is generated from the codebase and rendered as HTML documentation.

## Quick reference

Machine-readable API documentation is available in this folder:

- [`openrpc.json`](openrpc.json) - OpenRPC 1.3.2 specification (20 methods, 25 schemas)
- [`openrpc.yaml`](openrpc.yaml) - Human-readable YAML version

To regenerate after code changes:

```bash
npm run openrpc:generate
npm run openrpc:validate
```

## Overview

The API specification is generated directly from JSDoc annotations in the source code, ensuring documentation stays in sync with the implementation.

```
JSDoc ──► TypeScript ──► JSON Schema ──► OpenRPC ──► MDX ──► HTML
          (tsc)      (ts-json-schema)              (markdown-gen)  (Fumadocs)
```

## Generation pipeline

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

#### 5.1 Machine validation

`@open-rpc/schema-utils-js` validates the generated spec against the OpenRPC meta-schema:

```bash
npm run openrpc:validate
```

This catches structural errors, missing required fields, and schema violations.

#### 5.2 Human validation

The JSON spec is converted to YAML for easier human review:

```bash
npm run openrpc:yaml
```

This generates [`docs/openrpc.yaml`](openrpc.yaml) — a single readable file where reviewers can verify:

- Method names and descriptions are accurate
- Parameter types match implementation
- Required vs optional fields are correct
- No sensitive information is exposed

YAML is preferred over JSON for review because it's more compact and supports comments during review discussions.

## Commands

```bash
# Generate the OpenRPC spec
npm run openrpc:generate

# Machine validation (schema compliance)
npm run openrpc:validate

# Human validation (generate YAML for review)
npm run openrpc:yaml

# Generate manifest for Fumadocs integration
npm run openrpc:manifest
```

## Files

| File | Description |
|------|-------------|
| [`workers/lib/types.js`](../workers/lib/types.js) | JSDoc type definitions (source of truth) |
| [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js) | RPC method implementations with JSDoc |
| [`tsconfig.json`](../tsconfig.json) | TypeScript config for JSDoc support |
| [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js) | Generation pipeline script |
| [`scripts/validate-openrpc.js`](../scripts/validate-openrpc.js) | Machine validation script |
| [`scripts/openrpc-to-yaml.js`](../scripts/openrpc-to-yaml.js) | YAML conversion for human review |
| [`scripts/generate-manifest.js`](../scripts/generate-manifest.js) | Manifest generation for Fumadocs |
| [`docs/types/types.d.ts`](types/types.d.ts) | Generated TypeScript declarations |
| [`docs/openrpc.json`](openrpc.json) | Generated OpenRPC specification |
| [`docs/openrpc.yaml`](openrpc.yaml) | Human-readable YAML version |
| [`docs/api-reference/manifest.json`](api-reference/manifest.json) | Manifest for Fumadocs stub generation |

## Tooling

| Tool | Purpose |
|------|---------|
| `typescript` | Converts JSDoc to `.d.ts` declarations |
| `ts-json-schema-generator` | Extracts JSON Schema from TypeScript |
| `@open-rpc/schema-utils-js` | Validates OpenRPC documents |
| `js-yaml` | Converts JSON to YAML for human review |
| `@open-rpc/markdown-generator` | Converts OpenRPC to MDX (via Bun) |

## CI integration

### This repo

The GitHub workflow ([`.github/workflows/openrpc.yml`](../.github/workflows/openrpc.yml)) automatically regenerates the spec on PRs to `main`:

1. Runs `npm run openrpc:generate`
2. Runs `npm run openrpc:validate`
3. Fails PR if spec is invalid

This ensures the OpenRPC spec is always valid before merging.

### Fumadocs sync (TODO)

While this repo validates the spec, the Fumadocs site needs separate automation to stay current:

Possible paths:
- **Scheduled CI job** — Fumadocs runs a cron workflow to regenerate stubs and open a PR if changed
- **Webhook trigger** — This repo notifies Fumadocs when manifest changes (e.g., via GitHub Actions workflow dispatch)

Without this, Fumadocs maintainers must manually run `npm run stubs:generate` after API changes.

## Adding/modifying methods

1. Add JSDoc `@typedef` for parameters in [`workers/lib/types.js`](../workers/lib/types.js)
2. Add JSDoc annotations to the method in [`workers/rack.thing.wrk.js`](../workers/rack.thing.wrk.js)
3. Add the method-to-type mapping in [`scripts/generate-openrpc.js`](../scripts/generate-openrpc.js) (`PARAM_MAP`)
4. Run `npm run openrpc:generate && npm run openrpc:validate`
5. Commit both the source changes and the updated [`openrpc.json`](openrpc.json)

## Why this approach?

- **Single source of truth**: Documentation lives in the code
- **IDE support**: JSDoc provides autocomplete and hover documentation
- **Standard tooling**: Uses TypeScript and established npm packages
- **Enforceable**: CI fails if spec is invalid
- **No manual spec writing**: Types are extracted automatically

## Downstream documentation

After validation, `openrpc.json` is converted to HTML documentation for end users.

### Converting OpenRPC to MDX

The `@open-rpc/markdown-generator` CLI generates static MDX files from the spec. Unlike React-based viewers, it's framework-agnostic and works with modern React versions.

**Prerequisites:** [Bun](https://bun.sh/) runtime

**Generate MDX files:**

```bash
mkdir -p docs/api-reference
bunx @open-rpc/markdown-generator docs/openrpc.json -m docs/api-reference
```

**Output:**

```
docs/api-reference/
├── index.md              # API overview with method links
├── registerThing.mdx     # One file per RPC method
├── updateThing.mdx
└── ... (20 method files)
```

Each method file includes:
- Frontmatter (title, description)
- Parameters with nested object documentation
- Collapsible `<details>` for complex types
- Result schema

**Post-generation fixes:**

```bash
# Fix incorrect paths in index.md
sed -i '' 's|./methods/|./|g' docs/api-reference/index.md

# Remove invalid YAML comments from frontmatter
for f in docs/api-reference/*.md docs/api-reference/*.mdx; do
  sed -i '' 's/^# GENERATED DOCUMENTATION.*$//' "$f"
done
```

### Fumadocs integration

The central Fumadocs site pulls documentation from multiple worker repos using a manifest-driven stub system.

**How it works:**

1. This repo generates [`docs/api-reference/manifest.json`](api-reference/manifest.json) listing all methods
2. Fumadocs fetches the manifest and generates stub MDX files
3. At build time, stubs fetch the actual MDX content from this repo's raw GitHub URLs

**To update docs after adding/changing methods:**

```bash
npm run openrpc:generate    # Regenerate OpenRPC spec
npm run openrpc:manifest    # Regenerate manifest
# Commit and push - Fumadocs will pick up changes on next stub regeneration
```

**Manifest format:**

```json
{
  "name": "thing-worker",
  "title": "MiningOS Thing Worker API",
  "repo": "tetherto/miningos-tpl-wrk-thing",
  "branch": "main",
  "basePath": "docs/api-reference",
  "methods": [
    { "file": "registerThing.mdx", "title": "registerThing", "description": "..." }
  ]
}
```

See the Fumadocs repo README for instructions on adding new worker repos to the documentation site.

**TODO: Automate docs sync**

Currently, Fumadocs maintainers must manually run `npm run stubs:generate` when this repo's manifest changes. To automate:

- **Scheduled CI job** — Fumadocs repo runs a cron workflow to regenerate stubs and open a PR if changed
- **Webhook trigger** — This repo notifies Fumadocs when manifest changes (e.g., via GitHub Actions workflow dispatch)

This ensures documentation stays in sync with API changes without manual intervention.

### Why static MDX instead of React components?

We evaluated React-based OpenRPC viewers but all failed with React 19 (used by Next.js 16 / Fumadocs):

| Package | Issue |
|---------|-------|
| `@open-rpc/docs-react@2.1.1` | Uses `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner` (removed in React 19) |
| `@metamask/open-rpc-docs-react@0.2.0` | Hard dependency on `@docusaurus/router` |
| `@stellar/open-rpc-docs-react@0.2.1` | Same React 19 incompatibility |

The JSX transform is baked into pre-compiled bundles, so these workarounds failed:
- npm overrides / peer dependency flags
- webpack aliases to force React version
- `transpilePackages` in Next.js config
- Dynamic imports with `ssr: false`

Static MDX generation sidesteps React version issues entirely.

### Limitations

- No interactive "try it" functionality (would require JSON-RPC client integration)
- Schema changes require regeneration
- Some styling may need adjustment per theme
