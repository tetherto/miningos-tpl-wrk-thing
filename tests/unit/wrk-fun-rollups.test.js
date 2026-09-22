'use strict'

const test = require('brittle')
const fs = require('fs')
const StoreFacility = require('@tetherto/hp-svc-facs-store')
const utilsStore = require('@tetherto/hp-svc-facs-store/utils')
const { buildRollup, isValidSpec, DEFAULT_CRON } = require('../../workers/lib/wrk-fun-rollups')
const { getBeeTimeLog, releaseBeeTimeLog, saveLogData } = require('../../workers/lib/wrk-fun-logs')

const storeDir = 'tests/store-rollups'
const HOUR_MS = 60 * 60 * 1000
const FIVE_MIN_MS = 5 * 60 * 1000
const TAG = 'siemens'

let specIndex = 0

test('lib:wrk-fun-rollups', async (main) => {
  const store = new StoreFacility({}, { ns: 's0', storeDir }, { env: 'test' })
  await store.start()
  const db = await store.getBee({ name: 'main' }, { keyEncoding: 'utf-8' })
  await db.ready()

  const thingWorker = {
    ctx: {},
    conf: { thing: {} },
    mem: {
      log_cache: {},
      things: {
        thg1: { id: 'thg1', tags: [TAG, 'id-thg1', 'code-A1'] }
      }
    },
    meta_logs: db.sub('meta_logs_00'),
    store_s1: store,
    loadLib: () => ({ conf: { skipTagPrefixes: ['id-', 'code-'] } }),
    debug: () => {},
    debugError: () => {},
    async _getTailLogWithOffset (req) {
      const log = await getBeeTimeLog.call(this, `${req.key}-${req.tag}`, 0)
      if (!log) throw new Error('ERR_LOG_NOTFOUND')

      const res = []
      const stream = log.createReadStream({
        gte: utilsStore.convIntToBin(req.start),
        lte: utilsStore.convIntToBin(req.end),
        reverse: true
      })
      for await (const chunk of stream) {
        res.push(JSON.parse(chunk.value.toString()))
      }
      await releaseBeeTimeLog.call(this, log)
      return res
    }
  }

  main.teardown(() => {
    fs.rmSync(storeDir, { recursive: true, force: true })
  })

  const makeSpec = (overrides = {}) => ({
    srcKey: `stat-5m-${specIndex}`,
    destKey: `energy-1h-${specIndex++}`,
    fields: ['site_power_w', 'by_meter_power_w'],
    ...overrides
  })

  const seedSrc = async (spec, entries) => {
    for (const entry of entries) {
      await saveLogData.call(thingWorker, `${spec.srcKey}-${TAG}`, entry.ts, entry, 0, true)
    }
  }

  const readDest = async (spec) => {
    const log = await getBeeTimeLog.call(thingWorker, `${spec.destKey}-${TAG}`, 0)
    if (!log) return []

    const res = []
    for await (const chunk of log.createReadStream({})) {
      res.push(JSON.parse(chunk.value.toString()))
    }
    await releaseBeeTimeLog.call(thingWorker, log)
    return res
  }

  const fireAt = (ts) => new Date(ts)

  await main.test('isValidSpec', async (t) => {
    t.ok(isValidSpec({ srcKey: 'stat-5m', destKey: 'energy-1h', fields: ['site_power_w'] }))
    t.absent(isValidSpec(null))
    t.absent(isValidSpec({ srcKey: 'stat-5m', destKey: 'energy-1h', fields: [] }))
    t.absent(isValidSpec({ srcKey: 'stat-5m', destKey: 'stat-5m', fields: ['site_power_w'] }))
    t.absent(isValidSpec({ destKey: 'energy-1h', fields: ['site_power_w'] }))
    t.is(typeof DEFAULT_CRON, 'string')
  })

  await main.test('averages a completed window and skips the running one', async (t) => {
    const spec = makeSpec()
    const h0 = 1780000 * HOUR_MS
    const entries = []
    for (let i = 0; i < 12; i++) {
      entries.push({
        ts: h0 + i * FIVE_MIN_MS,
        site_power_w: 1000 + i * 100,
        by_meter_power_w: { 'qgbt-01': 500 + i * 10, 'qgbt-02': 300 }
      })
    }
    entries.push({ ts: h0 + HOUR_MS, site_power_w: 9999, by_meter_power_w: { 'qgbt-01': 9999 } })
    await seedSrc(spec, entries)

    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))

    const dest = await readDest(spec)
    t.is(dest.length, 1)
    t.is(dest[0].ts, h0)
    t.is(dest[0].rollup_count, 12)
    t.is(dest[0].rollup_window_ms, HOUR_MS)
    t.is(dest[0].site_power_w, 1550)
    t.is(dest[0].by_meter_power_w['qgbt-01'], 555)
    t.is(dest[0].by_meter_power_w['qgbt-02'], 300)
  })

  await main.test('catches up missed windows and does not rewrite older ones', async (t) => {
    const spec = makeSpec()
    const h0 = 1780100 * HOUR_MS

    await seedSrc(spec, [
      { ts: h0, site_power_w: 100 },
      { ts: h0 + FIVE_MIN_MS, site_power_w: 200 }
    ])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))

    let dest = await readDest(spec)
    t.is(dest.length, 1)
    t.is(dest[0].site_power_w, 150)

    await seedSrc(spec, [
      { ts: h0 + HOUR_MS, site_power_w: 300 },
      { ts: h0 + 2 * HOUR_MS, site_power_w: 400 },
      { ts: h0 + 2 * HOUR_MS + FIVE_MIN_MS, site_power_w: 600 }
    ])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + 3 * HOUR_MS + 30000))

    dest = await readDest(spec)
    t.is(dest.length, 3)
    t.is(dest[0].site_power_w, 150)
    t.is(dest[1].ts, h0 + HOUR_MS)
    t.is(dest[1].site_power_w, 300)
    t.is(dest[1].rollup_count, 1)
    t.is(dest[2].ts, h0 + 2 * HOUR_MS)
    t.is(dest[2].site_power_w, 500)
  })

  await main.test('skips windows without source entries', async (t) => {
    const spec = makeSpec()
    const h0 = 1780200 * HOUR_MS

    await seedSrc(spec, [{ ts: h0, site_power_w: 100 }])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))

    await seedSrc(spec, [{ ts: h0 + 2 * HOUR_MS, site_power_w: 300 }])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + 3 * HOUR_MS + 30000))

    const dest = await readDest(spec)
    t.is(dest.length, 2)
    t.is(dest[0].ts, h0)
    t.is(dest[1].ts, h0 + 2 * HOUR_MS)
  })

  await main.test('caps catch-up at maxCatchUpWindows', async (t) => {
    const spec = makeSpec({ maxCatchUpWindows: 2 })
    const h0 = 1780300 * HOUR_MS

    await seedSrc(spec, [{ ts: h0, site_power_w: 100 }])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))

    const entries = []
    for (let i = 1; i <= 5; i++) {
      entries.push({ ts: h0 + i * HOUR_MS, site_power_w: i * 100 })
    }
    await seedSrc(spec, entries)
    await buildRollup.call(thingWorker, spec, fireAt(h0 + 6 * HOUR_MS + 30000))

    const dest = await readDest(spec)
    t.is(dest.length, 3)
    t.is(dest[1].ts, h0 + 4 * HOUR_MS)
    t.is(dest[2].ts, h0 + 5 * HOUR_MS)
  })

  await main.test('starts from the previous window on a fresh dest log', async (t) => {
    const spec = makeSpec()
    const h0 = 1780400 * HOUR_MS

    const entries = []
    for (let i = 0; i < 5; i++) {
      entries.push({ ts: h0 + i * HOUR_MS, site_power_w: 100 })
    }
    await seedSrc(spec, entries)
    await buildRollup.call(thingWorker, spec, fireAt(h0 + 5 * HOUR_MS + 30000))

    const dest = await readDest(spec)
    t.is(dest.length, 1)
    t.is(dest[0].ts, h0 + 4 * HOUR_MS)
  })

  await main.test('averages object fields per key over present values only', async (t) => {
    const spec = makeSpec()
    const h0 = 1780500 * HOUR_MS

    await seedSrc(spec, [
      { ts: h0, site_power_w: 100, by_meter_power_w: { 'qgbt-01': 100, 'ccm-01': 50 } },
      { ts: h0 + FIVE_MIN_MS, site_power_w: null, by_meter_power_w: { 'qgbt-01': 300 } },
      { ts: h0 + 2 * FIVE_MIN_MS, by_meter_power_w: { 'qgbt-01': 200, 'ccm-01': 'n/a' } }
    ])
    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))

    const dest = await readDest(spec)
    t.is(dest.length, 1)
    t.is(dest[0].rollup_count, 3)
    t.is(dest[0].site_power_w, 100)
    t.is(dest[0].by_meter_power_w['qgbt-01'], 200)
    t.is(dest[0].by_meter_power_w['ccm-01'], 50)
  })

  await main.test('no-op for slave workers and invalid specs', async (t) => {
    const spec = makeSpec()
    const h0 = 1780600 * HOUR_MS
    await seedSrc(spec, [{ ts: h0, site_power_w: 100 }])

    thingWorker.ctx.slave = true
    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))
    thingWorker.ctx.slave = false

    t.is((await readDest(spec)).length, 0)

    await buildRollup.call(thingWorker, { ...spec, fields: [] }, fireAt(h0 + HOUR_MS + 30000))
    t.is((await readDest(spec)).length, 0)
  })

  await main.test('survives a missing source log', async (t) => {
    const spec = makeSpec()
    const h0 = 1780700 * HOUR_MS

    await buildRollup.call(thingWorker, spec, fireAt(h0 + HOUR_MS + 30000))
    t.is((await readDest(spec)).length, 0)
  })
})
