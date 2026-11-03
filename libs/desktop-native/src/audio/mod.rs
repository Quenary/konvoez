#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Fixed ring of `f32` samples. One producer thread writes, one consumer thread reads.
/// Neither side allocates. A full ring drops the newest samples; the consumer trims
/// the oldest ones before taking a chunk.
pub struct SampleRing {
    buf: Box<[UnsafeCell<f32>]>,
    mask: usize,
    write: AtomicUsize,
    read: AtomicUsize,
}

// SAFETY: producer and consumer never touch the same slot. The atomics publish
// the indices with Release/Acquire, so each side only reads slots it owns.
unsafe impl Send for SampleRing {}
unsafe impl Sync for SampleRing {}

impl SampleRing {
    pub fn with_capacity(min_capacity: usize) -> Self {
        let cap = min_capacity.max(2).next_power_of_two();
        let buf = (0..cap).map(|_| UnsafeCell::new(0.0)).collect();
        Self {
            buf,
            mask: cap - 1,
            write: AtomicUsize::new(0),
            read: AtomicUsize::new(0),
        }
    }

    pub fn push_slice(&self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let write = self.write.load(Ordering::Relaxed);
        let read = self.read.load(Ordering::Acquire);
        let used = write.wrapping_sub(read);
        let free = self.buf.len() - 1 - used;
        let count = samples.len().min(free) & !1;
        if count == 0 {
            return;
        }
        for (offset, sample) in samples.iter().take(count).enumerate() {
            let index = write.wrapping_add(offset) & self.mask;
            // SAFETY: `index` is in the free range owned by the producer.
            unsafe {
                *self.buf[index].get() = *sample;
            }
        }
        self.write
            .store(write.wrapping_add(count), Ordering::Release);
    }

    /// Copies one chunk, or writes silence when a full chunk is not buffered.
    /// Oldest samples above `max_keep` are discarded first so streams share a clock.
    pub fn pop_chunk_or_silence(&self, output: &mut [f32], max_keep: usize) -> bool {
        let max_keep = max_keep & !1;
        let write = self.write.load(Ordering::Acquire);
        let mut read = self.read.load(Ordering::Relaxed);
        let used = write.wrapping_sub(read);
        if used > max_keep {
            let drop_count = (used - max_keep) & !1;
            read = read.wrapping_add(drop_count);
        }
        if write.wrapping_sub(read) < output.len() {
            self.read.store(read, Ordering::Release);
            output.fill(0.0);
            return false;
        }
        for (offset, sample) in output.iter_mut().enumerate() {
            let index = read.wrapping_add(offset) & self.mask;
            // SAFETY: `index` is in the buffered range owned by the consumer.
            *sample = unsafe { *self.buf[index].get() };
        }
        self.read
            .store(read.wrapping_add(output.len()), Ordering::Release);
        true
    }
}

/// Copies little-endian f32 frames into `ring` without allocating.
/// A trailing partial stereo frame is ignored.
pub fn push_le_f32(ring: &SampleRing, bytes: &[u8]) {
    let mut offset = 0;
    let mut batch = [0.0f32; 64];
    while offset + 8 <= bytes.len() {
        let mut count = 0;
        while count + 1 < batch.len() && offset + 8 <= bytes.len() {
            let mut left = [0u8; 4];
            let mut right = [0u8; 4];
            left.copy_from_slice(&bytes[offset..offset + 4]);
            right.copy_from_slice(&bytes[offset + 4..offset + 8]);
            batch[count] = f32::from_le_bytes(left);
            batch[count + 1] = f32::from_le_bytes(right);
            offset += 8;
            count += 2;
        }
        ring.push_slice(&batch[..count]);
    }
}

/// Mixes multiple PCM Float32 audio streams into a destination buffer.
/// Applies saturation/clamping to [-1.0, 1.0] to prevent clipping distortion.
pub fn mix_audio_buffers(sources: &[&[f32]], output: &mut [f32]) {
    mix_audio_slices(sources.iter().copied(), output);
}

pub fn mix_audio_slices<'a>(sources: impl IntoIterator<Item = &'a [f32]>, output: &mut [f32]) {
    for sample in output.iter_mut() {
        *sample = 0.0;
    }
    for source in sources {
        let len = source.len().min(output.len());
        for i in 0..len {
            output[i] += source[i];
        }
    }
    for sample in output.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0);
    }
}

