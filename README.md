# kth-node-cosmos-db ![Build](https://travis-ci.org/KTH/kth-node-cosmos-db.svg?branch=master 'Build')

Our Node.js applications at KTH in Stockholm use Mongoose to access CosmosDB in Azure. This module is a wrapper around "@azure/cosmos" and designed for those applications.

### Contents

- [Upgrading from version 3](#upgrading-from-version-3)
- [Intended use](#intended-use)
- [Remarks on local development](#remarks-on-local-development)
- [How It Works](#how-it-works)
- [Basic Usage](#basic-usage)
- [Client options](#client-options)
- [Client methods](#client-methods)
- [Further reading](#further-reading)

## Upgrading from version 3

The interface was changed with version 4 of this module. Previously there was a function `wrap()` which changed an already created Mongoose model in place. This function was replaced by `client.createMongooseModel()` which instead completely wraps `mongoose.model()`, now.

```js
// Old interface (until v3):
const User = mongoose.model('User', mongooseSchema)
wrap(User)

// New interface (stable since v4.0.7):
const User = client.createMongooseModel('User', mongooseSchema, mongoose)
```

If you previously exported already prepared Mongoose-models from a project-folder and used them in an early state of your application's startup, some more work might be needed to upgrade to version 4. You should now export only the schemas and ensure that the models are prepared after you initialized 'kth-node-cosmos-db'.

### Please note

- Ensure that you use the Mongoose schema as second input and the connected Mongoose instance of your application as third argument to `client.createMongooseModel()`!
- Ensure that your application runs `createClient()` and `await client.init()`, before!
- Don't use version v4.0.0 to v4.0.6 because of their instability.

## Intended use

Using this module instead of directly including "@azure/cosmos" into a project has the following benefits:

- Many Mongoose actions will automatically increase Azure's provision throughput, if needed.
- The module can also set a batchSize to avoid Cursor Timeout errors during `find()`-operations.

## Remarks on local development

By default, the wrapper won't be active during local development, e.g. when using a local database. Your application will still work but it will only produce logging outputs like "Not available in native MongoDB" when it comes to the functions of this module.

If you wish to use the full wrapper functionality also locally, set the environment variable `USE_COSMOS_DB`, e.g. in the .env file:

```sh
USE_COSMOS_DB=true
```

## How it works

1. `createClient()` and `await client.init()` prepare the needed database and it's collections in Cosmos DB.

1. `getClient()` helps you access the module's methods, later.

1. `client.createMongooseModel()` has to be used instead of `mongoose.model()` to prepare any Mongoose model and add the automatic throughput management to it.

1. Use the Mongoose models like always.

   _When a "Too many requests" error (with internal code 16500) occurs during a database action, the wrapper will increase the throughput of the related collection with a fixed amount and then retry the action. The "Too many requests" error will mainly occur when importing foreign data, e.g. into an API project. When an import is done, the application should reset all collections throughput to their default value using `client.resetThroughput()`._

1. `await client.resetThroughput()` is especially useful after data imports to avoid the throughput value to stay high for a longer time. _You might save money this way in Azure._

## Basic usage

### `createClient( options )` and `await client.init()`

**Prepare database and collections**

Use `createClient()` and `await client.init()` on application startup, e.g. in file "server.js":

```js
// Example
const { createClient } = require('@kth/kth-node-cosmos-db')
const config = require("./config/server")

...

const [_host] = config.db.host.split(":")

const cosmosDbOptions = {
  host: _host,
  db: config.db.db,
  username: config.db.username,
  password: config.db.password,
  defaultThroughput: 400,
  maxThroughput: 2000,
  collections: [{ name: 'users', throughput: 600 }, { name: 'emails' }],
}
const client = createClient(cosmosDbOptions)

await client.init()
```

- The option "collections" is an array of objects. Each object must have the "name" attribute while the "throughput" attribute is optional.

- The throughput attribute makes it possible to have different default throughputs for each collections. If no throughput attribute is added the global option "defaultThroughput" will be used.

### `getClient()`

**Get access to client methods**

"kth-node-cosmos-db" caches the last result of `createClient()` internally. You can use `getClient()` whenever you need access to the module's methods, e.g. to manually update throughput values.

### `client.createMongooseModel( modelName, mongooseSchema, mongooseInstance )`

**Prepare wrapped Mongoose models**

Before working with the Mongoose models don't use `mongoose.model()`, but call `client.createMongooseModel()` instead.

_This allows "kth-node-cosmos-db" to automatically handle "Too many requests" errors from CosmosDB and retry your Mongoose operation after increasing the throughput value._

- `client.createMongooseModel()` internally uses `mongoose.model()` and returns the Mongoose model. The result can then be used like any other model.

  _Please ensure to initialize the module with `createClient()` and `await client.init()` before using `client.createMongooseModel()`._

  ```js
  // Example
  const { getClient } = require('kth-node-cosmos-db')
  const mongoose = require('mongoose')

  ...

  const userSchema = mongoose.Schema({ name: String, age: Number })

  const client = getClient()
  const User = client.createMongooseModel('User', userSchema, mongoose)

  ...

  const testUser = await User.findOne({ name: "Test" })
  ```

- **Collection name:**
  `client.createMongooseModel()` will let `mongoose.model()` determine which collection name (e.g. "users") shall be used for a given model (e.g. "User"). If you don't like this behaviour, you might want to set the option "collection" in your schema _before_ using `client.createMongooseModel()`:

  ```js
  // User-defined collection name:
  ...
  const userSchema = mongoose.Schema({ name: String, age: Number }, { collection: 'UserCollection' })
  ...
  ```

- Mostly all important methods of the Mongoose models are changed to automatically handle errors regarding the current Azure throughput-limit. You find the adapted methods listed as constant `MONGOOSE_METHODS_THAT_ARE_WRAPPED` in the file "[lib/utils/adaptMongoose.js](https://github.com/KTH/kth-node-cosmos-db/blob/master/lib/utils/adaptMongoose.js)".

### `client.resetThroughput()`

When you setup the module and start using your Mongoose models, the CosmosDB throughput value will be increased whenever needed. In order to avoid unneccessarily high costs in Azure, the throughput values should be lowered, again. This must be done manually in your application, e.g. with `client.resetThroughput()` after a bigger data import.

_Please be sure to manually lower the throughput values on a regular basis._

```javascript
// Example
const { getClient } = require('kth-node-cosmos-db')

...

const client = getClient()
await client.resetThroughput()
```

## Client options

### Required

The following options must be given to `createClient()`:

| Option                                                                                      |     Type      | Mutable |
| ------------------------------------------------------------------------------------------- | :-----------: | :-----: |
| **host**<br/>_(The hostname of the Cosmos DB server)_                                       |    string     |    -    |
| **username**<br/>_(Auth credentials)_                                                       |    string     |    -    |
| **password**<br/>_(Auth credentials: Azure key)_                                            |    string     |    -    |
| **db**<br/>_(The name of the database)_                                                     |    string     |    -    |
| **collections**<br/>_(An Array of objects with information<br/>about the used collections)_ | (see remarks) |    -    |
| **maxThroughput**<br/>_(The maximum amount of RU/s<br/>a collection is allowed to reach)_   |    number     |   yes   |

### Optional

| Option                                                                                                                    |  Type   | Default  | Mutable |
| ------------------------------------------------------------------------------------------------------------------------- | :-----: | :------: | :-----: |
| **defaultThroughput**<br/>_(The default throughput in RU/s<br/>that each collection will be created with.)_               | number  |  `400`   |   yes   |
| **throughputStepsize**<br/>_(The increase in RU/s when a write fails)_                                                    | number  |  `200`   |   yes   |
| **batchSize**<br/>_(Batch size of find()-querys)_                                                                         | number  | `10000`  |   yes   |
| **port**<br/>_(The SSL port used by the Cosmos DB server)_                                                                | number  |    -     |    -    |
| **disableSslRejection**<br/>_(Allow self signed certificates<br/>when accessing Cosmos DB server)_                        | boolean | `false`  |    -    |
| **createCollectionsWithMongoose**<br/>_(Create unexisting containers during<br/>createMongooseModel() instead of init())_ | boolean | `false`  |    -    |
| **retryStrategy**<br/>_(Name of predefined set of retry-timeouts which<br/>is used when handling throughput problems)_    | string  | `"good"` |   yes   |

### Remarks

- You can change mutable options with `client.setOption()`.

- **collections:**

  - `[item, item, ...]`
    - The option "collections" must be given as an array of objects.
  - `item.name` **(required)**
    - Each item has to state the collection's name, e.g. `"users"`.
  - `item.throughput` (optional)
    - You can determine a distinct default throughput value for every collection, e.g. `500`.
  - `item.partitionKey` _(experimental feature)_
    - You can also set the partition-key which shall be used when the Cosmos DB container is created, e.g. `[ "/name" ]`. The partition-key can't be changed on already existing containers.
    - In order to make this feature work you might have to set the option "shardKey" accordingly, too, when creating the related Mongoose schema with `mongoose.schema()`, e.g. `shardKey: { name: 1 }`.

- **batchSize:**

  - Try to decrease the option "batchSize" in case of "Cursor Timeout" errors.

- **disableSslRejection:**

  - This option might only be needed when running Cosmos DB emulator locally during integration tests. The emulator uses a self-signed SSL-certificate which normally wouldn't be accepted by Cosmos DB.

- **createCollectionsWithMongoose:** _(experimental feature)_

  - If you get an error from Mongoose regarding misconfigured "shard keys" ("partition keys" in Cosmos DB), it might help to wait with the creation of your containers until the Mongoose models are created.

- **retryStrategy:**

  - You will find the available sets as a constant `KNOWN_RETRY_STRATEGIES` in the file "[lib/utils/strategy.js](https://github.com/KTH/kth-node-cosmos-db/blob/master/lib/utils/strategy.js)".

## Client methods

### Descriptions

| Name and description                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- |
| **init()**<br/>_(Prepare database and containers in Cosmos DB)_                                                             |
| **createMongooseModel()**<br/>_(Prepare a Mongoose model that will automatically increase throughput values, too)_          |
| **getOption()**<br/>_(Get the value of any option)_                                                                         |
| **setOption()**<br/>_(Change the value of a **mutable** option)_                                                            |
| **getCollectionThroughput()**<br/>_(Get throughput of specific collection)_                                                 |
| **listCollectionsWithThroughput()**<br/>_(List the name and throughput of each collection)_                                 |
| **increaseCollectionThroughput()**<br/>_(Increase the specific collections throughput with the value of defaultThroughput)_ |
| **updateCollectionThroughput()**<br/>_(Update specific collection throughput to a value of choice)_                         |
| **updateAllCollectionsThroughput()**<br/>_(Update all collections throughput to a value of choice)_                         |
| **resetThroughput()**<br/>_(Reset throughput to default for each collection)_                                               |

### Interface

| Async | Method and arguments                                                      |           Return value           |
| :---: | ------------------------------------------------------------------------- | :------------------------------: |
| await | **init** ()                                                               |       client<br/>_(this)_        |
|   -   | **createMongooseModel**<br/>(modelName, mongooseSchema, mongooseInstance) |            new model             |
|   -   | **getOption** (key)                                                       |         value of option          |
|   -   | **setOption** (key, value)                                                |       client<br/>_(this)_        |
| await | **getCollectionThroughput** (collectionName)                              |    throughput<br/>_(number)_     |
| await | **listCollectionsWithThroughput** ( )                                     |      list<br/>_(object[])_       |
| await | **increaseCollectionThroughput** (collectionName)                         |     increase<br/>_(number)_      |
| await | **updateCollectionThroughput** (collectionName, throughput)               |  new throughput<br/>_(number)_   |
| await | **updateAllCollectionsThroughput** (throughput)                           | new throughputs<br/>_(number[])_ |
| await | **resetThroughput** ()                                                    | new throughputs<br/>_(number[])_ |

### Remarks

- `client.init()` and `client.createMongooseModel()` are important steps during the setup of your application...

- `client.createMongooseModel()` expects the connected Mongoose-instance of your application as third parameter, especially for calling `mongoose.model()`. Using this dependency injection, "kth-node-cosmos-db" avoids to have its own Mongoose-version which then might not match the Mongoose-version of your application. The module has been tested to work with Mongoose v5.9.

- "kth-node-cosmos-db" doesn't cache the created Mongoose models. Your application has to do this.

- Call `client.resetThroughput()` regularly, especially after a data import is done. This avoids too high throughput values and helps you save costs in Azure.

## Further reading

- [DEVELOPMENT.md](https://github.com/KTH/kth-node-cosmos-db/blob/master/DEVELOPMENT.md) contains information about testing and changing the module
