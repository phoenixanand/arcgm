/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARC_GM_ADDRESS: string;
  readonly VITE_BADGES_ADDRESS: string;
  readonly VITE_PROFILE_ADDRESS: string;
  readonly VITE_TEMPLATE_DEPLOYER_ADDRESS: string;
  readonly VITE_GRAPH_URL: string;
  readonly VITE_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}