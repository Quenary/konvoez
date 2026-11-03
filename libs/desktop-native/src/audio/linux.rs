use crate::{AudioCaptureOptions, AudioStreamInfo};
use napi::bindgen_prelude::*;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread::JoinHandle;

pub fn is_supported() -> bool {
    false
}

pub fn get_audio_streams() -> Vec<AudioStreamInfo> {
    Vec::new()
}

pub fn start_capture(
    _options: AudioCaptureOptions,
    _callback: Function<Buffer, ()>,
    _stopper: Arc<AtomicBool>,
) -> Result<JoinHandle<()>> {
    Err(Error::new(
        Status::GenericFailure,
        "Linux audio capture not enabled yet".to_string(),
    ))
}
