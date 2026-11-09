import {ValueOf} from "@chainsafe/ssz";
import * as ssz from "./sszTypes.js";

export type RandaoCommitmentRegistration = ValueOf<typeof ssz.RandaoCommitmentRegistration>;
export type SignedRandaoCommitmentRegistration = ValueOf<typeof ssz.SignedRandaoCommitmentRegistration>;
export type PendingRandaoCommitment = ValueOf<typeof ssz.PendingRandaoCommitment>;

export type BeaconState = ValueOf<typeof ssz.BeaconState>;
export type BeaconBlockBody = ValueOf<typeof ssz.BeaconBlockBody>;
export type BeaconBlock = ValueOf<typeof ssz.BeaconBlock>;
export type SignedBeaconBlock = ValueOf<typeof ssz.SignedBeaconBlock>;
export type BlockContents = ValueOf<typeof ssz.BlockContents>;
export type SignedBlockContents = {signedBlock: SignedBeaconBlock};
