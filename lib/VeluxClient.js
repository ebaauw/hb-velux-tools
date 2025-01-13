// hb-velux-tools/lib/VeluxClient.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Homebridge Velux Tools.

import { EventEmitter, once } from 'node:events'
import tls from 'node:tls'
import { format } from 'node:util'

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

function parseErrorNumber (errorNumber) {
  return {
    0: 'generic error',
    1: 'invalid command',
    2: 'invalid frame',
    7: 'busy - try again later',
    8: 'invalid system table index',
    12: 'not authenticated'
  }[errorNumber] ?? 'error ' + errorNumber
}

function parseManufacturerId (manufacturerId) {
  return {
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
  }[manufacturerId] ?? '0x' + toHexString(manufacturerId, 2)
}

function parsePosition (position) {
  switch (position) {
    case 0xD100: return 'target'
    case 0xD200: return 'current'
    case 0xD300: return 'default'
    case 0xD400: return 'ignore'
    case 0xF7FF: return 'unknown'
    default:
      if (position <= 0xC800) {
        return Math.round(position / 0x0200)
      }
      return 'relative ' + (Math.round((position - 0xC800) / 10) - 100)
  }
}

function parsePowerState (powerState) {
  return {
    _raw: '0x' + toHexString(powerState, 2),
    powerSaveMode: powerState & 0x03,
    ioMembership: (powerState & 0x04) >> 2,
    rfSupport: (powerState & 0x08) >> 3,
    turnaroundTime: (powerState & 0xC0) >> 6
  }
}

function parseType (type) {
  return {
    _raw: toHexString(type, 4),
    type: (type & 0xFFC0) >> 6,
    subtype: type & 0x3F
  }
}

