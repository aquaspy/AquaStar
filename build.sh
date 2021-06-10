#!/bin/bash
set -e

# MADE BY DOUBLE STAR FOR PERSONAL COMPILING USAGE. COULD BE MADE BETTER ONE DAY... (makefile)
# THIS IS THE RELEASE SCRIPT!
#  HAVE WINE INSTALLED OR NO WINDOWS!

buildfolder="work"
releasefolder="releases"

blue="\e[34m"
yellow="\e[36m"
clear="\e[39m"

mkdir -p ./"${releasefolder}"

build_images(){
    # $1 is FlashLib name.
    # $2 is the npm command
    # $3 is the final file format.
    # $4 is the archtecture, if it needs to change, and if exists.
    local flashFile="${1}"
    local npmCommand="${2}"
    local fileFormat="${3}"
    local targetArch="";
    if ! [ -z "$4" ]; then
        targetArch="${4}";
    fi
    
    # Processing done, prepare the folder. --------------------------------------------------
    
	echo -e "$blue --> Rebuilding the folder... $clear"
	
    rm   -rf ./"${buildfolder}"
    mkdir -p ./"${buildfolder}"
    cp -r Icon/ LICENSE.md node_modules pages res aqlite.swf main.js package*.json "${buildfolder}"/
    echo -e "$yellow --> Rebuilding the folder -> DONE! $clear"
	
    if ! [ -z "$targetArch" ]; then
        echo -e "\e[33m Target Arch has changed. $clear Now it has $targetArch."
        sed -i "s|x64|$targetArch|g" "${buildfolder}"/package.json
    fi
    
    echo -e "$blue --> Copying the correct flash player... $clear"
    mkdir -p "./${buildfolder}/FlashPlayer"
    cp "FlashPlayer/$flashFile" "${buildfolder}/FlashPlayer/"
    echo -e "$yellow --> Copying the correct flash player -> DONE!$clear"
    
    cd $buildfolder
    echo -e "$blue --> Running npm build... $clear"
    npm run $npmCommand
    echo -e "$yellow --> Running npm build -> DONE!$clear"
    
    echo -e "$blue --> Copying the builded app... $clear"
    mkdir -p "../${releasefolder}/$targetArch"
    cp dist/AquaStar*."$fileFormat" "../$releasefolder/$targetArch"
    echo -e "$yellow --> Copying the builded app -> DONE!$clear"
    cd ..
}

# Linux x64
build_images "libpepflashplayer.so" "dist-l" "AppImage"
# Linux x32
build_images "libpepflashplayer32bits.so" "dist-l" "AppImage" "ia32"
# Linux ARM
build_images "libpepflashplayerARM.so" "dist-l" "AppImage" "armv7l"
# Windows x64
build_images "pepflashplayer.dll" "dist-w" "exe"
# Windows x32
build_images "pepflashplayer32bits.dll" "dist-w" "exe" "ia32"
# EXPERIMENTAL -
# MacOS - can only be builded on macos!
#build_images "PepperFlashPlayer.plugin" "dist-m" "dmg"

exit
