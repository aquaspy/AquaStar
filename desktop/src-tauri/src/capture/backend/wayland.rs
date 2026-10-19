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
        param::{
            format::{FormatProperties, MediaSubtype, MediaType},
            format_utils,
            video::{VideoFormat, VideoInfoRaw},
            ParamType,
        },
        pod::{self, serialize::PodSerializer, Pod},
        utils::{Direction, Fraction, Rectangle, SpaTypes},
    },
    stream::{StreamFlags, StreamRc},
};
use std::{io::Cursor, sync::atomic::Ordering, time::Duration};
pub fn start() -> Result<Frames, String> {
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
            proxy
                .select_sources(
                    &session,
                    CursorMode::Hidden,
                    SourceType::Window.into(),
                    false,
                    None,
                    PersistMode::DoNot,
                )
                .await
                .map_err(|e| e.to_string())?;
            let response = proxy
                .start(&session, None)
                .await
                .map_err(|e| e.to_string())?
                .response()
                .map_err(|e| e.to_string())?;
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
                .param_changed(|_, format, id, param| {
                    if id != ParamType::Format.as_raw() {
                        return;
                    }
                    if let Some(param) = param {
                        if let Ok((MediaType::Video, MediaSubtype::Raw)) =
                            format_utils::parse_format(param)
                        {
                            let _ = format.parse(param);
                        }
                    }
                })
                .process(move |stream, format| {
                    let Some(mut buffer) = stream.dequeue_buffer() else {
                        return;
                    };
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
                    let mut rgba = vec![0; width * height * 4];
                    for y in 0..height {
                        for x in 0..width {
                            let from = offset + y * stride + x * components;
                            let to = (y * width + x) * 4;
                            match format.format() {
                                VideoFormat::RGBA | VideoFormat::RGBx | VideoFormat::RGB => {
                                    rgba[to..to + 3].copy_from_slice(&bytes[from..from + 3])
                                }
                                VideoFormat::BGRA | VideoFormat::BGRx => {
                                    rgba[to] = bytes[from + 2];
                                    rgba[to + 1] = bytes[from + 1];
                                    rgba[to + 2] = bytes[from];
                                }
                                _ => return,
                            }
                            rgba[to + 3] = 255;
                        }
                    }
                    *latest.lock().unwrap() =
                        xcap::image::RgbaImage::from_raw(size.width, size.height, rgba);
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
                ),
                pod::property!(
                    FormatProperties::VideoFramerate,
                    Choice,
                    Range,
                    Fraction,
                    Fraction { num: 30, denom: 1 },
                    Fraction { num: 1, denom: 1 },
                    Fraction { num: 30, denom: 1 }
                )
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
