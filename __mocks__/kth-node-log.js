/* eslint no-use-before-define: ["error", "nofunc"] */

// @ts-check

const mocks = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}

module.exports = {
  ...mocks,
  _listAllCalls,
  _clearAllCalls
}

function _listAllCalls() {
  const allCalls = {}
  Object.keys(mocks).forEach(key => {
    allCalls[key] = mocks[key].calls
  })
  return allCalls
}

function _clearAllCalls() {
  Object.values(mocks).forEach(func => func.mockClear())
}
