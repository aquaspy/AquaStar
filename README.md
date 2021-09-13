# AquaStar
![AquaStarLogo](https://i.imgur.com/R8oZonX.png)

AquaStar is a custom AqLite launcher. It aims to uses the latest aqlite .swf while providing additional features.

## How to download

Go to this link: https://github.com/aquaspy/AquaStar/releases

and download the correct one for your system

## Current working and missing

### Working:

Linux build (x86, x64, and ARMv7)
Windows Build (x86 and x64)
ChromeBook support (more on that bellow!)

### Missing:
Mac Build - There is support but we dont have a Mac to compile it.

### ChromeBook:

According to /u/Primal_Majin on reddit, AquaStar (and game launcher, if you want that) is able to run on chromebooks using the Linux (Beta) support. 

- On the linux terminal, (he used Debian Buster, the current one at this time), install the package "libnss3", doing the following command:
```
sudo apt install libnss3
```
- Then, on the appimage file, add a shortcut to ChromeOS or make it executable by double clicking, and its done!

If you want a suggestion for making appimage shortcuts on ChromeOS, Primal_Majin also suggested ![menulibre](https://bluesabre.org/menulibre/), to make it.

## Searching for Custom Keybinding stuff? 

Open Keybinding.MD in this repository!

## Searching for why does this exists and if its safe?

Open Motivation.MD in this repository!

## Will it be cross platform?

As cross as we can. Currently there are ARM, both 32 bits and 64 for windows and Linux, and Mac is suposedly supported. Try it out and give us Feedback.

## Key diferences from official AqLite

The core is the same. You should thank 133spider instead of me for making all that amazing features. All I did was to write a simple code that uses his swf file and compile it for linux and mac, so linux and mac users can play too in a launcher. We also putted some sparkles on top of it as a fully browser only to run flash seems... wastefull :D

After version 1.2: Now that AQLite is "dead", as its merged into official game, our launcher loads the AE version instead. Older aqlite support is still there.

## Just some new features on AquaStar:
 - Screenshot button that grabs the game part only.
 - Keybindings for alt windows and vanilla aqw windows (up to 1.2, as vanilla is merged with aqlite)
 - Even more Keybindings for Wiki, design notes, and char pages
 - Tabbed window for that browser feel in the Wiki, design notes... the website windows
 - Support to use an older aqlite file if desired (or any custom flash file, as flash is... you know, dead).
 - Saving your character from flash character page with high resolution (as high as you monitor can render) into a .png in your pc!
 - Colour customization is shown in char page when its saved.
 - And also a keybinding to save your char page!
 - Custom keybindings! just create a aquastar.json in the designed folder!
 - Record the game screen!

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

Put the aqlite.swf file in the SAME FOLDER of main.js (the project root), if isnt there by any reason.

Install the dependencies using NPM (nw-flash-trust, electron@4.2.12 and electron-builder) like:

```bash
  cd path/to/project/folder
  npm install
```
npm install will install automatically all dependencies, so no need to specify them manually, just use "npm install".

Now you are ready to run it! before making a package, you can test it running `npm start`.

If aqlite opens correctly, build the package so you can run in any folder you like.
Go to FlashPlayer folder and remove the flash libraries you don't need.
(ex: delete .so in windows, and .dll in linux, as it's irrelevant)

Type: `npm run dist`, and in the new "dist" folder, is your files. In linux case, it's a AppImage file! In windows, it's an Exe! And Mac should be a DMG file!

PS: DO NOT run ./build.sh as it will build EVERY supported version at the same time. its used for releases in the github.

## Troubleshooting

### Stuck at 0%
- Try to control + f5 the launcher. It will reload the page.
- Try to shift + f5, to clear cache
- Try the Spider's solutions for this problem.

### Keybindings dont work
- Some Keybindings only work in some places. Most can only be used in the game window.
- The only ones that work on HTML, are Alt+B e Alt+F. The rest are AQW game windows exclusives.
- Check out Keybinding.MD in this repository for Custom Keybinds FAQ and problems.

### Screenshot isnt taken
- Up to 0.5, there is no confirmation to Screenshot took, but they are saved not in the same folder, but in the Pictures file in your User folder. Press F1 and you will see where it is.

### aqlite_old.swf is in the same folder, but doesnt work.
- Check the F1 menu, and see if the path is the same as the one your file is. Its not the shortcut folder, so it must be the .exe's real location!

### I need to reinstall it everytime i need to open the game?
- On windows, unlike with official aqlite and linux versions, windows's version is an installer. So next time you want to open the game, try searching it on the windows menu.

### I have another problem
- Tell us the information that appears in F9 about OS and Arch, and open a issue on github saying what happened.
