import nodemailer from 'nodemailer';
import dns from 'dns/promises';

function parseFromAddress(fromValue = '') {
  const fallbackEmail = process.env.SMTP_USER || '';
  const trimmed = String(fromValue || '').trim();
  if (!trimmed) {
    return { name: 'Art Inventory', email: fallbackEmail };
  }

  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return { name: 'Art Inventory', email: trimmed };
  }

  return {
    name: match[1].trim().replace(/^"|"$/g, '') || 'Art Inventory',
    email: match[2].trim(),
  };
}

async function sendViaBrevoApi({ to, name, role, from }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const sender = parseFromAddress(from);
  if (!sender.email || !to) {
    return {
      ok: false,
      skipped: true,
      reason: 'Missing sender or recipient for Brevo API.',
    };
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: sender.name,
        email: sender.email,
      },
      to: [{ email: to }],
      subject: 'Login Notification - Art Inventory',
      textContent: `Hello ${name || 'User'}, your account (${role}) just logged in to Art Inventory.`,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(`Brevo API failed (${response.status}): ${payload || 'Unknown error'}`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    ok: true,
    skipped: false,
    provider: 'brevo-api',
    messageId: payload?.messageId || '',
    accepted: [to],
    rejected: [],
  };
}

async function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  // Render instances may fail on IPv6 routes; resolve SMTP host to IPv4 explicitly.
  const lookup = await dns.lookup(host, { family: 4 });
  const ipv4Host = lookup?.address || host;

  return nodemailer.createTransport({
    host: ipv4Host,
    port,
    secure: port === 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      servername: host,
    },
    auth: {
      user,
      pass,
    },
  });
}

export async function sendLoginNotification({ to, name, role }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const brevoResult = await sendViaBrevoApi({ to, name, role, from });
  if (brevoResult) {
    return brevoResult;
  }

  const transporter = await createTransporter();

  if (!transporter || !from || !to) {
    return {
      ok: false,
      skipped: true,
      reason: 'Missing SMTP/Brevo configuration or recipient.',
    };
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Login Notification - Art Inventory',
    text: `Hello ${name || 'User'}, your account (${role}) just logged in to Art Inventory.`,
  });

  return {
    ok: true,
    skipped: false,
    provider: 'smtp',
    messageId: info?.messageId || '',
    accepted: Array.isArray(info?.accepted) ? info.accepted : [],
    rejected: Array.isArray(info?.rejected) ? info.rejected : [],
  };
}
