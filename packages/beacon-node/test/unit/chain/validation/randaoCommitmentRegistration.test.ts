import {describe, expect, it, vi} from "vitest";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {IBeaconStateView} from "@lodestar/state-transition";
import {heze} from "@lodestar/types";
import {GossipAction} from "../../../../src/chain/errors/gossipValidation.js";
import {
  RandaoCommitmentRegistrationError,
  RandaoCommitmentRegistrationErrorCode,
} from "../../../../src/chain/errors/randaoCommitmentRegistrationError.js";
import {IBeaconChain} from "../../../../src/chain/interface.js";
import {RandaoCommitmentRegistrationPool} from "../../../../src/chain/opPools/randaoCommitmentRegistrationPool.js";
import {validateGossipRandaoCommitmentRegistration} from "../../../../src/chain/validation/randaoCommitmentRegistration.js";

describe("chain / validation / randaoCommitmentRegistration", () => {
  const config = createBeaconConfig(getConfig(ForkName.heze), Buffer.alloc(32, 0));
  const zero = Buffer.alloc(32, 0);

  type StateOpts = {forkName?: ForkName; validatorCount?: number; active?: number[]; pending?: number[]};
  const makeState = (opts: StateOpts = {}): IBeaconStateView =>
    ({
      forkName: opts.forkName ?? ForkName.heze,
      validatorCount: opts.validatorCount ?? 8,
      getRandaoCommitment: (index: number) => (opts.active?.includes(index) ? Buffer.alloc(32, 0x01) : zero),
      hasPendingRandaoCommitment: (index: number) => opts.pending?.includes(index) ?? false,
    }) as unknown as IBeaconStateView;

  const makeChain = (state: IBeaconStateView, opts: {seen?: number[]; validSignature?: boolean} = {}) => {
    const pool = new RandaoCommitmentRegistrationPool();
    for (const index of opts.seen ?? []) pool.add(makeRegistration(index));
    const verifySignatureSets = vi.fn().mockResolvedValue(opts.validSignature ?? true);
    const chain = {
      config,
      randaoCommitmentRegistrationPool: pool,
      getHeadStateAtCurrentEpoch: vi.fn().mockResolvedValue(state),
      bls: {verifySignatureSets},
    } as unknown as IBeaconChain;
    return {chain, verifySignatureSets};
  };

  const makeRegistration = (validatorIndex: number, commitment = Buffer.alloc(32, 0xab)) =>
    ({
      message: {validatorIndex, commitment},
      signature: Buffer.alloc(96, 0),
    }) as heze.SignedRandaoCommitmentRegistration;

  async function expectError(
    promise: Promise<void>,
    action: GossipAction,
    code: RandaoCommitmentRegistrationErrorCode
  ): Promise<void> {
    const err = await promise.then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(RandaoCommitmentRegistrationError);
    expect((err as RandaoCommitmentRegistrationError).action).toBe(action);
    expect((err as RandaoCommitmentRegistrationError).type.code).toBe(code);
  }

  it("accepts a valid registration and verifies its signature", async () => {
    const {chain, verifySignatureSets} = makeChain(makeState());
    await validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1));
    expect(verifySignatureSets).toHaveBeenCalledOnce();
  });

  it("ignores a registration already seen for the validator", async () => {
    const {chain, verifySignatureSets} = makeChain(makeState(), {seen: [1]});
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1)),
      GossipAction.IGNORE,
      RandaoCommitmentRegistrationErrorCode.ALREADY_EXISTS
    );
    expect(verifySignatureSets).not.toHaveBeenCalled();
  });

  it("ignores while the head state is pre-heze", async () => {
    const {chain} = makeChain(makeState({forkName: ForkName.gloas}));
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1)),
      GossipAction.IGNORE,
      RandaoCommitmentRegistrationErrorCode.PRE_HEZE
    );
  });

  it("rejects an unknown validator index", async () => {
    const {chain} = makeChain(makeState({validatorCount: 4}));
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(4)),
      GossipAction.REJECT,
      RandaoCommitmentRegistrationErrorCode.UNKNOWN_VALIDATOR
    );
  });

  it("rejects a zero commitment", async () => {
    const {chain} = makeChain(makeState());
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1, zero)),
      GossipAction.REJECT,
      RandaoCommitmentRegistrationErrorCode.ZERO_COMMITMENT
    );
  });

  it("ignores an already registered validator", async () => {
    const {chain} = makeChain(makeState({active: [1]}));
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1)),
      GossipAction.IGNORE,
      RandaoCommitmentRegistrationErrorCode.ALREADY_REGISTERED
    );
  });

  it("ignores a validator with a pending registration", async () => {
    const {chain} = makeChain(makeState({pending: [1]}));
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1)),
      GossipAction.IGNORE,
      RandaoCommitmentRegistrationErrorCode.ALREADY_PENDING
    );
  });

  it("rejects an invalid signature", async () => {
    const {chain} = makeChain(makeState(), {validSignature: false});
    await expectError(
      validateGossipRandaoCommitmentRegistration(chain, makeRegistration(1)),
      GossipAction.REJECT,
      RandaoCommitmentRegistrationErrorCode.INVALID_SIGNATURE
    );
  });
});
