import { PublicKey } from '@solana/web3.js';
import { writeFileSync, appendFileSync } from 'node:fs';

const HELIUS = process.env.HELIUS;
const OUT = '/tmp/pump_hook_matches.txt';
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const MINT_BYTE_B58 = '2'; // base58 of [0x01] = AccountType::Mint at offset 165
const ZERO = Buffer.alloc(32);

writeFileSync(OUT, 'mint\tauthority\tprogram\n');

async function rpc(method, params) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(HELIUS, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) { await new Promise(s => setTimeout(s, 600 * (i + 1))); continue; }
      return j.result;
    } catch { await new Promise(s => setTimeout(s, 600 * (i + 1))); }
  }
  return null;
}

function findHook(buf) {
  if (buf.length < 166 || buf[165] !== 1) return null;
  let o = 166;
  while (o + 4 <= buf.length) {
    const type = buf.readUInt16LE(o);
    const len = buf.readUInt16LE(o + 2);
    if (type === 0) break;
    if (type === 14) { // TransferHook
      if (o + 68 > buf.length) return null;
      return { authority: buf.subarray(o + 4, o + 36), program: buf.subarray(o + 36, o + 68) };
    }
    o += 4 + len;
  }
  return null;
}

let key, page = 0, scanned = 0, withHook = 0, matches = 0;
const t0 = Date.now();
while (true) {
  const params = [T22, { encoding: 'base64', dataSlice: { offset: 0, length: 600 }, limit: 1000,
    filters: [{ memcmp: { offset: 165, bytes: MINT_BYTE_B58 } }] }];
  if (key) params[1].paginationKey = key;
  const res = await rpc('getProgramAccountsV2', params);
  if (!res) { console.log('rpc failed at page', page); break; }
  const accounts = res.accounts || res;
  for (const a of accounts) {
    scanned++;
    const buf = Buffer.from(a.account.data[0], 'base64');
    const hook = findHook(buf);
    if (!hook) continue;
    withHook++;
    if (hook.program.equals(ZERO) && !hook.authority.equals(ZERO) && a.pubkey.endsWith('pump')) {
      matches++;
      appendFileSync(OUT, `${a.pubkey}\t${new PublicKey(hook.authority).toBase58()}\t${new PublicKey(hook.program).toBase58()}\n`);
    }
  }
  page++;
  key = res.paginationKey;
  if (page % 25 === 0 || !key) console.log(`page ${page} | scanned ${scanned} | w/hook ${withHook} | pump+unset ${matches} | ${((Date.now()-t0)/1000).toFixed(0)}s`);
  if (!key) { console.log('DONE'); break; }
  if (page >= 8000) { console.log('page cap'); break; }
  await new Promise(s => setTimeout(s, 40));
}
console.log(`FINAL scanned=${scanned} withHook=${withHook} matches=${matches} -> ${OUT}`);
