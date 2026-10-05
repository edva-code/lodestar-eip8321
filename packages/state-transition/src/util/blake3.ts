import {blake3} from "@noble/hashes/blake3.js";
import {concatBytes} from "@noble/hashes/utils.js";
import {HASH_CHAIN_RANDAO_DST} from "@lodestar/params";

export function blake3Hash(data: Uint8Array): Uint8Array {
  return blake3(data);
}

export function hashChainStep(value: Uint8Array): Uint8Array {
  return blake3Hash(concatBytes(HASH_CHAIN_RANDAO_DST, value));
}
