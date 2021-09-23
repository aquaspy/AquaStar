# Want to customize the keybindings?
But dont want to recompile the whooole thing? We got you, we understand the boredom of doing it...
So, lets create a configuration file for it! :D

First thing you need to understand is: the file must be in one of the 2 places:

- The appdata folder
- Same folder as the application location (shown in F1, in short is the same folder as the aqlite_old.swf).

Remember! Both files are used, if available. It applies the changes of the file in the appdata folder, then it applies the ones in the
folder which the app is installed (same as aqlite_old.swf one). What isnt changed in both configuration files will use the default.

Second thing is: how the file should be. Check out the aquastar_testing.json file for an example!
But please notice that:

- Its a JSON file, so please follow its standards!
- There is no limitation around the quantity, but please dont repeat letters that you are using in
aqlite already as it triggers both at the same time (dont use Alt+C or Alt+L for example, as it opens quest menu and character menu in game)
- For one keybind, just surround with quotes, for more than 1, do it in brakets. Check an example of both:

```
    "account": "Alt+T",
    "wiki": ["Alt+F", "Alt+R"],
```

## Parameters

(Version 1.2.1 only: you NEED to use all parameters, if any is missing the system will complain and wont work right!)

For a example of the defaults, check out the OriginalKeybinds variable on const.js, or the aquastar_testing.json file in the github. Copied here for convenience!

```
{  
    "wiki": "Alt+W",
    "account": "Alt+A",
    "design": "Alt+D",
    "charpage": "Alt+P",
    "newAqw": "Alt+N",
    "newTest": "Alt+Q",
    "about": "F9",
    "fullscreen": "F11",
    "sshot": "F2",
    "cpSshot": "Alt+K",
    "reload": ["CmdOrCtrl+F5","CmdOrCtrl+R"],
    "reloadCache": "CmdOrCtrl+Shift+F5",
    "dragon": "Alt+1",
    "forward": "Alt+F",
    "backward": "Alt+B",
    "help": [ "Alt+H", "CmdOrCtrl+H", "F1" ] ,
    "settings": "Alt+9"
}
```

You dont need to put all parameters (after 1.2.1). so you could for example change only a single value you dont like. The following is an example of the aquastar.json file, with only one change, which is the design notes keybind, from the original to Ctrl D.

```
{  
    "design": "Ctrl+D"
}
```

## Which values of keybinds can I use? 

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

At the current point, no. But maybe soon a menu might be created. Maybe in the near future or maybe soon...

## Heey, i did a change and it failed! 

So, lets see possible/probable mistakes with JSON?

### it says "unexpected token } on XXX character"

your last line of configuration may have a comma, check this out:

```
// Good version
{  
    "wiki" : "Alt+F",
    "design": "Ctrl+D"
}

// Bad! this will give the error
{  
    "wiki" : "Alt+F",
    "design": "Ctrl+D",
}
// Notice the ',' at the end of "design"!

```

### it says "missing comma at chatacter XXX"

Well, the oposite mistake of the last one. JSON likes to separete elements using ',' but the very last one shouldnt have it!

```
// Good version
{  
    "wiki" : "Alt+F",
    "design": "Ctrl+D"
}

// Bad! this will give the error
{  
    "wiki" : "Alt+F"
    "design": "Ctrl+D"
}
// Notice the ',' at the end of "wiki" missing!

```

### it says "Unexpected LETTER at position XXX"

Forgot the quotes, didnt you? When you copy something from const.js like the original set of keybinds, you miss a detail. Javascript isnt the same syntax as JSON, as it doesnt need the Quotes, but JSON does!

```
// Good version, Valid in JSON and Javascript
{  
    "wiki" : "Alt+F",
    "design": "Ctrl+D"
}

// Bad! this will give the error, but valid Javascript tho... so maybe your mistake came from this
{  
    wiki : "Alt+F",
    design: "Ctrl+D"
}
// Notice the "" missing!

```
