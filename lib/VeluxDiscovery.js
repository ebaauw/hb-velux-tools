// hb-velux-tools/lib/VeluxDiscovery.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Homebridge Velux Tools.

import { EventEmitter } from 'node:events'

import { timeout } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import mdns from 'mdns'

/** Velux Integra KLF200 gateway discovery.
  * <br>See {@link VeluxDiscovery}.
  * @name VeluxDiscovery
  * @type {Class}
  * @memberof module:hb-velux-tools
  */

/** Class for discovery of Velux Integra KLF200 gateways.
  *
  */
class VeluxDiscovery extends EventEmitter {
  /** Create a new instance
    * @param {object} params - Parameters.
    * @param {integer} [params.timeout=5] - Timeout (in seconds) for requests.
    */
  constructor (params = {}) {
    super()
    this.gatewayMap = {}
    this._options = {
      timeout: 5
    }
    const optionParser = new OptionParser(this._options)
    optionParser
      .intKey('timeout', 1, 60)
      .parse(params)
  }

  /** Disover Velix Integra KLF 200 gateways using mDNS.
    * @return {object} response - Response object with a key/value pair per
    * found gateway.  The key is the host (IP address or hostname), the value is
    * the ...
    */
  async discover () {
    const gatewayMap = {}
    const browser = mdns.createBrowser(mdns.tcp('http'))
    browser.on('serviceUp', (obj) => {
      if (!obj.name.startsWith('VELUX_KLF_LAN_')) {
        return
      }
      /** Emitted when a potential gateway has been found.
        * @event HueDiscovery#found
        * @param {string} name - The name of the search method.
        * @param {string} id - The ID of the gateway.
        * @param {string} host - The IP address/hostname of the gateway.
        */
      this.emit('found', 'mdns', obj.name, obj.host)
      // this.emit('found', 'mdns', obj.name, obj.addresses[0])
      gatewayMap[obj.host] = { name: obj.name }
    })
    this.emit('searching', 'mdns', '224.0.0.251:5353')
    browser.start()
    await timeout(this._options.timeout * 1000)
    browser.stop()
    this.emit('searchDone', 'mdns')
    return gatewayMap
  }
}

export { VeluxDiscovery }
