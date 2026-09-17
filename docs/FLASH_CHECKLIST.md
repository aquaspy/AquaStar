# Flash / plugin manual checklist

Automated tests (`npm test`, `npm run smoke:plugins`) cover contracts and assets. **PPAPI Flash and real window menus require a human run.**

## Before you start

1. `npm install` (Electron 11.5.0)
2. `npm start`
3. Settings → General → Active plugin as needed → Save → **Restart**

## Example Companion

1. Set active plugin to **Example Companion**, restart  
2. First window menu shows plugin entries (Example / Pages / Tools), not only Quit  
3. **BoxMover.swf** loads; click the window; arrow keys move the blue square  
4. **Alt+N** (or Example → New BoxMover) opens **exactly one** new game window from a game window **and** from a browser/inject-demo window  
5. Example → static rectangle.swf shows purple field + labeled square (no keyboard move)  
6. **Alt+E** dashboard: visits increment, sticky note saves, GitHub API fetch returns repo info  
7. **Alt+I** inject-demo: localized waiting text, then green “Injection OK…”  
8. **Alt+G / R / D** open the system browser (not an in-app GitHub window)  
9. **F1** Help: “AquaStar (app)” section + “Example Companion” section  
10. Settings → Language → Português → Restart: menus/dashboard/help in pt-BR  

## Adventure Quest Worlds

1. Switch active plugin to **Adventure Quest Worlds**, restart  
2. Game menu shows Game / Features / Pages  
3. Alt+N new AQW instance; Alt+1 DragonFable; Alt+T / Y / I / U feature windows  
4. F1 Help: platform section + Adventure Quest Worlds section  
5. Wiki / account pages load; WikiView still works on wiki hosts  

## Packaging smoke

1. `npm run smoke:plugins`  
2. Optional: `npm run pack` then confirm `plugins/adventure-quest-worlds` and `plugins/example-companion` under the unpacked app tree  
