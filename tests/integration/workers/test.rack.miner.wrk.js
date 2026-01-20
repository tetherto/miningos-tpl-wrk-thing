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
    thg.ctrl = {}
  }

  getSpecTags () {
    return ['miner']
  }

  debug (data) {
    console.log(data)
  }
}

module.exports = WrkMinerRackTest
