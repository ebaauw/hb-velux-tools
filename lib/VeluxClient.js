// hb-velux-tools/lib/VeluxClient.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Homebridge Velux Tools.

import { EventEmitter, once } from 'node:events'
import tls from 'node:tls'
import { format } from 'node:util'

import { timeout, toHexString } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import { decode, encode } from './slip.js'
import { commands } from './VeluxApi.js'

const commandNameById = {}
for (const commandName in commands) {
  commandNameById[commands[commandName].id] = commandName
}
Object.freeze(commandNameById)

/** Velux error.
  * @hideconstructor
  * @extends Error
  * @memberof VeluxClient
  */
class VeluxError extends Error {
  constructor (...args) {
    let request
    if (args.length > 0) {
      request = args.pop()
      if (!(request instanceof VeluxRequest)) {
        args.push(request)
        request = null
      }
    }
    const message = format(...args)

    super(message)
    /** @member {VeluxClient.VeluxRequest} - The request that caused the error.
      */
    this.request = request
  }
}

/** Velux request.
  * @hideconstructor
  * @memberof VeluxClient
  */
class VeluxRequest {
  constructor (id, cmd, cmdName, params, data) {
    /** @member {integer} - The request ID.
      */
    this.id = id

    /** @member {integer} - The request command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the request command.
      */
    this.cmdName = cmdName

    /** @member {?*} - The request parameters.
      */
    this.params = params

    /** @member {?Buffer} - The request data.
      */
    this.data = data
  }
}

/** Velux response.
  * @hideconstructor
  * @memberof VeluxClient
  */
class VeluxResponse {
  constructor (request, response) {
    if (!(request instanceof VeluxRequest)) {
      throw new SyntaxError('request: not a VeluxRequest')
    }
    /** @member {VeluxClient.Request} - The request that generated the response.
      */
    this.request = request

    /** @member {*} - The response data.
      */
    this.response = response
  }
}

/** Velux notification.
  * @hideconstructor
  * @memberof VeluxClient
  */
class VeluxNotification {
  constructor (cmd, cmdName, data, payload, request) {
    /** @member {integer} - The confirm or notification command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the confirm or notification command.
      */
    this.cmdName = cmdName

    /** @member {?Buffer} - The confirm or notification data.
      */
    this.data = data

    /** @member {?*} - The command payload.
      */
    this.payload = payload

    /** @member {?VeluxClient.Request} - The request that generated the response.
      */
    this.request = request
  }
}

class VeluxSession extends EventEmitter {
  constructor (command, request) {
    super()
    this.command = command
    this.request = request
    const cfmTimeout = setTimeout(() => {
      this.emit('error', new VeluxError('CFM timeout', request))
    }, 5 * 1000) // Todo: make configurable
    this.once('cfm', (payload) => {
      clearTimeout(cfmTimeout)
      this.result = command.ntf ? [] : payload
    })
  }

  waitForDone () {
    const doneTimeout = setTimeout(() => {
      this.emit('error', new VeluxError('NTF timout', this.request))
    }, 60 * 1000) // Todo: make configurable
    this.once('done', (payload) => {
      clearTimeout(doneTimeout)
    })
  }
}

/** Velux Integra KLF200 gateway API client.
  * <br>See {@link VeluxClient}.
  * @name VeluxClient
  * @type {Class}
  * @memberof module:hb-velux-tools
  */

/** Class for API client to Velux Integra KLF200 gateway.
  *
  */
class VeluxClient extends EventEmitter {
  static get Error () { return VeluxError }
  static get Request () { return VeluxRequest }
  static get Response () { return VeluxResponse }
  static get Notification () { return VeluxNotification }
  static get commands () { return commands }
  static get protocolId () { return 0 }

