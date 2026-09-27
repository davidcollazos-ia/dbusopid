import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('.', import.meta.url);
const site = new URL('_site/', root);

rmSync(site, { recursive: true, force: true });
mkdirSync(new URL('Data/', site), { recursive: true });
mkdirSync(new URL('static/img/', site), { recursive: true });

for (const file of ['index.html', 'visor_capas.html']) {
  cpSync(new URL(file, root), new URL(file, site));
}

for (const file of [
  'visor_estadisticas.json',
  'visor_cms_stats.json',
  'visor_cms_timeline.json',
  'visor_municipios.geojson.gz',
  'visor_provincias.geojson.gz',
  'visor_comarcas.geojson.gz'
]) {
  cpSync(new URL(`Data/${file}`, root), new URL(`Data/${file}`, site));
}

for (const file of ['visor_capas.js', 'visor_capas.css']) {
  cpSync(new URL(`static/${file}`, root), new URL(`static/${file}`, site));
}

cpSync(new URL('static/img/logo-pid.png', root), new URL('static/img/logo-pid.png', site));
writeFileSync(new URL('.nojekyll', site), '');
console.log('Sitio estático preparado en _site/.');
