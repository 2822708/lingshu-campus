import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** 独立入口与产物；不加载主游戏代理、环境文件、界面或服务器。 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  envPrefix: 'CARD_TRIAL_PUBLIC_',
  base: './',
  plugins: [react()],
  resolve: { preserveSymlinks: true, dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 3046, strictPort: true, open: false },
  preview: { host: '127.0.0.1', port: 3047, strictPort: true, open: false },
  build: { outDir: 'dist', emptyOutDir: true },
});
