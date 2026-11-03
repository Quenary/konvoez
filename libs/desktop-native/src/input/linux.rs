use crate::input::{x11_keycode_to_code, KeyHookThread};
use crate::KeyEvent;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto;
use x11rb::wrapper::ConnectionExt;
use x11rb::x11_utils::TryParse;

pub fn is_supported() -> bool {
    // Wayland sessions do not support XRecord passive global hooks
    if std::env::var("XDG_SESSION_TYPE")
        .map(|v| v.to_lowercase() == "wayland")
        .unwrap_or(false)
    {
        return false;
    }

    if std::env::var("DISPLAY").is_err() {
        return false;
    }

    let Ok((conn, _)) = x11rb::connect(None) else {
        return false;
    };

    conn.extension_information(record::X11_EXTENSION_NAME)
        .ok()
        .flatten()
        .is_some()
}

pub fn start_hook(
    callback: Function<KeyEvent, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<KeyHookThread> {
    let (ctrl_conn, _) = x11rb::connect(None).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to connect to X11 control socket: {e}"),
        )
    })?;

    let (data_conn, _) = x11rb::connect(None).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to connect to X11 data socket: {e}"),
        )
    })?;

    if ctrl_conn
        .extension_information(record::X11_EXTENSION_NAME)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?
        .is_none()
    {
        return Err(Error::new(
            Status::GenericFailure,
            "X11 server does not support the RECORD extension".to_string(),
        ));
    }

    let rc = ctrl_conn.generate_id().map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to generate X11 ID: {e}"),
        )
    })?;

    let empty = record::Range8 { first: 0, last: 0 };
    let empty_ext = record::ExtRange {
        major: empty,
        minor: record::Range16 { first: 0, last: 0 },
    };
    let range = record::Range {
        core_requests: empty,
        core_replies: empty,
        ext_requests: empty_ext,
        ext_replies: empty_ext,
        delivered_events: empty,
        device_events: record::Range8 {
            first: xproto::KEY_PRESS_EVENT,
            last: xproto::KEY_RELEASE_EVENT,
        },
        errors: empty,
        client_started: false,
        client_died: false,
    };

    ctrl_conn
        .record_create_context(rc, 0, &[record::CS::ALL_CLIENTS.into()], &[range])
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?
        .check()
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;

    let tsfn = Arc::new(
        callback
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?,
    );

    let stopper_data = stopper.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<std::result::Result<(), String>>();
    let handle = std::thread::Builder::new()
        .name("x11-key-hook".to_string())
        .spawn(move || {
            const RECORD_FROM_SERVER: u8 = 0;
            let cookie = match data_conn.record_enable_context(rc) {
                Ok(c) => c,
                Err(err) => {
                    let _ = ready_tx.send(Err(err.to_string()));
                    return;
                }
            };
            if let Err(err) = data_conn.flush() {
                let _ = ready_tx.send(Err(err.to_string()));
                return;
            }
            let _ = ready_tx.send(Ok(()));

            for reply in cookie {
                if stopper_data.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(reply) = reply else {
                    break;
                };

                if reply.category == RECORD_FROM_SERVER {
                    let mut data = &reply.data[..];
                    while !data.is_empty() {
                        let event_type = data[0];
                        if event_type == xproto::KEY_PRESS_EVENT
                            || event_type == xproto::KEY_RELEASE_EVENT
                        {
                            if data.len() < 32 {
                                break;
                            }
                            let keycode = data[1];
                            let is_down = event_type == xproto::KEY_PRESS_EVENT;
                            if let Some(code_name) = x11_keycode_to_code(keycode) {
                                let _ = tsfn.call(
                                    KeyEvent {
                                        code: code_name.to_string(),
                                        down: is_down,
                                    },
                                    ThreadsafeFunctionCallMode::NonBlocking,
                                );
                            }
                            data = &data[32..];
                        } else if event_type == 0 {
                            if data.len() < 8 {
                                break;
                            }
                            let Ok((length, _)) = u32::try_parse(&data[4..]) else {
                                break;
                            };
                            let total = (length as usize) * 4 + 32;
                            if data.len() < total {
                                break;
                            }
                            data = &data[total..];
                        } else {
                            if data.len() < 32 {
                                break;
                            }
                            data = &data[32..];
                        }
                    }
                }
            }
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn X11 hook thread: {e}"),
            )
        })?;

    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(message)) => {
            let _ = handle.join();
            return Err(Error::new(Status::GenericFailure, message));
        }
        Err(err) => {
            let _ = handle.join();
            return Err(Error::new(
                Status::GenericFailure,
                format!("Failed to initialize X11 key hook: {err}"),
            ));
        }
    }

    let on_stop: Box<dyn FnOnce() + Send> = Box::new(move || {
        let _ = ctrl_conn.record_disable_context(rc);
        let _ = ctrl_conn.sync();
    });

    Ok(KeyHookThread { handle, on_stop })
}
