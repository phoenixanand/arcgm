import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { BrowserRouter } from 'react-router-dom';
import { arcTestnet, arcMainnet } from './lib/chain';
import App from './App';
import './styles.css';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// EIP-6963 discovery is enabled so MetaMask, Rabby, and other injected
// wallets can coexist and be selected as separate wagmi connectors.
const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
];

// App.tsx reads and writes against arcMainnet everywhere (writeContractAsync,
// readContract, waitForTransactionReceipt all pin chainId: arcMainnet.id).
// wagmi's `config` needs its own registered chain + transport for that ID to
// serve reads — this is separate from the wallet's own network list, which
// is why writes worked (they go through the wallet's RPC) while reads threw
// "Chain not configured" (they go through this config's transports).
// arcTestnet stays registered too in case any dev/test flows still target it.
const config = createConfig({
  chains: [arcMainnet, arcTestnet],
  connectors,
  transports: {
    [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0]),
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
  multiInjectedProviderDiscovery: true,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
