'use strict'

const test = require('brittle')
const { getSettings, saveSettingsEntries } = require('../../workers/lib/wrk-fun-settings')

test('wrk-fun-settings: getSettings with no settings', async t => {
  const mockWorker = {
    settings: {
      get: async () => null
    }
  }

  const result = await getSettings.call(mockWorker)
  t.alike(result, {})
})

test('wrk-fun-settings: getSettings with existing settings', async t => {
  const mockSettings = { key1: 'value1', key2: 'value2' }
  const mockWorker = {
    settings: {
      get: async () => ({
        value: JSON.stringify(mockSettings)
      })
    }
  }

  const result = await getSettings.call(mockWorker)
  t.alike(result, mockSettings)
})

test('wrk-fun-settings: saveSettingsEntries with valid entries', async t => {
  const existingSettings = { key1: 'value1' }
  const newEntries = { key2: 'value2', key3: 'value3' }
  const expectedSettings = { ...existingSettings, ...newEntries }

  const mockWorker = {
    settings: {
      get: async () => ({
        value: JSON.stringify(existingSettings)
      }),
      put: async () => {}
    }
  }

  const result = await saveSettingsEntries.call(mockWorker, newEntries)
  t.alike(result, expectedSettings)
})

test('wrk-fun-settings: saveSettingsEntries with no existing settings', async t => {
  const newEntries = { key1: 'value1', key2: 'value2' }

  const mockWorker = {
    settings: {
      get: async () => null,
      put: async () => {}
    }
  }

  const result = await saveSettingsEntries.call(mockWorker, newEntries)
  t.alike(result, newEntries)
})

test('wrk-fun-settings: saveSettingsEntries with invalid entries - null', async t => {
  const mockWorker = {
    settings: {}
  }

  await t.exception(async () => {
    await saveSettingsEntries.call(mockWorker, null)
  }, 'ERR_ENTRIES_INVALID')
})

test('wrk-fun-settings: saveSettingsEntries with invalid entries - undefined', async t => {
  const mockWorker = {
    settings: {}
  }

  await t.exception(async () => {
    await saveSettingsEntries.call(mockWorker, undefined)
  }, 'ERR_ENTRIES_INVALID')
})

test('wrk-fun-settings: saveSettingsEntries with invalid entries - string', async t => {
  const mockWorker = {
    settings: {}
  }

  await t.exception(async () => {
    await saveSettingsEntries.call(mockWorker, 'invalid')
  }, 'ERR_ENTRIES_INVALID')
})

test('wrk-fun-settings: saveSettingsEntries with invalid entries - number', async t => {
  const mockWorker = {
    settings: {}
  }

  await t.exception(async () => {
    await saveSettingsEntries.call(mockWorker, 123)
  }, 'ERR_ENTRIES_INVALID')
})
