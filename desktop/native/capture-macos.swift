import Foundation
import AppKit
import CoreGraphics
import CoreMedia
import CoreVideo
import AVFoundation
import ScreenCaptureKit

// Raw RGBA frames and float32 stereo audio go only to the parent capture service.
@available(macOS 12.3, *)
final class Output: NSObject, SCStreamOutput {
    let audio: Bool
    let lock = NSLock()
    init(audio: Bool) { self.audio = audio }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard CMSampleBufferIsValid(sample) else { return }
        lock.lock(); defer { lock.unlock() }
        if audio {
            guard #available(macOS 13.0, *), type == .audio,
                  let block = CMSampleBufferGetDataBuffer(sample),
                  let description = CMSampleBufferGetFormatDescription(sample),
                  let format = CMAudioFormatDescriptionGetStreamBasicDescription(description) else { return }
            let count = CMSampleBufferGetNumSamples(sample)
            let channels = Int(format.pointee.mChannelsPerFrame)
            guard format.pointee.mBitsPerChannel == 32, channels == 2, format.pointee.mFormatFlags & kAudioFormatFlagIsFloat != 0 else {
                FileHandle.standardError.write(Data("Unsupported native audio format.\n".utf8)); exit(1)
            }
            var length = 0
            var total = 0
            var pointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: &length, totalLengthOut: &total, dataPointerOut: &pointer) == kCMBlockBufferNoErr,
                  let pointer = pointer, total >= count * channels * 4, length >= count * channels * 4 else { return }
            if format.pointee.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0 {
                let samples = UnsafeRawPointer(pointer).assumingMemoryBound(to: Float.self)
                var interleaved = [Float](repeating: 0, count: count * 2)
                for index in 0..<count { interleaved[index*2] = samples[index]; interleaved[index*2+1] = samples[count+index] }
                interleaved.withUnsafeBytes { FileHandle.standardOutput.write(Data($0)) }
            } else { FileHandle.standardOutput.write(Data(bytes: pointer, count: count * 8)) }
        } else {
            guard type == .screen, let image = CMSampleBufferGetImageBuffer(sample) else { return }
            CVPixelBufferLockBaseAddress(image, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(image, .readOnly) }
            let width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
            guard width > 0, height > 0, width <= 16384, height <= 16384, width * height <= 16_777_216, let base = CVPixelBufferGetBaseAddress(image) else { return }
            let stride = CVPixelBufferGetBytesPerRow(image)
            var rgba = [UInt8](repeating: 0, count: width * height * 4)
            let bgra = base.assumingMemoryBound(to: UInt8.self)
            for y in 0..<height { for x in 0..<width {
                let from = y*stride+x*4, to = (y*width+x)*4
                rgba[to] = bgra[from+2]; rgba[to+1] = bgra[from+1]; rgba[to+2] = bgra[from]; rgba[to+3] = 255
            } }
            var header = [UInt32(width).littleEndian, UInt32(height).littleEndian, UInt32(rgba.count).littleEndian]
            header.withUnsafeMutableBytes { FileHandle.standardOutput.write(Data($0)) }
            FileHandle.standardOutput.write(Data(rgba))
        }
    }
}
@available(macOS 12.3, *)
@MainActor
func runCapture() async throws {
    let args = CommandLine.arguments
    guard args.count >= 3, let pid = Int32(args[2]) else { throw NSError(domain: "Capture", code: 1) }
    let audio = args[1] == "audio"
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let app = content.applications.first(where: { $0.processID == pid }) else { throw NSError(domain: "Game is no longer running", code: 2) }
    let config = SCStreamConfiguration()
    let filter: SCContentFilter
    if audio {
        guard #available(macOS 13.0, *), let display = content.displays.first else { throw NSError(domain: "Audio requires macOS 13", code: 3) }
        config.capturesAudio = true; config.sampleRate = 48000; config.channelCount = 2
        config.excludesCurrentProcessAudio = true
        filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
    } else {
        guard args.count >= 4, let id = UInt32(args[3]), let window = content.windows.first(where: { $0.windowID == id && $0.owningApplication?.processID == pid }) else { throw NSError(domain: "Game window is no longer available", code: 4) }
        filter = SCContentFilter(desktopIndependentWindow: window)
        let display = content.displays.max { left, right in
            let l = left.frame.intersection(window.frame), r = right.frame.intersection(window.frame)
            return max(0, l.width) * max(0, l.height) < max(0, r.width) * max(0, r.height)
        }
        let scale = NSScreen.screens.first(where: { screen in
            (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display?.displayID
        })?.backingScaleFactor ?? 1
        let client = NSWindow.contentRect(forFrameRect: window.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable])
        config.sourceRect = CGRect(x: 0, y: max(0, window.frame.height - client.height), width: client.width, height: client.height)
        config.width = max(2, Int(client.width * scale))
        config.height = max(2, Int(client.height * scale))
    }
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    config.showsCursor = false
    config.queueDepth = 3
    let output = Output(audio: audio)
    let stream = SCStream(filter: filter, configuration: config, delegate: nil)
    if audio {
        if #available(macOS 13.0, *) { try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: DispatchQueue(label: "aquastar.audio")) }
    } else { try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "aquastar.frames")) }
    if audio { FileHandle.standardOutput.write(Data("ASAU".utf8)) }
    try await stream.startCapture()
    let parent = getppid()
    while true {
        try await Task.sleep(nanoseconds: 1_000_000_000)
        if getppid() != parent { exit(0) }
    }
}
let captureParent = getppid()
if captureParent <= 1 { exit(1) }
let parentMonitor = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
parentMonitor.schedule(deadline: .now() + 1, repeating: 1)
parentMonitor.setEventHandler { if getppid() != captureParent { exit(0) } }
parentMonitor.resume()

if #available(macOS 12.3, *) {
    Task { do { try await runCapture() } catch { FileHandle.standardError.write(Data("Capture: \(error)\n".utf8)); exit(1) } }
    dispatchMain()
} else { FileHandle.standardError.write(Data("ScreenCaptureKit requires macOS 12.3.\n".utf8)); exit(1) }
