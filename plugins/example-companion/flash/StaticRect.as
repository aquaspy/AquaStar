package {
    import flash.display.Sprite;
    import flash.display.StageAlign;
    import flash.display.StageScaleMode;
    import flash.events.Event;
    import flash.text.TextField;
    import flash.text.TextFormat;

    /** Static contrast SWF — visible shape, no keyboard handling. */
    public class StaticRect extends Sprite {
        public function StaticRect() {
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
            stage.color = 0x2a1a3a;

            graphics.beginFill(0xc9a0ff);
            graphics.drawRoundRect(80, 80, 120, 120, 12, 12);
            graphics.endFill();

            var label:TextField = new TextField();
            label.defaultTextFormat = new TextFormat("Arial", 14, 0xe6e6e6);
            label.width = 500;
            label.height = 40;
            label.x = 24;
            label.y = 24;
            label.text = "Static rectangle.swf (no ActionScript input)";
            addChild(label);
        }
    }
}
