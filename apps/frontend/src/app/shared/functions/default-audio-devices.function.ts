/**
 * Pick default audio input from a preferred device id (e.g. active stream track),
 * falling back to the browser "default" device or the first listed input.
 */
export const pickDefaultAudioInput = (
  devices: MediaDeviceInfo[],
  preferredDeviceId: string | null = null,
): MediaDeviceInfo | null => {
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  if (!inputs.length) {
    return null;
  }

  if (preferredDeviceId) {
    const fromPreferred = inputs.find((d) => d.deviceId === preferredDeviceId);
    if (fromPreferred) {
      return fromPreferred;
    }
  }

  return inputs.find((d) => d.deviceId === 'default') ?? inputs[0] ?? null;
};

/**
 * Pick default audio output: browser "default" device or the first listed output.
 */
export const pickDefaultAudioOutput = (
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | null => {
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  if (!outputs.length) {
    return null;
  }

  return outputs.find((d) => d.deviceId === 'default') ?? outputs[0] ?? null;
};
