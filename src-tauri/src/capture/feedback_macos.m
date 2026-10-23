#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <QuartzCore/QuartzCore.h>
#import <UserNotifications/UserNotifications.h>

// A separate transparent panel leaves the external player's input and pixels
// untouched. ScreenCaptureKit captures only the player window, not these panels.
@interface AquaStarCapturePanel : NSPanel
@end
@implementation AquaStarCapturePanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface AquaStarCaptureBorder : NSObject
@property(nonatomic) pid_t pid;
@property(nonatomic) CGWindowID windowID;
@property(nonatomic, strong) AquaStarCapturePanel *panel;
@property(nonatomic, strong) NSTimer *timer;
- (instancetype)initWithPID:(pid_t)pid window:(CGWindowID)windowID screenshot:(BOOL)screenshot;
- (void)stop;
- (void)update;
@end

@implementation AquaStarCaptureBorder
- (instancetype)initWithPID:(pid_t)pid window:(CGWindowID)windowID screenshot:(BOOL)screenshot {
    if ((self = [super init])) {
        self.pid = pid;
        self.windowID = windowID;
        self.panel = [[AquaStarCapturePanel alloc] initWithContentRect:NSZeroRect
            styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
            backing:NSBackingStoreBuffered defer:NO];
        self.panel.releasedWhenClosed = NO;
        self.panel.opaque = NO;
        self.panel.backgroundColor = NSColor.clearColor;
        self.panel.hasShadow = NO;
        self.panel.ignoresMouseEvents = YES;
        self.panel.hidesOnDeactivate = NO;
        self.panel.animationBehavior = NSWindowAnimationBehaviorNone;
        self.panel.sharingType = NSWindowSharingNone;
        self.panel.level = NSFloatingWindowLevel + (screenshot ? 1 : 0);
        self.panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
            NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorIgnoresCycle;
        self.panel.contentView.wantsLayer = YES;
        self.panel.contentView.layer.borderWidth = 3.0;
        self.panel.contentView.layer.cornerRadius = 7.0;
        self.panel.contentView.layer.borderColor = (screenshot
            ? [NSColor colorWithSRGBRed:0.10 green:0.52 blue:1.0 alpha:1.0]
            : [NSColor colorWithSRGBRed:1.0 green:0.18 blue:0.22 alpha:1.0]).CGColor;
        __weak AquaStarCaptureBorder *weakSelf = self;
        self.timer = [NSTimer timerWithTimeInterval:0.05 repeats:YES block:^(NSTimer *timer) {
            [weakSelf update];
        }];
        [[NSRunLoop mainRunLoop] addTimer:self.timer forMode:NSRunLoopCommonModes];
        [self update];
    }
    return self;
}
- (void)update {
    if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != self.pid) {
        [self.panel orderOut:nil];
        return;
    }
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    for (NSDictionary *window in windows) {
        if ([window[(id)kCGWindowOwnerPID] intValue] != self.pid ||
            [window[(id)kCGWindowNumber] unsignedIntValue] != self.windowID) continue;
        CGRect bounds;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds], &bounds)
            || CGRectIsEmpty(bounds)) break;
        // CoreGraphics uses a top-left origin on the primary display; AppKit
        // uses its bottom-left origin, including for secondary display bounds.
        CGFloat top = CGDisplayBounds(CGMainDisplayID()).size.height;
        NSRect frame = NSMakeRect(bounds.origin.x, top - CGRectGetMaxY(bounds),
            bounds.size.width, bounds.size.height);
        if (!NSEqualRects(self.panel.frame, frame)) [self.panel setFrame:frame display:YES];
        if (!self.panel.visible) [self.panel orderFrontRegardless];
        return;
    }
    [self.panel orderOut:nil];
}
- (void)stop {
    [self.timer invalidate];
    self.timer = nil;
    [self.panel orderOut:nil];
    [self.panel close];
    self.panel = nil;
}
@end

static AquaStarCaptureBorder *screenshotBorder;
static AquaStarCaptureBorder *recordingBorder;
static uint64_t recordingGeneration;

void aquastar_capture_screenshot_border(uint32_t pid, uint32_t windowID) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [screenshotBorder stop];
        screenshotBorder = [[AquaStarCaptureBorder alloc] initWithPID:(pid_t)pid window:windowID screenshot:YES];
        AquaStarCaptureBorder *border = screenshotBorder;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 650 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            [border stop];
            if (screenshotBorder == border) screenshotBorder = nil;
        });
    });
}

void aquastar_capture_recording_border(uint32_t pid, uint32_t windowID, uint64_t generation, bool active) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (active) {
            [recordingBorder stop];
            recordingGeneration = generation;
            recordingBorder = [[AquaStarCaptureBorder alloc] initWithPID:(pid_t)pid window:windowID screenshot:NO];
        } else if (recordingGeneration == generation) {
            [recordingBorder stop];
            recordingBorder = nil;
        }
    });
}

@interface AquaStarCaptureNotifications : NSObject <UNUserNotificationCenterDelegate>
@end
@implementation AquaStarCaptureNotifications
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    willPresentNotification:(UNNotification *)notification
    withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList);
}
@end
static AquaStarCaptureNotifications *notificationDelegate;

void aquastar_capture_notify(const char *titleBytes, const char *bodyBytes) {
    @autoreleasepool {
    NSString *title = [NSString stringWithUTF8String:titleBytes];
    NSString *body = [NSString stringWithUTF8String:bodyBytes];
    if (!title || !body) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        // A standalone cargo executable has no notification identity. Never
        // spoof Terminal/Finder; installed builds use AquaStar's own app bundle.
        if (![NSBundle.mainBundle.bundleURL.pathExtension isEqualToString:@"app"] ||
            ![NSBundle.mainBundle.bundleIdentifier isEqualToString:@"io.github.aquaspy.aquastar-lite"]) return;
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        if (!notificationDelegate) notificationDelegate = [AquaStarCaptureNotifications new];
        center.delegate = notificationDelegate;
        [center requestAuthorizationWithOptions:UNAuthorizationOptionAlert completionHandler:^(BOOL granted, NSError *error) {
            if (!granted) {
                if (error) NSLog(@"AquaStar NEO notification authorization: %@", error.localizedDescription);
                return;
            }
            UNMutableNotificationContent *content = [UNMutableNotificationContent new];
            content.title = title;
            content.body = body;
            UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:@"aquastar-capture-feedback"
                content:content trigger:nil];
            [center addNotificationRequest:request withCompletionHandler:^(NSError *deliveryError) {
                if (deliveryError) NSLog(@"AquaStar NEO notification delivery: %@", deliveryError.localizedDescription);
            }];
        }];
    });
    }
}
