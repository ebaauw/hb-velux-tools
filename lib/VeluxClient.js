// hb-velux-tools/lib/VeluxClient.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Homebridge Velux Tools.

import { EventEmitter, once } from 'node:events'
import tls from 'node:tls'

import { toHexString } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import { decode, encode } from './slip.js'

const commandsById = Object.freeze({
  0x0000: 'GW_ERROR_NTF', // Provides information on what triggered the error.
  0x0001: 'GW_REBOOT_REQ', // Request gateway to reboot.
  0x0002: 'GW_REBOOT_CFM', // Acknowledge to GW_REBOOT_REQ command.
  0x0003: 'GW_SET_FACTORY_DEFAULT_REQ', // Request gateway to clear system table, scene table and set Ethernet settings to factory default. Gateway will reboot.
  0x0004: 'GW_SET_FACTORY_DEFAULT_CFM', // Acknowledge to GW_SET_FACTORY_DEFAULT_REQ command.
  0x0008: 'GW_GET_VERSION_REQ', // Request version information.
  0x0009: 'GW_GET_VERSION_CFM', // Acknowledge to GW_GET_VERSION_REQ command.
  0x000A: 'GW_GET_PROTOCOL_VERSION_REQ', // Request KLF 200 API protocol version.
  0x000B: 'GW_GET_PROTOCOL_VERSION_CFM', // Acknowledge to GW_GET_PROTOCOL_VERSION_REQ command.
  0x000C: 'GW_GET_STATE_REQ', // Request the state of the gateway
  0x000D: 'GW_GET_STATE_CFM', // Acknowledge to GW_GET_STATE_REQ command.
  0x000E: 'GW_LEAVE_LEARN_STATE_REQ', // Request gateway to leave learn state.
  0x000F: 'GW_LEAVE_LEARN_STATE_CFM', // Acknowledge to GW_LEAVE_LEARN_STATE_REQ command.

  0x00E0: 'GW_GET_NETWORK_SETUP_REQ', // Request network parameters.
  0x00E1: 'GW_GET_NETWORK_SETUP_CFM', // Acknowledge to GW_GET_NETWORK_SETUP_REQ.
  0x00E2: 'GW_SET_NETWORK_SETUP_REQ', // Set network parameters.
  0x00E3: 'GW_SET_NETWORK_SETUP_CFM', // Acknowledge to GW_SET_NETWORK_SETUP_REQ.

  0x0100: 'GW_CS_GET_SYSTEMTABLE_DATA_REQ', // Request a list of nodes in the gateways system table.
  0x0101: 'GW_CS_GET_SYSTEMTABLE_DATA_CFM', // Acknowledge to GW_CS_GET_SYSTEMTABLE_DATA_REQ
  0x0102: 'GW_CS_GET_SYSTEMTABLE_DATA_NTF', // Acknowledge to GW_CS_GET_SYSTEM_TABLE_DATA_REQList of nodes in the gateways systemtable.
  0x0103: 'GW_CS_DISCOVER_NODES_REQ', // Start CS DiscoverNodes macro in KLF200.
  0x0104: 'GW_CS_DISCOVER_NODES_CFM', // Acknowledge to GW_CS_DISCOVER_NODES_REQ command.
  0x0105: 'GW_CS_DISCOVER_NODES_NTF', // Acknowledge to GW_CS_DISCOVER_NODES_REQ command.
  0x0106: 'GW_CS_REMOVE_NODES_REQ', // Remove one or more nodes in the systemtable.
  0x0107: 'GW_CS_REMOVE_NODES_CFM', // Acknowledge to GW_CS_REMOVE_NODES_REQ.
  0x0108: 'GW_CS_VIRGIN_STATE_REQ', // Clear systemtable and delete system key.
  0x0109: 'GW_CS_VIRGIN_STATE_CFM', // Acknowledge to GW_CS_VIRGIN_STATE_REQ.
  0x010A: 'GW_CS_CONTROLLER_COPY_REQ', // Setup KLF200 to get or give a system to or from another io-homecontrol® remote control. By a system means all nodes in the systemtable and the system key.
  0x010B: 'GW_CS_CONTROLLER_COPY_CFM', // Acknowledge to GW_CS_CONTROLLER_COPY_REQ.
  0x010C: 'GW_CS_CONTROLLER_COPY_NTF', // Acknowledge to GW_CS_CONTROLLER_COPY_REQ.
  0x010D: 'GW_CS_CONTROLLER_COPY_CANCEL_NTF', // Cancellation of system copy to other controllers.
  0x010E: 'GW_CS_RECEIVE_KEY_REQ', // Receive system key from another controller.
  0x010F: 'GW_CS_RECEIVE_KEY_CFM', // Acknowledge to GW_CS_RECEIVE_KEY_REQ.
  0x0110: 'GW_CS_RECEIVE_KEY_NTF', // Acknowledge to GW_CS_RECEIVE_KEY_REQ with status.
  0x0111: 'GW_CS_PGC_JOB_NTF', // Information on Product Generic Configuration job initiated by press on PGC button.
  0x0112: 'GW_CS_SYSTEM_TABLE_UPDATE_NTF', // Broadcasted to all clients and gives information about added and removed actuator nodes in system table.
  0x0113: 'GW_CS_GENERATE_NEW_KEY_REQ', // Generate new system key and update actuators in systemtable.
  0x0114: 'GW_CS_GENERATE_NEW_KEY_CFM', // Acknowledge to GW_CS_GENERATE_NEW_KEY_REQ.
  0x0115: 'GW_CS_GENERATE_NEW_KEY_NTF', // Acknowledge to GW_CS_GENERATE_NEW_KEY_REQ with status.
  0x0116: 'GW_CS_REPAIR_KEY_REQ', // Update key in actuators holding an old key.
  0x0117: 'GW_CS_REPAIR_KEY_CFM', // Acknowledge to GW_CS_REPAIR_KEY_REQ.
  0x0118: 'GW_CS_REPAIR_KEY_NTF', // Acknowledge to GW_CS_REPAIR_KEY_REQ with status.
  0x0119: 'GW_CS_ACTIVATE_CONFIGURATION_MODE_REQ', // Request one or more actuator to open for configuration.
  0x011A: 'GW_CS_ACTIVATE_CONFIGURATION_MODE_CFM', // Acknowledge to GW_CS_ACTIVATE_CONFIGURATION_MODE_REQ.
  0x0200: 'GW_GET_NODE_INFORMATION_REQ', // Request extended information of one specific actuator node.
  0x0201: 'GW_GET_NODE_INFORMATION_CFM', // Acknowledge to GW_GET_NODE_INFORMATION_REQ.
  0x0210: 'GW_GET_NODE_INFORMATION_NTF', // Acknowledge to GW_GET_NODE_INFORMATION_REQ.
  0x0202: 'GW_GET_ALL_NODES_INFORMATION_REQ', // Request extended information of all nodes.
  0x0203: 'GW_GET_ALL_NODES_INFORMATION_CFM', // Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ
  0x0204: 'GW_GET_ALL_NODES_INFORMATION_NTF', // Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ. Holds node information
  0x0205: 'GW_GET_ALL_NODES_INFORMATION_FINISHED_NTF', // Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ. No more nodes.
  0x0206: 'GW_SET_NODE_VARIATION_REQ', // Set node variation.
  0x0207: 'GW_SET_NODE_VARIATION_CFM', // Acknowledge to GW_SET_NODE_VARIATION_REQ.
  0x0208: 'GW_SET_NODE_NAME_REQ', // Set node name.
  0x0209: 'GW_SET_NODE_NAME_CFM', // Acknowledge to GW_SET_NODE_NAME_REQ.
  0x020C: 'GW_NODE_INFORMATION_CHANGED_NTF', // Information has been updated.
  0x0211: 'GW_NODE_STATE_POSITION_CHANGED_NTF', // Information has been updated.
  0x020D: 'GW_SET_NODE_ORDER_AND_PLACEMENT_REQ', // Set search order and room placement.
  0x020E: 'GW_SET_NODE_ORDER_AND_PLACEMENT_CFM', // Acknowledge to GW_SET_NODE_ORDER_AND_PLACEMENT_REQ.
  0x0220: 'GW_GET_GROUP_INFORMATION_REQ', // Request information about all defined groups.
  0x0221: 'GW_GET_GROUP_INFORMATION_CFM', // Acknowledge to GW_GET_GROUP_INFORMATION_REQ.
  0x0230: 'GW_GET_GROUP_INFORMATION_NTF', // Acknowledge to GW_GET_NODE_INFORMATION_REQ.
  0x0222: 'GW_SET_GROUP_INFORMATION_REQ', // Change an existing group.
  0x0223: 'GW_SET_GROUP_INFORMATION_CFM', // Acknowledge to GW_SET_GROUP_INFORMATION_REQ.
  0x0224: 'GW_GROUP_INFORMATION_CHANGED_NTF', // Broadcast to all, about group information of a group has been changed.
  0x0225: 'GW_DELETE_GROUP_REQ', // Delete a group.
  0x0226: 'GW_DELETE_GROUP_CFM', // Acknowledge to GW_DELETE_GROUP_INFORMATION_REQ.
  0x0227: 'GW_NEW_GROUP_REQ', // Request new group to be created.
  0x0228: 'GW_NEW_GROUP_CFM', // Acknowledge to GW_NEW_GROUP_REQ.
  0x0229: 'GW_GET_ALL_GROUPS_INFORMATION_REQ', // Request information about all defined groups.
  0x022A: 'GW_GET_ALL_GROUPS_INFORMATION_CFM', // Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
  0x022B: 'GW_GET_ALL_GROUPS_INFORMATION_NTF', // Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
  0x022C: 'GW_GET_ALL_GROUPS_INFORMATION_FINISHED_NTF', // Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
  0x022D: 'GW_GROUP_DELETED_NTF', // GW_GROUP_DELETED_NTF is broadcasted to all, when a group has been removed.
  0x0240: 'GW_HOUSE_STATUS_MONITOR_ENABLE_REQ', // Enable house status monitor.
  0x0241: 'GW_HOUSE_STATUS_MONITOR_ENABLE_CFM', // Acknowledge to GW_HOUSE_STATUS_MONITOR_ENABLE_REQ.
  0x0242: 'GW_HOUSE_STATUS_MONITOR_DISABLE_REQ', // Disable house status monitor.
  0x0243: 'GW_HOUSE_STATUS_MONITOR_DISABLE_CFM', // Acknowledge to GW_HOUSE_STATUS_MONITOR_DISABLE_REQ.
  0x0300: 'GW_COMMAND_SEND_REQ', // Send activating command direct to one or more io-homecontrol® nodes.
  0x0301: 'GW_COMMAND_SEND_CFM', // Acknowledge to GW_COMMAND_SEND_REQ.
  0x0302: 'GW_COMMAND_RUN_STATUS_NTF', // Gives run status for io-homecontrol® node.
  0x0303: 'GW_COMMAND_REMAINING_TIME_NTF', // Gives remaining time before io-homecontrol® node enter target position.
  0x0304: 'GW_SESSION_FINISHED_NTF', // Command send, Status request, Wink, Mode or Stop session is finished.
  0x0305: 'GW_STATUS_REQUEST_REQ', // Get status request from one or more io-homecontrol® nodes.
  0x0306: 'GW_STATUS_REQUEST_CFM', // Acknowledge to GW_STATUS_REQUEST_REQ.
  0x0307: 'GW_STATUS_REQUEST_NTF', // Acknowledge to GW_STATUS_REQUEST_REQ. Status request from one or more io-homecontrol® nodes.
  0x0308: 'GW_WINK_SEND_REQ', // Request from one or more io-homecontrol® nodes to Wink.
  0x0309: 'GW_WINK_SEND_CFM', // Acknowledge to GW_WINK_SEND_REQ
  0x030A: 'GW_WINK_SEND_NTF', // Status info for performed wink request.
  0x0310: 'GW_SET_LIMITATION_REQ', // Set a parameter limitation in an actuator.
  0x0311: 'GW_SET_LIMITATION_CFM', // Acknowledge to GW_SET_LIMITATION_REQ.
  0x0312: 'GW_GET_LIMITATION_STATUS_REQ', // Get parameter limitation in an actuator.
  0x0313: 'GW_GET_LIMITATION_STATUS_CFM', // Acknowledge to GW_GET_LIMITATION_STATUS_REQ.
  0x0314: 'GW_LIMITATION_STATUS_NTF', // Hold information about limitation.
  0x0320: 'GW_MODE_SEND_REQ', // Send Activate Mode to one or more io-homecontrol® nodes.
  0x0321: 'GW_MODE_SEND_CFM', // Acknowledge to GW_MODE_SEND_REQ
  0x0322: 'GW_MODE_SEND_NTF', // Notify with Mode activation info.
  0x0400: 'GW_INITIALIZE_SCENE_REQ', // Prepare gateway to record a scene.
  0x0401: 'GW_INITIALIZE_SCENE_CFM', // Acknowledge to GW_INITIALIZE_SCENE_REQ.
  0x0402: 'GW_INITIALIZE_SCENE_NTF', // Acknowledge to GW_INITIALIZE_SCENE_REQ.
  0x0403: 'GW_INITIALIZE_SCENE_CANCEL_REQ', // Cancel record scene process.
  0x0404: 'GW_INITIALIZE_SCENE_CANCEL_CFM', // Acknowledge to GW_INITIALIZE_SCENE_CANCEL_REQ command.
  0x0405: 'GW_RECORD_SCENE_REQ', // Store actuator positions changes since GW_INITIALIZE_SCENE, as a scene.
  0x0406: 'GW_RECORD_SCENE_CFM', // Acknowledge to GW_RECORD_SCENE_REQ.
  0x0407: 'GW_RECORD_SCENE_NTF', // Acknowledge to GW_RECORD_SCENE_REQ.
  0x0408: 'GW_DELETE_SCENE_REQ', // Delete a recorded scene.
  0x0409: 'GW_DELETE_SCENE_CFM', // Acknowledge to GW_DELETE_SCENE_REQ.
  0x040A: 'GW_RENAME_SCENE_REQ', // Request a scene to be renamed.
  0x040B: 'GW_RENAME_SCENE_CFM', // Acknowledge to GW_RENAME_SCENE_REQ.
  0x040C: 'GW_GET_SCENE_LIST_REQ', // Request a list of scenes.
  0x040D: 'GW_GET_SCENE_LIST_CFM', // Acknowledge to GW_GET_SCENE_LIST.
  0x040E: 'GW_GET_SCENE_LIST_NTF', // Acknowledge to GW_GET_SCENE_LIST.
  0x040F: 'GW_GET_SCENE_INFOAMATION_REQ', // Request extended information for one given scene.
  0x0410: 'GW_GET_SCENE_INFOAMATION_CFM', // Acknowledge to GW_GET_SCENE_INFOAMATION_REQ.
  0x0411: 'GW_GET_SCENE_INFOAMATION_NTF', // Acknowledge to GW_GET_SCENE_INFOAMATION_REQ.
  0x0412: 'GW_ACTIVATE_SCENE_REQ', // Request gateway to enter a scene.
  0x0413: 'GW_ACTIVATE_SCENE_CFM', // Acknowledge to GW_ACTIVATE_SCENE_REQ.
  0x0415: 'GW_STOP_SCENE_REQ', // Request all nodes in a given scene to stop at their current position.
  0x0416: 'GW_STOP_SCENE_CFM', // Acknowledge to GW_STOP_SCENE_REQ.
  0x0419: 'GW_SCENE_INFORMATION_CHANGED_NTF', // A scene has either been changed or removed.
  0x0447: 'GW_ACTIVATE_PRODUCTGROUP_REQ', // Activate a product group in a given direction.
  0x0448: 'GW_ACTIVATE_PRODUCTGROUP_CFM', // Acknowledge to GW_ACTIVATE_PRODUCTGROUP_REQ.
  0x0449: 'GW_ACTIVATE_PRODUCTGROUP_NTF', // Acknowledge to GW_ACTIVATE_PRODUCTGROUP_REQ.
  0x0460: 'GW_GET_CONTACT_INPUT_LINK_LIST_REQ', // Get list of assignments to all Contact Input to scene or product group.
  0x0461: 'GW_GET_CONTACT_INPUT_LINK_LIST_CFM', // Acknowledge to GW_GET_CONTACT_INPUT_LINK_LIST_REQ.
  0x0462: 'GW_SET_CONTACT_INPUT_LINK_REQ', // Set a link from a Contact Input to a scene or product group.
  0x0463: 'GW_SET_CONTACT_INPUT_LINK_CFM', // Acknowledge to GW_SET_CONTACT_INPUT_LINK_REQ.
  0x0464: 'GW_REMOVE_CONTACT_INPUT_LINK_REQ', // Remove a link from a Contact Input to a scene.
  0x0465: 'GW_REMOVE_CONTACT_INPUT_LINK_CFM', // Acknowledge to GW_REMOVE_CONTACT_INPUT_LINK_REQ.
  0x0500: 'GW_GET_ACTIVATION_LOG_HEADER_REQ', // Request header from activation log.
  0x0501: 'GW_GET_ACTIVATION_LOG_HEADER_CFM', // Confirm header from activation log.
  0x0502: 'GW_CLEAR_ACTIVATION_LOG_REQ', // Request clear all data in activation log.
  0x0503: 'GW_CLEAR_ACTIVATION_LOG_CFM', // Confirm clear all data in activation log.
  0x0504: 'GW_GET_ACTIVATION_LOG_LINE_REQ', // Request line from activation log.
  0x0505: 'GW_GET_ACTIVATION_LOG_LINE_CFM', // Confirm line from activation log.
  0x0506: 'GW_ACTIVATION_LOG_UPDATED_NTF', // Confirm line from activation log.
  0x0507: 'GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_REQ', // Request lines from activation log.
  0x0508: 'GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_NTF', // Error log data from activation log.
  0x0509: 'GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_CFM', // Confirm lines from activation log.
  0x2000: 'GW_SET_UTC_REQ', // Request to set UTC time.
  0x2001: 'GW_SET_UTC_CFM', // Acknowledge to GW_SET_UTC_REQ.
  0x2002: 'GW_RTC_SET_TIME_ZONE_REQ', // Set time zone and daylight savings rules.
  0x2003: 'GW_RTC_SET_TIME_ZONE_CFM', // Acknowledge to GW_RTC_SET_TIME_ZONE_REQ.
  0x2004: 'GW_GET_LOCAL_TIME_REQ', // Request the local time based on current time zone and daylight savings rules.
  0x2005: 'GW_GET_LOCAL_TIME_CFM', // Acknowledge to GW_RTC_SET_TIME_ZONE_REQ.
  0x3000: 'GW_PASSWORD_ENTER_REQ', // Enter password to authenticate request
  0x3001: 'GW_PASSWORD_ENTER_CFM', // Acknowledge to GW_PASSWORD_ENTER_REQ
  0x3002: 'GW_PASSWORD_CHANGE_REQ', // Request password change.
  0x3003: 'GW_PASSWORD_CHANGE_CFM', // Acknowledge to GW_PASSWORD_CHANGE_REQ.
  0x3004: 'GW_PASSWORD_CHANGE_NTF' // Acknowledge to GW_PASSWORD_CHANGE_REQ. Broadcasted to all connected clients.
})

