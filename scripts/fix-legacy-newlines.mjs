import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = 'bd36d1d26f9cf228cf728ddfbd4e3f233f535b73de4a06cc7a04d4676cca45ef';
try {
  if (!existsSync('package.json')) throw new Error('Exécutez ce script depuis la racine du projet (avec package.json).');
  const manifest = JSON.parse(readFileSync('archive/phase0/unmigrated-fragments.json', 'utf8'));
  const targets = [{ path: 'legacy/programme-shiva-legacy.html', hash: expected }, ...manifest.map(f => {
    if (!/^fragments\/\d{3}\.htmlpart$/.test(f.file) || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Manifest de conservation invalide.');
    return { path: 'archive/phase0/' + f.file, hash: f.sha256 };
  })];
  // Prévalidation complète : aucune écriture si un texte a réellement changé.
  const plan = targets.map(t => {
    const original = readFileSync(t.path);
    if (sha(original) === t.hash) return { ...t, bytes: original, changed: false };
    const restored = Buffer.from(original.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
    if (sha(restored) !== t.hash) throw new Error(`${t.path} : modification différente des fins de ligne. Aucun fichier réparé. Restaurez ce fichier depuis le ZIP original.`);
    return { ...t, bytes: restored, changed: true };
  });
  for (const t of plan.filter(t => t.changed)) {
    const mode = statSync(t.path).mode;
    try { chmodSync(t.path, mode | 0o200); writeFileSync(t.path, t.bytes); }
    finally { chmodSync(t.path, mode); }
  }
  const attrsPath = '.gitattributes';
  const previous = existsSync(attrsPath) ? readFileSync(attrsPath, 'utf8') : '';
  const block = '# SHIVA : conserver les octets des archives historiques\nlegacy/** -text\narchive/phase0/fragments/** -text\n';
  if (!previous.endsWith(block)) writeFileSync(attrsPath, previous + (previous.endsWith('\n') || !previous ? '' : '\n') + block);
  for (const t of plan) if (sha(readFileSync(t.path)) !== t.hash) throw new Error('Échec de vérification : ' + t.path);
  console.log(`${plan.length} fichiers historiques vérifiés ; ${plan.filter(t => t.changed).length} restaurés exactement. Protection Git ajoutée. Contrôle SHA-256 inchangé.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
