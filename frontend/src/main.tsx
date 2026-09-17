// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { WagmiProvider, createConfig, http } from 'wagmi';
// import { injected, walletConnect } from 'wagmi/connectors';
// import { BrowserRouter } from 'react-router-dom';
// import { arcTestnet } from './lib/chain';
// import App from './App';
// import './styles.css';

// const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
// const connectors = [injected({shimDisconnect:true}), ...(projectId ? [walletConnect({ projectId, showQrModal:true })] : [])];
// const config = createConfig({ chains:[arcTestnet], connectors, transports:{[arcTestnet.id]:http()} });
// const queryClient = new QueryClient();

// ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></WagmiProvider></React.StrictMode>);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { BrowserRouter } from 'react-router-dom';
import { arcTestnet } from './lib/chain';
import App from './App';
import './styles.css';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// EIP-6963 discovery is enabled so MetaMask, Rabby, and other injected
// wallets can coexist and be selected as separate wagmi connectors.
const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
];

const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: { [arcTestnet.id]: http('https://rpc.testnet.arc.network') },
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