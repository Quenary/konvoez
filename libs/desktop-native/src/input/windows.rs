use crate::input::windows_vk_to_code;
use crate::KeyEvent;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
    WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

type KeyHookTsfn = ThreadsafeFunction<KeyEvent, (), KeyEvent, Status, false>;
static HOOK_TSFN: Mutex<Option<Arc<KeyHookTsfn>>> = Mutex::new(None);

// SAFETY: Windows low-level keyboard hook callback.
// Always calls CallNextHookEx so keys are never consumed or swallowed.
unsafe extern "system" fn ll_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam.0 as u32;
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

        if is_down || is_up {
            if lparam.0 != 0 {
                let kbd = *(lparam.0 as *const KBDLLHOOKSTRUCT);
                let extended = (kbd.flags.0 & 1) != 0;
                if let Some(code_name) = windows_vk_to_code(kbd.vkCode, extended) {
                    if let Ok(guard) = HOOK_TSFN.lock() {
                        if let Some(ref tsfn) = *guard {
                            let _ = tsfn.call(
                                KeyEvent {
                                    code: code_name.to_string(),
                                    down: is_down,
                                },
                                ThreadsafeFunctionCallMode::NonBlocking,
                            );
                        }
                    }
                }
            }
        }
    }

    // SAFETY: Pass event down the hook chain unconditionally
    CallNextHookEx(None, code, wparam, lparam)
}

pub fn start_hook(
    callback: Function<KeyEvent, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<JoinHandle<()>> {
    let tsfn = Arc::new(
        callback
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?,
    );

    let thread_id = Arc::new(AtomicU32::new(0));
    let thread_id_for_hook = thread_id.clone();
    let stopper_for_thread = stopper.clone();

    let handle = std::thread::Builder::new()
        .name("windows-key-hook".to_string())
        .spawn(move || {
            // SAFETY: Calling Win32 API to get current thread ID for message queue targeting
            let tid = unsafe { GetCurrentThreadId() };
            thread_id_for_hook.store(tid, Ordering::SeqCst);

            // Install hook
            // SAFETY: SetWindowsHookExW installs WH_KEYBOARD_LL hook on the system
            let hook: HHOOK =
                match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_keyboard_proc), None, 0) }
                {
                    Ok(h) => h,
                    Err(_) => return,
                };

            if let Ok(mut guard) = HOOK_TSFN.lock() {
                *guard = Some(tsfn);
            }

            let mut msg = MSG {
                hwnd: HWND(std::ptr::null_mut()),
                message: 0,
                wParam: WPARAM(0),
                lParam: LPARAM(0),
                time: 0,
                pt: windows::Win32::Foundation::POINT { x: 0, y: 0 },
            };

            // Standard Win32 message loop required for WH_KEYBOARD_LL
            // SAFETY: GetMessageW pump for the hook thread
            while !stopper_for_thread.load(Ordering::Relaxed) {
                let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
                if ret.0 <= 0 || msg.message == WM_QUIT {
                    break;
                }
                // SAFETY: Standard message translation and dispatch
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }

            // Cleanup
            if let Ok(mut guard) = HOOK_TSFN.lock() {
                *guard = None;
            }

            // SAFETY: Unhooking the global keyboard hook
            unsafe {
                let _ = UnhookWindowsHookEx(hook);
            }
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn keyboard hook thread: {e}"),
            )
        })?;

    // Monitor thread to post WM_QUIT when stopper is signaled
    let stopper_monitor = stopper;
    std::thread::spawn(move || {
        while !stopper_monitor.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let tid = thread_id.load(Ordering::SeqCst);
        if tid != 0 {
            // SAFETY: Posting WM_QUIT to hook thread so GetMessageW wakes up and terminates
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    });

    Ok(handle)
}
