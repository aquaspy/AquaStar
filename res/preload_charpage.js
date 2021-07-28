(() => {
    function _isnull(variable){
        if (variable == undefined || variable == null) return true;
        else return false;
    }
    
    function onLoading () {
        // Get necessary data first---------------
        // CP Exists
        var flash = document.getElementsByTagName("object")[0].parentElement;
        var w = window.innerWidth;
        var h = window.innerHeight;
        
        getCC();
        
        // POLISHING PAGE
        var body = document.body;
        body.innerHTML = "";
        body.style.backgroundColor = "#000000";//"#FEF1C5";
        
        if (!_isnull(flash)) {
            // VALID FLASH PAAAGE! Lets go!
            // Make flash be the whole page
            body.appendChild(flash);
            // Finally, get the flash to be the biggest your screen can handle!!
            var embed = document.getElementsByTagName("embed")[0];
            
            // Calculating the inner sizes the flash should receive...
            var w = window.innerWidth;
            var h = window.innerHeight;
            const wOri = 715;
            const hOri = 455;
            const ratio = (wOri/hOri);
            const red = 20;
            if( w/h > ratio) {
                // Window has bigger Width ratio than the original
                // Scale using Height! reduction is to account for window bar.
                newW = wOri*((h-red)/hOri)
                embed.setAttribute("height",h-red);
                embed.setAttribute("width" ,newW); // Dont ask how i got this... maths...
                
                renderCC(flash, newW, h-red);
            } 
            else {
                // Window has bigger Height ratio than the original (or equal, doesnt matter)
                // Scale using Width!
                newH = hOri*(w/wOri);
                embed.setAttribute("width" ,w);
                embed.setAttribute("height",newH); // Dont ask how i got this... maths...

                renderCC(flash, w, newH);
            }
        }
        return;
    }
    
    function getCC(){
        const sourceFlash = document.getElementsByTagName('embed')[0].getAttribute('flashvars');;
        
        const extractIntFromCP = (attributeName) => {
            // Ex: ...smthsmth&intEyesCC=443322&smthsmth...
            // We want the numbers for the intEyes in the ex.
            var a = sourceFlash.split(attributeName + "=")[1].split('&')[0];
            // TESTING
            console.log(attributeName + ": " + a + "\n");
            return a;
        }
        
        const ccHair = extractIntFromCP("intColorHair")
        const ccEyes = extractIntFromCP("intColorEye")
        const ccSkin = extractIntFromCP("intColorSkin")
        const ccBase = extractIntFromCP("intColorBase")
        const ccTrim = extractIntFromCP("intColorTrim")
        const ccAces = extractIntFromCP("intColorAccessory")
        console.log("\n\n")
        
        // Healerbounty - Main set with Naval DK for example
        // intColorHair=2236962&intColorSkin=15448438&intColorEye=6684672&intColorTrim=15726591&intColorBase=2368548&intColorAccessory=2368548
    }
    
    // @params Div with flash, width and height
    function renderCC(flash, w, h, isWidth = true){
        
        //TODO - VW is only for bigger width ratio. change for VH later if needed
        
        // Yeah, had to be like this bc of some bugs....? it was WEEEIRD
        /*
        var parentDivStart = '<div style="'+ 
            'width:' + w + 'px;' +
            'height:' + h + 'px;' +
            'left:' + ((window.innerWidth - w)/2) + 'px;' +
            'top:' + ((window.innerHeight - h)/2) + 'px;' +
            'position:' + "fixed" + ';' +
            'z-index:' + 50 + ';' +
            'background-color:' + "#FF000099" + ';' +
            '"></div>';
            */
        
        var flashFrame = document.createElement("div");
        flashFrame.style.width = w + "px"
        flashFrame.style.height = h + "px"
        flashFrame.style.left = ((window.innerWidth - w)/2) + "px";
        flashFrame.style.top = (isWidth)? "0px" :
            ((window.innerHeight - h)/2) + "px";
        flashFrame.style.position = "fixed";
        flashFrame.style.zIndex = 50;
        //flashFrame.style.backgroundColor = "#FF000099"
        
        var CCContainer = document.createElement("div");
        CCContainer.style.position = "absolute"
        CCContainer.style.width = 0.3*w + "px";
        CCContainer.style.height = 0.15*h + "px";
        CCContainer.style.zIndex = 51;
        CCContainer.style.left = 5 + "px";
        CCContainer.style.bottom = 35 + "px";
        CCContainer.style.backgroundColor = "blue";
        flashFrame.appendChild(CCContainer);
        
        document.body.appendChild(flashFrame);
    }
    
    window.onload= onLoading;
})();
