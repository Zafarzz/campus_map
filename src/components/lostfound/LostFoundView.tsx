import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../../state/AuthContext';
import {
  claimLostFoundItem,
  createLostFoundItem,
  listClaimsForItem,
  listLostFoundItems,
  listMyClaims,
  resolveLostFoundClaim,
} from '../../services/lostfound/lostFoundService';
import type {
  CreateLostFoundPayload,
  LostFoundClaim,
  LostFoundItem,
  LostFoundKind,
} from '../../services/lostfound/lostFoundTypes';
import {
  PackageIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  AlertIcon,
  PlusIcon,
  CloseIcon,
  CampusIcon,
  ShieldIcon,
  UserIcon,
  PhoneIcon,
  TelegramIcon,
  CameraIcon,
} from '../auth/AuthIcons';
import { AuthRequiredCard } from '../ui/AuthRequiredCard';

interface LostFoundViewProps {
  onBackToMap?: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'electronics', label: 'Electronics & Audio' },
  { id: 'keys', label: 'Keys & Lanyards' },
  { id: 'cards', label: 'Student IDs & Wallets' },
  { id: 'clothing', label: 'Bags & Clothing' },
  { id: 'books', label: 'Books & Supplies' },
  { id: 'other', label: 'Other Items' },
];

const BUILDINGS: Record<string, string> = {
  'bld-h': 'Block A (Engineering & Tech)',
  'bld-g': 'Block B (Architecture & Science)',
  'bld-i': 'Block C (Amphitheater & Cafeteria)',
  'bld-c': 'Block D (Civil Eng Labs)',
  'bld-b': 'Block E (Architecture & Design)',
  'bld-d': 'Block F (Library & Lecture Halls)',
  'bld-f': 'Block F (Library & Lecture Halls)',
  'bld-e': 'Sports Complex & Gymnasium',
  'bld-j': 'Dormitory Housing',
  'bld-a': 'North Building',
  'campus-grounds': 'Campus Grounds / Outdoor',
};

const REPORT_BUILDING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'bld-h', label: 'Block A (Eng & Tech)' },
  { id: 'bld-g', label: 'Block B (Arch & Science)' },
  { id: 'bld-i', label: 'Block C (Amphitheater & Cafeteria)' },
  { id: 'bld-c', label: 'Block D (Civil Eng Labs)' },
  { id: 'bld-b', label: 'Block E (Architecture & Design)' },
  { id: 'bld-d', label: 'Block F (Library & Lecture Halls)' },
  { id: 'bld-e', label: 'Sports Complex & Gymnasium' },
  { id: 'bld-j', label: 'Dormitory Housing' },
  { id: 'campus-grounds', label: 'Campus Grounds / Outdoor' },
];

