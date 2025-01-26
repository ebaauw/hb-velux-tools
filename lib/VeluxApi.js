// hb-velux-tools/lib/VeluxClient.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Homebridge Velux Tools.

// import { isIPv4 } from 'node:net'

import { toHexString } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

function checkData (data, length) {
  if (!Buffer.isBuffer(data)) {
    throw new Error('invalid data')
  }
  if (data.length !== length) {
    throw new Error(`${data.length}: invalid data length (expected ${length})`)
  }
}

function decodeActuatorType (actuatorType) {
  return {
    0x0040: 'Interior Venetian Blind',
    0x0080: 'Roller Shutter',
    0x0081: 'Roller Shutter with Adjustable Slats',
    0x0082: 'Roller Shutter with Projection',
    0x00C0: 'Vertical Exterior Awning',
    0x0100: 'Window Opener',
    0x0101: 'Window Opener with Rain Sensor',
    0x0140: 'Garage Door Opener',
    0x017A: 'Garage Door Opener',
    0x0180: 'Light',
    0x01BA: 'On/Off Light',
    0x01C0: 'Gate Opener',
    0x01FA: 'Gate Opener',
    0x0240: 'Door Lock',
    0x0241: 'Window Lock',
    0x0280: 'Vertical Interior Blinds',
    0x0340: 'Dual Roller Shutter',
    0x03C0: 'On/Off Switch',
    0x0400: 'Horizontal Awning',
    0x0440: 'Exterior Venetian Blind',
    0x0480: 'Louver Blind',
    0x04C0: 'Curtain Track',
    0x0500: 'Ventilation Point',
    0x0501: 'Air Inlet',
    0x0502: 'Air Transfer',
    0x0503: 'Air Outlet',
    0x0540: 'Exterior Heating',
    0x057A: 'Exterior Heating',
    0x0600: 'Swinging Shutters',
    0x0601: 'Swinging Shutter'
  }[actuatorType] ?? '0x' + toHexString(actuatorType, 4)
}

function decodeGroupInformation (data) {
  checkData(data, 99)
  const groupType = data.readUint8(70)
  const nNodes = data.readUInt8(71)
  const nodeIds = []
  if (groupType === 0 && nNodes > 0) { // User.
    let mask
    for (let i = 0; i < 200; i++) {
      if (i % 8 === 0) {
        mask = data.readUint8(72 + i / 8)
      }
      if (mask & 0x01) {
        nodeIds.push(i)
      }
      mask >>= 1
    }
  }
  return {
    groupId: data.readUInt8(0),
    order: data.readUInt16BE(1),
    placement: data.readUInt8(3),
    name: data.subarray(4, data.indexOf(0, 4)).toString(),
    velocity: decodeVelocity(data.readUInt8(68)),
    nodeVariation: data.readUInt16BE(69),
    groupType,
    nNodes,
    nodeIds,
    revision: data.readUInt16BE(97)
  }
}

function decodeIpv4 (ipv4) {
  return [
    ((ipv4 & 0xFF000000) >> 24) & 0xFF,
    (ipv4 & 0x00FF0000) >> 16,
    (ipv4 & 0x0000FF00) >> 8,
    ipv4 & 0x000000FF
  ].join('.')
}

function encodeIpv4 (ipv4) {
  const a = ipv4.split('.')
  return a[0] << 24 | a[1] << 16 | a[2] << 8 | a[3]
}

