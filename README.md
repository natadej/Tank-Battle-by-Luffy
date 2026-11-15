# Tank City

A Battle City-style tank game for the browser (TypeScript + Canvas, no framework).
Defend the eagle, destroy 20 enemy tanks per stage, collect power-ups and climb the hi-score ranking.
All artwork, sounds and the 35 stage layouts are original; the rules follow the 1985 NES classic.

## Play

```sh
npm install
npm run dev
```

| Action | 1 player | 2 players: P1 | 2 players: P2 |
| --- | --- | --- | --- |
| Move | Arrows or W A S D | W A S D | Arrows |
| Fire | Space / J / K / Z / X / F | Space / F / G | L / / / . / Right Shift |
| Start / pause | Enter / Esc / P | Enter / Esc / P | |
| Select (menu, reverse block in construction) | Left Shift | Left Shift | |
| Mute | M | M | |

Phones and tablets get an on-screen d-pad, FIRE and START buttons (best in landscape). Gamepads work too.

## Rules

- **Stage**: 13×13 field of brick, steel, water, forest and ice. Bricks break in strips; steel needs a 3-star tank.
- **Enemies**: 20 per stage, at most 4 on the field (6 in 2P). Basic 100, Fast 200, Power 300, Armor 400 (4 hits).
  Enemies spawn faster on later stages and later stages bring tougher mixes.
- **Bonus tanks**: the 4th, 11th and 18th tanks flash red; hitting one drops a power-up.
- **Power-ups** (500 pts each): Helmet (shield), Clock (freeze enemies), Shovel (steel base wall), Star (upgrade:
  faster shots, two shots, then steel-breaking), Grenade (destroy all enemies on screen, no points), Tank (+1 life).
- **Lives**: start with 3 tanks (2 in reserve). Extra life at 20,000 points. Dying resets your stars.
- **Stage clear**: destroy all 20 enemies. The tally screen counts kills per type; in 2P the player with
  more kills earns a 1,000-point bonus.
- **Game over**: the eagle is destroyed, or every player is out of tanks.
- **Ranking**: top-10 table saved in the browser with name, score, stage reached and a rank title.
- **Construction**: build your own map from the title menu; it is played as stage 1.
- Choose a starting stage on the first STAGE screen with left/right. After stage 35 the stages repeat.

## Development

```sh
npm test       # game-rule tests (Vitest)
npm run lint   # oxlint
npm run build  # type-check + production build to dist/
```
