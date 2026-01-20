'use strict'

const test = require('brittle')
const BaseThing = require('../../workers/lib/base')

test('BaseThing: constructor', async t => {
  const thing = new BaseThing('test-type', { lastSeenTimeout: 5000 })

  t.is(thing._type, 'test-type')
  t.is(thing.opts.lastSeenTimeout, 5000)
  t.is(thing.opts.timeout, 10000) // default value
  t.ok(thing.debug)
  t.ok(thing.debugError)
  t.is(thing.lastSnap, null)
})

test('BaseThing: updateLastSeen', async t => {
  const thing = new BaseThing('test-type', {})
  const before = Date.now()

  thing.updateLastSeen()

  t.ok(thing._lastSeen >= before)
  t.ok(thing._lastSeen <= Date.now())
})

test('BaseThing: isThingOnline - online', async t => {
  const thing = new BaseThing('test-type', { lastSeenTimeout: 5000 })

  thing.updateLastSeen()
  t.ok(thing.isThingOnline())
})

test('BaseThing: isThingOnline - offline (never seen)', async t => {
  const thing = new BaseThing('test-type', { lastSeenTimeout: 5000 })

  t.not(thing.isThingOnline())
})

test('BaseThing: isThingOnline - offline (timeout)', async t => {
  const thing = new BaseThing('test-type', { lastSeenTimeout: 100 })

  thing.updateLastSeen()

  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 150))

  t.not(thing.isThingOnline())
})

test('BaseThing: validateWriteAction throws error', async t => {
  const thing = new BaseThing('test-type', {})

  await t.exception(async () => {
    thing.validateWriteAction()
  }, 'ERR_NO_IMPL')
})

test('BaseThing: _prepSnap throws error', async t => {
  const thing = new BaseThing('test-type', {})

  await t.exception(async () => {
    await thing._prepSnap()
  }, 'ERR_NO_IMPL')
})

test('BaseThing: _handleErrorUpdates', async t => {
  const thing = new BaseThing('test-type', {})
  const errors = ['error1', 'error2']

  thing._handleErrorUpdates(errors)

  t.is(thing._errorLog.length, 2)
  t.is(thing._errorLog[0], 'error1')
  t.is(thing._errorLog[1], 'error2')
})

test('BaseThing: _handleErrorUpdates clears previous errors', async t => {
  const thing = new BaseThing('test-type', {})
  const errors1 = ['error1']
  const errors2 = ['error2', 'error3']

  thing._handleErrorUpdates(errors1)
  t.is(thing._errorLog.length, 1)

  thing._handleErrorUpdates(errors2)
  t.is(thing._errorLog.length, 2)
  t.is(thing._errorLog[0], 'error2')
  t.is(thing._errorLog[1], 'error3')
})

test('BaseThing: getRealtimeData returns lastSnap', async t => {
  const thing = new BaseThing('test-type', {})
  const mockSnap = { success: true, stats: {} }

  thing.lastSnap = mockSnap

  const result = await thing.getRealtimeData()
  t.is(result, mockSnap)
})
