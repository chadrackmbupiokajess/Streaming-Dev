export const STREAM_CONFIG = {
  width: 640,
  height: 480,
  jpegQuality: 0.78,
  maxBufferedBytes: 200 * 1024,
};

export function toImageBlob(data) {
  if (data instanceof Blob) {
    return data.type ? data : new Blob([data], { type: 'image/jpeg' });
  }
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: 'image/jpeg' });
  }
  return null;
}

/** Affiche uniquement la dernière frame reçue (évite le retard cumulé). */
export function createFrameDisplayHandler(getImgElement, urlRef) {
  let latestData = null;
  let scheduled = false;

  const paint = () => {
    scheduled = false;
    if (!latestData) return;

    const imgElement =
      typeof getImgElement === 'function' ? getImgElement() : getImgElement;
    if (!imgElement) {
      scheduled = true;
      requestAnimationFrame(paint);
      return;
    }

    const data = latestData;
    latestData = null;

    const blob = toImageBlob(data);
    if (!blob) return;

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }
    const url = URL.createObjectURL(blob);
    imgElement.src = url;
    urlRef.current = url;
  };

  return (event) => {
    latestData = event.data;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(paint);
    }
  };
}

export function setImageFromWsEvent(event, imgElement, urlRef) {
  const blob = toImageBlob(event.data);
  if (!blob || !imgElement) return false;

  if (urlRef.current) {
    URL.revokeObjectURL(urlRef.current);
  }

  const url = URL.createObjectURL(blob);
  imgElement.src = url;
  urlRef.current = url;
  return true;
}
