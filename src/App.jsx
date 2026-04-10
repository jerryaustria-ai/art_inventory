import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { computeVisualFingerprintFromFile, computeVisualFingerprintFromUrl } from './utils/visualFingerprint.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const AUTH_STORAGE_KEY = 'art_inventory_auth_v1';

let qrcodeLibPromise;
let jsqrLibPromise;
let html5QrcodeLibPromise;
let xlsxLibPromise;
const INVENTORY_PAGE_SIZE = 20;

const LazyAdminPage = lazy(() => import('./components/AdminPage.jsx'));
const LazyImageViewerModal = lazy(() => import('./components/ImageViewerModal.jsx'));
const LazyQrScannerModal = lazy(() => import('./components/QrScannerModal.jsx'));
const LazyVisualSearchModal = lazy(() => import('./components/VisualSearchModal.jsx'));

function loadQrcodeLib() {
  if (!qrcodeLibPromise) {
    qrcodeLibPromise = import('qrcode').then((module) => module.default);
  }
  return qrcodeLibPromise;
}

function loadJsQrLib() {
  if (!jsqrLibPromise) {
    jsqrLibPromise = import('jsqr').then((module) => module.default);
  }
  return jsqrLibPromise;
}

function loadHtml5QrcodeLib() {
  if (!html5QrcodeLibPromise) {
    html5QrcodeLibPromise = import('html5-qrcode').then((module) => module.Html5Qrcode);
  }
  return html5QrcodeLibPromise;
}

function loadXlsxLib() {
  if (!xlsxLibPromise) {
    xlsxLibPromise = import('xlsx');
  }
  return xlsxLibPromise;
}

const blankForm = {
  inventoryId: '',
  title: '',
  artist: '',
  year: '',
  category: '',
  medium: '',
  dimensions: '',
  place: '',
  storageLocation: '',
  status: 'Available',
  price: '',
  notes: '',
  imageUrl: '',
  imageUrls: [],
  imagePublicIds: [],
  imageFingerprint: '',
};

const phpCurrencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
});

function formatPhp(value) {
  return phpCurrencyFormatter.format(Number(value || 0));
}

function formatPaintingCount(count) {
  return `${count} painting${count === 1 ? '' : 's'}`;
}

function formatSculptureCount(count) {
  return `${count} sculpture${count === 1 ? '' : 's'}`;
}

function getArtworkTitle(value) {
  return String(value || '').trim() || 'NO NAME';
}

function getArtworkArtist(value) {
  return String(value || '').trim() || 'Artist not set';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceInMeters(left, right) {
  const earthRadius = 6371000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitudeOne = toRadians(left.latitude);
  const latitudeTwo = toRadians(right.latitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read image file.'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = source;
  });
}

async function optimizeImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1));
  const targetWidth = Math.max(1, Math.round((image.width || 1) * scale));
  const targetHeight = Math.max(1, Math.round((image.height || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return optimizedDataUrl.length < originalDataUrl.length ? optimizedDataUrl : originalDataUrl;
}

function getCloudinaryCardImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value || value.startsWith('data:image/')) return value;

  try {
    const parsed = new URL(value);
    if (!parsed.hostname.includes('cloudinary.com')) return value;

    const uploadMarker = '/upload/';
    const markerIndex = parsed.pathname.indexOf(uploadMarker);
    if (markerIndex === -1) return value;

    const transformedPath = `${parsed.pathname.slice(0, markerIndex + uploadMarker.length)}f_auto,q_auto,c_fill,w_480,h_480/${parsed.pathname.slice(markerIndex + uploadMarker.length)}`;
    return `${parsed.origin}${transformedPath}${parsed.search}`;
  } catch {
    return value;
  }
}

function normalizeArtwork(item) {
  const normalizedImageUrls = Array.isArray(item?.imageUrls)
    ? item.imageUrls.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const normalizedImagePublicIds = Array.isArray(item?.imagePublicIds)
    ? item.imagePublicIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    ...item,
    id: item._id,
    inventoryId: item.inventoryId || '',
    imageUrl: item.imageUrl || normalizedImageUrls[0] || '',
    cardImageUrl: getCloudinaryCardImageUrl(item.imageUrl || normalizedImageUrls[0] || ''),
    imageUrls: normalizedImageUrls.length
      ? normalizedImageUrls
      : [String(item.imageUrl || '').trim()].filter(Boolean),
    imagePublicId: item.imagePublicId || '',
    imagePublicIds: normalizedImagePublicIds.length
      ? normalizedImagePublicIds
      : [String(item.imagePublicId || '').trim()].filter(Boolean),
    imageFingerprint: item.imageFingerprint || '',
    category: item.category || '',
    place: item.place || '',
    storageLocation: item.storageLocation || '',
    isActive: item.isActive !== false,
  };
}

function readAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.role || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readItemIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('item') || '';
  } catch {
    return '';
  }
}

function updateItemIdInUrl(itemId) {
  try {
    const url = new URL(window.location.href);
    if (itemId) {
      url.searchParams.set('item', itemId);
    } else {
      url.searchParams.delete('item');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore URL sync errors in unsupported environments.
  }
}

const blankUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'client',
  status: 'active',
};

const blankMoveForm = {
  place: '',
  storageLocation: '',
  note: '',
};

const blankLocationForm = {
  name: '',
  latitude: '',
  longitude: '',
  radiusMeters: '50',
  notes: '',
};