const commands = {}
for (const id in commandsById) {
  commands[commandsById[id]] = parseInt(id)
}
Object.freeze(commands)

const manufacturersById = {
  1: 'VELUX',
  2: 'Somfy',
  3: 'Honeywell',
  4: 'Hörmann',
  5: 'ASSA ABLOY',
  6: 'Niko',
  7: 'WINDOW MASTER',
  8: 'Renson',
  9: 'CIAT',
  10: 'Secuyou',
  11: 'OVERKIZ',
  12: 'Atlantic Group'
}

/** Velux error.
  * @hideconstructor
  * @extends Error
  * @memberof VeluxClient
  */
class VeluxError extends Error {
  constructor (message, request = null) {
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
  constructor (id, cmd, data) {
    /** @member {integer} - The request ID.
      */
    this.id = id

    /** @member {integer} - The request command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the request command.
      */
    this.cmdName = commandsById[cmd]
    if (!this.cmdName?.endsWith('_REQ')) {
      throw new SyntaxError(
        `cmd: 0x${toHexString(cmd, 4)}: unknown request command ID`
      )
    }

    /** @member {string} - The name of the associated response command.
      */
    this.resName = this.cmdName.slice(0, -3) + 'CFM'

    if (data != null) {
      if (!Buffer.isBuffer(data)) {
        throw new SyntaxError('data: not a Buffer')
      }
      if (data.length > 250) {
        throw new SyntaxError('data: more than 250 bytes')
      }
    }
    /** @member {buffer} - The request data.
      */
    this.data = data
  }
}

/** Velux response.
  * @hideconstructor
  * @memberof VeluxClient
  */
class VeluxResponse {
  constructor (request, cmd, data) {
    if (!(request instanceof VeluxRequest)) {
      throw new SyntaxError('request: not a VeluxRequest')
    }
    /** @member {?VeluxClient.Request} - The request that generated the response.
      */
    this.request = request

    /** @member {integer} - The response command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the response command.
      */
    this.cmdName = commandsById[cmd]
    if (!this.cmdName?.endsWith('_CFM')) {
      throw new SyntaxError(
        `cmd: 0x${toHexString(cmd, 4)}: unknown response command ID`
      )
    }
    if (this.request.cmdName.slice(0, -3) !== this.cmdName.slice(0, -3)) {
      throw new SyntaxError(
        `cmd: 0x${toHexString(cmd, 4)}: not a response to 0x${toHexString(request.cmd, 4)}`
      )
    }

    if (data != null && !Buffer.isBuffer(data)) {
      throw new SyntaxError('data: not a Buffer')
    }
    /** @member {Buffer} - The response data.
      */
    this.data = data
  }
}

/** Velux notification.
  * @hideconstructor
  * @memberof VeluxClient
  */
class VeluxNotification {
  constructor (cmd, data) {
    /** @member {integer} - The notification command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the notification command.
      */
    this.cmdName = commandsById[cmd]
    /** @member {string} - The name of the response command.
      */
    this.cmdName = commandsById[cmd]
    if (!this.cmdName?.endsWith('_NTF')) {
      throw new SyntaxError(
        `cmd: ${toHexString(cmd, 4)}: unknown notification command ID`
      )
    }

    /** @member {buffer} - The notification data.
      */
    this.data = data
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
  static get protocolId () { return 0 }

  /** Create a new VeluxClient instance.
    *
    * @param {object} params - Parameters.
    * @param {string} params.host - Hostname and port of the KLF 200 gateway.
    */
  constructor (params = {}) {
    super()
    this._params = {
      blockSize: 1024,
      password: 'uUYYzHrU63',
      port: 51200,
      timeout: 15
    }
    const optionParser = new OptionParser(this._params)
    optionParser
      .hostKey()
      .intKey('timeout', 1, 60)
      .parse(params)
    this._name = this._params.hostname
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
        /** Emitted when client has connected to KLF 200 gateway.
          * @event VeluxClient#connect
          * @param {string} host - The hostname and port.
          */
        this.emit('connect', this.address + ':' + this.port)
      })
      .on('close', () => {
        /** Emitted when client has disconnected KLF 200 gateway.
          * @event VeluxClient#disconnect
          * @param {string} host - The hostname and port.
          */
        this.emit('disconnect', this.address + ':' + this.port)
        this._client = null
      })
      .on('data', (data) => {
        /** Emitted when client has disconnected KLF 200 gateway.
          * @event VeluxClient#disconnect
          * @param {string} host - The hostname and port.
          */
        this.receive(decode(data))
      })
      .on('error', (error) => {
        /** Emitted in case of error.
          * @event VeluxClient#error
          * @param {VeluxClient.VeluxError} error - The error.
          */
        this.emit('error', new VeluxError(error.message, this._request))
      })
    try {
      await once(this._client, 'secureConnect')
      this._requestId = 0
      await this.gwPasswordEnter(this._params.password)
    } catch (error) {
      throw new VeluxError(error.message, this._request)
    }
  }

