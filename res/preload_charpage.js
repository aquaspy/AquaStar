(() => {
    // AQW IMG at the top
    function onLoading () {
        var flash = document.getElementsByTagName("object")[0].parentElement;
        
        // Make flash be the whole page
        var body = document.body;
        body.innerHTML = "";
        body.appendChild(flash);
        body.style.backgroundColor = "#FEF1C5";
        
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
            embed.setAttribute("height",h-red);
            embed.setAttribute("width" ,wOri*((h-red)/hOri)); // Dont ask how i got this... maths...
        }
        else {
            // Window has bigger Height ratio than the original (or equal, doesnt matter)
            // Scale using Width!
            embed.setAttribute("width" ,w);
            embed.setAttribute("height",hOri*(w/wOri)); // Dont ask how i got this... maths...
        }
    }
    
    window.onload= onLoading;
})();
