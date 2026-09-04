'use strict'

const test = require('brittle')
const proxyquire = require('proxyquire')
const { aggrStats, buildStats, statKeyOps } = require('../../workers/lib/wrk-fun-stats')

test('wrk-fun-stats: aggrStats with no things', async t => {
  const mockWorker = {
    loadLib: () => ({ specs: {} }),
    getSpecTags: () => [],
    mem: { things: {} }
  }

  const result = aggrStats.call(mockWorker, [])
  t.alike(result, {})
})

test('wrk-fun-stats: aggrStats with things but no specs', async t => {
  const mockWorker = {
    loadLib: () => ({ specs: {} }),
    getSpecTags: () => ['miner'],
    mem: { things: {} }
  }

  const result = aggrStats.call(mockWorker, ['thing1', 'thing2'])
  t.alike(result, {})
})

test('wrk-fun-stats: aggrStats with valid specs and things', async t => {
  const mockWorker = {
    loadLib: () => ({
      specs: {
        miner: {
          ops: {
            test_op: {
              op: 'test_operation',
              src: 'last.stats'
            }
          }
        }
      }
    }),
    getSpecTags: () => ['miner'],
    mem: {
      things: {
        thing1: {
          id: 'thing1',
          last: { stats: { test: 'value1' } },
          info: {},
          tags: ['t-miner'],
          opts: {},
          type: 'miner'
        },
        thing2: {
          id: 'thing2',
          last: { stats: { test: 'value2' } },
          info: {},
          tags: ['t-miner'],
          opts: {},
          type: 'miner'
        }
      }
    }
  }

  // Mock gLibStats.applyStats and tallyStats
  const originalApplyStats = require('@tetherto/miningos-lib-stats').applyStats
  const originalTallyStats = require('@tetherto/miningos-lib-stats').tallyStats

  require('@tetherto/miningos-lib-stats').applyStats = (state, acc, data, meta) => {
    acc.test = (acc.test || 0) + 1
  }
  require('@tetherto/miningos-lib-stats').tallyStats = (state, acc) => {
    acc.tally = true
  }

  const result = aggrStats.call(mockWorker, ['thing1', 'thing2'])

  t.ok(result.test)
  t.is(result.test, 2)
  t.ok(result.tally)

  // Restore original functions
  require('@tetherto/miningos-lib-stats').applyStats = originalApplyStats
  require('@tetherto/miningos-lib-stats').tallyStats = originalTallyStats
})

test('wrk-fun-stats: aggrStats with things parameter', async t => {
  const mockWorker = {
    loadLib: () => ({ specs: {} }),
    getSpecTags: () => [],
    mem: { things: {} }
  }

  const things = {
    thing1: { id: 'thing1', last: {}, info: {}, tags: [], opts: {}, type: 'miner' }
  }

  const result = aggrStats.call(mockWorker, ['thing1'], {}, things)
  t.alike(result, {})
})

test('wrk-fun-stats: buildStats skips on slave', async t => {
  const w = { ctx: { slave: true } }
  await buildStats.call(w, 'logk', new Date())
  t.pass()
})

test('wrk-fun-stats: buildStats skips when stats lib missing', async t => {
  const w = { ctx: {}, loadLib: (name) => (name === 'stats' ? null : {}) }
  await buildStats.call(w, 'logk', new Date())
  t.pass()
})

test('wrk-fun-stats: buildStats skips when already building', async t => {
  const w = {
    ctx: {},
    loadLib: () => ({ specs: {}, conf: {} }),
    mem: { things: {} },
    _buildingStats_logk: true
  }
  await buildStats.call(w, 'logk', new Date())
  t.pass()
})

test('wrk-fun-stats: _buildStats skips tags with skipTagPrefixes', async t => {
  const fireTime = new Date('2025-06-01T12:00:00.000Z')
  const w = {
    ctx: {},
    loadLib: (name) =>
      name === 'stats'
        ? { specs: {}, conf: { skipTagPrefixes: ['t-'] } }
        : {},
    mem: {
      things: {
        th1: { id: 'th1', tags: ['t-miner'] }
      }
    }
  }
  await buildStats.call(w, 'agg', fireTime)
  t.pass()
})

test('wrk-fun-stats: _buildStats debugError when log put fails', async t => {
  const buildStatsStub = proxyquire('../../workers/lib/wrk-fun-stats', {
    './wrk-fun-logs': {
      getBeeTimeLog: async () => ({
        put: async () => {
          throw new Error('put-fail')
        }
      }),
      releaseBeeTimeLog: async () => {}
    }
  }).buildStats

  let saw = null
  const fireTime = new Date('2025-06-01T12:00:00.000Z')
  const w = {
    ctx: {},
    loadLib: (name) =>
      name === 'stats' ? { specs: {}, conf: {} } : {},
    getSpecTags: () => [],
    mem: {
      things: {
        th1: { id: 'th1', tags: ['miner-tag'] }
      }
    },
    debugError: (_ctx, err) => {
      saw = err
    }
  }

  await buildStatsStub.call(w, 'stat', fireTime)
  t.ok(saw)
  t.is(saw.message, 'put-fail')
})

test('wrk-fun-stats: statKeyOps keeps unscoped ops and drops ops of other stat keys', async t => {
  const ops = {
    hashrate_sum: { op: 'sum', src: 'last.snap.stats.hashrate_mhs' },
    temperature_c_group: { op: 'group', src: 'last.snap.stats.temperature_c', statKeys: ['stat-1D'] }
  }

  t.alike(Object.keys(statKeyOps(ops, undefined)), ['hashrate_sum', 'temperature_c_group'])
  t.alike(Object.keys(statKeyOps(ops, 'stat-1D')), ['hashrate_sum', 'temperature_c_group'])
  t.alike(Object.keys(statKeyOps(ops, 'stat-5m')), ['hashrate_sum'])
})

test('wrk-fun-stats: aggrStats skips ops that do not belong to the stat key', async t => {
  const mockWorker = {
    loadLib: () => ({
      specs: {
        miner: {
          ops: {
            always: { op: 'cnt' },
            daily: { op: 'cnt', statKeys: ['stat-1D'] }
          }
        }
      }
    }),
    getSpecTags: () => ['miner'],
    mem: { things: { thing1: { id: 'thing1', last: {}, info: {}, tags: ['t-miner'], opts: {}, type: 'miner' } } }
  }

  t.alike(Object.keys(aggrStats.call(mockWorker, ['thing1'], { logKey: 'stat-5m' })), ['always'])
  t.alike(Object.keys(aggrStats.call(mockWorker, ['thing1'], { logKey: 'stat-1D' })), ['always', 'daily'])
})
