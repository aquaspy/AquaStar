package Image {
    import Avatar.Character;
    import flash.display.MovieClip;

    /**
     * The upstream Preview class embeds an AIR authoring symbol. It is only a
     * container in the renderer, so a plain MovieClip avoids that symbol's
     * incompatible timeline initialization in PPAPI Flash.
     */
    public class Preview extends MovieClip {
        public var character:Character;
        public var imageWidth:Number;
        public var imageHeight:Number;

        public function Preview() {
            super();
        }
    }
}
