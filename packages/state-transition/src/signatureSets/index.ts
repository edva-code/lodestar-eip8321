import {BeaconConfig} from "@lodestar/config";
import {ForkSeq} from "@lodestar/params";
import {IndexedAttestation, SignedBeaconBlock, altair, capella, gloas, heze} from "@lodestar/types";
import {byteArrayEquals} from "@lodestar/utils";
import {getSyncCommitteeSignatureSet} from "../block/processSyncCommittee.js";
import {SyncCommitteeCache} from "../cache/syncCommitteeCache.js";
import {ZERO_HASH} from "../constants/constants.js";
import {IBeaconStateView, IBeaconStateViewGloas} from "../stateView/interface.js";
import {ISignatureSet, createAggregateSignatureSetFromComponents} from "../util/index.js";
import {getAttesterSlashingsSignatureSets} from "./attesterSlashings.js";
import {getBlsToExecutionChangeSignatureSets} from "./blsToExecutionChange.js";
import {getAttestationsSignatureSets} from "./indexedAttestation.js";
import {getPayloadAttestationDataSigningRoot} from "./indexedPayloadAttestation.js";
import {getBlockProposerSignatureSet} from "./proposer.js";
import {getProposerSlashingsSignatureSets} from "./proposerSlashings.js";
import {getRandaoRevealSignatureSet} from "./randao.js";
import {getVoluntaryExitsSignatureSets} from "./voluntaryExits.js";

export * from "./attesterSlashings.js";
export * from "./blsToExecutionChange.js";
export * from "./executionPayloadBid.js";
export * from "./executionPayloadEnvelope.js";
export * from "./indexedAttestation.js";
export * from "./indexedPayloadAttestation.js";
export * from "./proposer.js";
export * from "./proposerPreferences.js";
export * from "./proposerSlashings.js";
export * from "./randao.js";
export * from "./voluntaryExits.js";

/**
 * Includes all signatures on the block (except the deposit signatures) for verification.
 * Deposits are not included because they can legally have invalid signatures.
 */
export function getBlockSignatureSets(
  config: BeaconConfig,
  currentSyncCommitteeIndexed: SyncCommitteeCache,
  state: IBeaconStateView,
  signedBlock: SignedBeaconBlock,
  indexedAttestations: IndexedAttestation[],
  opts?: {
    /** Useful since block proposer signature is verified beforehand on gossip validation */
    skipProposerSignature?: boolean;
  }
): ISignatureSet[] {
  // fork based validations
  const fork = config.getForkSeq(signedBlock.message.slot);

  // A non-zero hash chain reveal means processRandao takes the hash chain path, which has no BLS reveal to verify
  const hasHashChainReveal =
    fork >= ForkSeq.heze && !byteArrayEquals((signedBlock as heze.SignedBeaconBlock).message.body.hashChainReveal, ZERO_HASH);

  const signatureSets = [
    ...(hasHashChainReveal ? [] : [getRandaoRevealSignatureSet(config, signedBlock.message)]),
    ...getProposerSlashingsSignatureSets(config, signedBlock),
    ...getAttesterSlashingsSignatureSets(config, signedBlock),
    ...getAttestationsSignatureSets(config, signedBlock, indexedAttestations),
    ...getVoluntaryExitsSignatureSets(config, state, signedBlock),
  ];

  if (!opts?.skipProposerSignature) {
    signatureSets.push(getBlockProposerSignatureSet(config, signedBlock));
  }

  // Only after altair fork, validate tSyncCommitteeSignature
  if (fork >= ForkSeq.altair) {
    const syncCommitteeSignatureSet = getSyncCommitteeSignatureSet(
      config,
      currentSyncCommitteeIndexed,
      (signedBlock as altair.SignedBeaconBlock).message
    );
    // There may be no participants in this syncCommitteeSignature, so it must not be validated
    if (syncCommitteeSignatureSet) {
      signatureSets.push(syncCommitteeSignatureSet);
    }
  }

  // only after capella fork
  if (fork >= ForkSeq.capella) {
    const blsToExecutionChangeSignatureSets = getBlsToExecutionChangeSignatureSets(
      config,
      signedBlock as capella.SignedBeaconBlock
    );
    if (blsToExecutionChangeSignatureSets.length > 0) {
      signatureSets.push(...blsToExecutionChangeSignatureSets);
    }
  }

  if (fork >= ForkSeq.gloas) {
    for (const payloadAttestation of (signedBlock as gloas.SignedBeaconBlock).message.body.payloadAttestations) {
      const ptc = (state as IBeaconStateViewGloas).getPayloadTimelinessCommittee(payloadAttestation.data.slot);
      signatureSets.push(
        createAggregateSignatureSetFromComponents(
          payloadAttestation.aggregationBits.intersectValues(ptc),
          getPayloadAttestationDataSigningRoot(config, payloadAttestation.data),
          payloadAttestation.signature
        )
      );
    }
  }

  return signatureSets;
}
