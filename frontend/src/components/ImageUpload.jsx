import { useState, useRef, useCallback } from 'react';
import { Camera, FolderOpen, ImageIcon, X, Loader2 } from 'lucide-react';

export default function ImageUpload({ onExtracted, loading, setLoading, token }) {
  const [preview, setPreview]   = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [sizeInfo, setSizeInfo] = useState(null); // { original, compressed }
  const cameraRef = useRef(); // capture="environment" → opens camera directly
  const galleryRef = useRef(); // no capture → opens file picker / gallery

  /* ── Compress image: max 1200px width, JPEG 0.8 quality ── */
  const compressImage = useCallback((dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1200;
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl); // fallback to original
      img.src = dataUrl;
    });
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extract = useCallback(async (dataUrl) => {
    setLoading(true);
    try {
      const res  = await fetch('/api/ocr/extract', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (data.success) onExtracted(data.fields, data.scan_filename || '');
      else alert('Extraction failed: ' + data.error);
    } catch (err) {
      alert('Server error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token, onExtracted, setLoading]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const originalDataUrl = e.target.result;
      const originalSize = originalDataUrl.length;

      // Compress before sending to OCR
      const compressed = await compressImage(originalDataUrl);
      const compressedSize = compressed.length;

      setSizeInfo({
        original: formatSize(Math.round(originalSize * 0.75)), // approximate raw bytes from base64
        compressed: formatSize(Math.round(compressedSize * 0.75)),
        saved: originalSize > compressedSize
          ? `${Math.round((1 - compressedSize / originalSize) * 100)}% smaller`
          : 'no reduction needed',
      });

      setPreview(compressed);
      extract(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const clear = () => {
    setPreview(null);
    setSizeInfo(null);
    cameraRef.current.value  = '';
    galleryRef.current.value = '';
  };

  return (
    <div className="upload-card">
      <h2 className="section-title">
        <ImageIcon size={20} /> Upload Handwritten Waybill
      </h2>

      {/* Hidden inputs */}
      <input ref={cameraRef}  type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files[0])} />

      {!preview ? (
        loading ? (
          <div className="drop-zone">
            <Loader2 size={40} className="spin upload-icon" />
            <p>Scanning & extracting fields…</p>
            <p className="hint">Please wait</p>
          </div>
        ) : (
          <>
            <div
              className={`drop-zone ${dragOver ? 'drag-active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <ImageIcon size={36} className="upload-icon" />
              <p>Drag & drop an image here</p>
              <p className="hint">or choose an option below</p>
            </div>

            <div className="upload-btn-row">
              <button className="upload-choice-btn" onClick={() => cameraRef.current.click()}>
                <Camera size={20} /> Camera
              </button>
              <button className="upload-choice-btn" onClick={() => galleryRef.current.click()}>
                <FolderOpen size={20} /> Gallery / File
              </button>
            </div>
          </>
        )
      ) : (
        <div className="preview-container">
          <button className="clear-btn" onClick={clear}><X size={16} /></button>
          <img src={preview} alt="Uploaded waybill" className="preview-img" />
          {sizeInfo && (
            <div style={{
              position: 'absolute', bottom: loading ? 60 : 8, left: 8, right: 8,
              background: 'rgba(0,0,0,0.6)', color: '#e2e8f0', borderRadius: 6,
              padding: '4px 10px', fontSize: 11, textAlign: 'center',
              pointerEvents: 'none',
            }}>
              {sizeInfo.original} → {sizeInfo.compressed} ({sizeInfo.saved})
            </div>
          )}
          {loading && (
            <div className="preview-overlay">
              <Loader2 size={32} className="spin" />
              <p>Extracting fields…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
