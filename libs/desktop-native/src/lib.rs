use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

pub mod audio;
pub mod input;

#[napi(object)]
#[derive(Clone, Debug)]
pub struct AudioStreamInfo {
    pub id: String,
    pub name: String,
    pub pid: Option<u32>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct AudioCaptureOptions {
    pub mode: String, // "exclude" | "include"
    pub target_pid: Option<u32>,
    pub target_hwnd: Option<i64>,
    pub target_stream_id: Option<String>,
}

#[napi]
pub struct AudioCaptureHandle {
    stopper: Arc<AtomicBool>,
    thread_handle: Mutex<Option<JoinHandle<()>>>,
}

#[napi]
impl AudioCaptureHandle {
    #[napi]
    pub fn stop(&self) {
        self.stopper.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.thread_handle.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for AudioCaptureHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct KeyEvent {
    pub code: String,
    pub down: bool,
}

#[napi]
pub struct KeyHookHandle {
    stopper: Arc<AtomicBool>,
    thread_handle: Mutex<Option<JoinHandle<()>>>,
}

#[napi]
impl KeyHookHandle {
    #[napi]
    pub fn stop(&self) {
        self.stopper.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.thread_handle.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for KeyHookHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

#[napi]
pub fn is_audio_supported() -> bool {
    #[cfg(target_os = "windows")]
    {
        true
    }
    #[cfg(target_os = "linux")]
    {
        audio::linux::is_supported()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

#[napi]
pub fn is_key_hook_supported() -> bool {
    #[cfg(target_os = "windows")]
    {
        true
    }
    #[cfg(target_os = "linux")]
    {
        input::linux::is_supported()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

#[napi]
pub fn get_audio_streams() -> Vec<AudioStreamInfo> {
    #[cfg(target_os = "linux")]
    {
        audio::linux::get_audio_streams()
    }
    #[cfg(not(target_os = "linux"))]
    {
        Vec::new()
    }
}

#[napi(ts_args_type = "options: AudioCaptureOptions, callback: (chunk: Buffer) => void")]
pub fn start_audio_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
) -> Result<AudioCaptureHandle> {
    let stopper = Arc::new(AtomicBool::new(false));

    #[cfg(target_os = "windows")]
    let handle = audio::windows::start_capture(options, callback, stopper.clone())?;

    #[cfg(target_os = "linux")]
    let handle = audio::linux::start_capture(options, callback, stopper.clone())?;

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (options, callback, stopper);
        return Err(Error::new(
            Status::GenericFailure,
            "Audio capture is not supported on this platform".to_string(),
        ));
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    Ok(AudioCaptureHandle {
        stopper,
        thread_handle: Mutex::new(Some(handle)),
    })
}

#[napi(ts_args_type = "callback: (event: KeyEvent) => void")]
pub fn start_key_hook(callback: Function<KeyEvent, ()>) -> Result<KeyHookHandle> {
    let stopper = Arc::new(AtomicBool::new(false));

    #[cfg(target_os = "windows")]
    let handle = input::windows::start_hook(callback, stopper.clone())?;

    #[cfg(target_os = "linux")]
    let handle = input::linux::start_hook(callback, stopper.clone())?;

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (callback, stopper);
        return Err(Error::new(
            Status::GenericFailure,
            "Key hook is not supported on this platform".to_string(),
        ));
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    Ok(KeyHookHandle {
        stopper,
        thread_handle: Mutex::new(Some(handle)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_capture_options() {
        let opts = AudioCaptureOptions {
            mode: "exclude".to_string(),
            target_pid: Some(1234),
            target_hwnd: None,
            target_stream_id: None,
        };
        assert_eq!(opts.mode, "exclude");
        assert_eq!(opts.target_pid, Some(1234));
    }

    #[test]
    fn test_is_audio_supported_does_not_panic() {
        let _ = is_audio_supported();
    }
}
