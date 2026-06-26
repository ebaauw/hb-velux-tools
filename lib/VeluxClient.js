// hb-velux-tools/lib/VeluxClient.js
// Copyright © 2025-2026 Erik Baauw. All rights reserved.
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
    this.once('error', () => {
      clearTimeout(cfmTimeout)
    })
    this.once('cfm', (payload) => {
      clearTimeout(cfmTimeout)
      this.result = command.ntf ? [] : payload
    })
  }

  waitForDone () {
    const doneTimeout = setTimeout(() => {
      this.emit('error', new VeluxError('NTF timout', this.request))
    }, 60 * 1000) // Todo: make configurable
    this.once('error', () => {
      clearTimeout(doneTimeout)
    })
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
    * @param {instance} [params.logger] - Logger instance to log to.
    * @param {string} params.password - Password of the KLF 200 gateway.
    * @param {integer} [params.timeout=5] - Request timeout (in seconds).
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
      .instanceKey('logger')
      .stringKey('password', true)
      .intKey('timeout', 1, 60)
      .parse(params)
    for (const f of ['warn', 'log', 'debug', 'vdebug', 'vvdebug']) {
      this[f] = this._params.logger?.[f]?.bind(this._params.logger) ?? (() => {})
    }
    this.on('error', (error) => { this.#logError(error) })
    this._requestId = 0
    this._sessionId = 0
    this._sessions = {}
  }

  /** Hostname of the KLF 200 gateway.
  * @type {string}
  * @readonly
  */
  get address () { return this._address ?? this._params.hostname }

  /** Hostname of the KLF 200 gateway.
  * @type {string}
  * @readonly
  */
  get hostname () { return this._params.hostname }

  /** Port of the KLF 200 gateway.
    * @type {int}
    * @readonly
    */
  get port () { return this._port ?? this._params.port }

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
    this.debug('connecting to %s...', this._params.hostname + ':' + this._params.port)
    const connectTimeout = setTimeout(() => {
      this._client?.destroy()
      this._client = null
      this.emit('error', new VeluxError('connect timeout'))
    }, this._params.timeout * 1000)
    this._client = tls.connect({
      host: this._params.hostname,
      port: this._params.port,
      family: 4,
      rejectUnauthorized: false
    })
    this._client
      .on('secureConnect', () => {
        clearTimeout(connectTimeout)
        this._address = this._client.remoteAddress
        this._port = this._client.remotePort
        this._fingerprint = this._client.getPeerCertificate().fingerprint256
        this.debug('connected to %s', this.address + ':' + this.port)
        this.emit('_connect')
      })
      .on('close', () => {
        this.debug('disconnected from %s', this.address + ':' + this.port)
        this._client = null
      })
      .on('data', (data) => {
        try {
          this.#receive(decode(data))
        } catch (error) {
          this.warn(error)
        }
      })
      .on('error', (error) => {
        clearTimeout(connectTimeout)
        /** Emitted in case of error.
          * @event VeluxClient#error
          * @param {Error} error - The error.
          */
        this.emit('error', error)
      })
    await once(this, '_connect')
    await this.request(commands.GW_PASSWORD_ENTER_REQ, { password: this._params.password })
  }

  async disconnect () {
    if (this._client != null) {
      await this._client.destroy()
      this._client = null
    }
  }

  async request (command, params = {}, userInput = false) {
    if (this._client == null) {
      await this.connect()
    }

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

    this.#logRequest(request)

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
    this.vvdebug('send %s', toHexString(buf))
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
      this.#logResponse(new VeluxResponse(request, result))
      return result
    } catch (error) {
      session?.emit('done')
      if (request.cmd === commands.GW_PASSWORD_ENTER_REQ.id) {
        throw error
      }
      if (error instanceof VeluxError) {
        error.request = request
        this.emit('error', error)
      } else {
        this.emit('error', new VeluxError(error, request))
      }
    }
  }

  #receive (buf) {
    this.vvdebug('received %s', toHexString(buf))
    if (buf.length < 5 || buf.length > 255) {
      this.warn('%d: invalid frame size', buf.length)
      return
    }
    if (buf[0] !== VeluxClient.protocolId) {
      this.warn('%s: unknown protocol', toHexString(buf[0], 2))
      return
    }
    const length = buf[1]
    if (length < 3 || length > 253) {
      this.warn('%d: invalid length', length)
      return
    }
    if (buf.length < length + 2) {
      this.warn(
        '%d: frame size too small (expected: %d) [%s]',
        buf.length, length + 2, toHexString(buf)
      )
      return
    }
    if (buf.length > length + 2) {
      this.warn(
        '%d: frame size too big (truncated to %d bytes) [%s]',
        buf.length, length + 2, toHexString(buf)
      )
      buf = buf.subarray(0, length + 2)
    }
    const cmd = buf.readUInt16BE(2)
    let checksum = 0
    for (let i = 0; i < buf.length - 1; i++) {
      checksum ^= buf[i]
    }
    if (buf[buf.length - 1] !== checksum) {
      this.warn(
        '%s: invalid checksum (expected: %s) [%s]',
        toHexString(buf[buf.length - 1], 2), toHexString(checksum, 2), toHexString(buf)
      )
      // return
    }
    const data = buf.subarray(4, -1)
    const cmdName = commandNameById[cmd]
    if (cmdName == null) {
      this.warn('%s: unknown command ID', toHexString(cmd, 4))
    }
    if (!cmdName.endsWith('_CFM') && !cmdName.endsWith('_NTF')) {
      this.warn('%s: unexpected command', cmdName)
    }
    const command = commands[cmdName]
    let payload
    let session = this._sessions[command.req]

    const notification = new VeluxNotification(
      cmd, cmdName, data, payload, session?.request
    )
    const req = notification.request != null
      ? 'request ' + notification.request.id + ': '
      : ''
    if (notification.data == null) {
      this.vdebug(
        '%s%s [%s]', req, notification.cmdName,
        toHexString(notification.cmd, 4)
      )
    } else {
      this.vdebug(
        '%s%s [%s]: %s', req, notification.cmdName,
        toHexString(notification.cmd, 4), toHexString(notification.data)
      )
    }

    try {
      payload = command.decode?.(data, session)
      if (payload?.sessionId != null) {
        session = this._sessions['s' + payload.sessionId]
        if (payload.nodeId != null) {
          delete payload.sessionId
          delete payload.status
          session?.result?.push(payload)
        }
      }
      notification.payload = payload
      notification.request = session?.request
      this.#logNotification(notification)
      /** Emitted when a notification (or confirmation) has been recevied
        * from the gateway.
        * @event VeluxClient#notification
        * @param {VeluxNotification} notification - The notification.
        */
      this.emit('notification', notification)
    } catch (error) {
      if (session != null) {
        session.emit('error', new VeluxError(error.message, session.request))
      } else {
        this.warn(error)
      }
    }

    if (cmdName.endsWith('_CFM')) {
      session?.emit('cfm', payload)
    }
    if (command.sessionDone) {
      session?.emit('done')
    }
  }

  #logError (error) {
    if (error.request == null) {
      this.error('error: %s', error)
      return
    }
    if (error.request.params == null) {
      this.log(
        'request %d: %s', error.request.id, error.request.cmdName
      )
    } else {
      this.log(
        'request %d: %s %j', error.request.id, error.request.cmdName,
        error.request.params
      )
    }
    this.warn(
      '%s: request %d: error: %s', error.request.id, error
    )
  }

  #logNotification (notification) {
    const req = notification.request != null
      ? 'request ' + notification.request.id + ': '
      : ''
    if (notification.payload == null) {
      this.debug('%s%s', req, notification.cmdName)
    } else {
      this.debug('%s%s: %j', req, notification.cmdName, notification.payload)
    }
  }

  #logRequest (request) {
    if (request.params == null) {
      this.debug(
        'request %d: %s', request.id, request.cmdName
      )
    } else {
      this.debug(
        'request %d: %s %j', request.id, request.cmdName,
        request.params
      )
    }
    if (request.data == null) {
      this.vdebug(
        'request %d: %s [%s]', request.id, request.cmdName,
        toHexString(request.cmd, 4)
      )
    } else {
      this.vdebug(
        'request %d: %s [%s]: %s', request.id, request.cmdName,
        toHexString(request.cmd, 4), toHexString(request.data)
      )
    }
  }

  #logResponse (response) {
    if (response.response == null) {
      this.debug('request %d: ok', response.request.id)
    } else {
      this.debug('request %d: response: %j', response.request.id, response.response)
    }
  }
}

export { VeluxClient }
