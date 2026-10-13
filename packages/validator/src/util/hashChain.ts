import {ZERO_HASH, hashChainStep} from "@lodestar/state-transition";
import {Bytes32} from "@lodestar/types";
import {byteArrayEquals} from "@lodestar/utils";

/** EIP-8321 honest validator guide recommends at least 2**16 links, enough to outlast the validator */
export const HASH_CHAIN_LENGTH = 2 ** 16;

/**
 * Return `chain[length]` of the chain `chain[0] = secret, chain[i] = hashChainStep(chain[i - 1])`,
 * the commitment registered on chain. Throws if any link is zero since a zero link cannot be revealed.
 */
export function computeHashChainTip(secret: Bytes32, length: number): Bytes32 {
  let link = secret;
  for (let i = 0; i <= length; i++) {
    if (byteArrayEquals(link, ZERO_HASH)) {
      throw Error(`Hash chain link ${i} is zero, regenerate the chain from a fresh secret`);
    }
    if (i < length) link = hashChainStep(link);
  }
  return link;
}

/**
 * Return the link whose hash is `commitment`, i.e. the next reveal for a validator whose current
 * on-chain commitment is `commitment`. Returns null if `commitment` is not on this chain or the
 * chain is exhausted (commitment is the secret itself).
 */
export function getHashChainReveal(secret: Bytes32, length: number, commitment: Bytes32): Bytes32 | null {
  let link = secret;
  for (let i = 0; i < length; i++) {
    const next = hashChainStep(link);
    if (byteArrayEquals(next, commitment)) return link;
    link = next;
  }
  return null;
}
