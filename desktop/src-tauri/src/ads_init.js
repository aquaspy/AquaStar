(function () {
  if (window.__aquastarAds) return;
  window.__aquastarAds = 1;
  var hosts = [/*HOSTS*/];
  function blocked(url) {
    if (!url) return false;
    var host;
    try { host = new URL(String(url), document.baseURI).hostname.toLowerCase(); }
    catch (e) { return false; }
    while (host.charCodeAt(host.length - 1) === 46) host = host.slice(0, -1);
    for (var i = 0; i < hosts.length; i++) {
      var entry = hosts[i];
      if (host === entry) return true;
      if (host.length > entry.length && host.charCodeAt(host.length - entry.length - 1) === 46 && host.slice(-entry.length) === entry) return true;
    }
    return false;
  }
  var AD = ".wd-adunit,#ncmp__tool,.fb-page";
  function hideStyle() {
    if (document.getElementById("aquastar-ads")) return;
    var style = document.createElement("style");
    style.id = "aquastar-ads";
    style.textContent = AD + "{display:none!important;height:0!important;min-height:0!important;overflow:hidden!important}";
    (document.head || document.documentElement).appendChild(style);
  }
  function adElement(el) {
    if (!el || el.nodeType !== 1 || el.id === "aquastar-ads") return false;
    if (el.matches && el.matches(AD)) return true;
    var tag = el.tagName;
    if (tag !== "SCRIPT" && tag !== "IFRAME" && tag !== "FRAME" && tag !== "IMG" && tag !== "LINK" && tag !== "EMBED" && tag !== "OBJECT") return false;
    return blocked(el.getAttribute("src") || el.getAttribute("href") || el.getAttribute("data-src") || "");
  }
  function strip(node) {
    if (!node || node.nodeType !== 1) return;
    if (adElement(node)) { node.remove(); return; }
    if (!node.querySelectorAll) return;
    var found = node.querySelectorAll("script,iframe,frame,img,link,embed,object," + AD);
    for (var i = found.length - 1; i >= 0; i--) if (adElement(found[i])) found[i].remove();
  }
  function watch() {
    hideStyle();
    strip(document.documentElement);
    if (window.__aquastarAdsObs) return;
    window.__aquastarAdsObs = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) strip(added[j]);
      }
    });
    window.__aquastarAdsObs.observe(document.documentElement, { childList: true, subtree: true });
  }
  function guard(proto, prop) {
    try {
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (value) {
          if (blocked(value)) return;
          desc.set.call(this, value);
        }
      });
    } catch (e) {}
  }
  if (window.HTMLScriptElement) guard(HTMLScriptElement.prototype, "src");
  if (window.HTMLIFrameElement) guard(HTMLIFrameElement.prototype, "src");
  try {
    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if ((name === "src" || name === "href") && blocked(value) && /^(SCRIPT|IFRAME|FRAME|IMG|LINK|EMBED|OBJECT)$/.test(this.tagName)) return;
      return setAttribute.call(this, name, value);
    };
  } catch (e) {}
  var append = Node.prototype.appendChild;
  var insert = Node.prototype.insertBefore;
  Node.prototype.appendChild = function (node) {
    if (adElement(node)) return node;
    return append.call(this, node);
  };
  Node.prototype.insertBefore = function (node, ref) {
    if (adElement(node)) return node;
    return insert.call(this, node, ref);
  };
  if (window.fetch) {
    var fetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : (input && input.url);
      if (blocked(url)) return Promise.reject(new TypeError("blocked"));
      return fetch.apply(this, arguments);
    };
  }
  if (window.XMLHttpRequest) {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (_method, url) {
      this.__aquastarBlocked = blocked(url);
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__aquastarBlocked) return;
      return send.apply(this, arguments);
    };
  }
  function boot() {
    if (!document.documentElement) return;
    watch();
  }
  boot();
  document.addEventListener("DOMContentLoaded", boot);
})();
