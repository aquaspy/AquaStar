package Network.Render {
    import Avatar.Character;
    import Network.Render.Character.CharacterBaseRender;
    import flash.events.ErrorEvent;
    import flash.events.Event;
    import flash.utils.setTimeout;

    /**
     * Reuses swf2png's AQW asset assembler but keeps the result on stage.
     * The historical class name is retained so FFDec can replace the class in
     * the supplied Item.swf without adding new ABC symbols.
     */
    public class CharacterDialogRender extends CharacterBaseRender {
        private var sceneWidth:Number;
        private var sceneHeight:Number;
        private var positioned:Boolean = false;

        public function CharacterDialogRender(data:Object, width:Number, height:Number) {
            super(null, data);
            sceneWidth = width;
            sceneHeight = height;
            preview.imageWidth = width;
            preview.imageHeight = height;
            preview.character = Character(preview.addChild(new Character(this)));
            loadCharacter();
            if (LOAD_COUNT == 0) schedulePosition();
            // A malformed asset must not leave an otherwise assembled avatar
            // off-stage forever. The normal path positions much sooner.
            setTimeout(schedulePosition, 2500);
        }

        override protected function onComplete(event:Event):void {
            super.onComplete(event);
            if (LOAD_COUNT <= 0) schedulePosition();
        }

        override protected function onLoadError(event:ErrorEvent):void {
            super.onLoadError(event);
            if (LOAD_COUNT <= 0) schedulePosition();
        }

        public function resize(width:Number, height:Number):void {
            sceneWidth = width;
            sceneHeight = height;
            if (positioned) positionAvatar();
        }

        private function schedulePosition():void {
            if (positioned) return;
            positioned = true;
            // Let asset constructors finish their first frame before measuring.
            setTimeout(positionAvatar, 100);
        }

        private function positionAvatar():void {
            try {
                const character:Character = preview.character;
                // Recalculate from the unscaled coordinate system on every
                // stage resize so larger hosts receive a true vector render.
                character.x = 0;
                character.y = 0;
                character.scaleX = 1;
                character.scaleY = 1;
                var bounds:* = character.avatar.getBounds(character);
                if (bounds.height > 0) {
                    const zoom:Number = numberValue(data.studioAvatarScale, 1);
                    const targetHeight:Number = sceneHeight * 0.82 * zoom;
                    const scale:Number = targetHeight / bounds.height;
                    character.scaleX = scale;
                    character.scaleY = scale;
                }
                // Centre the complete visible scene, rather than only the body.
                // Capes, ground effects and animated weapon art may extend much
                // farther than avatar's base timeline.
                bounds = character.getBounds(preview);
                character.x += sceneWidth / 2 - (bounds.x + bounds.width / 2) + numberValue(data.studioAvatarOffsetX, 0);
                character.y += sceneHeight / 2 - (bounds.y + bounds.height / 2) + numberValue(data.studioAvatarOffsetY, 0);
            } catch (error:Error) {
                Main.logEvent("position error", error.message);
            }
        }

        private function numberValue(value:*, fallback:Number):Number {
            const parsed:Number = Number(value);
            return isNaN(parsed) ? fallback : parsed;
        }

        public static function fromFlashVars(params:Object):Object {
            const customArmor:Boolean = usable(params.strCustArmorFile);
            const customHelm:Boolean = usable(params.strCustHelmFile);
            const customWeapon:Boolean = usable(params.strCustWeaponFile);
            const customCape:Boolean = usable(params.strCustCapeFile);
            const useUnarmed:Boolean = /^(?:0|false|no|off)$/i.test(String(params.studioUseWeapon));
            const weaponFile:String = useUnarmed ? "items/swords/unarmed.swf" : choose(params, customWeapon, "strCustWeaponFile", "strWeaponFile", "none");
            const weaponLink:String = useUnarmed ? "unarmed" : choose(params, customWeapon, "strCustWeaponLink", "strWeaponLink", "");
            return {
                url: baseUrl(params.studioAssetBaseUrl),
                gender: String(params.strGender || "M").toUpperCase() == "F" ? "F" : "M",
                ia1: number(params.ia1, 0),
                equipment: {
                    en: { File: "none", Link: "" },
                    co: { File: choose(params, customArmor, "strCustArmorFile", "strClassFile", "none"), Link: choose(params, customArmor, "strCustArmorLink", "strClassLink", "") },
                    he: { File: choose(params, customHelm, "strCustHelmFile", "strHelmFile", "none"), Link: choose(params, customHelm, "strCustHelmLink", "strHelmLink", "") },
                    Weapon: { File: weaponFile, Link: weaponLink, Type: choose(params, customWeapon, "strCustWeaponType", "strWeaponType", "Sword") },
                    ba: { File: choose(params, customCape, "strCustCapeFile", "strCapeFile", "none"), Link: choose(params, customCape, "strCustCapeLink", "strCapeLink", "") },
                    pe: { File: value(params.strPetFile, "none"), Link: value(params.strPetLink, "") },
                    mi: { File: value(params.strMiscFile, "none"), Link: value(params.strMiscLink, "") }
                },
                hair: { File: value(params.strHairFile, "none"), Name: value(params.strHairName, "") },
                intColorHair: number(params.intColorHair, 0), intColorSkin: number(params.intColorSkin, 0),
                intColorEye: number(params.intColorEye, 0), intColorBase: number(params.intColorBase, 0),
                intColorTrim: number(params.intColorTrim, 0), intColorAccessory: number(params.intColorAccessory, 0),
                studioAvatarScale: params.studioAvatarScale, studioAvatarOffsetX: params.studioAvatarOffsetX, studioAvatarOffsetY: params.studioAvatarOffsetY
            };
        }

        private static function usable(value:*):Boolean { return value != null && String(value) != "" && String(value).toLowerCase() != "none"; }
        private static function value(value:*, fallback:String):String { return value == null || String(value) == "" ? fallback : String(value); }
        private static function number(value:*, fallback:Number):Number { const parsed:Number = Number(value); return isNaN(parsed) ? fallback : parsed; }
        private static function choose(params:Object, custom:Boolean, customKey:String, normalKey:String, fallback:String):String { return value(params[custom ? customKey : normalKey], fallback); }
        private static function baseUrl(value:*):String { const url:String = value ? String(value) : "https://game.aq.com/game/gamefiles"; return url.replace(/\/+$/, ""); }
    }
}
