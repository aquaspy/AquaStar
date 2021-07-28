(() => {
    function _isnull(variable){
        if (variable == undefined || variable == null) return true;
        else return false;
    }
    // Thanks google
    function _getHexColor(int){
        return "#"+((int)>>>0).toString(16).slice(-6);
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
        body.style.backgroundColor = "#FEF1C5";
        
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
            return sourceFlash.split(attributeName + "=")[1].split('&')[0];
        }
        return {
            ccHair : extractIntFromCP("intColorHair"),
            ccSkin : extractIntFromCP("intColorSkin"),
            ccEyes : extractIntFromCP("intColorEye"),

            ccBase : extractIntFromCP("intColorBase"),
            ccTrim : extractIntFromCP("intColorTrim"),
            ccAces : extractIntFromCP("intColorAccessory")
        }
        
        // Healerbounty - Main set with Naval DK for example
        // intColorHair=2236962&intColorSkin=15448438&intColorEye=6684672&intColorTrim=15726591&intColorBase=2368548&intColorAccessory=2368548
    }
    
    // @params Div with flash, width and height
    function renderCC(flash, w, h, isWidth = true){
        
        //TODO - VW is only for bigger width ratio. change for VH later if needed
        
        // Same size as flash, over it, to serve as guide
        var flashFrame = document.createElement("div");
        flashFrame.style.width = w + "px"
        flashFrame.style.height = h + "px"
        flashFrame.style.left = ((window.innerWidth - w)/2) + "px";
        flashFrame.style.top = (isWidth)? "0px" :
            ((window.innerHeight - h)/2) + "px";
        flashFrame.style.position = "fixed";
        flashFrame.style.zIndex = 50;
        //flashFrame.style.backgroundColor = "#FF000099"
        
        // Container for the CC colors themselfs, Cover the "profile picture"
        var CCContainer = document.createElement("div");
        CCContainer.style.position = "absolute"
        CCContainer.style.width = 0.3*w + "px";
        CCContainer.style.height = 0.15*h + "px";
        CCContainer.style.zIndex = 51;
        CCContainer.style.left = 0.005*w + "px";
        CCContainer.style.bottom = 0.07*h + "px";
        //CCContainer.style.backgroundColor = "#FFFF00";

        // The cells themselfs, in the order shown in aqw.
        // Top row is Hair, Skin, Eye
        // Bottom row is Base, Trim, Accessory
        // Pass posX and posY as would be in a Matrix index.
        // Color value doesnt have a #.
        const makeColorCell = (posX,posY,colorValue) => {
            var cell = document.createElement("div");
            cell.style.width  =   0.1*w + "px";
            cell.style.height = 0.075*h + "px";
            cell.style.top  = 0.075*h*(posX-1) + "px";
            cell.style.left =   0.1*w*(posY-1) + "px";
            cell.style.position = "absolute"
            cell.style.backgroundColor = _getHexColor(colorValue);
            return cell;
        }

        // Make the cells
        const cpValues = getCC();
        var cellHair = makeColorCell(1,1,cpValues.ccHair)
        var cellSkin = makeColorCell(1,2,cpValues.ccSkin)
        var cellEyes = makeColorCell(1,3,cpValues.ccEyes)
        var cellBase = makeColorCell(2,1,cpValues.ccBase)
        var cellTrim = makeColorCell(2,2,cpValues.ccTrim)
        var cellAces = makeColorCell(2,3,cpValues.ccAces)

        // Build them
        CCContainer.appendChild(cellHair);
        CCContainer.appendChild(cellSkin);
        CCContainer.appendChild(cellEyes);
        CCContainer.appendChild(cellBase);
        CCContainer.appendChild(cellTrim);
        CCContainer.appendChild(cellAces);
        flashFrame.appendChild(CCContainer);
        document.body.appendChild(flashFrame);

    }
    
    window.onload= onLoading;
})();
