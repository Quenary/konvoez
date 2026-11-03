use crate::AudioCaptureOptions;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, E_FAIL, HANDLE, HWND};
use windows::Win32::Media::Audio::{
    ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
    IActivateAudioInterfaceCompletionHandler, IActivateAudioInterfaceCompletionHandler_Impl,
    IAudioCaptureClient, IAudioClient, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
use windows_core::{implement, w, Interface, Ref, HRESULT};

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;

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

struct ComScope;
impl ComScope {
    fn new() -> Self {
        // SAFETY: Initializing COM runtime on background capture thread
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        Self
    }
}

impl Drop for ComScope {
    fn drop(&mut self) {
        // SAFETY: Balancing CoInitializeEx
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
        Option<std::sync::mpsc::Sender<windows_core::Result<windows_core::IUnknown>>>,
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
                            let _ = sender.send(Err(e));
                            return Ok(());
                        }
                        if let Err(e) = activate_hr.ok() {
                            let _ = sender.send(Err(e));
                            return Ok(());
                        }
                        if let Some(u) = unk {
                            let _ = sender.send(Ok(u));
                        } else {
                            let _ = sender.send(Err(windows_core::Error::from_hresult(E_FAIL)));
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

pub fn resolve_window_pid(hwnd_val: i64) -> Option<u32> {
    if hwnd_val == 0 {
        return None;
    }
    let hwnd = HWND(hwnd_val as _);
    let mut pid: u32 = 0;
    // SAFETY: Calling Win32 API with valid pointer to receive pid.
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        None
    } else {
        Some(pid)
    }
}

pub fn find_root_process_in_tree(pid: u32) -> u32 {
    // SAFETY: Toolhelp32 process snapshot iteration with proper handle closure.
    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(s) => s,
            Err(_) => return pid,
        };
        if snapshot.is_invalid() {
            return pid;
        }

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut processes: Vec<(u32, u32, Vec<u16>)> = Vec::new();
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let exe_name = entry
                    .szExeFile
                    .iter()
                    .take_while(|&&c| c != 0)
                    .copied()
                    .collect::<Vec<u16>>();
                processes.push((entry.th32ProcessID, entry.th32ParentProcessID, exe_name));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);

        let mut current_pid = pid;
        for _ in 0..16 {
            let current_info = processes.iter().find(|(p, _, _)| *p == current_pid);
            if let Some((_, parent_pid, exe)) = current_info {
                if *parent_pid == 0 || *parent_pid == current_pid {
                    break;
                }
                let parent_info = processes.iter().find(|(p, _, _)| *p == *parent_pid);
                if let Some((_, _, parent_exe)) = parent_info {
                    if parent_exe == exe {
                        current_pid = *parent_pid;
                        continue;
                    }
                }
            }
            break;
        }

        current_pid
    }
}

pub fn start_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<JoinHandle<()>> {
    let is_exclude = options.mode == "exclude";
    let target_pid = if let Some(hwnd) = options.target_hwnd {
        resolve_window_pid(hwnd).map(find_root_process_in_tree)
    } else if let Some(pid) = options.target_pid {
        Some(find_root_process_in_tree(pid))
    } else {
        None
    };

    let self_pid = std::process::id();
    let pid_to_use = crate::audio::resolve_capture_pid(&options.mode, target_pid, self_pid)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;

    let tsfn = callback.build_threadsafe_function().build()?;

    let handle = thread::spawn(move || {
        let sender = move |chunk: Vec<u8>| {
            let _ = tsfn.call(Buffer::from(chunk), ThreadsafeFunctionCallMode::NonBlocking);
        };
        let _ = run_capture_loop(pid_to_use, is_exclude, sender, stopper);
    });

    Ok(handle)
}

fn run_capture_loop<F>(
    target_pid: u32,
    is_exclude: bool,
    on_chunk: F,
    stopper: Arc<AtomicBool>,
) -> windows_core::Result<()>
where
    F: Fn(Vec<u8>),
{
    let _com_scope = ComScope::new();

    // SAFETY: Initializing WASAPI process loopback capture via COM interface.
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

        let mut _async_op: Option<IActivateAudioInterfaceAsyncOperation> = None;
        ActivateAudioInterfaceAsync(
            w!("VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK"),
            &IAudioClient::IID,
            Some(&prop as *const _ as *const _),
            &handler,
        )?;

        let unk = match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(res) => res?,
            Err(_) => return Err(windows_core::Error::from_hresult(E_FAIL)),
        };

        let audio_client: IAudioClient = unk.cast()?;

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

        let event = CreateEventW(None, false, false, None)?;
        let _event_guard = AutoCloseHandle(event);

        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK
                | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            200_000, // 20 ms
            0,
            &wfx.Format as *const _,
            None,
        )?;

        audio_client.SetEventHandle(event)?;
        let capture_client: IAudioCaptureClient = audio_client.GetService()?;
        audio_client.Start()?;

        while !stopper.load(Ordering::Relaxed) {
            let wait_res = WaitForSingleObject(event, 20);
            if stopper.load(Ordering::Relaxed) {
                break;
            }
            if wait_res.0 == 0 {
                // Event signaled
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

                    let num_bytes = (num_frames_read * 8) as usize; // 2 channels * 4 bytes
                    let chunk = if (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0 {
                        vec![0u8; num_bytes]
                    } else {
                        std::slice::from_raw_parts(p_data, num_bytes).to_vec()
                    };

                    let _ = capture_client.ReleaseBuffer(num_frames_read);

                    if !chunk.is_empty() {
                        on_chunk(chunk);
                    }
                }
            }
        }

        let _ = audio_client.Stop();

        Ok(())
    }
}
