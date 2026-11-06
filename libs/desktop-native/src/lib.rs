use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub mod audio;
pub mod input;

pub use audio::CaptureMode;

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
    pub mode: CaptureMode,
    pub target_pid: Option<u32>,
    pub target_hwnd: Option<i64>,
    pub target_stream_id: Option<String>,
}

#[napi]
pub struct AudioCaptureHandle {
    stopper: Arc<AtomicBool>,
    thread_handle: Mutex<Option<JoinHandle<()>>>,
    mode: CaptureMode,
}

#[napi]
impl AudioCaptureHandle {
    /// The mode that actually started. Include of Konvoez itself becomes exclude.
    #[napi]
    pub fn mode(&self) -> CaptureMode {
        self.mode
    }

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
    /// True when the event is an autorepeat of a key that is already held.
    pub repeat: bool,
}

#[napi]
pub struct KeyHookHandle {
    stopper: Arc<AtomicBool>,
    on_stop: Mutex<Option<Box<dyn FnOnce() + Send>>>,
    thread_handle: Mutex<Option<JoinHandle<()>>>,
}

#[napi]
impl KeyHookHandle {
    #[napi]
    pub fn stop(&self) {
        self.stopper.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.on_stop.lock() {
            if let Some(stop_fn) = guard.take() {
                stop_fn();
            }
        }
        if let Ok(mut guard) = self.thread_handle.lock() {
            if let Some(handle) = guard.take() {
                // The X11 data thread blocks in the RECORD iterator until disable
                // returns. Cap the wait so a stuck server cannot freeze the app.
                join_for(handle, Duration::from_secs(1));
            }
        }
    }
}

/// Joins `handle` if it finishes within `timeout`. On timeout the handle is
/// dropped and the thread stays detached. That is the one accepted exception
/// to "no detached threads" (see `AGENTS.md`): the caller must return so a stuck
/// hook cannot block Electron.
fn join_for(handle: JoinHandle<()>, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while !handle.is_finished() {
        if Instant::now() >= deadline {
            return;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    let _ = handle.join();
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
        audio::windows::is_audio_supported()
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
    let (handle, mode) = audio::windows::start_capture(options, callback, stopper.clone())?;

    #[cfg(target_os = "linux")]
    let (handle, mode) = audio::linux::start_capture(options, callback, stopper.clone())?;

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
        mode,
    })
}

#[napi(ts_args_type = "callback: (event: KeyEvent) => void")]
pub fn start_key_hook(callback: Function<KeyEvent, ()>) -> Result<KeyHookHandle> {
    let stopper = Arc::new(AtomicBool::new(false));

    #[cfg(target_os = "windows")]
    let hook_thread = input::windows::start_hook(callback, stopper.clone())?;

    #[cfg(target_os = "linux")]
    let hook_thread = input::linux::start_hook(callback, stopper.clone())?;

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
        on_stop: Mutex::new(Some(hook_thread.on_stop)),
        thread_handle: Mutex::new(Some(hook_thread.handle)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_capture_options() {
        let opts = AudioCaptureOptions {
            mode: CaptureMode::Exclude,
            target_pid: Some(1234),
            target_hwnd: None,
            target_stream_id: None,
        };
        assert_eq!(opts.mode, CaptureMode::Exclude);
        assert_eq!(opts.target_pid, Some(1234));
    }

    #[test]
    fn test_join_for_waits_for_a_finishing_thread() {
        let handle = std::thread::spawn(|| std::thread::sleep(Duration::from_millis(30)));
        let started = Instant::now();
        join_for(handle, Duration::from_secs(5));
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn test_join_for_gives_up_on_a_stuck_thread() {
        let (release, blocked) = std::sync::mpsc::channel::<()>();
        let handle = std::thread::spawn(move || {
            let _ = blocked.recv();
        });
        let started = Instant::now();
        join_for(handle, Duration::from_millis(50));
        assert!(started.elapsed() >= Duration::from_millis(50));
        assert!(started.elapsed() < Duration::from_secs(2));
        drop(release);
    }

    #[test]
    fn test_is_audio_supported_does_not_panic() {
        let _ = is_audio_supported();
    }
}
