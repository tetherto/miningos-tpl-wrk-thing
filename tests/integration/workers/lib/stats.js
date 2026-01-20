'use strict'

const libStats = require('../../../../workers/lib/stats')
libStats.specs = {
  miner: {
    ops: {
      ...libStats.specs.default.ops,
      hashrate_mhs_1m_sum: {
        op: 'sum',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_group_sum: {
        op: 'group_sum',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_avg: {
        op: 'avg',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_cnt: {
        op: 'cnt',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_cnt_active: {
        op: 'cnt',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      power_w_sum: {
        op: 'sum',
        src: 'last.snap.stats.power_w'
      },
      power_w_avg: {
        op: 'avg',
        src: 'last.snap.stats.power_w'
      },
      uptime_ms_avg: {
        op: 'avg',
        src: 'last.snap.stats.uptime_ms'
      },
      frequency_mhz_avg: {
        op: 'avg',
        src: 'last.snap.stats.frequency_mhz.avg'
      },
      efficiency_w_ths_avg: {
        op: 'avg',
        src: 'last.snap.stats.efficiency_w_ths'
      },
      temperature_c_avg: {
        op: 'avg',
        src: 'last.snap.stats.temperature_c.avg'
      },
      temperature_c_group_avg: {
        op: 'group_avg',
        src: 'last.snap.stats.temperature_c.avg'
      },
      temperature_c_group_max: {
        op: 'group_max',
        src: 'last.snap.stats.temperature_c.avg'
      },
      hashrate_mhs_1m_type_group_sum: {
        op: 'group_sum',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_type_group_avg: {
        op: 'group_avg',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      efficiency_w_ths_type_group_avg: {
        op: 'group_avg',
        src: 'last.snap.stats.efficiency_w_ths'
      },
      hashrate_mhs_1m_container_group_sum: {
        op: 'group_sum',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      hashrate_mhs_1m_container_group_avg: {
        op: 'group_avg',
        src: 'last.snap.stats.hashrate_mhs.t_5m'
      },
      efficiency_w_ths_container_group_avg: {
        op: 'group_avg',
        src: 'last.snap.stats.efficiency_w_ths'
      },
      nominal_hashrate_mhs_avg: {
        op: 'avg',
        src: 'info.nominalHashrateMhs'
      },
      nominal_efficiency_w_ths_avg: {
        op: 'avg',
        src: 'info.nominalEfficiencyWThs'
      },
      nominal_hashrate_mhs_sum: {
        op: 'sum',
        src: 'info.nominalHashrateMhs'
      },
      nominal_efficiency_w_ths_sum: {
        op: 'sum',
        src: 'info.nominalEfficiencyWThs'
      }
    }
  }
}

module.exports = libStats
