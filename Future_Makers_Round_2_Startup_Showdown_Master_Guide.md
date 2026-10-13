# FUTURE MAKERS — ROUND 2 MASTER DESIGN SPECIFICATION

**"Startup Showdown" — Complete Event, Platform & Scoring Blueprint**

Format: Head-to-Head Corporate Simulation | Participants: 2 Companies (5 Roles Each) | **Duration: 30 Minutes (hard stop)** | Result: end-screen graphs only (no scoring)

---

> **Status:** The game design, the data recording plan (Section 10) and the tech stack (Section 11) are all finalized. Nothing else is pending except the user's approval of this guide.
>
> **Recording:** see Section 10 for the final list of what is recorded, how it is stored and how it is exported to Excel.

---

## 0. Hosting & Infrastructure *(finalized)*

**Finalized**

- **Host:** The entire platform runs on a single **Raspberry Pi 5**.
- **Clients:** Players (and organizers) access it through a **web browser** — no app install.
- **Network:** Everything runs over a **local network (LAN)** created by the **Pi's own Wi-Fi hotspot**. There is no router and no venue network. The Wi-Fi name and password are the same at every event. Players reach the game by the Pi's fixed address or a name like `showdown.local`, not `localhost`.
- **Hardware:** Raspberry Pi 5 with **8 GB RAM** (ample for ~12–15 concurrent browsers).
- **Connectivity:** The event is **fully offline**. No internet is assumed, so the platform must serve every asset itself (no CDN fonts or libraries, no external APIs), and the earning-game puzzles and quizzes must be bundled on the Pi.

- **Devices:** A **mix of laptops and phones**. The UI must be responsive and every role dashboard must be usable on a phone screen (forms kept short, big tap targets, no desktop-only interactions).
- **Total participants:** **80** across the whole event (8 games × 10 players, two companies of 5 per game).
- **Load:** About **14 concurrent users** (10 players + organizers).
- **Finding the game:** Players join the Pi's Wi-Fi by name and password, then **type the numeric address** into the browser (a fixed IP such as `10.42.0.1`; the exact address is set at build time). A **QR code** is available as a backup for anyone who struggles to type it. No `showdown.local` name and no automatic login page. The Wi-Fi name, password and address (and the QR code) are shown clearly on a sign in the room.
- **Crash recovery:** The game saves its full state (phase, timer, wallets, requests, cooldowns, active attacks) every few seconds. If the Pi restarts mid-game, it **resumes automatically** from the last save, and players who reconnect carry on with the same company and role.

**Also decided:** The tech stack is in Section 11, and backup and export are in Section 10. The hotspot's exact setup is done at build time.

---

## 0.1 Login & Role Assignment *(approved)*

**Finalized**

- **Two separate login pages:** one for **Organizers** and one for **Participants**.
- **Roles are organizer-assigned.** Organizers assign each participant's C-suite role (CEO, CTO, CFO, CMO, COO) from the organizer side of the platform. There is no random draw, no player choice, and no swap window.

- **Participant login is by name entry.** Each participant enters their **name** and their **Admission ID**. They then appear in a live lobby on the organizer side, where organizers place them into a company and role.
- **Admission ID is the primary key** for every participant, and every record in the system links back to it.
- **Everything is recorded.** All participant activity, submissions, results and organizer actions are stored against the participant's Admission ID and name.
- **Excel export:** All recorded data, including each participant's name and Admission ID, can be extracted to Excel at the end of the event.

- **Pre-loaded roster:** Before the event, organizers upload or paste a list of Admission IDs and names (e.g. from Excel). Participant login accepts **only** IDs on the list, and the name comes from the list. The organizer lobby shows who has joined and who has not yet.
- **"Add participant" button:** Organizers can add a participant to the roster on the spot (for late arrivals or substitutes).
- **Multiple sessions:** The game is run **several times** on the same Raspberry Pi, each time with a different group of participants. Each run is a separate session, and sessions run **one after another**: one game is completed, and only then is the next game started (never two games at the same time).
- **Participant status lifecycle (organizer-controlled):**
  1. **Not joined / In lobby:** on the roster, waiting for the game.
  2. **In Game:** set automatically when the organizer **starts** the game. The participant's status is locked as "In Game".
  3. **Game Completed:** set automatically when the organizer clicks **Next Game** (which ends the current game).
- **One play per participant:** Once a participant's status is **Game Completed**, they **cannot play again**. Their Admission ID can still log in, but it only shows the **final graphs (read-only)** from the game they played; it never opens a new game.

- **Ending the game:** Only the **organizer** can end the game, by clicking **Next Game**, which sets participants to **Game Completed**. The timer never ends the game by itself.
- **Timer lock-out:** When the timer runs out, participants are **locked from performing any actions** (read-only). Their status stays **In Game** until the organizer ends the game.
- **Phase flow works like Riot's TFT (Teamfight Tactics) pick phases:** every phase has its own fixed countdown. When it hits zero, input is locked, **everything is recorded**, and **every participant's UI automatically moves to the next phase**. Phases are driven by the timer, not by players clicking "advance". This replaces the earlier idea (Section 4) that a phase waits until all 5 roles are marked ready.
- **Core product principle:** The team works together to make a product, and **making the product must be very simple**.
- **The product is built from a shop, with no free typing.** Like TFT's shop, players **buy options with coins**. Every part of the product (features, components, target user, branding, etc.) is chosen from the shop's options. There is no free-text "twist" box.

