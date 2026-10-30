export const COMMANDS = [
  "init",
  "research",
  "draft",
  "check",
  "publish",
  "refresh",
  "run",
  "seed",
  "images",
  "card-images",
  "tours:import",
  "tours:check",
  "tours:describe",
  "tours:queue",
  "tours:enrich",
  "hotels:import",
  "hotels:enrich",
  "hotels:queue",
] as const;
export type Command = (typeof COMMANDS)[number];

export type Args = {
  command: Command;
  /** Most rows to process; positional `<n>` or `--max n`. */
  max: number;
  dryRun: boolean;
  /** check: grade only; a failing draft stays drafted instead of being redrafted. */
  noRedraft?: boolean;
  /** JSON file of Queue rows to use instead of the Queue tab (dry runs). */
  queueFile?: string;
  /** Only these Queue ids. */
  only?: string[];
  /** JSON file of Queue rows for `seed`. */
  file?: string;
  /** Overrides PIPELINE_BUDGET_USD. */
  budget?: number;
  /** images: also redo the --only rows that already have a hero. */
  redo?: boolean;
  /** images: apply the picks in this dry run's picks.json to the --only rows, without scoring again. */
  from?: string;
};

export const USAGE = `Usage: npm run pipeline -- <command> [n] [options]

Commands:
  init            create the Queue, Facts and Queries tabs if missing
  research <n>    research up to n queued rows
  draft <n>       draft up to n researched rows
  check <n>       grade up to n drafted rows
  publish <n>     publish up to n checked rows
  refresh <n>     re-research up to n published rows past refresh_after
  run             research, draft, check and publish in sequence
  seed --file <f> append Queue rows from a JSON array (skips existing ids)
  images <n>      hero images for up to n published rows with no hero_image
  card-images <n> card photos for up to n published tours and hotels with no image
  tours:import    Tours_Inbox URLs -> Tours rows, then enrich, describe, card photos and queue (the whole flow)
  hotels:import   Hotels_Inbox links -> Hotels rows, then enrich, card photos and queue (the whole flow)
  hotels:enrich   research imported hotels (town, stars, address, copy); publish those that pass
  hotels:queue    queue a hotel_roundup page per town (and region) with 3+ published hotels
  tours:enrich    fill in imported drafts from the GetYourGuide API; publish those that meet the rules
  tours:check     follow each published tour's /go/ link; set last_checked or link_flag
  tours:describe  write best_for and why_picked for published tours missing them
  tours:queue     queue a ranked_list page per region + category with 3+ published tours

Options:
  --max <n>          same as the positional n (default 10)
  --dry-run          read the Sheet but write nothing; drafts go to pipeline/.dry-run/
  --no-redraft       check only: grade, and leave a failing draft in drafted
  --queue-file <f>   use Queue rows from a JSON file instead of the Queue tab
  --only <ids>       comma-separated Queue ids (images: row slugs; card-images: tour or hotel ids)
  --redo             images, card-images: also redo the --only rows that already have a photo
  --from <picks>     images: apply the reviewed picks in a dry run's picks.json to the --only rows
  --budget <usd>     spend cap for this run (default PIPELINE_BUDGET_USD)`;

export function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as Command)) throw new Error(USAGE);

  const args: Args = { command: command as Command, max: 10, dryRun: false };
  const value = (i: number, flag: string) => {
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
    return v;
  };
  const positiveInt = (v: string, flag: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
    return n;
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-redraft") args.noRedraft = true;
    else if (arg === "--redo") args.redo = true;
    else if (arg === "--max") args.max = positiveInt(value(i++, arg), arg);
    else if (arg === "--queue-file") args.queueFile = value(i++, arg);
    else if (arg === "--file") args.file = value(i++, arg);
    else if (arg === "--from") args.from = value(i++, arg);
    else if (arg === "--only")
      args.only = value(i++, arg)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg === "--budget") {
      const n = Number(value(i++, arg));
      if (!(n > 0)) throw new Error("--budget must be a positive number");
      args.budget = n;
    } else if (/^\d+$/.test(arg)) args.max = positiveInt(arg, "n");
    else throw new Error(`Unknown argument ${arg}\n\n${USAGE}`);
  }
  if (args.queueFile && !args.dryRun)
    throw new Error("--queue-file is only allowed with --dry-run");
  // A typo must not redo every page on the site.
  if (args.redo && !(args.command === "images" && args.only?.length))
    throw new Error("--redo needs the images command and --only <slugs>");
  // Applying reviewed picks must name exactly the pages that were approved.
  if (args.from && !(args.command === "images" && args.only?.length))
    throw new Error("--from needs the images command and --only <slugs>");
  return args;
}
