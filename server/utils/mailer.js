import nodemailer from 'nodemailer';
import dns from 'dns/promises';

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
  const transporter = await createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transporter || !from || !to) {
    return;
  }

  await transporter.sendMail({
    from,
    to,
    subject: 'Login Notification - Art Inventory',
    text: `Hello ${name || 'User'}, your account (${role}) just logged in to Art Inventory.`,
  });
}
