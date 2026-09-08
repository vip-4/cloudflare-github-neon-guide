// 飞书通知：二选一
//   A. 自定义机器人 webhook：设置 FEISHU_WEBHOOK（最简单）
//   B. App 发群：设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_CHAT_ID
// 用法：node scripts/feishu-notify.mjs "标题" "正文"
const title = process.argv[2] || 'CI 通知';
const text = process.argv[3] || '';

async function viaWebhook(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        header: { title: { tag: 'plain_text', content: title }, template: 'blue' },
        elements: [{ tag: 'markdown', content: text || '—' }],
      },
    }),
  });
  return { status: res.status, body: await res.text() };
}

async function viaApp(appId, appSecret, chatId) {
  const auth = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const { tenant_access_token } = await auth.json();
  if (!tenant_access_token) throw new Error('tenant_access_token failed');
  const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenant_access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: `【${title}】\n${text}` }) }),
  });
  return { status: res.status, body: await res.text() };
}

(async () => {
  try {
    if (process.env.FEISHU_WEBHOOK) {
      console.log('via webhook:', JSON.stringify(await viaWebhook(process.env.FEISHU_WEBHOOK)));
    } else if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.FEISHU_CHAT_ID) {
      console.log('via app:', JSON.stringify(await viaApp(process.env.FEISHU_APP_ID, process.env.FEISHU_APP_SECRET, process.env.FEISHU_CHAT_ID)));
    } else {
      console.log('skip: no FEISHU_WEBHOOK or (APP_ID+SECRET+CHAT_ID) configured');
    }
  } catch (e) {
    console.error('feishu notify failed:', e.message);
    process.exit(1);
  }
})();