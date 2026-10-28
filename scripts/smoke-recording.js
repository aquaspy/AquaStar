#!/usr/bin/env node
'use strict';

// Records about one second of a moving canvas plus a tone through the real
// capture preload and res/ipc/recording.js, then checks the file with ffprobe.
//
//   xvfb-run -a npx electron scripts/smoke-recording.js
//   node scripts/smoke-recording.js /tmp/aquastar-smoke.mp4

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (!process.versions.electron) {
  const electron = require('electron');
  const child = spawn(electron, ['--no-sandbox', __filename].concat(process.argv.slice(2)), {
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', function (code) { process.exit(code == null ? 1 : code); });
} else {
  const { app, BrowserWindow, session } = require('electron');
  const recording = require('../res/ipc/recording.js');
  const userArgs = process.argv.slice(1).filter(function (arg) {
      return arg !== __filename && arg.indexOf('-') !== 0;
    });
    const outPath = path.resolve(userArgs[0] || '/tmp/aquastar-smoke-recording.mp4');
  process.env.AQUASTAR_RECORDING_PATH = outPath;

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  const fail = function (message) {
    console.error('[smoke-recording] ' + message);
    app.exit(1);
  };

  app.whenReady().then(async function () {
    try { fs.unlinkSync(outPath); } catch (err) { /* first run */ }
    session.defaultSession.setPermissionRequestHandler(function (_contents, permission, callback) {
      callback(permission === 'display-capture' || permission === 'media');
    });
    recording.install(session.defaultSession);

    const htmlPath = path.join(require('os').tmpdir(), 'aquastar-smoke-recording.html');
    fs.writeFileSync(htmlPath, [
      '<!doctype html><title>AquaStar recording smoke</title>',
      '<canvas id="c" width="640" height="360"></canvas><script>',
      'const c = document.getElementById("c");',
      'const g = c.getContext("2d");',
      'let x = 0;',
      'function frame(){',
      '  g.fillStyle = "#102030"; g.fillRect(0,0,640,360);',
      '  g.fillStyle = "#ffcc33"; g.fillRect(x, 40, 80, 160);',
      '  g.fillStyle = "#fff"; g.font = "32px sans-serif"; g.fillText("REC", 24, 36);',
      '  x = (x + 6) % 540; requestAnimationFrame(frame);',
      '}',
      'frame();',
      'const ctx = new AudioContext();',
      'const osc = ctx.createOscillator();',
      'const gain = ctx.createGain();',
      'osc.frequency.value = 440; gain.gain.value = 0.2;',
      'osc.connect(gain); gain.connect(ctx.destination); osc.start();',
      '</script>'
    ].join('\n'));

    const win = new BrowserWindow({
      width: 640,
      height: 400,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, '../res/features/capture/preload_capture.js')
      }
    });
    win.webContents.on('console-message', function (event) {
      const message = event && event.message ? event.message : '';
      if (message) console.log('[renderer] ' + message);
    });

    await win.loadFile(htmlPath);
    recording.triggerRecording(win);
    await new Promise(function (resolve) { setTimeout(resolve, 1500); });
    recording.triggerRecording(win);

    const started = Date.now();
    let size = 0;
    while (Date.now() - started < 8000) {
      if (fs.existsSync(outPath)) size = fs.statSync(outPath).size;
      if (size > 1000) break;
      await new Promise(function (resolve) { setTimeout(resolve, 200); });
    }
    if (size < 1000) {
      fail('no recording at ' + outPath);
      return;
    }

    const raw = execFileSync('ffprobe', [
      '-hide_banner', '-show_streams', '-show_format', '-of', 'json', outPath
    ], { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    const streams = parsed.streams || [];
    const video = streams.filter(function (stream) { return stream.codec_type === 'video'; })[0];
    const audio = streams.filter(function (stream) { return stream.codec_type === 'audio'; })[0];
    console.log('[smoke-recording] file ' + outPath + ' ' + size + ' bytes');
    console.log('[smoke-recording] video ' + (video && video.codec_name) + ' ' + (video && video.width) + 'x' + (video && video.height));
    console.log('[smoke-recording] audio ' + (audio ? audio.codec_name : 'none'));
    if (!video || video.codec_name !== 'h264') {
      fail('expected an H.264 video stream');
      return;
    }
    if (!audio) {
      fail('expected an audio stream');
      return;
    }
    try { fs.unlinkSync(htmlPath); } catch (err) { /* temp page */ }
    app.exit(0);
  }).catch(function (err) {
    fail(err && err.stack ? err.stack : err);
  });
}
