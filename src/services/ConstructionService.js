import RosettaSDK from 'rosetta-node-sdk';
import { decode, createSignedTx, createSigningPayload, methods } from '@substrate/txwrapper';
import { u8aToHex, hexToU8a, stringToHex, hexToString } from '@polkadot/util';
import BN from 'bn.js';

const Types = RosettaSDK.Client;

import {
  publicKeyToAddress,
} from '../substrate/crypto';

import {
  getNetworkConnection,
  getNetworkIdentifier,
  getNetworkApiFromRequest,
} from '../substrate/connections';

import dckCurrency from '../helpers/currency';

import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import {
  Registry, DEVNODE_INFO, buildTransferTxn, signTxn,
} from '../offline-signing';
import { metadataRpc as metadata } from '../offline-signing/devnode-metadata.json';


/* Data API: Construction */

function paramsToPolkaTx(api, transaction) {
  const senderAddressHex = '0xFF';
  // const senderAddressHex = '0x' + transaction.substr(0, 96); // 96 is address length when encoded to hex
  // const txHex = '0x' + transaction.substr(96);
  // const polkaTx = api.createType('Extrinsic', hexToU8a(txHex));
  const polkaTx = api.createType('Extrinsic', hexToU8a('0x' + transaction));
  return { polkaTx, senderAddressHex };
}

/**
* Get Transaction Construction Metadata
* Get any information required to construct a transaction for a specific network. Metadata returned here could be a recent hash to use, an account sequence number, or even arbitrary chain state. It is up to the client to correctly populate the options object with any network-specific details to ensure the correct metadata is retrieved.  It is important to clarify that this endpoint should not pre-construct any transactions for the client (this should happen in the SDK). This endpoint is left purposely unstructured because of the wide scope of metadata that could be required.  In a future version of the spec, we plan to pass an array of Rosetta Operations to specify which metadata should be received and to create a transaction in an accompanying SDK. This will help to insulate the client from chain-specific details that are currently required here.
*
* constructionMetadataRequest ConstructionMetadataRequest
* returns ConstructionMetadataResponse
* */
const constructionMetadata = async (params) => {
  const { constructionMetadataRequest } = params;
  const api = await getNetworkApiFromRequest(constructionMetadataRequest);
  const { options } = constructionMetadataRequest;

  // Get signing info for extrinsic
  const nonce = (await api.query.system.account(options.from)).nonce.toNumber();
  const signingInfo = await api.derive.tx.signingInfo(options.from, nonce);
  const blockNumber = signingInfo.header.number.toNumber();
  const blockHash = await api.rpc.chain.getBlockHash(signingInfo.header.number);
  const eraPeriod = signingInfo.mortalLength;

  // Format into metadata object
  const response = new Types.ConstructionMetadataResponse({
    nonce,
    blockHash,
    blockNumber,
    eraPeriod,
  });

  // TODO: proper suggested fee of extrinsic
  // not required but maybe useful for some
  // response.suggested_fee = [{
  //   value: '10000',
  //   currency: dckCurrency,
  //   metadata: {}
  // }];

  return response;
};

/**
* Submit a Signed Transaction
* Submit a pre-signed transaction to the node. This call should not block on the transaction being included in a block. Rather, it should return immediately with an indication of whether or not the transaction was included in the mempool.  The transaction submission response should only return a 200 status if the submitted transaction could be included in the mempool. Otherwise, it should return an error.
*
* constructionSubmitRequest ConstructionSubmitRequest
* returns ConstructionSubmitResponse
* */
const constructionSubmit = async (params) => {
  console.log('constructionSubmit', params)
  const { constructionSubmitRequest } = params;
  return {};
};

/**
* Create Network Transaction from Signatures
* Combine creates a network-specific transaction from an unsigned transaction and an array of provided signatures. The signed transaction returned from this method will be sent to the `/construction/submit` endpoint by the caller.
*
* [OFFLINE]
* constructionCombineRequest ConstructionCombineRequest
* returns ConstructionCombineResponse
* */
const constructionCombine = async (params) => {
  const { constructionCombineRequest } = params;
  console.log('constructionCombineRequest', params)

  // TODO: get chainInfo from network params
  const registry = new Registry({ chainInfo: DEVNODE_INFO, metadata });

  const { unsigned_transaction, signatures } = constructionCombineRequest;
  const txInfo = decode(JSON.parse(unsigned_transaction), { metadataRpc: metadata, registry: registry.registry });
  const args = txInfo.method.args;

  // Ensure tx is balances.transfer
  if (txInfo.method.name !== 'transfer' || txInfo.method.pallet !== 'balances') {
    throw new Error(`Extrinsic must be method transfer and pallet balances`);
  }

  console.log('txInfo', txInfo.method)
  console.log('signatures', signatures);

  // const signature = signatures[0];
  //
  // const { address, hex_bytes, account_identifier, signature_type } = signature.signing_payload;
  //
  // const sourceAccountAddress = hexToString(senderAddressHex);

  // polkaTx.addSignature(sourceAccountAddress, )

  // console.log('sourceAccountAddress', sourceAccountAddress)
  // console.log('polkaTx combine', polkaTx.toHuman())

  return {};
};

