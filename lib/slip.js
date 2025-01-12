// hb-velux-tools/lib/slip.js
// Copyright © 2025 Erik Baauw. All rights reserved.
//
// Command line interface to Velux Integra KLF 200 gateway.

const slip = {
  END: 0xC0,
  ESC: 0xDB,
  ESC_END: 0xDC,
  ESC_ESC: 0xDD
}

/** Decode SLIP frame.
  *
  * @param {Buffer} in - The frame to be decoded.
  * @return {Buffer} - The decoded frame.
  */
function decode (buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new SyntaxError('buf: not a Buffer')
  }
  const len = buf.length
  if (len < 2 || buf[0] !== slip.END || buf[len - 1] !== slip.END) {
    throw new Error('invalid slip frame')
  }
  const out = Buffer.allocUnsafe(len - 2)
  let o = 0
  for (let i = 1; i < len - 1; i++, o++) {
    switch (buf[i]) {
      case slip.END:
        throw new Error('invalid END in slip frame')
      case slip.ESC:
        switch (buf[++i]) {
          case slip.ESC_END:
            buf[o] = slip.END
            break
          case slip.ESC_ESC:
            buf[o] = slip.ESC
            break
          default:
            throw new Error('invalid ESC in slip frame')
        }
        break
      default:
        out[o] = buf[i]
        break
    }
  }
  return out.subarray(0, o)
}

/** Encode SLIP frame.
  *
  * @param {Buffer} buf - The frame to be encoded.
  * @return {Buffer} - The encoded frame.
  */
function encode (buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new SyntaxError('buf: not a Buffer')
  }
  const len = buf.length
  const out = Buffer.alloc(len * 2 + 2)
  out[0] = slip.END
  let o = 1
  for (let i = 0; i < len; i++, o++) {
    switch (buf[i]) {
      case slip.END:
        out[o++] = slip.ESC
        out[o] = slip.ESC_END
        break
      case slip.ESC:
        out[o++] = slip.ESC
        out[o] = slip.ESC_ESC
        break
      default:
        out[o] = buf[i]
        break
    }
  }
  out[o++] = slip.END
  return out.subarray(0, o)
}

export { decode, encode }

// let buf = Buffer.from('Hello, world')
// buf[6] = slip.END
// buf[7] = slip.ESC
// console.log('input:  ', buf)
// buf = encode(buf)
// console.log('encoded:', buf)
// buf = decode(buf)
// console.log('decoded:', buf)