/// Converts an f32 stereo slice to raw bytes (little-endian LE).
pub fn float32_to_le_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for &s in samples {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    bytes
}

/// PipeWire playback streams use this media class. Capture streams
/// (`Stream/Input/Audio`) are not screen-share sources.
pub fn is_playback_media_class(media_class: &str) -> bool {
    media_class == "Stream/Output/Audio"
}

/// Process loopback (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`) exists from Windows Server 2022.
pub fn process_loopback_supported(build: u32) -> bool {
    build >= 20348
}

/// Playback nodes that belong to this process, or whose name is Konvoez, are not captured.
pub fn should_capture_playback_node(
    media_class: &str,
    pid: Option<u32>,
    self_pid: u32,
    names: &[&str],
) -> bool {
    if !is_playback_media_class(media_class) {
        return false;
    }
    if pid == Some(self_pid) {
        return false;
    }
    !names
        .iter()
        .any(|name| name.to_lowercase().contains("konvoez"))
}

/// Bytes of one little-endian f32 stereo chunk, starting at `offset`.
/// A trailing partial frame is dropped so the channel phase stays even.
pub fn f32_chunk_bytes(buffer: &[u8], offset: usize, size: usize) -> Option<&[u8]> {
    let end = offset.checked_add(size)?;
    if end > buffer.len() {
        return None;
    }
    let even_bytes = size & !7;
    if even_bytes == 0 {
        return None;
    }
    Some(&buffer[offset..offset + even_bytes])
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureMode {
    Include,
    Exclude,
}

impl CaptureMode {
    pub fn as_str(self) -> &'static str {
        match self {
            CaptureMode::Include => "include",
            CaptureMode::Exclude => "exclude",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaptureTarget {
    pub mode: CaptureMode,
    pub pid: u32,
}

/// Chooses the process loopback target.
/// Exclude mode always drops this process. Include of this process or one of its
/// ancestors switches to that same exclude, because those trees contain Konvoez.
pub fn resolve_capture_pid(
    mode: &str,
    target_pid: Option<u32>,
    self_pid: u32,
    self_ancestors: &[u32],
) -> std::result::Result<CaptureTarget, &'static str> {
    if mode == "exclude" {
        return Ok(CaptureTarget {
            mode: CaptureMode::Exclude,
            pid: self_pid,
        });
    }
    let Some(pid) = target_pid else {
        return Err("No valid target window or process specified for audio capture");
    };
    if pid == self_pid || self_ancestors.contains(&pid) {
        return Ok(CaptureTarget {
            mode: CaptureMode::Exclude,
            pid: self_pid,
        });
    }
    Ok(CaptureTarget {
        mode: CaptureMode::Include,
        pid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_loopback_supported_from_build_20348() {
        assert!(!process_loopback_supported(20347));
        assert!(process_loopback_supported(20348));
        assert!(process_loopback_supported(26100));
    }

    #[test]
    fn test_resolve_capture_pid_exclude_mode() {
        assert_eq!(
            resolve_capture_pid("exclude", None, 100, &[]),
            Ok(CaptureTarget {
                mode: CaptureMode::Exclude,
                pid: 100,
            })
        );
        assert_eq!(
            resolve_capture_pid("exclude", Some(200), 100, &[200]),
            Ok(CaptureTarget {
                mode: CaptureMode::Exclude,
                pid: 100,
            })
        );
    }

    #[test]
    fn test_resolve_capture_pid_include_mode() {
        assert_eq!(
            resolve_capture_pid("include", Some(200), 100, &[]),
            Ok(CaptureTarget {
                mode: CaptureMode::Include,
                pid: 200,
            })
        );
        assert_eq!(
            resolve_capture_pid("include", Some(100), 100, &[]),
            Ok(CaptureTarget {
                mode: CaptureMode::Exclude,
                pid: 100,
            })
        );
        assert_eq!(
            resolve_capture_pid("include", Some(50), 100, &[50, 10]),
            Ok(CaptureTarget {
                mode: CaptureMode::Exclude,
                pid: 100,
            })
        );
        assert!(resolve_capture_pid("include", None, 100, &[]).is_err());
    }

    #[test]
    fn test_mix_audio_buffers_empty() {
        let mut output = [0.5f32; 4];
        mix_audio_buffers(&[], &mut output);
        assert_eq!(output, [0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_mix_audio_buffers_sum() {
        let s1 = [0.1f32, 0.2, -0.3, 0.4];
        let s2 = [0.2f32, 0.3, 0.1, -0.1];
        let mut out = [0.0f32; 4];
        mix_audio_buffers(&[&s1, &s2], &mut out);
        assert!((out[0] - 0.3).abs() < 1e-6);
        assert!((out[1] - 0.5).abs() < 1e-6);
        assert!((out[2] - (-0.2)).abs() < 1e-6);
        assert!((out[3] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn test_mix_audio_buffers_clamping() {
        let s1 = [0.8f32, -0.9];
        let s2 = [0.5f32, -0.5];
        let mut out = [0.0f32; 2];
        mix_audio_buffers(&[&s1, &s2], &mut out);
        assert_eq!(out[0], 1.0);
        assert_eq!(out[1], -1.0);
    }

    #[test]
    fn test_playback_media_class() {
        assert!(is_playback_media_class("Stream/Output/Audio"));
        assert!(!is_playback_media_class("Stream/Input/Audio"));
        assert!(!is_playback_media_class("Audio/Sink"));
        assert!(!is_playback_media_class("Audio/Source"));
    }

    #[test]
    fn test_should_capture_playback_node_rejects_konvoez() {
        assert!(should_capture_playback_node(
            "Stream/Output/Audio",
            Some(5),
            1,
            &["Firefox"]
        ));
        assert!(should_capture_playback_node(
            "Stream/Output/Audio",
            None,
            1,
            &["VLC"]
        ));
        assert!(!should_capture_playback_node(
            "Stream/Input/Audio",
            Some(5),
            1,
            &["Firefox"]
        ));
        assert!(!should_capture_playback_node(
            "Stream/Output/Audio",
            Some(1),
            1,
            &["Firefox"]
        ));
        assert!(!should_capture_playback_node(
            "Stream/Output/Audio",
            Some(5),
            1,
            &["KonvoEZ"]
        ));
        assert!(!should_capture_playback_node(
            "Audio/Sink",
            Some(5),
            1,
            &["konvoez"]
        ));
    }

    #[test]
    fn test_f32_chunk_bytes_honors_offset_and_stereo_frame() {
        let buffer = [0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        assert_eq!(f32_chunk_bytes(&buffer, 4, 8), Some(&buffer[4..12][..]));
        assert_eq!(f32_chunk_bytes(&buffer, 4, 10), Some(&buffer[4..12][..]));
        assert_eq!(f32_chunk_bytes(&buffer, 10, 8), None);
        assert_eq!(f32_chunk_bytes(&buffer, 0, 4), None);
    }

    #[test]
    fn test_sample_ring_pops_a_chunk_and_silence() {
        let ring = SampleRing::with_capacity(16);
        let mut out = [1.0f32; 4];
        assert!(!ring.pop_chunk_or_silence(&mut out, 16));
        assert_eq!(out, [0.0, 0.0, 0.0, 0.0]);

        ring.push_slice(&[0.25, -0.5]);
        assert!(!ring.pop_chunk_or_silence(&mut out, 16));

        ring.push_slice(&[0.25, -0.5]);
        assert!(ring.pop_chunk_or_silence(&mut out, 16));
        assert_eq!(out, [0.25, -0.5, 0.25, -0.5]);
    }

    #[test]
    fn test_sample_ring_drops_oldest_and_newest() {
        let ring = SampleRing::with_capacity(8);
        ring.push_slice(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        let mut out = [0.0f32; 2];
        assert!(ring.pop_chunk_or_silence(&mut out, 2));
        assert_eq!(out, [5.0, 6.0]);

        ring.push_slice(&[7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0]);
        assert!(ring.pop_chunk_or_silence(&mut out, 8));
        assert_eq!(out, [7.0, 8.0]);
    }

    #[test]
    fn test_push_le_f32() {
        let ring = SampleRing::with_capacity(8);
        push_le_f32(&ring, &1.0f32.to_le_bytes());
        push_le_f32(
            &ring,
            &[1.0f32.to_le_bytes(), (-1.0f32).to_le_bytes()].concat(),
        );
        let mut out = [0.0f32; 2];
        assert!(ring.pop_chunk_or_silence(&mut out, 8));
        assert_eq!(out, [1.0, -1.0]);
    }

    #[test]
    fn test_float32_to_le_bytes() {
        let samples = [1.0f32, -1.0f32];
        let bytes = float32_to_le_bytes(&samples);
        assert_eq!(bytes.len(), 8);
        assert_eq!(bytes, [0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0xbf]);
    }
}
