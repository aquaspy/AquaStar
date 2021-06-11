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
        const reduction = "";
        if( w/h > ratio) {
            // Window has bigger Width ratio than the original
            // Scale using Height!
            embed.setAttribute("height",h*0.98);
            embed.setAttribute("width" ,wOri*(h/hOri)*0.98); // Dont ask how i got this... maths...
        }
        else {
            // Window has bigger Height ratio than the original (or equal, doesnt matter)
            // Scale using Width!
            embed.setAttribute("width" ,w*0.98);
            embed.setAttribute("height",(hOri*w*0.98)/(wOri)); // Dont ask how i got this... maths...
        }
        
        console.log(h + " " + w + " " + hOri + " " + wOri);
        console.log(((h*wOri)/(hOri)) + " " + h);
        console.log(((hOri*w)/(wOri)) + " " + w);
        console.log("ratios: " + ratio +" - "+ (w/h))
        /*
        embed.setAttribute("width" ,"1430");
        embed.setAttribute("height","910" );*/
    }
    
    window.onload= onLoading;
})();
