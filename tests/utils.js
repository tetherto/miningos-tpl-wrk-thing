'use strict'

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const SCHEMA_PATHS = [
  path.join(__dirname, 'schema')
]

const TEST_PATHS = [
  path.join(__dirname, 'cases')
]

// File loading utilities
function loadFilesFromDirectories (directories) {
  const result = {}
  for (const dir of directories) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      if (!file.endsWith('.js')) continue
      Object.assign(result, require(path.join(dir, file))(result))
    }
  }
  return result
}

function getSchema () {
  return loadFilesFromDirectories(SCHEMA_PATHS)
}

function getTests () {
  return loadFilesFromDirectories(TEST_PATHS)
}

// Utility functions
function XOR (...args) {
  return args.filter(Boolean).length === 1
}

function logValidationError (key, message) {
  console.log(key, message)
}

// Schema validation helpers
function validateEnum (key, enumValue) {
  if (enumValue && !Array.isArray(enumValue)) {
    logValidationError(key, 'enum is not an array')
    return false
  }
  return true
}

function validateValidateFunction (key, validateFn) {
  if (validateFn && typeof validateFn !== 'function') {
    logValidationError(key, 'validate is not a function')
    return false
  }
  return true
}

function validateMinMax (key, min, max) {
  if (min !== undefined && typeof min !== 'number') {
    logValidationError(key, 'min is not a number')
    return false
  }
  if (max !== undefined && typeof max !== 'number') {
    logValidationError(key, 'max is not a number')
    return false
  }
  return true
}

function validateStringSchema (key, value) {
  if (!validateEnum(key, value.enum)) return false
  if (value.regex && !(value.regex instanceof RegExp)) {
    logValidationError(key, 'regex is not a regex')
    return false
  }
  if (XOR(Boolean(value.validate), Boolean(value.min || value.max))) {
    logValidationError(key, 'validate and min/max are mutually exclusive')
    return false
  }
  if (value.primitive || value.children) {
    logValidationError(key, 'primitive and children are mutually exclusive')
    return false
  }
  return validateValidateFunction(key, value.validate)
}

function validateNumberSchema (key, value) {
  if (!validateEnum(key, value.enum)) return false
  if (XOR(Boolean(value.validate), Boolean(value.min || value.max))) {
    logValidationError(key, 'validate and min/max are mutually exclusive')
    return false
  }
  if (!validateMinMax(key, value.min, value.max)) return false
  if (value.regex || value.children || value.primitive) {
    logValidationError(key, 'regex, children, and primitive are mutually exclusive')
    return false
  }
  return validateValidateFunction(key, value.validate)
}

function validateArraySchema (key, value, validateSchemaFn) {
  if (value.primitive && value.children) {
    logValidationError(key, 'primitive and children are mutually exclusive')
    return false
  }
  if (value.primitive && !validateSchemaFn({ tmp: value.primitive })) {
    logValidationError(key, 'primitive is not a valid schema')
    return false
  }
  return validateValidateFunction(key, value.validate)
}

function validateObjectSchema (key, value, validateSchemaFn) {
  if (value.optional) {
    return true
  }
  if (!value.children) {
    logValidationError(key, 'object must have children')
    return false
  }
  if (!validateSchemaFn(value.children)) {
    logValidationError(key, 'children is not a valid schema')
    return false
  }
  if (value.primitive || value.regex || value.enum || value.min || value.max) {
    logValidationError(key, 'primitive, regex, enum, min, and max are mutually exclusive')
    return false
  }
  return validateValidateFunction(key, value.validate)
}

function validateBooleanSchema (key, value) {
  if (value.primitive || value.regex || value.min || value.max || value.children) {
    logValidationError(key, 'primitive, regex, enum, min, max, and children are mutually exclusive')
    return false
  }
  return true
}

function validateSchema (schema) {
  for (const [key, value] of Object.entries(schema)) {
    let isValid = false

    switch (value.type) {
      case 'string':
        isValid = validateStringSchema(key, value)
        break
      case 'number':
        isValid = validateNumberSchema(key, value)
        break
      case 'array':
        isValid = validateArraySchema(key, value, validateSchema)
        break
      case 'object':
        isValid = validateObjectSchema(key, value, validateSchema)
        break
      case 'boolean':
        isValid = validateBooleanSchema(key, value)
        break
      default:
        return false
    }

    if (!isValid) {
      return false
    }
  }
  return true
}

