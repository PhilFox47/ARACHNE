/**
 * The movement catalogue — every exercise the plan can prescribe, explained.
 *
 * This file is the single source of truth for three separate readers, and it
 * exists because they were previously reading three different things:
 *
 *   You            — THE WEB shows setup, execution, cues and what goes wrong.
 *                    A movement you don't understand is a movement you do badly.
 *   The engine     — families and tiers form the skill tree. Which variation you
 *                    are prescribed is decided here, from what you have logged.
 *   The model      — every prescribed movement is described to it before it is
 *                    asked to adjust anything. A model told only "Pike push-ups,
 *                    3 sets" is guessing at what it is programming.
 *
 * Identity is the `key`, and the key is derived from the name. Renaming a
 * movement therefore orphans its history — that is a data migration, not a copy
 * edit. `aliases` exists for exactly this: names the app has written into logs
 * in the past still resolve to the movement they meant.
 */

// ─────────────────────────────────────────────────────────────
// Families
// ─────────────────────────────────────────────────────────────

/**
 * A family is a slot in the week, not a muscle. Monday always has a horizontal
 * press in it; which variation fills that slot is a question about you.
 */
export type MovementFamily =
  | "push"
  | "vertical_push"
  | "dip"
  | "pull"
  | "row"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "hold"
  | "mobility"
  | "conditioning"
  | "jump"
  | "handstand"
  | "crawl"
  | "spine"
  | "hips"
  | "roll"
  | "acro"
  | "kipup"
  | "vault";

export const FAMILY_LABELS: Record<MovementFamily, string> = {
  push: "Pressing",
  vertical_push: "Overhead",
  dip: "Dips",
  pull: "Pulling",
  row: "Rowing",
  squat: "Squatting",
  hinge: "Hinging",
  lunge: "Lunging",
  core: "Bracing",
  hold: "Holds",
  mobility: "Range",
  conditioning: "Engine",
  jump: "Jumping",
  handstand: "Inverting",
  crawl: "Crawling",
  spine: "Spine",
  hips: "Hips",
  roll: "Falling",
  acro: "Tumbling",
  kipup: "Getting up",
  vault: "Obstacles",
};

/** One line on what each strand of the web is actually for. */
export const FAMILY_BLURBS: Record<MovementFamily, string> = {
  push: "Chest, shoulders and triceps, horizontally. The variation is chosen by how much of your weight is on your hands.",
  vertical_push: "Pressing overhead with your own bodyweight. The road to a handstand push-up, and the strand where shoulders get hurt if it is rushed.",
  dip: "The other pressing angle. Builds the triceps and the lower chest, and asks a lot of the shoulder at the bottom.",
  pull: "Vertical pulling. The document calls the pull-up bar the single most important purchase — lats are what fill the suit.",
  row: "Horizontal pulling. Balances everything the pressing strand does, and keeps the shoulder healthy while doing it.",
  squat: "Knee-dominant leg work, from both legs to one.",
  hinge: "Hip-dominant leg work — hamstrings, glutes and a back that holds its shape under load.",
  lunge: "Single-leg strength and the balance that comes with it.",
  core: "Holding a straight line under load. Not sit-ups: the job is resisting movement, not creating it.",
  hold: "Positions held until they fail. Grip, isometric strength and the willingness to stay somewhere uncomfortable.",
  mobility: "Range you can actually use. The sessions you will want to skip, and the ones that decide what you can learn later.",
  conditioning: "Being out of breath on purpose. The goal is the heart rate, not the score.",
  jump: "Producing force fast, and landing without paying for it.",
  handstand: "Being upside down. Five minutes a day, every day, rest days included.",
  crawl: "Moving on all fours under tension. Shoulders, core and coordination at once.",
  spine: "A back that bends and extends under control, one segment at a time. The strand that makes the bridge and the kip-up possible.",
  hips: "Getting to the floor and back, and owning the range once you are there. Slow to move and worth every session.",
  roll: "Hitting the ground and getting back up unhurt. The document calls it the foundational parkour skill and your insurance against injury in everything that follows.",
  acro: "Going over your hands sideways. Everything here is learned slowly, on something soft, before it is ever done at speed.",
  kipup: "Getting off the floor without using your hands. Months of work, and the document says so — the strand is built to take that long.",
  vault: "Getting over and up things. The last strand to open, because it is the one where the ground is not where you left it.",
};

// ─────────────────────────────────────────────────────────────
// The catalogue
// ─────────────────────────────────────────────────────────────

export interface Prerequisite {
  family: MovementFamily;
  reps?: number;
  seconds?: number;
  /**
   * How far up the other strand you must have actually climbed.
   *
   * A number alone is a weak gate. "Five reps of anything in the falling
   * strand" is satisfied by five backward breakfalls, which is not what a
   * cartwheel is waiting for — it is waiting for you to be able to roll out of
   * one. A tier names the rung, so the gate means what it says.
   */
  tier?: number;
  /** Why this gate exists. Shown on the locked node. */
  why: string;
}

export interface MasteryBar {
  reps?: number;
  seconds?: number;
  /**
   * Kilograms the set must carry, on a movement where reps alone say nothing.
   *
   * Fifteen goblet squats with a 2 kg dumbbell and fifteen with the plan's own
   * pair are the same number and not the same movement, and without this the
   * first of them unlocked the split squat, the Bulgarian split squat and the
   * road to a pistol. Only the loaded rungs carry one — `npm run check` fails a
   * rung that needs weights and does not state how much.
   *
   * Always the TOTAL being held: two 8 kg dumbbells at the chest is 16, not 8.
   * The movement says so in its own setup lines, because a bar in an undefined
   * unit is worse than no bar.
   */
  kg?: number;
  /** Sets in one session that must clear the bar. */
  sets?: number;
  /** Separate sessions that must do that. */
  sessions?: number;
  /**
   * Distinct calendar weeks those sessions must be spread across.
   *
   * The lever that turns a number into a habit. Session counts alone can be
   * crammed — a movement trained twice a week reaches six clean sessions in
   * three weeks, which is a good fortnight rather than a movement you own. The
   * week count says how long the shape has to have been under you before the
   * harder one arrives, and it is the reason the tree keeps opening for twelve
   * months rather than emptying itself by month seven.
   */
  weeks?: number;
}

/**
 * The mastery levels, from the version anyone can do to the one that ends a
 * strand.
 *
 * Every rung names one of these rather than writing its own numbers, so the
 * whole catalogue can be compared at a glance and a strand that is quietly
 * cheap to climb shows up as one.
 *
 * Three sets rather than two from `foundation` upwards, because that is the
 * document's own rule — "only advance at a clean 3×12" — and three is what a
 * normal training week prescribes. `intro` keeps two: the baseline fortnight
 * prescribes two sets, and a bar the fortnight cannot clear would leave the
 * sweep unable to move anybody off the bottom rung, which is the opposite of
 * what it is for. A deload week also prescribes two, so deload weeks cannot
 * advance you — which is correct, and part of why the year lasts.
 *
 * Skill levels take two sets rather than three. A roll or a kip-up is practised
 * in short, sharp sets while fresh; asking for three clean sets of a skill is
 * asking for the tired third set that the document explicitly warns against.
 * They pay for it in sessions instead, which is the honest currency for a skill:
 * the kip-up is "several months of work" in the document's own words, and this
 * is where that is written down.
 */
export const MASTERY = {
  /** The version almost anyone can already do. Cheap on purpose — it is a starting line, not an achievement. */
  intro: { sets: 2, sessions: 3, weeks: 2 },
  /** The early rungs of a strength strand. */
  foundation: { sets: 3, sessions: 5, weeks: 3 },
  /** The ordinary working rungs — the ones most of the year is spent on. */
  working: { sets: 3, sessions: 7, weeks: 4 },
  /** The rung whose successor is a real step up in demand. */
  demanding: { sets: 3, sessions: 9, weeks: 6 },
  /** Hard strength. Months, not weeks. */
  advanced: { sets: 3, sessions: 12, weeks: 8 },
  /** The top of a strength strand. Reaching it is the point of the year. */
  elite: { sets: 3, sessions: 15, weeks: 10 },

  /** The first, safest version of a skill. */
  drill: { sets: 2, sessions: 4, weeks: 4 },
  /** The middle of a skill strand. */
  practice: { sets: 2, sessions: 6, weeks: 6 },
  /** The real version of a skill, done well. */
  craft: { sets: 2, sessions: 9, weeks: 9 },
  /** The one the strand was built for. */
  signature: { sets: 2, sessions: 12, weeks: 12 },
} as const;

/**
 * Used only by a movement that names no level of its own. Nothing in the
 * catalogue should rely on it — `npm run check` fails a rung that does.
 */
export const DEFAULT_MASTERY = MASTERY.working;

export function masterySets(m: Movement): number {
  return m.masterAt.sets ?? DEFAULT_MASTERY.sets;
}

export function masterySessions(m: Movement): number {
  return m.masterAt.sessions ?? DEFAULT_MASTERY.sessions;
}

/** Distinct calendar weeks the clean sessions must span. */
export function masteryWeeks(m: Movement): number {
  return m.masterAt.weeks ?? DEFAULT_MASTERY.weeks;
}

/**
 * Whether a movement is something you earn or something you always have.
 *
 * Not everything the plan prescribes belongs on a ladder. Arm circles do not
 * gate cat-cow, and pretending they do would mean "mastering" a warm-up before
 * being allowed to stretch — a rule nobody would follow and the app would be
 * wrong to enforce. But leaving them out of the catalogue entirely was worse:
 * it meant the shoulder roll, a skill the document calls insurance against
 * injury, arrived in week one with no explanation and nothing under it.
 *
 * So both are in the catalogue, and both are on THE WEB. Only one is gated.
 *
 *   ladder      A rung. Earned, gated, has a mastery bar, unlocks the next one.
 *   groundwork  Always open. Warm-ups, stretches, mobility drills and the
 *               accessory lifts whose progression is load rather than shape.
 *               Explained and briefed to the model exactly like a rung.
 */
export type MovementTrack = "ladder" | "groundwork";

export interface Movement {
  name: string;
  family: MovementFamily;
  /** Defaults to "ladder". */
  track?: MovementTrack;
  /** Depth in the family's strand. 0 is where everyone starts. Ignored for groundwork. */
  tier: number;
  metric: "reps" | "time";
  /** The plan's own dose for this variation. */
  dose: string;
  /** What it is, for someone who has never seen it. */
  summary: string;
  /** Getting into position. */
  setup: string[];
  /** The rep itself. */
  execution: string[];
  /** What goes wrong on this specific movement, and what it costs. */
  watch: string;
  /** Two or three words to hold in your head mid-set. */
  cues: string[];
  /** What it trains. Read by you and by the model. */
  trains: string[];
  /** Any one of these satisfies it. Absent means bodyweight, anywhere. */
  needs?: string[];
  /** Gates from other strands. Same-family progression is implied by tier. */
  requires?: Prerequisite[];
  /**
   * What counts as mastered, and therefore what unlocks the tier above.
   *
   * Always one of the `MASTERY` levels, optionally with the bar itself written
   * alongside it. Never a single set, and never a fortnight: the point of the
   * bar is that you are comfortable in the shape, not that the number once
   * happened. There is no sense doing a complicated push-up while the elevated
   * one is still a fight, and this field is where that is enforced.
   */
  masterAt: MasteryBar;
  /** Names this movement has been logged under before. Never remove one. */
  aliases?: string[];
  /** Per-side movements halve the sensible rep count. */
  perSide?: boolean;
  loaded?: boolean;
}

/** Lowercased, punctuation-stripped. The tracking identity of a movement. */
export function movementKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BAR = ["pullup_bar", "rings", "gym", "outdoor_bars"];
const LOAD = ["dumbbells", "heavy_dumbbells", "kettlebell", "bands", "gym", "weight_vest"];
const SOFT = ["mat", "gym"];

