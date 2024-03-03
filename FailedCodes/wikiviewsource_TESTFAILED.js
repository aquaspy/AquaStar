
let mousePos = { x: -1, y: -1 };
document.addEventListener('mousemove',function (event) {
    mousePos.x = event.clientX;
    mousePos.y = event.clientY;
    if (!mouseOn) removePreview();
})
 
let mouseOn = false; // flag to prevent spam
let timeout = null;

document.querySelectorAll("#page-content a, .card.m-2.m-lg-3 a")
    .forEach(e => {
        e.addEventListener('mouseover', () => hovered(e.href));
        e.addEventListener('mouseout',  () => {unhovered()});
    }); 

const invRendered = document.getElementById("inventoryRendered")
if (invRendered) invRendered.addEventListener("mouseover", function(ev) {
    ev.currentTarget.querySelectorAll("a").forEach(a => {
        a.addEventListener("mouseover", () => hovered(a.href));
        a.addEventListener("mouseout", () => {unhovered()});
    });
});

const listTables = document.querySelectorAll("#listinvFull, #wheel, table.table.table-sm.table-bordered")
if (listTables) listTables.forEach(e => {
    e.addEventListener("mouseover", function(ev) {
        ev.currentTarget.querySelectorAll("tbody td:first-child").forEach(td => {
            td.addEventListener("mouseover", function(ev2) {
                const itemName = ev2.currentTarget.textContent.trim().split(/\sx\d+/)[0];
                hovered("https://aqwwiki.wikidot.com/" + itemName);
            });
            td.addEventListener("mouseout",  () => {unhovered()});
        });
    });
});

const buyback = document.getElementById("listinvBuyBk")
if (buyback) buyback.addEventListener("mouseover", function(ev) {
    const tdElements = ev.currentTarget.querySelectorAll("tbody td:nth-child(2)");
    tdElements.forEach(td => {
        td.addEventListener("mouseover", function(ev2) {
            hovered("https://aqwwiki.wikidot.com/" + ev2.currentTarget.textContent.trim());
        });
        td.addEventListener("mouseout",  () => {unhovered()});
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
    console.log("unhovered")
    clearTimeout(timeout);
    mouseOn = false;
}
 
async function showPreview(link) {
    console.log("entered preview")
    if (link.startsWith("http://aqwwiki.wikidot.com/") || link.startsWith("https://aqwwiki.wikidot.com/")) {
        console.log("entered linkStartsWith")
        let url = "https://whoasked.freewebhostmost.com/wikimg.php?page=" + link;
        let response = await fetch(url)
        let html = await response.text()
        let doc = new DOMParser().parseFromString(html, "text/html"); // idk why this was on a .then() if isnt a promise but okay...
        let images = doc.querySelectorAll("body img")
        console.log("Fetch succes")
        
        if (images.length == 0) return; // Fail first bc 1 less indentation.
        
        let maxwidth = window.innerWidth*0.45 + "px";
        let maxheight = window.innerHeight*0.65 + "px";

        removePreview(); // remove previous preview
        document.body.innerHTML += "<div id='preview' style='position:fixed;'></div>"
        console.log("new Div success succes")

        // add images to new div
        var preview = document.getElementById("preview") // div just made.
        images.forEach(function (img) {
            let imgstring = (images.length == 1)? 
                ("<img style='max-width:" + maxwidth + "; max-height:" + maxheight + "; height:auto; width:auto;' src='" + img.src + "'>") :
                ("<img style='height:" + maxheight + ";' src='" + img.src + "'>")
            preview.innerHTML += imgstring
        });

        let wait = setInterval(function(){
            try {
                console.log("Entered Callback waitForImg")
                const arrImages = preview.querySelectorAll("img")
                if (arrImages.length == 0) return;

                const lastImg = images[images.length - 1]
                
                console.log("Entered last image")
                if (lastImg && lastImg.complete) {
                    
                    console.log("Entered last image process")
                    preview.style.top = mousePos.y - (mousePos.y / window.innerHeight) * preview.offsetHeight + "px";
                    if (mousePos.x < window.innerWidth / 2)
                        preview.style.left = mousePos.x + 100 + "px";
                    else
                        preview.style.right = window.innerWidth - mousePos.x + 100 + "px";
                }
                clearInterval(wait);
            }
            catch(error) {
                console.log(error.message)
                clearInterval(wait);
            }
            
            console.log("TrueFimFuncao")
        }, 25);
        
        console.log("Function done.")
    }
}
 
function removePreview() {
    const preview = document.getElementById("preview")
    if (preview) preview.remove() // Testing just to make sure it exists.
}
