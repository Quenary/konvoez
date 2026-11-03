use crate::{AudioCaptureOptions, AudioStreamInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use pipewire as pw;
use pw::properties::properties;
use pw::spa;
use spa::param::audio::AudioInfoRaw;
use spa::pod::Pod;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

pub fn is_supported() -> bool {
    pw::init();
    let Ok(mainloop) = pw::main_loop::MainLoopRc::new(None) else {
        return false;
    };
    let Ok(context) = pw::context::ContextRc::new(&mainloop, None) else {
        return false;
    };
    context.connect_rc(None).is_ok()
}

pub fn get_audio_streams() -> Vec<AudioStreamInfo> {
    pw::init();
    let Ok(mainloop) = pw::main_loop::MainLoopRc::new(None) else {
        return Vec::new();
    };
    let Ok(context) = pw::context::ContextRc::new(&mainloop, None) else {
        return Vec::new();
    };
    let Ok(core) = context.connect_rc(None) else {
        return Vec::new();
    };
    let Ok(registry) = core.get_registry_rc() else {
        return Vec::new();
    };

    let streams = Rc::new(RefCell::new(Vec::new()));
    let streams_clone = streams.clone();

    let _listener = registry
        .add_listener_local()
        .global(move |obj| {
            if obj.type_ == pw::types::ObjectType::Node {
                if let Some(props) = obj.props {
                    let media_class = props.get(*pw::keys::MEDIA_CLASS).unwrap_or("");
                    if media_class.contains("Audio")
                        && (media_class.contains("Output") || media_class.contains("Stream"))
                    {
                        let name = props
                            .get(*pw::keys::APP_NAME)
                            .or_else(|| props.get(*pw::keys::NODE_DESCRIPTION))
                            .or_else(|| props.get(*pw::keys::NODE_NAME))
                            .unwrap_or("Audio Application")
                            .to_string();

                        let pid = props
                            .get(*pw::keys::APP_PROCESS_ID)
                            .and_then(|p| p.parse::<u32>().ok());

                        streams_clone.borrow_mut().push(AudioStreamInfo {
                            id: obj.id.to_string(),
                            name,
                            pid,
                        });
                    }
                }
            }
        })
        .register();

    let ml_weak = mainloop.downgrade();
    let Ok(sync_seq) = core.sync(0) else {
        return Vec::new();
    };

    let _core_listener = core
        .add_listener_local()
        .done(move |_id, seq| {
            if seq == sync_seq {
                if let Some(ml) = ml_weak.upgrade() {
                    ml.quit();
                }
            }
        })
        .register();

    mainloop.run();

    let res = streams.borrow().clone();
    res
}

fn is_in_process_tree(pid: u32, root_pid: u32) -> bool {
    if pid == root_pid {
        return true;
    }
    let mut current = pid;
    for _ in 0..10 {
        if let Ok(stat) = std::fs::read_to_string(format!("/proc/{current}/stat")) {
            if let Some(r_paren) = stat.rfind(')') {
                let rest = &stat[r_paren + 1..];
                let mut parts = rest.split_whitespace();
                let _state = parts.next();
                if let Some(ppid_str) = parts.next() {
                    if let Ok(ppid) = ppid_str.parse::<u32>() {
                        if ppid == root_pid {
                            return true;
                        }
                        if ppid <= 1 || ppid == current {
                            break;
                        }
                        current = ppid;
                        continue;
                    }
                }
            }
        }
        break;
    }
    false
}

fn is_konvoez_node(props: &spa::utils::dict::DictRef, exclude_pid: u32) -> bool {
    if let Some(pid_str) = props.get(*pw::keys::APP_PROCESS_ID) {
        if let Ok(pid) = pid_str.parse::<u32>() {
            if is_in_process_tree(pid, exclude_pid) {
                return true;
            }
        }
    }
    for key in &[
        *pw::keys::APP_NAME,
        *pw::keys::NODE_NAME,
        *pw::keys::NODE_DESCRIPTION,
    ] {
        if let Some(val) = props.get(key) {
            if val.to_lowercase().contains("konvoez") {
                return true;
            }
        }
    }
    false
}

struct ActiveStream {
    _stream: pw::stream::StreamRc,
    _listener: Box<dyn std::any::Any>,
    queue: Arc<Mutex<Vec<f32>>>,
}

fn create_node_stream(core: &pw::core::CoreRc, node_id: u32) -> Option<ActiveStream> {
    let queue = Arc::new(Mutex::new(Vec::with_capacity(4800)));
    let queue_clone = queue.clone();

    let props = properties! {
        *pw::keys::MEDIA_TYPE => "Audio",
        *pw::keys::MEDIA_CATEGORY => "Capture",
        *pw::keys::MEDIA_ROLE => "Screen",
        "target.object" => node_id.to_string(),
    };

    let stream = pw::stream::StreamRc::new(core.clone(), "konvoez-screen-audio", props).ok()?;

    let listener = stream
        .add_local_listener::<()>()
        .process(move |stream, _| {
            if let Some(mut buffer) = stream.dequeue_buffer() {
                let datas = buffer.datas_mut();
                if !datas.is_empty() {
                    let data = &mut datas[0];
                    let chunk_size = data.chunk().size() as usize;
                    if let Some(slice) = data.data() {
                        if slice.len() >= chunk_size && chunk_size >= 4 {
                            let floats_len = chunk_size / 4;
                            let ptr = slice.as_ptr();
                            let is_aligned =
                                (ptr as usize).is_multiple_of(std::mem::align_of::<f32>());
                            if let Ok(mut q) = queue_clone.lock() {
                                if is_aligned {
                                    // SAFETY: Checked pointer alignment and slice length
                                    let floats: &[f32] = unsafe {
                                        std::slice::from_raw_parts(ptr as *const f32, floats_len)
                                    };
                                    q.extend_from_slice(floats);
                                } else {
                                    // Fallback for unaligned SPA buffers
                                    let (chunks, _) = slice[..floats_len * 4].as_chunks::<4>();
                                    for bytes in chunks {
                                        q.push(f32::from_ne_bytes(*bytes));
                                    }
                                }
                                const MAX_SAMPLES: usize = 19200;
                                if q.len() > MAX_SAMPLES {
                                    let overflow = q.len() - MAX_SAMPLES;
                                    q.drain(0..overflow);
                                }
                            }
                        }
                    }
                }
            }
        })
        .register()
        .ok()?;

    let mut audio_info = AudioInfoRaw::new();
    audio_info.set_format(spa::param::audio::AudioFormat::F32LE);
    audio_info.set_rate(48000);
    audio_info.set_channels(2);

    let obj = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: spa::param::ParamType::EnumFormat.as_raw(),
        properties: audio_info.into(),
    };

    let serialize_res = spa::pod::serialize::PodSerializer::serialize(
        std::io::Cursor::new(Vec::new()),
        &spa::pod::Value::Object(obj),
    );

    let (cursor, _) = serialize_res.ok()?;
    let values = cursor.into_inner();
    let pod = Pod::from_bytes(&values)?;
    let mut params = [pod];

    let connect_res = stream.connect(
        spa::utils::Direction::Input,
        Some(node_id),
        pw::stream::StreamFlags::AUTOCONNECT
            | pw::stream::StreamFlags::MAP_BUFFERS
            | pw::stream::StreamFlags::RT_PROCESS,
        &mut params,
    );

    if connect_res.is_err() {
        return None;
    }

    Some(ActiveStream {
        _stream: stream,
        _listener: Box::new(listener),
        queue,
    })
}

