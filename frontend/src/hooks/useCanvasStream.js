import { useEffect, useRef } from 'react';
import { WS_URL } from '../config';
import { decodeMediaPacket } from '../utils/stream';

function useCanvasStream(cameraId) {
  const canvasRef = useRef(null);
  const backBufferRef = useRef(null);

  useEffect(() => {
    if (!cameraId) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      return undefined;
    }

    let disposed = false;
    let decodeScheduled = false;
    let latestPacket = null;
    let timeoutId = null;

    const ws = new WebSocket(`${WS_URL}/stream/${cameraId}/`);
    ws.binaryType = 'arraybuffer';

    const scheduleDecode = (callback) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (document.hidden) {
        timeoutId = setTimeout(callback, 0);
      } else {
        queueMicrotask(callback);
      }
    };

    const paintLatest = async () => {
      decodeScheduled = false;

      if (disposed || !latestPacket) {
        return;
      }

      const packetBuffer = latestPacket;
      latestPacket = null;

      const { header, payload } = decodeMediaPacket(packetBuffer);
      if (header.kind !== 'video_patch') {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      if (!backBufferRef.current) {
        backBufferRef.current = document.createElement('canvas');
      }

      const displayContext = canvas.getContext('2d');
      const backBuffer = backBufferRef.current;
      const backContext = backBuffer.getContext('2d');
      if (!displayContext || !backContext) {
        return;
      }

      if (
        canvas.width !== header.canvasWidth ||
        canvas.height !== header.canvasHeight
      ) {
        canvas.width = header.canvasWidth;
        canvas.height = header.canvasHeight;
      }

      if (
        backBuffer.width !== header.canvasWidth ||
        backBuffer.height !== header.canvasHeight
      ) {
        backBuffer.width = header.canvasWidth;
        backBuffer.height = header.canvasHeight;
      }

      if (header.frameType === 'key') {
        backContext.clearRect(0, 0, backBuffer.width, backBuffer.height);
      }

      const blob = new Blob([payload], { type: header.mimeType });
      const bitmap = await createImageBitmap(blob);
      backContext.drawImage(bitmap, header.x, header.y, header.width, header.height);
      bitmap.close();
      displayContext.drawImage(backBuffer, 0, 0);

      if (latestPacket) {
        decodeScheduled = true;
        scheduleDecode(() => {
          paintLatest().catch(() => {});
        });
      }
    };

    ws.onmessage = (event) => {
      latestPacket = event.data;
      if (!decodeScheduled) {
        decodeScheduled = true;
        scheduleDecode(() => {
          paintLatest().catch(() => {});
        });
      }
    };

    const handleVisibilityChange = () => {
      if (latestPacket && !decodeScheduled) {
        decodeScheduled = true;
        scheduleDecode(() => {
          paintLatest().catch(() => {});
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      latestPacket = null;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws.close();
    };
  }, [cameraId]);

  return canvasRef;
}

export default useCanvasStream;
