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
  | "crawl";

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

export interface Movement {
  name: string;
  family: MovementFamily;
  /** Depth in the family's strand. 0 is where everyone starts. */
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
  /** Clearing this is what unlocks the tier above. */
  masterAt: { reps?: number; seconds?: number };
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
    name: "Dragon flag negatives",
    family: "core",
    tier: 5,
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
    name: "Freestanding handstand attempts",
    family: "handstand",
    tier: 1,
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

/** Every movement in a strand, easiest first. */
export function ladder(family: MovementFamily): Movement[] {
  return MOVEMENTS.filter((m) => m.family === family).sort((a, b) => a.tier - b.tier);
}

/** Strands that actually form a progression, in the order the web shows them. */
export const LADDER_FAMILIES: MovementFamily[] = [
  "push",
  "vertical_push",
  "dip",
  "pull",
  "row",
  "core",
  "squat",
  "hinge",
  "hold",
  "handstand",
  "crawl",
  "jump",
];

export function familyOf(name: string): MovementFamily | null {
  return findMovement(name)?.family ?? null;
}

/** Where a movement sits in its strand. */
export function tierOf(family: MovementFamily, name: string): number | null {
  const m = findMovement(name);
  return m && m.family === family ? m.tier : null;
}

/** Whether a logged best clears the bar that unlocks the tier above. */
export function isMastered(m: Movement, bestReps: number | null, bestSeconds: number | null): boolean {
  if (m.masterAt.reps !== undefined) return (bestReps ?? 0) >= m.masterAt.reps;
  if (m.masterAt.seconds !== undefined) return (bestSeconds ?? 0) >= m.masterAt.seconds;
  return false;
}

/** The threshold, as a phrase. */
export function masteryLabel(m: Movement): string {
  if (m.masterAt.reps !== undefined) return `${m.masterAt.reps} clean reps`;
  if (m.masterAt.seconds !== undefined) return `${m.masterAt.seconds} s`;
  return "—";
}
