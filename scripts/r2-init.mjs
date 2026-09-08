import { AwsClient } from 'aws4fetch';

const ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET = process.env.R2_BUCKET || 'guide-assets';

const aws = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const ASSETS = [
  {
    key: 'demo/sample.txt',
    contentType: 'text/plain; charset=utf-8',
    body: 'R2 edge-read demo - object served straight from Cloudflare edge storage.',
  },
  {
    key: 'docs/welcome.md',
    contentType: 'text/markdown; charset=utf-8',
    body: '# R2 边缘资源池\n\nR2 承接附件/静态资源，Worker Function 通过 `env.ASSETS` 在边缘直读并返回 immutable 缓存。',
  },
];

async function main() {
  const list = await aws.fetch(`${ENDPOINT}/`, { method: 'GET' });
  if (!list.ok) throw new Error(`ListBuckets failed: ${list.status}`);
  const xml = await list.text();
  const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);

  if (!names.includes(BUCKET)) {
    const put = await aws.fetch(`${ENDPOINT}/${BUCKET}`, { method: 'PUT' });
    if (!put.ok) throw new Error(`CreateBucket ${BUCKET} failed: ${put.status}`);
    console.log(`bucket created: ${BUCKET}`);
  } else {
    console.log(`bucket exists: ${BUCKET}`);
  }

  for (const a of ASSETS) {
    const res = await aws.fetch(`${ENDPOINT}/${BUCKET}/${a.key}`, {
      method: 'PUT',
      headers: { 'Content-Type': a.contentType },
      body: a.body,
    });
    if (!res.ok) throw new Error(`PutObject ${a.key} failed: ${res.status}`);
    console.log(`uploaded: ${a.key}`);
  }
}

main().catch((e) => {
  console.error('R2 init failed:', e.message);
  process.exit(1);
});