export const MOVEMENTS: Movement[] = [
  // ── Pressing ──────────────────────────────────────────────
  {
    name: "Wall push-up",
    family: "push",
    tier: 0,
    metric: "reps",
    dose: "8–12",
    summary:
      "A push-up done standing, hands on a wall. Almost none of your weight is on your arms, which is the point — it teaches the shape before it asks for the strength.",
    setup: [
      "Stand an arm's length from a wall, feet together.",
      "Hands on the wall at chest height, slightly wider than your shoulders.",
      "Step back until your body leans in a straight line from heel to head.",
    ],
    execution: [
      "Bend the elbows and let your chest come toward the wall.",
      "Elbows travel backwards at roughly 45° to your ribs, not straight out sideways.",
      "Touch the wall with your chest, then press back until the arms are straight.",
    ],
    watch:
      "Hips in line with the shoulders — the body is a plank, not a hinge. If your hips arrive at the wall first, you are bending rather than pressing, and the movement stops training anything.",
    cues: ["One straight line", "Chest first", "Elbows back, not out"],
    trains: ["chest", "front shoulder", "triceps", "the push-up shape"],
    masterAt: { ...MASTERY.intro, reps: 12 },
    aliases: ["Push-ups against a wall"],
  },
  {
    name: "Incline push-up (waist height)",
    family: "push",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary:
      "The same movement with your hands on a kitchen counter or a sturdy table — roughly waist high. Lower hands mean more of your weight on your arms, and the whole pressing strand is that one dial, turned down a step at a time.",
    setup: [
      "Hands on a counter or table edge, shoulder-width, far enough out that your chest can pass between them.",
      "Walk your feet back until your body is one line from heel to head.",
      "Check the surface cannot slide before you load it.",
    ],
    execution: [
      "Lower until your chest touches the edge.",
      "Keep the elbows tracking back at 45°.",
      "Press away until the arms lock, without letting the hips sag.",
    ],
    watch:
      "Elbows back at roughly 45°, not flared straight out. Flared elbows put the shoulder in the position it is weakest in, and it is the position most people default to when a set gets hard.",
    cues: ["Squeeze the glutes", "Chest to the edge", "Full lockout"],
    trains: ["chest", "front shoulder", "triceps", "trunk bracing"],
    masterAt: { ...MASTERY.foundation, reps: 12 },
    aliases: ["Push-ups on a table"],
  },
  {
    name: "Incline push-up (bench height)",
    family: "push",
    tier: 2,
    metric: "reps",
    dose: "8–12",
    summary:
      "Hands on a chair seat, a sofa edge or a bench — around knee height. Noticeably harder than waist height, and the rung most people spend the longest on. That is normal and not a problem.",
    setup: [
      "Hands on the seat of a stable chair or the front edge of a sofa, against a wall if it slides.",
      "Feet back until you are one straight line.",
      "Hands under the shoulders, not out in front of them.",
    ],
    execution: [
      "Lower under control until your chest touches the surface.",
      "Pause for a moment at the bottom rather than bouncing.",
      "Press back up to straight arms.",
    ],
    watch:
      "Chest touches first. If the hips arrive first, go back a rung — that pattern gets grooved fast and is much harder to unlearn than it is to avoid.",
    cues: ["Ribs down", "Chest touches", "Push the floor away"],
    trains: ["chest", "front shoulder", "triceps", "trunk bracing"],
    masterAt: { ...MASTERY.working, reps: 12 },
    aliases: ["Push-ups on a chair", "Elevated push-ups", "Push-ups on the sofa edge"],
  },
  {
    name: "Push-up",
    family: "push",
    tier: 3,
    metric: "reps",
    dose: "8–12",
    summary:
      "On the floor. The benchmark the whole plan is measured against — the month-12 target is 45 of these.",
    setup: [
      "Hands under the shoulders, slightly wider, fingers forward.",
      "Legs straight, feet together or hip-width.",
      "Squeeze the glutes and brace the stomach before the first rep.",
    ],
    execution: [
      "Lower until the chest is a fist's width off the floor.",
      "Elbows at 45°, shoulder blades free to move.",
      "Press up to a full lockout, ribs staying down.",
    ],
    watch:
      "The moment the lower back sags, the set is over. Sagging turns a chest exercise into a lumbar one, and the reps after it are worth nothing.",
    cues: ["Brace first", "Straight line", "Fist off the floor"],
    trains: ["chest", "front shoulder", "triceps", "anti-extension core"],
    requires: [
      {
        family: "core",
        seconds: 45,
        why: "A floor push-up is a moving plank. Hold a still one for 45 seconds first, or the set becomes a lower-back exercise the moment it gets hard.",
      },
    ],
    masterAt: { ...MASTERY.working, reps: 12 },
    aliases: ["Push-ups", "Deficit push-ups on parallettes"],
  },
  {
    name: "Decline push-up",
    family: "push",
    tier: 4,
    metric: "reps",
    dose: "8–12",
    summary:
      "A floor push-up with your feet up on a chair or sofa. Tilting the body head-down moves weight onto the arms and shifts the emphasis toward the upper chest and shoulders — the same dial as the incline rungs, turned the other way past the floor.",
    setup: [
      "Feet on a chair, sofa or step, hands on the floor under the shoulders.",
      "Higher feet make it harder; start at knee height before sofa height.",
      "Brace as if for a plank before the first rep.",
    ],
    execution: [
      "Lower until the chest is a fist's width off the floor.",
      "Elbows at 45°, head in line with the spine rather than craning up.",
      "Press to a full lockout without the hips folding.",
    ],
    watch:
      "The hips want to pike upwards, which quietly shortens the range and takes the trunk out of it. If you cannot see a straight line from ankle to ear at the top, lower the feet.",
    cues: ["Long line", "Look at the floor", "Hips forward"],
    trains: ["upper chest", "front shoulder", "triceps", "anti-extension core"],
    masterAt: { ...MASTERY.demanding, reps: 12 },
  },
  {
    name: "Diamond push-up",
    family: "push",
    tier: 5,
    metric: "reps",
    dose: "8–12",
    summary:
      "A push-up with the hands together under the chest, thumbs and index fingers touching. Shifts the work sharply onto the triceps.",
    setup: [
      "Hands together under the sternum, forming a triangle.",
      "Same straight body as a floor push-up.",
    ],
    execution: [
      "Lower until the chest touches the hands.",
      "Elbows stay close to the ribs the whole way.",
      "Press back to lockout.",
    ],
    watch:
      "Hard on the wrists and elbows. Stop at the first sharp sensation in either — this is the rung that produces elbow tendinitis when volume gets added too fast.",
    cues: ["Elbows to the ribs", "Chest to the hands"],
    trains: ["triceps", "inner chest", "wrist tolerance"],
    requires: [
      {
        family: "core",
        seconds: 45,
        why: "A narrow base makes the trunk work harder to stay straight. A 45-second plank is the shape holding up on its own.",
      },
    ],
    masterAt: { ...MASTERY.demanding, reps: 12 },
    aliases: ["Diamond push-ups"],
  },
  {
    name: "Archer push-up",
    family: "push",
    tier: 6,
    metric: "reps",
    dose: "8–10 per side",
    summary:
      "A wide push-up where you lower toward one hand while the other arm straightens out to the side. Most of the load lands on one arm — the step before a one-arm push-up.",
    setup: [
      "Hands well wider than shoulder-width.",
      "Body straight, feet a little wider than usual for balance.",
    ],
    execution: [
      "Bend one arm and shift your chest over that hand.",
      "The far arm straightens and stays passive — it is a kickstand, not a second presser.",
      "Press back to the middle and alternate.",
    ],
    watch:
      "The straight arm stays straight and passive. Letting it press turns this back into a wide push-up and you get none of what you came for.",
    cues: ["Shift over one hand", "Far arm straight", "Hips square"],
    trains: ["one-arm pressing strength", "chest", "trunk anti-rotation"],
    perSide: true,
    masterAt: { ...MASTERY.advanced, reps: 10 },
    aliases: ["Archer push-ups"],
  },
  {
    name: "Clap push-up",
    family: "push",
    tier: 7,
    metric: "reps",
    dose: "3× 5–8",
    summary: "A push-up pressed hard enough to leave the floor. Trains power rather than strength.",
    setup: ["Floor push-up position.", "Somewhere soft under your hands if you have it."],
    execution: [
      "Lower to the bottom under control.",
      "Press as hard and fast as you can so the hands leave the floor.",
      "Clap, then land and absorb by bending the elbows.",
    ],
    watch:
      "Land with soft elbows. Landing locked out sends the whole impact into the wrists and elbows, and that is how this movement injures people.",
    cues: ["Explode", "Soft landing", "Reset every rep"],
    trains: ["pressing power", "rate of force", "landing mechanics"],
    masterAt: { ...MASTERY.elite, reps: 8 },
    aliases: ["Clap push-ups"],
  },

  // ── Overhead ──────────────────────────────────────────────
  {
    name: "Pike push-up with hands elevated",
    family: "vertical_push",
    tier: 0,
    metric: "reps",
    dose: "8–12",
    summary:
      "An overhead press using your own weight, with your hands raised on a chair so most of it stays on your feet. Where the overhead strand starts for everyone.",
    setup: [
      "Hands on a chair seat, shoulder-width.",
      "Walk your feet in and lift your hips so your body makes an upside-down V.",
      "Head between the arms, back straight — bend at the hips, not the spine.",
    ],
    execution: [
      "Bend the elbows and lower the top of your head toward the seat, slightly in front of your hands.",
      "Elbows track forward past your ears, not out to the sides.",
      "Press back up until the arms are straight.",
    ],
    watch:
      "The head goes forward of the hands, not straight down, and never takes any load. If the neck is involved at all, raise the hands higher and start again.",
    cues: ["Hips high", "Head forward of the hands", "Elbows forward"],
    trains: ["shoulders", "triceps", "the overhead pressing pattern"],
    masterAt: { ...MASTERY.intro, reps: 12 },
    aliases: ["Pike push-ups on a chair"],
  },
  {
    name: "Pike push-up",
    family: "vertical_push",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary:
      "The same movement with your hands on the floor. A genuine shoulder exercise, and a real step up from the chair version.",
    setup: [
      "Hands and feet on the floor, hips pushed high into an upside-down V.",
      "Legs as straight as your hamstrings allow — bend the knees rather than round the back.",
      "Head between the arms.",
    ],
    execution: [
      "Lower the top of your head to the floor just in front of your hands.",
      "Light touch, no weight on the head.",
      "Press back to straight arms.",
    ],
    watch:
      "Elbows track forward, not out to the sides. Stop well before the shoulders fatigue — this is the movement people hurt themselves on, because a tired shoulder in an overhead position has nowhere good to go.",
    cues: ["Hips to the ceiling", "Light touch", "Press the floor away"],
    trains: ["shoulders", "triceps", "overhead strength", "handstand preparation"],
    requires: [
      {
        family: "core",
        seconds: 45,
        why: "The V position holds itself with the trunk. Forty-five seconds of plank is the minimum that keeps the lower back out of it.",
      },
    ],
    masterAt: { ...MASTERY.foundation, reps: 12 },
    aliases: ["Pike push-ups"],
  },
  {
    name: "Feet-elevated pike push-up",
    family: "vertical_push",
    tier: 2,
    metric: "reps",
    dose: "8–12",
    summary:
      "Pike push-ups with your feet on a chair or sofa, so your torso is nearly vertical. This is almost a handstand push-up.",
    setup: [
      "Feet up on a chair, hands on the floor.",
      "Walk your hands back until your hips stack over your shoulders.",
    ],
    execution: [
      "Lower the head toward the floor in front of the hands.",
      "Press back up without letting the hips fall out of the stack.",
    ],
    watch:
      "Almost a handstand press. Only worth trying once the flat version is easy for twelve — at this angle a failed rep has your head closest to the floor.",
    cues: ["Stack the hips", "Elbows forward", "Control the descent"],
    trains: ["shoulders", "triceps", "overhead strength near vertical"],
    requires: [
      {
        family: "handstand",
        seconds: 30,
        why: "Half a minute against the wall upside down first. Being inverted has to be familiar before it is also hard.",
      },
    ],
    masterAt: { ...MASTERY.working, reps: 12 },
    aliases: ["Pike push-ups elevated"],
  },
  {
    name: "Wall handstand push-up negative",
    family: "vertical_push",
    tier: 3,
    metric: "reps",
    dose: "5× 3",
    summary:
      "In a wall handstand, lowering yourself under control and then coming down. Only the lowering half, which is the half you can do first.",
    setup: [
      "Something soft under your head.",
      "Kick up into a wall handstand, hands a little wider than shoulders.",
    ],
    execution: [
      "Lower slowly until the top of your head touches.",
      "Come out of it rather than trying to press back up.",
      "Reset between reps rather than rushing.",
    ],
    watch:
      "Have a bail-out planned before the first rep — turn out to the side, never collapse backwards. Deciding how to fall while falling is not a plan.",
    cues: ["Slow down", "Bail sideways", "Reset every rep"],
    trains: ["overhead pressing strength", "shoulder stability upside down"],
    requires: [
      {
        family: "handstand",
        seconds: 60,
        why: "A minute in a wall handstand. If holding still is hard, moving is not the next step.",
      },
    ],
    masterAt: { ...MASTERY.demanding, reps: 5 },
    aliases: ["Handstand push-up negatives"],
  },
  {
    name: "Wall handstand push-up",
    family: "vertical_push",
    tier: 4,
    metric: "reps",
    dose: "5× 3",
    summary:
      "The whole rep, upside down against a wall: lower the head to the floor and press back to straight arms. The top of the overhead strand and the thing the pike ladder has been building toward all year.",
    setup: [
      "A folded towel or cushion where your head will go, and a clear space behind you.",
      "Kick up to the wall, hands a little wider than shoulder-width, a hand's length off the skirting board.",
      "Squeeze the glutes and ribs so the body is one line rather than an arch.",
    ],
    execution: [
      "Lower under control until the top of your head touches the cushion, slightly in front of your hands.",
      "Elbows forward past the ears rather than flaring out to the sides.",
      "Press back to straight arms, keeping the heels on the wall.",
    ],
    watch:
      "Press-outs, not head-stands. The head touches, it never rests — the moment you are pausing on your head, the neck is loaded and the set is over. Come down between reps rather than grinding a fourth one out of a fatigued shoulder.",
    cues: ["Ribs in", "Head touches, never rests", "Elbows past the ears"],
    trains: ["overhead pressing strength", "shoulder stability upside down", "trunk under load"],
    needs: ["space", "gym"],
    requires: [
      {
        family: "handstand",
        seconds: 60,
        why: "A minute upside down against the wall, still. Pressing from a position you cannot yet hold is how shoulders get hurt.",
      },
      {
        family: "core",
        seconds: 45,
        why: "The line has to hold itself. Without a 45-second plank the press turns into an arched back with the floor a foot away.",
      },
    ],
    masterAt: { ...MASTERY.advanced, reps: 5 },
  },

  // ── Dips ──────────────────────────────────────────────────
  {
    name: "Bench dip (bent legs)",
    family: "dip",
    tier: 0,
    metric: "reps",
    dose: "8–12",
    summary:
      "Sitting on the edge of a chair, hands beside your hips, sliding forward and lowering yourself. Feet flat and close means most of your weight stays on your legs.",
    setup: [
      "Hands on the chair edge beside your hips, fingers forward.",
      "Slide your hips off the front, feet flat and close in, knees bent.",
    ],
    execution: [
      "Bend the elbows straight back and lower your hips.",
      "Stop when the upper arms are parallel to the floor.",
      "Press back up until the arms straighten.",
    ],
    watch:
      "Shoulders down and back. If they roll forward toward your ears, straighten the legs less and bring the feet closer — a rolled shoulder under load is the single most common way this movement hurts people.",
    cues: ["Chest up", "Elbows straight back", "Shoulders down"],
    trains: ["triceps", "front shoulder", "lower chest"],
    masterAt: { ...MASTERY.intro, reps: 12 },
    aliases: ["Triceps dips on chair edge, feet forward"],
  },
  {
    name: "Bench dip",
    family: "dip",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary: "The same, with the legs straight out. More of your weight now hangs off the arms.",
    setup: ["Hands on the chair edge.", "Legs straight, heels on the floor."],
    execution: [
      "Lower until the upper arms reach parallel.",
      "Keep the back close to the chair the whole way.",
      "Press up to straight.",
    ],
    watch:
      "Stop at 90° at the elbow. Deeper is where shoulders get hurt, not where progress is — the bottom quarter of a dip has a very poor ratio of stimulus to risk.",
    cues: ["Back close to the chair", "Stop at parallel", "Chest tall"],
    trains: ["triceps", "front shoulder", "lower chest"],
    masterAt: { ...MASTERY.foundation, reps: 12 },
    aliases: ["Triceps dips on chair edge"],
  },
  {
    name: "Parallel bar dip",
    family: "dip",
    tier: 2,
    metric: "reps",
    dose: "8–12",
    summary:
      "A full parallel-bar dip, improvised between two chair backs. Your whole bodyweight is on your arms.",
    setup: [
      "Two stable chairs facing each other, a little wider than your shoulders.",
      "Check both will take your weight before you commit to them.",
      "Support yourself on straight arms, knees bent, ankles crossed.",
    ],
    execution: [
      "Lower until the upper arms are parallel to the floor.",
      "Lean the torso forward slightly — that is the strong position, not a mistake.",
      "Press back to a full lockout.",
    ],
    watch:
      "Check both chairs will not slide before you load them. Beyond that: shoulders stay packed down, and the bottom of the range is not a place to relax into.",
    cues: ["Test the setup", "Slight forward lean", "Stop at parallel"],
    trains: ["triceps", "lower chest", "shoulder strength at depth"],
    needs: ["gym", "rings", "parallettes", "space"],
    masterAt: { ...MASTERY.working, reps: 12 },
    aliases: ["Ring dips", "Dips between two chairs"],
  },
  {
    name: "Straight bar dip",
    family: "dip",
    tier: 3,
    metric: "reps",
    dose: "8–12",
    summary:
      "A dip on a single bar rather than two, so the bar has to pass in front of your body. The forward lean it forces is the same lean a muscle-up needs, which is why it sits here rather than as a curiosity.",
    setup: [
      "A waist-to-chest-height bar you can support yourself over — the low bar of a pull-up frame, or a set of outdoor bars.",
      "Jump to straight arms above the bar, hands just outside the hips.",
      "Lean the chest forward over the bar and hold that lean before the first rep.",
    ],
    execution: [
      "Lower by bending the elbows and letting the bar travel toward your lower chest.",
      "Stop when the bar touches or the upper arms reach parallel, whichever comes first.",
      "Press back up and finish with the chest leaning forward over the bar again.",
    ],
    watch:
      "The lean is the whole movement. Staying upright turns this into a shoulder impingement drill — if you cannot keep the chest over the bar, go back to parallel bars until you can.",
    cues: ["Chest over the bar", "Bar to the lower chest", "Lean, don't sit"],
    trains: ["triceps", "lower chest", "the muscle-up lockout"],
    needs: ["pullup_bar", "gym", "outdoor_bars", "rings"],
    masterAt: { ...MASTERY.advanced, reps: 10 },
  },

  // ── Pulling ───────────────────────────────────────────────
  {
    name: "Dead hang",
    family: "pull",
    tier: 0,
    metric: "time",
    dose: "3× to just short of letting go",
    summary:
      "Hanging from a bar with straight arms. The document prescribes three of these every Wednesday from the start — grip and shoulder stability underpin everything the pulling strand does later.",
    setup: [
      "Overhand grip, hands shoulder-width, thumbs wrapped.",
      "Step or jump up and let your body hang straight.",
    ],
    execution: [
      "Keep the shoulders active — pull them very slightly down away from your ears rather than hanging slack.",
      "Legs still, body quiet.",
      "Come down before the grip actually fails.",
    ],
    watch:
      "Shoulders active, not hanging off the joint. Drop before the grip fails, not when it does — a hand that opens on its own gives you no say in how you land.",
    cues: ["Shoulders away from ears", "Body quiet", "Come down early"],
    trains: ["grip", "shoulder stability", "lats", "hanging tolerance"],
    needs: BAR,
    masterAt: { ...MASTERY.intro, seconds: 30 },
    aliases: ["Ring hang"],
  },
  {
    name: "Scapular pull-up",
    family: "pull",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary:
      "Hanging from the bar and lifting yourself an inch or two using only the shoulder blades, arms staying straight. The smallest movement in the strand and the one that decides whether the pull-ups above it are done with the back or with the elbows.",
    setup: [
      "Overhand grip, shoulder-width, hanging with straight arms.",
      "Let the shoulders come all the way up to the ears first — that is the start, not slack form.",
    ],
    execution: [
      "Without bending the elbows, pull the shoulder blades down and together.",
      "Your whole body rises an inch or two. That is the full range; there is no more.",
      "Lower back to the passive hang under control and repeat.",
    ],
    watch:
      "The elbows stay locked. The moment they bend it becomes a tiny pull-up and stops teaching the one thing it is for — that a pull starts at the shoulder blade, not the arm.",
    cues: ["Arms stay straight", "Blades down and back", "Inch, not a rep"],
    trains: ["lower traps", "lats", "shoulder health", "the start of every pull"],
    needs: BAR,
    masterAt: { ...MASTERY.foundation, reps: 10 },
  },
  {
    name: "Negative pull-up",
    family: "pull",
    tier: 2,
    metric: "reps",
    dose: "5× 5 s",
    summary:
      "Getting your chin over the bar by jumping or stepping, then lowering as slowly as you can. The document calls this the headline progression of Phase 2 — the lowering half is where a first pull-up is built.",
    setup: [
      "Set something to step from so you can start with your chin over the bar.",
      "Overhand grip, shoulder-width.",
    ],
    execution: [
      "Start at the top, chin over the bar, chest close to it.",
      "Lower as slowly as you can — five seconds is the target.",
      "Step back up rather than dropping. Only the lowering counts.",
    ],
    watch:
      "Lower under control the whole way. A rep that is slow for three seconds and then a drop is the rep that hurts an elbow — if it becomes a drop, that set is finished.",
    cues: ["Five seconds", "Shoulders down", "Step back up"],
    trains: ["lats", "biceps", "the pull-up pattern", "elbow tolerance"],
    needs: BAR,
    masterAt: { ...MASTERY.foundation, reps: 5 },
    aliases: ["Negative pull-ups"],
  },
  {
    name: "Chin-up",
    family: "pull",
    tier: 3,
    metric: "reps",
    dose: "5× 3",
    summary:
      "A pull-up with the palms facing you. The biceps get to help, which makes it the first full rep most people own — and owning one rep of something is worth more than five negatives of something else.",
    setup: [
      "Underhand grip, hands about shoulder-width.",
      "Hang with straight arms and the shoulders active rather than slack.",
    ],
    execution: [
      "Pull the shoulder blades down first, then bend the arms.",
      "Chin clears the bar without the head craning forward to meet it.",
      "Lower all the way to straight arms before the next rep.",
    ],
    watch:
      "Elbows and wrists take more of this than they do a pull-up. If either starts to ache between sessions, drop the volume rather than pushing through — this is the rung where a year gets interrupted by tendinitis.",
    cues: ["Blades down first", "Chin over, head neutral", "Straight arms at the bottom"],
    trains: ["lats", "biceps", "grip", "the first full pull"],
    needs: BAR,
    masterAt: { ...MASTERY.working, reps: 5 },
  },
  {
    name: "Pull-up",
    family: "pull",
    tier: 4,
    metric: "reps",
    dose: "5× 3",
    summary:
      "The real thing, from a dead hang to chin over the bar. The month-12 target is twelve. From your first rep, the document asks for grease-the-groove: one or two in passing through the day, never to failure.",
    setup: ["Overhand grip, shoulder-width.", "Hang straight, shoulders active."],
    execution: [
      "Pull the shoulder blades down first, then bend the arms.",
      "Chin clears the bar, chest toward it.",
      "Lower all the way to straight arms.",
    ],
    watch:
      "No kipping. If the hips swing, the set is over — a swung rep does not train what a pull-up trains, and it loads the shoulder in the position it likes least.",
    cues: ["Blades down first", "Chest to the bar", "All the way down"],
    trains: ["lats", "biceps", "grip", "the V-shape the suit needs"],
    needs: BAR,
    masterAt: { ...MASTERY.working, reps: 5 },
    aliases: ["Pull-ups"],
  },
  {
    name: "Explosive pull-up",
    family: "pull",
    tier: 5,
    metric: "reps",
    dose: "5× 3",
    summary:
      "A pull-up pulled hard enough to bring your chest to the bar, or your hands briefly off it. Phase 3, and the road to a muscle-up.",
    setup: ["As a pull-up.", "Somewhere with clearance above the bar."],
    execution: [
      "Pull as hard and fast as you can.",
      "Aim for the chest touching the bar rather than the chin clearing it.",
      "Lower under control — always.",
    ],
    watch:
      "Explosive up, controlled down. Never explosive down: dropping into a dead hang at speed is the classic way to strain a biceps tendon.",
    cues: ["Pull hard", "Chest to the bar", "Slow on the way down"],
    trains: ["pulling power", "lats", "the muscle-up transition"],
    needs: BAR,
    masterAt: { ...MASTERY.demanding, reps: 5 },
    aliases: ["Explosive pull-ups"],
  },
  {
    name: "Muscle-up",
    family: "pull",
    tier: 6,
    metric: "reps",
    dose: "5× 3",
    summary:
      "Getting from hanging under a bar to holding yourself above it. The document's Phase 3 addition, described there as explosive pull-ups plus dips — which is exactly what it is, joined by a transition.",
    setup: ["A bar with room above it and nothing to hit if you come off."],
    execution: [
      "Pull explosively, aiming to bring the bar to your lower chest rather than your chin.",
      "At the top of the pull, lean the chest forward over the bar and roll the wrists over.",
      "Press out of the bottom of the dip position to finish above the bar.",
      "Work the pieces separately for months: high pulls, then the transition on a low bar with your feet down, then joined.",
    ],
    watch:
      "The transition is where shoulders get hurt, and it is the piece people skip because the pull and the dip feel ready. Do it slowly on a bar you can reach standing before you ever attempt it from a hang.",
    cues: ["Bar to the sternum", "Chest over the bar", "Practise the transition low"],
    trains: ["pulling power", "the transition", "pressing out of a deep dip"],
    needs: BAR,
    requires: [
      {
        family: "dip",
        tier: 3,
        reps: 8,
        why: "Eight straight bar dips first. The top half of a muscle-up is a dip out of the deepest position there is, with the bar in front of you — the part no amount of parallel-bar work prepares, and arriving there without it leaves you stuck on the bar with your shoulders taking the wait.",
      },
    ],
    masterAt: { ...MASTERY.elite, reps: 3 },
    aliases: ["Muscle-up progression"],
  },

  // ── Rowing ────────────────────────────────────────────────
  {
    name: "Incline inverted row",
    family: "row",
    tier: 0,
    metric: "reps",
    dose: "8–12",
    summary:
      "Lying under a table and pulling your chest to the edge. A horizontal pull-up, with the angle of your body setting the difficulty.",
    setup: [
      "Check the table takes your weight before you get under it.",
      "Lie underneath, grip the edge overhand, hands shoulder-width.",
      "Legs bent, feet flat — the more upright you are, the easier it is.",
    ],
    execution: [
      "Pull the shoulder blades together first, then bend the arms.",
      "Chest to the edge, body in one straight line.",
      "Lower until the arms are straight.",
    ],
    watch:
      "Check the table takes your weight before you get under it. Then: hips stay up. A sagging middle turns this into an arm exercise.",
    cues: ["Blades together", "Chest to the edge", "Straight from heel to head"],
    trains: ["upper back", "rear shoulder", "biceps", "posture"],
    needs: ["pullup_bar", "rings", "gym", "outdoor_bars", "bench", "space"],
    masterAt: { ...MASTERY.intro, reps: 12 },
    aliases: ["Inverted rows under a table"],
  },
  {
    name: "Inverted row",
    family: "row",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary: "The same pull with your feet further out and your body closer to horizontal. Harder by geometry alone.",
    setup: [
      "Bar or rings set around hip height.",
      "Hang underneath with straight legs, heels on the floor.",
    ],
    execution: [
      "Squeeze the shoulder blades, pull the chest to the bar.",
      "Hold for a moment at the top.",
      "Lower to straight arms.",
    ],
    watch:
      "Chest to the bar each rep. Shoulder blades pull first, arms second — reversing that order is what leaves people with strong biceps and a back that never changed.",
    cues: ["Blades first", "Chest to the bar", "Body rigid"],
    trains: ["upper back", "rear shoulder", "biceps", "scapular control"],
    needs: ["pullup_bar", "rings", "gym", "outdoor_bars", "bench"],
    masterAt: { ...MASTERY.foundation, reps: 12 },
    aliases: ["Ring rows", "Inverted rows"],
  },
  {
    name: "Feet-elevated inverted row",
    family: "row",
    tier: 2,
    metric: "reps",
    dose: "8–12",
    summary:
      "An inverted row with your heels up on a chair, so the body is level with the bar rather than angled under it. The last step before the row starts asking for one arm at a time.",
    setup: [
      "Bar or rings at roughly hip height, a chair or sofa the same height a body-length away.",
      "Heels on the chair, hands on the bar shoulder-width, hanging with straight arms.",
      "Squeeze the glutes so the hips do not sit below the line.",
    ],
    execution: [
      "Pull the shoulder blades together, then the chest to the bar.",
      "Hold for a beat at the top with the bar at the sternum.",
      "Lower to straight arms without letting the hips drop first.",
    ],
    watch:
      "Level means level. Once the feet are up there is nothing holding the hips except you, and a row done with a sagging middle trains the arms and the lower back rather than the back you came for.",
    cues: ["Glutes on", "Blades first", "Sternum to the bar"],
    trains: ["upper back", "rear shoulder", "biceps", "trunk under a horizontal pull"],
    needs: ["pullup_bar", "rings", "gym", "outdoor_bars", "bench"],
    masterAt: { ...MASTERY.working, reps: 12 },
  },
  {
    name: "Archer inverted row",
    family: "row",
    tier: 3,
    metric: "reps",
    dose: "8–10 per side",
    summary: "An inverted row pulling to one side, the other arm straightening out. Most of the load on one arm.",
    setup: ["As an inverted row, hands wide."],
    execution: [
      "Pull your chest toward one hand.",
      "The far arm straightens along the bar and stays passive.",
      "Alternate sides.",
    ],
    watch:
      "Keep the hips square. Rotating turns it into something else — and something with a lot less back in it.",
    cues: ["Pull to one hand", "Hips square", "Far arm passive"],
    trains: ["one-arm pulling", "upper back", "anti-rotation"],
    needs: ["pullup_bar", "rings", "gym", "outdoor_bars"],
    perSide: true,
    masterAt: { ...MASTERY.demanding, reps: 10 },
    aliases: ["Archer rows"],
  },
  {
    name: "One-arm inverted row",
    family: "row",
    tier: 4,
    metric: "reps",
    dose: "3× 5 per side",
    summary:
      "The whole row on one arm, the other hand off the bar entirely. The top of the horizontal pull, and the single best counterweight to a year of pressing.",
    setup: [
      "Bar at hip height or a little above — higher is easier, and this is a rung to start easy on.",
      "One hand on the bar over the centre of your chest, feet walked out until you are leaning back.",
      "Free arm across the chest or reaching down the side, not helping.",
    ],
    execution: [
      "Pull the shoulder blade down and back first, then bend the arm.",
      "Bring the bar toward the armpit rather than the middle of the chest.",
      "Lower all the way to a straight arm before the next rep.",
    ],
    watch:
      "The body wants to rotate open toward the free arm. Squeeze the glutes and keep the hips square — a rotated rep loads the shoulder in a position it cannot defend, and the reps are worth nothing anyway.",
    cues: ["Hips square", "Blade down first", "Bar to the armpit"],
    trains: ["one-arm pulling strength", "upper back", "anti-rotation core"],
    needs: ["pullup_bar", "rings", "gym", "outdoor_bars"],
    perSide: true,
    masterAt: { ...MASTERY.advanced, reps: 5 },
  },

  // ── Bracing ───────────────────────────────────────────────
  {
    name: "Dead bug",
    family: "core",
    tier: 0,
    metric: "reps",
    dose: "10 per side",
    summary:
      "On your back, opposite arm and leg extending while the lower back stays flat. Teaches the brace the whole plan is built on.",
    setup: [
      "On your back, knees over hips, shins parallel to the floor, arms straight up.",
      "Press the lower back into the floor and keep it there.",
    ],
    execution: [
      "Lower one arm behind your head and the opposite leg toward the floor.",
      "Go only as far as you can without the back lifting.",
      "Return and alternate.",
    ],
    watch:
      "The moment the lower back lifts off the floor, you have gone too far. Shorten the range rather than pushing through it — the range is not the exercise, the flat back is.",
    cues: ["Back flat", "Slow", "Breathe out on the way down"],
    trains: ["deep core", "anti-extension", "coordination"],
    perSide: true,
    masterAt: { ...MASTERY.intro, reps: 10 },
  },
  {
    name: "Plank",
    family: "core",
    tier: 1,
    metric: "time",
    dose: "30–45 s",
    summary:
      "Holding a straight line on your forearms. The month-12 target is three minutes, and it gates several movements above it.",
    setup: [
      "Forearms on the floor, elbows under the shoulders.",
      "Legs straight, feet hip-width.",
      "Squeeze the glutes and tuck the ribs down before the clock starts.",
    ],
    execution: [
      "Hold one straight line from heel to head.",
      "Breathe — a plank you cannot breathe in is being held with the wrong muscles.",
    ],
    watch:
      "It ends when the hips drop, not when it starts hurting. Time spent in a sagging plank counts for nothing and teaches the spine to take load it should not.",
    cues: ["Glutes tight", "Ribs down", "Keep breathing"],
    trains: ["anti-extension core", "shoulder stability", "glutes"],
    masterAt: { ...MASTERY.foundation, seconds: 45 },
  },
  {
    name: "Hollow hold",
    family: "core",
    tier: 2,
    metric: "time",
    dose: "3× 20 s",
    summary:
      "On your back, arms and legs off the floor, lower back pressed flat. The shape that every gymnastic movement borrows.",
    setup: [
      "On your back, press the lower back into the floor.",
      "Lift the shoulder blades and the legs a few inches.",
      "Arms overhead if you can hold the position; by your sides if you cannot yet.",
    ],
    execution: [
      "Hold, with the lower back glued down.",
      "Lower the legs to make it harder, raise them to make it easier.",
    ],
    watch:
      "Lower back stays flat on the floor. It ends when the gap opens — everything after that is being held by the hip flexors and paid for by the spine.",
    cues: ["Back glued down", "Long, not curled", "Legs lower = harder"],
    trains: ["anti-extension core", "the hollow shape", "hip flexors"],
    masterAt: { ...MASTERY.foundation, seconds: 30 },
  },
  {
    name: "Hollow body rock",
    family: "core",
    tier: 3,
    metric: "reps",
    dose: "3× 15",
    summary:
      "The hollow hold, rocking gently back and forth like a rocking chair. The shape has to survive being moved, which is the whole point — every skill above this one moves through it rather than sitting in it.",
    setup: [
      "Take a hollow hold: on your back, lower back pressed flat, shoulder blades and legs a few inches off the floor.",
      "Arms overhead if you can hold the shape there; by your sides if not.",
      "Get the shape right and still before you add any movement.",
    ],
    execution: [
      "Rock from the upper back toward the hips and back again, driving from the shoulders.",
      "The body stays one rigid banana — nothing bends and nothing changes shape.",
      "Small rocks first. Bigger comes from a better shape, not from more effort.",
    ],
    watch:
      "The instant the shape breaks the rep is over, and the shape breaks silently — the lower back lifts, the legs drop, and it becomes a sit-up on your back. If you cannot see the same silhouette at both ends of the rock, go back to holding still.",
    cues: ["One rigid banana", "Rock from the shoulders", "Same shape at both ends"],
    trains: ["the hollow shape under movement", "anti-extension core", "kip-up preparation"],
    masterAt: { ...MASTERY.working, reps: 15 },
  },
  {
    name: "Tuck L-sit",
    family: "core",
    tier: 4,
    metric: "time",
    dose: "3× 10 s",
    summary: "Supporting yourself on your hands with the knees tucked to the chest and the feet off the floor.",
    setup: [
      "Hands on the floor beside your hips, or on parallettes for clearance.",
      "Sit with the knees bent.",
    ],
    execution: [
      "Press down through the hands, lock the elbows, lift the hips.",
      "Tuck the knees toward the chest and lift the feet clear.",
    ],
    watch:
      "Shoulders push down away from the ears. Shrugging into the position is what makes it feel impossible and puts the load somewhere it doesn't belong.",
    cues: ["Press the floor down", "Shoulders down", "Knees to chest"],
    trains: ["compression strength", "hip flexors", "straight-arm scapular strength"],
    needs: ["parallettes", "rings", "gym", "space"],
    masterAt: { ...MASTERY.working, seconds: 15 },
    aliases: ["L-sit tuck"],
  },
  {
    name: "Hanging knee raise",
    family: "core",
    tier: 5,
    metric: "reps",
    dose: "3× 10",
    summary: "Hanging from the bar and lifting the knees. Phase 4's daily core block.",
    setup: ["Hang from the bar, shoulders active."],
    execution: [
      "Lift the knees toward the chest by curling the pelvis, not just bending the hips.",
      "Lower under control without swinging.",
    ],
    watch:
      "If you start swinging, stop. Momentum takes over completely on this one and the reps stop being reps.",
    cues: ["Curl the pelvis", "No swing", "Slow down"],
    trains: ["lower abs", "hip flexors", "grip"],
    needs: BAR,
    requires: [
      {
        family: "pull",
        seconds: 30,
        why: "Thirty seconds of dead hang, or the grip fails before the abs do.",
      },
    ],
    masterAt: { ...MASTERY.demanding, reps: 10 },
    aliases: ["Hanging knee raises"],
  },
  {
    name: "L-sit",
    family: "core",
    tier: 6,
    metric: "time",
    dose: "3× max hold",
    summary:
      "The tuck held with the legs straight out in front, hips off the floor. Checkpoint 3 asks for 10 seconds free. Phase 3.",
    setup: [
      "Sit between parallettes, on rings, or on two low chairs, hands beside your hips.",
      "Straight arms, shoulders pushed down away from your ears.",
    ],
    execution: [
      "Press down hard and lift your hips clear.",
      "Extend both legs straight out in front, feet together, toes pointed.",
      "Hold. Come down before the legs start to sag rather than after.",
    ],
    watch:
      "Straight legs and a flat back, or it is a tuck with the knees half open. Extending the legs before the shoulders can hold the position pulls you into a slump where the whole load sits on the wrists — go back to the tuck and add a few seconds there instead.",
    cues: ["Press the floor down", "Legs locked", "Shoulders down"],
    trains: ["compression strength", "hip flexors", "straight-arm scapular strength"],
    needs: ["parallettes", "rings", "gym", "space"],
    masterAt: { ...MASTERY.advanced, seconds: 10 },
  },
  {
    name: "Dragon flag negative",
    family: "core",
    tier: 7,
    metric: "reps",
    dose: "3× 5",
    summary:
      "Lying on a bench holding behind your head, body straight from shoulders to feet, lowering slowly. Phase 4.",
    setup: [
      "Lie on a bench or the floor, grip something solid behind your head.",
      "Bring the legs up so the body is nearly vertical, resting on the upper back.",
    ],
    execution: [
      "Lower the whole body as one rigid piece.",
      "Stop before the lower back leaves the surface.",
      "Reset from the top rather than pressing back up.",
    ],
    watch:
      "The whole body moves as one piece. The instant it bends at the hips the load transfers to the lower back, which is exactly what this movement is famous for doing to people who rush it.",
    cues: ["One rigid piece", "Stop before the back lifts", "Slow"],
    trains: ["anti-extension core at long lever", "lats"],
    masterAt: { ...MASTERY.elite, reps: 5 },
    aliases: ["Dragon flag negatives"],
  },

  // ── Squatting ─────────────────────────────────────────────
  {
    name: "Box squat",
    family: "squat",
    tier: 0,
    metric: "reps",
    dose: "12–15",
    summary:
      "A squat down to a chair or box and straight back up. The box removes the question of how deep to go and gives you somewhere to fail safely, which is the whole reason the strand starts here rather than at a free squat.",
    setup: [
      "A chair, sofa or box behind you — the higher it is, the easier the rep.",
      "Feet shoulder-width, toes turned slightly out, arms out in front as a counterweight.",
      "Stand far enough forward that sitting back reaches the seat without stepping.",
    ],
    execution: [
      "Push the hips back and sit down until you touch the seat.",
      "Touch, do not drop and rest — the point is to control the last inch.",
      "Drive up through the whole foot without rocking forward onto the toes.",
    ],
    watch:
      "Touch and stand, not sit and heave. Landing on the box and bouncing off it skips exactly the part that builds the squat, and the bounce loads the lower back at the worst possible moment.",
    cues: ["Hips back first", "Touch, don't sit", "Whole foot"],
    trains: ["quads", "glutes", "the squat pattern", "confidence at depth"],
    masterAt: { ...MASTERY.intro, reps: 15 },
  },
  {
    name: "Bodyweight squat",
    family: "squat",
    tier: 1,
    metric: "reps",
    dose: "15",
    summary: "The squat with nothing added. Where the leg strand starts.",
    setup: ["Feet shoulder-width, toes slightly out."],
    execution: [
      "Sit back and down, knees tracking over the toes.",
      "Go as deep as you can keep the heels down and the back long.",
      "Drive up through the whole foot.",
    ],
    watch:
      "Heels stay down. If they lift, you are being pulled forward by tight ankles — put a book under them and work the range instead of forcing it.",
    cues: ["Sit back", "Knees over toes", "Whole foot"],
    trains: ["quads", "glutes", "the squat pattern", "ankle range"],
    masterAt: { ...MASTERY.foundation, reps: 20 },
    aliases: ["Bodyweight squat, slow tempo", "Bodyweight squats"],
  },
  {
    name: "Goblet squat",
    family: "squat",
    tier: 2,
    metric: "reps",
    dose: "12–15",
    summary:
      "A squat holding weight at the chest. The load in front acts as a counterweight and usually makes the position better, not worse.",
    setup: [
      "Hold a dumbbell or kettlebell vertically against the chest, elbows tucked.",
      "Feet shoulder-width.",
    ],
    execution: [
      "Squat down between the knees, elbows brushing inside them at the bottom.",
      "Chest stays tall.",
      "Drive up without letting the weight pull you forward.",
    ],
    watch:
      "Chest tall and elbows in. Letting the weight drift away from the body turns a leg exercise into a lower-back one. Log the total you are holding — both dumbbells, not one of them.",
    cues: ["Weight at the chest", "Elbows inside the knees", "Chest tall"],
    trains: ["quads", "glutes", "upper back posture", "squat depth"],
    needs: LOAD,
    loaded: true,
    // 16 kg is EXTRAPOLATED, and it is the plan's own starting pair: the
    // equipment list assumes "a pair around 8 kg", the document says both
    // dumbbells at the chest, and both of them is 16. Fifteen reps with a 2 kg
    // weight is fifteen reps of something else, and it used to open the whole
    // single-leg road to a pistol squat.
    masterAt: { ...MASTERY.working, reps: 15, kg: 16 },
  },
  {
    name: "Split squat",
    family: "squat",
    tier: 3,
    metric: "reps",
    dose: "10 per side",
    summary: "A stationary lunge. One leg at a time, both feet on the floor.",
    setup: ["Long stride, back heel up, torso upright."],
    execution: [
      "Lower straight down until the back knee is just off the floor.",
      "Drive up through the front heel.",
    ],
    watch:
      "Straight down, not forward. Drifting forward puts the knee out over the toes under load and takes the glute out of it.",
    cues: ["Straight down", "Front heel drives", "Torso tall"],
    trains: ["quads", "glutes", "single-leg balance"],
    perSide: true,
    masterAt: { ...MASTERY.working, reps: 12 },
  },
  {
    name: "Bulgarian split squat",
    family: "squat",
    tier: 4,
    metric: "reps",
    dose: "10 per side",
    summary: "A split squat with the back foot elevated. Much harder than it sounds, and a Phase 2 staple.",
    setup: [
      "Back foot on a chair or sofa, laces down.",
      "Front foot far enough forward that the knee stays behind the toes at the bottom.",
    ],
    execution: [
      "Lower until the front thigh is parallel.",
      "Drive up through the front heel.",
    ],
    watch:
      "Find the foot position before you add reps. Too close and the knee takes everything; too far and it becomes a hamstring stretch.",
    cues: ["Back foot light", "Front heel drives", "Chest tall"],
    trains: ["quads", "glutes", "hip stability", "single-leg strength"],
    needs: ["bench", "gym"],
    perSide: true,
    masterAt: { ...MASTERY.demanding, reps: 12 },
    aliases: ["Bulgarian split squats"],
  },
  {
    name: "Assisted pistol squat",
    family: "squat",
    tier: 5,
    metric: "reps",
    dose: "5 per side",
    summary: "A one-legged squat sitting back to a chair. Phase 3.",
    setup: ["Stand in front of a chair on one leg, other leg out in front."],
    execution: [
      "Sit back under control until you touch the chair.",
      "Stand back up without pushing off with the free leg.",
    ],
    watch:
      "Touch, don't sit. Landing on the chair means the lowering half — the half that builds this — was skipped.",
    cues: ["Touch and go", "Free leg long", "Slow down"],
    trains: ["single-leg strength", "balance", "ankle range"],
    needs: ["bench", "gym", "space"],
    perSide: true,
    masterAt: { ...MASTERY.advanced, reps: 5 },
    aliases: ["Pistol squat progression"],
  },
  {
    name: "Pistol squat",
    family: "squat",
    tier: 6,
    metric: "reps",
    dose: "3× 5 per side",
    summary:
      "A full squat on one leg, the other held straight out in front, from standing to the bottom and back up with nothing to touch. The top of the leg strand and one of the year's real milestones.",
    setup: [
      "Stand on one leg with the other extended forward, arms out in front as a counterweight.",
      "A wall or doorframe within reach for the first weeks — a fingertip on it is still a pistol.",
      "Shoes off, or flat shoes. A raised heel hides the ankle range this needs.",
    ],
    execution: [
      "Sit back and down slowly, letting the free leg travel forward as you descend.",
      "Bottom out with the hamstring on the calf, free heel still clear of the floor.",
      "Stand up through the whole foot without the free leg touching down.",
    ],
    watch:
      "The knee wants to collapse inward on the way up, and that is the one thing this movement must never be allowed to teach. If it caves on the last rep, that rep was one too many — this is a strength movement pretending to be a party trick.",
    cues: ["Knee tracks over the toes", "Free leg long", "Slow all the way down"],
    trains: ["single-leg strength", "ankle range", "balance", "knee control"],
    needs: ["space", "gym"],
    requires: [
      {
        family: "hold",
        tier: 1,
        seconds: 60,
        why: "A minute resting in the bottom of a two-legged squat. Without that ankle range the pistol is done on a rolled-in foot, which is where the knee pays.",
      },
    ],
    perSide: true,
    masterAt: { ...MASTERY.elite, reps: 5 },
  },

  // ── Hinging ───────────────────────────────────────────────
  {
    name: "Glute bridge",
    family: "hinge",
    tier: 0,
    metric: "reps",
    dose: "15",
    summary: "On your back, driving the hips up. Where the hinge strand starts.",
    setup: ["On your back, knees bent, feet flat and close to the hips."],
    execution: [
      "Drive through the heels and lift the hips until the body is straight from knee to shoulder.",
      "Squeeze at the top, lower under control.",
    ],
    watch:
      "The glutes do the lifting, not the lower back. If you feel it in your back, tuck the ribs down and stop the hips lower.",
    cues: ["Drive the heels", "Squeeze at the top", "Ribs down"],
    trains: ["glutes", "hamstrings", "hip extension"],
    masterAt: { ...MASTERY.intro, reps: 20 },
    aliases: ["Glute bridges"],
  },
  {
    name: "Single-leg glute bridge",
    family: "hinge",
    tier: 1,
    metric: "reps",
    dose: "12 per side",
    summary:
      "A glute bridge driven by one leg, the other held up off the floor. Doubles the load on the working side and immediately shows you which hip has been doing less of the work all along.",
    setup: [
      "On your back, one knee bent with the foot flat and close to the hip.",
      "Lift the other knee toward your chest and hold it there, or keep that leg straight along the line of the thigh.",
      "Press the lower back flat and tuck the ribs down before the first rep.",
    ],
    execution: [
      "Drive through the heel of the planted foot and lift the hips until the body is straight from knee to shoulder.",
      "Keep both hip bones level with each other the whole way.",
      "Lower under control rather than dropping.",
    ],
    watch:
      "The hip on the free-leg side drops. Watch for it, because it is what turns this into a lower-back exercise, and it is nearly impossible to feel — if you cannot keep the hips level, do fewer reps or go back to two legs.",
    cues: ["Hips level", "Drive the heel", "Ribs down"],
    trains: ["glutes", "hamstrings", "hip stability", "left-to-right balance"],
    perSide: true,
    masterAt: { ...MASTERY.foundation, reps: 12 },
  },
  {
    name: "Romanian deadlift",
    family: "hinge",
    tier: 2,
    metric: "reps",
    dose: "12",
    summary:
      "Standing, hinging at the hips with a long back and almost straight legs. The pattern that protects your back everywhere else.",
    setup: ["Dumbbells in front of the thighs, feet hip-width, knees softly bent."],
    execution: [
      "Push the hips back and let the weights slide down the front of the legs.",
      "Stop when you feel a strong stretch in the hamstrings or the back starts to round — whichever comes first.",
      "Drive the hips forward to stand.",
    ],
    watch:
      "Stop the moment the lower back rounds. That is the number, whatever it is — this is the movement where ego costs the most. Log the total in both hands.",
    cues: ["Hips back, not down", "Long back", "Weights close to the legs"],
    trains: ["hamstrings", "glutes", "spinal position under load"],
    needs: LOAD,
    loaded: true,
    // 16 kg, EXTRAPOLATED, the same starting pair. Deliberately not heavier:
    // the rung above this is the single-leg version, which is a balance problem
    // rather than a load problem, so a bar that demanded a real deadlift number
    // would gate the wrong thing.
    masterAt: { ...MASTERY.working, reps: 12, kg: 16 },
  },
  {
    name: "Single-leg Romanian deadlift",
    family: "hinge",
    tier: 3,
    metric: "reps",
    dose: "10 per side",
    summary: "The same hinge on one leg, the other extending behind you as a counterweight.",
    setup: ["Stand on one leg, soft knee."],
    execution: [
      "Hinge forward, back leg rising behind you in line with the torso.",
      "Hips stay square to the floor.",
      "Return to standing.",
    ],
    watch:
      "Hips square. The lifted hip wants to open toward the ceiling, and once it does you are training rotation instead of the hinge.",
    cues: ["Back leg in line", "Hips level", "Slow"],
    trains: ["hamstrings", "glutes", "balance", "anti-rotation"],
    perSide: true,
    masterAt: { ...MASTERY.demanding, reps: 10 },
  },
  {
    name: "Nordic curl negative",
    family: "hinge",
    tier: 4,
    metric: "reps",
    dose: "3× 5",
    summary:
      "Kneeling with the feet anchored, lowering the whole body forward under hamstring control. Phase 2, and brutally hard.",
    setup: [
      "Kneel on something soft, feet hooked under a sofa or held down.",
      "Hands ready in front of you to catch.",
    ],
    execution: [
      "Keeping the body straight from knee to head, lower forward as slowly as you can.",
      "Catch yourself with the hands and push back up.",
    ],
    watch:
      "Do not bend at the hips to make it easier — that removes exactly the part that works. Expect to only control the first few degrees at first; that is the exercise.",
    cues: ["Straight from knee to head", "Catch with the hands", "Slow as possible"],
    trains: ["hamstrings eccentrically", "knee resilience"],
    needs: ["bench", "mat", "gym"],
    masterAt: { ...MASTERY.advanced, reps: 5 },
    aliases: ["Nordic curl negatives"],
  },

  // ── Holds ─────────────────────────────────────────────────
  {
    name: "Wall sit",
    family: "hold",
    tier: 0,
    metric: "time",
    dose: "30–45 s",
    summary: "Sitting against a wall with nothing under you. Simple, and unpleasant on purpose.",
    setup: ["Back flat against a wall, slide down until the thighs are parallel."],
    execution: ["Hold. Knees over the ankles, weight in the heels."],
    watch: "Thighs parallel. It ends when they aren't — creeping upward is how a wall sit becomes standing.",
    cues: ["Thighs parallel", "Back flat", "Breathe"],
    trains: ["quads", "isometric endurance"],
    masterAt: { ...MASTERY.intro, seconds: 60 },
  },
  {
    name: "Deep squat hold",
    family: "hold",
    tier: 1,
    metric: "time",
    dose: "3× 45 s",
    summary:
      "Resting in the bottom of a squat. A position, not an exercise — the month-6 target is two minutes.",
    setup: ["Feet shoulder-width, squat all the way down.", "Book under the heels if they lift."],
    execution: [
      "Sit in the bottom, elbows inside the knees, gently pushing them out.",
      "Relax into it and breathe.",
    ],
    watch:
      "Heels stay on the floor. The clock stops the moment one lifts — an elevated heel makes it a different, much easier position.",
    cues: ["Heels down", "Elbows push the knees out", "Relax"],
    trains: ["ankle range", "hip range", "the resting squat"],
    masterAt: { ...MASTERY.foundation, seconds: 60 },
  },
  {
    name: "Single-leg wall sit",
    family: "hold",
    tier: 2,
    metric: "time",
    dose: "3× 30 s per side",
    summary:
      "A wall sit held on one leg, the other lifted clear. Roughly twice the load on the working quad, and the isometric that makes the single-leg squatting above it possible.",
    setup: [
      "Slide down the wall into a normal wall sit, thighs parallel, back flat.",
      "Shift your weight onto one foot and slide it slightly toward the middle.",
      "Lift the other foot off the floor and hold that leg straight out in front.",
    ],
    execution: [
      "Hold with the working thigh parallel to the floor and the knee stacked over the ankle.",
      "Weight through the heel, not the ball of the foot.",
      "Put the foot down and switch rather than letting the position creep upward.",
    ],
    watch:
      "The knee drifts inward as the quad tires, and that is the position this is meant to train out of you, not into you. The moment the knee starts tracking inside the foot, put the other leg down — the clock has stopped whether or not you are still up there.",
    cues: ["Knee over the ankle", "Thigh parallel", "Heel takes it"],
    trains: ["quads", "single-leg isometric strength", "knee tracking"],
    perSide: true,
    masterAt: { ...MASTERY.working, seconds: 30 },
  },
  {
    name: "Chin-over-bar hold",
    family: "hold",
    tier: 3,
    metric: "time",
    dose: "3× 20 s",
    summary:
      "Hanging at the top of a pull-up and staying there. The strongest position of the pull, held still — which is the cheapest way to build the top half of a rep you cannot yet finish.",
    setup: [
      "Overhand grip, shoulder-width. Step or jump so your chin starts above the bar.",
      "Pull the shoulder blades down and the chest toward the bar before the clock starts.",
    ],
    execution: [
      "Hold with the chin clear of the bar and the chest close to it.",
      "Elbows stay in rather than winging out to the sides as it gets hard.",
      "Lower under control when the position starts to sink — do not hang on until you drop.",
    ],
    watch:
      "The chin sliding down to rest on the bar is the end of the set, not a way to extend it. And come down under control: dropping from the top of a pull-up onto straight arms is the classic way to strain a biceps tendon.",
    cues: ["Chest to the bar", "Elbows in", "Lower, don't drop"],
    trains: ["the top of the pull-up", "grip", "biceps and lats isometrically"],
    needs: BAR,
    requires: [
      {
        family: "pull",
        tier: 2,
        why: "Negative pull-ups first. Holding the top means being able to get to the top and come down from it under control.",
      },
    ],
    masterAt: { ...MASTERY.demanding, seconds: 20 },
  },
  {
    name: "Support hold on parallel bars",
    family: "hold",
    tier: 4,
    metric: "time",
    dose: "3× 30 s",
    summary:
      "Holding yourself above two bars on straight, locked arms. The top of a dip, standing still — and the position everything at the top of the pressing strands finishes in.",
    setup: [
      "Parallel bars, rings or two solid chair backs a little wider than your shoulders.",
      "Press up to straight arms with the shoulders pushed down away from the ears.",
      "Legs together and slightly forward, glutes and ribs tight so the body is a line rather than a hang.",
    ],
    execution: [
      "Hold with the elbows locked and the shoulders actively depressed.",
      "Look forward, not down.",
      "Come off before the shoulders start to rise toward the ears.",
    ],
    watch:
      "Shrugged shoulders are the whole failure mode. Sinking into the joint rather than holding yourself out of it is what makes this position hurt people, and it happens quietly the moment the set gets long.",
    cues: ["Push the bars down", "Shoulders away from the ears", "One line"],
    trains: ["straight-arm shoulder strength", "scapular depression", "the top of a dip"],
    needs: ["parallettes", "rings", "gym", "space"],
    masterAt: { ...MASTERY.advanced, seconds: 30 },
  },

  // ── Inverting ─────────────────────────────────────────────
  {
    name: "Wall handstand",
    family: "handstand",
    tier: 0,
    metric: "time",
    dose: "3× 20–30 s",
    summary:
      "Belly to the wall, walking the feet up. From Phase 2 the document asks for five minutes of handstand work a day, rest days included — a habit, not a training block.",
    setup: [
      "Hands on the floor a forearm's length from the wall, facing away from it.",
      "Feet on the wall, walk them up as you walk the hands in.",
    ],
    execution: [
      "Come as close to vertical as is comfortable.",
      "Push the floor away, ribs down, look between your hands.",
      "Walk down before the shoulders give out.",
    ],
    watch:
      "Come down before you have to. Walking out of a handstand is a skill; falling out of one is how wrists get hurt.",
    cues: ["Push the floor away", "Ribs down", "Come down early"],
    trains: ["shoulder endurance overhead", "being inverted", "wrist tolerance"],
    needs: ["space", "gym"],
    masterAt: { ...MASTERY.intro, seconds: 30 },
  },
  {
    // The middle step of the document's handstand protocol — "Wall Handstand →
    // Kickup zur Wand mit Rücken zur Wand → kurzes Ablösen von der Wand" — which
    // the catalogue had skipped straight over.
    name: "Kick-up to the wall",
    family: "handstand",
    tier: 1,
    metric: "time",
    dose: "5× 20 s",
    summary:
      "Kicking up into a handstand with your back to the wall instead of walking up it belly-first. The wall stops becoming a support and starts being a safety net.",
    setup: [
      "Stand about half a metre from a wall, facing away from it.",
      "Hands down on the floor, shoulder-width, fingers spread.",
    ],
    execution: [
      "Kick one leg up and let the other follow, so the heels come to rest against the wall.",
      "Push the floor away, ribs down, so the body stacks over the hands rather than arching.",
      "Come down one leg at a time, under control.",
    ],
    watch:
      "Kick just hard enough to arrive, not hard enough to slam the wall. Learning to kick with the right force is the whole point of this rung — an over-kick with no wall there is a fall onto your back, and that is what the next rung is.",
    cues: ["Kick to arrive, not to bang", "Ribs down", "Down one leg at a time"],
    trains: ["finding the balance point", "kicking with control", "shoulder stacking"],
    needs: ["space", "gym"],
    masterAt: { ...MASTERY.foundation, seconds: 30 },
  },
  {
    name: "Handstand shoulder taps",
    family: "handstand",
    tier: 2,
    metric: "reps",
    dose: "3× 10",
    summary:
      "In a handstand against the wall, taking one hand off to tap the opposite shoulder, then the other. Being upside down on one arm for a moment at a time — which is what balancing freestanding actually is.",
    setup: [
      "Kick or walk up to the wall, hands shoulder-width, a hand's length from the skirting board.",
      "Squeeze the ribs and glutes so the body is a line, not an arch.",
      "Get still first. A shape that is already wobbling has nothing to give.",
    ],
    execution: [
      "Shift your weight fully onto one hand, then lift the other and touch the opposite shoulder.",
      "Put it back down where it started and shift to the other side.",
      "One tap each side is two reps. Slow beats many.",
    ],
    watch:
      "This is where the wrists get their first real complaint. Warm them up, spread the fingers and grip the floor, and stop the set at the first ache rather than the first failure — a wrist that hurts in month three costs you every strand that goes through the hands.",
    cues: ["Get still first", "Grip the floor", "Ribs in"],
    trains: ["one-arm loading upside down", "balance", "wrist tolerance"],
    needs: ["space", "gym"],
    requires: [
      {
        family: "core",
        seconds: 45,
        why: "A 45-second plank. The line has to hold itself before you start taking hands away from it.",
      },
    ],
    masterAt: { ...MASTERY.working, reps: 10 },
  },
  {
    name: "Freestanding handstand",
    family: "handstand",
    tier: 3,
    metric: "time",
    dose: "5× max hold",
    summary: "Kicking up away from the wall and holding what you can. Phase 2 onward, five minutes a day.",
    setup: ["Clear space, something soft, nothing breakable within reach."],
    execution: [
      "Kick up to a balance point, one leg leading.",
      "Correct with the fingers, not the whole body.",
      "Bail by turning out to the side.",
    ],
    watch:
      "Learn the bail-out before the kick-up. Turning out sideways has to be automatic before you spend real time upside down.",
    cues: ["Fingertips steer", "Bail sideways", "Little and often"],
    trains: ["balance", "shoulder stability", "the handstand"],
    needs: ["space", "gym"],
    masterAt: { ...MASTERY.demanding, seconds: 10 },
    aliases: ["Freestanding handstand attempts"],
  },
  {
    name: "Handstand walk",
    family: "handstand",
    tier: 4,
    metric: "reps",
    dose: "3× 5 steps",
    summary:
      "Travelling on your hands. The top of the inverting strand, and the point at which being upside down has stopped being a position and become somewhere you can go.",
    setup: [
      "Open floor, nothing to hit, ideally something soft to bail onto.",
      "Kick up freestanding and find the balance before trying to move.",
      "Wrists thoroughly warm — this asks more of them than anything else in the plan.",
    ],
    execution: [
      "Fall very slightly forward from the shoulders and let a hand step out to catch it.",
      "Small steps, fingers gripping the floor on every placement.",
      "Count a step as a rep, and stop the set while the shape is still good.",
    ],
    watch:
      "Walking out of a handstand you never balanced is just a slow fall with extra steps. Hold ten still seconds freestanding first, and keep the bail-out — turn out sideways — automatic, because you will need it more here than anywhere.",
    cues: ["Lean, then step", "Grip the floor", "Small steps"],
    trains: ["balance in motion", "shoulder stability", "wrist strength"],
    needs: ["space", "gym"],
    masterAt: { ...MASTERY.advanced, reps: 5 },
  },

  // ── Crawling ──────────────────────────────────────────────
  {
    name: "Bear crawl hold",
    family: "crawl",
    tier: 0,
    metric: "time",
    dose: "3× 30 s",
    summary:
      "The bear crawl position held still, knees hovering a hand's width off the floor. Everything that makes crawling hard is already here; taking the travelling away just means you can find out whether the shape is right before you start moving it.",
    setup: [
      "Hands under the shoulders, knees under the hips, toes tucked.",
      "Flatten the lower back — think of pushing the floor away and tucking the ribs down.",
      "Lift the knees a hand's width and no more.",
    ],
    execution: [
      "Hold, with the hips level and no higher than the shoulders.",
      "Breathe. A position you are holding by holding your breath is a position you are bracing wrong.",
      "Put the knees down before the hips start to rise.",
    ],
    watch:
      "The hips climb as the shoulders tire, and once they are above the shoulders the shape has quietly become a downward dog with the knees bent. Level, low and boring is the whole exercise.",
    cues: ["Knees a hand's width up", "Flat back", "Keep breathing"],
    trains: ["shoulders", "deep core", "the crawling shape"],
    masterAt: { ...MASTERY.intro, seconds: 30 },
  },
  {
    name: "Bear crawl",
    family: "crawl",
    tier: 1,
    metric: "time",
    dose: "3× 30 s",
    summary: "Crawling on hands and feet with the knees just off the floor. Deceptively hard.",
    setup: ["Hands under shoulders, knees under hips, toes down.", "Lift the knees a hand's width."],
    execution: [
      "Move opposite hand and foot together.",
      "Keep the hips low and level — a bear crawl that rocks side to side has become a walk.",
      "Forwards and backwards.",
    ],
    watch: "Knees a hand's width off the floor the whole time. That is what makes it hard; letting them drift up is opting out.",
    cues: ["Knees low", "Opposite hand and foot", "Hips level"],
    trains: ["shoulders", "core", "contralateral coordination"],
    masterAt: { ...MASTERY.foundation, seconds: 45 },
  },
  {
    name: "Crab walk",
    family: "crawl",
    tier: 2,
    metric: "time",
    dose: "3× 30 s",
    summary:
      "Crawling backwards face-up, on your hands and feet with the hips held off the floor. The mirror image of a bear crawl, and the one that opens the front of the shoulders and the hips instead of closing them.",
    setup: [
      "Sit down, hands on the floor behind you with the fingers pointing toward your feet.",
      "Feet flat, knees bent to roughly a right angle.",
      "Press the hips up until the body is level from knee to shoulder.",
    ],
    execution: [
      "Move an opposite hand and foot together, travelling backwards or sideways.",
      "The hips stay up the entire time — that is the exercise.",
      "Keep the chest open and the shoulders away from the ears.",
    ],
    watch:
      "Fingers point toward the feet, never away. Turning the hands out puts the wrist and the front of the shoulder in the position they are weakest in, under your whole bodyweight, and it is the single reason this movement has a bad reputation.",
    cues: ["Hips up", "Fingers toward the feet", "Chest open"],
    trains: ["triceps", "rear shoulder", "hip extension under load", "the front of the body"],
    masterAt: { ...MASTERY.working, seconds: 30 },
  },
  {
    name: "Spiderman crawl",
    family: "crawl",
    tier: 3,
    metric: "time",
    dose: "3× 20 s",
    summary: "A bear crawl with the body low and the knees out wide. The one the app is named after.",
    setup: ["Push-up position, elbows soft, body low."],
    execution: [
      "Bring one knee out toward the same-side elbow and crawl forward.",
      "Stay low — belly close to the floor throughout.",
    ],
    watch:
      "Low is the whole point. Rising up turns it into a slow bear crawl and loses the hip range that makes it worth doing.",
    cues: ["Stay low", "Knee to elbow", "Quiet hands"],
    trains: ["shoulders", "core", "hip mobility under load"],
    requires: [
      {
        family: "core",
        seconds: 45,
        why: "Held an inch off the floor, the trunk is the only thing keeping your hips out of the carpet. A 45-second plank is that, standing still.",
      },
    ],
    masterAt: { ...MASTERY.demanding, seconds: 30 },
    aliases: ["Spider crawl"],
  },

  // ── Jumping ───────────────────────────────────────────────
  {
    name: "Squat jump",
    family: "jump",
    tier: 0,
    metric: "reps",
    dose: "3× 8",
    summary: "A squat driven hard enough to leave the floor.",
    setup: ["Feet shoulder-width, somewhere with a bit of give underfoot if possible."],
    execution: [
      "Dip to a quarter or half squat.",
      "Jump as high as you can.",
      "Land quietly, absorbing through the hips and knees.",
    ],
    watch:
      "Land soft and quiet. When the landings get loud, the set is over — noise is the sound of the joints taking what the muscles stopped absorbing.",
    cues: ["Explode up", "Land quiet", "Reset each rep"],
    trains: ["leg power", "landing mechanics"],
    needs: ["space", "gym", "outdoor_bars"],
    masterAt: { ...MASTERY.intro, reps: 12 },
    aliases: ["Squat jumps"],
  },
  {
    name: "Tuck jump",
    family: "jump",
    tier: 1,
    metric: "reps",
    dose: "3× 8",
    summary:
      "A vertical jump where you pull both knees up toward your chest at the top. Asks you to produce force and then reorganise in the air — which is the difference between jumping and landing well, and everything the vault strand later needs.",
    setup: [
      "Feet hip-width, somewhere with give underfoot.",
      "Arms free, room above your head.",
    ],
    execution: [
      "Dip to a quarter squat and jump straight up as hard as you can.",
      "At the top, pull the knees toward the chest — do not reach down for them with the hands.",
      "Extend the legs again before you land, and absorb through hips and knees.",
    ],
    watch:
      "The knees come up to the chest; the chest does not come down to the knees. Folding forward to meet them puts you in the air leaning, which is a bad way to arrive back on the floor — and stop the set the moment the landings get loud.",
    cues: ["Knees to chest", "Stay tall", "Land quiet"],
    trains: ["leg power", "in-air control", "landing mechanics"],
    needs: ["space", "gym", "outdoor_bars"],
    masterAt: { ...MASTERY.foundation, reps: 8 },
  },
  {
    name: "Broad jump",
    family: "jump",
    tier: 2,
    metric: "reps",
    dose: "3× 5",
    summary: "Jumping forward for distance from a standstill. Phase 3.",
    setup: ["Clear run of floor, soft surface if you have it."],
    execution: [
      "Swing the arms back, dip, then jump forward as far as you can.",
      "Land on both feet and absorb — stick it rather than stumbling on.",
    ],
    watch:
      "Stick the landing. A stumble forward means you jumped further than you can currently absorb, which is the definition of too far.",
    cues: ["Arms back then through", "Stick the landing", "Quality over distance"],
    trains: ["horizontal power", "landing absorption"],
    needs: ["space", "gym", "outdoor_bars"],
    masterAt: { ...MASTERY.working, reps: 5 },
    aliases: ["Broad jumps"],
  },
  {
    name: "Box jump",
    family: "jump",
    tier: 3,
    metric: "reps",
    dose: "3× 5",
    summary:
      "Jumping up onto a box, bench or low wall and landing on it in a quarter squat. Landing higher than you took off means far less impact than a broad jump for the same amount of power — which is why it belongs before the jumps you can miss.",
    setup: [
      "A stable box, bench or step. Start low enough that you can land softly, not high enough to be impressive.",
      "Stand a foot's length back from it, feet hip-width.",
    ],
    execution: [
      "Swing the arms back, dip, and jump up onto the box.",
      "Land with both feet fully on the surface in a quarter squat, quietly.",
      "Step down. Never jump down — that is where the impact and the injuries are.",
    ],
    watch:
      "Step down, every rep, without exception. Jumping off a box repeatedly is the way this movement wrecks Achilles tendons, and it buys you nothing the jump up did not already give you. And pick a height you can land on standing tall-ish: a box you only reach by folding into a deep squat is a box that is too high.",
    cues: ["Land soft and high", "Full foot on the box", "Step down"],
    trains: ["leg power", "landing absorption", "commitment to a target"],
    needs: ["bench", "gym", "outdoor_bars"],
    masterAt: { ...MASTERY.demanding, reps: 5 },
  },
  {
    name: "Precision jump",
    family: "jump",
    tier: 4,
    metric: "reps",
    dose: "3× 5",
    summary:
      "A broad jump onto a target you have to land exactly on. The document's version is kerb to kerb. Phase 3.",
    setup: [
      "Two kerbs, or two lines chalked on the floor, closer together than your best broad jump.",
      "Stand with your toes on the near edge.",
    ],
    execution: [
      "Jump and land with both feet on the target, then hold still for a second.",
      "If you cannot hold still, the jump was too far — move the target closer.",
      "Increase the distance only once every rep in a set lands and sticks.",
    ],
    watch:
      "The landing is the movement, not the jump. Landing short on a real kerb is how ankles go, so the whole point of practising it is to build the habit of only jumping what you can already stick — start well inside your range and stay there.",
    cues: ["Land and freeze", "Well inside your range", "Toes to the edge"],
    trains: ["landing accuracy", "horizontal power", "commitment"],
    needs: ["space", "gym", "outdoor_bars"],
    requires: [
      {
        family: "roll",
        tier: 3,
        why: "A precision jump you miss is a fall forward, from standing, at speed. Be able to roll out of one from standing before you start jumping onto edges.",
      },
    ],
    masterAt: { ...MASTERY.advanced, reps: 5 },
    aliases: ["Precision jumps"],
  },

  // ── Falling ───────────────────────────────────────────────
  // The strand this whole catalogue was missing. The document prescribes
  // "Schulterrolle, 10 pro Seite" from the first Friday and then, one line
  // later, explains how it is actually learned: "Erst langsam aus der Hocke,
  // dann aus dem Stand, dann aus dem Gehen." Those three steps are rungs 2, 3
  // and 4 below. Rungs 0 and 1 are EXTRAPOLATED — the document starts from a
  // crouch, and a crouch is already a fall for someone who has never rolled.
  {
    name: "Backward breakfall",
    family: "roll",
    tier: 0,
    metric: "reps",
    dose: "2× 10",
    summary:
      "Sitting on a mat and rocking back onto your shoulders, then back up. No rolling anywhere yet — this is where you find out what a rounded back feels like, which is the whole safety mechanism of every roll above it.",
    setup: [
      "Sit on a mat with your knees bent and your feet on the floor.",
      "Cross your arms over your chest and tuck your chin hard to it.",
    ],
    execution: [
      "Rock backwards, letting your back round so you roll along your spine one vertebra at a time.",
      "Go back as far as your shoulder blades, then rock forward again to sit up.",
      "It should sound like nothing. A thud means a flat back.",
    ],
    watch:
      "Chin to chest for every single rep. The one injury this whole strand exists to prevent is the back of your head hitting the floor, and the habit that prevents it has to be built here, where you are six inches off the mat and moving slowly, not later at walking pace.",
    cues: ["Chin to chest", "Round like a ball", "Silent"],
    trains: ["a rounded spine under load", "the chin-tuck habit", "trust in the floor"],
    needs: SOFT,
    masterAt: { ...MASTERY.drill, reps: 10 },
    aliases: ["Rock-backs"],
  },
  {
    name: "Shoulder roll from a kneel",
    family: "roll",
    tier: 1,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "The full roll, but starting from one knee so there is no falling involved. You are learning the diagonal — in over one shoulder, out across the opposite hip — with your body already on the ground.",
    setup: [
      "Kneel on a mat on your right knee, left foot flat in front.",
      "Place your right hand on the floor inside your left foot, fingers pointing across your body to the left.",
      "Left hand on the mat outside the left foot for support.",
    ],
    execution: [
      "Tuck your chin to your left shoulder and look under your right armpit.",
      "Push gently and let yourself tip over your right shoulder blade — not the top of the shoulder.",
      "The contact runs diagonally: right shoulder blade, across the back, out at the left hip.",
      "Come up onto your feet if you can, or just stop on your back at first.",
    ],
    watch:
      "The roll crosses your back diagonally and never touches your head or your spine. If you feel your neck take weight, your chin was not tucked far enough and the entry hand was too close to your body — reset rather than doing another rep to see if it was a one-off.",
    cues: ["Look under the armpit", "Shoulder blade, not shoulder", "Out at the far hip"],
    trains: ["the roll's diagonal line", "both sides equally"],
    needs: SOFT,
    perSide: true,
    requires: [
      {
        family: "core",
        seconds: 30,
        why: "30 s of plank first. A trunk that gives way mid-roll drops your spine onto the floor flat, which is what the rounded shape is there to stop.",
      },
    ],
    masterAt: { ...MASTERY.drill, reps: 5 },
  },
  {
    name: "Shoulder roll from a crouch",
    family: "roll",
    tier: 2,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "The document's first named step: slowly, from a crouch, on a mat. The same roll with a little height and a little momentum behind it.",
    setup: [
      "Crouch on a mat, feet flat, weight on the balls of your feet.",
      "Same hand position as from a kneel — leading hand across your body, fingers pointing to the opposite side.",
    ],
    execution: [
      "Tuck the chin, look under the leading armpit.",
      "Tip forward and roll along the same diagonal: shoulder blade, across the back, out at the opposite hip.",
      "Let the momentum bring you up onto your feet.",
      "Do the same number both sides. A one-sided roll is half a skill.",
    ],
    watch:
      "Slowly is not a suggestion — the document says so and means it. Speed hides a bad line, and a bad line at speed is how the shoulder or the neck gets hurt. If the roll is loud, it is flat.",
    cues: ["Slow", "Silent", "Both sides"],
    trains: ["rolling with momentum", "landing on your feet"],
    needs: SOFT,
    perSide: true,
    masterAt: { ...MASTERY.practice, reps: 5 },
  },
  {
    name: "Shoulder roll from standing",
    family: "roll",
    tier: 3,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "The document's second step. Standing, so there is a real drop into the roll and the entry has to be found on the way down rather than set up in advance.",
    setup: ["Stand on a mat with the room in front of you clear."],
    execution: [
      "Step forward, drop into the crouch and roll in one movement rather than three.",
      "The leading hand reaches for the floor across your body as you go down.",
      "Come up onto your feet and keep walking out of it.",
    ],
    watch:
      "The hand goes down first and takes almost no weight — it steers, it does not catch. Landing on a straight arm from standing height is how wrists and collarbones break, and it is the natural instinct, which is why it has to be trained out at crouch height before you do this.",
    cues: ["Hand steers, doesn't catch", "One movement", "Walk out of it"],
    trains: ["falling under control", "the entry at speed"],
    needs: SOFT,
    perSide: true,
    masterAt: { ...MASTERY.practice, reps: 5 },
  },
  {
    name: "Shoulder roll from a walk",
    family: "roll",
    tier: 4,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "The document's third step, and the version that is actually useful: rolling out of movement you were already doing. This is what makes it insurance rather than a trick.",
    setup: ["A few metres of clear run-up onto a mat, or onto grass."],
    execution: [
      "Walk in at an ordinary pace, drop and roll without breaking stride.",
      "Come out of it on your feet and keep walking.",
      "Build up from a walk. Running comes later and is not in the plan's first year.",
    ],
    watch:
      "Never on tiredness and never at the end of a session — the document's own injury rule for the skill phases, and this is the movement it is about. A roll practised while fatigued teaches a shape you will use badly when it counts.",
    cues: ["Don't break stride", "Fresh, not tired", "Keep walking"],
    trains: ["rolling out of movement", "the skill you would actually use"],
    needs: SOFT,
    perSide: true,
    masterAt: { ...MASTERY.craft, reps: 5 },
    aliases: ["Shoulder roll"],
  },
  {
    name: "Dive roll",
    family: "roll",
    tier: 5,
    metric: "reps",
    dose: "2× 5",
    summary:
      "A shoulder roll entered by leaving the ground first — a short dive forward, hands down, and straight into the same diagonal line across the back. The top of the falling strand, and the version that covers a fall you did not choose.",
    setup: [
      "A mat, and more of a run-out than you think you need.",
      "Start with almost no dive at all: a step in and a slight lean is enough for the first weeks.",
    ],
    execution: [
      "Take one step, push off and reach both hands to the mat in front of you.",
      "Take the landing on the arms, bending them to absorb rather than locking out.",
      "Convert straight into the roll — leading shoulder blade, across the back, out at the opposite hip — and come up on your feet.",
    ],
    watch:
      "Locked arms on the way in is how wrists and collarbones break, and it is what everybody does the first time they add height. Add distance before you add height, keep the elbows soft, and if the roll after the dive is anything other than silent, take the dive back out of it.",
    cues: ["Soft elbows", "Distance before height", "Straight into the line"],
    trains: ["rolling out of a real fall", "absorbing on the arms", "committing forwards"],
    needs: SOFT,
    masterAt: { ...MASTERY.signature, reps: 5 },
  },

  // ── Tumbling ──────────────────────────────────────────────
  // Phase 2 adds the cartwheel, Phase 3 the roundoff, and checkpoints 2 and 3
  // ask for them by name. Both are gated on being able to hold weight upside
  // down and on being able to roll out of it when you cannot.
  {
    name: "Cartwheel",
    family: "acro",
    tier: 0,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "Going over sideways on two hands, one at a time, and landing on your feet. Checkpoint 2 asks for it on both sides. Phase 2.",
    setup: [
      "A line on the floor to travel along, and enough clear space either side of it.",
      "Stand side-on to the line with your lead foot on it.",
    ],
    execution: [
      "Lunge sideways along the line and put the lead hand down on it, then the second hand.",
      "The legs pass overhead one after the other — this is a handstand that keeps moving.",
      "Land one foot then the other, still on the line, facing back the way you came.",
    ],
    watch:
      "Both hands land on the line and the hips pass over the shoulders. A cartwheel done with bent arms and low hips is a sideways scramble that puts the whole load on one wrist — do it slowly enough to actually stack up, even if that means only getting halfway over at first.",
    cues: ["Hand, hand, foot, foot", "Stay on the line", "Straight arms"],
    trains: ["inverted balance sideways", "wrist and shoulder load", "coordination"],
    needs: SOFT,
    perSide: true,
    requires: [
      {
        family: "handstand",
        seconds: 30,
        why: "30 s of wall handstand first. A cartwheel puts your whole weight on one arm at a time, and a shoulder that has never held it overhead is not ready to catch it moving.",
      },
      {
        family: "roll",
        tier: 2,
        why: "You will fall out of early cartwheels sideways. Rolling from a crouch — the document's own first step — turns that into a non-event.",
      },
    ],
    masterAt: { ...MASTERY.practice, reps: 5 },
  },
  {
    name: "Roundoff",
    family: "acro",
    tier: 1,
    metric: "reps",
    dose: "2× 5",
    summary:
      "A cartwheel that finishes with both feet together, facing back the way you came. Checkpoint 3 asks for it. Phase 3.",
    setup: ["The same line, with more run-up room than the cartwheel needed."],
    execution: [
      "Enter as a cartwheel, hands down one after the other on the line.",
      "Once you are upside down, snap the legs together and turn a quarter so the hips face back down the line.",
      "Push hard off the floor with both hands and land on both feet at once, facing where you came from.",
    ],
    watch:
      "The push out of the hands is what makes it a roundoff instead of a messy cartwheel. Landing with the feet apart or the chest still turning means you snapped the legs together too late — slow the entry down rather than trying to fix the landing.",
    cues: ["Snap the legs together", "Push out of the hands", "Land facing back"],
    trains: ["reversing direction upside down", "explosive shoulder push"],
    needs: SOFT,
    masterAt: { ...MASTERY.craft, reps: 5 },
  },
  {
    name: "One-handed cartwheel",
    family: "acro",
    tier: 2,
    metric: "reps",
    dose: "2× 5 per side",
    summary:
      "A cartwheel on one hand. Everything the two-handed version taught, with twice the load and half the margin — and the last thing on this strand that is learned rather than performed.",
    setup: [
      "A mat and a line, exactly as for a cartwheel.",
      "Start by using the near hand only — the far-hand version is a different and harder movement.",
      "Do not attempt this on a day the wrists already ache.",
    ],
    execution: [
      "Enter as a normal cartwheel but plant only the leading hand.",
      "Push through that arm hard and keep it locked — the hips have to pass over a straight arm, not a bent one.",
      "Land one foot then the other on the line, facing back the way you came.",
    ],
    watch:
      "One arm now takes what two shared, and it takes it while moving. A bent elbow at the bottom is the whole failure: it collapses you onto your shoulder. If you cannot cartwheel slowly with the hips genuinely stacked over the hands, this is not the next thing.",
    cues: ["Straight arm", "Hips over the hand", "Slow all the way through"],
    trains: ["one-arm loading upside down", "wrist and shoulder strength", "commitment"],
    needs: SOFT,
    perSide: true,
    requires: [
      {
        family: "handstand",
        seconds: 60,
        why: "A minute upside down against the wall. One arm catches your whole weight here, and it catches it moving.",
      },
    ],
    masterAt: { ...MASTERY.signature, reps: 5 },
  },

  // ── Getting up ────────────────────────────────────────────
  // The document is unusually explicit here: "Zuerst zum Sitzen, dann in die
  // Hocke, dann in den Stand. Mehrere Monate Arbeit, absolut machbar." Three
  // rungs, and it says outright that it takes months — which is exactly why it
  // should not have been one line item arriving in a Friday session.
  {
    name: "Candlestick roll to a squat",
    family: "kipup",
    tier: 0,
    metric: "reps",
    dose: "3× 8",
    summary:
      "Rolling back onto your shoulders with the legs straight up, then rolling forward and standing out of it without hands. The kip-up's landing, learned on its own — you get the feet under a rising body without needing the snap that gets you airborne.",
    setup: [
      "Sit on a mat with your knees bent and your feet flat, arms across your chest or reaching forward.",
      "Chin tucked to the chest before anything moves.",
    ],
    execution: [
      "Rock back onto your shoulder blades and extend both legs straight up toward the ceiling, body long.",
      "Pause there for a beat — that stack is the position, not a moment you pass through.",
      "Roll forward, pull the feet in under your hips, and stand up without putting a hand down.",
    ],
    watch:
      "Chin to chest on every rep, and never let the weight travel onto your neck at the top — the stack sits on the shoulder blades. If you need a hand to stand up, that is fine and normal; keep the reps and take the hand away over weeks rather than forcing it today.",
    cues: ["Chin tucked", "Stack on the shoulder blades", "Feet under the hips"],
    trains: ["getting the feet under a rising body", "spinal segmentation", "the kip-up landing"],
    needs: SOFT,
    requires: [
      {
        family: "core",
        seconds: 30,
        why: "30 s of hollow hold. The whole roll happens in that shape, and without it the legs land before the hips arrive.",
      },
    ],
    masterAt: { ...MASTERY.drill, reps: 8 },
  },
  {
    name: "Kip-up to sitting",
    family: "kipup",
    tier: 1,
    metric: "reps",
    dose: "3× 5",
    summary:
      "The kip-up's engine on its own: legs over your head, snap them forward, push off the floor with your hands, and arrive sitting up. The document's first of three steps. Phase 2.",
    setup: [
      "Lie on your back on a mat, hands by your ears with the palms down and the fingers pointing at your shoulders.",
    ],
    execution: [
      "Roll your legs back over your head until your knees are near your face.",
      "Snap them forward and down hard, and at the same moment push the floor away with your hands.",
      "Aim only to arrive sitting upright. Getting your feet under you is the next rung, not this one.",
    ],
    watch:
      "The hands and the legs have to fire together. Pushing early gives you a shove with no legs in it; pushing late means the legs land first and stop everything. Practise the timing at this height, where getting it wrong just means you stay on the mat.",
    cues: ["Legs back, then snap", "Push at the same moment", "Only to sitting"],
    trains: ["the hip snap", "hand-leg timing"],
    needs: SOFT,
    requires: [
      {
        family: "core",
        seconds: 30,
        why: "30 s of hollow hold first. The kip-up is a hollow-to-arch snap, and without the hollow there is nothing to snap out of.",
      },
    ],
    masterAt: { ...MASTERY.practice, reps: 5 },
  },
  {
    name: "Kip-up to a crouch",
    family: "kipup",
    tier: 2,
    metric: "reps",
    dose: "3× 5",
    summary:
      "The same snap, landing with your feet underneath you in a crouch rather than sitting. Checkpoint 3 asks for exactly this. Phase 3.",
    setup: ["As before, flat on your back on a mat."],
    execution: [
      "Same entry and same simultaneous snap and push.",
      "As the hips rise, pull the knees through so the feet get under your body.",
      "Land in a deep crouch with your hands off the floor.",
    ],
    watch:
      "Feet under the hips, not out in front. Landing with your feet ahead of you means you have kipped into a sit-up and your back takes the rest, which is felt the next day rather than at the time.",
    cues: ["Knees through", "Feet under the hips", "Land in the crouch"],
    trains: ["getting the feet under a rising body", "the full snap"],
    needs: SOFT,
    masterAt: { ...MASTERY.craft, reps: 5 },
    // The plan names the whole strand "Kip-up progression", and what it means by
    // it is checkpoint 3's target: into a crouch. Naming the middle rung leaves
    // the top one reachable, since placement never goes more than one above what
    // the plan asked for.
    aliases: ["Kip-up progression"],
  },
  {
    name: "Kip-up to standing",
    family: "kipup",
    tier: 3,
    metric: "reps",
    dose: "3× 3",
    summary:
      "Floor to feet in one movement. The document's month-12 skill, and the last rung on this strand.",
    setup: ["Flat on your back on a mat, room in front of you."],
    execution: [
      "Same snap, but drive the hips higher and further forward so the body arrives over the feet.",
      "Land standing, balanced, without a step forward to catch yourself.",
      "Three good ones beats ten scrambled ones — this is a skill session, not a set.",
    ],
    watch:
      "A step forward on landing means you did not get the hips over the feet, and repeating it tired just grooves the step in. Stop the set the moment they stop being clean.",
    cues: ["Hips high and forward", "Arrive balanced", "Stop when they get scruffy"],
    trains: ["the complete kip-up"],
    needs: SOFT,
    masterAt: { ...MASTERY.signature, reps: 3 },
  },

  // ── Obstacles ─────────────────────────────────────────────
  // From the document's optional Parkour-Basics Saturday, plus the wall run
  // that Phase 3's Friday adds. Ordered by how far off the ground you end up.
  {
    name: "Safety vault",
    family: "vault",
    tier: 0,
    metric: "reps",
    dose: "3× 5 per side",
    summary:
      "Crossing a waist-high obstacle with one hand and one foot on it. The slowest, most controlled vault there is, and the one every other vault is built from. Phase 3.",
    setup: ["A stable bench or low wall, roughly hip height. Nothing that can tip."],
    execution: [
      "Approach at walking pace and place one hand on the top.",
      "Step the near foot onto the bench beside your hand, keeping your weight over it.",
      "Swing the far leg through the gap between your hand and your foot, and step off the other side.",
    ],
    watch:
      "Test that the obstacle takes your weight before you commit any of it — the document's rule about learning new things slowly on soft ground applies to the thing you are vaulting as much as to you. A bench that moves halfway through is the whole injury.",
    cues: ["Push the obstacle first", "Hand and foot together", "Walk it, don't jump it"],
    trains: ["crossing obstacles under control", "reading what will hold you"],
    needs: ["space", "gym", "outdoor_bars"],
    perSide: true,
    requires: [
      {
        family: "roll",
        tier: 2,
        why: "Vaults are the first thing in the plan where a mistake puts you on the floor moving forwards. Be able to roll from a crouch before you cross anything.",
      },
    ],
    masterAt: { ...MASTERY.drill, reps: 5 },
    aliases: ["Safety vault over a bench"],
  },
  {
    name: "Speed vault",
    family: "vault",
    tier: 1,
    metric: "reps",
    dose: "3× 5 per side",
    summary:
      "Crossing the same obstacle sideways with one hand on it and both legs swinging through together, without breaking stride. The safety vault with the foot taken off the top — which is what makes it a vault you can do while moving rather than a step-over.",
    setup: [
      "The same stable hip-height bench or wall, with clear landing ground on the far side.",
      "Approach from the side at a walk to begin with; speed is the last thing you add, not the first.",
    ],
    execution: [
      "Plant the trailing hand on the top as you pass and take some weight through it.",
      "Swing both legs over together, sideways, feet staying together.",
      "Land on the far foot first and keep walking through — a vault that ends in a stop was a step-over.",
    ],
    watch:
      "One hand takes real weight here for the first time, and it takes it at an angle. Push down through the whole palm rather than the heel of the hand, and do not add speed until the walking version is silent — a caught trailing foot at pace puts you on the floor sideways with an arm out.",
    cues: ["Legs together", "Push through the palm", "Keep walking through"],
    trains: ["crossing obstacles in motion", "one-arm support at an angle"],
    needs: ["space", "gym", "outdoor_bars"],
    perSide: true,
    masterAt: { ...MASTERY.practice, reps: 5 },
  },
  {
    name: "Wall run",
    family: "vault",
    tier: 2,
    metric: "reps",
    dose: "3× 3",
    summary:
      "Running at a wall, planting one foot on it and pulling yourself to the top. Checkpoint 3 asks for it; month 12 asks for it landing in the crouch. Phase 3.",
    setup: [
      "A solid wall with a clean top edge you can see, and clear ground to land back on.",
      "Two or three steps of run-up. More does not help.",
    ],
    execution: [
      "Run in and drive one foot flat onto the wall at about hip height.",
      "The foot converts your speed upward — it is a step, not a kick.",
      "Reach for the top with both hands and pull, ending with your chest at the edge.",
    ],
    watch:
      "The hands do the last half. A wall run attempted with no pulling strength turns into hanging off a ledge you cannot get over and dropping badly — which is why the pull-up gate below exists and is not negotiable.",
    cues: ["Foot flat, not toes", "Step up the wall", "Pull the last half"],
    trains: ["converting speed to height", "pulling at the top of a reach"],
    needs: ["space", "gym", "outdoor_bars"],
    requires: [
      {
        family: "pull",
        tier: 4,
        reps: 3,
        why: "3 pull-ups first. The top of a wall run is a pull-up done tired, and arriving there without one leaves you hanging with nowhere to go.",
      },
    ],
    masterAt: { ...MASTERY.craft, reps: 3 },
  },
  {
    name: "Kong vault",
    family: "vault",
    tier: 3,
    metric: "reps",
    dose: "3× 3",
    summary:
      "Diving hands-first over an obstacle and pulling the knees through between your arms. The document is explicit that this one is practised with a mat. Phase 3, and the hardest thing on the strand.",
    setup: [
      "A hip-height obstacle with a mat on the far side.",
      "Start by doing it from a standstill with your hands already on the obstacle.",
    ],
    execution: [
      "Dive forward and plant both hands flat on the top.",
      "Tuck hard and bring both knees through between your arms.",
      "Push off the hands and land on both feet on the far side.",
    ],
    watch:
      "Hands go past the near edge, not on it. Catching a foot on the obstacle is the standard way this ends and it puts you on the ground head-first, which is precisely why the mat is in the document and why the roll strand sits underneath this one.",
    cues: ["Hands well over", "Knees between the arms", "Mat on the far side"],
    trains: ["committing to a dive", "tucking under pressure"],
    needs: SOFT,
    requires: [
      {
        family: "roll",
        tier: 5,
        why: "A kong vault that clips the obstacle puts you on the ground head-first and moving. The dive roll is the only thing that turns that into a landing rather than an accident.",
      },
    ],
    masterAt: { ...MASTERY.signature, reps: 3 },
  },

  // ── Lunging ───────────────────────────────────────────────
  {
    name: "Reverse lunge",
    family: "lunge",
    tier: 0,
    metric: "reps",
    dose: "3× 10 per side",
    summary:
      "Stepping backwards into a lunge and returning. Backwards rather than forwards because the knee stays over the ankle the whole way, which is what makes it the version to start on.",
    setup: ["Stand tall, feet hip-width, hands on your hips or holding something light."],
    execution: [
      "Step one foot back and lower until both knees are near 90°.",
      "The front shin stays close to vertical; the back knee hovers just off the floor.",
      "Drive through the front heel to stand, and bring the back foot home.",
    ],
    watch:
      "The torso stays upright and the front knee tracks over the middle of the foot. Letting the knee fall inward is the single thing to watch here, and it usually means the hip is tired rather than the leg — stop the set rather than pushing through it.",
    cues: ["Step back, not forward", "Tall chest", "Knee over the foot"],
    trains: ["single-leg strength", "balance", "quads and glutes"],
    perSide: true,
    masterAt: { ...MASTERY.intro, reps: 10 },
    aliases: ["Reverse lunges"],
  },
  {
    name: "Forward lunge",
    family: "lunge",
    tier: 1,
    metric: "reps",
    dose: "3× 10 per side",
    summary:
      "Stepping forward into the lunge instead of backward. Harder than it sounds: the front leg has to catch the step as well as press out of it, which is exactly the demand every landing and every vault makes later.",
    setup: ["Stand tall, feet hip-width, hands on the hips.", "Clear floor in front of you, not a rug that slides."],
    execution: [
      "Step one foot forward and lower until both knees are near 90°.",
      "Land through the whole front foot, not the heel alone — the step is absorbed, not stamped.",
      "Push back off the front leg to return to standing.",
    ],
    watch:
      "The front knee is being asked to decelerate you, and that is where it caves inward. Take a shorter step than feels natural and stop the set the moment the knee starts wandering — this rung is about catching the step cleanly, not about how far you can reach.",
    cues: ["Absorb the step", "Knee over the foot", "Push back, don't fall back"],
    trains: ["single-leg strength", "deceleration", "quads and glutes"],
    perSide: true,
    masterAt: { ...MASTERY.foundation, reps: 10 },
  },
  {
    name: "Walking lunge",
    family: "lunge",
    tier: 2,
    metric: "reps",
    dose: "3× 10 per side",
    summary:
      "Lunging forward continuously, bringing the back foot through into the next rep rather than returning to standing. There is no rest between reps and no moment of balance to gather yourself in — which is the point.",
    setup: ["A clear run of floor, ten metres or a length you can walk back and forth along.", "Hands on the hips or holding a light weight at the chest."],
    execution: [
      "Step forward into a lunge, both knees near 90°.",
      "Drive through the front heel and bring the back foot straight through into the next step.",
      "Keep the torso tall throughout — no leaning forward to generate the next step.",
    ],
    watch:
      "The rep that goes wrong is the one where you are already moving into the next. If you find yourself falling forward into each step, the set is over — stop, walk it off, and do fewer next time rather than finishing the number.",
    cues: ["Tall through the middle", "Straight through, no wobble", "Fewer and clean"],
    trains: ["single-leg strength", "balance in motion", "glutes", "hip stability"],
    needs: ["space", "gym", "outdoor_bars"],
    perSide: true,
    masterAt: { ...MASTERY.working, reps: 10 },
  },
  {
    name: "Cossack squat",
    family: "lunge",
    tier: 3,
    metric: "reps",
    dose: "3× 8 per side",
    summary:
      "A deep sideways lunge: sinking onto one bent leg with the other stretched straight out to the side. Strength at the end of your hip range, which is the range everything on the skill strands ends up needing.",
    setup: ["Stand with your feet much wider than your shoulders, toes forward or slightly out."],
    execution: [
      "Shift your weight onto one leg and sit down into it, keeping the other leg straight.",
      "The straight leg's toes come up; the heel stays down.",
      "Go as low as you can with the bent heel flat, then push back to the middle.",
    ],
    watch:
      "The bent heel stays on the floor. Rolling onto the ball of the foot to get lower is how it becomes a stretch you cannot control, and depth you cannot control is the kind that gives way — take the height you can hold and let it come down over weeks.",
    cues: ["Heel down", "Sit into the bent leg", "Chest up"],
    trains: ["hip range under load", "adductors", "ankle range"],
    perSide: true,
    masterAt: { ...MASTERY.demanding, reps: 8 },
  },
  {
    name: "Jumping lunge",
    family: "lunge",
    tier: 4,
    metric: "reps",
    dose: "3× 8 per side",
    summary:
      "A split squat jumped hard enough to swap the legs in the air. The top of the lunging strand, and the one that turns single-leg strength into single-leg power.",
    setup: [
      "Somewhere with a bit of give underfoot, and enough headroom to jump.",
      "Start in a lunge, front shin vertical, back knee just off the floor.",
      "Warm the ankles and knees properly first. This is not a first-exercise-of-the-session movement.",
    ],
    execution: [
      "Drive up hard off both legs so you leave the floor.",
      "Swap the legs in the air and land in the opposite lunge.",
      "Absorb the landing by sinking straight back into the bottom position — every rep lands, then jumps.",
    ],
    watch:
      "Loud landings mean the legs have stopped absorbing and the joints have started. Count the set in clean reps, not in total reps: eight quiet ones is the set, and the ninth noisy one undoes them.",
    cues: ["Land quiet", "Swap in the air", "Stop when it gets loud"],
    trains: ["single-leg power", "landing absorption", "reactive strength"],
    needs: ["space", "gym"],
    perSide: true,
    masterAt: { ...MASTERY.advanced, reps: 8 },
  },

  // ── Range ─────────────────────────────────────────────────
  // Tuesday's slot. The document builds it phase by phase — Jefferson curl,
  // pancake progression and the bridge arrive in Phase 2; pancake, bridge
  // push-up and active hip rotations in Phase 3 — so the strand is that order.
  // The drills under all of it are groundwork and never locked.
  {
    name: "Open book",
    family: "spine",
    tier: 0,
    metric: "reps",
    dose: "10 per side",
    summary:
      "Lying on your side with your knees bent and rotating the top arm across to the floor behind you. The gentlest thing that actually asks your upper back to rotate.",
    setup: [
      "Lie on your side, knees bent to 90° and stacked, arms straight out in front, palms together.",
      "A cushion under the head if that is more comfortable.",
    ],
    execution: [
      "Keep the knees stacked and pinned together.",
      "Slide the top hand along the bottom one, then open it across your body toward the floor behind you.",
      "Follow the hand with your eyes. Breathe out at the end, then come back.",
    ],
    watch:
      "The knees do not move. If the top knee lifts, the rotation has moved into your lower back, which already rotates more than it should — pin the knees with a cushion between them if you have to.",
    cues: ["Knees stay stacked", "Eyes follow the hand", "Breathe out at the end"],
    trains: ["thoracic rotation", "shoulder range"],
    perSide: true,
    masterAt: { ...MASTERY.intro, reps: 10 },
  },
  {
    name: "Jefferson curl",
    family: "spine",
    tier: 1,
    metric: "reps",
    dose: "3× 8",
    summary:
      "Rolling down through your spine one vertebra at a time holding a light weight, then rolling back up. The document specifies light and means it — 4 kg. Phase 2.",
    setup: [
      "Stand on a step or a low box holding a light weight in both hands.",
      "Feet together, legs straight but not locked hard.",
    ],
    execution: [
      "Tuck the chin and roll down slowly, one segment at a time, letting the weight hang.",
      "Go only as far as you can control, then reverse it and stack back up from the bottom.",
      "Four kilograms. This is a range movement wearing a weight, not a lift.",
    ],
    watch:
      "Load is the enemy of this one. Every kilogram past what you can roll smoothly turns a controlled spinal flexion into exactly the position everyone is told never to lift in — the document says 4 kg, and going up before the movement is genuinely smooth is how this movement earns its bad reputation.",
    cues: ["One vertebra at a time", "Stay light", "Stack back up from the bottom"],
    trains: ["spinal flexion under control", "hamstrings", "posterior chain range"],
    needs: LOAD,
    loaded: true,
    // The document names this one outright: 4 kg. The only weight in the plan
    // that is a specification rather than a floor — the watch line above is
    // about not exceeding it, and it means that.
    masterAt: { ...MASTERY.foundation, reps: 8, kg: 4 },
  },
  {
    name: "Reverse plank",
    family: "spine",
    tier: 2,
    metric: "time",
    dose: "3× 30 s",
    summary:
      "Face-up, propped on your hands with the body in one straight line from heel to shoulder. Also called a straight bridge, and it is the honest first step toward a back bridge: the same shoulder and hip extension, with none of the arch.",
    setup: [
      "Sit with the legs straight out, hands on the floor behind your hips, fingers pointing toward your feet.",
      "Heels down, toes pointed away.",
    ],
    execution: [
      "Press through the hands and heels and lift the hips until the body is one line.",
      "Squeeze the glutes and open the chest — the shoulders pull back and down, not up toward the ears.",
      "Hold, breathing normally. Lower under control rather than dropping.",
    ],
    watch:
      "Fingers point toward the feet, never away, and the head stays in line rather than dropping back. Letting the head hang is the reflex here and it is the one that makes the neck sore for two days after.",
    cues: ["Fingers toward the feet", "Hips to the ceiling", "Chest open"],
    trains: ["hip extension", "shoulder extension", "the front of the body"],
    masterAt: { ...MASTERY.working, seconds: 30 },
  },
  {
    name: "Frog stretch",
    family: "hips",
    tier: 0,
    metric: "time",
    dose: "3× 45 s",
    summary:
      "On your forearms and knees with the knees spread wide and the shins turned out, rocking the hips gently back. The gentlest way into the range the pancake later asks for, and the one you can do on a day nothing else feels like moving.",
    setup: [
      "Kneel on something soft and take the knees as wide as is comfortable.",
      "Shins turned out so the inside edges of the feet are on the floor, ankles in line with the knees.",
      "Come down onto the forearms with the back long.",
    ],
    execution: [
      "Rock the hips gently backwards until you feel a broad stretch through the inner thighs.",
      "Rock forward again. Move in and out of it rather than sitting still and enduring it.",
      "Breathe out as you rock back — the range arrives on the exhale, not on the effort.",
    ],
    watch:
      "This is felt in the inner thigh, never in the knee. A sharp or pinching knee means the shin has turned out further than the hip has, so bring the feet in toward each other and take less width.",
    cues: ["Inner thigh, never the knee", "Rock, don't sit", "Breathe out to go further"],
    trains: ["adductors", "hip abduction range", "the pancake's raw material"],
    needs: SOFT,
    masterAt: { ...MASTERY.intro, seconds: 45 },
  },
  {
    name: "Seated straddle sit",
    family: "hips",
    tier: 1,
    metric: "time",
    dose: "3× 45 s",
    summary:
      "Sitting with your legs wide and folding forward from the hips, propped as high as you need. Phase 2.",
    setup: [
      "Sit on the floor, legs as wide as you can with the knees pointing up.",
      "Sit on a folded cushion or a book if your lower back rounds immediately — most people need this at first.",
    ],
    execution: [
      "Keep the back long and hinge forward from the hips, not the waist.",
      "Walk the hands forward to where you feel a stretch you can breathe in.",
      "Hold and breathe. Come out of it before you have to.",
    ],
    watch:
      "Knees point at the ceiling throughout. Letting them roll inward gives you a lower position that is coming from the knee joint rather than the hip, which is both useless and the way this position causes trouble.",
    cues: ["Hinge from the hips", "Knees to the ceiling", "Breathe in the position"],
    trains: ["hip range in the splits direction", "adductors", "hamstrings"],
    masterAt: { ...MASTERY.foundation, seconds: 45 },
    aliases: ["Pancake progression"],
  },
  {
    name: "Back bridge",
    family: "spine",
    tier: 3,
    metric: "time",
    dose: "3× 20 s",
    summary:
      "Pushing up from your back into a full arch on hands and feet. Extension for a spine that spends the day flexed. Phase 2.",
    setup: [
      "Lie on your back on a mat, feet flat and close to your hips.",
      "Hands on the floor beside your ears, fingers pointing back toward your shoulders.",
    ],
    execution: [
      "Push the hips up first, then press the hands and lift the head off the floor.",
      "Straighten the arms as far as they will go and let the chest come through toward the hands.",
      "Come down the same way you went up, head last.",
    ],
    watch:
      "The arch should come from your upper back and your hips, not your lower back. If it all folds at the waist, the shoulders are not opening — press the chest toward the hands rather than trying to get higher, and take the shoulder work in the groundwork drills first.",
    cues: ["Hips first", "Chest through the arms", "Head last on the way down"],
    trains: ["spinal extension", "shoulder range overhead", "hip flexor length"],
    needs: SOFT,
    masterAt: { ...MASTERY.demanding, seconds: 20 },
    aliases: ["Bridge"],
  },
  {
    name: "Pancake",
    family: "hips",
    tier: 3,
    metric: "time",
    dose: "3× 45 s",
    summary: "The pancake with your chest to the floor and nothing propping you up. Phase 3.",
    setup: ["Sit on the floor, legs wide, sitting directly on the floor rather than a cushion."],
    execution: [
      "Hinge forward from the hips and walk the hands out.",
      "Bring the chest toward the floor with the back long rather than rounded.",
      "Hold, breathe, and come out under your own power rather than collapsing out.",
    ],
    watch:
      "Chest to the floor, not the forehead. Rounding the back to touch down looks like progress and is the opposite — it takes the stretch off the hips, which is the only thing this position is for.",
    cues: ["Chest, not forehead", "Long back", "Knees to the ceiling"],
    trains: ["end-range hip flexion", "adductors"],
    masterAt: { ...MASTERY.demanding, seconds: 45 },
  },
  {
    name: "Wall walk-down to bridge",
    family: "spine",
    tier: 4,
    metric: "reps",
    dose: "3× 5",
    summary:
      "Going into the bridge from standing, or lowering out of one under control. Active range rather than a held position. Phase 3.",
    setup: ["A mat, a wall at your back to walk down at first, and nothing to hit."],
    execution: [
      "Start by standing an arm's length from a wall, reaching back and walking the hands down it.",
      "Walk back up. Repeat until walking down and up is easy.",
      "Only then go to the floor without the wall, and only lowering — coming back up to standing is beyond this year.",
    ],
    watch:
      "Wall first, floor later, and never straight to the floor because the wall felt easy on a good day. Going over backwards with no wall and no arch is a landing on your head, which is why the document puts this in Phase 3 and not before.",
    cues: ["Walk the wall down", "Reach back, don't fall back", "Lower only"],
    trains: ["active spinal extension", "overhead shoulder strength at range"],
    needs: SOFT,
    masterAt: { ...MASTERY.advanced, reps: 5 },
    aliases: ["Bridge push-up"],
  },
  {
    name: "90/90 hip lift-off",
    family: "hips",
    tier: 2,
    metric: "reps",
    dose: "3× 8 per side",
    summary:
      "Moving the hip through its rotation under its own power rather than being pushed there. The document's Phase 3 addition, and the point where the range strand stops being stretching.",
    setup: ["Sit on the floor in the 90/90 position — one shin in front, one out to the side."],
    execution: [
      "Without using your hands, lift the front knee off the floor and hold it for a second.",
      "Lower it, then lift the back knee the same way.",
      "Switch sides by rotating the knees across, hands off the floor throughout.",
    ],
    watch:
      "Hands off the floor is the whole exercise. The moment you push yourself around with your hands it becomes the passive drill it grew out of, and passive range is not what the skills need.",
    cues: ["Hands off", "Lift, don't push", "Small and controlled"],
    trains: ["active hip rotation", "hip stability at range"],
    perSide: true,
    masterAt: { ...MASTERY.working, reps: 8 },
    aliases: ["Active hip rotations"],
  },

  // ── Engine ────────────────────────────────────────────────
  {
    name: "Squat thrust",
    family: "conditioning",
    tier: 0,
    metric: "reps",
    dose: "3× 8",
    summary:
      "A burpee with the push-up and the jump taken out: squat down, feet back to a plank, feet back in, stand. EXTRAPOLATED — the document prescribes burpees from the first Friday, and this is the standard way in for someone carrying 100 kg.",
    setup: ["Clear floor, hands able to reach it."],
    execution: [
      "Squat and put both hands on the floor.",
      "Jump or step both feet back into a plank.",
      "Bring the feet back in and stand up. No push-up and no jump at the top.",
    ],
    watch:
      "Step the feet back rather than jumping them if the landing is heavy. A heavy landing repeated for three sets is a lot of load through wrists and shoulders that have not asked for it, and stepping trains the same thing.",
    cues: ["Hands down, feet back", "Step if it lands heavy", "Keep it steady"],
    trains: ["heart rate", "whole-body coordination"],
    masterAt: { ...MASTERY.intro, reps: 8 },
    aliases: ["Squat thrusts"],
  },
  {
    name: "Burpee",
    family: "conditioning",
    tier: 1,
    metric: "reps",
    dose: "3× 8",
    summary:
      "The squat thrust with a push-up at the bottom and a jump at the top. In the document from the first Friday onward.",
    setup: ["Clear floor."],
    execution: [
      "Squat, hands down, feet back to a plank.",
      "One push-up, chest to the floor.",
      "Feet back in, then jump straight up with the hands overhead.",
      "Land soft and go straight into the next one.",
    ],
    watch:
      "The push-up is a push-up, not a collapse. When the chest starts hitting the floor before the arms have done anything the set is over — burpees done tired are where form goes first and the lower back finds out about it.",
    cues: ["Real push-up", "Land soft", "Stop when the shape goes"],
    trains: ["heart rate", "whole-body conditioning"],
    requires: [
      {
        family: "push",
        tier: 3,
        reps: 8,
        why: "8 floor push-ups first. A burpee has a push-up in the middle of it, and doing one you cannot yet do, tired, twenty-four times, is how a shoulder gets hurt on the easiest day of the week.",
      },
    ],
    masterAt: { ...MASTERY.foundation, reps: 8 },
    aliases: ["Burpees"],
  },
  {
    name: "Broad jump burpee",
    family: "conditioning",
    tier: 2,
    metric: "reps",
    dose: "3× 8",
    summary:
      "A burpee that finishes with a jump forward instead of a jump up, so every rep travels. Same engine, considerably more of it, and the landing has to be absorbed rather than simply survived.",
    setup: ["A clear run of floor — five or six metres, or turn around and come back.", "Somewhere with a bit of give underfoot."],
    execution: [
      "Squat, hands down, feet back to a plank, one full push-up.",
      "Feet back in, then jump forward as far as you can control rather than as far as you can reach.",
      "Land on both feet, absorb, and go straight into the next rep from where you are.",
    ],
    watch:
      "The landing is the part that gets you hurt, and it is the part that degrades first when you are out of breath. If you are stumbling out of the landings, jump shorter — the conditioning comes from the number of reps, not the distance of any one of them.",
    cues: ["Real push-up", "Jump what you can stick", "Shorter when tired"],
    trains: ["heart rate", "horizontal power under fatigue", "landing absorption"],
    needs: ["space", "gym", "outdoor_bars"],
    requires: [
      {
        family: "jump",
        tier: 2,
        why: "Broad jumps on their own first, fresh. Learning to land a jump while out of breath is learning it in the worst possible conditions.",
      },
    ],
    masterAt: { ...MASTERY.working, reps: 8 },
  },
  {
    name: "Burpee pull-up",
    family: "conditioning",
    tier: 3,
    metric: "reps",
    dose: "3× 5",
    summary:
      "A burpee performed under a pull-up bar, where the jump at the top becomes a pull-up. The top of the engine strand: everything the year has built, joined together and done out of breath.",
    setup: [
      "Stand under a bar you can reach by jumping — high enough that the jump is part of the rep, low enough that you are not leaping for it.",
      "Clear floor underneath, and nothing to catch a heel on.",
    ],
    execution: [
      "Squat, hands down, feet back, one full push-up.",
      "Feet in, jump up and catch the bar.",
      "One pull-up, chin clear of the bar, then lower under control and drop from a bent-arm position — never from a straight-arm hang.",
    ],
    watch:
      "Dropping off the bar with straight arms, repeatedly, while tired, is the single most reliable way to injure a shoulder in this whole plan. Lower yourself first and drop from low. If you cannot lower under control, the set is finished.",
    cues: ["Lower before you drop", "Chin clear, then down", "Quality over the number"],
    trains: ["heart rate", "pulling under fatigue", "the whole body at once"],
    needs: BAR,
    requires: [
      {
        family: "pull",
        tier: 4,
        reps: 5,
        why: "Five clean pull-ups fresh before any are asked for out of breath. A pull-up you are already fighting for becomes a swing the moment your heart rate is at 170.",
      },
    ],
    masterAt: { ...MASTERY.demanding, reps: 5 },
  },

  // ═══════════════════════════════════════════════════════════
  // Groundwork — always open, never gated
  // ═══════════════════════════════════════════════════════════
  // Warm-ups, cooldowns, the mobility drills that sit under the range strand,
  // and the three dumbbell lifts whose progression is load rather than shape.
  // These carry a `masterAt` because the type asks for one and because the
  // number is a sensible target, but nothing unlocks from it.

  // ── Substitutes ───────────────────────────────────────────
  // What the equipment rules drop you onto when the kit for a rung is missing.
  // They are groundwork rather than rungs: nothing unlocks from a calf raise,
  // and a strand must not advance on evidence from a movement that replaced it.
  // But they are prescribed, so they are explained.
  {
    name: "Prone back extension",
    family: "row",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "12–15",
    summary:
      "Lying face down and lifting the chest and legs off the floor. What the rowing strand becomes when there is nothing to row under — it works the same back, without needing anything to hang from.",
    setup: [
      "Lie face down on the floor or a mat, arms out in front or by your ears.",
      "Forehead down, neck long.",
    ],
    execution: [
      "Squeeze the glutes first, then lift the chest and the thighs a few inches off the floor.",
      "Hold for a second at the top with the shoulder blades pulled down and back.",
      "Lower under control. Small and controlled beats high and thrown.",
    ],
    watch:
      "Height is not the goal. Cranking the head back to get higher hinges the whole thing at one point in the lower back, which is the joint this is meant to protect rather than punish. Eyes stay down at the floor.",
    cues: ["Glutes first", "Long neck", "Low and controlled"],
    trains: ["spinal erectors", "glutes", "upper back"],
    masterAt: { reps: 15 },
  },
  {
    name: "Towel row in a doorway",
    family: "row",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10–12 per side",
    summary:
      "Holding a towel looped round a doorframe, leaning back on straight arms and pulling yourself upright. A rowing pattern that needs nothing but a door.",
    setup: [
      "Loop a towel around a doorframe or a solid handle at chest height and hold both ends.",
      "Walk the feet forward and lean back until the arms are straight and your weight is on the towel.",
      "Feet flat, body in one line from heel to head.",
    ],
    execution: [
      "Pull the shoulder blades together first, then bend the arms.",
      "Pull your chest toward the frame and pause.",
      "Lower back to straight arms under control.",
    ],
    watch:
      "Test the door and the towel with your weight before you commit to a set. Beyond that, the failure is the hips sagging back — one line from heel to head, the same as any other row.",
    cues: ["Blades first", "One straight line", "Test it first"],
    trains: ["upper back", "biceps", "grip"],
    perSide: true,
    masterAt: { reps: 12 },
  },
  {
    name: "Seated leg lifts",
    family: "core",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10",
    summary:
      "Sitting on the floor with the hands beside the hips, lifting the feet clear. The L-sit's work without needing anything to press down on for clearance.",
    setup: [
      "Sit on the floor with the legs straight out in front, hands flat beside the hips.",
      "Sit tall — think of a long spine rather than a rounded one.",
    ],
    execution: [
      "Press down through the hands and lift both heels a few inches off the floor.",
      "Hold for a beat with the legs straight and the toes pointed.",
      "Lower without letting them land heavily.",
    ],
    watch:
      "Shoulders push down away from the ears. Shrugging up into the position is what makes it feel impossible, and it puts the load into the neck rather than the trunk.",
    cues: ["Press the floor down", "Legs locked", "Shoulders down"],
    trains: ["compression strength", "hip flexors", "straight-arm shoulder strength"],
    masterAt: { reps: 10 },
  },
  {
    name: "Glute bridge march",
    family: "hinge",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10 per side",
    summary:
      "Holding the top of a glute bridge and lifting one knee at a time. What the hamstring work becomes when there is nowhere to anchor your feet.",
    setup: [
      "Lie on your back, knees bent, feet flat and close to the hips.",
      "Drive the hips up into a bridge and hold that height.",
    ],
    execution: [
      "Without letting the hips drop, lift one knee toward your chest.",
      "Place it back down and lift the other.",
      "One lift each side is two reps.",
    ],
    watch:
      "The hips must not drop and must not tilt. If either happens the exercise has become a slow bridge with leg movement in it, which trains nothing — go back to holding still.",
    cues: ["Hips stay up", "Hips stay level", "Slow"],
    trains: ["glutes", "hamstrings", "hip stability"],
    perSide: true,
    masterAt: { reps: 10 },
  },
  {
    name: "Calf raises",
    family: "jump",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "15–20",
    summary:
      "Rising onto the balls of the feet and lowering. What the jumping work becomes when there is no room to jump — the same ankles and calves, without leaving the floor.",
    setup: [
      "Stand tall, feet hip-width, fingertips on a wall for balance if you need them.",
      "On a step with the heels hanging off if you want more range.",
    ],
    execution: [
      "Rise as high onto the balls of the feet as you can and pause at the top.",
      "Lower slowly, all the way down.",
      "Weight stays over the big toe rather than rolling to the outside of the foot.",
    ],
    watch:
      "The bottom half is the half that matters. Bouncing at the top for speed gets you a number and no range — slow down and take the heel all the way to the floor between reps.",
    cues: ["All the way up", "All the way down", "Over the big toe"],
    trains: ["calves", "achilles resilience", "ankle strength"],
    masterAt: { reps: 20 },
  },
  {
    name: "Seated forward fold",
    family: "spine",
    track: "groundwork",
    tier: 0,
    metric: "time",
    dose: "60 s",
    summary:
      "Sitting with the legs straight and folding forward over them. The unloaded version of the Jefferson curl's position, for when there is nothing to hold.",
    setup: [
      "Sit on the floor with the legs straight out in front, or on a folded cushion if your back rounds hard immediately.",
      "Sit tall first, then begin.",
    ],
    execution: [
      "Hinge forward from the hips and reach toward the feet.",
      "Let the spine round gently, one segment at a time, rather than holding it rigid.",
      "Breathe out at the end of the range. Come out of it slowly.",
    ],
    watch:
      "Never pull yourself down with your arms into a position your hamstrings have not agreed to. This is a place to breathe, not a place to win — the stretch that hurts is the one you feel for three days.",
    cues: ["Hinge, then round", "Breathe out to go further", "Never force it"],
    trains: ["hamstrings", "spinal flexion", "posterior chain range"],
    masterAt: { seconds: 60 },
  },

  {
    name: "Arm circles",
    family: "vertical_push",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10 each way",
    summary: "Circling the arms to move the shoulder through its range before it has to work.",
    setup: ["Stand tall, arms out to the sides at shoulder height."],
    execution: [
      "Small circles forward, growing to as large as the shoulder will go.",
      "Then the same backwards.",
    ],
    watch:
      "Ribs stay down. Arching the lower back to get the arms further round borrows range from a joint that should not be lending any.",
    cues: ["Small to large", "Ribs down"],
    trains: ["shoulder warm-up", "blood into the joint"],
    masterAt: { reps: 10 },
  },
  {
    name: "Shoulder circles with towel",
    family: "vertical_push",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10",
    summary:
      "Holding a towel wide in both hands and taking it over your head and behind you, then back. A shoulder dislocate, done with something that has slack in it.",
    setup: ["Hold a towel or a band in both hands, much wider than your shoulders."],
    execution: [
      "Keep the arms straight and lift the towel overhead.",
      "Continue back and down behind you as far as it goes comfortably.",
      "Reverse it. Widen the grip if it feels pinched, never force it narrower.",
    ],
    watch:
      "Wider is easier and there is no prize for a narrow grip. Forcing a grip your shoulders cannot take is the classic way to irritate the front of the joint doing a warm-up.",
    cues: ["Straight arms", "Wider if it pinches", "Slow"],
    trains: ["overhead shoulder range"],
    masterAt: { reps: 10 },
  },
  {
    name: "Scapula push-ups",
    family: "push",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10",
    summary:
      "A push-up position where only the shoulder blades move — sinking between them, then pushing back apart. Arms stay straight throughout.",
    setup: ["Push-up position, on the knees if that is easier, arms locked straight."],
    execution: [
      "Let your chest sink between your shoulder blades without bending the elbows.",
      "Then push the floor away so the upper back rounds and the blades spread apart.",
    ],
    watch:
      "The elbows do not bend. The moment they do this becomes a very short push-up and stops training the one thing it is for, which is the shoulder blade moving on the ribcage.",
    cues: ["Elbows locked", "Only the blades move", "Push the floor away"],
    trains: ["scapular control", "serratus"],
    masterAt: { reps: 10 },
  },
  {
    name: "Cat-cow",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10",
    summary: "On all fours, rounding and arching the back in turn, one segment at a time.",
    setup: ["Hands under shoulders, knees under hips."],
    execution: [
      "Round the back upward and tuck the chin, starting from the tailbone.",
      "Then reverse: tailbone tips, the arch travels up, chest opens, head last.",
    ],
    watch:
      "Move segment by segment rather than hinging in one place. Almost everyone bends at the same two spots and leaves the rest still, which is the thing this is meant to undo.",
    cues: ["Start at the tailbone", "One segment at a time", "Head last"],
    trains: ["spinal segmentation", "warm-up for the back"],
    masterAt: { reps: 10 },
  },
  {
    name: "Thread the needle",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "8 per side",
    summary:
      "On all fours, sliding one arm underneath your body and letting the shoulder come to the floor.",
    setup: ["Hands under shoulders, knees under hips."],
    execution: [
      "Slide one arm under your chest, palm up, as far as it goes.",
      "Let that shoulder and the side of your head rest on the floor.",
      "Press gently with the other hand to add rotation, then come back.",
    ],
    watch:
      "The hips stay square over the knees. Letting them swing round turns the rotation into a lean and takes it out of the upper back, which is where you wanted it.",
    cues: ["Hips square", "Shoulder to the floor", "Breathe"],
    trains: ["thoracic rotation", "shoulder range"],
    perSide: true,
    masterAt: { reps: 8 },
  },
  {
    name: "Wall slides",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10",
    summary:
      "Standing against a wall with your arms in a goalpost shape and sliding them up and down while keeping every point of contact.",
    setup: [
      "Back against a wall, feet a little way out from it.",
      "Lower back, upper back and head all touching. Arms up, elbows and wrists on the wall.",
    ],
    execution: [
      "Slide the arms up as far as they go without anything peeling off the wall.",
      "Slide back down until the elbows are level with your ribs.",
    ],
    watch:
      "The wrists and the lower back are where this is cheated. If the back arches away from the wall to get the arms higher, you have swapped shoulder range for lumbar range and gained nothing — stop where the contact stops.",
    cues: ["Everything stays on the wall", "Stop where contact stops", "Slow"],
    trains: ["overhead shoulder range", "upper back position"],
    masterAt: { reps: 10 },
  },
  {
    name: "Doorway chest stretch",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "time",
    dose: "30 s per side",
    summary: "Forearm on a doorframe, turning away from it to open the front of the shoulder.",
    setup: ["Stand in a doorway, forearm flat on the frame, elbow at about shoulder height."],
    execution: ["Step through gently and turn your chest away until you feel the front open.", "Breathe and hold."],
    watch:
      "Gently, and never into anything sharp. The front of the shoulder is a place where a stretch that pinches is telling you something rather than being a stretch you should push through.",
    cues: ["Turn away, don't lean", "Nothing sharp", "Breathe"],
    trains: ["chest and front shoulder length"],
    perSide: true,
    masterAt: { seconds: 30 },
  },
  {
    name: "Child's pose",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "time",
    dose: "60 s",
    summary: "Kneeling and sitting back onto your heels with the arms stretched out in front.",
    setup: ["Kneel with the knees apart and the big toes together."],
    execution: ["Sit back toward your heels and walk the hands forward.", "Let the head rest down and breathe into your back."],
    watch:
      "If the knees complain, put a cushion behind them or between your heels and hips. This is the cooldown and it should not hurt anywhere.",
    cues: ["Knees wide", "Breathe into the back", "Let go"],
    trains: ["lats", "lower back decompression", "coming down from a session"],
    masterAt: { seconds: 60 },
  },
  {
    name: "Hip circles",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10 each way",
    summary: "Standing on one leg and drawing circles with the other knee to warm the hip joint.",
    setup: ["Hold something for balance. Stand on one leg, other knee lifted to hip height."],
    execution: ["Draw a circle with the lifted knee, out and around.", "Ten one way, ten the other, then the other leg."],
    watch: "Keep the standing side quiet. If the whole body is swaying to move the knee, make the circles smaller.",
    cues: ["Big knee, quiet body", "Both directions"],
    trains: ["hip warm-up"],
    perSide: true,
    masterAt: { reps: 10 },
  },
  {
    name: "Leg swings",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10 per side",
    summary: "Swinging one leg forward and back, then side to side, holding something for balance.",
    setup: ["Hold a wall or a doorframe, stand tall on one leg."],
    execution: ["Swing the free leg forward and back, relaxed, letting the range grow over the reps.", "Then across the body and out to the side."],
    watch:
      "Swing, don't kick. Forcing the end of a swing on a cold hamstring is one of the few genuinely counterproductive things you can do in a warm-up.",
    cues: ["Relaxed", "Let the range grow", "Never force the end"],
    trains: ["hip warm-up", "dynamic range"],
    perSide: true,
    masterAt: { reps: 10 },
  },
  {
    name: "90/90 hip switches",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "10 per side",
    summary:
      "Sitting with one shin in front and one out to the side, then rotating both knees across to swap.",
    setup: ["Sit with the front shin at 90° across you and the back shin at 90° out to the side."],
    execution: ["Keeping both feet where they are, drop both knees across to the other side.", "Chest stays tall throughout."],
    watch:
      "Hands are for balance, not for hauling yourself round. If you cannot get across without pushing, sit up on a cushion — height makes this possible.",
    cues: ["Chest tall", "Knees lead", "Cushion if you need it"],
    trains: ["hip internal and external rotation"],
    perSide: true,
    masterAt: { reps: 10 },
  },
  {
    name: "Spiderman lunge with rotation",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "8 per side",
    summary:
      "A deep lunge with the hands on the floor, then reaching one arm up to the ceiling. In the plan from day one, and the movement the app is named after knows about.",
    setup: ["Start in a push-up position."],
    execution: [
      "Step one foot up outside your hand so you are in a deep lunge.",
      "Let the back hip sink.",
      "Reach the inside arm up toward the ceiling, following it with your eyes, then put it back down and swap.",
    ],
    watch:
      "The back leg stays long and the back hip sinks. Letting the back knee drop to the floor turns it into a comfortable rest position and takes the stretch out of the hip flexor, which was the point.",
    cues: ["Foot outside the hand", "Back hip down", "Eyes follow the hand"],
    trains: ["hip flexor length", "thoracic rotation", "adductors"],
    perSide: true,
    masterAt: { reps: 8 },
  },
  {
    name: "Couch stretch",
    family: "mobility",
    track: "groundwork",
    tier: 0,
    metric: "time",
    dose: "60 s per side",
    summary:
      "Kneeling with one shin up against a wall or a sofa and the other foot forward, opening the front of the back hip. Unpleasant and worth it.",
    setup: [
      "Kneel facing away from a sofa, put one shin up its front with the knee in the crease.",
      "Other foot flat on the floor in front of you.",
      "Cushion under the down knee.",
    ],
    execution: ["Squeeze the back glute and tuck the hips under.", "Come upright as far as you can hold, and breathe."],
    watch:
      "Tuck the hips under before coming upright. Without the tuck, the arch appears in your lower back and you feel nothing in the hip — which is the version most people do and then conclude does not work.",
    cues: ["Squeeze the glute", "Tuck first, then upright", "Breathe"],
    trains: ["hip flexor and quad length"],
    perSide: true,
    masterAt: { seconds: 60 },
  },
  {
    name: "Lateral raises",
    family: "vertical_push",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "3× 12",
    summary:
      "Lifting dumbbells out to the sides to shoulder height. Phase 2 gives this an extra set — the document calls the shoulders and lats the V-silhouette that fills the suit, and this is the shoulder half.",
    setup: ["Stand tall, a dumbbell in each hand at your sides, elbows very slightly bent."],
    execution: [
      "Lift both arms out to the sides until they are level with your shoulders.",
      "Lead with the elbows, not the hands.",
      "Lower slowly — the lowering is most of the work.",
    ],
    watch:
      "Light weight, no swinging. Using enough load that the hips have to help turns a shoulder exercise into a back exercise done badly; if you cannot stop the swing, the dumbbells are too heavy.",
    cues: ["Lead with the elbows", "No swing", "Slow down"],
    trains: ["side deltoid", "shoulder width"],
    needs: LOAD,
    loaded: true,
    masterAt: { reps: 12 },
  },
  {
    name: "Dumbbell shoulder press",
    family: "vertical_push",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "3× 10",
    summary:
      "Pressing dumbbells overhead. The loaded overhead press that runs alongside the pike push-up strand rather than on it — this one progresses by adding kilograms, not by changing shape.",
    setup: ["Stand or sit tall, dumbbells at shoulder height, palms facing forward."],
    execution: [
      "Press both overhead until the arms lock, without the ribs flaring.",
      "Bring them back down to shoulder height under control.",
    ],
    watch:
      "Ribs down and glutes tight. Leaning back to get the weight up turns an overhead press into a standing incline press and puts the load into your lower back — if that is the only way it goes up, it is too heavy.",
    cues: ["Ribs down", "Squeeze the glutes", "Lock out overhead"],
    trains: ["shoulders", "triceps", "overhead strength"],
    needs: LOAD,
    loaded: true,
    masterAt: { reps: 10 },
  },
  {
    name: "Single-arm dumbbell row",
    family: "row",
    track: "groundwork",
    tier: 0,
    metric: "reps",
    dose: "3× 10 per side",
    summary:
      "Rowing a dumbbell to your hip with one hand supported. The loaded row that runs alongside the inverted-row strand.",
    setup: [
      "One hand and one knee on a bench or a sofa, back flat and roughly parallel to the floor.",
      "Dumbbell in the free hand, arm hanging straight down.",
    ],
    execution: [
      "Pull the dumbbell to your hip, leading with the elbow.",
      "The shoulder blade moves first, the arm second.",
      "Lower all the way until the arm is straight again.",
    ],
    watch:
      "The torso does not rotate. Turning the shoulder up to finish the rep is how you get the weight moving without the back doing it, and it is the difference between this building lats and it building nothing.",
    cues: ["Blade first, arm second", "Elbow to the hip", "Torso stays flat"],
    trains: ["lats", "mid back", "grip"],
    needs: LOAD,
    loaded: true,
    perSide: true,
    masterAt: { reps: 10 },
  },
];

