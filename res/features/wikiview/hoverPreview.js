// WikiView's hover-preview engine, extracted out of wikiviewsource.js so it can be reused
// by the Inventory window (res/features/inventory/inventory.html) as well as the injected
// wiki/account.aq.com script. This file only owns "given a wiki item link, show/hide an
// image preview near the cursor" - it has no opinion on which elements should trigger a
// hover in the first place (that selector-wiring stays in wikiviewsource.js and in
// inventory.html respectively, since it's different per page).
//
// jQuery-dependent (matches wikiviewsource.js's existing style) - any page using this must
// load jquery.min.js first, whether via <script src> (Inventory window) or by prepending it
// to the injected source string (res/instances.js, for aqwwiki.wikidot.com pages).
// Originally by biglavis: https://github.com/biglavis/

let mousePos = { x: -1, y: -1 };
$(document).mousemove(function(event) {
    mousePos.x = event.clientX;
    mousePos.y = event.clientY;

    if (!mouseOn) removePreview();
});

let mouseOn = false; // flag to prevent spam
let hoverTimeout = null;

function hovered(link) {
    if (!mouseOn) {
        mouseOn = true;
        // show preview if hovered for 100ms
        hoverTimeout = setTimeout(function() {
            removePreview(); // remove previous preview
            showPreview(link);
        }, 100);
    }
}

// Same as hovered(), but for callers that only have the item's bare name (table rows,
// Inventory window items) rather than an actual wiki <a href>. Some items have more than
// one way to acquire them and the wiki disambiguates with a parenthetical suffix baked
// into the page name itself (e.g. "Proto Legion Dark Caster (Merge)" ->
// proto-legion-dark-caster-merge) - see showPreviewForName() below for the retry chain.
function hoveredName(name) {
    if (!mouseOn) {
        mouseOn = true;
        hoverTimeout = setTimeout(function() {
            removePreview();
            showPreviewForName(name);
        }, 100);
    }
}

function unhovered() {
    clearTimeout(hoverTimeout);
    mouseOn = false;
}

// wikimg.php (whoasked.freewebhostmost.com) is gone - it used to scrape the wiki page
// server-side and hand back just the item's own image(s). We fetch the page ourselves
// and do the same filtering locally - see extractItemImages() below.
// On aqwwiki itself that fetch is same-origin and works directly. On account.aq.com
// (Inventory/BuyBack/Wheel/CharPage) and in AquaStar's own windows it isn't - a page-side
// fetch() to aqwwiki.wikidot.com gets blocked by CORS. preload_wikiview.js (and
// preload_inventory.js, which re-exposes the same bridge) handle that: when present, they
// ask the main process to make the request instead (a plain HTTP request there, no CORS to
// hit) and hand the raw HTML back over IPC.
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
        fetchAndExtractImages(link)
            .then(function(images) {
                if (images.length > 0) renderPreview(images);
            })
            .catch(function(err) {
                console.log("Failed to fetch page: ", err);
            });
    }
}

// Fetches a wiki page and pulls out its item image(s), or resolves to [] if the page
// doesn't exist / has none - never rejects for a missing page, only for a genuine network
// failure, so callers can treat "no images" as "try the next thing" rather than an error.
function fetchAndExtractImages(link, depth) {
    depth = depth || 0;
    return fetchWikiHtml(link)
        .then(function(html) {
            // parse text. The explicit <base> keeps any relative image URLs anchored
            // to the wiki even when this script is actually running on account.aq.com -
            // DOMParser otherwise resolves relative URLs against the current window's
            // location, not the page the HTML came from.
            return new DOMParser().parseFromString('<base href="http://aqwwiki.wikidot.com/">' + html, "text/html");
        })
        .then(function(doc) {
            if (depth < 2 && isDisambiguationPage(doc, link)) {
                return tryDisambiguationLinks(doc, depth + 1);
            }
            return extractItemImages(doc);
        });
}

