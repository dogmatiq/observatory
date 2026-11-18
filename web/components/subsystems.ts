import type { HandlerKind } from "../model.ts";

/**
 * A subsystem is a part of the engine that has a color: green for the cluster,
 * blue for queues and the messages in them, purple for event streams and
 * events, and gray for what belongs to none of them.
 */
export type Subsystem = "cluster" | "queues" | "streams" | "neutral";

/**
 * The classes that make an element and everything in it use a subsystem's colors.
 * They set the two custom properties that its charts, icons and bars read.
 *
 * Each class is written out in full, because Tailwind finds a class by reading
 * the source for it.
 */
export const subsystemColors: Record<Subsystem, string> = {
	cluster:
		"[--subsystem:var(--color-cluster)] [--subsystem-soft:var(--color-cluster-soft)]",
	queues:
		"[--subsystem:var(--color-queues)] [--subsystem-soft:var(--color-queues-soft)]",
	streams:
		"[--subsystem:var(--color-streams)] [--subsystem-soft:var(--color-streams-soft)]",
	neutral:
		"[--subsystem:var(--color-neutral)] [--subsystem-soft:var(--color-neutral-soft)]",
};

/**
 * handlerSubsystem returns the subsystem whose color a kind of handler takes,
 * which is that of the messages that it produces. Aggregates and integrations
 * record events, processes produce commands and deadlines, and projections
 * produce nothing.
 */
export function handlerSubsystem(kind: HandlerKind): Subsystem {
	switch (kind) {
		case "aggregate":
		case "integration":
			return "streams";
		case "process":
			return "queues";
		case "projection":
			return "neutral";
	}
}
