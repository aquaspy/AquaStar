import flash.display.Loader;
import flash.display.Sprite;
import flash.display.StageAlign;
import flash.display.StageScaleMode;
import flash.Lib;
import flash.net.URLRequest;
import flash.system.Security;

class Main extends Sprite {
    static function main() {
        Security.allowDomain("*");
        Lib.current.stage.scaleMode = StageScaleMode.NO_SCALE;
        Lib.current.stage.align = StageAlign.TOP_LEFT;
        Lib.current.addChild(new Main());
    }

    public function new() {
        super();
        var loader = new Loader();
        addChild(loader);
        loader.load(new URLRequest("https://game.aq.com/game/gamefiles/Loader4.swf?ver=b"));
    }
}