  /** Create a new VeluxClient instance.
    *
    * @param {object} params - Parameters.
    * @param {string} params.host - Hostname and port of the KLF 200 gateway.
    */
  constructor (params = {}) {
    super()
    this._params = {
      port: 51200,
      timeout: 15
    }
    const optionParser = new OptionParser(this._params)
    optionParser
      .hostKey()
      .stringKey('password', true)
      .intKey('timeout', 1, 60)
      .parse(params)
    this._name = this._params.hostname
    this._requestId = 0
    this._sessionId = 0
    this._sessions = {}
  }

  /** Hostname of the KLF 200 gateway.
  * @type {string}
  * @readonly
  */
  get address () { return this._address }

  /** Hostname of the KLF 200 gateway.
  * @type {string}
  * @readonly
  */
  get hostname () { return this._params.hostname }

  /** Port of the KLF 200 gateway.
    * @type {int}
    * @readonly
    */
  get port () { return this._port }

  /** Connection state to KLF 200 gateway.
    * @type {boolean}
    * @readonly
    */
  get connected () { return this._client != null }

  /** Fingerprint of the self-signed certificate of the KLF 200 gateway.
    * @type {string}
    * @readonly
    */
  get fingerprint () { return this._fingerprint }

  /** Make a command connection to the pigpio socket
  * for sending commands and receiving responses.
  * @throws `Error` - When connection fails.
  * @emits connect
  */
  async connect () {
    if (this._client != null) {
      return
    }
    /** Emitted when the client has connected to the gateway.
      * @event VeluxClient#connect
      * @param {string} host - The hostname and port.
      */
    this.emit('connecting', this._params.hostname + ':' + this._params.port)
    this._client = tls.connect({
      host: this._params.hostname,
      port: this._params.port,
      family: 4,
      rejectUnauthorized: false
    })
    this._client
      .on('secureConnect', () => {
        this._address = this._client.remoteAddress
        this._port = this._client.remotePort
        this._fingerprint = this._client.getPeerCertificate().fingerprint256
        /** Emitted when the client has connected to the gateway.
          * @event VeluxClient#connect
          * @param {string} host - The hostname and port.
          */
        this.emit('connect', this.address + ':' + this.port)
      })
      .on('close', () => {
        /** Emitted when the client has disconnected from gateway.
          * @event VeluxClient#disconnect
          * @param {string} host - The hostname and port.
          */
        this.emit('disconnect', this.address + ':' + this.port)
        this._client = null
      })
      .on('data', (data) => { this.#receive(decode(data)) })
      .on('error', (error) => {
        /** Emitted in case of error.
          * @event VeluxClient#error
          * @param {Error} error - The error.
          */
        this.emit('error', error)
      })
    await once(this._client, 'secureConnect')
    await this.request(commands.GW_PASSWORD_ENTER_REQ, { password: this._params.password })
  }

  async disconnect () {
    if (this._client != null) {
      await this._client.destroy()
      this._client = null
    }
  }

  async request (command, params = {}, userInput = false) {
    const cmd = command.id
    const cmdName = commandNameById[cmd]
    if (cmdName == null) {
      if (userInput) {
        throw new OptionParser.UserInputError(`${cmd}: unknown command`)
      }
      throw new SyntaxError(`${cmd}: unknown command`)
    }
    if (!cmdName.endsWith('_REQ')) {
      if (userInput) {
        throw new OptionParser.UserInputError(`${cmdName}: not a request command`)
      }
      throw new SyntaxError(`${cmdName}: not a request command`)
    }
    if (command.session) {
      params.sessionId = ++this._sessionId % 0xFFFF
    }
    const data = command.encode?.(params, userInput)
    if (data != null) {
      if (!Buffer.isBuffer(data)) {
        throw new SyntaxError('data: not a Buffer')
      }
      if (data.length > 250) {
        throw new SyntaxError('data: more than 250 bytes')
      }
    }
    const request = new VeluxRequest(++this._requestId, cmd, cmdName, params, data)

    if (this._client == null) {
      await this.connect()
    }

    const sessionKey = params?.sessionId == null ? cmd : 's' + params.sessionId
    while (this._sessions[sessionKey] != null) {
      await timeout(100)
    }
    const session = new VeluxSession(command, request)
    this._sessions[sessionKey] = session

    while (this._busy) {
      await timeout(100)
    }
    this._busy = true

    /** Emitted when a request is sent to the gateway.
      * @event VeluxClient#request
      * @param {VeluxRequest} request - The request.
      */
    this.emit('request', request)

    const len = request.data?.length ?? 0
    const buf = Buffer.alloc(len + 5)
    buf[0] = VeluxClient.protocolId
    buf[1] = len + 3
    buf.writeUint16BE(request.cmd, 2)
    request.data?.copy(buf, 4)
    let checksum = 0
    for (let i = 0; i < buf.length; i++) {
      checksum ^= buf[i]
    }
    buf.writeUint8(checksum, len + 4)
    /** Emitted when data is sent to the gateway.
      * @event VeluxClient#send
      * @param {Buffer} data - The data sent.
      */
    this.emit('send', buf)
    await this._client.write(encode(buf))

    try {
      try {
        await once(session, 'cfm')
      } catch (error) {
        this._busy = false
        delete this._sessions[sessionKey]
        throw error
      }
      this._busy = false
      if (command.ntf) {
        session.waitForDone()
        await once(session, 'done')
      }
      const result = session.result
      delete this._sessions[sessionKey]
      /** Emitted when a request has been acknowledged by the gateway.
      * @event VeluxClient#response
      * @param {VeluxResponse} response - The response.
      */
      this.emit('response', new VeluxResponse(request, result))
      return result
    } catch (error) {
      if (request.cmd === commands.GW_PASSWORD_ENTER_REQ.id) {
        throw error
      }
      this.#emitError(error.message, request)
    }
  }

  #receive (buf) {
    /** Emitted when data has been recevied from the gateway.
      * @event VeluxClient#data
      * @param {Buffer} data - The data received.
      */
    this.emit('data', buf)
    if (buf[0] !== VeluxClient.protocolId) {
      this.#emitError('%s: unknown protocol', toHexString(buf[0], 2))
      return
    }
    let checksum = 0
    for (let i = 0; i < buf.length - 1; i++) {
      checksum ^= buf[i]
    }
    if (buf[buf.length - 1] !== checksum) {
      this.#emitError(
        '%s: invalid checksum (expected: %s) for %s',
        toHexString(buf[buf.length - 1], 2), toHexString(checksum, 2),
        toHexString(buf)
      )
      // return
    }
    const cmd = buf.readUInt16BE(2)
    const data = buf.subarray(4, -1)
    const cmdName = commandNameById[cmd]
    if (cmdName == null) {
      this.#emitError('%s: unknown command ID', toHexString(cmd, 4))
    }
    if (!cmdName.endsWith('_CFM') && !cmdName.endsWith('_NTF')) {
      this.#emitError('%s: unexpected command', cmdName)
    }
    const command = commands[cmdName]
    let payload
    let session = this._sessions[command.req]
    try {
      payload = command.decode?.(data, session)
    } catch (error) {
      if (session != null) {
        session?.emit('error', error)
      } else {
        this.#emitError(error.message)
      }
    }
    if (payload?.sessionId != null) {
      session = this._sessions['s' + payload.sessionId]
      if (payload.nodeId != null) {
        delete payload.sessionId
        delete payload.status
        session?.result.push(payload)
      }
    }

    const notification = new VeluxNotification(
      cmd, cmdName, data, payload, session?.request
    )
    /** Emitted when a notification (or confirmation) has been recevied
      * from the gateway.
      * @event VeluxClient#notification
      * @param {VeluxNotification} notification - The notification.
      */
    this.emit('notification', notification)

    if (cmdName.endsWith('_CFM')) {
      session?.emit('cfm', payload)
    }
    if (cmd === commands.GW_SESSION_FINISHED_NTF.id) {
      session?.emit('done')
    }
  }

  #emitError (...args) {
    this.emit('error', new VeluxError(...args))
  }
}

export { VeluxClient }
