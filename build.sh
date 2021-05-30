#!/bin/bash

# MADE BY DOUBLE STAR FOR PERSONAL COMPILING USAGE. COULD BE MADE BETTER ONE DAY... (makefile)
# 64BITS ONLY SCRIPT

rm -rf ./build
mkdir -p ./build
cp -r Icon/ LICENSE.md node_modules pages res aqlite.swf main.js package*.json build/

# First Lunix
mkdir -p ./build/FlashPlayer
cp FlashPlayer/libpepflashplayer.so build/FlashPlayer/
# BUILD
cd build
npm run dist-l
cp dist/AquaStar*.AppImage ../
rm -rf dist

cd ..

#WINDOWS TIME
cp FlashPlayer/pepflashplayer.dll build/FlashPlayer/
cd build
npm run dist-w
cp dist/AquaStar*.exe ../
cd ..

