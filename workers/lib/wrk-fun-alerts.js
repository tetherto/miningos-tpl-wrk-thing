'use strict'

const { v4: uuidv4 } = require('uuid')

const createAlert = ({
  name,
  code,
  description,
  severity,
  createdAt,
  uuid = uuidv4(),
  message = undefined
}) => {
  return {
    name,
    code,
    description,
    severity,
    createdAt,
    uuid,
    message
  }
}

const updateExistingAlerts = (alerts, alertsPrev) => {
  if (!Array.isArray(alertsPrev)) return
  alerts.forEach(alert => {
    const alertExists = alertsPrev.find(val => val.name === alert.name && val.description === alert.description && val.message === alert.message)
    alert.createdAt = alertExists?.createdAt ?? alert.createdAt
    alert.uuid = alertExists?.uuid ?? alert.uuid
  })
}

const getErrorsFromSnap = (snap) => {
  if (!snap) return null

  // raw_errors is coming from
  // this._errorLog.push(...errors)
  // _handleErrorUpdates
  if (!snap.raw_errors) return null
  return snap.raw_errors
}

function processThingAlerts (thg) {
  const lLibAlerts = this.loadLib('alerts')

  if (!lLibAlerts) {
    return null
  }

  let alertsFromConfig = this.conf.thing.alerts
  const baseType = thg.type.split('-')[0]
  const thingConf = this.conf.thing[baseType]

  if (!alertsFromConfig) {
    return null
  }
  alertsFromConfig = alertsFromConfig[thg.type]

  if (!alertsFromConfig) {
    return null
  }

  const specs = lLibAlerts.specs
  const snap = thg.last.snap

  if (!snap) {
    const alert = createAlert({
      name: 'error_snap',
      code: 'error_snap',
      description: thg.last.err || 'No snap',
      severity: 'medium',
      createdAt: Date.now()
    })
    updateExistingAlerts([alert], thg.last.alerts)
    return [alert]
  }

  const acc = []

  const alertsContext = {
    conf: alertsFromConfig,
    info: thg.info,
    thingConf,
    id: thg.id
  }

  const errorsFromSnap = getErrorsFromSnap(snap)

  if (errorsFromSnap) {
    acc.push(...errorsFromSnap.map(error => {
      const alertConfig = alertsFromConfig[error.name]

      return createAlert({
        name: error.name,
        code: error.code,
        description: alertConfig?.description || 'unknown_error',
        severity: alertConfig?.severity || 'high',
        createdAt: error.timestamp || Date.now(),
        uuid: uuidv4(),
        message: error.message || undefined
      })
    }))
  }

  this.getSpecTags().forEach(stype => {
    if (!specs[stype]) {
      return
    }

    const aks = Object.keys(specs[stype])

    aks.forEach(ak => {
      const check = specs[stype][ak]
      let at = null

      try {
        if (!check.valid(alertsContext, snap)) {
          return
        }

        at = check.probe(alertsContext, snap)
      } catch (e) {
        const alert = createAlert({
          name: ak,
          code: ak,
          description: e.message,
          severity: 'medium',
          createdAt: Date.now()
        })

        acc.push(alert)
      }

      if (at) {
        const alertConf = alertsFromConfig[ak]
        const alert = createAlert({
          name: alertConf?.name || ak,
          code: alertConf?.code || ak,
          description: alertConf?.description || ak,
          severity: alertConf?.severity || 'medium',
          createdAt: Date.now()
        })

        acc.push(alert)
      }
    })
  })

  updateExistingAlerts(acc, thg.last.alerts)
  return acc.length ? acc : null
}

module.exports = {
  processThingAlerts
}
