use crate::input::{windows_vk_to_code, KeyHookThread};
use crate::KeyEvent;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG,
    PM_NOREMOVE, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
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
) -> Result<KeyHookThread> {
    let tsfn = Arc::new(
        callback
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?,
    );

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<std::result::Result<u32, String>>();
    let stopper_for_thread = stopper;

    let handle = std::thread::Builder::new()
        .name("windows-key-hook".to_string())
        .spawn(move || {
            // SAFETY: Calling Win32 API to get current thread ID for message queue targeting
            let tid = unsafe { GetCurrentThreadId() };

            let mut msg = MSG {
                hwnd: HWND(std::ptr::null_mut()),
                message: 0,
                wParam: WPARAM(0),
                lParam: LPARAM(0),
                time: 0,
                pt: windows::Win32::Foundation::POINT { x: 0, y: 0 },
            };

            // SAFETY: PeekMessage creates the thread queue before the hook is reported
            // ready, so a WM_QUIT posted from stop() is not discarded.
            unsafe {
                let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
            }

            // SAFETY: SetWindowsHookExW installs WH_KEYBOARD_LL hook on the system
            let hook: HHOOK =
                match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_keyboard_proc), None, 0) }
                {
                    Ok(h) => h,
                    Err(err) => {
                        let _ = ready_tx.send(Err(err.to_string()));
                        return;
                    }
                };

            if let Ok(mut guard) = HOOK_TSFN.lock() {
                *guard = Some(tsfn);
            }
            let _ = ready_tx.send(Ok(tid));

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

    let tid = match ready_rx.recv() {
        Ok(Ok(tid)) => tid,
        Ok(Err(message)) => {
            let _ = handle.join();
            return Err(Error::new(Status::GenericFailure, message));
        }
        Err(err) => {
            let _ = handle.join();
            return Err(Error::new(
                Status::GenericFailure,
                format!("Failed to initialize keyboard hook thread: {err}"),
            ));
        }
    };

    let on_stop: Box<dyn FnOnce() + Send> = Box::new(move || {
        // SAFETY: Posting WM_QUIT to hook thread so GetMessageW wakes up and terminates immediately
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    });

    Ok(KeyHookThread { handle, on_stop })
}
