'use strict';
(() => {
  const preferences = document.getElementById('preferences');
  if (!preferences) return;
  const section = document.createElement('section');
  section.className = 'card';
  const title = document.createElement('h2');
  title.textContent = 'Screenshots and recording';
  const text = document.createElement('p');
  text.textContent =
    'Capture your game as PNG screenshots or MP4 video. Use F2 for screenshots and Ctrl+J to start or stop recording.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open Capture Controls';
  button.onclick = () =>
    window.__TAURI__.core.invoke('capture_show').catch((error) => {
      text.textContent = String(error);
    });
  section.append(title, text, button);
  preferences.append(section);
})();
