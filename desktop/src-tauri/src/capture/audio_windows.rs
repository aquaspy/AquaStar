use super::*;
pub fn available(_pid: u32) -> bool {
    #[repr(C)]
    struct Version {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        service_pack: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut Version) -> i32;
    }
    let mut version = Version {
        size: std::mem::size_of::<Version>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        service_pack: [0; 128],
    };
    unsafe { RtlGetVersion(&mut version) >= 0 && version.build >= 20348 }
}
pub fn run(
    pid: u32,
    tx: SyncSender<Vec<u8>>,
    stop: Arc<AtomicBool>,
    ready: SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        wasapi::initialize_mta().ok().map_err(|e| e.to_string())?;
        let mut client = wasapi::AudioClient::new_application_loopback_client(pid, true)
            .map_err(|e| e.to_string())?;
        let format = wasapi::WaveFormat::new(32, 32, &wasapi::SampleType::Float, 48000, 2, None);
        client
            .initialize_client(
                &format,
                &wasapi::Direction::Capture,
                &wasapi::StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: 200_000,
                },
            )
            .map_err(|e| e.to_string())?;
        let _event = client.set_get_eventhandle().map_err(|e| e.to_string())?;
        let capture = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
        client.start_stream().map_err(|e| e.to_string())?;
        let _ = ready.send(Ok(()));
        let mut queue = std::collections::VecDeque::new();
        while !stop.load(Ordering::SeqCst) {
            capture
                .read_from_device_to_deque(&mut queue)
                .map_err(|e| e.to_string())?;
            if !queue.is_empty() {
                super::send(&tx, queue.drain(..).collect())?;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        client.stop_stream().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = &result {
        let _ = ready.try_send(Err(error.clone()));
    }
    result
}