  async disconnect () {
    if (this._client != null) {
      await this._client.destroy()
      this._client = null
    }
  }

  async gwPasswordEnter (password) {
    const data = Buffer.allocUnsafe(32).fill(0)
    data.write(password)
    const response = await this.send(commands.GW_PASSWORD_ENTER_REQ, data)
    const status = response.readUInt8()
    return (status === 0)
  }

  async gwPasswordChange (oldPassword, newPassword) {
    const data = Buffer.allocUnsafe(64).fill(0)
    data.write(oldPassword)
    data.write(newPassword, 32)
    const response = await this.send(commands.GW_PASSWORD_CHANGE_REQ, data)
    const status = response.readUInt8()
    return (status === 0)
  }

  async gwGetVersion () {
    const response = await this.send(commands.GW_GET_VERSION_REQ)
    const sw = []
    for (let i = 0; i < 6; i++) {
      sw.push(response.readUInt8(i))
    }
    return {
      softwareVersion: sw.join('.'),
      hardwareVersion: response.readUInt8(6),
      productGroup: response.readUInt8(7), // 14
      productType: response.readUInt8(8) // 3
    }
  }

  async gwGetProtocolVersion () {
    const response = await this.send(commands.GW_GET_PROTOCOL_VERSION_REQ)
    const major = response.readUint16BE(0)
    const minor = response.readUInt16BE(2)
    return major + '.' + minor
  }

