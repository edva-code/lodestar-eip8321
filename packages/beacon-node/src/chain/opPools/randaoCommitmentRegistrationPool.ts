import {MAX_RANDAO_COMMITMENT_REGISTRATIONS, ZERO_HASH} from "@lodestar/params";
import {Bytes32, ValidatorIndex, heze} from "@lodestar/types";
import {byteArrayEquals} from "@lodestar/utils";

type SignedRegistration = heze.SignedRandaoCommitmentRegistration;

export type RandaoCommitmentStateView = {
  validatorCount: number;
  getRandaoCommitment(validatorIndex: ValidatorIndex): Bytes32;
  hasPendingRandaoCommitment(validatorIndex: ValidatorIndex): boolean;
};

export function isRandaoCommitmentRegistrationIncludable(
  state: RandaoCommitmentStateView,
  {message}: SignedRegistration
): boolean {
  const {validatorIndex} = message;
  return (
    validatorIndex < state.validatorCount &&
    byteArrayEquals(state.getRandaoCommitment(validatorIndex), ZERO_HASH) &&
    !state.hasPendingRandaoCommitment(validatorIndex)
  );
}

export class RandaoCommitmentRegistrationPool {
  /* validator index -> registration. Map keeps insertion order, so oldest are included first */
  private readonly registrations = new Map<ValidatorIndex, SignedRegistration>();

  /* Must be validated beforehand. Keeps the first registration seen per validator */
  add(registration: SignedRegistration): boolean {
    const {validatorIndex} = registration.message;
    if (this.registrations.has(validatorIndex)) return false;
    this.registrations.set(validatorIndex, registration);
    return true;
  }

  has(validatorIndex: ValidatorIndex): boolean {
    return this.registrations.has(validatorIndex);
  }

  getForBlock(isIncludable: (registration: SignedRegistration) => boolean): SignedRegistration[] {
    const result: SignedRegistration[] = [];
    for (const registration of this.registrations.values()) {
      if (isIncludable(registration)) {
        result.push(registration);
        if (result.length >= MAX_RANDAO_COMMITMENT_REGISTRATIONS) break;
      }
    }
    return result;
  }

  prune(shouldKeep: (registration: SignedRegistration) => boolean): void {
    for (const [validatorIndex, registration] of this.registrations) {
      if (!shouldKeep(registration)) this.registrations.delete(validatorIndex);
    }
  }
}
