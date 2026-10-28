/**
 * LIBRA RP — Admin (Level 2) interview question set: 50 written questions built from the server
 * rules. Scored manually by a Head Admin or Support Curator (1 mark each: ✗ = 0, ½ = 0.5, ✓ = 1).
 * Every rubric is the expected answer taken from the rules, so reviewers can mark against it.
 */
import type { SetSection } from './admin-assistant';

export const ADMIN_LEVEL2_INTERVIEW = {
  title: 'LIBRA RP — ADMIN (LEVEL 2) INTERVIEW',
  position: 'Admin',
  description: 'Written interview for Admin Assistants applying for the Admin (Level 2) staff role. Covers roleplay terms, punishments and server rule limits.',
  instructions:
    'A Head Admin or Support Curator will review and score your answers after the interview. Where a question asks for a punishment, give the exact punishment from the server rules.',
  passingPercent: 70,
};

const T = 180;

export const ADMIN_LEVEL2_SECTIONS: SetSection[] = [
  {
    category: 'L2 · Roleplay Terms',
    description: 'Level 1 roleplay terms, with the punishment for each.',
    type: 'LONG_TEXT',
    questions: [
      { title: 'Fail RP', prompt: 'What is Fail RP? Give an example and the punishment.', timeLimitSeconds: T, rubric: 'Anything that hurts roleplay or is improbable/unrealistic (rule 6.6). Example given. Punishment: Warn.' },
      { title: 'Fear RP', prompt: 'What is Fear RP? Give an example and the punishment.', timeLimitSeconds: T, rubric: 'Players must fear for their life when it is in danger — e.g. not putting hands up at gunpoint or trying to pull a gun (rule 6.8). Punishment: Warn.' },
      { title: 'Meta Gaming (MG)', prompt: 'What is Meta Gaming (MG)? Give an example and the punishment.', timeLimitSeconds: T, rubric: 'Using information gained through OOC methods in character, e.g. Discord or a stream (rule 6.7). Punishment: Mute 30 minutes.' },
      { title: 'Power Gaming (PG)', prompt: 'What is Power Gaming (PG)? Give an example and the punishment. Is cuffing or patching someone while holding a weapon Power Gaming?', timeLimitSeconds: T, rubric: 'Unrealistic actions, abusing mechanics or forcing an outcome for an unfair advantage, e.g. "/me tackles X and stabs them to death" (rule 7.1). Punishment: Warn. Scripted actions (patching, robbing, cuffing, dragging) are NOT PG just because a weapon is in hand.' },
      { title: 'Mixing', prompt: 'What is Mixing? Give an example and the punishment.', timeLimitSeconds: T, rubric: 'Using information your character would not realistically know / bringing OOC knowledge (incl. forums) into RP, e.g. "easy gov, a god is watching" (rule 7.0). Punishment: Mute 30 minutes.' },
      { title: 'VDM and RDM', prompt: 'What are VDM and RDM, and what is the punishment for each? When is RDM not applied?', timeLimitSeconds: T, rubric: 'VDM = vehicle deathmatch (killing/hitting players with a vehicle), RDM = random deathmatch (killing without RP) (rules 6.1, 6.2). Both: Refinement 60 minutes. Scenarios must be roleplayed unless in a danger zone.' },
      { title: 'New Life Rule (NLR)', prompt: 'Explain the New Life Rule (NLR). How long must a player wait, and what is different if they were killed in an event? What is the punishment?', timeLimitSeconds: T, rubric: 'If fully killed, may not return to the same area for at least 20 minutes. If killed in any event, may NOT return to that event even after 20 minutes (rule 5.5). Punishment: Warn.' },
    ],
  },
  {
    category: 'L2 · Account Rules',
    description: 'Characters, businesses, transfers, alts and account ownership.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Characters per account', prompt: 'How many characters may a player have on their account, and what happens if they have more?', timeLimitSeconds: T, rubric: '2 characters (rule 1.4). Any others are deleted and the 1st and 2nd are wiped.' },
      { title: 'Businesses per player', prompt: 'How many businesses may one player own across both characters? What is the punishment for breaking this?', timeLimitSeconds: T, rubric: '1 business per person across both characters (rule 1.5). Ban 20 days on each account and loss of the business.' },
      { title: 'Transfer limits', prompt: 'What is the maximum value that can be transferred in a single transaction, and the maximum per day? What is exempt, and what is the punishment for bypassing the limit?', timeLimitSeconds: T, rubric: 'Max 7,000,000 per single transaction; max 2,000,000 transferred/received per day. Clan balance withdrawals/deposits are exempt (rule 1.6). Bypassing (new clans, twinks, routing through players) = Ban 60 days and Account Wipe.' },
      { title: 'Main and alt interaction', prompt: 'A player sends money from their main character to their second character. Is this allowed? What is the punishment, and what happens to the alt if the main gets banned?', timeLimitSeconds: T, rubric: 'Not allowed — no interaction of any kind between main and alt (rules 1.7, 1.11). Ban 20 days and Account Wipe. Linked accounts share the ban length.' },
      { title: 'Main LEO, alt in a gang', prompt: 'A player\'s main character is in the LSPD and their second character is in a gang. Is this allowed? What is the punishment?', timeLimitSeconds: T, rubric: 'Not allowed — main and twink must stay in the same faction type (LEO+LEO or Gang+Gang) (rule 1.13). Warn to both accounts.' },
      { title: 'Selling accounts / RMT', prompt: 'What is the punishment for selling an account, or selling in-game money or items for real money (RMT)?', timeLimitSeconds: T, rubric: 'Both are a Permanent Ban (rules 1.1, 1.9).' },
      { title: 'Impersonating staff and chargebacks', prompt: 'What is the punishment for impersonating staff? What happens if a player charges back a donation?', timeLimitSeconds: T, rubric: 'Impersonating staff: 14 day ban (rule 1.10). Chargeback: immediate and permanent blacklist from the community (rule 1.12).' },
    ],
  },
  {
    category: 'L2 · Communication & Administration',
    description: 'Chat, language, cheating and dealing with the administration.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'OOC insults', prompt: 'What is the punishment for OOC insults? What happens if it targets a player\'s culture, nationality or ethnicity?', timeLimitSeconds: T, rubric: 'Mute 180 minutes or Ban up to 7 days based on severity (rule 2.1). Targeting culture/nationality/ethnicity may be escalated to Management and result in a ban.' },
      { title: 'N word / F word', prompt: 'A player uses the N word in Discord. What is the punishment, and where does this rule apply?', timeLimitSeconds: T, rubric: 'Ban 7 days (rule 2.2). Applies in game, on the forums and in Discord.' },
      { title: 'Language', prompt: 'Two players are speaking Spanish in an IC situation. Is this allowed? What is the punishment if not?', timeLimitSeconds: T, rubric: 'IC interactions must be in English. Other languages only in private conversations if all parties agree (rule 2.3). Otherwise Mute 30 minutes.' },
      { title: 'Cheats and exploits', prompt: 'What is the punishment for using cheats (aimbot, speed boost, filters that remove particles)? What is the punishment for shooting through vents?', timeLimitSeconds: T, rubric: 'Cheats/advantage software: Permanent Ban (rule 3.1). Shooting through vents is bug exploiting: Warn, and bugs must be reported (rule 3.2).' },
      { title: 'Misusing /report', prompt: 'What should /report be used for, and what is the punishment for misusing it?', timeLimitSeconds: T, rubric: 'Only for game-related questions or a current rule break you see or are involved in (rule 4.1). Misuse: Mute 30 minutes.' },
      { title: 'Disagreeing with an admin', prompt: 'A player disagrees with a punishment and insults the admin who gave it. What should they have done, and what is the punishment for insulting the administration?', timeLimitSeconds: T, rubric: 'Create a complaint on the forums and await the Head Admin\'s decision (rule 4.2). Insulting the administration: Ban up to 7 days (rule 4.3).' },
      { title: 'Reducing a punishment', prompt: 'Who is allowed to reduce a punishment that has already been issued?', timeLimitSeconds: T, rubric: 'Only the administrator who originally issued it, or a member of Management (Rule Exception).' },
    ],
  },
  {
    category: 'L2 · Rules of Play',
    description: 'Robberies, commands, leaving RP and other in-game rules.',
    type: 'SHORT_TEXT',
    questions: [
      { title: '/try limit', prompt: 'How many times can /try be used per situation/person?', timeLimitSeconds: T, rubric: '2 times per situation/person (rule 5.1).' },
      { title: 'Leaving an RP situation', prompt: 'Give examples of leaving an RP situation before it finishes. What is the punishment?', timeLimitSeconds: T, rubric: 'Not accepting first aid, leaving the game, going AFK, entering interiors (rule 5.2). Punishment: Warn.' },
      { title: 'Emptying the org warehouse', prompt: 'A gang member empties the gang warehouse for personal use. What is the punishment?', timeLimitSeconds: T, rubric: 'Ban up to 30 days + Account Wipe (rule 5.3). Applies to legal orgs and gangs.' },
      { title: 'What can be robbed', prompt: 'When robbing a player, what items may be taken? What is the punishment for taking anything else?', timeLimitSeconds: T, rubric: 'Only guns, armour, drugs and other illegal items (rule 5.11). Otherwise: Warn.' },
      { title: 'Minimum robbers', prompt: 'One player robs another player alone. Is this allowed? What is the punishment?', timeLimitSeconds: T, rubric: 'No — at least 2 people must rob 1 player (rule 5.22). Refinement 30 minutes.' },
      { title: 'Pulling a car over to rob', prompt: 'What is needed to pull a car over to rob it, and in what order? What is the punishment for doing it wrong?', timeLimitSeconds: T, rubric: 'Minimum 1 car with 2 people; must demand them to stop BEFORE shooting out all four tyres; not stopping is Fail RP (rule 5.13). Refinement 120 minutes.' },
      { title: 'Shooting back during a car robbery', prompt: 'Two cars with 4 robbers pull over a solo driver. Can the driver get out and shoot back? What if the robbed car had 2 people in it?', timeLimitSeconds: T, rubric: 'Solo driver vs 2 cars/4 people: may NOT shoot back, must get out and raise hands. If the robbed car has 2+ people they may shoot back no matter how many are robbing (rule 5.13.1). (vs 1 car/2 people the driver can shoot back.)' },
      { title: 'Finishing a downed player', prompt: 'When may a downed player be finished (executed)? What is the exception for the Ghetto?', timeLimitSeconds: T, rubric: 'Only once all hostilities have ceased and the RP has concluded; mercy killing to avoid RP is prohibited (rule 5.10, Warn). In the Ghetto, downed players may be executed at any time — except during official IC events in the Ghetto.' },
      { title: 'Starting jobs', prompt: 'Can a player be robbed or kidnapped while working a starting job? Name the starting jobs and the punishment.', timeLimitSeconds: T, rubric: 'No (rule 5.18). Taxi, lawn mower, truck driver, electrician, bus driver. Punishment: Warn.' },
      { title: 'Car ramming', prompt: 'What is car ramming, what is the punishment, and who is the exception?', timeLimitSeconds: T, rubric: 'Hitting a car intentionally multiple times (rule 5.20). Refinement 45 minutes. Exception: LEOs attempting to PIT vehicles during chases.' },
      { title: 'Initiating RP outside the Ghetto', prompt: 'Outside the Ghetto, can a player shoot someone without initiating RP first? What is the exception and the punishment?', timeLimitSeconds: T, rubric: 'No — RP must be initiated before shooting (rule 5.12). Exception: someone leaving the Ghetto after starting a gunfight. Refinement 60 minutes.' },
    ],
  },
  {
    category: 'L2 · Factions & State',
    description: 'Leaders, state organisations, Government, EMS, Lifeinvader and FIB.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Leader terms', prompt: 'How long is a leader\'s term, and how many consecutive terms may they serve? What happens after completing them?', timeLimitSeconds: T, rubric: '30 days per term, max 2 consecutive terms (rule 1.1). After 2 successful terms they may ask for a reward of their choosing (e.g. clothing, vehicle, LBC).' },
      { title: 'Corruption bios', prompt: 'How many approved Corruption Bios may a state organisation have, and who must approve them? Does the leader need one?', timeLimitSeconds: T, rubric: 'Max 2 per organisation, approved by the org leader and the Chief of State (State 1.2). The leader may be corrupt without a bio (must be proven ICly in court; can be removed by Government). Court-proven and IC-punished corruption gets no OOC punishment.' },
      { title: 'Arrest time limit', prompt: 'How long do officers have to complete an arrest after cuffing? What happens if the suspect asks for a lawyer?', timeLimitSeconds: T, rubric: '30 minutes after the suspect is handcuffed (State 1.10). Requesting a lawyer pauses the timer; the lawyer has 10 minutes to arrive, otherwise the arrest continues. Stalling the arrest: Refinement 40 minutes.' },
      { title: 'Danger zone patrol', prompt: 'How many members are needed to patrol the danger zone? Who is exempt?', timeLimitSeconds: T, rubric: 'At least 2 members (State 1.11), verbal to the org. Exempt: LSPD Detectives and FIB Undercover Agents.' },
      { title: 'Bodycam and court footage', prompt: 'How long must state employees keep bodycam footage, and how long must judges keep court hearing footage?', timeLimitSeconds: T, rubric: 'Bodycam: recorded at all times on duty and kept for 72 hours (State 1.7). Court hearings: POV kept 72 hours, shown to the curator on request (Gov 2.5).' },
      { title: 'Courts', prompt: 'How long do courts have to accept a filed case, and to take action on it? What is the maximum fine or restitution a court can order?', timeLimitSeconds: T, rubric: 'Accept within 72 hours of filing; act within 72 hours of accepting (Gov 2.3, 2.4). Max fine/restitution 250k (Gov 2.11).' },
      { title: 'FIB raid rules', prompt: 'What are the FIB raid rules: prime time, how often the same gang can be raided, and who signs the raid warrant?', timeLimitSeconds: T, rubric: 'Prime time 9:00–15:00; same gang not twice in 48 hours; needs a serious IC reason (case file). Warrant: Attorney General, Governor or their deputies after AG office review; if no active government, the FIB Leader.' },
      { title: 'Lifeinvader duties', prompt: 'How many events, articles and game shows must Lifeinvader provide, and how often?', timeLimitSeconds: T, rubric: 'At least 2 events a week (1 weekday, 1 weekend), at least 1 article a week, and a game/talent show every 2 weeks (LI 4.5–4.7). Verbal to the org.' },
      { title: 'EMS during a gunfight', prompt: 'May EMS heal unconscious players during an active gunfight? What is the punishment?', timeLimitSeconds: T, rubric: 'No — evacuate the area until it is safe; no healing or looting in combat (EMS 3.5). Refinement 60 minutes + FailRP/FearRP punishment.' },
    ],
  },
  {
    category: 'L2 · Ghetto, Events & Zones',
    description: 'Ghetto, turf, events, safe zones and Clan/Cartel rules.',
    type: 'SHORT_TEXT',
    questions: [
      { title: 'Chased back to HQ', prompt: 'A gang member is being chased by police. Can they drive back to their HQ? What is the punishment?', timeLimitSeconds: T, rubric: 'No — may not return to HQ for 10 minutes when chased by police or another gang (Ghetto 1.6). Warn.' },
      { title: 'Gang demands', prompt: 'What may a gang demand from someone on their territory? If the demands are followed, can they kill them? Punishment?', timeLimitSeconds: T, rubric: 'Only to raise their hands (Ghetto 1.10). If demands are followed they may NOT be killed (1.11). Both: Refinement 60 minutes. (May kill if demands are given and not met — 1.9.)' },
      { title: 'Turf POV', prompt: 'How long must turf POV be kept, and what is the punishment if it is not provided?', timeLimitSeconds: T, rubric: '48 hours, posted in the POV channel if requested. Not provided: Ban 30 days / Turf disqualification.' },
      { title: 'Hostages', prompt: 'How many hostages may a gang or family hold in a hostage situation, and what may they demand?', timeLimitSeconds: T, rubric: 'No more than 2 hostages (Events 1.4, warn to the org). Demands negotiated with LEOs and realistic: money, weapons, armour, ammunition etc. (1.5).' },
      { title: 'Sniper rifles in events', prompt: 'Are sniper rifles allowed in Bizz War and Crown Holder? How many snipers per side are allowed at the gun store and 24/7?', timeLimitSeconds: T, rubric: 'Forbidden in Bizz War and Crown Holder (script prevents it) (Events 1.6). Gun store and 24/7: 3 snipers per side (1.13), else Refinement 30 minutes.' },
      { title: 'Event POV', prompt: 'How long must POV of circle events be kept? What is the punishment for IC and OOC events?', timeLimitSeconds: T, rubric: 'At least 48 hours (Events 1.3). Warn for IC events; Ban 14 days for OOC events (increased on repeat).' },
      { title: 'Robbing near events', prompt: 'Can a player rob someone or take a hostage near an event shortly before it begins? What is the time window and punishment?', timeLimitSeconds: T, rubric: 'No — forbidden within the vicinity 15 minutes before and after the event, including store robberies and bank heist (Events 1.8). Warn to each player involved. (Also no robbing rival gang members anywhere 15 min before gang events — Ghetto 1.12.)' },
      { title: 'Safe zones and green zones', prompt: 'Can a player shoot into a safe zone, or run into one to escape a robbery or arrest? Which areas are unscripted green zones?', timeLimitSeconds: T, rubric: 'No shooting from within or into a safe zone (Warn); no entering one to escape an RP situation (Warn). Player-owned business interiors and the gated DOC area are green zones (exceptions: IC events and active jailbreaks).' },
      { title: 'Cartel Row', prompt: 'What are the rules for Cartel Row and entering another Cartel\'s property?', timeLimitSeconds: T, rubric: 'Cartel Row is a Neutral Zone except each Cartel\'s property. Anyone entering another Cartel\'s property without permission may be engaged immediately without RP; engagement stops once they leave and they may not be pursued. They may also be taken hostage. Refinement 60 minutes.' },
    ],
  },
];
