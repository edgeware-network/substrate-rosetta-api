import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import networkIdentifiers from '../network';

const connections = {};

class SubstrateNetworkConnection {
  constructor({ nodeAddress, types }) {
    this.nodeAddress = nodeAddress;
    this.types = types;
  }

  async connect() {
    if (this.api && this.api.isConnected) {
      return this.api;
    }

    // TODO: max retry attempt and connection rejected error
    this.api = await ApiPromise.create({
      provider: new WsProvider(this.nodeAddress),
      types: this.types,
    });

    return this.api;
  }
}

export function getNetworkIdentifier({ blockchain, network }) {
  for (let i = 0; i < networkIdentifiers.length; i++) {
    const networkIdentifier = networkIdentifiers[i];
    if (blockchain === networkIdentifier.blockchain && network === networkIdentifier.network) {
      return networkIdentifier;
    }
  }

  return null;
}

export async function getNetworkApiFromRequest(networkRequest) {
  const targetNetworkIdentifier = networkRequest.network_identifier || networkIdentifiers[0];
  const { blockchain, network } = targetNetworkIdentifier;
  const networkIdentifier = getNetworkIdentifier(targetNetworkIdentifier);
  if (networkIdentifier) {
    const { api } = await getNetworkConnection(networkIdentifier);
    return api;
  } else {
    throw new Error(`Can't find network with blockchain and network of: ${blockchain}, ${network}`);
  }
}

export async function getNetworkConnection(networkIdentifier) {
  const { nodeAddress } = networkIdentifier;
  if (!connections[nodeAddress]) {
    const connection = new SubstrateNetworkConnection(networkIdentifier);
    connections[nodeAddress] = connection;
    await connection.connect();
  }

  return connections[nodeAddress];
}
