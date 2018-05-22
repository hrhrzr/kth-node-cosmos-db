'use strict'

module.exports.wrap = model => {
  const wrap = model

  wrap.findOneAndUpdate = async function() {
    try {
      return await this.__proto__.findOneAndUpdate.apply(this, arguments)
    } catch (e) {
      const client = await getClient()
      return handleError(e, client, this, this.findOneAndUpdate, arguments)
    }
  }

  wrap.save = async function() {
    try {
      return await this.__proto__.save.apply(this, arguments)
    } catch (e) {
      const client = await getClient()
      return handleError(e, client, this, this.save, arguments)
    }
  }

  wrap.update = async function() {
    try {
      return await this.__proto__.update.apply(this, arguments)
    } catch (e) {
      const client = await getClient()
      return handleError(e, client, this, this.update, arguments)
    }
  }

  wrap.findOne = async function() {
    try {
      return await this.__proto__.findOne.apply(this, arguments)
    } catch (e) {
      const client = getClient()
      return handleError(e, client, this, this.findOne, arguments)
    }
  }

  wrap.find = async function() {
    try {
      const client = await getClient()
      return await this.__proto__.find.apply(this, arguments).batchSize(client.batchSize)
    } catch (e) {
      return handleError(e, client, this, this.find, arguments)
    }
  }

  return wrap
}