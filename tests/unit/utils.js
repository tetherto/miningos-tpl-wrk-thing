'use strict'

const test = require('brittle')

const {
  getLogsCountForTimeRange,
  getJsonChanges
} = require('../../workers/lib/utils')

const DEFAULT_TIMEFRAMES = [
  ['1m', '0 */1 * * * *'],
  ['5m', '0 */5 * * * *'],
  ['30m', '0 */30 * * * *'],
  ['3h', '0 0 */3 * * *'],
  ['1D', '0 0 0 * * *']
]

test('getLogsCountForTimeRange: handles no date range', async t => {
  const result = getLogsCountForTimeRange(
    undefined,
    undefined,
    'stat-5m',
    DEFAULT_TIMEFRAMES
  )
  t.ok(Number.isFinite(result))
})

test('getLogsCountForTimeRange: handles no end date range', async t => {
  const start = Date.now() - 10 * 5 * 60 * 1000
  const result = getLogsCountForTimeRange(
    start,
    undefined,
    'stat-5m',
    DEFAULT_TIMEFRAMES
  )
  t.ok(result === 10)
  t.ok(Number.isFinite(result))
})

test('getLogsCountForTimeRange: valid key with time range', async t => {
  const start = Date.now() - 10 * 5 * 60 * 1000
  const end = Date.now()
  const result1 = getLogsCountForTimeRange(
    start,
    end,
    'stat-5m',
    DEFAULT_TIMEFRAMES
  )
  const result2 = getLogsCountForTimeRange(
    start,
    end,
    'stat-1m',
    DEFAULT_TIMEFRAMES
  )
  t.ok(result1 === 10)
  t.ok(result2 === 50)
})

test('getLogsCountForTimeRange: no logs for invalid key', async t => {
  const result = getLogsCountForTimeRange(
    Date.now() - 1000,
    Date.now(),
    'invalid-key',
    DEFAULT_TIMEFRAMES
  )
  t.is(result, 0)
})

test('getJsonChanges', async main => {
  main.test('Should detect changes in primitive values', t => {
    const previousJson = { name: 'John', age: 30 }
    const currentJson = { name: 'Jane', age: 30 }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        name: { oldValue: 'John', newValue: 'Jane' }
      })
    )
  })

  main.test('Should detect changes in nested objects', t => {
    const previousJson = { person: { name: 'John', age: 30 } }
    const currentJson = { person: { name: 'John', age: 31 } }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        'person.age': { oldValue: 30, newValue: 31 }
      })
    )
  })

  main.test('Should detect additions and deletions in arrays', t => {
    const previousJson = { tags: ['a', 'b'] }
    const currentJson = { tags: ['a', 'c'] }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        tags: { additions: ['c'], deletions: ['b'] }
      })
    )
  })

  main.test('Should detect no changes when objects are identical', t => {
    const previousJson = { name: 'John', age: 30 }
    const currentJson = { name: 'John', age: 30 }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(JSON.stringify(changes), JSON.stringify({}))
  })

  main.test('Should handle new keys being added', t => {
    const previousJson = { name: 'John' }
    const currentJson = { name: 'John', age: 30 }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        age: { oldValue: undefined, newValue: 30 }
      })
    )
  })

  main.test('Should handle keys being removed', t => {
    const previousJson = { name: 'John', age: 30 }
    const currentJson = { name: 'John' }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        age: { oldValue: 30, newValue: undefined }
      })
    )
  })

  main.test('Should handle nested arrays and objects', t => {
    const previousJson = {
      name: 'John',
      details: { hobbies: ['reading', 'swimming'] }
    }
    const currentJson = {
      name: 'John',
      details: { hobbies: ['reading', 'running'] }
    }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        'details.hobbies': {
          additions: ['running'],
          deletions: ['swimming']
        }
      })
    )
  })

  main.test('Should handle empty objects and arrays', t => {
    const previousJson = { list: [], config: {} }
    const currentJson = { list: ['item'], config: { key: 'value' } }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        list: { additions: ['item'], deletions: [] },
        'config.key': { oldValue: undefined, newValue: 'value' }
      })
    )
  })

  main.test('Should handle null and undefined values', t => {
    const previousJson = { name: 'John', age: null }
    const currentJson = { name: 'John', age: undefined }

    const changes = getJsonChanges(previousJson, currentJson)
    t.is(
      JSON.stringify(changes),
      JSON.stringify({
        age: { oldValue: null, newValue: undefined }
      })
    )
  })
})
