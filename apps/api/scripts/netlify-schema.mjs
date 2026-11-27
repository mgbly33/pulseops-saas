import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../prisma/netlify/', import.meta.url);
const source = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const schema = source
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]')
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('env("DATABASE_URL")', 'env("NETLIFY_DB_URL")');
await mkdir(directory, { recursive: true });
await writeFile(new URL('schema.prisma', directory), schema);
