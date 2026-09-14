/**
 * DB export / import utility (no mongodump needed — uses the project's mongodb driver).
 *
 *   node scripts/db-migrate.js export                       # dump MONGODB_URI -> db-backup/<timestamp>/
 *   node scripts/db-migrate.js export --out db-backup/foo   # custom folder
 *   node scripts/db-migrate.js import --from db-backup/<dir> --to "<NEW_MONGODB_URI>"
 *   node scripts/db-migrate.js import --from db-backup/<dir> --to "<NEW_MONGODB_URI>" --drop   # wipe target collections first
 *   node scripts/db-migrate.js verify --to "<NEW_MONGODB_URI>"   # compare doc counts old vs new
 *
 * Dump format: one <collection>.json per collection in Extended JSON (ObjectId/Date preserved)
 * plus <collection>.indexes.json so indexes are recreated on import.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const flag = (name) => args.includes(name);

const SOURCE_URI = process.env.MONGODB_URI;
const ROOT = path.join(__dirname, '..');

async function exportDb() {
  if (!SOURCE_URI) throw new Error('MONGODB_URI missing in .env');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(ROOT, opt('--out') || path.join('db-backup', stamp));
  fs.mkdirSync(outDir, { recursive: true });

  const client = new MongoClient(SOURCE_URI);
  await client.connect();
  const db = client.db();
  console.log(`Exporting "${db.databaseName}" -> ${outDir}`);

  const manifest = { db: db.databaseName, exportedAt: new Date().toISOString(), collections: {} };
  for (const { name } of await db.listCollections().toArray()) {
    const col = db.collection(name);
    const docs = await col.find({}).toArray();
    const indexes = (await col.indexes()).filter((i) => i.name !== '_id_');
    fs.writeFileSync(path.join(outDir, `${name}.json`), EJSON.stringify(docs, { relaxed: false }));
    fs.writeFileSync(path.join(outDir, `${name}.indexes.json`), JSON.stringify(indexes, null, 2));
    manifest.collections[name] = docs.length;
    console.log(`  ${name}: ${docs.length} docs, ${indexes.length} custom indexes`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await client.close();
  console.log('Done. Backup folder:', outDir);
}

async function importDb() {
  const from = opt('--from');
  const to = opt('--to');
  if (!from || !to) throw new Error('Usage: import --from <backup dir> --to "<mongodb uri>"');
  const dir = path.resolve(ROOT, from);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  const client = new MongoClient(to);
  await client.connect();
  const db = client.db();
  if (!db.databaseName || db.databaseName === 'test') {
    throw new Error(`Target URI has no database name (got "${db.databaseName}"). Add /pranaair-blog before the "?" in the URI.`);
  }
  console.log(`Importing ${dir} -> "${db.databaseName}" (${flag('--drop') ? 'DROP existing' : 'upsert'})`);

  for (const name of Object.keys(manifest.collections)) {
    const col = db.collection(name);
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'), { relaxed: false });
    const indexes = JSON.parse(fs.readFileSync(path.join(dir, `${name}.indexes.json`), 'utf8'));

    if (flag('--drop')) await col.drop().catch(() => {});
    if (docs.length) {
      // Upsert by _id so re-running is safe and never duplicates
      const ops = docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } }));
      for (let i = 0; i < ops.length; i += 200) {
        await col.bulkWrite(ops.slice(i, i + 200), { ordered: false });
      }
    }
    for (const idx of indexes) {
      const { key, v, ns, ...options } = idx;
      await col.createIndex(key, options).catch((e) => console.warn(`   index ${idx.name} on ${name}: ${e.message}`));
    }
    const n = await col.countDocuments();
    console.log(`  ${name}: wrote ${docs.length}, now ${n} in target, ${indexes.length} indexes`);
  }
  await client.close();
  console.log('Import complete.');
}

async function verify() {
  const to = opt('--to');
  if (!to) throw new Error('Usage: verify --to "<mongodb uri>"');
  const a = new MongoClient(SOURCE_URI); const b = new MongoClient(to);
  await a.connect(); await b.connect();
  const da = a.db(), dbb = b.db();
  console.log(`source "${da.databaseName}"  vs  target "${dbb.databaseName}"`);
  let ok = true;
  for (const { name } of await da.listCollections().toArray()) {
    const x = await da.collection(name).countDocuments();
    const y = await dbb.collection(name).countDocuments();
    if (x !== y) ok = false;
    console.log(`  ${name.padEnd(18)} ${String(x).padStart(5)} -> ${String(y).padStart(5)}  ${x === y ? 'OK' : 'MISMATCH'}`);
  }
  await a.close(); await b.close();
  console.log(ok ? 'All counts match.' : 'Some collections differ!');
}

const run = { export: exportDb, import: importDb, verify }[cmd];
if (!run) { console.error('Usage: node scripts/db-migrate.js <export|import|verify> [options]'); process.exit(1); }
run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
