'use strict'

const fs = require('fs')
const path = require('path')

const OPENRPC_PATH = path.join(__dirname, '../docs/openrpc.json')
const MANIFEST_PATH = path.join(__dirname, '../docs/api-reference/manifest.json')

function main () {
  const spec = JSON.parse(fs.readFileSync(OPENRPC_PATH, 'utf8'))

  const manifest = {
    name: 'thing-worker',
    title: spec.info.title,
    repo: 'tetherto/miningos-tpl-wrk-thing',
    branch: 'main',
    basePath: 'docs/api-reference',
    methods: spec.methods.map(method => {
      const paramRef = method.params?.[0]?.schema?.$ref
      const schemaName = paramRef ? paramRef.split('/').pop() : null
      const schema = schemaName ? spec.components?.schemas?.[schemaName] : null

      return {
        file: `${method.name}.mdx`,
        title: method.name,
        description: schema?.description || method.description || ''
      }
    })
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')

  console.log(`✓ Generated ${MANIFEST_PATH}`)
  console.log(`  ${manifest.methods.length} methods`)
}

main()
