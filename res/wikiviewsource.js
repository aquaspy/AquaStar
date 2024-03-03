
// WikiView: AQW Link Preview
// Made by biglavis. https://github.com/biglavis/

// This is the version 1.0.1
// Jquery file recommended is https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js

let mousePos = { x: -1, y: -1 };
    $(document).mousemove(function(event) {
        mousePos.x = event.clientX;
        mousePos.y = event.clientY;
 
        if (!mouseOn) removePreview();
    });
 
let mouseOn = false; // flag to prevent spam
let timeout = null;
 
$("#page-content a, .card.m-2.m-lg-3 a").on({
    mouseover: function() { hovered(this.href); },
    mouseout: function() { unhovered(); }
});
 
$("#inventoryRendered").on("mouseover", function() {
    $(this).find("a").on({
        mouseover: function() { hovered(this.href); },
        mouseout: function() { unhovered(); }
    });
});
 
$("#listinvFull, #wheel, table.table.table-sm.table-bordered").on("mouseover", function() {
    console.log("hovered");
    $(this).find("tbody td:first-child").on({
        mouseover: function() { hovered("http://aqwwiki.wikidot.com/" + this.textContent.split(/\sx\d+/)[0]); },
        mouseout: function() { unhovered(); }
    });
});
 
$("#listinvBuyBk").on("mouseover", function() {
    $(this).find("tbody td:nth-child(2)").on({
        mouseover: function() { hovered("http://aqwwiki.wikidot.com/" + this.textContent); },
        mouseout: function() { unhovered(); }
    });
});
 
function hovered(link) {
    if (!mouseOn) {
        mouseOn = true;
        // show preview if hovered for 100ms
        timeout = setTimeout(function() {
            removePreview(); // remove previous preview
            showPreview(link);
        }, 100);
    }
}
 
function unhovered() {
    clearTimeout(timeout);
    mouseOn = false;
}
 
function showPreview(link) {
    if (link.startsWith("http://aqwwiki.wikidot.com/")) {
        let url = "https://whoasked.freewebhostmost.com/wikimg.php?page=" + link;
        fetch(url)
            .then(function(response) {
                // convert page to text
                return response.text()
            })
            .then(function(html) {
                // parse text
                return new DOMParser().parseFromString(html, "text/html");
            })
            .then(function(doc) {
                // get images
                let images = $(doc).find("body img")
 
                if (images.length > 0) {
                    let maxwidth = window.innerWidth*0.45 + "px";
                    let maxheight = window.innerHeight*0.65 + "px";
 
                    removePreview(); // remove previous preview
                    $("body").append('<div id="preview" style="position:fixed;"></div>');
 
                    // add images to new div
                    images.each(function () {
                        if (images.length == 1)
                            $("#preview").append('<img style="max-width:' + maxwidth + '; max-height:' + maxheight + '; height:auto; width:auto;" src="' + this.src + '">');
                        else
                            $("#preview").append('<img style="height:' + maxheight + ';" src="' + this.src + '">');
                    });
 
                    // wait for images to load then position div
                    waitForImg("#preview img:last", function() {
                        $("#preview").css("top", mousePos.y - (mousePos.y / window.innerHeight) * $("#preview").height() + "px");
                        if (mousePos.x < window.innerWidth / 2)
                            $("#preview").css("left", mousePos.x + 100 + "px");
                        else
                            $("#preview").css("right", window.innerWidth - mousePos.x + 100 + "px");
                    });
                }
            })
            .catch(function(err) {
                console.log("Failed to fetch page: ", err);
            });
    }
}
 
function removePreview() {
    $("#preview").remove();
}
 
function waitForImg(selector, callback) {
    let wait = setInterval(function(){
        try {
            if( $(selector)[0].complete ) {
                callback();
                clearInterval(wait);
            }
        }
        catch {
            clearInterval(wait);
        }
    }, 25);
}