pub fn start_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<JoinHandle<()>> {
    let self_pid = std::process::id();
    let exclude_pid = options.target_pid.unwrap_or(self_pid);

    if options.mode == "include" {
        if let Some(pid) = options.target_pid {
            if is_in_process_tree(pid, self_pid) {
                return Err(Error::new(
                    Status::GenericFailure,
                    "Cannot capture audio from Konvoez itself".to_string(),
                ));
            }
        }
    }

    let tsfn = Arc::new(
        callback
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?,
    );
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<std::result::Result<(), String>>();
    let stopper_for_thread = Arc::clone(&stopper);

    let handle = std::thread::Builder::new()
        .name("pipewire-capture".to_string())
        .spawn(move || {
            pw::init();

            let Ok(mainloop) = pw::main_loop::MainLoopRc::new(None) else {
                let _ = ready_tx.send(Err("Failed to create a PipeWire main loop".to_string()));
                return;
            };
            let Ok(context) = pw::context::ContextRc::new(&mainloop, None) else {
                let _ = ready_tx.send(Err("Failed to create a PipeWire context".to_string()));
                return;
            };
            let Ok(core) = context.connect_rc(None) else {
                let _ = ready_tx.send(Err("Failed to connect to PipeWire".to_string()));
                return;
            };

            let active_streams: Rc<RefCell<HashMap<u32, ActiveStream>>> =
                Rc::new(RefCell::new(HashMap::new()));

            let mut _registry_listener = None;

            if options.mode == "include" {
                let mut target_node: Option<u32> = options
                    .target_stream_id
                    .as_deref()
                    .and_then(|id_str| id_str.parse::<u32>().ok());

                if target_node.is_none() {
                    if let Some(target_pid) = options.target_pid {
                        let streams = get_audio_streams();
                        if let Some(matching) =
                            streams.into_iter().find(|s| s.pid == Some(target_pid))
                        {
                            target_node = matching.id.parse::<u32>().ok();
                        }
                    }
                }

                if let Some(node_id) = target_node {
                    if let Some(stream) = create_node_stream(&core, node_id) {
                        active_streams.borrow_mut().insert(node_id, stream);
                    }
                }
                if active_streams.borrow().is_empty() {
                    let _ = ready_tx.send(Err("No matching audio stream".to_string()));
                    return;
                }
            } else if let Ok(registry) = core.get_registry_rc() {
                let active_streams_reg = active_streams.clone();
                let active_streams_rem = active_streams.clone();
                let core_reg = core.clone();

                _registry_listener = Some(
                    registry
                        .add_listener_local()
                        .global(move |obj| {
                            if obj.type_ == pw::types::ObjectType::Node {
                                if let Some(props) = obj.props {
                                    let media_class =
                                        props.get(*pw::keys::MEDIA_CLASS).unwrap_or("");
                                    if media_class.contains("Audio")
                                        && (media_class.contains("Output")
                                            || media_class.contains("Stream"))
                                        && !is_konvoez_node(props, exclude_pid)
                                        && !active_streams_reg.borrow().contains_key(&obj.id)
                                    {
                                        if let Some(stream) = create_node_stream(&core_reg, obj.id)
                                        {
                                            active_streams_reg.borrow_mut().insert(obj.id, stream);
                                        }
                                    }
                                }
                            }
                        })
                        .global_remove(move |id| {
                            active_streams_rem.borrow_mut().remove(&id);
                        })
                        .register(),
                );
            } else {
                let _ = ready_tx.send(Err("Failed to open the PipeWire registry".to_string()));
                return;
            }

            let ml_weak = mainloop.downgrade();
            let stopper_clone = stopper_for_thread;
            let active_streams_timer = active_streams;
            let tsfn_clone = tsfn;

            const CHUNK_FLOATS: usize = 960; // 10 ms at 48000 Hz stereo
            let mixed_buffer = RefCell::new(vec![0.0f32; CHUNK_FLOATS]);
            let stream_buffers = RefCell::new(Vec::<Vec<f32>>::new());

            let timer = mainloop.loop_().add_timer(move |_| {
                if stopper_clone.load(Ordering::Relaxed) {
                    if let Some(ml) = ml_weak.upgrade() {
                        ml.quit();
                    }
                    return;
                }

                let streams_guard = active_streams_timer.borrow();
                let mut ready_count = 0;
                let mut stream_bufs = stream_buffers.borrow_mut();

                for active in streams_guard.values() {
                    if let Ok(mut q) = active.queue.lock() {
                        if q.len() >= CHUNK_FLOATS {
                            if stream_bufs.len() <= ready_count {
                                stream_bufs.push(vec![0.0f32; CHUNK_FLOATS]);
                            }
                            stream_bufs[ready_count].copy_from_slice(&q[..CHUNK_FLOATS]);
                            q.drain(0..CHUNK_FLOATS);
                            ready_count += 1;
                        }
                    }
                }

                if ready_count == 0 {
                    return;
                }

                let final_bytes = if ready_count == 1 {
                    crate::audio::float32_to_le_bytes(&stream_bufs[0])
                } else {
                    let mut mixed_buf = mixed_buffer.borrow_mut();
                    let slices: Vec<&[f32]> = stream_bufs[..ready_count]
                        .iter()
                        .map(|c| c.as_slice())
                        .collect();
                    crate::audio::mix_audio_buffers(&slices, &mut mixed_buf);
                    crate::audio::float32_to_le_bytes(&mixed_buf)
                };

                let _ = tsfn_clone.call(
                    Buffer::from(final_bytes),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
            });

            timer.update_timer(
                Some(Duration::from_millis(10)),
                Some(Duration::from_millis(10)),
            );

            let _ = ready_tx.send(Ok(()));
            mainloop.run();
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn PipeWire capture thread: {e}"),
            )
        })?;

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(handle),
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
