use crate::AudioCaptureOptions;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use windows::Win32::Foundation::NTSTATUS;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, TRUE};
use windows::Win32::Media::Audio::{
    ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
    IActivateAudioInterfaceCompletionHandler, IActivateAudioInterfaceCompletionHandler_Impl,
    IAudioCaptureClient, IAudioClient, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    AUDCLNT_STREAMFLAGS_LOOPBACK, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, WAVEFORMATEX,
    WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, GetClassNameW, GetWindowThreadProcessId,
};
use windows_core::{implement, Interface, Ref, HRESULT};

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const APPLICATION_FRAME_HOST_EXE: &str = "ApplicationFrameHost.exe";

pub fn is_audio_supported() -> bool {
    crate::audio::process_loopback_supported(windows_build_number())
}

fn windows_build_number() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // SAFETY: `info` is a writable OSVERSIONINFOW and its size field is set.
    // RtlGetVersion is the call that reports the real build; GetVersionEx does not.
    let status = unsafe {
        windows_core::link!("ntdll.dll" "system" fn RtlGetVersion(info: *mut OSVERSIONINFOW) -> NTSTATUS);
        RtlGetVersion(&mut info)
    };
    if status.is_err() {
        return 0;
    }
    info.dwBuildNumber
}

#[repr(C)]
struct AudioClientProcessLoopbackParams {
    target_process_id: u32,
    process_loopback_mode: u32,
}

#[repr(C)]
struct AudioClientActivationParams {
    activation_type: u32,
    loopback_params: AudioClientProcessLoopbackParams,
}

#[repr(C)]
struct PropVariantBlob {
    vt: u16,
    w_reserved1: u16,
    w_reserved2: u16,
    w_reserved3: u16,
    cb_size: u32,
    p_blob_data: *mut u8,
}

struct ComScope {
    initialized: bool,
}

impl ComScope {
    fn new() -> std::result::Result<Self, String> {
        // SAFETY: Initializing COM on the background capture thread.
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if hr.is_err() {
            return Err(format!("CoInitializeEx failed: {hr:?}"));
        }
        // S_FALSE means this thread already initialized COM. Both successes
        // need a matching CoUninitialize.
        Ok(Self { initialized: true })
    }
}

impl Drop for ComScope {
    fn drop(&mut self) {
        if !self.initialized {
            return;
        }
        // SAFETY: This thread successfully called CoInitializeEx, so the matching CoUninitialize is required.
        unsafe {
            CoUninitialize();
        }
    }
}

struct AutoCloseHandle(HANDLE);
impl Drop for AutoCloseHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: Closing valid event handle
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct ActivationHandler {
    sender: std::sync::Mutex<
        Option<std::sync::mpsc::Sender<std::result::Result<windows_core::IUnknown, String>>>,
    >,
}

