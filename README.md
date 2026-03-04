# LOCATE1 v1 — Peer Observation Protocol

Devices observe peers. They sign what they saw. They write it to the chain. That's it.

## Transaction Format

```
OP_FALSE OP_RETURN
  "LOCATE1"            # protocol prefix (7 bytes UTF-8)
  0x01                 # version (1 byte)
  <observer_pubkey>    # 33 bytes, compressed secp256k1
  <peer_pubkey>        # 33 bytes, compressed secp256k1
  <method>             # 1 byte
  <measurement>        # 4 bytes, encoding depends on method
  <signature>          # 64 bytes (r‖s), ECDSA/secp256k1 over single SHA256 of all preceding fields
```

**Total: ~143 bytes. Cost: ~143 sats.**

## Method Codes & Measurement Encoding

| Code | Method | Measurement encoding |
|------|--------|---------------------|
| 0x01 | RSSI | signed int8 dBm in byte 0, bytes 1-3 = 0x000000 |
| 0x02 | UWB | uint32 LE, nanoseconds (time-of-flight) |
| 0x03 | Ultrasonic | uint32 LE, microseconds (time-of-flight) |

## Rules

1. One observation per transaction.
2. `observer_pubkey` must differ from `peer_pubkey`.
3. Signature covers the concatenation of all preceding fields (from "LOCATE1" through `measurement`).

## Replay Protection

The UTXO spend. Each transaction consumes a unique input. The signed payload doesn't need a nonce because the transaction itself is the nonce. An attacker cannot reuse a signed payload in a new transaction without the observer's private key to sign the inputs.

## Quickstart

```bash
npm install
```

Create a device keypair:

```bash
node wallet.cjs
```

Fund the address with BSV, then broadcast an attestation:

```bash
node attest.cjs --peer <peer_pubkey> --method rssi --value -47
```

Read it back from the chain:

```bash
node scanner.cjs <your_address>
```

## Mainnet Demo

Two ESP32 devices running LOCATE1. Each one broadcasts its public key over radio. When it hears a peer, it measures the signal strength, signs a LOCATE1 attestation, and a gateway broadcasts it to BSV mainnet.

**Side by side (-11 to -14 dBm):**

```
03a00f7c… → 03033398…  RSSI -11 dBm
tx: f9a1506b23f46ace63665769faf261fb092f21ed98dd172e5a5ed907a906606b

03033398… → 03a00f7c…  RSSI -13 dBm
tx: 3535240be3d11cba73e703f321ab102305f075d98d594ddc784a7e5ddea7cfce
```

**After moving one device (-38 to -42 dBm):**

```
03033398… → 03a00f7c…  RSSI -42 dBm
tx: 29c9c25b4652293d8443b9c6fb59bf901b66150462556c78104cc51bf210a77f

03a00f7c… → 03033398…  RSSI -39 dBm
tx: 65af11b31f90db08fdaad6ba8ebc987169cd52c37771ceae0e1329bf74a171ef
```

Neither device reported a distance or movement. Both are derived by any observer reading the chain — distance from the RSSI values, movement from the change between blocks. Facts on-chain, interpretation above.
