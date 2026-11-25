import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";
import { Page } from "./Page.tsx";
import { panelClasses } from "./Popover.tsx";

/**
 * Review is a page of tiles under review, which are its children, with the
 * decisions that the dev server keeps. The tiles are reviewed one at a time, in
 * order: see [Sequence]. It has a button that draws everything again, from the
 * start, so that an animation can be watched again.
 */
export function Review({ children }: { children: ReactNode }) {
	// The tiles are drawn again, from the start, when it changes.
	const [run, setRun] = useState(0);
	const accepted = useAccepted();

	return (
		<Accepted.Provider value={accepted}>
			<Page>
				<div className="mb-8 flex items-center justify-between gap-4">
					<p className="text-muted">
						Each tile under review, whole and then part by part, from its icon
						to its chart. Animations play when the page opens, and again when
						they are replayed.
					</p>
					<button
						type="button"
						className="flex-none cursor-pointer rounded-control border border-line bg-panel px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong"
						onClick={() => setRun((n) => n + 1)}
					>
						Replay animations
					</button>
				</div>
				<div key={run} className="grid gap-16">
					<Sequence>{children}</Sequence>
				</div>
			</Page>
		</Accepted.Provider>
	);
}

/** The code of the tile that the parts inside it are of, for their IDs. */
const TileCode = createContext("");

/**
 * Tile is the part of the page about one tile: its states, and then its parts, in
 * the order that they are reviewed. `code` is the start of the ID of each state
 * that is drawn inside it, such as "CL" for "CL 4A".
 */
type TileProps = {
	code: string;
	title: string;
	note: string;
	children: ReactNode;
};

export function Tile({ code, title, note, children }: TileProps) {
	const { ids } = useContext(Accepted);
	const settled = tileSettled(code, children, ids);

	// Only one part is open for review at a time: the parts before it are
	// settled, and those after it wait for it, and are named.
	const parts = Children.toArray(children).filter(
		(c): c is ReactElement<PartProps> => isValidElement(c) && c.type === Part,
	);
	const first = parts.findIndex((p) => !partSettled(code, p.props, ids));
	const waiting =
		first === -1
			? []
			: parts.slice(first + 1).filter((p) => !partSettled(code, p.props, ids));
	const later = new Set(waiting.map((p) => p.props.step ?? 0));
	const shown = Children.toArray(children).filter(
		(c) =>
			!(
				isValidElement<PartProps>(c) &&
				c.type === Part &&
				later.has(c.props.step ?? 0)
			),
	);

	return (
		<Collapsible
			settled={settled}
			className="grid gap-8"
			summary={
				<div>
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<ReviewId id={code} />
						{title}
						{settled && <Decision decided />}
					</h2>
					<p className="text-muted">{note}</p>
				</div>
			}
		>
			<TileCode.Provider value={code}>
				{shown}
				{waiting.length > 0 && (
					<p className="text-sm text-muted">
						Still to come in this tile, each once the one before it is decided:{" "}
						{waiting
							.map((p) => `${code} ${p.props.step ?? 0}, ${p.props.title}`)
							.join("; ")}
						.
					</p>
				)}
			</TileCode.Provider>
		</Collapsible>
	);
}

/**
 * tileSettled returns true if every part of the tile with the given code and
 * children is settled. See [partSettled].
 */
function tileSettled(
	code: string,
	children: ReactNode,
	ids: ReadonlySet<string>,
): boolean {
	const parts = Children.toArray(children).filter(
		(c): c is ReactElement<PartProps> => isValidElement(c) && c.type === Part,
	);

	return (
		parts.length > 0 &&
		parts.every((part) => partSettled(code, part.props, ids))
	);
}

/**
 * Sequence is tiles that are reviewed one at a time, in order, because each
 * depends on the decisions about those before it, and because one part is as much
 * as a reviewer takes in at a sitting. It shows the settled tiles and the first
 * that isn't, which shows only its first part that isn't settled, and names the
 * tiles still to come, so that nothing is reviewed on top of something that may
 * change.
 */
