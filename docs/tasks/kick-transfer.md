# Host: kick a member / hand over the room

User request: "the host must be able to kick people or give host rights to someone else."

## Contract (shared/types.ts, committed by the coordinator)
- `ClientMsg { t: "kick"; playerId }`: owner only.
- `ClientMsg { t: "transferOwner"; playerId }`: owner only.
- `ServerMsg { t: "kicked"; by }`: sent to the removed member, then the server closes its socket.

## Server rules (codex-net)
- **Kick**
  - Owner only. You can't kick yourself.
  - Bots: kicking removes that bot, the same as lowering setBots by one for that seat.
  - Humans, battle/pvp lobby: free the slot, drop their repo/kit and readiness, forget the resume token.
  - Humans, during a battle/pvp match: remove them from the match. In pvp they are eliminated with reason "left" and no killer. In battle the hero disappears. The match then continues.
  - Classroom (edu) students, at any phase: remove them from the live roster and from future class attacks. Results they already earned stay in frozen attack-round exports. Their in-progress report is dropped.
  - Ban for the room's lifetime: the kicked seat's resume token and, if signed in, their GitHub/Auth0 identity. A rejoin with either is refused: "You were removed from this room by the host."
  - A fresh anonymous tab can still join raids, because they have no identity; that's acceptable. PvP always needs a GitHub identity, so the ban holds there.
  - Send `{t:"kicked", by: ownerName}` and close that socket. Broadcast the updated lobby/classroom state.
- **transferOwner**
  - Owner only.
  - The target must be a connected human member of this room. Not a bot, not yourself, not a disconnected seat.
  - Allowed in battle/pvp, lobby or after the match (autopsy).
  - Not allowed mid-match. Error: "Hand over the room after the match."
  - Not allowed in edu (classroom). The teacher stays the owner. Error: "The teacher can't hand over a classroom."
  - pvp with `hostFights`: re-evaluate start eligibility for the new owner. Nothing else changes.
  - The old owner stays as a normal member.
- Existing behaviour is unchanged: ownership still auto-transfers when the owner leaves.
- Tests: kick human/bot, ban on resume token and identity, non-owner refused, transfer happy path and refusals, pvp mid-match kick, classroom student kick keeps exports, persistence across restart (rooms.json keeps the ban list).

## UI (claude-ui: lobby / spectator; claude-edu: classroom teacher console)
- **Lobby roster, owner view:** each other member gets a small "⋯" menu (or two compact buttons) with "Make host" and "Kick".
  - Kick asks for confirmation inline: "Kick Ana? They can't rejoin this room."
  - Bots get only "Remove".
  - Phone: the controls must be tappable (≥ 40 px) and must not crowd the roster row.
- **In match:** the owner's pause menu offers "Kick player…" with the roster. There is no transfer mid-match.
- **Kicked client:** clear the stored resume token for the room and show a calm screen: "You were removed from this room by <host>." Offer a "Back to start" button. Don't auto-reconnect.
- **New owner:** a toast, "You're the host now." The owner controls appear.
- **Everyone else:** the roster updates. A small toast: "Ana is now the host."
- **Classroom teacher console:** each student row gets "Remove" (with confirmation). The projector never shows these controls.
- Localize all new strings (en/zh/es/fr) through the existing i18n.
