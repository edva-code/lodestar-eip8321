import {MAX_RANDAO_COMMITMENT_REGISTRATIONS} from "@lodestar/params";
import {ValidatorIndex, heze} from "@lodestar/types";

type SignedRegistration = heze.SignedRandaoCommitmentRegistration;

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
