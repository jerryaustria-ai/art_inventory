export default function QrScannerModal({
  qrScanError,
  qrPhotoInputRef,
  scanQrFromImageFile,
  isQrPhotoScanning,
  closeQrScanner,
}) {
  return (
    <div className="modal-backdrop">
      <section className="panel modal qr-scanner-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Scan QR Code</h2>
        <p className="muted">Point your camera to an inventory QR code.</p>
        <div id="qr-reader" className="qr-scanner-reader" />
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
  );
}
