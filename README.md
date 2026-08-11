# AquaStar
![AquaStarLogo](Icon/Icon_1024.png)

AquaStar is a custom AqLite launcher. It aims to uses the latest aqlite .swf while providing additional features.

## How to download

Go to this link: https://github.com/aquaspy/AquaStar/releases and download the correct one for your system

## Current working and missing

### Working:

Linux build (x86, x64, and ARMv7)
Windows Build (x86 and x64) (Portable and installer versions)
Mac build
ChromeBook support (more on that bellow!)

### ChromeBook (Possibly outdated):

According to /u/Primal_Majin on reddit, AquaStar (and game launcher, if you want that) is able to run on chromebooks using the Linux (Beta) support. 

- On the linux terminal, (he used Debian Buster, the current one at this time), install the package "libnss3", doing the following command:
```
sudo apt install libnss3
```
- Then, on the appimage file, add a shortcut to ChromeOS or make it executable by double clicking, and its done!

If you want a suggestion for making appimage shortcuts on ChromeOS, Primal_Majin also suggested ![menulibre](https://bluesabre.org/menulibre/), to make it.

## Searching for why does this exists and if its safe?

Open Motivation.MD in this repository!

## Is this cross platform?
As cross as we can. Currently there are ARM, both 32 bits and 64 for windows and Linux, and Mac is supported. Try it out and give us Feedback.

## Key diferences from official Launcher
While this project was made to be an AQLite launcher, the project evolved to be so much more. Now its as if AE dedicated their launcher to AQW, and evolved it as much as they could with QoL and fun features, while still supporting the comunity. We had to put some sparkles on top of it as a fully browser only to run flash seems... wastefull :D

As after version 1.2 AQLite is a part of vanilla game, what we offer is support for older platforms, and custom features the official launcher doesnt offer.

## Just some new features on AquaStar:
 - Screenshot button that grabs the game part only.
 - Keybindings for game windows
 - Even more Keybindings for Wiki, design notes, and char pages
 - Support to use an older aqlite file if desired (or any custom flash file, as flash is... you know, dead).
 - Saving your character from flash character page with high resolution (as high as you monitor can render) into a .png in your pc!
    - Colour customization is shown in char page when its saved.
 - And also a keybinding to save your char page!
 - Settings screen! Use the in-app Settings screen (Alt+9) to record and save keybinds and other features.
 - Record the game screen! Ctrl + J for default.
 - (For those looking at your childhood) Load a custom URL into the launcher for old flash games/content! Set it in the "Custom SWF File" section of the Settings screen (Alt+9), which also lets you pick a local .swf file directly.
 - Reminders (Alt+9's neighbor, Alt+T)! A per-character tracker for daily/weekly/seasonal in-game tasks (ultra bosses, class farming, seasonal events...), with a "time until reset" countdown synced to the game's server clock.
 - TODO list (Tasks) (Alt + Y). Write down what you need the most, and do when you feel like it.
 - Sync inventory (Alt + I). Browse your inventory and check what you have or not.
    - They also show on wiki. Which also tells you if you have the item or not!
 - Ruffle support (experimentally). We allow you to test ruffle in the game and also update own version as you need it.
 - And maybe something I forgot

# How to build it yourself

## Requirements:
 - npm/nodejs installed.
 - This repository's code or git installed.

## Instructions:

Download this project's folder into your PC, or clone it directly from this repository using git like:
```
  git clone https://github.com/aquaspy/AquaStar.git
```
If your Operating System's flash library file (like .dll or .so) is not in the FlashPlayer folder,
get it from your own system (win64 and linux are already supported, and mac's one is in the folder too)

Install the dependencies using NPM (nw-flash-trust, electron@11.5.0 and electron-builder) like:

(Electron is intentionally pinned to 11.5.0 in package.json - it's the last release built on a Chromium that still supports PPAPI Flash. Don't bump it without a Flash alternative in place.)

```bash
  cd path/to/project/folder
  npm install
```
npm install will install automatically all dependencies, so no need to specify them manually, just use "npm install".

Now you are ready to run it! before making a package, you can test it running `npm start`.

If aquastar opens correctly, build the package so you can run in any folder you like.
Go to FlashPlayer folder and remove the flash libraries you don't need.
(ex: delete .so in windows, and .dll in linux, as it's irrelevant)

Type: `npm run dist`, and in the new "dist" folder, is your files. In linux case, it's a AppImage file! In windows, it's an Exe! And Mac should be a DMG file!

PS: DO NOT run ./build.sh as it will build EVERY supported version at the same time. its used for releases in the github.

## Troubleshooting

### Stuck at 0%
- This used to be a bug in the original AQlite. Try re-open Aquastar as if this still happens something probably went wrong...
- If you can reproduce what is happening, tell us as we could fix next release.

### Keybindings dont work
- Some Keybindings only work in some places. Most can only be used in the game window.
- The only ones that work on HTML, are Alt+B e Alt+F. The rest are AQW game windows exclusives.

### I dont know where my screenshot/recordings are.
- Check the F1 menu, and see the path the system takes to save. By default it should be the images folder.

### I need to reinstall it everytime i need to open the game?
- On windows, we do have a setup and a portable version. If you just want to double click an .exe instead of having it on your search menu, prefer the Portable version of it.

### I have another problem
- Tell us the information that appears in F9 about OS and Arch, and open a issue on github saying what happened.
