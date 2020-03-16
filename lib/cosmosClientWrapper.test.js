/* eslint-disable no-use-before-define */

jest.mock('@azure/cosmos')

const { getTestOptions } = require('./utils/options.test-data')

const { Environment } = require('../testlib')

const { createClient, getClient } = require('./cosmosClientWrapper')

describe('Public client function/s', () => {
  it('are accessible', () => {
    expect(createClient).toBeFunction()
    expect(getClient).toBeFunction()
  })

  runTestsAboutCreateClient(Environment.MODE_DEVELOPMENT)
  runTestsAboutCreateClient(Environment.MODE_PRODUCTION)

  runTestsAboutGetClient(Environment.MODE_DEVELOPMENT)
  runTestsAboutGetClient(Environment.MODE_PRODUCTION)
})

test('When passing valid options, createClient({..}) returns a CosmosClientWrapper.', () => {
  process.env.NODE_ENV = 'production'
  const cosmosClientWrapper = createClient(getTestOptions('valid'))
  expect(cosmosClientWrapper).not.toBeUndefined()
})

test('Dont break when calling updateAllCollectionsThroughput in development', () => {
  process.env.NODE_ENV = 'development'

  const client = getClient()
  let error

  try {
    client.updateAllCollectionsThroughput()
  } catch (e) {
    error = e
  }

  expect(error).toBe(undefined)
})

describe.skip('Functions', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'production'

    const config = {
      host: 'localhost',
      db: 'test',
      collections: [{ name: 'test', throughput: 1500 }, { name: 'test2' }],
      password: '123',
      username: 'test',
      maxThroughput: 1000
    }

    createClient(config)
  })

  test('After a client is created. You should be able to create databases and collections.', async () => {
    await getClient().init()
  })

  test("You can increase a named collection's throughput, by a default increase.", async () => {
    const client = getClient()

    const throughput = await client.increaseCollectionThroughput('test')
    expect(throughput).toEqual(600)
  })

  test('You can increase a named collections throughput, by a specific increase.', async () => {
    const client = getClient()

    const throughput = await client.updateCollectionThroughput('test', 800)
    expect(throughput).toEqual(800)
  })

  test('You can get a named collections throughput.', async () => {
    const client = getClient()

    const offer = await client.getCollectionThroughput('test')
    expect(offer.content.offerThroughput).toEqual(400)
  })

  test('You can increase all collections throughput, by a default increase.', async () => {
    const client = getClient()

    await client.updateAllCollectionsThroughput()
  })

  test.todo('updateAllCollectionsThroughput increases throughput')

  test('listCollectionsWithThroughput', async () => {
    const client = getClient()

    const collections = await client.listCollectionsWithThroughput()
    expect(collections.length).toEqual(2)
    expect(collections[0]).to.eql({ collection: 'test', throughput: 400 })
    expect(collections[1]).to.eql({ collection: 'test2', throughput: 400 })
  })

  test('resetThroughput', async () => {
    const client = getClient()

    await client.resetThroughput()
  })

  test.todo('resetThrought decreases throughput')
})

function runTestsAboutCreateClient(mode) {
  describe(`createClient - when used in mode "${mode}"`, () => {})
}

function runTestsAboutGetClient(mode) {
  describe(`getClient() - when used in mode "${mode}"`, () => {})
}