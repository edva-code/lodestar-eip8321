import {describe, expect, it} from "vitest";
import {createBeaconConfig, createChainForkConfig} from "@lodestar/config";
import {DOMAIN_RANDAO_COMMITMENT_REGISTRATION, ForkName, SYNC_COMMITTEE_SIZE} from "@lodestar/params";
import {heze, ssz} from "@lodestar/types";
import {SyncCommitteeCache} from "../../../src/cache/syncCommitteeCache.js";
import {G2_POINT_AT_INFINITY, ZERO_HASH} from "../../../src/constants/index.js";
import {getBlockSignatureSets} from "../../../src/signatureSets/index.js";
import {IBeaconStateView} from "../../../src/stateView/interface.js";
import {SignatureSetType, computeSigningRoot} from "../../../src/util/index.js";

describe("signatureSets / heze block", () => {
  const config = createBeaconConfig(
    createChainForkConfig({
      ALTAIR_FORK_EPOCH: 0,
      BELLATRIX_FORK_EPOCH: 0,
      CAPELLA_FORK_EPOCH: 0,
      DENEB_FORK_EPOCH: 0,
      ELECTRA_FORK_EPOCH: 0,
      FULU_FORK_EPOCH: 0,
      GLOAS_FORK_EPOCH: 0,
      HEZE_FORK_EPOCH: 0,
    }),
    ZERO_HASH
  );
  const proposerIndex = 2;
  const blsReveal = Buffer.alloc(96, 0xaa);
  const registration: heze.SignedRandaoCommitmentRegistration = {
    message: {validatorIndex: 5, commitment: Buffer.alloc(32, 0xcd)},
    signature: Buffer.alloc(96, 0xbb),
  };
  // An empty sync aggregate adds no signature set
  const syncCommitteeCache: SyncCommitteeCache = {
    validatorIndices: new Uint32Array(SYNC_COMMITTEE_SIZE),
    validatorIndexMap: new Map(),
  };
  // No exits or payload attestations in the block, so the state is never read
  const state = {} as unknown as IBeaconStateView;

  const makeSignedBlock = (hashChainReveal: Uint8Array, randaoReveal: Uint8Array): heze.SignedBeaconBlock => {
    const body = ssz.heze.BeaconBlockBody.defaultValue();
    body.randaoReveal = randaoReveal;
    body.hashChainReveal = hashChainReveal;
    body.syncAggregate.syncCommitteeSignature = G2_POINT_AT_INFINITY;
    body.randaoCommitmentRegistrations = [registration];
    return {
      message: {slot: 1, proposerIndex, parentRoot: ZERO_HASH, stateRoot: ZERO_HASH, body},
      signature: Buffer.alloc(96, 0xcc),
    };
  };

  const getSets = (signedBlock: heze.SignedBeaconBlock) =>
    getBlockSignatureSets(config, syncCommitteeCache, state, signedBlock, []);

  it("includes the BLS randao reveal when there is no hash chain reveal", () => {
    const sets = getSets(makeSignedBlock(ZERO_HASH, blsReveal));
    // Randao reveal, block proposer signature and the registration
    expect(sets.length).toBe(3);
    expect(sets.some((set) => set.signature === blsReveal)).toBe(true);
  });

  it("drops the BLS randao reveal when the block carries a hash chain reveal", () => {
    const sets = getSets(makeSignedBlock(Buffer.alloc(32, 0x07), G2_POINT_AT_INFINITY));
    // Block proposer signature and the registration
    expect(sets.length).toBe(2);
    expect(sets.some((set) => set.signature === G2_POINT_AT_INFINITY)).toBe(false);
  });

  it("signs registrations with the genesis fork domain", () => {
    const sets = getSets(makeSignedBlock(ZERO_HASH, blsReveal));
    const registrationSet = sets.find((set) => set.signature === registration.signature);
    const domain = config.getDomainAtFork(ForkName.phase0, DOMAIN_RANDAO_COMMITMENT_REGISTRATION);
    expect(registrationSet).toEqual({
      type: SignatureSetType.indexed,
      index: registration.message.validatorIndex,
      signingRoot: computeSigningRoot(ssz.heze.RandaoCommitmentRegistration, registration.message, domain),
      signature: registration.signature,
    });
  });
});
