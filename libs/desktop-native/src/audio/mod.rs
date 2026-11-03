#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

/// Mixes multiple PCM Float32 audio streams into a destination buffer.
/// Applies saturation/clamping to [-1.0, 1.0] to prevent clipping distortion.
pub fn mix_audio_buffers(sources: &[&[f32]], output: &mut [f32]) {
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

/// Validates process ID to capture based on capture mode and self PID.
/// In "include" mode: target PID must be provided and must not equal self PID.
/// In "exclude" mode: target PID defaults to self PID to exclude own process tree.
pub fn resolve_capture_pid(
    mode: &str,
    target_pid: Option<u32>,
    self_pid: u32,
) -> std::result::Result<u32, &'static str> {
    if mode == "exclude" {
        Ok(target_pid.unwrap_or(self_pid))
    } else if let Some(pid) = target_pid {
        if pid == self_pid {
            Err("Cannot capture audio from Konvoez itself")
        } else {
            Ok(pid)
        }
    } else {
        Err("No valid target window or process specified for audio capture")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_capture_pid_exclude_mode() {
        assert_eq!(resolve_capture_pid("exclude", None, 100), Ok(100));
        assert_eq!(resolve_capture_pid("exclude", Some(200), 100), Ok(200));
    }

    #[test]
    fn test_resolve_capture_pid_include_mode() {
        assert_eq!(resolve_capture_pid("include", Some(200), 100), Ok(200));
        assert!(resolve_capture_pid("include", Some(100), 100).is_err());
        assert!(resolve_capture_pid("include", None, 100).is_err());
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
    fn test_f32_chunk_bytes_honors_offset_and_stereo_frame() {
        let buffer = [0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        assert_eq!(f32_chunk_bytes(&buffer, 4, 8), Some(&buffer[4..12][..]));
        assert_eq!(f32_chunk_bytes(&buffer, 4, 10), Some(&buffer[4..12][..]));
        assert_eq!(f32_chunk_bytes(&buffer, 10, 8), None);
        assert_eq!(f32_chunk_bytes(&buffer, 0, 4), None);
    }

    #[test]
    fn test_float32_to_le_bytes() {
        let samples = [1.0f32, -1.0f32];
        let bytes = float32_to_le_bytes(&samples);
        assert_eq!(bytes.len(), 8);
        assert_eq!(bytes, [0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0xbf]);
    }
}
