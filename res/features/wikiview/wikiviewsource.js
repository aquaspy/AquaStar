
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

    const AQWE_BANK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 6L8 2l6 4"/><path d="M1.5 6.5h13"/><path d="M3 7v6M6.3 7v6M9.7 7v6M13 7v6"/><path d="M1.5 13.5h13"/></svg>';
    const AQWE_BAG_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5.5" width="10" height="8.5" rx="1.5"/><path d="M6 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
    const AQWE_BUYBACK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5v4h4"/><path d="M3.5 9.8A5.5 5.5 0 1 0 5 4.2L3 7.5"/></svg>';

    function aqweBadge(icon, count, title, bg, color, compact) {
        const renderedIcon = compact ? icon.replace('width="16" height="16"', 'width="12" height="12"') : icon;
        return '<span title="' + title + '" style="display:inline-flex;align-items:center;gap:3px;' +
            'background:' + bg + ';color:' + color + ';border-radius:10px;padding:' + (compact ? '3px 6px' : '6px 12px') + ';' +
            'font-size:' + (compact ? '10px' : '13px') + ';vertical-align:middle;">' + renderedIcon + count + '</span>';
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
        // Some Wikidot item pages decorate #page-title with extra page text, while their
        // URL remains the clean item slug.  Check both forms so aliases such as
        // "The Contract of Nulgath" -> "Unidentified 13" work at the top of the page as
        // well as in a quest/merge link.
        const slugTitle = decodeURIComponent(location.pathname)
            .replace(/^\/+|\/+$/g, '')
            .replace(/-\d+$/, '') // dragonbone-blade-1 is still Dragonbone Blade
            .replace(/-/g, ' ');
        const candidates = [title, slugTitle].filter(Boolean);
        if (candidates.length === 0) return;
        if (typeof window.aquastarWiki.matchWikiItems === 'function') {
            window.aquastarWiki.matchWikiItems(candidates).then(function (matches) {
                const match = candidates.map(function (candidate) { return matches[candidate]; })
                    .filter(function (candidateMatch) { return candidateMatch && candidateMatch.owned; })[0];
                if (match && match.owned) renderOwnershipBadges(match);
            }).catch(function () {});
        } else {
            window.aquastarWiki.matchWikiItem(title).then(renderOwnershipBadges).catch(function () {});
        }
        renderLinkedItemBadges();
    }

    // Merge requirements, quest rewards and shop entries are all ordinary AQW Wiki links.
    // Decorating every content link whose label actually matches local inventory data makes
    // this robust across their differing markup (including the yui-content tab panels),
    // while links such as navigation/category links simply receive no badge.
    function renderLinkedItemBadges() {
        if (typeof window.aquastarWiki.matchWikiItems !== 'function') return;
        $('.aquastarLinkedOwnBadges').remove();
        const links = $('#page-content a[href]').filter(function () {
            const text = $(this).text().replace(/\s+/g, ' ').trim();
            return text.length > 0 && text.length <= 120 && !$(this).closest('#page-title').length;
        }).toArray();
        const titles = Array.from(new Set(links.map(function (link) {
            return $(link).text().replace(/\s+/g, ' ').trim();
        })));
        if (titles.length === 0) return;
        window.aquastarWiki.matchWikiItems(titles).then(function (matches) {
            links.forEach(function (link) {
                const title = $(link).text().replace(/\s+/g, ' ').trim();
                const match = matches[title];
                if (!match || !match.owned) return;
                const badges = [];
                if (match.bank > 0) badges.push(aqweBadge(AQWE_BANK_ICON, match.bank, 'In your bank (x' + match.bank + ')', 'rgba(52,152,219,0.18)', '#7ec8f2', true));
                if (match.inventory > 0) badges.push(aqweBadge(AQWE_BAG_ICON, match.inventory, 'In your inventory (x' + match.inventory + ')', 'rgba(154,154,154,0.16)', '#b0b0b0', true));
                if (match.buyback > 0) badges.push(aqweBadge(AQWE_BUYBACK_ICON, match.buyback, 'In your Buy Back history (x' + match.buyback + ')', 'rgba(230,168,52,0.18)', '#f0c987', true));
                if (badges.length) $(link).after('<span class="aquastarLinkedOwnBadges" style="display:inline-flex;gap:2px;margin-left:5px;vertical-align:middle;">' + badges.join('') + '</span>');
            });
        }).catch(function () {});
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

// --- Merge-shop material calculator -------------------------------------------------
// A shop page is identified by its own breadcrumb, not its URL: this keeps the feature
// correct for renamed pages and leaves ordinary item/quest pages untouched.  Shop rows are
// self-contained (Name + Price), so dependencies can be expanded without fetching any
// additional Wiki pages.  Only a price link that points to another row in THIS shop is a
// dependency; every other price link is a leaf material.
if (location.hostname.indexOf("aqwwiki.wikidot.com") !== -1 &&
    /Shops\s*»\s*Merge Shops/i.test($('#breadcrumbs').text())) {

    function mergeShopKey(link) {
        try { return new URL(link, location.href).pathname.toLowerCase(); }
        catch (e) { return ''; }
    }

    function mergeShopText(node) {
        return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function mergeShopQuantityAfter(link) {
        let text = '';
        let node = link.nextSibling;
        while (node && node.nodeName !== 'BR') {
            text += node.textContent || '';
            node = node.nextSibling;
        }
        const match = text.match(/x\s*([\d,]+)/i);
        return match ? parseInt(match[1].replace(/,/g, ''), 10) : 1;
    }

    function collectMergeShopProducts() {
        const products = new Map();
        $('#page-content table.wiki-content-table tr').each(function () {
            const cells = this.querySelectorAll('td');
            if (cells.length < 3) return; // table heading or non-shop table
            const nameCell = cells[1];
            const priceCell = cells[2];
            const nameLink = nameCell.querySelector('a[href]');
            if (!nameLink) return;
            const key = mergeShopKey(nameLink.href);
            const name = mergeShopText(nameLink);
            if (!key || !name) return;

            const requirements = [];
            priceCell.querySelectorAll('a[href]').forEach(function (link) {
                const requirementName = mergeShopText(link);
                const requirementKey = mergeShopKey(link.href);
                if (!requirementName || !requirementKey) return;
                requirements.push({
                    key: requirementKey,
                    name: requirementName,
                    quantity: mergeShopQuantityAfter(link)
                });
            });
            // Gold costs do not have an item link, but are still a material cost.
            const gold = mergeShopText(priceCell).match(/([\d,]+)\s*Gold\b/i);
            products.set(key, {
                key: key,
                name: name,
                legend: !!nameCell.querySelector('img[alt="legendsmall.png"]'),
                ac: !!nameCell.querySelector('img[alt="acsmall.png"]'),
                requirements: requirements,
                gold: gold ? parseInt(gold[1].replace(/,/g, ''), 10) : 0
            });
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'aquastarMergeShopItem';
            checkbox.checked = true;
            checkbox.title = name;
            checkbox.setAttribute('aria-label', name);
            checkbox.style.margin = '0 4px 0 0';
            nameCell.insertBefore(checkbox, nameLink);
            products.get(key).checkbox = checkbox;
        });
        return products;
    }

    function mergeShopTotals(products, mode) {
        const totals = new Map();
        const acPurchased = new Set();
        const add = function (key, name, quantity) {
            const entry = totals.get(key) || { name: name, quantity: 0 };
            entry.quantity += quantity;
            totals.set(key, entry);
        };
        const recursive = mode === 'dependencies' || mode === 'buyback';
        const buyback = mode === 'buyback';

        function addPrice(product, multiplier, stack) {
            if (buyback && product.ac) {
                // An AC item can be bought once and then reacquired from Buy Back at no
                // material cost.  Its first acquisition still has its full listed price.
                if (acPurchased.has(product.key)) return;
                acPurchased.add(product.key);
                multiplier = 1;
            }
            if (stack.has(product.key)) return; // malformed cyclic shop data: never loop
            const nextStack = new Set(stack);
            nextStack.add(product.key);
            product.requirements.forEach(function (requirement) {
                const dependency = products.get(requirement.key);
                const quantity = multiplier * requirement.quantity;
                if (recursive && dependency) addPrice(dependency, quantity, nextStack);
                else add(requirement.key, requirement.name, quantity);
            });
            if (product.gold) add('gold', 'Gold', multiplier * product.gold);
        }

        products.forEach(function (product) {
            if (!product.checkbox.checked) return;
            addPrice(product, 1, new Set());
        });
        return Array.from(totals.values()).filter(function (entry) { return entry.quantity > 0; })
            .sort(function (a, b) { return a.name.localeCompare(b.name); });
    }

    function renderMergeShopCalculator(messages) {
        if (document.getElementById('aquastarMergeShopCalculator')) return;
        const products = collectMergeShopProducts();
        if (products.size === 0) return;
        const panel = document.createElement('div');
        panel.id = 'aquastarMergeShopCalculator';
        // Deliberately inherits the Wiki's Verdana font, colours, inputs and links instead
        // of bringing AquaStar's dark-window styling into an otherwise native Wiki page.
        panel.style.cssText = 'margin:8px 0 12px;font:inherit;color:inherit;';
        panel.innerHTML = '<strong>' + messages.mergeMaterialsTitle + '</strong> ' +
            '<select id="aquastarMergeShopMode">' +
            '<option value="dependencies">' + messages.mergeDependencies + '</option>' +
            '<option value="buyback">' + messages.mergeBuyback + '</option>' +
            '</select><div id="aquastarMergeShopTotals" style="margin:5px 0 0 0;"></div>';
        $('#breadcrumbs').after(panel);

        const output = panel.querySelector('#aquastarMergeShopTotals');
        const redraw = function () {
            const totals = mergeShopTotals(products, panel.querySelector('#aquastarMergeShopMode').value);
            output.innerHTML = totals.length
                ? '<ul style="margin:4px 0 0 18px;padding:0;columns:2;">' + totals.map(function (entry) {
                    return '<li>' + entry.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' <strong>x' + entry.quantity + '</strong></li>';
                }).join('') + '</ul>'
                : '<span>' + messages.mergeEmpty + '</span>';
        };
        panel.querySelector('#aquastarMergeShopMode').addEventListener('change', redraw);
        products.forEach(function (product) {
            product.checkbox.addEventListener('change', redraw);
        });
        redraw();
    }

    const mergeMessagesFallback = {
        mergeMaterialsTitle: 'AquaStar: Shop materials',
        mergeDependencies: 'Include dependencies',
        mergeBuyback: 'Dependencies with Buy Back',
        mergeEmpty: 'No materials listed.',
        mergeSelectItem: 'Select item'
    };
    if (typeof window.aquastarWiki.getMessages === 'function') {
        window.aquastarWiki.getMessages().then(renderMergeShopCalculator)
            .catch(function () { renderMergeShopCalculator(mergeMessagesFallback); });
    } else {
        renderMergeShopCalculator(mergeMessagesFallback);
    }
}