- **Two-stage product building (idea first, then parts):** The team first **picks a base product idea** from a preset list, then **adds parts from the shop** (features, components, target user, branding, etc.). Two companies may pick the same base idea but differ in what they add.
- **Base idea list:** The **same list is shown to both companies**. The list is written by Claude (drafted once the problem statement is settled) and reviewed by the organizers. It must be a **mix of hardware and software product ideas**.
- **Choosing the base idea:** All 5 members can see the 6 options and **vote** for one, but the **CEO's click is final**. The CEO picks the company's base idea, and the votes are advisory. Votes are **live**: the vote tally is visible to the whole team as votes come in. If the timer ends before the CEO has picked, the **most-voted idea is auto-picked**. If ideas are tied for most votes, one of the tied ideas is picked **at random**.
- **Early advance after picking:** As soon as **both companies** have picked their base idea, the game goes **straight to the shop**, without waiting for the rest of the idea-picking timer. (This is an exception to the fixed phase timers.) The **remaining time is added to the shop timer**.
- **Problem statement:** It can be **any topic**; there is no required theme. Claude can propose options. Within a game, **both companies get the same problem statement**. **Every game (session) gets its own, different problem statement.** Each problem statement comes with its own base idea list, and the **organizer picks the problem statement (and so its list) when starting the game**. **8 problem statements** are needed (one per game, 8 games), each with its own hardware/software base idea list. **Each list has 6 base ideas: 3 hardware and 3 software.**
- **Coins are shared by the whole company:** one team wallet that all 5 members spend from, so spending is a team decision.
- **Who buys:** Each role **shops in its own section** of the shop (e.g. CTO: features and components, CMO: branding and target user). A purchase only goes through when the **CFO approves** it. The CFO controls the wallet; every role still has its own shopping to do.
- **Starting wallet: 1,000 coins per company.** The budget is deliberately tight: a basic product costs about 890 coins, a good (Smart-tier) product about 1,100, and a premium product about 1,410, so teams must trade depth against breadth.
- **Leftover coins and debt:** not scored. Coins left over (or debt, down to -200) are recorded and show in the graphs through the wallet.
- **Shop catalog:** The shop catalog (50 items with costs, for CTO, CMO and COO) is in `shop_catalog_DRAFT.csv`, and the per-idea risks, brand names and taglines are in `idea_options_DRAFT.csv`. Both are approved; prices are drafts until balance is tested.
- **What each role does in the shop:**
  - **CTO:** suggests features (the **CEO approves** the suggested features) and buys components
  - **CMO:** target user, brand name and tagline
  - **COO:** risk fixes
  - **CEO:** no shopping section. Feature priorities are **dropped**. The CEO picks the base idea, submits the product, and leads the pitch.
  - **CFO:** approves purchases (no shopping section of their own)
- **Game start:** The game begins when the **organizer assigns the roles and starts the game**.
- **Briefing phase is kept:** After the organizer presses Start, the game begins with a **Briefing phase (3 minutes)** where every participant sees their **role and the problem statement** on screen. The Briefing is **a countdown only**: no buttons, no "Ready" taps, no actions. Ideation starts after it. *(The roles are revealed at this moment, when the game starts.)*
- **Synchronized timer:** A countdown timer is **visible on every screen** and is **synchronized** across all devices (everyone sees the same time).
- **Phase lengths so far:** **Ideation (picking the base idea): 3 minutes. Shop phase: 7 minutes.** These replace the earlier 4 and 7 in the Section 2 draft timeline.
- **The shop stays open from the Competition phase onwards:** After the first 7-minute Shop phase, the shop **stays open for the rest of the game**. Role leads use it to send **upgrade requests** (for example when a hint box recommends an upgrade), handled like any other request: the CFO approves or rejects. *(Features still need the CEO's approval before reaching the CFO's queue.)*
- **Several requests at once:** Roles can send several purchase requests to the CFO at the same time. They wait in a queue for the CFO to approve or reject, **one at a time**. Requests can be sent **even if their total (or a single price) is more than the wallet holds**; the wallet is not checked when a request is sent. The wallet **is** checked at approval, but it **may go negative, down to a limit of -200 coins**. If approving a request would take the wallet below -200, approval is **blocked** and the CFO can only reject it.
- **Rejected items can be requested again after 60 seconds:** When the CFO rejects a request, the item is not removed for good. The role can **recommend it again, but only after 60 seconds** have passed since the rejection.
- **What each role sees in the shop phase:**
  - **Everyone:** the **shared wallet (coins)** is visible to all 5 members at all times.
  - **CEO:** sees **who is requesting what**, and can **recommend items from the shop** to be purchased. A recommendation goes **straight into the CFO's queue** (not to the role that owns that shop section), shown as coming from the CEO.
  - **CFO:** sees the **shop**, the **request queue**, and the **approval section**. The CFO can **only approve or reject**; the CFO cannot add items to the queue.
  - **CTO, CMO, COO:** their own shop section (see above).
  - **Shared Product panel:** Every approved purchase appears in a **Product panel visible to all 5 members**, so the company's product builds up on screen as items are bought (starting from the chosen base idea). Each company's product is **hidden from the rival company** until the pitch. **Organizers can see both companies at any point** during the game (live).
- **Summary card at shop end:** When the shop timer ends, every screen shows a **summary card** of the company's product: the **base idea**, **everything bought**, and the **coins left**. The card stays on screen for **20 seconds** before the next phase starts.
- **Company phase ("opening a company"):** After the shop, each team's **company name is the brand name the CMO bought in the shop** (no separate naming step). **From then on, the companies collide**: they **attack, sabotage and compete with each other using the coins they earn**, by **selling their product** and by **playing mini games**. **This competition phase replaces the old Showcase, Flaw Hunt, Defend & Improve and Final Pitch phases, which are removed from the game.**
- **Pending requests at timer end:** Any purchase request the CFO has not approved when the phase timer ends is **auto-rejected** (no coins are spent).
- **Reconnecting:** A participant with status **In Game** who gets disconnected (dead phone, Wi-Fi drop) **can log back in** and carry on in the same session, same company and role. A participant who is **Game Completed** can also log in, but only to see the graphs.
- **Forming the companies:** the organizer places each of the 10 players into Company A or Company B by hand and gives each a role, in the live lobby. There is no auto-split and no player choice.
- **Role and company changes:** the organizer can change a role, swap players or replace a player only during the **3-minute Briefing**. From Ideation onward, roles and companies are locked. Every change is logged against the Admission IDs.
- **No judges on the platform.** There is no judge login and no judge role. The game only records everything and shows the end graphs.

**Shop catalog:** the final item list is approved (`shop_catalog_DRAFT.csv`, 50 items including the shield). Prices are drafts until the balance is tested.

**Still open:** nothing.

---

## 1. Executive Overview & Competitive Market Structure

> **The Core Concept in One Line**
> Two rival companies of 5 C-suite executives each get the same problem statement, **build a product together by buying parts from a shop with shared coins**, and then **go head-to-head, attacking, sabotaging and out-earning each other** with coins won by selling their product and playing mini games. **All of this happens in 30 minutes.**