  async gwGetState () {
    const response = await this.send(commands.GW_GET_STATE_REQ)
    return {
      gatewayState: response.readUint8(0),
      subState: response.readUint8(1)
    }
  }

  async gwCsGetSystemtableData () {
    const response = []
    this.on('GW_CS_GET_SYSTEMTABLE_DATA_NTF', (data) => {
      const nEntries = data.readUInt8(0)
      for (let i = 0; i < nEntries; i++) {
        const index = data.readUInt8(11 * i + 1)
        const address = data.readUInt8(11 * i + 2) << 16 |
          data.readUInt8(11 * i + 3) << 8 |
          data.readUInt8(11 * i + 4)
        const actuatorType = data.readUInt16BE(11 * 1 + 5)
        const powerState = data.readUInt8(11 * i + 7)
        const manufacturerId = data.readUInt8(11 * i + 8)
        const backbone = data.readUInt8(11 * i + 9) << 16 |
          data.readUInt8(11 * i + 10) << 8 |
          data.readUInt8(11 * i + 11)
        response.push({
          index,
          address: '0x' + toHexString(address, 6),
          actuatorType: {
            _raw: toHexString(actuatorType, 4),
            type: (actuatorType & 0xFFC0) >> 6,
            subtype: actuatorType & 0x3F
          },
          powerState: {
            _raw: '0x' + toHexString(powerState, 2),
            powerSaveMode: powerState & 0x03,
            ioMembership: (powerState & 0x04) >> 2,
            rfSupport: (powerState & 0x08) >> 3,
            turnaroundTime: (powerState & 0xC0) >> 6
          },
          manufacturer: manufacturersById[manufacturerId] ?? '0x' + toHexString(manufacturerId, 2),
          backbone: '0x' + toHexString(backbone, 6)
        })
      }
      if (data.readUInt8(nEntries * 11 + 1) === 0) {
        this.emit('GW_CS_GET_SYSTEMTABLE_DATA_DONE')
      }
    })
    await this.send(commands.GW_CS_GET_SYSTEMTABLE_DATA_REQ)
    await once(this, 'GW_CS_GET_SYSTEMTABLE_DATA_DONE')
    this.removeAllListeners('GW_CS_GET_SYSTEMTABLE_DATA_NTF')
    return response
  }