export function Sequence({ children }: { children: ReactNode }) {
	const { ids } = useContext(Accepted);
	const tiles = Children.toArray(children).filter(
		(c): c is ReactElement<TileProps> => isValidElement(c) && c.type === Tile,
	);
	const first = tiles.findIndex(
		(t) => !tileSettled(t.props.code, t.props.children, ids),
	);
	const count = first === -1 ? tiles.length : first + 1;
	const later = tiles.slice(count);

	return (
		<>
			{tiles.slice(0, count)}
			{later.length > 0 && (
				<p className="text-sm text-muted">
					Still to come, each once the one before it is decided:{" "}
					{later.map((t) => `${t.props.code}, ${t.props.title}`).join("; ")}.
				</p>
			)}
		</>
	);
}

/**
 * Collapsible is a section of the page that can be collapsed to its heading. It
 * is collapsed while `settled`, until the reviewer opens or closes it.
 */
export function Collapsible({
	settled,
	summary,
	className,
	children,
}: {
	settled: boolean;
	summary: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useOpenUnlessSettled(settled);

	return (
		<details
			open={open}
			onToggle={(e) => {
				// The browser also says when the page opens or closes it, which
				// isn't the reviewer's choice.
				if (e.currentTarget.open !== open) {
					setOpen(e.currentTarget.open);
				}
			}}
		>
			<summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
				<Icon
					name="chevron"
					className={cn(
						"mt-1 size-4 flex-none text-muted transition-transform motion-reduce:transition-none",
						open && "rotate-90",
					)}
				/>
				<div className="min-w-0 flex-1">{summary}</div>
			</summary>
			<div className={cn("mt-4 pl-6", className)}>{children}</div>
		</details>
	);
}

/**
 * useOpenUnlessSettled keeps whether something is open. Until the reviewer opens
 * or closes it, it follows the decisions: closed while `settled`, and open
 * otherwise, so that something collapses as soon as it is fully decided, and
 * opens again if a decision is undone. Once the reviewer opens or closes it, it
 * stays as they left it.
 */
function useOpenUnlessSettled(settled: boolean) {
	const { loaded } = useContext(Accepted);
	const [choice, setChoice] = useState<boolean | undefined>(undefined);
	const open = choice ?? !(loaded && settled);

	return [open, setChoice] as const;
}

/**
 * partSettled returns true if everything in a part that asks for a decision has
 * one: the part is marked decided, or its recommendation and that of each of its
 * states that is under review is accepted, or one of a state's alternatives is
 * used in its place. A part with nothing to decide is settled only if it is
 * marked decided.
 */
function partSettled(
	tile: string,
	{ step, decided, recommendation, children }: PartProps,
	ids: ReadonlySet<string>,
): boolean {
	if (decided === true) {
		return true;
	}

	const part = `${tile} ${step ?? 0}`;
	const kids = Children.toArray(children);

	// The letters of the states whose alternatives one has been used in place of.
	const replaced = new Set(
		kids.flatMap((c) =>
			isValidElement<ChoicesProps>(c) &&
			c.type === Choices &&
			c.props.choices.some((_, i) => ids.has(`${part}${c.props.of}${i + 1}`))
				? [c.props.of]
				: [],
		),
	);

	const needs: boolean[] = [];
	if (recommendation !== undefined) {
		needs.push(ids.has(part));
	} else if (decided === false) {
		needs.push(false);
	}
	kids.forEach((c, i) => {
		if (!isValidElement<StateProps>(c) || c.type !== State) {
			return;
		}
		const { decided: d, recommendation: r } = c.props;
		if (d === true) {
			return;
		}
		if (r !== undefined || d === false) {
			const letter = String.fromCharCode(65 + i);
			needs.push(ids.has(`${part}${letter}`) || replaced.has(letter));
		}
	});

	return needs.length > 0 && needs.every(Boolean);
}

/**
 * Part is one part of a tile, with what it shows in each of its states. `step` is
 * its place in the order of review, from the least specific to the most, and is 0
 * for the tile as a whole. Each state inside it is given an ID that is unique on
 * the page: the tile's code, the step, and a letter for its place, such as "CL 4A".
 * The states come before any choices, so that a state's letter is its place. A part that has anything open says what it shows that isn't being decided in it, and where that is decided instead, so that a reviewer doesn't judge it there. `decided` says whether the part is settled, or still under
 * review, if all of its states are one or the other; otherwise each state says.
 *
 * The states are in a grid whose rows are shared, so that the states in one row
 * line up, whatever the length of their notes.
 */
type PartProps = {
	step?: number;
	title: string;
	note?: string;

	/** What the reviewer is recommended to decide, if the part is under review. */
	recommendation?: string;

	children?: ReactNode;
} & (
	| {
			/** True if the whole part is settled, so it has nothing open to explain. */
			decided: true;
			deciding?: never;
			notDeciding?: never;
	  }
	| {
			decided?: false;

			/** What the reviewer is deciding here, said as plainly as possible. */
			deciding: string;

			/**
			 * What the part shows, or what is near it, that the reviewer is not
			 * deciding here, even though it is drawn, and where it is decided
			 * instead.
			 */
			notDeciding: string;
	  }
);

export function Part(props: PartProps) {
	const {
		step,
		title,
		note,
		decided,
		deciding,
		notDeciding,
		recommendation,
		children,
	} = props;
	const tile = useContext(TileCode);
	const { ids } = useContext(Accepted);
	const settled = partSettled(tile, props, ids);

	return (
		<Collapsible
			settled={settled}
			summary={
				<div>
					<h3 className="flex items-center gap-2 font-semibold">
						{step !== undefined && <ReviewId id={`${tile} ${step}`} />}
						<span>{title}</span>
						{settled ? (
							<Decision decided />
						) : (
							decided !== undefined && <Decision decided={decided} />
						)}
					</h3>
					{note && <p className="text-sm text-muted">{note}</p>}
					{deciding && (
						<p className="mt-1 text-sm text-muted">
							<span className="font-semibold text-fg-soft">Decided here:</span>{" "}
							{deciding}
						</p>
					)}
					{notDeciding && (
						<p className="mt-1 text-sm text-muted">
							<span className="font-semibold text-fg-soft">
								Not decided here:
							</span>{" "}
							{notDeciding}
						</p>
					)}
				</div>
			}
		>
			{recommendation && (
				<Recommendation id={`${tile} ${step ?? 0}`} className="mb-4">
					{recommendation}
				</Recommendation>
			)}
			{children && (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-x-6 gap-y-2">
					{Children.toArray(children).map((child, i) =>
						isValidElement<{ id?: string }>(child) && child.type === State
							? cloneElement(child, {
									id: `${tile} ${step ?? 0}${String.fromCharCode(65 + i)}`,
								})
							: isValidElement<{ part?: string }>(child) &&
									child.type === Choices
								? cloneElement(child, { part: `${tile} ${step ?? 0}` })
								: child,
					)}
				</div>
			)}
		</Collapsible>
	);
}

/**
 * State is one state of a part, with what causes it. It takes two rows of its
 * part's grid, one for its caption and one for what it shows, and shares them with
 * the states beside it, so that what they show starts at the same height.
 * `decided` says whether the state is settled, if its part doesn't say for all of
 * its states.
 */
/**
 * Precedent is the words of the equivalent of a state elsewhere: `where` it is,
 * whether those words are settled or still under review, and the words.
 */
export type Precedent = {
	where: string;
	status: "settled" | { underReview: string };
	words: ReactNode;
};

type StateProps = {
	/** The ID of the state on the page, which its part gives it. */
	id?: string;

	label: string;
	note?: string;

	/** True for a state that takes the whole width of its section. */
	wide?: boolean;

	decided?: boolean;

	/** What the reviewer is recommended to decide about this state, if anything. */
	recommendation?: string;

	/**
	 * The words of the same thing elsewhere, such as on the cluster view, quoted
	 * below what the state shows, so that the two can be compared.
	 */
	precedents?: readonly Precedent[];

	children: ReactNode;
};

export function State({
	id,
	label,
	note,
	wide = false,
	decided,
	recommendation,
	precedents,
	children,
}: StateProps) {
	const { ids } = useContext(Accepted);

	// A state with a recommendation is under review, unless it says otherwise, or
	// its recommendation is accepted.
	const accepted = id !== undefined && ids.has(id);
	const status =
		accepted || (decided ?? (recommendation === undefined ? undefined : false));

	// A decided state shows only its caption until it is opened.
	const [open, setOpen] = useOpenUnlessSettled(status === true);

	return (
		<figure
			className={cn(
				"row-span-2 grid grid-rows-subgrid",
				wide && "col-span-full",
			)}
		>
			<figcaption>
				<span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
					<button
						type="button"
						className="flex-none cursor-pointer text-muted"
						aria-expanded={open}
						aria-label={`${open ? "Collapse" : "Expand"} ${id ?? label}`}
						onClick={() => setOpen(!open)}
					>
						<Icon
							name="chevron"
							className={cn(
								"size-4 transition-transform motion-reduce:transition-none",
								open && "rotate-90",
							)}
						/>
					</button>
					{id !== undefined && <ReviewId id={id} />}
					{label}
					{status !== undefined && <Decision decided={status} />}
				</span>
				{note && <span className="block text-xs text-muted">{note}</span>}
				{recommendation && (
					<Recommendation id={id ?? label} className="mt-1.5">
						{recommendation}
					</Recommendation>
				)}
			</figcaption>
			<div className="mb-6">
				{open && children}
				{open &&
					precedents?.map((p) => (
						<blockquote
							key={p.where}
							className="mt-3 max-w-72 border-l-2 border-line-strong pl-3 text-xs text-muted"
						>
							<p className="font-semibold text-fg-soft">
								{p.where},{" "}
								{p.status === "settled"
									? "settled"
									: `under review at ${p.status.underReview}`}
								:
							</p>
							<div className="mt-1 flex flex-col gap-1">{p.words}</div>
						</blockquote>
					))}
			</div>
		</figure>
	);
}

/**
 * Choices is a row of alternatives to what a state of a part shows, such as other
 * wordings, below the part's states, so that they aren't read as more states, or
 * as a second decision. `of` is the letter of the state that they change, and each choice has
 * that state's ID with its own number, such as "CL 4C1". The state shows the
 * recommended choice, so the row holds only the others, each of which can be
 * accepted in its place. `title` says what is being chosen, as in "Choices for
 * the status".
 */
type ChoicesProps = {
	/** The ID of the part, which the part gives it. */
	part?: string;

	of: string;
	title: string;
	choices: readonly (readonly [label: string, shows: ReactNode])[];

	/** False if each choice draws its own frames, such as several cards. */
	framed?: boolean;
};

export function Choices({
	part,
	of,
	title,
	choices,
	framed = true,
}: ChoicesProps) {
	return (
		<div className="col-span-full mt-2 mb-4 rounded-card border border-dashed border-line-strong p-4">
			<h4 className="text-sm font-semibold text-fg-soft">
				Alternatives to {`${part}${of}`}, for {title}
			</h4>
			<p className="mb-3 text-xs text-muted">
				One decision: accept {`${part}${of}`} as it is, or one of these in its
				place.
			</p>
			<div
				className={cn(
					"grid items-start gap-x-6 gap-y-6",
					framed
						? "grid-cols-[repeat(auto-fill,minmax(280px,1fr))]"
						: "grid-cols-1",
				)}
			>
				{choices.map(([label, shows], i) => (
					<Alternative
						key={label}
						id={`${part}${of}${i + 1}`}
						to={`${part}${of}`}
						others={choices.map((_, j) => `${part}${of}${j + 1}`)}
						label={label}
					>
						{framed ? <Panel>{shows}</Panel> : shows}
					</Alternative>
				))}
			</div>
		</div>
	);
}

/**
 * Alternative is one of the alternatives to what the state `to` shows. It has a
 * quiet button that uses it in place of that state, and not a recommendation,
 * because the state carries the recommendation. Once the state, or any of
 * `others`, is accepted, the decision is made: the one chosen says so, and the
 * rest fade and lose their button.
 */
function Alternative({
	id,
	to,
	others,
	label,
	children,
}: {
	id: string;
	to: string;
	others: readonly string[];
	label: string;
	children: ReactNode;
}) {
	const { ids, accept, withdraw } = useContext(Accepted);
	const chosen = ids.has(id);
	const decided = ids.has(to) || others.some((o) => ids.has(o));

	return (
		<figure className={cn("grid gap-2", decided && !chosen && "opacity-40")}>
			<figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
				<ReviewId id={id} />
				{label}
			</figcaption>
			{children}
			{chosen ? (
				<span className="inline-flex items-center gap-2 text-xs">
					<span className="inline-flex items-center gap-1 font-semibold text-accent">
						<Icon name="check" className="size-3" />
						Used in place of {to}
					</span>
					<Undo id={id} withdraw={withdraw} />
				</span>
			) : (
				!decided && (
					<button
						type="button"
						className="justify-self-start cursor-pointer rounded-control border border-line bg-panel px-2 py-0.5 text-xs text-fg-soft hover:border-line-strong hover:text-fg"
						onClick={() => accept(id, `Use ${id} in place of ${to}.`)}
					>
						Use this instead
					</button>
				)
			)}
		</figure>
	);
}

/** How long the ID of a state shows that it has been copied, in milliseconds. */
const copiedTime = 1500;

/**
 * ReviewId is the ID of a tile, a part or a state on the page, in full, which a
 * click copies, so that it can be pasted into a review. A copy icon beside it says so, and is a tick for a moment once it
 * has copied.
 */
function ReviewId({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(id);
		} catch {
			// The page has no permission to write to the clipboard.
			return;
		}

		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), copiedTime);
	}

	return (
		<button
			type="button"
			className="inline-flex flex-none cursor-pointer items-center gap-1 rounded-control bg-sunk px-1.5 text-xs text-fg-soft transition-colors duration-150 hover:bg-line hover:text-fg motion-reduce:transition-none"
			aria-label={copied ? `Copied ${id}` : `Copy ${id}`}
			onClick={copy}
		>
			<span className="font-mono">{id}</span>
			<Icon name={copied ? "check" : "copy"} className="size-3" />
		</button>
	);
}

