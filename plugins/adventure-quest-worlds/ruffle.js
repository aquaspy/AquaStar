// How AQW runs under Ruffle (Settings → Render mode). AQW's client talks to the game servers
// over raw TCP, which Ruffle cannot do on its own, so the platform relays it through a local
// WebSocket<->TCP bridge; this file tells the platform what the game may connect to.

module.exports = {
    socket: {
        // The server list is the source of truth; fallbackHosts only covers it being unreachable.
        // Refresh with: curl -sL https://game.aq.com/game/api/data/servers | python3 -m json.tool
        serversApi: 'https://game.aq.com/game/api/data/servers',
        fallbackHosts: {
            'sock7.aq.com': [5588, 5589, 5591, 5592, 5593, 5594],
            'sock8.aq.com': [5588, 5589, 5590, 5591, 5593],
            'euro.aqw.artix.com': [5588],
            'asia.game.artix.com': [5588]
        },
        // Flash asks every server for its cross-domain policy on this port first.
        policyPort: 843,
        // The relay refuses any other host, whatever the page asks for.
        allowedHosts: ['*.aq.com', '*.artix.com']
    }
};
