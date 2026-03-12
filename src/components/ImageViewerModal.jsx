export default function ImageViewerModal({
  viewerItem,
  imageZoom,
  imagePan,
  zoomInImage,
  zoomOutImage,
  resetImageView,
  handleCloseImageViewer,
  handleImagePointerDown,
  handleImagePointerMove,
  handleImagePointerUp,
}) {
  if (!viewerItem?.imageUrl) return null;

  return (
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
  );
}