/**
 * Accepted is what the page knows of the recommendations that the reviewer has
 * accepted, by the ID of what each is about, and a way to accept one.
 */
const Accepted = createContext<{
	ids: ReadonlySet<string>;

	/** True once the decisions that the dev server keeps have been read. */
	loaded: boolean;

	accept: (id: string, recommendation: string) => void;
	withdraw: (id: string) => void;
}>({ ids: new Set(), loaded: false, accept: () => {}, withdraw: () => {} });

/**
 * acceptedIn returns the IDs of what the decisions that the dev server keeps
 * accept, as they stand after the last of them: a decision that withdraws an
 * acceptance undoes it. Anything that isn't such a decision is left out.
 */
function acceptedIn(decisions: unknown): ReadonlySet<string> {
	const ids = new Set<string>();
	if (!Array.isArray(decisions)) {
		return ids;
	}

	for (const d of decisions) {
		if (
			typeof d !== "object" ||
			d === null ||
			!("id" in d) ||
			typeof d.id !== "string" ||
			!("decision" in d)
		) {
			continue;
		}
		if (d.decision === "accepted") {
			ids.add(d.id);
		} else if (d.decision === "withdrawn") {
			ids.delete(d.id);
		}
	}

	return ids;
}

/**
 * useAccepted keeps the recommendations that the reviewer has accepted, which the
 * dev server keeps in a file that the agent that the review is with reads. Without
 * the dev server, such as in a test, nothing is accepted, and accepting does
 * nothing that lasts.
 */
