'use strict'

const { getLogMaxHeight } = require('./utils')
const lWrkFunReplica = require('./wrk-fun-replica')
const utilsStore = require('hp-svc-facs-store/utils')

function getLogName (n) {
  return n + '-5'
}

async function initBeeLogMeta (logKey) {
  const meta = { cur: 0 }

  await this.meta_logs.put(
    logKey,
    Buffer.from(JSON.stringify(meta))
  )

  return meta
}

async function rotateBeeLog (logKey) {
  const meta = await getBeeLogMeta.call(this, logKey)

  if (!meta) {
    throw new Error('ERR_BEE_LOG_META_NOTFOUND')
  }

  meta.cur++

  await this.meta_logs.put(
    logKey,
    Buffer.from(JSON.stringify(meta))
  )

  return meta
}

async function getBeeLogMeta (logKey, init = false) {
  let meta = await this.meta_logs.get(logKey)

  if (meta) {
    meta = JSON.parse(meta.value.toString())
  } else if (init) {
    meta = initBeeLogMeta.call(this, logKey)
  }

  return meta
}

async function releaseBeeTimeLog (log) {
  try {
    await log.close()
  } catch (e) {
    this.debugError(log.discoveryKey.toString('hex'), e)
  }
}

async function getBeeTimeLog (
  logKey,
  offset = 0,
  init = false
) {
  const meta = await getBeeLogMeta.call(this, logKey, init)

  if (!meta) {
    return null
  }

  const point = meta.cur - offset

  if (point < 0) {
    return null
  }

  let log = null

  try {
    if (this.ctx.slave) {
      const repKey = lWrkFunReplica.calcReplicaKey.call(this, logKey, point)

      if (!repKey) {
        return null
      }

      log = await this.store_s1.getBee(
        {
          key: Buffer.from(repKey, 'hex')
        },
        { keyEncoding: 'binary' }
      )
    } else {
      log = await getBeeForLogKey.call(this, logKey, point)

      if (offset === 0 && log && (await isLogCorrupted.call(this, log))) {
        // archiving corrupted log. not deleting, to be able to restore
        const updatedMeta = await rotateBeeLog.call(this, logKey)
        if (!updatedMeta) {
          throw new Error('ERR_BEE_ROTATED_LOG_META_NOTFOUND')
        }
        log = await getBeeForLogKey.call(this, logKey, updatedMeta.cur)
      }
    }
    if (!log) {
      return null
    }
  } catch (error) {
    this.debugError('ERR_GET_BEE_TIME_LOG', error)
    return null
  }

  try {
    await log.ready()
  } catch (e) {
    console.error(e)
    log = null
  }

  return log
}

async function getBeeForLogKey (logKey, point) {
  return await this.store_s1.getBee(
    {
      name: `${getLogName(logKey)}-${point}`
    },
    { keyEncoding: 'binary' }
  )
}

async function isLogCorrupted (log) {
  let validated = true
  try {
    // corrupted bee log throws error on read, even if empty
    for await (const entry of log.createReadStream({ limit: 1 })) {
      validated = !!entry
    }
  } catch (e) {
    validated = false
    this.debugError('LOG_CORRUPTED', e)
  }

  return !validated
}

async function rotateLogs () {
  if (this.ctx.slave) {
    return
  }

  const thingConf = this.conf.thing

  if (!thingConf.logRotateMaxLength) {
    return []
  }

  const stream = this.meta_logs.createReadStream({})

  const res = []

  for await (const chunk of stream) {
    const meta = JSON.parse(chunk.value.toString())
    const log = await getBeeTimeLog.call(this, chunk.key, 0)

    if (log) {
      if (log.core.length >= thingConf.logRotateMaxLength) {
        await rotateBeeLog.call(this, chunk.key)
        res.push([chunk.key, meta, log.core.length])
        this.debug(`ROTATE: log-key=${chunk.key},cur=${meta.cur},len=${log.core.length}`)
      }

      await releaseBeeTimeLog.call(this, log)
    }
  }

  return res
}

async function refreshLogsCache () {
  const thingConf = this.conf.thing

  if (!thingConf.logKeepCount) {
    return []
  }

  const stream = this.meta_logs.createReadStream({})
  const mem = this.mem.log_cache

  const ckeys = Object.keys(mem)

  for await (const ck of ckeys) {
    const entry = mem[ck]
    entry.offset = -1
  }

  for await (const chunk of stream) {
    const meta = JSON.parse(chunk.value.toString())

    const maxHeight = getLogMaxHeight(thingConf.logKeepCount)

    for (let i = 0; i < maxHeight; i++) {
      const log = await getBeeTimeLog.call(this, chunk.key, i)

      if (!log) {
        continue
      }

      const dkey = log.core.key.toString('hex')

      if (mem[dkey]) {
        mem[dkey].offset = i
        await releaseBeeTimeLog.call(this, log)
        continue
      }

      this.debug(`REFRESH: log-key=${chunk.key},offset=${i},cur=${meta.cur}, ${dkey}/${log.discoveryKey.toString('hex')}`)
      mem[dkey] = { log, offset: i, desc: chunk.key }
    }
  }

  await _cleanupLogs.call(this, mem)
}

async function _cleanupLogs (mem) {
  for await (const ck of Object.keys(mem)) {
    const entry = mem[ck]

    if (entry.offset < 0) {
      await releaseBeeTimeLog.call(this, entry.log)
      this.debug(`REFRESH[RELEASE]: log-key=${entry.desc},offset=${entry.offset},cache-key=${ck}`)
      delete mem[ck]

      try {
        await this.store_s1.unlink(ck)
        break
      } catch (e) {
        this.debugError(`LOG_NOT_FOUND=${ck}`, e)
      }
    }
  }
}

async function saveLogData (key, ts, data, offset = 0, init = false) {
  const log = await getBeeTimeLog.call(this, key, offset, init)
  if (!log) return

  await log.put(utilsStore.convIntToBin(ts), Buffer.from(JSON.stringify(data)))
  await releaseBeeTimeLog.call(this, log)
}

module.exports = {
  rotateLogs,
  refreshLogsCache,
  getBeeTimeLog,
  releaseBeeTimeLog,
  saveLogData,
  getLogName
}
