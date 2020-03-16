/* eslint-disable no-use-before-define */

jest.fn('@azure/cosmos')
jest.fn('kth-node-log')

const Azure = require('@azure/cosmos')

const { testBasicFunctionExport } = require('../../testlib')

const {
  createDatabase,
  createCollection,
  getCollection,
  getCollectionOffer,
  increaseThroughput
} = require('./cosmosDb')

const Global = {
  cosmosClient: null,
  testData: {
    databaseId: 'testDatabase',
    collectionId: 'testCollection',
    initialThroughput: 700
  }
}

describe('Helper module "cosmosDb"', () => {
  beforeAll(prepareCosmosClient)

  runTestsAboutCreateDatabase()
  runTestsAboutCreateCollection()
  runTestsAboutGetCollection()
  runTestsAboutGetCollectionOffer()
  runTestsAboutIncreaseThroughput()
})

function prepareCosmosClient() {
  if (Global.cosmosClient == null) {
    Global.cosmosClient = new Azure.CosmosClient({})
  }
}

function runTestsAboutCreateDatabase() {
  describe('has createDatabase() that', () => {
    testBasicFunctionExport(createDatabase)

    it('- when called with valid arguments - resolves as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId } = Global.testData

      const asyncResult = createDatabase(databaseId, client)
      expect(asyncResult).toBeInstanceOf(Promise)

      const database = await asyncResult
      expect(database).toBeObject()
      expect(database.client).toBe(client)
      expect(database.id).toBe(databaseId)
    })

    it('- when called with invalid arguments - REJECTS as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId } = Global.testData

      const asyncResults = {
        invalidId: createDatabase('', client),
        invalidClient: createDatabase(databaseId, {})
      }
      expect(asyncResults.invalidId).toBeInstanceOf(Promise)
      expect(asyncResults.invalidClient).toBeInstanceOf(Promise)

      await expect(asyncResults.invalidId).rejects.toThrow(
        /Mockup: Invalid database name|Add actual Azure error here/
      )
      await expect(asyncResults.invalidClient).rejects.toThrow(
        /Cannot read property|Add actual Azure error here/
      )
    })

    it('- when called with no arguments - REJECTS as expected', async () => {
      const asyncResult = createDatabase()
      expect(asyncResult).toBeInstanceOf(Promise)

      await expect(asyncResult).rejects.toThrow(/Cannot read property|Add actual Azure error here/)
    })
  })
}

function runTestsAboutCreateCollection() {
  describe('has createCollection() that', () => {
    testBasicFunctionExport(createCollection)

    it('- when called with valid arguments - resolves as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)

      const asyncResult = createCollection(database, collectionId, initialThroughput)
      expect(asyncResult).toBeInstanceOf(Promise)

      const collection = await asyncResult
      expect(collection).toBeObject()
      expect(collection.database).toBe(database)
      expect(collection.id).toBe(collectionId)
    })

    it("- when called twice with same arguments - doesn't create new object", async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)

      const asyncResults = {
        firstRun: createCollection(database, collectionId, initialThroughput),
        secondRun: createCollection(database, collectionId, initialThroughput)
      }
      expect(asyncResults.firstRun).toBeInstanceOf(Promise)
      expect(asyncResults.secondRun).toBeInstanceOf(Promise)

      const collections = {}
      collections.firstRun = await asyncResults.firstRun
      collections.secondRun = await asyncResults.secondRun

      expect(collections.firstRun).toBe(collections.secondRun)
      expect(collections.firstRun).toBeObject()
      expect(collections.firstRun.database).toBe(database)
      expect(collections.firstRun.id).toBe(collectionId)
    })

    it('- when called with invalid arguments - REJECTS as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)

      const asyncResults = {
        invalidDatabase: createCollection({}, collectionId, initialThroughput),
        invalidId: createCollection(database, '', initialThroughput),
        invalidThroughput: createCollection(database, collectionId, 0)
      }
      expect(asyncResults.invalidDatabase).toBeInstanceOf(Promise)
      expect(asyncResults.invalidId).toBeInstanceOf(Promise)
      expect(asyncResults.invalidThroughput).toBeInstanceOf(Promise)

      await expect(asyncResults.invalidDatabase).rejects.toThrow(
        /Cannot read property|Add actual Azure error here/
      )
      await expect(asyncResults.invalidId).rejects.toThrow(
        /Mockup: Invalid container name|Add actual Azure error here/
      )
      await expect(asyncResults.invalidThroughput).rejects.toThrow(
        /Mockup: Invalid throughput|Add actual Azure error here/
      )
    })

    it('- when called with no arguments - REJECTS as expected', async () => {
      const asyncResult = createCollection()
      expect(asyncResult).toBeInstanceOf(Promise)

      await expect(asyncResult).rejects.toThrow(/Cannot read property|Add actual Azure error here/)
    })
  })
}

