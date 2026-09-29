/**
 * Generates sample.* and expected.json fixtures from common-cards.json.
 * Run: npm run generate:import-fixtures
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CommonCard {
  title: string;
  username: string;
  passwordList: string[];
  link?: string;
  notes?: string;
  otpSecret?: string;
  tags?: string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, '../packages/core/src/importers/__fixtures__');

function loadCommon(): CommonCard[] {
  return JSON.parse(readFileSync(join(fixturesRoot, 'common-cards.json'), 'utf8')) as CommonCard[];
}

function writeFixture(format: string, sampleName: string, sampleContent: string) {
  const dir = join(fixturesRoot, format);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sampleName), sampleContent, 'utf8');
  writeFileSync(join(dir, 'expected.json'), JSON.stringify(loadCommon(), null, 2), 'utf8');
}

const cards = loadCommon();

// Bitwarden
writeFixture(
  'bitwarden',
  'sample.json',
  JSON.stringify(
    {
      items: cards.map((c) => ({
        name: c.title,
        login: {
          username: c.username,
          password: c.passwordList[0] ?? '',
          uris: c.link ? [{ uri: c.link }] : [],
          totp: c.otpSecret ?? '',
        },
        notes: c.notes ?? '',
      })),
    },
    null,
    2
  )
);

// NordPass
writeFixture(
  'nordpass',
  'sample.json',
  JSON.stringify(
    cards.map((c) => ({
      name: c.title,
      username: c.username,
      password: c.passwordList[0] ?? '',
      url: c.link ?? '',
      note: c.notes ?? '',
      otp: c.otpSecret ?? '',
      folder: c.tags?.[0] ?? '',
    })),
    null,
    2
  )
);

// Dashlane CSV
const dashlaneHeader = 'username,username1,username2,title,url,password,note,otpSecret';
const dashlaneRows = cards.map(
  (c) =>
    `"${c.username}","${c.username}","","${c.title}","${c.link ?? ''}","${c.passwordList[0] ?? ''}","${c.notes ?? ''}","${c.otpSecret ?? ''}"`
);
writeFixture('dashlane', 'sample.csv', [dashlaneHeader, ...dashlaneRows].join('\n'));

// Chrome CSV
const chromeHeader = 'name,url,username,password';
const chromeRows = cards.map(
  (c) => `"${c.title}","${c.link ?? ''}","${c.username}","${c.passwordList[0] ?? ''}"`
);
writeFixture('chrome', 'sample.csv', [chromeHeader, ...chromeRows].join('\n'));

// Firefox CSV
const firefoxHeader = 'url,username,password';
const firefoxRows = cards.map(
  (c) => `"${c.link ?? ''}","${c.username}","${c.passwordList[0] ?? ''}"`
);
writeFixture('firefox', 'sample.csv', [firefoxHeader, ...firefoxRows].join('\n'));

// LastPass CSV
const lastpassHeader = 'url,username,password,extra,name,grouping,fav';
const lastpassRows = cards.map(
  (c) =>
    `"${c.link ?? ''}","${c.username}","${c.passwordList[0] ?? ''}","${c.notes ?? ''}","${c.title}","${c.tags?.[0] ?? ''}","0"`
);
writeFixture('lastpass', 'sample.csv', [lastpassHeader, ...lastpassRows].join('\n'));

// Keeper CSV
const keeperHeader = 'Title,Login,Password,Login URL,Notes';
const keeperRows = cards.map(
  (c) =>
    `"${c.title}","${c.username}","${c.passwordList[0] ?? ''}","${c.link ?? ''}","${c.notes ?? ''}"`
);
writeFixture('keeper', 'sample.csv', [keeperHeader, ...keeperRows].join('\n'));

// Keeper JSON
writeFixture(
  'keeper',
  'sample.json',
  JSON.stringify(
    cards.map((c) => ({
      title: c.title,
      login: c.username,
      password: c.passwordList[0] ?? '',
      link: c.link ?? '',
      notes: c.notes ?? '',
      $type: 'login',
    })),
    null,
    2
  )
);

// Enpass JSON
writeFixture(
  'enpass',
  'sample.json',
  JSON.stringify(
    {
      items: cards.map((c) => ({
        title: c.title,
        fields: [
          { type: 'username', value: c.username },
          { type: 'password', value: c.passwordList[0] ?? '' },
          { type: 'url', value: c.link ?? '' },
          ...(c.otpSecret ? [{ type: 'totp', value: c.otpSecret }] : []),
        ],
        note: c.notes ?? '',
      })),
    },
    null,
    2
  )
);

// Generic CSV
const genericHeader = 'title,username,password,link,notes';
const genericRows = cards.map(
  (c) =>
    `"${c.title}","${c.username}","${c.passwordList[0] ?? ''}","${c.link ?? ''}","${c.notes ?? ''}"`
);
writeFixture('generic-csv', 'sample.csv', [genericHeader, ...genericRows].join('\n'));

console.log('Import fixtures generated in', fixturesRoot);
