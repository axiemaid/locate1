#!/usr/bin/env node
// Create and broadcast a LOCATE1 attestation
// Usage: node attest.cjs --wallet wallet.json --peer <pubkey> --method rssi --value -67
const bsv = require('bsv')
const fs = require('fs')
const path = require('path')
const { buildScript } = require('./locate1.cjs')

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : null
}

async function fetchUtxos(address) {
  const res = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`)
  if (!res.ok) throw new Error('WoC error: ' + res.status)
  return res.json()
}

async function broadcast(hex) {
  const res = await fetch('https://api.whatsonchain.com/v1/bsv/main/tx/raw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txhex: hex })
  })
  const text = await res.text()
  if (!res.ok) throw new Error('Broadcast failed: ' + text)
  return text.replace(/"/g, '')
}

async function main() {
  const walletFile = arg('wallet') || path.join(__dirname, 'wallet.json')
  const peerPubkey = arg('peer')
  const method = arg('method') || 'rssi'
  const value = parseInt(arg('value') || '0', 10)

  if (!peerPubkey) {
    console.error('Usage: node attest.cjs --peer <pubkey> --method rssi|uwb|ultrasonic --value <number>')
    console.error('  --wallet <path>   wallet file (default: wallet.json)')
    process.exit(1)
  }

  const w = JSON.parse(fs.readFileSync(walletFile, 'utf8'))
  const privateKey = bsv.PrivateKey.fromWIF(w.wif)
  const address = privateKey.toAddress()

  // Get UTXOs
  const utxos = await fetchUtxos(address.toString())
  if (!utxos.length) {
    console.error('No UTXOs. Fund', address.toString())
    process.exit(1)
  }

  // Pick largest UTXO
  utxos.sort((a, b) => b.value - a.value)
  const utxo = utxos[0]

  // Fetch full tx hex to get the script
  const txHexRes = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`)
  if (!txHexRes.ok) throw new Error('Failed to fetch tx ' + utxo.tx_hash + ': ' + txHexRes.status)
  const txHex = await txHexRes.text()
  const prevTx = new bsv.Transaction(txHex)
  const scriptPubKey = prevTx.outputs[utxo.tx_pos].script

  // Build LOCATE1 OP_RETURN
  const opReturn = buildScript(privateKey, peerPubkey, method, value)

  // Build tx, sign once to measure size, then set correct fee and re-sign
  const tx = new bsv.Transaction()
  tx.from({
    txId: utxo.tx_hash,
    outputIndex: utxo.tx_pos,
    script: scriptPubKey,
    satoshis: utxo.value
  })
  tx.addOutput(new bsv.Transaction.Output({ script: opReturn, satoshis: 0 }))
  tx.change(address)
  tx.sign(privateKey)
  const fee = Math.max(1, Math.ceil(tx.toString().length / 2))  // 1 sat/byte on signed size
  tx.fee(fee)
  tx.sign(privateKey)

  // Broadcast
  const txid = await broadcast(tx.toString())
  console.log('LOCATE1 attestation broadcast')
  console.log('txid:', txid)
  console.log('observer:', privateKey.toPublicKey().toString())
  console.log('peer:', peerPubkey)
  console.log('method:', method)
  console.log('value:', value)
}

main().catch(e => { console.error(e.message); process.exit(1) })