// JSON validation helpers
function validateArray (t, arr, schema) {
  // eslint-disable-next-line
  t.ok(arr.every((value) => typeof value === schema.type), `array values is of type ${schema.type}`)
  if (schema.min !== undefined) {
    t.ok(arr.every((value) => value >= schema.min), `array values are greater than ${schema.min}`)
  }
  if (schema.max !== undefined) {
    t.ok(arr.every((value) => value <= schema.max), `array values are less than ${schema.max}`)
  }
  if (schema.enum !== undefined) {
    t.ok(arr.every((value) => schema.enum.includes(value)), `array values are in ${schema.enum}`)
  }
}

function validateType (t, key, value, expectedType) {
  if (expectedType === 'array') {
    t.ok(Array.isArray(value), `key ${key} is of type array`)
  } else {
    const actualType = typeof value
    t.is(actualType, expectedType, `key ${key} is of type ${actualType}, expected ${expectedType}`)
  }
}

function validateNumberValue (t, key, value, rules) {
  if (rules.min !== undefined) {
    t.ok(value >= rules.min, `key ${key} is less than ${rules.min}`)
  }
  if (rules.max !== undefined) {
    t.ok(value <= rules.max, `key ${key} is greater than ${rules.max}`)
  }
  if (rules.enum !== undefined) {
    t.ok(rules.enum.includes(value), `key ${key} is in ${rules.enum}`)
  }
}

function validateStringValue (t, key, value, rules) {
  if (rules.enum !== undefined) {
    t.ok(rules.enum.includes(value), `key ${key} is in ${rules.enum}`)
  }
  if (rules.regex !== undefined) {
    t.ok(rules.regex.test(value), `key ${key} matches ${rules.regex}`)
  }
}

function validateBooleanValue (t, key, value, rules) {
  if (rules.enum !== undefined) {
    t.ok(rules.enum.includes(value), `key ${key} is in ${rules.enum}`)
  }
}

function validateComplexValue (t, key, value, rules, ctx, validateJSONFn) {
  if (XOR(Boolean(rules.validate), Boolean(rules.primitive), Boolean(rules.children))) {
    if (rules.validate) {
      t.ok(rules.validate(value, ctx), `key ${key} failed custom validation`)
    } else if (rules.primitive && Array.isArray(value)) {
      validateArray(t, value, rules.primitive)
    } else if (rules.children && Array.isArray(value)) {
      value.forEach((item) => {
        validateJSONFn(t, item, rules.children, ctx)
      })
    } else if (rules.children && typeof value === 'object') {
      validateJSONFn(t, value, rules.children, ctx)
    }
  }
}

function validateJSON (t, obj, schema, ctx = {}) {
  if (!validateSchema(schema)) {
    t.fail('invalid schema')
    return
  }

  for (const key of Object.keys(schema)) {
    const rules = schema[key]

    // Check if key is optional
    if (rules.optional && obj[key] === undefined) {
      continue
    }

    // Validate type
    validateType(t, key, obj[key], rules.type)

    // Validate type-specific rules
    switch (rules.type) {
      case 'number':
        validateNumberValue(t, key, obj[key], rules)
        break
      case 'string':
        validateStringValue(t, key, obj[key], rules)
        break
      case 'boolean':
        validateBooleanValue(t, key, obj[key], rules)
        break
    }

    // Validate complex values (validate, primitive, children)
    validateComplexValue(t, key, obj[key], rules, ctx, validateJSON)
  }
}

// Test utilities
const shouldRunTest = (testName) => {
  return new Promise((resolve) => {
    process.stdin.resume()
    process.stdin.setRawMode(true).on('data', function (data) {
      const input = data.toString()
      // ctrl-c (end of text)
      if (input === '\u0003') {
        process.exit()
      }
      // escape keypress
      if (input === '\u001b') {
        resolve(false)
        process.stdin.removeAllListeners('data')
        return
      }
      resolve(true)
      process.stdin.removeAllListeners('data')
    })
    process.stdout.write(`Run ${testName}\n. Press ESC to skip or any other key to continue...\n\n`)
  })
}

// Path utilities
const calcCorePath = (storeDir, key) => {
  const hexKey = key.toString('hex')
  return path.join(storeDir, 'cores', hexKey.slice(0, 2), hexKey.slice(2, 4), hexKey)
}

// Random data generators
const getRandomString = (size) => {
  return crypto.randomBytes(size).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, size)
}

const getRandomIP = () => {
  return [...crypto.randomBytes(4)].join('.')
}

module.exports = {
  getSchema,
  getTests,
  validateJSON,
  validateSchema,
  shouldRunTest,
  SCHEMA_PATHS,
  TEST_PATHS,
  calcCorePath,
  getRandomString,
  getRandomIP
}