function formatTimeAgo(isoStr: string): string {
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffHours = Math.floor(diffMs / 3600_000);
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

function parseContact(contact?: string | null): {
  type: 'telegram' | 'phone' | 'text';
  display: string;
  url?: string;
} | null {
  if (!contact || !contact.trim()) return null;
  const trimmed = contact.trim();
  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1);
    return {
      type: 'telegram',
      display: trimmed,
      url: `https://t.me/${handle}`,
    };
  }
  if (trimmed.toLowerCase().includes('t.me/')) {
    const handle = trimmed.split('t.me/')[1]?.split(/[\s/?#]/)[0] || '';
    return {
      type: 'telegram',
      display: `@${handle}`,
      url: `https://t.me/${handle}`,
    };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 7 && (trimmed.startsWith('+') || /^\d/.test(trimmed))) {
    return {
      type: 'phone',
      display: trimmed,
      url: `tel:${trimmed.replace(/\s+/g, '')}`,
    };
  }
  return {
    type: 'text',
    display: trimmed,
  };
}

function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file (JPEG, PNG, WebP)'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const result = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image'));
      img.onload = () => {
        const MAX_DIM = 960;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export function LostFoundView({ onBackToMap }: LostFoundViewProps) {
  const { isAuthenticated, token } = useAuth();

  const [filterKind, setFilterKind] = useState<'all' | 'found' | 'lost' | 'my_items'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [myClaims, setMyClaims] = useState<LostFoundClaim[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Report Modal state
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [reportKind, setReportKind] = useState<LostFoundKind>('found');
  const [reportCategory, setReportCategory] = useState<string>('electronics');
  const [reportTitle, setReportTitle] = useState<string>('');
  const [reportDescription, setReportDescription] = useState<string>('');
  const [reportContact, setReportContact] = useState<string>('');
  const [reportPhotoBase64, setReportPhotoBase64] = useState<string | null>(null);
  const [reportPhotoName, setReportPhotoName] = useState<string | null>(null);
  const [reportBuilding, setReportBuilding] = useState<string>('bld-h');
  const [reportHandover, setReportHandover] = useState<string>('Security desk at main entrance');
  const [reportQuestion, setReportQuestion] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // Lightbox Preview Modal state
  const [previewModalImage, setPreviewModalImage] = useState<{ url: string; title: string } | null>(null);

  // Claim Modal state
  const [claimingItem, setClaimingItem] = useState<LostFoundItem | null>(null);
  const [claimAnswer, setClaimAnswer] = useState<string>('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState<boolean>(false);

  // Manage Claims on My Item state
  const [viewingClaimsItem, setViewingClaimsItem] = useState<LostFoundItem | null>(null);
  const [itemClaims, setItemClaims] = useState<LostFoundClaim[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState<boolean>(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await processImageFile(file);
      setReportPhotoBase64(b64);
      setReportPhotoName(file.name);
      setFeedbackError(null);
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to process image');
    }
  };

  const handleCloseReport = () => {
    setIsReportOpen(false);
    setReportTitle('');
    setReportDescription('');
    setReportContact('');
    setReportPhotoBase64(null);
    setReportPhotoName(null);
    setReportQuestion('');
  };

  const refreshItems = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const [fetchedItems, userClaims] = await Promise.all([
        listLostFoundItems(token, {
          kind: filterKind === 'found' || filterKind === 'lost' ? filterKind : undefined,
          category: selectedCategory === 'all' ? undefined : selectedCategory,
        }),
        listMyClaims(token),
      ]);
      setItems(fetchedItems);
      setMyClaims(userClaims);
    } catch (err: unknown) {
      console.warn('Failed to load lost/found items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token, filterKind, selectedCategory]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  const displayedItems = useMemo(() => {
    return items.filter((item) => {
      if (filterKind === 'my_items') return item.is_mine;
      if (filterKind === 'found') return item.kind === 'found';
      if (filterKind === 'lost') return item.kind === 'lost';
      return true;
    });
  }, [items, filterKind]);

  if (!isAuthenticated) {
    return (
      <AuthRequiredCard
        title="Campus Lost & Found Portal"
        subtitle="Secure community recovery for students & staff"
        description="Report lost belongings, claim items handed over to university security, and verify ownership through secret security questions."
        onBackToMap={onBackToMap}
      />
    );
  }

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim()) return;

    setIsSubmittingReport(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const payload: CreateLostFoundPayload = {
        kind: reportKind,
        category: reportCategory,
        title: reportTitle.trim(),
        description: reportDescription.trim() || undefined,
        contact_info: reportContact.trim() || undefined,
        photo_base64: reportPhotoBase64 || undefined,
        building_id: reportBuilding === 'campus-grounds' ? undefined : reportBuilding,
        handover_point: reportHandover.trim() || undefined,
        verification_question: reportQuestion.trim() || undefined,
      };

      await createLostFoundItem(token, payload);
      setFeedbackSuccess(
        reportKind === 'found'
          ? 'Found item reported! Other students can now safely search and claim.'
          : 'Lost report submitted! You will be notified when a match is found.',
      );
      setIsReportOpen(false);
      setReportTitle('');
      setReportDescription('');
      setReportContact('');
      setReportPhotoBase64(null);
      setReportPhotoName(null);
      setReportQuestion('');
      await refreshItems();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleOpenClaimModal = (item: LostFoundItem) => {
    setClaimingItem(item);
    setClaimAnswer('');
    setFeedbackError(null);
    setFeedbackSuccess(null);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimingItem || !claimAnswer.trim()) return;

    setIsSubmittingClaim(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      await claimLostFoundItem(token, claimingItem.id, {
        verification_answer: claimAnswer.trim(),
      });
      setFeedbackSuccess(
        'Claim verification answer submitted! The finder will review and arrange handover.',
      );
      setClaimingItem(null);
      await refreshItems();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to submit claim');
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  const handleOpenItemClaims = async (item: LostFoundItem) => {
    setViewingClaimsItem(item);
    setIsLoadingClaims(true);
    try {
      const claims = await listClaimsForItem(token, item.id);
      setItemClaims(claims);
    } catch (err: unknown) {
      console.warn('Failed to fetch item claims:', err);
    } finally {
      setIsLoadingClaims(false);
    }
  };

  const handleResolveClaim = async (claimId: string, approve: boolean) => {
    if (!viewingClaimsItem) return;
    try {
      await resolveLostFoundClaim(token, claimId, {
        approve,
        handover_point: viewingClaimsItem.handover_point || 'Main Security Desk',
        mark_returned: approve,
      });
      setFeedbackSuccess(approve ? 'Claim approved! Item marked as returned.' : 'Claim rejected.');
      setViewingClaimsItem(null);
      await refreshItems();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to resolve claim');
    }
  };

  return (
    <div className="lostfound-view" role="region" aria-label="Campus Lost and Found">
      {/* Top Header & Actions */}
      <div className="lostfound-view__header">
        <div className="lostfound-view__tabs" role="tablist">
          <button
            type="button"
            className={`lostfound-view__tab-btn${filterKind === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilterKind('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`lostfound-view__tab-btn${filterKind === 'found' ? ' is-active' : ''}`}
            onClick={() => setFilterKind('found')}
          >
            Found Items
          </button>
          <button
            type="button"
            className={`lostfound-view__tab-btn${filterKind === 'lost' ? ' is-active' : ''}`}
            onClick={() => setFilterKind('lost')}
          >
            Lost Items
          </button>
          <button
            type="button"
            className={`lostfound-view__tab-btn${filterKind === 'my_items' ? ' is-active' : ''}`}
            onClick={() => setFilterKind('my_items')}
          >
            My Reports
          </button>
        </div>

        <button
          type="button"
          className="lostfound-view__report-btn"
          onClick={() => setIsReportOpen(true)}
          title="Report an item you found or lost"
        >
          <PlusIcon size={14} />
          <span>Report Item</span>
        </button>
      </div>

      {/* Notifications */}
      {feedbackSuccess && (
        <div className="lostfound-view__banner lostfound-view__banner--success" role="status">
          <CheckIcon size={16} />
          <span>{feedbackSuccess}</span>
          <button
            type="button"
            className="lostfound-view__banner-close"
            onClick={() => setFeedbackSuccess(null)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="lostfound-view__banner lostfound-view__banner--error" role="alert">
          <AlertIcon size={16} />
          <span>{feedbackError}</span>
          <button
            type="button"
            className="lostfound-view__banner-close"
            onClick={() => setFeedbackError(null)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Category Pills */}
      <div className="lostfound-view__filter-bar">
        <div className="lostfound-view__category-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`lostfound-view__chip${selectedCategory === cat.id ? ' is-active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      <div className="lostfound-view__content">
        {isLoading ? (
          <div className="lostfound-view__loading">
            <span className="scene-loader-pill__spinner" />
            <span>Scanning campus registry...</span>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="lostfound-view__empty">
            <PackageIcon size={28} />
            <p>No reports found in this category.</p>
            <button
              type="button"
              className="lostfound-view__empty-btn"
              onClick={() => setIsReportOpen(true)}
            >
              Report a Lost or Found Item
            </button>
          </div>
        ) : (
          <div className="lostfound-view__list">
            {displayedItems.map((item) => {
              const isFound = item.kind === 'found';
              const isMine = item.is_mine;
              const hasClaimed = myClaims.some((c) => c.item_id === item.id);

              return (
                <div key={item.id} className="lf-card">
                  <div className="lf-card__top">
                    <span
                      className={`lf-card__kind-badge lf-card__kind-badge--${
                        isFound ? 'found' : 'lost'
                      }`}
                    >
                      {isFound ? 'FOUND' : 'LOST'}
                    </span>
                    <span className="lf-card__category">{item.category}</span>
                    <span className="lf-card__time">{formatTimeAgo(item.occurred_at)}</span>
                  </div>

                  <h3 className="lf-card__title">{item.title}</h3>
                  {item.description && <p className="lf-card__desc">{item.description}</p>}

                  {item.photo_url && (
                    <div
                      className="lf-card__photo-box"
                      onClick={() => setPreviewModalImage({ url: item.photo_url!, title: item.title })}
                      title="Click to view full photo"
                    >
                      <img
                        src={item.photo_url}
                        alt={item.title}
                        className="lf-card__photo-img"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
                        }}
                      />
                      <span className="lf-card__photo-badge">View Photo</span>
                    </div>
                  )}

                  <div className="lf-card__location">
                    <CampusIcon size={14} />
                    <span>
                      {item.building_id
                        ? BUILDINGS[item.building_id] || item.building_id
                        : 'Campus Grounds'}
                    </span>
                  </div>

                  {item.handover_point && (
                    <div className="lf-card__handover">
                      <ShieldIcon size={14} />
                      <span>
                        Handover: <strong>{item.handover_point}</strong>
                      </span>
                    </div>
                  )}

                  {(() => {
                    const parsed = parseContact(item.contact_info);
                    if (!parsed) return null;
                    return (
                      <div className="lf-card__contact">
                        {parsed.type === 'telegram' ? (
                          <a
                            href={parsed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lf-card__contact-link lf-card__contact-link--tg"
                            title="Chat on Telegram"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TelegramIcon size={12} />
                            <span>{parsed.display}</span>
                          </a>
                        ) : parsed.type === 'phone' ? (
                          <a
                            href={parsed.url}
                            className="lf-card__contact-link lf-card__contact-link--phone"
                            title="Call Phone"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <PhoneIcon size={12} />
                            <span>{parsed.display}</span>
                          </a>
                        ) : (
                          <div className="lf-card__contact-badge">
                            <UserIcon size={12} />
                            <span>{parsed.display}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="lf-card__actions">
                    {isFound && !isMine && (
                      <button
                        type="button"
                        disabled={hasClaimed}
                        className={`lf-card__claim-btn${hasClaimed ? ' is-claimed' : ''}`}
                        onClick={() => handleOpenClaimModal(item)}
                      >
                        {hasClaimed ? (
                          <>
                            <CheckIcon size={13} />
                            <span>Claim Submitted</span>
                          </>
                        ) : (
                          <>
                            <UserIcon size={13} />
                            <span>Claim This Item</span>
                          </>
                        )}
                      </button>
                    )}

                    {isMine && isFound && (
                      <button
                        type="button"
                        className="lf-card__manage-btn"
                        onClick={() => handleOpenItemClaims(item)}
                      >
                        <span>Check Claims</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Modal */}
      {isReportOpen && (
        <div className="booking-drawer-backdrop" onClick={handleCloseReport}>
          <div
            className="booking-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-drawer__header">
              <div>
                <h3 id="report-drawer-title" className="booking-drawer__title">
                  Report Lost or Found Item
                </h3>
                <span className="booking-drawer__subtitle">
                  Shared safely with campus security and Ajou students
                </span>
              </div>
              <button
                type="button"
                className="booking-drawer__close-btn"
                onClick={handleCloseReport}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="booking-drawer__form">
              <div className="booking-drawer__field">
                <label>Report Type</label>
                <div className="booking-drawer__kind-toggle">
                  <button
                    type="button"
                    className={`booking-drawer__kind-btn${reportKind === 'found' ? ' is-active' : ''}`}
                    onClick={() => setReportKind('found')}
                  >
                    I Found Something
                  </button>
                  <button
                    type="button"
                    className={`booking-drawer__kind-btn${reportKind === 'lost' ? ' is-active' : ''}`}
                    onClick={() => setReportKind('lost')}
                  >
                    I Lost Something
                  </button>
                </div>
              </div>

              <div className="booking-drawer__field">
                <label htmlFor="report-title">Item Title</label>
                <input
                  id="report-title"
                  type="text"
                  placeholder="e.g. Black AirPods Case, Blue Water Bottle, Calculator"
                  className="booking-drawer__input"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>

              <div className="booking-drawer__field-row">
                <div className="booking-drawer__field">
                  <label htmlFor="report-category">Category</label>
                  <select
                    id="report-category"
                    className="booking-drawer__input"
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                  >
                    <option value="electronics">Electronics & Audio</option>
                    <option value="keys">Keys & Lanyards</option>
                    <option value="cards">Student ID & Cards</option>
                    <option value="clothing">Bags & Clothing</option>
                    <option value="books">Books & Supplies</option>
                    <option value="other">Other Items</option>
                  </select>
                </div>

                <div className="booking-drawer__field">
                  <label htmlFor="report-building">Location / Building</label>
                  <select
                    id="report-building"
                    className="booking-drawer__input"
                    value={reportBuilding}
                    onChange={(e) => setReportBuilding(e.target.value)}
                  >
                    {REPORT_BUILDING_OPTIONS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="booking-drawer__field">
                <label htmlFor="report-desc">Description</label>
                <textarea
                  id="report-desc"
                  rows={2}
                  placeholder="Additional details, room number, or approximate time found..."
                  className="booking-drawer__input"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                />
              </div>

              <div className="booking-drawer__field">
                <label htmlFor="report-contact">Contact Information (Telegram or Phone)</label>
                <input
                  id="report-contact"
                  type="text"
                  placeholder="@username on Telegram or +998 90 123 45 67"
                  className="booking-drawer__input"
                  value={reportContact}
                  onChange={(e) => setReportContact(e.target.value)}
                  maxLength={100}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--pn-muted)', marginTop: '2px' }}>
                  How others can get in touch with you directly
                </span>
              </div>

              <div className="booking-drawer__field">
                <label>Item Photo (Optional)</label>
                <input
                  id="report-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                {!reportPhotoBase64 ? (
                  <label htmlFor="report-photo-input" className="booking-drawer__photo-dropzone">
                    <CameraIcon size={18} />
                    <span>Click to attach photo (JPG, PNG)</span>
                  </label>
                ) : (
                  <div className="booking-drawer__photo-preview">
                    <img
                      src={reportPhotoBase64}
                      alt="Upload preview"
                      className="booking-drawer__photo-thumb"
                    />
                    <div className="booking-drawer__photo-meta">
                      <span className="booking-drawer__photo-name">
                        {reportPhotoName || 'Item Photo'}
                      </span>
                      <span className="booking-drawer__photo-note">Photo attached</span>
                    </div>
                    <button
                      type="button"
                      className="booking-drawer__photo-remove"
                      onClick={() => {
                        setReportPhotoBase64(null);
                        setReportPhotoName(null);
                      }}
                      title="Remove photo"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                )}
              </div>

              {reportKind === 'found' && (
                <>
                  <div className="booking-drawer__field">
                    <label htmlFor="report-handover">Handover Location / Custody</label>
                    <input
                      id="report-handover"
                      type="text"
                      placeholder="e.g. Left at Block A Security Desk"
                      className="booking-drawer__input"
                      value={reportHandover}
                      onChange={(e) => setReportHandover(e.target.value)}
                    />
                  </div>

                  <div className="booking-drawer__field">
                    <label htmlFor="report-question">
                      Secret Verification Question (Protects from False Claims)
                    </label>
                    <input
                      id="report-question"
                      type="text"
                      placeholder="e.g. What sticker is on the back? What is the lockscreen photo?"
                      className="booking-drawer__input"
                      value={reportQuestion}
                      onChange={(e) => setReportQuestion(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="booking-drawer__actions">
                <button
                  type="button"
                  className="booking-drawer__cancel-action"
                  onClick={handleCloseReport}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="booking-drawer__submit-action"
                >
                  {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claim Modal */}
      {claimingItem && (
        <div className="booking-drawer-backdrop" onClick={() => setClaimingItem(null)}>
          <div
            className="booking-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-drawer__header">
              <div>
                <h3 id="claim-drawer-title" className="booking-drawer__title">
                  Claim Item: {claimingItem.title}
                </h3>
                <span className="booking-drawer__subtitle">
                  Answer the verification question to prove ownership
                </span>
              </div>
              <button
                type="button"
                className="booking-drawer__close-btn"
                onClick={() => setClaimingItem(null)}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitClaim} className="booking-drawer__form">
              <div className="booking-drawer__info-box">
                <ShieldIcon size={16} />
                <div>
                  <strong>Finder's Question:</strong>
                  <p style={{ margin: '4px 0 0 0' }}>
                    {claimingItem.verification_question || 'Describe any unique characteristics or serial numbers.'}
                  </p>
                </div>
              </div>

              <div className="booking-drawer__field">
                <label htmlFor="claim-answer">Your Verification Answer</label>
                <textarea
                  id="claim-answer"
                  rows={3}
                  required
                  placeholder="Provide precise details to confirm you are the owner..."
                  className="booking-drawer__input"
                  value={claimAnswer}
                  onChange={(e) => setClaimAnswer(e.target.value)}
                />
              </div>

              <div className="booking-drawer__actions">
                <button
                  type="button"
                  className="booking-drawer__cancel-action"
                  onClick={() => setClaimingItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClaim}
                  className="booking-drawer__submit-action"
                >
                  {isSubmittingClaim ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claims Review Modal (for Finder) */}
      {viewingClaimsItem && (
        <div className="booking-drawer-backdrop" onClick={() => setViewingClaimsItem(null)}>
          <div
            className="booking-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-claims-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-drawer__header">
              <div>
                <h3 id="review-claims-title" className="booking-drawer__title">
                  Claims for: {viewingClaimsItem.title}
                </h3>
                <span className="booking-drawer__subtitle">
                  Verify claimant answers and confirm item return
                </span>
              </div>
              <button
                type="button"
                className="booking-drawer__close-btn"
                onClick={() => setViewingClaimsItem(null)}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="booking-drawer__form">
              {isLoadingClaims ? (
                <div className="lostfound-view__loading">
                  <span className="scene-loader-pill__spinner" />
                  <span>Loading claims...</span>
                </div>
              ) : itemClaims.length === 0 ? (
                <div className="lostfound-view__empty">
                  <InfoIcon size={24} />
                  <p>No claims have been submitted yet.</p>
                </div>
              ) : (
                <div className="lostfound-view__claims-list">
                  {itemClaims.map((claim) => (
                    <div key={claim.id} className="lf-claim-card">
                      <div className="lf-claim-card__status">
                        Status: <strong>{claim.status}</strong>
                      </div>
                      <div className="lf-claim-card__answer">
                        <strong>Claimant Answer:</strong>
                        <p>{claim.verification_answer || 'No answer recorded'}</p>
                      </div>

                      {claim.status === 'pending' && (
                        <div className="lf-claim-card__actions">
                          <button
                            type="button"
                            className="lf-claim-card__btn lf-claim-card__btn--approve"
                            onClick={() => handleResolveClaim(claim.id, true)}
                          >
                            <CheckIcon size={14} />
                            <span>Approve & Return</span>
                          </button>
                          <button
                            type="button"
                            className="lf-claim-card__btn lf-claim-card__btn--reject"
                            onClick={() => handleResolveClaim(claim.id, false)}
                          >
                            <CloseIcon size={14} />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewModalImage && (
        <div className="lf-lightbox-backdrop" onClick={() => setPreviewModalImage(null)}>
          <div className="lf-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lf-lightbox-close"
              onClick={() => setPreviewModalImage(null)}
              title="Close image"
            >
              <CloseIcon size={16} />
            </button>
            <img
              src={previewModalImage.url}
              alt={previewModalImage.title}
              className="lf-lightbox-img"
            />
            <span className="lf-lightbox-caption">{previewModalImage.title}</span>
          </div>
        </div>
      )}
    </div>
  );
}
