[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

![Static Badge](https://img.shields.io/badge/Foundry_VTT-14-blue?style=for-the-badge) ![Github All Releases](https://img.shields.io/github/downloads/mordachai/daggerheart-hud/total.svg?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/daggerheart-hud?display_name=tag&style=for-the-badge&label=Current%20version)

# Daggerheart HUD

<img width="950" alt="image" src="https://github.com/user-attachments/assets/3467de17-da5a-42fb-b0a3-b92b6d0ec7db" />

## HUD Controls:

##### Over the portrait:

- **Double click:** opens the character sheet
- **Click n' drag:** moves HUD around
- **Right click:** opens context menu with _Toggle Conditions_, _Long Rest_, _Short Rest_, **Lock/Unlock Position**, a **Theme carousel** (cycle color themes without opening settings), and any **Module Actions** other modules registered (see below)

**Primary and Secondary Weapons** are always visible and at hand. Remember to select a target _BEFORE_ you click.

#### In the resources:

- **Hope:** Left-click goes until the selected pip, Right-click goes until the previous. Use Right-click to zero the bar.
- **HP, Stress and Armor slots:** Left-click = **-1**, Right-click = **+1**

### On the nav bar:

The strip below the core has Traits, Ancestry (Community inside), Inventory, Class (Subclass inside), Loadout (Vault inside), and Features. Click a name to open its panel (opens up or down depending on screen room).

- Clicking on a _icon_ **executes the roll**, if there is anything to roll
- In the _title_ will **open the description** for the item, if there is any
- Other options are _Send to Chat_, _Send to Vault_, and _Send to Loadout_

## Companion HUD

Selecting a **companion** actor (or a character with a linked companion) shows its own dedicated HUD side-by-side with the character HUD — stress, attack, experiences and the companion's features, each independently draggable and independently themed. Turn this pairing on/off with the "Show Linked Companion/Character Together" setting (on by default).

## Lock Position

Right-click the portrait → **Lock/Unlock Position** to freeze the HUD in place and stop accidental drags. Locked state is remembered per user.

## Module Actions

Buttons other installed modules add to the character sheet (header controls, or modules that specifically hook into the HUD) are picked up automatically and show up in the portrait context menu too, alongside the built-in options above.

## Active Effects (Features tab)

The Features panel lists every applicable Active Effect on the actor (the actor's own effects plus item-granted ones from features/domain cards). Click one to enable/disable it, same as the system sheet's Effects tab. Beastform effects are shown but not toggleable — the system manages those automatically.

## Features

- **Weapon Actions**: Click left/right circles for primary/secondary weapon attacks
- **Resource Tracking**: HP, Stress, Evasion, Armor, and damage thresholds
- **Expandable Panels**: Access traits, features, inventory, and domain cards
- **Domain Management**: Move cards between loadout and vault
- **Active Effects**: Enable/disable feature and domain-card effects straight from the HUD
- **Companion HUD**: Dedicated HUD for companion actors, auto-paired with their character
- **Customizable**: Color themes (each with its own ring frame, switchable from the portrait context menu) and positioning

## Settings

### HUD Theme:
Set per-player from the portrait's right-click context menu (a theme carousel) — separately for the character HUD and the companion HUD. Picking a theme picks up its matching ring frame. Each player chooses their own.

### Other settings:
You can hide Foundry's macro hotbar, change the vertical position at which the HUD appears, toggle character/companion auto-pairing, or entirely disable it, while the other players can keep theirs (GMs: tell the players where to disable it)

<img width="789" height="690" alt="image" src="https://github.com/user-attachments/assets/e13ea1d6-726b-4cf4-9b3a-1c73011bfed0" />

## Installation

Look for "daggerheart hud" in Foundry's module page and install it 

OR use the link below for a manual installation:

**Manifest URL:**
```
https://github.com/mordachai/daggerheart-hud/releases/latest/download/module.json
```

**Requirements:**
- Foundry VTT v13+
- Daggerheart system

## License

MIT License
