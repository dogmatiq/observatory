import { useId } from "react";
import { cn } from "../lib/cn.ts";

/**
 * How many stars the night sky has.
 */
const stars = 16;

/**
 * seeded returns a function that gives the same numbers between 0 and 1, in
 * the same order, for the same seed, so that a chart's sky is the same each time
 * that it is drawn.
 */
function seeded(seed: string): () => number {
	let state = 2166136261;
	for (const c of seed) {
		state = Math.imul(state ^ c.charCodeAt(0), 16777619);
	}

	return () => {
		state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
		state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
		return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
	};
}

/**
 * EmptySky fills the place of a chart that has nothing to draw. By day it has
 * a tumbleweed that rolls across now and then, and by night, which is the dark
 * color mode, it has stars that twinkle as well.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, like the chart that it stands in for, and takes no room. It draws
 * nothing that moves for a viewer who asks for less motion. It is decoration, so
 * it is hidden from assistive technology.
 */
export function EmptySky({ className }: { className?: string }) {
	const random = seeded(useId());

	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden",
				className,
			)}
			aria-hidden="true"
		>
			<div className="hidden dark:block">
				{Array.from({ length: stars }, () => {
					const x = random() * 100;
					const y = random() * 70;
					const size = 1 + Math.round(random());
					const duration = 2.5 + random() * 4;
					const delay = random() * -6;

					return (
						<span
							key={`${x}`}
							className="absolute rounded-full bg-fg motion-safe:animate-[twinkle_var(--twinkle)_ease-in-out_infinite] motion-reduce:opacity-30"
							style={{
								left: `${x}%`,
								top: `${y}%`,
								width: size,
								height: size,
								animationDelay: `${delay}s`,
								// biome-ignore lint/suspicious/noExplicitAny: a custom property
								...({ "--twinkle": `${duration}s` } as any),
							}}
						/>
					);
				})}
			</div>
			<span
				className="absolute bottom-1 hidden size-[18px] rounded-full border border-dashed border-faint motion-safe:block dark:border-muted motion-safe:animate-[tumble_80s_linear_infinite]"
				style={{ animationDelay: `${random() * -80}s` }}
			>
				<span className="absolute inset-[3px] rotate-45 rounded-full border border-dashed border-faint dark:border-muted" />
			</span>
		</div>
	);
}