function parseVelocity (velocity) {
  return {
    0: 'default',
    1: 'slow',
    2: 'fast',
    255: 'not supported'
  }[velocity] ?? '0x' + toHexString(velocity, 2)
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
  constructor (id, cmd, data, args) {
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

    if (data != null) {
      if (!Buffer.isBuffer(data)) {
        throw new SyntaxError('data: not a Buffer')
      }
      if (data.length > 250) {
        throw new SyntaxError('data: more than 250 bytes')
      }
    }
    /** @member {?Buffer} - The request data.
      */
    this.data = data

    /** @member {?*} - The request arguments
      */
    this.args = args
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
  constructor (cmd, data) {
    /** @member {integer} - The confirm or notification command ID.
      */
    this.cmd = cmd

    /** @member {string} - The name of the confirm or notification command.
      */
    this.cmdName = commandsById[cmd]
    if (this.cmdName == null) {
      throw new VeluxError(`${toHexString(cmd, 4)}: unknown command ID`)
    }
    if (!this.cmdName.endsWith('_CFM') && !this.cmdName.endsWith('_NTF')) {
      throw new VeluxError(
        `${this.cmdName} [${toHexString(cmd, 4)}]: unexpected command`
      )
    }

    /** @member {?Buffer} - The confirm or notification data.
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
    this._requestId = 0
    this._session = 0
    await this.GW_PASSWORD_ENTER_REQ(this._params.password)
  }

  async disconnect () {
    if (this._client != null) {
      await this._client.destroy()
      this._client = null
    }
  }

  /** Issue GW_PASSWORD_ENTER_REQ command.
    * @param {string} password - The password.
    */
  async GW_PASSWORD_ENTER_REQ (password) { // 5.1.1
    const data = Buffer.allocUnsafe(32).fill(0)
    data.write(password)
    return this.#send(commands.GW_PASSWORD_ENTER_REQ, data, {
      password: password.replace(/./g, '*')
    })
  }

  _GW_PASSWORD_ENTER_CFM (data) { // 5.1.2
    if (this.#checkError(data, 'invalid password')) {
      return
    }
    this.emit('_' + commands.GW_PASSWORD_ENTER_REQ)
  }

  /** Issue GW_PASSWORD_CHANGE_REQ command.
    * @param {string} oldPassword - The old password.
    * @param {string} newPassword - The new password.
    * @return {string} - The new password.
    */
  async GW_PASSWORD_CHANGE_REQ (oldPassword, newPassword) { // 5.1.3
    const data = Buffer.allocUnsafe(64).fill(0)
    data.write(oldPassword)
    data.write(newPassword, 32)
    return this.#send(commands.GW_PASSWORD_CHANGE_REQ, data, {
      oldPassword, newPassword
    })
  }

  _GW_PASSWORD_CHANGE_CFM (data) { // 5.1.4
    this.#checkError(data, 'invalid password')
  }

  _GW_PASSWORD_CHANGE_NTF (data) { // 5.1.5
    const response = data.subarray(0, data.indexOf(0)).toString()
    this.emit('_' + commands.GW_PASSWORD_CHANGE_REQ, response)
  }

  /** Issue GW_GET_VERSION_REQ command.
    * @return {Object} - The version info.
    */
  async GW_GET_VERSION_REQ () { // 6.1.1
    return this.#send(commands.GW_GET_VERSION_REQ)
  }

  _GW_GET_VERSION_CFM (data) { // 6.1.2
    const sw = []
    for (let i = 0; i < 6; i++) {
      sw.push(data.readUInt8(i))
    }
    const response = {
      softwareVersion: sw.join('.'),
      hardwareVersion: data.readUInt8(6),
      productGroup: data.readUInt8(7), // 14
      productType: data.readUInt8(8) // 3
    }
    this.emit('_' + commands.GW_GET_VERSION_REQ, response)
  }

  /** Issue GW_GET_PROTOCOL_VERSION_REQ command.
    * @return {string} - The protocol info.
    */
  async GW_GET_PROTOCOL_VERSION_REQ () { // 6.1.3
    return this.#send(commands.GW_GET_PROTOCOL_VERSION_REQ)
  }

  _GW_GET_PROTOCOL_VERSION_CFM (data) { // 6.1.4
    const response = data.readUint16BE(0) + '.' + data.readUInt16BE(2)
    this.emit('_' + commands.GW_GET_PROTOCOL_VERSION_REQ, response)
  }

  /** Issue GW_GET_STATE_REQ command.
    * @return {Object} - The gateway state.
    */
  async GW_GET_STATE_REQ () { // 6.2.1
    return this.#send(commands.GW_GET_STATE_REQ)
  }

  _GW_GET_STATE_CFM (data) { // 6.2.2
    const response = {
      gatewayState: data.readUint8(0),
      subState: data.readUint8(1)
    }
    this.emit('_' + commands.GW_GET_STATE_REQ, response)
  }

  /** Issue GW_LEAVE_LEARN_STATE_REQ command.
    */
  GW_LEAVE_LEARN_STATE_REQ () { // 6.3.1
    return this.#send(commands.GW_LEAVE_LEARN_STATE_REQ)
  }

  _GW_LEAVE_LEARN_STATE_CFM (data) { // 6.3.2
    if (this.#checkError(data)) {
      return
    }
    this.emit('_' + commands.GW_LEAVE_LEARN_STATE_REQ)
  }

  /** Issue GW_SET_UTC_REQ command.
    * @param [Date=now] time - The time.
    */
  async GW_SET_UTC_REQ (time = new Date()) { // 6.4.1
    const data = Buffer.allocUnsafe(4)
    const utc = time.getTime() / 1000
    data.writeUint32BE(utc, 0)
    return this.#send(commands.GW_SET_UTC_REQ, data)
  }

  _GW_SET_UTC_CFM (data) { // 6.4.2
    this.emit('_' + commands.GW_SET_UTC_REQ)
  }

  /** Issue GW_RTC_SET_TIME_ZONE_REQ command,
    * setting the time zone to UTC.
    */
  async GW_RTC_SET_TIME_ZONE_REQ () { // 6.4.3
    const data = Buffer.allocUnsafe(2).fill(0)
    Buffer.write(':')
    return this.#send(commands.GW_RTC_SET_TIME_ZONE_REQ, data)
  }

  _GW_RTC_SET_TIME_ZONE_CFM (data) { // 6.4.4
    if (this.#checkError(data)) {
      return
    }
    this.emit('_' + commands.GW_RTC_SET_TIME_ZONE_REQ)
  }

  /** Issue GW_GET_LOCAL_TIME_REQ command.
    * @returns {Date} time - The gateway's UTC time.
    */
  async GW_GET_LOCAL_TIME_REQ () { // 6.4.5
    return this.#send(commands.GW_GET_LOCAL_TIME_REQ)
  }

  _GW_GET_LOCAL_TIME_CFM (data) { // 6.4.6
    const time = new Date(data.readUint32BE(0) * 1000)
    this.emit('_' + commands.GW_GET_LOCAL_TIME_REQ, time)
  }

  /** Issue GW_REBOOT_REQ command.
    */
  async GW_REBOOT_REQ () { // 6.5.1
    return this.#send(commands.GW_REBOOT_REQ)
  }

  _GW_REBOOT_CFM (data) { // 6.5.2
    this.emit('_' + commands.GW_REBOOT_REQ)
  }

  _GW_ERROR_NTF (data) { // 6.10.1
    this.#emitError(parseErrorNumber(data.readUInt8(0)))
  }

  /** Issue GW_CS_GET_SYSTEMTABLE_DATA_REQ command.
    */
  async GW_CS_GET_SYSTEMTABLE_DATA_REQ () { // 7.2
    return this.#send(commands.GW_CS_GET_SYSTEMTABLE_DATA_REQ)
  }

  _GW_CS_GET_SYSTEMTABLE_DATA_CFM (data) { // 7.3
    this._GW_CS_GET_SYSTEMTABLE_DATA_REQ = []
  }

  _GW_CS_GET_SYSTEMTABLE_DATA_NTF (data) { // 7.4
    const nEntries = data.readUInt8(0)
    for (let i = 0; i < nEntries; i++) {
      this._GW_CS_GET_SYSTEMTABLE_DATA_REQ.push({
        index: data.readUInt8(11 * i + 1),
        address: '0x' + toHexString(
          data.readUInt8(11 * i + 2) << 16 |
          data.readUInt8(11 * i + 3) << 8 |
          data.readUInt8(11 * i + 4), 6
        ),
        actuatorType: parseType(data.readUInt16BE(11 * 1 + 5)),
        powerState: parsePowerState(data.readUInt8(11 * i + 7)),
        manufacturer: parseManufacturerId(data.readUInt8(11 * i + 8)),
        backbone: '0x' + toHexString(
          data.readUInt8(11 * i + 9) << 16 |
          data.readUInt8(11 * i + 10) << 8 |
          data.readUInt8(11 * i + 11), 6
        )
      })
    }
    if (data.readUInt8(nEntries * 11 + 1) === 0) {
      this.emit('_' + commands.GW_CS_GET_SYSTEMTABLE_DATA_REQ, this._GW_CS_GET_SYSTEMTABLE_DATA_REQ)
    }
  }

  async GW_GET_NODE_INFORMATION_REQ (index) { // 8.3.1
    const data = Buffer.allocUnsafe(1)
    data.writeUInt8(index)
    return this.#send(commands.GW_GET_NODE_INFORMATION_REQ, data, { index })
  }

  _GW_GET_NODE_INFORMATION_CFM (data) { // 8.3.2
    const status = data.readUInt8()
    if (status === 1) {
      this.#emitError('request failed')
    } else if (status === 2) {
      this.#emitError('invalid node index')
    } else if (status !== 0) {
      this.#emitError('status %d', status)
    }
  }

  _GW_GET_NODE_INFORMATION_NTF (data) { // 8.3.3
    const response = this._NODE_INFORMATION_NTF(data)
    this.emit('_' + commands.GW_GET_NODE_INFORMATION_REQ, response)
  }

  _NODE_INFORMATION_NTF (data) {
    return {
      index: data.readUInt8(0),
      placement: data.readUInt8(3),
      name: data.subarray(4, data.indexOf(0, 4)).toString(),
      velocity: parseVelocity(data.readUInt8(68)),
      nodeType: parseType(data.readUInt16BE(69)),
      productGroup: data.readUInt16BE(69),
      productType: data.readUint8(72),
      nodeVariation: data.readUint8(73),
      powerMode: data.readUint8(74),
      buildNumber: data.readUint8(75),
      serialNumber: data.toString('hex', 76, 83).toUpperCase(),
      state: data.readUint8(84),
      currentPosition: parsePosition(data.readUint16BE(85)),
      targetPosition: parsePosition(data.readUint16BE(87)),
      fp1Position: parsePosition(data.readUint16BE(89)),
      fp2Position: parsePosition(data.readUint16BE(91)),
      fp3Position: parsePosition(data.readUint16BE(93)),
      fp4Position: parsePosition(data.readUint16BE(95)),
      remainingTime: data.readUint16BE(97),
      timeStamp: new Date(data.readUint32BE(99) * 1000).toISOString()
    }
  }

  /** Issue GW_GET_ALL_NODES_INFORMATION_REQ command.
    */
  async GW_GET_ALL_NODES_INFORMATION_REQ () { // 8.3.10
    return this.#send(commands.GW_GET_ALL_NODES_INFORMATION_REQ)
  }

  _GW_GET_ALL_NODES_INFORMATION_CFM (data) { // 8.3.11
    if (this.#checkError(data)) {
      return
    }
    // const nNodes = data.readUInt8(1)
    this._GW_GET_ALL_NODES_INFORMATION_REQ = []
  }

  _GW_GET_ALL_NODES_INFORMATION_NTF (data) { // 8.3.12
    const response = this._NODE_INFORMATION_NTF(data)
    this._GW_GET_ALL_NODES_INFORMATION_REQ.push(response)
  }

  _GW_GET_ALL_NODES_INFORMATION_FINISHED_NTF (data) { // 8.3.13
    this.emit(
      '_' + commands.GW_GET_ALL_NODES_INFORMATION_REQ,
      this._GW_GET_ALL_NODES_INFORMATION_REQ
    )
  }

  async GW_STATUS_REQUEST_REQ (index) { // 10.3.1
    const data = Buffer.allocUnsafe(26).fill(0)
    data.writeUInt16BE(++this._session, 0)
    data.writeUInt8(2, 2) // one index
    data.writeUInt8(index, 3)
    data.writeUInt8(index + 1, 4)
    data.writeUInt8(3, 23) // request main info
    return this.#send(
      commands.GW_STATUS_REQUEST_REQ, data, { index }, '_s' + this._session
    )
  }

  _GW_STATUS_REQUEST_CFM (data) { // 10.3.2
    const session = data.readUInt16BE(0)
    const status = data.readUInt8(2)
    if (status === 0) {
      this.#emitError('session %d: request failed', session)
    }
    this['_' + session] = []
  }

  _GW_STATUS_REQUEST_NTF (data) { // 10.3.3
    const session = data.readUInt16BE(0)
    this['_' + session].push({
      session,
      status: data.readUInt8(2),
      index: data.readUInt8(3),
      runStatus: data.readUInt8(4),
      statusReply: data.readUInt8(5),
      statusType: data.readUInt8(6),
      targetPosition: parsePosition(data.readUInt16BE(7)),
      currentPosition: parsePosition(data.readUInt16BE(9)),
      remainingTime: data.readUInt16BE(11),
      lastMasterExecutionAddress: '0x' + toHexString(data.readUInt32BE(13)),
      lastCommandOriginator: data.readUInt8(17)
    })
  }

  _GW_SESSION_FINISHED_NTF (data) { // 10.3.4
    const session = data.readUInt16BE(0)
    this.emit('_s' + session, this['_' + session])
  }

  async #send (cmd, data = null, args = null, event = '_' + cmd) {
    this._request = new VeluxRequest(++this._requestId, cmd, data, args)
    /** Emitted when a request is sent to the gateway.
      * @event VeluxClient#request
      * @param {VeluxRequest} request - The request.
      */
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
    /** Emitted when data is sent to the gateway.
      * @event VeluxClient#send
      * @param {Buffer} data - The data sent.
      */
    this.emit('send', buf)
    await this._client.write(encode(buf))

    const a = await once(this, event)
    /** Emitted when a response has been collected from the gateway.
      * @event VeluxClient#response
      * @param {VeluxResponse} response - The response.
      */
    this.emit('response', new VeluxResponse(this._request, a[0]))
    this._request = null
    return a[0]
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
        '%s: invalid checksum (expected: %s)',
        toHexString(buf[buf.length - 1], 2), toHexString(checksum, 2)
      )
      return
    }
    const cmd = buf.readUInt16BE(2)
    const data = buf.subarray(4, -1)

    const notification = new VeluxNotification(cmd, data)
    /** Emitted when a notification (or confirmation) has been recevied
      * from the gateway.
      * @event VeluxClient#notification
      * @param {VeluxNotification} notification - The notification.
      */
    this.emit('notification', notification)

    const handler = '_' + notification.cmdName
    if (typeof this[handler] === 'function') {
      this[handler](data)
      return
    }
    this.#emitError(
      '%s [%s]: not yet implemented', notification.cmdName, toHexString(cmd, 4)
    )
  }

  #checkError (data, message = 'request failed') {
    const status = data.readUInt8()
    if (status !== 0) {
      this.#emitError(message)
      return true
    }
    return false
  }

  #emitError (...args) {
    const message = format(...args)
    this.emit('error', new VeluxError(message, this._request))
  }
}

export { VeluxClient }
