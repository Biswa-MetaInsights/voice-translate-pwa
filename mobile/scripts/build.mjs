import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { validateBackend } from '../src/network.js';
import { PRIVACY_SECTIONS } from '../src/privacy.js';
const mobile = fileURLToPath(new URL('..', import.meta.url)), root = resolve(mobile, '..');
const backend = validateBackend(process.env.MOBILE_BACKEND_ORIGIN, { allowProduction: process.env.MOBILE_ALLOW_PRODUCTION_BACKEND === 'true' });
await build({ root, configFile: false, publicDir: resolve(root, 'public'),
  resolve: { alias: Object.fromEntries(['core', 'share', 'filesystem'].map(name => ['@capacitor/' + name, resolve(mobile, `node_modules/@capacitor/${name}/dist/esm/index.js`)]).map(([name, path]) => [name, name === '@capacitor/core' ? resolve(mobile, 'node_modules/@capacitor/core/dist/index.js') : path])) },
  build: { target: 'es2022', outDir: resolve(mobile, 'dist'), emptyOutDir: true, rollupOptions: { input: { main: resolve(root, 'index.html'), voiceNote: resolve(root, 'voice-note.html') } } },
  plugins: [{ name: 'mobile-only-entries',
    transformIndexHtml: { order: 'pre', handler(html, context) {
      const screen = context.filename.endsWith('voice-note.html') ? 'note' : 'live';
      return html.replace('<body>', `<body data-mobile-screen="${screen}">`).replace('/src/main.js', '/mobile/src/live-entry.js').replace('/src/voice-note.js', '/mobile/src/note-entry.js')
        .replace(/<script[^>]*src="\/src\/(?:analytics|feedback)\.js"[^>]*><\/script>/g, '')
        .replace(/<link rel="manifest"[^>]*>/g, '');
    } },
    transform(code, id) {
      if (id === resolve(root, 'src/main.js')) return code.replace("if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));", '');
      if (id === resolve(root, 'src/voice-note.js')) return code.replace(/if \('serviceWorker' in navigator\) \{\s*navigator\.serviceWorker\.register\('[^']+'\)[\s\S]*?\n\}/, '');
    },
  }],
});
// Native apps load their signed, bundled UI. They do not install a PWA worker.
for (const name of ['sw.js', 'voice-note-share.js', 'manifest.webmanifest', 'install.html', 'traffic.html']) await rm(resolve(mobile, 'dist', name), { force: true });
await writeFile(resolve(mobile, 'dist/mobile-config.json'), JSON.stringify({ backend }));
// One policy source for both the offline in-app notice and deployable web page.
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await writeFile(resolve(mobile, 'dist/privacy.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VoiceTranslator mobile privacy</title><style>body{font:1rem/1.65 system-ui;margin:24px auto;padding:0 20px;max-width:760px;color:#142c22}h2{font-size:1.2rem}a{color:#0f766e}</style><main><h1>VoiceTranslator mobile privacy</h1>${PRIVACY_SECTIONS.map(([title,text])=>`<h2>${escape(title)}</h2><p>${escape(text)}</p>`).join('')}<p><a href="mailto:metainsights.bv@gmail.com">Contact MetaInsights BV</a></p></main></html>`);
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>BackendOrigin</key><string>${backend}</string></dict></plist>`;
for (const target of ['ios/App/App', 'ios/App/VoiceNoteShare']) {
  await mkdir(resolve(mobile, target), { recursive: true });
  await writeFile(resolve(mobile, target, 'Backend.plist'), plist);
}
console.log('Built bundled mobile UI and backend configuration. No deployment performed.');
