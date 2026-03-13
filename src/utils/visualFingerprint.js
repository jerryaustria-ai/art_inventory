function dataToHex(values) {
  let bits = '';
  for (const value of values) {
    bits += value ? '1' : '0';
  }

  let hex = '';
  for (let index = 0; index < bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

function computeAverage(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function loadImageFromUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = objectUrl;
  });
}

async function computeFingerprintFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImageFromUrl(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('Canvas is not available.');
    }

    context.drawImage(image, 0, 0, 16, 16);
    const { data } = context.getImageData(0, 0, 16, 16);
    const luminance = [];
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3] / 255;
      const blendedRed = Math.round(red * alpha + 255 * (1 - alpha));
      const blendedGreen = Math.round(green * alpha + 255 * (1 - alpha));
      const blendedBlue = Math.round(blue * alpha + 255 * (1 - alpha));
      const gray = Math.round(blendedRed * 0.299 + blendedGreen * 0.587 + blendedBlue * 0.114);

      luminance.push(gray);
      totalRed += blendedRed;
      totalGreen += blendedGreen;
      totalBlue += blendedBlue;
    }

    const averageGray = computeAverage(luminance);
    const hash = dataToHex(luminance.map((value) => value >= averageGray));
    const pixelCount = Math.max(luminance.length, 1);
    const color =
      Math.round(totalRed / pixelCount).toString(16).padStart(2, '0') +
      Math.round(totalGreen / pixelCount).toString(16).padStart(2, '0') +
      Math.round(totalBlue / pixelCount).toString(16).padStart(2, '0');

    return `v1:${hash}:${color}`;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function computeVisualFingerprintFromFile(file) {
  if (!file) throw new Error('Image file is required.');
  return computeFingerprintFromBlob(file);
}

export async function computeVisualFingerprintFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch image for visual search.');
  }
  const blob = await response.blob();
  return computeFingerprintFromBlob(blob);
}