// A Wiki disambiguation page has a bare breadcrumb, no item/category metadata, and a list
// of page-content links. Its first image is often site/social chrome, not an AQW item.
// Follow its item links until one resolves to a real item image instead.
function isDisambiguationPage(doc, link) {
    const $content = $(doc).find('#page-content').first();
    if (!$content.length) return false;
    const crumbs = $(doc).find('#breadcrumbs').text().replace(/\s+/g, ' ').trim();
    const hasItemMetadata = $content.find('.page-tags, .wiki-content-table, .yui-navset').length > 0;
    // Normal item pages include their category trail, e.g. "Wiki » Items » Misc. Items
    // » Item Name". A true disambiguation page has only "Wiki » Title".
    const breadcrumbLevels = (crumbs.match(/»/g) || []).length;
    const contentLinks = $content.find('a[href]').length;
    const result = !hasItemMetadata && breadcrumbLevels === 1 && /^AQWorlds Wiki\s*»/i.test(crumbs) && contentLinks > 0;
    return result;
}

function tryDisambiguationLinks(doc, depth) {
    const links = [];
    $(doc).find('#page-content a[href]').each(function () {
        const href = $(this).attr('href') || '';
        if (!href || /^(#|javascript:|mailto:)/i.test(href) || /(^|\/)category:/i.test(href)) return;
        let url;
        try { url = new URL(href, 'http://aqwwiki.wikidot.com/').href; } catch (e) { return; }
        if (!/^http:\/\/aqwwiki\.wikidot\.com\//i.test(url) || links.indexOf(url) !== -1) return;
        links.push(url);
    });
    function next(index) {
        if (index >= links.length) return Promise.resolve([]);
        return fetchAndExtractImages(links[index], depth).then(function (images) {
            return images.length ? images : next(index + 1);
        }).catch(function () { return next(index + 1); });
    }
    return next(0);
}

function renderPreview(images) {
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

// Some items have more than one way to acquire them (a normal drop AND a merge shop
// version, an AC-shop version, etc.) and the wiki disambiguates by baking a parenthetical
// suffix into the page name itself - e.g. "Proto Legion Dark Caster" the drop doesn't have
// its own page, only "Proto Legion Dark Caster (Merge)" does (proto-legion-dark-caster-merge).
// Tries the bare name first (the common case), then each known suffix in turn, stopping at
// the first page that actually has an image. Gives up silently if none match - a missing
// preview is a lot less disruptive than showing the wrong item's picture. Suffixes and
// known multi-tag exceptions live in nameVariants.js, shared with inventory ownership.
const wikiNameVariants = window.AquaStarWikiNameVariants;

function showPreviewForName(name) {
    const pageOverride = wikiNameVariants.findPageOverride(name);
    if (pageOverride) {
        fetchAndExtractImages('http://aqwwiki.wikidot.com/' + pageOverride)
            .then(function(images) { if (images.length > 0) renderPreview(images); })
            .catch(function() {});
        return;
    }
    const override = wikiNameVariants.findNameOverride(name);
    if (override) {
        // Try the known-correct combo first; if even that doesn't resolve (e.g. the wiki
        // page moved), fall back to the generic single-suffix chain rather than giving up.
        fetchAndExtractImages('http://aqwwiki.wikidot.com/' + wikiNameVariants.toWikiSlug(name + override))
            .then(function(images) {
                if (images.length > 0) renderPreview(images);
                else tryNameVariant(name, 0);
            })
            .catch(function() {
                tryNameVariant(name, 0);
            });
        return;
    }
    tryNameVariant(name, 0);
}

function tryNameVariant(name, index) {
    if (index >= wikiNameVariants.disambiguationSuffixes.length) return; // exhausted every variant
    const link = 'http://aqwwiki.wikidot.com/' + wikiNameVariants.toWikiSlug(name + wikiNameVariants.disambiguationSuffixes[index]);
    fetchAndExtractImages(link)
        .then(function(images) {
            if (images.length > 0) renderPreview(images);
            else tryNameVariant(name, index + 1);
        })
        .catch(function() {
            tryNameVariant(name, index + 1);
        });
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
        if (!/wdfiles\.com\/local--files\/image-tags\/|wdfiles\.com\/local--files\/css:homepage\/|twitter\.png|facebook\.png/i.test(this.src)) {
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
