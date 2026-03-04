#!/usr/bin/env node
// LOCATE1 wallet — create or show a device keypair
const bsv = require('bsv')
const fs = require('fs')
const path = require('path')

const file = process.argv[2] || path.join(__dirname, 'wallet.json')

if (fs.existsSync(file)) {
  const w = JSON.parse(fs.readFileSync(file, 'utf8'))
  const pk = bsv.PrivateKey.fromWIF(w.wif)
  console.log('Address:', pk.toAddress().toString())
  console.log('Pubkey:', pk.toPublicKey().toString())
} else {
  const pk = new bsv.PrivateKey()
  fs.writeFileSync(file, JSON.stringify({
    wif: pk.toWIF(),
    address: pk.toAddress().toString(),
    pubkey: pk.toPublicKey().toString()
  }, null, 2))
  console.log('Created:', file)
  console.log('Address:', pk.toAddress().toString())
  console.log('Pubkey:', pk.toPublicKey().toString())
}
