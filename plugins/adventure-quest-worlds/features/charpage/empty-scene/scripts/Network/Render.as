package Network {
    import Image.Preview;
    import flash.events.ErrorEvent;
    import flash.events.Event;
    import flash.net.Socket;
    import flash.system.ApplicationDomain;
    import flash.system.LoaderContext;

    /** Browser-Flash-safe subset of swf2png's Render base class. */
    public class Render {
        protected var preview:Preview = Main.ROOT.newPreview();
        protected var LOAD_COUNT:int = 0;
        protected var LOADER_KEY_PREFIX:String;
        private var _data:Object;
        private var _applicationDomain:ApplicationDomain;
        private var _loaderContext:LoaderContext;

        public function Render(socket:Socket, data:Object, contextAndDomain:Boolean = true) {
            _data = data;
            if (contextAndDomain) {
                _applicationDomain = new ApplicationDomain(ApplicationDomain.currentDomain);
                _loaderContext = new LoaderContext(false, _applicationDomain);
                _loaderContext.checkPolicyFile = false;
                _loaderContext.allowCodeImport = true;
            }
            Main.LOADER_COUNT++;
            LOADER_KEY_PREFIX = "empty_scene_" + Main.LOADER_COUNT;
        }

        public function get data():Object { return _data; }
        protected function get applicationDomain():ApplicationDomain { return _applicationDomain; }
        protected function get loaderContext():LoaderContext { return _loaderContext; }
        protected function onClearLoader():void {}
        protected function onComplete(event:Event):void { LOAD_COUNT--; }
        protected function onLoadError(event:ErrorEvent):void { LOAD_COUNT--; }
        protected function onCompleteFinal():void {}
    }
}
