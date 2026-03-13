function parseFingerprint(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const [version, hash = '', color = ''] = value.split(':');
  if (version !== 'v1' || !/^[0-9a-f]+$/i.test(hash) || !/^[0-9a-f]{6}$/i.test(color)) {
    return null;
  }

  return {
    version,
    hash: hash.toLowerCase(),
    color: color.toLowerCase(),
  };
}

function hexToBinary(hex) {
  return hex
    .split('')
    .map((char) => Number.parseInt(char, 16).toString(2).padStart(4, '0'))
    .join('');
}

function hammingDistance(left, right) {
  const leftBits = hexToBinary(left);
  const rightBits = hexToBinary(right);
  const length = Math.min(leftBits.length, rightBits.length);
  let distance = 0;

  for (let index = 0; index < length; index += 1) {
    if (leftBits[index] !== rightBits[index]) {
      distance += 1;
    }
  }

  return distance + Math.abs(leftBits.length - rightBits.length);
}

function colorDistance(left, right) {
  const leftRgb = [
    Number.parseInt(left.slice(0, 2), 16),
    Number.parseInt(left.slice(2, 4), 16),
    Number.parseInt(left.slice(4, 6), 16),
  ];
  const rightRgb = [
    Number.parseInt(right.slice(0, 2), 16),
    Number.parseInt(right.slice(2, 4), 16),
    Number.parseInt(right.slice(4, 6), 16),
  ];

  const delta = Math.sqrt(
    (leftRgb[0] - rightRgb[0]) ** 2 +
      (leftRgb[1] - rightRgb[1]) ** 2 +
      (leftRgb[2] - rightRgb[2]) ** 2
  );

  return delta / Math.sqrt(255 ** 2 * 3);
}

export function isValidFingerprint(value) {
  return Boolean(parseFingerprint(value));
}

export function compareFingerprints(queryValue, candidateValue) {
  const query = parseFingerprint(queryValue);
  const candidate = parseFingerprint(candidateValue);
  if (!query || !candidate) return null;

  const hashDistance = hammingDistance(query.hash, candidate.hash);
  const hashSimilarity = 1 - hashDistance / (query.hash.length * 4);
  const colorSimilarity = 1 - colorDistance(query.color, candidate.color);
  const similarity = hashSimilarity * 0.82 + colorSimilarity * 0.18;

  return {
    similarity,
    hashSimilarity,
    colorSimilarity,
    hashDistance,
  };
}