// ─────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────

const BY_KEY = new Map<string, Movement>();
for (const m of MOVEMENTS) {
  BY_KEY.set(movementKey(m.name), m);
  for (const alias of m.aliases ?? []) BY_KEY.set(movementKey(alias), m);
}

/** Resolves a logged or prescribed name, including names used in past versions. */
export function findMovement(name: string): Movement | null {
  return BY_KEY.get(movementKey(name)) ?? null;
}

export function isGroundwork(m: Movement): boolean {
  return m.track === "groundwork";
}

/** Every rung in a strand, easiest first. Groundwork is not a rung. */
export function ladder(family: MovementFamily): Movement[] {
  return MOVEMENTS.filter((m) => m.family === family && !isGroundwork(m)).sort(
    (a, b) => a.tier - b.tier,
  );
}

/** The always-open work of a family, in the order it is listed. */
export function groundwork(family: MovementFamily): Movement[] {
  return MOVEMENTS.filter((m) => m.family === family && isGroundwork(m));
}

/**
 * Strands that form a progression, in the order the web shows them.
 *
 * Roughly: what you press, what you pull, what your legs do, then the skills.
 * The skill strands sit last because they are the ones that open latest — a
 * vault is not something to be looking at in week one.
 */
export const FAMILY_ORDER: MovementFamily[] = [
  "push",
  "vertical_push",
  "dip",
  "pull",
  "row",
  "core",
  "squat",
  "hinge",
  "lunge",
  "hold",
  "spine",
  "hips",
  "mobility",
  "conditioning",
  "handstand",
  "crawl",
  "jump",
  "roll",
  "acro",
  "kipup",
  "vault",
];

