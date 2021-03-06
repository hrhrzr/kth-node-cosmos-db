/* eslint no-use-before-define: ["error", "nofunc"] */

// @ts-check

module.exports = _hoistClassDefinition()

const https = require('https')

// eslint-disable-next-line no-unused-vars
const { CosmosClient, Database, Container } = require('@azure/cosmos')
const log = require('kth-node-log')

const { adaptMongooseSchema, adaptMongooseModel } = require('./adaptMongoose')
const CosmosDbUtils = require('./cosmosDb')
const StrategyUtils = require('./strategy')
const ValidityUtils = require('./validity')

const OPTIONS_SCHEMA = {
  host: { type: 'hostname', required: true },
  username: { type: 'string', required: true },
  password: { type: 'azureKey', required: true },
  db: { type: 'azureDatabaseName', required: true },
  collections: { type: _checkTypeCollection, required: true },
  maxThroughput: { type: 'azureThroughput', required: true, mutable: true },

  defaultThroughput: { type: 'azureThroughput', mutable: true },
  throughputStepsize: { type: 'azureThroughputSteps', mutable: true },
  batchSize: { type: 'number', mutable: true },

  port: { type: 'port' },
  disableSslRejection: { type: 'boolean' },
  createCollectionsWithMongoose: { type: 'boolean' },
  retryStrategy: { type: 'string', mutable: true },
}

const LIST_OF_PUBLIC_METHODS = [
  'init',
  'getOption',
  'setOption',
  'createMongooseModel',
  'getCollectionThroughput',
  'listCollectionsWithThroughput',
  'increaseCollectionThroughput',
  'updateCollectionThroughput',
  'updateAllCollectionsThroughput',
  'resetThroughput',
]

/**
 * CosmosClientWrapper wraps the Offer (throughput handling) in Azure CosmosDB.
 * The actual database stuff is done in utils/cosmosDb.js
 */
