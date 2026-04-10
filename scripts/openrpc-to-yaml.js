'use strict'
/**
 * Converts openrpc.json to openrpc.yaml for human review.
 * YAML is easier to read and supports comments during review discussions.
 * Run: npm run openrpc:yaml
 */

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const OPENRPC_PATH = path.join(__dirname, '../docs/openrpc.json')
const YAML_PATH = path.join(__dirname, '../docs/openrpc.yaml')

function main () {
  const spec = JSON.parse(fs.readFileSync(OPENRPC_PATH, 'utf8'))

  const yamlContent = yaml.dump(spec, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false
  })

  fs.writeFileSync(YAML_PATH, yamlContent)

  const methods = spec.methods?.length || 0
  const schemas = Object.keys(spec.components?.schemas || {}).length

  console.log(`✓ Generated ${YAML_PATH}`)
  console.log(`  ${methods} methods, ${schemas} schemas`)
  console.log(`  Review this file for human-readable validation`)
}

main()
