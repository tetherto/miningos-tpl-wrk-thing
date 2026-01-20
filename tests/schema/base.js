'use strict'

module.exports = () => ({
  success_validate: {
    type: 'schema',
    schema: {
      success: { type: 'boolean', enum: [true] }
    }
  }
})
