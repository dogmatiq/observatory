import type { Chart, SiteApplication, SiteData } from "../model.ts";

/**
 * What a site's page shows, for designing it at the scale that the Observatory is
 * designed for, which is about a hundred applications at a site. It is not live
 * data. The numbers are made up, and are the same each time.
 */

/** The names of the applications, in the order of their names. */
const names = [
	"accounts",
	"address-book",
	"alerts",
	"approvals",
	"archive",
	"audit-trail",
	"authorisations",
	"balances",
	"batch-payments",
	"beneficiaries",
	"billing",
	"bookings",
	"branch-network",
	"budgets",
	"card-issuing",
	"card-limits",
	"cashback",
	"catalogue",
	"chargebacks",
	"checkout",
	"claims",
	"collections",
	"complaints",
	"compliance",
	"consents",
	"contracts",
	"credit-scoring",
	"currency-exchange",
	"customer-profile",
	"daily-close",
	"deposits",
	"direct-debits",
	"disputes",
	"documents",
	"dunning",
	"entitlements",
	"escrow",
	"fees",
	"fraud-screening",
	"fulfilment",
	"general-ledger",
	"gift-cards",
	"identity",
	"interest",
	"inventory",
	"invoices",
	"kyc",
	"limits",
	"loans",
	"loyalty",
	"mailer",
	"mandates",
	"marketing",
	"merchant-onboarding",
	"mortgages",
	"notifications",
	"onboarding",
	"orders",
	"overdrafts",
	"payees",
	"payments",
	"payouts",
	"payroll",
	"pensions",
	"permissions",
	"pricing",
	"promotions",
	"receipts",
	"reconciliation",
	"referrals",
	"refunds",
	"regulatory-reports",
	"reminders",
	"rewards",
	"risk",
	"sanctions",
	"savings",
	"scheduling",
	"settlement",
	"shipping",
	"standing-orders",
	"statements",
	"subscriptions",
	"support-tickets",
	"tax",
	"terms",
	"transfers",
	"treasury",
	"trials",
	"underwriting",
	"vouchers",
	"wallets",
	"webhooks",
	"wire-transfers",
	"withdrawals",
	"year-end",
];

/**
 * random returns a function that returns numbers from 0 to 1 that look random,
 * and are the same each time for the same seed.
 */
function random(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** keyOf returns a UUID for the application at the given position. */
function keyOf(i: number): string {
	return `5173a1c0-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
}

/**
 * historyOf returns the history of a rate whose latest value is `last`, over
 * the last 70 seconds, one point a second.
 */
function historyOf(last: number, seed: number): Chart {
	const r = random(seed);
	let value = last;
	const points = [];

	for (let i = 0; i < 70; i++) {
		points.unshift({ at: -i * 1000, value: Math.max(0, value) });
		value *= 0.94 + r() * 0.12;
	}

	return { end: 0, points };
}

/**
 * applicationAt returns the application at the given position, in contact, with
 * figures that vary from one application to another as a real site's do: most
 * are quiet, and a few are busy.
 */
function applicationAt(i: number): SiteApplication {
	const r = random(i + 1);
	const busy = r() ** 3;
	const nodes = 1 + Math.floor(r() * 6);

	return {
		application: { name: names[i] as string, key: keyOf(i) },
		nodes,
		heartbeats: [],
		events: {
			perMinute: Math.round(busy * 2400),
			streams: 1 + Math.floor(r() * 8),
		},
		queues: {
			messages: Math.round(busy * 40 * r()),
			failing: 0,
		},
	};
}

/**
 * The applications of a site whose applications are all in contact. Three have
 * failing messages.
 */
export const siteApplications: SiteApplication[] = names.map((_, i) => {
	const a = applicationAt(i);
	const failing = { 19: 1, 50: 2, 71: 4 }[i];

	if (failing !== undefined && a.queues !== undefined) {
		return {
			...a,
			queues: {
				messages: a.queues.messages + failing,
				failing,
			},
		};
	}

	return a;
});

/**
 * withContact returns the given applications, with every node of each that is
 * named in `out` out of contact, and only some of the nodes of each that is named
 * in `partly` in contact, with the given share.
 */
export function withContact(
	applications: SiteApplication[],
	{
		out = [],
		partly = {},
	}: { out?: string[]; partly?: Record<string, number> },
): SiteApplication[] {
	return applications.map((a) => {
		const name = a.application.name;

		if (out.includes(name)) {
			return { ...a, nodes: 0, heartbeats: [] };
		}

		const share = partly[name];
		if (share !== undefined) {
			return {
				...a,
				nodes: Math.max(1, Math.round(a.nodes * share)),
				coverage: share,
			};
		}

		return a;
	});
}

/** The site of the fixtures. */
export const euWest = {
	name: "eu-west",
	key: "e0c1f7a2-0b4d-4f6e-9a8c-3d5b7e9f1a2c",
};

/**
 * siteOf returns what the page of a site shows, with its totals worked out from
 * the given applications, as the Observatory works them out, at the given site,
 * or at no site if it is undefined. An application that
 * is out of contact adds its last figures, and counts as nodes that don't
 * report, as `coverage` says.
 */
export function siteOf(
	applications: SiteApplication[],
	site: SiteData["site"],
): SiteData {
	const all = applications.reduce(
		(sum, a) => sum + a.nodes / (a.coverage ?? 1),
		0,
	);
	const live = applications.reduce((sum, a) => sum + a.nodes, 0);
	const coverage = live === all ? undefined : all === 0 ? 0 : live / all;

	const perMinute = applications.reduce(
		(sum, a) => sum + (a.events?.perMinute ?? 0),
		0,
	);
	const messages = applications.reduce(
		(sum, a) => sum + (a.queues?.messages ?? 0),
		0,
	);
	const failing = applications.reduce(
		(sum, a) => sum + (a.queues?.failing ?? 0),
		0,
	);
	const handled = Math.round(perMinute * 0.4);

	return {
		site,
		events: {
			rate: { perMinute },
			streams: applications.reduce(
				(sum, a) => sum + (a.events?.streams ?? 0),
				0,
			),
			coverage,
			history: historyOf(perMinute, 7),
		},
		queues: {
			messages,
			failing,
			coverage,
			throughput: { perMinute: handled },
			history: historyOf(handled, 11),
		},
		applications,
	};
}