function _hoistClassDefinition() {
  class CosmosClientWrapper {
    static getListOfPublicMethods() {
      return LIST_OF_PUBLIC_METHODS
    }

    /**
     * @param {object} options
     */
    constructor(options) {
      this._options = options
      this._setDefaults()
      this._checkOptions()
      this._memorizeAllOptions()
      this._options = undefined

      const cosmosOptions = this._getCosmosClientOptions()
      this.cosmosClient = new CosmosClient(cosmosOptions)

      if (this.retryStrategy) {
        const _ensureValidRetryStrategy = StrategyUtils.getRetryStrategy
        _ensureValidRetryStrategy(this.retryStrategy)
      }

      this.initialized = false
    }

    /**
     * @param {string} key Name of the option
     *
     * @returns {*} Current value of the option
     */
    getOption(key) {
      return OPTIONS_SCHEMA[key] == null ? null : this[key]
    }

    /**
     * @param {string} key Name of a mutable option
     * @param {*} value Valid new option-value
     * @throws {Error}
     */
    setOption(key, value) {
      if (OPTIONS_SCHEMA[key] == null) {
        throw new Error(`kth-node-cosmos-db - setOption(): Unknown option "${key}"`)
      }
      if (!OPTIONS_SCHEMA[key].mutable) {
        throw new Error(`kth-node-cosmos-db - setOption(): Can't change immutable option "${key}"`)
      }

      try {
        ValidityUtils.ensureObjectFollowsSchema({
          input: { [key]: value },
          schema: OPTIONS_SCHEMA,
          ignoreMissingKeys: true,
        })
      } catch (error) {
        throw new Error(
          'kth-node-cosmos-db - setOption(): Invalid option-value ' +
            `- (key "${key}", error: ${error.message})`
        )
      }

      this[key] = value
      return this
    }

    _setDefaults() {
      this.host = undefined
      this.username = undefined
      this.password = undefined
      this.db = undefined
      this.collections = []
      this.defaultThroughput = 400
      this.throughputStepsize = 200
      this.maxThroughput = 4000
      this.batchSize = 10000
      this.port = undefined
      this.disableSslRejection = false
      this.createCollectionsWithMongoose = false
      this.retryStrategy = undefined
    }

    _checkOptions() {
      try {
        const input = this._options

        const gotInvalidHostnameWithPort =
          input != null && typeof input === 'object' && /\w:\d+$/.test(input.host)
        if (gotInvalidHostnameWithPort) {
          log.warn(
            'kth-node-cosmos-db: Your option "host" contains a port.' +
              ' Please use option "port" in case you need it, instead.'
          )
        }

        ValidityUtils.ensureObjectFollowsSchema({
          input,
          schema: OPTIONS_SCHEMA,
          checkForInvalidKeys: true,
        })
      } catch (error) {
        throw new Error(`kth-node-cosmos-db: Invalid client options - ${error.message}`)
      }
    }

    _memorizeAllOptions() {
      const numericOptions = [
        'port',
        'defaultThroughput',
        'maxThroughput',
        'throughputStepsize',
        'batchSize',
      ]
      Object.keys(this._options).forEach(key => {
        const value = this._options[key]
        this[key] = numericOptions.includes(key) ? parseInt(value) : value
      })
    }

    _getCosmosClientOptions() {
      const options = {
        endpoint: this.port ? `https://${this.host}:${this.port}` : `https://${this.host}`,
        key: this.password,
      }
      if (this.disableSslRejection) {
        options.agent = new https.Agent({ rejectUnauthorized: false })
      }
      return options
    }

    /**
     * @param {object} options
     * @param {string} options.safetyFlag Has to be "I'm sure it's okay!" to avoid unexpected data loss
     *
     * @returns {Promise<this>}
     *      Resolves after the database was removed from Cosmos DB (if existing)
     * @throws {Error}
     */
    async deleteDatabase(options) {
      if (process.env.NODE_ENV.toLowerCase() === 'production') {
        throw new Error('kth-node-cosmos-db - deleteDatabase(): Not available in production mode')
      }
      if (
        options == null ||
        typeof options !== 'object' ||
        options.safetyFlag !== "I'm sure it's okay!"
      ) {
        throw new Error(
          "kth-node-cosmos-db - deleteDatabase(): Won't proceed - missing/invalid safety flag!"
        )
      }

      const database = await CosmosDbUtils.getDatabase({
        client: this.cosmosClient,
        databaseName: this.db,
      })
      if (database == null) {
        return this
      }

      const databaseResponse = await database.delete()
      if (
        databaseResponse == null ||
        typeof databaseResponse !== 'object' ||
        databaseResponse.statusCode !== 204
      ) {
        throw new Error('kth-node-cosmos-db: deleteDatabase() failed')
      }

      return this
    }

    /**
     * @param {string} collectionName
     * @param {object} options
     * @param {string} options.safetyFlag Has to be "Yes, do it!" to avoid unexpected data loss
     *
     * @returns {Promise<this>}
     *      Resolves after the collection was removed from Cosmos DB (if existing)
     * @throws {Error}
     */
    async deleteCollection(collectionName, options) {
      if (process.env.NODE_ENV.toLowerCase() === 'production') {
        throw new Error('kth-node-cosmos-db - deleteCollection(): Not available in production mode')
      }
      if (options == null || typeof options !== 'object' || options.safetyFlag !== 'Yes, do it!') {
        throw new Error(
          "kth-node-cosmos-db - deleteDatabase(): Won't proceed - missing/invalid safety flag!"
        )
      }

      const database = await CosmosDbUtils.getDatabase({
        client: this.cosmosClient,
        databaseName: this.db,
      })
      if (database == null) {
        return this
      }

      const container = await CosmosDbUtils.getContainerByDatabase(collectionName, database)
      if (container == null) {
        return this
      }

      const containerResponse = await container.delete()
      if (
        containerResponse == null ||
        typeof containerResponse !== 'object' ||
        containerResponse.statusCode !== 204
      ) {
        throw new Error('kth-node-cosmos-db: deleteContainer() failed')
      }

      return this
    }

    /**
     * Creates the database and collections if they do not exists.
     *
     * @returns {Promise<this>}
     * @throws {Error}
     */
    async init() {
      const cosmosOptions = this._getCosmosClientOptions()
      log.debug(
        `kth-node-cosmos-db: Initializing connection to Cosmos DB with endpoint ${cosmosOptions.endpoint}`
      )

      try {
        const database = await this._initDatabase()

        await Promise.all(
          this.collections.map((_, index) => this._initSingleContainer(database, index))
        )
      } catch (error) {
        log.error('kth-node-cosmos-db: Could not init database and/or collections.', { error })
        throw error
      }

      this.initialized = true
      return this
    }

    _ensureIsInitialized() {
      if (this.initialized === false) {
        throw new Error(
          "kth-node-cosmos-db: Can't use client method - call init() and wait for it, first."
        )
      }
    }

    /**
     * @private
     * @returns {Promise<Database>}
     * @throws {Error} e.g. in case an existing database has an unexpected configuration
     */
    async _initDatabase() {
      const client = this.cosmosClient
      const databaseName = this.db

      const existingDatabase = await CosmosDbUtils.getDatabase({
        client,
        databaseName,
        ignoreCase: false,
      })

      if (existingDatabase == null) {
        const newDatabase = await CosmosDbUtils.createDatabase(client, databaseName)
        log.info(`kth-node-cosmos-db: Created new database "${databaseName}"`)
        return newDatabase
      }

      // @TODO
      // this._ensureValidDatabaseConfiguration(existingDatabase)
      log.info(`kth-node-cosmos-db: Using existing database "${databaseName}"`)
      return existingDatabase
    }

    /**
     * @private
     * @param {Database} database
     * @param {number} collectionIndex
     * @returns {Promise<Container|null>}
     */
    async _initSingleContainer(database, collectionIndex) {
      const {
        name: containerName,
        throughput: requestedThroughput,
        partitionKey: requestedPartitionKey,
      } = this.collections[collectionIndex]

      const existingContainer = await CosmosDbUtils.getContainerByDatabase(containerName, database)
      if (existingContainer != null) {
        // @TODO
        // this._ensureValidContainerConfiguration(existingContainer, collectionIndex)
        log.info(`kth-node-cosmos-db: Using existing container "${containerName}"`)
        this.collections[collectionIndex].prepared = true
        return existingContainer
      }

      const containerWillBeCreatedLater = this.createCollectionsWithMongoose
      if (containerWillBeCreatedLater) {
        this.collections[collectionIndex].prepared = false
        return null
      }

      const throughput = requestedThroughput || this.defaultThroughput
      const partitionKey = requestedPartitionKey || null
      const newContainerData = { database, containerName, throughput, partitionKey }
      const container = await CosmosDbUtils.createContainer(newContainerData)

      log.info(`kth-node-cosmos-db: Created new container "${containerName}"`)
      return container
    }

    /**
     * @param {string} modelName
     * @param {object} mongooseSchema
     * @param {object} mongooseInstance
     *
     * @returns {Model}
     */
    createMongooseModel(modelName, mongooseSchema, mongooseInstance) {
      let Model

      try {
        ValidityUtils.ensureValidPrimitive({
          input: modelName,
          text: 'Mongoose model name',
          check: typeof modelName === 'string' && /^\w+$/.test(modelName),
        })
        ValidityUtils.ensureValidClass({
          input: mongooseSchema,
          text: 'Mongoose schema',
          className: 'Schema',
        })
        ValidityUtils.ensureValidClass({
          input: mongooseInstance,
          text: 'Mongoose instance',
          className: 'Mongoose',
        })

        this._ensureIsInitialized()

        const _mongoosePluralize = mongooseInstance.pluralize()
        const collectionName = mongooseSchema.get('collection') || _mongoosePluralize(modelName)

        const indexOfCollectionsWithGivenName = this.collections
          .map(({ name }, index) => ({ name, index }))
          .filter(({ name }) => name === collectionName)

        const collectionIsKnown = indexOfCollectionsWithGivenName.length === 1
        if (!collectionIsKnown) {
          throw new Error(
            `Can't create Mongoose model without knowing collection - Adapt your input to createClient()! (model "${modelName}", expected collection name "${collectionName}")`
          )
        }

        const { index } = indexOfCollectionsWithGivenName[0]

        adaptMongooseSchema({ cosmosClientWrapper: this, mongooseSchema, collectionName })
        Model = mongooseInstance.model(modelName, mongooseSchema)
        Model = adaptMongooseModel({ cosmosClientWrapper: this, mongooseModel: Model })

        const containerDidNotExistedBefore =
          this.createCollectionsWithMongoose && this.collections[index].prepared === false
        if (containerDidNotExistedBefore) {
          this.collections[index].prepared = true
        }
      } catch (error) {
        log.error(`kth-node-cosmos-db - createMongooseModel() failed with error "${error.message}"`)
        throw error
      }

      return Model
    }

    /**
     * @param {string} collectionName
     *
     * @returns {Promise<number|null>}
     */
    async getCollectionThroughput(collectionName) {
      const databaseName = this.db

      const database = await CosmosDbUtils.getDatabase({ client: this.cosmosClient, databaseName })
      if (database == null) {
        // console.log(`getCollectionThroughput - can't find database "${databaseName}"`)
        return null
      }

      const container = await CosmosDbUtils.getContainerByDatabase(collectionName, database)
      if (container == null) {
        // console.log(`getCollectionThroughput() - can't find collection "${collectionName}"`)
        return null
      }

      const throughput = CosmosDbUtils.getContainerThroughput(container)
      // if (throughput == null) {
      //   console.log(
      //     `getCollectionThroughput() - can't determine throughput of collectiong  "${collectionName}`
      //   )
      // }
      return throughput
    }

    /**
     * @returns {Promise<object[]|null>}
     *    Resolves with list of collection names and related throughputs, e.g.
     *        [ { name: 'Collection1', throughput: 300 }, ... ]; or
     *    Resolves with null iff no collection and related throughput could be determined
     */
    async listCollectionsWithThroughput() {
      try {
        const databaseName = this.db

        const database = await CosmosDbUtils.getDatabase({
          client: this.cosmosClient,
          databaseName,
        })
        if (database == null) {
          return null
        }

        const _queryCollectionNameWithThroughput = async collection => {
          const { name: collectionName } = collection

          const container = await CosmosDbUtils.getContainerByDatabase(collectionName, database)
          if (container == null) {
            return null
          }

          const throughput = await CosmosDbUtils.getContainerThroughput(container)
          if (throughput == null) {
            return null
          }

          return {
            collection: collectionName,
            throughput,
          }
        }

        const queryResult = await Promise.all(
          this.collections.map(_queryCollectionNameWithThroughput)
        )

        const allCollectionNamesWithThroughput = queryResult.filter(item => item != null)

        return allCollectionNamesWithThroughput.length === 0
          ? null
          : allCollectionNamesWithThroughput
      } catch (error) {
        log.info('kth-node-cosmos-db: Could not list collections with throughput', { error })
        throw error
      }
    }

    /**
     * @param {string} collectionName
     *
     * @returns {Promise<number|null>}
     *    Resolves with difference between old and new throughput value, e.g. 100; or
     *    Resolves with null if current throughput value is already the highest possible
     * @throws {Error}
     *    e.g. in case the database or collection can't be found
     */
    async increaseCollectionThroughput(collectionName) {
      const databaseName = this.db

      const database = await CosmosDbUtils.getDatabase({ client: this.cosmosClient, databaseName })
      if (database == null) {
        throw new Error(`kth-node-cosmos-db: Can't find database "${databaseName}"`)
      }

      const container = await CosmosDbUtils.getContainerByDatabase(collectionName, database)
      if (container == null) {
        throw new Error(`kth-node-cosmos-db: Can't find collection "${collectionName}"`)
      }

      const throughputValues = {}
      throughputValues.before = await CosmosDbUtils.getContainerThroughput(container)

      const canIncreaseThroughput = throughputValues.before < this.maxThroughput
      if (!canIncreaseThroughput) {
        log.warn(
          `kth-node-cosmos-db: Collection is already using its max throughput ("${collectionName}": ${throughputValues.before}.`
        )
        return null
      }

      throughputValues.requested = Math.min(
        throughputValues.before + this.throughputStepsize,
        this.maxThroughput
      )
      await CosmosDbUtils.setContainerThroughput(container, throughputValues.requested)

      throughputValues.after = await CosmosDbUtils.getContainerThroughput(container)
      return throughputValues.after - throughputValues.before
    }

    /**
     * @param {string} collectionName
     * @param {number} newThroughput
     *
     * @returns {Promise<number>}
     *    Throughput after update
     * @throws {Error}
     */
    async updateCollectionThroughput(collectionName, newThroughput) {
      try {
        const databaseName = this.db

        const database = await CosmosDbUtils.getDatabase({
          client: this.cosmosClient,
          databaseName,
        })
        if (database == null) {
          throw new Error(`kth-node-cosmos-db: Can't find database "${databaseName}"`)
        }

        const container = await CosmosDbUtils.getContainerByDatabase(collectionName, database)
        if (container == null) {
          throw new Error(`kth-node-cosmos-db: Can't find collection "${collectionName}"`)
        }

        const throughputValues = {}
        throughputValues.before = await CosmosDbUtils.getContainerThroughput(container)

        if (newThroughput === throughputValues.before) {
          return throughputValues.before
        }

        if (newThroughput < 100 || newThroughput > this.maxThroughput) {
          log.warn(
            `kth-node-cosmos-db: Can't update collection throughput ` +
              `- invalid throughput given (collection ${collectionName}, value ${newThroughput})`
          )
          return throughputValues.before
        }

        await CosmosDbUtils.setContainerThroughput(container, newThroughput)

        throughputValues.after = await CosmosDbUtils.getContainerThroughput(container)
        return throughputValues.after
      } catch (error) {
        log.error('kth-node-cosmos-db: Error in updateCollectionThroughput', { error })
        throw error
      }
    }

    /**
     * @param {number} newThroughput
     *
     * @returns {Promise<number[]>}
     */
    async updateAllCollectionsThroughput(newThroughput) {
      try {
        const results = await Promise.all(
          this.collections.map(collection =>
            this.updateCollectionThroughput(collection.name, newThroughput)
          )
        )

        log.info(`kth-node-cosmos-db: All collections throughput updated to ${newThroughput}`)

        return results
      } catch (error) {
        log.error('kth-node-cosmos-db: Error in updateAllCollectionsThroughput', { error })
        throw error
      }
    }

    /**
     * @returns {Promise<number[]>}
     * @throws {Error}
     */
    async resetThroughput() {
      try {
        const _resetThroughputOfOneCollection = async collection => {
          const { name: collectionName } = collection
          const newThroughput = collection.throughput || this.defaultThroughput

          log.info(
            `kth-node-cosmos-db: Resetting collection throughput (${collectionName}: ${newThroughput})`
          )

          return this.updateCollectionThroughput(collectionName, newThroughput)
        }

        const newThroughputList = await Promise.all(
          this.collections.map(_resetThroughputOfOneCollection)
        )

        return newThroughputList
      } catch (error) {
        log.info('kth-node-cosmos-db: Error in resetThroughput', { error })
        throw error
      }
    }
  }
  return CosmosClientWrapper
}

function _checkTypeCollection(input) {
  const validOuterStructure =
    Array.isArray(input) && input.every(item => item != null && typeof item === 'object')
  if (!validOuterStructure) {
    return false
  }

  const validNames = input.every(({ name }) => typeof name === 'string' && name !== '')
  const uniqueNames = input.every(({ name }) => {
    return input.filter(item => item.name === name).length === 1
  })
  if (!validNames || !uniqueNames) {
    return false
  }

  const validThroughputs = input.every(
    ({ throughput }) =>
      throughput == null ||
      (['string', 'number'].includes(typeof throughput) && parseInt(throughput) >= 100)
  )
  if (!validThroughputs) {
    return false
  }

  const validPartitionkeys = input.every(
    ({ partitionKey }) =>
      partitionKey == null ||
      (Array.isArray(partitionKey) &&
        partitionKey.every(item => typeof item === 'string' && /^\/\w+$/.test(item)))
  )
  return validPartitionkeys
}
