/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARC_GM_ADDRESS: string;
  readonly VITE_BADGE_ADDRESS: string;
  readonly VITE_PROFILE_ADDRESS: string;
  readonly VITE_TEMPLATE_DEPLOYER_ADDRESS: string;
  readonly VITE_GRAPH_URL: string;
  
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}