function runTestsAboutGetCollection() {
  describe('has getCollection() that', () => {
    testBasicFunctionExport(getCollection)

    it('- when called with valid arguments - resolves as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      const collection = await createCollection(database, collectionId, initialThroughput)

      const asyncResult = getCollection(collectionId, client)
      expect(asyncResult).toBeInstanceOf(Promise)

      const result = await asyncResult
      expect(result).toBeObject()
      expect(result).toEqual(collection)
    })

    it('- when called with invalid arguments - REJECTS as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      await createCollection(database, collectionId, initialThroughput)

      const asyncResults = {
        invalidId: getCollection('', client),
        invalidClient: getCollection(collectionId, {})
      }

      expect(asyncResults.invalidId).toBeInstanceOf(Promise)
      expect(asyncResults.invalidClient).toBeInstanceOf(Promise)

      await expect(asyncResults.invalidId).rejects.toThrow(
        /Mockup: Invalid container name|Add actual Azure error here/
      )
      await expect(asyncResults.invalidClient).rejects.toThrow(
        /Cannot read property|Add actual Azure error here/
      )
    })

    it('- when called with no arguments - REJECTS as expected', async () => {
      const asyncResult = getCollection()
      expect(asyncResult).toBeInstanceOf(Promise)

      await expect(asyncResult).rejects.toThrow(/Cannot read property|Add actual Azure error here/)
    })
  })
}

function runTestsAboutGetCollectionOffer() {
  describe('has getCollectionOffer() that', () => {
    testBasicFunctionExport(getCollectionOffer)

    it('- when called with valid arguments - resolves as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      const collection = await createCollection(database, collectionId, initialThroughput)

      const asyncResult = getCollectionOffer(collectionId, client)
      expect(asyncResult).toBeInstanceOf(Promise)

      const result = await asyncResult
      expect(result).toBeObject()
      expect(result.client).toBe(client)
      expect(result.offerResourceId).toBe(collection._rid)
    })

    it('- when called with invalid arguments - REJECTS as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      await createCollection(database, collectionId, initialThroughput)

      const asyncResults = {
        invalidId: getCollectionOffer('', client),
        invalidClient: getCollectionOffer(collectionId, {})
      }
      expect(asyncResults.invalidId).toBeInstanceOf(Promise)
      expect(asyncResults.invalidClient).toBeInstanceOf(Promise)

      await expect(asyncResults.invalidId).rejects.toThrow(
        /Mockup: Invalid container name|Add actual Azure error here/
      )
      await expect(asyncResults.invalidClient).rejects.toThrow(
        /Cannot read property|Add actual Azure error here/
      )
    })

    it('- when called with no arguments - REJECTS as expected', async () => {
      const asyncResult = getCollectionOffer()
      expect(asyncResult).toBeInstanceOf(Promise)

      await expect(asyncResult).rejects.toThrow(/Cannot read property|Add actual Azure error here/)
    })
  })
}

function runTestsAboutIncreaseThroughput() {
  describe('has increaseThroughput() that', () => {
    testBasicFunctionExport(increaseThroughput)

    it('- when called with valid arguments - resolves as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      await createCollection(database, collectionId, initialThroughput)

      const asyncResult = increaseThroughput(collectionId, initialThroughput + 100, client)
      expect(asyncResult).toBeInstanceOf(Promise)

      const result = await asyncResult
      expect(result).toBeUndefined()
    })

    it("actually changes a collection's throughput", async () => {
      const { cosmosClient: client, testData } = Global
      const { databaseId, collectionId } = testData

      const throughputs = {
        initial: testData.initialThroughput
      }

      const database = await createDatabase(databaseId, client)
      await createCollection(database, collectionId, throughputs.initial)

      const collectionOffer1 = await getCollectionOffer(collectionId, client)
      throughputs.current = collectionOffer1.content.offerThroughput
      throughputs.requested = throughputs.current + 200

      await increaseThroughput(collectionId, throughputs.requested, client)

      const collectionOffer2 = await getCollectionOffer(collectionId, client)
      throughputs.updated = collectionOffer2.content.offerThroughput

      expect(throughputs.updated).toBe(throughputs.requested)
    })

    it('- when called with invalid arguments - REJECTS as expected', async () => {
      const { cosmosClient: client } = Global
      const { databaseId, collectionId, initialThroughput } = Global.testData

      const database = await createDatabase(databaseId, client)
      await createCollection(database, collectionId, initialThroughput)

      const asyncResults = {
        invalidId: increaseThroughput('', initialThroughput + 100, client),
        invalidThroughput: increaseThroughput(collectionId, 0, client),
        invalidClient: increaseThroughput(collectionId, initialThroughput + 100, {})
      }
      expect(asyncResults.invalidId).toBeInstanceOf(Promise)
      expect(asyncResults.invalidThroughput).toBeInstanceOf(Promise)
      expect(asyncResults.invalidClient).toBeInstanceOf(Promise)

      await expect(asyncResults.invalidId).rejects.toThrow(
        /Mockup: Invalid container name|Add actual Azure error here/
      )
      await expect(asyncResults.invalidThroughput).rejects.toThrow(
        /Mockup: Invalid throughput|Add actual Azure error here/
      )
      await expect(asyncResults.invalidClient).rejects.toThrow(
        /Cannot read property|Add actual Azure error here/
      )
    })

    it('- when called with no arguments - REJECTS as expected', async () => {
      const asyncResult = increaseThroughput()
      expect(asyncResult).toBeInstanceOf(Promise)

      await expect(asyncResult).rejects.toThrow(/Cannot read property|Add actual Azure error here/)
    })
  })
}