function formatMatchPercent(value) {
  const normalized = Math.max(0, Math.min(1, Number(value || 0)));
  return `${Math.round(normalized * 100)}% match`;
}

function getArtworkTitle(value) {
  return String(value || '').trim() || 'NO NAME';
}

function getArtworkArtist(value) {
  return String(value || '').trim() || 'Artist not set';
}

export default function VisualSearchModal({
  visualSearchError,
  visualSearchPreview,
  visualSearchResults,
  visualSearchInputRef,
  isVisualSearchProcessing,
  handlePickVisualSearchImage,
  handleOpenVisualSearchResult,
  closeVisualSearch,
}) {
  return (
    <div className="modal-backdrop">
      <section className="panel modal visual-search-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Visual Search</h2>
        <p className="muted">Upload a photo of an artwork and we will find the closest visual match from your inventory.</p>
        <input
          ref={visualSearchInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="qr-photo-input"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            await handlePickVisualSearchImage(file);
            event.target.value = '';
          }}
        />
        <div className="actions">
          <button
            type="button"
            className="ghost"
            onClick={() => visualSearchInputRef.current?.click()}
            disabled={isVisualSearchProcessing}
          >
            {isVisualSearchProcessing ? 'Analyzing Image...' : 'Choose Artwork Photo'}
          </button>
          <button type="button" className="ghost" onClick={closeVisualSearch}>
            Close
          </button>
        </div>
        {visualSearchPreview ? (
          <div className="visual-search-preview-block">
            <img src={visualSearchPreview} alt="Selected search artwork" className="visual-search-preview" />
          </div>
        ) : null}
        {visualSearchError ? <p className="form-error">{visualSearchError}</p> : null}
        {visualSearchResults.length ? (
          <div className="visual-search-results">
            {visualSearchResults.map((item) => (
              <button
                type="button"
                key={item.id}
                className="visual-search-result"
                onClick={() => handleOpenVisualSearchResult(item)}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={getArtworkTitle(item.title)} className="visual-search-result-image" />
                ) : (
                  <div className="visual-search-result-image visual-search-result-placeholder">No Image</div>
                )}
                <div className="visual-search-result-copy">
                  <strong>{getArtworkTitle(item.title)}</strong>
                  <span>{getArtworkArtist(item.artist)}</span>
                  <small>{formatMatchPercent(item.similarity)}</small>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
