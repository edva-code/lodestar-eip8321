import {
  BitVectorType,
  ContainerType,
  ProgressiveContainerType,
  ProgressiveListCompositeType,
  VectorBasicType,
} from "@chainsafe/ssz";
import {
  INCLUSION_LIST_COMMITTEE_SIZE,
  MAX_RANDAO_COMMITMENT_REGISTRATIONS,
  VALIDATOR_REGISTRY_LIMIT,
} from "@lodestar/params";
import {ssz as gloasSsz} from "../gloas/index.js";
import {ssz as primitiveSsz} from "../primitive/index.js";

const {Slot, Root, BLSSignature, ValidatorIndex, Bytes32, Epoch} = primitiveSsz;

function activeFields(count: number): boolean[] {
  return Array.from({length: count}, () => true);
}

export const InclusionListCommittee = new VectorBasicType(ValidatorIndex, INCLUSION_LIST_COMMITTEE_SIZE);

export const InclusionListBits = new BitVectorType(INCLUSION_LIST_COMMITTEE_SIZE);

export const InclusionList = new ContainerType(
  {
    slot: Slot,
    validatorIndex: ValidatorIndex,
    dependentRoot: Root,
    transactions: gloasSsz.Transactions,
  },
  {typeName: "InclusionList", jsonCase: "eth2"}
);

export const SignedInclusionList = new ContainerType(
  {
    message: InclusionList,
    signature: BLSSignature,
  },
  {typeName: "SignedInclusionList", jsonCase: "eth2"}
);

export const InclusionListsByIndicesRequest = new ContainerType(
  {
    slot: Slot,
    dependentRoot: Root,
    indices: InclusionListBits,
  },
  {typeName: "InclusionListsByIndicesRequest", jsonCase: "eth2"}
);

export const ExecutionPayloadBid = new ProgressiveContainerType(
  {
    ...gloasSsz.ExecutionPayloadBid.fields,
    inclusionListBits: InclusionListBits, // [New in Heze:EIP7805]
  },
  activeFields(13),
  {typeName: "ExecutionPayloadBid", jsonCase: "eth2"}
);

export const SignedExecutionPayloadBid = new ContainerType(
  {
    message: ExecutionPayloadBid, // [Modified in Heze:EIP7805]
    signature: BLSSignature,
  },
  {typeName: "SignedExecutionPayloadBid", jsonCase: "eth2"}
);

export const DataColumnSidecar = gloasSsz.DataColumnSidecar;
export const DataColumnSidecars = gloasSsz.DataColumnSidecars;

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
    ...gloasSsz.BeaconState.fields,
    latestExecutionPayloadBid: ExecutionPayloadBid, // [Modified in Heze:EIP7805]
    randaoCommitments: RandaoCommitments, // [New in Heze:EIP8321]
    pendingRandaoCommitments: PendingRandaoCommitments, // [New in Heze:EIP8321]
  },
  activeFields(48),
  {typeName: "BeaconState", jsonCase: "eth2"}
);

export const BeaconBlockBody = new ProgressiveContainerType(
  {
    ...gloasSsz.BeaconBlockBody.fields,
    signedExecutionPayloadBid: SignedExecutionPayloadBid, // [Modified in Heze:EIP7805]
    hashChainReveal: Bytes32, // [New in Heze:EIP8321]
    randaoCommitmentRegistrations: RandaoCommitmentRegistrations, // [New in Heze:EIP8321]
  },
  activeFields(15),
  {typeName: "BeaconBlockBody", jsonCase: "eth2", cachePermanentRootStruct: true}
);

export const BeaconBlock = new ContainerType(
  {
    ...gloasSsz.BeaconBlock.fields,
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
    ...gloasSsz.BlockContents.fields,
    block: BeaconBlock,
  },
  {typeName: "BlockContents", jsonCase: "eth2"}
);

// PayloadAttributes primarily for SSE event
export const PayloadAttributes = new ContainerType(
  {
    ...gloasSsz.PayloadAttributes.fields,
    inclusionListTransactions: gloasSsz.Transactions, // [New in Heze:EIP7805]
  },
  {typeName: "PayloadAttributes", jsonCase: "eth2"}
);

export const SSEPayloadAttributes = new ContainerType(
  {
    ...gloasSsz.SSEPayloadAttributes.fields,
    payloadAttributes: PayloadAttributes, // [Modified in Heze:EIP7805]
  },
  {typeName: "SSEPayloadAttributes", jsonCase: "eth2"}
);
