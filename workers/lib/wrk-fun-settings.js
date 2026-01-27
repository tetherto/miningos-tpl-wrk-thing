'use strict'

async function getSettings () {
  const meta = await this.settings.get('settings_00')
  return meta ? JSON.parse(meta.value) : {}
}

async function saveSettingsEntries (entries) {
  if (!entries || typeof entries !== 'object') {
    throw new Error('ERR_ENTRIES_INVALID')
  }

  const existingSettings = await getSettings.call(this)
  const newSettings = { ...existingSettings, ...entries }
  await this.settings.put('settings_00', JSON.stringify(newSettings))
  return newSettings
}

module.exports = {
  getSettings,
  saveSettingsEntries
}
