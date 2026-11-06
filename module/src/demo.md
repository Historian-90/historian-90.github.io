---
title: "Demo: The Lantern Toll"
subtitle: A one-hour test adventure for the Agon Module reader
module: 0
level: 1
players: 1–4 pairs
length: About one hour
tone: Eerie, small-scale, forgiving
version: 1.0
summary: A ferry on the Pelagon river has stopped running, and the ferryman will only cross if someone pays the **lantern toll**. This demo shows every kind of block the reader supports. It isn't part of the Damocles campaign.
---

:::tip How to run this module
Read the **At a glance** box when a scene starts. Read the boxed text aloud. When players go somewhere you didn't plan, open the **Off Script** tab and filter for what they're doing. Every route ends by pointing back into the story, so you're never more than one scene from a planned beat.
:::

:::flags
paid-toll: The party paid the lantern toll
met-ione: The party spoke with Ione
:::

:::clock dusk Night falls on the river
segments: 4
text: Tick once per scene, or when the party wastes time. At 4, the drowned lanterns rise.
steps:
  - The light turns gold. Birds go quiet.
  - The river mist rolls in.
  - The first lantern lights itself on the water.
  - Full dark. Run [[lantern-rise]].
:::

# Chapter 1: The Crossing {#ch1}

A short chapter with two scenes and a finale. Characters arrive at the ferry landing in the late afternoon.

## Scene 1: The Silent Landing {#landing}

:::glance
Where: A rotting ferry landing on the Pelagon, an hour from the nearest wall.
When: Late afternoon. Start the [[dusk]] clock.
Goal: Get across the river.
Pressure: Nightfall, when the drowned lanterns rise.
Leads to: "[[ione]] (talk) · [[raft]] (improvise) · [[lantern-rise]] (if they wait)"
:::

:::read
The road ends at a sagging landing where the river runs wide and slow, the color of tea. A flat ferry is chained to a post. On it sits an old woman in a waxed coat, a dark lantern on her knees. She hasn't looked up, but she says: "Toll's a light. Bring me a light, I'll take you over."
:::

### What's here
- **The ferry**, chained with a rusted padlock. [[ione]] holds the key on a cord around her neck.
- **A shrine-box** nailed to the post, full of old lantern stubs, each one carved with a name.
- **Tracks** in the mud: something heavy dragged into the water, recently.

:::check Read the tracks
trait: Perception
tn: 12
when: Anyone who studies the mud.
crit: As Success, and they spot a drowned lantern glinting a few meters out under the water.
success: A body was dragged *out* of the river, not in. Bare footprints lead back into the water.
close: Something was dragged; they can't tell which way.
fail: Just mud and reeds.
:::

:::route If the players threaten or attack Ione
She doesn't flinch. "Kill me and the river keeps you." If they attack anyway, she drops into the water and is gone, and the ferry chain snaps on its own. The ferry drifts out into the current *without* a toll paid, so [[lantern-rise]] starts right away. Use the [[drowned]] encounter, and let Ione's lantern float back to the bank afterward with the key inside it. They can still finish the story.
:::

:::route If the players try to break the chain or swim across
The chain breaks easily (Strength Trial TN 8), but the river pulls hard: anyone swimming makes an **Endurance Trial TN 12** or is dragged under for **1d6** damage and comes up beside a drowned lantern. Either way, tick the [[dusk]] clock. Point them toward [[raft]] if they want a safer plan.
:::

:::route If the players offer something other than a light
Ione considers it. Money, she refuses: "Coin sinks." A *story* about someone they lost, she accepts as a light: mark [[paid-toll|the toll as paid]] and go to the crossing. This route rewards players who think sideways.
:::

:::npc ione Ione the Ferrywoman
role: Ferrywoman of the Pelagon; possibly not alive
look: Waxed coat, white braid, hands stained with lamp-black
voice: Slow, never asks a question twice, calls everyone "passenger"
wants: Every soul on the river to have a light to go home by
fears: The day nobody pays the toll
attitude: Patient. Polite to the polite.
quote: "Toll's a light."
knows:
  - The lanterns in the shrine-box belong to people who drowned in the Sword Fall flood.
  - The drowned rise at full dark to look for their lights.
lies:
  - Whether she's alive ("I've a pulse, passenger. Somewhere.")
