<span align="center">

# Homebridge Velux Tools
[![Downloads](https://img.shields.io/npm/dt/hb-velux-tools.svg)](https://www.npmjs.com/package/hb-velux-tools)
[![Version](https://img.shields.io/npm/v/hb-velux-tools.svg)](https://www.npmjs.com/package/hb-velux-tools)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

</span>

## Homebridge Velux Tools
Copyright © 2025 Erik Baauw. All rights reserved.

This repository provides a standalone installation of the command-line tools from [Homebridge Velux](https://github.com/ebaauw/homebridge-velux):

Tool      | Description
--------- | -----------
`velux`   | Interact with a Velux Integra KLF 200 gateway from the command line.

Each command-line tool takes a `-h` or `--help` argument to provide a brief overview of its functionality and command-line arguments.

### Prerequisites
Homebridge Velux communicates with the Velux Integra KLF 200 gateway using its local API, described in the _Technical Specification for KLF 200 API io-homecontrol® Gateway_ version 3.18 from 2019/12/10.  The gatway needs to be at firmware version [2.0.0.71](https://www.velux.com/klf200).

### Installation
```
$ sudo npm -g i hb-velux-tools
```
