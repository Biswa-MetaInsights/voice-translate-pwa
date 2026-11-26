// Render the repository's existing vector logo; no branding replacement.
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const mobile = fileURLToPath(new URL('..', import.meta.url));
const source = await readFile(resolve(mobile, '../public/icon.svg'), 'utf8');
const contents = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
function png(size, padding = 24, background = '#f3fbfa', shape = 'square') {
  const scale = (512 - padding * 2) / 512;
  const backdrop = !background ? '' : shape === 'round' ? `<circle cx="256" cy="256" r="248" fill="${background}"/>` : shape === 'legacy' ? `<rect x="8" y="8" width="496" height="496" rx="96" fill="${background}"/>` : `<rect width="512" height="512" fill="${background}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${backdrop}<g transform="translate(${padding} ${padding}) scale(${scale})">${contents}</g></svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
await writeFile(resolve(mobile, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), png(1024));
const res = resolve(mobile, 'android/app/src/main/res');
for (const [density, factor] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const path = resolve(res, 'mipmap-' + density);
  for (const file of await readdir(path)) if (file.endsWith('.png')) {
    const foreground = file.includes('foreground');
    await writeFile(resolve(path, file), png((foreground ? 108 : 48) * factor, foreground ? 92 : 24, foreground ? null : '#f3fbfa', file.includes('round') ? 'round' : 'legacy'));
  }
}
for (const file of await readdir(resolve(mobile, 'ios/App/App/Assets.xcassets/Splash.imageset'))) if (file.endsWith('.png')) {
  await writeFile(resolve(mobile, 'ios/App/App/Assets.xcassets/Splash.imageset', file), png(2732, 180));
}
console.log('Rendered native icons from the existing VoiceTranslator vector logo.');
const store=resolve(mobile,'store-assets'); await mkdir(store,{recursive:true});
await writeFile(resolve(store,'store-icon.png'),png(512));
const graphic=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500"><rect width="1024" height="500" fill="#f3fbfa"/><rect x="0" y="476" width="1024" height="24" fill="#0f766e"/><g transform="translate(666 90) scale(.57)">${contents}</g><g fill="#142c22" font-family="DejaVu Sans,sans-serif"><text x="64" y="165" font-size="44" font-weight="bold">VoiceTranslator.eu</text><text x="64" y="230" font-size="29">Understand spoken words.</text><text x="64" y="280" font-size="29">Connect across languages.</text><text x="64" y="372" font-size="22" fill="#0f766e">Speak · Conversation · Voice notes</text></g></svg>`;
await writeFile(resolve(store,'feature-graphic.svg'),graphic);
await writeFile(resolve(store,'feature-graphic.png'),new Resvg(graphic,{font:{loadSystemFonts:true}}).render().asPng());
