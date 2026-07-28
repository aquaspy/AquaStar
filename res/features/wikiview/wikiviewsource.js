
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
 
// wikimg.php (whoasked.freewebhostmost.com) is gone - it used to scrape the wiki page
// server-side and hand back just the item's own image(s). We fetch the page ourselves
// and do the same filtering locally - see extractItemImages() below.
// On aqwwiki itself that fetch is same-origin and works directly. On account.aq.com
// (Inventory/BuyBack/Wheel/CharPage) it isn't - a page-side fetch() to aqwwiki.wikidot.com
// gets blocked by CORS. preload_wikiview.js bridges that: when present, it asks the main
// process to make the request instead (a plain HTTP request there, no CORS to hit) and
// hands the raw HTML back over IPC.
function fetchWikiHtml(link) {
    if (window.aquastarWiki && typeof window.aquastarWiki.fetchWikiPage === "function") {
        return window.aquastarWiki.fetchWikiPage(link).then(function(result) {
            if (!result || !result.ok) throw new Error((result && result.error) || "IPC fetch failed");
            return result.html;
        });
    }
    // No bridge available (e.g. preload missing) - fall back to a direct fetch,
    // which still works when we're same-origin with the wiki.
    return fetch(link).then(function(response) { return response.text(); });
}

function showPreview(link) {
    if (link.startsWith("http://aqwwiki.wikidot.com/")) {
        fetchWikiHtml(link)
            .then(function(html) {
                // parse text. The explicit <base> keeps any relative image URLs anchored
                // to the wiki even when this script is actually running on account.aq.com -
                // DOMParser otherwise resolves relative URLs against the current window's
                // location, not the page the HTML came from.
                return new DOMParser().parseFromString('<base href="http://aqwwiki.wikidot.com/">' + html, "text/html");
            })
            .then(function(doc) {
                // get images
                let images = extractItemImages(doc);

                if (images.length > 0) {
                    let maxwidth = window.innerWidth*0.45 + "px";
                    let maxheight = window.innerHeight*0.65 + "px";

                    removePreview(); // remove previous preview
                    $("body").append('<div id="preview" style="position:fixed;"></div>');

                    // add images to new div
                    images.forEach(function (img) {
                        if (images.length == 1)
                            $("#preview").append('<img style="max-width:' + maxwidth + '; max-height:' + maxheight + '; height:auto; width:auto;" src="' + img.src + '">');
                        else
                            $("#preview").append('<img style="height:' + maxheight + ';" src="' + img.src + '">');
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

// Finds the item's own appearance image(s) on an AQW Wiki item page - replicating what
// the now-defunct wikimg.php proxy used to return. Armors show Male/Female versions in
// a tabbed widget; both come back (in that order) so showPreview displays them side by
// side. Everything else (weapons, capes, unisex items, ...) has a single image in the
// page content.
function extractItemImages(doc) {
    let $content = $(doc).find("#page-content").first();
    if ($content.length === 0) return [];

    // Armor gender variants use wikidot's tabview widget. Only treat it as a gender split
    // if the tabs are actually labeled Male/Female - the same widget gets reused elsewhere
    // on the wiki (e.g. mystery chest reward tables) for unrelated things.
    let genderImages = null;
    $content.find(".yui-navset").each(function () {
        let $navset = $(this);
        let $tabs = $navset.children("ul.yui-nav").children("li");
        let $panels = $navset.children("div.yui-content").children("div");
        let male = null, female = null;

        $tabs.each(function (i) {
            let $label = $(this).find("a em").first();
            if ($label.length === 0) $label = $(this).find("a").first();
            let label = $label.text().trim().toLowerCase();
            let img = $panels.eq(i).find("img")[0];
            if (!img) return;
            if (label === "male") male = img;
            else if (label === "female") female = img;
        });

        if (male || female) {
            genderImages = [male, female].filter(Boolean);
            return false; // found it, stop looking at other tabviews on the page
        }
    });
    if (genderImages) return genderImages;

    // No gender tabview - take the first real image, skipping the small UI "tag" badge
    // icons (costs AC, seasonal item, etc.) sprinkled throughout the page text.
    let fallback = null;
    $content.find("img").each(function () {
        if (!/wdfiles\.com\/local--files\/image-tags\//i.test(this.src)) {
            fallback = this;
            return false;
        }
    });
    return fallback ? [fallback] : [];
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