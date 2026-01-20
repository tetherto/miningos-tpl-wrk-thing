'use strict'

const test = require('brittle')
const WrkProcVar = require('../../workers/rack.thing.wrk')

test('WrkProcVar: getThingType', async t => {
  // Create a minimal instance for testing
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  // Mock the parent constructor behavior
  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.prefix = 'wrk-thing-rack-test-rack'

  const result = worker.getThingType()
  t.is(result, 'thing')
})

test('WrkProcVar: getThingTags', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf

  const result = worker.getThingTags()
  t.alike(result, [])
})

test('WrkProcVar: selectThingInfo', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf

  const result = worker.selectThingInfo()
  t.alike(result, {})
})

test('WrkProcVar: _getWrkExtData', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf

  const result = worker._getWrkExtData({ test: 'args' })
  t.alike(result, {})
})

test('WrkProcVar: _generateThingId', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf

  const result = worker._generateThingId()
  t.ok(typeof result === 'string')
  t.ok(result.length > 0)
})

test('WrkProcVar: _getMaxThingCode with no things', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = { things: {} }

  const result = worker._getMaxThingCode()
  t.is(result, 0)
})

test('WrkProcVar: _getMaxThingCode with things', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      thing1: { code: 'THING-0001' },
      thing2: { code: 'THING-0005' },
      thing3: { code: 'THING-0003' }
    }
  }

  const result = worker._getMaxThingCode()
  t.is(result, 5)
})

test('WrkProcVar: _generateThingCode', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = { things: {} }

  const result = worker._generateThingCode({})
  t.ok(result.startsWith('THING-'))
  t.ok(result.endsWith('0001'))
})

test('WrkProcVar: _generateThingCode with seed', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = { things: {} }

  const result = worker._generateThingCode({}, 42)
  t.ok(result.startsWith('THING-'))
  t.ok(result.endsWith('0042'))
})

test('WrkProcVar: queryThing - should throw ERR_THING_NOTFOUND when thing does not exist', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = { things: {} }

  try {
    await worker.queryThing({ id: 'non-existent-thing', method: 'testMethod', params: [] })
    t.fail('Should have thrown ERR_THING_NOTFOUND')
  } catch (error) {
    t.is(error.message, 'ERR_THING_NOTFOUND')
  }
})

test('WrkProcVar: queryThing - should throw ERR_THING_NOT_INITIALIZED when ctrl is null', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: null
      }
    }
  }

  try {
    await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [] })
    t.fail('Should have thrown ERR_THING_NOT_INITIALIZED')
  } catch (error) {
    t.is(error.message, 'ERR_THING_NOT_INITIALIZED')
  }
})

test('WrkProcVar: queryThing - should throw ERR_THING_NOT_INITIALIZED when ctrl is undefined', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1'
        // ctrl is undefined
      }
    }
  }

  try {
    await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [] })
    t.fail('Should have thrown ERR_THING_NOT_INITIALIZED')
  } catch (error) {
    t.is(error.message, 'ERR_THING_NOT_INITIALIZED')
  }
})

test('WrkProcVar: queryThing - should throw ERR_THING_METHOD_NOTFOUND when method does not exist', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: {
          existingMethod: async () => 'result'
        }
      }
    }
  }

  try {
    await worker.queryThing({ id: 'thing-1', method: 'nonExistentMethod', params: [] })
    t.fail('Should have thrown ERR_THING_METHOD_NOTFOUND')
  } catch (error) {
    t.is(error.message, 'ERR_THING_METHOD_NOTFOUND')
  }
})

test('WrkProcVar: queryThing - should successfully call method with no params', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: {
          testMethod: async () => {
            return { success: true, data: 'test-result' }
          }
        }
      }
    }
  }

  const result = await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [] })
  t.alike(result, { success: true, data: 'test-result' })
})

test('WrkProcVar: queryThing - should successfully call method with params', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: {
          testMethod: async (param1, param2) => {
            return { param1, param2, sum: param1 + param2 }
          }
        }
      }
    }
  }

  const result = await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [10, 20] })
  t.alike(result, { param1: 10, param2: 20, sum: 30 })
})

test('WrkProcVar: queryThing - should pass ctrl as this context to method', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf

  const mockCtrl = {
    value: 42,
    testMethod: async function () {
      return this.value
    }
  }

  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: mockCtrl
      }
    }
  }

  const result = await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [] })
  t.is(result, 42)
})

test('WrkProcVar: queryThing - should handle method that throws error', async t => {
  const conf = { thing: {} }
  const ctx = { rack: 'test-rack' }

  const worker = Object.create(WrkProcVar.prototype)
  worker.ctx = ctx
  worker.conf = conf
  worker.mem = {
    things: {
      'thing-1': {
        id: 'thing-1',
        ctrl: {
          testMethod: async () => {
            throw new Error('Method execution error')
          }
        }
      }
    }
  }

  try {
    await worker.queryThing({ id: 'thing-1', method: 'testMethod', params: [] })
    t.fail('Should have thrown error from method')
  } catch (error) {
    t.is(error.message, 'Method execution error')
  }
})
