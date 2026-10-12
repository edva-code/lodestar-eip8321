import {COMMITMENT_REGISTRATION_DELAY} from "@lodestar/params";
import {Bytes32, ValidatorIndex, heze, ssz} from "@lodestar/types";
import {byteArrayEquals} from "@lodestar/utils";
import {ZERO_HASH} from "../constants/constants.js";
import {verifyRandaoCommitmentRegistrationSignature} from "../signatureSets/index.js";
import {CachedBeaconStateHeze} from "../types.js";

export function processRandaoCommitmentRegistration(
  state: CachedBeaconStateHeze,
  signedRegistration: heze.SignedRandaoCommitmentRegistration,
  verifySignature = true
): void {
  const {validatorIndex, commitment} = signedRegistration.message;

  if (validatorIndex >= state.validators.length) {
    throw Error(`Randao commitment registration validatorIndex ${validatorIndex} >= ${state.validators.length}`);
  }
  if (byteArrayEquals(commitment, ZERO_HASH)) {
    throw Error(`Randao commitment registration with zero commitment validatorIndex=${validatorIndex}`);
  }
  if (!byteArrayEquals(state.randaoCommitments.get(validatorIndex), ZERO_HASH)) {
    throw Error(`Validator ${validatorIndex} already has a randao commitment`);
  }
  if (verifySignature && !verifyRandaoCommitmentRegistrationSignature(state.config, signedRegistration)) {
    throw Error(`Invalid randao commitment registration signature validatorIndex=${validatorIndex}`);
  }

  queueRandaoCommitment(state, validatorIndex, commitment);
}

export function queueRandaoCommitment(state: CachedBeaconStateHeze, index: ValidatorIndex, commitment: Bytes32): void {
  // ponytail: linear scan per registration, fine while the queue holds at most ~3 epochs of registrations
  for (let i = 0; i < state.pendingRandaoCommitments.length; i++) {
    if (state.pendingRandaoCommitments.getReadonly(i).validatorIndex === index) {
      throw Error(`Validator ${index} already has a pending randao commitment`);
    }
  }

  state.pendingRandaoCommitments.push(
    ssz.heze.PendingRandaoCommitment.toViewDU({
      validatorIndex: index,
      commitment,
      activationEpoch: state.epochCtx.epoch + COMMITMENT_REGISTRATION_DELAY,
    })
  );
}
