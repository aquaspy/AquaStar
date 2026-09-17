package {
    import flash.display.Sprite;
    import flash.display.StageAlign;
    import flash.display.StageScaleMode;
    import flash.events.Event;
    import flash.events.KeyboardEvent;
    import flash.text.TextField;
    import flash.text.TextFormat;
    import flash.ui.Keyboard;

    /**
     * Minimal AquaStar example SWF: arrow keys move a square inside a playfield.
     * Compile with Flex SDK / Animate to assets/boxmover.swf (see flash/README.md).
     * Until then, stage/index.html provides the same interaction in HTML + embeds
     * assets/rectangle.swf so PPAPI Flash still loads a valid movie.
     */
    public class BoxMover extends Sprite {
        private var playfield:Sprite;
        private var box:Sprite;
        private var label:TextField;
        private var keys:Object = {};
        private const SPEED:Number = 4;
        private const BOX:Number = 36;
        private const PAD:Number = 12;

        public function BoxMover() {
            if (stage) init();
            else addEventListener(Event.ADDED_TO_STAGE, onAdded);
        }

        private function onAdded(e:Event):void {
            removeEventListener(Event.ADDED_TO_STAGE, onAdded);
            init();
        }

        private function init():void {
            stage.align = StageAlign.TOP_LEFT;
            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.color = 0x121212;

            playfield = new Sprite();
            drawPlayfield();
            addChild(playfield);

            box = new Sprite();
            box.graphics.beginFill(0x4da3ff);
            box.graphics.drawRoundRect(0, 0, BOX, BOX, 6, 6);
            box.graphics.endFill();
            box.x = PAD + 40;
            box.y = PAD + 40;
            playfield.addChild(box);

            label = new TextField();
            label.defaultTextFormat = new TextFormat("Arial", 13, 0xe6e6e6);
            label.width = 500;
            label.height = 40;
            label.x = PAD;
            label.y = 8;
            label.text = "AquaStar Example — arrows move the box (Flash)";
            addChild(label);

            stage.addEventListener(KeyboardEvent.KEY_DOWN, onKey);
            stage.addEventListener(KeyboardEvent.KEY_UP, onKey);
            stage.addEventListener(Event.RESIZE, onResize);
            addEventListener(Event.ENTER_FRAME, onFrame);
            stage.focus = stage;
        }

        private function drawPlayfield():void {
            var w:Number = Math.max(320, stage.stageWidth - PAD * 2);
            var h:Number = Math.max(200, stage.stageHeight - PAD * 2 - 36);
            playfield.graphics.clear();
            playfield.graphics.lineStyle(2, 0x333333);
            playfield.graphics.beginFill(0x1b1b1b);
            playfield.graphics.drawRoundRect(0, 0, w, h, 8, 8);
            playfield.graphics.endFill();
            playfield.x = PAD;
            playfield.y = PAD + 36;
        }

        private function onResize(e:Event):void {
            drawPlayfield();
            clamp();
        }

        private function onKey(e:KeyboardEvent):void {
            keys[e.keyCode] = (e.type == KeyboardEvent.KEY_DOWN);
        }

        private function onFrame(e:Event):void {
            if (keys[Keyboard.LEFT]) box.x -= SPEED;
            if (keys[Keyboard.RIGHT]) box.x += SPEED;
            if (keys[Keyboard.UP]) box.y -= SPEED;
            if (keys[Keyboard.DOWN]) box.y += SPEED;
            clamp();
        }

        private function clamp():void {
            var maxX:Number = playfield.width - BOX - 4;
            var maxY:Number = playfield.height - BOX - 4;
            if (box.x < 2) box.x = 2;
            if (box.y < 2) box.y = 2;
            if (box.x > maxX) box.x = maxX;
            if (box.y > maxY) box.y = maxY;
        }
    }
}
