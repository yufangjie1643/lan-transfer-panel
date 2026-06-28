import os from 'node:os';

process.env.PANEL_BIND = process.env.PANEL_BIND || defaultBindAddresses();
process.env.PANEL_PORT = process.env.PANEL_PORT || '5590';

await import('../server.js');

function defaultBindAddresses() {
  const addresses = new Set(['127.0.0.1']);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && entry.address === '10.42.0.1') {
        addresses.add('10.42.0.1');
      }
    }
  }
  return [...addresses].join(',');
}
