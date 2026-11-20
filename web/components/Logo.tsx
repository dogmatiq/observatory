/**
 * The Dogmatiq wordmark, as an SVG path that is filled with the current text
 * color. It is the wordmark of the brand: every letter is one pen stroke, the
 * bowls stop short of their stems, and the descender of the q is cut at an angle.
 * The view box is cropped to its bounds.
 */
const viewBox = "0 -186 1036 252";
const path =
	"M100 -160L124 -184V-60A62 62 0 1 1 76 -120.4V-95.33A38 38 0 1 0 100 -60ZM147 -60A62 62 0 1 1 271 -60" +
	"A62 62 0 1 1 147 -60ZM171 -60A38 38 0 1 0 247 -60A38 38 0 1 0 171 -60ZM287 64H367A44 44 0 0 0 411 20" +
	"V-60A62 62 0 1 0 363 0.4V-24.67A38 38 0 1 1 387 -60V20A20 20 0 0 1 367 40H287ZM441 -70A50 50 0 0 1 5" +
	"41 -70V0H517V-70A26 26 0 0 0 465 -70V0H441ZM517 -70A50 50 0 0 1 617 -70V0H593V-70A26 26 0 0 0 541 -7" +
	"0V0H517ZM740 0L764 0V-60A62 62 0 1 0 716 0.4V-24.67A38 38 0 1 1 740 -60ZM794 -184H818V0H794ZM794 -12" +
	"0H842V-96H794ZM865 -120H889V0H865ZM865 -160H889V-136H865ZM1012 40L1036 64V-60A62 62 0 1 0 988 0.4V-2" +
	"4.67A38 38 0 1 1 1012 -60Z";

/**
 * Logo draws the Dogmatiq wordmark. It is decoration, so it is hidden from
 * assistive technology.
 */
export function Logo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox={viewBox} aria-hidden="true">
			<path d={path} />
		</svg>
	);
}
