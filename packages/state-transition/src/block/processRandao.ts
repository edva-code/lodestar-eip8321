import {digest} from "@chainsafe/as-sha256";
import {EPOCHS_PER_HISTORICAL_VECTOR, ForkPostHeze, ForkSeq} from "@lodestar/params";
import {BeaconBlock} from "@lodestar/types";
import {byteArrayEquals, xor} from "@lodestar/utils";
import {G2_POINT_AT_INFINITY, ZERO_HASH} from "../constants/constants.js";
import {verifyRandaoSignature} from "../signatureSets/index.js";
import {CachedBeaconStateAllForks, CachedBeaconStateHeze} from "../types.js";
import {blake3Hash, getRandaoMix, hashChainStep} from "../util/index.js";

/**
 * Commit a randao reveal to generate pseudorandomness seeds
 *
 * PERF: Fixed work independent of block contents.
 */
export function processRandao(state: CachedBeaconStateAllForks, block: BeaconBlock, verifySignature = true): void {
  const {epochCtx, config} = state;
  const epoch = epochCtx.epoch;
  const randaoReveal = block.body.randaoReveal;
  const mixIndex = epoch % EPOCHS_PER_HISTORICAL_VECTOR;

  if (config.getForkSeq(state.slot) >= ForkSeq.heze) {
    const stateHeze = state as CachedBeaconStateHeze;
    const {hashChainReveal} = (block as BeaconBlock<ForkPostHeze>).body;
    // block.proposerIndex is already checked against the expected proposer in processBlockHeader
    const commitment = stateHeze.randaoCommitments.get(block.proposerIndex);

    if (!byteArrayEquals(commitment, ZERO_HASH)) {
      if (byteArrayEquals(hashChainReveal, ZERO_HASH)) {
        throw new Error("Hash chain reveal must not be zero for registered proposer");
      }
      if (!byteArrayEquals(hashChainStep(hashChainReveal), commitment)) {
        throw new Error("Hash chain reveal is not the preimage of the proposer commitment");
      }
      if (!byteArrayEquals(randaoReveal, G2_POINT_AT_INFINITY)) {
        throw new Error("RANDAO reveal must be the G2 point at infinity for registered proposer");
      }

      const randaoMix = blake3Hash(Buffer.concat([getRandaoMix(state, epoch), hashChainReveal]));
      stateHeze.randaoMixes.set(mixIndex, randaoMix);
      stateHeze.randaoCommitments.set(block.proposerIndex, hashChainReveal);
      return;
    }

    if (!byteArrayEquals(hashChainReveal, ZERO_HASH)) {
      throw new Error("Hash chain reveal must be zero for unregistered proposer");
    }
  }

  // verify RANDAO reveal
  if (verifySignature && !verifyRandaoSignature(config, block)) {
    throw new Error("RANDAO reveal is an invalid signature");
  }

  // mix in RANDAO reveal
  const randaoMix = xor(getRandaoMix(state, epoch), digest(randaoReveal));
  state.randaoMixes.set(mixIndex, randaoMix);
}
