use crate::{AudioCaptureOptions, AudioStreamInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use pipewire as pw;
use pw::properties::properties;
use pw::spa;
use spa::param::audio::AudioInfoRaw;
use spa::pod::Pod;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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

pub fn start_capture(
    options: AudioCaptureOptions,
    callback: Function<Buffer, ()>,
    stopper: Arc<AtomicBool>,
) -> Result<JoinHandle<()>> {
    let tsfn = Arc::new(
        callback
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?,
    );

    let handle = std::thread::Builder::new()
        .name("pipewire-capture".to_string())
        .spawn(move || {
            pw::init();

            let Ok(mainloop) = pw::main_loop::MainLoopRc::new(None) else {
                return;
            };
            let Ok(context) = pw::context::ContextRc::new(&mainloop, None) else {
                return;
            };
            let Ok(core) = context.connect_rc(None) else {
                return;
            };

            let mut target_node: Option<u32> = options
                .target_stream_id
                .as_deref()
                .and_then(|id_str| id_str.parse::<u32>().ok());

            if target_node.is_none() && options.mode == "include" {
                if let Some(target_pid) = options.target_pid {
                    let streams = get_audio_streams();
                    if let Some(matching) = streams.into_iter().find(|s| s.pid == Some(target_pid))
                    {
                        target_node = matching.id.parse::<u32>().ok();
                    }
                }
            }

            let mut props = properties! {
                *pw::keys::MEDIA_TYPE => "Audio",
                *pw::keys::MEDIA_CATEGORY => "Capture",
                *pw::keys::MEDIA_ROLE => "Screen",
            };

            if let Some(node_id) = target_node {
                props.insert("target.object", node_id.to_string());
            } else if options.mode == "exclude" {
                props.insert(*pw::keys::STREAM_CAPTURE_SINK, "true");
            }

            let Ok(stream) = pw::stream::StreamBox::new(&core, "konvoez-screen-audio", props)
            else {
                return;
            };

            let tsfn_clone = tsfn.clone();
            let _listener = match stream
                .add_local_listener::<()>()
                .process(move |stream, _| {
                    if let Some(mut buffer) = stream.dequeue_buffer() {
                        let datas = buffer.datas_mut();
                        if !datas.is_empty() {
                            let data = &mut datas[0];
                            let chunk_size = data.chunk().size() as usize;
                            if let Some(slice) = data.data() {
                                if slice.len() >= chunk_size && chunk_size > 0 {
                                    let bytes = &slice[..chunk_size];
                                    let _ = tsfn_clone.call(
                                        Buffer::from(bytes.to_vec()),
                                        ThreadsafeFunctionCallMode::NonBlocking,
                                    );
                                }
                            }
                        }
                    }
                })
                .register()
            {
                Ok(l) => l,
                Err(_) => return,
            };

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

            let Ok((cursor, _)) = serialize_res else {
                return;
            };

            let values = cursor.into_inner();
            let Some(pod) = Pod::from_bytes(&values) else {
                return;
            };
            let mut params = [pod];

            let connect_res = stream.connect(
                spa::utils::Direction::Input,
                target_node,
                pw::stream::StreamFlags::AUTOCONNECT
                    | pw::stream::StreamFlags::MAP_BUFFERS
                    | pw::stream::StreamFlags::RT_PROCESS,
                &mut params,
            );

            if connect_res.is_err() {
                return;
            }

            let ml_weak = mainloop.downgrade();
            let stopper_clone = stopper.clone();
            let timer = mainloop.loop_().add_timer(move |_| {
                if stopper_clone.load(Ordering::Relaxed) {
                    if let Some(ml) = ml_weak.upgrade() {
                        ml.quit();
                    }
                }
            });
            timer.update_timer(
                Some(Duration::from_millis(20)),
                Some(Duration::from_millis(20)),
            );

            mainloop.run();
        })
        .map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to spawn PipeWire capture thread: {e}"),
            )
        })?;

    Ok(handle)
}
