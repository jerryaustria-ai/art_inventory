export default function ImageViewerModal({
  viewerItem,
  currentImageIndex,
  selectViewerImage,
  showPreviousViewerImage,
  showNextViewerImage,
  handleCloseImageViewer,
}) {
  const imageUrls = Array.isArray(viewerItem?.imageUrls) && viewerItem.imageUrls.length
    ? viewerItem.imageUrls
    : [viewerItem?.imageUrl].filter(Boolean);
  if (!imageUrls.length) return null;
  const viewerTitle = String(viewerItem.title || '').trim() || 'NO NAME';
  const activeImage = imageUrls[currentImageIndex] || imageUrls[0];

  return (
    <div className="modal-backdrop">
      <section className="panel modal image-viewer-modal" onClick={(event) => event.stopPropagation()}>
        <div className="image-viewer-actions">
          <button type="button" className="ghost" onClick={showPreviousViewerImage} disabled={imageUrls.length <= 1}>
            Prev
          </button>
          <span className="image-viewer-counter">
            {currentImageIndex + 1} / {imageUrls.length}
          </span>
          <button type="button" className="ghost" onClick={showNextViewerImage} disabled={imageUrls.length <= 1}>
            Next
          </button>
          <button type="button" className="danger" onClick={handleCloseImageViewer}>
            Close
          </button>
        </div>
        <div className="image-viewer-canvas">
          <button
            type="button"
            className="image-viewer-nav image-viewer-nav-left"
            onClick={showPreviousViewerImage}
            disabled={imageUrls.length <= 1}
            aria-label="Previous image"
          >
            ‹
          </button>
          <img
            src={activeImage}
            alt={viewerTitle}
            className="image-viewer-image"
          />
          <button
            type="button"
            className="image-viewer-nav image-viewer-nav-right"
            onClick={showNextViewerImage}
            disabled={imageUrls.length <= 1}
            aria-label="Next image"
          >
            ›
          </button>
        </div>
        {imageUrls.length > 1 ? (
          <div className="image-viewer-thumbnails">
            {imageUrls.map((imageUrl, index) => (
              <button
                type="button"
                key={`${imageUrl}-${index}`}
                className={`image-viewer-thumb ${index === currentImageIndex ? 'active' : ''}`}
                onClick={() => selectViewerImage(index)}
                aria-label={`Show image ${index + 1}`}
              >
                <img src={imageUrl} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
