import {ZERO_HASH} from "@lodestar/params";
import {getRandaoCommitmentRegistrationSignatureSet, isStatePostHeze} from "@lodestar/state-transition";
import {heze} from "@lodestar/types";
import {byteArrayEquals} from "@lodestar/utils";
import {
  GossipAction,
  RandaoCommitmentRegistrationError,
  RandaoCommitmentRegistrationErrorCode,
} from "../errors/index.js";
import {IBeaconChain} from "../index.js";
import {RegenCaller} from "../regen/index.js";

export async function validateGossipRandaoCommitmentRegistration(
  chain: IBeaconChain,
  signedRegistration: heze.SignedRandaoCommitmentRegistration
): Promise<void> {
  const {validatorIndex, commitment} = signedRegistration.message;

  // [IGNORE] First registration received for this validator
  if (chain.randaoCommitmentRegistrationPool.has(validatorIndex)) {
    throw new RandaoCommitmentRegistrationError(GossipAction.IGNORE, {
      code: RandaoCommitmentRegistrationErrorCode.ALREADY_EXISTS,
    });
  }

  const state = await chain.getHeadStateAtCurrentEpoch(RegenCaller.validateGossipRandaoCommitmentRegistration);

  // Near the fork boundary the head state can still be pre-heze
  if (!isStatePostHeze(state)) {
    throw new RandaoCommitmentRegistrationError(GossipAction.IGNORE, {
      code: RandaoCommitmentRegistrationErrorCode.PRE_HEZE,
    });
  }

  // [REJECT] Conditions of process_randao_commitment_registration, signature verified in batch below
  if (validatorIndex >= state.validatorCount) {
    throw new RandaoCommitmentRegistrationError(GossipAction.REJECT, {
      code: RandaoCommitmentRegistrationErrorCode.UNKNOWN_VALIDATOR,
    });
  }
  if (byteArrayEquals(commitment, ZERO_HASH)) {
    throw new RandaoCommitmentRegistrationError(GossipAction.REJECT, {
      code: RandaoCommitmentRegistrationErrorCode.ZERO_COMMITMENT,
    });
  }
  if (!byteArrayEquals(state.getRandaoCommitment(validatorIndex), ZERO_HASH)) {
    throw new RandaoCommitmentRegistrationError(GossipAction.REJECT, {
      code: RandaoCommitmentRegistrationErrorCode.ALREADY_REGISTERED,
    });
  }
  if (state.hasPendingRandaoCommitment(validatorIndex)) {
    throw new RandaoCommitmentRegistrationError(GossipAction.REJECT, {
      code: RandaoCommitmentRegistrationErrorCode.ALREADY_PENDING,
    });
  }

  const signatureSet = getRandaoCommitmentRegistrationSignatureSet(chain.config, signedRegistration);
  if (!(await chain.bls.verifySignatureSets([signatureSet], {batchable: true}))) {
    throw new RandaoCommitmentRegistrationError(GossipAction.REJECT, {
      code: RandaoCommitmentRegistrationErrorCode.INVALID_SIGNATURE,
    });
  }
}
