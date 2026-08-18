'use strict'

const WrkRack = require('../../../workers/rack.thing.wrk')

class WrkMinerRackTest extends WrkRack {
  getThingType () {
    return super.getThingType() + '-test'
  }

  async collectThingSnap (thg) {
    return {}
  }

  async connectThing (thg) {
    // Capture the password at construction time, mirroring how the real device
    // controller (Miner -> protocol handler) caches credentials. Exposes it via
    // a controller method so it is reachable through the queryThing RPC path.
    const capturedPassword = thg.opts.password
    thg.ctrl = {
      _password: capturedPassword,
      getConfiguredPassword () { return this._password },
      close () {}
    }
  }

  getSpecTags () {
    return ['miner']
  }

  debug (data) {
    console.log(data)
  }
}

module.exports = WrkMinerRackTest
