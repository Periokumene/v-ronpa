# Nani P1 Basic Examples

## Purpose

This document internalizes the previously external Naninovel-style sample notes
into a V-Ronpa P1 parser baseline. It is intentionally narrower than the source
material: these scripts are parser fixtures first, not production story content
or a complete runtime demo.

The examples are verified against the current V-Ronpa architecture:

- `packages/nani-parser` preserves `.nani` source as generic AST/IR.
- StoryEngine may later consume the same fixtures, but this task does not add
  StoryEngine behavior.
- Parser fixtures must not define Trial rules. Trial keyword, evidence-submit,
  timeout, and segment routing rules belong to `TrialDefinition` and
  `trial-director`.
- Commands outside the current P1 parser/contract boundary are omitted instead
  of kept as placeholders.

## P1 Fixture Boundaries

Included syntax is limited to line-oriented comments, labels, generic commands,
dialogue text, speaker appearance, inline print commands, simple local choices,
local `@goto`, and command parameters that the parser already represents as
generic IR.

The fixture command set is intentionally small:

- `@set`
- `@back`
- `@char`
- `@choice`
- `@goto`
- `@gameplay grant-evidence`
- `@shake`
- `@flash`
- `@focus`
- `@end`

Excluded source-material features include input prompts, save/unlock/toast
commands, localization text IDs, indentation blocks, block control flow,
subroutines, multi-speaker text, async/await track control, managed text,
automatic voice mapping, script-authored rich reveal event commands, and
Unity-specific scene or timeline commands. The vertical-slice app may still
apply app-local typewriter reveal to dialogue presentation without adding new
P1 script syntax.

## `basic-navi.p1.nani`

```nani
; basic-navi.p1.nani
; P1 parser fixture for Navi-flavored dialogue, choices, local labels,
; visual RuntimeCommands, and gameplay event commands.

#Start
@set route:"intro"
@back bg:harness effect:fade
@char Ema.Pensive1 pos:50
@char Ema.Pensive1,ArmR3 pos:50
@char Ema.Pensive1,ArmR3,ArmR4 pos:50
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open pos:50
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01 pos:50
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01,Angle01/Head01/Facial01/Sweat01- pos:50
Felix.Neutral: This hallway is quiet.[< speed:0.8] We should check the case file.[>]
Mira.Calm: Keep your voice down. The door still listens.[>]

@choice "Inspect the case file" goto:#InspectFile
@choice "Ask Mira about the lock" goto:#AskMira

#InspectFile
@gameplay grant-evidence id:evidence:keycard
@shake actorId:Ema intensity:0.35 duration:220
Narrator: Evidence registered: keycard.[>]
@goto #End

#AskMira
@flash color:#8fd3ff duration:120
Mira.Calm: The keycard belongs to the west door.[>]
@goto #End

#End
@end
```

## `basic-trial-discussion.p1.nani`

```nani
; basic-trial-discussion.p1.nani
; P1 parser fixture for Trial discussion presentation anchors without
; debate keywords, evidence submission, or Trial segment routing rules.

#TrialOpening
@set trialMood:"opening"
@back bg:classroom effect:fade
@char Ema.Pensive1 pos:50
@char Ema.Pensive1,ArmR3 pos:76,0
@char Ema.Pensive1,ArmR3,ArmR4 pos:76,0
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open pos:76,0
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01 pos:76,0
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01,Angle01/Head01/Facial01/Sweat01- pos:76,0
Felix.Serious: The testimony starts before the evidence does.[>]
@focus Ema duration:420
Mira.Calm: Then listen for the contradiction before naming it.[< speed:0.8][>]

@choice "Press the question" goto:#PressQuestion
@choice "Listen longer" goto:#ListenLonger

#PressQuestion
@flash color:#ffe66d duration:160
Narrator: The room turns toward Felix.[>]
@goto #TrialEnd

#ListenLonger
@shake actorId:Ema intensity:0.25 duration:180
Felix.Serious: Waiting changes the rhythm of the room.[>]
@goto #TrialEnd

#TrialEnd
@end
```

## Downstream Use

The parser task should add fixture files matching these examples under
`packages/nani-parser/fixtures/` and snapshot their IR. A later StoryEngine task
may reuse these scripts to verify command execution, but that is a separate
worktree boundary.
