#[path = "authorization.rs"]
mod authorization;
use super::Frames;
use ashpd::desktop::{
    screencast::{CursorMode, Screencast, SourceType},
    PersistMode,
};
use pipewire::{
    context::ContextRc,
    main_loop::MainLoopRc,
    properties,
    spa::{
        buffer::meta::MetaVideoCrop,
        param::{
            format::{FormatProperties, MediaSubtype, MediaType},
            format_utils,
            video::{VideoFormat, VideoInfoRaw},
            ParamType,
        },
        pod::{self, serialize::PodSerializer, Pod},
        utils::{Direction, Rectangle, SpaTypes},
    },
    stream::{StreamFlags, StreamRc},
};
use std::{io::Cursor, sync::atomic::Ordering, time::Duration};
pub fn start(pid: u32, authorization_path: Option<std::path::PathBuf>) -> Result<Frames, String> {
    let frames = Frames::new();
    let latest = frames.latest.clone();
    let error = frames.error.clone();
    let stop = frames.stop.clone();
    std::thread::spawn(move || {
        let result = tauri::async_runtime::block_on(async {
            let proxy = Screencast::new().await.map_err(|e| e.to_string())?;
            if !proxy
                .available_source_types()
                .await
                .map_err(|e| e.to_string())?
                .contains(SourceType::Window)
            {
                return Err("This desktop does not support window capture. Monitor capture will not be used instead.".into());
            }
            let session = proxy.create_session().await.map_err(|e| e.to_string())?;
            let restore_token = authorization_path
                .as_ref()
                .and_then(|p| authorization::take(p, pid));
            proxy
                .select_sources(
                    &session,
                    CursorMode::Hidden,
                    SourceType::Window.into(),
                    false,
                    restore_token.as_deref(),
                    if authorization_path.is_some() {
                        PersistMode::ExplicitlyRevoked
                    } else {
                        PersistMode::DoNot
                    },
                )
                .await
                .map_err(|e| e.to_string())?;
            let response = proxy
                .start(&session, None)
                .await
                .map_err(|e| e.to_string())?
                .response()
                .map_err(|e| e.to_string())?;
            if let (Some(path), Some(token)) =
                (authorization_path.as_ref(), response.restore_token())
            {
                authorization::save(path, pid, token)?;
            }
            let selected = response
                .streams()
                .first()
                .ok_or("No window was selected.")?;
            if selected
                .source_type()
                .is_some_and(|s| s != SourceType::Window)
            {
                return Err("Select a game window, not a monitor.".into());
            }
            let node = selected.pipe_wire_node_id();
            let fd = proxy
                .open_pipe_wire_remote(&session)
                .await
                .map_err(|e| e.to_string())?;
            pipewire::init();
            let main_loop = MainLoopRc::new(None).map_err(|e| e.to_string())?;
            let context = ContextRc::new(&main_loop, None).map_err(|e| e.to_string())?;
            let core = context.connect_fd_rc(fd, None).map_err(|e| e.to_string())?;
            let stream=StreamRc::new(core,"AquaStar game capture",properties::properties!{"media.type"=>"Video","media.category"=>"Capture","media.role"=>"Screen"}).map_err(|e|e.to_string())?;
            let errors = error.clone();
            let received = latest.clone();
            let format_errors = error.clone();
            let _listener = stream
                .add_local_listener_with_user_data(VideoInfoRaw::default())
                .state_changed(move |_, _, _, state| {
                    if matches!(state, pipewire::stream::StreamState::Error(_))
                        || (matches!(state, pipewire::stream::StreamState::Unconnected)
                            && received.lock().unwrap().is_some())
                    {
                        *errors.lock().unwrap() = Some(format!("Window stream failed: {state:?}"));
                    }
                })
                .param_changed(move |stream, format, id, param| {
                    if id != ParamType::Format.as_raw() {
                        return;
                    }
                    if let Some(param) = param {
                        if let Ok((MediaType::Video, MediaSubtype::Raw)) =
                            format_utils::parse_format(param)
                        {
                            if format.parse(param).is_ok() {
                                let result = crop_metadata_param().and_then(|bytes| {
                                    let mut params = [Pod::from_bytes(&bytes)
                                        .ok_or("Invalid crop metadata request")?];
                                    stream.update_params(&mut params).map_err(|e| e.to_string())
                                });
                                if let Err(message) = result {
                                    *format_errors.lock().unwrap() = Some(message);
                                }
                            }
                        }
                    }
                })
                .process(move |stream, format| {
                    let Some(mut buffer) = stream.dequeue_buffer() else {
                        return;
                    };
                    let crop = buffer.find_meta::<MetaVideoCrop>().and_then(|meta| {
                        let region = meta.meta_region();
                        region
                            .is_valid()
                            .then(|| (region.position(), region.size()))
                    });
                    let Some(data) = buffer.datas_mut().first_mut() else {
                        return;
                    };
                    let size = format.size();
                    let width = size.width as usize;
                    let height = size.height as usize;
                    if width == 0 || height == 0 || width.saturating_mul(height) > 16_777_216 {
                        return;
                    }
                    let offset = data.chunk().offset() as usize;
                    let stride = data.chunk().stride();
                    if stride <= 0 {
                        return;
                    }
                    let stride = stride as usize;
                    let Some(bytes) = data.data() else {
                        return;
                    };
                    let components = if format.format() == VideoFormat::RGB {
                        3
                    } else {
                        4
                    };
                    if offset
                        .saturating_add((height - 1) * stride)
                        .saturating_add(width * components)
                        > bytes.len()
                    {
                        return;
                    }
                    let (left, top, output_width, output_height) = crop
                        .and_then(|(position, size)| {
                            let left = usize::try_from(position.x).ok()?;
                            let top = usize::try_from(position.y).ok()?;
                            let w = size.width as usize;
                            let h = size.height as usize;
                            (left.checked_add(w)? <= width && top.checked_add(h)? <= height)
                                .then_some((left, top, w, h))
                        })
                        .unwrap_or((0, 0, width, height));
                    let mut rgba = vec![0; output_width * output_height * 4];
                    for y in 0..output_height {
                        let from = offset + (top + y) * stride + left * components;
                        let input = &bytes[from..from + output_width * components];
                        let output = &mut rgba[y * output_width * 4..(y + 1) * output_width * 4];
                        for (source, pixel) in input
                            .chunks_exact(components)
                            .zip(output.chunks_exact_mut(4))
                        {
                            match format.format() {
                                VideoFormat::RGBA | VideoFormat::RGBx | VideoFormat::RGB => {
                                    pixel[..3].copy_from_slice(&source[..3])
                                }
                                VideoFormat::BGRA | VideoFormat::BGRx => {
                                    pixel[0] = source[2];
                                    pixel[1] = source[1];
                                    pixel[2] = source[0];
                                }
                                _ => return,
                            }
                            pixel[3] = 255;
                        }
                    }
                    *latest.lock().unwrap() = xcap::image::RgbaImage::from_raw(
                        output_width as u32,
                        output_height as u32,
                        rgba,
                    );
                })
                .register()
                .map_err(|e| e.to_string())?;
            let object = pod::object!(
                SpaTypes::ObjectParamFormat,
                ParamType::EnumFormat,
                pod::property!(FormatProperties::MediaType, Id, MediaType::Video),
                pod::property!(FormatProperties::MediaSubtype, Id, MediaSubtype::Raw),
                pod::property!(
                    FormatProperties::VideoFormat,
                    Choice,
                    Enum,
                    Id,
                    VideoFormat::RGBA,
                    VideoFormat::RGBA,
                    VideoFormat::RGBx,
                    VideoFormat::BGRA,
                    VideoFormat::BGRx
                ),
                pod::property!(
                    FormatProperties::VideoSize,
                    Choice,
                    Range,
                    Rectangle,
                    Rectangle {
                        width: 1280,
                        height: 720
                    },
                    Rectangle {
                        width: 1,
                        height: 1
                    },
                    Rectangle {
                        width: 8192,
                        height: 8192
                    }
                ) // Portal streams may advertise a variable 0/1 frame rate or a refresh
                  // rate above 30 FPS. The recorder samples them on its own 30 FPS clock.
            );
            let bytes =
                PodSerializer::serialize(Cursor::new(Vec::new()), &pod::Value::Object(object))
                    .map_err(|e| e.to_string())?
                    .0
                    .into_inner();
            let mut params = [Pod::from_bytes(&bytes).ok_or("Invalid video format negotiation")?];
            stream
                .connect(
                    Direction::Input,
                    Some(node),
                    StreamFlags::AUTOCONNECT | StreamFlags::MAP_BUFFERS,
                    &mut params,
                )
                .map_err(|e| e.to_string())?;
            let quit = main_loop.clone();
            let flag = stop.clone();
            let timer = main_loop.loop_().add_timer(move |_| {
                if flag.load(Ordering::SeqCst) {
                    quit.quit();
                }
            });
            timer
                .update_timer(
                    Some(Duration::from_millis(20)),
                    Some(Duration::from_millis(20)),
                )
                .into_result()
                .map_err(|e| e.to_string())?;
            main_loop.run();
            let _ = stream.disconnect();
            let _ = session.close().await;
            Ok::<(), String>(())
        });
        if let Err(message) = result {
            *error.lock().unwrap() = Some(message);
        }
    });
    Ok(frames)
}

fn crop_metadata_param() -> Result<Vec<u8>, String> {
    use pipewire::spa::{sys, utils::Id};
    let object = pod::Object {
        type_: SpaTypes::ObjectParamMeta.as_raw(),
        id: ParamType::Meta.as_raw(),
        properties: vec![
            pod::Property {
                key: sys::SPA_PARAM_META_type,
                flags: pod::PropertyFlags::empty(),
                value: pod::Value::Id(Id(sys::SPA_META_VideoCrop)),
            },
            pod::Property {
                key: sys::SPA_PARAM_META_size,
                flags: pod::PropertyFlags::empty(),
                value: pod::Value::Int(std::mem::size_of::<sys::spa_meta_region>() as i32),
            },
        ],
    };
    PodSerializer::serialize(Cursor::new(Vec::new()), &pod::Value::Object(object))
        .map(|result| result.0.into_inner())
        .map_err(|e| e.to_string())
}
