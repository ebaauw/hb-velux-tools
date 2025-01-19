// hb-velux-tools/lib/VeluxTool.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Command line interface to Velux Integra KLF 200 gateway.

import { toHexString } from 'hb-lib-tools'
import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import { VeluxClient } from 'hb-velux-tools/VeluxClient'
import { VeluxDiscovery } from 'hb-velux-tools/VeluxDiscovery'
const { commands } = VeluxClient

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  velux: `${b('velux')} [${b('-hVD')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]] [${b('-t')} ${u('timeout')}] ${u('command')} [${u('argument')} ...]`,

  discover: `${b('discover')} [${b('-h')}]`,
  info: `${b('info')} [${b('-h')}]`
}

const description = {
  velux: 'Command line interface to Velux Integra KLF 200 gateway.',

  discover: 'Discover KLF 200 gatways.',
  info: '...'
}

const help = {
  velux: `${description.velux}

Usage: ${usage.velux}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages for communication with KLF 200 gateway.

  ${b('-H')} ${u('hostname')}[${b(':')}${u('port')}], ${b('--host=')}${u('hostname')}[${b(':')}${u('port')}]
  Connect to KLF 200 at ${u('hostname')}${b(':51200')} or ${u('hostname')}${b(':')}${u('port')}.
  You can also specify the hostname and port in the ${b('VELUX_HOST')} environment variable.

  ${b('-t')} ${u('timeout')}
  Set timeout to ${u('timeout')} seconds instead of default ${b('5')}.

Commands:
  ${usage.discover}
  ${description.discover}

  ${usage.info}
  ${description.info}

For more help, issue: ${b('velux')} ${u('command')} ${b('-h')}`,
  discover: `${description.discover}

Usage: ${usage.discover}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.`,
  info: `${description.info}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.,
  `
}

class VeluxTool extends CommandLineTool {
  constructor (pkgJson) {
    super({ mode: 'command', debug: false })
    this.pkgJson = pkgJson
    this.usage = usage.velux
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    const clargs = {
      options: {
        host: process.env.VELUX_HOST,
        timeout: 5
      }
    }
    parser
      .help('h', 'help', help.velux)
      .version('V', 'version')
      .flag('D', 'debug', () => {
        if (this.vdebugEnabled) {
          this.setOptions({ vvdebug: true })
        } else if (this.debugEnabled) {
          this.setOptions({ vdebug: true })
        } else {
          this.setOptions({ debug: true, chalk: true })
        }
      })
      .option('H', 'host', (value) => {
        OptionParser.toHost('host', value, false, true)
        clargs.options.host = value
      })
      .option('t', 'timeout', (value) => {
        clargs.options.timeout = OptionParser.toInt('timeout', value, 1, 60, true)
      })
      .parameter('command', (value) => {
        if (usage[value] == null || typeof this[value] !== 'function') {
          throw new UsageError(`${value}: unknown command`)
        }
        clargs.command = value
      })
      .remaining((list) => { clargs.args = list })
      .parse()
    return clargs
  }

