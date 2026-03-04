#!/usr/bin/env node
// Scan an address for LOCATE1 attestations
// Usage: node scanner.cjs <address> [--limit 20]
const bsv = require('bsv')
const { parseScript } = require('./locate1.cjs')

const args = process.argv.slice(2)
const address = args.find(a => !a.startsWith('--'))
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 20

async function main() {
  if (!address) {
    console.error('Usage: node scanner.cjs <address> [--limit 20]')
    process.exit(1)
  }

  const res = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/history`)
  if (!res.ok) throw new Error('WoC error: ' + res.status)
  const history = await res.json()

  const txids = history.slice(-limit).map(h => h.tx_hash)
  let found = 0

  for (const txid of txids) {
    const hexRes = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`)
    const hex = await hexRes.text()
    try {
      const tx = new bsv.Transaction(hex)
      for (const output of tx.outputs) {
        const parsed = parseScript(output.script)
        if (parsed) {
          found++
          console.log('---')
          console.log('txid:', txid)
          console.log('observer:', parsed.observerPubkey)
          console.log('peer:', parsed.peerPubkey)
          console.log('method:', parsed.methodName)
          console.log('measurement:', parsed.measurement)
          console.log('signature valid:', parsed.valid)
        }
      }
    } catch (e) { /* skip unparseable */ }
  }

  console.log(`\nFound ${found} LOCATE1 attestation(s) in ${txids.length} transactions`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
