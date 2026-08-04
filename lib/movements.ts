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
  /** Why this gate exists. Shown on the locked node. */
  why: string;
}

export interface MasteryBar {
  reps?: number;
  seconds?: number;
  /** Sets in one session that must clear the bar. */
  sets?: number;
  /** Separate sessions that must do that. */
  sessions?: number;
}

/**
 * Two sets, on two separate days.
 *
 * Two sets rather than the document's three because the baseline fortnight
 * prescribes two — asking for three would make the sweep incapable of advancing
 * anything, which is the opposite of what it is for. Two sessions rather than
 * one for the same reason the fortnight repeats itself: one reading is a guess.
 */
export const DEFAULT_MASTERY = { sets: 2, sessions: 2 } as const;

export function masterySets(m: Movement): number {
  return m.masterAt.sets ?? DEFAULT_MASTERY.sets;
}

export function masterySessions(m: Movement): number {
  return m.masterAt.sessions ?? DEFAULT_MASTERY.sessions;
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
   * Never a single set. The document's own rule is "only advance at a clean
   * 3×12" — a number you hit once is a good day, not a level. `sets` is how many
   * sets in one session must clear the bar; `sessions` is how many separate
   * sessions must do that. Both default to `DEFAULT_MASTERY`.
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
    name: "Push-ups against a wall",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Push-ups on a table",
    family: "push",
    tier: 1,
    metric: "reps",
    dose: "8–12",
    summary:
      "The same movement with your hands on a table. Lower hands mean more of your weight on your arms — the whole pressing strand is this one dial, turned down.",
    setup: [
      "Hands on a sturdy table, shoulder-width, at the edge so your chest can pass between them.",
      "Walk your feet back until your body is one line from heel to head.",
      "Check the table cannot slide before you load it.",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Push-ups on a chair",
    family: "push",
    tier: 2,
    metric: "reps",
    dose: "8–12",
    summary:
      "Hands on a chair seat. Noticeably harder than a table and the rung most people spend the longest on — that is normal and not a problem.",
    setup: [
      "Hands on the seat of a stable chair, against a wall if it slides.",
      "Feet back until you are one straight line.",
      "Hands under the shoulders, not out in front of them.",
    ],
    execution: [
      "Lower under control until your chest touches the seat.",
      "Pause for a moment at the bottom rather than bouncing.",
      "Press back up to straight arms.",
    ],
    watch:
      "Chest touches first. If the hips arrive first, go back a rung — that pattern gets grooved fast and is much harder to unlearn than it is to avoid.",
    cues: ["Ribs down", "Chest touches", "Push the floor away"],
    trains: ["chest", "front shoulder", "triceps", "trunk bracing"],
    masterAt: { reps: 12 },
    aliases: ["Elevated push-ups"],
  },
  {
    name: "Push-ups on the sofa edge",
    family: "push",
    tier: 3,
    metric: "reps",
    dose: "8–12",
    summary: "The last elevated rung before the floor. Roughly two thirds of your weight is on your hands here.",
    setup: [
      "Hands on the front edge of a sofa or a low step.",
      "Body in one line, feet together.",
    ],
    execution: [
      "Lower until the chest touches the edge.",
      "Press up without letting the hips drift up or down.",
    ],
    watch:
      "Full range or it doesn't count — halfway down is a different exercise, and it is the one that stops you progressing while feeling like work.",
    cues: ["All the way down", "Hips level", "Drive through the palms"],
    trains: ["chest", "front shoulder", "triceps", "trunk bracing"],
    masterAt: { reps: 12 },
  },
  {
    name: "Push-ups",
    family: "push",
    tier: 4,
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
    masterAt: { reps: 12 },
    aliases: ["Deficit push-ups on parallettes"],
  },
  {
    name: "Diamond push-ups",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Archer push-ups",
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
    masterAt: { reps: 10 },
  },
  {
    name: "Clap push-ups",
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
    masterAt: { reps: 8 },
  },

  // ── Overhead ──────────────────────────────────────────────
  {
    name: "Pike push-ups on a chair",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Pike push-ups",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Pike push-ups elevated",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Handstand push-up negatives",
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
    masterAt: { reps: 5 },
  },

  // ── Dips ──────────────────────────────────────────────────
  {
    name: "Triceps dips on chair edge, feet forward",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Triceps dips on chair edge",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Dips between two chairs",
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
    masterAt: { reps: 12 },
    aliases: ["Ring dips"],
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
    masterAt: { seconds: 30 },
    aliases: ["Ring hang"],
  },
  {
    name: "Negative pull-ups",
    family: "pull",
    tier: 1,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Pull-ups",
    family: "pull",
    tier: 2,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Explosive pull-ups",
    family: "pull",
    tier: 3,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Muscle-up progression",
    family: "pull",
    tier: 4,
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
        reps: 8,
        why: "Dips first. The top half of a muscle-up is a dip out of the deepest position there is, and arriving there without one leaves you stuck on the bar with your shoulders taking the wait.",
      },
    ],
    masterAt: { reps: 3 },
  },

  // ── Rowing ────────────────────────────────────────────────
  {
    name: "Inverted rows under a table",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Inverted rows",
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
    masterAt: { reps: 12 },
    aliases: ["Ring rows"],
  },
  {
    name: "Archer rows",
    family: "row",
    tier: 2,
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
    masterAt: { reps: 10 },
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
    masterAt: { reps: 10 },
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
    masterAt: { seconds: 45 },
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
    masterAt: { seconds: 30 },
  },
  {
    name: "L-sit tuck",
    family: "core",
    tier: 3,
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
    masterAt: { seconds: 15 },
  },
  {
    name: "Hanging knee raises",
    family: "core",
    tier: 4,
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
    masterAt: { reps: 10 },
  },
  {
    name: "L-sit",
    family: "core",
    tier: 5,
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
    masterAt: { seconds: 10 },
  },
  {
    name: "Dragon flag negatives",
    family: "core",
    tier: 6,
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
    masterAt: { reps: 5 },
  },

  // ── Squatting ─────────────────────────────────────────────
  {
    name: "Bodyweight squats",
    family: "squat",
    tier: 0,
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
    masterAt: { reps: 20 },
    aliases: ["Bodyweight squat, slow tempo"],
  },
  {
    name: "Goblet squat",
    family: "squat",
    tier: 1,
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
      "Chest tall and elbows in. Letting the weight drift away from the body turns a leg exercise into a lower-back one.",
    cues: ["Weight at the chest", "Elbows inside the knees", "Chest tall"],
    trains: ["quads", "glutes", "upper back posture", "squat depth"],
    needs: LOAD,
    loaded: true,
    masterAt: { reps: 15 },
  },
  {
    name: "Split squat",
    family: "squat",
    tier: 2,
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
    masterAt: { reps: 12 },
  },
  {
    name: "Bulgarian split squats",
    family: "squat",
    tier: 3,
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
    masterAt: { reps: 12 },
  },
  {
    name: "Pistol squat progression",
    family: "squat",
    tier: 4,
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
    masterAt: { reps: 5 },
  },

  // ── Hinging ───────────────────────────────────────────────
  {
    name: "Glute bridges",
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
    masterAt: { reps: 20 },
  },
  {
    name: "Romanian deadlift",
    family: "hinge",
    tier: 1,
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
      "Stop the moment the lower back rounds. That is the number, whatever it is — this is the movement where ego costs the most.",
    cues: ["Hips back, not down", "Long back", "Weights close to the legs"],
    trains: ["hamstrings", "glutes", "spinal position under load"],
    needs: LOAD,
    loaded: true,
    masterAt: { reps: 12 },
  },
  {
    name: "Single-leg Romanian deadlift",
    family: "hinge",
    tier: 2,
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
    masterAt: { reps: 10 },
  },
  {
    name: "Nordic curl negatives",
    family: "hinge",
    tier: 3,
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
    masterAt: { reps: 5 },
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
    masterAt: { seconds: 60 },
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
    masterAt: { seconds: 60 },
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
    masterAt: { seconds: 30 },
  },
  {
    // The middle step of the document's handstand protocol — "Wall Handstand →
    // Kickup zur Wand mit Rücken zur Wand → kurzes Ablösen von der Wand" — which
    // the catalogue had skipped straight over.
    name: "Kick-up to the wall",
    family: "handstand",
    tier: 1,
    metric: "time",
    dose: "5 min",
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
    masterAt: { seconds: 30 },
  },
  {
    name: "Freestanding handstand attempts",
    family: "handstand",
    tier: 2,
    metric: "time",
    dose: "5 min",
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
    masterAt: { seconds: 10 },
  },

  // ── Crawling ──────────────────────────────────────────────
  {
    name: "Bear crawl",
    family: "crawl",
    tier: 0,
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
    masterAt: { seconds: 45 },
  },
  {
    name: "Spider crawl",
    family: "crawl",
    tier: 1,
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
    masterAt: { seconds: 30 },
  },

  // ── Jumping ───────────────────────────────────────────────
  {
    name: "Squat jumps",
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
    masterAt: { reps: 12 },
  },
  {
    name: "Broad jumps",
    family: "jump",
    tier: 1,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Precision jumps",
    family: "jump",
    tier: 2,
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
        reps: 5,
        why: "A precision jump you miss is a fall forward. Learn to roll out of one before you start jumping onto edges.",
      },
    ],
    masterAt: { reps: 5 },
  },

  // ── Falling ───────────────────────────────────────────────
  // The strand this whole catalogue was missing. The document prescribes
  // "Schulterrolle, 10 pro Seite" from the first Friday and then, one line
  // later, explains how it is actually learned: "Erst langsam aus der Hocke,
  // dann aus dem Stand, dann aus dem Gehen." Those three steps are rungs 2, 3
  // and 4 below. Rungs 0 and 1 are EXTRAPOLATED — the document starts from a
  // crouch, and a crouch is already a fall for someone who has never rolled.
  {
    name: "Rock-backs",
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
    masterAt: { reps: 10 },
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
    masterAt: { reps: 5 },
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
    masterAt: { reps: 5 },
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
    masterAt: { reps: 5 },
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
    masterAt: { reps: 5 },
    aliases: ["Shoulder roll"],
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
        reps: 5,
        why: "You will fall out of early cartwheels sideways. Being able to roll out of one turns that into a non-event.",
      },
    ],
    masterAt: { reps: 5 },
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
    masterAt: { reps: 5 },
  },

  // ── Getting up ────────────────────────────────────────────
  // The document is unusually explicit here: "Zuerst zum Sitzen, dann in die
  // Hocke, dann in den Stand. Mehrere Monate Arbeit, absolut machbar." Three
  // rungs, and it says outright that it takes months — which is exactly why it
  // should not have been one line item arriving in a Friday session.
  {
    name: "Kip-up to sitting",
    family: "kipup",
    tier: 0,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Kip-up to a crouch",
    family: "kipup",
    tier: 1,
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
    masterAt: { reps: 5 },
    // The plan names the whole strand "Kip-up progression", and what it means by
    // it is checkpoint 3's target: into a crouch. Naming the middle rung leaves
    // the top one reachable, since placement never goes more than one above what
    // the plan asked for.
    aliases: ["Kip-up progression"],
  },
  {
    name: "Kip-up to standing",
    family: "kipup",
    tier: 2,
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
    masterAt: { reps: 3 },
  },

  // ── Obstacles ─────────────────────────────────────────────
  // From the document's optional Parkour-Basics Saturday, plus the wall run
  // that Phase 3's Friday adds. Ordered by how far off the ground you end up.
  {
    name: "Safety vault over a bench",
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
        reps: 5,
        why: "Vaults are the first thing in the plan where a mistake puts you on the floor moving forwards. Roll first.",
      },
    ],
    masterAt: { reps: 5 },
  },
  {
    name: "Wall run",
    family: "vault",
    tier: 1,
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
        reps: 3,
        why: "3 pull-ups first. The top of a wall run is a pull-up done tired, and arriving there without one leaves you hanging with nowhere to go.",
      },
    ],
    masterAt: { reps: 3 },
  },
  {
    name: "Kong vault",
    family: "vault",
    tier: 2,
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
    masterAt: { reps: 3 },
  },

  // ── Lunging ───────────────────────────────────────────────
  {
    name: "Reverse lunges",
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
    masterAt: { reps: 10 },
  },
  {
    name: "Cossack squat",
    family: "lunge",
    tier: 1,
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
    masterAt: { reps: 8 },
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
    masterAt: { reps: 10 },
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
    masterAt: { reps: 8 },
  },
  {
    name: "Pancake progression",
    family: "hips",
    tier: 0,
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
    masterAt: { seconds: 45 },
  },
  {
    name: "Bridge",
    family: "spine",
    tier: 2,
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
    masterAt: { seconds: 20 },
  },
  {
    name: "Pancake",
    family: "hips",
    tier: 1,
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
    masterAt: { seconds: 45 },
  },
  {
    name: "Bridge push-up",
    family: "spine",
    tier: 3,
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
    masterAt: { reps: 5 },
  },
  {
    name: "Active hip rotations",
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
    masterAt: { reps: 8 },
  },

  // ── Engine ────────────────────────────────────────────────
  {
    name: "Squat thrusts",
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
    masterAt: { reps: 8 },
  },
  {
    name: "Burpees",
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
        reps: 8,
        why: "8 floor push-ups first. A burpee has a push-up in the middle of it, and doing one you cannot yet do, tired, twenty-four times, is how a shoulder gets hurt on the easiest day of the week.",
      },
    ],
    masterAt: { reps: 8 },
  },

  // ═══════════════════════════════════════════════════════════
  // Groundwork — always open, never gated
  // ═══════════════════════════════════════════════════════════
  // Warm-ups, cooldowns, the mobility drills that sit under the range strand,
  // and the three dumbbell lifts whose progression is load rather than shape.
  // These carry a `masterAt` because the type asks for one and because the
  // number is a sensible target, but nothing unlocks from it.

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
export function setClears(m: Movement, reps: number | null, seconds: number | null): boolean {
  if (m.masterAt.reps !== undefined) return (reps ?? 0) >= m.masterAt.reps;
  if (m.masterAt.seconds !== undefined) return (seconds ?? 0) >= m.masterAt.seconds;
  return false;
}

/** The bar for one set, as a phrase. */
export function setBarLabel(m: Movement): string {
  if (m.masterAt.reps !== undefined) return `${m.masterAt.reps} reps`;
  if (m.masterAt.seconds !== undefined) return `${m.masterAt.seconds} s`;
  return "—";
}

/** The whole requirement, as a phrase. */
export function masteryLabel(m: Movement): string {
  const sets = masterySets(m);
  const sessions = masterySessions(m);
  return `${sets}\u00d7${setBarLabel(m)}, ${sessions === 1 ? "once" : sessions === 2 ? "twice" : `${sessions} times`}`;
}
