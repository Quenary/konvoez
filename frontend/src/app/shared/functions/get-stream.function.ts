/**
 * Хелпер для получения стрима с указанного устройства
 * - возвращает стрим с указаного устройства
 * - или возвращает стрим с устройства с похожим именем
 * - или возвращает стрим со стандартного устройства
 * @param device
 * @returns
 */
export async function getStream(device: MediaDeviceInfo | null): Promise<MediaStream> {
  const tryGetStream = async (
    constraints: MediaTrackConstraints | boolean,
  ): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: constraints,
      });
    } catch (err: any) {
      console.warn('getUserMedia failed:', err?.name);
      return null;
    }
  };

  // стандартное
  if (!device) {
    const defaultStream = await tryGetStream(true);
    if (defaultStream) return defaultStream;
    throw new Error('Unable to access default audio device');
  }

  // точное
  const exactStream = await tryGetStream({
    deviceId: { exact: device.deviceId },
  });

  if (exactStream) return exactStream;

  // примерное
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w]+/g, '');
  const targetName = normalize(device.label);
  const fuzzyMatch = audioInputs.find((d) => {
    const name = normalize(d.label);
    return name.includes(targetName) || targetName.includes(name);
  });
  if (fuzzyMatch) {
    const fuzzyStream = await tryGetStream({
      deviceId: { exact: fuzzyMatch.deviceId },
    });

    if (fuzzyStream) return fuzzyStream;
  }

  // стандартное
  const defaultStream = await tryGetStream(true);
  if (defaultStream) return defaultStream;
  throw new Error('Unable to access any audio device');
}