function useAccepted() {
	const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
	const [loaded, setLoaded] = useState(false);

	const remember = (decisions: unknown) => setIds(acceptedIn(decisions));

	// The decisions are read again whenever the page is looked at again, because
	// the agent that the review is with may have changed the file meanwhile.
	useEffect(() => {
		const load = () =>
			fetch("/__review/decisions")
				.then((r) => r.json())
				.then((decisions) => setIds(acceptedIn(decisions)))
				.finally(() => setLoaded(true))
				.catch(() => {});

		load();
		window.addEventListener("focus", load);
		return () => window.removeEventListener("focus", load);
	}, []);

	const accept = (id: string, recommendation: string) => {
		setIds((before) => new Set([...before, id]));
		fetch("/__review/decisions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, decision: "accepted", recommendation }),
		})
			.then((r) => r.json())
			.then(remember)
			.catch(() => {});
	};

	const withdraw = (id: string) => {
		setIds((before) => new Set([...before].filter((i) => i !== id)));
		fetch("/__review/decisions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, decision: "withdrawn" }),
		})
			.then((r) => r.json())
			.then(remember)
			.catch(() => {});
	};

	return { ids, loaded, accept, withdraw };
}

/**
 * Recommendation is what the reviewer is recommended to decide about something
 * under review, `id`, in the accent color of being under review, with a button
 * that accepts it. Once it is accepted, the button says so.
 */
