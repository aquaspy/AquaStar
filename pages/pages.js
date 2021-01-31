
var el = document.querySelector('.chrome-tabs');
var chromeTabs = new ChromeTabs();
chromeTabs.init(el);

var texts = {
    account: "AQW Account",
    wiki: "Wiki New Releases",
    //charpage : "Char Page Lookup",
    design: "Design Notes",
    //twitter: "Twitter News (Alina)",
    length: 3
}

 var markActive = function(idName, idText) {
    // Mark old active as non-active anymore
    document.getElementsByClassName("page-active")[0].classList.remove("page-active");
    
    // Mark new one as active
    document.getElementById(idName).classList.add("page-active");

    // Change Title to the Tab text
    document.title = "AQLite: " + idText;
}

function tabChange(detail) {
    // Check if its a new one, a 5th...
    if (chromeTabs.activeTabEl.parentElement.lastElementChild == chromeTabs.activeTabEl) {
        // Last Element.
        //  is it a new one?
        if (chromeTabs.tabContentPositions.length > texts.length) {
            // It is! get rid of it...
            // Note: tab add happens before tab active. Just a note...
            chromeTabs.removeTab(chromeTabs.activeTabEl);
        }
    }
    
    // -------- Search and activate the new active one
    
    // Get the text from the active tab.
    // chromeTabs.activeTabEl.getElementsByClassName("chrome-tab-title")[0].innerText
    var currentText = chromeTabs.activeTabEl.getElementsByClassName("chrome-tab-title")[0].innerText;
    
    if      (currentText === texts.wiki     ) { markActive("wiki",    texts.wiki)     }
    else if (currentText === texts.account  ) { markActive("account", texts.account)  }
    //else if (currentText === texts.charpage ) { markActive("charpage",texts.charpage) }
    else if (currentText === texts.design   ) { markActive("design",  texts.design)   }
    //else if (currentText === texts.twitter  ) { markActive("twitter", texts.twitter)  }
    
}

el.addEventListener('activeTabChange', ({ detail }) => tabChange(detail) )
//el.addEventListener('tabRemove', ({ detail }) => console.log('Tab removed', detail.tabEl)) // Remove was done via CSS with button removal.
//el.addEventListener('tabAdd', ({ detail }) => blockAdd(detail) );

chromeTabs.addTab({
    title: texts.wiki,
    favicon: false
})
chromeTabs.addTab({
    title: texts.account,
    favicon: false
})
// chromeTabs.addTab({
//     title: texts.charpage,
//     favicon: false
// })
chromeTabs.addTab({
    title: texts.design,
    favicon: false
})
// chromeTabs.addTab({
//     title: texts.twitter,
//     favicon: false
// })

// Set to the first tab. which is Wiki
markActive("wiki");
chromeTabs.setCurrentTab(chromeTabs.activeTabEl.parentElement.firstElementChild);

//TODO - Dark mode

function toggleLightDarkMode() {
    if (el.classList.contains('chrome-tabs-dark-theme')) {
        el.classList.remove('chrome-tabs-dark-theme')
    } else {
        el.classList.add('chrome-tabs-dark-theme')
    }
}
