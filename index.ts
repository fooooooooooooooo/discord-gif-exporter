import { readFile, stat, writeFile } from 'fs/promises';

const SETTINGS_URL = 'https://discord.com/api/v9/users/@me/settings-proto/2';
const SETTINGS_FILE = 'settings.json';

type Settings = { settings: string };

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchSettings(token: string): Promise<Settings> {
  console.log('fetching settings');

  if (!token) {
    console.log('missing token, no cached settings');
    process.exit(1);
  }

  const req = {
    method: 'GET',
    headers: {
      authorization: token,
      referer: 'https://discord.com/channels/@me/1168929416538234951',
    },
  } as RequestInit;

  const res = await fetch(SETTINGS_URL, req);

  if (!res.ok) {
    console.log(`failed to fetch settings: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = (await res.json()) as Settings;

  if (!data.settings) {
    console.log('invalid settings:');
    console.log(data);
    process.exit(1);
  }

  console.log(`got ${data.settings.length} chars`);

  return data;
}

async function getSettings(token: string): Promise<Settings> {
  let settings: Settings;
  if (await exists(SETTINGS_FILE)) {
    settings = JSON.parse(await readFile(SETTINGS_FILE, 'utf8'));

    if (settings.settings) {
      console.log(`using cached ${SETTINGS_FILE}`);
      return settings;
    } else {
      console.log(`invalid ${SETTINGS_FILE}`);
      process.exit(1);
    }
  }

  settings = await fetchSettings(token);

  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  return settings;
}

async function matchUrls(token: string) {
  const settings = await getSettings(token);

  const decoded = Buffer.from(settings.settings, 'base64').toString('utf8');

  const matches = decoded.match(
    /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/g,
  );
  const urls = matches.map(x => x.toString());

  console.log(`found ${urls.length} urls`);

  return urls;
}

async function getUrls(token: string): Promise<string[]> {
  let urls = [];
  if (await exists('urls.txt')) {
    urls = (await readFile('urls.txt', 'utf8')).split('\n');

    if (urls.length > 0) {
      console.log(`using ${urls.length} cached urls`);
      return urls;
    }
  }

  urls = await matchUrls(token);

  await writeFile('urls.txt', urls.join('\n'));

  return urls;
}

async function cleanUrls(urls: string[]) {
  let cleaned = [];

  for (const url of urls) {
    const parsed = new URL(url);

    if (!parsed.hostname.includes('discord')) {
      if (!cleaned.includes(url)) {
        cleaned.push(url);
      }

      continue;
    }

    for (const existing of cleaned) {
      // if existing url is a substring of the current url replace it
      if (url.includes(existing)) {
        cleaned.splice(cleaned.indexOf(existing), 1, url);
        continue;
      }
    }
  }

  console.log(`cleaned ${urls.length} urls to ${cleaned.length}`);

  await writeFile('cleaned.txt', cleaned.join('\n'));
}

async function run() {
  const token = process.argv[2];
  if (!token) {
    console.warn('missing token, loading cached');
  }

  const urls = await getUrls(token);

  if (urls.length === 0) {
    console.log('no urls found');
    process.exit(1);
  }

  await cleanUrls(urls);
}

run();
