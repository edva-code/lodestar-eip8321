import {beforeEach, describe, expect, it} from "vitest";
import {MAX_RANDAO_COMMITMENT_REGISTRATIONS} from "@lodestar/params";
import {heze} from "@lodestar/types";
import {
  RandaoCommitmentRegistrationPool,
  isRandaoCommitmentRegistrationIncludable,
} from "../../../../src/chain/opPools/randaoCommitmentRegistrationPool.js";

describe("chain / opPools / RandaoCommitmentRegistrationPool", () => {
  describe("isRandaoCommitmentRegistrationIncludable", () => {
    const zero = Buffer.alloc(32, 0);
    const makeState = (opts: {validatorCount?: number; active?: number[]; pending?: number[]} = {}) => ({
      validatorCount: opts.validatorCount ?? 10,
      getRandaoCommitment: (index: number) => (opts.active?.includes(index) ? Buffer.alloc(32, 0x01) : zero),
      hasPendingRandaoCommitment: (index: number) => opts.pending?.includes(index) ?? false,
    });

    it("accepts a validator with no commitment", () => {
      expect(isRandaoCommitmentRegistrationIncludable(makeState(), makeRegistration(1))).toBe(true);
    });

    it("rejects an unknown validator index", () => {
      expect(isRandaoCommitmentRegistrationIncludable(makeState({validatorCount: 5}), makeRegistration(5))).toBe(false);
    });

    it("rejects a validator with an active commitment", () => {
      expect(isRandaoCommitmentRegistrationIncludable(makeState({active: [1]}), makeRegistration(1))).toBe(false);
    });

    it("rejects a validator with a pending commitment", () => {
      expect(isRandaoCommitmentRegistrationIncludable(makeState({pending: [1]}), makeRegistration(1))).toBe(false);
    });
  });

  const makeRegistration = (validatorIndex: number, fill = 0xab): heze.SignedRandaoCommitmentRegistration => ({
    message: {validatorIndex, commitment: Buffer.alloc(32, fill)},
    signature: Buffer.alloc(96, 0),
  });

  let pool: RandaoCommitmentRegistrationPool;
  beforeEach(() => {
    pool = new RandaoCommitmentRegistrationPool();
  });

  const indices = (registrations: heze.SignedRandaoCommitmentRegistration[]): number[] =>
    registrations.map((r) => r.message.validatorIndex);

  it("stores a registration and reports it as seen", () => {
    const reg = makeRegistration(1);
    expect(pool.has(1)).toBe(false);
    expect(pool.add(reg)).toBe(true);
    expect(pool.has(1)).toBe(true);
    expect(pool.getForBlock(() => true)).toEqual([reg]);
  });

  it("keeps the first registration for a validator and rejects the second", () => {
    const first = makeRegistration(1, 0x01);
    const second = makeRegistration(1, 0x02);
    expect(pool.add(first)).toBe(true);
    expect(pool.add(second)).toBe(false);

    const selected = pool.getForBlock(() => true);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(first);
  });

  it("returns at most MAX_RANDAO_COMMITMENT_REGISTRATIONS, oldest first", () => {
    const total = MAX_RANDAO_COMMITMENT_REGISTRATIONS + 2;
    for (let i = 0; i < total; i++) {
      pool.add(makeRegistration(i));
    }

    expect(indices(pool.getForBlock(() => true))).toEqual(
      Array.from({length: MAX_RANDAO_COMMITMENT_REGISTRATIONS}, (_, i) => i)
    );
    // the registrations over the cap are still stored for later blocks
    expect(pool.has(total - 1)).toBe(true);
  });

  it("skips registrations that are not includable and does not remove them", () => {
    pool.add(makeRegistration(1));
    pool.add(makeRegistration(2));
    pool.add(makeRegistration(3));

    expect(indices(pool.getForBlock((r) => r.message.validatorIndex !== 2))).toEqual([1, 3]);
    expect(pool.has(2)).toBe(true);
  });

  it("prune drops entries that should not be kept and allows re-adding them", () => {
    pool.add(makeRegistration(1));
    pool.add(makeRegistration(2));
    pool.prune((r) => r.message.validatorIndex === 2);

    expect(pool.has(1)).toBe(false);
    expect(pool.has(2)).toBe(true);
    expect(pool.add(makeRegistration(1))).toBe(true);
  });
});