  async main () {
    try {
      this.usage = usage.velux
      const clargs = this.parseArguments()
      this.jsonFormatter = new JsonFormatter({ sortKeys: false })
      if (clargs.command === 'discover') {
        this.veluxDiscovery = new VeluxDiscovery({
          timeout: clargs.options.timeout
        })
        this.veluxDiscovery
          .on('error', (error) => {
            this.log(
              '%s: request %d: %s %s', error.request.name, error.request.id,
              error.request.method, error.request.resource
            )
            this.warn(
              '%s: request %d: error: %s', error.request.name, error.request.id, error
            )
          })
          .on('request', (request) => {
            this.debug(
              '%s: request %d: %s %s', request.name, request.id,
              request.method, request.resource
            )
            this.vdebug(
              '%s: request %d: %s %s', request.name, request.id,
              request.method, request.url
            )
          })
          .on('response', (response) => {
            this.vdebug(
              '%s: request %d: response: %j', response.request.name, response.request.id,
              response.body
            )
            this.debug(
              '%s: request %d: %d %s', response.request.name, response.request.id,
              response.statusCode, response.statusMessage
            )
          })
          .on('found', (name, id, address) => {
            this.debug('%s: found %s at %s', name, id, address)
          })
          .on('searching', (name, host) => {
            this.debug('%s: listening on %s', name, host)
          })
          .on('searchDone', (name) => { this.debug('%s: search done', name) })
      } else {
        if (clargs.options.host == null) {
          await this.fatal(`Missing host.  Set ${b('VELUX_HOST')} or specify ${b('-H')}.`)
        }
        const name = clargs.options.host
        this.client = new VeluxClient(clargs.options)
        this.client
          .on('connect', (host) => { this.debug('%s: connected to %s', name, host) })
          .on('disconnect', (host) => { this.debug('%s: disconnected from %s', name, host) })
          .on('error', (error) => {
            if (error.request == null) {
              this.warn('%s: error: %s', name, error)
              return
            }
            if (error.request.params == null) {
              this.log(
                '%s: request %d: %s', name, error.request.id, error.request.cmdName
              )
            } else {
              this.debug(
                '%s: request %d: %s %j', name, error.request.id, error.request.cmdName,
                error.request.params
              )
            }
            this.warn(
              '%s: request %d: error: %s', name, error.request.id, error
            )
          })
          .on('request', (request) => {
            if (request.params == null) {
              this.debug(
                '%s: request %d: %s', name, request.id, request.cmdName
              )
            } else {
              this.debug(
                '%s: request %d: %s %j', name, request.id, request.cmdName,
                request.params
              )
            }
            if (request.data == null) {
              this.vdebug(
                '%s: request %d: %s [%s]', name, request.id, request.cmdName,
                toHexString(request.cmd, 4)
              )
            } else {
              this.vdebug(
                '%s: request %d: %s [%s]: %s', name, request.id, request.cmdName,
                toHexString(request.cmd, 4), toHexString(request.data)
              )
            }
          })
          .on('response', (response) => {
            if (response.response == null) {
              this.debug(
                '%s: request %d: ok', name, response.request.id
              )
            } else {
              this.debug(
                '%s: request %d: response: %j', name, response.request.id,
                response.response
              )
            }
          })
          .on('notification', (notification) => {
            const req = notification.request != null
              ? 'request ' + notification.request.id + ': '
              : ''
            if (notification.data == null) {
              this.vdebug(
                '%s: %s%s [%s]', name, req, notification.cmdName,
                toHexString(notification.cmd, 4)
              )
            } else {
              this.vdebug(
                '%s: %s%s [%s]: %s', name, req, notification.cmdName,
                toHexString(notification.cmd, 4), toHexString(notification.data)
              )
            }
            if (notification.payload == null) {
              this.debug('%s: %s%s', name, req, notification.cmdName)
            } else {
              this.debug('%s: %s%s: %j', name, req, notification.cmdName,
                notification.payload
              )
            }
          })
          .on('send', (data) => {
            this.vvdebug('%s: send %s', name, toHexString(data))
          })
          .on('data', (data) => {
            this.vvdebug('%s: received %s', name, toHexString(data))
          })
      }
      this.name = 'velux ' + clargs.command
      this.usage = `${b('velux')} ${usage[clargs.command]}`
      this.parser = new CommandLineParser(this.pkgJson)
      this.parser.help('h', 'help', help[clargs.command])
      await this[clargs.command](clargs.args)
    } catch (error) {
      await this.fatal(error)
    }
  }

  async discover (...args) {
    this.parser.parse(...args)
    const gateways = await this.veluxDiscovery.discover()
    this.print(this.jsonFormatter.stringify(gateways))
  }

  async request (cmd, params) {
    try {
      const result = await this.client.request(cmd, params)
      if (result != null) {
        this.print(this.jsonFormatter.stringify(result))
      }
    } catch (error) {
      this.warn(error)
    }
  }

  async info (...args) {
    this.parser.parse(...args)
    this.debug('connecting...')
    await this.client.connect()
    await this.request(commands.GW_GET_VERSION_REQ)
    await this.request(commands.GW_GET_PROTOCOL_VERSION_REQ)
    await this.request(commands.GW_GET_STATE_REQ)
    await this.request(commands.GW_LEAVE_LEARN_STATE_REQ)
    await this.request(commands.GW_SET_UTC_REQ)
    await this.request(commands.GW_GET_LOCAL_TIME_REQ)
    await this.request(commands.GW_CS_GET_SYSTEMTABLE_DATA_REQ)
    await this.request(commands.GW_HOUSE_STATUS_MONITOR_ENABLE_REQ)
    await this.request(commands.GW_GET_NODE_INFORMATION_REQ, { nodeId: 0 })
    await this.request(commands.GW_GET_NODE_INFORMATION_REQ, { nodeId: 1 })
    await this.request(commands.GW_GET_NODE_INFORMATION_REQ, { nodeId: 2 })
    await this.request(commands.GW_GET_NODE_INFORMATION_REQ, { nodeId: 3 })
    await this.request(commands.GW_GET_ALL_NODES_INFORMATION_REQ)
    await this.request(commands.GW_STATUS_REQUEST_REQ, { nodeIds: [0, 1, 2, 3] })
    await this.request(commands.GW_COMMAND_SEND_REQ, { position: 0, nodeIds: [2, 3] })
    // this.debug('waiting 600s...')
    // await timeout(600 * 1000)
    // await this.request(commands.GW_HOUSE_STATUS_MONITOR_ENABLE_REQ)
    // this.debug('waiting 600s...')
    // await timeout(60 * 1000)
    this.debug('goodbye')
    await this.client.disconnect()
  }
}

export { VeluxTool }
