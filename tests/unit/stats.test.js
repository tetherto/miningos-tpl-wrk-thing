'use strict'

const test = require('brittle')
const { conf, specs } = require('../../workers/lib/stats')

test('stats: conf export', async t => {
  t.ok(conf)
  t.ok(typeof conf === 'object')
  t.ok(Array.isArray(conf.skipTagPrefixes))
  t.is(conf.skipTagPrefixes.length, 2)
  t.is(conf.skipTagPrefixes[0], 'id-')
  t.is(conf.skipTagPrefixes[1], 'code-')
})

test('stats: specs export', async t => {
  t.ok(specs)
  t.ok(typeof specs === 'object')
  t.ok(specs.default)
  t.ok(typeof specs.default === 'object')
  t.ok(specs.default.ops)
  t.ok(specs.default.ops.alerts_cnt)
  t.is(specs.default.ops.alerts_cnt.op, 'alerts_group_cnt')
  t.is(specs.default.ops.alerts_cnt.src, 'last.alerts')
})