/**
* Derive an Address from a PublicKey
* Derive returns the network-specific address associated with a public key. Blockchains that require an on-chain action to create an account should not implement this method.
*
* [OFFLINE]
* constructionDeriveRequest ConstructionDeriveRequest
* returns ConstructionDeriveResponse
* */
const constructionDerive = async (params) => {
  const { constructionDeriveRequest } = params;
  // TODO: get network from identifier without connecting
  // and get appropriate ss58Format value
  const publicKeyHex = '0x' + constructionDeriveRequest.public_key.hex_bytes;
  const publicKeyType = constructionDeriveRequest.public_key.curve_type;
  const address = await publicKeyToAddress(publicKeyHex, publicKeyType);
  return new Types.ConstructionDeriveResponse(address);
};

/**
* Get the Hash of a Signed Transaction
* TransactionHash returns the network-specific transaction hash for a signed transaction.
*
* [OFFLINE]
* constructionHashRequest ConstructionHashRequest
* returns TransactionIdentifierResponse
* */
const constructionHash = async (params) => {
  const { constructionHashRequest } = params;
  console.log('constructionHash', params)
  return {};
};

/**
* Parse a Transaction
* Parse is called on both unsigned and signed transactions to understand the intent of the formulated transaction. This is run as a sanity check before signing (after `/construction/payloads`) and before broadcast (after `/construction/combine`).
*
* [OFFLINE]
* constructionParseRequest ConstructionParseRequest
* returns ConstructionParseResponse
* */
const constructionParse = async (params) => {
  const { constructionParseRequest } = params;
  console.log('constructionParseRequest', params)

  const { signed, transaction } = constructionParseRequest;

  // TODO: get chainInfo from network params
  const registry = new Registry({ chainInfo: DEVNODE_INFO, metadata });

// ref: https://wiki.polkadot.network/docs/en/build-transaction-construction

  // Decode an unsigned tx
  const txInfo = decode(JSON.parse(transaction), { metadataRpc: metadata, registry: registry.registry });
  const args = txInfo.method.args;

  // Ensure tx is balances.transfer
  if (txInfo.method.name !== 'transfer' || txInfo.method.pallet !== 'balances') {
    throw new Error(`Extrinsic must be method transfer and pallet balances`);
  }

  // Ensure args are correct
  if (!args.dest || !args.value) {
    throw new Error('Extrinsic is missing dest and value args');
  }

  // TODO: need to somehow get source address but its not defined in extrinsic unless signed
  const sourceAccountAddress = txInfo.address;
  const destAccountAddress = args.dest;

  // Deconstruct transaction into operations
  const operations = [
    Types.Operation.constructFromObject({
      'operation_identifier': new Types.OperationIdentifier(0),
      'type': 'Transfer',
      'account': new Types.AccountIdentifier(sourceAccountAddress),
      'amount': new Types.Amount(
        new BN(args.value).neg().toString(),
        dckCurrency
      ),
    }),
    Types.Operation.constructFromObject({
      'operation_identifier': new Types.OperationIdentifier(1),
      'type': 'Transfer',
      'account': new Types.AccountIdentifier(destAccountAddress),
      'amount': new Types.Amount(
        args.value.toString(),
        dckCurrency
      ),
    }),
  ];

  // console.log('operations', operations);

  // Build list of signers, just one
  const signers = signed ? [sourceAccountAddress] : [];

  // Create response
  const response = new Types.ConstructionParseResponse(operations, signers);
  response.account_identifier_signers = signers.map(signer => new Types.AccountIdentifier(signer));
  return response;
};

