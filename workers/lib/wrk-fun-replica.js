'use strict'

const { getLogMaxHeight } = require('./utils')

function calcReplicaKey (logKey, point) {
  const repConf = this.mem.replica_conf
  if (!repConf) {
    return null
  }

  const mdks = repConf.metaDiscoveryKeys

  const rk = `${logKey}-${point}`

  if (!mdks[rk]) {
    return null
  }

  return mdks[rk]
}

async function getReplicaConf (req, lWrkFunLogs) {
  const thingConf = this.conf.thing

  const stream = this.meta_logs.createReadStream({})

  const res = {
    replicaDiscoveryKey: thingConf.replicaDiscoveryKey,
    metaDiscoveryKeys: {}
  }

  const mdks = res.metaDiscoveryKeys

  mdks['main-0'] = this.db.core.key.toString('hex')

  for await (const chunk of stream) {
    const meta = JSON.parse(chunk.value.toString())

    const maxHeight = getLogMaxHeight(thingConf.logKeepCount)

    for (let i = 0; i < maxHeight; i++) {
      const log = await lWrkFunLogs.getBeeTimeLog.call(this, chunk.key, i)

      if (log) {
        const point = meta.cur - i

        if (point >= 0) {
          mdks[`${chunk.key}-${point}`] = log.core.key.toString('hex')
        }
      }
    }
  }

  return res
}

async function refreshReplicaConf () {
  const thingConf = this.conf.thing

  if (!thingConf.replicaRpcPublicKey) {
    return 0
  }

  let repConf = null

  try {
    repConf = await this.net_r0.jRequest(
      thingConf.replicaRpcPublicKey,
      'getReplicaConf',
      {},
      { timeout: 10000 }
    )
  } catch (e) {
    this.debugError(null, e)
    return 0
  }

  this.mem.replica_conf = repConf

  if (repConf.replicaDiscoveryKey) {
    startReplica.call(this, repConf.replicaDiscoveryKey)
  }

  this.status.replica_conf = this.mem.replica_conf
  this.saveStatus()

  return 1
}

async function startReplica (gossipKey) {
  if (this._replicating) {
    return
  }

  this._replicating = true

  await this.net_r0.startSwarm()

  this.net_r0.swarm.join(
    Buffer.from(gossipKey, 'hex'),
    { server: true, client: true }
  )

  this.net_r0.swarm.on('connection', (conn, info) => {
    this.store_s1.store.replicate(conn)
  })
}

module.exports = {
  startReplica,
  refreshReplicaConf,
  getReplicaConf,
  calcReplicaKey
}