- **Shared problem, separate companies:** Both companies in a game get the identical problem statement at the same moment. Each game (8 in total) has its own problem statement.
- **Company identity:** A company's name is the brand name its CMO buys in the shop.
- **Simple product building:** The team picks a base idea (hardware or software) and then buys parts from the shop. Nothing is typed freely.
- **Hidden products:** Each company's product is hidden from the rival until the competition begins. Organizers can see both companies at all times.
- **Head-to-head competition:** After the shop, the companies collide. *(Details are still being designed; see Section 2.)*

> **Quick Briefing Summary for Participants (shown on screen during the Briefing)**
> "You are a company, not a class team. You have the same problem as your rival and one shared pool of 1,000 coins. Pick your idea, build your product in the shop, then outplay your rival. Everyone has a distinct role, and the clock is shared by everyone."

---

## 2. Event Format & Timeline (30 Minutes)

The game is run by the organizer and driven by a **synchronized countdown timer visible on every screen**. Each phase has its own fixed timer. When it ends, input locks, everything is recorded, and every screen moves to the next phase automatically.

| Phase | Duration | What happens |
| --- | --- | --- |
| **1. Briefing** | 3 min | Starts when the organizer presses Start. Every participant sees their **role** and the **problem statement**. Countdown only: no buttons or actions. |
| **2. Ideation** | 3 min | The 6 base ideas for this game's problem statement (3 hardware, 3 software) are shown. All 5 members **vote live**; the **CEO's click is final**. If the CEO has not picked at the end, the most-voted idea is auto-picked (ties broken at random). **Ends early** if both companies have picked, and the leftover time is added to the shop timer. |
| **3. Shop** | 7 min (+ any time saved from Ideation) | Each role buys parts for the product from its own section of the shop, using the company's shared 1,000 coins. The CFO approves or rejects each request, one at a time. |
| **Summary card** | 20 sec | A card shows the base idea, everything bought, and the coins left. |
| **4. Competition** | 16 min | The companies compete, attack and sabotage each other using coins earned by selling their product and playing mini games. **Selling is simulated by the game based on each company's product** (no judges or pitches decide it). **Sales depend on all four parts of the product: features, target user, risk fixes, and brand/ads.** Each part is **owned by its role**: features by the CTO, target user, brand and ads by the CMO, and risk fixes by the COO. **The shop stays open** for upgrade requests. |

**Total:** 3 + 3 + 7 + 16 = 29 minutes plus the 20-second summary card, so about 30 minutes. If Ideation ends early, the saved time goes to the shop.

**Game end:** Only the **organizer** ends the game. When a timer runs out, participants are locked from taking actions (read-only), but their status stays **In Game** until the organizer ends the game.

**Removed from the game:** The old Showcase (Pitch 1), Flaw Hunt, Defend & Improve and Final Pitch (Pitch 2) phases, the Idea Board, rotating earning windows, and the Version 1 / Version 2 dossiers.

### 2.0 Selling (Competition phase)