  async send (cmd, data = null) {
    this._request = new VeluxRequest(++this._requestId, cmd, data)
    this.emit('request', this._request)

    const len = data?.length ?? 0
    const buf = Buffer.alloc(len + 5)
    buf[0] = VeluxClient.protocolId
    buf[1] = len + 3
    buf.writeUint16BE(cmd, 2)
    if (data != null) {
      data.copy(buf, 4)
    }
    let checksum = 0
    for (let i = 0; i < buf.length; i++) {
      checksum ^= buf[i]
    }
    buf.writeUint8(checksum, len + 4)
    this.emit('send', buf)
    await this._client.write(encode(buf))

    const a = await once(this, this._request.cmdName.slice(0, -3) + 'CFM')
    this._request = null
    return a[0]
  }

  receive (buf) {
    this.emit('data', buf)
    if (buf[0] !== VeluxClient.protocolId) {
      this.emit('error', new VeluxError(`${toHexString(buf[0], 2)}: invalid protocol`))
      return
    }
    let checksum = 0
    for (let i = 0; i < buf.length - 1; i++) {
      checksum ^= buf[i]
    }
    if (buf[buf.length - 1] !== checksum) {
      this.emit('error', new VeluxError(`${buf[buf.length - 1]}: invalid checksum (expected: ${checksum})`))
      return
    }
    const cmd = buf.readUInt16BE(2)
    const data = buf.subarray(4, -1)

    const cmdName = commandsById[cmd]
    if (cmdName == null) {
      this.emit('error', new VeluxError(`0x${toHexString(cmd, 4)}: invalid command ID`))
      return
    }
    if (cmdName.endsWith('_NTF')) {
      const notification = new VeluxNotification(cmd, data)
      this.emit('notification', notification)
      this.emit(notification.cmdName, data)
      return
    }
    if (cmdName.endsWith('_CFM')) {
      try {
        const response = new VeluxResponse(this._request, cmd, data)
        this.emit('response', response)
        this.emit(response.cmdName, data)
        return
      } catch (error) { }
    }
    this.emit('error', new VeluxError(`0x${toHexString(cmd, 4)} (${cmdName}): unexpected command`))
  }
}

export { VeluxClient }