secret: Ione drowned in the same flood. If the party gives every lantern in the box back to the river, she can finally rest, and the ferry runs for anyone after that.
stats: Won't fight. If harmed, she vanishes into the water.
:::

## Scene 2: Build a Raft {#raft}

:::glance
Where: The reed bank downstream of the landing.
Goal: Cross without Ione's help.
Pressure: The [[dusk]] clock ticks once for this scene.
:::

:::read
Downstream, the reeds hide the skeleton of an old pontoon: oil drums, a sheet of rusted aluminum, and coils of plastic cord gone stiff in the sun.
:::

:::check Lash a raft together
trait: Creativity
tn: 12
who: One builder; others can help for Weal.
success: It floats. They cross, but halfway over, the [[dusk]] clock reaches its next tick.
close: It floats, mostly. Everyone is soaked, and one piece of gear washes away (roll on [[river-salvage]] to see what floats past instead).
fail: It comes apart midstream. Go straight to [[lantern-rise]], in the water.
:::

:::table river-salvage River Salvage
kind: Loot
die: d6
rows:
  - "1-2: A waterlogged ration and a cracked canteen."
  - "3: A sealed tin of 6 light pistol rounds."
  - "4: A carved lantern stub with a name on it (counts as a light for [[ione]])."
  - "5: A medical kit in a dry-bag."
  - "6: One didra crystal, still faintly warm."
:::

## Scene 3: The Lantern Rise {#lantern-rise}

:::read
The last light goes out of the sky, and one by one, small flames open on the water, dozens of them, drifting toward you against the current. Beneath each flame is a face.
:::

:::encounter The Drowned
foes:
  - 2 x drowned
threat: 4 (Fair for one pair; add 1 drowned per extra pair)
terrain: Waist-deep water slows Speed by half. The ferry deck is dry and stable.
tactics: They go for whoever holds a light. Hand one a lantern and it stops fighting and sinks.
morale: They never flee, but each one given a light leaves the fight peacefully (full Exp).
reward: "Roll once on [[river-salvage]] per drowned laid to rest."
:::

:::monster drowned Drowned Lantern-Bearer
kind: Restless spirit
threat: Standard
element: Water
level: 1
hp: 14
evasion: 11
speed: 8m (swim 12m)
traits: Str 2, End 2
flavor: A grey shape under a borrowed flame. It whispers a name over and over.
actions:
  - name: Cold Grip
    text: "Hit +2 · 1d6 + 2 · crit 19."
  - name: Drag Under
    tag: Even rounds
    text: "On a hit, the target is **Bound** (Agi) and takes 1d4 cold damage each round until it escapes."
  - name: Seeking
    text: Ignores anyone who gives it a light. That counts as defeating it.
exp: 15
didra: "0"
:::

:::monster cerebos
:::

:::route If the party runs from the drowned
Let them. The drowned don't leave the water. From the bank, the party can see the lights circling the ferry. Ione (if they've met her) calls out: "They only want to go home." It's a nudge toward giving the lanterns back, not fighting.
:::

### Wrapping up
If every lantern goes back to the river, read this:

:::read
The flames sink one by one, until the river is dark and quiet. The chain falls from the ferry with a soft splash. The old woman is gone, but her lantern sits on the deck, still lit.
:::

:::secret Ione's lantern
It's a **Lantern of the Pelagon** (a trinket): it never goes out, and once per day it lets the bearer see the face of someone who drowned nearby. Give it to whoever was kindest to her.
:::

# Appendix {#appendix}

## Random River Encounters {#river-random}

:::table river-random Who's on the River?
kind: Encounters
die: d6
rows:
  - "1: A cerebos stalking the reeds. Use the book's [[cerebos]]."
  - "2: Two Anarchist traders poling a barge; they'll trade a ration for news."
  - "3: A Brotherhood patrol boat, suspicious of anyone near the landing."
  - "4-5: Nothing but mist."
  - "6: A drowned lantern drifts past, upstream."
:::

## Names on the Lanterns {#names}

:::table lantern-names Names on the Lanterns
kind: Names
rows:
  - Theron Alkaios
  - Myrrine Dekas
  - "Little Pyrrhos, age 6"
  - Galene, no surname
  - Kostas the Smith
  - Eudora Phokas
:::