- **Steady trickle:** A company's sales earn coins as a **steady trickle**: the coin balance ticks up every few seconds, and a better product ticks up faster. (Not paid in lump-sum waves.) Attacks that cut sales slow this trickle down.
- **Pace (draft):** A basic product earns about **40 coins per minute**, a good product about **60**, and a premium product about **80**. Over the 16-minute phase a good product earns roughly 1,000 coins, plus mini-game coins.
- **Coins carry over:** Whatever coins a company has left after the first shop phase **carry over** into the Competition phase (no reset).
- **Target:** Attacks should be **rare**: each company launches about **1 to 3 attacks per game**, so each attack is a big decision.
- **Each role has its own sales mechanism:** The sales trickle is the **sum of separate contributions from the role leads** (CTO: features, CMO: target user, brand and ads, COO: risk fixes). Decisions are **not forced** on the role leads. Instead, a **hint box pops up** for the role lead, **recommending what should be upgraded whenever something is hurting that role's part of the sales**. The lead decides whether to act on it. The platform **records each role's contribution to total sales over time**, so a **graph of every role's contribution** can be drawn per company.
- **When a hint appears:** A hint pops up when the **same role in the rival company earns clearly more**, so the role lead learns they are falling behind. The hint says only that they are behind and suggests an upgrade; it never says why the rival is ahead and never mentions attacks. After a hint, the same role does **not get another hint for 60 seconds**. "Clearly more" means the rival's same role earns at least **10 coins per minute more**. **Hint content:** the **CTO and CMO** get a **named upgrade** (for example "Upgrade your Core Function from Smart to Premium for 100 coins"); the **COO** gets a general nudge that they are holding back sales, without naming an item. **Where it appears:** a small **side card** on the role's screen that can be hidden, so it never blocks the shop or a mini game.
- **Upgrades move up a tier:** Acting on a hint means upgrading something already owned to the next tier (for example a feature from Basic to Smart, or Smart to Premium). The team **pays the price difference** between the tiers.
- **Parts without tiers (such as the COO's risk fixes):** The hint simply tells the lead that **they are holding back the sales**, without naming a specific upgrade. The lead **decides what to buy** from their own shop section.
- **Equal shares:** The CTO, CMO and COO each account for an **equal third** of the company's sales.
- **Better purchases earn more:** A role's third grows with what its lead buys and upgrades. A Basic purchase adds a little, a Smart purchase adds more, and a Premium purchase adds the most. (For example, a CTO upgrading a feature from Smart to Premium might lift their share from about 20 to about 25 coins per minute.)
- **Sales per role (decided numbers):** Each of the CTO, CMO and COO contributes coins per minute according to their **level**:

  | Role level | Coins per minute (one role) | Whole company (3 roles) |
  | --- | --- | --- |
  | Nothing bought | 0 | 0 |
  | Basic | 13 | about 40 |
  | Smart | 20 | about 60 |
  | Premium | 27 | about 80 |

  A role's level comes from the **average tier of what its lead has bought**, so upgrading an item moves the level up. Attacks and market events change these numbers by their percentages. 

  **COO extras:** the supplier or data backup adds a flat **+2 coins per minute**, and the testing package adds a flat **+1** (Basic test) or **+2** (Full test, which replaces the Basic test). So a COO can earn up to 4 coins per minute above the normal top level of 27.

  **COO's level:** the COO's risk fixes have no tiers, so the level is the **number of risk fixes bought** (each idea has 3 risks): 0 fixes = 0 coins per minute, 1 fix = 13, 2 fixes = 20, 3 fixes = 27. 

  **In-between averages (CTO and CMO):** tiers are worth points (Basic 1, Smart 2, Premium 3). Coins per minute rise **smoothly** with the average: 1 point = 13, 2 points = 20, 3 points = 27, so an average of 2.5 earns about 23. Every upgrade raises sales a little straight away.

  **How the average is taken:** an empty slot counts as 0 points. The **CTO's level counts only its best 3 feature slots** (there are 6 slots: Core Function, Connectivity, User Interface, Data and Analytics, Safety and Security, Performance): the three highest-tier features are added up and divided by 3. Features beyond the best three add nothing to the level, so the CTO chooses which three to push. The **CMO has 2 slots** (target user and ad campaign), and both count. Below 1 point the coins per minute rise in a straight line from 0 (so 0.5 points = about 6.5 coins per minute); from 1 to 3 points they follow the smooth line above. This stops a role maxing out its level with one cheap Premium purchase. *(Balance was checked with a simulation: a careful company with 1,000 coins earns about 71 coins per minute, roughly 1,140 coins over the Competition, close to the 1,000 target.)*

  **CMO items:** the CMO's level is worked out from the **target user and the ad campaign** (both tiered). The **brand name and the tagline** each add a small flat bonus of **+2 coins per minute** once bought, so a CMO who buys both can earn up to 4 coins per minute above the normal top level of 27.

  **CTO items:** the CTO's level is set by the **features** (tiered). Each **part** (hardware or software component) the CTO buys adds a **small flat bonus** on top. Each part adds **+1 coin per minute**, but **only the first 4 parts bought count**, so the bonus tops out at **+4 coins per minute** (a CTO can earn up to 31, like the CMO).

### 2.0.1 Mini Games (Competition phase)

- **Purpose:** Mini games are the second way to earn coins, alongside selling.
- **Mini games (inspired by the Almanac app):** **Shikaku, Pipes, Lits, Tower, Mosaic, Sets, Queens.** (Mambo, Atoms and Snap were dropped because their rules are unclear.)
- **Everything is built into the platform and works offline** (no internet).
- **Who plays:** The **CFO** plays the mini games (their approval work comes in bursts, leaving free time in between). The CFO gets a **notification the moment a new purchase request arrives** so approvals do not wait.
- **Rewards (draft):** Each solved puzzle earns a **fixed reward**: about **20 coins for an easy puzzle** and **40 coins for a harder one**.
- **Difficulty rises automatically:** The CFO does not choose the difficulty. It **increases automatically** as the CFO solves more puzzles, and the reward grows with it.
- **Skipping:** The CFO **can skip** a puzzle that is too hard. The first **2 skips are free** (no reason needed). After 2 skips, **each further skip costs 10 coins**. The skip count is for the **whole game**, not per puzzle.
- **No time limit per puzzle:** Mini games are an **optional activity** for the team, so a puzzle has no timer of its own (only the Competition phase timer applies).
- **Regions are readable without colour:** in Queens and Lits, a thick border separates any two neighbouring cells that belong to different regions, in addition to the region colours.

### 2.0.2 End of the Competition phase

- **Countdown warnings:** Every screen shows a warning at **5 minutes left**, **2 minutes left** and **30 seconds left**. In the **last 10 seconds**, the timer is **highlighted in red**.
- **Shop at the end:** The shop **closes at the 30-second warning**: no new requests can be sent, and the CFO finishes the requests already in the queue. Anything still unapproved at 0:00 is auto-rejected.
- **Attacks at the end:** The CEO can no longer launch attacks in the **last 60 seconds**, so every attack has time to take effect.

- **No winner or loser is declared.** The game only **shows graphs**.
- **Graphs, top to bottom (League of Legends style):**
  1. **Company vs company** (top).
  2. **Coin difference over time** between the two companies, like LoL's gold-difference graph (middle).
  3. **Role-wise coin difference** (bottom): how each role's contribution compares between the two companies.
- **Style references:** League of Legends esports broadcast graphics, specifically the **Gold Difference** line graph and the **"Last Teamfight" damage bars**.
- **Company vs company (top):** Each company's total coins over time as two lines across the 16 minutes.
- **Coin difference (middle), like LoL's Gold Difference:** A flat **zero line** in the middle means the companies are equal. When company A leads, the line rises **above zero in A's color**; when company B leads, it dips **below zero in B's color**. X-axis is time (the 16 minutes), Y-axis is the coin gap.
- **Role-wise bars (bottom), like LoL's "Last Teamfight":** The two companies are shown **mirrored (one left, one right)**, each with **5 rows, one per role**, with each bar ending in a number. Bars can be split into **colored segments by coin source**.
  - **CTO, CMO, COO:** coins their part of the product earned from **sales**.
  - **CFO:** coins earned from **mini games**.
  - **CEO:** coins taken from the rival through **attacks**.
- **Who sees it:** **Everyone** (all participants and the organizers) sees the end screen.
- **Reveal:** The **organizer decides when to reveal** the graphs; they do not appear automatically when the timer ends.
- **Graphs stay on screen:** Once revealed, the graphs **stay on the participants' screens**, even if a participant disconnects and reconnects to the Raspberry Pi (they land back on the graphs).
- **Next game:** The organizer then clicks **Next Game**. At that click, the 10 participants of the finished game are marked **Game Completed**. They are **not logged out**: their screens stay on the graphs, and if they log in again (with their Admission ID) the login is accepted and shows **their own old game's graphs only** (read-only), even while a later game is running.
- **Thank-you message:** When the Competition timer ends, participants see just a **"Thank you for playing"** screen, with nothing else, until the organizer reveals the graphs.

### 2.1 Attacks & Sabotage (Competition phase)

- **Who decides:** Only the **CEO** can launch attacks. The attack options are **visible to the CEO only**.
- **Attack list (draft numbers):** All attacks last a random 30 to 45 seconds, except Surprise Tax, which is instant.

| # | Attack | Cost | What it does | What the victim sees |
| --- | --- | --- | --- | --- |
| 1 | **Price Squeeze** | 300 | Rival's sales drop by 25% | "Customer demand has softened" |
| 2 | **Market Crash** | 450 | Rival's sales drop by 50% | "Stock market prices have fallen" |
| 3 | **Ad Blackout** | 350 | Rival's brand and ad boost to sales switches off | "Ad platform outage" |
| 4 | **Feature Recall** | 450 | Rival's best feature stops counting towards sales | "A component supplier issued a recall" |
| 5 | **Safety Audit** | 400 | Rival's risk fixes stop counting towards sales | "A regulator is reviewing the industry" |
| 6 | **Mini-Game Jam** | 300 | Rival earns half the coins from mini games | "Network congestion is slowing the system" |
| 7 | **Supplier Delay** | 350 | Rival's CTO is locked out of actions | "Supplier systems are down for maintenance" |
| 8 | **Bank Freeze** | 350 | Rival's CFO cannot approve anything | "Bank systems are under maintenance" |
| 9 | **Surprise Tax** | 400 | Instant: the rival loses 100 coins and the attacker gains 100 | "An unexpected tax bill has arrived" |

- **Cost:** An attack costs **between 300 and 450 coins, depending on its strength** (always more than the costliest shop item, which is 280 in the current draft catalog). The cost **does not need CFO approval**. **There is only one currency in the game:** the shop and the Competition phase both use **coins**, the **same money in the same shared wallet**. Attacks are paid from that wallet. The currency is called **coins** everywhere in the game.
- **Duration:** An attack's effect lasts a **random time between 30 and 45 seconds**, then ends (never minutes). The length is picked at random for each attack.
- **Cooldown:** After launching an attack, the CEO must wait for a **cooldown** before launching another, so attacks cannot be spammed. The cooldown **starts only after the attack's effect has finished**. The cooldown is **60 seconds**.
- **Hidden attacks:** The company that is hit is **never told it was attacked**. Its screen shows the effect as an ordinary **business reason** instead, such as "stock market prices have fallen" or another believable market cause. The rival is never named as the source.
- **Defence (decided in principle):** A company can **buy protection in the shop** that blocks an attack. The **COO** buys it (in the COO's shop section, through the normal CFO approval). It is a **one-time shield**: it blocks the next single attack, then is used up. **A company can buy only one shield per game; no second shield can be bought.** When an attack hits a shield, the attacking CEO sees a clear **"Attack blocked"** message and **still loses the attack cost**. The shield costs **150 coins**. When a shield blocks an attack, the victim's **COO** sees a **disguised message** such as "Insurance claim used" or "Backup system activated" (never naming the rival or an attack), and the shield is gone for good.
- **Wallet and attacks:** The CEO can launch an attack **at any time**, even if the wallet cannot cover it. The wallet **can go below -200 because of attacks**. The -200 floor applies only to shop purchases approved by the CFO. No separate lock is needed: the CFO's rule already blocks every purchase while the wallet is below -200.
- **Organizer view:** The organizer's live view shows the **real cause** of every attack, such as "Company A attacked Company B: Market Crash", with the cost, the duration, the shield result and the Admission ID of the CEO who pressed it. Players never see this.

**Feature approval order:** The CTO suggests a feature, the **CEO approves** it, and then it enters the **CFO's queue** for the purchase approval.

**Kept from the original design:** Surprise Market Events and Bonus Investor Funding. The Optional Role Swap and the Investor Q&A were removed. See Section 8.

---

## 3. C-Suite Roles & Duties

Each company has 5 roles, assigned by the organizer. Roles are revealed during the Briefing.

| Role | Ideation | Shop | Competition |
| --- | --- | --- | --- |
| **CEO (Team Lead)** | Votes, and makes the **final pick** of the base idea. | No shopping section. **Approves the features suggested by the CTO.** Sees **who is requesting what** and can **recommend items**, which go straight into the CFO's queue. | **Decides the attacks and sabotage** against the rival company. |
| **CTO (Product Designer)** | Votes. | **Suggests features** (the **CEO approves** them) and buys components. | Earns sales with **features and parts**. Gets **hints** when the rival's CTO earns 10+ coins per minute more. |
| **CFO (Money Manager)** | Votes. | Sees the shop, the request queue and the approval section. **Approves or rejects** requests one at a time. Cannot add items. | Looks after **sales** and **what to buy** (purchases), and **plays the mini games** to earn coins. |
| **CMO (Storyteller)** | Votes. | Buys the **target user, brand name (which becomes the company name) and tagline**, plus optional ad campaign. | Earns sales with the **target user, ads, brand and tagline**. Gets **hints** when the rival's CMO earns 10+ coins per minute more. |
| **COO (Planner & Quality)** | Votes. | Buys **risk fixes** and optional testing packages. | Earns sales with **risk fixes, backups and testing**, and buys the **Attack Shield**. Gets **hints** when the rival's COO earns 10+ coins per minute more. |

**Everyone** sees the shared wallet at all times.

---

## 4. Participation & Flow Control

- **Timer-driven phases:** Like TFT pick phases, phases end on the clock, not when players click. This replaces the old rule that a phase waits until all 5 roles were ready.
- **Auto-rejection:** Any purchase request the CFO has not approved when the shop timer ends is auto-rejected.
- **Reconnecting:** A participant who is In Game and gets disconnected can log back in to the same session, company and role.
- **One play per participant:** When the organizer clicks Next Game, every participant's status becomes **Game Completed**. They can still log in, but only to see the graphs, and cannot play again.
- **Interdependence:** The CFO's approval is required for every purchase, so no role can finish the product alone.
- **Idle players:** No special rule. The Competition phase has hints, mini games, attacks and a live shop for every role, and everything is recorded for analysis afterwards.

---

## 5. Scoring

**There is no score, winner or loser in the game.** The only result shown is the three graphs on the end screen (company vs company, coin difference over time, role-wise coins), revealed by the organizer.

- No Team Score, no Individual Score and no 60/40 split, no judge adjustment, and no Contribution Engine.
- Leftover coins and debt are not turned into a score. They are only recorded, and appear in the graphs through the wallet.
- Everything is still recorded against each Admission ID and can be exported to Excel, so organizers can analyse results afterwards. *(Detailed in the recording session at the end.)*

---

## 6. System Integrity Rules

- **Wallet:** The CFO cannot approve a shop purchase that would take the wallet below -200 coins. Requests can be sent regardless of the balance. **Attacks are the exception:** the CEO can launch them at any time, and they can push the wallet below -200.
- **Rejected items:** A rejected item can be requested again by the role, but only **60 seconds after the rejection**.
- **One approval at a time:** The CFO handles the queue one request at a time.
- **Organizer overrides:** Organizers can correct glitches on the organizer side, and any manual change is logged. *(Carried over from the original design; to be confirmed.)*
- **Hidden products:** A company cannot see the rival's product.

---

## 7. Platform Modules

| Module | What it does |
| --- | --- |
| **1. Organizer login & console** | Separate organizer login. Upload or paste the roster (Admission IDs and names), "Add participant" for late arrivals, live lobby, place participants into companies and roles, pick the problem statement for the game, **Start game**, **End game**, and live view of both companies at any time. |
| **2. Participant login** | Separate participant login by Admission ID against the pre-loaded roster. Statuses: in lobby, **In Game**, **Game Completed** (can log in to see the graphs only; cannot play again). |
| **3. Synchronized timer** | One countdown, visible and synchronized on every screen, controlling phase changes. |
| **4. Base idea picker** | Shows the 6 ideas (3 hardware, 3 software), live vote tally, CEO's final pick, auto-pick on timeout. |
| **5. Shop** | The shop catalog by role section, request queue, CFO approve/reject, shared wallet display, shared Product panel, and the 20-second summary card. |
| **6. Competition** | Selling (coin trickle), hints, attacks and shields, mini games, surprise event and coin injection, the end graphs. |
| **7. Recording & Excel export** | Everything is recorded against the participant's Admission ID and exportable to Excel. *What to record and how is a dedicated session at the end (see the reminder at the top).* |

---

## 8. Event Twists & Organizer Watch-Outs

### Event Twists

- **Surprise Market Events (kept):** The organizer has a button to trigger a live market event during the Competition phase. It hits **both companies equally** and is shown to everyone as a market announcement. It is logged. There are **3 events**: **Demand Surge** (sales up), **Demand Slump** (sales down) and **Shop Sale** (shop prices drop). 

  | Event | Effect | Duration |
  | --- | --- | --- |
  | Demand Surge | sales +25% | 45 seconds |
  | Demand Slump | sales -25% | 45 seconds |
  | Shop Sale | all shop prices -25% | 90 seconds |

  The organizer can trigger **only one event per game** (once, of the three).
- **Bonus Investor Funding (kept as an organizer gift):** The organizer can inject bonus coins into either company's wallet, for example to fix a glitch or help a company far behind. Every injection is logged (who, which company, how many coins, when). **Limit: one injection per game, up to 500 coins.**
- **Role Swap: removed.** Roles are locked after the Briefing, and a swap would muddle the role-wise graphs.
- **Investor Q&A: removed.** There are no judges and no pitches in the game.

### Organizer Watch-Outs

- **Pre-load everything:** Upload the roster, and prepare the 8 problem statements with their 6 base ideas each, before the event.
- **Run one game at a time:** The next game starts only after the current game is ended.
- **Offline platform:** There is no internet. Everything the platform needs must be served from the Raspberry Pi.
- **Network:** The Pi runs its own Wi-Fi hotspot. Test it with all ~14 devices beforehand, tell players to stay on the Wi-Fi even if the phone says "no internet", and keep the Pi's cable and power secure, since it is the network too.
- **Load test and backups:** Test with about 14 concurrent devices (laptops and phones) beforehand, and keep a paper fallback.

---

## 9. Problem Statements & Base Ideas *(approved)*

Eight games, eight problem statements. Each has 6 base ideas (3 hardware, 3 software). Each idea has **3 risks** (the COO's risk fixes), **3 offered brand names** and **3 offered taglines** (bought by the CMO). The full draft list of all 48 ideas is in `idea_options_DRAFT.csv` (**approved**).

| # | Problem statement | Status |
| --- | --- | --- |
| 1 | **Food waste:** Homes, canteens and shops throw away huge amounts of good food every day. | Ideas approved |
| 2 | **Water shortage:** People waste water they don't know they're wasting, and many places run short. | Ideas approved |
| 3 | **Student stress:** Students feel overloaded and don't know where to get help. | Ideas approved |
| 4 | **Road safety:** Two-wheeler riders and pedestrians get hurt on busy roads every day. | Ideas approved |
| 5 | **Elderly living alone:** Older people living alone need safety and company without moving out. | Ideas approved |
| 6 | **Small shopkeepers:** Local shops struggle to track stock, customers and sales. | Ideas approved |
| 7 | **Waste and recycling:** Households mix up their waste, so recycling rarely works. | Ideas approved |
| 8 | **Disaster readiness:** Floods and storms hit with too little warning, and people don't know what to do. | Ideas approved |

### 9.1 Game 1: Food waste

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Smart Fridge Sensor | A small sensor inside the fridge that tracks what's inside and how fresh it is. |
| H2 | Hardware | Canteen Waste Scale | A smart bin scale that weighs the food thrown away and shows which dishes get wasted. |
| H3 | Hardware | Surplus Food Locker | A public locker where shops and homes drop extra food for people to pick up for free. |
| S1 | Software | Expiry Reminder App | An app where you scan or enter groceries and it warns you before they expire. |
| S2 | Software | Leftover Recipe Finder | An app that suggests meals from whatever ingredients you already have. |
| S3 | Software | Food Share Network | An app where neighbours and shops post surplus food and others claim it. |

### 9.2 Game 2: Water shortage

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Smart Water Meter | A meter on the pipe that shows live water use and spots leaks. |
| H2 | Hardware | Rainwater Tank Monitor | A sensor on a rain tank that shows how full it is and when it's safe to use. |
| H3 | Hardware | Smart Shower Timer | A shower device that tracks water use and nudges people to save. |
| S1 | Software | Water Footprint Tracker | An app that estimates a household's daily water use and gives saving tips. |
| S2 | Software | Leak Report Map | An app where people report leaks and broken taps, shown on a shared city map. |
| S3 | Software | Community Water Scheduler | An app that tells neighbourhoods when to fill tanks, based on supply times. |

### 9.3 Game 3: Student stress

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Stress Band | A wristband that senses heart rate and warns the student when stress is high. |
| H2 | Hardware | Calm Corner Pod | A small quiet booth on campus with calming light and sound, bookable by students. |
| H3 | Hardware | Smart Study Lamp | A desk lamp that tracks study time and reminds the student to take breaks. |
| S1 | Software | Mood Check-In App | An app where students log their mood daily and see patterns over time. |
| S2 | Software | Anonymous Peer Support Chat | A chat app where students talk to trained volunteers without giving their name. |
| S3 | Software | Study Planner Coach | An app that spreads workload across days so deadlines don't pile up. |

### 9.4 Game 4: Road safety

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Smart Helmet | A helmet that detects a crash and automatically alerts emergency contacts. |
| H2 | Hardware | Blind-Spot Alert Sensor | A small sensor on a two-wheeler that warns the rider of vehicles in the blind spot. |
| H3 | Hardware | Smart Zebra Crossing | A crossing with lights that flash when a pedestrian steps on it, warning drivers. |
| S1 | Software | Risky Road Map | An app that shows accident-prone roads and warns riders before they reach them. |
| S2 | Software | Safe Rider Score App | An app that tracks speed and braking and gives the rider a safety score with tips. |
| S3 | Software | Crash Report Helper | An app that guides bystanders step by step to call help and give first aid after a crash. |

### 9.5 Game 5: Elderly living alone

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Fall Detection Pendant | A pendant that senses a fall and calls family or a helper automatically. |
| H2 | Hardware | Smart Pill Box | A pill box that lights up and beeps at dose time, and tells family if a dose is missed. |
| H3 | Hardware | Home Activity Sensor | A small motion sensor that learns the daily routine and alerts family if something looks wrong. |
| S1 | Software | Daily Check-In App | An app where the elder taps "I'm okay" each day, and family is told if they don't. |
| S2 | Software | Neighbour Helper Network | An app that connects elders with nearby volunteers for errands and quick visits. |
| S3 | Software | Video Call Made Easy | A very simple app with big buttons that makes calling family easy for older people. |

### 9.6 Game 6: Small shopkeepers

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Smart Shelf Sensor | A shelf with weight sensors that tells the shopkeeper when an item is running low. |
| H2 | Hardware | Pocket Billing Device | A small handheld device that prints bills and records every sale. |
| H3 | Hardware | Footfall Counter | A door sensor that counts customers and shows the busiest hours. |
| S1 | Software | Stock Tracker App | An app where the shopkeeper logs stock and gets a reorder reminder. |
| S2 | Software | Digital Credit Book | An app that replaces the paper ledger for customers who buy on credit. |
| S3 | Software | Local Delivery Connect | An app where nearby customers order from the shop and a local rider delivers. |

### 9.7 Game 7: Waste and recycling

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Smart Sorting Bin | A bin with a camera that recognises the item and opens the right compartment. |
| H2 | Hardware | Recycling Reward Kiosk | A kiosk where people drop bottles and cans and get reward points. |
| H3 | Hardware | Bin Fill Sensor | A sensor in public bins that tells collectors when the bin is full, so trucks only go where needed. |
| S1 | Software | What Goes Where App | An app where you scan or search an item and it tells you which bin it goes in. |
| S2 | Software | Pickup Scheduler | An app where households book a pickup for recyclables and track the collector. |
| S3 | Software | Neighbourhood Recycling League | An app that scores each street's recycling and shows a friendly leaderboard. |

### 9.8 Game 8: Disaster readiness

| # | Type | Idea | What it is |
| --- | --- | --- | --- |
| H1 | Hardware | Flood Level Sensor | A sensor on a river or drain that measures the water level and sends an early alert. |
| H2 | Hardware | Emergency Siren Box | A solar siren with a battery that warns a neighbourhood even when power is out. |
| H3 | Hardware | Go-Bag Kit | A smart emergency kit with a tracker, torch and radio, ready to grab in an emergency. |
| S1 | Software | Early Warning Alert App | An app that sends weather and flood alerts to people in the affected area. |
| S2 | Software | Evacuation Route Guide | An app that shows the nearest shelter and the safest route to get there. |
| S3 | Software | Community Check-In Board | An app where people mark themselves "safe" and neighbours see who still needs help. |

---

## 10. Data Recording & Excel Export *(finalized)*

**Decided**

- **Export format:** Both a **per-game workbook** (downloaded by the organizer right after each game) and **one workbook for the whole event** (all games, all 80 players). Each sheet is one kind of data, and every row carries the **game number** and the participant's **Admission ID**.
- **Players and sessions:** For every player: Admission ID, name, game number, company (A or B) and role. Plus a **full session log**: every login, logout, disconnect and reconnect with its time.
- **Shop:** For every purchase request: the item and its price, who requested it and when, whether the CEO recommended it, whether the CFO **approved, rejected** or it was **auto-rejected** (with the time), and the wallet before and after. Also every **CEO recommendation**, including ones that were never requested, and the **coins left over** per company at the end.
- **Ideation:** Every **vote and every vote change** with its time (who voted for which idea), the **CEO's final pick**, and whether the pick was made by the CEO or by **auto-pick** (including a random tie-break). Also the time saved and added to the shop timer if the phase ended early.
- **Sales and wallet over time:** Every **5 seconds** during the Competition phase, for each company: the **wallet balance**, the **coins per minute each role is earning** (CTO, CMO, COO), the mini game coins and the attack coins. These feed the three end graphs and the Excel sheets.
- **Attacks and shields:** Every attack: the CEO (Admission ID), which attack, the cost, start and end time, whether a **shield blocked it**, and the **cover story** the victim saw. Every shield: when bought and when used.
- **Events and coin injections:** The surprise event used (which, when), and the bonus coin injection (which company, how many coins, when).
- **Organizer actions:** Start, End, Next Game, role and company changes, roster changes and the chosen problem statement, each with the time and the organizer's identity.
- **Hints:** Every hint shown (who, when, what it said) and whether the player **acted on it within 60 seconds**.
- **Mini games:** For each puzzle the CFO sees: which puzzle, its difficulty, when it was shown, **solved or skipped** (free or paid skip), the time taken and the coins earned. No move-by-move data inside a puzzle.
- **End graphs:** When the organizer reveals the graphs, the **three graphs are also saved as image files** for that game, next to the game's Excel workbook. The graphs can still be redrawn from the 5-second data.

**Storage**

- **One database file on the Pi (SQLite).** Everything is saved the moment it happens, so a crash loses nothing, and the Excel workbooks and graph images are created from it on request. A backup is a copy of that one file.
- **Backup:** The database is **copied automatically every 5 minutes during a game**, and once more after each game (when the organizer clicks Next Game). Copies go to a **second location, such as a USB stick** plugged into the Pi.
- **Who can download:** Only **organizers**, from the organizer console (per game and for the whole event, at any time). Participants never see the Excel data.

---

## 11. Tech Stack *(finalized)*

**Decided**

- **Server:** **Node.js** with **WebSockets**. One program on the Pi runs the whole game and pushes live updates (timers, wallets, requests, graphs) to every browser. JavaScript is used on both the server and the browser.
- **Database:** **SQLite**, one file (see Section 10).
- **Browser pages:** **Plain HTML, CSS and JavaScript**, with no big framework. It is the lightest option for phones on the Pi's hotspot, and everything is served from the Pi.
- **Graphs:** **Hand-drawn (SVG or canvas)**, to match the League of Legends look exactly (the zero-line coin difference and the mirrored role bars). No charting library. The same drawing code produces the **saved graph images**.
- **Excel export:** A Node.js library (such as ExcelJS) builds real **.xlsx workbooks**, one sheet per kind of data, entirely on the Pi.
- **Start and recovery:** The game server **starts automatically when the Pi boots** and **restarts itself if it crashes**, so nobody needs a terminal. Together with the saved state, this gives the automatic resume described in Section 0. Setting up an event is just "plug in the Pi and wait a minute".
- **Stack is final.** Node.js and WebSockets, SQLite, plain HTML, CSS and JavaScript, hand-drawn graphs, ExcelJS, automatic start.

---

## 12. Build Plans and Design Files

This guide is the specification. The plans below turn it into software, in this order. **Nothing is built until this guide and the plans are approved.**

| Plan | File in `docs/superpowers/plans/` |
| --- | --- |
| 1. Core server | `2026-10-11-core-server.md` |
| 2. Screens, ideation and shop | `2026-10-11-screens-ideation-shop.md` |
| 3. Competition engine | `2026-10-11-competition-engine.md` |
| 4. Mini games | `2026-10-11-mini-games.md` |
| 5. Graphs, export and backup | `2026-10-11-graphs-export-backup.md` |
| 6. Deployment and rehearsal | `2026-10-11-deploy-and-rehearsal.md` |
| 7. The look (UI) | `2026-10-11-ui-design-implementation.md` |

Other files: `docs/superpowers/plans/README.md` (the index and the rules every plan follows), `docs/design/ui-design-system.md` and `docs/design/mockup.html` (the visual design), `data/` (the 8 problem statements, the 48 ideas with their risks, brand names and taglines, and the shop catalog), and `docs/event-day-checklist.md` (written in Plan 6).

**What the plans found, and what was decided:**

1. **Balance (decided).** A careful company earns about 71 coins per minute, roughly 1,140 coins over the 16 minutes (about 1,250 with the extra 200 coins of debt). The first simulation showed the **CTO earning far less per coin than the CMO and COO** (6.5 coins per minute against 31 and 27), because the CTO's level was averaged over six slots. **Decided: the CTO's level counts its best 3 features** (Section 2.0). The CTO now earns about 13 coins per minute (20 with the debt), twice as much per coin. The CMO and COO remain the stronger earners; the CTO's value is that it chooses which three features matter, and its parts add up to 4 more coins per minute.
2. **Colour-blind players and puzzle regions (decided).** Queens and Lits show their regions by colour **and by thin borders between regions**, so no player depends on colour alone (Section 2.0.1).

## 13. Build Notes: where the finished product differs from this guide *(2026-10-12)*

Found while building and testing. Each item says what the product does today.

1. **Login** takes the Admission ID only (no name field). IDs are trimmed and upper-cased.
2. **Only Next Game ends a game.** The "End game" button no longer exists. The order is: Competition ends, the organizer presses **Reveal**, then **Next Game**. Pressing Next Game without Reveal reveals and saves the graphs first. Players see "Thank you for playing" with no graph data until the reveal.
3. **Downloads** (organizer only): a Downloads panel is always shown, with the whole-event Excel and, for every game, its Excel and (after its reveal) its three graph images.
4. **No manual wallet override.** The only organizer money tools are the one coin injection (1 to 500 coins, one per game) and the one market event per game. There is no logged "fix a glitch" edit.
5. **Seat changes** (swap, replace) happen in the Briefing only. A participant added later can only be seated as a replacement from the lobby during the Briefing.
6. **Attack Shield** is a public shop item with that name, so the word "attack" appears in every player's shop. An attacked company never sees an attack message, only a market-style reason.
7. **Ad Blackout** switches off the victim CMO's brand name (+2), tagline (+2) and ad campaign; the target-user part still counts.
8. **A blocked attack still costs the attacker.**
9. **After the shop closes** (30 s left), the CEO and CFO can still decide requests already in the queue until 0:00; only new requests are refused.
10. **Skip to next phase** is a rehearsal control (not allowed to skip out of the Competition). **SHOWDOWN_SPEED** above 1 shows a "rehearsal" banner to the organizer. Do not use either at the real event.
11. **Time:** the game is 29 minutes plus the 20-second summary card, not exactly 30. Changeover between games is extra. The Pi has no clock battery: set its date before the event. After a power cut the game resumes from the last 5-second heartbeat.
12. **Balance numbers** (from `scripts/simulate-balance.js`): a careful company earns about 71 coins a minute (1,136 over 16 minutes); buying everything at the top tier costs about 2,020 coins for about 93 a minute (the 2,150 / 81 figures above are out of date).
13. **Puzzles:** Lits is generated under a work limit, so it appears less often at the highest level; another puzzle kind is used when it cannot be built in time.
14. **Spare router:** the guide says no router. The product needs only the Pi's own hotspot; a spare router is plan B at most.
15. **Hardening:** logging in again with the same Admission ID replaces the older session (the newest login wins); the organizer sees "Logged in again" counts. Failed-login and organizer-password throttles are counted per IP address. Message flood protection drops clients that send too fast. A strict Content-Security-Policy is sent with every page. Request and puzzle numbers are counted per company. Downloads tokens expire 30 minutes after the organizer leaves.