function formatDateTime(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function shortItemId(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'N/A';
  return raw.slice(-5).toUpperCase();
}

function getDisplayItemId(item) {
  const inventoryId = String(item?.inventoryId || '').trim();
  if (inventoryId) return inventoryId;
  return shortItemId(item?.id);
}

function getInitials(nameOrEmail) {
  const raw = String(nameOrEmail || '').trim();
  if (!raw) return 'AI';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

function getMobileStatCardClass(index) {
  const classes = ['mobile-stat-lime', 'mobile-stat-coral', 'mobile-stat-amber', 'mobile-stat-sky'];
  return classes[index % classes.length];
}

function getCategoryStatIcon(category) {
  const key = String(category || '').trim().toLowerCase();

  if (key === 'painting') {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M5 19V8.8a1 1 0 0 1 .42-.82l5.5-4a1 1 0 0 1 1.16 0l5.5 4a1 1 0 0 1 .42.82V19M9 19v-5h6v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === 'sculpture') {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M7 5h10l2 4-2 10H7L5 9l2-4Zm2.2 4.5h5.6M10 9l.8 6m2.4-6-.8 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === 'digital') {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M7 5h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 14h4m-6 0h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M6 6h12v12H6zM9 9h6v6H9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getArtworkStatusBadge(status, isActive) {
  if (isActive === false) {
    return {
      label: 'Inactive',
      className: 'item-status-badge inactive-badge',
    };
  }

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'sold') {
    return {
      label: 'Sold',
      className: 'item-status-badge status-badge-sold',
    };
  }
  if (normalizedStatus === 'reserved') {
    return {
      label: 'Reserved',
      className: 'item-status-badge status-badge-reserved',
    };
  }
  if (normalizedStatus === 'on loan') {
    return {
      label: 'On Loan',
      className: 'item-status-badge status-badge-loan',
    };
  }

  return null;
}

function InventoryForm({
  onSubmit,
  editingItem,
  onCancel,
  hideTitle = false,
  categories = [],
  locations = [],
  submitError = '',
}) {
  const [form, setForm] = useState(editingItem || blankForm);
  const [formError, setFormError] = useState('');
  const [invalidFieldName, setInvalidFieldName] = useState('');
  const thumbnailInputId = editingItem ? `artwork-thumbnail-${editingItem._id || 'edit'}` : 'artwork-thumbnail-new';
  const categoryFieldRef = useRef(null);
  const placeOptions = useMemo(() => {
    const values = new Set([
      ...locations.map((location) => String(location?.name || '').trim()).filter(Boolean),
      String(form.place || '').trim(),
    ]);
    return Array.from(values).filter(Boolean).sort((left, right) => left.localeCompare(right));
  }, [form.place, locations]);

  useEffect(() => {
    setForm(editingItem || blankForm);
    setFormError('');
    setInvalidFieldName('');
  }, [editingItem]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (invalidFieldName === name) {
      setInvalidFieldName('');
      setFormError('');
    }
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const focusField = (fieldName) => {
    if (fieldName === 'category' && categoryFieldRef.current) {
      categoryFieldRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      categoryFieldRef.current.focus();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.category.trim()) {
      setInvalidFieldName('category');
      setFormError('Please fill in required field: Artwork Category.');
      focusField('category');
      return;
    }
    setInvalidFieldName('');
    setFormError('');
    onSubmit(form);
    if (!editingItem) {
      setForm(blankForm);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    const shouldUpdateFingerprint = !Array.isArray(form.imageUrls) || form.imageUrls.length === 0;
    event.target.value = '';
    if (!file) return;

    void optimizeImageFile(file)
      .then((result) => {
        const imageDataUrl = String(result || '').trim();
        if (!imageDataUrl) return;

        setForm((previous) => {
          const currentImageUrls = Array.isArray(previous.imageUrls) ? previous.imageUrls.filter(Boolean) : [];
          const currentImagePublicIds = Array.isArray(previous.imagePublicIds)
            ? previous.imagePublicIds.filter((_, index) => Boolean(currentImageUrls[index]))
            : [];
          const nextImageUrls = [...currentImageUrls, imageDataUrl];
          const nextImagePublicIds = [...currentImagePublicIds];
          while (nextImagePublicIds.length < currentImageUrls.length) {
            nextImagePublicIds.push('');
          }
          nextImagePublicIds.push('');

          return {
            ...previous,
            imageUrl: nextImageUrls[0] || '',
            imageUrls: nextImageUrls,
            imagePublicId: nextImagePublicIds[0] || '',
            imagePublicIds: nextImagePublicIds,
          };
        });

        void computeVisualFingerprintFromFile(file)
          .then((fingerprint) => {
            setForm((previous) => {
              return shouldUpdateFingerprint ? { ...previous, imageFingerprint: fingerprint } : previous;
            });
          })
          .catch(() => {
            setForm((previous) => previous);
          });
      })
      .catch(() => {
        setFormError('Failed to read the selected image.');
      });
  };

  const removeImageAtIndex = (indexToRemove) => {
    setForm((previous) => {
      const currentImageUrls = Array.isArray(previous.imageUrls) ? previous.imageUrls.filter(Boolean) : [];
      const currentImagePublicIds = Array.isArray(previous.imagePublicIds) ? previous.imagePublicIds : [];
      const nextImageUrls = currentImageUrls.filter((_, index) => index !== indexToRemove);
      const nextImagePublicIds = currentImagePublicIds.filter((_, index) => index !== indexToRemove);

      return {
        ...previous,
        imageUrl: nextImageUrls[0] || '',
        imageUrls: nextImageUrls,
        imagePublicId: nextImagePublicIds[0] || '',
        imagePublicIds: nextImagePublicIds,
        imageFingerprint: nextImageUrls.length ? previous.imageFingerprint : '',
      };
    });
  };

  const makeImageCoverAtIndex = (indexToPromote) => {
    if (indexToPromote <= 0) return;

    setForm((previous) => {
      const currentImageUrls = Array.isArray(previous.imageUrls) ? previous.imageUrls.filter(Boolean) : [];
      const currentImagePublicIds = Array.isArray(previous.imagePublicIds) ? previous.imagePublicIds : [];
      if (indexToPromote >= currentImageUrls.length) return previous;

      const nextImageUrls = [...currentImageUrls];
      const [promotedImageUrl] = nextImageUrls.splice(indexToPromote, 1);
      nextImageUrls.unshift(promotedImageUrl);

      const nextImagePublicIds = [...currentImagePublicIds];
      while (nextImagePublicIds.length < currentImageUrls.length) {
        nextImagePublicIds.push('');
      }
      const [promotedImagePublicId] = nextImagePublicIds.splice(indexToPromote, 1);
      nextImagePublicIds.unshift(promotedImagePublicId || '');

      return {
        ...previous,
        imageUrl: nextImageUrls[0] || '',
        imageUrls: nextImageUrls,
        imagePublicId: nextImagePublicIds[0] || '',
        imagePublicIds: nextImagePublicIds,
      };
    });
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {!hideTitle ? <h2>{editingItem ? 'Edit Painting' : 'Add New Item'}</h2> : null}
      {formError ? <p className="form-error">{formError}</p> : null}
      {!formError && submitError ? <p className="form-error">{submitError}</p> : null}
      <label>
        Artwork Category *
        <select
          ref={categoryFieldRef}
          name="category"
          value={form.category}
          onChange={handleChange}
          className={invalidFieldName === 'category' ? 'field-error' : ''}
          required
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" value={form.title} onChange={handleChange} />
      </label>
      <label>
        Artist
        <input name="artist" value={form.artist} onChange={handleChange} />
      </label>
      <label>
        Year
        <input name="year" value={form.year} onChange={handleChange} placeholder="e.g. 2024" />
      </label>
      <label>
        Medium
        <input name="medium" value={form.medium} onChange={handleChange} placeholder="Oil on canvas" />
      </label>
      <label>
        Dimensions
        <input name="dimensions" value={form.dimensions} onChange={handleChange} placeholder="24 x 36 in" />
      </label>
      <label>
        Place
        <select name="place" value={form.place} onChange={handleChange}>
          <option value="">Select place</option>
          {placeOptions.map((place) => (
            <option key={place} value={place}>
              {place}
            </option>
          ))}
        </select>
      </label>
      <label>
        Storage Location
        <input
          name="storageLocation"
          value={form.storageLocation}
          onChange={handleChange}
          placeholder="Wall / shelf / rack"
        />
      </label>
      <label>
        Status
        <select name="status" value={form.status} onChange={handleChange}>
          <option>Available</option>
          <option>Sold</option>
          <option>Reserved</option>
          <option>On Loan</option>
        </select>
      </label>
      <label>
        Price (PHP)
        <input name="price" value={form.price} onChange={handleChange} type="number" min="0" step="0.01" />
      </label>
      <label className="full-width">
        Notes
        <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
      </label>
      <div className="full-width upload-thumbnail-field">
        <span>Upload Thumbnail</span>
        <input
          id={thumbnailInputId}
          className="upload-thumbnail-input"
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
        />
        <div className="image-upload-grid">
          {(form.imageUrls || []).map((imageUrl, index) => (
            <div key={`${imageUrl}-${index}`} className="upload-thumbnail-dropzone has-image">
              <img
                src={imageUrl}
                alt={`Selected artwork ${index + 1}`}
                className="upload-thumbnail-preview"
              />
              {index === 0 ? <span className="upload-thumbnail-badge">Cover</span> : null}
              {index > 0 ? (
                <button
                  type="button"
                  className="upload-thumbnail-make-cover"
                  onClick={() => makeImageCoverAtIndex(index)}
                >
                  Make Cover
                </button>
              ) : null}
              <button
                type="button"
                className="upload-thumbnail-remove"
                onClick={() => removeImageAtIndex(index)}
                aria-label={`Remove image ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          <label htmlFor={thumbnailInputId} className="upload-thumbnail-dropzone upload-thumbnail-add">
            <span className="upload-thumbnail-plus">+</span>
            <span className="upload-thumbnail-copy">Add image</span>
          </label>
        </div>
      </div>
      <div className="actions full-width">
        <button type="submit">{editingItem ? 'Update Painting' : 'Save'}</button>
        <button type="button" className="ghost" onClick={onCancel}>
          {editingItem ? 'Cancel Edit' : 'Close'}
        </button>
      </div>
    </form>
  );
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await onLogin({
      email: email.trim().toLowerCase(),
      password,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'Login failed.');
      return;
    }
    setError('');
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setIsResetting(true);
    setForgotMessage('');
    setForgotError('');

    try {
      const response = await fetch(`${API_BASE}/users/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          newPassword: forgotPassword,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setForgotError(payload.message || 'Failed to reset password.');
        setIsResetting(false);
        return;
      }

      setForgotMessage(payload.message || 'Password has been reset successfully.');
      setForgotPassword('');
    } catch {
      setForgotError('Failed to reset password. Please check API server.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="panel login-card">
        <h1>Login</h1>
        <p>Sign in as super admin, admin, or client.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button type="submit">Login</button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setForgotEmail(email);
              setIsForgotOpen(true);
              setForgotError('');
              setForgotMessage('');
            }}
          >
            Forgot Password?
          </button>
        </form>
        {isSubmitting ? <p className="muted">Signing in...</p> : null}
      </section>

      {isForgotOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal login-forgot-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setIsForgotOpen(false);
                setForgotError('');
                setForgotMessage('');
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Forgot Password</h2>
            <p className="muted">Enter your account email and set a new password.</p>
            {forgotError ? <p className="form-error">{forgotError}</p> : null}
            {forgotMessage ? <p className="success-text">{forgotMessage}</p> : null}
            <form className="login-form" onSubmit={handleForgotPassword}>
              <label>
                Email
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  value={forgotPassword}
                  onChange={(event) => setForgotPassword(event.target.value)}
                  required
                />
              </label>
              <div className="actions">
                <button type="submit">Reset Password</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setIsForgotOpen(false);
                    setForgotError('');
                    setForgotMessage('');
                  }}
                >
                  Close
                </button>
              </div>
            </form>
            {isResetting ? <p className="muted">Resetting password...</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function UserFormModal({ editingUser, onSubmit, onCancel }) {
  const [form, setForm] = useState(editingUser || blankUserForm);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(editingUser || blankUserForm);
    setError('');
  }, [editingUser]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.role) {
      setError('Name, email, and role are required.');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      setError('Password is required for new users.');
      return;
    }
    setError('');
    onSubmit(form);
  };

  return (
    <div className="modal-backdrop">
      <section className="panel modal admin-user-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
          ×
        </button>
        <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
        {error ? <p className="form-error">{error}</p> : null}
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input name="name" value={form.name} onChange={handleChange} required />
          </label>
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={handleChange} required />
          </label>
          <label>
            Password {editingUser ? '(optional)' : '*'}
            <input
              name="password"
              type="password"
              value={form.password || ''}
              onChange={handleChange}
              placeholder={editingUser ? 'Leave blank to keep current password' : ''}
            />
          </label>
          <label>
            Role
            <select name="role" value={form.role} onChange={handleChange}>
              <option value="super admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="client">Client</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" value={form.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="actions">
            <button type="submit">{editingUser ? 'Update User' : 'Create User'}</button>
            <button type="button" className="ghost" onClick={onCancel}>
              Close
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(readAuthSession);
  const [currentPage, setCurrentPage] = useState('inventory');
  const [inventory, setInventory] = useState([]);
  const [inventorySummary, setInventorySummary] = useState([]);
  const [locationSummaries, setLocationSummaries] = useState({});
  const [users, setUsers] = useState([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [isLocationsLoading, setIsLocationsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [adminSection, setAdminSection] = useState('users');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryFormError, setCategoryFormError] = useState('');
  const [editingLocationId, setEditingLocationId] = useState('');
  const [locationForm, setLocationForm] = useState(blankLocationForm);
  const [locationFormError, setLocationFormError] = useState('');
  const [isInventoryImporting, setIsInventoryImporting] = useState(false);
  const [inventoryImportMessage, setInventoryImportMessage] = useState('');
  const [inventoryImportError, setInventoryImportError] = useState('');
  const [isInventoryMutating, setIsInventoryMutating] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [inventoryFormError, setInventoryFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [placeFilter, setPlaceFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [checkedInventoryIds, setCheckedInventoryIds] = useState([]);
  const [displayMode, setDisplayMode] = useState('image');
  const [sortBy, setSortBy] = useState('recent');
  const [sortDirection, setSortDirection] = useState('desc');
  const [inventoryHasMorePages, setInventoryHasMorePages] = useState(false);
  const [isLoadingMoreInventory, setIsLoadingMoreInventory] = useState(false);
  const [userItemsPerPage, setUserItemsPerPage] = useState(20);
  const [userPageNumber, setUserPageNumber] = useState(1);
  const [auditItemsPerPage, setAuditItemsPerPage] = useState(20);
  const [auditPageNumber, setAuditPageNumber] = useState(1);
  const [editingId, setEditingId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [returnDetailsId, setReturnDetailsId] = useState('');
  const [viewerReturnId, setViewerReturnId] = useState('');
  const [detailsQr, setDetailsQr] = useState('');
  const [locationHistory, setLocationHistory] = useState([]);
  const [isLocationHistoryLoading, setIsLocationHistoryLoading] = useState(false);
  const [locationHistoryItemId, setLocationHistoryItemId] = useState('');
  const [gpsVerificationResult, setGpsVerificationResult] = useState(null);
  const [isGpsVerifying, setIsGpsVerifying] = useState(false);
  const [shouldCheckGpsAfterQrScan, setShouldCheckGpsAfterQrScan] = useState(false);
  const [qrLocationWarning, setQrLocationWarning] = useState(null);
  const [moveTargetItemId, setMoveTargetItemId] = useState('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveForm, setMoveForm] = useState(blankMoveForm);
  const [moveFormError, setMoveFormError] = useState('');
  const [isUpdatingViewerCover, setIsUpdatingViewerCover] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isTotalsOpen, setIsTotalsOpen] = useState(false);
  const [isSculptureTotalsOpen, setIsSculptureTotalsOpen] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isMobileAdminMenuOpen, setIsMobileAdminMenuOpen] = useState(false);
  const [viewerId, setViewerId] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [qrScanError, setQrScanError] = useState('');
  const [visualSearchError, setVisualSearchError] = useState('');
  const hasLoadedCategoriesRef = useRef(false);
  const inventoryLoadMoreTimeoutRef = useRef(null);
  const inventoryLoadMoreRef = useRef(null);
  const [isQrPhotoScanning, setIsQrPhotoScanning] = useState(false);
  const [isVisualSearchProcessing, setIsVisualSearchProcessing] = useState(false);
  const [visualSearchPreview, setVisualSearchPreview] = useState('');
  const [visualSearchResults, setVisualSearchResults] = useState([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pendingItemId, setPendingItemId] = useState(readItemIdFromUrl);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 700 : false
  );
  const [currentViewerImageIndex, setCurrentViewerImageIndex] = useState(0);
  const [expandedCardIds, setExpandedCardIds] = useState([]);
  const inventoryScrollRestoreRef = useRef(null);
  const html5QrRef = useRef(null);
  const hasHandledScanRef = useRef(false);
  const qrPhotoInputRef = useRef(null);
  const visualSearchInputRef = useRef(null);
  const inventorySectionRef = useRef(null);
  const syncingFingerprintIdsRef = useRef(new Set());
  const failedFingerprintIdsRef = useRef(new Set());
  const isPictureOnly = displayMode === 'image';
  const canManage = session?.role === 'admin' || session?.role === 'super admin';
  const canOpenAdminPage = session?.role === 'super admin';
  const isOverlayLoading =
    isLoading ||
    isUsersLoading ||
    isAuditLoading ||
    isCategoriesLoading ||
    isInventoryImporting ||
    isInventoryMutating;

  const editingItem = inventory.find((item) => item.id === editingId) || null;
  const editingUser = users.find((user) => user.id === editingUserId) || null;
  const selectedItem = inventory.find((item) => item.id === selectedId) || null;
  const locationHistoryItem =
    inventory.find((item) => item.id === locationHistoryItemId) ||
    (selectedItem?.id === locationHistoryItemId ? selectedItem : null);
  const moveTargetItem =
    inventory.find((item) => item.id === moveTargetItemId) ||
    (qrLocationWarning?.item?.id === moveTargetItemId ? qrLocationWarning.item : null);
  const viewerItem = inventory.find((item) => item.id === viewerId) || null;
  const isMobileFormPage = isMobileViewport && isFormOpen;
  const isMobileMovePage = isMobileViewport && isMoveModalOpen;
  const isMobileLocationHistoryPage = isMobileViewport && !!locationHistoryItemId;
  const isMobileDetailsPage = isMobileViewport && !!selectedItem;
  const activeLocationHistoryItemId = locationHistoryItemId || selectedItem?.id || '';
  const categoryOptions = useMemo(() => {
    const values = new Set([
      ...categories.map((item) => item.name).filter(Boolean),
      ...inventory.map((item) => item.category).filter(Boolean),
      editingItem?.category || '',
    ]);
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [categories, inventory, editingItem]);

  const loadingOverlayMessage = isInventoryImporting
    ? 'Importing inventory...'
    : isInventoryMutating
      ? 'Updating inventory...'
    : isLoading
      ? 'Loading inventory and categories...'
    : isAuditLoading
      ? 'Loading audit trail...'
      : isUsersLoading
        ? 'Loading users...'
        : isCategoriesLoading
          ? 'Loading categories...'
          : 'Loading...';

  const fetchInventory = async (activeSession = session) => {
    const isSuperAdmin = activeSession?.role === 'super admin';
    const url = isSuperAdmin ? `${API_BASE}/artworks?includeInactive=true` : `${API_BASE}/artworks`;
    const response = await fetch(url, {
      headers: {
        'x-actor-role': activeSession?.role || '',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch inventory');
    }
    const data = await response.json();
    return Array.isArray(data) ? data.map(normalizeArtwork) : [];
  };

  const fetchInventoryPage = async ({ offset = 0, limit = INVENTORY_PAGE_SIZE } = {}, activeSession = session) => {
    const isSuperAdmin = activeSession?.role === 'super admin';
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    if (isSuperAdmin) {
      params.set('includeInactive', 'true');
    }

    const response = await fetch(`${API_BASE}/artworks?${params.toString()}`, {
      headers: {
        'x-actor-role': activeSession?.role || '',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch inventory');
    }

    const data = await response.json();
    return {
      items: Array.isArray(data?.items) ? data.items.map(normalizeArtwork) : [],
      hasMore: Boolean(data?.hasMore),
      total: Number(data?.total || 0),
    };
  };

  const fetchInventoryItemById = async (itemId, activeSession = session) => {
    const response = await fetch(`${API_BASE}/artworks/${itemId}`, {
      headers: {
        'x-actor-role': activeSession?.role || '',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch inventory item');
    }
    const data = await response.json();
    return normalizeArtwork(data);
  };

  const fetchInventorySummary = async (activeSession = session) => {
    try {
      const isSuperAdmin = activeSession?.role === 'super admin';
      const url = isSuperAdmin
        ? `${API_BASE}/artworks/summary?includeInactive=true`
        : `${API_BASE}/artworks/summary`;
      const response = await fetch(url, {
        headers: {
          'x-actor-role': activeSession?.role || '',
        },
      });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => ({
            name: String(item?.name || '').trim(),
            count: Number(item?.count || 0),
            activeCount: Number(item?.activeCount || 0),
            inactiveCount: Number(item?.inactiveCount || 0),
            value: Number(item?.value || 0),
          }))
        : [];
    } catch {
      return [];
    }
  };

  const fetchLocationSummary = async (category, activeSession = session) => {
    try {
      const isSuperAdmin = activeSession?.role === 'super admin';
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (isSuperAdmin) params.set('includeInactive', 'true');
      const response = await fetch(`${API_BASE}/artworks/location-summary?${params.toString()}`, {
        headers: {
          'x-actor-role': activeSession?.role || '',
        },
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        items: Array.isArray(data?.items)
          ? data.items.map((item) => [String(item?.name || 'Unassigned'), Number(item?.count || 0)])
          : [],
        totalCount: Number(data?.totalCount || 0),
        totalValue: Number(data?.totalValue || 0),
      };
    } catch {
      return null;
    }
  };

  const fetchLocationHistory = async (itemId, activeSession = session) => {
    const response = await fetch(`${API_BASE}/artworks/${itemId}/location-history`, {
      headers: {
        'x-actor-role': activeSession?.role || '',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch location history');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  };

  const saveArtworkFingerprint = async (itemId, imageFingerprint) => {
    const response = await fetch(`${API_BASE}/artworks/${itemId}/fingerprint`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageFingerprint }),
    });

    if (!response.ok) {
      throw new Error('Failed to save artwork fingerprint.');
    }

    const data = await response.json();
    return normalizeArtwork(data);
  };

  const runVisualSearch = async (imageFingerprint) => {
    const response = await fetch(`${API_BASE}/artworks/visual-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-role': session?.role || '',
      },
      body: JSON.stringify({
        imageFingerprint,
        limit: 8,
        includeInactive: session?.role === 'super admin',
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || 'Failed to run visual search.');
    }

    const data = await response.json();
    return Array.isArray(data) ? data.map(normalizeArtwork) : [];
  };

  useEffect(() => {
    if (!selectedItem) {
      setDetailsQr('');
      return;
    }

    let isActive = true;

    const qrPayload = `${window.location.origin}${window.location.pathname}?item=${encodeURIComponent(selectedItem.id)}`;

    loadQrcodeLib()
      .then((QRCode) =>
        QRCode.toDataURL(qrPayload, {
          width: 220,
          margin: 1,
        })
      )
      .then((dataUrl) => {
        if (isActive) setDetailsQr(dataUrl);
      })
      .catch(() => {
        if (isActive) setDetailsQr('');
      });

    return () => {
      isActive = false;
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!activeLocationHistoryItemId) {
      setLocationHistory([]);
      setIsLocationHistoryLoading(false);
      return;
    }

    let isActive = true;
    setIsLocationHistoryLoading(true);

    fetchLocationHistory(activeLocationHistoryItemId, session)
      .then((logs) => {
        if (isActive) {
          setLocationHistory(logs);
        }
      })
      .catch(() => {
        if (isActive) {
          setLocationHistory([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLocationHistoryLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeLocationHistoryItemId, session]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(max-width: 700px)');
    const handleChange = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(media.matches);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (inventoryLoadMoreTimeoutRef.current) {
        window.clearTimeout(inventoryLoadMoreTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (visualSearchPreview) {
        URL.revokeObjectURL(visualSearchPreview);
      }
    };
  }, [visualSearchPreview]);

  useEffect(() => {
    if (!session) {
      setIsLoading(false);
      setInventory([]);
      setInventorySummary([]);
      setLocationSummaries({});
      setInventoryHasMorePages(false);
      setCategories([]);
      setLocations([]);
      return;
    }

    let isMounted = true;

    const loadAppData = async () => {
      try {
        const page = await fetchInventoryPage({ offset: 0, limit: INVENTORY_PAGE_SIZE }, session);
        if (!isMounted) return;
        setInventory(page.items);
        setInventoryHasMorePages(page.hasMore);
        setApiError('');
        void fetchInventorySummary(session)
          .then((summary) => {
            if (isMounted) setInventorySummary(summary);
          })
          .catch(() => {});
        void fetchCategories(false, { silent: true });
        void fetchLocations({ silent: true });
      } catch {
        if (!isMounted) return;
        setApiError('API unavailable. Check server and MongoDB connection.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadAppData();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;
    if (currentPage !== 'inventory') return undefined;
    if (isLoading || isInventoryMutating || isInventoryImporting) return undefined;
    if (isQrScannerOpen || isVisualSearchOpen) return undefined;

    let isActive = true;

    const refreshInventoryInBackground = async () => {
      try {
        const [refreshedInventory, refreshedSummary] = await Promise.all([
          fetchInventoryPage({ offset: 0, limit: INVENTORY_PAGE_SIZE }, session),
          fetchInventorySummary(session),
        ]);
        if (!isActive) return;
        setInventory((previous) => {
          const refreshedIds = new Set(refreshedInventory.items.map((item) => item.id));
          const preservedTail = previous.filter((item) => !refreshedIds.has(item.id));
          return [...refreshedInventory.items, ...preservedTail];
        });
        setInventorySummary(refreshedSummary);
        setInventoryHasMorePages((previousHasMore) => previousHasMore || refreshedInventory.hasMore);
      } catch {
        // Keep background refresh silent so the UI does not flash errors while the user is browsing.
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshInventoryInBackground();
    }, 15000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [
    currentPage,
    isInventoryImporting,
    isInventoryMutating,
    isLoading,
    isQrScannerOpen,
    isVisualSearchOpen,
    session,
  ]);

  useEffect(() => {
    setGpsVerificationResult(null);
  }, [selectedItem?.id]);

  useEffect(() => {
    setLocationSummaries({});
  }, [inventorySummary]);

  useEffect(() => {
    if (!selectedItem?.id) return undefined;

    let isActive = true;

    fetchInventoryItemById(selectedItem.id, session)
      .then((fullItem) => {
        if (!isActive) return;
        setInventory((previous) =>
          previous.map((item) => (item.id === fullItem.id ? { ...item, ...fullItem } : item))
        );
      })
      .catch(() => {
        // Keep the already loaded list item if the detail refresh fails.
      });

    return () => {
      isActive = false;
    };
  }, [selectedItem?.id, session]);

  useEffect(() => {
    if (!selectedItem?.id || !shouldCheckGpsAfterQrScan) return;
    if (isLocationsLoading) return;

    let isActive = true;
    setIsGpsVerifying(true);
    setGpsVerificationResult(null);
    setQrLocationWarning(null);

    const verifyAfterScan = async () => {
      try {
        const verificationResult = await verifyArtworkGpsLocation(selectedItem);
        if (!isActive) return;
        setGpsVerificationResult(verificationResult);

        if (verificationResult.status === 'mismatch') {
          setQrLocationWarning({
            item: selectedItem,
            verification: verificationResult,
          });
        }
      } catch (error) {
        if (!isActive) return;
        setGpsVerificationResult({
          status: 'error',
          message: error?.message || 'Unable to get device GPS location.',
        });
      } finally {
        if (!isActive) return;
        setIsGpsVerifying(false);
        setShouldCheckGpsAfterQrScan(false);
      }
    };

    void verifyAfterScan();

    return () => {
      isActive = false;
    };
  }, [isLocationsLoading, locations, selectedItem, shouldCheckGpsAfterQrScan]);

  useEffect(() => {
    updateItemIdInUrl(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) return;
    if (!pendingItemId) return;
    if (!inventory.length) return;

    const targetExists = inventory.some((item) => item.id === pendingItemId);
    if (targetExists) {
      setSelectedId(pendingItemId);
      setPendingItemId('');
      return;
    }

    const tryFetchPending = async () => {
      try {
        const fetchedItem = await fetchInventoryItemById(pendingItemId, session);
        setInventory((previous) => {
          if (previous.some((item) => item.id === fetchedItem.id)) return previous;
          return [fetchedItem, ...previous];
        });
        setSelectedId(fetchedItem.id);
        setPendingItemId('');
      } catch {
        setApiError('Linked item not found or not accessible for your account.');
        setPendingItemId('');
      }
    };

    tryFetchPending();
  }, [inventory, pendingItemId, selectedId, session]);

  useEffect(() => {
    if (!inventory.length) return undefined;
    if (isLoading) return undefined;
    if (currentPage !== 'inventory') return undefined;
    if (isQrScannerOpen || isVisualSearchOpen || isInventoryMutating) return undefined;

    const candidates = inventory.filter(
      (item) =>
        item.imageUrl &&
        !item.imageFingerprint &&
        !syncingFingerprintIdsRef.current.has(item.id) &&
        !failedFingerprintIdsRef.current.has(item.id)
    );

    if (!candidates.length) return undefined;

    let isCancelled = false;
    let idleHandle = null;
    let timeoutId = null;
    const nextCandidate = candidates[0];
    syncingFingerprintIdsRef.current.add(nextCandidate.id);

    const syncFingerprint = async () => {
      try {
        const imageFingerprint = await computeVisualFingerprintFromUrl(nextCandidate.imageUrl);
        if (isCancelled) return;
        const updatedItem = await saveArtworkFingerprint(nextCandidate.id, imageFingerprint);
        if (isCancelled) return;
        setInventory((previous) => previous.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } catch {
        failedFingerprintIdsRef.current.add(nextCandidate.id);
      } finally {
        syncingFingerprintIdsRef.current.delete(nextCandidate.id);
      }
    };

    const scheduleSync = () => {
      void syncFingerprint();
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(scheduleSync, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(scheduleSync, 1200);
    }

    return () => {
      isCancelled = true;
      if (typeof window !== 'undefined' && idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [currentPage, inventory, isInventoryMutating, isLoading, isQrScannerOpen, isVisualSearchOpen]);

  useEffect(() => {
    if (!isMobileDetailsPage || !selectedItem?.id) return;

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [isMobileDetailsPage, selectedItem?.id]);

  useEffect(() => {
    if (!isMobileFormPage) return;

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [editingId, isMobileFormPage]);

  useEffect(() => {
    if (!isMobileMovePage) return;

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [isMobileMovePage, moveTargetItemId]);

  const fetchUsers = async () => {
    setIsUsersLoading(true);
    try {
      const response = await fetch(`${API_BASE}/users`);
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((item) => ({
            id: item._id || item.id,
            name: item.name || '',
            email: item.email || '',
            role: item.role || 'client',
            status: item.status || 'active',
          }))
        : [];
      setUsers(normalized);
      setApiError('');
    } catch {
      setApiError('Failed to load users.');
    } finally {
      setIsUsersLoading(false);
    }
  };

  const fetchCategories = async (force = false, options = {}) => {
    const { silent = false } = options;
    if (!force && (hasLoadedCategoriesRef.current || isCategoriesLoading)) {
      return;
    }

    if (!silent) {
      setIsCategoriesLoading(true);
    }
    try {
      const response = await fetch(`${API_BASE}/categories`);
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((item) => ({
            id: item._id || item.id,
            name: item.name || '',
          }))
        : [];
      setCategories(normalized);
      hasLoadedCategoriesRef.current = true;
      setApiError('');
    } catch {
      hasLoadedCategoriesRef.current = false;
      setApiError('Failed to load categories.');
    } finally {
      if (!silent) {
        setIsCategoriesLoading(false);
      }
    }
  };

  const fetchLocations = async (options = {}) => {
    const { silent = false } = options;
    if (!silent) {
      setIsLocationsLoading(true);
    }
    try {
      const response = await fetch(`${API_BASE}/locations`);
      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }
      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((item) => ({
            id: item._id || item.id,
            name: item.name || '',
            latitude: Number(item.latitude || 0),
            longitude: Number(item.longitude || 0),
            radiusMeters: Number(item.radiusMeters || 50),
            notes: item.notes || '',
          }))
        : [];
      setLocations(normalized);
      setApiError('');
    } catch {
      setApiError('Failed to load locations.');
    } finally {
      if (!silent) {
        setIsLocationsLoading(false);
      }
    }
  };

  const fetchAuditLogs = async (action = auditActionFilter) => {
    if (session?.role !== 'super admin') return;

    setIsAuditLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (action && action !== 'all') {
        params.set('action', action);
      }

      const response = await fetch(`${API_BASE}/audit-logs?${params.toString()}`, {
        headers: {
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setAuditLogs(Array.isArray(data) ? data : []);
      setApiError('');
    } catch {
      setApiError('Failed to load audit logs.');
    } finally {
      setIsAuditLoading(false);
    }
  };

  const handleExportAuditCsv = () => {
    if (!auditLogs.length) return;

    const header = ['Time', 'Action', 'Actor Email', 'Actor Role', 'Target Type', 'Target Label', 'Target ID'];
    const rows = auditLogs.map((log) => [
      formatDateTime(log.createdAt),
      log.action || '',
      log.actor?.email || '',
      log.actor?.role || '',
      log.target?.type || '',
      log.target?.label || '',
      log.target?.id || '',
    ]);

    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    anchor.href = url;
    anchor.download = `audit-logs-${timestamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleExportInventoryExcel = () => {
    try {
      void loadXlsxLib().then((XLSX) => {
      const rows = inventory.map((item) => ({
        'Database ID': item.id,
        'Inventory ID': item.inventoryId || shortItemId(item.id),
        Title: item.title || '',
        Artist: item.artist || '',
        Year: item.year || '',
        Category: item.category || '',
        Medium: item.medium || '',
        Dimensions: item.dimensions || '',
        Place: item.place || '',
        'Storage Location': item.storageLocation || '',
        Status: item.status || '',
        Price: item.price || '',
        Notes: item.notes || '',
        'Image URL': item.imageUrl || '',
        'Inventory State': item.isActive === false ? 'Inactive' : 'Active',
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().replaceAll(':', '-');

      anchor.href = url;
      anchor.download = `inventory-${timestamp}.xlsx`;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();

      // Some browsers need a short delay before the blob URL is revoked.
      window.setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 1500);

        setInventoryImportError('');
        setInventoryImportMessage(`Inventory Excel exported successfully.`);
      }).catch((error) => {
        setInventoryImportMessage('');
        setInventoryImportError(error?.message || 'Failed to export inventory file.');
      });
    } catch (error) {
      setInventoryImportMessage('');
      setInventoryImportError(error?.message || 'Failed to export inventory file.');
    }
  };

  const handleExportInventoryCsv = () => {
    try {
      const header = [
        'Database ID',
        'Inventory ID',
        'Title',
        'Artist',
        'Year',
        'Category',
        'Medium',
        'Dimensions',
        'Place',
        'Storage Location',
        'Status',
        'Price',
        'Notes',
        'Image URL',
        'Inventory State',
      ];

      const rows = inventory.map((item) => [
        item.id,
        item.inventoryId || shortItemId(item.id),
        item.title || '',
        item.artist || '',
        item.year || '',
        item.category || '',
        item.medium || '',
        item.dimensions || '',
        item.place || '',
        item.storageLocation || '',
        item.status || '',
        item.price || '',
        item.notes || '',
        item.imageUrl || '',
        item.isActive === false ? 'Inactive' : 'Active',
      ]);

      const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().replaceAll(':', '-');
      anchor.href = url;
      anchor.download = `inventory-${timestamp}.csv`;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 1500);
      setInventoryImportError('');
      setInventoryImportMessage('Inventory CSV exported successfully.');
    } catch (error) {
      setInventoryImportMessage('');
      setInventoryImportError(error?.message || 'Failed to export inventory CSV.');
    }
  };

  const inventoryTemplateRows = [
    {
      'Database ID': '',
      'Inventory ID': '1a2b',
      Title: 'Sample Title',
      Artist: 'Sample Artist',
      Year: '2026',
      Category: categoryOptions[0] || 'Painting',
      Medium: 'Oil on Canvas',
      Dimensions: '24 x 36 in',
      Place: 'Makati',
      'Storage Location': 'Wall 1',
      Status: 'Available',
      Price: '50000',
      Notes: 'Sample note',
      'Image URL': 'https://example.com/sample.jpg',
      'Inventory State': 'Active',
    },
  ];

  const handleDownloadInventoryTemplateExcel = () => {
    try {
      void loadXlsxLib().then((XLSX) => {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(inventoryTemplateRows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Template');
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'inventory-template.xlsx';
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 1500);
        setInventoryImportError('');
        setInventoryImportMessage('Inventory Excel template downloaded.');
      }).catch((error) => {
        setInventoryImportMessage('');
        setInventoryImportError(error?.message || 'Failed to download inventory template.');
      });
    } catch (error) {
      setInventoryImportMessage('');
      setInventoryImportError(error?.message || 'Failed to download inventory template.');
    }
  };

  const handleDownloadInventoryTemplateCsv = () => {
    try {
      const header = Object.keys(inventoryTemplateRows[0]);
      const rows = inventoryTemplateRows.map((row) => header.map((key) => row[key]));
      const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'inventory-template.csv';
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 1500);
      setInventoryImportError('');
      setInventoryImportMessage('Inventory CSV template downloaded.');
    } catch (error) {
      setInventoryImportMessage('');
      setInventoryImportError(error?.message || 'Failed to download inventory template.');
    }
  };

  const normalizeImportCell = (row, keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) {
        return String(row[key]).trim();
      }
    }
    return '';
  };

  const handleImportInventoryExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsInventoryImporting(true);
    setInventoryImportMessage('');
    setInventoryImportError('');

    try {
      const XLSX = await loadXlsxLib();
      const fileName = String(file.name || '').toLowerCase();
      const isCsv = fileName.endsWith('.csv');
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('The Excel file has no sheets.');
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      if (!rows.length) {
        throw new Error('The Excel file is empty.');
      }

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        const itemId = normalizeImportCell(row, ['Database ID', 'databaseId', 'database id', 'id', '_id']);
        const title = normalizeImportCell(row, ['Title', 'title']);
        const artist = normalizeImportCell(row, ['Artist', 'artist']);

        if (!title || !artist) {
          skippedCount += 1;
          continue;
        }

        const payload = {
          title,
          artist,
          year: normalizeImportCell(row, ['Year', 'year']),
          category: normalizeImportCell(row, ['Category', 'category']),
          medium: normalizeImportCell(row, ['Medium', 'medium']),
          dimensions: normalizeImportCell(row, ['Dimensions', 'dimensions']),
          place: normalizeImportCell(row, ['Place', 'place']),
          storageLocation: normalizeImportCell(row, ['Storage Location', 'storageLocation', 'storage location']),
          status: normalizeImportCell(row, ['Status', 'status']) || 'Available',
          price: normalizeImportCell(row, ['Price', 'price']),
          notes: normalizeImportCell(row, ['Notes', 'notes']),
          imageUrl: normalizeImportCell(row, ['Image URL', 'imageUrl', 'image url']),
        };

        const response = await fetch(itemId ? `${API_BASE}/artworks/${itemId}` : `${API_BASE}/artworks`, {
          method: itemId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          skippedCount += 1;
          continue;
        }

        if (itemId) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      }

      const refreshedInventory = await fetchInventory(session);
      setInventory(refreshedInventory);
      setInventorySummary(await fetchInventorySummary(session));
      setInventoryImportMessage(
        `Import complete. Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}.`
      );
      setApiError('');
    } catch (error) {
      setInventoryImportError(error.message || 'Failed to import inventory file.');
    } finally {
      setIsInventoryImporting(false);
      event.target.value = '';
    }
  };

  const resetCategoryForm = () => {
    setEditingCategoryId('');
    setCategoryName('');
    setCategoryFormError('');
  };

  const resetLocationForm = () => {
    setEditingLocationId('');
    setLocationForm(blankLocationForm);
    setLocationFormError('');
  };

  const handleSubmitCategory = async (event) => {
    event.preventDefault();
    const trimmedName = categoryName.trim();
    const previousCategoryName = categories.find((item) => item.id === editingCategoryId)?.name || '';
    if (!trimmedName) {
      setCategoryFormError('Category name is required.');
      return;
    }
    setCategoryFormError('');

    try {
      const response = await fetch(
        editingCategoryId ? `${API_BASE}/categories/${editingCategoryId}` : `${API_BASE}/categories`,
        {
          method: editingCategoryId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': session?.id || '',
            'x-actor-email': session?.email || '',
            'x-actor-role': session?.role || '',
          },
          body: JSON.stringify({ name: trimmedName }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to save category.');
      }

      await fetchCategories(true);
      const refreshedInventory = await fetchInventory(session);
      setInventory(refreshedInventory);
      setInventorySummary(await fetchInventorySummary(session));
      if (editingCategoryId && categoryFilter === previousCategoryName) {
        setCategoryFilter(trimmedName);
      }
      resetCategoryForm();
      setApiError('');
    } catch (error) {
      setCategoryFormError(error.message || 'Failed to save category.');
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryFormError('');
  };

  const handleDeleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/categories/${category.id}`, {
        method: 'DELETE',
        headers: {
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 409 && payload?.code === 'CATEGORY_IN_USE') {
          const shouldShowInventory = window.confirm(
            `${payload.message || 'This category still has inventory.'} Do you want to show the inventory in this category?`
          );
          if (shouldShowInventory) {
            setCurrentPage('inventory');
            setCategoryFilter(category.name);
            setSearch('');
            setStatusFilter('All');
            setPlaceFilter('All');
            setCurrentPageNumber(1);
            setIsMobileMenuOpen(false);
            setIsMobileSearchOpen(false);
            requestAnimationFrame(() => {
              inventorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }
          return;
        }
        throw new Error(payload.message || 'Failed to delete category.');
      }

      await fetchCategories(true);
      const refreshedInventory = await fetchInventory(session);
      setInventory(refreshedInventory);
      setInventorySummary(await fetchInventorySummary(session));
      if (categoryFilter === category.name) {
        setCategoryFilter('All');
      }
      if (editingCategoryId === category.id) {
        resetCategoryForm();
      }
      setApiError('');
    } catch (error) {
      setApiError(error.message || 'Failed to delete category.');
    }
  };

  const handleSubmitLocation = async (event) => {
    event.preventDefault();
    const payload = {
      name: String(locationForm.name || '').trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      radiusMeters: Number(locationForm.radiusMeters || 50),
      notes: String(locationForm.notes || '').trim(),
    };

    if (!payload.name) {
      setLocationFormError('Location name is required.');
      return;
    }
    if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      setLocationFormError('Valid latitude and longitude are required.');
      return;
    }

    setLocationFormError('');

    try {
      const response = await fetch(
        editingLocationId ? `${API_BASE}/locations/${editingLocationId}` : `${API_BASE}/locations`,
        {
          method: editingLocationId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': session?.id || '',
            'x-actor-email': session?.email || '',
            'x-actor-role': session?.role || '',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.message || 'Failed to save location.');
      }

      await fetchLocations();
      resetLocationForm();
      setApiError('');
    } catch (error) {
      setLocationFormError(error.message || 'Failed to save location.');
    }
  };

  const handleEditLocation = (location) => {
    setEditingLocationId(location.id);
    setLocationForm({
      name: location.name || '',
      latitude: String(location.latitude ?? ''),
      longitude: String(location.longitude ?? ''),
      radiusMeters: String(location.radiusMeters ?? 50),
      notes: location.notes || '',
    });
    setLocationFormError('');
  };

  const handleDeleteLocation = async (location) => {
    const confirmed = window.confirm(`Delete location "${location.name}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/locations/${location.id}`, {
        method: 'DELETE',
        headers: {
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to delete location.');
      }
      await fetchLocations();
      if (editingLocationId === location.id) {
        resetLocationForm();
      }
      setApiError('');
    } catch (error) {
      setApiError(error.message || 'Failed to delete location.');
    }
  };

  const findExpectedLocationForArtwork = (artwork) =>
    locations.find((location) => location.name.trim().toLowerCase() === String(artwork?.place || '').trim().toLowerCase()) || null;

  const findNearestLocation = (coords) => {
    if (!coords || !locations.length) return null;

    let nearest = null;
    for (const location of locations) {
      const distanceMeters = getDistanceInMeters(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        coords
      );
      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = {
          ...location,
          distanceMeters,
        };
      }
    }

    return nearest;
  };

  const verifyArtworkGpsLocation = async (artwork) => {
    if (!artwork) {
      return {
        status: 'error',
        message: 'No artwork selected.',
      };
    }

    const expectedLocation = findExpectedLocationForArtwork(artwork);
    if (!expectedLocation) {
      return {
        status: 'missing',
        message: 'No GPS master location is mapped to this artwork place yet.',
      };
    }

    if (!navigator?.geolocation) {
      return {
        status: 'error',
        message: 'Geolocation is not supported on this device.',
      };
    }

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      });
    });

    const actualCoords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    const distanceMeters = getDistanceInMeters(
      {
        latitude: expectedLocation.latitude,
        longitude: expectedLocation.longitude,
      },
      actualCoords
    );

    const radiusMeters = Number(expectedLocation.radiusMeters || 50);
    const isMatch = distanceMeters <= radiusMeters;
    const nearestLocation = findNearestLocation(actualCoords);

    return {
      status: isMatch ? 'match' : 'mismatch',
      message: isMatch
        ? `Location verified. Device is within ${Math.round(distanceMeters)}m of ${expectedLocation.name}.`
        : `Location mismatch. Device is about ${Math.round(distanceMeters)}m away from ${expectedLocation.name}.`,
      distanceMeters,
      expectedLocation,
      nearestLocation,
      actualCoords,
    };
  };

  const handleVerifyGpsLocation = async () => {
    if (!selectedItem) return;

    setIsGpsVerifying(true);
    setGpsVerificationResult(null);

    try {
      const verificationResult = await verifyArtworkGpsLocation(selectedItem);
      setGpsVerificationResult(verificationResult);
    } catch (error) {
      setGpsVerificationResult({
        status: 'error',
        message: error?.message || 'Unable to get device GPS location.',
      });
    } finally {
      setIsGpsVerifying(false);
    }
  };

  const handleLogin = async (credentials) => {
    try {
      const response = await fetch(`${API_BASE}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        return { ok: false, message: 'Invalid email or password.' };
      }

      const user = await response.json();
      const nextSession = {
        id: user.id || user._id,
        name: user.name || '',
        role: user.role,
        email: user.email,
        status: user.status || 'active',
      };

      setSession(nextSession);
      setCurrentPage('inventory');
      setPendingItemId(readItemIdFromUrl());
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      setIsLoading(true);
      setApiError('');
      return { ok: true };
    } catch {
      return { ok: false, message: 'Login failed. Please check API server.' };
    }
  };

  const handleLogout = () => {
    setSession(null);
    setCurrentPage('inventory');
    setIsMobileMenuOpen(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setEditingId('');
    setSelectedId('');
    setViewerReturnId('');
    setReturnDetailsId('');
    setIsFormOpen(false);
    setIsTotalsOpen(false);
    setIsSculptureTotalsOpen(false);
    setIsImageViewerOpen(false);
    setIsQrScannerOpen(false);
    setQrScanError('');
    setIsUserModalOpen(false);
    setEditingUserId('');
  };

  useEffect(() => {
    if (!canOpenAdminPage && currentPage === 'admin') {
      setCurrentPage('inventory');
    }
  }, [canOpenAdminPage, currentPage]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredInventory = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const filtered = inventory.filter((item) => {
      const matchesSearch =
        item.inventoryId.toLowerCase().includes(searchTerm) ||
        item.title.toLowerCase().includes(searchTerm) ||
        item.artist.toLowerCase().includes(searchTerm) ||
        item.category.toLowerCase().includes(searchTerm) ||
        item.medium.toLowerCase().includes(searchTerm) ||
        item.place.toLowerCase().includes(searchTerm) ||
        item.storageLocation.toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const normalizedPlace = item.place.trim() || 'Unassigned';
      const matchesPlace = placeFilter === 'All' || normalizedPlace === placeFilter;
      const normalizedCategory = item.category.trim() || 'Unassigned';
      const matchesCategory = categoryFilter === 'All' || normalizedCategory === categoryFilter;
      return matchesSearch && matchesStatus && matchesPlace && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const direction = sortDirection === 'desc' ? -1 : 1;
      if (sortBy === 'recent') {
        return (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) * direction;
      }
      if (sortBy === 'price') {
        return (Number(a.price || 0) - Number(b.price || 0)) * direction;
      }
      if (sortBy === 'year') {
        return (Number(a.year || 0) - Number(b.year || 0)) * direction;
      }
      return getArtworkTitle(a.title).localeCompare(getArtworkTitle(b.title)) * direction;
    });
  }, [inventory, search, statusFilter, placeFilter, categoryFilter, sortBy, sortDirection]);

  const totalValue = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [inventory]
  );
  const checkedInventoryItems = useMemo(
    () => inventory.filter((item) => checkedInventoryIds.includes(item.id)),
    [checkedInventoryIds, inventory]
  );
  const visibleInventory = filteredInventory;
  const hasMoreInventory = inventoryHasMorePages;

  useEffect(() => {
    setCheckedInventoryIds((previous) => previous.filter((id) => inventory.some((item) => item.id === id)));
  }, [inventory]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!hasMoreInventory || isLoadingMoreInventory) return undefined;

    const sentinel = inventoryLoadMoreRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || isLoadingMoreInventory) return;
        inventoryLoadMoreTimeoutRef.current = window.setTimeout(() => {
          const loadNextPage = async () => {
            if (!session) return;
            setIsLoadingMoreInventory(true);
            try {
              const nextPage = await fetchInventoryPage(
                { offset: inventory.length, limit: INVENTORY_PAGE_SIZE },
                session
              );
              setInventory((previous) => {
                const existingIds = new Set(previous.map((item) => item.id));
                const appendedItems = nextPage.items.filter((item) => !existingIds.has(item.id));
                return [...previous, ...appendedItems];
              });
              setInventoryHasMorePages(nextPage.hasMore);
            } catch {
              // Keep load-more failures quiet so the user can continue browsing loaded items.
            } finally {
              setIsLoadingMoreInventory(false);
            }
          };
          void loadNextPage();
          inventoryLoadMoreTimeoutRef.current = null;
        }, isMobileViewport ? 120 : 200);
      },
      {
        rootMargin: isMobileViewport ? '520px 0px' : '280px 0px',
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    hasMoreInventory,
    inventory.length,
    isLoadingMoreInventory,
    isMobileViewport,
    session,
  ]);

  const userTotalPages = Math.max(1, Math.ceil(users.length / userItemsPerPage));
  const paginatedUsers = useMemo(() => {
    const startIndex = (userPageNumber - 1) * userItemsPerPage;
    return users.slice(startIndex, startIndex + userItemsPerPage);
  }, [users, userPageNumber, userItemsPerPage]);

  const visibleUserPageNumbers = useMemo(() => {
    const start = Math.max(1, userPageNumber - 2);
    const end = Math.min(userTotalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [userPageNumber, userTotalPages]);

  const auditTotalPages = Math.max(1, Math.ceil(auditLogs.length / auditItemsPerPage));
  const paginatedAuditLogs = useMemo(() => {
    const startIndex = (auditPageNumber - 1) * auditItemsPerPage;
    return auditLogs.slice(startIndex, startIndex + auditItemsPerPage);
  }, [auditLogs, auditPageNumber, auditItemsPerPage]);

  const visibleAuditPageNumbers = useMemo(() => {
    const start = Math.max(1, auditPageNumber - 2);
    const end = Math.min(auditTotalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [auditPageNumber, auditTotalPages]);

  const paintingsByPlace = useMemo(() => {
    const counts = inventory.reduce((accumulator, item) => {
      const key = item.place.trim() || 'Unassigned';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [inventory]);

  const paintingOnlyItems = useMemo(
    () => inventory.filter((item) => item.category === 'Painting'),
    [inventory]
  );

  const paintingOnlyByPlace = useMemo(() => {
    const counts = paintingOnlyItems.reduce((accumulator, item) => {
      const key = item.place.trim() || 'Unassigned';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [paintingOnlyItems]);
  const totalPaintingCount = paintingOnlyItems.length;
  const totalPaintingValue = useMemo(
    () => paintingOnlyItems.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [paintingOnlyItems]
  );

  const sculptureOnlyItems = useMemo(
    () => inventory.filter((item) => item.category === 'Sculpture'),
    [inventory]
  );

  const sculptureOnlyByPlace = useMemo(() => {
    const counts = sculptureOnlyItems.reduce((accumulator, item) => {
      const key = item.place.trim() || 'Unassigned';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [sculptureOnlyItems]);
  const totalSculptureCount = sculptureOnlyItems.length;
  const totalSculptureValue = useMemo(
    () => sculptureOnlyItems.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [sculptureOnlyItems]
  );

  const categoryStats = useMemo(() => {
    if (inventorySummary.length) {
      return inventorySummary.filter((category) => category.count > 0);
    }

    return categoryOptions
      .map((category) => {
        const items = inventory.filter((item) => item.category === category);
        const activeCount = items.filter((item) => item.isActive !== false).length;
        const inactiveCount = items.length - activeCount;
        return {
          name: category,
          count: items.length,
          activeCount,
          inactiveCount,
          value: items.reduce((sum, item) => sum + Number(item.price || 0), 0),
        };
      })
      .filter((category) => category.count > 0);
  }, [categoryOptions, inventory, inventorySummary]);

  const paintingSummaryCard = categoryStats.find((item) => item.name === 'Painting') || null;
  const sculptureSummaryCard = categoryStats.find((item) => item.name === 'Sculpture') || null;
  const paintingLocationSummary = locationSummaries.Painting || null;
  const sculptureLocationSummary = locationSummaries.Sculpture || null;
  const paintingLocationRows = paintingLocationSummary?.items?.length ? paintingLocationSummary.items : paintingOnlyByPlace;
  const sculptureLocationRows = sculptureLocationSummary?.items?.length ? sculptureLocationSummary.items : sculptureOnlyByPlace;
  const displayedPaintingCount = Number(paintingLocationSummary?.totalCount ?? paintingSummaryCard?.count ?? totalPaintingCount);
  const displayedPaintingValue = Number(paintingLocationSummary?.totalValue ?? paintingSummaryCard?.value ?? totalPaintingValue);
  const displayedSculptureCount = Number(
    sculptureLocationSummary?.totalCount ?? sculptureSummaryCard?.count ?? totalSculptureCount
  );
  const displayedSculptureValue = Number(
    sculptureLocationSummary?.totalValue ?? sculptureSummaryCard?.value ?? totalSculptureValue
  );

  useEffect(() => {
    if (!session) return;
    if (!isTotalsOpen && !isSculptureTotalsOpen) return;

    const categoriesToLoad = [];
    if (isTotalsOpen && !locationSummaries.Painting) {
      categoriesToLoad.push('Painting');
    }
    if (isSculptureTotalsOpen && !locationSummaries.Sculpture) {
      categoriesToLoad.push('Sculpture');
    }
    if (!categoriesToLoad.length) return;

    let isActive = true;
    Promise.all(categoriesToLoad.map((category) => fetchLocationSummary(category, session)))
      .then((results) => {
        if (!isActive) return;
        setLocationSummaries((previous) => {
          const next = { ...previous };
          categoriesToLoad.forEach((category, index) => {
            if (results[index]) {
              next[category] = results[index];
            }
          });
          return next;
        });
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [isSculptureTotalsOpen, isTotalsOpen, locationSummaries, session]);

  const handleSubmit = async (form) => {
    if (editingItem) {
      setIsInventoryMutating(true);
      try {
        const response = await fetch(`${API_BASE}/artworks/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || 'Failed to update artwork');
        }
        const updatedItem = normalizeArtwork(await response.json());
        setInventory((previous) => previous.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
        void fetchInventorySummary(session).then(setInventorySummary).catch(() => {});
        setEditingId('');
        setIsFormOpen(false);
        setInventoryFormError('');
        if (returnDetailsId) {
          setSelectedId(returnDetailsId);
          setReturnDetailsId('');
        }
        setApiError('');
      } catch (error) {
        setInventoryFormError(error.message || 'Failed to update item. Please try again.');
      } finally {
        setIsInventoryMutating(false);
      }
      return;
    }

    setIsInventoryMutating(true);
    try {
      const response = await fetch(`${API_BASE}/artworks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to create artwork');
      }
      const createdItem = normalizeArtwork(await response.json());
      setInventory((previous) => [createdItem, ...previous]);
      void fetchInventorySummary(session).then(setInventorySummary).catch(() => {});
      setIsFormOpen(false);
      setInventoryFormError('');
      setApiError('');
    } catch (error) {
      setInventoryFormError(error.message || 'Failed to add item. Please try again.');
    } finally {
      setIsInventoryMutating(false);
    }
  };

  const handleAddNew = () => {
    setInventoryFormError('');
    setEditingId('');
    setCurrentPage('inventory');
    setIsUserModalOpen(false);
    setEditingUserId('');
    setIsFormOpen(true);
    setIsMobileMenuOpen(false);
    setIsMobileSearchOpen(false);
  };

  const handleEdit = (id) => {
    setInventoryFormError('');
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setInventoryFormError('');
    setEditingId('');
    setIsFormOpen(false);
    if (returnDetailsId) {
      setSelectedId(returnDetailsId);
      setReturnDetailsId('');
    }
  };

  const handleCloseSelectedItem = () => {
    const restoreScrollTop = inventoryScrollRestoreRef.current;
    setSelectedId('');
    setViewerReturnId('');
    setIsMoveModalOpen(false);
    setMoveForm(blankMoveForm);
    setMoveFormError('');

    if (isMobileViewport && Number.isFinite(restoreScrollTop)) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreScrollTop, behavior: 'auto' });
        inventoryScrollRestoreRef.current = null;
      });
      return;
    }

    inventoryScrollRestoreRef.current = null;
  };

  const handleOpenLocationHistory = () => {
    if (!selectedItem?.id) return;
    setLocationHistoryItemId(selectedItem.id);
  };

  const handleCloseLocationHistory = () => {
    setLocationHistoryItemId('');
  };

  const toggleExpandedCard = (id) => {
    setExpandedCardIds((previous) =>
      previous.includes(id) ? previous.filter((itemId) => itemId !== id) : [...previous, id]
    );
  };

  const handleDelete = async (id) => {
    const target = inventory.find((item) => item.id === id);
    const label = target ? `"${target.title}" by ${target.artist}` : 'this painting';
    const confirmMessage = `Delete ${label}? This will mark the item as inactive.`;
    const shouldDelete = window.confirm(confirmMessage);
    if (!shouldDelete) return;

    setIsInventoryMutating(true);
    try {
      const response = await fetch(`${API_BASE}/artworks/${id}`, {
        method: 'DELETE',
        headers: {
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete artwork');
      }
      setInventory((previous) =>
        session?.role === 'super admin'
          ? previous.map((item) => (item.id === id ? { ...item, isActive: false } : item))
          : previous.filter((item) => item.id !== id)
      );
      void fetchInventorySummary(session).then(setInventorySummary).catch(() => {});
      if (editingId === id) setEditingId('');
      if (selectedId === id) setSelectedId('');
      if (returnDetailsId === id) setReturnDetailsId('');
      if (viewerId === id) {
        setViewerId('');
        setIsImageViewerOpen(false);
      }
      setApiError('');
    } catch {
      setApiError('Failed to delete item. Please try again.');
    } finally {
      setIsInventoryMutating(false);
    }
  };

  const handlePermanentDelete = async (id) => {
    const target = inventory.find((item) => item.id === id);
    const label = target ? `"${target.title}" by ${target.artist}` : 'this painting';
    const shouldDelete = window.confirm(`Permanently delete ${label}? This action cannot be undone.`);
    if (!shouldDelete) return;

    setIsInventoryMutating(true);
    try {
      const response = await fetch(`${API_BASE}/artworks/${id}/permanent`, {
        method: 'DELETE',
        headers: {
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to permanently delete artwork');
      }
      setInventory((previous) => previous.filter((item) => item.id !== id));
      void fetchInventorySummary(session).then(setInventorySummary).catch(() => {});
      if (editingId === id) setEditingId('');
      if (selectedId === id) setSelectedId('');
      if (returnDetailsId === id) setReturnDetailsId('');
      if (viewerId === id) {
        setViewerId('');
        setIsImageViewerOpen(false);
      }
      setApiError('');
    } catch {
      setApiError('Failed to permanently delete item. Please try again.');
    } finally {
      setIsInventoryMutating(false);
    }
  };

  const handleActivate = async (id) => {
    setIsInventoryMutating(true);
    try {
      const response = await fetch(`${API_BASE}/artworks/${id}/activate`, {
        method: 'PATCH',
        headers: {
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to activate artwork');
      }
      const updated = normalizeArtwork(await response.json());
      setInventory((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      void fetchInventorySummary(session).then(setInventorySummary).catch(() => {});
      if (selectedId === id) {
        setSelectedId(updated.id);
      }
      setApiError('');
    } catch {
      setApiError('Failed to activate item. Please try again.');
    } finally {
      setIsInventoryMutating(false);
    }
  };

  const handleLocationFilter = (location, category = 'All') => {
    setPlaceFilter(location);
    setCategoryFilter(category);
    setIsTotalsOpen(false);
    setIsSculptureTotalsOpen(false);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'All' ||
    placeFilter !== 'All' ||
    categoryFilter !== 'All' ||
    sortBy !== 'recent' ||
    sortDirection !== 'desc';

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setPlaceFilter('All');
    setCategoryFilter('All');
    setSortBy('recent');
    setSortDirection('desc');
  };

  const handleCloseMobileSearch = () => {
    clearAllFilters();
    setIsMobileSearchOpen(false);
  };

  const activeFilterCount =
    Number(search.trim() !== '') +
    Number(statusFilter !== 'All') +
    Number(placeFilter !== 'All') +
    Number(categoryFilter !== 'All') +
    Number(sortBy !== 'recent') +
    Number(sortDirection !== 'desc');

  const activeFilterSummary = [
    search.trim() ? `Search: ${search.trim()}` : '',
    statusFilter !== 'All' ? `Status: ${statusFilter}` : '',
    placeFilter !== 'All' ? `Location: ${placeFilter}` : '',
    categoryFilter !== 'All' ? `Category: ${categoryFilter}` : '',
    sortBy !== 'recent' ? `Sort: ${sortBy}` : '',
    sortDirection !== 'desc' ? `Direction: ${sortDirection}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  useEffect(() => {
    setUserPageNumber(1);
  }, [userItemsPerPage]);

  useEffect(() => {
    if (userPageNumber > userTotalPages) {
      setUserPageNumber(userTotalPages);
    }
  }, [userPageNumber, userTotalPages]);

  useEffect(() => {
    setAuditPageNumber(1);
  }, [auditItemsPerPage, auditActionFilter]);

  useEffect(() => {
    if (auditPageNumber > auditTotalPages) {
      setAuditPageNumber(auditTotalPages);
    }
  }, [auditPageNumber, auditTotalPages]);

  useEffect(() => {
    if (
      !isMobileViewport ||
      currentPage !== 'inventory' ||
      isMobileFormPage ||
      isMobileDetailsPage ||
      isMobileSearchOpen ||
      !search.trim() ||
      !inventorySectionRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      inventorySectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [search, isMobileViewport, currentPage, isMobileFormPage, isMobileDetailsPage, isMobileSearchOpen]);

  const openAddUserModal = () => {
    setEditingUserId('');
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (id) => {
    const target = users.find((user) => user.id === id);
    if (target?.role === 'super admin' && session?.role !== 'super admin') {
      setApiError('Only super admin can edit a super admin account.');
      return;
    }
    setEditingUserId(id);
    setIsUserModalOpen(true);
  };

  const closeUserModal = () => {
    setEditingUserId('');
    setIsUserModalOpen(false);
  };

  const handleSubmitUser = async (form) => {
    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      status: form.status,
    };

    if (form.password && form.password.trim()) {
      payload.password = form.password;
    }

    try {
      if (editingUser) {
        const response = await fetch(`${API_BASE}/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-role': session?.role || '',
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update user');
      } else {
        const response = await fetch(`${API_BASE}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create user');
      }

      closeUserModal();
      await fetchUsers();
      setApiError('');
    } catch {
      setApiError('Failed to save user. Check fields and try again.');
    }
  };

  const handleDeleteUser = async (userId) => {
    const target = users.find((item) => item.id === userId);
    if (target?.role === 'super admin' && session?.role !== 'super admin') {
      setApiError('Only super admin can delete a super admin account.');
      return;
    }
    const shouldDelete = window.confirm(`Delete user ${target?.email || ''}?`);
    if (!shouldDelete) return;

    try {
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-actor-role': session?.role || '',
        },
      });
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete user');
      }
      setUsers((previous) => previous.filter((item) => item.id !== userId));
      setApiError('');
    } catch {
      setApiError('Failed to delete user.');
    }
  };

  const handleOpenImageViewer = (id, imageIndex = 0) => {
    if (isMobileViewport && selectedId === id) {
      setViewerReturnId(id);
      setSelectedId('');
    }
    setViewerId(id);
    setCurrentViewerImageIndex(imageIndex);
    setIsImageViewerOpen(true);
  };

  const handleCloseImageViewer = () => {
    setIsImageViewerOpen(false);
    setViewerId('');
    setCurrentViewerImageIndex(0);
    if (viewerReturnId) {
      setSelectedId(viewerReturnId);
      setViewerReturnId('');
    }
  };

  const selectViewerImage = (index) => {
    setCurrentViewerImageIndex(index);
  };

  const showPreviousViewerImage = () => {
    const imageCount = Array.isArray(viewerItem?.imageUrls) && viewerItem.imageUrls.length
      ? viewerItem.imageUrls.length
      : viewerItem?.imageUrl
        ? 1
        : 0;
    if (imageCount <= 1) return;
    setCurrentViewerImageIndex((previous) => (previous - 1 + imageCount) % imageCount);
  };

  const showNextViewerImage = () => {
    const imageCount = Array.isArray(viewerItem?.imageUrls) && viewerItem.imageUrls.length
      ? viewerItem.imageUrls.length
      : viewerItem?.imageUrl
        ? 1
        : 0;
    if (imageCount <= 1) return;
    setCurrentViewerImageIndex((previous) => (previous + 1) % imageCount);
  };

  const handleMakeViewerImageCover = async () => {
    if (!viewerItem?.id) return;
    const currentImages = Array.isArray(viewerItem.imageUrls) && viewerItem.imageUrls.length
      ? viewerItem.imageUrls
      : [viewerItem.imageUrl].filter(Boolean);
    if (currentImages.length <= 1) return;
    if (currentViewerImageIndex <= 0) return;

    const currentPublicIds = Array.isArray(viewerItem.imagePublicIds) && viewerItem.imagePublicIds.length
      ? viewerItem.imagePublicIds
      : [viewerItem.imagePublicId].filter(Boolean);

    const nextImageUrls = [...currentImages];
    const [coverImage] = nextImageUrls.splice(currentViewerImageIndex, 1);
    nextImageUrls.unshift(coverImage);

    const nextImagePublicIds = [...currentPublicIds];
    if (nextImagePublicIds.length > currentViewerImageIndex) {
      const [coverPublicId] = nextImagePublicIds.splice(currentViewerImageIndex, 1);
      nextImagePublicIds.unshift(coverPublicId);
    }

    const optimisticItem = normalizeArtwork({
      ...viewerItem,
      imageUrl: nextImageUrls[0] || '',
      imageUrls: nextImageUrls,
      imagePublicId: nextImagePublicIds[0] || '',
      imagePublicIds: nextImagePublicIds,
    });

    setIsUpdatingViewerCover(true);
    setInventory((previous) => previous.map((item) => (item.id === optimisticItem.id ? optimisticItem : item)));
    setCurrentViewerImageIndex(0);
    try {
      const response = await fetch(`${API_BASE}/artworks/${viewerItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...viewerItem,
          imageUrl: nextImageUrls[0] || '',
          imageUrls: nextImageUrls,
          imagePublicId: nextImagePublicIds[0] || '',
          imagePublicIds: nextImagePublicIds,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to update artwork cover image.');
      }

      const updatedItem = normalizeArtwork(await response.json());
      setInventory((previous) => previous.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setApiError('');
    } catch (error) {
      setInventory((previous) => previous.map((item) => (item.id === viewerItem.id ? viewerItem : item)));
      setCurrentViewerImageIndex(currentViewerImageIndex);
      setApiError(error.message || 'Failed to update artwork cover image.');
    } finally {
      setIsUpdatingViewerCover(false);
    }
  };

  const handlePrintQr = () => {
    if (!selectedItem || !detailsQr) {
      setApiError('QR code is not ready yet. Please try again.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=480,height=700');
    if (!printWindow) {
      setApiError('Unable to open print window. Please allow pop-ups and try again.');
      return;
    }

    const safeTitle = escapeHtml(getArtworkTitle(selectedItem.title));
    const safeId = escapeHtml(getDisplayItemId(selectedItem) || '');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print QR - ${safeTitle}</title>
          <style>
            @page {
              size: 4.25in 5.5in;
              margin: 0.2in;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              font-family: "Avenir Next", "Segoe UI", sans-serif;
              color: #1f2a2b;
            }
            .sheet {
              box-sizing: border-box;
              width: 100%;
              min-height: 100%;
              border: 1px solid #d8e0e1;
              border-radius: 10px;
              padding: 0.25in;
              display: grid;
              justify-items: center;
              align-content: start;
              gap: 0.16in;
            }
            h1 {
              margin: 0;
              font-size: 18px;
              text-align: center;
              line-height: 1.2;
            }
            p {
              margin: 0;
              font-size: 12px;
            }
            .qr {
              width: 2.5in;
              height: 2.5in;
              border: 1px solid #d8e0e1;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <section class="sheet">
            <h1>${safeTitle}</h1>
            <p><strong>Inventory ID:</strong> ${safeId}</p>
            <img class="qr" src="${detailsQr}" alt="QR Code" />
          </section>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintItemsByLocation = async (place, category) => {
    const normalizedPlace = String(place || '').trim();
    const normalizedCategory = String(category || '').trim();
    if (!normalizedPlace || !normalizedCategory) return;

    try {
      const allItems = await fetchInventory(session);
      const matchingItems = allItems.filter((item) => {
        const itemPlace = String(item.place || '').trim() || 'Unassigned';
        return item.category === normalizedCategory && itemPlace === normalizedPlace;
      });

      if (!matchingItems.length) {
        setApiError(`No ${normalizedCategory.toLowerCase()}s found in ${normalizedPlace}.`);
        return;
      }

      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        setApiError('Unable to open print window. Please allow pop-ups and try again.');
        return;
      }

      const safePlace = escapeHtml(normalizedPlace);
      const safeCategory = escapeHtml(normalizedCategory);
      const rowsHtml = matchingItems
        .map((item, index) => {
          const safeTitle = escapeHtml(getArtworkTitle(item.title));
          const safeArtist = escapeHtml(getArtworkArtist(item.artist));
          const safeId = escapeHtml(getDisplayItemId(item) || '');
          const safeStatus = escapeHtml(item.status || 'Not set');
          const thumbnailUrl = escapeHtml(item.cardImageUrl || item.imageUrl || '');
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${thumbnailUrl ? `<img class="thumb" src="${thumbnailUrl}" alt="" />` : '<span class="thumb-placeholder">No image</span>'}</td>
              <td>${safeId}</td>
              <td>${safeTitle}</td>
              <td>${safeArtist}</td>
              <td>${safeStatus}</td>
            </tr>
          `;
        })
        .join('');

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${safeCategory} - ${safePlace}</title>
            <style>
              @page { size: A4; margin: 0.7in; }
              body {
                margin: 0;
                font-family: "Avenir Next", "Segoe UI", sans-serif;
                color: #1f2a2b;
              }
              .sheet {
                display: grid;
                gap: 0.2in;
              }
              h1 {
                margin: 0;
                font-size: 24px;
              }
              p {
                margin: 0;
                font-size: 13px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                border: 1px solid #d8e0e1;
                padding: 8px 10px;
                text-align: left;
                font-size: 12px;
                vertical-align: middle;
              }
              th {
                background: #f3f7fb;
              }
              .thumb {
                width: 54px;
                height: 54px;
                object-fit: cover;
                display: block;
                border-radius: 6px;
                border: 1px solid #d8e0e1;
              }
              .thumb-placeholder {
                display: inline-block;
                min-width: 54px;
                color: #6b7280;
                font-size: 11px;
              }
            </style>
          </head>
          <body>
            <section class="sheet">
              <h1>${safeCategory}s in ${safePlace}</h1>
              <p><strong>Total items:</strong> ${matchingItems.length}</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Photo</th>
                    <th>Inventory ID</th>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </section>
            <script>
              window.onload = function () {
                window.focus();
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      setApiError('Failed to prepare print list. Please try again.');
    }
  };

  const toggleInventoryChecked = (itemId) => {
    setCheckedInventoryIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId]
    );
  };

  const handlePrintCheckedInventory = () => {
    if (!checkedInventoryItems.length) {
      setApiError('No inventory items selected for printing.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) {
      setApiError('Unable to open print window. Please allow pop-ups and try again.');
      return;
    }

    const rowsHtml = checkedInventoryItems
      .map((item, index) => {
        const thumbnailUrl = escapeHtml(item.cardImageUrl || item.imageUrl || '');
        const safeId = escapeHtml(getDisplayItemId(item) || '');
        const safeTitle = escapeHtml(getArtworkTitle(item.title));
        const safeArtist = escapeHtml(getArtworkArtist(item.artist));
        const safePlace = escapeHtml(item.place || 'Not set');
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${thumbnailUrl ? `<img class="thumb" src="${thumbnailUrl}" alt="" />` : '<span class="thumb-placeholder">No image</span>'}</td>
            <td>${safeId}</td>
            <td>${safeTitle}</td>
            <td>${safeArtist}</td>
            <td>${safePlace}</td>
          </tr>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Selected Inventory</title>
          <style>
            @page { size: A4; margin: 0.7in; }
            body {
              margin: 0;
              font-family: "Avenir Next", "Segoe UI", sans-serif;
              color: #1f2a2b;
            }
            .sheet {
              display: grid;
              gap: 0.2in;
            }
            h1 {
              margin: 0;
              font-size: 24px;
            }
            p {
              margin: 0;
              font-size: 13px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #d8e0e1;
              padding: 8px 10px;
              text-align: left;
              font-size: 12px;
              vertical-align: middle;
            }
            th {
              background: #f3f7fb;
            }
            .thumb {
              width: 54px;
              height: 54px;
              object-fit: cover;
              display: block;
              border-radius: 6px;
              border: 1px solid #d8e0e1;
            }
            .thumb-placeholder {
              display: inline-block;
              min-width: 54px;
              color: #6b7280;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <section class="sheet">
            <h1>Selected Inventory</h1>
            <p><strong>Total items:</strong> ${checkedInventoryItems.length}</p>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Photo</th>
                  <th>Inventory ID</th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Place</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </section>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleEditSelectedItem = () => {
    if (!selectedItem) return;
    setReturnDetailsId(selectedItem.id);
    setEditingId(selectedItem.id);
    setIsFormOpen(true);
    setSelectedId('');
  };

  const openMoveModalForItem = (item) => {
    if (!item?.id) return;

    setMoveTargetItemId(item.id);
    setMoveForm({
      place: item.place || '',
      storageLocation: item.storageLocation || '',
      note: '',
    });
    setMoveFormError('');
    setIsMoveModalOpen(true);
  };

  const handleOpenMoveModal = () => {
    if (!selectedItem) return;
    openMoveModalForItem(selectedItem);
  };

  const handleCloseMoveModal = () => {
    setIsMoveModalOpen(false);
    setMoveTargetItemId('');
    setMoveForm(blankMoveForm);
    setMoveFormError('');
  };

  const handleDismissQrLocationWarning = () => {
    setQrLocationWarning(null);
  };

  const handleMoveArtworkFromQrWarning = () => {
    if (!qrLocationWarning?.item?.id || !qrLocationWarning?.verification) return;

    const targetItem = qrLocationWarning.item;

    const suggestedPlace =
      qrLocationWarning.verification.nearestLocation?.name ||
      targetItem.place ||
      '';

    openMoveModalForItem({
      ...targetItem,
      place: suggestedPlace,
      storageLocation: targetItem.storageLocation || '',
    });
    setMoveForm((previous) => ({
      ...previous,
      note: 'Updated after QR scan location verification.',
    }));
    setQrLocationWarning(null);
  };

  const handleMoveFormChange = (event) => {
    const { name, value } = event.target;
    setMoveForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmitMoveArtwork = async (event) => {
    event.preventDefault();
    if (!moveTargetItem) return;

    setIsInventoryMutating(true);
    setMoveFormError('');

    try {
      const previousPlace = moveTargetItem.place || '';
      const previousStorageLocation = moveTargetItem.storageLocation || '';
      const response = await fetch(`${API_BASE}/artworks/${moveTargetItem.id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': session?.id || '',
          'x-actor-email': session?.email || '',
          'x-actor-role': session?.role || '',
        },
        body: JSON.stringify(moveForm),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to move artwork.');
      }

      const updatedItem = normalizeArtwork(await response.json());
      setInventory((previous) => previous.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setSelectedId(updatedItem.id);
      setLocationHistory((previous) => [
        {
          _id: `temp-${Date.now()}`,
          artworkId: updatedItem.id,
          inventoryId: updatedItem.inventoryId || '',
          title: updatedItem.title || '',
          artist: updatedItem.artist || '',
          fromPlace: previousPlace,
          fromStorageLocation: previousStorageLocation,
          toPlace: updatedItem.place || '',
          toStorageLocation: updatedItem.storageLocation || '',
          note: moveForm.note || '',
          actor: {
            id: session?.id || '',
            email: session?.email || '',
            role: session?.role || '',
          },
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ]);
      handleCloseMoveModal();
    } catch (error) {
      setMoveFormError(error.message || 'Failed to move artwork.');
    } finally {
      setIsInventoryMutating(false);
    }
  };

  const selectedItemGallery = Array.isArray(selectedItem?.imageUrls) && selectedItem.imageUrls.length
    ? selectedItem.imageUrls
    : [selectedItem?.imageUrl].filter(Boolean);

  const selectedItemDetailsContent = selectedItem ? (
    <>
      <h2>{getArtworkTitle(selectedItem.title)}</h2>
      <p className="totals-subtitle">{getArtworkArtist(selectedItem.artist)}</p>
      {selectedItem.imageUrl ? (
        <button type="button" className="details-image-btn" onClick={() => handleOpenImageViewer(selectedItem.id, 0)}>
          <img className="details-image" src={selectedItem.imageUrl} alt={getArtworkTitle(selectedItem.title)} />
        </button>
      ) : (
        <div className="details-image placeholder">No Image</div>
      )}
      {selectedItemGallery.length > 1 ? (
        <div className="details-gallery-strip">
          {selectedItemGallery.map((imageUrl, index) => (
            <button
              type="button"
              key={`${imageUrl}-${index}`}
              className="details-gallery-thumb"
              onClick={() => handleOpenImageViewer(selectedItem.id, index)}
              aria-label={`Open image ${index + 1}`}
            >
              <img src={imageUrl} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="details-main">
        <div className="details-grid">
          <p>
            <strong>Inventory ID:</strong>{' '}
            <span title={selectedItem.inventoryId || selectedItem.id}>{getDisplayItemId(selectedItem)}</span>
          </p>
          <p>
            <strong>Year:</strong> {selectedItem.year || 'Not set'}
          </p>
          <p>
            <strong>Category:</strong> {selectedItem.category || 'Not set'}
          </p>
          <p>
            <strong>Medium:</strong> {selectedItem.medium || 'Not set'}
          </p>
          <p>
            <strong>Dimensions:</strong> {selectedItem.dimensions || 'Not set'}
          </p>
          <p>
            <strong>Status:</strong> {selectedItem.status}
          </p>
          <p>
            <strong>Inventory State:</strong> {selectedItem.isActive ? 'Active' : 'Inactive'}
          </p>
          <p>
            <strong>Place:</strong> {selectedItem.place || 'Not set'}
          </p>
          <p>
            <strong>Storage Location:</strong> {selectedItem.storageLocation || 'Not set'}
          </p>
          <div className="gps-verify-block">
            <p
              className={
                gpsVerificationResult?.status === 'match'
                  ? 'gps-verify-message gps-verify-match'
                  : gpsVerificationResult?.status === 'mismatch'
                    ? 'gps-verify-message gps-verify-mismatch'
                    : ''
              }
            >
              <strong>GPS Verification:</strong>{' '}
              {gpsVerificationResult ? gpsVerificationResult.message : 'Not checked yet'}
            </p>
            <button type="button" className="ghost" onClick={handleVerifyGpsLocation} disabled={isGpsVerifying}>
              {isGpsVerifying ? 'Checking GPS...' : 'Verify Current Location'}
            </button>
          </div>
          <p>
            <strong>Price:</strong> {formatPhp(selectedItem.price)}
          </p>
          <p>
            <strong>Notes:</strong> {selectedItem.notes || 'None'}
          </p>
        </div>
        <div className="qr-block">
          <h3>QR Code</h3>
          <p className="muted qr-item-id">
            <strong>Inventory ID:</strong>{' '}
            <span title={selectedItem.inventoryId || selectedItem.id}>{getDisplayItemId(selectedItem)}</span>
          </p>
          {detailsQr ? (
            <img src={detailsQr} alt={`QR code for ${getArtworkTitle(selectedItem.title)}`} className="qr-image" />
          ) : (
            <p className="muted">Generating QR code...</p>
          )}
          <div className="actions qr-actions">
            <button type="button" onClick={handlePrintQr} disabled={!detailsQr}>
              Print QR
            </button>
          </div>
        </div>
      </div>
      {locationHistory.length ? (
        <section className="location-history-section">
          <div className="heading-row">
            <button type="button" className="title-btn" onClick={handleOpenLocationHistory}>
              Location History
            </button>
          </div>
        </section>
      ) : null}
      <div className="actions">
        {canManage ? (
          <>
            {selectedItem.isActive ? (
              <>
                <button type="button" onClick={handleEditSelectedItem}>
                  Edit
                </button>
                <button type="button" onClick={handleOpenMoveModal}>
                  Move
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(selectedItem.id)}>
                  Delete
                </button>
              </>
            ) : null}
            {session?.role === 'super admin' && !selectedItem.isActive ? (
              <>
                <button type="button" onClick={() => handleActivate(selectedItem.id)}>
                  Activate
                </button>
                <button type="button" className="danger" onClick={() => handlePermanentDelete(selectedItem.id)}>
                  Delete Permanently
                </button>
              </>
            ) : null}
          </>
        ) : null}
        <button type="button" className="ghost" onClick={handleCloseSelectedItem}>
          Close
        </button>
      </div>
    </>
  ) : null;

  const locationHistoryContent = locationHistoryItem ? (
    <section className="location-history-section">
      <h2>{getArtworkTitle(locationHistoryItem.title)}</h2>
      <p className="totals-subtitle">{getArtworkArtist(locationHistoryItem.artist)}</p>
      {isLocationHistoryLoading ? <p className="muted">Loading location history...</p> : null}
      {!isLocationHistoryLoading && locationHistory.length === 0 ? (
        <p className="muted">No location history yet.</p>
      ) : null}
      {locationHistory.length ? (
        <div className="location-history-list">
          {locationHistory.map((entry) => (
            <article className="location-history-item" key={entry._id}>
              <strong>{formatDateTime(entry.createdAt)}</strong>
              <p>
                <strong>From:</strong> {entry.fromPlace || 'Not set'} / {entry.fromStorageLocation || 'Not set'}
              </p>
              <p>
                <strong>To:</strong> {entry.toPlace || 'Not set'} / {entry.toStorageLocation || 'Not set'}
              </p>
              <p>
                <strong>By:</strong> {entry.actor?.email || entry.actor?.role || 'Unknown'}
              </p>
              {entry.note ? (
                <p>
                  <strong>Note:</strong> {entry.note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  ) : null;

  const categorySectionContent = (
    <article className="panel controls">
      <div className="heading-row">
        <h2>Categories</h2>
      </div>
      <form className="category-manager-form" onSubmit={handleSubmitCategory}>
        <input
          type="text"
          value={categoryName}
          onChange={(event) => {
            setCategoryName(event.target.value);
            if (categoryFormError) setCategoryFormError('');
          }}
          placeholder="Enter category name"
          className={categoryFormError ? 'field-error' : ''}
          aria-invalid={categoryFormError ? 'true' : 'false'}
        />
        {categoryFormError ? <p className="form-error category-form-error">{categoryFormError}</p> : null}
        <div className="actions">
          <button type="submit">{editingCategoryId ? 'Update Category' : 'Add Category'}</button>
          {editingCategoryId ? (
            <button type="button" className="ghost" onClick={resetCategoryForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {isCategoriesLoading ? <p className="muted">Loading categories...</p> : null}
      <div className="user-list">
        {categories.length === 0 ? <p>No categories found.</p> : null}
        {categories.map((category) => (
          <article className="category-item" key={category.id}>
            <strong>{category.name}</strong>
            <div className="actions">
              <button type="button" onClick={() => handleEditCategory(category)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDeleteCategory(category)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </article>
  );

  const locationSectionContent = (
    <article className="panel controls">
      <div className="heading-row">
        <h2>Locations</h2>
      </div>
      <form className="category-manager-form" onSubmit={handleSubmitLocation}>
        <input
          type="text"
          value={locationForm.name}
          onChange={(event) => {
            setLocationForm((previous) => ({ ...previous, name: event.target.value }));
            if (locationFormError) setLocationFormError('');
          }}
          placeholder="Location name"
        />
        <input
          type="number"
          step="any"
          value={locationForm.latitude}
          onChange={(event) => setLocationForm((previous) => ({ ...previous, latitude: event.target.value }))}
          placeholder="Latitude"
        />
        <input
          type="number"
          step="any"
          value={locationForm.longitude}
          onChange={(event) => setLocationForm((previous) => ({ ...previous, longitude: event.target.value }))}
          placeholder="Longitude"
        />
        <input
          type="number"
          min="1"
          value={locationForm.radiusMeters}
          onChange={(event) => setLocationForm((previous) => ({ ...previous, radiusMeters: event.target.value }))}
          placeholder="Radius meters"
        />
        <textarea
          value={locationForm.notes}
          onChange={(event) => setLocationForm((previous) => ({ ...previous, notes: event.target.value }))}
          rows={2}
          placeholder="Notes"
        />
        {locationFormError ? <p className="form-error category-form-error">{locationFormError}</p> : null}
        <div className="actions">
          <button type="submit">{editingLocationId ? 'Update Location' : 'Add Location'}</button>
          {editingLocationId ? (
            <button type="button" className="ghost" onClick={resetLocationForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {isLocationsLoading ? <p className="muted">Loading locations...</p> : null}
      <div className="user-list">
        {locations.length === 0 ? <p>No locations found.</p> : null}
        {locations.map((location) => (
          <article className="category-item" key={location.id}>
            <div>
              <strong>{location.name}</strong>
              <p className="muted">
                {location.latitude}, {location.longitude} • {location.radiusMeters}m
              </p>
              {location.notes ? <p className="muted">{location.notes}</p> : null}
            </div>
            <div className="actions">
              <button type="button" onClick={() => handleEditLocation(location)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDeleteLocation(location)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </article>
  );

  const stopQrScanner = async () => {
    const scanner = html5QrRef.current;
    if (!scanner) return;

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // Ignore stop errors; scanner may already be stopped.
    }

    try {
      await scanner.clear();
    } catch {
      // Ignore clear errors.
    }

    html5QrRef.current = null;
  };

  const closeQrScanner = () => {
    setIsQrScannerOpen(false);
    setQrScanError('');
    setIsQrPhotoScanning(false);
    hasHandledScanRef.current = false;
    void stopQrScanner();
  };

  const closeVisualSearch = () => {
    setIsVisualSearchOpen(false);
    setVisualSearchError('');
    setIsVisualSearchProcessing(false);
    setVisualSearchPreview('');
    setVisualSearchResults([]);
  };

  const openVisualSearch = () => {
    setVisualSearchError('');
    setVisualSearchResults([]);
    setVisualSearchPreview('');
    setIsVisualSearchOpen(true);
    setIsMobileMenuOpen(false);
    setIsMobileSearchOpen(false);
  };

  const handlePickVisualSearchImage = async (file) => {
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setVisualSearchPreview(objectUrl);
    setIsVisualSearchProcessing(true);
    setVisualSearchError('');
    setVisualSearchResults([]);

    try {
      const imageFingerprint = await computeVisualFingerprintFromFile(file);
      const matches = await runVisualSearch(imageFingerprint);
      setVisualSearchResults(matches);
      if (!matches.length) {
        setVisualSearchError('No close artwork match found yet.');
      }
    } catch (error) {
      setVisualSearchError(error.message || 'Failed to run visual search.');
    } finally {
      setIsVisualSearchProcessing(false);
    }
  };

  const handleOpenVisualSearchResult = (item) => {
    if (!item?.id) return;
    setCurrentPage('inventory');
    setInventory((previous) => {
      if (previous.some((existingItem) => existingItem.id === item.id)) return previous;
      return [item, ...previous];
    });
    setSelectedId(item.id);
    setIsVisualSearchOpen(false);
    setVisualSearchError('');
    setVisualSearchPreview('');
    setVisualSearchResults([]);
    updateItemIdInUrl(item.id);
  };

  const handleOpenSelectedItem = (itemId) => {
    if (!itemId) return;

    if (isMobileViewport) {
      inventoryScrollRestoreRef.current = window.scrollY || window.pageYOffset || 0;
    }

    setSelectedId(itemId);
  };

  const handleScannedQr = (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return;

    let itemId = '';

    try {
      const parsedUrl = new URL(value, window.location.origin);
      itemId = parsedUrl.searchParams.get('item') || '';
    } catch {
      itemId = '';
    }

    if (!itemId) {
      setQrScanError('Invalid QR code. Please scan a valid inventory QR.');
      return;
    }

    setCurrentPage('inventory');
    setSelectedId('');
    setPendingItemId(itemId);
    setShouldCheckGpsAfterQrScan(true);
    setQrLocationWarning(null);
    updateItemIdInUrl(itemId);
    setIsMobileMenuOpen(false);
    setIsQrScannerOpen(false);
    hasHandledScanRef.current = false;
    void stopQrScanner();
    setApiError('');
  };

  const scanQrFromImageFile = async (file) => {
    if (!file) return;
    setIsQrPhotoScanning(true);
    setQrScanError('');
    try {
      const jsQR = await loadJsQrLib();
      const loadImageElement = () =>
        new Promise((resolve, reject) => {
          const objectUrl = URL.createObjectURL(file);
          const image = new Image();
          image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
          };
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image'));
          };
          image.src = objectUrl;
        });

      const loadedImage = await loadImageElement();
      const sourceWidth = Number(loadedImage.naturalWidth || loadedImage.width || 0);
      const sourceHeight = Number(loadedImage.naturalHeight || loadedImage.height || 0);
      if (!sourceWidth || !sourceHeight) {
        throw new Error('Invalid image size');
      }

      const detectFromCanvas = (canvas) => {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;

        const scales = [1, 0.75, 0.5, 0.35];
        const inversionModes = ['attemptBoth', 'dontInvert', 'onlyInvert'];

        for (const scale of scales) {
          const targetWidth = Math.max(120, Math.floor(canvas.width * scale));
          const targetHeight = Math.max(120, Math.floor(canvas.height * scale));
          const passCanvas = document.createElement('canvas');
          passCanvas.width = targetWidth;
          passCanvas.height = targetHeight;
          const passContext = passCanvas.getContext('2d', { willReadFrequently: true });
          if (!passContext) continue;
          passContext.drawImage(canvas, 0, 0, targetWidth, targetHeight);
          const imageData = passContext.getImageData(0, 0, targetWidth, targetHeight);

          for (const inversionAttempts of inversionModes) {
            const result = jsQR(imageData.data, targetWidth, targetHeight, { inversionAttempts });
            if (result?.data) {
              return result.data;
            }
          }
        }

        return null;
      };

      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = sourceWidth;
      baseCanvas.height = sourceHeight;
      const baseContext = baseCanvas.getContext('2d');
      if (!baseContext) throw new Error('Canvas unavailable');
      baseContext.drawImage(loadedImage, 0, 0, sourceWidth, sourceHeight);

      let decodedValue = detectFromCanvas(baseCanvas);

      if (!decodedValue) {
        // Fallback for images with orientation issues: try rotated pass.
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = sourceHeight;
        rotatedCanvas.height = sourceWidth;
        const rotatedContext = rotatedCanvas.getContext('2d');
        if (rotatedContext) {
          rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
          rotatedContext.rotate(Math.PI / 2);
          rotatedContext.drawImage(loadedImage, -sourceWidth / 2, -sourceHeight / 2);
          decodedValue = detectFromCanvas(rotatedCanvas);
        }
      }

      if (!decodedValue) {
        setQrScanError('No QR code found in image. Try a closer shot and include only the QR code.');
        return;
      }

      handleScannedQr(decodedValue);
    } catch {
      setQrScanError('Unable to scan this photo. Please try a clearer QR image.');
    } finally {
      setIsQrPhotoScanning(false);
    }
  };

  useEffect(() => {
    if (!isQrScannerOpen) return;

    const startScanner = async () => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setQrScanError('Live QR scanning is not supported on this browser. Use camera photo scan below.');
        return;
      }

      try {
        setQrScanError('');
        hasHandledScanRef.current = false;

        const Html5Qrcode = await loadHtml5QrcodeLib();
        const scanner = new Html5Qrcode('qr-reader');
        html5QrRef.current = scanner;

        const onScanSuccess = (decodedText) => {
          if (hasHandledScanRef.current) return;
          hasHandledScanRef.current = true;
          handleScannedQr(decodedText);
        };

        const onScanFailure = () => {
          // Keep scanning; ignore decode misses.
        };

        const config = {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1,
        };

        try {
          await scanner.start({ facingMode: { exact: 'environment' } }, config, onScanSuccess, onScanFailure);
          setQrScanError('');
        } catch {
          await scanner.start({ facingMode: 'environment' }, config, onScanSuccess, onScanFailure);
          setQrScanError('');
        }
      } catch {
        setQrScanError('Unable to start camera scanner. Allow camera permission or use photo scan below.');
      }
    };

    void startScanner();

    return () => {
      hasHandledScanRef.current = false;
      void stopQrScanner();
    };
  }, [isQrScannerOpen]);

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="container">
      {isOverlayLoading ? (
        <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <img src="/januarius-loading-logo.png" alt="" className="loading-logo" aria-hidden="true" />
          <strong className="loading-text">Loading...</strong>
        </div>
      ) : null}
      {showScrollTop ? (
        <button
          type="button"
          className="scroll-top-link"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
        >
          ↑
        </button>
      ) : null}
      {!isMobileFormPage && !isMobileMovePage && !isMobileLocationHistoryPage && !isMobileDetailsPage ? (
      <header>
        <div className="mobile-header-top">
          <div className="mobile-header-actions">
            <div className="mobile-header-brand">
              <div className="mobile-menu-container">
              <button
                type="button"
                className="hamburger-btn"
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => {
                  setIsMobileMenuOpen((previous) => !previous);
                  setIsMobileSearchOpen(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              </div>
              <button
                type="button"
                className="mobile-header-title"
                onClick={() => window.location.reload()}
              >
                Artworkz
              </button>
            </div>
            <button
              type="button"
              className="mobile-search-trigger"
              aria-label={isMobileSearchOpen ? 'Close search' : 'Open search'}
              onClick={() => {
                setIsMobileSearchOpen((previous) => !previous);
                setIsMobileMenuOpen(false);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        {isMobileSearchOpen ? (
          <div className="mobile-search-dropdown">
            <div className="mobile-search-shell">
              <span className="mobile-search-leading" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <input
                placeholder="Search..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="mobile-search-close"
                onClick={handleCloseMobileSearch}
                aria-label="Close search"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
            <div className="mobile-search-actions-row">
              <button
                type="button"
                className="mobile-search-link"
                onClick={() => {
                  setIsMobileFiltersOpen(true);
                  setIsMobileSearchOpen(false);
                }}
              >
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              <button
                type="button"
                className="mobile-search-link"
                onClick={() => {
                  setQrScanError('');
                  setIsQrScannerOpen(true);
                  setIsMobileSearchOpen(false);
                }}
              >
                Scan QR
              </button>
              <button
                type="button"
                className="mobile-search-link"
                onClick={() => {
                  openVisualSearch();
                }}
              >
                Visual Search
              </button>
            </div>
          </div>
        ) : null}
        <div className="header-row stacked-mobile">
          <div className="header-copy">
            <h1>Artworks Inventory</h1>
            <p>Manage your collection, track status, and keep all details in one place.</p>
            <p className="muted header-session">
              Logged in as: <strong>{session.role}</strong> ({session.email})
            </p>
            {isLoading ? <p className="muted">Loading inventory...</p> : null}
            {!isFormOpen && apiError ? <p className="form-error">{apiError}</p> : null}
          </div>
          <div className="actions desktop-nav-actions">
            <button
              type="button"
              className={currentPage === 'inventory' ? '' : 'ghost'}
              onClick={() => setCurrentPage('inventory')}
            >
              Inventory
            </button>
            <button type="button" className="ghost" onClick={openVisualSearch}>
              Visual Search
            </button>
            {canOpenAdminPage ? (
              <button
                type="button"
                className={currentPage === 'admin' ? '' : 'ghost'}
                onClick={() => {
                  setCurrentPage('admin');
                  setAdminSection('users');
                  fetchUsers();
                  fetchAuditLogs(auditActionFilter);
                }}
              >
                Admin Page
              </button>
            ) : null}
            <button type="button" className="ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
        {isMobileMenuOpen ? (
          <div className="mobile-menu-backdrop" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="mobile-menu-panel" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-menu-header">
                <div className="mobile-menu-profile">
                  <div className="mobile-menu-avatar" aria-hidden="true">
                    {getInitials(session.name || session.email)}
                  </div>
                  <div className="mobile-menu-profile-copy">
                    <strong>{session.name || 'User'}</strong>
                    <span>
                      {session.role} • {session.email}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="mobile-drawer-close-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                className={`mobile-menu-item ${currentPage === 'inventory' ? '' : 'ghost'}`}
                onClick={() => {
                  setCurrentPage('inventory');
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className="mobile-menu-item-main">
                  <span className="mobile-menu-icon">[]</span>
                  <span>Inventory</span>
                </span>
                <span className="mobile-menu-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    setCurrentPage('inventory');
                    setIsMobileMenuOpen(false);
                    handleAddNew();
                  }}
                >
                  <span className="mobile-menu-item-main">
                    <span className="mobile-menu-icon">＋</span>
                    <span>Add New Item</span>
                  </span>
                  <span className="mobile-menu-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ) : null}
              {canOpenAdminPage ? (
                <>
                  <button
                    type="button"
                    className="mobile-menu-parent-label"
                    onClick={() => setIsMobileAdminMenuOpen((previous) => !previous)}
                    aria-expanded={isMobileAdminMenuOpen}
                  >
                    <span className="mobile-menu-item-main">
                      <span className="mobile-menu-icon">##</span>
                      <span>Admin Page</span>
                    </span>
                    <span
                      className={`mobile-menu-chevron mobile-menu-chevron-toggle ${isMobileAdminMenuOpen ? 'open' : ''}`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                  {isMobileAdminMenuOpen ? (
                    <>
                      <button
                        type="button"
                        className={`mobile-menu-subitem ${currentPage === 'admin' && adminSection === 'users' ? '' : 'ghost'}`}
                        onClick={() => {
                          setCurrentPage('admin');
                          setAdminSection('users');
                          setIsMobileMenuOpen(false);
                          fetchUsers();
                        }}
                      >
                        <span>Users</span>
                        <span className="mobile-menu-chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`mobile-menu-subitem ${currentPage === 'admin' && adminSection === 'audit' ? '' : 'ghost'}`}
                        onClick={() => {
                          setCurrentPage('admin');
                          setAdminSection('audit');
                          setIsMobileMenuOpen(false);
                          fetchAuditLogs(auditActionFilter);
                        }}
                      >
                        <span>Audit Trail</span>
                        <span className="mobile-menu-chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`mobile-menu-subitem ${currentPage === 'admin' && adminSection === 'categories' ? '' : 'ghost'}`}
                        onClick={() => {
                          setCurrentPage('admin');
                          setAdminSection('categories');
                          setIsMobileMenuOpen(false);
                          fetchCategories();
                        }}
                      >
                        <span>Categories</span>
                        <span className="mobile-menu-chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`mobile-menu-subitem ${currentPage === 'admin' && adminSection === 'locations' ? '' : 'ghost'}`}
                        onClick={() => {
                          setCurrentPage('admin');
                          setAdminSection('locations');
                          setIsMobileMenuOpen(false);
                          fetchLocations();
                        }}
                      >
                        <span>Locations</span>
                        <span className="mobile-menu-chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                className="mobile-menu-item ghost"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setQrScanError('');
                  setIsQrScannerOpen(true);
                }}
              >
                <span className="mobile-menu-item-main">
                  <span className="mobile-menu-icon">QR</span>
                  <span>Scan QR Code</span>
                </span>
                <span className="mobile-menu-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
              <button
                type="button"
                className="mobile-menu-item ghost"
                onClick={() => {
                  openVisualSearch();
                }}
              >
                <span className="mobile-menu-item-main">
                  <span className="mobile-menu-icon">AI</span>
                  <span>Visual Search</span>
                </span>
                <span className="mobile-menu-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
              <button type="button" className="mobile-menu-item ghost" onClick={handleLogout}>
                <span className="mobile-menu-item-main">
                  <span className="mobile-menu-icon">OO</span>
                  <span>Logout</span>
                </span>
                <span className="mobile-menu-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </header>
      ) : null}

      {currentPage === 'inventory' ? (
        isMobileFormPage ? (
          <section className="mobile-form-page">
            <div className="mobile-form-page-header">
              <button type="button" className="mobile-form-back-link" onClick={handleCloseForm} aria-label="Back">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 6 9 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Back</span>
              </button>
              <div className="mobile-form-page-heading">
                <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
              </div>
            </div>
            <section className="panel mobile-form-card">
              <InventoryForm
                onSubmit={handleSubmit}
                editingItem={editingItem}
                onCancel={handleCloseForm}
                hideTitle
                categories={categoryOptions}
                locations={locations}
                submitError={inventoryFormError}
              />
            </section>
          </section>
        ) : isMobileMovePage ? (
          <section className="mobile-form-page">
            <div className="mobile-form-page-header">
              <button type="button" className="mobile-form-back-link" onClick={handleCloseMoveModal} aria-label="Back">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 6 9 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Back</span>
              </button>
              <div className="mobile-form-page-heading">
                <h2>Move Artwork</h2>
              </div>
            </div>
            <section className="panel mobile-form-card">
              <form className="form-grid" onSubmit={handleSubmitMoveArtwork}>
                {moveFormError ? <p className="form-error">{moveFormError}</p> : null}
                <label>
                  Place
                  <select name="place" value={moveForm.place} onChange={handleMoveFormChange}>
                    <option value="">Select place</option>
                    {Array.from(
                      new Set([
                        ...locations.map((location) => String(location?.name || '').trim()).filter(Boolean),
                        String(moveForm.place || '').trim(),
                      ])
                    )
                      .filter(Boolean)
                      .sort((left, right) => left.localeCompare(right))
                      .map((place) => (
                        <option key={place} value={place}>
                          {place}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Storage Location
                  <input
                    name="storageLocation"
                    value={moveForm.storageLocation}
                    onChange={handleMoveFormChange}
                    placeholder="Wall / shelf / rack"
                  />
                </label>
                <label className="full-width">
                  Note
                  <textarea
                    name="note"
                    value={moveForm.note}
                    onChange={handleMoveFormChange}
                    rows={3}
                    placeholder="Reason for transfer"
                  />
                </label>
                <div className="actions full-width">
                  <button type="submit" disabled={isInventoryMutating}>
                    {isInventoryMutating ? 'Saving...' : 'Save Movement'}
                  </button>
                  <button type="button" className="ghost" onClick={handleCloseMoveModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </section>
        ) : isMobileLocationHistoryPage ? (
          <section className="mobile-form-page">
            <div className="mobile-form-page-header">
              <button type="button" className="mobile-form-back-link" onClick={handleCloseLocationHistory} aria-label="Back">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 6 9 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Back</span>
              </button>
              <div className="mobile-form-page-heading">
                <h2>Location History</h2>
              </div>
            </div>
            <section className="panel mobile-form-card">{locationHistoryContent}</section>
          </section>
        ) : isMobileDetailsPage ? (
          <section className="panel mobile-details-page">
            <div className="mobile-form-page-header">
              <button type="button" className="mobile-form-back-link" onClick={handleCloseSelectedItem} aria-label="Back">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 6 9 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Back</span>
              </button>
            </div>
            {selectedItemDetailsContent}
          </section>
        ) : (
        <>
      <section className="stats-row">
        {categoryStats.map((categoryStat, index) => (
          <button
            type="button"
            key={categoryStat.name}
            className={`panel stat stat-button ${getMobileStatCardClass(index)}`}
            onClick={() => {
              if (categoryStat.name === 'Painting') {
                setIsTotalsOpen(true);
                setIsSculptureTotalsOpen(false);
                return;
              }

              if (categoryStat.name === 'Sculpture') {
                setIsSculptureTotalsOpen(true);
                setIsTotalsOpen(false);
                return;
              }

              setCurrentPage('inventory');
              setCategoryFilter(categoryStat.name);
              setSearch('');
              setStatusFilter('All');
              setPlaceFilter('All');
              setCurrentPageNumber(1);
            }}
          >
            <span className="stat-icon" aria-hidden="true">
              {getCategoryStatIcon(categoryStat.name)}
            </span>
            <span>{categoryStat.name}</span>
            <strong>{categoryStat.count.toLocaleString()}</strong>
            <small className="stat-subvalue">
              {session?.role === 'super admin'
                ? `Active ${categoryStat.activeCount.toLocaleString()} • Inactive ${categoryStat.inactiveCount.toLocaleString()}`
                : `Est. ${formatPhp(categoryStat.value)}`}
            </small>
          </button>
        ))}
      </section>
      <div className="mobile-stats-divider" aria-hidden="true" />
      {hasActiveFilters ? (
        <div className="mobile-clear-filter-row">
          <span className="mobile-active-filter-text">{activeFilterSummary}</span>
          <button type="button" className="mobile-clear-filter-link" onClick={clearAllFilters}>
            Clear filter
          </button>
        </div>
      ) : null}

      <section
        className={`controls inventory-main-section ${isMobileViewport ? 'inventory-main-section-mobile' : 'panel'}`}
        ref={inventorySectionRef}
      >
        <div className="heading-row">
          <h2>Inventory</h2>
          {canManage ? (
            <button type="button" className="inventory-add-btn" onClick={handleAddNew}>
              Add New Item
            </button>
          ) : null}
        </div>
        <div className="toolbar">
          <input
            placeholder="Search by item ID, title, artist, category, medium, place"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All</option>
            <option>Available</option>
            <option>Sold</option>
            <option>Reserved</option>
            <option>On Loan</option>
          </select>
          <select value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)}>
            <option value="All">All Locations</option>
            {paintingsByPlace.map(([name]) => (
              <option value={name} key={`filter-${name}`}>
                {name}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="All">All Categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            <option value="Unassigned">Unassigned</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="recent">Sort: Recent</option>
            <option value="title">Sort: Title</option>
            <option value="year">Sort: Year</option>
            <option value="price">Sort: Price</option>
          </select>
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            aria-label={sortDirection === 'asc' ? 'Sort ascending. Tap to switch to descending' : 'Sort descending. Tap to switch to ascending'}
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {sortDirection === 'asc' ? (
                <path
                  d="M8 17V7m0 0-3 3m3-3 3 3M14 8h5M14 12h4M14 16h3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M8 7v10m0 0-3-3m3 3 3-3M14 8h3M14 12h4M14 16h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
          {hasActiveFilters ? (
            <div className="toolbar-action-group">
              <button
                type="button"
                className="icon-clear-btn"
                onClick={clearAllFilters}
                aria-label="Clear all filters"
                title="Clear all filters"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 6h16M7 6l6 7v4l-2 1v-5L5 6m10.5 9.5 4-4m0 4-4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setDisplayMode(isPictureOnly ? 'details' : 'image')}
            aria-label={isPictureOnly ? 'Switch to full details view' : 'Switch to picture only view'}
            title={isPictureOnly ? 'Full details view' : 'Picture only view'}
          >
            {isPictureOnly ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11ZM7 8.5h10M7 12h10m-10 3.5h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm2.5 9.5 3.2-3.2a1 1 0 0 1 1.4 0l1.8 1.8 2.6-2.6a1 1 0 0 1 1.4 0l2.1 2.1M9 9.5h.01"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {checkedInventoryItems.length ? (
            <button
              type="button"
              className="icon-toggle"
              onClick={handlePrintCheckedInventory}
              aria-label={`Print ${checkedInventoryItems.length} selected inventory item${checkedInventoryItems.length > 1 ? 's' : ''}`}
              title="Print selected inventory"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 9V4h10v5M7 14H5a2 2 0 0 1-2-2v-1.5A2.5 2.5 0 0 1 5.5 8h13A2.5 2.5 0 0 1 21 10.5V12a2 2 0 0 1-2 2h-2M8 13h8v7H8zM17 11h.01"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="card-grid">
          {filteredInventory.length === 0 ? <p>No paintings match your filters.</p> : null}
          {visibleInventory.map((item) => (
            <article
              className={`card ${displayMode === 'image' ? 'picture-only' : ''} ${
                item.isActive ? '' : 'inactive-card'
              }`}
              key={item.id}
            >
              {(() => {
                const isExpanded = expandedCardIds.includes(item.id);
                const statusBadge = getArtworkStatusBadge(item.status, item.isActive);
                const isChecked = checkedInventoryIds.includes(item.id);
                return (
                  <>
              <label className="card-select-checkbox" aria-label={`Select ${getArtworkTitle(item.title)} for printing`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleInventoryChecked(item.id)}
                />
              </label>
              <button
                type="button"
                className="card-media-btn"
                onClick={() => handleOpenSelectedItem(item.id)}
              >
                {item.imageUrl ? (
                  <img src={item.cardImageUrl || item.imageUrl} alt={getArtworkTitle(item.title)} />
                ) : (
                  <div className="placeholder">No Image</div>
                )}
              </button>
              {statusBadge ? <span className={statusBadge.className}>{statusBadge.label}</span> : null}
              {displayMode === 'details' ? (
                <div className="card-body">
                  <h3>
                    <button type="button" className="title-btn" onClick={() => handleOpenSelectedItem(item.id)}>
                      {getArtworkTitle(item.title)}
                    </button>
                  </h3>
                  <p className="muted">{getArtworkArtist(item.artist)}</p>
                  <p>
                    {item.medium || 'Medium not set'} {item.year ? `(${item.year})` : ''}
                  </p>
                  <p>
                    <strong>Category:</strong> {item.category || 'Not set'}
                  </p>
                  <p>{item.dimensions || 'Dimensions not set'}</p>
                  <p>
                    <strong>Status:</strong> {item.status}
                  </p>
                  {!item.isActive ? <p className="inactive-label">Inventory State: Inactive</p> : null}
                  <p>
                    <strong>Place:</strong> {item.place || 'Not set'}
                  </p>
                  <p>
                    <strong>Storage Location:</strong> {item.storageLocation || 'Not set'}
                  </p>
                  <p>
                    <strong>Price:</strong> {formatPhp(item.price)}
                  </p>
                  {item.notes ? <p className="notes">{item.notes}</p> : null}
                </div>
              ) : null}
              {displayMode === 'image' ? (
                isMobileViewport ? (
                  <div className="picture-card-footer mobile-picture-card-footer">
                    <button
                      type="button"
                      className={`picture-expand-toggle ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleExpandedCard(item.id)}
                      aria-expanded={isExpanded ? 'true' : 'false'}
                    >
                      <span className="picture-expand-title">{getArtworkTitle(item.title)}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="m6 9 6 6 6-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {isExpanded ? (
                        <>
                          <div className="card-body picture-card-details">
                          <p className="muted">{getArtworkArtist(item.artist)}</p>
                          <p>
                            {item.medium || 'Medium not set'} {item.year ? `(${item.year})` : ''}
                          </p>
                          <p>
                            <strong>Category:</strong> {item.category || 'Not set'}
                          </p>
                          <p>{item.dimensions || 'Dimensions not set'}</p>
                          <p>
                            <strong>Status:</strong> {item.status}
                          </p>
                          {!item.isActive ? <p className="inactive-label">Inventory State: Inactive</p> : null}
                          <p>
                            <strong>Place:</strong> {item.place || 'Not set'}
                          </p>
                          <p>
                            <strong>Storage Location:</strong> {item.storageLocation || 'Not set'}
                          </p>
                          <p>
                            <strong>Price:</strong> {formatPhp(item.price)}
                          </p>
                          {item.notes ? <p className="notes">{item.notes}</p> : null}
                        </div>
                        <div className="actions card-actions">
                          {canManage ? (
                            <>
                              {item.isActive ? (
                                <>
                                  <button
                                    type="button"
                                    className="card-action-link"
                                    onClick={() => handleEdit(item.id)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="card-action-link card-action-link-danger"
                                    onClick={() => handleDelete(item.id)}
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : null}
                              {session?.role === 'super admin' && !item.isActive ? (
                                <>
                                  <button
                                    type="button"
                                    className="card-action-link"
                                    onClick={() => handleActivate(item.id)}
                                  >
                                    Activate
                                  </button>
                                  <button
                                    type="button"
                                    className="card-action-link card-action-link-danger"
                                    onClick={() => handlePermanentDelete(item.id)}
                                  >
                                    Delete Permanently
                                  </button>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="picture-card-footer">
                    <button type="button" className="picture-title-btn" onClick={() => handleOpenSelectedItem(item.id)}>
                      {getArtworkTitle(item.title)}
                    </button>
                    <div className="actions card-actions">
                      {canManage ? (
                        <>
                          {item.isActive ? (
                            <>
                              <button
                                type="button"
                                className="card-action-link"
                                onClick={() => handleEdit(item.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="card-action-link card-action-link-danger"
                                onClick={() => handleDelete(item.id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                          {session?.role === 'super admin' && !item.isActive ? (
                            <>
                              <button
                                type="button"
                                className="card-action-link"
                                onClick={() => handleActivate(item.id)}
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                className="card-action-link card-action-link-danger"
                                onClick={() => handlePermanentDelete(item.id)}
                              >
                                Delete Permanently
                              </button>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              ) : (
              <div className="actions card-actions">
                {canManage ? (
                  <>
                    {item.isActive ? (
                      <>
                        <button
                          type="button"
                          className="card-action-link"
                          onClick={() => handleEdit(item.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="card-action-link card-action-link-danger"
                          onClick={() => handleDelete(item.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                    {session?.role === 'super admin' && !item.isActive ? (
                      <>
                        <button
                          type="button"
                          className="card-action-link"
                          onClick={() => handleActivate(item.id)}
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          className="card-action-link card-action-link-danger"
                          onClick={() => handlePermanentDelete(item.id)}
                        >
                          Delete Permanently
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              )}
                  </>
                );
              })()}
            </article>
          ))}
          {isLoadingMoreInventory
            ? Array.from({ length: Math.min(4, filteredInventory.length - visibleInventory.length || 4) }, (_, index) => (
                <article className="card card-loading" key={`loading-${index}`} aria-hidden="true">
                  <div className="card-loading-media shimmer-block" />
                  <div className="card-loading-body">
                    <div className="shimmer-line shimmer-line-title" />
                    <div className="shimmer-line" />
                    <div className="shimmer-line shimmer-line-short" />
                  </div>
                </article>
              ))
            : null}
        </div>
        {hasMoreInventory ? <div ref={inventoryLoadMoreRef} className="inventory-load-more-trigger" aria-hidden="true" /> : null}
      </section>

      {isFormOpen && !isMobileFormPage ? (
        <div className="modal-backdrop">
          <section className="panel modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={handleCloseForm} aria-label="Close">
              ×
            </button>
            <InventoryForm
              onSubmit={handleSubmit}
              editingItem={editingItem}
              onCancel={handleCloseForm}
              categories={categoryOptions}
              locations={locations}
              submitError={inventoryFormError}
            />
          </section>
        </div>
      ) : null}

      {isMobileFiltersOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal mobile-filters-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setIsMobileFiltersOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Advanced Filters</h2>
            <div className="mobile-filters-grid">
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>All</option>
                  <option>Available</option>
                  <option>Sold</option>
                  <option>Reserved</option>
                  <option>On Loan</option>
                </select>
              </label>
              <label>
                Location
                <select value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)}>
                  <option value="All">All Locations</option>
                  {paintingsByPlace.map(([name]) => (
                    <option value={name} key={`mobile-filter-${name}`}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="All">All Categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value="Unassigned">Unassigned</option>
                </select>
              </label>
              <label>
                Sort
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="recent">Sort: Recent</option>
                  <option value="title">Sort: Title</option>
                  <option value="year">Sort: Year</option>
                  <option value="price">Sort: Price</option>
                </select>
              </label>
              <label>
                Direction
                <button
                  type="button"
                  className="icon-toggle mobile-sort-direction-btn"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  aria-label={
                    sortDirection === 'asc'
                      ? 'Sort ascending. Tap to switch to descending'
                      : 'Sort descending. Tap to switch to ascending'
                  }
                  title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {sortDirection === 'asc' ? (
                      <path
                        d="M8 17V7m0 0-3 3m3-3 3 3M14 8h5M14 12h4M14 16h3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <path
                        d="M8 7v10m0 0-3-3m3 3 3-3M14 8h3M14 12h4M14 16h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </button>
              </label>
            </div>
            <div className="actions">
              {hasActiveFilters ? (
                <button type="button" className="ghost" onClick={clearAllFilters}>
                  Clear
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={() => setDisplayMode(isPictureOnly ? 'details' : 'image')}>
                {isPictureOnly ? 'Full Details' : 'Picture Only'}
              </button>
              <button type="button" onClick={() => setIsMobileFiltersOpen(false)}>
                Apply
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isTotalsOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal totals-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setIsTotalsOpen(false)} aria-label="Close">
              ×
            </button>
            <h2>Paintings by Location</h2>
            <p className="totals-subtitle">Total painting inventory: {formatPaintingCount(displayedPaintingCount)}</p>
            <p className="totals-subtitle">Estimated value: {formatPhp(displayedPaintingValue)}</p>
            <article className="totals-group">
              {paintingLocationRows.map(([name, count]) => (
                <div className="totals-row totals-row-button" key={`place-${name}`}>
                  <button type="button" className="totals-row-main" onClick={() => handleLocationFilter(name, 'Painting')}>
                    <span>{name}</span>
                  </button>
                  <div className="totals-row-actions">
                    <strong>{formatPaintingCount(count)}</strong>
                    <button
                      type="button"
                      className="totals-row-print"
                      aria-label={`Print all paintings in ${name}`}
                      title={`Print all paintings in ${name}`}
                      onClick={() => handlePrintItemsByLocation(name, 'Painting')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M7 9V4h10v5M7 14H5a2 2 0 0 1-2-2v-1.5A2.5 2.5 0 0 1 5.5 8h13A2.5 2.5 0 0 1 21 10.5V12a2 2 0 0 1-2 2h-2M8 13h8v7H8zM17 11h.01"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </article>
            <div className="actions">
              <button type="button" className="danger" onClick={() => setIsTotalsOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSculptureTotalsOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal totals-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setIsSculptureTotalsOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Total Sculpture By Location</h2>
            <p className="totals-subtitle">Total sculpture inventory: {formatSculptureCount(displayedSculptureCount)}</p>
            <p className="totals-subtitle">Estimated value: {formatPhp(displayedSculptureValue)}</p>
            <article className="totals-group">
              {sculptureLocationRows.map(([name, count]) => (
                <button
                  type="button"
                  className="totals-row totals-row-button"
                  key={`sculpture-place-${name}`}
                  onClick={() => handleLocationFilter(name, 'Sculpture')}
                >
                  <span>{name}</span>
                  <strong>{formatSculptureCount(count)}</strong>
                </button>
              ))}
            </article>
            <div className="actions">
              <button type="button" className="danger" onClick={() => setIsSculptureTotalsOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedItem && !isMobileDetailsPage && !locationHistoryItemId ? (
        <div className="modal-backdrop">
          <section className="panel modal details-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setSelectedId('')} aria-label="Close">
              ×
            </button>
            {selectedItemDetailsContent}
          </section>
        </div>
      ) : null}

      {locationHistoryItemId && !isMobileLocationHistoryPage ? (
        <div className="modal-backdrop">
          <section className="panel modal location-history-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={handleCloseLocationHistory} aria-label="Close">
              ×
            </button>
            {locationHistoryContent}
          </section>
        </div>
      ) : null}

      {isImageViewerOpen && viewerItem?.imageUrl ? (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <section className="panel modal image-viewer-modal">
                <p className="muted">Loading image viewer...</p>
              </section>
            </div>
          }
        >
          <LazyImageViewerModal
            viewerItem={viewerItem}
            currentImageIndex={currentViewerImageIndex}
            selectViewerImage={selectViewerImage}
            showPreviousViewerImage={showPreviousViewerImage}
            showNextViewerImage={showNextViewerImage}
            canManage={canManage}
            isUpdatingCover={isUpdatingViewerCover}
            handleMakeViewerImageCover={handleMakeViewerImageCover}
            handleCloseImageViewer={handleCloseImageViewer}
          />
        </Suspense>
      ) : null}

      {qrLocationWarning ? (
        <div className="modal-backdrop" onClick={handleDismissQrLocationWarning}>
          <section className="panel modal qr-location-warning-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={handleDismissQrLocationWarning} aria-label="Close">
              ×
            </button>
            <h2>Place Warning</h2>
            <p className="muted">
              After scanning this QR, the device GPS does not match the artwork&apos;s expected place in the database.
            </p>
            <div className="qr-location-warning-details">
              <p>
                <strong>Artwork:</strong> {getArtworkTitle(qrLocationWarning.item?.title)}
              </p>
              <p>
                <strong>Database Place:</strong> {qrLocationWarning.item?.place || 'Not set'}
              </p>
              <p>
                <strong>GPS Result:</strong> {qrLocationWarning.verification?.message}
              </p>
              <p>
                <strong>Nearest Known Location:</strong>{' '}
                {qrLocationWarning.verification?.nearestLocation
                  ? `${qrLocationWarning.verification.nearestLocation.name} (${Math.round(
                      qrLocationWarning.verification.nearestLocation.distanceMeters
                    )}m away)`
                  : 'No nearby saved location found'}
              </p>
            </div>
            <div className="actions">
              <button type="button" onClick={handleMoveArtworkFromQrWarning}>
                {qrLocationWarning.verification?.nearestLocation
                  ? `Move to ${qrLocationWarning.verification.nearestLocation.name}`
                  : 'Move Artwork'}
              </button>
              <button type="button" className="ghost" onClick={handleDismissQrLocationWarning}>
                Keep Current Place
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isMoveModalOpen && !isMobileMovePage ? (
        <div className="modal-backdrop">
          <section className="panel modal move-artwork-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={handleCloseMoveModal} aria-label="Close">
              ×
            </button>
            <h2>Move Artwork</h2>
            <p className="muted">Update the current artwork location and keep a movement history.</p>
            <form className="form-grid" onSubmit={handleSubmitMoveArtwork}>
              {moveFormError ? <p className="form-error">{moveFormError}</p> : null}
              <label>
                Place
                <select name="place" value={moveForm.place} onChange={handleMoveFormChange}>
                  <option value="">Select place</option>
                  {Array.from(
                    new Set([
                      ...locations.map((location) => String(location?.name || '').trim()).filter(Boolean),
                      String(moveForm.place || '').trim(),
                    ])
                  )
                    .filter(Boolean)
                    .sort((left, right) => left.localeCompare(right))
                    .map((place) => (
                      <option key={place} value={place}>
                        {place}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Storage Location
                <input
                  name="storageLocation"
                  value={moveForm.storageLocation}
                  onChange={handleMoveFormChange}
                  placeholder="Wall / shelf / rack"
                />
              </label>
              <label className="full-width">
                Note
                <textarea
                  name="note"
                  value={moveForm.note}
                  onChange={handleMoveFormChange}
                  rows={3}
                  placeholder="Reason for transfer"
                />
              </label>
              <div className="actions full-width">
                <button type="submit" disabled={isInventoryMutating}>
                  {isInventoryMutating ? 'Saving...' : 'Save Movement'}
                </button>
                <button type="button" className="ghost" onClick={handleCloseMoveModal}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isQrScannerOpen ? (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <section className="panel modal qr-scanner-modal">
                <p className="muted">Loading scanner...</p>
              </section>
            </div>
          }
        >
          <LazyQrScannerModal
            qrScanError={qrScanError}
            qrPhotoInputRef={qrPhotoInputRef}
            scanQrFromImageFile={scanQrFromImageFile}
            isQrPhotoScanning={isQrPhotoScanning}
            closeQrScanner={closeQrScanner}
          />
        </Suspense>
      ) : null}

      {isVisualSearchOpen ? (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <section className="panel modal qr-scanner-modal">
                <p className="muted">Loading visual search...</p>
              </section>
            </div>
          }
        >
          <LazyVisualSearchModal
            visualSearchError={visualSearchError}
            visualSearchPreview={visualSearchPreview}
            visualSearchResults={visualSearchResults}
            visualSearchInputRef={visualSearchInputRef}
            isVisualSearchProcessing={isVisualSearchProcessing}
            handlePickVisualSearchImage={handlePickVisualSearchImage}
            handleOpenVisualSearchResult={handleOpenVisualSearchResult}
            closeVisualSearch={closeVisualSearch}
          />
        </Suspense>
      ) : null}
        </>
        )
      ) : null}

      {currentPage === 'admin' && canOpenAdminPage ? (
        <Suspense
          fallback={
            <section className="controls">
              <article className="panel controls">
                <p className="muted">Loading admin page...</p>
              </article>
            </section>
          }
        >
          <LazyAdminPage
            isMobileViewport={isMobileViewport}
            adminSection={adminSection}
            setAdminSection={setAdminSection}
            openAddUserModal={openAddUserModal}
            isUsersLoading={isUsersLoading}
            users={users}
            paginatedUsers={paginatedUsers}
            session={session}
            openEditUserModal={openEditUserModal}
            handleDeleteUser={handleDeleteUser}
            userItemsPerPage={userItemsPerPage}
            setUserItemsPerPage={setUserItemsPerPage}
            userPageNumber={userPageNumber}
            setUserPageNumber={setUserPageNumber}
            userTotalPages={userTotalPages}
            visibleUserPageNumbers={visibleUserPageNumbers}
            auditActionFilter={auditActionFilter}
            setAuditActionFilter={setAuditActionFilter}
            fetchAuditLogs={fetchAuditLogs}
            isAuditLoading={isAuditLoading}
            auditLogs={auditLogs}
            paginatedAuditLogs={paginatedAuditLogs}
            formatDateTime={formatDateTime}
            handleExportAuditCsv={handleExportAuditCsv}
            auditItemsPerPage={auditItemsPerPage}
            setAuditItemsPerPage={setAuditItemsPerPage}
            auditPageNumber={auditPageNumber}
            setAuditPageNumber={setAuditPageNumber}
            auditTotalPages={auditTotalPages}
            visibleAuditPageNumbers={visibleAuditPageNumbers}
            categorySectionContent={categorySectionContent}
            locationSectionContent={locationSectionContent}
            fetchCategories={fetchCategories}
            fetchLocations={fetchLocations}
            handleDownloadInventoryTemplateExcel={handleDownloadInventoryTemplateExcel}
            handleDownloadInventoryTemplateCsv={handleDownloadInventoryTemplateCsv}
            handleImportInventoryExcel={handleImportInventoryExcel}
            isInventoryImporting={isInventoryImporting}
            inventoryImportMessage={inventoryImportMessage}
            inventoryImportError={inventoryImportError}
            handleExportInventoryExcel={handleExportInventoryExcel}
            handleExportInventoryCsv={handleExportInventoryCsv}
            inventoryLength={inventory.length}
          />
        </Suspense>
      ) : null}

      {isUserModalOpen ? (
        <UserFormModal editingUser={editingUser} onSubmit={handleSubmitUser} onCancel={closeUserModal} />
      ) : null}

      {!isMobileFormPage && !isMobileMovePage && !isMobileLocationHistoryPage && !isMobileDetailsPage ? (
        <nav
          className="mobile-bottom-nav"
          aria-label="Mobile navigation"
          style={{
            gridTemplateColumns: `repeat(${canOpenAdminPage ? 4 : 3}, minmax(0, 1fr))`,
          }}
        >
          {canOpenAdminPage ? (
            <button
              type="button"
              className={currentPage === 'admin' ? 'active' : ''}
              onClick={() => {
                setCurrentPage('admin');
                setAdminSection('users');
                fetchUsers();
                fetchAuditLogs(auditActionFilter);
              }}
            >
              <span className="mobile-bottom-icon">##</span>
              <span>Admin</span>
            </button>
          ) : null}
          <button type="button" onClick={handleAddNew}>
            <span className="mobile-bottom-icon">+</span>
            <span>Add Item</span>
          </button>
          <button
            type="button"
            className={isVisualSearchOpen ? 'active' : ''}
            onClick={openVisualSearch}
          >
            <span className="mobile-bottom-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>Visual Search</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQrScanError('');
              setIsQrScannerOpen(true);
            }}
          >
            <span className="mobile-bottom-icon">QR</span>
            <span>Scan</span>
          </button>
        </nav>
      ) : null}
    </main>
  );
}

export default App;