function decodeManufacturerId (manufacturerId) {
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

function decodeNodeInformation (data) {
  checkData(data, 124)
  return {
    nodeId: data.readUInt8(0),
    placement: data.readUInt8(3),
    name: data.subarray(4, data.indexOf(0, 4)).toString(),
    velocity: decodeVelocity(data.readUInt8(68)),
    nodeType: data.readUInt16BE(69),
    // nodeType: decodeType(data.readUInt16BE(69)),
    productGroup: data.readUInt16BE(69),
    productType: data.readUint8(72),
    nodeVariation: data.readUint8(73),
    powerMode: data.readUint8(74),
    buildNumber: data.readUint8(75),
    serialNumber: data.toString('hex', 76, 83).toUpperCase(),
    state: data.readUint8(84),
    currentPosition: decodePosition(data.readUint16BE(85)),
    targetPosition: decodePosition(data.readUint16BE(87)),
    // fp1Position: decodePosition(data.readUint16BE(89)),
    // fp2Position: decodePosition(data.readUint16BE(91)),
    // fp3Position: decodePosition(data.readUint16BE(93)),
    // fp4Position: decodePosition(data.readUint16BE(95)),
    remainingTime: data.readUint16BE(97),
    timeStamp: new Date(data.readUint32BE(99) * 1000).toISOString(),
    nAlias: data.readUInt8(103)
  }
}

function decodeNodeParameter (parameter) {
  if (parameter === 0x00) {
    return 'MP'
  }
  if (parameter <= 0x10) {
    return 'FP' + parameter``
  }
  if (parameter === 0xFF) {
    return 'not used'
  }
  return toHexString(parameter, 2)
}

function decodePosition (position) {
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

function encodePosition (position) {
  switch (position) {
    case 'target': return 0xD100
    case 'current': return 0xD200
    case 'default': return 0xD300
    case 'ignore': return 0xD400
    default:
      return position * 0x0200
  }
}

function decodePowerState (powerState) {
  return {
    // _raw: '0x' + toHexString(powerState, 2),
    powerSaveMode: powerState & 0x03,
    ioMembership: (powerState & 0x04) >> 2,
    rfSupport: (powerState & 0x08) >> 3,
    turnaroundTime: (powerState & 0xC0) >> 6
  }
}

function decodeRunStatus (runStatus) {
  return {
    0x00: 'completed',
    0x01: 'failed',
    0x02: 'active'
  }[runStatus] ?? '0x' + toHexString(runStatus, 2)
}

function decodeSessionStatus (data) {
  checkData(data, 3)
  const sessionId = data.readUInt16BE(0)
  const status = data.readUInt8(2)
  if (status === 0) {
    throw new Error('request failed')
  }
  return { sessionId }
}

function decodeStatus (data, message = 'request failed') {
  checkData(data, 1)
  const status = data.readUInt8()
  if (status !== 0) {
    throw new Error(message)
  }
}

function decodeStatusId (data, id = 'nodeId') {
  checkData(data, 2)
  const status = data.readUInt8()
  if (status === 0) {
    const response = {}
    response[id] = data.readUInt8(1)
    return response
  }
  const message = {
    1: 'request failed',
    2: 'invalid ' + id
  }[status] ?? 'status ' + status
  throw new Error(message)
}

// function decodeType (fullType) {
//   return {
//     // _raw: toHexString(type, 4),
//     type: (fullType & 0xFFC0) >> 6,
//     subtype: fullType & 0x3F
//   }
// }

function decodeVelocity (velocity) {
  return {
    0: 'default',
    1: 'slow',
    2: 'fast',
    255: 'not supported'
  }[velocity] ?? '0x' + toHexString(velocity, 2)
}

function encodeVelocity (velocity) {
  return {
    default: 0,
    slow: 1,
    fast: 2
  }[velocity] ?? 0
}

/** Gateway API commands.
  */
const commands = Object.freeze({
  // ===== 5. Authentication ==================================================

  /** 5.1.1 - Enter password to authenticate request
    * @member {function}
    * @params {String} password
    * @returns true
    */
  GW_PASSWORD_ENTER_REQ: { // 5.1.1 - Enter password to authenticate request
    id: 0x3000,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toString('params.password', params.password, true, userInput)
      const data = Buffer.allocUnsafe(32).fill(0)
      data.write(params.password)
      params.password = params.password.replace(/./g, '*')
      return data
    }
  },
  GW_PASSWORD_ENTER_CFM: { // 5.1.2 - Acknowledge to GW_PASSWORD_ENTER_REQ
    id: 0x3001,
    req: 0x3000, // GW_PASSWORD_ENTER_REQ
    decode: (data) => {
      return decodeStatus(data, 'invalid password')
    }
  },
  GW_PASSWORD_CHANGE_REQ: { // 5.1.3 - Request password change.
    id: 0x3002,
    ntf: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toString('params.oldPassword', params.oldPassword, true, userInput)
      OptionParser.toString('params.newPassword', params.newPassword, true, userInput)
      const data = Buffer.allocUnsafe(64).fill(0)
      data.write(params.oldPassword)
      params.oldPassword = params.oldPassword.replace(/./g, '*')
      data.write(params.newPassword, 32)
      params.newPassword = params.newPassword.replace(/./g, '*')
      return data
    }
  },
  GW_PASSWORD_CHANGE_CFM: { // 5.1.4 - Acknowledge to GW_PASSWORD_CHANGE_REQ.
    id: 0x3003,
    req: 0x3002, // GW_PASSWORD_CHANGE_REQ
    decode: (data) => {
      checkData(data, 1)
      const status = data.readUInt8()
      if (status !== 0) {
        throw new Error('invalid password')
      }
    }
  },
  GW_PASSWORD_CHANGE_NTF: { // 5.1.5 - Acknowledge to GW_PASSWORD_CHANGE_REQ. Broadcasted to all connected clients.
    id: 0x3004,
    req: 0x3002, // GW_PASSWORD_CHANGE_REQ
    decode: (data, session) => {
      checkData(data, 32)
      session.result = {
        password: data.subarray(0, data.indexOf(0)).toString()
      }
      session.emit('done')
      return session.result
    }
  },

  // ===== 6. General Commands ================================================

  GW_GET_VERSION_REQ: { // 6.1.1 - Request version information.
    id: 0x0008
  },
  GW_GET_VERSION_CFM: { // 6.1.2 Acknowledge to GW_GET_VERSION_REQ command.
    id: 0x0009,
    req: 0x0008, // GW_GET_VERSION_REQ
    decode (data) {
      checkData(data, 9)
      const sw = []
      // for (let i = 0; i < 6; i++) {
      for (let i = 1; i < 5; i++) {
        sw.push(data.readUInt8(i))
      }
      return {
        softwareVersion: sw.join('.'),
        hardwareVersion: data.readUInt8(6),
        productGroup: data.readUInt8(7), // 14
        productType: data.readUInt8(8) // 3
      }
    }
  },
  GW_GET_PROTOCOL_VERSION_REQ: { // 6.1.3 - Request KLF 200 API protocol version.
    id: 0x000A
  },
  GW_GET_PROTOCOL_VERSION_CFM: { // 6.1.4 - Acknowledge to GW_GET_PROTOCOL_VERSION_REQ command.
    id: 0x000B,
    req: 0x000A, // GW_GET_PROTOCOL_VERSION_REQ
    decode (data) {
      checkData(data, 4)
      return {
        api: data.readUint16BE(0) + '.' + data.readUInt16BE(2)
      }
    }
  },
  GW_GET_STATE_REQ: { // 6.2.1 - Request the state of the gateway
    id: 0x000C
  },
  GW_GET_STATE_CFM: { // 6.2.2 - Acknowledge to GW_GET_STATE_REQ command.
    id: 0x000D,
    req: 0x000C, // GW_GET_STATE_REQ
    decode (data) {
      checkData(data, 6)
      return {
        gatewayState: data.readUint8(0),
        subState: data.readUint8(1)
        // stateData: data.readUIntBE(32, 2)
      }
    }
  },
  GW_LEAVE_LEARN_STATE_REQ: { // 6.3.1 - Request gateway to leave learn state.
    id: 0x000E
  },
  GW_LEAVE_LEARN_STATE_CFM: { // 6.3.2 - Acknowledge to GW_LEAVE_LEARN_STATE_REQ command.
    id: 0x000F,
    req: 0x000E, // GW_LEAVE_LEARN_STATE_REQ
    decode: (data) => {
      return decodeStatus(data)
    }
  },
  GW_SET_UTC_REQ: { // 6.4.1- Request to set UTC time.
    id: 0x2000,
    encode: () => {
      // Set current time.
      const data = Buffer.allocUnsafe(4)
      const utc = (new Date()).getTime() / 1000
      data.writeUint32BE(utc, 0)
      return data
    }
  },
  GW_SET_UTC_CFM: { // 6.4.2 - Acknowledge to GW_SET_UTC_REQ.
    id: 0x2001,
    req: 0x2000 // GW_SET_UTC_REQ
  },
  GW_RTC_SET_TIME_ZONE_REQ: { // 6.4.3 - Set time zone and daylight savings rules.
    id: 0x2002,
    encode () {
      // Set time zone to UTC
      const data = Buffer.allocUnsafe(2).fill(0)
      data.write(':')
      return data
    }
  },
  GW_RTC_SET_TIME_ZONE_CFM: { // 6.4.4 - Acknowledge to GW_RTC_SET_TIME_ZONE_REQ.
    id: 0x2003,
    req: 0x2002, // GW_RTC_SET_TIME_ZONE_REQ
    decode: (data) => {
      return decodeStatus(data)
    }
  },
  GW_GET_LOCAL_TIME_REQ: { // 6.4.5 - Request the local time based on current time zone and daylight savings rules.
    id: 0x2004
  },
  GW_GET_LOCAL_TIME_CFM: { // 6.4.6 - Acknowledge to GW_RTC_SET_TIME_ZONE_REQ.
    id: 0x2005,
    req: 0x2004, // GW_GET_LOCAL_TIME_REQ
    decode: (data) => {
      checkData(data, 15)
      return {
        time: (new Date(data.readUint32BE(0) * 1000)).toISOString()
      }
    }
  },
  GW_REBOOT_REQ: { // 6.5.1 - Request gateway to reboot.
    id: 0x0001
  },
  GW_REBOOT_CFM: { // 6.5.2 - Acknowledge to GW_REBOOT_REQ command.
    id: 0x0002,
    req: 0x0001 // GW_REBOOT_REQ
  },
  GW_SET_FACTORY_DEFAULT_REQ: { // 6.6.1 - Request gateway to clear system table, scene table and set Ethernet settings to factory default. Gateway will reboot.
    id: 0x0003
  },
  GW_SET_FACTORY_DEFAULT_CFM: { // 6.6.2 - Acknowledge to GW_SET_FACTORY_DEFAULT_REQ command.
    id: 0x0004,
    req: 0x0003 // GW_SET_FACTORY_DEFAULT_REQ
  },
  GW_GET_NETWORK_SETUP_REQ: { // 6.8.1 - Request network parameters.
    id: 0x00E0
  },
  GW_GET_NETWORK_SETUP_CFM: { // 6.8.2 - Acknowledge to GW_GET_NETWORK_SETUP_REQ.
    id: 0x00E1,
    req: 0x00E0, // GW_GET_NETWORK_SETUP_REQ
    decode: (data) => {
      checkData(data, 13)
      return {
        address: decodeIpv4(data.readUInt32BE(0)),
        mask: decodeIpv4(data.readUInt32BE(4)),
        gateway: decodeIpv4(data.readUInt32BE(8)),
        dhcp: data.readUInt8(12) !== 0
      }
    }
  },
  GW_SET_NETWORK_SETUP_REQ: { // 6.9.1 - Set network parameters.
    id: 0x00E2,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toHost('params.address', params.address, userInput)
      OptionParser.toHost('params.mask', params.mask, userInput)
      OptionParser.toHost('params.gateway', params.gateway, userInput)
      OptionParser.toBool('params.dhcp', params.dhcp, userInput)
      const data = Buffer.allocUnsafe(31).fill(0)
      data.writeUInt32BE(encodeIpv4(params.address, 0))
      data.writeUInt32BE(encodeIpv4(params.mask, 4))
      data.writeUInt32BE(encodeIpv4(params.gateway, 8))
      data.writeUInt8(params.dhcp ? 1 : 0)
      return data
    },
    cfm: 0x00E3 // GW_SET_NETWORK_SETUP_CFM
  },
  GW_SET_NETWORK_SETUP_CFM: { // 6.9.2 - Acknowledge to GW_SET_NETWORK_SETUP_REQ.
    id: 0x00E3,
    req: 0x00E2 // GW_SET_NETWORK_SETUP_REQ
  },
  GW_ERROR_NTF: { // 6.10 - Provides information on what triggered the error.
    id: 0x0000,
    decode: (data) => {
      checkData(data, 1)
      const error = data.readUInt8(0)
      const message = {
        0: 'generic error',
        1: 'invalid command',
        2: 'invalid frame',
        7: 'busy - try again later',
        8: 'invalid node',
        12: 'not authenticated'
      }[error] ?? 'error ' + error
      throw new Error(message)
    }
  },

  // ===== 7. Configuration Service ===========================================

  GW_CS_GET_SYSTEMTABLE_DATA_REQ: { // 7.2 - Request a list of nodes in the gateways system table.
    id: 0x0100,
    ntf: true
  },
  GW_CS_GET_SYSTEMTABLE_DATA_CFM: { // 7.3 - Acknowledge to GW_CS_GET_SYSTEMTABLE_DATA_REQ
    id: 0x0101,
    req: 0x0100 // GW_CS_GET_SYSTEMTABLE_DATA_REQ
  },
  GW_CS_GET_SYSTEMTABLE_DATA_NTF: { // 7.4 - Acknowledge to GW_CS_GET_SYSTEM_TABLE_DATA_REQList of nodes in the gateways systemtable.
    id: 0x0102,
    req: 0x0100, // GW_CS_GET_SYSTEMTABLE_DATA_REQ
    decode: (data, session) => {
      const result = []
      const nEntries = data.readUInt8(0)
      checkData(data, 2 + nEntries * 11)
      for (let i = 0; i < nEntries; i++) {
        const entry = {
          nodeId: data.readUInt8(11 * i + 1),
          // address: '0x' + toHexString(
          //   data.readUInt8(11 * i + 2) << 16 |
          //   data.readUInt8(11 * i + 3) << 8 |
          //   data.readUInt8(11 * i + 4), 6
          // ),
          actuatorType: data.readUInt16BE(11 * 1 + 5),
          // actuatorType: decodeType(data.readUInt16BE(11 * 1 + 5)),
          powerState: decodePowerState(data.readUInt8(11 * i + 7)),
          manufacturer: decodeManufacturerId(data.readUInt8(11 * i + 8))
          // backbone: '0x' + toHexString(
          //   data.readUInt8(11 * i + 9) << 16 |
          //   data.readUInt8(11 * i + 10) << 8 |
          //   data.readUInt8(11 * i + 11), 6
          // )
        }
        entry.model = decodeActuatorType(entry.actuatorType)
        result.push(entry)
        session.result.push(entry)
      }
      if (data.readUInt8(nEntries * 11 + 1) === 0) { // remainingNEntries
        session.emit('done')
      }
      return result
    }
  },
  GW_CS_DISCOVER_NODES_REQ: { // 7.5.1 - Start CS DiscoverNodes macro in KLF200.
    id: 0x0103,
    ntf: true
  },
  GW_CS_DISCOVER_NODES_CFM: { // 7.5.2 - Acknowledge to GW_CS_DISCOVER_NODES_REQ command.
    id: 0x0104,
    req: 0x0103 // GW_CS_DISCOVER_NODES_REQ
  },
  GW_CS_DISCOVER_NODES_NTF: { // 7.5.3 - Acknowledge to GW_CS_DISCOVER_NODES_REQ command.
    id: 0x0105,
    req: 0x0103 // GW_CS_DISCOVER_NODES_REQ
  },
  GW_CS_REMOVE_NODES_REQ: { // 7.6.1 - Remove one or more nodes in the systemtable.
    id: 0x0106
  },
  GW_CS_REMOVE_NODES_CFM: { // 7.6.2 - Acknowledge to GW_CS_REMOVE_NODES_REQ.
    id: 0x0107,
    req: 0x0106 // GW_CS_REMOVE_NODES_REQ
  },
  GW_CS_VIRGIN_STATE_REQ: { // 7.7.1 - Clear systemtable and delete system key.
    id: 0x0108
  },
  GW_CS_VIRGIN_STATE_CFM: { // 7.7.2 - Acknowledge to GW_CS_VIRGIN_STATE_REQ.
    id: 0x0109,
    req: 0x0108 // GW_CS_VIRGIN_STATE_REQ
  },
  GW_CS_CONTROLLER_COPY_REQ: { // 7.8.1 - Setup KLF200 to get or give a system to or from another io-homecontrol® remote control. By a system means all nodes in the systemtable and the system key.
    id: 0x010A,
    ntf: true
  },
  GW_CS_CONTROLLER_COPY_CFM: { // 7.8.2 - Acknowledge to GW_CS_CONTROLLER_COPY_REQ.
    id: 0x010B,
    req: 0x010A // GW_CS_CONTROLLER_COPY_REQ
  },
  GW_CS_CONTROLLER_COPY_NTF: { // 7.8.3 - Acknowledge to GW_CS_CONTROLLER_COPY_REQ.
    id: 0x010C,
    req: 0x010A // GW_CS_CONTROLLER_COPY_REQ
  },
  GW_CS_CONTROLLER_COPY_CANCEL_NTF: { // 7.8.4 - Cancellation of system copy to other controllers.
    id: 0x010D,
    req: 0x010A // GW_CS_CONTROLLER_COPY_REQ
  },
  GW_CS_GENERATE_NEW_KEY_REQ: { // 7.9.1 - Generate new system key and update actuators in systemtable.
    id: 0x0113,
    ntf: true
  },
  GW_CS_GENERATE_NEW_KEY_CFM: { // 7.9.2 - Acknowledge to GW_CS_GENERATE_NEW_KEY_REQ.
    id: 0x0114,
    req: 0x0113 // GW_CS_GENERATE_NEW_KEY_REQ
  },
  GW_CS_GENERATE_NEW_KEY_NTF: { // 7.9.3 - Acknowledge to GW_CS_GENERATE_NEW_KEY_REQ with status.
    id: 0x0115,
    req: 0x0113 // GW_CS_GENERATE_NEW_KEY_REQ
  },
  GW_CS_RECEIVE_KEY_REQ: { // 7.10.1 - Receive system key from another controller.
    id: 0x010E,
    ntf: true
  },
  GW_CS_RECEIVE_KEY_CFM: { // 7.10.2 - Acknowledge to GW_CS_RECEIVE_KEY_REQ.
    id: 0x010F,
    req: 0x010E // GW_CS_RECEIVE_KEY_REQ
  },
  GW_CS_RECEIVE_KEY_NTF: { // 7.10.3 - Acknowledge to GW_CS_RECEIVE_KEY_REQ with status.
    id: 0x0110,
    req: 0x010E // GW_CS_RECEIVE_KEY_REQ
  },
  GW_CS_REPAIR_KEY_REQ: { // 7.11.1 - Update key in actuators holding an old key.
    id: 0x0116,
    ntf: true
  },
  GW_CS_REPAIR_KEY_CFM: { // 7.11.2 - Acknowledge to GW_CS_REPAIR_KEY_REQ.
    id: 0x0117,
    req: 0x0116 // GW_CS_REPAIR_KEY_REQ
  },
  GW_CS_REPAIR_KEY_NTF: { // 7.11.3 - Acknowledge to GW_CS_REPAIR_KEY_REQ with status.
    id: 0x0118,
    req: 0x0116 // GW_CS_REPAIR_KEY_REQ
  },
  GW_CS_PGC_JOB_NTF: { // 7.12.4 - Information on Product Generic Configuration job initiated by press on PGC button.
    id: 0x0111
  },
  GW_CS_SYSTEM_TABLE_UPDATE_NTF: { // 7.13.1 - Broadcasted to all clients and gives information about added and removed actuator nodes in system table.
    id: 0x0112
  },
  GW_CS_ACTIVATE_CONFIGURATION_MODE_REQ: { // 7.14.1 - Request one or more actuator to open for configuration.
    id: 0x0119
  },
  GW_CS_ACTIVATE_CONFIGURATION_MODE_CFM: { // 7.14.2 - Acknowledge to GW_CS_ACTIVATE_CONFIGURATION_MODE_REQ.
    id: 0x011A,
    req: 0x0119 // GW_CS_ACTIVATE_CONFIGURATION_MODE_REQ
  },

  // ===== 8. Information Service =============================================

  GW_HOUSE_STATUS_MONITOR_ENABLE_REQ: { // 8.2.1 - Enable house status monitor.
    id: 0x0240
  },
  GW_HOUSE_STATUS_MONITOR_ENABLE_CFM: { // 8.2.2 - Acknowledge to GW_HOUSE_STATUS_MONITOR_ENABLE_REQ.
    id: 0x0241,
    req: 0x0240 // GW_HOUSE_STATUS_MONITOR_ENABLE_REQ
  },
  GW_HOUSE_STATUS_MONITOR_DISABLE_REQ: { // 8.2.3 - Disable house status monitor.
    id: 0x0242
  },
  GW_HOUSE_STATUS_MONITOR_DISABLE_CFM: { // 8.2.4 - Acknowledge to GW_HOUSE_STATUS_MONITOR_DISABLE_REQ.
    id: 0x0243,
    req: 0x0242 // GW_HOUSE_STATUS_MONITOR_DISABLE_REQ
  },
  GW_GET_NODE_INFORMATION_REQ: { // 8.3.1 - Request extended information of one specific actuator node.
    id: 0x0200,
    ntf: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.nodeId', params.nodeId, 0, 199, userInput)
      const data = Buffer.allocUnsafe(1)
      data.writeUInt8(params.nodeId)
      return data
    }
  },
  GW_GET_NODE_INFORMATION_CFM: { // 8.3.2 - Acknowledge to GW_GET_NODE_INFORMATION_REQ.
    id: 0x0201,
    req: 0x0200, // GW_GET_NODE_INFORMATION_REQ
    decode: (data, session) => {
      return decodeStatusId(data)
    }
  },
  GW_GET_NODE_INFORMATION_NTF: { // 8.3.3 - Acknowledge to GW_GET_NODE_INFORMATION_REQ.
    id: 0x0210,
    req: 0x0200, // GW_GET_NODE_INFORMATION_REQ
    decode: (data, session) => {
      session.result = decodeNodeInformation(data)
      session.emit('done')
      return session.result
    }
  },
  GW_SET_NODE_VARIATION_REQ: { // 8.3.4 - Set node variation.
    id: 0x0206
  },
  GW_SET_NODE_VARIATION_CFM: { // 8.3.5 - Acknowledge to GW_SET_NODE_VARIATION_REQ.
    id: 0x0207,
    req: 0x0206 // GW_SET_NODE_VARIATION_REQ
  },
  GW_SET_NODE_NAME_REQ: { // 8.3.6 - Set node name.
    id: 0x0208,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.nodeId', params.nodeId, 0, 199, userInput)
      OptionParser.toString('params.name', params.name, true, userInput)
      const data = Buffer.allocUnsafe(65).fill(0)
      data.writeUInt8(params.nodeId, 0)
      data.write(params.name, 1)
      return data
    }
  },
  GW_SET_NODE_NAME_CFM: { // 8.3.7 - Acknowledge to GW_SET_NODE_NAME_REQ.
    id: 0x0209,
    req: 0x0208, // GW_SET_NODE_NAME_REQ
    decode: (data, session) => {
      return decodeStatusId(data)
    }
  },
  GW_NODE_INFORMATION_CHANGED_NTF: { // 8.3.8 - Information has been updated.
    id: 0x020C,
    decode: (data) => {
      return {
        nodeId: data.readUInt8(0),
        name: data.subarray(1, data.indexOf(0, 1)).toString(),
        order: data.readUInt16BE(65),
        placement: data.readUInt8(67),
        nodeVariation: data.readUInt8(68)
      }
    }
  },
  GW_NODE_STATE_POSITION_CHANGED_NTF: { // 8.3.9 - Information has been updated.
    id: 0x0211,
    decode: (data) => {
      return {
        nodeId: data.readUInt8(0),
        state: data.readUInt8(1),
        currentPosition: decodePosition(data.readUInt16BE(2)),
        targetPosition: decodePosition(data.readUInt16BE(4)),
        // fp1Position: decodePosition(data.readUint16BE(6)),
        // fp2Position: decodePosition(data.readUint16BE(8)),
        // fp3Position: decodePosition(data.readUint16BE(10)),
        // fp4Position: decodePosition(data.readUint16BE(12)),
        remainingTime: data.readUint16BE(14)
        // timeStamp: new Date(data.readUint32BE(16) * 1000).toISOString()
      }
    }
  },
  GW_GET_ALL_NODES_INFORMATION_REQ: { // 8.3.10 - Request extended information of all nodes.
    id: 0x0202,
    ntf: true
  },
  GW_GET_ALL_NODES_INFORMATION_CFM: { // 8.3.11 - Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ
    id: 0x0203,
    req: 0x0202, // GW_GET_ALL_NODES_INFORMATION_CFM
    decode: (data, session) => {
      checkData(data, 2)
      if (data.readUInt8(0) !== 0) { // status
        throw new Error('system table empty')
      }
      return {
        nNodes: data.readUInt8(1)
      }
    }
  },
  GW_GET_ALL_NODES_INFORMATION_NTF: { // 8.3.12 - Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ. Holds node information
    id: 0x0204,
    req: 0x0202, // GW_GET_ALL_NODES_INFORMATION_CFM
    decode: (data, session) => {
      const payload = decodeNodeInformation(data)
      session.result.push(payload)
      return payload
    }
  },
  GW_GET_ALL_NODES_INFORMATION_FINISHED_NTF: { // 8.3.13 - Acknowledge to GW_GET_ALL_NODES_INFORMATION_REQ. No more nodes.
    id: 0x0205,
    req: 0x0202, // GW_GET_ALL_NODES_INFORMATION_CFM
    decode: (data, session) => {
      session.emit('done')
    }
  },
  GW_SET_NODE_ORDER_AND_PLACEMENT_REQ: { // 8.3.14 - Set search order and room placement.
    id: 0x020D
  },
  GW_SET_NODE_ORDER_AND_PLACEMENT_CFM: { // 8.3.15 - Acknowledge to GW_SET_NODE_ORDER_AND_PLACEMENT_REQ.
    id: 0x020E,
    req: 0x020D // GW_SET_NODE_ORDER_AND_PLACEMENT_REQ
  },
  GW_GET_GROUP_INFORMATION_REQ: { // 8.4.1 - Request information about all defined groups.
    id: 0x0220,
    ntf: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.groupId', params.groupId, 0, 99, userInput)
      const data = Buffer.allocUnsafe(1)
      data.writeUInt8(params.groupId)
      return data
    }
  },
  GW_GET_GROUP_INFORMATION_CFM: { // 8.4.2 - Acknowledge to GW_GET_GROUP_INFORMATION_REQ.
    id: 0x0221,
    req: 0x0220, // GW_GET_GROUP_INFORMATION_REQ
    decode: (data, session) => {
      decodeStatusId(data, 'groupId')
    }
  },
  GW_GET_GROUP_INFORMATION_NTF: { // 8.4.3 - Acknowledge to GW_GET_GROUP_INFORMATION_REQ.
    id: 0x0230,
    req: 0x0220, // GW_GET_GROUP_INFORMATION_REQ
    decode: (data, session) => {
      session.result = decodeGroupInformation(data)
      session.emit('done')
      return session.result
    }
  },
  GW_NEW_GROUP_REQ: { // 8.4.4 - Request new group to be created.
    id: 0x0227
  },
  GW_NEW_GROUP_CFM: { // 8.4.5 - Acknowledge to GW_NEW_GROUP_REQ.
    id: 0x0228,
    req: 0x0227 // GW_NEW_GROUP_REQ
  },
  GW_SET_GROUP_INFORMATION_REQ: { // 8.4.6 - Change an existing group.
    id: 0x0222
  },
  GW_SET_GROUP_INFORMATION_CFM: { // 8.4.7 - Acknowledge to GW_SET_GROUP_INFORMATION_REQ.
    id: 0x0223,
    req: 0x0222 // GW_SET_GROUP_INFORMATION_REQ
  },
  GW_DELETE_GROUP_REQ: { // 8.4.8 - Delete a group.
    id: 0x0225,
    ntf: true
  },
  GW_DELETE_GROUP_CFM: { // 8.4.9 - Acknowledge to GW_DELETE_GROUP_INFORMATION_REQ.
    id: 0x0226,
    req: 0x0225 // GW_DELETE_GROUP_REQ
  },
  GW_GROUP_DELETED_NTF: { // 8.4.10 - GW_GROUP_DELETED_NTF is broadcasted to all, when a group has been removed.
    id: 0x022D,
    req: 0x0225 // GW_DELETE_GROUP_REQ
  },
  GW_GET_ALL_GROUPS_INFORMATION_REQ: { // 8.4.11 - Request information about all defined groups.
    id: 0x0229,
    ntf: true,
    encode: (params) => {
      const data = Buffer.alloc(2).fill(0)
      data.writeUInt8(0, 0)
      data.writeUInt8(2, 1)
      return data
    }
  },
  GW_GET_ALL_GROUPS_INFORMATION_CFM: { // 8.4.12 - Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
    id: 0x022A,
    req: 0x0229, // GW_GET_ALL_GROUPS_INFORMATION_REQ
    decode: (data, session) => {
      checkData(data, 2)
      if (data.readUInt8(0) !== 0) { // status
        throw new Error('system table empty')
      }
      return {
        nGroups: data.readUInt8(1)
      }
    }
  },
  GW_GET_ALL_GROUPS_INFORMATION_NTF: { // 8.4.13 - Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
    id: 0x022B,
    req: 0x0229, // GW_GET_ALL_GROUPS_INFORMATION_REQ
    decode: (data, session) => {
      const payload = decodeGroupInformation(data)
      session.result.push(payload)
      return payload
    }
  },
  GW_GET_ALL_GROUPS_INFORMATION_FINISHED_NTF: { // 8.4.14 - Acknowledge to GW_GET_ALL_GROUPS_INFORMATION_REQ.
    id: 0x022C,
    req: 0x0229, // GW_GET_ALL_GROUPS_INFORMATION_REQ
    decode: (data, session) => {
      session.emit('done')
    }
  },
  GW_GROUP_INFORMATION_CHANGED_NTF: { // 8.4.15 - Broadcast to all, about group information of a group has been changed.
    id: 0x0224
  },

  // ===== 9. Activation Log ==================================================

  GW_GET_ACTIVATION_LOG_HEADER_REQ: { // 9.1.1 - Request header from activation log.
    id: 0x0500
  },
  GW_GET_ACTIVATION_LOG_HEADER_CFM: { // 9.1.2 - Confirm header from activation log.
    id: 0x0501,
    req: 0x0500 // GW_GET_ACTIVATION_LOG_HEADER_REQ
  },
  GW_CLEAR_ACTIVATION_LOG_REQ: { // 9.1.3 - Request clear all data in activation log.
    id: 0x0502
  },
  GW_CLEAR_ACTIVATION_LOG_CFM: { // 9.1.4 - Confirm clear all data in activation log.
    id: 0x0503,
    req: 0x0502 // GW_CLEAR_ACTIVATION_LOG_REQ
  },
  GW_GET_ACTIVATION_LOG_LINE_REQ: { // 9.1.5 - Request line from activation log.
    id: 0x0504
  },
  GW_GET_ACTIVATION_LOG_LINE_CFM: { // 9.1.6 - Confirm line from activation log.
    id: 0x0505,
    req: 0x0504 // GW_GET_ACTIVATION_LOG_LINE_REQ
  },
  GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_REQ: { // 9.1.7 - Request lines from activation log.
    id: 0x0507,
    ntf: true
  },
  GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_NTF: { // 9.1.8 - Error log data from activation log.
    id: 0x0508,
    req: 0x0507 // GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_REQ
  },
  GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_CFM: { // 9.1.9 Confirm lines from activation log.
    id: 0x0509,
    req: 0x0507 // GW_GET_MULTIPLE_ACTIVATION_LOG_LINES_REQ
  },
  GW_ACTIVATION_LOG_UPDATED_NTF: { // 9.1.10 - Confirm line from activation log.
    id: 0x0506
  },

  // ===== 10. Command Handler ================================================

  GW_COMMAND_SEND_REQ: { // 10.1.1 - Send activating command direct to one or more io-homecontrol® nodes.
    id: 0x0300,
    ntf: true,
    session: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.sessionId', params.sessionId)
      params.nodeIds = OptionParser.toArray('params.nodeIds', params.nodeIds, userInput)
      const data = Buffer.allocUnsafe(66).fill(0)
      data.writeUInt16BE(params.sessionId, 0)
      data.writeUInt8(1, 2) // CommandOriginator: User
      data.writeUInt8(3, 3) // Priority Level: User Level 2
      // data.writeUInt8(0, 4) // ParameterActive: Main Parameter
      // data.writeUInt8(0, 5) // FPI1
      // data.writeUInt8(0, 6) // FPI1
      data.writeUInt16BE(encodePosition(params.position), 7)
      data.writeUInt8(params.nodeIds.length, 41)
      for (let i = 0; i < params.nodeIds.length; i++) {
        OptionParser.toNumber(`params.nodeIds[${i}]`, params.nodeIds[i], 0, 199, userInput)
        data.writeUInt8(params.nodeIds[i], 42 + i)
      }
      // data.writeUInt8(0, 62) // PriorityLevelLock
      // data.writeUInt8(0, 63) // PL_0_3
      // data.writeUInt8(0, 64) // PL_4_7
      // data.writeUInt8(0, 65) // LockTime
      return data
    }
  },
  GW_COMMAND_SEND_CFM: { // 10.1.2 - Acknowledge to GW_COMMAND_SEND_REQ.
    id: 0x0301,
    decode: (data) => {
      return decodeSessionStatus(data)
    }
  },
  GW_COMMAND_RUN_STATUS_NTF: { // 10.1.3 - Gives run status for io-homecontrol® node.
    id: 0x0302,
    decode: (data) => {
      checkData(data, 13)
      return {
        sessionId: data.readUInt16BE(0),
        status: data.readUInt8(2),
        nodeId: data.readUInt8(3),
        nodeParameter: decodeNodeParameter(data.readUInt8(4)),
        currentPosition: decodePosition(data.readUInt16BE(5)),
        runStatus: decodeRunStatus(data.readUInt8(7)),
        statusReply: data.readUInt8(8),
        informationCode: '0x' + toHexString(data.readUInt32BE(9), 8)
      }
    }
  },
  GW_COMMAND_REMAINING_TIME_NTF: { // 10.1.4 - Gives remaining time before io-homecontrol® node enter target position.
    id: 0x0303,
    decode: (data) => {
      checkData(data, 6)
      return {
        sessionId: data.readUInt16BE(0),
        nodeId: data.readUInt8(2),
        nodeParameter: decodeNodeParameter(data.readUInt8(3)),
        duration: data.readUInt16BE(4)
      }
    }
  },
  GW_SESSION_FINISHED_NTF: { // 10.1.5 - Command send, Status request, Wink, Mode or Stop session is finished.
    id: 0x0304,
    sessionDone: true,
    decode: (data) => {
      checkData(data, 2)
      return { sessionId: data.readUInt16BE(0) }
    }
  },
  GW_STATUS_REQUEST_REQ: { // 10.3.1 - Get status request from one or more io-homecontrol® nodes.
    id: 0x0305,
    ntf: true,
    session: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.sessionId', params.sessionId)
      params.nodeIds = OptionParser.toArray('params.nodeIds', params.nodeIds, userInput)
      const data = Buffer.allocUnsafe(26).fill(0)
      data.writeUInt16BE(params.sessionId, 0)
      data.writeUInt8(params.nodeIds.length, 2)
      for (let i = 0; i < params.nodeIds.length; i++) {
        OptionParser.toNumber(`params.nodeIds[${i}]`, params.nodeIds[i], 0, 199, userInput)
        data.writeUInt8(params.nodeIds[i], 3 + i)
      }
      data.writeUInt8(3, 23) // Status Type: request main info
      // data.writeUInt8(0, 24) // FPI1
      // data.writeUInt8(0, 25) // FPI1
      return data
    }
  },
  GW_STATUS_REQUEST_CFM: { // 10.3.2 - Acknowledge to GW_STATUS_REQUEST_REQ.
    id: 0x0306,
    decode: (data) => {
      return decodeSessionStatus(data)
    }
  },
  GW_STATUS_REQUEST_NTF: { // 10.3.3 - Status request from one or more io-homecontrol® nodes.
    id: 0x0307,
    decode: (data) => {
      checkData(data, 18)
      return {
        sessionId: data.readUInt16BE(0),
        status: data.readUInt8(2),
        nodeId: data.readUInt8(3),
        runStatus: decodeRunStatus(data.readUInt8(4)),
        statusReply: data.readUInt8(5),
        statusType: data.readUInt8(6),
        targetPosition: decodePosition(data.readUInt16BE(7)),
        currentPosition: decodePosition(data.readUInt16BE(9)),
        remainingTime: data.readUInt16BE(11),
        lastMasterExecutionAddress: '0x' + toHexString(data.readUInt32BE(13), 8),
        lastCommandOriginator: data.readUInt8(17)
      }
    }
  },
  GW_WINK_SEND_REQ: { // 10.4.1 - Request from one or more io-homecontrol® nodes to Wink.
    id: 0x0308,
    ntf: true,
    session: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.sessionId', params.sessionId)
      params.nodeIds = OptionParser.toArray('params.nodeIds', params.nodeIds, userInput)
      const data = Buffer.allocUnsafe(27).fill(0)
      data.writeUInt16BE(params.sessionId, 0)
      data.writeUInt8(1, 2) // CommandOriginator: User
      data.writeUInt8(3, 3) // Priority Level: User Level 2
      data.writeUInt8(1, 4) // Wink Status: Enable Wink
      data.writeUInt8(254, 5) // Wink Time: Manufacturer-Specific Wink Time
      data.writeUInt8(params.nodeIds.length, 6)
      for (let i = 0; i < params.nodeIds.length; i++) {
        OptionParser.toNumber(`params.nodeIds[${i}]`, params.nodeIds[i], 0, 199, userInput)
        data.writeUInt8(params.nodeIds[i], 7 + i)
      }
      return data
    }
  },
  GW_WINK_SEND_CFM: { // 10.4.2 - Acknowledge to GW_WINK_SEND_REQ
    id: 0x0309,
    decode: (data) => {
      return decodeSessionStatus(data)
    }
  },
  GW_WINK_SEND_NTF: { // 10.4.4 - Status info for performed wink request.
    id: 0x030A,
    sessionDone: true,
    decode: (data) => {
      checkData(data, 2)
      return { sessionId: data.readUInt16BE(0) }
    }
  },
  GW_SET_LIMITATION_REQ: { // 10.5.2 - Set a parameter limitation in an actuator.
    id: 0x0310,
    session: true
  },
  GW_SET_LIMITATION_CFM: { // 10.5.3 - Acknowledge to GW_SET_LIMITATION_REQ.
    id: 0x0311,
    req: 0x0310 // GW_SET_LIMITATION_REQ
  },
  GW_LIMITATION_STATUS_NTF: { // 10.5.4 - Hold information about limitation.
    id: 0x0314
  },
  GW_GET_LIMITATION_STATUS_REQ: { // 10.5.8 - Get parameter limitation in an actuator.
    id: 0x0312,
    session: true
  },
  GW_GET_LIMITATION_STATUS_CFM: { // 10.5.9 - Acknowledge to GW_GET_LIMITATION_STATUS_REQ.
    id: 0x0313,
    req: 0x0312 // GW_GET_LIMITATION_STATUS_REQ
  },
  GW_MODE_SEND_REQ: { // 10.6.1 - Send Activate Mode to one or more io-homecontrol® nodes.
    id: 0x0320
  },
  GW_MODE_SEND_CFM: { // 10.6.2 - Acknowledge to GW_MODE_SEND_REQ
    id: 0x0321,
    req: 0x0320 // GW_MODE_SEND_REQ
  },
  // GW_MODE_SEND_NTF: { // (undocumented) - Notify with Mode activation info.
  //   id: 0x0322
  //   // req: 0x0320 // GW_MODE_SEND_REQ
  // },
  GW_ACTIVATE_PRODUCTGROUP_REQ: { // 10.7.1 - Activate a product group in a given direction.
    id: 0x0447,
    ntf: true,
    session: true,
    encode: (params, userInput = false) => {
      OptionParser.toObject('params', params, userInput)
      OptionParser.toNumber('params.sessionId', params.sessionId)
      OptionParser.toNumber('params.groupId', params.groupId, 0, 199, userInput)
      OptionParser.toString('params.velocity', true, userInput)

      const data = Buffer.allocUnsafe(13).fill(0)
      data.writeUInt16BE(params.sessionId, 0)
      data.writeUInt8(1, 2) // Command Originator: User
      data.writeUInt8(3, 3) // Priority Level: User Level 2
      data.writeUInt8(params.groupId, 3, 4)
      // data.writeUInt8(0, 5) // Parameter ID: Main Parameter
      data.writeUInt16BE(encodePosition(params.position), 6)
      data.writeUInt8(encodeVelocity(params.velocity), 8)
      // data.writeUInt8(0, 9) // PriorityLevelLock
      // data.writeUInt8(0, 10) // PL_0_3
      // data.writeUInt8(0, 11) // PL_4_7
      // data.writeUInt8(0, 12) // LockTime
      return data
    }
  },
  GW_ACTIVATE_PRODUCTGROUP_CFM: { // 10.7.2 - Acknowledge to GW_ACTIVATE_PRODUCTGROUP_REQ.
    id: 0x0448,
    decode: (data) => {
      checkData(data, 3)
      const status = data.readUInt8(2)
      if (status === 0) {
        return {
          sessionId: data.readUInt16BE(0)
        }
      }
      const message = {
        1: 'unknown groupId',
        2: 'sessionId already in use',
        3: 'busy - try again later',
        4: 'invalid group type',
        5: 'request failed',
        6: 'invalid parameter'
      }[status] ?? 'status ' + status
      throw new Error(message)
    }
  },
  // GW_ACTIVATE_PRODUCTGROUP_NTF: { // (undocumented) - Acknowledge to GW_ACTIVATE_PRODUCTGROUP_REQ.
  //   id: 0x0449
  //   // req: 0x0447 // GW_ACTIVATE_PRODUCTGROUP_REQ
  // },

  // ===== 11. Scenes =========================================================

  GW_INITIALIZE_SCENE_REQ: { // 11.1.2 - Prepare gateway to record a scene.
    id: 0x0400,
    ntf: true
  },
  GW_INITIALIZE_SCENE_CFM: { // 11.1.3 - Acknowledge to GW_INITIALIZE_SCENE_REQ.
    id: 0x0401,
    req: 0x0400 // GW_INITIALIZE_SCENE_REQ
  },
  GW_INITIALIZE_SCENE_NTF: { // 11.1.4 - Acknowledge to GW_INITIALIZE_SCENE_REQ.
    id: 0x0402,
    req: 0x0400 // GW_INITIALIZE_SCENE_REQ
  },
  GW_INITIALIZE_SCENE_CANCEL_REQ: { // 11.2.1 - Cancel record scene process.
    id: 0x0403
  },
  GW_INITIALIZE_SCENE_CANCEL_CFM: { // 11.2.2 - Acknowledge to GW_INITIALIZE_SCENE_CANCEL_REQ command.
    id: 0x0404,
    req: 0x0403 // GW_INITIALIZE_SCENE_CANCEL_REQ
  },
  GW_RECORD_SCENE_REQ: { // 11.4.1 - Store actuator positions changes since GW_INITIALIZE_SCENE, as a scene.
    id: 0x0405,
    ntf: true
  },
  GW_RECORD_SCENE_CFM: { // 11.4.2 - Acknowledge to GW_RECORD_SCENE_REQ.
    id: 0x0406,
    req: 0x0405 // GW_RECORD_SCENE_REQ
  },
  GW_RECORD_SCENE_NTF: { // 11.4.3 - Acknowledge to GW_RECORD_SCENE_REQ.
    id: 0x0407,
    req: 0x0405 // GW_RECORD_SCENE_REQ
  },
  GW_DELETE_SCENE_REQ: { // 11.5.1 - Delete a recorded scene.
    id: 0x0408
  },
  GW_DELETE_SCENE_CFM: { // 11.5.2 - Acknowledge to GW_DELETE_SCENE_REQ.
    id: 0x0409,
    req: 0x0408 // GW_DELETE_SCENE_REQ
  },
  GW_RENAME_SCENE_REQ: { // 11.6.1 - Request a scene to be renamed.
    id: 0x040A
  },
  GW_RENAME_SCENE_CFM: { // (undocumented) - Acknowledge to GW_RENAME_SCENE_REQ.
    id: 0x040B,
    req: 0x040A // GW_RENAME_SCENE_REQ
  },
  GW_GET_SCENE_LIST_REQ: { // 11.7.1 - Request a list of scenes.
    id: 0x040C,
    ntf: true
  },
  GW_GET_SCENE_LIST_CFM: { // 11.7.2 - Acknowledge to GW_GET_SCENE_LIST.
    id: 0x040D,
    req: 0x040C // GW_GET_SCENE_LIST_REQ
  },
  GW_GET_SCENE_LIST_NTF: { // 11.7.3 - Acknowledge to GW_GET_SCENE_LIST.
    id: 0x040E,
    req: 0x040C // GW_GET_SCENE_LIST_REQ
  },
  GW_GET_SCENE_INFORMATION_REQ: { // 11.8.1 - Request extended information for one given scene.
    id: 0x040F,
    ntf: true
  },
  GW_GET_SCENE_INFORMATION_CFM: { // 11.8.2 - Acknowledge to GW_GET_SCENE_INFOAMATION_REQ.
    id: 0x0410,
    req: 0x040F // GW_GET_SCENE_INFORMATION_REQ
  },
  GW_GET_SCENE_INFORMATION_NTF: { // 11.8.3 - Acknowledge to GW_GET_SCENE_INFOAMATION_REQ.
    id: 0x0411,
    req: 0x040F // GW_GET_SCENE_INFORMATION_REQ
  },
  GW_SCENE_INFORMATION_CHANGED_NTF: { // 11.9.1 - A scene has either been changed or removed.
    id: 0x0419
  },
  GW_ACTIVATE_SCENE_REQ: { // 11.10.1 - Request gateway to enter a scene.
    id: 0x0412,
    session: true
  },
  GW_ACTIVATE_SCENE_CFM: { // 11.10.2 - Acknowledge to GW_ACTIVATE_SCENE_REQ.
    id: 0x0413,
    req: 0x0412 // GW_ACTIVATE_SCENE_REQ
  },
  GW_STOP_SCENE_REQ: { // 11.11.1 - Request all nodes in a given scene to stop at their current position.
    id: 0x0415,
    session: true
  },
  GW_STOP_SCENE_CFM: { // 11.11.2 Acknowledge to GW_STOP_SCENE_REQ.
    id: 0x0416,
    req: 0x0415 // GW_STOP_SCENE_REQ
  },

  // ===== 12. Contact Input ==================================================

  GW_SET_CONTACT_INPUT_LINK_REQ: { // 12.1.1 - Set a link from a Contact Input to a scene or product group.
    id: 0x0462
  },
  GW_SET_CONTACT_INPUT_LINK_CFM: { // 12.1.2 - Acknowledge to GW_SET_CONTACT_INPUT_LINK_REQ.
    id: 0x0463,
    req: 0x0462 // GW_SET_CONTACT_INPUT_LINK_REQ
  },
  GW_REMOVE_CONTACT_INPUT_LINK_REQ: { // 12.1.3 - Remove a link from a Contact Input to a scene.
    id: 0x0464
  },
  GW_REMOVE_CONTACT_INPUT_LINK_CFM: { // 12.1.4 - Acknowledge to GW_REMOVE_CONTACT_INPUT_LINK_REQ.
    id: 0x0465,
    req: 0x0464 // GW_REMOVE_CONTACT_INPUT_LINK_REQ
  },
  GW_GET_CONTACT_INPUT_LINK_LIST_REQ: { // 12.1.5 - Get list of assignments to all Contact Input to scene or product group.
    id: 0x0460
  },
  GW_GET_CONTACT_INPUT_LINK_LIST_CFM: { // 12.1.6 - Acknowledge to GW_GET_CONTACT_INPUT_LINK_LIST_REQ.
    id: 0x0461,
    req: 0x0460 // GW_GET_CONTACT_INPUT_LINK_LIST_REQ
  }
})

export { commands }
