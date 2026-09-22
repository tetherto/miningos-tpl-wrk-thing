'use strict'

const lWrkFunLogs = require('./wrk-fun-logs')

const DEFAULT_CRON = '30 0 * * * *'
const DEFAULT_WINDOW_MS = 60 * 60 * 1000
const DEFAULT_CATCHUP_WINDOWS = 48

function isValidSpec (spec) {
  return !!(
    spec && spec.srcKey && spec.destKey &&
    spec.srcKey !== spec.destKey &&
    Array.isArray(spec.fields) && spec.fields.length
  )
}

function getRollupTags () {
  const lLibStats = this.loadLib('stats')
  const skipTagPfxs = lLibStats?.conf?.skipTagPrefixes || []
  const tags = new Set()

  Object.values(this.mem.things).forEach(thg => {
    thg.tags.forEach(tag => {
      if (skipTagPfxs.find(p => tag.startsWith(p))) {
        return
      }

      tags.add(tag)
    })
  })

  return [...tags]
}

async function getLastRollupTs (destKey) {
  for (let offset = 0; offset <= 1; offset++) {
    const log = await lWrkFunLogs.getBeeTimeLog.call(this, destKey, offset)

    if (!log) {
      return null
    }

    let ts = null

    for await (const chunk of log.createReadStream({ reverse: true, limit: 1 })) {
      ts = JSON.parse(chunk.value.toString()).ts
    }

    await lWrkFunLogs.releaseBeeTimeLog.call(this, log)

    if (typeof ts === 'number') {
      return ts
    }
  }

  return null
}

function avgRollupFields (entries, fields) {
  const res = {}

  for (const field of fields) {
    const vals = entries
      .map(entry => entry[field])
      .filter(val => val !== undefined && val !== null)

    if (!vals.length) {
      continue
    }

    if (typeof vals[0] === 'object' && !Array.isArray(vals[0])) {
      res[field] = avgObjectValues(vals)
    } else {
      const avg = avgNumbers(vals)

      if (avg !== null) {
        res[field] = avg
      }
    }
  }

  return res
}

function avgNumbers (vals) {
  const nums = vals.filter(val => Number.isFinite(val))

  if (!nums.length) {
    return null
  }

  return nums.reduce((acc, val) => acc + val, 0) / nums.length
}

function avgObjectValues (vals) {
  const keys = new Set()
  vals.forEach(val => Object.keys(val).forEach(key => keys.add(key)))

  const res = {}

  for (const key of keys) {
    const avg = avgNumbers(vals.map(val => val[key]))

    if (avg !== null) {
      res[key] = avg
    }
  }

  return res
}

async function _buildRollupForTag (spec, tag, now) {
  const windowMs = spec.windowMs || DEFAULT_WINDOW_MS
  const maxWindows = spec.maxCatchUpWindows || DEFAULT_CATCHUP_WINDOWS
  const destKey = `${spec.destKey}-${tag}`

  const windowEnd = Math.floor(now / windowMs) * windowMs
  const lastTs = await getLastRollupTs.call(this, destKey)
  const from = Math.max(
    typeof lastTs === 'number' ? lastTs + windowMs : windowEnd - windowMs,
    windowEnd - maxWindows * windowMs
  )

  if (from >= windowEnd) {
    return
  }

  const srcEntries = await this._getTailLogWithOffset({
    key: spec.srcKey,
    tag,
    start: from,
    end: windowEnd - 1
  }, 0)

  const buckets = new Map()

  for (const entry of srcEntries) {
    if (!entry || typeof entry.ts !== 'number') {
      continue
    }

    if (entry.ts < from || entry.ts >= windowEnd) {
      continue
    }

    const bucketTs = Math.floor(entry.ts / windowMs) * windowMs

    if (!buckets.has(bucketTs)) {
      buckets.set(bucketTs, [])
    }

    buckets.get(bucketTs).push(entry)
  }

  const windows = [...buckets.entries()].sort((a, b) => a[0] - b[0])

  for (const [ts, entries] of windows) {
    const data = {
      ts,
      rollup_count: entries.length,
      rollup_window_ms: windowMs,
      ...avgRollupFields(entries, spec.fields)
    }

    await lWrkFunLogs.saveLogData.call(this, destKey, ts, data, 0, true)
  }
}

async function buildRollup (spec, fireTime) {
  if (this.ctx.slave || !isValidSpec(spec)) {
    return
  }

  const lkr = `_buildingRollup_${spec.destKey}`

  if (this[lkr]) {
    return
  }

  this[lkr] = true

  try {
    const now = fireTime && typeof fireTime.getTime === 'function'
      ? fireTime.getTime()
      : Date.now()

    for (const tag of getRollupTags.call(this)) {
      try {
        await _buildRollupForTag.call(this, spec, tag, now)
      } catch (e) {
        this.debugError(null, e)
      }
    }
  } finally {
    this[lkr] = false
  }
}

module.exports = {
  DEFAULT_CRON,
  isValidSpec,
  buildRollup
}
