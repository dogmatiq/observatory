import { cn } from "../lib/cn.ts";
import { Identifier } from "./Identifier.tsx";

/**
 * DigestKey is the identity key of the thing that a digest is about, shortened
 * and copyable, which is there only while the digest is pointed at, or anything
 * in it has the keyboard's focus, and always on a screen that is touched.
 *
 * If `keepsRoom`, its room is kept while it is not there, so that nothing moves
 * when it appears. Otherwise it takes its room from what is beside it when it
 * appears, for a digest too narrow to keep room for it.
 *
 * It is made to be inside the digest, which has the `group/digest` class, so
 * that pointing at the digest, or focusing anything in it, shows the key.
 */
export function DigestKey({
	id,
	what,
	keepsRoom,
}: {
	id: string;
	what: string;
	keepsRoom: boolean;
}) {
	return (
		<span
			className={cn(
				"flex-none items-center tracking-normal normal-case",
				keepsRoom
					? "invisible flex group-focus-within/digest:visible group-hover/digest:visible pointer-coarse:visible"
					: "hidden group-focus-within/digest:flex group-hover/digest:flex pointer-coarse:flex",
			)}
		>
			<Identifier id={id} what={what} named />
		</span>
	);
}
