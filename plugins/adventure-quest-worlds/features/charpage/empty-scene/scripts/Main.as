package {
    import Image.Preview;
    import Network.Render.CharacterDialogRender;
    import flash.display.MovieClip;
    import flash.display.StageAlign;
    import flash.display.StageScaleMode;
    import flash.events.Event;
    import flash.filters.GlowFilter;
    import flash.geom.ColorTransform;
    import flash.system.ApplicationDomain;

    /**
     * AquaStar Empty Scene document class.
     *
     * This replaces swf2png's AIR/TCP entry point. It intentionally keeps the
     * AQW-compatible helper API (world, mixer and mcSetColor) expected by item
     * SWFs, but renders one persistent, native-Flash scene instead of PNG data.
     */
    public class Main extends MovieClip {
        public static const DEBUG:Boolean = false;
        public static var ROOT:Main;
        public static var LOADER_COUNT:uint = 0;
        private var renderer:CharacterDialogRender;
        private var sceneColor:uint;

        public const world:* = {
            getQuestValue: function():Number { return -1; },
            cellSetup: function(a:*, b:*, c:*):void {},
            getMoonPhase: function():Number { return 4; }
        };
        public const mixer:* = { bSoundOn: false };

        public function Main() {
            ROOT = this;
            if (stage) initialize();
            else addEventListener(Event.ADDED_TO_STAGE, initialize);
        }

        private function initialize(event:Event = null):void {
            removeEventListener(Event.ADDED_TO_STAGE, initialize);
            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.align = StageAlign.TOP_LEFT;

            // The upstream FLA has authoring/debug children. The Empty Scene
            // owns the stage completely, so none of them may leak into a print.
            while (numChildren > 0) removeChildAt(0);

            const params:Object = loaderInfo.parameters;
            const frameRate:Number = numberParam(params, "studioFrameRate", stage.frameRate);
            if (frameRate > 0) stage.frameRate = frameRate;
            sceneColor = uint(numberParam(params, "studioBackgroundColor", 0xFEF1C5)) & 0xFFFFFF;
            drawBackground(stage.stageWidth, stage.stageHeight);

            try {
                renderer = new CharacterDialogRender(CharacterDialogRender.fromFlashVars(params), stage.stageWidth, stage.stageHeight);
                stage.addEventListener(Event.RESIZE, onStageResize);
            } catch (error:Error) {
                logEvent("bootstrap error", error.name, error.message, error.errorID);
                if (error.getStackTrace() != null) logEvent(error.getStackTrace());
            }
        }

        private function numberParam(params:Object, key:String, fallback:Number):Number {
            const value:* = params[key];
            const parsed:Number = Number(value);
            return isNaN(parsed) ? fallback : parsed;
        }

        private function onStageResize(event:Event):void {
            drawBackground(stage.stageWidth, stage.stageHeight);
            if (renderer != null) renderer.resize(stage.stageWidth, stage.stageHeight);
        }

        private function drawBackground(width:Number, height:Number):void {
            graphics.clear();
            graphics.beginFill(sceneColor);
            graphics.drawRect(0, 0, width, height);
            graphics.endFill();
        }

        public function newPreview():Preview {
            const preview:Preview = Preview(addChild(new Preview()));
            preview.visible = true;
            optimizeMovieClip(preview);
            return preview;
        }

        // Several AQW assets call these members on the movie root while their
        // timeline initializes. Keep the tiny compatible surface from swf2png.
        public function get date_server():* { return { day: 1, hours: 19 }; }
        public function getServerTime():* { return { getMonth: function():Number { return 5; } }; }

        public function mcSetColor(movieClip:MovieClip, location:String, shade:String):void {
            var current:* = movieClip;
            for (var depth:int = 0; depth < 30 && current != null; depth++) {
                if (current.parent is Preview) {
                    Preview(current.parent).character.setColor(movieClip, location, shade);
                    return;
                }
                current = current.parent;
            }
        }

        public static function getAchievement(ia1:*, index:int):int {
            if (index < 0 || index > 31 || ia1 == null) return -1;
            return (uint(ia1) & (uint(1) << index)) == 0 ? 0 : 1;
        }

        public static function avatarBuild(place:MovieClip, linkage:String, gender:String, part:String, domain:ApplicationDomain):Boolean {
            const name:String = linkage + gender + part;
            if (!domain.hasDefinition(name)) {
                place.visible = false;
                return false;
            }
            if (place.numChildren > 0) place.removeChildAt(0);
            const movie:MovieClip = MovieClip(new (Class(domain.getDefinition(name)))());
            place.addChildAt(movie, 0);
            place.visible = true;
            return true;
        }

        public static function changeColor(movieClip:MovieClip, color:Number, shade:String):void {
            const transform:ColorTransform = new ColorTransform();
            transform.color = uint(color);
            switch (String(shade).toUpperCase()) {
                case "LIGHT": transform.redOffset += 100; transform.greenOffset += 100; transform.blueOffset += 100; break;
                case "DARK": transform.redOffset -= 25; transform.greenOffset -= 50; transform.blueOffset -= 50; break;
                case "DARKER": transform.redOffset -= 125; transform.greenOffset -= 125; transform.blueOffset -= 125; break;
            }
            movieClip.transform.colorTransform = transform;
        }

        public static function optimizeMovieClip(movieClip:MovieClip):MovieClip {
            movieClip.mouseEnabled = false;
            movieClip.mouseChildren = false;
            return movieClip;
        }

        public static function logEvent(...values):void {
            if (!DEBUG) return;
            const message:String = "[EmptyScene] " + values.join(" ");
            trace(message);
        }
    }
}
