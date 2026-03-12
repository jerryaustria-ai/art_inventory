import crypto from 'crypto';

const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_FOLDER || 'art-painting-inventory').trim();

function hasCloudinaryConfig() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

function isImageDataUrl(value) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || '').trim());
}

function createSignature(params) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${CLOUDINARY_API_SECRET}`).digest('hex');
}

export async function resolveArtworkImageUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (!isImageDataUrl(value)) return value;

  if (!hasCloudinaryConfig()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createSignature({
    folder: CLOUDINARY_FOLDER,
    timestamp,
  });

  const body = new URLSearchParams();
  body.set('file', value);
  body.set('api_key', CLOUDINARY_API_KEY);
  body.set('timestamp', String(timestamp));
  body.set('folder', CLOUDINARY_FOLDER);
  body.set('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Failed to upload image to Cloudinary.');
  }

  return String(payload?.secure_url || payload?.url || '').trim();
}
