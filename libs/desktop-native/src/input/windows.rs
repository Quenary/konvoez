use crate::input::{is_windows_alt_gr_fake_ctrl, windows_vk_to_code, KeyHookThread, KeySlotQueue};
use crate::KeyEvent;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG,
    PM_NOREMOVE, WH_KEYBOARD_LL, WM_APP, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

const KEY_QUEUE_CAP: usize = 256;

type KeyHookTsfn = ThreadsafeFunction<KeyEvent, (), KeyEvent, Status, false>;

thread_local! {
    static KEY_QUEUE: RefCell<KeySlotQueue<KEY_QUEUE_CAP>> =
        const { RefCell::new(KeySlotQueue::new()) };
}

fn enqueue_key(code: &'static str, down: bool) {
    KEY_QUEUE.with(|queue| queue.borrow_mut().push(code, down));
}

fn drain_keys(tsfn: &KeyHookTsfn) {
    let mut pending = [None; KEY_QUEUE_CAP];
    let mut count = 0;
    KEY_QUEUE.with(|queue| {
        let mut queue = queue.borrow_mut();
        while count < pending.len() {
            let Some(slot) = queue.pop() else {
                break;
            };
            pending[count] = Some(slot);
            count += 1;
        }
    });
    for slot in pending.into_iter().take(count).flatten() {
        let _ = tsfn.call(
            KeyEvent {
                code: slot.0.to_string(),
                down: slot.1,
                repeat: false,
            },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
}

// SAFETY: Windows low-level keyboard hook callback.
// The procedure only records the key and wakes the hook thread, then passes
// the event on. JS runs later, from the message loop, so a slow callback
// cannot stall the keyboard.
unsafe extern "system" fn ll_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam.0 as u32;
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        if (is_down || is_up) && lparam.0 != 0 {
            // SAFETY: `lparam` points at a `KBDLLHOOKSTRUCT` for a low-level keyboard hook.
            let kbd = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
            // Right Alt is AltGr: Windows emits a Left Ctrl with scan code 0x21D
            // just before it. That Ctrl is not a key the user pressed.
            if !is_windows_alt_gr_fake_ctrl(kbd.vkCode, kbd.scanCode) {
                let extended = (kbd.flags.0 & 1) != 0;
                if let Some(code_name) = windows_vk_to_code(kbd.vkCode, extended) {
                    enqueue_key(code_name, is_down);
                    // SAFETY: this procedure runs on the thread that installed the hook.
                    let tid = unsafe { GetCurrentThreadId() };
                    let _ = unsafe { PostThreadMessageW(tid, WM_APP, WPARAM(0), LPARAM(0)) };
                }
            }
        }
    }

    // SAFETY: Pass event down the hook chain unconditionally
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

pub fn start_hook(
    callback: Function<KeyEvent, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<KeyHookThread> {
    let tsfn = callback
        .build_threadsafe_function()
        .callee_handled::<false>()
        .build()?;

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
                drain_keys(&tsfn);
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
