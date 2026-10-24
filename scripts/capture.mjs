import { spawn } from 'child_process';
import fs from 'fs';

async function capture() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--ignore-certificate-errors',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--window-size=1600,1200'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));

    // Get page targets
    const res = await fetch('http://127.0.0.1:9223/json');
    const targets = await res.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === msgId) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await new Promise((resolve) => ws.addEventListener('open', resolve));

    // Navigate to local vite server
    await send('Page.enable');
    await send('Page.navigate', { url: 'https://localhost:5173/' });

    // Wait for canvas to be rendered and models loaded
    console.log('Navigated, waiting for 3D canvas render...');
    await new Promise(r => setTimeout(r, 6000));

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync('/tmp/3d_campus_render.png', buffer);
    console.log('Successfully wrote /tmp/3d_campus_render.png (' + buffer.length + ' bytes)');

    ws.close();
  } finally {
    chrome.kill();
  }
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
