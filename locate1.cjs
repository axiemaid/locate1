#!/usr/bin/env node
// LOCATE1 protocol — encode, decode, sign, verify
const bsv = require('bsv')

const PREFIX = Buffer.from('LOCATE1', 'utf8')
const VERSION = Buffer.from([0x01])

const METHODS = { rssi: 0x01, uwb: 0x02, ultrasonic: 0x03 }

function encodeMeasurement(method, value) {
  const buf = Buffer.alloc(4)
  if (method === 0x01) {
    // RSSI: signed int8 in byte 0, rest zeros
    buf.writeInt8(Math.max(-128, Math.min(0, value)), 0)
  } else {
    // UWB (ns) or Ultrasonic (μs): uint32 LE
    buf.writeUInt32LE(value >>> 0, 0)
  }
  return buf
}

function decodeMeasurement(method, buf) {
  if (method === 0x01) return buf.readInt8(0)
  return buf.readUInt32LE(0)
}

function methodName(code) {
  return Object.keys(METHODS).find(k => METHODS[k] === code) || `unknown(${code})`
}

function buildPayload(observerPubkey, peerPubkey, method, measurement) {
  const methodByte = typeof method === 'string' ? METHODS[method] : method
  if (!methodByte) throw new Error('Unknown method: ' + method)
  const measBuf = encodeMeasurement(methodByte, measurement)
  return Buffer.concat([
    PREFIX,
    VERSION,
    Buffer.from(observerPubkey, 'hex'),
    Buffer.from(peerPubkey, 'hex'),
    Buffer.from([methodByte]),
    measBuf
  ])
}

function sign(payload, privateKey) {
  const sig = bsv.crypto.ECDSA.sign(bsv.crypto.Hash.sha256(payload), privateKey)
  // Return compact 64-byte signature (r + s)
  const r = sig.r.toBuffer({ size: 32 })
  const s = sig.s.toBuffer({ size: 32 })
  return Buffer.concat([r, s])
}

function verify(payload, signature, pubkeyHex) {
  const pubkey = bsv.PublicKey.fromString(pubkeyHex)
  const hash = bsv.crypto.Hash.sha256(payload)
  const r = bsv.crypto.BN.fromBuffer(signature.slice(0, 32))
  const s = bsv.crypto.BN.fromBuffer(signature.slice(32, 64))
  const sig = new bsv.crypto.Signature({ r, s })
  return bsv.crypto.ECDSA.verify(hash, sig, pubkey)
}

function buildScript(observerPrivateKey, peerPubkeyHex, method, measurement) {
  const observerPubkey = observerPrivateKey.toPublicKey().toString()
  const payload = buildPayload(observerPubkey, peerPubkeyHex, method, measurement)
  const signature = sign(payload, observerPrivateKey)
  const fullData = Buffer.concat([payload, signature])

  // Build OP_RETURN script with individual pushdata fields
  const methodByte = typeof method === 'string' ? METHODS[method] : method
  const measBuf = encodeMeasurement(methodByte, measurement)

  const script = new bsv.Script()
  script.add(bsv.Opcode.OP_FALSE)
  script.add(bsv.Opcode.OP_RETURN)
  script.add(PREFIX)
  script.add(VERSION)
  script.add(Buffer.from(observerPubkey, 'hex'))
  script.add(Buffer.from(peerPubkeyHex, 'hex'))
  script.add(Buffer.from([methodByte]))
  script.add(measBuf)
  script.add(signature)

  return script
}

function parseScript(script) {
  // Parse OP_FALSE OP_RETURN "LOCATE1" ...
  const chunks = script.chunks
  // Find LOCATE1 prefix
  let i = 0
  while (i < chunks.length) {
    if (chunks[i].buf && chunks[i].buf.equals(PREFIX)) break
    i++
  }
  if (i >= chunks.length) return null
  if (i + 6 >= chunks.length) return null

  const version = chunks[i + 1].buf?.[0]
  if (version !== 0x01) return null

  const observerPubkey = chunks[i + 2].buf?.toString('hex')
  const peerPubkey = chunks[i + 3].buf?.toString('hex')
  const method = chunks[i + 4].buf?.[0]
  const measBuf = chunks[i + 5].buf
  const signature = chunks[i + 6].buf

  if (!observerPubkey || !peerPubkey || !method || !measBuf || !signature) return null

  const measurement = decodeMeasurement(method, measBuf)

  // Verify signature
  const payload = buildPayload(observerPubkey, peerPubkey, method, measurement)
  const valid = verify(payload, signature, observerPubkey)

  return {
    version,
    observerPubkey,
    peerPubkey,
    method,
    methodName: methodName(method),
    measurement,
    signature: signature.toString('hex'),
    valid
  }
}

module.exports = { buildScript, parseScript, buildPayload, sign, verify, METHODS, encodeMeasurement, decodeMeasurement, methodName }
