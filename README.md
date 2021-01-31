# AquaStar
![AquaStar](https://imgur.com/a/83zzVC6)
AquaStar is a custom AqLite launcher. It aims to uses the latest aqlite .swf while providing additional features and builds for Linux,

## How to download

Go to this link: https://github.com/aquaspy/AquaStar/releases

and download for your system

## Current working and missing

### Working:

Linux build
Windows Build

### Missing:
Mac Build


## Why?

Sadly, I know that it is against the TOS to use third party launchers. As long I like AE and AQW, I think that their game needs some of the quality of life improvements in AqLite
For example, farming diamonds of Nulgath in /join evilwarnul is very painful if you don't want to accept Archfiend's Favor neither Dage's favor. The drops appear in the whole screen, lags a lot and makes the experience of farming a lot worse.

I also love linux, so I decided to create a native launcher for it.

## Is it safe?

Well, I will not steal any account and you can check the code and even build it yourself. (I will post build instructions later).

While you this launcher will not steal your account, I can not guarantee that Artix will not ban you. As I said, it goes against the TOS. But for your information, here are Alina comments on twitter:
https://twitter.com/Alina_AE/status/1085235841390264320

https://twitter.com/Alina_AE/status/1137101823284842497

https://www.reddit.com/r/AQW/comments/bym1g4/alina_finally_showed_some_appreciation_for/

You can also see this video for more information: https://www.youtube.com/watch?v=3STwRWuZVkU

An artix dev said that they won't ban anyone using AqLite, but AqLite costs more to Artix, because it loads more information from servers. So, if you are using AqLite, make sure to support them even more!
https://youtu.be/ALi0CcmSfus



## Is this the same as AqLite?

We have our own code, but we use the aqlite swf and add some more features

## Will it be cross platform?

As cross as we can. Currently there are ARM, both 32 bits and 64 for windows and Linux.

## Credits
99% of the credits are deserved to 133spider. Without his efforts, this would not be possible.
This is his repository: https://github.com/133spider/AQLite


## About 133spider past

He did create cetera bot. I did some searches, and seems like we won't update any bot anymore. Instead, he created AqLite, which includes only quality of life improvements. I am totally against botting, but I think that everyone makes mistakes and spider133 will not create or support any bot anymore.
## For Artix Entertainment

First, thanks for supporting linux, Artix! This means a lot for me and I will make sure to keep supporting the game as I can.

Second, I want to contribute, so if you guys want, you are allowed to use any part of my code in your official launcher if  you want to.

Third, if you want this repository to be off, create a issue to delete this repository and I will do so. I don't want to get in the way of artix in any way. On the contrary, I want to help.

So if this project gets in the way of any kind of trouble, please come in and open an issue here at github.


## Important thing to say

Artix don't have any responsibility with you as long you are using third party. Also, any bug in my launcher or 133spider launcher should be reported HERE IN GITHUB, never in artix.


## Key diferences from official AqLite

The core is the same. You should thank 133spider instead of me for making all that amazing features. All I did was to write a simple code that uses his swf file and compile it for linux and mac, so linux and mac users can play too in a launcher too.


## How to build

### Requirements:
 - npm/nodejs installed.
 - This repository's code or git installed.

### Instructions:

Download this project's folder into your PC, or clone it directly from this repository using git like:
```
  git clone https://github.com/aquaspy/AquaStar.git
```

If your Operating System's flash library file (like .dll or .so) is not in the FlashPlayer folder,
get it from your own system (win64 and linux are already supported)

Put the aqlite.swf file in the SAME FOLDER of main.js (the project root)

Install the dependencies using NPM (nw-flash-trust, electron@4.2.12 and electron-builder) like:

```bash
  cd path/to/project/folder
  npm install
```
(npm install will install automatically all deependencies, so no need to specify them manually, just use "npm install")


Now you are ready to run it! before making a package, you can test it running `npm start`

If aqlite opens correctly, build the package so you can run in any folder you like.
Go to FlashPlayer folder and remove the flash libraries you don't need.
(ex: delete .so in windows, as it's irrelevant)

Type: `npm run dist`, and in the new "dist" folder, is your files. In linux case, it's a AppImage file!

Obs: Before running the npm run dist, you can change a line in the package.json
![How to change siste](https://i.imgur.com/fO13ynR.png)

If you change to "dist": "electron-builder -l", it will build for linux only. If you change to -w, windows only, and if you let .wlm, and will build for all systems (if supported). If you don't use a parameter, it will build for your current system


## Troubleshooting

### Stuck at 0%
Try to f5 the launcher. It will reload the page.
Try to shift f5, to clear cache
