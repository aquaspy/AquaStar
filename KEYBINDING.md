# Want to customize the keybindings?
But dont want to recompile the whooole thing? We got you, we understand the boredom of doing it...
So, lets create a configuration file for it! :D

First thing you need to understand is: the file must be in one of the 2 places:

- The appdata folder
- Same folder as the application location (shown in F1, in short is the same folder as the aqlite_old.swf).

Second thing is: how the file should be. Check out the aquastar_testing.json file for an example!
But please notice that:

- Its a JSON file, so please follow its standards!
- There is no limitation around the quantity, but please dont repeat letters that you are using in
aqlite already as it triggers both at the same time (dont use Alt+C or Alt+L for example)
- For one keybind, just surround with quotes, for more than 1, do it in brakets. Check an example of both:

```
    "account": "Alt+T",
    "wiki": ["Alt+F", "Alt+R"],
```

## Parameters

You NEED to use all parameters, if any is missing the system will complain and wont work right!
For a example of the defaults, check out the OriginalKeybinds variable on const.js, copied here for convenience (at the current writting, subject to change!!)

```
{
    wiki:        "Alt+W",
    account:     "Alt+A",
    design:      "Alt+D",
    charpage:    "Alt+P",
    newAqlite:   "Alt+N",
    newAqw:      "Alt+Q",
    newTabbed:   "Alt+Y",
    about:       "F9",
    fullscreen:  "F11",
    sshot:       "F2",
    cpSshot:     "Alt+K",
    reload:      "CmdOrCtrl+F5",
    reload2:     "CmdOrCtrl+R", // Here bc FireFox uses it.
    reloadCache: "CmdOrCtrl+Shift+F5",
    dragon:      "Alt+1",
    forward:     "Alt+F",
    backward:    "Alt+B",
    help : [
        "Alt+H",
        "CmdOrCtrl+H",
        "F1"
    ]
}
```

## Which values of keybinds can i use? 

It uses Electron's native keybinding values, so follow their value standard. Example of valid ones:

```
 - Alt+1
 - Cmd+R            (will only work on Mac)
 - Ctrl+X           (wont work on mac)
 - CmdOrCtrl+R      (will work on both)
 - Ctrl+Shift+Alt+T (electron accepts a lot...)
 - K                (Can be very Simple)

```
## Sounds complicated, will there be a Custom menu for it?

At the current point, any change in the name of the keybind or addition can crash the app if its using a custom configuration, that said, we future proofed it by having a dummy keybind for it.

Maybe in the near future or maybe soon...

## You updated! now it doesnt work anymore... complains "k.oldname is undefined"!

As I said in the section before this one, it can change... 
look at the aquastar_testing.json and see if anything is missing/has a different name. 
If it does, update it on yours and if even that doesnt work... Make a github issue and help us!
