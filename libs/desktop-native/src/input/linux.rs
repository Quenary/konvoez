use crate::input::{coalesce_x11_autorepeat, parse_x11_record_keys, KeyHookThread};
use crate::KeyEvent;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto;
use x11rb::wrapper::ConnectionExt;

fn release_record_context(conn: &impl Connection, context: u32) {
    let _ = conn.record_disable_context(context);
    let _ = conn.record_free_context(context);
    let _ = conn.sync();
}

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

    if let Err(err) = ctrl_conn
        .record_create_context(rc, 0, &[record::CS::ALL_CLIENTS.into()], &[range])
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
        .and_then(|cookie| {
            cookie
                .check()
                .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
        })
    {
        release_record_context(&ctrl_conn, rc);
        return Err(err);
    }

    let tsfn = match callback
        .build_threadsafe_function()
        .callee_handled::<false>()
        .build()
    {
        Ok(tsfn) => Arc::new(tsfn),
        Err(err) => {
            release_record_context(&ctrl_conn, rc);
            return Err(err);
        }
    };

    let stopper_data = stopper.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<std::result::Result<(), String>>();
    let handle = match std::thread::Builder::new()
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
                    for event in coalesce_x11_autorepeat(&parse_x11_record_keys(&reply.data)) {
                        let _ = tsfn.call(
                            KeyEvent {
                                code: event.code.to_string(),
                                down: event.down,
                                repeat: event.repeat,
                            },
                            ThreadsafeFunctionCallMode::NonBlocking,
                        );
                    }
                }
            }
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn X11 hook thread: {e}"),
            )
        }) {
        Ok(handle) => handle,
        Err(err) => {
            release_record_context(&ctrl_conn, rc);
            return Err(err);
        }
    };

    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(message)) => {
            let _ = handle.join();
            release_record_context(&ctrl_conn, rc);
            return Err(Error::new(Status::GenericFailure, message));
        }
        Err(err) => {
            let _ = handle.join();
            release_record_context(&ctrl_conn, rc);
            return Err(Error::new(
                Status::GenericFailure,
                format!("Failed to initialize X11 key hook: {err}"),
            ));
        }
    }

    let on_stop: Box<dyn FnOnce() + Send> = Box::new(move || {
        release_record_context(&ctrl_conn, rc);
    });

    Ok(KeyHookThread { handle, on_stop })
}
