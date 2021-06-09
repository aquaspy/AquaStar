#!/bin/bash

# MADE BY DOUBLE STAR FOR PERSONAL COMPILING USAGE. COULD BE MADE BETTER ONE DAY... (makefile)
# 64BITS ONLY SCRIPT

buildfolder="out"

rm -rf ./${buildfolder}
mkdir -p ./${buildfolder}
cp -r Icon/ LICENSE.md node_modules pages res aqlite.swf main.js package*.json ${buildfolder}/

# First Lunix
mkdir -p ./${buildfolder}/FlashPlayer
cp FlashPlayer/libpepflashplayer.so ${buildfolder}/FlashPlayer/
# BUILD
cd ${buildfolder}
npm run dist-l
cp dist/AquaStar*.AppImage ../
rm -rf dist

cd ..

#WINDOWS TIME
# first, lets delete old FlashPlayer
rm -f ${buildfolder}/FlashPlayer/*
cp FlashPlayer/pepflashplayer.dll ${buildfolder}/FlashPlayer/
cd ${buildfolder}
npm run dist-w
cp dist/AquaStar*.exe ../
cd ..

