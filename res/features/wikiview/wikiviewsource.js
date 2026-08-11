
// WikiView: AQW Link Preview
// Made by biglavis. https://github.com/biglavis/

// This is the version 1.0.1
// Jquery file recommended is https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js

// The actual "fetch the wiki page, extract its image(s), show/hide a preview near the
// cursor" engine lives in hoverPreview.js now (hovered/unhovered/showPreview/removePreview
// etc.) - shared with the Inventory window. This file only wires up which elements on
// wiki/account.aq.com pages should trigger a hover in the first place. Whatever injects
// this script must load hoverPreview.js (and jQuery) first - see res/instances.js.

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

// These build a link from the item's plain name rather than a real <a href>, so they go
// through hoveredName() - it retries the wiki's disambiguation suffixes ((AC), (Merge)...)
// when the bare name has no page of its own. See hoverPreview.js.
$("#listinvFull, #wheel, table.table.table-sm.table-bordered").on("mouseover", function() {
    console.log("hovered");
    $(this).find("tbody td:first-child").on({
        mouseover: function() { hoveredName(this.textContent.split(/\sx\d+/)[0].trim()); },
        mouseout: function() { unhovered(); }
    });
});

$("#listinvBuyBk").on("mouseover", function() {
    $(this).find("tbody td:nth-child(2)").on({
        mouseover: function() { hoveredName(this.textContent.trim()); },
        mouseout: function() { unhovered(); }
    });
});

// --- Inventory ownership badge + character switcher, aqwwiki.wikidot.com item pages only.
// (This script also runs on account.aq.com/CharPage, which has no #page-title and no
// aquastarWiki.matchWikiItem use, so this whole block is gated to the wiki domain itself.)
if (location.hostname.indexOf("aqwwiki.wikidot.com") !== -1 &&
    window.aquastarWiki && typeof window.aquastarWiki.matchWikiItem === "function") {

    const AQWE_BANK_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 6L8 2l6 4"/><path d="M1.5 6.5h13"/><path d="M3 7v6M6.3 7v6M9.7 7v6M13 7v6"/><path d="M1.5 13.5h13"/></svg>';
    const AQWE_BAG_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5.5" width="10" height="8.5" rx="1.5"/><path d="M6 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
    const AQWE_BUYBACK_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5v4h4"/><path d="M3.5 9.8A5.5 5.5 0 1 0 5 4.2L3 7.5"/></svg>';

    function aqweBadge(icon, count, title, bg, color) {
        return '<span title="' + title + '" style="display:inline-flex;align-items:center;gap:3px;' +
            'background:' + bg + ';color:' + color + ';border-radius:10px;padding:2px 6px;' +
            'font-size:11px;vertical-align:middle;">' + icon + count + '</span>';
    }

    function renderOwnershipBadges(match) {
        if (!match || !match.owned) return;
        const badges = [];
        if (match.bank > 0) badges.push(aqweBadge(AQWE_BANK_ICON, match.bank, 'In your bank (x' + match.bank + ')', 'rgba(52,152,219,0.18)', '#7ec8f2'));
        if (match.inventory > 0) badges.push(aqweBadge(AQWE_BAG_ICON, match.inventory, 'In your inventory (x' + match.inventory + ')', 'rgba(154,154,154,0.16)', '#b0b0b0'));
        if (match.buyback > 0) badges.push(aqweBadge(AQWE_BUYBACK_ICON, match.buyback, 'In your Buy Back history (x' + match.buyback + ')', 'rgba(230,168,52,0.18)', '#f0c987'));
        if (badges.length === 0) return;
        $('#page-title').first().append('<span id="aquastarOwnBadges" style="display:inline-flex;gap:4px;margin-left:10px;">' + badges.join('') + '</span>');
    }

    function refreshOwnershipBadge() {
        $('#aquastarOwnBadges').remove();
        const title = $('#page-title').first().text().trim();
        if (!title) return;
        window.aquastarWiki.matchWikiItem(title).then(renderOwnershipBadges).catch(function () {});
    }

    // Only shown once 2+ characters have been synced - stays out of the way entirely for
    // the common single-character case, per res/features/inventory/inventory.js's
    // "lastActiveCharId" being the one thing this chip needs to read/write.
    function renderCharSwitcher(data) {
        $('#aquastarCharSwitcher').remove();
        const charIds = Object.keys(data.characters);
        if (charIds.length < 2) return;

        const select = $('<select id="aquastarCharSwitcher"></select>').css({
            position: 'fixed', top: '12px', right: '12px', zIndex: 99999,
            background: '#232323', color: '#e6e6e6', border: '1px solid #383838',
            borderRadius: '4px', padding: '5px 8px', fontFamily: 'sans-serif',
            fontSize: '12px', cursor: 'pointer'
        });
        charIds.forEach(function (charId) {
            const character = data.characters[charId];
            $('<option></option>')
                .attr('value', charId)
                .text(character.name || ('Character ' + charId))
                .prop('selected', charId === data.lastActiveCharId)
                .appendTo(select);
        });
        select.on('change', function () {
            window.aquastarWiki.setInventoryActiveChar(this.value).then(refreshOwnershipBadge);
        });
        $('body').append(select);
    }

    window.aquastarWiki.getInventory().then(function (result) {
        renderCharSwitcher(result.data);
        refreshOwnershipBadge();
    }).catch(function () {});
}
