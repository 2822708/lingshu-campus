import React from 'react';
import ReactDOM from 'react-dom/client';
import CardTrialApp from './CardTrialApp';
import './style.css';
import './tabletop.css';
import './motion.css';
import './viewport.css';
import './loadout.css';
import './hand.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('未找到独立试炼页面入口。');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <CardTrialApp />
  </React.StrictMode>
);
