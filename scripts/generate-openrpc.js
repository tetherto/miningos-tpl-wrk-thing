#!/usr/bin/env node
/**
 * Generates OpenRPC specification from JSDoc annotations in source code.
 * Extracts types via TypeScript, converts to JSON Schema, assembles OpenRPC doc.
 * Run: npm run openrpc:generate
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TYPES_JS = path.join(ROOT, 'workers/lib/types.js')
const TYPES_DIR = path.join(ROOT, 'docs', 'types')
const OUTPUT = path.join(ROOT, 'docs', 'openrpc.json')
const { RPC_METHODS } = require(path.join(ROOT, 'workers/lib/constants'))
const pkg = require(path.join(ROOT, 'package.json'))

const PARAM_MAP = {
  getRack: 'GetRackParams',
  queryThing: 'QueryThingParams',
  listThings: 'ListThingsParams',
  getThingsCount: 'GetThingsCountParams',
  registerThing: 'RegisterThingParams',
  updateThing: 'UpdateThingParams',
  saveThingComment: 'SaveThingCommentParams',
  editThingComment: 'EditThingCommentParams',
  deleteThingComment: 'DeleteThingCommentParams',
  forgetThings: 'ForgetThingsParams',
  applyThings: 'ApplyThingsParams',
  tailLog: 'TailLogParams',
  getHistoricalLogs: 'GetHistoricalLogsParams',
  getReplicaConf: 'GetReplicaConfParams',
  rackReboot: 'RackRebootParams',
  getWrkExtData: 'GetWrkExtDataParams',
  getWrkConf: 'GetWrkConfParams',
  getThingConf: 'GetThingConfParams',
  getWrkSettings: 'GetWrkSettingsParams',
  saveWrkSettings: 'SaveWrkSettingsParams'
}

// Fix $ref paths from JSON Schema format to OpenRPC format
function fixRefs(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(fixRefs)
  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string') {
      result[k] = v.replace('#/definitions/', '#/components/schemas/')
    } else {
      result[k] = fixRefs(v)
    }
  }
  return result
}

console.log('OpenRPC Generator\n')

if (!fs.existsSync(TYPES_DIR)) fs.mkdirSync(TYPES_DIR, { recursive: true })
console.log('-> Generating .d.ts from JSDoc...')
execSync(`npx tsc ${TYPES_JS} --declaration --allowJs --emitDeclarationOnly --outDir ${TYPES_DIR}`, 
  { cwd: ROOT, stdio: 'inherit' })

console.log('-> Extracting schemas...')
const schemas = {}
const methods = RPC_METHODS.map(name => {
  const ptype = PARAM_MAP[name]
  process.stdout.write(`  ${name}...`)
  try {
    const cmd = `npx ts-json-schema-generator -p ${TYPES_DIR}/types.d.ts -t ${ptype} --no-top-ref`
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    const s = JSON.parse(out)
    if (s.definitions) Object.assign(schemas, s.definitions)
    delete s.definitions
    delete s.$schema
    schemas[ptype] = s
    console.log(' ok')
  } catch (e) {
    console.log(' (fallback)')
    schemas[ptype] = { type: 'object' }
  }
  return {
    name,
    params: [{ name: 'req', schema: { $ref: `#/components/schemas/${ptype}` } }],
    result: { name: 'result', schema: {} }
  }
})

// Fix all $ref paths in schemas
const fixedSchemas = fixRefs(schemas)

const doc = {
  openrpc: '1.4.1',
  info: {
    title: 'MiningOS Thing Worker API',
    version: pkg.version,
    description: 'JSON-RPC 2.0 API for managing Things in MiningOS',
    license: { name: pkg.license }
  },
  methods,
  components: { schemas: fixedSchemas }
}

fs.writeFileSync(OUTPUT, JSON.stringify(doc, null, 2))
console.log(`\n✓ Generated ${OUTPUT} (${methods.length} methods, ${Object.keys(schemas).length} schemas)`)
