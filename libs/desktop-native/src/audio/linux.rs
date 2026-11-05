use crate::audio::{CHUNK_FLOATS, MAX_KEEP_FLOATS};
use crate::{AudioCaptureOptions, AudioStreamInfo, CaptureMode};
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
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub fn is_supported() -> bool {
    static SUPPORTED: OnceLock<bool> = OnceLock::new();
    *SUPPORTED.get_or_init(probe_pipewire)
}

fn probe_pipewire() -> bool {
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
                    if allows_playback_node(props, std::process::id()) {
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

fn node_names(props: &spa::utils::dict::DictRef) -> Vec<String> {
    [
        *pw::keys::APP_NAME,
        *pw::keys::NODE_NAME,
        *pw::keys::NODE_DESCRIPTION,
    ]
    .into_iter()
    .filter_map(|key| props.get(key).map(str::to_string))
    .collect()
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

/// Process-tree membership is folded into the pid so the shared filter rejects the node.
fn allows_playback_node(props: &spa::utils::dict::DictRef, self_pid: u32) -> bool {
    let media_class = props.get(*pw::keys::MEDIA_CLASS).unwrap_or("");
    let pid = props
        .get(*pw::keys::APP_PROCESS_ID)
        .and_then(|value| value.parse::<u32>().ok());
    let effective_pid = if is_konvoez_node(props, self_pid) {
        Some(self_pid)
    } else {
        pid
    };
    let names = node_names(props);
    let name_refs: Vec<&str> = names.iter().map(String::as_str).collect();
    crate::audio::should_capture_playback_node(media_class, effective_pid, self_pid, &name_refs)
}

#[derive(Clone)]
struct ListedNode {
    id: u32,
    media_class: String,
    pid: Option<u32>,
    names: Vec<String>,
}

fn collect_nodes(core: &pw::core::CoreRc, mainloop: &pw::main_loop::MainLoopRc) -> Vec<ListedNode> {
    let Ok(registry) = core.get_registry_rc() else {
        return Vec::new();
    };
    let nodes = Rc::new(RefCell::new(Vec::new()));
    let nodes_clone = nodes.clone();
    let _listener = registry
        .add_listener_local()
        .global(move |obj| {
            if obj.type_ != pw::types::ObjectType::Node {
                return;
            }
            let Some(props) = obj.props else {
                return;
            };
            nodes_clone.borrow_mut().push(ListedNode {
                id: obj.id,
                media_class: props.get(*pw::keys::MEDIA_CLASS).unwrap_or("").to_string(),
                pid: props
                    .get(*pw::keys::APP_PROCESS_ID)
                    .and_then(|value| value.parse().ok()),
                names: node_names(props),
            });
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
    let listed = nodes.borrow().clone();
    listed
}

#[derive(Clone, Copy)]
enum IncludeSelector {
    Pid(u32),
    Node(u32),
}

fn listed_node_is_capture_source(node: &ListedNode, self_pid: u32) -> bool {
    let in_tree = node
        .pid
        .is_some_and(|pid| is_in_process_tree(pid, self_pid));
    let name_refs: Vec<&str> = node.names.iter().map(String::as_str).collect();
    let name_hit = name_refs
        .iter()
        .any(|name| name.to_lowercase().contains("konvoez"));
    let effective_pid = if in_tree || name_hit {
        Some(self_pid)
    } else {
        node.pid
    };
    crate::audio::should_capture_playback_node(
        &node.media_class,
        effective_pid,
        self_pid,
        &name_refs,
    )
}

struct ActiveStream {
    _stream: pw::stream::StreamRc,
    _listener: Box<dyn std::any::Any>,
    ring: Arc<crate::audio::SampleRing>,
}

fn track_stream(
    streams: &RefCell<HashMap<u32, ActiveStream>>,
    rings: &Mutex<Vec<Arc<crate::audio::SampleRing>>>,
    id: u32,
    stream: ActiveStream,
) {
    rings
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .push(Arc::clone(&stream.ring));
    streams.borrow_mut().insert(id, stream);
}

fn forget_stream(
    streams: &RefCell<HashMap<u32, ActiveStream>>,
    rings: &Mutex<Vec<Arc<crate::audio::SampleRing>>>,
    id: u32,
) {
    if let Some(stream) = streams.borrow_mut().remove(&id) {
        rings
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .retain(|ring| !Arc::ptr_eq(ring, &stream.ring));
    }
}

fn create_node_stream(core: &pw::core::CoreRc, node_id: u32) -> Option<ActiveStream> {
    let ring = Arc::new(crate::audio::SampleRing::with_capacity(32768));
    let ring_for_callback = Arc::clone(&ring);

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
                    let offset = data.chunk().offset() as usize;
                    let size = data.chunk().size() as usize;
                    if let Some(slice) = data.data() {
                        if let Some(bytes) = crate::audio::f32_chunk_bytes(slice, offset, size) {
                            crate::audio::push_le_f32(&ring_for_callback, bytes);
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
        ring,
    })
}

pub fn start_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<(JoinHandle<()>, CaptureMode)> {
    let self_pid = std::process::id();
    let exclude_pid = self_pid;
    let capture_mode = options.mode;
    let is_include = capture_mode == CaptureMode::Include;

    if is_include {
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
            let rings: Arc<Mutex<Vec<Arc<crate::audio::SampleRing>>>> =
                Arc::new(Mutex::new(Vec::new()));

            let include_selector = if is_include {
                if let Some(stream_id) = options
                    .target_stream_id
                    .as_deref()
                    .and_then(|id_str| id_str.parse::<u32>().ok())
                {
                    let node = collect_nodes(&core, &mainloop)
                        .into_iter()
                        .find(|listed| listed.id == stream_id);
                    let Some(node) = node else {
                        let _ = ready_tx.send(Err("No matching audio stream".to_string()));
                        return;
                    };
                    if !crate::audio::is_playback_media_class(&node.media_class)
                        || !listed_node_is_capture_source(&node, self_pid)
                    {
                        let _ = ready_tx
                            .send(Err("Cannot capture audio from Konvoez itself".to_string()));
                        return;
                    }
                    Some(match node.pid {
                        Some(pid) => IncludeSelector::Pid(pid),
                        None => IncludeSelector::Node(node.id),
                    })
                } else if let Some(target_pid) = options.target_pid {
                    Some(IncludeSelector::Pid(target_pid))
                } else {
                    let _ = ready_tx.send(Err(
                        "No valid target window or process specified for audio capture".to_string(),
                    ));
                    return;
                }
            } else {
                None
            };

            let Ok(registry) = core.get_registry_rc() else {
                let _ = ready_tx.send(Err("Failed to open the PipeWire registry".to_string()));
                return;
            };
            let active_streams_reg = active_streams.clone();
            let active_streams_rem = active_streams.clone();
            let rings_reg = Arc::clone(&rings);
            let rings_rem = Arc::clone(&rings);
            let core_reg = core.clone();

            let _registry_listener = registry
                .add_listener_local()
                .global(move |obj| {
                    if obj.type_ != pw::types::ObjectType::Node {
                        return;
                    }
                    let Some(props) = obj.props else {
                        return;
                    };
                    let selected = match include_selector {
                        None => true,
                        Some(IncludeSelector::Pid(pid)) => {
                            props
                                .get(*pw::keys::APP_PROCESS_ID)
                                .and_then(|value| value.parse::<u32>().ok())
                                == Some(pid)
                        }
                        Some(IncludeSelector::Node(id)) => obj.id == id,
                    };
                    if selected
                        && allows_playback_node(props, exclude_pid)
                        && !active_streams_reg.borrow().contains_key(&obj.id)
                    {
                        if let Some(stream) = create_node_stream(&core_reg, obj.id) {
                            track_stream(&active_streams_reg, &rings_reg, obj.id, stream);
                        }
                    }
                })
                .global_remove(move |id| {
                    forget_stream(&active_streams_rem, &rings_rem, id);
                })
                .register();

            let ml_weak = mainloop.downgrade();
            let stopper_for_timer = Arc::clone(&stopper_for_thread);
            let stopper_for_mixer = Arc::clone(&stopper_for_thread);
            let stopper_after_run = stopper_for_thread;
            let rings_for_mixer = Arc::clone(&rings);
            let tsfn_for_mixer = Arc::clone(&tsfn);

            let mixer = match std::thread::Builder::new()
                .name("pipewire-mix".to_string())
                .spawn(move || {
                    const MAX_CATCH_UP: usize = 20; // 200 ms
                    let mut chunks: Vec<Vec<f32>> = Vec::new();
                    let mut mixed = vec![0.0f32; CHUNK_FLOATS];
                    let mut bytes = Vec::with_capacity(CHUNK_FLOATS * 4);
                    let mut snapshot: Vec<Arc<crate::audio::SampleRing>> = Vec::new();
                    let mut deadline = Instant::now() + Duration::from_millis(10);
                    while !stopper_for_mixer.load(Ordering::Relaxed) {
                        let now = Instant::now();
                        if now < deadline {
                            std::thread::sleep(deadline - now);
                        }
                        if stopper_for_mixer.load(Ordering::Relaxed) {
                            break;
                        }
                        let mut emitted = 0;
                        while Instant::now() >= deadline {
                            if stopper_for_mixer.load(Ordering::Relaxed) {
                                break;
                            }
                            if emitted == MAX_CATCH_UP {
                                deadline = Instant::now() + Duration::from_millis(10);
                                break;
                            }
                            snapshot.clear();
                            snapshot.extend(
                                rings_for_mixer
                                    .lock()
                                    .unwrap_or_else(|err| err.into_inner())
                                    .iter()
                                    .cloned(),
                            );
                            if !snapshot.is_empty() {
                                if chunks.len() < snapshot.len() {
                                    chunks
                                        .resize_with(snapshot.len(), || vec![0.0f32; CHUNK_FLOATS]);
                                }
                                for (index, ring) in snapshot.iter().enumerate() {
                                    ring.pop_chunk_or_silence(&mut chunks[index], MAX_KEEP_FLOATS);
                                }
                                if snapshot.len() == 1 {
                                    mixed.copy_from_slice(&chunks[0]);
                                } else {
                                    crate::audio::mix_audio_slices(
                                        chunks[..snapshot.len()].iter().map(Vec::as_slice),
                                        &mut mixed,
                                    );
                                }
                                crate::audio::fill_le_bytes(&mixed, &mut bytes);
                                let _ = tsfn_for_mixer.call(
                                    Buffer::from(bytes.as_slice()),
                                    ThreadsafeFunctionCallMode::NonBlocking,
                                );
                            }
                            deadline += Duration::from_millis(10);
                            emitted += 1;
                        }
                    }
                }) {
                Ok(handle) => handle,
                Err(err) => {
                    let _ = ready_tx.send(Err(format!("Failed to start the audio mixer: {err}")));
                    return;
                }
            };

            let timer = mainloop.loop_().add_timer(move |_| {
                if stopper_for_timer.load(Ordering::Relaxed) {
                    if let Some(ml) = ml_weak.upgrade() {
                        ml.quit();
                    }
                }
            });

            timer.update_timer(
                Some(Duration::from_millis(10)),
                Some(Duration::from_millis(10)),
            );

            let _ = ready_tx.send(Ok(()));
            mainloop.run();
            stopper_after_run.store(true, Ordering::SeqCst);
            let _ = mixer.join();
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn PipeWire capture thread: {e}"),
            )
        })?;

    match ready_rx.recv() {
        Ok(Ok(())) => Ok((handle, capture_mode)),
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
