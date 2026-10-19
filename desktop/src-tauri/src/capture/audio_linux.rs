use super::*;
use libpulse_binding as pulse;
use pulse::{
    callbacks::ListResult,
    context::{Context, FlagSet, State},
    mainloop::standard::{IterateResult, Mainloop},
    sample::{Format, Spec},
    stream::{PeekResult, Stream},
};
use std::{cell::RefCell, rc::Rc, time::Instant};
pub fn available(_pid: u32) -> bool {
    std::env::var_os("PULSE_SERVER").is_some()
        || std::env::var_os("XDG_RUNTIME_DIR")
            .is_some_and(|root| std::path::PathBuf::from(root).join("pulse/native").exists())
}
fn tick(loop_: &mut Mainloop, deadline: Instant) -> Result<(), String> {
    if Instant::now() > deadline {
        return Err("Audio server timed out.".into());
    }
    match loop_.iterate(false) {
        IterateResult::Err(e) => Err(format!("{e:?}")),
        IterateResult::Quit(_) => Err("Audio server disconnected.".into()),
        _ => {
            std::thread::sleep(Duration::from_millis(2));
            Ok(())
        }
    }
}
pub fn run(
    pid: u32,
    tx: SyncSender<Vec<u8>>,
    stop: Arc<AtomicBool>,
    ready: SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(4);
        let mut loop_ = Mainloop::new().ok_or("Cannot initialize audio mainloop")?;
        let mut context = Context::new(&loop_, "AquaStar game capture")
            .ok_or("Cannot initialize audio connection")?;
        context
            .connect(None, FlagSet::NOAUTOSPAWN, None)
            .map_err(|e| format!("{e:?}"))?;
        while context.get_state() != State::Ready {
            if matches!(context.get_state(), State::Failed | State::Terminated) {
                return Err("No PulseAudio or PipeWire-Pulse server is available.".into());
            }
            tick(&mut loop_, deadline)?;
        }
        let inputs = Rc::new(RefCell::new(Vec::new()));
        let values = inputs.clone();
        let operation = context.introspect().get_sink_input_info_list(move |info| {
            if let ListResult::Item(info) = info {
                if info
                    .proplist
                    .get_str("application.process.id")
                    .and_then(|s| s.parse::<u32>().ok())
                    == Some(pid)
                {
                    values.borrow_mut().push((info.index, info.sink));
                }
            }
        });
        while operation.get_state() == pulse::operation::State::Running {
            tick(&mut loop_, deadline)?;
        }
        let inputs = inputs.borrow();
        if inputs.len() != 1 {
            return Err("The game must have exactly one active audio output. Start game sound, or record without audio.".into());
        }
        let (input, sink) = inputs[0];
        let source = Rc::new(RefCell::new(None));
        let value = source.clone();
        let operation = context
            .introspect()
            .get_sink_info_by_index(sink, move |info| {
                if let ListResult::Item(info) = info {
                    *value.borrow_mut() = info.monitor_source_name.as_ref().map(|s| s.to_string());
                }
            });
        while operation.get_state() == pulse::operation::State::Running {
            tick(&mut loop_, deadline)?;
        }
        let source = source
            .borrow()
            .clone()
            .ok_or("Cannot find game audio output")?;
        let spec = Spec {
            format: Format::FLOAT32NE,
            channels: 2,
            rate: 48000,
        };
        let mut stream = Stream::new(&mut context, "Game audio only", &spec, None)
            .ok_or("Cannot create game audio stream")?;
        stream
            .set_monitor_stream(input)
            .map_err(|e| format!("{e:?}"))?;
        let buffer = pulse::def::BufferAttr {
            maxlength: 76800,
            tlength: u32::MAX,
            prebuf: u32::MAX,
            minreq: u32::MAX,
            fragsize: 7680,
        };
        stream
            .connect_record(
                Some(&source),
                Some(&buffer),
                pulse::stream::FlagSet::ADJUST_LATENCY | pulse::stream::FlagSet::AUTO_TIMING_UPDATE,
            )
            .map_err(|e| format!("{e:?}"))?;
        while stream.get_state() != pulse::stream::State::Ready {
            if stream.get_state() == pulse::stream::State::Failed {
                return Err("The audio server does not support process-isolated capture.".into());
            }
            tick(&mut loop_, deadline)?;
        }
        let _ = ready.send(Ok(()));
        while !stop.load(Ordering::SeqCst) {
            tick(&mut loop_, Instant::now() + Duration::from_secs(1))?;
            match stream.peek().map_err(|e| format!("{e:?}"))? {
                PeekResult::Data(data) => {
                    let bytes = data.to_vec();
                    stream.discard().map_err(|e| format!("{e:?}"))?;
                    super::send(&tx, bytes)?;
                }
                PeekResult::Hole(length) => {
                    stream.discard().map_err(|e| format!("{e:?}"))?;
                    super::send(&tx, vec![0; length])?;
                }
                PeekResult::Empty => {}
            }
            if matches!(
                stream.get_state(),
                pulse::stream::State::Failed | pulse::stream::State::Terminated
            ) {
                return Err("Game audio disconnected. Recording stopped.".into());
            }
        }
        let _ = stream.disconnect();
        context.disconnect();
        Ok(())
    })();
    if let Err(error) = &result {
        let _ = ready.try_send(Err(error.clone()));
    }
    result
}
