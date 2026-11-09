import {BeaconConfig} from "@lodestar/config";
import {DOMAIN_RANDAO_COMMITMENT_REGISTRATION, ForkName} from "@lodestar/params";
import {eip8321, ssz} from "@lodestar/types";
import {ISignatureSet, SignatureSetType, computeSigningRoot, verifySignatureSet} from "../util/index.js";

export function verifyRandaoCommitmentRegistrationSignature(
  config: BeaconConfig,
  signedRegistration: eip8321.SignedRandaoCommitmentRegistration
): boolean {
  return verifySignatureSet(getRandaoCommitmentRegistrationSignatureSet(config, signedRegistration));
}

export function getRandaoCommitmentRegistrationSignatureSet(
  config: BeaconConfig,
  signedRegistration: eip8321.SignedRandaoCommitmentRegistration
): ISignatureSet {
  // Signed against the genesis fork version so registrations stay valid across forks
  const domain = config.getDomainAtFork(ForkName.phase0, DOMAIN_RANDAO_COMMITMENT_REGISTRATION);

  return {
    type: SignatureSetType.indexed,
    index: signedRegistration.message.validatorIndex,
    signingRoot: computeSigningRoot(ssz.eip8321.RandaoCommitmentRegistration, signedRegistration.message, domain),
    signature: signedRegistration.signature,
  };
}

export function getRandaoCommitmentRegistrationsSignatureSets(
  config: BeaconConfig,
  signedBlock: eip8321.SignedBeaconBlock
): ISignatureSet[] {
  return signedBlock.message.body.randaoCommitmentRegistrations.map((registration) =>
    getRandaoCommitmentRegistrationSignatureSet(config, registration)
  );
}
