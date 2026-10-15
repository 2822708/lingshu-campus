/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif SC"', 'serif'],
        mono: ['var(--font-body)'],
        sans: ['var(--font-body)'],
      },
      colors: {
        blue: { 300: '#56738c', 400: '#456b86' },
        green: { 300: '#4f7657', 400: '#396b51' },
        emerald: { 300: '#4f7657', 400: '#396b51' },
        purple: { 300: '#82678c', 400: '#755c7d' },
        cyan: { 300: '#4b7d80', 400: '#41747a' },
        yellow: { 300: '#96723c', 400: '#8d6b35' },
        orange: { 300: '#a36f4a', 400: '#92633f' },
        red: { 300: '#a7665b', 400: '#9b5045' },
        gray: { 300: '#657066', 400: '#616b5f', 500: '#657066' },
        // 保留原色（兼容现有组件）
        ink: {
          900: '#0f0f12',
          800: '#1a1b1e',
          700: '#27282d',
        },
        paper: {
          100: '#f5f5f0',
          200: '#e6e6dc',
          800: '#2d2d2a',
          900: '#1c1c1a',
        },
        mystic: {
          gold: '#cba135',
          jade: '#5c946e',
          blood: '#8a2c2c',
        },
        // 纸本校园风：主题变量兼容现有功能组件。
        npu: {
          // 主色
          bg: 'var(--npu-bg)',
          panel: 'var(--npu-panel)',
          border: 'var(--npu-border)',
          // 文本
          text: 'var(--npu-text)',
          dim: 'var(--npu-dim)',
          muted: 'var(--npu-muted)',
          // 强调色
          ink: 'var(--npu-ink)',
          'ink-light': 'var(--npu-ink-light)',
          code: 'var(--npu-code)',
          warn: 'var(--npu-warn)',
          // 学院代表色
          circuit: '#8d6b35',
          signal: '#456b86',
          algorithm: '#396b51',
          network: '#755c7d',
          optoelectronic: '#41747a',
          iot: '#92633f',
          material: '#9b5954',
          automation: '#8c586d',
        },
      },
      animation: {
        shake: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'float-up': 'floatUp 1s ease-out forwards',
        slash: 'slash 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' },
        },
        floatUp: {
          '0%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) scale(0.5)',
          },
          '20%': {
            opacity: '1',
            transform: 'translate(-50%, -150%) scale(1.2)',
          },
          '100%': {
            opacity: '0',
            transform: 'translate(-50%, -300%) scale(1)',
          },
        },
        slash: {
          '0%': {
            opacity: '0',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(0)',
          },
          '50%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(1)',
          },
          '100%': {
            opacity: '0',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(1.2)',
          },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
