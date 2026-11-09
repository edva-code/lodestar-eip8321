import {ContainerType, ProgressiveContainerType, ProgressiveListCompositeType} from "@chainsafe/ssz";
import {MAX_RANDAO_COMMITMENT_REGISTRATIONS, VALIDATOR_REGISTRY_LIMIT} from "@lodestar/params";
import {ssz as hezeSsz} from "../heze/index.js";
import {ssz as primitiveSsz} from "../primitive/index.js";

const {BLSSignature, ValidatorIndex, Bytes32, Epoch} = primitiveSsz;

function activeFields(count: number, gaps: number[] = []): boolean[] {
  return Array.from({length: count}, (_, index) => !gaps.includes(index));
}

export const RandaoCommitmentRegistration = new ContainerType(
  {
    validatorIndex: ValidatorIndex,
    commitment: Bytes32,
  },
  {typeName: "RandaoCommitmentRegistration", jsonCase: "eth2"}
);

export const SignedRandaoCommitmentRegistration = new ContainerType(
  {
    message: RandaoCommitmentRegistration,
    signature: BLSSignature,
  },
  {typeName: "SignedRandaoCommitmentRegistration", jsonCase: "eth2"}
);

export const PendingRandaoCommitment = new ContainerType(
  {
    validatorIndex: ValidatorIndex,
    commitment: Bytes32,
    activationEpoch: Epoch,
  },
  {typeName: "PendingRandaoCommitment", jsonCase: "eth2"}
);

export const RandaoCommitmentRegistrations = new ProgressiveListCompositeType(SignedRandaoCommitmentRegistration, {
  typeName: "RandaoCommitmentRegistrations",
  limit: MAX_RANDAO_COMMITMENT_REGISTRATIONS,
});
export const RandaoCommitments = new ProgressiveListCompositeType(Bytes32, {
  typeName: "RandaoCommitments",
  limit: VALIDATOR_REGISTRY_LIMIT,
});
export const PendingRandaoCommitments = new ProgressiveListCompositeType(PendingRandaoCommitment, {
  typeName: "PendingRandaoCommitments",
});

export const BeaconState = new ProgressiveContainerType(
  {
    ...hezeSsz.BeaconState.fields,
    randaoCommitments: RandaoCommitments, // [New in EIP8321]
    pendingRandaoCommitments: PendingRandaoCommitments, // [New in EIP8321]
  },
  activeFields(48, [8, 9, 10, 28]),
  {typeName: "BeaconState", jsonCase: "eth2"}
);

export const BeaconBlockBody = new ProgressiveContainerType(
  {
    ...hezeSsz.BeaconBlockBody.fields,
    hashChainReveal: Bytes32, // [New in EIP8321]
    randaoCommitmentRegistrations: RandaoCommitmentRegistrations, // [New in EIP8321]
  },
  activeFields(15, [1, 6]),
  {typeName: "BeaconBlockBody", jsonCase: "eth2", cachePermanentRootStruct: true}
);

export const BeaconBlock = new ContainerType(
  {
    ...hezeSsz.BeaconBlock.fields,
    body: BeaconBlockBody,
  },
  {typeName: "BeaconBlock", jsonCase: "eth2", cachePermanentRootStruct: true}
);

export const SignedBeaconBlock = new ContainerType(
  {
    message: BeaconBlock,
    signature: BLSSignature,
  },
  {typeName: "SignedBeaconBlock", jsonCase: "eth2"}
);

export const BlockContents = new ContainerType(
  {
    ...hezeSsz.BlockContents.fields,
    block: BeaconBlock,
  },
  {typeName: "BlockContents", jsonCase: "eth2"}
);
