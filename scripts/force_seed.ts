import { initDatabase } from '../src/db/database';
async function run() {
  console.log('Force seeding database...');
  await initDatabase(true);
  console.log('Done!');
  process.exit(0);
}
run();
