# 007. One settlement with farm, suburb and Sich zones; lands follow the Zaporozhian Host's history

- Status: Accepted
- Date: 2026-11-16

## Context
- The owner wants a settlement that is more than huts and fields: a fortified military part with Cossacks and an otaman, combined with peasants — or two separately developed parts with different currencies.
- Historically the Sich was a fortress without households (kurins around the maidan, church, gunpowder store, treasury); grain, honey, fish and cattle came from the winter-camps (zymivnyky) and farmsteads of the palanky, and trade lived in the suburb under the gate.
- The original land list (SPEC v1 §3.7) mixed regions without a story; the owner asked for a logical, history-based order.

## Decision
- **One continuous diorama, three zones:** farm (economy → ducats) · suburb (forge, tavern, fair) · Sich (fortress → glory buildings, army, raids). Two derived links, both analytic: **kharch** from food buildings caps the army; **defence** from Sich levels boosts farm income. No third currency.
- Tabs "Хутір" and "Січ" move the camera to their zone.
- **Lands = the Host's path:** Khortytsia (~1550s) → Velykyi Luh / Tomakivka → Bazavluk (sea raids) → Chyhyryn → Chortomlyk → Slobozhanshchyna → Chumak Way → Nova Sich (1734–1775). Other regions (Carpathians, Podillia, Volyn, Bukovyna, Danube Sich, Kuban) move after v1.
- MVP = lands 1–2.

## Alternatives considered
- Separate village and army screens — loses the "living diorama" and the visible link between peasants and Cossacks.
- Third currency (provisions) to trade between zones — more UI and balance surface without more fun.
- Region-based order from SPEC v1 — less story, Sich only at land 4.

## Consequences
- Positive: historically grounded setting; the fortress is always on screen; two growth tracks with simple interplay.
- Negative / trade-offs: world ≈4 screens wide (more art per land); 7 extra Sich buildings to balance and draw.
- Follow-ups: verify each land's dates for tooltips (`docs/content-sources.md`); balance kharch/defence in M1.
