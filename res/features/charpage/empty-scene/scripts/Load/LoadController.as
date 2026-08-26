package Load {
    import flash.display.Loader;
    import flash.events.Event;
    import flash.events.IOErrorEvent;
    import flash.net.URLRequest;
    import flash.system.ApplicationDomain;
    import flash.system.LoaderContext;
    import flash.utils.Dictionary;

    /**
     * PPAPI-safe loader. The upstream AIR tool downloads bytes first and calls
     * loadBytes(); native Pepper Flash is more reliable loading same-origin AQW
     * assets directly while retaining the dedicated ApplicationDomain.
     */
    public class LoadController {
        public static const singleton:LoadController = new LoadController();
        private static const maxConcurrent:int = 12;
        public static const loadedAssets:Vector.<String> = new Vector.<String>();
        public var applicationDomainAsset:ApplicationDomain;
        public var loaderContextAsset:LoaderContext;
        private var queue:Vector.<LoadObject> = new Vector.<LoadObject>();
        private var concurrentCount:int = 0;
        private var loaderStack:Dictionary = new Dictionary();

        public function LoadController() {
            applicationDomainAsset = new ApplicationDomain(ApplicationDomain.currentDomain);
            loaderContextAsset = new LoaderContext(false, applicationDomainAsset);
            loaderContextAsset.checkPolicyFile = false;
            loaderContextAsset.allowCodeImport = true;
        }
        public function addLoadAsset(url:String, file:String, key:String, complete:Function, error:Function):void { enqueue("asset", url, file, key, complete, error, loaderContextAsset); }
        public function addLoadJunk(url:String, file:String, key:String, complete:Function, error:Function, context:LoaderContext):void { enqueue("junk", url, file, key, complete, error, context); }
        public function addLoadMap(url:String, file:String, key:String, complete:Function, error:Function, context:LoaderContext):void { enqueue("map", url, file, key, complete, error, context); }
        public function addLoadAvatar(url:String, file:String, key:String, complete:Function, error:Function, context:LoaderContext):void { enqueue("avatar", url, file, key, complete, error, context); }

        private function enqueue(type:String, url:String, file:String, key:String, complete:Function, error:Function, context:LoaderContext):void {
            queue.push(new LoadObject(type, key, url, file, complete, error, context));
            loadNext();
        }
        private function loadNext():void {
            if (queue.length == 0 || concurrentCount >= maxConcurrent) return;
            concurrentCount++;
            load(queue.shift());
        }
        private function load(item:LoadObject):void {
            const fullUrl:String = item.url + "/" + item.file;
            const loader:Loader = new Loader();
            const finish:Function = function():void { concurrentCount--; loadNext(); };
            var onComplete:Function;
            var onError:Function;
            onComplete = function(event:Event):void {
                loader.contentLoaderInfo.removeEventListener(Event.COMPLETE, onComplete);
                loader.contentLoaderInfo.removeEventListener(IOErrorEvent.IO_ERROR, onError);
                loaderStack[item.key] = { _type: item._type, loader: loader };
                Main.logEvent("loaded", item.file);
                try { if (item.onComplete != null) item.onComplete(event); }
                catch (exception:Error) { Main.logEvent("assemble error", item.file, exception.message); if (item.onError != null) item.onError(new IOErrorEvent(IOErrorEvent.IO_ERROR)); }
                finish();
            };
            onError = function(event:IOErrorEvent):void {
                loader.contentLoaderInfo.removeEventListener(Event.COMPLETE, onComplete);
                loader.contentLoaderInfo.removeEventListener(IOErrorEvent.IO_ERROR, onError);
                Main.logEvent("load error", item.file, event.text);
                if (item.onError != null) item.onError(event);
                finish();
            };
            loader.contentLoaderInfo.addEventListener(Event.COMPLETE, onComplete);
            loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, onError);
            Main.logEvent("loading", fullUrl);
            try { loader.load(new URLRequest(fullUrl), item.context); }
            catch (exception:Error) { Main.logEvent("load exception", item.file, exception.message); onError(new IOErrorEvent(IOErrorEvent.IO_ERROR)); }
        }
        public function clearAllLoader():void { for (var key:String in loaderStack) clearLoader(key); }
        public function clearLoader(key:String):void { if (key in loaderStack) { Loader(loaderStack[key].loader).unloadAndStop(); delete loaderStack[key]; } }
        public function clearLoaderByType(type:String):void { for (var key:String in loaderStack) if (loaderStack[key]._type == type) clearLoader(key); }
    }
}
