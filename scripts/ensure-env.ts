import { copyFileSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  // COPYFILE_EXCL: never overwrite an existing .env.
  copyFileSync(join(root, '.env.example'), join(root, '.env'), constants.COPYFILE_EXCL);
  console.log('Created .env from .env.example');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    console.log('.env already exists, left untouched');
  } else {
    throw error;
  }
}
