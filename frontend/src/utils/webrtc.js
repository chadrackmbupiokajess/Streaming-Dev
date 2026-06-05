import { WEBRTC_ICE_SERVERS, WEBRTC_VIDEO_CONFIG } from '../config';

export function createVideoPeerConnection() {
  return new RTCPeerConnection({
    iceServers: WEBRTC_ICE_SERVERS,
  });
}

export function preferRealtimeCodecs(transceiver) {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  if (!capabilities?.codecs || typeof transceiver.setCodecPreferences !== 'function') {
    return;
  }

  const orderedNames = ['H264', 'VP9', 'VP8'];
  const preferred = [];
  const remaining = [...capabilities.codecs];

  orderedNames.forEach((name) => {
    remaining
      .filter((codec) => codec.mimeType.toUpperCase() === `VIDEO/${name}`)
      .forEach((codec) => preferred.push(codec));
  });

  const rest = remaining.filter((codec) => !preferred.includes(codec));
  if (preferred.length > 0) {
    transceiver.setCodecPreferences([...preferred, ...rest]);
  }
}

export async function tuneVideoSender(sender) {
  if (!sender?.getParameters || !sender?.setParameters) {
    return;
  }

  try {
    const parameters = sender.getParameters();
    parameters.encodings =
      parameters.encodings && parameters.encodings.length > 0
        ? parameters.encodings
        : [{}];
    parameters.encodings[0].maxBitrate = WEBRTC_VIDEO_CONFIG.bitrate;
    parameters.encodings[0].maxFramerate = WEBRTC_VIDEO_CONFIG.frameRate;
    parameters.encodings[0].priority = 'high';
    await sender.setParameters(parameters);
  } catch {
    // Browser support differs; the peer connection still works without tuning.
  }
}
