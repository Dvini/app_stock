/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DISABLE_AI?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