function Recommendation({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: string;
}) {
	const { ids, accept, withdraw } = useContext(Accepted);
	const accepted = ids.has(id);

	return (
		<div
			className={cn(
				"flex max-w-3xl items-start gap-3 rounded-control bg-accent-soft px-2.5 py-1.5 text-xs font-normal text-fg-soft",
				className,
			)}
		>
			<p className="flex-1">
				<span className="font-semibold text-accent">Recommendation: </span>
				{children}
			</p>
			{accepted ? (
				<span className="inline-flex flex-none items-center gap-2">
					<span className="inline-flex items-center gap-1 font-semibold text-accent">
						<Icon name="check" className="size-3" />
						Accepted
					</span>
					<Undo id={id} withdraw={withdraw} />
				</span>
			) : (
				<button
					type="button"
					className="flex-none cursor-pointer rounded-control bg-accent px-2 py-0.5 font-semibold text-[#fff] hover:opacity-90"
					aria-label={`Accept the recommendation for ${id}`}
					onClick={() => accept(id, children)}
				>
					Accept
				</button>
			)}
		</div>
	);
}

/**
 * Undo withdraws the acceptance of `id`, so that it is under review again.
 */
function Undo({
	id,
	withdraw,
}: {
	id: string;
	withdraw: (id: string) => void;
}) {
	return (
		<button
			type="button"
			className="cursor-pointer text-fg-soft underline decoration-dotted underline-offset-2 hover:text-fg"
			aria-label={`Undo the acceptance of ${id}`}
			onClick={() => withdraw(id)}
		>
			Undo
		</button>
	);
}

/**
 * Decision marks something as settled, in muted grey with a tick, or as still
 * under review, in the accent color, so that a review goes to what is open.
 */
function Decision({ decided }: { decided: boolean }) {
	return decided ? (
		<span className="inline-flex flex-none items-center gap-1 rounded-full bg-sunk px-2 py-0.5 whitespace-nowrap text-2xs font-semibold tracking-[0.06em] text-muted uppercase">
			<Icon name="check" className="size-3" />
			Decided
		</span>
	) : (
		<span className="inline-flex flex-none items-center rounded-full bg-accent-soft px-2 py-0.5 whitespace-nowrap text-2xs font-semibold tracking-[0.06em] text-accent uppercase">
			Under review
		</span>
	);
}

/** A popover where it stands, in the frame of a panel. */
export function Panel({ children }: { children: ReactNode }) {
	return <div className={`w-fit ${panelClasses}`}>{children}</div>;
}