/**
* Generate an Unsigned Transaction and Signing Payloads
* Payloads is called with an array of operations and the response from `/construction/metadata`. It returns an unsigned transaction blob and a collection of payloads that must be signed by particular addresses using a certain SignatureType. The array of operations provided in transaction construction often times can not specify all \"effects\" of a transaction (consider invoked transactions in Ethereum). However, they can deterministically specify the \"intent\" of the transaction, which is sufficient for construction. For this reason, parsing the corresponding transaction in the Data API (when it lands on chain) will contain a superset of whatever operations were provided during construction.
*
* [OFFLINE]
* constructionPayloadsRequest ConstructionPayloadsRequest
* returns ConstructionPayloadsResponse
* */
const constructionPayloads = async (params) => {
  const { constructionPayloadsRequest } = params;
  const { operations } = constructionPayloadsRequest;
  console.log('constructionPayloads', constructionPayloadsRequest);

  // Must have 2 operations, send and receive
  if (operations.length !== 2) {
    throw new Error('Need atleast 2 transfer operations');
  }

  // Sort by sender/reciever
  const senderOperations = operations
    .filter(operation =>
      new BN(operation.amount.value).isNeg()
    );

  const receiverOperations = operations
    .filter(operation =>
      !new BN(operation.amount.value).isNeg()
    );

  // Ensure we have correct amount of operations
  if (senderOperations.length !== 1 || receiverOperations.length !== 1) {
    throw new Error(`Payloads require 1 sender and 1 receiver transfer operation`);
  }

  const sendOp = senderOperations[0];
  const receiveOp = receiverOperations[0];

  // Support only transfer operation
  if (sendOp.type !== 'Transfer' || receiveOp.type !== 'Transfer') {
    throw new Error(`Payload operations must be of type Transfer`);
  }

  const senderAddress = sendOp.account.address;
  const toAddress = receiveOp.account.address;

  // console.log('senderOperations', senderOperations)
  // console.log('receiverOperations', receiverOperations)
  // TODO: provide proper signature type from public_keys in request
  const signatureType = 'ed25519';

  // Create a extrinsic, transferring randomAmount units to Bob.
  const { nonce, eraPeriod, blockNumber, blockHash } = constructionPayloadsRequest.metadata;

  // Initialize the registry
  const registry = new Registry({ chainInfo: DEVNODE_INFO, metadata });

  // Build the transfer txn
  const { unsignedTxn, signingPayload } = buildTransferTxn({
    from: senderAddress, to: toAddress, value: receiveOp.amount.value, tip: 0, nonce, eraPeriod, blockNumber, blockHash, registry,
  });

  // console.log('unsignedTxn', unsignedTxn)

  const unsignedTransaction = JSON.stringify({
    address: unsignedTxn.address,
    blockHash: unsignedTxn.blockHash,
    blockNumber: unsignedTxn.blockNumber,
    era: unsignedTxn.era,
    genesisHash: unsignedTxn.genesisHash,
    method: unsignedTxn.method,
    nonce: unsignedTxn.nonce,
    signedExtensions: unsignedTxn.signedExtensions,
    specVersion: unsignedTxn.specVersion,
    tip: unsignedTxn.tip,
    transactionVersion: unsignedTxn.transactionVersion,
    version: unsignedTxn.version,
  });

  // console.log('unsignedTxn', unsignedTxn.toString(), unsignedTxn.toHex, unsignedTxn.toU8a);
  // console.log('unsignedTxn', unsignedTransaction);
  // console.log(Object.keys(unsignedTxn));
  // return {};

  // ecdsa: r (32-bytes) || s (32-bytes) - 64 bytes
  // ecdsa_recovery: r (32-bytes) || s (32-bytes) || v (1-byte) - 65 bytes
  // ed25519: R (32-byte) || s (32-bytes) - 64 bytes
  // schnorr_1: r (32-bytes) || s (32-bytes) - 64 bytes
  // schnorr_poseidon: r (32-bytes) || s (32-bytes) where s = Hash(1st pk || 2nd pk || r) - 64 bytes

  // Create an array of payloads that must be signed by the caller
  const payloads = [{
    address: senderAddress,
    account_identifier: new Types.AccountIdentifier(senderAddress),
    hex_bytes: signingPayload.substr(2), // not sure correct value to go here, think its signing payload
    signature_type: signatureType,
  }];

  console.log('unsignedTransaction', unsignedTransaction)
  console.log('payloads', payloads)

  return new Types.ConstructionPayloadsResponse(unsignedTransaction, payloads);
};

/**
* Create a Request to Fetch Metadata
* Preprocess is called prior to /construction/payloads to construct a request for any metadata that is needed for transaction construction given (i.e. account nonce).
* The options object returned from this endpoint will be sent to the /construction/metadata endpoint UNMODIFIED by the caller (in an offline execution environment).
* If your Construction API implementation has configuration options, they MUST be specified in the /construction/preprocess request (in the metadata field).
*
* [OFFLINE]
* constructionPreprocessRequest ConstructionPreprocessRequest
* returns ConstructionPreprocessResponse
* */
const constructionPreprocess = async (params) => {
  const { constructionPreprocessRequest } = params;
  const { operations } = constructionPreprocessRequest;

  // Gather public keys needed for TXs
  const requiredPublicKeys = operations.map(operation => {
    return new Types.AccountIdentifier(operation.account.address); // TODO: do we need address or pks?
  });

  console.log('constructionPreprocess', operations);

  const senderAddress = operations.filter(operation => {
    return new BN(operation.amount.value).isNeg();
  }).map(operation => {
    return operation.account.address;
  });

  // TODO: this needs implementing in rosetta-node-client-sdk
  // return new Types.ConstructionPreprocessResponse();
  return {
    options: {
      from: senderAddress[0],
    }, // Configuration options
    required_public_keys: requiredPublicKeys
  }
};

module.exports = {
  /* /construction/metadata */
  constructionMetadata,

  /* /construction/submit */
  constructionSubmit,

  /* /construction/combine */
  constructionCombine,

  /* /construction/derive */
  constructionDerive,

  /* /construction/hash */
  constructionHash,

  /* /construction/parse */
  constructionParse,

  /* /construction/payloads */
  constructionPayloads,

  /* /construction/preprocess */
  constructionPreprocess,
};
