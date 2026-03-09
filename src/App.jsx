import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const AUTH_STORAGE_KEY = 'art_inventory_auth_v1';

const blankForm = {
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

function normalizeArtwork(item) {
  return {
    ...item,
    id: item._id,
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

function InventoryForm({ onSubmit, editingItem, onCancel }) {
  const [form, setForm] = useState(editingItem || blankForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setForm(editingItem || blankForm);
    setFormError('');
  }, [editingItem]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.artist.trim()) {
      setFormError('Please fill in required fields: Title and Artist.');
      return;
    }
    setFormError('');
    onSubmit(form);
    if (!editingItem) {
      setForm(blankForm);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((previous) => ({ ...previous, imageUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setForm((previous) => ({ ...previous, imageUrl: '' }));
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <h2>{editingItem ? 'Edit Painting' : 'Add New Item'}</h2>
      {formError ? <p className="form-error">{formError}</p> : null}
      <label>
        Artwork Category
        <select name="category" value={form.category} onChange={handleChange}>
          <option value="">Select category</option>
          <option value="Painting">Painting</option>
          <option value="Sculpture">Sculpture</option>
          <option value="Digital">Digital</option>
        </select>
      </label>
      <label>
        Title *
        <input name="title" value={form.title} onChange={handleChange} required />
      </label>
      <label>
        Artist *
        <input name="artist" value={form.artist} onChange={handleChange} required />
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
        <input name="place" value={form.place} onChange={handleChange} placeholder="Gallery / branch / room" />
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
      <label>
        Image URL
        <input name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="https://..." />
      </label>
      <label>
        Upload Image
        <input type="file" accept="image/*" onChange={handleImageUpload} />
      </label>
      <label className="full-width">
        Notes
        <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
      </label>
      {form.imageUrl ? (
        <div className="full-width image-preview-block">
          <img src={form.imageUrl} alt="Selected artwork" className="image-preview" />
          <button type="button" className="ghost" onClick={clearImage}>
            Remove Image
          </button>
        </div>
      ) : null}
      <div className="actions full-width">
        <button type="submit">{editingItem ? 'Update Painting' : 'Add Painting'}</button>
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
  const [users, setUsers] = useState([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [placeFilter, setPlaceFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [displayMode, setDisplayMode] = useState('details');
  const [sortBy, setSortBy] = useState('title');
  const [editingId, setEditingId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [returnDetailsId, setReturnDetailsId] = useState('');
  const [detailsQr, setDetailsQr] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTotalsOpen, setIsTotalsOpen] = useState(false);
  const [isSculptureTotalsOpen, setIsSculptureTotalsOpen] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewerId, setViewerId] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScanError, setQrScanError] = useState('');
  const [isQrPhotoScanning, setIsQrPhotoScanning] = useState(false);
  const [pendingItemId, setPendingItemId] = useState(readItemIdFromUrl);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const scannerVideoRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const scannerTimerRef = useRef(null);
  const isScannerBusyRef = useRef(false);
  const qrPhotoInputRef = useRef(null);
  const isPictureOnly = displayMode === 'image';
  const canManage = session?.role === 'admin' || session?.role === 'super admin';
  const canOpenAdminPage = session?.role === 'super admin';

  const editingItem = inventory.find((item) => item.id === editingId) || null;
  const editingUser = users.find((user) => user.id === editingUserId) || null;
  const selectedItem = inventory.find((item) => item.id === selectedId) || null;
  const viewerItem = inventory.find((item) => item.id === viewerId) || null;

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

  useEffect(() => {
    if (!selectedItem) {
      setDetailsQr('');
      return;
    }

    const qrPayload = `${window.location.origin}${window.location.pathname}?item=${encodeURIComponent(
      selectedItem.id
    )}`;

    QRCode.toDataURL(qrPayload, {
      width: 220,
      margin: 1,
    })
      .then((dataUrl) => setDetailsQr(dataUrl))
      .catch(() => setDetailsQr(''));
  }, [selectedItem]);

  useEffect(() => {
    if (!session) {
      setIsLoading(false);
      setInventory([]);
      return;
    }

    let isMounted = true;

    const loadInventory = async () => {
      try {
        const data = await fetchInventory(session);
        if (!isMounted) return;
        setInventory(data);
        setApiError('');
      } catch {
        if (!isMounted) return;
        setApiError('API unavailable. Check server and MongoDB connection.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadInventory();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    updateItemIdInUrl(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) return;
    if (!pendingItemId) return;
    if (!inventory.length) return;

    const targetExists = inventory.some((item) => item.id === pendingItemId);
    if (!targetExists) return;

    setSelectedId(pendingItemId);
    setPendingItemId('');
  }, [inventory, pendingItemId, selectedId]);

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

  const filteredInventory = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const filtered = inventory.filter((item) => {
      const matchesSearch =
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
      if (sortBy === 'price') return Number(b.price || 0) - Number(a.price || 0);
      if (sortBy === 'year') return Number(b.year || 0) - Number(a.year || 0);
      return a.title.localeCompare(b.title);
    });
  }, [inventory, search, statusFilter, placeFilter, categoryFilter, sortBy]);

  const totalValue = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [inventory]
  );

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

  const handleSubmit = async (form) => {
    if (editingItem) {
      try {
        const response = await fetch(`${API_BASE}/artworks/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!response.ok) {
          throw new Error('Failed to update artwork');
        }
        const updatedItem = normalizeArtwork(await response.json());
        setInventory((previous) => previous.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
        setEditingId('');
        setIsFormOpen(false);
        if (returnDetailsId) {
          setSelectedId(returnDetailsId);
          setReturnDetailsId('');
        }
        setApiError('');
      } catch {
        setApiError('Failed to update item. Please try again.');
      }
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/artworks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        throw new Error('Failed to create artwork');
      }
      const createdItem = normalizeArtwork(await response.json());
      setInventory((previous) => [createdItem, ...previous]);
      setIsFormOpen(false);
      setApiError('');
    } catch {
      setApiError('Failed to add item. Please try again.');
    }
  };

  const handleAddNew = () => {
    setEditingId('');
    setIsFormOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleEdit = (id) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setEditingId('');
    setIsFormOpen(false);
    if (returnDetailsId) {
      setSelectedId(returnDetailsId);
      setReturnDetailsId('');
    }
  };

  const handleDelete = async (id) => {
    const target = inventory.find((item) => item.id === id);
    const label = target ? `"${target.title}" by ${target.artist}` : 'this painting';
    const confirmMessage = `Delete ${label}? This will mark the item as inactive.`;
    const shouldDelete = window.confirm(confirmMessage);
    if (!shouldDelete) return;

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
    }
  };

  const handlePermanentDelete = async (id) => {
    const target = inventory.find((item) => item.id === id);
    const label = target ? `"${target.title}" by ${target.artist}` : 'this painting';
    const shouldDelete = window.confirm(`Permanently delete ${label}? This action cannot be undone.`);
    if (!shouldDelete) return;

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
    }
  };

  const handleActivate = async (id) => {
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
      if (selectedId === id) {
        setSelectedId(updated.id);
      }
      setApiError('');
    } catch {
      setApiError('Failed to activate item. Please try again.');
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
    sortBy !== 'title';

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setPlaceFilter('All');
    setCategoryFilter('All');
    setSortBy('title');
  };

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

  const handleOpenImageViewer = (id) => {
    setViewerId(id);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setIsImageViewerOpen(true);
  };

  const handleCloseImageViewer = () => {
    setIsImageViewerOpen(false);
    setViewerId('');
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    isPanningRef.current = false;
  };

  const zoomInImage = () => {
    setImageZoom((prev) => Math.min(prev + 0.25, 4));
  };

  const zoomOutImage = () => {
    setImageZoom((prev) => {
      const next = Math.max(prev - 0.25, 1);
      if (next === 1) {
        setImagePan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const resetImageView = () => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
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

    const safeTitle = String(selectedItem.title || 'Untitled Item')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const safeId = String(selectedItem.id || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

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
            <p><strong>Item ID:</strong> ${safeId}</p>
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

  const handleImagePointerDown = (event) => {
    if (imageZoom <= 1) return;
    isPanningRef.current = true;
    panStartRef.current = { x: event.clientX, y: event.clientY };
    panOriginRef.current = { ...imagePan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleImagePointerMove = (event) => {
    if (!isPanningRef.current || imageZoom <= 1) return;
    const deltaX = event.clientX - panStartRef.current.x;
    const deltaY = event.clientY - panStartRef.current.y;
    setImagePan({
      x: panOriginRef.current.x + deltaX,
      y: panOriginRef.current.y + deltaY,
    });
  };

  const handleImagePointerUp = (event) => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const stopQrScanner = () => {
    if (scannerTimerRef.current) {
      clearInterval(scannerTimerRef.current);
      scannerTimerRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
    isScannerBusyRef.current = false;
  };

  const closeQrScanner = () => {
    setIsQrScannerOpen(false);
    setQrScanError('');
    setIsQrPhotoScanning(false);
    stopQrScanner();
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
    updateItemIdInUrl(itemId);
    setIsMobileMenuOpen(false);
    setIsQrScannerOpen(false);
    stopQrScanner();
    setApiError('');
  };

  const scanQrFromImageFile = async (file) => {
    if (!file) return;
    setIsQrPhotoScanning(true);
    setQrScanError('');
    try {
      const bitmap = await createImageBitmap(file);

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
      baseCanvas.width = bitmap.width;
      baseCanvas.height = bitmap.height;
      const baseContext = baseCanvas.getContext('2d');
      if (!baseContext) throw new Error('Canvas unavailable');
      baseContext.drawImage(bitmap, 0, 0);

      let decodedValue = detectFromCanvas(baseCanvas);

      if (!decodedValue) {
        // Fallback for images with orientation issues: try rotated pass.
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = bitmap.height;
        rotatedCanvas.height = bitmap.width;
        const rotatedContext = rotatedCanvas.getContext('2d');
        if (rotatedContext) {
          rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
          rotatedContext.rotate(Math.PI / 2);
          rotatedContext.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
          decodedValue = detectFromCanvas(rotatedCanvas);
        }
      }

      if (!decodedValue) {
        setQrScanError('No QR code found in image. Please try a clearer/closer photo.');
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
      if (!('BarcodeDetector' in window)) {
        setQrScanError('Live QR scanning is not supported on this browser. Use camera photo scan below.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });
        scannerStreamRef.current = stream;
        const videoElement = scannerVideoRef.current;
        if (!videoElement) return;
        videoElement.srcObject = stream;
        await videoElement.play();

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scannerTimerRef.current = setInterval(async () => {
          if (isScannerBusyRef.current || !scannerVideoRef.current) return;
          if (scannerVideoRef.current.readyState < 2) return;
          isScannerBusyRef.current = true;
          try {
            const codes = await detector.detect(scannerVideoRef.current);
            if (codes.length > 0 && codes[0]?.rawValue) {
              handleScannedQr(codes[0].rawValue);
            }
          } catch {
            // Keep trying silently while stream is active.
          } finally {
            isScannerBusyRef.current = false;
          }
        }, 300);
      } catch {
        setQrScanError('Unable to access camera. Please allow camera permission.');
      }
    };

    startScanner();

    return () => {
      stopQrScanner();
    };
  }, [isQrScannerOpen]);

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="container">
      <header>
        <div className="header-row stacked-mobile">
          <h1>Art and Painting Inventory</h1>
          <div className="actions desktop-nav-actions">
            <button
              type="button"
              className={currentPage === 'inventory' ? '' : 'ghost'}
              onClick={() => setCurrentPage('inventory')}
            >
              Inventory
            </button>
            {canOpenAdminPage ? (
              <button
                type="button"
                className={currentPage === 'admin' ? '' : 'ghost'}
                onClick={() => {
                  setCurrentPage('admin');
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
          <div className="mobile-menu-container">
            <button
              type="button"
              className="hamburger-btn"
              aria-label="Open menu"
              onClick={() => setIsMobileMenuOpen((previous) => !previous)}
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
            {isMobileMenuOpen ? (
              <div className="mobile-menu-panel">
                <button
                  type="button"
                  className={currentPage === 'inventory' ? '' : 'ghost'}
                  onClick={() => {
                    setCurrentPage('inventory');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  Inventory
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setQrScanError('');
                    setIsQrScannerOpen(true);
                  }}
                >
                  Scan QR Code
                </button>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage('inventory');
                      handleAddNew();
                    }}
                  >
                    Add New Item
                  </button>
                ) : null}
                {canOpenAdminPage ? (
                  <button
                    type="button"
                    className={currentPage === 'admin' ? '' : 'ghost'}
                    onClick={() => {
                      setCurrentPage('admin');
                      setIsMobileMenuOpen(false);
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
            ) : null}
          </div>
        </div>
        <p>Manage your collection, track status, and keep all details in one place.</p>
        <p className="muted">
          Logged in as: <strong>{session.role}</strong> ({session.email})
        </p>
        {isLoading ? <p className="muted">Loading inventory...</p> : null}
        {apiError ? <p className="form-error">{apiError}</p> : null}
      </header>

      {currentPage === 'inventory' ? (
        <>
      <section className="stats-row">
        <button
          type="button"
          className="panel stat stat-button"
          onClick={() => {
            setIsTotalsOpen(true);
            setIsSculptureTotalsOpen(false);
          }}
        >
          <span>Total Painting</span>
          <strong>{totalPaintingCount.toLocaleString()}</strong>
          <small className="stat-subvalue">Est. {formatPhp(totalPaintingValue)}</small>
        </button>
        <button
          type="button"
          className="panel stat stat-button"
          onClick={() => {
            setIsSculptureTotalsOpen(true);
            setIsTotalsOpen(false);
          }}
        >
          <span>Sculpture</span>
          <strong>{totalSculptureCount.toLocaleString()}</strong>
          <small className="stat-subvalue">Est. {formatPhp(totalSculptureValue)}</small>
        </button>
        <article className="panel stat">
          <span>Estimated Value</span>
          <strong>{formatPhp(totalValue)}</strong>
        </article>
      </section>

      <section className="panel controls">
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
            placeholder="Search by title, artist, category, medium, place"
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
            <option value="Painting">Painting</option>
            <option value="Sculpture">Sculpture</option>
            <option value="Digital">Digital</option>
            <option value="Unassigned">Unassigned</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="title">Sort: Title</option>
            <option value="year">Sort: Year</option>
            <option value="price">Sort: Price</option>
          </select>
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
        </div>
        <div className="card-grid">
          {filteredInventory.length === 0 ? <p>No paintings match your filters.</p> : null}
          {filteredInventory.map((item) => (
            <article
              className={`card ${displayMode === 'image' ? 'picture-only' : ''} ${item.isActive ? '' : 'inactive-card'}`}
              key={item.id}
            >
              <button type="button" className="card-media-btn" onClick={() => handleOpenImageViewer(item.id)}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} />
                ) : (
                  <div className="placeholder">No Image</div>
                )}
              </button>
              {!item.isActive ? <span className="inactive-badge">Inactive</span> : null}
              {displayMode === 'image' ? (
                <button type="button" className="picture-title-btn" onClick={() => setSelectedId(item.id)}>
                  {item.title}
                </button>
              ) : null}
              {displayMode === 'details' ? (
                <div className="card-body">
                  <h3>
                    <button type="button" className="title-btn" onClick={() => setSelectedId(item.id)}>
                      {item.title}
                    </button>
                  </h3>
                  <p className="muted">{item.artist}</p>
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
              <div className="actions card-actions">
                {canManage ? (
                  <>
                    {item.isActive ? (
                      <>
                        <button type="button" onClick={() => handleEdit(item.id)}>
                          Edit
                        </button>
                        <button type="button" className="danger" onClick={() => handleDelete(item.id)}>
                          Delete
                        </button>
                      </>
                    ) : null}
                    {session?.role === 'super admin' && !item.isActive ? (
                      <>
                        <button type="button" onClick={() => handleActivate(item.id)}>
                          Activate
                        </button>
                        <button type="button" className="danger" onClick={() => handlePermanentDelete(item.id)}>
                          Delete Permanently
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={handleCloseForm} aria-label="Close">
              ×
            </button>
            <InventoryForm onSubmit={handleSubmit} editingItem={editingItem} onCancel={handleCloseForm} />
          </section>
        </div>
      ) : null}

      {isTotalsOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal totals-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setIsTotalsOpen(false)} aria-label="Close">
              ×
            </button>
            <h2>Total Painting By Location</h2>
            <p className="totals-subtitle">Total painting inventory: {formatPaintingCount(paintingOnlyItems.length)}</p>
            <p className="totals-subtitle">Estimated value: {formatPhp(totalPaintingValue)}</p>
            <article className="totals-group">
              <h3>By Location</h3>
              {paintingOnlyByPlace.map(([name, count]) => (
                <button
                  type="button"
                  className="totals-row totals-row-button"
                  key={`place-${name}`}
                  onClick={() => handleLocationFilter(name, 'Painting')}
                >
                  <span>{name}</span>
                  <strong>{formatPaintingCount(count)}</strong>
                </button>
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
            <p className="totals-subtitle">Total sculpture inventory: {formatSculptureCount(sculptureOnlyItems.length)}</p>
            <p className="totals-subtitle">Estimated value: {formatPhp(totalSculptureValue)}</p>
            <article className="totals-group">
              <h3>By Location</h3>
              {sculptureOnlyByPlace.map(([name, count]) => (
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

      {selectedItem ? (
        <div className="modal-backdrop">
          <section className="panel modal details-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setSelectedId('')} aria-label="Close">
              ×
            </button>
            <h2>{selectedItem.title}</h2>
            <p className="totals-subtitle">{selectedItem.artist}</p>
            {selectedItem.imageUrl ? (
              <button type="button" className="details-image-btn" onClick={() => handleOpenImageViewer(selectedItem.id)}>
                <img className="details-image" src={selectedItem.imageUrl} alt={selectedItem.title} />
              </button>
            ) : (
              <div className="details-image placeholder">No Image</div>
            )}
            <div className="details-main">
              <div className="details-grid">
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
                <p>
                  <strong>Price:</strong> {formatPhp(selectedItem.price)}
                </p>
                <p>
                  <strong>Notes:</strong> {selectedItem.notes || 'None'}
                </p>
              </div>
              <div className="qr-block">
                <h3>QR Code</h3>
                {detailsQr ? (
                  <img src={detailsQr} alt={`QR code for ${selectedItem.title}`} className="qr-image" />
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
            <div className="actions">
              {canManage ? (
                <>
                  {selectedItem.isActive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setReturnDetailsId(selectedItem.id);
                          setEditingId(selectedItem.id);
                          setIsFormOpen(true);
                          setSelectedId('');
                        }}
                      >
                        Edit
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
              <button type="button" className="ghost" onClick={() => setSelectedId('')}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isImageViewerOpen && viewerItem?.imageUrl ? (
        <div className="modal-backdrop">
          <section className="panel modal image-viewer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="image-viewer-actions">
              <button type="button" onClick={zoomInImage} aria-label="Zoom in" title="Zoom in">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M11 5v12M5 11h12M16.2 16.2 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button type="button" onClick={zoomOutImage} aria-label="Zoom out" title="Zoom out">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M5 11h12M16.2 16.2 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button type="button" className="ghost" onClick={resetImageView}>
                Reset
              </button>
              <button type="button" className="danger" onClick={handleCloseImageViewer}>
                Close
              </button>
            </div>
            <div
              className={`image-viewer-canvas ${imageZoom > 1 ? 'is-pannable' : ''}`}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
            >
              <img
                src={viewerItem.imageUrl}
                alt={viewerItem.title}
                style={{ transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})` }}
                className="image-viewer-image"
              />
            </div>
          </section>
        </div>
      ) : null}

      {isQrScannerOpen ? (
        <div className="modal-backdrop">
          <section className="panel modal qr-scanner-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Scan QR Code</h2>
            <p className="muted">Point your camera to an inventory QR code.</p>
            <video ref={scannerVideoRef} className="qr-scanner-video" playsInline muted autoPlay />
            {qrScanError ? <p className="form-error">{qrScanError}</p> : null}
            <input
              ref={qrPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="qr-photo-input"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                await scanQrFromImageFile(file);
                event.target.value = '';
              }}
            />
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => qrPhotoInputRef.current?.click()}
                disabled={isQrPhotoScanning}
              >
                {isQrPhotoScanning ? 'Scanning Photo...' : 'Scan From Camera Photo'}
              </button>
              <button type="button" className="ghost" onClick={closeQrScanner}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
        </>
      ) : null}

      {currentPage === 'admin' && canOpenAdminPage ? (
        <section className="controls">
          <article className="panel controls">
            <div className="heading-row">
              <h2>User Management</h2>
              <button type="button" onClick={openAddUserModal}>
                Add User
              </button>
            </div>
            {isUsersLoading ? <p className="muted">Loading users...</p> : null}
            <div className="user-list">
              {users.length === 0 ? <p>No users found.</p> : null}
              {users.map((user) => (
                <article className="user-item" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <p className="muted">{user.email}</p>
                    <p>
                      <strong>Role:</strong> {user.role}
                    </p>
                    <p>
                      <strong>Status:</strong> {user.status}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => openEditUserModal(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="panel controls">
            <div className="heading-row">
              <h2>Audit Logs</h2>
              <div className="actions">
                <select
                  value={auditActionFilter}
                  onChange={(event) => {
                    const nextAction = event.target.value;
                    setAuditActionFilter(nextAction);
                    fetchAuditLogs(nextAction);
                  }}
                >
                  <option value="all">All Actions</option>
                  <option value="user.login">User Login</option>
                  <option value="inventory.deactivate">Inventory Deactivate</option>
                  <option value="inventory.activate">Inventory Activate</option>
                  <option value="inventory.delete_permanent">Inventory Permanent Delete</option>
                </select>
                <button type="button" className="ghost" onClick={() => fetchAuditLogs(auditActionFilter)}>
                  Refresh
                </button>
                <button type="button" onClick={handleExportAuditCsv} disabled={auditLogs.length === 0}>
                  Export CSV
                </button>
              </div>
            </div>
            {isAuditLoading ? <p className="muted">Loading audit logs...</p> : null}
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log._id}>
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td>{log.action || 'N/A'}</td>
                        <td>{log.actor?.email || log.actor?.id || 'N/A'}</td>
                        <td>{log.target?.label || log.target?.id || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {isUserModalOpen ? (
        <UserFormModal editingUser={editingUser} onSubmit={handleSubmitUser} onCancel={closeUserModal} />
      ) : null}
    </main>
  );
}

export default App;
