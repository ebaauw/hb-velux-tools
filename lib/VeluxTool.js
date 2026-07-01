// hb-velux-tools/lib/VeluxTool.js
// Copyright © 2025-2026 Erik Baauw. All rights reserved.
//
// Command line interface to Velux Integra KLF 200 gateway.

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
        logger: this,
        password: process.env.VELUX_PASSWORD,
        timeout: 5
      }
    }
    parser
      .help('h', 'help', help.velux)
      .version('V', 'version')
      .debug('D', 'debug', this)
      .option('H', 'host', (value) => {
        OptionParser.toHost('host', value, true, true)
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
    if (clargs.options.host == null || clargs.options.host === '') {
      throw new UsageError(`Missing host.  Set ${b('VELUX_HOST')} or specify ${b('-H')}.`)
    }
    if (clargs.options.password == null || clargs.options.password === '') {
      throw new UsageError(`Missing password.  Set ${b('VELUX_PASSWORD')} or specify ${b('-P')}.`)
    }
    return clargs
  }

  async main () {
    try {
      this.usage = usage.velux
      const clargs = this.parseArguments()
      this.jsonFormatter = new JsonFormatter({ sortKeys: false })
      this.client = new VeluxClient(clargs.options)

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
    } catch (error) {
      this.error(error)
    }
    await this.client?.disconnect()
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
