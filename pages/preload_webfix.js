(() => {
    // For TABBED WINDOW TO ENJOY TOO!
    // FIXME FIX - Currently doesnt work.
    
    function testAndDelete(objName,isClass = false) {
        //isClass == false indicates its an ID
        var objToNuke;
        (isClass)?
            objToNuke = document.getElementsByClassName(objName)[0]:
            objToNuke = document.getElementById(objName);
        if (objToNuke != undefined){
            objToNuke.innerHTML = "";
        }
    }

    testAndDelete("ncmp__tool",false);
    testAndDelete("fb-page",true);
})();
