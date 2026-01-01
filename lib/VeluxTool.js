// hb-velux-tools/lib/VeluxTool.js
// Copyright © 2025-2026 Erik Baauw. All rights reserved.
//
// Command line interface to Velux Integra KLF 200 gateway.

import { toHexString } from 'hb-lib-tools'
import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import { VeluxClient } from 'hb-velux-tools/VeluxClient'

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  velux: `${b('velux')} [${b('-hVD')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]] [${b('-t')} ${u('timeout')}] [${b('info')} | ${u('command')} [${u('parameters')}]]`,

  info: `${b('info')} [${b('-h')}]`
}

const description = {
  velux: 'Command line interface to Velux Integra KLF 200 gateway.',
  info: 'Dump gateway information.'
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

  ${b('-P')} ${u('password')}, ${b('--password=')}${u('password')}
  Specify the password to connect to the KLF 200.
  You can also specify the password in the ${b('VELUX_PASSWORD')} environment variable.

  ${b('-t')} ${u('timeout')}
  Set timeout to ${u('timeout')} seconds instead of default ${b('5')}.

  ${b('info')}
  Collect information from the KLF 200 for debugging purposes.

  ${u('command')}
  KLF 200 API command (without the ${b('GW_')} prefix nor the ${b('_REQ')} suffix).

  ${u('parameters')}
  A JSON string with the parameters to the KLF 200 command.

Examples:
  ${b('velux GET_PROTOCOL_VERSION')}
    Report the API version.
  
  ${b('velux STATUS_REQUEST \'{ "nodeIds": [0, 1, 2, 3] }\'')}
    Get the status for nodes 0 through 3.

  ${b('velux COMMAND_SEND \'{ "position": 0, "nodeIds": [2, 3] }\'')}
    Open nodes 2 and 3.

For more help, issue: ${b('velux')} ${u('command')} ${b('-h')}`,
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
        password: process.env.VELUX_PASSWORD,
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
      .option('P', 'password', (value) => {
        OptionParser.toString('password', value, true, true)
        clargs.options.password = value
      })
      .option('t', 'timeout', (value) => {
        clargs.options.timeout = OptionParser.toInt('timeout', value, 1, 60, true)
      })
      .parameter('command', (value) => {
        if (VeluxClient.commands['GW_' + value + '_REQ'] == null && value !== 'info') {
          throw new UsageError(`${value}: unknown command`)
        }
        clargs.command = VeluxClient.commands['GW_' + value + '_REQ']
        clargs.commandName = value
      })
      .parameter('parameters', (params) => {
        try {
          clargs.args = JSON.parse(params)
        } catch (error) {
          throw new UsageError(error.message)
        }
      }, true)
      .parse()
    return clargs
  }

  async main () {
    try {
      this.usage = usage.velux
      const clargs = this.parseArguments()
      this.jsonFormatter = new JsonFormatter({ sortKeys: false })
      if (clargs.options.host == null) {
        await this.fatal(`Missing host.  Set ${b('VELUX_HOST')} or specify ${b('-H')}.`)
      }
      if (clargs.options.password == null) {
        await this.fatal(`Missing password.  Set ${b('VELUX_PASSWORD')} or specify ${b('-P')}.`)
      }
      const name = clargs.options.host
      this.client = new VeluxClient(clargs.options)
      this.client
        .on('connecting', (host) => { this.debug('%s: connecting to %s...', name, host) })
        .on('connect', (host) => { this.debug('%s: connected to %s', name, host) })
        .on('disconnect', (host) => { this.debug('%s: disconnected from %s', name, host) })
        .on('error', (error) => {
          if (error.request == null) {
            this.error('%s: error: %s', name, error)
            return
          }
          if (error.request.params == null) {
            this.log(
              '%s: request %d: %s', name, error.request.id, error.request.cmdName
            )
          } else {
            this.log(
              '%s: request %d: %s %j', name, error.request.id, error.request.cmdName,
              error.request.params
            )
          }
          this.error(
            '%s: request %d: error: %s', name, error.request.id, error
          )
        })
        .on('warning', (error) => {
          if (error.request == null) {
            this.warn('%s: error: %s', name, error)
            return
          }
          if (error.request.params == null) {
            this.log(
              '%s: request %d: %s', name, error.request.id, error.request.cmdName
            )
          } else {
            this.log(
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
        .on('rawNotification', (notification) => {
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
        })
        .on('notification', (notification) => {
          const req = notification.request != null
            ? 'request ' + notification.request.id + ': '
            : ''
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

      this.name = 'velux ' + clargs.commandName
      // this.usage = `${b('velux')} ${clargs.commandName}`
      // this.parser = new CommandLineParser(this.pkgJson)
      // this.parser.help('h', 'help', help[clargs.command])
      const result = clargs.commandName === 'info'
        ? await this.info()
        : await this.client.request(clargs.command, clargs.args, true)
      if (result != null) {
        this.print(this.jsonFormatter.stringify(result))
      }
      await this.client.disconnect()
    } catch (error) {
      await this.fatal(error)
    }
  }

  async info () {
    const result = {}
    result.version = await this.client.request(VeluxClient.commands.GW_GET_VERSION_REQ)
    result.protocolVersion = await this.client.request(VeluxClient.commands.GW_GET_PROTOCOL_VERSION_REQ)
    result.systemTable = await this.client.request(VeluxClient.commands.GW_CS_GET_SYSTEMTABLE_DATA_REQ)
    result.nodes = await this.client.request(VeluxClient.commands.GW_GET_ALL_NODES_INFORMATION_REQ)
    return result
  }
}

export { VeluxTool }
