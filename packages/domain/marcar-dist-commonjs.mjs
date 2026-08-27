/**
 * Marca `dist/` como CommonJS.
 *
 * El package.json de este paquete dice `"type": "module"`, así que Node trata
 * cualquier `.js` de adentro como ESM. Pero `dist/` se compila a CommonJS para
 * que `cloud-api` (que es CommonJS) pueda hacer `require()` — sin esta marca,
 * Node lee el `exports.x = ...` del build y falla con "exports is not defined
 * in ES module scope".
 *
 * Un package.json con `"type": "commonjs"` dentro de la carpeta invierte la
 * regla sólo ahí, que es exactamente lo que queremos: la fuente sigue siendo
 * ESM para el POS y el build es CommonJS para el servidor.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const destino = join(import.meta.dirname, 'dist', 'package.json');
writeFileSync(destino, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log(`dist marcado como CommonJS: ${destino}`);