impl IActivateAudioInterfaceCompletionHandler_Impl for ActivationHandler_Impl {
    fn ActivateCompleted(
        &self,
        operation: Ref<'_, IActivateAudioInterfaceAsyncOperation>,
    ) -> windows_core::Result<()> {
        if let Ok(mut guard) = self.sender.lock() {
            if let Some(sender) = guard.take() {
                if let Some(op) = operation.as_ref() {
                    let mut activate_hr = HRESULT(0);
                    let mut unk = None;
                    // SAFETY: Querying COM async activation result.
                    unsafe {
                        let res = op.GetActivateResult(&mut activate_hr, &mut unk);
                        if let Err(e) = res {
                            let _ = sender.send(Err(format!(
                                "ActivateAudioInterfaceAsync completion GetActivateResult failed: {e}"
                            )));
                            return Ok(());
                        }
                        if let Err(e) = activate_hr.ok() {
                            let _ = sender.send(Err(format!(
                                "ActivateAudioInterfaceAsync completion failed: {e}"
                            )));
                            return Ok(());
                        }
                        if let Some(u) = unk {
                            let _ = sender.send(Ok(u));
                        } else {
                            let _ = sender.send(Err(
                                "ActivateAudioInterfaceAsync completed without an audio interface"
                                    .to_string(),
                            ));
                        }
                    }
                } else {
                    let _ = sender.send(Err(
                        "ActivateAudioInterfaceAsync completed without an operation".to_string(),
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Process id that owns `hwnd`. A packaged app window belongs to
/// `ApplicationFrameHost.exe`, which plays no audio, so the hosted app process
/// is used instead. Errors when that process is not running, so include never
/// targets the frame host.
pub fn resolve_window_pid(hwnd_val: i64) -> Result<u32> {
    if hwnd_val == 0 {
        return Err(Error::new(
            Status::GenericFailure,
            "No valid target window or process specified for audio capture",
        ));
    }
    let hwnd = HWND(hwnd_val as _);
    let mut pid: u32 = 0;
    // SAFETY: `pid` is a writable u32 for the process-id out-parameter.
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return Err(Error::new(
            Status::GenericFailure,
            "No valid target window or process specified for audio capture",
        ));
    }
    if !is_application_frame_host(pid) {
        return Ok(pid);
    }
    let children = child_window_processes(hwnd);
    let listed: Vec<(u32, &str)> = children
        .iter()
        .map(|(child_pid, class)| (*child_pid, class.as_str()))
        .collect();
    crate::audio::select_frame_host_child_pid(pid, &listed)
        .map_err(|message| Error::new(Status::GenericFailure, message))
}

fn is_application_frame_host(pid: u32) -> bool {
    process_snapshot().iter().any(|process| {
        process.pid == pid
            && String::from_utf16_lossy(&process.exe)
                .eq_ignore_ascii_case(APPLICATION_FRAME_HOST_EXE)
    })
}

fn child_window_processes(hwnd: HWND) -> Vec<(u32, String)> {
    let mut children = Vec::new();
    // SAFETY: EnumChildWindows invokes `collect_child_window` synchronously and
    // does not keep `children`. The callback only appends to that vec.
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(collect_child_window),
            LPARAM(std::ptr::from_mut(&mut children) as isize),
        );
    }
    children
}

extern "system" fn collect_child_window(hwnd: HWND, lparam: LPARAM) -> windows_core::BOOL {
    // SAFETY: `lparam` is the Vec passed by `child_window_processes`.
    // EnumChildWindows calls this only before returning, so the Vec is alive.
    // The callback appends one entry and does not free the allocation.
    let children = unsafe { &mut *(lparam.0 as *mut Vec<(u32, String)>) };
    let mut pid = 0u32;
    // SAFETY: `pid` is a writable u32 for the process-id out-parameter.
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    let mut class_name = [0u16; 256];
    // SAFETY: `class_name` is a writable 256-WCHAR buffer. The returned length
    // is the number of characters written, excluding the terminating null.
    let len = unsafe { GetClassNameW(hwnd, &mut class_name) };
    let copied = usize::try_from(len).unwrap_or(0).min(class_name.len());
    let class = String::from_utf16_lossy(&class_name[..copied]);
    children.push((pid, class));
    TRUE
}

struct ProcessInfo {
    pid: u32,
    parent_pid: u32,
    exe: Vec<u16>,
}

fn process_snapshot() -> Vec<ProcessInfo> {
    // SAFETY: Toolhelp32 process snapshot. The snapshot handle is closed when
    // `guard` drops, including when iteration stops early.
    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(snapshot) => snapshot,
            Err(_) => return Vec::new(),
        };
        if snapshot.is_invalid() {
            return Vec::new();
        }
        let _guard = AutoCloseHandle(snapshot);

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut processes = Vec::new();
        if Process32FirstW(snapshot, &mut entry).is_err() {
            return processes;
        }
        loop {
            let exe = entry
                .szExeFile
                .iter()
                .take_while(|&&c| c != 0)
                .copied()
                .collect::<Vec<u16>>();
            processes.push(ProcessInfo {
                pid: entry.th32ProcessID,
                parent_pid: entry.th32ParentProcessID,
                exe,
            });
            if Process32NextW(snapshot, &mut entry).is_err() {
                break;
            }
        }
        processes
    }
}

pub fn find_root_process_in_tree(pid: u32) -> u32 {
    let processes = process_snapshot();
    let mut current_pid = pid;
    for _ in 0..16 {
        let Some(current) = processes.iter().find(|process| process.pid == current_pid) else {
            break;
        };
        if current.parent_pid == 0 || current.parent_pid == current_pid {
            break;
        }
        let Some(parent) = processes
            .iter()
            .find(|process| process.pid == current.parent_pid)
        else {
            break;
        };
        if parent.exe != current.exe {
            break;
        }
        current_pid = current.parent_pid;
    }
    current_pid
}

/// Parent process ids of `pid`, nearest first. Stops at pid 0 or a cycle.
pub fn ancestor_pids(pid: u32) -> Vec<u32> {
    let processes = process_snapshot();
    let mut ancestors = Vec::new();
    let mut current = pid;
    for _ in 0..16 {
        let Some(process) = processes.iter().find(|process| process.pid == current) else {
            break;
        };
        if process.parent_pid == 0 || process.parent_pid == current {
            break;
        }
        ancestors.push(process.parent_pid);
        current = process.parent_pid;
    }
    ancestors
}

pub fn start_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<(JoinHandle<()>, &'static str)> {
    let target_pid = if let Some(hwnd) = options.target_hwnd {
        Some(find_root_process_in_tree(resolve_window_pid(hwnd)?))
    } else {
        options.target_pid.map(find_root_process_in_tree)
    };

    let self_pid = std::process::id();
    let ancestors = ancestor_pids(self_pid);
    let target = crate::audio::resolve_capture_pid(&options.mode, target_pid, self_pid, &ancestors)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    let is_exclude = target.mode == crate::audio::CaptureMode::Exclude;
    let pid_to_use = target.pid;
    let mode = target.mode.as_str();

    let tsfn = callback.build_threadsafe_function().build()?;
    let (ready_tx, ready_rx) = channel::<std::result::Result<(), String>>();
    let stopper_for_thread = Arc::clone(&stopper);

    let handle = thread::spawn(move || {
        let ring = Arc::new(crate::audio::SampleRing::with_capacity(32768));
        let ring_for_delivery = Arc::clone(&ring);
        let stopper_for_delivery = Arc::clone(&stopper_for_thread);
        let delivery = match thread::Builder::new()
            .name("wasapi-deliver".to_string())
            .spawn(move || {
                const CHUNK_FLOATS: usize = 960;
                const MAX_KEEP: usize = 19200;
                let mut samples = vec![0.0f32; CHUNK_FLOATS];
                let mut bytes = Vec::with_capacity(CHUNK_FLOATS * 4);
                loop {
                    if ring_for_delivery.pop_chunk_or_silence(&mut samples, MAX_KEEP) {
                        bytes.clear();
                        for sample in &samples {
                            bytes.extend_from_slice(&sample.to_le_bytes());
                        }
                        let _ = tsfn.call(
                            Buffer::from(bytes.as_slice()),
                            ThreadsafeFunctionCallMode::NonBlocking,
                        );
                        continue;
                    }
                    if stopper_for_delivery.load(Ordering::Relaxed) {
                        break;
                    }
                    thread::sleep(Duration::from_millis(5));
                }
            }) {
            Ok(handle) => handle,
            Err(err) => {
                let _ = ready_tx.send(Err(format!("Failed to start audio delivery: {err}")));
                return;
            }
        };
        let _ = run_capture_loop(
            pid_to_use,
            is_exclude,
            ring,
            Arc::clone(&stopper_for_thread),
            ready_tx,
        );
        stopper_for_thread.store(true, Ordering::SeqCst);
        let _ = delivery.join();
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok((handle, mode)),
        Ok(Err(message)) => {
            stopper.store(true, Ordering::SeqCst);
            let _ = handle.join();
            Err(Error::new(Status::GenericFailure, message))
        }
        Err(_) => {
            stopper.store(true, Ordering::SeqCst);
            let _ = handle.join();
            Err(Error::new(
                Status::GenericFailure,
                "Audio capture stopped before it started".to_string(),
            ))
        }
    }
}

fn run_capture_loop(
    target_pid: u32,
    is_exclude: bool,
    ring: Arc<crate::audio::SampleRing>,
    stopper: Arc<AtomicBool>,
    ready: std::sync::mpsc::Sender<std::result::Result<(), String>>,
) -> std::result::Result<(), String> {
    let _com_scope = match ComScope::new() {
        Ok(scope) => scope,
        Err(err) => {
            let _ = ready.send(Err(err.clone()));
            return Err(err);
        }
    };

    let init = init_wasapi_client(target_pid, is_exclude);

    let (audio_client, capture_client, _event_guard) = match init {
        Ok(session) => {
            let _ = ready.send(Ok(()));
            session
        }
        Err(err) => {
            let _ = ready.send(Err(err.clone()));
            return Err(err);
        }
    };

    let silence = [0.0f32; 4096];

    // SAFETY: The capture loop uses the client started above. Buffers returned by
    // GetBuffer stay valid until the matching ReleaseBuffer call.
    unsafe {
        while !stopper.load(Ordering::Relaxed) {
            let wait_res = WaitForSingleObject(_event_guard.0, 20);
            if stopper.load(Ordering::Relaxed) {
                break;
            }
            if wait_res.0 == 0 {
                loop {
                    let mut p_data: *mut u8 = std::ptr::null_mut();
                    let mut num_frames_read: u32 = 0;
                    let mut flags: u32 = 0;

                    let hr = capture_client.GetBuffer(
                        &mut p_data,
                        &mut num_frames_read,
                        &mut flags,
                        None,
                        None,
                    );

                    if hr.is_err() || num_frames_read == 0 {
                        break;
                    }

                    let float_count = (num_frames_read as usize) * 2;
                    let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;
                    if silent {
                        let mut remaining = float_count & !1;
                        while remaining > 0 {
                            let count = remaining.min(silence.len()) & !1;
                            ring.push_slice(&silence[..count]);
                            remaining -= count;
                        }
                    } else if !p_data.is_null() {
                        let num_bytes = float_count * 4;
                        // SAFETY: GetBuffer's pointer stays valid until ReleaseBuffer
                        // and covers `num_frames_read` stereo f32 frames.
                        let bytes = std::slice::from_raw_parts(p_data, num_bytes);
                        crate::audio::push_le_f32(&ring, bytes);
                    }

                    let _ = capture_client.ReleaseBuffer(num_frames_read);
                }
            }
        }

        let _ = audio_client.Stop();
    }

    Ok(())
}

fn init_wasapi_client(
    target_pid: u32,
    is_exclude: bool,
) -> std::result::Result<(IAudioClient, IAudioCaptureClient, AutoCloseHandle), String> {
    // SAFETY: Activating a process-loopback IAudioClient and initializing it.
    // `async_op` is held until ActivateCompleted publishes the client.
    unsafe {
        let mut params = AudioClientActivationParams {
            activation_type: 1, // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
            loopback_params: AudioClientProcessLoopbackParams {
                target_process_id: target_pid,
                process_loopback_mode: if is_exclude { 1 } else { 0 },
            },
        };

        let prop = PropVariantBlob {
            vt: 0x0041, // VT_BLOB
            w_reserved1: 0,
            w_reserved2: 0,
            w_reserved3: 0,
            cb_size: std::mem::size_of::<AudioClientActivationParams>() as u32,
            p_blob_data: &mut params as *mut _ as *mut u8,
        };

        let (tx, rx) = channel();
        let handler: IActivateAudioInterfaceCompletionHandler = ActivationHandler {
            sender: std::sync::Mutex::new(Some(tx)),
        }
        .into();

        // Hold the operation until ActivateCompleted. Releasing it earlier drops
        // Windows' reference to the completion handler and cancels activation.
        let async_op = ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&prop as *const _ as *const _),
            &handler,
        )
        .map_err(|err| format!("ActivateAudioInterfaceAsync failed: {err}"))?;

        let unk = match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(res) => res?,
            Err(_) => {
                drop(async_op);
                return Err(
                    "Timed out waiting for ActivateAudioInterfaceAsync completion".to_string(),
                );
            }
        };
        drop(async_op);

        let audio_client: IAudioClient = unk
            .cast()
            .map_err(|err| format!("Querying IAudioClient failed: {err}"))?;

        // Float32 48 kHz stereo WAVEFORMATEXTENSIBLE
        const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: windows_core::GUID =
            windows_core::GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

        let wfx = WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_EXTENSIBLE,
                nChannels: 2,
                nSamplesPerSec: 48000,
                nAvgBytesPerSec: 48000 * 2 * 4,
                nBlockAlign: 8,
                wBitsPerSample: 32,
                cbSize: 22,
            },
            Samples: windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE_0 {
                wValidBitsPerSample: 32,
            },
            dwChannelMask: 0x3, // SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT
            SubFormat: KSDATAFORMAT_SUBTYPE_IEEE_FLOAT,
        };

        let event = CreateEventW(None, false, false, None)
            .map_err(|err| format!("CreateEventW failed: {err}"))?;
        let event_guard = AutoCloseHandle(event);

        audio_client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK
                    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                200_000, // 20 ms
                0,
                &wfx.Format as *const _,
                None,
            )
            .map_err(|err| format!("IAudioClient::Initialize failed: {err}"))?;

        audio_client
            .SetEventHandle(event)
            .map_err(|err| format!("IAudioClient::SetEventHandle failed: {err}"))?;
        let capture_client: IAudioCaptureClient = audio_client
            .GetService()
            .map_err(|err| format!("IAudioClient::GetService failed: {err}"))?;
        audio_client
            .Start()
            .map_err(|err| format!("IAudioClient::Start failed: {err}"))?;

        Ok((audio_client, capture_client, event_guard))
    }
}
