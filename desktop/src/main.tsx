import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueueWindow } from './QueueWindow';
import './styles.css';

const RootComponent = window.location.pathname === '/queue' ? QueueWindow : App;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
