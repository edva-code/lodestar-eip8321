import {ContainerType, ValueOf} from "@chainsafe/ssz";
import {DbReqOpts, encodeKey} from "@lodestar/db";
import {BLSPubkey, ssz} from "@lodestar/types";
import {Bucket, getBucketNameByValue} from "../buckets.js";
import {LodestarValidatorDatabaseController} from "../types.js";

const RandaoHashChainType = new ContainerType({
  secret: ssz.Bytes32,
  length: ssz.UintNum64,
});

export type RandaoHashChain = ValueOf<typeof RandaoHashChainType>;

/**
 * Store EIP-8321 hash chain secrets by validator pubkey.
 * A registered commitment can never be replaced, losing the secret means the validator can no longer propose.
 */
export class RandaoHashChainRepository {
  protected bucket = Bucket.validator_randaoHashChain;

  private readonly bucketId = getBucketNameByValue(this.bucket);
  private readonly dbReqOpts: DbReqOpts = {bucketId: this.bucketId};

  constructor(protected db: LodestarValidatorDatabaseController) {}

  async get(pubkey: BLSPubkey): Promise<RandaoHashChain | null> {
    const bytes = await this.db.get(encodeKey(this.bucket, pubkey), this.dbReqOpts);
    return bytes ? RandaoHashChainType.deserialize(bytes) : null;
  }

  async set(pubkey: BLSPubkey, chain: RandaoHashChain): Promise<void> {
    await this.db.put(encodeKey(this.bucket, pubkey), RandaoHashChainType.serialize(chain), this.dbReqOpts);
  }
}
