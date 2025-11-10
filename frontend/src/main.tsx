import React from 'react'
import ReactDOM from 'react-dom/client'
import SimpleApp from './SimpleApp'

console.log('Main.tsx loaded');

const rootElement = document.getElementById('root');
console.log('Root element:', rootElement);

if (!rootElement) {
  throw new Error('Root element not found');
}

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SimpleApp />
    </React.StrictMode>,
  )
  console.log('React app rendered');
} catch (error) {
  console.error('Error rendering app:', error);
  rootElement.innerHTML = `<div style="padding: 50px; color: red; background: white;">
    <h1>Error Loading App</h1>
    <p>${error}</p>
    <p>Check the console for more details.</p>
  </div>`;
}