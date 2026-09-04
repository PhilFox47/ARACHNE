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
export const APP_VERSION = "1.20.1";

/** Bumped on the release that introduced it, for the settings screen. */
export const RELEASED = "2026-09-04";

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
    version: "1.20.1",
    date: "2026-09-04",
    kind: "patch",
    headline: "A set inside its range is a set done right",
    changes: [
      "The trainer was calling ten reps of an 8–12 set two reps short. A prescription carries two numbers — the range, which is the requirement, and the prefill, which is only what the form suggests and creeps up a rep a session. It was judging you against the prefill, so anywhere below the current suggestion counted as a miss even though the whole point of a range is that anywhere inside it is a pass.",
      "The session after a weight increase was hit worst. Reps reset to the bottom of the range when the weight goes up — that is the mechanism working — and the old check read the drop as going backwards. Being told to fix that was being told to undo it.",
      "Now the bottom of the range is the requirement, and the same range parser decides it for both the trainer and the progression, so the two cannot drift apart again. Reps moving around inside the range are no longer a regression either; only a movement with no range at all still reports one.",
      "Real misses are untouched. Below the range is still a shortfall, one set of three is still an abandoned movement, and the sentence now reads “6 against 8–12” so you can see what the set was actually asking for.",
    ],
  },
  {
    version: "1.20.0",
    date: "2026-09-04",
    kind: "minor",
    headline: "The composition chart shows a change again",
    changes: [
      "It stacked lean and fat mass from zero, so a hundred-kilo body gave an axis rounded up to 110 — and since those numbers read as percentages, an axis running to 110% of a person. Against that scale a good month was about two pixels. It was drawing a real measurement at a resolution that could not display it.",
      "It now plots body fat over time, zoomed to the range you actually live in. The proportion question it used to answer is answered exactly, in numbers, in the three cells right beneath it, so the chart is free to answer the one numbers answer badly: which way is this going, and how steadily.",
      "The zoom is kept honest two ways, because an axis fitted to the data alone is the opposite lie. The window is never narrower than 8 points, sized so every gridline is a round number at every scale; and your raw daily readings are drawn faintly behind the average, so you can see how far bioimpedance scatters around the line you are being asked to trust.",
      "Your first reading is marked with a dashed line. However the window rescales, the gap between it and today is the honest answer to whether any of this has worked. There is no target line — the plan sets no body-fat goal, and inventing one to make the chart look purposeful would be worse than none.",
      "The window arithmetic is checked rather than eyeballed: a wrong axis renders perfectly and just lies about the slope. Both failure directions are asserted, along with even gridlines at four scales and an axis that can never offer negative body fat.",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-09-03",
    kind: "minor",
    headline: "How it felt, after every session",
    changes: [
      "Controlled, hard or something hurt is now asked on every movement after every session, not only the first time you ever did it. Asked once, the app learned that your first box squat was hard and then never asked again — which is the least informative moment in that movement's whole life. This is the only signal here for how hard something was rather than how much of it you did, and nearly all of its value is in the trend.",
      "One tap, nothing blocking, and it shows what you already said today so a reload is not a second interrogation. Tapping again corrects it rather than adding a second answer.",
      "The step-down works properly now. A day you said it hurt has never counted towards mastery whatever the reps said, but that check could only ever fire on the first session you ever did. It fires on any session now, and two painful days still drop a movement a rung.",
      "The trainer reads the run rather than the reading. A movement that comes back hard several sessions in a row with no easier session in between is a load that is not being absorbed, and it is told to answer that by holding the weight where it is — never by asking for more effort. The count of hard sessions also has a denominator now, which it needs at ten times the volume of answers.",
      "A repetition bug in the briefing, found on the way: the demotion counted only a topic's most recent mention, so a point dropped for one morning came straight back the next and three mornings in four read the same. It accumulates now, capped so nothing that keeps being true is silenced outright.",
    ],
  },
  {
    version: "1.18.0",
    date: "2026-08-30",
    kind: "minor",
    headline: "The trainer can see the rest of the app",
    changes: [
      "It can now read how a movement felt. It could see that your rows fell from ten to six and could not see that you had told the app your shoulder hurt — so a coach instructed to push you had every reason to push on exactly the day it should have said stop. Pain now outranks everything in the briefing, including a week of missed patrols, and it is told to say back off rather than harder.",
      "Your session notes are read rather than merely carried. A note is the only thing in the whole dataset written by you rather than measured about you, and it usually explains a number that would otherwise be misread — a bad session with “slept four hours” against it is not a discipline problem. It is told never to criticise a shortfall a note already explains.",
      "The tape measurements are in, which is the answer to a stalled fortnight: the waist keeps moving when the scale does not. So is the fat-versus-lean split of the last two weeks, so being ahead of the corridor can be called what it is when the missing kilos came off the wrong tissue.",
      "THE WEB is visible, so it can tell you what is close. “Two more clean sessions and the next rung opens” is the most motivating sentence available and was completely invisible to it — along with the sessions that are banked and only waiting on the calendar.",
      "THE TRIAL and ABILITIES round it out. XP, levels and streaks are still deliberately withheld: it should coach the work, not the scoreboard.",
    ],
  },
  {
    version: "1.17.0",
    date: "2026-08-30",
    kind: "minor",
    headline: "MAINTENANCE — the chores, and what skipping them costs",
    changes: [
      "A new screen for the household half of a healthy week. Daily chores reset every morning, weekly ones every Monday and can be ticked any day of the week. Add, rename, reorder and retire them all in the app; the six you named are there to start with.",
      "No XP for doing them, a malus for not. A daily chore missed yesterday costs 10% of today's earnings and a weekly one missed last week costs 20% of every day of this one. They add up, capped at 50% — without a cap every chore you add would raise the maximum punishment, which would make tracking more of your life actively worse.",
      "Milestones are never touched. Achievements, ABILITIES, checkpoints, THE TRIAL and full patrol weeks are records rather than daily takings, and an achievement earned once in twelve months should not quietly be worth less because the washing-up waited. The penalty appears in the ledger as its own line, so you can see what it cost rather than finding other numbers quietly smaller.",
      "Nothing can punish you before it existed: a chore added today is never missed yesterday, and retiring one stops it counting from today — though it will not wipe a penalty already earned, because a penalty with an undo button is not one.",
      "The trainer reads it as a fifth source and will name a running malus or a clean week, but it is told not to read the list back to you every morning.",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-08-27",
    kind: "minor",
    headline: "The trainer remembers what it already told you",
    changes: [
      "It now reads its own last fortnight before writing. Every briefing from the previous fourteen days goes into the prompt, newest first, labelled as what you have already been told — so the same protein observation does not arrive five mornings running as though it were news.",
      "Repetition is demoted, not banned. A point you have not heard beats one from two days ago; a point that is getting worse, or that you have been told and ignored, is still worth saying again — and when it does come back it has to say that it is not the first time. Amnesia was the problem, not emphasis.",
      "The offline version got its own memory. Each observation carries a topic, and a topic raised recently loses ground by how recently — thirty-five points for yesterday, down to eight for four days ago. A flat penalty made everything equal again after two days and the loop came straight back; grading it keeps the ranking moving.",
      "One bug found while building it: the closing line names the protein target every single day, so the topic detector saw “protein” in every briefing and permanently suppressed the one observation the rotation most needed to reach.",
    ],
  },
  {
    version: "1.15.1",
    date: "2026-08-24",
    kind: "patch",
    headline: "Wall slides removed — no smooth wall to do them on",
    changes: [
      "Gone from Tuesday's MOBILITY & FLOW and from the Phase 0 baseline sweep, and gone from the catalogue, so it will not turn up again anywhere. Tuesday is now seven movements.",
      "It was also standing in as the substitute for lateral raises when there is nothing to lift, which it should never have been — a lateral raise is a strength movement and a wall slide is a mobility drill, and swapping one for the other while saying nothing is how a plan quietly stops training what it claims to. Lateral raises now lock with a reason when you own nothing to raise, the way the dead hang does.",
      "Any sets you already logged against it are untouched and still readable — the movement is gone from the plan, not from your history.",
      "Tuesday keeps Thread the Needle for shoulder range, and Monday's warm-up still has shoulder circles and scapula push-ups, so the overhead work is not lost with it.",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-08-24",
    kind: "minor",
    headline: "The trainer is allowed to tell you off",
    changes: [
      "It can now see what you actually ate, not just the daily total. A day over the target arrives with the entries that put it there, so the sentence is “Saturday finished 310 kcal over at 2,610, and 1,240 of that was the pizza” rather than “watch your intake”. The week's most expensive snacking comes with it.",
      "It can see how each movement went. Every session's stored prescription is compared against what you logged — the reps you hit against the reps asked for, the sets finished against the sets planned, and whether the number went backwards since last time. The four worst arrive with the catalogue's own cues for that movement, so the correction is the programme's coaching rather than something invented.",
      "Skipped patrols are named as misses. A training day that produced nothing is reported by name, and a session you opened and abandoned is called that rather than counted as a rest day.",
      "The prompt was rewritten around one rule: honest, not nice. No praise without a number behind it, no reassurance before the problem, no taking the criticism back at the end. Blunt about the work and never about you — no shaming, no moralising about food, and never a suggestion to train it off or eat less than the plan allows.",
      "The offline version got the same teeth, and now ranks what it has found rather than listing all of it — the three sharpest observations and what today is, in about eighty words.",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-08-24",
    kind: "minor",
    headline: "A trainer who has read the whole week",
    changes: [
      "A paragraph at the top of HQ each morning. It reads across everything at once — PATROL, FUEL, VITALS and where you are in the year — says what went well and what did not, and tells you what today is for. Every other screen reports one thing; the useful observations live in between them, like protein running short on exactly the days you train hardest.",
      "Written once at 08:00 and then left alone. Stored rather than derived, which is this app's one deliberate exception to deriving everything: it costs a model call, and a paragraph that rewrites itself every time you open the screen is a paragraph you stop reading. What it says at 08:00 it says at 22:00.",
      "A poll inside the server writes it, so it is already there when you open the app rather than making the first open of the day wait. If the container was asleep at 08:00, or restarted, or you simply opened the app at eleven, the check runs and writes it then. The very first one does not wait for 08:00 at all.",
      "It cannot show you a failure. A model that is unreachable, slow, refusing or rambling falls through to the same observations composed from the same numbers — worse prose, never an empty panel — and that version is marked so a later load can quietly replace it with the real one.",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-08-17",
    kind: "minor",
    headline: "The sports-science pass: breaks, feedback, and the muscles nobody trained",
    changes: [
      "REFUEL WEEK — every eighth training week is now a planned week at maintenance, pinned to every second LOW PROFILE WEEK so reduced training and restored calories are the same seven days. A twelve-month unbroken deficit was the plan's one real physiological gap: the MATADOR trial found intermittent maintenance blocks lost more fat and suppressed resting metabolism less, and a break you can see coming is the difference between a diet you finish and one you quit in month seven.",
      "The calorie target now answers to the scale. It was a function of the date alone, which makes it a prediction rather than a plan — at a plausible activity level the same intake finished ten kilos under target, which is nine months of eating less than you needed. It now trims up to ±300 kcal against a fortnight of rolling averages, only once you are outside the corridor band, and never below the 2,000 floor. Simulated across the range of plausible metabolisms, the spread of finishing weights narrows from 12.7 kg to 6.6 kg.",
      "Three volume holes filled. Calf raises — the one muscle the entire year had nothing for. A second set of lateral raises, because three a week was all the side-delt work there was and the side delt is what builds the V that Phase 4 names as the whole point. And a glute bridge on Monday, giving the hip hinge two exposures a week instead of one.",
      "Creatine, vitamin D and a blood panel are now in the Phase 1 brief. Creatine monohydrate at 3–5 g/day is the most evidenced supplement there is and does more in a deficit than out of it; at this latitude you make no vitamin D between October and March; and bloods now give you a month-twelve result the mirror cannot show.",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-08-17",
    kind: "minor",
    headline: "Audit before Phase 1 — four things the plan was quietly getting wrong",
    changes: [
      "A hip hinge is back on Wednesday. The gate that keeps tumbling off a bare floor listed “bridge” among the things needing a mat — meaning the back bridge, but it also matched the glute bridge, which is lying on your back lifting your hips. The bottom three rungs of the whole hinge strand were being deleted, so the only leg day of the week had no hinge in it at all.",
      "Protein now asks for what the phase actually states. Every screen and every challenge multiplied the document's “40 g per meal” by three and called it the day's target — 120 g, through a phase that asks for 160. That is 40 g a day of the one macro deciding how much of 20 kg comes off as muscle. FUEL shows the figure next to the number now.",
      "A movement dropped for want of kit says so. A dead hang has no bar-free version worth doing, so without a bar it was silently removed — Wednesday just came up one movement shorter than the plan it claims to follow. It now appears with the rest of the locked work, naming the kit and how to get it back.",
      "The first LOW PROFILE WEEK moved from week 2 of Phase 1 to week 5. Deloads counted from day 0, so the first one landed one real week after a baseline fortnight that was already deliberately easy — a week off from the two weeks designed not to need one. They count training weeks now.",
    ],
  },
  {
    version: "1.11.1",
    date: "2026-08-17",
    kind: "patch",
    headline: "Mondays counted towards nothing",
    changes: [
      "A week index counted calendar weeks from the Monday of the week you started in; the window it produced counted seven-day blocks from the start date itself. You started on a Tuesday, so the two ran a day apart — and on a Monday the index had already turned over to the new week while its window did not open until the Tuesday. The Monday fell between them. Everything logged on one counted towards no weekly challenge at all.",
      "Every Monday, not only the first. And it was worse than a lost day: “Full Patrol” asks for five sessions and could only ever see four of them, so a perfect Monday-to-Friday week scored 4/5. That challenge was unclearable for the whole run so far.",
      "Weeks now run Monday to Sunday everywhere, which is what the rest of the app already did. Nothing is stored — standings are recomputed from your logs every time they are read — so every Monday you have already trained is credited the moment this is running. Expect your XP to go up.",
      "Anchoring on Monday makes the first week of a mid-week start a short one, so a challenge never asks for more days than the week actually holds: a Tuesday start's week 0 asks for four sessions, not five, and one that has no training days in it at all is not offered.",
      "npm run check gains a suite that logs a single day's work on every day of a month, from all seven possible start days, and fails if any one of them counts towards nothing.",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-08-14",
    kind: "minor",
    headline: "Photograph a meal without keeping it",
    changes: [
      "LOG FUEL now leads with Take a photo, which opens the camera. Choose from gallery sits under it for a meal you have already photographed. Every other place that asks for a picture — the nutrition label, the recipe, a second angle on an entry you have already saved — follows one remembered setting rather than asking again.",
      "It was never a choice before. A file input with nothing else on it lets the browser decide, and a phone decides on the photo library — so logging dinner meant saving dinner to your camera roll first, and a gallery slowly filling with pictures of food.",
      "Both, rather than swapping one for the other: `capture` is an attribute of the element and not of the click, so a single input either opens the camera and hides the library or the reverse. There are two, and the choice picks between them.",
      "SUIT CHECK is unchanged — it has always opened the camera. If you would rather it also took an existing photo, say so.",
    ],
  },
  {
    version: "1.10.1",
    date: "2026-08-06",
    kind: "patch",
    headline: "Every photographed meal was filed under the same name",
    changes: [
      "A meal is saved the moment the shutter closes, as “Analysing\u2026”, and renamed when the model answers. The rename never rewrote the key everything groups by — so every photo-logged meal ever carried the key “analysing”, and the review saw one enormous food. The FUEL page lists rows and looked right; the review groups them and did not.",
      "Two more faults from the same cause: the “Again” row would have repeated whatever you last photographed rather than the chip you tapped, and starring a second photographed food overwrote the first favourite through the unique index on that column.",
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
      "Saved first, then worked out, so a slow or failed model can never cost you the entry. No “Analysing\u2026” placeholder either: the description is already yours, so the row reads correctly the moment you press Add.",
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
      "Reps were always the bar — two reps of a movement that wants twelve has never banked anything. What was missing was any sign of that on the screen where you do the work. Every movement now shows “0/2 sets at 12 reps \u00b7 that is what banks a session”, and a set that came up short is marked with a dot rather than a tick.",
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
