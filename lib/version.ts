/**
 * The build's version, and the rule for changing it.
 *
 *   MAJOR  a fundamental change — the plan model itself, or a break that
 *          existing data cannot be carried across. Not expected.
 *   MINOR  a large change. A new screen, a new part of the plan, a reworked
 *          feature, anything that changes how the app is used.
 *   PATCH  a small change. Fixes, copy, tuning, anything you would not need to
 *          be told about.
 *
 * `SCHEMA_VERSION` in lib/db moves independently and on its own rules: it is
 * the count of migrations, and it only ever goes up by one per shipped schema
 * change. A version bump does not imply a schema bump or the reverse.
 */
export const APP_VERSION = "1.10.1";

/** Bumped on the release that introduced it, for the settings screen. */
export const RELEASED = "2026-08-06";

export interface ReleaseNote {
  version: string;
  date: string;
  /** Which part of the rule this release exercised. */
  kind: "major" | "minor" | "patch";
  headline: string;
  changes: string[];
}

/**
 * Newest first. Kept in the app rather than only in CHANGELOG.md so the phone
 * can answer "what changed?" without a laptop — this is the only place the
 * running build can be identified from.
 */
export const RELEASES: ReleaseNote[] = [
  {
    version: "1.10.1",
    date: "2026-08-06",
    kind: "patch",
    headline: "Every photographed meal was filed under the same name",
    changes: [
      "A meal is saved the moment the shutter closes, as \u201cAnalysing\u2026\u201d, and renamed when the model answers. The rename never rewrote the key everything groups by — so every photo-logged meal ever carried the key \u201canalysing\u201d, and the review saw one enormous food. The FUEL page lists rows and looked right; the review groups them and did not.",
      "Two more faults from the same cause: the \u201cAgain\u201d row would have repeated whatever you last photographed rather than the chip you tapped, and starring a second photographed food overwrote the first favourite through the unique index on that column.",
      "Schema v14 repairs what is already stored — every entry's key recomputed from its description, favourites from their labels, and an entry still being analysed left alone. Your numbers do not change; the grouping does.",
      "One definition of that normalisation now, imported by every writer, with checks that fail a description written without its key and a file that reinvents the rule.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-08-06",
    kind: "minor",
    headline: "Forgot the photo? Describe it and it still gets estimated",
    changes: [
      "The text field under LOG FUEL used to just write the name down — a row with no calories and no macros, which is most of the way to not logging it. It now gets the same estimate a photo does.",
      "Saved first, then worked out, so a slow or failed model can never cost you the entry. No \u201cAnalysing\u2026\u201d placeholder either: the description is already yours, so the row reads correctly the moment you press Add.",
      "It is asked differently on purpose. Half the photo prompt is about reading a plate, and a model given those rules with nothing to look at hedges. The text prompt says there is no photograph, that it must not refuse for want of one, and that where you gave no size it should assume the ordinary German portion, say which, and set its confidence low.",
      "An entry with no numbers now offers an Estimate button whether or not it has a photo — a meal typed on an evening the model was unreachable used to be stuck that way forever.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-08-06",
    kind: "minor",
    headline: "Every movement in a session explains itself",
    changes: [
      "An \u24d8 next to each movement's name opens the full write-up — setting up, the rep, what goes wrong, the cues, what it trains. The same words THE WEB has always shown, from the same catalogue entry, on the screen where you are actually doing the work.",
      "Both sheets now show where the rung sits: what it is built on, what it becomes, and what mastering it opens somewhere else in the tree.",
      "That last part was never visible anywhere. The wall handstand opens the feet-elevated pike push-up and the cartwheel; the shoulder roll from a crouch opens both the cartwheel and the safety vault; the plank opens nine things. It is the best reason to do a boring rung properly.",
      "Warm-ups and the dumbbell work get the button too — they are explained just as fully, they simply have nothing to master.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-08-06",
    kind: "minor",
    headline: "Weight counts towards mastery, and the session shows the bar",
    changes: [
      "Reps were always the bar — two reps of a movement that wants twelve has never banked anything. What was missing was any sign of that on the screen where you do the work. Every movement now shows \u201c0/2 sets at 12 reps \u00b7 that is what banks a session\u201d, and a set that came up short is marked with a dot rather than a tick.",
      "The three rungs you do holding something now count the weight as well as the reps: goblet squat 3\u00d715 at 16 kg, Romanian deadlift 3\u00d712 at 16 kg, Jefferson curl 3\u00d78 at 4 kg — the last of those is the document's own number.",
      "Always the total you are holding: two 8 kg dumbbells is 16, not 8. Heavier still counts; the load is a floor, not a target. The reps still have to be there.",
      "This is retroactive. Those three movements logged with no weight, or a light one, stop counting towards mastering them, so a leg strand may step back a rung. Nothing is deleted — log the weight and it climbs again.",
      "Fifteen goblet squats with a 2 kg dumbbell used to unlock the split squat, the Bulgarian split squat and the road to a pistol.",
    ],
  },
  {
    version: "1.7.2",
    date: "2026-08-05",
    kind: "patch",
    headline: "FUEL opens any day, not just today",
    changes: [
      "The counts on the review were right — but FUEL only ever showed today, so an entry logged on any earlier day could never be corrected or deleted while the review went on counting it for ninety days.",
      "There are arrows above the log now. Step back to any day, read it, add to it, fix it, delete from it. Tomorrow is not reachable, because there is no such thing as a meal you have not eaten yet.",
      "The totals, the water and the calorie target all follow the day on screen rather than the clock — a Tuesday in Phase 1 is no longer judged against Phase 3's number.",
      "The favourites row was ordered by a counter that only ever went up: a coffee tapped forty times during testing kept its place even after every entry was deleted. It counts the entries themselves now.",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-08-05",
    kind: "patch",
    headline: "The hold timer got a voice, and a longer run-up",
    changes: [
      "Five seconds of lead-in rather than three — enough to put the phone down and actually get into the position.",
      "It beeps when the clock starts, so you are not guessing whether the countdown has finished while you are already upside down.",
      "On a movement with a time goal it chimes when that time is up, so you know when you may come out of it: three notes rising, longer and louder than anything else it plays. It keeps counting after that, because going past the target is how a hold progresses.",
      "A tick every thirty seconds past the target, a falling pair when you stop, and a speaker toggle in the header if you would rather it were quiet.",
      "iPhones play Web Audio through the ringer channel, so the side switch on silent will mute all of it — the vibration stays for that reason.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-08-05",
    kind: "minor",
    headline: "A clock for the holds — no more stopwatch",
    changes: [
      "Every timed movement has a timer on its set row. Tap it, get set during a three-second lead-in, and the seconds go straight into the set when you stop.",
      "It counts up rather than down, because going past the target is how a hold progresses — the target is a line the clock crosses, and it tells you how far past you got.",
      "It buzzes: through the lead-in, a long double buzz the moment you clear the target, and a tick every thirty seconds after that. You will not be looking at the screen.",
      "The time is measured from the wall clock, so locking the phone or switching apps mid-hold cannot cost you seconds — and the screen is kept awake while it runs.",
      "The whole screen is the stop button.",
      "A baseline probe the sweep has moved onto a different rung now explains that rung, rather than the movement the patrol happened to name.",
    ],
  },
  {
    version: "1.6.2",
    date: "2026-08-05",
    kind: "patch",
    headline: "The Docker build stopped failing on a seed script",
    changes: [
      "`next build` type-checks everything in the project, including the dev-only scripts — so a seeding script that imported `sharp`, a package this app does not depend on, was able to stop the production image from building.",
      "It resolved on a laptop only because Next ships sharp as an optional dependency for image optimisation this app never uses. The image install builds native packages from source, sharp needs libvips to do that, and npm drops an optional package whose install script fails without saying so.",
      "The dev scripts are now out of the app's type-check — they are still fully checked, just not by the thing that builds the image — and the seed script reaches for sharp only at the moment it needs it.",
      "`npm run check` now fails any static import of a package that package.json does not declare, so nothing else can quietly lean on a transitive dependency again.",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-08-05",
    kind: "patch",
    headline: "Looking at next month's session no longer decides it",
    changes: [
      "Opening a session writes its numbers down so they can't move mid-set. That was also happening when you merely browsed ahead — so a Monday three weeks out got frozen at whatever level you were on the evening you scrolled past it, and you would train it at that level when it arrived.",
      "A day that hasn't arrived is a preview now: worked out fresh from where you stand today, every time you look, saved nowhere, and read-only. The real session is issued on the morning of, from everything you have logged by then.",
      "Sessions already frozen by an earlier build are cleared the next time you open any session, so days you browsed to last week are worked out properly when they come round.",
      "A preview more than three weeks out used to show you a level lower, because the tree was asked where you stood on that future date and the weeks in between contain no training yet.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-08-05",
    kind: "minor",
    headline: "Mastery takes months, and the tree now lasts the year",
    changes: [
      "A best-case simulation — never missing a session, clearing every bar on every set — had every strand topped out by week 30. Twenty-two weeks with nothing left to unlock. That is what this release is about.",
      "Mastering a movement now needs the clean sessions spread across separate calendar weeks, not just separate days. Sessions can be crammed; weeks cannot, and there is no sense being handed a complicated push-up while the elevated one is still a fight.",
      "Three sets rather than two from the second rung of every strand upward — the document's own rule is a clean 3×12. The bottom rung stays at two so the baseline fortnight can still find your level.",
      "The catalogue went from 73 rungs to 103. Every movement is now named something you can search for and find a tutorial on, every rename keeps its old name so nothing logged is lost, and the thin strands — lunging, holds, crawling, the engine — were filled in with the movements that were missing between the ones already there.",
      "A gate can name a rung now, not just a number. The cartwheel waits on the shoulder roll from a crouch rather than on five reps of anything in the falling strand.",
      "Press and pull happen twice a week in months 1–3, and Friday is built skills-first, engine-last in every phase — the document's own rule is that no skill gets tried quickly at the tired end of a session.",
      "Without an AI key the plan used to prefill exactly what you did last time, forever. It adds a rep, or five seconds, or 2.5 kg at the top of the range.",
      "The model is now told your bodyweight, how far under your calorie target you have been eating and how hard the last six sessions felt — and told to hold rather than add when those say to.",
      "Four bugs the simulation found: the dead hang was being logged in reps and could never be mastered; owning rings moved you *down* the rowing strand; nine baseline probes started you partway up a strand instead of at the bottom; and two movements from the same strand collapsed into one, silently shortening Wednesday.",
    ],
  },
  {
    version: "1.5.8",
    date: "2026-08-04",
    kind: "patch",
    headline: "The meal note sheet moved off the keyboard",
    changes: [
      "The sheet that asks what the photo missed was anchored to the bottom, which is where a phone puts its keyboard — so the field you were typing into sat behind it. It hangs from the top now, with the dismiss area below.",
      "Sized from the visual viewport rather than dvh: Chrome on Android shrinks the dynamic viewport when the keyboard opens and iOS Safari does not, so dvh alone leaves an iPhone with the sheet under the keyboard.",
      "Tapping the backdrop analyses without a note rather than doing nothing — the photos are already saved, so dismissing should still get you numbers.",
    ],
  },
  {
    version: "1.5.7",
    date: "2026-08-04",
    kind: "patch",
    headline: "A stalled download gives up in a minute, not fifteen",
    changes: [
      "npm's default fetch-timeout is five minutes with two retries, so one tarball whose transfer stalls can burn a quarter of an hour before reporting anything. That was the shape of the hanging build: not a dead connection, a slow one inside a timeout long enough to look dead.",
      "Sixty seconds and five retries instead. Costs nothing on a healthy connection, and turns a single long stall into several quick attempts on a bad one.",
    ],
  },
  {
    version: "1.5.6",
    date: "2026-08-04",
    kind: "patch",
    headline: "Closes the last host the native build needs",
    changes: [
      "Building better-sqlite3 from source moved it off github.com, but node-gyp still fetched node's headers from nodejs.org. The node image already ships them, so it now uses those and makes no network call at all.",
      "Three hosts removed from the critical path across 1.5.4–1.5.6: auth.docker.io, github.com, nodejs.org.",
    ],
  },
  {
    version: "1.5.5",
    date: "2026-08-04",
    kind: "patch",
    headline: "One fewer host that has to be reachable to build",
    changes: [
      "The `# syntax=` directive made BuildKit resolve a tag against Docker Hub on every build, needing an auth token before the Dockerfile was even parsed. On a flaky connection that is where the build died, at step 3. Docker's built-in frontend does everything needed, so the directive is gone.",
      "docs/DOCKER-TROUBLESHOOTING.md documents the underlying network problem, how to check it in thirty seconds, and the fixes — MTU first.",
    ],
  },
  {
    version: "1.5.4",
    date: "2026-08-04",
    kind: "patch",
    headline: "Fixed the hanging Docker build — prebuild-install fetching from GitHub",
    changes: [
      "better-sqlite3's install script downloads its binary from github.com, not the npm registry, with no timeout set anywhere. An unreachable GitHub meant a call that never returned and never errored — ten minutes of silence with everything already downloaded.",
      "It now builds from source instead, which routes through node-gyp: proper timeouts, fails loudly rather than hanging. Two minutes once, then the layer is cached.",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-08-04",
    kind: "patch",
    headline: "Stops installing 165 MB of binaries that cannot run",
    changes: [
      "next, sharp, lightningcss and Tailwind ship one native binary per platform. The lockfile predates npm recording which libc each needs, so a glibc image was installing the musl builds too — 165 MB that can never execute. They are pruned after the install.",
    ],
  },
  {
    version: "1.5.2",
    date: "2026-08-04",
    kind: "patch",
    headline: "Docker builds off Alpine — npm ci went from minutes to seconds",
    changes: [
      "better-sqlite3 ships prebuilt binaries for glibc and none for musl, so on Alpine every dependency install compiled SQLite from source. On node:22-slim the same install downloads a 2 MB binary: 12 seconds cold, measured, against several minutes.",
      "Install scripts now print instead of being suppressed — a native build with no output is indistinguishable from a hang while you are watching it.",
      "The healthcheck uses node rather than wget, which a slim base image does not guarantee, and zombie reaping moved to Docker's own init.",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-08-04",
    kind: "patch",
    headline: "Docker builds stopped recompiling SQLite on every release",
    changes: [
      "The dependency layer was keyed on package.json, which changes every release because the version bumps — so npm ci rebuilt better-sqlite3 from source each time, for ninety seconds, with no dependency having changed. It is keyed on the lockfile now.",
      "The npm download cache carries across builds, the audit round-trip that runs after the install is skipped, and node-gyp uses every core when it does have to compile.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "FUEL reads more than one photo, and shows its working",
    changes: [
      "A meal can carry several photos — the plate, the packet, the back of the packet, the recipe. You tag what each one is, and the model is told, so a Nährwerttabelle is read as a table rather than guessed at as a picture.",
      "Portions are scaled rather than copied. A label states values per 100 g; the pack says 500 g; the entry gets the number for what you actually ate. Recipes are divided by their servings instead of logged as the whole tray.",
      "Meals get a breakdown of suspected ingredients, and you can correct it. Snacks don't — breaking a coffee into water and beans tells you nothing.",
      "Re-analyse. It takes the corrected name, portion and ingredients and works the numbers out again — and is deliberately never given the previous figures, so a bad estimate can't anchor the next one.",
      "Photos can be added to an entry after the fact. The label you forgot is usually a bigger correction than any amount of typing.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "Every movement the plan can prescribe is now on THE WEB",
    changes: [
      "Thirty-eight movements the plan could put in front of you were in no strand and had no explanation — the shoulder roll among them, arriving in week one on a Friday with nothing under it.",
      "The shoulder roll is now a five-level strand: rock-backs, then from a kneel, a crouch, standing, and finally from a walk — which is the progression the plan document itself describes.",
      "Eight new strands: falling, tumbling, getting up, obstacles, spine, hips, lunging and the engine. Cartwheels wait on a handstand and a roll; vaults wait on a roll; the kip-up waits on a hollow hold.",
      "Warm-ups, cooldowns, mobility drills and the dumbbell work are Groundwork: on THE WEB and fully explained, but never locked. You should not have to earn a stretch.",
      "A strand with nothing logged on it now opens at its easiest movement rather than at whatever the plan named — the fix that stopped pike push-ups on day one, applied everywhere.",
      "A movement the tree is holding back is shown in the session with the reason, instead of quietly not being there.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "Mastery takes repeating, and placement can be reset",
    changes: [
      "A movement is mastered at two sets that clear its bar in one session, on two separate days — not the first time the number happens. One good set is a good day.",
      "A session where you reported that something hurt no longer counts towards mastering it, whatever the reps said.",
      "THE WEB can be reset: the whole tree or one strand at a time, so a first patrol logged before the ladder knew anything about you doesn't leave a strand opening halfway up.",
      "A reset deletes nothing. Every set stays in your history and still counts towards your streak — THE WEB just stops reading the ones before the line, and there is an Undo.",
      "Each node now shows how many clean sessions it has banked rather than just your best number.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "THE WEB — every movement explained, and a skill tree that unlocks",
    changes: [
      "A movement catalogue: what each exercise is, how to set it up, how to do the rep, what goes wrong on it, and what it trains.",
      "THE WEB, reachable from PATROL — twelve strands from the version anyone can do to the one the year is aiming at, each node locked, open, being worked or mastered.",
      "Movements can be gated by a different strand: pike push-ups elevated needs 30 s of wall handstand, hanging knee raises needs a 30 s dead hang.",
      "The first time you do a movement, one question — controlled, hard, or did something hurt. Say it hurt twice and the movement steps back down.",
      "Come back after three weeks away and the first session opens a level lower.",
      "Every movement in a session is now described to the model before it is asked to program anything.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-04",
    kind: "minor",
    headline: "Calendar weeks, versioning, and a gentler first fortnight",
    changes: [
      "Weeks run Monday to Sunday everywhere. Starting mid-week no longer produces a week that begins on a Tuesday; day 0's calendar week is week 1, with the days before it marked as not-yet-started.",
      "The baseline sweep starts every movement at the bottom of its ladder and walks up, rather than opening on the plan's default variation.",
      "A movement is never prescribed more than one rung above what you have actually logged.",
      "This screen now shows the version, and every database is migrated forward on open.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-03",
    kind: "major",
    headline: "First run",
    changes: [
      "HQ, PATROL, FUEL, VITALS, JOURNEY, SUIT CHECK, THE TRIAL and SENSE.",
      "Onboarding, the twelve-month course fitted to your own goal and timeframe, and the five-patrol baseline sweep.",
      "Rolling daily backups, 31 kept, importable from the settings screen.",
    ],
  },
];
