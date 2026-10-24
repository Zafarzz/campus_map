import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const artDir = '/home/zafargg/.gemini/antigravity/brain/a6f32017-cdfc-449e-b5cd-936730d12772';

async function main() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--ignore-certificate-errors',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--window-size=1600,1000',
  ]);

  try {
    await new Promise((r) => setTimeout(r, 1500));

    const res = await fetch('http://127.0.0.1:9224/json');
    const targets = await res.json();
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
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

    await send('Page.enable');
    await send('Page.navigate', { url: 'https://localhost:5173/' });

    console.log('Navigated, waiting for Three.js render...');
    await new Promise((r) => setTimeout(r, 6000));

    // Hide UI overlays for clean captures
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const uis = document.querySelectorAll('aside, header, nav, .absolute.top-4, .pointer-events-none');
          uis.forEach(el => el.style.display = 'none');
        })()
      `,
    });

    async function moveCamera(px, py, pz, tx, ty, tz) {
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            if (window.__cameraControls && typeof window.__cameraControls.setLookAt === 'function') {
              window.__cameraControls.setLookAt(${px}, ${py}, ${pz}, ${tx}, ${ty}, ${tz}, false);
            }
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1200));
    }

    async function snap(filename) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(screenshot.data, 'base64');
      const outPath = path.join(artDir, filename);
      fs.writeFileSync(outPath, buffer);
      console.log(`Saved ${filename} (${buffer.length} bytes)`);
    }

    // 1. Campus Overview
    await snap('rendered_campus_overview.png');

    // 2. Entrance Plaza: focus on 20m entrance road, "I ♥ AJOU", and Grand Fountain
    await moveCamera(130, 26, 24, 88, 0, 6);
    await snap('rendered_entrance_plaza.png');

    // 3. Tennis Court & Basketball Court
    await moveCamera(120, 32, -12, 88, 0, 7);
    await snap('rendered_tennis_court.png');

    // 4. Block B (5m) and Block C (20m) Fence Clearances
    await moveCamera(135, 42, 85, 90, 0, 85);
    await snap('rendered_block_bc_fence.png');

    // 5. Sports Facilities: Barrel-vaulted Sports Complex, Soccer pitch with 3D goals, Basketball hoops
    await moveCamera(45, 50, -45, 10, 0, 15);
    await snap('rendered_sports_facilities.png');

    // 6. Photovoltaic Solar Canopies & Dormitory Quadrangle (bld-j)
    await moveCamera(-15, 38, 168, -48, 0, 120);
    await snap('rendered_solar_canopies_and_dorm.png');

    // 7. Central Pedestrian Promenade, Avenue Street Trees, and Lighting
    await moveCamera(13, 20, -15, 13, 0, 45);
    await snap('rendered_central_promenade.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
