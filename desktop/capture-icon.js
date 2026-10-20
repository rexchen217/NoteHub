const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'icon-master.png');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'icon-render.html'));
  await new Promise(r => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('PNG saved to', OUT);
  app.quit();
});