/**
 * Families that are a progression. `mobility` is deliberately not one: after
 * the range work split into spine and hips it holds only groundwork, and a
 * strand of stretches you unlock in order would be a lie about how they work.
 */
export const LADDER_FAMILIES: MovementFamily[] = FAMILY_ORDER.filter(
  (f) => ladder(f).length > 0,
);

/** Families with always-open work under them, in the same display order. */
export const GROUNDWORK_FAMILIES: MovementFamily[] = FAMILY_ORDER.filter(
  (f) => groundwork(f).length > 0,
);

export function familyOf(name: string): MovementFamily | null {
  return findMovement(name)?.family ?? null;
}

/** Where a movement sits in its strand. */
export function tierOf(family: MovementFamily, name: string): number | null {
  const m = findMovement(name);
  return m && m.family === family ? m.tier : null;
}

/** Whether one set clears the bar. Not mastery on its own — see lib/skills.ts. */
export function setClears(
  m: Movement,
  reps: number | null,
  seconds: number | null,
  weightKg: number | null = null,
): boolean {
  // The load is a floor the set has to carry as well as the reps, not an
  // alternative to them. A heavy set of four is not a clean set of fifteen.
  if (m.masterAt.kg !== undefined && (weightKg ?? 0) < m.masterAt.kg) return false;
  if (m.masterAt.reps !== undefined) return (reps ?? 0) >= m.masterAt.reps;
  if (m.masterAt.seconds !== undefined) return (seconds ?? 0) >= m.masterAt.seconds;
  return false;
}

/** The bar for one set, as a phrase. */
export function setBarLabel(m: Movement): string {
  const load = m.masterAt.kg !== undefined ? ` at ${m.masterAt.kg} kg` : "";
  if (m.masterAt.reps !== undefined) return `${m.masterAt.reps} reps${load}`;
  if (m.masterAt.seconds !== undefined) return `${m.masterAt.seconds} s${load}`;
  return "—";
}

/** The whole requirement, as a phrase. */
export function masteryLabel(m: Movement): string {
  const sets = masterySets(m);
  const sessions = masterySessions(m);
  const weeks = masteryWeeks(m);
  const times = sessions === 1 ? "once" : sessions === 2 ? "twice" : `${sessions} times`;
  return `${sets}\u00d7${setBarLabel(m)}, ${times} across ${weeks} weeks`;
}
