import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';

// 从环境变量获取代理目标，默认使用 SiliconFlow
const getProxyTarget = () => {
  const customUrl = process.env.VITE_AI_API_URL;
  if (customUrl) {
    // 从完整 URL 中提取基础 URL
    try {
      const url = new URL(customUrl);
      return url.origin;
    } catch {
      // 如果解析失败，使用默认值
    }
  }

  // 根据提供商选择目标
  const provider = process.env.VITE_AI_PROVIDER || 'siliconflow';
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com';
    case 'siliconflow':
      return 'https://api.siliconflow.cn';
    default:
      return 'https://api.siliconflow.cn';
  }
};

export default defineConfig({
  // 资源 base path：
  // - 本地 dev（npm run dev）：默认 '/'
  // - 服务器部署（npm run build:server）：用 VITE_BASE 环境变量覆盖为 '/xiuxian/'
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0', // 允许局域网访问
    port: 3000, // 与 README 中声明的端口一致
    strictPort: false, // 端口被占用时自动切换到下一个可用端口
    open: false, // 不自动打开浏览器（避免 Windows 上被默认浏览器截胡）
    proxy: {
      '/api': {
        target: getProxyTarget(),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('代理错误:', err);
          });
        },
      },
    },
  },
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey'],
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
