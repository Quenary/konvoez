export async function replaceStream(
  stream: MediaStream,
  rtc: RTCPeerConnection,
  trackKind: string = 'audio',
): Promise<void> {
  const newTrack = stream.getAudioTracks()[0];

  if (!newTrack) {
    throw new Error('No track in provided stream');
  }

  const senders = rtc.getSenders().filter((s) => s.track?.kind === trackKind);

  if (!senders.length) {
    rtc.addTrack(newTrack, new MediaStream([newTrack]));
    return;
  }

  for (const sender of senders) {
    const oldTrack = sender.track;

    if (oldTrack === newTrack) continue;

    await sender.replaceTrack(newTrack);

    if (oldTrack) {
      oldTrack.stop();
    }
  }
}
