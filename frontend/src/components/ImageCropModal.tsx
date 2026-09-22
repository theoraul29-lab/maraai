import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import '../styles/ImageCropModal.css';

export interface ImageCropModalProps {
  imageSrc: string;
  /** width / height, e.g. 1 for the circular avatar, 3 for a wide cover banner. */
  aspect: number;
  cropShape: 'round' | 'rect';
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty.'))), 'image/jpeg', 0.92);
  });
}

/**
 * Reusable pan/zoom crop step shown between "pick a file" and "upload it" —
 * profile/cover photo uploads used to save whatever the browser's automatic
 * object-fit:cover center-crop landed on, with no way to choose which part
 * of the source image actually shows. This lets the user position it first,
 * on both mouse (desktop) and touch (mobile) — react-easy-crop handles both
 * input modes itself.
 */
export function ImageCropModal({ imageSrc, aspect, cropShape, onCancel, onSave }: ImageCropModalProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  async function handleSave() {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="image-crop-overlay" role="dialog" aria-modal="true">
      <div className="image-crop-card">
        <h2 className="image-crop-title">{t('imageCrop.title', 'Adjust photo')}</h2>
        <div className="image-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="image-crop-zoom-row">
          <span aria-hidden="true">−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t('imageCrop.zoom', 'Zoom')}
          />
          <span aria-hidden="true">+</span>
        </div>
        <div className="image-crop-actions">
          <button type="button" className="you-fb-btn" onClick={onCancel} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="button" className="you-fb-btn you-fb-btn-primary" onClick={() => void handleSave()} disabled={saving || !croppedArea}>
            {saving ? t('imageCrop.saving', 'Saving…') : t('imageCrop.use', 'Use photo')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropModal;
